

import React, { useState, useEffect } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { TTSSettings, TTSModelId, TTSVoiceId } from '../types';
import { DEFAULT_TTS_SETTINGS } from '../constants';
import { CloseIcon, PencilIcon } from './Icons';
import { TTS_MODELS, TTS_VOICES } from '../constants';
import InstructionEditModal from './InstructionEditModal';

// No props are needed anymore!
const TtsSettingsModal: React.FC = () => {
  const { currentChatSession, updateChatSession } = useChatContext();
  const { isTtsSettingsModalOpen, closeTtsSettingsModal } = useUIContext();

  const [localTtsSettings, setLocalTtsSettings] = useState<TTSSettings>(currentChatSession?.settings.ttsSettings || DEFAULT_TTS_SETTINGS);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);

  useEffect(() => {
    if (isTtsSettingsModalOpen && currentChatSession) {
      // Ensure that maxWordsPerSegment is correctly initialized (it can be undefined)
      const currentMaxWords = currentChatSession.settings.ttsSettings?.maxWordsPerSegment;
      setLocalTtsSettings({
        ...(currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS),
        maxWordsPerSegment: currentMaxWords, // Explicitly set, allowing undefined
      });
    }
  }, [isTtsSettingsModalOpen, currentChatSession]);

  if (!isTtsSettingsModalOpen || !currentChatSession) return null;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, model: e.target.value as TTSModelId }));
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, voice: e.target.value as TTSVoiceId }));
  };
  
  const handleAutoPlayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, autoPlayNewMessages: e.target.checked }));
  };

  const handleMaxWordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valueString = e.target.value;
    if (valueString === '') {
        setLocalTtsSettings(prev => ({
            ...prev,
            maxWordsPerSegment: undefined // Empty means no limit
        }));
        return;
    }
    const value = parseInt(valueString, 10);
    setLocalTtsSettings(prev => ({
      ...prev,
      // Only positive integers are valid limits, otherwise no limit (undefined)
      maxWordsPerSegment: (Number.isInteger(value) && value > 0) ? value : undefined
    }));
  };

  const handleOpenInstructionModal = () => {
    setIsInstructionModalOpen(true);
  };

  const handleApplyInstructionChange = (newInstruction: string) => {
    setLocalTtsSettings(prev => ({ ...prev, systemInstruction: newInstruction }));
    setIsInstructionModalOpen(false);
  };

  const handleApplySettings = () => {
    updateChatSession(currentChatSession.id, session => session ? ({
        ...session,
        settings: { ...session.settings, ttsSettings: localTtsSettings }
    }) : null);
    closeTtsSettingsModal();
  };
  
  const handleResetDefaults = () => {
    setLocalTtsSettings(DEFAULT_TTS_SETTINGS);
  };

  const systemInstructionPlaceholder = "e.g., Speak in a calm and informative tone.";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md">
        <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Text-to-Speech Settings</h2>
            <button
              onClick={closeTtsSettingsModal}
              className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
              aria-label="Close TTS settings"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-5 mb-6 overflow-y-auto flex-grow pr-1">
            <div>
              <label htmlFor="tts-model" className="block text-sm font-medium text-gray-300 mb-1">TTS Model</label>
              <select id="tts-model" name="tts-model" className="w-full p-2.5 aurora-select" value={localTtsSettings.model} onChange={handleModelChange}>
                {TTS_MODELS.map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="tts-voice" className="block text-sm font-medium text-gray-300 mb-1">Voice</label>
              <select id="tts-voice" name="tts-voice" className="w-full p-2.5 aurora-select" value={localTtsSettings.voice} onChange={handleVoiceChange}>
                {TTS_VOICES.map(voice => (<option key={voice.id} value={voice.id}>{voice.name} ({voice.description})</option>))}
              </select>
              <p className="text-xs text-gray-400 mt-1">The availability of voices may vary by model and language.</p>
            </div>
            <div>
              <label htmlFor="tts-max-words" className="block text-sm font-medium text-gray-300 mb-1">Max Words Per TTS Segment</label>
              <input 
                type="number" 
                id="tts-max-words" 
                name="tts-max-words" 
                className="w-full p-2.5 aurora-input" 
                value={localTtsSettings.maxWordsPerSegment ?? ''} 
                onChange={handleMaxWordsChange} 
                step="10" 
                placeholder="Default: No split, or enter number" 
              />
              <p className="text-xs text-gray-400 mt-1">Defines max words per audio segment. Empty or invalid number for no split. Positive number to set limit.</p>
            </div>
            <div className="border-t border-[var(--aurora-border)] pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">System Instruction (for TTS Model)</label>
              <button type="button" onClick={handleOpenInstructionModal} className="w-full p-2.5 aurora-input text-left flex justify-between items-center transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]">
                <span className={`truncate ${localTtsSettings.systemInstruction ? 'text-gray-200' : 'text-gray-400'}`} title={localTtsSettings.systemInstruction || systemInstructionPlaceholder}>{localTtsSettings.systemInstruction ? (localTtsSettings.systemInstruction.length > 40 ? localTtsSettings.systemInstruction.substring(0, 40) + "..." : localTtsSettings.systemInstruction) : systemInstructionPlaceholder}</span>
                <PencilIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </button>
              <p className="text-xs text-gray-400 mt-1">Provide guidance to the TTS model on tone, style, or persona. (Optional)</p>
            </div>
            <div className="border-t border-[var(--aurora-border)] pt-4">
              <div className="flex items-center">
                <input id="autoPlayNewMessages" name="autoPlayNewMessages" type="checkbox" className="h-4 w-4 text-blue-600 bg-black/30 border-white/20 rounded focus:ring-blue-500 focus:ring-offset-black" checked={localTtsSettings.autoPlayNewMessages ?? false} onChange={handleAutoPlayChange} />
                <label htmlFor="autoPlayNewMessages" className="ml-2 block text-sm text-gray-300">Auto-Play New AI Messages</label>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-6">If enabled, new AI messages will automatically start playing after a short delay.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <button onClick={handleResetDefaults} type="button" className="px-4 py-2 text-sm font-medium text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)]">Reset to Defaults</button>
            <div className="flex space-x-3">
              <button onClick={closeTtsSettingsModal} type="button" className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] w-full sm:w-auto">Cancel</button>
              <button onClick={handleApplySettings} type="button" className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] w-full sm:w-auto">Apply TTS Settings</button>
            </div>
          </div>
        </div>
      </div>
      {isInstructionModalOpen && (
        <InstructionEditModal
          isOpen={isInstructionModalOpen}
          title="Edit TTS System Instruction"
          currentInstruction={localTtsSettings.systemInstruction || ''}
          onApply={handleApplyInstructionChange}
          onClose={() => setIsInstructionModalOpen(false)}
        />
      )}
    </>
  );
};

export default TtsSettingsModal;