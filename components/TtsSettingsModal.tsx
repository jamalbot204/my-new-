import React, { useState, useEffect } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { TTSSettings, TTSModelId, TTSVoiceId } from '../types';
import { DEFAULT_TTS_SETTINGS, MAX_WORDS_PER_TTS_SEGMENT } from '../constants';
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
      setLocalTtsSettings(currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS);
    }
  }, [isTtsSettingsModalOpen, currentChatSession]);

  if (!isTtsSettingsModalOpen || !currentChatSession) return null;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, model: e.target.value as TTSModelId }));
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, voice: e.target.value as TTSVoiceId }));
  };
  
  const handleAutoFetchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, autoFetchAudioEnabled: e.target.checked }));
  };

  const handleMaxWordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setLocalTtsSettings(prev => ({
      ...prev,
      maxWordsPerSegment: isNaN(value) ? DEFAULT_TTS_SETTINGS.maxWordsPerSegment : Math.max(50, Math.min(1000, value)) 
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
      <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
        <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Text-to-Speech Settings</h2>
            <button
              onClick={closeTtsSettingsModal}
              className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
              aria-label="Close TTS settings"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-5 mb-6 overflow-y-auto flex-grow pr-1">
            <div>
              <label htmlFor="tts-model" className="block text-sm font-medium text-gray-300 mb-1">TTS Model</label>
              <select id="tts-model" name="tts-model" className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200" value={localTtsSettings.model} onChange={handleModelChange}>
                {TTS_MODELS.map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="tts-voice" className="block text-sm font-medium text-gray-300 mb-1">Voice</label>
              <select id="tts-voice" name="tts-voice" className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200" value={localTtsSettings.voice} onChange={handleVoiceChange}>
                {TTS_VOICES.map(voice => (<option key={voice.id} value={voice.id}>{voice.name} ({voice.description})</option>))}
              </select>
              <p className="text-xs text-gray-400 mt-1">The availability of voices may vary by model and language.</p>
            </div>
            <div>
              <label htmlFor="tts-max-words" className="block text-sm font-medium text-gray-300 mb-1">Max Words Per TTS Segment</label>
              <input type="number" id="tts-max-words" name="tts-max-words" className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200" value={localTtsSettings.maxWordsPerSegment || ''} onChange={handleMaxWordsChange} min="50" max="1000" step="10" placeholder={`Default: ${DEFAULT_TTS_SETTINGS.maxWordsPerSegment}`} />
              <p className="text-xs text-gray-400 mt-1">Defines how long each audio segment will be (50-1000 words).</p>
            </div>
            <div className="border-t border-gray-700 pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">System Instruction (for TTS Model)</label>
              <button type="button" onClick={handleOpenInstructionModal} className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200 text-left flex justify-between items-center hover:bg-gray-600">
                <span className={`truncate ${localTtsSettings.systemInstruction ? 'text-gray-200' : 'text-gray-400'}`} title={localTtsSettings.systemInstruction || systemInstructionPlaceholder}>{localTtsSettings.systemInstruction ? (localTtsSettings.systemInstruction.length > 40 ? localTtsSettings.systemInstruction.substring(0, 40) + "..." : localTtsSettings.systemInstruction) : systemInstructionPlaceholder}</span>
                <PencilIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </button>
              <p className="text-xs text-gray-400 mt-1">Provide guidance to the TTS model on tone, style, or persona. (Optional)</p>
            </div>
            <div className="border-t border-gray-700 pt-4">
              <div className="flex items-center">
                <input id="autoFetchAudioEnabled" name="autoFetchAudioEnabled" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localTtsSettings.autoFetchAudioEnabled ?? false} onChange={handleAutoFetchChange} />
                <label htmlFor="autoFetchAudioEnabled" className="ml-2 block text-sm text-gray-300">Auto-Play New AI Messages</label>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-6">If enabled, new AI messages will automatically start playing after a short delay.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <button onClick={handleResetDefaults} type="button" className="px-4 py-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">Reset to Defaults</button>
            <div className="flex space-x-3">
              <button onClick={closeTtsSettingsModal} type="button" className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors w-full sm:w-auto">Cancel</button>
              <button onClick={handleApplySettings} type="button" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors w-full sm:w-auto">Apply TTS Settings</button>
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