import React, { useState, useEffect } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { AICharacter } from '../types';
import { CloseIcon } from './Icons';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea';

// No props are needed anymore!
const CharacterContextualInfoModal: React.FC = () => {
  const { handleSaveCharacterContextualInfo } = useChatContext();
  const { isContextualInfoModalOpen, editingCharacterForContextualInfo, closeCharacterContextualInfoModal } = useUIContext();
  
  const [infoText, setInfoText] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(infoText, 250);

  useEffect(() => {
    if (isContextualInfoModalOpen && editingCharacterForContextualInfo) {
      setInfoText(editingCharacterForContextualInfo.contextualInfo || '');
    }
  }, [isContextualInfoModalOpen, editingCharacterForContextualInfo]);

  useEffect(() => {
    if (isContextualInfoModalOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isContextualInfoModalOpen, textareaRef]);

  if (!isContextualInfoModalOpen || !editingCharacterForContextualInfo) return null;

  const handleSave = () => {
    handleSaveCharacterContextualInfo(editingCharacterForContextualInfo.id, infoText);
    closeCharacterContextualInfoModal();
  };
  
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInfoText(e.target.value);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contextual-info-modal-title"
    >
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="contextual-info-modal-title" className="text-xl font-semibold">Contextual Info for <span className="text-purple-400">{editingCharacterForContextualInfo.name}</span></h2>
          <button onClick={closeCharacterContextualInfoModal} className="p-1 text-gray-400 hover:text-gray-100 rounded-full hover:bg-gray-700" aria-label="Close contextual info editor"><CloseIcon /></button>
        </div>
        
        <p className="text-sm text-gray-400 mb-3">
          This text will be used as a prompt if the main chat input is empty when this character speaks.
          It will <strong className="text-gray-300">not</strong> be saved in the chat history or resent with subsequent messages.
        </p>

        <textarea
          ref={textareaRef}
          placeholder={`Enter contextual prompt for ${editingCharacterForContextualInfo.name}... (e.g., "Describe your current surroundings and mood.")`}
          value={infoText}
          onChange={handleTextChange}
          rows={8}
          className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md mb-4 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hide-scrollbar resize-y flex-grow"
          style={{ minHeight: '150px' }}
          aria-label={`Contextual information for ${editingCharacterForContextualInfo.name}`}
        />
        <div className="flex justify-end space-x-3 flex-shrink-0">
          <button onClick={closeCharacterContextualInfoModal} className="px-4 py-2 text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md">
            Save Info
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterContextualInfoModal;