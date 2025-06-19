import React, { useState, useEffect, useMemo } from 'react';
import { ChatSession, ExportConfiguration } from '../types';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { DEFAULT_EXPORT_CONFIGURATION } from '../constants';
import { CloseIcon, CheckIcon, ArrowPathIcon, UsersIcon, DocumentDuplicateIcon } from './Icons';

// No props are needed anymore!
const ExportConfigurationModal: React.FC = () => {
  const chat = useChatContext();
  const ui = useUIContext();

  const [localConfig, setLocalConfig] = useState<ExportConfiguration>(chat.currentExportConfig);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (ui.isExportConfigModalOpen) {
      setLocalConfig(chat.currentExportConfig);
      // By default, select all chats when modal opens if some chats exist
      setSelectedChatIds(chat.chatHistory.length > 0 ? chat.chatHistory.map(s => s.id) : []);
      setSearchTerm('');
    }
  }, [ui.isExportConfigModalOpen, chat.currentExportConfig, chat.chatHistory]);

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return chat.chatHistory;
    return chat.chatHistory.filter(session =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chat.chatHistory, searchTerm]);

  if (!ui.isExportConfigModalOpen) return null;

  const handleToggleChange = (id: keyof ExportConfiguration, checked: boolean) => {
    setLocalConfig(prev => ({ ...prev, [id]: checked }));
  };

  const handleChatSelectionChange = (chatId: string) => {
    setSelectedChatIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const handleSelectAllChats = () => {
    setSelectedChatIds(filteredSessions.map(s => s.id));
  };

  const handleDeselectAllChats = () => {
    setSelectedChatIds([]);
  };

  const handleSaveCurrentConfig = () => {
    chat.setCurrentExportConfig(localConfig);
    ui.showToast("Export preferences saved!", "success");
  };
  
  const handleInitiateExport = () => {
    if (selectedChatIds.length === 0) {
      alert("Please select at least one chat to export.");
      return;
    }
    chat.handleExportChats(localConfig, selectedChatIds);
    ui.closeExportConfigurationModal();
  };

  const handleResetConfigDefaults = () => {
    setLocalConfig(DEFAULT_EXPORT_CONFIGURATION);
  };
  
  const renderCategoryHeader = (title: string, icon?: React.ReactNode) => (
    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider pt-3 pb-1 border-b border-gray-700 mb-1 flex items-center">
      {icon && <span className="mr-2">{icon}</span>}
      {title}
    </h4>
  );

  const isCoreDataDisabled = !localConfig.includeChatSessionsAndMessages;
  
  const ToggleOption: React.FC<{
    id: keyof ExportConfiguration;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (id: keyof ExportConfiguration, checked: boolean) => void;
    indented?: boolean;
    warning?: string;
    disabled?: boolean;
  }> = ({ id, label, description, checked, onChange, indented, warning, disabled }) => (
    <div className={`py-2.5 ${indented ? 'pl-6' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id={id}
            name={id}
            type="checkbox"
            className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-500 rounded bg-gray-700 disabled:cursor-not-allowed"
            checked={checked}
            onChange={(e) => !disabled && onChange(id, e.target.checked)}
            disabled={disabled}
          />
        </div>
        <div className="ml-3 text-sm">
          <label htmlFor={id} className={`font-medium ${disabled ? 'text-gray-500' : 'text-gray-200'}`}>{label}</label>
          {description && <p className={`text-xs ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{description}</p>}
          {warning && <p className="text-xs text-yellow-400 mt-0.5">{warning}</p>}
        </div>
      </div>
    </div>
  );


  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-2 sm:p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-config-modal-title"
    >
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-xl w-full sm:max-w-3xl max-h-[95vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="export-config-modal-title" className="text-xl font-semibold text-gray-100">Export Chats & Preferences</h2>
          <button
            onClick={ui.closeExportConfigurationModal}
            className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
            aria-label="Close export configuration"
          >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-1 sm:pr-2 space-y-3">
          <div className="mb-4">
            {renderCategoryHeader("Select Chats to Export", <DocumentDuplicateIcon className="w-4 h-4" />)}
            {chat.chatHistory.length > 0 ? (
              <>
                <input
                  type="text"
                  placeholder="Search chats by title..."
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md mb-2 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">{selectedChatIds.length} of {filteredSessions.length} chat(s) selected.</span>
                  <div className="space-x-2">
                    <button onClick={handleSelectAllChats} className="text-xs text-blue-400 hover:text-blue-300">Select All Visible</button>
                    <button onClick={handleDeselectAllChats} className="text-xs text-blue-400 hover:text-blue-300">Deselect All</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-md p-2 space-y-1 bg-gray-900/30">
                  {filteredSessions.map(session => (
                    <div key={session.id} className="flex items-center p-1.5 hover:bg-gray-700/50 rounded-md">
                      <input
                        type="checkbox"
                        id={`export-chat-${session.id}`}
                        checked={selectedChatIds.includes(session.id)}
                        onChange={() => handleChatSelectionChange(session.id)}
                        className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <label htmlFor={`export-chat-${session.id}`} className="ml-2 text-sm text-gray-300 truncate cursor-pointer flex items-center">
                        {session.isCharacterModeActive && <UsersIcon className="w-3.5 h-3.5 mr-1.5 text-purple-400 flex-shrink-0"/>}
                        {session.title}
                      </label>
                    </div>
                  ))}
                  {filteredSessions.length === 0 && <p className="text-sm text-gray-500 italic text-center py-2">No chats match your search.</p>}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">No chats available to export.</p>
            )}
          </div>

          <div className="divide-y divide-gray-700/50">
            {renderCategoryHeader("Data Inclusion Preferences")}
            <ToggleOption id="includeChatSessionsAndMessages" label="Chat Sessions & Messages" description="Master toggle for all chat content. If off, most options below will be irrelevant for selected chats." checked={localConfig.includeChatSessionsAndMessages} onChange={handleToggleChange} />
            <ToggleOption id="includeMessageContent" label="Message Content" description="The text of user and AI messages." checked={localConfig.includeMessageContent} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageTimestamps" label="Message Timestamps" checked={localConfig.includeMessageTimestamps} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageRoleAndCharacterNames" label="Message Role & Character Names" checked={localConfig.includeMessageRoleAndCharacterNames} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageAttachmentsMetadata" label="Message Attachments (Metadata Only)" description="Includes file name, type, size, and cloud URI (if applicable). No actual file content." checked={localConfig.includeMessageAttachmentsMetadata} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeFullAttachmentFileData" label="Full Attachment File Data (Base64/DataURI)" description="Embeds actual file content for non-cloud attachments or if originally present. Not applicable for File API uploads (they use metadata only)." warning="Warning: This can significantly increase export file size." checked={localConfig.includeFullAttachmentFileData} onChange={handleToggleChange} indented disabled={isCoreDataDisabled || !localConfig.includeMessageAttachmentsMetadata} />
            <ToggleOption id="includeCachedMessageAudio" label="Cached Message Audio (TTS)" description="Embeds Text-to-Speech audio generated and cached for messages." warning="Warning: This will increase export file size." checked={localConfig.includeCachedMessageAudio} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeGroundingMetadata" label="Grounding Metadata (Search Sources)" checked={localConfig.includeGroundingMetadata} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />

            {renderCategoryHeader("Chat-Specific Settings")}
            <ToggleOption id="includeChatSpecificSettings" label="Chat-Specific Settings" description="Model, temperature, safety settings, TTS settings, etc., for each selected chat session." checked={localConfig.includeChatSpecificSettings} onChange={handleToggleChange} disabled={isCoreDataDisabled} />

            {renderCategoryHeader("AI Character Definitions")}
            <ToggleOption id="includeAiCharacterDefinitions" label="AI Character Definitions" description="Names, system instructions, and contextual info for all AI characters within selected chats." checked={localConfig.includeAiCharacterDefinitions} onChange={handleToggleChange} disabled={isCoreDataDisabled} />
            
            {renderCategoryHeader("API Request Logs")}
            <ToggleOption id="includeApiLogs" label="API Request Logs" description="Verbose request/response logs for debugging (if logging was enabled for the chat)." warning="Warning: Can make the export file very large." checked={localConfig.includeApiLogs} onChange={handleToggleChange} disabled={isCoreDataDisabled} />

            {renderCategoryHeader("Global Application State")}
            <ToggleOption id="includeLastActiveChatId" label="Last Active Chat ID (as of export)" description="The ID of the chat that was last open when the export was created." checked={localConfig.includeLastActiveChatId} onChange={handleToggleChange} />
            <ToggleOption id="includeMessageGenerationTimes" label="Message Generation Times" description="Performance data: how long AI messages took to generate." checked={localConfig.includeMessageGenerationTimes} onChange={handleToggleChange} />
            <ToggleOption id="includeUiConfiguration" label="UI Configuration (Messages to Display)" description="Per-chat setting for how many messages are initially shown." checked={localConfig.includeUiConfiguration} onChange={handleToggleChange} />
            <ToggleOption id="includeUserDefinedGlobalDefaults" label="User-Defined Global Default Settings" description="Your saved default model, temperature, safety settings, etc." checked={localConfig.includeUserDefinedGlobalDefaults} onChange={handleToggleChange} />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-gray-700 flex-shrink-0 space-y-3 sm:space-y-0">
          <button onClick={handleResetConfigDefaults} type="button" className="px-3 py-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors flex items-center sm:w-auto w-full justify-center"><ArrowPathIcon className="w-3.5 h-3.5 mr-1.5" /> Reset Preferences</button>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
            <button onClick={ui.closeExportConfigurationModal} type="button" className="px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors w-full sm:w-auto">Cancel</button>
            <button onClick={handleSaveCurrentConfig} type="button" className="px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center w-full sm:w-auto"><CheckIcon className="w-4 h-4 mr-1.5" /> Save Preferences</button>
            <button onClick={handleInitiateExport} type="button" disabled={selectedChatIds.length === 0} className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"><DocumentDuplicateIcon className="w-4 h-4 mr-1.5" /> Export Selected ({selectedChatIds.length})</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportConfigurationModal;