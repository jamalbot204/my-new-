import React, { useRef, useCallback, useState } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { useAudioContext } from '../contexts/AudioContext';

import Sidebar from './Sidebar';
import ChatView, { ChatViewHandles } from './ChatView';
import SettingsPanel from './SettingsPanel';
import EditMessagePanel from './EditMessagePanel';
import CharacterManagementModal from './CharacterManagementModal';
import CharacterContextualInfoModal from './CharacterContextualInfoModal';
import DebugTerminalPanel from './DebugTerminalPanel';
import ConfirmationModal from './ConfirmationModal';
import ToastNotification from './ToastNotification';
import TtsSettingsModal from './TtsSettingsModal';
import AdvancedAudioPlayer from './AdvancedAudioPlayer';
import ExportConfigurationModal from './ExportConfigurationModal';
import ReadModeView from './ReadModeView';

const AppContent: React.FC = () => {
  const chat = useChatContext();
  const ui = useUIContext();
  const audio = useAudioContext();
  const chatViewRef = useRef<ChatViewHandles>(null);

  const [isReadModeOpen, setIsReadModeOpen] = useState(false);
  const [readModeContent, setReadModeContent] = useState('');

  const handleEnterReadMode = (content: string) => {
    setReadModeContent(content);
    setIsReadModeOpen(true);
  };

  const handleCloseReadMode = () => {
    setIsReadModeOpen(false);
    setReadModeContent('');
  };

  const handleGoToMessage = useCallback(() => {
    if (audio.audioPlayerState.currentMessageId && chatViewRef.current) {
      const baseMessageId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
      chatViewRef.current.scrollToMessage(baseMessageId);
    }
  }, [audio.audioPlayerState.currentMessageId, chatViewRef]);

  const getFullTextForAudioBar = useCallback(() => {
    if (!audio.audioPlayerState.currentMessageId || !chat.currentChatSession) return audio.audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
    const message = chat.currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audio.audioPlayerState.currentPlayingText || "Playing audio...");
  }, [audio.audioPlayerState, chat.currentChatSession]);

  const isAudioBarVisible = !!(audio.audioPlayerState.currentMessageId || audio.audioPlayerState.isLoading || audio.audioPlayerState.isPlaying || audio.audioPlayerState.currentPlayingText);
  
  if (chat.isLoadingData) {
    return <div className="flex justify-center items-center h-screen bg-gray-900 text-white">Loading chat sessions...</div>;
  }

  // Notice how clean this return statement is! No more prop drilling.
  return (
    <div className="flex h-screen antialiased text-gray-200 bg-gray-900 overflow-hidden">
      <div className={`fixed inset-y-0 left-0 z-[60] transform transition-transform duration-300 ease-in-out ${ui.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
        <Sidebar />
      </div>

      {ui.isSidebarOpen && <div className="fixed inset-0 z-30 bg-black bg-opacity-50 md:hidden" onClick={ui.closeSidebar} aria-hidden="true" />}
      
      <main className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${ui.isSidebarOpen ? 'md:ml-72' : 'ml-0'} ${isAudioBarVisible ? 'pt-[76px]' : ''}`}>
        <ChatView ref={chatViewRef} onEnterReadMode={handleEnterReadMode} />
      </main>
      
      <div className='absolute'>
        {isAudioBarVisible && (
            <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${ui.isSidebarOpen ? 'md:left-72' : 'left-0'}`}>
              <AdvancedAudioPlayer
                audioPlayerState={audio.audioPlayerState}
                onCloseView={audio.handleClosePlayerViewOnly} 
                onSeekRelative={audio.seekRelative}
                onSeekToAbsolute={audio.seekToAbsolute}
                onTogglePlayPause={audio.togglePlayPause}
                currentMessageText={getFullTextForAudioBar()}
                onGoToMessage={handleGoToMessage}
                onIncreaseSpeed={audio.increaseSpeed} 
                onDecreaseSpeed={audio.decreaseSpeed} 
              />
            </div>
        )}

        <ReadModeView isOpen={isReadModeOpen} content={readModeContent} onClose={handleCloseReadMode} />
        
        <SettingsPanel />
        <ExportConfigurationModal />
        <TtsSettingsModal />
        <EditMessagePanel />
        <CharacterManagementModal />
        <CharacterContextualInfoModal />
        <DebugTerminalPanel />

        <ConfirmationModal
          isOpen={ui.isDeleteConfirmationOpen}
          title="Confirm Deletion"
          message={<>Are you sure you want to delete this message and all <strong className="text-red-400">subsequent messages</strong> in this chat? <br/>This action cannot be undone.</>}
          confirmText="Yes, Delete" cancelText="No, Cancel"
          onConfirm={() => { 
            if(ui.deleteTarget) chat.handleDeleteMessageAndSubsequent(ui.deleteTarget.sessionId, ui.deleteTarget.messageId); 
            ui.cancelDeleteConfirmation(); 
          }} 
          onCancel={ui.cancelDeleteConfirmation}
          isDestructive={true}
        />
        <ConfirmationModal
          isOpen={ui.isResetAudioConfirmationOpen}
          title="Confirm Audio Reset"
          message="Are you sure you want to reset the audio cache for this message? This action cannot be undone."
          confirmText="Yes, Reset Audio" cancelText="No, Cancel"
          onConfirm={() => { 
            if(ui.resetAudioTarget) audio.handleResetAudioCache(ui.resetAudioTarget.sessionId, ui.resetAudioTarget.messageId); 
            ui.cancelResetAudioCacheConfirmation(); 
          }} 
          onCancel={ui.cancelResetAudioCacheConfirmation}
          isDestructive={true}
        />
        {ui.toastInfo && <ToastNotification message={ui.toastInfo.message} type={ui.toastInfo.type} onClose={() => ui.setToastInfo(null)} duration={ui.toastInfo.duration} />}
      </div>
    </div>
  );
};

export default AppContent;