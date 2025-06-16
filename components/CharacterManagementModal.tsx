
import React, { useState, useEffect } from 'react';
import { AICharacter } from '../types';
import { CloseIcon, PencilIcon, TrashIcon, InfoIcon } from '../constants';

interface CharacterManagementModalProps {
  isOpen: boolean;
  characters: AICharacter[];
  onClose: () => void;
  onAddCharacter: (name: string, systemInstruction: string) => void;
  onEditCharacter: (id: string, name: string, systemInstruction: string) => void;
  onDeleteCharacter: (id: string) => void;
  onOpenContextualInfoModal: (character: AICharacter) => void;
}

const CharacterManagementModal: React.FC<CharacterManagementModalProps> = ({
  isOpen, characters, onClose, onAddCharacter, onEditCharacter, onDeleteCharacter, onOpenContextualInfoModal
}) => {
  const [editingCharacter, setEditingCharacter] = useState<AICharacter | null>(null);
  const [newCharName, setNewCharName] = useState('');
  const [newCharInstruction, setNewCharInstruction] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditingCharacter(null);
      setNewCharName('');
      setNewCharInstruction('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (editingCharacter) {
      onEditCharacter(editingCharacter.id, newCharName, newCharInstruction);
    } else {
      onAddCharacter(newCharName, newCharInstruction);
    }
    setNewCharName('');
    setNewCharInstruction('');
    setEditingCharacter(null);
  };
  
  const startEdit = (char: AICharacter) => {
    setEditingCharacter(char);
    setNewCharName(char.name);
    setNewCharInstruction(char.systemInstruction);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold">Manage Characters</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-100 rounded-full hover:bg-gray-700"><CloseIcon /></button>
        </div>

        <div className="mb-6 space-y-3 overflow-y-auto pr-2 flex-grow min-h-0">
            {characters.length === 0 && <p className="text-gray-400 italic">No characters defined yet.</p>}
            {characters.map(char => (
                <div key={char.id} className="p-3 bg-gray-700 rounded-md flex justify-between items-center">
                    <div>
                        <p className="font-medium">{char.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-xs" title={char.systemInstruction}>{char.systemInstruction}</p>
                    </div>
                    <div className="flex space-x-1.5">
                        <button onClick={() => onOpenContextualInfoModal(char)} className="p-1.5 text-sky-400 hover:text-sky-300" title="Edit Contextual Info"><InfoIcon className="w-4 h-4"/></button>
                        <button onClick={() => startEdit(char)} className="p-1.5 text-blue-400 hover:text-blue-300" title="Edit Character"><PencilIcon className="w-4 h-4"/></button>
                        <button onClick={() => onDeleteCharacter(char.id)} className="p-1.5 text-red-400 hover:text-red-300" title="Delete Character"><TrashIcon className="w-4 h-4"/></button>
                    </div>
                </div>
            ))}
        </div>
        
        <div className="border-t border-gray-700 pt-4 flex-shrink-0">
          <h3 className="text-lg font-medium mb-2">{editingCharacter ? 'Edit Character' : 'Add New Character'}</h3>
          <input 
            type="text" 
            placeholder="Character Name (e.g., Wizard)" 
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
            className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md mb-3 text-gray-200 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Character Name"
          />
          <textarea 
            placeholder="Personality & Role (System Instruction)"
            value={newCharInstruction}
            onChange={(e) => setNewCharInstruction(e.target.value)}
            rows={4}
            className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md mb-3 text-gray-200 focus:ring-blue-500 focus:border-blue-500 hide-scrollbar resize-none"
            aria-label="Character Personality and Role"
          />
          <div className="flex justify-end space-x-2">
            {editingCharacter && <button onClick={() => { setEditingCharacter(null); setNewCharName(''); setNewCharInstruction('');}} className="px-4 py-2 text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel Edit</button>}
            <button 
                onClick={handleSave} 
                disabled={!newCharName.trim() || !newCharInstruction.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
            >
                {editingCharacter ? 'Save Changes' : 'Add Character'}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded-md">Close</button>
        </div>
      </div>
    </div>
  );
};

export default CharacterManagementModal;
