
import { useState, useCallback, useRef } from 'react';
import { ChatSession, TTSSettings, AudioPlayerState, UseAudioPlayerReturn, LogApiRequestCallback, Attachment } from '../types'; // Adjusted paths
import { MAX_WORDS_PER_TTS_SEGMENT } from '../constants'; // Adjusted paths
import { generateSpeech } from '../services/ttsService'; // Adjusted paths
import { strictAbort } from '../services/cancellationService'; // Adjusted paths
import * as audioUtils from '../services/audioUtils'; // Adjusted paths
import { splitTextForTts, sanitizeFilename, triggerDownload } from '../services/utils'; // Updated imports

interface UseAudioControlsProps {
  currentChatSession: ChatSession | null;
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  logApiRequest: LogApiRequestCallback;
  showToast: (message: string, type?: 'success' | 'error') => void;
  audioPlayerHook: UseAudioPlayerReturn; // From useAudioPlayer
  requestResetAudioCacheConfirmationModal: (sessionId: string, messageId: string) => void; // From useAppModals
  isAutoFetchingSegment: (uniqueSegmentId: string) => boolean; 
  onCancelAutoFetchSegment: (uniqueSegmentId: string) => void; 
}

export function useAudioControls({
  currentChatSession,
  updateChatSession,
  logApiRequest,
  showToast,
  audioPlayerHook,
  requestResetAudioCacheConfirmationModal,
  isAutoFetchingSegment,
  onCancelAutoFetchSegment,
}: UseAudioControlsProps) {
  const multiPartFetchControllersRef = useRef<Map<string, AbortController>>(new Map());
  const [activeMultiPartFetches, setActiveMultiPartFetches] = useState<Set<string>>(new Set());

  const handleCacheAudioForMessageCallback = useCallback(async (uniqueSegmentId: string, audioBuffer: ArrayBuffer) => {
    if (!currentChatSession?.id) return;
    const parts = uniqueSegmentId.split('_part_');
    const baseMessageId = parts[0];
    const partIndex = parts.length > 1 ? parseInt(parts[1], 10) : 0;

    await updateChatSession(currentChatSession.id, (session) => {
        if (!session) return null;
        const messageIndex = session.messages.findIndex(m => m.id === baseMessageId);
        if (messageIndex === -1) return session;

        const updatedMessages = [...session.messages];
        const existingBuffers = updatedMessages[messageIndex].cachedAudioBuffers || [];
        
        const newBuffers = [...existingBuffers];
        while (newBuffers.length <= partIndex) {
          newBuffers.push(null);
        }
        newBuffers[partIndex] = audioBuffer;
        
        updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            cachedAudioBuffers: newBuffers,
        };
        return { ...session, messages: updatedMessages };
    });
  }, [currentChatSession?.id, updateChatSession]);

  const handleCancelMultiPartFetch = useCallback((baseMessageId: string) => {
    const controller = multiPartFetchControllersRef.current.get(baseMessageId);
    if (controller) {
      strictAbort(controller); 
      multiPartFetchControllersRef.current.delete(baseMessageId);
      setActiveMultiPartFetches(prev => {
        const next = new Set(prev);
        next.delete(baseMessageId);
        return next;
      });
      showToast("Multi-part audio fetch cancelled.", "success");
    }
  }, [showToast]);

  const handlePlayTextForMessage = useCallback(async (originalFullText: string, baseMessageId: string, partIndexToPlay?: number) => {
    const chat = currentChatSession;
    if (!chat || !chat.settings?.ttsSettings || !originalFullText.trim()) {
      showToast("TTS settings not configured, message empty, or chat not found.", "error");
      return;
    }
    const ttsSettings = chat.settings.ttsSettings;
    const message = chat.messages.find(m => m.id === baseMessageId);
    if (!message) return;

    const targetSegmentId = partIndexToPlay !== undefined ? `${baseMessageId}_part_${partIndexToPlay}` : baseMessageId;

    if (audioPlayerHook.audioPlayerState.currentMessageId && 
        audioPlayerHook.audioPlayerState.currentMessageId !== targetSegmentId
    ) {
        const currentAudioMsgId = audioPlayerHook.audioPlayerState.currentMessageId;
        const currentBaseId = currentAudioMsgId.split('_part_')[0];
        if (multiPartFetchControllersRef.current.has(currentBaseId)) {
            handleCancelMultiPartFetch(currentBaseId);
        }
        if (audioPlayerHook.isApiFetchingThisSegment(currentAudioMsgId)) {
            audioPlayerHook.cancelCurrentSegmentAudioLoad(currentAudioMsgId);
        }
        audioPlayerHook.stopPlayback(); 
    }

    const segmentIdForAutoFetchCheck = partIndexToPlay !== undefined ? `${baseMessageId}_part_${partIndexToPlay}` : `${baseMessageId}_part_0`;
    if (isAutoFetchingSegment(`autofetch_${segmentIdForAutoFetchCheck}`)) {
        onCancelAutoFetchSegment(`autofetch_${segmentIdForAutoFetchCheck}`);
    }
    
    const maxWords = ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
    const textSegments = splitTextForTts(originalFullText, maxWords);
    const numExpectedSegments = textSegments.length;

    const allPartsAreCached = message.cachedAudioBuffers &&
                             message.cachedAudioBuffers.length === numExpectedSegments &&
                             message.cachedAudioBuffers.every(buffer => !!buffer);

    if (partIndexToPlay !== undefined) { // Specific part button clicked (play individual part)
        const textSegmentToPlayNow = textSegments[partIndexToPlay];
        if (!textSegmentToPlayNow) return;
        const uniqueSegmentId = `${baseMessageId}_part_${partIndexToPlay}`;
        const cachedBuffer = message.cachedAudioBuffers?.[partIndexToPlay];
        audioPlayerHook.playText(textSegmentToPlayNow, uniqueSegmentId, ttsSettings, cachedBuffer);
    } else { // Main button clicked (partIndexToPlay is undefined)
      const needsApiFetchForMainPlay = 
        (numExpectedSegments > 1 && !allPartsAreCached) ||
        (numExpectedSegments === 1 && !message.cachedAudioBuffers?.[0]);

      if (needsApiFetchForMainPlay) {
        // This block handles fetching for:
        // 1. Multi-part messages where not all parts are cached.
        // 2. Single-part messages where the single part is not cached.

        if (multiPartFetchControllersRef.current.has(baseMessageId)) {
            // Rapid clicks while already fetching this base message; let existing fetch complete or be cancelled.
            return; 
        }

        const controller = new AbortController();
        multiPartFetchControllersRef.current.set(baseMessageId, controller);
        setActiveMultiPartFetches(prev => new Set(prev).add(baseMessageId));
        
        const partsToFetchCount = (numExpectedSegments === 1) ? 1 : numExpectedSegments;
        showToast(`Fetching ${partsToFetchCount} audio part${partsToFetchCount > 1 ? 's' : ''}...`, "success");

        try {
            const indicesToProcess = (numExpectedSegments === 1) ? [0] : textSegments.map((_,idx) => idx);

            const results = await Promise.allSettled(
                indicesToProcess.map(async (index) => {
                    if (controller.signal.aborted) throw new DOMException('Aborted by user', 'AbortError');
                    
                    // For multi-part, if we are in this fetch block, it means not all are cached.
                    // The original behavior was to re-fetch all segments for consistency. We maintain this.
                    // For single part, it means its only segment is not cached, so fetch it.
                    const audioBuffer = await generateSpeech(textSegments[index], ttsSettings, logApiRequest, controller.signal);
                    if (controller.signal.aborted) throw new DOMException('Aborted by user', 'AbortError');
                    return { status: 'fulfilled', value: audioBuffer, index };
                })
            );

            if (controller.signal.aborted) {
                 showToast("Audio fetch cancelled.", "success");
                 return; 
            }

            const newBuffers: (ArrayBuffer | null)[] = [...(message.cachedAudioBuffers || [])];
            while(newBuffers.length < numExpectedSegments) newBuffers.push(null);

            let allSucceeded = true;
            results.forEach((result) => {
                if (result.status === 'fulfilled' && result.value?.value) {
                    newBuffers[result.value.index] = result.value.value as ArrayBuffer;
                } else {
                    allSucceeded = false;
                    const failedIndex = result.status === 'rejected' ? (result.reason as any)?.index ?? indicesToProcess.find(i => !(results as any).find((r: any) => r.value?.index === i)) ?? 'unknown' : (result.value as any)?.index ?? 'unknown';
                    console.error(`Failed to fetch audio for part ${typeof failedIndex === 'number' ? failedIndex + 1 : failedIndex}:`, result.status === 'rejected' ? result.reason : 'Unknown error during segment fetch');
                    if (typeof failedIndex === 'number') {
                        newBuffers[failedIndex] = null; 
                    }
                }
            });

            await updateChatSession(chat.id, (session) => {
                if (!session) return null;
                const msgIndex = session.messages.findIndex(m => m.id === baseMessageId);
                if (msgIndex === -1) return session;
                const updatedMessages = [...session.messages];
                updatedMessages[msgIndex] = { ...updatedMessages[msgIndex], cachedAudioBuffers: newBuffers };
                return { ...session, messages: updatedMessages };
            });

            if (allSucceeded) {
                showToast("Audio fetched and ready. Click play again.", "success");
            } else {
                showToast("Some audio parts failed to fetch. Check console.", "error");
            }

        } catch (error: any) {
            if (error.name !== 'AbortError') { // AbortError is handled by the cancellation UI
                console.error("Error during main button audio fetch:", error);
                showToast("Failed to fetch audio: " + error.message, "error");
            }
        } finally {
            if (multiPartFetchControllersRef.current.get(baseMessageId) === controller) {
                multiPartFetchControllersRef.current.delete(baseMessageId);
            }
            setActiveMultiPartFetches(prev => { const next = new Set(prev); next.delete(baseMessageId); return next; });
        }

      } else { // Main button clicked, AND ( (single-part AND cached) OR (multi-part AND all cached) )
          // Play the first part if all parts are cached or if it's a single cached part.
          const textToPlay = textSegments[0] || ""; 
          let uniqueSegmentIdForPlayer = baseMessageId;
          if (numExpectedSegments > 1) { 
              uniqueSegmentIdForPlayer = `${baseMessageId}_part_0`;
          }
          const cachedBuffer = message.cachedAudioBuffers?.[0];
          audioPlayerHook.playText(textToPlay, uniqueSegmentIdForPlayer, ttsSettings, cachedBuffer);
      }
    }
  }, [currentChatSession, showToast, logApiRequest, audioPlayerHook, updateChatSession, isAutoFetchingSegment, onCancelAutoFetchSegment, handleCancelMultiPartFetch]);


  const handleStopAndCancelAllForCurrentAudio = useCallback(() => {
    const currentAudioMessageId = audioPlayerHook.audioPlayerState.currentMessageId;
    if (currentAudioMessageId) {
        const baseMessageId = currentAudioMessageId.split('_part_')[0];
        if (multiPartFetchControllersRef.current.has(baseMessageId)) {
            handleCancelMultiPartFetch(baseMessageId);
        }
        if (audioPlayerHook.isApiFetchingThisSegment(currentAudioMessageId)) {
            audioPlayerHook.cancelCurrentSegmentAudioLoad(currentAudioMessageId);
        }
    }
    audioPlayerHook.stopPlayback(); 
  }, [audioPlayerHook, handleCancelMultiPartFetch]);

  const handleClosePlayerViewOnly = useCallback(() => {
    audioPlayerHook.clearPlayerViewAndStopAudio(); 
  }, [audioPlayerHook]);


  const handleDownloadAudio = useCallback(async (sessionId: string, messageId: string) => {
    const chat = currentChatSession; 
    const message = chat?.messages.find(m => m.id === messageId);

    if (!chat || !message || !message.content.trim() || !chat.settings.ttsSettings) {
        showToast("Cannot download audio: message or TTS settings not found.", "error");
        return;
    }
    
    const maxWords = chat.settings.ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
    const textSegments = splitTextForTts(message.content, maxWords);
    const numExpectedParts = textSegments.length;
    const allPartsAreCached = message.cachedAudioBuffers &&
                             message.cachedAudioBuffers.length === numExpectedParts &&
                             message.cachedAudioBuffers.every(buffer => !!buffer);

    if (!allPartsAreCached) {
        showToast("Audio not fully ready for download. Ensure all parts are fetched.", "error");
        return;
    }

    const desiredMimeType = 'audio/mpeg';
    const fileExtension = '.mp3';

    const words = message.content.trim().split(/\s+/);
    const firstWords = words.slice(0, 7).join(' ');
    const baseName = sanitizeFilename(firstWords, 50);
    const uniqueIdSuffix = message.id.substring(message.id.length - 6);
    const finalFilename = `${baseName || 'audio'}_${uniqueIdSuffix}${fileExtension}`;

    const combinedPcm = audioUtils.concatenateAudioBuffers(message.cachedAudioBuffers!.filter(b => b !== null) as ArrayBuffer[]);
    if (combinedPcm.byteLength === 0) {
        showToast("No audio data to download.", "error");
        return;
    }
    const audioBlob = audioUtils.createAudioFileFromPcm(combinedPcm, desiredMimeType);
    triggerDownload(audioBlob, finalFilename); 
    showToast("Audio download started.", "success");
  }, [currentChatSession, showToast]);
  
  const handleResetAudioCache = useCallback((sessionId: string, messageId: string) => {
    requestResetAudioCacheConfirmationModal(sessionId, messageId);
  }, [requestResetAudioCacheConfirmationModal]);

  return {
    handlePlayTextForMessage,
    handleCancelMultiPartFetch,
    handleStopAndCancelAllForCurrentAudio, 
    handleClosePlayerViewOnly, 
    handleDownloadAudio,
    handleResetAudioCache,
    activeMultiPartFetches, 
    isMainButtonMultiFetchingApi: (baseId: string) => activeMultiPartFetches.has(baseId),
    handleCacheAudioForMessageCallback, 
    getSegmentFetchError: audioPlayerHook.getSegmentFetchError, 
  };
}
