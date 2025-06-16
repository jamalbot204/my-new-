
import { useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatMessageRole, UseAutoFetchAudioOptions } from '../types';

export function useAutoFetchAudio(options: UseAutoFetchAudioOptions) {
  const {
    currentChatSession,
    audioControlsPlayText,
  } = options;

  const processedNewMessagesRef = useRef<Set<string>>(new Set());
  const autoPlayTimeoutRef = useRef<number | null>(null);

  // Ref to store the latest audioControlsPlayText function
  // This ensures that the function called by setTimeout is always the most recent version,
  // which will have closed over the most up-to-date currentChatSession from useAudioControls.
  const audioControlsPlayTextRef = useRef(audioControlsPlayText);
  useEffect(() => {
    audioControlsPlayTextRef.current = audioControlsPlayText;
  }, [audioControlsPlayText]);

  useEffect(() => {
    // Reset processed messages when chat session changes
    if (currentChatSession) {
        processedNewMessagesRef.current.clear();
    }
    // Clear any pending timeout when chat session changes or component unmounts
    return () => {
        if (autoPlayTimeoutRef.current) {
            clearTimeout(autoPlayTimeoutRef.current);
            autoPlayTimeoutRef.current = null;
        }
    };
  }, [currentChatSession?.id]);


  const triggerAutoFetchForNewMessage = useCallback(async (newAiMessage: ChatMessage) => {
    // The `currentChatSession` used for the initial checks is the one from the hook's props
    // at the time this `triggerAutoFetchForNewMessage` callback instance was created.
    if (!currentChatSession ||
        !currentChatSession.settings.ttsSettings?.autoFetchAudioEnabled ||
        newAiMessage.role !== ChatMessageRole.MODEL ||
        newAiMessage.isStreaming ||
        processedNewMessagesRef.current.has(newAiMessage.id)
       ) {
      return;
    }

    processedNewMessagesRef.current.add(newAiMessage.id);

    if (autoPlayTimeoutRef.current) {
        clearTimeout(autoPlayTimeoutRef.current);
    }

    autoPlayTimeoutRef.current = window.setTimeout(async () => {
        try {
            // Use the ref to call the latest version of audioControlsPlayText.
            await audioControlsPlayTextRef.current(newAiMessage.content, newAiMessage.id, undefined);
        } catch (error) {
            console.error(`[AutoPlay] Error trying to auto-play message ${newAiMessage.id}:`, error);
        } finally {
            autoPlayTimeoutRef.current = null;
        }
    }, 1000); // 1-second delay

  }, [currentChatSession]); // `audioControlsPlayText` is intentionally not in the dependency array here
                            // because `audioControlsPlayTextRef` handles accessing the latest version.
                            // `currentChatSession` is needed for the initial checks.

  return {
    triggerAutoFetchForNewMessage,
  };
}
