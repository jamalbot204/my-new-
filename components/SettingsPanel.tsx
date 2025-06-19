import React, { useState, useEffect, useMemo } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { GeminiSettings, SafetySetting, TTSSettings } from '../types';
import { DEFAULT_SETTINGS, MODEL_DEFINITIONS, DEFAULT_MODEL_ID, DEFAULT_SAFETY_SETTINGS, INITIAL_MESSAGES_COUNT, DEFAULT_TTS_SETTINGS } from '../constants';
import { CloseIcon, ShieldCheckIcon, PencilIcon, MagnifyingGlassIcon, LinkIcon, BugAntIcon, ArrowPathIcon, SpeakerWaveIcon, CalculatorIcon, ExportBoxIcon, PlayIcon, BookOpenIcon } from './Icons';
import SafetySettingsModal from './SafetySettingsModal';
import InstructionEditModal from './InstructionEditModal';
import TtsSettingsModal from './TtsSettingsModal';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService';

// No more props needed!
const SettingsPanel: React.FC = () => {
    const chat = useChatContext();
    const ui = useUIContext();
    const { currentChatSession, updateChatSession, handleClearChatCacheForCurrentSession } = chat;

    const [localSettings, setLocalSettings] = useState<GeminiSettings>(currentChatSession?.settings || DEFAULT_SETTINGS);
    const [localModel, setLocalModel] = useState<string>(currentChatSession?.model || DEFAULT_MODEL_ID);
    const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
    const [isTtsModalOpen, setIsTtsModalOpen] = useState(false);
    const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
    const [editingInstructionType, setEditingInstructionType] = useState<'systemInstruction' | 'userPersonaInstruction' | null>(null);
    const [instructionModalContent, setInstructionModalContent] = useState('');

    useEffect(() => {
        if (ui.isSettingsPanelOpen && currentChatSession) {
            setLocalSettings(currentChatSession.settings);
            setLocalModel(currentChatSession.model);
        }
    }, [ui.isSettingsPanelOpen, currentChatSession]);

    const estimatedTokens = useMemo(() => {
        if (!currentChatSession?.messages || currentChatSession.messages.length === 0) return 0;
        const totalWords = currentChatSession.messages.reduce((sum, message) => {
            const words = message.content.trim().split(/\s+/).filter(Boolean).length;
            return sum + words;
        }, 0);
        return Math.round(totalWords * 1.5);
    }, [currentChatSession?.messages]);

    if (!ui.isSettingsPanelOpen || !currentChatSession) return null;

    const handleOpenInstructionModal = (type: 'systemInstruction' | 'userPersonaInstruction') => {
        setEditingInstructionType(type);
        setInstructionModalContent(localSettings[type] || '');
        setIsInstructionModalOpen(true);
    };

    const handleApplyInstructionChange = (newInstruction: string) => {
        if (editingInstructionType) {
            setLocalSettings(prev => ({ ...prev, [editingInstructionType]: newInstruction }));
        }
        setIsInstructionModalOpen(false);
        setEditingInstructionType(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (name === "model") {
            setLocalModel(value);
        } else if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setLocalSettings(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'urlContext') {
            setLocalSettings(prev => ({ ...prev, urlContext: value.split('\\n').map(url => url.trim()).filter(url => url) }));
        } else {
            setLocalSettings(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalSettings(prev => ({ ...prev, [name]: parseFloat(value) }));
    };

    const handleNumericInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        let numValue: number | undefined = parseInt(value, 10);
        if (isNaN(numValue) || value === '') {
            numValue = undefined;
        }
        setLocalSettings(prev => ({ ...prev, [name]: numValue }));
    };

    const handleSubmit = () => {
        updateChatSession(currentChatSession.id, session => session ? ({ ...session, settings: localSettings, model: localModel }) : null);
        ui.closeSettingsPanel();
    };
    
    const handleMakeDefaults = async () => {
        await dbService.setAppMetadata(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS, {
            model: localModel,
            settings: localSettings,
        });
        ui.showToast("Default settings saved!", "success");
    };

    const resetToDefaults = () => {
        setLocalSettings(DEFAULT_SETTINGS);
        setLocalModel(DEFAULT_MODEL_ID);
    };

    const handleApplySafetySettings = (newSafetySettings: SafetySetting[]) => {
        setLocalSettings(prev => ({ ...prev, safetySettings: newSafetySettings }));
        setIsSafetyModalOpen(false);
    };

    const handleApplyTtsSettings = (newTtsSettings: TTSSettings) => {
        setLocalSettings(prev => ({ ...prev, ttsSettings: newTtsSettings }));
        setIsTtsModalOpen(false);
    };

    const handleCustomizeExportClick = () => {
        ui.openExportConfigurationModal();
        ui.closeSettingsPanel();
    };

    const InstructionButton: React.FC<{
        label: string; value: string | undefined; onClick: () => void; placeholder: string;
    }> = ({ label, value, onClick, placeholder }) => (
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
            <button type="button" onClick={onClick} className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200 text-left flex justify-between items-center hover:bg-gray-600">
                <span className={`truncate ${value ? 'text-gray-200' : 'text-gray-400'}`}>{value ? (value.length > 60 ? value.substring(0, 60) + "..." : value) : placeholder}</span>
                <PencilIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
            </button>
        </div>
    );

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex justify-center items-center p-4 backdrop-blur-sm">
                <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto text-gray-200 relative ring-1 ring-gray-700">
                    <button onClick={ui.closeSettingsPanel} className="absolute top-3 right-3 text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700" aria-label="Close settings"><CloseIcon className="w-6 h-6" /></button>
                    <h2 className="text-2xl font-semibold mb-6 text-gray-100">Settings</h2>
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-1">Model</label>
                            <select id="model" name="model" className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200" value={localModel} onChange={handleInputChange}>
                                {MODEL_DEFINITIONS.map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}
                            </select>
                        </div>
                        <InstructionButton label="System Instruction (for AI)" value={localSettings.systemInstruction} onClick={() => handleOpenInstructionModal('systemInstruction')} placeholder="e.g., You are a helpful assistant." />
                        <InstructionButton label="User Persona Instruction (for AI to mimic user)" value={localSettings.userPersonaInstruction} onClick={() => handleOpenInstructionModal('userPersonaInstruction')} placeholder="e.g., I am a creative writer exploring narratives." />
                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center"><SpeakerWaveIcon className="w-5 h-5 mr-2 text-gray-400" /><h3 className="text-md font-medium text-gray-300">Text-to-Speech (TTS) settings</h3></div>
                                <button onClick={() => setIsTtsModalOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 flex items-center" aria-label="Configure Text-to-Speech settings">Configure <PencilIcon className="w-3 h-3 ml-1" /></button>
                            </div>
                            <p className="text-xs text-gray-400">Configure voice model and other TTS options.</p>
                        </div>
                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center"><ShieldCheckIcon className="w-5 h-5 mr-2 text-gray-400" /><h3 className="text-md font-medium text-gray-300">Safety settings</h3></div>
                                <button onClick={() => setIsSafetyModalOpen(true)} className="text-sm text-blue-400 hover:text-blue-300 flex items-center" aria-label="Edit Safety settings">Edit <PencilIcon className="w-3 h-3 ml-1" /></button>
                            </div>
                            <p className="text-xs text-gray-400">Adjust content filtering for harassment, hate speech, and other harmful content. These are overridden during 'Continue Flow' when AI mimics the user.</p>
                        </div>
                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center"><ExportBoxIcon className="w-5 h-5 mr-2 text-gray-400" /><h3 className="text-md font-medium text-gray-300">Export preferences</h3></div>
                                <button onClick={handleCustomizeExportClick} className="text-sm text-blue-400 hover:text-blue-300 flex items-center" aria-label="Customize export data">Customize & Export <PencilIcon className="w-3 h-3 ml-1" /></button>
                            </div>
                            <p className="text-xs text-gray-400">Choose chats and data to include when exporting.</p>
                        </div>
                        <div>
                            <label htmlFor="temperature" className="block text-sm font-medium text-gray-300">Temperature: {localSettings.temperature?.toFixed(2) ?? DEFAULT_SETTINGS.temperature?.toFixed(2)}</label>
                            <input type="range" id="temperature" name="temperature" min="0" max="2" step="0.01" className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-600" value={localSettings.temperature ?? DEFAULT_SETTINGS.temperature} onChange={handleRangeChange} />
                        </div>
                        <div>
                            <label htmlFor="topP" className="block text-sm font-medium text-gray-300">Top P: {localSettings.topP?.toFixed(2) ?? DEFAULT_SETTINGS.topP?.toFixed(2)}</label>
                            <input type="range" id="topP" name="topP" min="0" max="1" step="0.01" className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-600" value={localSettings.topP ?? DEFAULT_SETTINGS.topP} onChange={handleRangeChange} />
                        </div>
                        <div>
                            <label htmlFor="topK" className="block text-sm font-medium text-gray-300 mb-1">Top K</label>
                            <input type="number" id="topK" name="topK" min="1" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder={`Default: ${DEFAULT_SETTINGS.topK}`} value={localSettings.topK ?? ''} onChange={handleNumericInputChange} />
                        </div>
                        <div>
                            <label htmlFor="contextWindowMessages" className="block text-sm font-medium text-gray-300 mb-1">Context Window (Max Messages)</label>
                            <input type="number" id="contextWindowMessages" name="contextWindowMessages" min="0" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder="Default: All (0 or empty)" value={localSettings.contextWindowMessages ?? ''} onChange={handleNumericInputChange} />
                            <p className="text-xs text-gray-400 mt-1">Max number of recent messages sent as history. 0 or empty means all.</p>
                        </div>
                        <div>
                            <label htmlFor="maxInitialMessagesDisplayed" className="block text-sm font-medium text-gray-300 mb-1">Max Initial Messages Displayed</label>
                            <input type="number" id="maxInitialMessagesDisplayed" name="maxInitialMessagesDisplayed" min="1" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder={`Default: ${DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT}`} value={localSettings.maxInitialMessagesDisplayed ?? ''} onChange={handleNumericInputChange} />
                            <p className="text-xs text-gray-400 mt-1">Number of messages to show initially or when switching chats.</p>
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                            <div className="flex items-center">
                                <input id="aiSeesTimestamps" name="aiSeesTimestamps" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localSettings.aiSeesTimestamps ?? false} onChange={handleInputChange} />
                                <label htmlFor="aiSeesTimestamps" className="ml-2 block text-sm text-gray-300">Include message timestamps for AI</label>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 ml-6">If enabled, AI sees when each message was sent.</p>
                        </div>
                        <div>
                            <div className="flex items-center">
                                <input id="useGoogleSearch" name="useGoogleSearch" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localSettings.useGoogleSearch ?? false} onChange={handleInputChange} />
                                <label htmlFor="useGoogleSearch" className="ml-2 block text-sm text-gray-300 flex items-center"><MagnifyingGlassIcon className="w-4 h-4 mr-1.5 text-gray-400" />Use Google Search</label>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 ml-6">If enabled, AI can use Google Search to inform responses. May increase response time.</p>
                        </div>
                        <div>
                            <label htmlFor="urlContext" className="block text-sm font-medium text-gray-300 mb-1 flex items-center"><LinkIcon className="w-4 h-4 mr-1.5 text-gray-400" />URL Context (Optional - One per line)</label>
                            <textarea id="urlContext" name="urlContext" rows={3} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., https://example.com/article1\nhttps://example.com/article2" value={(localSettings.urlContext || []).join('\n')} onChange={handleInputChange} />
                            <p className="text-xs text-gray-400 mt-1">Provide URLs for the AI to consider as context. One URL per line.</p>
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                            <h3 className="text-md font-medium text-gray-300 mb-2 flex items-center"><CalculatorIcon className="w-5 h-5 mr-2 text-gray-400" />Session Statistics</h3>
                            <p className="text-sm text-gray-300">Estimated Tokens (Words * 1.5): <span className="font-semibold text-blue-400">{estimatedTokens}</span></p>
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                            <h3 className="text-md font-medium text-gray-300 mb-2">UI Customization</h3>
                            <div className="flex items-center">
                                <input id="showAutoSendControls" name="showAutoSendControls" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localSettings.showAutoSendControls ?? false} onChange={handleInputChange} />
                                <label htmlFor="showAutoSendControls" className="ml-2 block text-sm text-gray-300 flex items-center"><PlayIcon className="w-4 h-4 mr-1.5 text-gray-400" />Show Auto-Send Controls</label>
                            </div>
                            <div className="flex items-center mt-2">
                                <input id="showReadModeButton" name="showReadModeButton" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localSettings.showReadModeButton ?? false} onChange={handleInputChange} />
                                <label htmlFor="showReadModeButton" className="ml-2 block text-sm text-gray-300 flex items-center"><BookOpenIcon className="w-4 h-4 mr-1.5 text-gray-400" />Show "Read Mode" Button</label>
                            </div>
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                            <div className="flex items-center">
                                <input id="debugApiRequests" name="debugApiRequests" type="checkbox" className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800" checked={localSettings.debugApiRequests ?? false} onChange={handleInputChange} />
                                <label htmlFor="debugApiRequests" className="ml-2 block text-sm text-gray-300 flex items-center"><BugAntIcon className="w-4 h-4 mr-1.5 text-gray-400" />Enable API Request Logger</label>
                            </div>
                            {currentChatSession.settings.debugApiRequests && (
                                <button onClick={() => { ui.openDebugTerminal(); ui.closeSettingsPanel(); }} disabled={!(currentChatSession.apiRequestLogs && currentChatSession.apiRequestLogs.length > 0) && !localSettings.debugApiRequests} className="mt-2 flex items-center px-3 py-1.5 text-xs font-medium text-orange-300 bg-orange-600 bg-opacity-30 rounded-md hover:bg-opacity-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="View API Request Logs for this session">
                                    <BugAntIcon className="w-4 h-4 mr-1.5" />
                                    {currentChatSession.apiRequestLogs && currentChatSession.apiRequestLogs.length > 0 ? 'View API Logs' : (localSettings.debugApiRequests ? 'View API Logs (None Yet)' : 'Enable logging to view logs')}
                                </button>
                            )}
                        </div>
                        <div className="border-t border-gray-700 pt-4">
                            <h3 className="text-md font-medium text-gray-300 mb-2 flex items-center"><ArrowPathIcon className="w-5 h-5 mr-2 text-gray-400" />Cache Management</h3>
                            <button onClick={handleClearChatCacheForCurrentSession} type="button" className="w-full px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2" title={currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0 ? "Clears cache for all characters in this chat." : "Clears the model's cache for this chat."}>
                                <ArrowPathIcon className="w-4 h-4" /><span>{currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0 ? 'Clear All Characters Cache' : 'Clear Model Cache'}</span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-8 flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                        <button onClick={resetToDefaults} type="button" className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors w-full sm:w-auto">Reset to Defaults</button>
                        <button onClick={handleMakeDefaults} type="button" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors w-full sm:w-auto">Make Global Defaults</button>
                        <button onClick={handleSubmit} type="button" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors w-full sm:w-auto">Apply Settings</button>
                    </div>
                </div>
            </div>
            {isSafetyModalOpen && localSettings.safetySettings && (<SafetySettingsModal isOpen={isSafetyModalOpen} currentSafetySettings={localSettings.safetySettings} onClose={() => setIsSafetyModalOpen(false)} onApply={handleApplySafetySettings} />)}
            {isTtsModalOpen && localSettings.ttsSettings && (<TtsSettingsModal isOpen={isTtsModalOpen} currentSettings={localSettings.ttsSettings} onClose={() => setIsTtsModalOpen(false)} onApply={handleApplyTtsSettings} />)}
            {isInstructionModalOpen && editingInstructionType && (<InstructionEditModal isOpen={isInstructionModalOpen} title={editingInstructionType === 'systemInstruction' ? "Edit System Instruction" : "Edit User Persona Instruction"} currentInstruction={instructionModalContent} onApply={handleApplyInstructionChange} onClose={() => { setIsInstructionModalOpen(false); setEditingInstructionType(null); }} />)}
        </>
    );
};

export default SettingsPanel;