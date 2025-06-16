
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatSession, ChatMessage, ChatMessageRole, GeminiSettings, Attachment, AICharacter, HarmCategory, HarmBlockThreshold, SafetySetting, FullResponseData, UserMessageInput, LogApiRequestCallback, UseGeminiReturn, GeminiHistoryEntry } from '../types';
import { getFullChatResponse, generateMimicUserResponse, clearCachedChat as geminiServiceClearCachedChat, mapMessagesToFlippedRoleGeminiHistory } from '../services/geminiService';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService'; 
import { DEFAULT_SETTINGS } from '../constants';
import { EditMessagePanelAction, EditMessagePanelDetails } from './EditMessagePanel';
import { findPrecedingUserMessageIndex, getHistoryUpToMessage } from '../services/utils'; // Import helpers

// Define props for the hook
interface UseGeminiProps {
  currentChatSession: ChatSession | null;
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  logApiRequestDirectly: LogApiRequestCallback;
  triggerAutoFetchForNewMessage?: (newAiMessage: ChatMessage) => Promise<void>;
  setMessageGenerationTimes: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>; 
}

export function useGemini({
  currentChatSession,
  updateChatSession,
  logApiRequestDirectly,
  triggerAutoFetchForNewMessage,
  setMessageGenerationTimes, 
}: UseGeminiProps): UseGeminiReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [currentGenerationTimeDisplay, setCurrentGenerationTimeDisplay] = useState<string>("0.0s");
  const [lastMessageHadAttachments, setLastMessageHadAttachments] = useState(false);

  const generationStartTimeRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingMessageIdRef = useRef<string | null>(null);
  const originalMessageSnapshotRef = useRef<ChatMessage | null>(null);
  const requestCancelledByUserRef = useRef<boolean>(false);
  const onFullResponseCalledForPendingMessageRef = useRef<boolean>(false);

  const prevModelRef = useRef<string | undefined>(undefined);
  const prevSettingsRef = useRef<GeminiSettings | undefined>(undefined);


  useEffect(() => {
    let intervalId: number | undefined;
    if (isLoading && generationStartTimeRef.current) {
      setCurrentGenerationTimeDisplay("0.0s");
      intervalId = window.setInterval(() => {
        if (generationStartTimeRef.current !== null) { // Changed: Explicit null check
          const elapsedSeconds = (Date.now() - generationStartTimeRef.current) / 1000; // Changed: Removed !
          setCurrentGenerationTimeDisplay(`${elapsedSeconds.toFixed(1)}s`);
        }
      }, 100);
    } else {
      generationStartTimeRef.current = null;
      if (!isLoading) {
          setCurrentGenerationTimeDisplay("0.0s");
      }
    }
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading]);

  useEffect(() => {
    if (currentChatSession) {
      prevModelRef.current = currentChatSession.model;
      prevSettingsRef.current = currentChatSession.settings;
    }
  }, [currentChatSession?.id]); 


  useEffect(() => {
    if (!currentChatSession) return;

    const newModel = currentChatSession.model;
    const newSettings = currentChatSession.settings;

    let modelChanged = false;
    if (prevModelRef.current !== undefined && prevModelRef.current !== newModel) {
      modelChanged = true;
    }

    let settingsChanged = false;
    if (prevSettingsRef.current !== undefined && JSON.stringify(prevSettingsRef.current) !== JSON.stringify(newSettings)) {
      settingsChanged = true;
    }

    if (modelChanged || settingsChanged) {
      const nonCharSettingsForCacheKey = { ...newSettings };
      delete (nonCharSettingsForCacheKey as any)._characterIdForCacheKey; 
      geminiServiceClearCachedChat(currentChatSession.id, newModel, nonCharSettingsForCacheKey);

      if (currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters) {
        currentChatSession.aiCharacters.forEach(character => {
          const charSettingsForCacheKey: GeminiSettings & { _characterIdForCacheKey?: string } = {
            ...newSettings, 
            systemInstruction: character.systemInstruction, 
            _characterIdForCacheKey: character.id,
          };
          geminiServiceClearCachedChat(currentChatSession.id, newModel, charSettingsForCacheKey);
        });
      }
    }
    prevModelRef.current = newModel;
    prevSettingsRef.current = newSettings;
  }, [currentChatSession?.model, currentChatSession?.settings, currentChatSession?.id, currentChatSession?.isCharacterModeActive, currentChatSession?.aiCharacters]);


 const handleCancelGeneration = useCallback(async () => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      requestCancelledByUserRef.current = true;
      abortControllerRef.current.abort();

      setIsLoading(false);
      setCurrentGenerationTimeDisplay("0.0s"); 
      generationStartTimeRef.current = null;
      setLastMessageHadAttachments(false); 
      onFullResponseCalledForPendingMessageRef.current = false; 

      const activeChatIdForCancel = currentChatSession?.id;
      const currentPendingMessageId = pendingMessageIdRef.current;
      const currentOriginalSnapshot = originalMessageSnapshotRef.current;

      if (activeChatIdForCancel && currentPendingMessageId) {
        if (currentOriginalSnapshot && currentOriginalSnapshot.id === currentPendingMessageId) {
          await updateChatSession(activeChatIdForCancel, session => session ? ({
            ...session,
            messages: session.messages.map(msg => msg.id === currentOriginalSnapshot.id ? currentOriginalSnapshot : msg)
          }) : null);
        } else {
          await updateChatSession(activeChatIdForCancel, session => {
            if (!session) return null;
            const messageToRemove = session.messages.find(msg => msg.id === currentPendingMessageId && (msg.isStreaming || msg.content === ''));
            if (messageToRemove) {
                const newMessages = session.messages.filter(msg => msg.id !== currentPendingMessageId);
                return { ...session, messages: newMessages };
            }
            return session;
          });
        }
      }
      pendingMessageIdRef.current = null;
      originalMessageSnapshotRef.current = null;
    } else {
        if (isLoading) setIsLoading(false);
        if (lastMessageHadAttachments) setLastMessageHadAttachments(false);
    }
  }, [currentChatSession, updateChatSession, isLoading, lastMessageHadAttachments]);


  const handleSendMessage = useCallback(async (
    promptContent: string,
    attachments?: Attachment[],
    historyContextOverride?: ChatMessage[],
    characterIdForAPICall?: string,
    isTemporaryContext?: boolean
  ) => {
    if (!currentChatSession || isLoading) return;

    requestCancelledByUserRef.current = false;
    onFullResponseCalledForPendingMessageRef.current = false; 
    originalMessageSnapshotRef.current = null;
    setLastMessageHadAttachments(!!(attachments && attachments.length > 0 && !isTemporaryContext));

    let sessionToUpdate = { ...currentChatSession };
    let baseSettingsForAPICall = { ...currentChatSession.settings };
    let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
    let characterNameForResponse: string | undefined = undefined;

    if (currentChatSession.isCharacterModeActive && characterIdForAPICall) {
        const character = (currentChatSession.aiCharacters || []).find(c => c.id === characterIdForAPICall);
        if (character) {
            settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
            settingsOverrideForAPICall.userPersonaInstruction = undefined;
            settingsOverrideForAPICall._characterIdForAPICall = character.id;
            characterNameForResponse = character.name;
        } else {
            console.error(`Character with ID ${characterIdForAPICall} not found.`);
            return;
        }
    }

    let userMessageInputForAPICall: UserMessageInput;
    let historyForAPICall: ChatMessage[];
    let userMessageIdForPotentialTitleUpdate: string | null = null;

    if (isTemporaryContext && characterIdForAPICall && promptContent.trim()) {
        userMessageInputForAPICall = { text: promptContent, attachments: [] }; 
        historyForAPICall = [...sessionToUpdate.messages];
    } else if (currentChatSession.isCharacterModeActive && characterIdForAPICall && !promptContent.trim() && (!attachments || attachments.length === 0) && !historyContextOverride) {
        const characterTriggered = (sessionToUpdate.aiCharacters || []).find(c => c.id === characterIdForAPICall);
        if (characterTriggered && characterTriggered.contextualInfo && characterTriggered.contextualInfo.trim() !== '') {
            userMessageInputForAPICall = { text: characterTriggered.contextualInfo, attachments: [] };
        } else {
            userMessageInputForAPICall = { text: "", attachments: [] }; 
        }
        historyForAPICall = [...sessionToUpdate.messages];
    } else {
        if (!promptContent.trim() && (!attachments || attachments.length === 0)) {
            if (!characterIdForAPICall) { 
                 return; 
            }
        }
        const newUserMessageContent: ChatMessage = {
            id: `msg-${Date.now()}-user-${Math.random().toString(36).substring(2,7)}`,
            role: ChatMessageRole.USER,
            content: promptContent,
            attachments: attachments?.map(att => ({
                ...att, 
                base64Data: att.base64Data, 
                mimeType: att.mimeType,     
                dataUrl: att.dataUrl || undefined 
            })),
            timestamp: new Date(),
        };
        userMessageIdForPotentialTitleUpdate = newUserMessageContent.id;

        if (historyContextOverride) {
            historyForAPICall = [...historyContextOverride];
            sessionToUpdate.messages = [...historyContextOverride, newUserMessageContent];
        } else {
            historyForAPICall = [...sessionToUpdate.messages];
            sessionToUpdate.messages = [...sessionToUpdate.messages, newUserMessageContent];
        }
        userMessageInputForAPICall = { text: newUserMessageContent.content, attachments: attachments };
    }

    if (userMessageIdForPotentialTitleUpdate && !historyContextOverride && sessionToUpdate.title === "New Chat") {
        const userMessagesInSession = sessionToUpdate.messages.filter(m => m.role === ChatMessageRole.USER);
        if (userMessagesInSession.length > 0 && userMessagesInSession[userMessagesInSession.length -1].id === userMessageIdForPotentialTitleUpdate) {
             if (userMessagesInSession.length === 1) {
                sessionToUpdate.title = (promptContent || "Chat with attachments").substring(0, 35) + ((promptContent.length > 35 || (!promptContent && attachments && attachments.length > 0)) ? "..." : "");
             }
        }
    }

    generationStartTimeRef.current = Date.now();
    setIsLoading(true);
    setCurrentGenerationTimeDisplay("0.0s");
    abortControllerRef.current = new AbortController();

    const modelMessageId = `msg-${Date.now()}-model-${Math.random().toString(36).substring(2,7)}`;
    pendingMessageIdRef.current = modelMessageId;
    const placeholderAiMessage: ChatMessage = {
        id: modelMessageId, role: ChatMessageRole.MODEL, content: '',
        timestamp: new Date(), isStreaming: true, characterName: characterNameForResponse,
    };

    sessionToUpdate.messages = [...sessionToUpdate.messages, placeholderAiMessage];
    sessionToUpdate.lastUpdatedAt = new Date();
    await updateChatSession(sessionToUpdate.id, () => sessionToUpdate);


    const activeChatIdForThisCall = currentChatSession.id;

    await getFullChatResponse(
        activeChatIdForThisCall, userMessageInputForAPICall, currentChatSession.model,
        baseSettingsForAPICall, historyForAPICall,
        async (responseData: FullResponseData) => {
            if (requestCancelledByUserRef.current && pendingMessageIdRef.current === modelMessageId) return;
            onFullResponseCalledForPendingMessageRef.current = true; 
            if (generationStartTimeRef.current) {
                const duration = (Date.now() - generationStartTimeRef.current) / 1000;
                await setMessageGenerationTimes(prev => ({...prev, [modelMessageId]: duration})); 
            }
            const newAiMessage: ChatMessage = { 
                ...placeholderAiMessage, 
                content: responseData.text, 
                groundingMetadata: responseData.groundingMetadata, 
                isStreaming: false, 
                timestamp: new Date(), 
                characterName: characterNameForResponse 
            };

            if (triggerAutoFetchForNewMessage) {
                 triggerAutoFetchForNewMessage(newAiMessage); 
            }

            await updateChatSession(activeChatIdForThisCall, session => session ? ({
                ...session,
                messages: session.messages.map(msg =>
                    msg.id === modelMessageId ? newAiMessage : msg
                )
            }) : null);
        },
        async (errorMsg, isAbortError) => {
            const currentPendingMsgId = pendingMessageIdRef.current;
            if (requestCancelledByUserRef.current && currentPendingMsgId === modelMessageId) { if (isLoading) setIsLoading(false); if (lastMessageHadAttachments) setLastMessageHadAttachments(false); return; }
            
            onFullResponseCalledForPendingMessageRef.current = false; 
            
            if (isAbortError && currentPendingMsgId === modelMessageId) {
                 if (originalMessageSnapshotRef.current && originalMessageSnapshotRef.current.id === currentPendingMsgId) {
                    await updateChatSession(activeChatIdForThisCall, s => s ? ({ ...s, messages: s.messages.map(m => m.id === originalMessageSnapshotRef.current!.id ? originalMessageSnapshotRef.current! : m) }) : null);
                } else {
                    await updateChatSession(activeChatIdForThisCall, s => s ? ({ ...s, messages: s.messages.filter(m => m.id !== currentPendingMsgId) }) : null);
                }
            } else if (currentPendingMsgId === modelMessageId) {
                await updateChatSession(activeChatIdForThisCall, session => session ? ({
                    ...session,
                    messages: session.messages.map(msg =>
                        msg.id === modelMessageId
                        ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: `Response failed: ${errorMsg}`, characterName: characterNameForResponse }
                        : msg
                    )
                }) : null);
            }
            if (!requestCancelledByUserRef.current && currentPendingMsgId === modelMessageId) {
                setIsLoading(false);
                setLastMessageHadAttachments(false);
            }
        },
        async () => {
            const userDidCancel = requestCancelledByUserRef.current;
            const currentPendingMsgIdForComplete = pendingMessageIdRef.current;

            if (userDidCancel && currentPendingMsgIdForComplete === modelMessageId) { /* Already handled by cancel logic */ }
            else if (currentPendingMsgIdForComplete === modelMessageId) {
                setIsLoading(false);
                setLastMessageHadAttachments(false);

                if (!onFullResponseCalledForPendingMessageRef.current) {
                    await updateChatSession(activeChatIdForThisCall, session => {
                        if (!session) return null;
                        const messageInState = session.messages.find(m => m.id === modelMessageId);
                        if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) { 
                            return {
                                ...session,
                                messages: session.messages.map(msg =>
                                    msg.id === modelMessageId
                                    ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date(), characterName: characterNameForResponse }
                                    : msg
                                ),
                                lastUpdatedAt: new Date()
                            };
                        }
                        return { ...session, lastUpdatedAt: new Date() };
                    });
                } else {
                     await updateChatSession(activeChatIdForThisCall, session => {
                        if (!session) return null;
                        return { ...session, lastUpdatedAt: new Date() };
                    });
                }
                pendingMessageIdRef.current = null;
                originalMessageSnapshotRef.current = null;
            }
            if (abortControllerRef.current && currentPendingMsgIdForComplete === modelMessageId) abortControllerRef.current = null;
            if (currentPendingMsgIdForComplete === modelMessageId) requestCancelledByUserRef.current = false; 
            onFullResponseCalledForPendingMessageRef.current = false; 
        },
        logApiRequestDirectly,
        abortControllerRef.current.signal,
        settingsOverrideForAPICall,
        currentChatSession.aiCharacters
    );
  }, [currentChatSession, isLoading, updateChatSession, logApiRequestDirectly, setMessageGenerationTimes, lastMessageHadAttachments, triggerAutoFetchForNewMessage]);


  const handleContinueFlow = useCallback(async () => {
    if (!currentChatSession || isLoading || currentChatSession.messages.length === 0 || currentChatSession.isCharacterModeActive) {
        return;
    }
    requestCancelledByUserRef.current = false;
    onFullResponseCalledForPendingMessageRef.current = false; 
    originalMessageSnapshotRef.current = null;
    let sessionToUpdate = { ...currentChatSession };
    const activeChatIdForThisCall = currentChatSession.id;

    setLastMessageHadAttachments(false);
    generationStartTimeRef.current = Date.now();
    setIsLoading(true);
    setCurrentGenerationTimeDisplay("0.0s");
    abortControllerRef.current = new AbortController();

    const lastMessage = sessionToUpdate.messages[sessionToUpdate.messages.length - 1];
    let operationPendingMessageId: string | null = null;

    const commonOnCompleteForFlow = async (messageId: string | null, specificCharacterName?: string) => {
        if (requestCancelledByUserRef.current && pendingMessageIdRef.current === messageId) { /* Handled */ }
        else if (pendingMessageIdRef.current === messageId) {
            setIsLoading(false); setLastMessageHadAttachments(false);
            if (!onFullResponseCalledForPendingMessageRef.current) {
                await updateChatSession(activeChatIdForThisCall, session => {
                    if (!session) return null;
                    const msgInState = session.messages.find(m => m.id === messageId);
                    if (msgInState && msgInState.isStreaming && msgInState.role !== ChatMessageRole.ERROR) {
                        return {
                            ...session,
                            messages: session.messages.map(m =>
                                m.id === messageId
                                ? { ...m, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", characterName: specificCharacterName }
                                : m
                            ),
                            lastUpdatedAt: new Date()
                        };
                    }
                    return { ...session, lastUpdatedAt: new Date() };
                });
            } else {
                 await updateChatSession(activeChatIdForThisCall, session => {
                    if (!session) return null;
                    return { ...session, lastUpdatedAt: new Date() };
                });
            }
            pendingMessageIdRef.current = null; originalMessageSnapshotRef.current = null;
        }
        if (abortControllerRef.current && pendingMessageIdRef.current === messageId) abortControllerRef.current = null;
        if (pendingMessageIdRef.current === messageId) requestCancelledByUserRef.current = false;
        onFullResponseCalledForPendingMessageRef.current = false; 
    };

    if (lastMessage.role === ChatMessageRole.USER) {
        const userMessageInputForAPI: UserMessageInput = { text: lastMessage.content, attachments: lastMessage.attachments };
        const historyForAPICall = sessionToUpdate.messages.slice(0, -1);
        if (lastMessage.attachments && lastMessage.attachments.length > 0) setLastMessageHadAttachments(true);

        const modelMessageId = `msg-${Date.now()}-model-flow-${Math.random().toString(36).substring(2,7)}`;
        operationPendingMessageId = modelMessageId;
        pendingMessageIdRef.current = modelMessageId;
        const placeholderAiMessage: ChatMessage = {
            id: modelMessageId, role: ChatMessageRole.MODEL, content: '',
            timestamp: new Date(), isStreaming: true,
        };
        sessionToUpdate.messages = [...sessionToUpdate.messages, placeholderAiMessage];
        await updateChatSession(activeChatIdForThisCall, () => sessionToUpdate);

        await getFullChatResponse(
            activeChatIdForThisCall, userMessageInputForAPI, currentChatSession.model, currentChatSession.settings, historyForAPICall,
            async (responseData: FullResponseData) => {
                if (requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) return;
                onFullResponseCalledForPendingMessageRef.current = true;
                if (generationStartTimeRef.current) await setMessageGenerationTimes(prev => ({...prev, [operationPendingMessageId!]: (Date.now() - generationStartTimeRef.current!) / 1000})); 
                const newAiMessage: ChatMessage = { 
                    ...placeholderAiMessage, 
                    content: responseData.text, 
                    groundingMetadata: responseData.groundingMetadata, 
                    isStreaming: false, 
                    timestamp: new Date() 
                };
                if (triggerAutoFetchForNewMessage) {
                    triggerAutoFetchForNewMessage(newAiMessage);
                }
                await updateChatSession(activeChatIdForThisCall, s => s ? ({ ...s, messages: s.messages.map(m => m.id === operationPendingMessageId ? newAiMessage : m)}) : null);
            },
            async (errorMsg, isAbortError) => {
                if (requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) { if(isLoading) setIsLoading(false); setLastMessageHadAttachments(false); return; }
                onFullResponseCalledForPendingMessageRef.current = false;
                if (isAbortError && pendingMessageIdRef.current === operationPendingMessageId) { /* Handled by finally or specific logic */ }
                else if (pendingMessageIdRef.current === operationPendingMessageId) {
                    await updateChatSession(activeChatIdForThisCall, s => s ? ({ ...s, messages: s.messages.map(m => m.id === operationPendingMessageId ? {...m, role: ChatMessageRole.ERROR, content: `Flow response failed: ${errorMsg}`, isStreaming: false} : m)}) : null);
                }
                if (!requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) { setIsLoading(false); setLastMessageHadAttachments(false); }
            },
            () => commonOnCompleteForFlow(operationPendingMessageId),
            logApiRequestDirectly, abortControllerRef.current.signal
        );
    } else if (lastMessage.role === ChatMessageRole.MODEL || lastMessage.role === ChatMessageRole.ERROR) {
        const mimicUserMessageId = `msg-${Date.now()}-user-mimic-${Math.random().toString(36).substring(2,7)}`;
        operationPendingMessageId = mimicUserMessageId;
        pendingMessageIdRef.current = mimicUserMessageId;
        setLastMessageHadAttachments(false);

        const placeholderUserMimicMessage: ChatMessage = {
            id: mimicUserMessageId, role: ChatMessageRole.USER, content: '',
            timestamp: new Date(), isStreaming: true,
        };
        sessionToUpdate.messages = [...sessionToUpdate.messages, placeholderUserMimicMessage];
        await updateChatSession(activeChatIdForThisCall, () => sessionToUpdate);

        try {
            if (abortControllerRef.current?.signal.aborted && requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) throw new DOMException("Aborted by user", "AbortError");
            onFullResponseCalledForPendingMessageRef.current = false; 
            const persona = currentChatSession.settings.userPersonaInstruction || DEFAULT_SETTINGS.userPersonaInstruction || "Please respond as the user.";
            const baseSettingsForMimic = { ...currentChatSession.settings };
            const overrideSettingsForMimic: Partial<GeminiSettings> = {
                safetySettings: [ 
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ],
                useGoogleSearch: false, 
                urlContext: [],
                _characterNameForLog: "[Continue Flow - User Mimic]"
            };
            
            const historyForMimic: GeminiHistoryEntry[] = mapMessagesToFlippedRoleGeminiHistory(
                currentChatSession.messages.slice(0, -1), 
                baseSettingsForMimic 
            );

            const generatedText = await generateMimicUserResponse(
                currentChatSession.model,
                historyForMimic, 
                persona,
                baseSettingsForMimic,
                logApiRequestDirectly,
                abortControllerRef.current.signal,
                overrideSettingsForMimic
            );
            if (requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) return;
            onFullResponseCalledForPendingMessageRef.current = true; 
            if (generationStartTimeRef.current) await setMessageGenerationTimes(prev => ({...prev, [operationPendingMessageId!]: (Date.now() - generationStartTimeRef.current!) / 1000})); 
            const newUserMessage: ChatMessage = {
                id: operationPendingMessageId!, role: ChatMessageRole.USER, content: generatedText,
                timestamp: new Date(), isStreaming: false,
            };
            await updateChatSession(activeChatIdForThisCall, session => session ? ({
                ...session, messages: session.messages.map(m => m.id === operationPendingMessageId ? newUserMessage : m)
            }) : null);
        } catch (error: any) {
             onFullResponseCalledForPendingMessageRef.current = false; 
            if (requestCancelledByUserRef.current && pendingMessageIdRef.current === operationPendingMessageId) return;
             if (error.name === 'AbortError' && pendingMessageIdRef.current === operationPendingMessageId) {
                 if (originalMessageSnapshotRef.current && originalMessageSnapshotRef.current.id === pendingMessageIdRef.current) {
                    await updateChatSession(activeChatIdForThisCall, s => s ? ({...s, messages: s.messages.map(m => m.id === originalMessageSnapshotRef.current!.id ? originalMessageSnapshotRef.current! : m) }) : null);
                } else {
                    await updateChatSession(activeChatIdForThisCall, s => s ? ({ ...s, messages: s.messages.filter(m => m.id !== pendingMessageIdRef.current) }) : null);
                }
            } else if (pendingMessageIdRef.current === operationPendingMessageId) {
                const errorMessageContent: ChatMessage = {
                    id: operationPendingMessageId!, role: ChatMessageRole.ERROR,
                    content: error.message || "Failed to generate user-style response.",
                    timestamp: new Date(), isStreaming: false,
                };
                await updateChatSession(activeChatIdForThisCall, session => session ? ({
                     ...session, messages: session.messages.map(m => m.id === operationPendingMessageId ? errorMessageContent : m)
                }) : null);
            }
        } finally {
            await commonOnCompleteForFlow(operationPendingMessageId);
        }
    } else {
        setIsLoading(false); generationStartTimeRef.current = null; abortControllerRef.current = null;
        pendingMessageIdRef.current = null; originalMessageSnapshotRef.current = null;
        requestCancelledByUserRef.current = false;
        onFullResponseCalledForPendingMessageRef.current = false;
        setLastMessageHadAttachments(false);
    }
  }, [currentChatSession, isLoading, updateChatSession, logApiRequestDirectly, setMessageGenerationTimes, triggerAutoFetchForNewMessage]);

  const handleRegenerateAIMessage = useCallback(async (sessionId: string, aiMessageIdToRegenerate: string) => {
    if (!currentChatSession || isLoading || currentChatSession.id !== sessionId) return;
    requestCancelledByUserRef.current = false;
    onFullResponseCalledForPendingMessageRef.current = false;

    const aiMessageIndex = currentChatSession.messages.findIndex(m => m.id === aiMessageIdToRegenerate && (m.role === ChatMessageRole.MODEL || m.role === ChatMessageRole.ERROR));
    if (aiMessageIndex <= 0) return; 

    const userPromptIndex = findPrecedingUserMessageIndex(currentChatSession.messages, aiMessageIndex);
    if (userPromptIndex === -1) return; 

    const userPromptMessage = currentChatSession.messages[userPromptIndex];
    const userMessageInputForAPI: UserMessageInput = { text: userPromptMessage.content, attachments: userPromptMessage.attachments };
    const historyForGeminiService = getHistoryUpToMessage(currentChatSession.messages, userPromptIndex); 
    setLastMessageHadAttachments(!!(userMessageInputForAPI.attachments && userMessageInputForAPI.attachments.length > 0));

    const aiMessageToUpdate = currentChatSession.messages[aiMessageIndex];
    originalMessageSnapshotRef.current = { ...aiMessageToUpdate }; 
    pendingMessageIdRef.current = aiMessageIdToRegenerate; 

    generationStartTimeRef.current = Date.now();
    setIsLoading(true);
    setCurrentGenerationTimeDisplay("0.0s");
    abortControllerRef.current = new AbortController();

    const updatedAiMessagePlaceholder: ChatMessage = {
      ...aiMessageToUpdate,
      content: '', 
      groundingMetadata: undefined,
      isStreaming: true,
      timestamp: new Date(), 
      cachedAudioBuffers: null, 
    };

    await updateChatSession(sessionId, s => s ? ({
      ...s,
      messages: s.messages.map(msg => msg.id === aiMessageIdToRegenerate ? updatedAiMessagePlaceholder : msg)
    }) : null);
    await setMessageGenerationTimes(prevTimes => { 
      const newTimes = { ...prevTimes };
      delete newTimes[aiMessageIdToRegenerate];
      return newTimes;
    });

    let settingsOverrideForRegen: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
    let characterForRegen: AICharacter | undefined;
    if (currentChatSession.isCharacterModeActive && aiMessageToUpdate.characterName) {
      characterForRegen = (currentChatSession.aiCharacters || []).find(c => c.name === aiMessageToUpdate.characterName);
      if (characterForRegen) {
        settingsOverrideForRegen.systemInstruction = characterForRegen.systemInstruction;
        settingsOverrideForRegen._characterIdForAPICall = characterForRegen.id;
      }
    }
    const settingsForCacheClear = { ...currentChatSession.settings, ...settingsOverrideForRegen };
     if (characterForRegen) (settingsForCacheClear as any)._characterIdForCacheKey = characterForRegen.id;
     else delete (settingsForCacheClear as any)._characterIdForCacheKey; 
    geminiServiceClearCachedChat(sessionId, currentChatSession.model, settingsForCacheClear);


    const commonOnCompleteForRegen = async () => {
        if (requestCancelledByUserRef.current && pendingMessageIdRef.current === aiMessageIdToRegenerate) { /* Handled */ }
        else if (pendingMessageIdRef.current === aiMessageIdToRegenerate) {
            setIsLoading(false); setLastMessageHadAttachments(false);
             if (!onFullResponseCalledForPendingMessageRef.current) { 
                await updateChatSession(sessionId, session => {
                    if (!session) return null;
                    const msgInState = session.messages.find(m => m.id === aiMessageIdToRegenerate);
                    if (msgInState && msgInState.isStreaming && msgInState.role !== ChatMessageRole.ERROR) {
                         return {
                            ...session,
                            messages: session.messages.map(msg =>
                                msg.id === aiMessageIdToRegenerate 
                                ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", characterName: aiMessageToUpdate.characterName, cachedAudioBuffers: null }
                                : msg
                            ),
                            lastUpdatedAt: new Date()
                        };
                    } else if (msgInState && !msgInState.isStreaming && originalMessageSnapshotRef.current) { 
                        return {
                            ...session,
                            messages: session.messages.map(msg => msg.id === aiMessageIdToRegenerate ? originalMessageSnapshotRef.current! : msg),
                            lastUpdatedAt: new Date()
                        };
                    }
                    return { ...session, lastUpdatedAt: new Date() };
                });
            } else { 
                 await updateChatSession(sessionId, session => {
                    if (!session) return null;
                    return { ...session, lastUpdatedAt: new Date() }; 
                });
            }
            pendingMessageIdRef.current = null; originalMessageSnapshotRef.current = null;
        }
        if (abortControllerRef.current && pendingMessageIdRef.current === aiMessageIdToRegenerate) abortControllerRef.current = null;
        if (pendingMessageIdRef.current === aiMessageIdToRegenerate) requestCancelledByUserRef.current = false;
        onFullResponseCalledForPendingMessageRef.current = false; 
    };


    await getFullChatResponse(
      sessionId, userMessageInputForAPI, currentChatSession.model, currentChatSession.settings, historyForGeminiService,
      async (responseData: FullResponseData) => {
        if (requestCancelledByUserRef.current && pendingMessageIdRef.current === aiMessageIdToRegenerate) return;
        onFullResponseCalledForPendingMessageRef.current = true;
        if (generationStartTimeRef.current) await setMessageGenerationTimes(prev => ({ ...prev, [aiMessageIdToRegenerate]: (Date.now() - generationStartTimeRef.current!) / 1000 })); 
        
        const newAiMessageContent : ChatMessage = {
            ...updatedAiMessagePlaceholder, 
            content: responseData.text,
            groundingMetadata: responseData.groundingMetadata,
            isStreaming: false,
            role: ChatMessageRole.MODEL, 
            timestamp: new Date(), 
            cachedAudioBuffers: null, 
        };
        
        if (triggerAutoFetchForNewMessage) {
            triggerAutoFetchForNewMessage(newAiMessageContent);
        }

        await updateChatSession(sessionId, session => session ? ({
          ...session, messages: session.messages.map(msg =>
            msg.id === aiMessageIdToRegenerate ? newAiMessageContent : msg
          )}) : null);
      },
      async (errorMsg, isAbortError) => {
        if (requestCancelledByUserRef.current && pendingMessageIdRef.current === aiMessageIdToRegenerate) {
            if(isLoading) setIsLoading(false);
            setLastMessageHadAttachments(false);
            return;
        }
        onFullResponseCalledForPendingMessageRef.current = false;

        if (isAbortError && pendingMessageIdRef.current === aiMessageIdToRegenerate) { 
            if (originalMessageSnapshotRef.current && originalMessageSnapshotRef.current.id === aiMessageIdToRegenerate) {
                await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(m => m.id === originalMessageSnapshotRef.current!.id ? originalMessageSnapshotRef.current! : m) }) : null);
            } else { 
                 await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(msg => 
                    msg.id === aiMessageIdToRegenerate ? { ...updatedAiMessagePlaceholder, isStreaming: false, role: ChatMessageRole.ERROR, content: 'Regeneration aborted.', cachedAudioBuffers: null } : msg
                )}) : null);
            }
        } else if (pendingMessageIdRef.current === aiMessageIdToRegenerate) { 
            await updateChatSession(sessionId, session => session ? ({
                ...session,
                messages: session.messages.map(msg =>
                    msg.id === aiMessageIdToRegenerate
                    ? { ...updatedAiMessagePlaceholder, isStreaming: false, role: ChatMessageRole.ERROR, content: `Regeneration failed: ${errorMsg}`, cachedAudioBuffers: null }
                    : msg
                )
            }) : null);
        }

        if (!requestCancelledByUserRef.current && pendingMessageIdRef.current === aiMessageIdToRegenerate) {
            setIsLoading(false);
            setLastMessageHadAttachments(false);
        }
      },
      commonOnCompleteForRegen,
      logApiRequestDirectly,
      abortControllerRef.current.signal,
      settingsOverrideForRegen,
      currentChatSession.aiCharacters
    );
  }, [currentChatSession, isLoading, updateChatSession, logApiRequestDirectly, setMessageGenerationTimes, triggerAutoFetchForNewMessage]);


  const handleRegenerateResponseForUserMessage = useCallback(async (sessionId: string, userMessageId: string) => {
    if (!currentChatSession || isLoading || currentChatSession.id !== sessionId) return;

    const userMessageIndex = currentChatSession.messages.findIndex(m => m.id === userMessageId && m.role === ChatMessageRole.USER);
    if (userMessageIndex === -1) return; 

    let targetAiMessageId: string | null = null;
    let targetAiMessageIndex = -1;
    if (userMessageIndex + 1 < currentChatSession.messages.length) {
        const nextMessage = currentChatSession.messages[userMessageIndex + 1];
        if (nextMessage.role === ChatMessageRole.MODEL || nextMessage.role === ChatMessageRole.ERROR) {
            targetAiMessageId = nextMessage.id;
            targetAiMessageIndex = userMessageIndex + 1;
        }
    }

    if (!targetAiMessageId || targetAiMessageIndex === -1) {
        console.warn("No AI message found immediately after the user message to regenerate.");
        return;
    }
    
    await handleRegenerateAIMessage(sessionId, targetAiMessageId);

  }, [currentChatSession, isLoading, handleRegenerateAIMessage]);


  const handleEditPanelSubmit = useCallback(async (
    action: EditMessagePanelAction,
    newContent: string,
    editingMessageDetail: EditMessagePanelDetails
  ) => {
    if (!currentChatSession || isLoading) return;

    const { sessionId, messageId, role, originalContent, attachments } = editingMessageDetail;
    if (currentChatSession.id !== sessionId) return;

    requestCancelledByUserRef.current = false;
    onFullResponseCalledForPendingMessageRef.current = false;
    originalMessageSnapshotRef.current = null;

    if (action === EditMessagePanelAction.SAVE_AND_SUBMIT) {
        const messageBeingEditedIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
        if (messageBeingEditedIndex === -1) return;
        
        let historyForAPICall: ChatMessage[];
        let userMessageToSubmit: ChatMessage;

        if (role === ChatMessageRole.USER) {
            historyForAPICall = getHistoryUpToMessage(currentChatSession.messages, messageBeingEditedIndex);
            userMessageToSubmit = {
                ...currentChatSession.messages[messageBeingEditedIndex],
                content: newContent,
                attachments: attachments, 
                timestamp: new Date(),
                cachedAudioBuffers: null, 
            };
            await updateChatSession(sessionId, session => session ? ({
                ...session,
                messages: [...historyForAPICall, userMessageToSubmit]
            }) : null);

        } else { 
            const precedingUserMessageIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageBeingEditedIndex);
            if (precedingUserMessageIndex === -1) {
                console.error("Cannot resubmit AI edit: No preceding user message found.");
                return;
            }
            historyForAPICall = getHistoryUpToMessage(currentChatSession.messages, precedingUserMessageIndex);
            userMessageToSubmit = {
                id: `msg-${Date.now()}-user-fromai-edit-${Math.random().toString(36).substring(2,7)}`, 
                role: ChatMessageRole.USER,
                content: newContent,
                attachments: currentChatSession.messages[precedingUserMessageIndex].attachments, 
                timestamp: new Date(),
                cachedAudioBuffers: null,
            };
            // Ensure the original preceding user message is also included in the messages for the API call context
            await updateChatSession(sessionId, session => session ? ({
                ...session,
                messages: [...historyForAPICall, currentChatSession.messages[precedingUserMessageIndex], userMessageToSubmit]
            }) : null);
        }
        
        const originalMessagesAfterEditPoint = currentChatSession.messages.slice(messageBeingEditedIndex + (role === ChatMessageRole.USER ? 0 : 1) );
        await setMessageGenerationTimes(prevTimes => { 
            const newTimesState = {...prevTimes};
            originalMessagesAfterEditPoint.forEach(msg => delete newTimesState[msg.id]);
            if (role === ChatMessageRole.MODEL || role === ChatMessageRole.ERROR) { 
                delete newTimesState[messageId];
            }
            return newTimesState;
        });
        
        // Prepare context for handleSendMessage, ensuring it has the correct preceding user message
        let finalHistoryContextForSendMessage = [...historyForAPICall];
        if (role === ChatMessageRole.MODEL || role === ChatMessageRole.ERROR) {
            const precedingUserMessageIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageBeingEditedIndex);
            if(precedingUserMessageIndex !== -1) {
                 finalHistoryContextForSendMessage = [...historyForAPICall, currentChatSession.messages[precedingUserMessageIndex]];
            }
        }
        await handleSendMessage(userMessageToSubmit.content, userMessageToSubmit.attachments, finalHistoryContextForSendMessage);


    } else if (action === EditMessagePanelAction.CONTINUE_PREFIX) {
        if (role !== ChatMessageRole.MODEL) {
            console.warn("Continue Prefix action is only for AI messages.");
            return;
        }
        const modelMessageToContinue = currentChatSession.messages.find(m => m.id === messageId);
        if (!modelMessageToContinue) return;

        originalMessageSnapshotRef.current = { ...modelMessageToContinue, cachedAudioBuffers: null }; 
        pendingMessageIdRef.current = messageId;

        generationStartTimeRef.current = Date.now();
        setIsLoading(true);
        setCurrentGenerationTimeDisplay("0.0s");
        abortControllerRef.current = new AbortController();

        const updatedAiMessagePlaceholder: ChatMessage = {
            ...modelMessageToContinue,
            content: newContent, 
            isStreaming: true,
            timestamp: new Date(),
            cachedAudioBuffers: null, 
        };
        await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(msg => msg.id === messageId ? updatedAiMessagePlaceholder : msg)}) : null);
        await setMessageGenerationTimes(prev => { const n = {...prev}; delete n[messageId]; return n; }); 
        
        let settingsOverrideForContinue: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
        if (currentChatSession.isCharacterModeActive && modelMessageToContinue.characterName) {
            const character = (currentChatSession.aiCharacters || []).find(c => c.name === modelMessageToContinue.characterName);
            if (character) {
                settingsOverrideForContinue.systemInstruction = character.systemInstruction;
                settingsOverrideForContinue._characterIdForAPICall = character.id;
            }
        }
        
        const messageBeingContinuedIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
        if (messageBeingContinuedIndex === -1) return; 

        const userPromptForContinuationIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageBeingContinuedIndex);
        if (userPromptForContinuationIndex === -1) {
             console.error("Could not find user prompt for AI message continuation.");
             setIsLoading(false);
             if (originalMessageSnapshotRef.current) {
                await updateChatSession(sessionId, s => s ? ({...s, messages: s.messages.map(m => m.id === messageId ? originalMessageSnapshotRef.current! : m)}) : null);
             }
             return;
        }

        const historyContext = getHistoryUpToMessage(currentChatSession.messages, userPromptForContinuationIndex); 
        const userMessageInputForContinue: UserMessageInput = { 
            text: newContent, 
            attachments: currentChatSession.messages[userPromptForContinuationIndex].attachments 
        }; 

        const commonOnCompleteForContinue = async () => {
            if (requestCancelledByUserRef.current && pendingMessageIdRef.current === messageId) { /* Handled */ }
            else if (pendingMessageIdRef.current === messageId) {
                setIsLoading(false);
                if (!onFullResponseCalledForPendingMessageRef.current) {
                    await updateChatSession(sessionId, session => {
                         if (!session) return null;
                        const msgInState = session.messages.find(m => m.id === messageId);
                        if (msgInState && msgInState.isStreaming && msgInState.role !== ChatMessageRole.ERROR) {
                            return {
                                ...session,
                                messages: session.messages.map(msg =>
                                    msg.id === messageId
                                    ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Continuation failed or stream ended.", cachedAudioBuffers: null}
                                    : msg
                                ),
                                lastUpdatedAt: new Date()
                            };
                        } else if (msgInState && !msgInState.isStreaming && originalMessageSnapshotRef.current) {
                             return {
                                ...session,
                                messages: session.messages.map(msg => msg.id === messageId ? originalMessageSnapshotRef.current! : msg),
                                lastUpdatedAt: new Date()
                            };
                        }
                        return {...session, lastUpdatedAt: new Date() };
                    });
                } else {
                    await updateChatSession(sessionId, session => session ? ({...session, lastUpdatedAt: new Date() }) : null);
                }
                pendingMessageIdRef.current = null; originalMessageSnapshotRef.current = null;
            }
            if (abortControllerRef.current && pendingMessageIdRef.current === messageId) abortControllerRef.current = null;
            if (pendingMessageIdRef.current === messageId) requestCancelledByUserRef.current = false;
            onFullResponseCalledForPendingMessageRef.current = false;
        };


        await getFullChatResponse(
            sessionId, userMessageInputForContinue, currentChatSession.model, currentChatSession.settings, historyContext,
            async (responseData) => {
                if (requestCancelledByUserRef.current && pendingMessageIdRef.current === messageId) return;
                onFullResponseCalledForPendingMessageRef.current = true;
                if (generationStartTimeRef.current) await setMessageGenerationTimes(prev => ({ ...prev, [messageId]: (Date.now() - generationStartTimeRef.current!) / 1000 })); 
                const finalContent = newContent + responseData.text; 
                const continuedAiMessage: ChatMessage = {
                    ...updatedAiMessagePlaceholder,
                    content: finalContent,
                    groundingMetadata: responseData.groundingMetadata,
                    isStreaming: false,
                    role: ChatMessageRole.MODEL,
                    timestamp: new Date(),
                    cachedAudioBuffers: null,
                };
                if (triggerAutoFetchForNewMessage) {
                   triggerAutoFetchForNewMessage(continuedAiMessage);
                }
                await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(msg => msg.id === messageId ? continuedAiMessage : msg)}) : null);
            },
            async (errorMsg, isAbortError) => {
                if (requestCancelledByUserRef.current && pendingMessageIdRef.current === messageId) { if(isLoading) setIsLoading(false); return; }
                onFullResponseCalledForPendingMessageRef.current = false;
                if (isAbortError && pendingMessageIdRef.current === messageId) {
                    if (originalMessageSnapshotRef.current) {
                        await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(m => m.id === originalMessageSnapshotRef.current!.id ? originalMessageSnapshotRef.current! : m) }) : null);
                    }
                } else if (pendingMessageIdRef.current === messageId) {
                    await updateChatSession(sessionId, s => s ? ({ ...s, messages: s.messages.map(msg => msg.id === messageId ? { ...updatedAiMessagePlaceholder, isStreaming: false, role: ChatMessageRole.ERROR, content: `Continuation failed: ${errorMsg}`, cachedAudioBuffers: null } : msg)}) : null);
                }
                if (!requestCancelledByUserRef.current && pendingMessageIdRef.current === messageId) setIsLoading(false);
            },
            commonOnCompleteForContinue,
            logApiRequestDirectly,
            abortControllerRef.current.signal,
            settingsOverrideForContinue,
            currentChatSession.aiCharacters
        );
    }
  }, [currentChatSession, isLoading, updateChatSession, handleSendMessage, logApiRequestDirectly, setMessageGenerationTimes, triggerAutoFetchForNewMessage]);


  return {
    isLoading,
    currentGenerationTimeDisplay,
    lastMessageHadAttachments,
    logApiRequest: logApiRequestDirectly,
    handleSendMessage,
    handleContinueFlow,
    handleCancelGeneration,
    handleRegenerateAIMessage,
    handleRegenerateResponseForUserMessage,
    handleEditPanelSubmit,
  };
}
