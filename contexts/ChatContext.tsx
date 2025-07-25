import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { ChatSession, ChatMessage, GeminiSettings, Attachment, AICharacter, ApiRequestLog, ExportConfiguration, UserDefinedDefaults, ChatMessageRole, LogApiRequestCallback } from '../types';
import { useChatSessions } from '../hooks/useChatSessions';
import { useAiCharacters } from '../hooks/useAiCharacters';
import { useGemini } from '../hooks/useGemini';
import { useImportExport } from '../hooks/useImportExport';
import { useAppPersistence } from '../hooks/useAppPersistence';
import { useSidebarActions } from '../hooks/useSidebarActions';
import { useChatInteractions } from '../hooks/useChatInteractions';
// Removed: import { useAutoFetchAudio } from '../hooks/useAutoFetchAudio';
import { useAutoSend, UseAutoSendReturn } from '../hooks/useAutoSend';
import { useUIContext } from './UIContext';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/EditMessagePanel';
import { DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT } from '../constants';
import { useMessageInjection } from '../hooks/useMessageInjection';
import { useApiKeyContext } from './ApiKeyContext';


// Define the shape of the Chat context data
interface ChatContextType {
  // From useChatSessions
  chatHistory: ChatSession[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => Promise<void>;
  currentChatSession: ChatSession | null; // This will remain the raw session
  visibleMessagesForCurrentChat: ChatMessage[]; // New: Pre-sliced messages for ChatView
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  isLoadingData: boolean;

  // From useGemini (and wrapped by useChatInteractions for handleEditPanelSubmit)
  isLoading: boolean;
  currentGenerationTimeDisplay: string;
  handleSendMessage: (promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[], characterIdForAPICall?: string, isTemporaryContext?: boolean) => Promise<void>;
  handleContinueFlow: () => Promise<void>;
  handleCancelGeneration: () => Promise<void>;
  handleRegenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
  handleRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
  handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, details: EditMessagePanelDetails) => Promise<void>; // This is the wrapper from useChatInteractions

  // From useAiCharacters
  handleToggleCharacterMode: () => Promise<void>;
  handleAddCharacter: (name: string, systemInstruction: string) => Promise<void>;
  handleEditCharacter: (id: string, name: string, systemInstruction: string) => Promise<void>;
  handleDeleteCharacter: (id: string) => Promise<void>;
  handleReorderCharacters: (newCharacters: AICharacter[]) => Promise<void>;
  handleSaveCharacterContextualInfo: (characterId: string, newInfo: string) => Promise<void>;

  // From useImportExport
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  handleImportAll: () => Promise<void>;
  
  // From useAppPersistence
  messagesToDisplayConfig: Record<string, number>;
  setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  currentExportConfig: ExportConfiguration;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  messageGenerationTimes: Record<string, number>;
  handleManualSave: () => Promise<void>;

  // From useSidebarActions
  editingTitleInfo: { id: string | null; value: string };
  handleStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
  handleSaveChatTitle: () => Promise<void>;
  handleCancelEditChatTitle: () => void;
  handleEditTitleInputChange: (newTitle: string) => void;
  handleDuplicateChat: (sessionId: string) => Promise<void>;

  // From useChatInteractions
  handleActualCopyMessage: (content: string) => Promise<boolean>;
  handleDeleteMessageAndSubsequent: (sessionId: string, messageId: string) => Promise<void>;
  handleDeleteSingleMessageOnly: (sessionId: string, messageId: string) => void;
  handleLoadMoreDisplayMessages: (chatId: string, count: number) => Promise<void>;
  handleLoadAllDisplayMessages: (chatId: string, count: number) => Promise<void>;
  handleClearApiLogs: (sessionId: string) => Promise<void>;
  handleClearChatCacheForCurrentSession: () => void;
  handleReUploadAttachment: (sessionId: string, messageId: string, attachmentId: string) => Promise<void>;
  
  // From useAutoSend
  autoSendHook: UseAutoSendReturn;

  // New for auto-play, will be provided by AudioContext
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;

  // New method for actually resetting audio cache
  performActualAudioCacheReset: (sessionId: string, messageId: string) => Promise<void>;

  // From useMessageInjection
  handleInsertEmptyMessageAfter: (sessionId: string, afterMessageId: string, roleToInsert: ChatMessageRole.USER | ChatMessageRole.MODEL) => Promise<void>;

  // New for multi-select actions
  handleDeleteMultipleMessages: (messageIds: string[]) => Promise<void>;
  logApiRequest: LogApiRequestCallback;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useUIContext();
  const { activeApiKey } = useApiKeyContext();

  const {
    chatHistory, setChatHistory, currentChatId, setCurrentChatId, currentChatSession: rawCurrentChatSession, // Renamed to rawCurrentChatSession
    updateChatSession, handleNewChat: useChatSessionsHandleNewChat,
    handleSelectChat: useChatSessionsHandleSelectChat,
    handleDeleteChat: useChatSessionsHandleDeleteChat, isLoadingData,
  } = useChatSessions();

  const [loadedMsgGenTimes, setLoadedMsgGenTimes] = useState<Record<string, number>>({});
  const [loadedDisplayConfig, setLoadedDisplayConfig] = useState<Record<string, number>>({});

  const persistence = useAppPersistence(
    chatHistory, currentChatId, loadedMsgGenTimes, setLoadedMsgGenTimes,
    loadedDisplayConfig, setLoadedDisplayConfig, ui.showToast
  );

  // Placeholder for triggerAutoPlayForNewMessage, will be overridden by AudioContext
  const placeholderTriggerAutoPlay = async (newAiMessage: ChatMessage) => {
    // console.warn("triggerAutoPlayForNewMessage called before AudioContext is ready or connected.");
  };


  const gemini = useGemini({
    apiKey: activeApiKey?.value || '',
    currentChatSession: rawCurrentChatSession,
    updateChatSession,
    logApiRequestDirectly: (logDetails) => {
      if (rawCurrentChatSession && rawCurrentChatSession.settings.debugApiRequests) {
        const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
        updateChatSession(rawCurrentChatSession.id, session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
      }
    },
    onNewAIMessageFinalized: async (newAiMessage) => {
      // This will be updated by AudioContext once it's initialized
      // For now, it might call the placeholder if ChatContext initializes before AudioContext connects the real function.
      // The actual `triggerAutoPlayForNewMessage` from `audioContextValue` will be used once available.
      const contextValue = chatContextValueRef.current;
      if (contextValue && contextValue.triggerAutoPlayForNewMessage) {
        await contextValue.triggerAutoPlayForNewMessage(newAiMessage);
      } else {
        await placeholderTriggerAutoPlay(newAiMessage);
      }
    },
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
  });

  const chatInteractions = useChatInteractions({
    apiKey: activeApiKey?.value || '',
    currentChatSession: rawCurrentChatSession, updateChatSession, showToast: ui.showToast,
    openEditPanel: ui.openEditPanel, closeEditPanel: ui.closeEditPanel,
    geminiHandleEditPanelSubmit: gemini.handleEditPanelSubmit, // Pass the original gemini hook's submit
    geminiHandleCancelGeneration: gemini.handleCancelGeneration,
    isLoadingFromGemini: gemini.isLoading,
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    stopAndCancelAudio: () => {}, // Placeholder for AudioProvider
    activeAutoFetches: new Map(), setActiveAutoFetches: () => {},
    requestDeleteConfirmationModal: ui.requestDeleteConfirmation,
    requestResetAudioCacheConfirmationModal: ui.requestResetAudioCacheConfirmation,
    isSettingsPanelOpen: ui.isSettingsPanelOpen,
    closeSettingsPanel: ui.closeSettingsPanel,
    closeSidebar: ui.closeSidebar,
    logApiRequest: gemini.logApiRequest,
  });

  const autoSend = useAutoSend({
    currentChatSession: rawCurrentChatSession,
    isLoadingFromGemini: gemini.isLoading,
    sendMessageToGemini: gemini.handleSendMessage,
    cancelGeminiGeneration: gemini.handleCancelGeneration,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
  });
  
  const aiCharacters = useAiCharacters(rawCurrentChatSession, updateChatSession);
  const sidebarActions = useSidebarActions({
    chatHistory, setChatHistory, updateChatSession, setCurrentChatId,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig, showToast: ui.showToast,
  });
  const importExport = useImportExport(
    setChatHistory, setCurrentChatId, persistence.setMessageGenerationTimes,
    persistence.setMessagesToDisplayConfig, ui.showToast, chatHistory
  );

  const messageInjection = useMessageInjection({
    updateChatSession,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    messagesToDisplayConfig: persistence.messagesToDisplayConfig, // Pass the config value
    showToast: ui.showToast,
  });

  const handleNewChat = useCallback(async () => {
    await useChatSessionsHandleNewChat(persistence.setMessagesToDisplayConfig);
    ui.showToast("New chat created!", "success");
  }, [useChatSessionsHandleNewChat, persistence.setMessagesToDisplayConfig, ui.showToast]);

  const handleSelectChat = useCallback(async (id: string) => {
    if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    await useChatSessionsHandleSelectChat(id, persistence.setMessagesToDisplayConfig);
  }, [useChatSessionsHandleSelectChat, persistence.setMessagesToDisplayConfig, autoSend]);

  const handleDeleteChat = useCallback(async (id: string) => {
    if (currentChatId === id) {
      if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    }
    await useChatSessionsHandleDeleteChat(id, persistence.setMessagesToDisplayConfig, persistence.setMessageGenerationTimes);
    ui.showToast("Chat deleted!", "success");
  }, [currentChatId, useChatSessionsHandleDeleteChat, persistence.setMessagesToDisplayConfig, persistence.setMessageGenerationTimes, autoSend, ui.showToast]);

  const handleAddCharacter = async (name: string, systemInstruction: string) => {
    await aiCharacters.handleAddCharacter(name, systemInstruction);
    ui.showToast("Character added!", "success");
  };

  const handleEditCharacter = async (id: string, name: string, systemInstruction: string) => {
    await aiCharacters.handleEditCharacter(id, name, systemInstruction);
    ui.showToast("Character updated!", "success");
  };

  const handleDeleteCharacter = async (id: string) => {
    await aiCharacters.handleDeleteCharacter(id);
    ui.showToast("Character deleted!", "success");
  };

  const performActualAudioCacheReset = useCallback(async (sessionId: string, messageId: string) => {
    await updateChatSession(sessionId, session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;

      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        cachedAudioBuffers: null, // Clear the cache
      };
      return { ...session, messages: updatedMessages };
    });
    ui.showToast("Audio cache reset for message.", "success");
  }, [updateChatSession, ui.showToast]);

  const handleDeleteMultipleMessages = useCallback(async (messageIds: string[]) => {
    if (!rawCurrentChatSession || messageIds.length === 0) return;

    await updateChatSession(rawCurrentChatSession.id, session => {
      if (!session) return null;
      const idSet = new Set(messageIds);
      const newMessages = session.messages.filter(m => !idSet.has(m.id));
      
      persistence.setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messageIds.forEach(id => delete newTimesState[id]);
        return newTimesState;
      }).catch(console.error);

      return { ...session, messages: newMessages };
    });
    
    ui.showToast(`${messageIds.length} message(s) deleted.`, "success");
    ui.toggleSelectionMode(); // This also clears selection
  }, [rawCurrentChatSession, updateChatSession, persistence.setMessageGenerationTimes, ui.showToast, ui.toggleSelectionMode]);

  const visibleMessagesForCurrentChat = useMemo(() => {
    if (!rawCurrentChatSession || !rawCurrentChatSession.id) {
        return [];
    }
    
    const countFromConfig = persistence.messagesToDisplayConfig[rawCurrentChatSession.id];
    const countFromSessionSettings = rawCurrentChatSession.settings?.maxInitialMessagesDisplayed;
    const countFromGlobalDefaults = DEFAULT_SETTINGS.maxInitialMessagesDisplayed;

    let numToDisplay: number;

    if (countFromConfig !== undefined && countFromConfig !== null) {
        numToDisplay = countFromConfig;
    } else if (countFromSessionSettings !== undefined && countFromSessionSettings !== null) {
        numToDisplay = countFromSessionSettings;
    } else if (countFromGlobalDefaults !== undefined && countFromGlobalDefaults !== null) {
        numToDisplay = countFromGlobalDefaults;
    } else {
        numToDisplay = INITIAL_MESSAGES_COUNT;
    }
    
    return rawCurrentChatSession.messages.slice(-numToDisplay);
  }, [rawCurrentChatSession, persistence.messagesToDisplayConfig]);
  
  const chatContextValueRef = React.useRef<ChatContextType | null>(null);

  const value: ChatContextType = {
    chatHistory, setChatHistory, currentChatId, setCurrentChatId, 
    currentChatSession: rawCurrentChatSession, // Provide the raw session
    visibleMessagesForCurrentChat, // Provide the derived visible messages
    updateChatSession, handleNewChat, handleSelectChat, handleDeleteChat, isLoadingData,
    
    isLoading: gemini.isLoading,
    currentGenerationTimeDisplay: gemini.currentGenerationTimeDisplay,
    handleSendMessage: gemini.handleSendMessage,
    handleContinueFlow: gemini.handleContinueFlow,
    handleCancelGeneration: gemini.handleCancelGeneration,
    handleRegenerateAIMessage: gemini.handleRegenerateAIMessage,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
    handleEditPanelSubmit: chatInteractions.handleEditPanelSubmitWrapper, 

    ...aiCharacters,
    handleAddCharacter, 
    handleEditCharacter, 
    handleDeleteCharacter,
    
    ...importExport,
    ...persistence,
    ...sidebarActions,
    
    handleDeleteMessageAndSubsequent: chatInteractions.handleDeleteMessageAndSubsequent,
    handleDeleteSingleMessageOnly: chatInteractions.handleDeleteSingleMessageOnly,
    handleLoadMoreDisplayMessages: chatInteractions.handleLoadMoreDisplayMessages,
    handleLoadAllDisplayMessages: chatInteractions.handleLoadAllDisplayMessages,
    handleClearApiLogs: chatInteractions.handleClearApiLogs,
    handleClearChatCacheForCurrentSession: chatInteractions.handleClearChatCacheForCurrentSession,
    handleReUploadAttachment: chatInteractions.handleReUploadAttachment,
    handleActualCopyMessage: chatInteractions.handleActualCopyMessage,
    
    autoSendHook: autoSend,
    triggerAutoPlayForNewMessage: placeholderTriggerAutoPlay, // Initial placeholder
    performActualAudioCacheReset, // Add the new function
    handleInsertEmptyMessageAfter: messageInjection.handleInsertEmptyMessageAfter,
    handleDeleteMultipleMessages,
    logApiRequest: gemini.logApiRequest,
  };

  chatContextValueRef.current = value;


  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};