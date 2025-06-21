
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { ChatMessage, ChatMessageRole, AICharacter } from '../types';
import MessageItem from './MessageItem';
import { LOAD_MORE_MESSAGES_COUNT } from '../constants';
import { Bars3Icon, FlowRightIcon, StopIcon, PaperClipIcon, XCircleIcon, DocumentIcon, PlayCircleIcon, UsersIcon, PlusIcon, ArrowsUpDownIcon, CheckIcon, InfoIcon, CloudArrowUpIcon, ServerIcon, SendIcon } from './Icons';
import AutoSendControls from './AutoSendControls';
import ManualSaveButton from './ManualSaveButton';
import { useAttachmentHandler } from '../hooks/useAttachmentHandler';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea';
import { getModelDisplayName } from '../services/utils';

interface ChatViewProps {
    onEnterReadMode: (content: string) => void;
}

export interface ChatViewHandles {
    scrollToMessage: (messageId: string) => void;
}

const ChatView = forwardRef<ChatViewHandles, ChatViewProps>(({
    onEnterReadMode,
}, ref) => {
    const chat = useChatContext();
    const ui = useUIContext();

    const [inputMessage, setInputMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);
    const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(inputMessage);
    const [showLoadButtonsUI, setShowLoadButtonsUI] = useState(false);

    const shouldPreserveScrollRef = useRef<boolean>(false);
    const prevScrollHeightRef = useRef<number>(0);
    const prevVisibleMessagesLengthRef = useRef<number>(0);
    const prevChatIdRef = useRef<string | null | undefined>(null);

    const isCharacterMode = chat.currentChatSession?.isCharacterModeActive || false;
    const [characters, setCharactersState] = useState<AICharacter[]>(chat.currentChatSession?.aiCharacters || []);
    const [isReorderingActive, setIsReorderingActive] = useState(false);
    const draggedCharRef = useRef<AICharacter | null>(null);
    const dropTargetRef = useRef<HTMLButtonElement | null>(null);
    const characterButtonContainerRef = useRef<HTMLDivElement | null>(null);
    const [isInfoInputModeActive, setIsInfoInputModeActive] = useState(false);

    const attachmentHandler = useAttachmentHandler({
        logApiRequestCallback: () => { }, // Placeholder, as logging will be implicit
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

    const visibleMessages = chat.visibleMessagesForCurrentChat || []; // Use pre-sliced messages from context
    const totalMessagesInSession = chat.currentChatSession ? chat.currentChatSession.messages.length : 0;

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
                if (chat.currentChatSession && visibleMessages.length < totalMessagesInSession) {
                    const isMessageInFullList = chat.currentChatSession.messages.some(m => m.id === messageId);
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
        setCharactersState(chat.currentChatSession?.aiCharacters || []);
        if (!chat.currentChatSession?.isCharacterModeActive && isInfoInputModeActive) {
            setIsInfoInputModeActive(false);
        }
    }, [chat.currentChatSession?.aiCharacters, chat.currentChatSession?.isCharacterModeActive, isInfoInputModeActive]);


    useLayoutEffect(() => {
        const listElement = messageListRef.current;
        if (!listElement) return;

        const isNewChatOrSwitched = prevChatIdRef.current !== chat.currentChatId;
        const messagesLengthChanged = prevVisibleMessagesLengthRef.current !== visibleMessages.length;
        
        if (isNewChatOrSwitched) {
            listElement.scrollTop = listElement.scrollHeight;
        } else if (shouldPreserveScrollRef.current && messagesLengthChanged) {
            listElement.scrollTop = listElement.scrollHeight - prevScrollHeightRef.current;
            shouldPreserveScrollRef.current = false;
        } else if (messagesLengthChanged && visibleMessages.length > prevVisibleMessagesLengthRef.current) {
            const lastMessage = visibleMessages[visibleMessages.length - 1];
            const isStreamingOrNewOwnMessage = lastMessage?.isStreaming || (lastMessage?.role === ChatMessageRole.USER && prevVisibleMessagesLengthRef.current < visibleMessages.length);
            if (isStreamingOrNewOwnMessage && (listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight < 200)) {
                listElement.scrollTop = listElement.scrollHeight;
            }
        }
        prevVisibleMessagesLengthRef.current = visibleMessages.length;
        prevChatIdRef.current = chat.currentChatId;
    }, [visibleMessages, chat.currentChatId]);


    const handleSendMessageClick = async (characterId?: string) => {
        const currentInputMessageValue = inputMessage;
        const attachmentsToSend = getValidAttachmentsToSend();
        let temporaryContextFlag = false;

        if (chat.isLoading || !chat.currentChatSession || chat.autoSendHook.isAutoSendingActive) return;

        if (isAnyFileStillProcessing()) {
            ui.showToast("Some files are still being processed. Please wait for them to complete before sending.", "error");
            return;
        }

        if (isCharacterMode && characterId) {
            if (chat.autoSendHook.isPreparingAutoSend) {
                chat.autoSendHook.startAutoSend(chat.autoSendHook.autoSendText, parseInt(chat.autoSendHook.autoSendRepetitionsInput, 10) || 1, characterId);
                setInputMessage('');
                resetSelectedFiles();
                return;
            }
            if (isInfoInputModeActive) {
                temporaryContextFlag = !!currentInputMessageValue.trim();
            }
        } else if (!isCharacterMode) {
            if (currentInputMessageValue.trim() === '' && attachmentsToSend.length === 0) {
                return;
            }
        } else {
            return;
        }

        setInputMessage('');
        resetSelectedFiles();
        if (isInfoInputModeActive && temporaryContextFlag) {
            setIsInfoInputModeActive(false);
        }

        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = false;
        // Corrected arguments for handleSendMessage:
        // 1. promptContent: string
        // 2. attachments?: Attachment[]
        // 3. historyContextOverride?: ChatMessage[]
        // 4. characterIdForAPICall?: string
        // 5. isTemporaryContext?: boolean
        await chat.handleSendMessage(currentInputMessageValue, attachmentsToSend, undefined, characterId, temporaryContextFlag);
    };

    const handleContinueFlowClick = async () => {
        if (chat.isLoading || !chat.currentChatSession || chat.currentChatSession.messages.length === 0 || isCharacterMode || chat.autoSendHook.isAutoSendingActive) return;
        setInputMessage('');
        resetSelectedFiles();
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = false;
        await chat.handleContinueFlow();
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isCharacterMode && !chat.autoSendHook.isAutoSendingActive) {
                handleSendMessageClick();
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputMessage(e.target.value);
    };

    const handleScroll = () => {
        if (messageListRef.current) {
            const { scrollTop } = messageListRef.current;
            if (scrollTop < 5 && chat.currentChatSession && visibleMessages.length < totalMessagesInSession) {
                setShowLoadButtonsUI(true);
            } else {
                setShowLoadButtonsUI(false);
            }
        }
    };

    const handleLoadMore = (count: number) => {
        if (!chat.currentChatSession) return;
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = true;
        chat.handleLoadMoreDisplayMessages(chat.currentChatSession.id, count);
        setShowLoadButtonsUI(false);
    };

    const handleLoadAll = () => {
        if (!chat.currentChatSession) return;
        prevScrollHeightRef.current = messageListRef.current?.scrollHeight || 0;
        shouldPreserveScrollRef.current = true;
        chat.handleLoadAllDisplayMessages(chat.currentChatSession.id, totalMessagesInSession); // Pass totalMessagesInSession to load all
        setShowLoadButtonsUI(false);
    };

    const toggleInfoInputMode = () => {
        setIsInfoInputModeActive(prev => {
            if (!prev) {
                setInputMessage('');
                resetSelectedFiles();
                if (textareaRef.current) textareaRef.current.focus();
            }
            return !prev;
        });
    };

    const amountToLoad = Math.min(LOAD_MORE_MESSAGES_COUNT, totalMessagesInSession - visibleMessages.length);
    const hasValidInputForMainSend = inputMessage.trim() !== '' || getValidAttachmentsToSend().length > 0;
    
    const loadingMessageText = chat.isLoading
        ? chat.autoSendHook.isAutoSendingActive
            ? `Auto-sending: ${chat.autoSendHook.autoSendRemaining} left... (${chat.currentGenerationTimeDisplay})`
            : `Gemini is thinking... (${chat.currentGenerationTimeDisplay})`
        : "";

    let placeholderText = "Type your message here... (Shift+Enter for new line, or paste files)";
    if (isCharacterMode) {
        placeholderText = isInfoInputModeActive
            ? "Enter one-time contextual info for the character..."
            : "Type message (optional), then select character...";
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
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        if (!isReorderingActive || !draggedCharRef.current || !chat.currentChatSession) return;
        
        const targetCharId = (e.target as HTMLElement).closest('button[data-char-id]')?.getAttribute('data-char-id');
        if (!targetCharId) return;

        const draggedChar = draggedCharRef.current;
        const currentChars = [...characters];
        
        const draggedIndex = currentChars.findIndex(c => c.id === draggedChar.id);
        const targetIndex = currentChars.findIndex(c => c.id === targetCharId);

        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

        const [removed] = currentChars.splice(draggedIndex, 1);
        currentChars.splice(targetIndex, 0, removed);
        
        setCharactersState(currentChars); // Update local state immediately for responsiveness
        await chat.handleReorderCharacters(currentChars); // Update context and persist
        draggedCharRef.current = null;
    };


    const handleDragEnd = (e: React.DragEvent<HTMLButtonElement>) => {
        if (!isReorderingActive) return;
        e.currentTarget.classList.remove('opacity-50', 'ring-2', 'ring-blue-500');
    };

    const toggleReordering = () => setIsReorderingActive(prev => !prev);
    
    const handleMainCancelButtonClick = async () => {
        if (chat.autoSendHook.isAutoSendingActive) {
            await chat.autoSendHook.stopAutoSend();
        } else if (chat.isLoading) {
            chat.handleCancelGeneration();
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-800">
            <header className="p-3 sm:p-4 border-b border-gray-700 flex items-center space-x-3 sticky top-0 bg-gray-800 z-20">
                <button
                    onClick={ui.handleToggleSidebar}
                    className="p-1.5 text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={ui.isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                    title={ui.isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                >
                    <Bars3Icon className="w-5 h-5" />
                </button>
                <div className="flex-grow overflow-hidden">
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-200 truncate flex items-center">
                        {chat.currentChatSession ? chat.currentChatSession.title : "Gemini Chat Interface"}
                        {isCharacterMode && <UsersIcon className="w-5 h-5 ml-2 text-purple-400 flex-shrink-0" />}
                    </h1>
                    <div className="flex items-center space-x-2">
                        {chat.currentChatSession && <p className="text-xs text-gray-400 truncate" title={getModelDisplayName(chat.currentChatSession.model)}>Model: {getModelDisplayName(chat.currentChatSession.model)}</p>}
                        {chat.currentChatSession && <ManualSaveButton onManualSave={chat.handleManualSave} disabled={!chat.currentChatSession || chat.isLoading} />}
                    </div>
                </div>
                {isCharacterMode && chat.currentChatSession && (
                    <div className="ml-auto flex items-center space-x-2">
                        <button onClick={toggleReordering} className={`p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium rounded-md transition-colors flex items-center ${isReorderingActive ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`} title={isReorderingActive ? "Done Reordering" : "Edit Character Order"}>
                            {isReorderingActive ? <CheckIcon className="w-4 h-4 sm:mr-1.5" /> : <ArrowsUpDownIcon className="w-4 h-4 sm:mr-1.5" />}
                            <span className="hidden sm:inline">{isReorderingActive ? "Done" : "Edit Order"}</span>
                        </button>
                        <button onClick={ui.openCharacterManagementModal} className="flex items-center p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium text-purple-300 bg-purple-600 bg-opacity-30 rounded-md hover:bg-opacity-50 transition-colors" title="Manage AI Characters" disabled={isReorderingActive}>
                            <PlusIcon className="w-4 h-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">Manage Characters</span>
                        </button>
                    </div>
                )}
            </header>

            <div ref={messageListRef} onScroll={handleScroll} className="flex-1 p-4 sm:p-6 space-y-0 overflow-y-auto relative" role="log" aria-live="polite">
                {chat.currentChatSession && showLoadButtonsUI && visibleMessages.length < totalMessagesInSession && (
                    <div className="sticky top-2 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center space-y-2 my-2">
                        {amountToLoad > 0 && <button onClick={() => handleLoadMore(amountToLoad)} className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform transform hover:scale-105">Show {amountToLoad} More</button>}
                        <button onClick={handleLoadAll} className="px-4 py-2 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded-full shadow-lg transition-transform transform hover:scale-105">Show All History ({totalMessagesInSession - visibleMessages.length} more)</button>
                    </div>
                )}
                {chat.currentChatSession ? (
                    visibleMessages.length > 0 ? (
                        visibleMessages.map((msg) => {
                            const fullMessageList = chat.currentChatSession!.messages; // Still need full list for this logic
                            const currentMessageIndexInFullList = fullMessageList.findIndex(m => m.id === msg.id);
                            const nextMessageInFullList = (currentMessageIndexInFullList !== -1 && currentMessageIndexInFullList < fullMessageList.length - 1) ? fullMessageList[currentMessageIndexInFullList + 1] : null;
                            const canRegenerateFollowingAI = msg.role === ChatMessageRole.USER && nextMessageInFullList !== null && (nextMessageInFullList.role === ChatMessageRole.MODEL || nextMessageInFullList.role === ChatMessageRole.ERROR) && !isCharacterMode;
                            return <MessageItem key={msg.id} message={msg} canRegenerateFollowingAI={canRegenerateFollowingAI} chatScrollContainerRef={messageListRef} onEnterReadMode={onEnterReadMode} />;
                        })
                    ) : (
                        <div className="text-center text-gray-500 italic mt-10">
                            {isCharacterMode && characters.length === 0 ? "Add some characters and start the scene!" : (isCharacterMode ? "Select a character to speak." : "Start the conversation!")}
                        </div>
                    )
                ) : (
                    <div className="text-center text-gray-500 italic mt-10">Select a chat from the history or start a new one.</div>
                )}
                <div ref={messagesEndRef} />
            </div>
            
            <div className="sticky bottom-0 z-20 bg-gray-800 flex flex-col">
                {selectedFiles.length > 0 && (
                    <div className="p-2 sm:p-3 border-t border-gray-700 bg-gray-800">
                        <div className="flex flex-wrap gap-3">
                            {selectedFiles.map(file => (
                                <div key={file.id} className="relative group p-2.5 bg-gray-700 rounded-lg shadow flex items-center w-full sm:w-auto sm:max-w-xs md:max-w-sm lg:max-w-md" style={{ minWidth: '200px' }}>
                                    <div className="flex-shrink-0 w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden mr-3">
                                        {(file.uploadState === 'reading_client' || (file.uploadState === 'uploading_to_cloud' && !file.progress) || file.uploadState === 'processing_on_server') && file.isLoading && !(file.dataUrl && (file.type === 'image' || file.type === 'video')) ? (
                                            file.uploadState === 'uploading_to_cloud' ? <CloudArrowUpIcon className="w-5 h-5 text-blue-400 animate-pulse" /> :
                                            file.uploadState === 'processing_on_server' ? <ServerIcon className="w-5 h-5 text-blue-400 animate-pulse" /> :
                                            <DocumentIcon className="w-5 h-5 text-gray-400 animate-pulse" />
                                        ) : (file.uploadState === 'error_client_read' || file.uploadState === 'error_cloud_upload') && file.error ? (
                                            <DocumentIcon className="w-6 h-6 text-red-400" />
                                        ) : file.dataUrl && file.mimeType.startsWith('image/') && file.type === 'image' ? (
                                            <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                                        ) : file.dataUrl && file.mimeType.startsWith('video/') && file.type === 'video' ? (
                                            <PlayCircleIcon className="w-6 h-6 text-gray-300" />
                                        ) : (
                                            <DocumentIcon className="w-6 h-6 text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-grow flex flex-col min-w-0 mr-2">
                                        <p className="text-sm font-medium text-gray-200 truncate" title={file.name}>{getDisplayFileType(file)}</p>
                                        <p className="text-xs text-gray-400 truncate" title={file.statusMessage || getFileProgressDisplay(file)}>{getFileProgressDisplay(file)}</p>
                                        {(file.uploadState === 'uploading_to_cloud' && file.progress !== undefined && file.progress > 0) && (
                                            <div className="w-full bg-gray-600 rounded-full h-1 mt-1"><div className="bg-blue-500 h-1 rounded-full transition-all duration-150 ease-linear" style={{ width: `${file.progress || 0}%` }}></div></div>
                                        )}
                                    </div>
                                    <button onClick={() => removeSelectedFile(file.id)} className="flex-shrink-0 p-1 bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white rounded-full transition-colors" title="Remove file" aria-label="Remove file">
                                        <XCircleIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {isCharacterMode && characters.length > 0 && (
                    <div ref={characterButtonContainerRef} className="p-2 sm:p-3 border-t border-gray-700 bg-gray-800" onDragOver={handleDragOver} onDrop={handleDrop}>
                        <p className="text-xs text-gray-400 mb-2">{isReorderingActive ? "Drag to reorder characters, then click 'Done'." : (isInfoInputModeActive ? "Input is for one-time info. Select character to speak:" : (chat.autoSendHook.isPreparingAutoSend ? "Auto-send ready. Select character to start:" : "Select a character to speak (can be empty input):"))}</p>
                        <div className="flex flex-wrap gap-2">
                            {characters.map((char) => (
                                <button key={char.id} data-char-id={char.id} onClick={() => !isReorderingActive && handleSendMessageClick(char.id)} disabled={!chat.currentChatSession || chat.isLoading || isAnyFileStillProcessing() || chat.autoSendHook.isAutoSendingActive || (isReorderingActive && !!draggedCharRef.current && draggedCharRef.current.id === char.id)} draggable={isReorderingActive} onDragStart={(e) => handleDragStart(e, char)} onDragEnd={handleDragEnd} className={`px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 transition-all duration-150 ease-in-out ${isReorderingActive ? 'cursor-grab hover:ring-2 hover:ring-purple-400' : 'disabled:cursor-not-allowed'} ${draggedCharRef.current?.id === char.id ? 'opacity-50 ring-2 ring-blue-500' : ''} ${(chat.autoSendHook.isPreparingAutoSend && !chat.autoSendHook.isAutoSendingActive && !chat.isLoading) ? 'ring-2 ring-green-500 hover:ring-green-400' : ''}`} title={isReorderingActive ? `Drag to reorder ${char.name}` : (chat.autoSendHook.isPreparingAutoSend && !chat.autoSendHook.isAutoSendingActive && !chat.isLoading ? `Start auto-sending as ${char.name}` : `Speak as ${char.name}`)}>
                                    {char.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {(chat.currentChatSession?.settings?.showAutoSendControls) && (
                    <AutoSendControls
                        isAutoSendingActive={chat.autoSendHook.isAutoSendingActive}
                        autoSendText={chat.autoSendHook.autoSendText}
                        setAutoSendText={chat.autoSendHook.setAutoSendText}
                        autoSendRepetitionsInput={chat.autoSendHook.autoSendRepetitionsInput}
                        setAutoSendRepetitionsInput={chat.autoSendHook.setAutoSendRepetitionsInput}
                        autoSendRemaining={chat.autoSendHook.autoSendRemaining}
                        onStartAutoSend={() => {
                            if (!isCharacterMode && chat.autoSendHook.canStartAutoSend(chat.autoSendHook.autoSendText, chat.autoSendHook.autoSendRepetitionsInput) && !chat.autoSendHook.isAutoSendingActive && !chat.isLoading) {
                                chat.autoSendHook.startAutoSend(chat.autoSendHook.autoSendText, parseInt(chat.autoSendHook.autoSendRepetitionsInput, 10) || 1);
                            }
                        }}
                        onStopAutoSend={chat.autoSendHook.stopAutoSend}
                        canStart={chat.autoSendHook.canStartAutoSend(chat.autoSendHook.autoSendText, chat.autoSendHook.autoSendRepetitionsInput)}
                        isChatViewLoading={chat.isLoading}
                        currentChatSessionExists={!!chat.currentChatSession}
                        isCharacterMode={isCharacterMode}
                        isPreparingAutoSend={chat.autoSendHook.isPreparingAutoSend}
                        isWaitingForErrorRetry={chat.autoSendHook.isWaitingForErrorRetry}
                        errorRetryCountdown={chat.autoSendHook.errorRetryCountdown}
                    />
                )}
                <div className="p-3 sm:p-4 border-t border-gray-700 bg-gray-800">
                    {chat.isLoading && <p className="text-xs text-center text-blue-400 mb-2 animate-pulse">{loadingMessageText}</p>}
                    <div className="flex items-end bg-gray-700 rounded-lg p-1 focus-within:ring-2 focus-within:ring-blue-500">
                        <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFileSelection(e.target.files)} className="hidden" accept="image/*,video/*,.pdf,text/*,application/json" />
                        <button onClick={() => fileInputRef.current?.click()} disabled={chat.isLoading || !chat.currentChatSession || isInfoInputModeActive || chat.autoSendHook.isAutoSendingActive} className="p-2.5 sm:p-3 m-1 text-gray-300 hover:text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-blue-500" title="Attach files" aria-label="Attach files">
                            <PaperClipIcon className="w-5 h-5" />
                        </button>
                        {isCharacterMode && (
                            <button onClick={toggleInfoInputMode} disabled={chat.isLoading || !chat.currentChatSession || chat.autoSendHook.isAutoSendingActive} className={`p-2.5 sm:p-3 m-1 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 ${isInfoInputModeActive ? 'bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-400' : 'hover:text-white focus:ring-blue-500'}`} title={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"} aria-label={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"} aria-pressed={isInfoInputModeActive}>
                                <InfoIcon className="w-5 h-5" />
                            </button>
                        )}
                        <textarea ref={textareaRef} rows={1} className="flex-grow p-2.5 sm:p-3 bg-transparent text-gray-200 focus:outline-none resize-none placeholder-gray-400 hide-scrollbar" placeholder={placeholderText} value={inputMessage} onChange={handleInputChange} onKeyPress={handleKeyPress} onPaste={handlePaste} disabled={!chat.currentChatSession || isAnyFileStillProcessing() || chat.autoSendHook.isAutoSendingActive} aria-label="Chat input" />
                        {!isCharacterMode && (
                            <button onClick={handleContinueFlowClick} disabled={chat.isLoading || !chat.currentChatSession || (chat.currentChatSession && chat.currentChatSession.messages.length === 0) || isAnyFileStillProcessing() || isCharacterMode || chat.autoSendHook.isAutoSendingActive} className="p-2.5 sm:p-3 m-1 text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-teal-500" title="Continue Flow" aria-label="Continue flow">
                                <FlowRightIcon className="w-5 h-5" />
                            </button>
                        )}
                        {(chat.isLoading || chat.autoSendHook.isAutoSendingActive) ? (
                            <button onClick={handleMainCancelButtonClick} className="p-2.5 sm:p-3 m-1 text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-red-500" aria-label={chat.autoSendHook.isAutoSendingActive ? "Stop automated sending" : "Cancel generation"} title={chat.autoSendHook.isAutoSendingActive ? "Stop automated sending" : "Cancel generation"}>
                                <StopIcon className="w-5 h-5" />
                            </button>
                        ) : (
                            <button onClick={() => handleSendMessageClick()} disabled={!hasValidInputForMainSend || !chat.currentChatSession || isAnyFileStillProcessing() || isCharacterMode || chat.autoSendHook.isAutoSendingActive} className={`p-2.5 sm:p-3 m-1 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-blue-500 ${isCharacterMode ? 'hidden' : ''}`} aria-label="Send message" title="Send message">
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
