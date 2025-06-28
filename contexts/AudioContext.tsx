



import React, { createContext, useContext, useRef, ReactNode, useEffect, useCallback } from 'react';
import { AudioPlayerState, ChatMessage } from '../types'; // Added ChatMessage
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useAudioControls } from '../hooks/useAudioControls';
import { useChatContext } from './ChatContext';
import { useUIContext } from './UIContext';
import { useAutoPlay } from '../hooks/useAutoPlay'; // Import the new hook
import { splitTextForTts } from '../services/utils';
import { MAX_WORDS_PER_TTS_SEGMENT } from '../constants';
import { useApiKeyContext } from './ApiKeyContext';

// Define the shape of the Audio context data
interface AudioContextType {
  audioPlayerState: AudioPlayerState;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (sessionId: string, messageId: string, userProvidedName?: string) => void;
  handleResetAudioCache: (sessionId: string, messageId: string) => void;
  handleResetAudioCacheForMultipleMessages: (messageIds: string[]) => Promise<void>;
  isMainButtonMultiFetchingApi: (baseId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  onCancelApiFetchThisSegment: (uniqueSegmentId: string) => void;
  handleCancelMultiPartFetch: (baseMessageId: string) => void;
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const chat = useChatContext();
  const ui = useUIContext();
  const { activeApiKey } = useApiKeyContext();
  const apiKey = activeApiKey?.value || '';

  const audioControlsHookRef = useRef<any>(null);

  const audioPlayer = useAudioPlayer({
    apiKey: apiKey,
    logApiRequest: (details) => chat.isLoading, 
    onCacheAudio: (id, buffer) => audioControlsHookRef.current?.handleCacheAudioForMessageCallback(id, buffer),
    onAutoplayNextSegment: async (baseMessageId, playedPartIndex) => {
      const currentChat = chat.currentChatSession;
      if (!currentChat || !currentChat.settings?.ttsSettings) return;
      const message = currentChat.messages.find(m => m.id === baseMessageId);
      if (!message) return;
      const maxWords = currentChat.settings.ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
      const allTextSegments = splitTextForTts(message.content, maxWords);
      const nextPartIndex = playedPartIndex + 1;
      if (nextPartIndex < allTextSegments.length) {
        const nextTextSegment = allTextSegments[nextPartIndex];
        const nextUniqueSegmentId = `${baseMessageId}_part_${nextPartIndex}`;
        const nextCachedBuffer = message.cachedAudioBuffers?.[nextPartIndex];
        audioPlayer.playText(nextTextSegment, nextUniqueSegmentId, currentChat.settings.ttsSettings, nextCachedBuffer);
      }
    },
  });

  const audioControls = useAudioControls({
    apiKey: apiKey,
    currentChatSession: chat.currentChatSession,
    updateChatSession: chat.updateChatSession,
    logApiRequest: (details) => chat.isLoading, 
    showToast: ui.showToast,
    audioPlayerHook: audioPlayer,
    requestResetAudioCacheConfirmationModal: ui.requestResetAudioCacheConfirmation,
    isAutoFetchingSegment: () => false,
    onCancelAutoFetchSegment: () => {},
  });
  
  audioControlsHookRef.current = audioControls;

  const autoPlay = useAutoPlay({
    currentChatSession: chat.currentChatSession,
    playFunction: audioControls.handlePlayTextForMessage,
  });
  
  // Connect the ChatContext's triggerAutoPlayForNewMessage to the one from useAutoPlay
  // This ensures that useGemini (via ChatContext) calls the auto-play logic defined in AudioProvider.
  useEffect(() => {
    if (chat && (chat as any).triggerAutoPlayForNewMessage !== autoPlay.triggerAutoPlayForNewMessage) {
      (chat as any).triggerAutoPlayForNewMessage = autoPlay.triggerAutoPlayForNewMessage;
    }
  }, [chat, autoPlay.triggerAutoPlayForNewMessage]);

  const handleResetAudioCacheForMultipleMessages = useCallback(async (messageIds: string[]) => {
    if (!chat.currentChatSession || messageIds.length === 0) return;
    
    // Stop audio if any of the selected messages are playing
    const anyPlaying = messageIds.some(id => audioPlayer.audioPlayerState.currentMessageId?.startsWith(id));
    if (anyPlaying) {
      audioPlayer.stopPlayback();
    }

    await chat.updateChatSession(chat.currentChatSession.id, session => {
        if (!session) return null;
        const idSet = new Set(messageIds);
        const newMessages = session.messages.map(m => 
            idSet.has(m.id) ? { ...m, cachedAudioBuffers: null } : m
        );
        return { ...session, messages: newMessages };
    });

    ui.showToast(`Audio cache reset for ${messageIds.length} message(s).`, "success");
    ui.toggleSelectionMode(); // This also clears selection
  }, [chat.currentChatSession, chat.updateChatSession, audioPlayer, ui.showToast, ui.toggleSelectionMode]);


  const value = {
    audioPlayerState: audioPlayer.audioPlayerState,
    handlePlayTextForMessage: audioControls.handlePlayTextForMessage,
    handleStopAndCancelAllForCurrentAudio: audioControls.handleStopAndCancelAllForCurrentAudio,
    handleClosePlayerViewOnly: audioControls.handleClosePlayerViewOnly,
    handleDownloadAudio: audioControls.handleDownloadAudio,
    handleResetAudioCache: audioControls.handleResetAudioCache,
    handleResetAudioCacheForMultipleMessages,
    isMainButtonMultiFetchingApi: audioControls.isMainButtonMultiFetchingApi,
    getSegmentFetchError: audioPlayer.getSegmentFetchError,
    isApiFetchingThisSegment: audioPlayer.isApiFetchingThisSegment,
    onCancelApiFetchThisSegment: audioPlayer.cancelCurrentSegmentAudioLoad,
    handleCancelMultiPartFetch: audioControls.handleCancelMultiPartFetch,
    seekRelative: audioPlayer.seekRelative,
    seekToAbsolute: audioPlayer.seekToAbsolute,
    togglePlayPause: audioPlayer.togglePlayPause,
    increaseSpeed: audioPlayer.increaseSpeed,
    decreaseSpeed: audioPlayer.decreaseSpeed,
    triggerAutoPlayForNewMessage: autoPlay.triggerAutoPlayForNewMessage, // Provide from new hook
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudioContext = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudioContext must be used within an AudioProvider');
  }
  return context;
};