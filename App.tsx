






import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatSession, ChatMessage, ChatMessageRole, GeminiSettings, Attachment, AICharacter, ApiRequestLog, TTSSettings, AudioPlayerState, UseAudioPlayerOptions, UseAutoFetchAudioOptions, ExportConfiguration, UserDefinedDefaults, LogApiRequestCallback } from './types'; // Added LogApiRequestCallback
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT, DEFAULT_TTS_SETTINGS, MAX_WORDS_PER_TTS_SEGMENT, DEFAULT_EXPORT_CONFIGURATION } from './constants';
import { splitTextForTts } from './services/utils'; // Updated import for useAudioPlayer's onAutoplayNextSegment
import Sidebar from './components/Sidebar';
import ChatView, { ChatViewHandles } from './components/ChatView';
import SettingsPanel from './components/SettingsPanel';
import EditMessagePanel, { EditMessagePanelAction, EditMessagePanelDetails } from './components/EditMessagePanel';
import CharacterManagementModal from './components/CharacterManagementModal';
import CharacterContextualInfoModal from './components/CharacterContextualInfoModal';
import DebugTerminalPanel from './components/DebugTerminalPanel';
import ConfirmationModal from './components/ConfirmationModal';
import ToastNotification from './components/ToastNotification';
import TtsSettingsModal from './components/TtsSettingsModal';
import AdvancedAudioPlayer from './components/AdvancedAudioPlayer';
import ExportConfigurationModal from './components/ExportConfigurationModal';

import { useChatSessions } from './components/useChatSessions';
import { useAiCharacters } from './components/useAiCharacters';
import { useGemini } from './components/useGemini';
import { useImportExport } from './components/useImportExport';
import { useAudioPlayer } from './components/useAudioPlayer';
import { useAutoSend, UseAutoSendReturn } from './NEW/useAutoSend';
import * as dbService from './services/dbService';
import { METADATA_KEYS } from './services/dbService';

// Import new custom hooks
import { useAppUI } from './hooks/useAppUI';
import { useAppPersistence } from './hooks/useAppPersistence';
import { useAppModals } from './hooks/useAppModals';
import { useSidebarActions } from './hooks/useSidebarActions';
import { useAudioControls } from './hooks/useAudioControls';
import { useChatInteractions } from './hooks/useChatInteractions';
import { useAutoFetchAudio } from './components/useAutoFetchAudio'; // Corrected import path


const App: React.FC = () => {
  const {
    chatHistory, setChatHistory, 
    currentChatId, setCurrentChatId,
    currentChatSession, updateChatSession,
    handleNewChat: useChatSessionsHandleNewChat,
    handleSelectChat: useChatSessionsHandleSelectChat,
    handleDeleteChat: useChatSessionsHandleDeleteChat,
    isLoadingData: isLoadingChatSessions,
  } = useChatSessions();

  const {
    isSidebarOpen, setIsSidebarOpen, layoutDirection,
    toastInfo, setToastInfo, showToast, closeSidebar,
    handleToggleSidebar, handleToggleLayoutDirection,
  } = useAppUI();
  
  const [loadedMsgGenTimes, setLoadedMsgGenTimes] = useState<Record<string, number>>({});
  const [loadedDisplayConfig, setLoadedDisplayConfig] = useState<Record<string, number>>({});

  const {
    messagesToDisplayConfig, setMessagesToDisplayConfig,
    currentExportConfig, setCurrentExportConfig,
    messageGenerationTimes, setMessageGenerationTimes,
    handleManualSave,
  } = useAppPersistence(
    chatHistory, currentChatId, 
    loadedMsgGenTimes, setLoadedMsgGenTimes, 
    loadedDisplayConfig, setLoadedDisplayConfig, 
    showToast
  );

  const appModals = useAppModals(closeSidebar);

  const chatViewRef = useRef<ChatViewHandles>(null);

  const audioControlsHookRef = useRef<any>(null); 

  const audioPlayerHook = useAudioPlayer({
    logApiRequest: (details) => geminiHook?.logApiRequest(details),
    onCacheAudio: (id, buffer) => audioControlsHookRef.current?.handleCacheAudioForMessageCallback(id, buffer),
    onAutoplayNextSegment: async (baseMessageId, playedPartIndex) => {
        const chat = currentChatSession;
        if (!chat || !chat.settings?.ttsSettings) return;
        const message = chat.messages.find(m => m.id === baseMessageId);
        if (!message) return;
        const maxWords = chat.settings.ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
        const allTextSegments = splitTextForTts(message.content, maxWords);
        const nextPartIndex = playedPartIndex + 1;
        if (nextPartIndex < allTextSegments.length) {
            const nextTextSegment = allTextSegments[nextPartIndex];
            const nextUniqueSegmentId = `${baseMessageId}_part_${nextPartIndex}`;
            const nextCachedBuffer = message.cachedAudioBuffers?.[nextPartIndex];
            audioPlayerHook.playText(nextTextSegment, nextUniqueSegmentId, chat.settings.ttsSettings, nextCachedBuffer);
        }
    }
  });
  
  
  const audioControlsHook = useAudioControls({
    currentChatSession, updateChatSession,
    logApiRequest: (details) => geminiHook?.logApiRequest(details), // Ensure geminiHook is accessed safely
    showToast,
    audioPlayerHook,
    requestResetAudioCacheConfirmationModal: appModals.requestResetAudioCacheConfirmation,
    isAutoFetchingSegment: () => false, 
    onCancelAutoFetchSegment: () => {}, 
  });
  audioControlsHookRef.current = audioControlsHook;

  const autoFetchHook = useAutoFetchAudio({
    currentChatSession,
    audioControlsPlayText: audioControlsHook.handlePlayTextForMessage,
  });


  const geminiHook = useGemini({ 
    currentChatSession,
    updateChatSession,
    logApiRequestDirectly: (logDetails) => {
      if (currentChatSession && currentChatSession.settings.debugApiRequests) {
        const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
        updateChatSession(currentChatSession.id, session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
      }
    },
    triggerAutoFetchForNewMessage: autoFetchHook.triggerAutoFetchForNewMessage,
    setMessageGenerationTimes: setMessageGenerationTimes, 
  });

  const chatInteractionsHook = useChatInteractions({
    currentChatSession, updateChatSession, showToast,
    openEditPanel: appModals.openEditPanel,
    closeEditPanel: appModals.closeEditPanel,
    geminiHandleEditPanelSubmit: geminiHook.handleEditPanelSubmit,
    geminiHandleCancelGeneration: geminiHook.handleCancelGeneration,
    isLoadingFromGemini: geminiHook.isLoading,
    setMessageGenerationTimes, setMessagesToDisplayConfig,
    stopAndCancelAudio: audioControlsHook.handleStopAndCancelAllForCurrentAudio,
    activeAutoFetches: new Map(), 
    setActiveAutoFetches: () => {}, 
    requestDeleteConfirmationModal: appModals.requestDeleteConfirmation,
    requestResetAudioCacheConfirmationModal: appModals.requestResetAudioCacheConfirmation,
    isSettingsPanelOpen: appModals.isSettingsPanelOpen,
    closeSettingsPanel: appModals.closeSettingsPanel,
    closeSidebar,
    logApiRequest: geminiHook.logApiRequest, 
  });

  const aiCharactersHook = useAiCharacters(currentChatSession, updateChatSession);
  
  const sidebarActionsHook = useSidebarActions({
    chatHistory, setChatHistory, updateChatSession, setCurrentChatId, setMessagesToDisplayConfig, showToast,
  });

  const importExportHook = useImportExport(
    setChatHistory, setCurrentChatId, setMessageGenerationTimes, setMessagesToDisplayConfig, showToast, chatHistory
  );

  const autoSendHook = useAutoSend({
    currentChatSession, 
    isLoadingFromGemini: geminiHook.isLoading,
    sendMessageToGemini: geminiHook.handleSendMessage,
    cancelGeminiGeneration: geminiHook.handleCancelGeneration,
    handleRegenerateResponseForUserMessage: geminiHook.handleRegenerateResponseForUserMessage, 
  });

  const handleNewChat = useCallback(async () => {
    await useChatSessionsHandleNewChat(setMessagesToDisplayConfig);
    showToast("New chat created!", "success");
  }, [useChatSessionsHandleNewChat, setMessagesToDisplayConfig, showToast]);

  const handleSelectChat = useCallback(async (id: string) => {
    audioControlsHook.handleStopAndCancelAllForCurrentAudio();
    if (autoSendHook.isAutoSendingActive) await autoSendHook.stopAutoSend();
    await useChatSessionsHandleSelectChat(id, setMessagesToDisplayConfig);
  }, [useChatSessionsHandleSelectChat, setMessagesToDisplayConfig, audioControlsHook, autoSendHook]);

  const handleDeleteChat = useCallback(async (id: string) => {
    if (currentChatId === id) {
        audioControlsHook.handleStopAndCancelAllForCurrentAudio();
        if (autoSendHook.isAutoSendingActive) await autoSendHook.stopAutoSend();
    }
    await useChatSessionsHandleDeleteChat(id, setMessagesToDisplayConfig, setMessageGenerationTimes);
    showToast("Chat deleted!", "success");
  }, [currentChatId, useChatSessionsHandleDeleteChat, setMessagesToDisplayConfig, setMessageGenerationTimes, audioControlsHook, autoSendHook, showToast]);

  const handleSettingsChange = useCallback(async (newSettings: GeminiSettings, newModel: string) => {
    if (currentChatSession && currentChatId) {
        const updatedSettings = { 
            ...newSettings, 
            ttsSettings: newSettings.ttsSettings || currentChatSession.settings.ttsSettings || { ...DEFAULT_TTS_SETTINGS } 
        };
        await updateChatSession(currentChatId, session => session ? ({ ...session, settings: updatedSettings, model: newModel }) : null);
        if (currentChatSession.settings.maxInitialMessagesDisplayed !== newSettings.maxInitialMessagesDisplayed) {
            const newMax = newSettings.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT;
            await setMessagesToDisplayConfig(prev => ({ ...prev, [currentChatId]: Math.min(currentChatSession.messages.length, newMax) }));
        }
        showToast("Settings applied to current chat!", "success");
    }
  }, [currentChatSession, currentChatId, updateChatSession, setMessagesToDisplayConfig, showToast]);

  const handleApplyTtsSettings = useCallback(async (newTtsSettings: TTSSettings) => {
    if (currentChatSession && currentChatId) {
        await updateChatSession(currentChatId, session => session ? ({ ...session, settings: { ...session.settings, ttsSettings: newTtsSettings }}) : null);
        showToast("TTS settings applied!", "success");
    }
    appModals.closeTtsSettingsModal();
  }, [currentChatSession, currentChatId, updateChatSession, appModals.closeTtsSettingsModal, showToast]);

  const handleMakeGlobalDefaultSettings = useCallback(async (newDefaultSettings: GeminiSettings, newDefaultModel: string) => {
    await dbService.setAppMetadata(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS, {
        model: newDefaultModel,
        settings: { ...newDefaultSettings, ttsSettings: newDefaultSettings.ttsSettings || { ...DEFAULT_TTS_SETTINGS } },
    });
    showToast("Default settings saved!", "success");
  }, [showToast]);

  const handleConfirmDelete = useCallback(async () => {
    if (appModals.deleteTarget) {
      await chatInteractionsHook.handleDeleteMessageAndSubsequent(appModals.deleteTarget.sessionId, appModals.deleteTarget.messageId);
      showToast("Message and history deleted.", "success");
    }
    appModals.setIsDeleteConfirmationOpen(false); 
  }, [appModals, chatInteractionsHook, showToast]);

  const handleConfirmResetAudioCache = useCallback(async () => {
    if (appModals.resetAudioTarget && currentChatSession) {
      const { sessionId, messageId } = appModals.resetAudioTarget;
      audioControlsHook.handleStopAndCancelAllForCurrentAudio(); 
      showToast("Audio cache reset for this message.", "success");
      await updateChatSession(sessionId, (session) => session ? ({ ...session, messages: session.messages.map(msg => msg.id === messageId ? { ...msg, cachedAudioBuffers: null } : msg)}) : null);
    }
    appModals.setIsResetAudioConfirmationOpen(false); 
  }, [appModals, currentChatSession, updateChatSession, showToast, audioControlsHook]);

  const handleSaveExportConfiguration = useCallback(async (newConfig: ExportConfiguration) => {
    await setCurrentExportConfig(newConfig);
    showToast("Export preferences saved!", "success");
  }, [setCurrentExportConfig, showToast]);

  const handleInitiateExportWithSelected = useCallback(async (config: ExportConfiguration, selectedChatIds: string[]) => {
    await importExportHook.handleExportChats(selectedChatIds, config);
    appModals.closeExportConfigurationModal();
    // showToast(`Exporting ${selectedChatIds.length} chat(s)...`, "success"); // Toast is handled by useImportExport
  }, [importExportHook, appModals.closeExportConfigurationModal]);

  const handleAddCharacterWithToast = useCallback(async (name: string, systemInstruction: string) => {
    await aiCharactersHook.handleAddCharacter(name, systemInstruction);
    showToast("Character added!", "success");
  }, [aiCharactersHook, showToast]);

  const handleEditCharacterWithToast = useCallback(async (id: string, name: string, systemInstruction: string) => {
    await aiCharactersHook.handleEditCharacter(id, name, systemInstruction);
    showToast("Character updated!", "success");
  }, [aiCharactersHook, showToast]);

  const handleDeleteCharacterWithToast = useCallback(async (id: string) => {
    await aiCharactersHook.handleDeleteCharacter(id);
    showToast("Character deleted!", "success");
  }, [aiCharactersHook, showToast]);


  const getVisibleMessages = useCallback((session: ChatSession | null): ChatMessage[] => {
    if (!session) return [];
    const numToDisplay = messagesToDisplayConfig[session.id] || session.settings.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT;
    return session.messages.slice(-numToDisplay);
  }, [messagesToDisplayConfig]);

  const visibleMessages = getVisibleMessages(currentChatSession);
  const totalMessagesInSession = currentChatSession ? currentChatSession.messages.length : 0;

  const getFullTextForAudioBar = useCallback(() => {
      if (!audioPlayerHook.audioPlayerState.currentMessageId || !currentChatSession) return audioPlayerHook.audioPlayerState.currentPlayingText || "Playing audio...";
      const baseId = audioPlayerHook.audioPlayerState.currentMessageId.split('_part_')[0];
      const message = currentChatSession.messages.find(m => m.id === baseId);
      return message ? message.content : (audioPlayerHook.audioPlayerState.currentPlayingText || "Playing audio...");
  }, [audioPlayerHook.audioPlayerState, currentChatSession]);

  const isAudioBarVisible = !!(audioPlayerHook.audioPlayerState.currentMessageId || audioPlayerHook.audioPlayerState.isLoading || audioPlayerHook.audioPlayerState.isPlaying || audioPlayerHook.audioPlayerState.currentPlayingText);
  const showAutoSendControlsInUI = currentChatSession?.settings?.showAutoSendControls ?? DEFAULT_SETTINGS.showAutoSendControls ?? true;

  const handleGoToMessage = useCallback(() => {
    if (audioPlayerHook.audioPlayerState.currentMessageId && chatViewRef.current) {
      const baseMessageId = audioPlayerHook.audioPlayerState.currentMessageId.split('_part_')[0];
      chatViewRef.current.scrollToMessage(baseMessageId);
    }
  }, [audioPlayerHook.audioPlayerState.currentMessageId, chatViewRef]);


  if (isLoadingChatSessions) {
    return <div className="flex justify-center items-center h-screen bg-gray-900 text-white">Loading chat sessions...</div>;
  }

  return (
    <div className="flex h-screen antialiased text-gray-200 bg-gray-900 overflow-hidden">
      <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
        <Sidebar
          chatHistory={chatHistory} currentChatId={currentChatId}
          onNewChat={handleNewChat} onSelectChat={handleSelectChat} onDeleteChat={handleDeleteChat}
          onToggleSettings={appModals.openSettingsPanel}
          onOpenExportModal={appModals.openExportConfigurationModal}
          onAppImportAll={importExportHook.handleImportAll}
          onToggleCharacterMode={aiCharactersHook.handleToggleCharacterMode}
          isCurrentChatInCharacterMode={currentChatSession?.isCharacterModeActive}
          layoutDirection={layoutDirection} onToggleLayoutDirection={handleToggleLayoutDirection}
          editingTitleInfo={sidebarActionsHook.editingTitleInfo}
          onStartEditChatTitle={sidebarActionsHook.handleStartEditChatTitle}
          onSaveChatTitle={sidebarActionsHook.handleSaveChatTitle}
          onCancelEditChatTitle={sidebarActionsHook.handleCancelEditChatTitle}
          onEditTitleInputChange={sidebarActionsHook.handleEditTitleInputChange}
          onDuplicateChat={sidebarActionsHook.handleDuplicateChat}
        />
      </div>

      {isSidebarOpen && <div className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden" onClick={closeSidebar} aria-hidden="true" />}
      
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-72' : 'ml-0'}`}>
        {isAudioBarVisible && (
            <div className="sticky top-0 z-30 bg-gray-900"> {/* Added wrapper for sticky audio player */}
              <AdvancedAudioPlayer
                audioPlayerState={audioPlayerHook.audioPlayerState}
                onCloseView={audioControlsHook.handleClosePlayerViewOnly} 
                onSeekRelative={audioPlayerHook.seekRelative}
                onSeekToAbsolute={audioPlayerHook.seekToAbsolute}
                onTogglePlayPause={audioPlayerHook.togglePlayPause}
                currentMessageText={getFullTextForAudioBar()}
                onGoToMessage={handleGoToMessage}
                onIncreaseSpeed={audioPlayerHook.increaseSpeed} 
                onDecreaseSpeed={audioPlayerHook.decreaseSpeed} 
              />
            </div>
          )}
        <ChatView
          ref={chatViewRef}
          chatSession={currentChatSession || null}
          visibleMessages={visibleMessages}
          totalMessagesInSession={totalMessagesInSession}
          onSendMessage={(content, attachments, characterId, isTemporaryContext) => geminiHook.handleSendMessage(content, attachments, undefined, characterId, isTemporaryContext)}
          onContinueFlow={geminiHook.handleContinueFlow}
          isLoading={geminiHook.isLoading}
          currentGenerationTimeDisplay={geminiHook.currentGenerationTimeDisplay}
          messageGenerationTimes={messageGenerationTimes}
          isSidebarVisible={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          onCopyMessage={chatInteractionsHook.handleActualCopyMessage}
          onAttemptDeleteMessageAndHistory={appModals.requestDeleteConfirmation}
          onDeleteSingleMessage={chatInteractionsHook.handleDeleteSingleMessageOnly}
          onEditUserMessage={chatInteractionsHook.handleOpenEditMessagePanel}
          onEditModelMessage={chatInteractionsHook.handleOpenEditMessagePanel}
          onRegenerateAIMessage={geminiHook.handleRegenerateAIMessage}
          onRegenerateResponseForUserMessage={geminiHook.handleRegenerateResponseForUserMessage}
          onLoadMoreDisplayMessages={chatInteractionsHook.handleLoadMoreDisplayMessages}
          onLoadAllDisplayMessages={chatInteractionsHook.handleLoadAllDisplayMessages}
          onCancelGeneration={geminiHook.handleCancelGeneration}
          lastMessageHadAttachments={geminiHook.lastMessageHadAttachments}
          onOpenCharacterManagement={appModals.openCharacterManagementModal}
          onReorderCharacters={aiCharactersHook.handleReorderCharacters}
          logApiRequestCallback={geminiHook.logApiRequest}
          onPlayText={audioControlsHook.handlePlayTextForMessage}
          onStopPlayback={audioControlsHook.handleStopAndCancelAllForCurrentAudio} 
          audioPlayerState={audioPlayerHook.audioPlayerState}
          isApiFetchingThisSegment={audioPlayerHook.isApiFetchingThisSegment}
          onCancelApiFetchThisSegment={audioPlayerHook.cancelCurrentSegmentAudioLoad}
          getSegmentFetchError={audioControlsHook.getSegmentFetchError}
          isMainButtonMultiFetchingApi={audioControlsHook.isMainButtonMultiFetchingApi}
          onCancelMainButtonMultiFetchApi={audioControlsHook.handleCancelMultiPartFetch}
          onRequestResetAudioCacheConfirmation={appModals.requestResetAudioCacheConfirmation}
          isAutoFetchingSegment={() => false} 
          onCancelAutoFetchSegment={() => {}} 
          autoSendHook={{
            ...autoSendHook,
            isWaitingForErrorRetry: autoSendHook.isWaitingForErrorRetry,
            errorRetryCountdown: autoSendHook.errorRetryCountdown,
          }}
          showAutoSendControls={showAutoSendControlsInUI}
          onDownloadAudio={audioControlsHook.handleDownloadAudio}
          onManualSave={handleManualSave}
          onReUploadAttachment={chatInteractionsHook.handleReUploadAttachment}
          showToast={showToast}
        />
      </div>
       
      {currentChatSession && (
        <SettingsPanel
          isOpen={appModals.isSettingsPanelOpen}
          onClose={appModals.closeSettingsPanel}
          currentModel={currentChatSession.model}
          currentSettings={currentChatSession.settings}
          currentChatSessionMessages={currentChatSession.messages || []}
          onSettingsChange={handleSettingsChange}
          onMakeGlobalDefaultSettings={handleMakeGlobalDefaultSettings}
          onToggleDebugTerminal={() => { appModals.openDebugTerminal(); appModals.closeSettingsPanel(); }}
          hasApiLogs={(currentChatSession.apiRequestLogs || []).length > 0}
          onClearChatCache={chatInteractionsHook.handleClearChatCacheForCurrentSession}
          isCurrentChatInCharacterMode={currentChatSession.isCharacterModeActive}
          currentChatHasCharacters={!!(currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0)}
          showToast={showToast}
          onOpenExportConfigurationModal={() => { appModals.openExportConfigurationModal(); appModals.closeSettingsPanel(); }}
        />
      )}
      {appModals.isExportConfigModalOpen && (
        <ExportConfigurationModal
          isOpen={appModals.isExportConfigModalOpen}
          currentConfig={currentExportConfig}
          allChatSessions={chatHistory}
          onClose={appModals.closeExportConfigurationModal}
          onSaveConfig={handleSaveExportConfiguration}
          onExportSelected={handleInitiateExportWithSelected}
        />
      )}
      {currentChatSession && appModals.isTtsSettingsModalOpen && (
        <TtsSettingsModal
          isOpen={appModals.isTtsSettingsModalOpen}
          currentSettings={currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS}
          onClose={appModals.closeTtsSettingsModal}
          onApply={handleApplyTtsSettings}
        />
      )}
      {appModals.isEditPanelOpen && appModals.editingMessageDetail && (
        <EditMessagePanel
          isOpen={appModals.isEditPanelOpen}
          messageDetail={appModals.editingMessageDetail}
          isLoading={geminiHook.isLoading}
          onSubmit={chatInteractionsHook.handleEditPanelSubmitWrapper}
        />
      )}
      {currentChatSession && (
        <CharacterManagementModal
          isOpen={appModals.isCharacterManagementModalOpen}
          characters={currentChatSession.aiCharacters || []}
          onClose={appModals.closeCharacterManagementModal}
          onAddCharacter={handleAddCharacterWithToast}
          onEditCharacter={handleEditCharacterWithToast}
          onDeleteCharacter={handleDeleteCharacterWithToast}
          onOpenContextualInfoModal={appModals.openCharacterContextualInfoModal}
        />
      )}
       {currentChatSession && appModals.editingCharacterForContextualInfo && (
        <CharacterContextualInfoModal
          isOpen={appModals.isContextualInfoModalOpen}
          character={appModals.editingCharacterForContextualInfo}
          onClose={appModals.closeCharacterContextualInfoModal}
          onSave={aiCharactersHook.handleSaveCharacterContextualInfo}
        />
      )}
      {currentChatSession && currentChatSession.settings.debugApiRequests && (
        <DebugTerminalPanel
          isOpen={appModals.isDebugTerminalOpen}
          logs={currentChatSession.apiRequestLogs || []}
          onClose={appModals.closeDebugTerminal}
          onClearLogs={() => chatInteractionsHook.handleClearApiLogs(currentChatSession.id)}
          chatTitle={currentChatSession.title}
        />
      )}
      <ConfirmationModal
        isOpen={appModals.isDeleteConfirmationOpen}
        title="Confirm Deletion"
        message={<>Are you sure you want to delete this message and all <strong className="text-red-400">subsequent messages</strong> in this chat? <br/>This action cannot be undone.</>}
        confirmText="Yes, Delete" cancelText="No, Cancel"
        onConfirm={handleConfirmDelete} onCancel={appModals.cancelDeleteConfirmation}
        isDestructive={true}
      />
       <ConfirmationModal
        isOpen={appModals.isResetAudioConfirmationOpen}
        title="Confirm Audio Reset"
        message="Are you sure you want to reset the audio cache for this message? This action cannot be undone."
        confirmText="Yes, Reset Audio" cancelText="No, Cancel"
        onConfirm={handleConfirmResetAudioCache} onCancel={appModals.cancelResetAudioCacheConfirmation}
        isDestructive={true}
      />
      {toastInfo && <ToastNotification message={toastInfo.message} type={toastInfo.type} onClose={() => setToastInfo(null)} duration={toastInfo.duration} />}
    </div>
  );
};

export default App;
