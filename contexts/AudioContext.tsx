import React, { createContext, useContext, useRef, ReactNode } from 'react';
import { AudioPlayerState } from '../types';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useAudioControls } from '../hooks/useAudioControls';
import { useChatContext } from './ChatContext';
import { useUIContext } from './UIContext';
import { useAutoFetchAudio } from '../hooks/useAutoFetchAudio';
import { splitTextForTts } from '../services/utils';
import { MAX_WORDS_PER_TTS_SEGMENT } from '../constants';

// Define the shape of the Audio context data
interface AudioContextType {
  audioPlayerState: AudioPlayerState;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (sessionId: string, messageId: string) => void;
  handleResetAudioCache: (sessionId: string, messageId: string) => void;
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
  triggerAutoFetchForNewMessage: (newAiMessage: import('../types').ChatMessage) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const chat = useChatContext();
  const ui = useUIContext();

  // A ref to hold the audio controls hook instance, allowing its methods to be accessed within callbacks
  const audioControlsHookRef = useRef<any>(null);

  const audioPlayer = useAudioPlayer({
    logApiRequest: (details) => chat.isLoading, // Simplified for now
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
    currentChatSession: chat.currentChatSession,
    updateChatSession: chat.updateChatSession,
    logApiRequest: (details) => chat.isLoading, // Simplified
    showToast: ui.showToast,
    audioPlayerHook: audioPlayer,
    requestResetAudioCacheConfirmationModal: ui.requestResetAudioCacheConfirmation,
    isAutoFetchingSegment: () => false,
    onCancelAutoFetchSegment: () => {},
  });
  
  // Update the ref with the latest instance of audioControls
  audioControlsHookRef.current = audioControls;

  const autoFetch = useAutoFetchAudio({
    currentChatSession: chat.currentChatSession,
    audioControlsPlayText: audioControls.handlePlayTextForMessage,
  });

  const value = {
    audioPlayerState: audioPlayer.audioPlayerState,
    handlePlayTextForMessage: audioControls.handlePlayTextForMessage,
    handleStopAndCancelAllForCurrentAudio: audioControls.handleStopAndCancelAllForCurrentAudio,
    handleClosePlayerViewOnly: audioControls.handleClosePlayerViewOnly,
    handleDownloadAudio: audioControls.handleDownloadAudio,
    handleResetAudioCache: audioControls.handleResetAudioCache,
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
    triggerAutoFetchForNewMessage: autoFetch.triggerAutoFetchForNewMessage,
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