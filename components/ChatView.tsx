

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
    import { ChatSession, ChatMessage, ChatMessageRole, Attachment, AICharacter, AttachmentUploadState, AudioPlayerState } from '../types';
    import MessageItem from './MessageItem';
    import { 
        SendIcon, Bars3Icon, LOAD_MORE_MESSAGES_COUNT, FlowRightIcon, StopIcon, 
        PaperClipIcon, XCircleIcon, DocumentIcon, PlayCircleIcon, 
        SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_VIDEO_MIME_TYPES,
        UsersIcon, PlusIcon, ArrowsUpDownIcon, CheckIcon, InfoIcon, CloudArrowUpIcon, ServerIcon
    } from '../constants'; 
    import AutoSendControls from '../NEW/AutoSendControls'; 
    import { UseAutoSendReturn } from '../NEW/useAutoSend'; 
    import ManualSaveButton from './ManualSaveButton'; 
    import { useAttachmentHandler } from '../hooks/useAttachmentHandler'; 
    import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea'; // Import the new hook
    import { getModelDisplayName } from '../services/utils'; // Import the utility function

    interface ChatViewProps {
      chatSession: ChatSession | null;
      visibleMessages: ChatMessage[];
      totalMessagesInSession: number;
      onSendMessage: (content: string, attachments?: Attachment[], characterId?: string, isTemporaryContext?: boolean) => Promise<void>; 
      onContinueFlow: () => Promise<void>; 
      isLoading: boolean; 
      currentGenerationTimeDisplay: string; 
      messageGenerationTimes: Record<string, number>; 
      isSidebarVisible: boolean;
      onToggleSidebar: () => void;
      onCopyMessage: (content: string) => Promise<boolean>; 
      onAttemptDeleteMessageAndHistory: (sessionId: string, messageId: string) => void; 
      onDeleteSingleMessage: (sessionId: string, messageId: string) => void; 
      onEditUserMessage: (sessionId: string, messageId: string, currentContent: string, role: ChatMessageRole, attachments?: Attachment[]) => void;
      onEditModelMessage: (sessionId: string, messageId: string, currentContent: string, role: ChatMessageRole, attachments?: Attachment[]) => void;
      onRegenerateAIMessage: (sessionId: string, aiMessageId: string) => void;
      onRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => void;
      onLoadMoreDisplayMessages: (chatId: string, count: number) => void;
      onLoadAllDisplayMessages: (chatId: string) => void;
      onCancelGeneration: () => void; 
      lastMessageHadAttachments: boolean;
      onOpenCharacterManagement: () => void; 
      onReorderCharacters: (newCharacters: AICharacter[]) => void; 
      logApiRequestCallback: (logDetails: Omit<import('../types').ApiRequestLog, 'id' | 'timestamp'>) => void; 
      onPlayText: (text: string, messageId: string, partIndex?: number) => void;
      onStopPlayback: () => void; 
      audioPlayerState: AudioPlayerState; 
      isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
      onCancelApiFetchThisSegment: (uniqueSegmentId: string) => void;
      getSegmentFetchError: (uniqueSegmentId: string) => string | undefined; // Added prop
      isMainButtonMultiFetchingApi: (baseMessageId: string) => boolean; 
      onCancelMainButtonMultiFetchApi: (baseMessageId: string) => void; 
      onRequestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => void;
      isAutoFetchingSegment: (uniqueSegmentId: string) => boolean; 
      onCancelAutoFetchSegment: (uniqueSegmentId: string) => void; 
      autoSendHook: UseAutoSendReturn; 
      showAutoSendControls: boolean; 
      onDownloadAudio: (sessionId: string, messageId: string) => void; 
      onManualSave: () => Promise<void>; 
      onReUploadAttachment: (sessionId: string, messageId: string, attachmentId: string) => Promise<void>; 
      showToast: (message: string, type?: 'success' | 'error') => void; 
    }

    export interface ChatViewHandles { 
      scrollToMessage: (messageId: string) => void;
    }
    
    const ChatView = forwardRef<ChatViewHandles, ChatViewProps>(({ 
        chatSession, 
        visibleMessages,
        totalMessagesInSession,
        onSendMessage, 
        onContinueFlow, 
        isLoading, 
        currentGenerationTimeDisplay,
        messageGenerationTimes,
        isSidebarVisible, 
        onToggleSidebar,
        onCopyMessage,
        onAttemptDeleteMessageAndHistory, 
        onDeleteSingleMessage,
        onEditUserMessage,
        onEditModelMessage,
        onRegenerateAIMessage,
        onRegenerateResponseForUserMessage,
        onLoadMoreDisplayMessages,
        onLoadAllDisplayMessages,
        onCancelGeneration, 
        lastMessageHadAttachments,
        onOpenCharacterManagement,
        onReorderCharacters,
        logApiRequestCallback, 
        onPlayText,
        onStopPlayback, 
        audioPlayerState,
        isApiFetchingThisSegment,
        onCancelApiFetchThisSegment,
        getSegmentFetchError, // Destructured prop
        isMainButtonMultiFetchingApi,
        onCancelMainButtonMultiFetchApi,
        onRequestResetAudioCacheConfirmation,
        isAutoFetchingSegment, 
        onCancelAutoFetchSegment, 
        autoSendHook, 
        showAutoSendControls, 
        onDownloadAudio,
        onManualSave, 
        onReUploadAttachment,
        showToast, 
    }, ref) => {
      const [inputMessage, setInputMessage] = useState('');
      const fileInputRef = useRef<HTMLInputElement>(null);
      const messagesEndRef = useRef<HTMLDivElement>(null);
      const messageListRef = useRef<HTMLDivElement>(null);
      const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(inputMessage); // Use the hook
      const [showLoadButtonsUI, setShowLoadButtonsUI] = useState(false);

      const shouldPreserveScrollRef = useRef<boolean>(false);
      const prevScrollHeightRef = useRef<number>(0);
      const prevVisibleMessagesLengthRef = useRef<number>(0);
      const prevChatIdRef = useRef<string | null | undefined>(null);

      const isCharacterMode = chatSession?.isCharacterModeActive || false;
      const [characters, setCharactersState] = useState<AICharacter[]>(chatSession?.aiCharacters || []);
      const [isReorderingActive, setIsReorderingActive] = useState(false);
      const draggedCharRef = useRef<AICharacter | null>(null);
      const dropTargetRef = useRef<HTMLButtonElement | null>(null);
      const characterButtonContainerRef = useRef<HTMLDivElement | null>(null); 
      const [isInfoInputModeActive, setIsInfoInputModeActive] = useState(false);

      const [highlightTerm, setHighlightTerm] = useState<string>(""); 

      const attachmentHandler = useAttachmentHandler({
        logApiRequestCallback,
        isInfoInputModeActive,
      });
      const { 
        selectedFiles, 
        handleFileSelection, 
        handlePaste, 
        removeSelectedFile, 
        getValidAttachmentsToSend,
        isAnyFileStillProcessing,
        resetSelectedFiles,
        getFileProgressDisplay,
        getDisplayFileType,
      } = attachmentHandler;


      useImperativeHandle(ref, () => ({
        scrollToMessage: (messageId: string) => {
          const messageElement = messageListRef.current?.querySelector(`#message-item-${messageId}`);
          if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.classList.add('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out');
            setTimeout(() => {
              messageElement.classList.remove('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out');
            }, 2500);
          } else {
            console.warn(`Message element with ID message-item-${messageId} not found for scrolling.`);
            if (chatSession && visibleMessages.length < totalMessagesInSession) {
                const isMessageInFullList = chatSession.messages.some(m => m.id === messageId);
                if (isMessageInFullList) {
                    handleLoadAll(); 
                    setTimeout(() => {
                         const newAttemptMessageElement = messageListRef.current?.querySelector(`#message-item-${messageId}`);
                         if (newAttemptMessageElement) {
                            newAttemptMessageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            newAttemptMessageElement.classList.add('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out');
                            setTimeout(() => {
                                newAttemptMessageElement.classList.remove('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out');
                            }, 2500);
                         }
                    }, 500); 
                }
            }
          }
        }
      }));


      useEffect(() => {
        setCharactersState(chatSession?.aiCharacters || []);
        if (!chatSession?.isCharacterModeActive && isInfoInputModeActive) {
            setIsInfoInputModeActive(false); 
        }
      }, [chatSession?.aiCharacters, chatSession?.isCharacterModeActive, isInfoInputModeActive]);


      useLayoutEffect(() => {
        const listElement = messageListRef.current;
        if (!listElement) return;

        const isNewChatOrSwitched = prevChatIdRef.current !== chatSession?.id;
        const messagesLengthChanged = prevVisibleMessagesLengthRef.current !== visibleMessages.length;
        
        if (isNewChatOrSwitched) { 
            listElement.scrollTop = listElement.scrollHeight;
        } else if (shouldPreserveScrollRef.current && messagesLengthChanged) { 
            listElement.scrollTop = listElement.scrollHeight - prevScrollHeightRef.current;
            shouldPreserveScrollRef.current = false;
        } else if (messagesLengthChanged && visibleMessages.length > prevVisibleMessagesLengthRef.current) { 
            const lastMessage = visibleMessages[visibleMessages.length -1];
            const isStreamingOrNewOwnMessage = lastMessage?.isStreaming || (lastMessage?.role === ChatMessageRole.USER && prevVisibleMessagesLengthRef.current < visibleMessages.length);
            if (isStreamingOrNewOwnMessage && (listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight < 200) ) {
                 listElement.scrollTop = listElement.scrollHeight;
            }
        }
        prevVisibleMessagesLengthRef.current = visibleMessages.length;
        prevChatIdRef.current = chatSession?.id;
      }, [visibleMessages, chatSession?.id]);


      const handleSendMessageClick = async (characterId?: string) => {
        const currentInputMessageValue = inputMessage; 
        const attachmentsToSend = getValidAttachmentsToSend();

        let temporaryContextFlag = false;
    
        if (isLoading || !chatSession || autoSendHook.isAutoSendingActive) return; 
        
        if (isAnyFileStillProcessing()) {
            showToast("Some files are still being processed. Please wait for them to complete before sending.", "error");
            return;
        }
    
        if (isCharacterMode && characterId) { 
            if (autoSendHook.isPreparingAutoSend) { 
                autoSendHook.startAutoSend(autoSendHook.autoSendText, parseInt(autoSendHook.autoSendRepetitionsInput, 10) || 1, characterId);
                setInputMessage(''); 
                resetSelectedFiles();
                // Textarea height will reset via useAutoResizeTextarea hook due to inputMessage change
                return; 
            }
            if (isInfoInputModeActive) {
                if (currentInputMessageValue.trim()) { 
                    temporaryContextFlag = true;
                } else { 
                    temporaryContextFlag = false;
                }
            } else { 
                temporaryContextFlag = false;
            }
        } else if (!isCharacterMode) { 
            if (currentInputMessageValue.trim() === '' && attachmentsToSend.length === 0) {
                return;
            }
            temporaryContextFlag = false;
        } else {
            console.warn("Send clicked in character mode without a specific character target.");
            return;
        }
        
        setInputMessage('');
        resetSelectedFiles();
        // Textarea height will reset via useAutoResizeTextarea hook
        if (isInfoInputModeActive && temporaryContextFlag) { 
            setIsInfoInputModeActive(false);
        }
        
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0; 
        shouldPreserveScrollRef.current = false; 
        await onSendMessage(currentInputMessageValue, attachmentsToSend, characterId, temporaryContextFlag);
    };

      const handleContinueFlowClick = async () => {
        if (isLoading || !chatSession || chatSession.messages.length === 0 || isCharacterMode || autoSendHook.isAutoSendingActive) return;
        setInputMessage(''); 
        resetSelectedFiles();
        // Textarea height will reset via useAutoResizeTextarea hook
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = false;
        await onContinueFlow();
      };
    
      const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!isCharacterMode && !autoSendHook.isAutoSendingActive) { 
            handleSendMessageClick();
          }
        }
      };

      const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputMessage(e.target.value);
        // Auto-resize is handled by the useAutoResizeTextarea hook
      };

      const handleScroll = () => {
        if (messageListRef.current) {
            const { scrollTop } = messageListRef.current;
            if (scrollTop < 5 && chatSession && visibleMessages.length < totalMessagesInSession) {
                setShowLoadButtonsUI(true);
            } else {
                setShowLoadButtonsUI(false);
            }
        }
      };

      const handleLoadMore = (count: number) => {
        if (!chatSession) return;
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = true;
        onLoadMoreDisplayMessages(chatSession.id, count);
        setShowLoadButtonsUI(false); 
      };
    
      const handleLoadAll = () => {
        if (!chatSession) return;
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = true;
        onLoadAllDisplayMessages(chatSession.id);
        setShowLoadButtonsUI(false); 
      };

      const toggleInfoInputMode = () => {
        setIsInfoInputModeActive(prev => {
            const newState = !prev;
            if (newState) { 
                setInputMessage('');
                resetSelectedFiles(); 
                // Textarea height will reset via useAutoResizeTextarea hook
                 if (textareaRef.current) textareaRef.current.focus();
            }
            return newState;
        });
    };

      const amountToLoad = Math.min(LOAD_MORE_MESSAGES_COUNT, totalMessagesInSession - visibleMessages.length);
      
      const hasValidInputForMainSend = inputMessage.trim() !== '' || getValidAttachmentsToSend().length > 0;
      
      const loadingMessageText = isLoading
        ? autoSendHook.isAutoSendingActive 
          ? `Auto-sending: ${autoSendHook.autoSendRemaining} left... (${currentGenerationTimeDisplay})`
          : lastMessageHadAttachments
            ? `Processing & Sending attachments to AI... (${currentGenerationTimeDisplay})`
            : `Gemini is thinking... (${currentGenerationTimeDisplay})`
        : "";
      
      let placeholderText = "Type your message here... (Shift+Enter for new line, or paste files)";
        if (isCharacterMode) {
            if (isInfoInputModeActive) {
                placeholderText = "Enter one-time contextual info for the character...";
            } else {
                placeholderText = "Type message (optional), then select character...";
            }
        }

      const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, char: AICharacter) => {
        if (!isReorderingActive) return;
        draggedCharRef.current = char;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', char.id);
        e.currentTarget.classList.add('opacity-50', 'ring-2', 'ring-blue-500');
      };

      const handleDragOver = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
          e.preventDefault();
          if (!isReorderingActive || !draggedCharRef.current) return;
          e.dataTransfer.dropEffect = 'move';
      
          if (e.currentTarget === characterButtonContainerRef.current) {
              const container = characterButtonContainerRef.current;
              const childButtons = Array.from(container.children) as HTMLButtonElement[];
              const { clientY } = e;
      
              let nextSibling: HTMLButtonElement | null = null;
              for (const child of childButtons) {
                  const rect = child.getBoundingClientRect();
                  if (clientY < rect.top + rect.height / 2) {
                      nextSibling = child;
                      break;
                  }
              }
      
              childButtons.forEach(btn => {
                  btn.classList.remove('border-t-2', 'border-blue-500', 'border-b-2');
              });
      
              if (nextSibling && nextSibling.dataset.charId !== draggedCharRef.current.id) {
                  nextSibling.classList.add('border-t-2', 'border-blue-500');
                  dropTargetRef.current = nextSibling;
              } else if (!nextSibling && childButtons.length > 0 && childButtons[childButtons.length -1].dataset.charId !== draggedCharRef.current.id) {
                  childButtons[childButtons.length -1].classList.add('border-b-2', 'border-blue-500');
                  dropTargetRef.current = childButtons[childButtons.length -1]; 
              } else {
                  dropTargetRef.current = null; 
              }
          }
      };
      
      const handleDrop = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
          e.preventDefault();
          if (!isReorderingActive || !draggedCharRef.current || !chatSession) return;
      
          const draggedCharId = draggedCharRef.current.id;
          let newChars = [...characters];
          const dragItemIndex = newChars.findIndex(c => c.id === draggedCharId);
          if (dragItemIndex === -1) return;
      
          const [draggedItem] = newChars.splice(dragItemIndex, 1);
      
          if (dropTargetRef.current && dropTargetRef.current.dataset.charId) {
              const targetCharId = dropTargetRef.current.dataset.charId;
              const dropItemIndex = newChars.findIndex(c => c.id === targetCharId);
      
              if (dropItemIndex !== -1) {
                  const dropTargetRect = dropTargetRef.current.getBoundingClientRect();
                  if (dropTargetRef.current.classList.contains('border-t-2')) {
                      newChars.splice(dropItemIndex, 0, draggedItem);
                  } else { 
                      newChars.splice(dropItemIndex + 1, 0, draggedItem);
                  }
              } else { 
                   newChars.push(draggedItem);
              }
          } else {
              newChars.push(draggedItem);
          }
          
          onReorderCharacters(newChars); 
          setCharactersState(newChars); 
          
          (Array.from(characterButtonContainerRef.current?.children || []) as HTMLButtonElement[])
            .forEach(btn => btn.classList.remove('border-t-2', 'border-b-2', 'border-blue-500'));
          draggedCharRef.current = null;
          dropTargetRef.current = null;
      };

      const handleDragEnd = (e: React.DragEvent<HTMLButtonElement>) => {
        if (!isReorderingActive) return;
        e.currentTarget.classList.remove('opacity-50', 'ring-2', 'ring-blue-500');
        (Array.from(characterButtonContainerRef.current?.children || []) as HTMLButtonElement[])
            .forEach(btn => btn.classList.remove('border-t-2', 'border-b-2', 'border-blue-500'));
      };

      const toggleReordering = () => {
        setIsReorderingActive(prev => !prev);
        if (isReorderingActive) { 
            draggedCharRef.current = null;
            dropTargetRef.current = null;
             (Array.from(characterButtonContainerRef.current?.children || []) as HTMLButtonElement[])
            .forEach(btn => btn.classList.remove('border-t-2', 'border-b-2', 'border-blue-500', 'opacity-50', 'ring-2', 'ring-blue-500'));
        }
      };

      const handleMainCancelButtonClick = async () => {
        if (autoSendHook.isAutoSendingActive) {
            await autoSendHook.stopAutoSend(); 
        } else if (isLoading) { 
            onCancelGeneration();
        }
      };
      
      const handleCharacterButtonAutoSend = (charId: string) => {
        if (autoSendHook.canStartAutoSend(autoSendHook.autoSendText, autoSendHook.autoSendRepetitionsInput) && 
            !autoSendHook.isAutoSendingActive && 
            !isLoading) {
            autoSendHook.startAutoSend(autoSendHook.autoSendText, parseInt(autoSendHook.autoSendRepetitionsInput, 10) || 1, charId);
        } else if (!autoSendHook.isAutoSendingActive && !isLoading) {
            handleSendMessageClick(charId); 
        }
      };

      const handleGenericAutoSendStart = () => {
        if (!isCharacterMode && 
            autoSendHook.canStartAutoSend(autoSendHook.autoSendText, autoSendHook.autoSendRepetitionsInput) &&
            !autoSendHook.isAutoSendingActive && 
            !isLoading) {
            autoSendHook.startAutoSend(autoSendHook.autoSendText, parseInt(autoSendHook.autoSendRepetitionsInput, 10) || 1);
        }
      };


      return (
        <div className="flex flex-col h-full bg-gray-800">
          <header className="p-3 sm:p-4 border-b border-gray-700 flex items-center space-x-3 sticky top-0 bg-gray-800 z-20">
            <button
              onClick={onToggleSidebar}
              className="p-1.5 text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
              title={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
            <div className="flex-grow overflow-hidden">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-200 truncate flex items-center">
                {chatSession ? chatSession.title : "Gemini Chat Interface"}
                {isCharacterMode && <UsersIcon className="w-5 h-5 ml-2 text-purple-400 flex-shrink-0" />}
              </h1>
              <div className="flex items-center space-x-2">
                {chatSession && (
                  <p className="text-xs text-gray-400 truncate" title={getModelDisplayName(chatSession.model)}>
                    Model: {getModelDisplayName(chatSession.model)}
                  </p>
                )}
                {chatSession && onManualSave && (
                  <ManualSaveButton onManualSave={onManualSave} disabled={!chatSession || isLoading} />
                )}
              </div>
            </div>
             {isCharacterMode && chatSession && (
                <div className="ml-auto flex items-center space-x-2">
                    <button
                        onClick={toggleReordering}
                        className={`p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium rounded-md transition-colors flex items-center
                                    ${isReorderingActive 
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}
                        title={isReorderingActive ? "Done Reordering" : "Edit Character Order"}
                    >
                        {isReorderingActive ? <CheckIcon className="w-4 h-4 sm:mr-1.5" /> : <ArrowsUpDownIcon className="w-4 h-4 sm:mr-1.5" />}
                        <span className="hidden sm:inline">{isReorderingActive ? "Done" : "Edit Order"}</span>
                    </button>
                    <button
                        onClick={onOpenCharacterManagement}
                        className="flex items-center p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium text-purple-300 bg-purple-600 bg-opacity-30 rounded-md hover:bg-opacity-50 transition-colors"
                        title="Manage AI Characters"
                        disabled={isReorderingActive}
                    >
                        <PlusIcon className="w-4 h-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Manage Characters</span>
                    </button>
                </div>
            )}
          </header>
    
          <div 
            ref={messageListRef}
            onScroll={handleScroll}
            className="flex-1 p-4 sm:p-6 space-y-0 overflow-y-auto relative" 
            role="log"
            aria-live="polite"
          >
            {chatSession && showLoadButtonsUI && visibleMessages.length < totalMessagesInSession && (
                <div className="sticky top-2 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center space-y-2 my-2">
                    {amountToLoad > 0 && (
                         <button 
                            onClick={() => handleLoadMore(amountToLoad)}
                            className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform transform hover:scale-105"
                         >
                            Show {amountToLoad} More
                        </button>
                    )}
                    <button 
                        onClick={handleLoadAll}
                        className="px-4 py-2 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded-full shadow-lg transition-transform transform hover:scale-105"
                    >
                        Show All History ({totalMessagesInSession - visibleMessages.length} more)
                    </button>
                </div>
            )}

            {chatSession ? (
              visibleMessages.length > 0 ? (
                visibleMessages.map((msg, idx) => {
                  const fullMessageList = chatSession.messages; 
                  const currentMessageIndexInFullList = fullMessageList.findIndex(m => m.id === msg.id);
                  const nextMessageInFullList = (currentMessageIndexInFullList !== -1 && currentMessageIndexInFullList < fullMessageList.length - 1) 
                                                ? fullMessageList[currentMessageIndexInFullList + 1] 
                                                : null;

                  const canRegenerateFollowingAI = msg.role === ChatMessageRole.USER && 
                                                 nextMessageInFullList !== null && 
                                                 (nextMessageInFullList.role === ChatMessageRole.MODEL || nextMessageInFullList.role === ChatMessageRole.ERROR) &&
                                                 !isCharacterMode; 
                  return (
                    <MessageItem 
                      key={msg.id} 
                      message={msg} 
                      chatSessionId={chatSession.id}
                      messageGenerationTimes={messageGenerationTimes}
                      onCopyMessage={onCopyMessage}
                      onAttemptDeleteMessageAndHistory={onAttemptDeleteMessageAndHistory} 
                      onDeleteSingleMessage={onDeleteSingleMessage}
                      onEditUserMessage={onEditUserMessage}
                      onEditModelMessage={onEditModelMessage}
                      onRegenerateAIMessage={isCharacterMode ? () => {} : onRegenerateAIMessage} 
                      onRegenerateResponseForUserMessage={isCharacterMode ? undefined : onRegenerateResponseForUserMessage}
                      canRegenerateFollowingAI={canRegenerateFollowingAI}
                      chatScrollContainerRef={messageListRef}
                      onPlayText={onPlayText}
                      onStopPlayback={onStopPlayback}
                      audioPlayerState={audioPlayerState}
                      isApiFetchingThisSegment={isApiFetchingThisSegment}
                      onCancelApiFetchThisSegment={onCancelApiFetchThisSegment}
                      getSegmentFetchError={getSegmentFetchError}
                      isMainButtonMultiFetchingApi={isMainButtonMultiFetchingApi} 
                      onCancelMainButtonMultiFetchApi={onCancelMainButtonMultiFetchApi}
                      onRequestResetAudioCacheConfirmation={onRequestResetAudioCacheConfirmation}
                      onDownloadAudio={onDownloadAudio}
                      highlightTerm={highlightTerm} 
                      onReUploadAttachment={onReUploadAttachment} 
                      maxWordsPerSegmentForTts={chatSession?.settings?.ttsSettings?.maxWordsPerSegment}
                    />
                  );
                })
              ) : (
                <div className="text-center text-gray-500 italic mt-10">
                  No messages yet. {isCharacterMode && characters.length === 0 ? "Add some characters and start the scene!" : (isCharacterMode ? "Select a character to speak." : "Start the conversation!")}
                </div>
              )
            ) : (
              <div className="text-center text-gray-500 italic mt-10">
                Select a chat from the history or start a new one.
              </div>
            )}
            <div ref={messagesEndRef} /> 
          </div>
            
          {/* Sticky Bottom Container for Controls and Input */}
          <div className="sticky bottom-0 z-20 bg-gray-800 flex flex-col">
            {selectedFiles.length > 0 && (
                <div className="p-2 sm:p-3 border-t border-gray-700 bg-gray-800"> {/* Selected Files Panel */}
                  <div className="flex flex-wrap gap-3">
                    {selectedFiles.map(file => (
                      <div 
                        key={file.id} 
                        className="relative group p-2.5 bg-gray-700 rounded-lg shadow flex items-center w-full sm:w-auto sm:max-w-xs md:max-w-sm lg:max-w-md"
                        style={{ minWidth: '200px' }} 
                      >
                        <div className="flex-shrink-0 w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden mr-3">
                          {(file.uploadState === 'reading_client' || (file.uploadState === 'uploading_to_cloud' && !file.progress) || file.uploadState === 'processing_on_server') && file.isLoading && !(file.dataUrl && (file.type === 'image' || file.type === 'video')) ? (
                             file.uploadState === 'uploading_to_cloud' ? <CloudArrowUpIcon className="w-5 h-5 text-blue-400 animate-pulse"/> :
                             file.uploadState === 'processing_on_server' ? <ServerIcon className="w-5 h-5 text-blue-400 animate-pulse"/> :
                             <DocumentIcon className="w-5 h-5 text-gray-400 animate-pulse"/>
                          ) : (file.uploadState === 'error_client_read' || file.uploadState === 'error_cloud_upload') && file.error ? (
                            <DocumentIcon className="w-6 h-6 text-red-400" />
                          ) : file.dataUrl && SUPPORTED_IMAGE_MIME_TYPES.includes(file.mimeType) && file.type === 'image' ? (
                            <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                          ) : file.dataUrl && SUPPORTED_VIDEO_MIME_TYPES.includes(file.mimeType) && file.type === 'video' ? (
                            <PlayCircleIcon className="w-6 h-6 text-gray-300" />
                          ) : (
                            <DocumentIcon className="w-6 h-6 text-gray-300" />
                          )}
                        </div>

                        <div className="flex-grow flex flex-col min-w-0 mr-2">
                          <p className="text-sm font-medium text-gray-200 truncate" title={file.name}>
                            {getDisplayFileType(file)}
                          </p>
                          <p className="text-xs text-gray-400 truncate" title={file.statusMessage || getFileProgressDisplay(file)}>
                            {getFileProgressDisplay(file)}
                          </p>
                           {(file.uploadState === 'uploading_to_cloud' && file.progress !== undefined && file.progress > 0) && (
                              <div className="w-full bg-gray-600 rounded-full h-1 mt-1">
                                  <div className="bg-blue-500 h-1 rounded-full transition-all duration-150 ease-linear" style={{ width: `${file.progress || 0}%` }}></div>
                              </div>
                          )}
                        </div>
                        
                        <button
                          onClick={() => removeSelectedFile(file.id)}
                          className="flex-shrink-0 p-1 bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white rounded-full transition-colors"
                          title="Remove file"
                          aria-label="Remove file"
                        >
                          <XCircleIcon className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
            )}
            
            {isCharacterMode && characters.length > 0 && (
                <div 
                    ref={characterButtonContainerRef}
                    className="p-2 sm:p-3 border-t border-gray-700 bg-gray-800" 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <p className="text-xs text-gray-400 mb-2">
                        {isReorderingActive ? "Drag to reorder characters, then click 'Done'." : 
                         (isInfoInputModeActive ? "Input is for one-time info. Select character to speak:" : 
                          (autoSendHook.isPreparingAutoSend ? "Auto-send ready. Select character to start:" : "Select a character to speak (can be empty input):")
                         )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {characters.map((char, index) => (
                            <button
                                key={char.id}
                                data-char-id={char.id}
                                onClick={() => !isReorderingActive && handleCharacterButtonAutoSend(char.id) }
                                disabled={!chatSession || isLoading || isAnyFileStillProcessing() || autoSendHook.isAutoSendingActive || (isReorderingActive && !!draggedCharRef.current && draggedCharRef.current.id === char.id)}
                                draggable={isReorderingActive}
                                onDragStart={(e) => handleDragStart(e, char)}
                                onDragEnd={handleDragEnd}
                                className={`px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 transition-all duration-150 ease-in-out
                                            ${isReorderingActive ? 'cursor-grab hover:ring-2 hover:ring-purple-400' : 'disabled:cursor-not-allowed'}
                                            ${draggedCharRef.current?.id === char.id ? 'opacity-50 ring-2 ring-blue-500' : ''}
                                            ${(autoSendHook.isPreparingAutoSend && !autoSendHook.isAutoSendingActive && !isLoading) ? 'ring-2 ring-green-500 hover:ring-green-400' : ''}
                                          `}
                                title={isReorderingActive ? `Drag to reorder ${char.name}` : (autoSendHook.isPreparingAutoSend && !autoSendHook.isAutoSendingActive && !isLoading ? `Start auto-sending as ${char.name}` : `Speak as ${char.name}`)}
                            >
                                {char.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showAutoSendControls && (
                <AutoSendControls
                    isAutoSendingActive={autoSendHook.isAutoSendingActive}
                    autoSendText={autoSendHook.autoSendText}
                    setAutoSendText={autoSendHook.setAutoSendText}
                    autoSendRepetitionsInput={autoSendHook.autoSendRepetitionsInput}
                    setAutoSendRepetitionsInput={autoSendHook.setAutoSendRepetitionsInput}
                    autoSendRemaining={autoSendHook.autoSendRemaining}
                    onStartAutoSend={handleGenericAutoSendStart}
                    onStopAutoSend={autoSendHook.stopAutoSend}
                    canStart={autoSendHook.canStartAutoSend(autoSendHook.autoSendText, autoSendHook.autoSendRepetitionsInput)}
                    isChatViewLoading={isLoading}
                    currentChatSessionExists={!!chatSession}
                    isCharacterMode={isCharacterMode}
                    isPreparingAutoSend={autoSendHook.isPreparingAutoSend}
                    isWaitingForErrorRetry={autoSendHook.isWaitingForErrorRetry}
                    errorRetryCountdown={autoSendHook.errorRetryCountdown}
                />
            )}
      
            {/* Actual Input Bar content */}
            <div className="p-3 sm:p-4 border-t border-gray-700 bg-gray-800"> 
                { isLoading && 
                    <p className="text-xs text-center text-blue-400 mb-2 animate-pulse">
                        {loadingMessageText}
                    </p> 
                }
                <div className="flex items-end bg-gray-700 rounded-lg p-1 focus-within:ring-2 focus-within:ring-blue-500">
                    <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFileSelection(e.target.files)} className="hidden" accept="image/*,video/*,.pdf,text/*,text/x-python,application/javascript,application/x-python-code,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || !chatSession || isInfoInputModeActive || autoSendHook.isAutoSendingActive}
                        className="p-2.5 sm:p-3 m-1 text-gray-300 hover:text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-blue-500"
                        title="Attach files"
                        aria-label="Attach files"
                    >
                        <PaperClipIcon className="w-5 h-5" />
                    </button>
                    {isCharacterMode && (
                        <button
                            onClick={toggleInfoInputMode}
                            disabled={isLoading || !chatSession || autoSendHook.isAutoSendingActive}
                            className={`p-2.5 sm:p-3 m-1 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700
                                        ${isInfoInputModeActive ? 'bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-400' : 'hover:text-white focus:ring-blue-500'}
                                      `}
                            title={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"}
                            aria-label={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"}
                            aria-pressed={isInfoInputModeActive}
                        >
                            <InfoIcon className="w-5 h-5" />
                        </button>
                    )}
                    <textarea
                        ref={textareaRef} 
                        rows={1}
                        className="flex-grow p-2.5 sm:p-3 bg-transparent text-gray-200 focus:outline-none resize-none placeholder-gray-400 hide-scrollbar"
                        placeholder={placeholderText}
                        value={inputMessage}
                        onChange={handleInputChange} 
                        onKeyPress={handleKeyPress}
                        onPaste={handlePaste} 
                        disabled={!chatSession || isAnyFileStillProcessing() || autoSendHook.isAutoSendingActive}
                        aria-label="Chat input"
                    />
                    {!isCharacterMode && (
                        <button
                            onClick={handleContinueFlowClick}
                            disabled={isLoading || !chatSession || (chatSession && chatSession.messages.length === 0) || isAnyFileStillProcessing() || isCharacterMode || autoSendHook.isAutoSendingActive}
                            className="p-2.5 sm:p-3 m-1 text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-teal-500"
                            title="Continue Flow"
                            aria-label="Continue flow"
                        >
                            <FlowRightIcon className="w-5 h-5" />
                        </button>
                    )}
                    {(isLoading || autoSendHook.isAutoSendingActive) ? (
                        <button
                            onClick={handleMainCancelButtonClick}
                            className="p-2.5 sm:p-3 m-1 text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-red-500"
                            aria-label={autoSendHook.isAutoSendingActive ? "Stop automated sending" : "Cancel generation"}
                            title={autoSendHook.isAutoSendingActive ? "Stop automated sending" : "Cancel generation"}
                        >
                            <StopIcon className="w-5 h-5" />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleSendMessageClick()}
                            disabled={!hasValidInputForMainSend || !chatSession || isAnyFileStillProcessing() || isCharacterMode || autoSendHook.isAutoSendingActive} 
                            className={`p-2.5 sm:p-3 m-1 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-blue-500 ${isCharacterMode ? 'hidden' : ''}`}
                            aria-label="Send message"
                            title="Send message"
                        >
                            <SendIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div> 
          </div> 
        </div> 
      );
    });
    
    export default ChatView;