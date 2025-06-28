import React, { useState, useRef } from 'react';
import { useApiKeyContext } from '../contexts/ApiKeyContext';
import { useUIContext } from '../contexts/UIContext';
import { ApiKey } from '../types';
import { PlusIcon, TrashIcon, CheckIcon, ChevronUpIcon, ChevronDownIcon, ChevronDoubleUpIcon, ChevronDoubleDownIcon } from './Icons';

// Sub-component for a single API key item
const ApiKeyItem: React.FC<{
  apiKey: ApiKey;
  isFirst: boolean;
  isLast: boolean;
  isKeyVisible: boolean;
  onUpdate: (id: string, name: string, value: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveToTop: (id: string) => void;
  onMoveToBottom: (id: string) => void;
}> = ({ apiKey, isFirst, isLast, isKeyVisible, onUpdate, onDelete, onMoveUp, onMoveDown, onMoveToTop, onMoveToBottom }) => {
  const { requestDeleteConfirmation } = useUIContext();

  const handleDeleteClick = () => {
    requestDeleteConfirmation(apiKey.id, 'api-key'); // Using messageId field for API key ID
  };
  
  const ReorderButton: React.FC<{ onClick: () => void, disabled: boolean, title: string, children: React.ReactNode }> = ({ onClick, disabled, title, children }) => (
    <button onClick={onClick} disabled={disabled} title={title} className="p-0.5 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
        {children}
    </button>
  );

  return (
    <div
      data-id={apiKey.id}
      className="flex items-center space-x-2 p-2 bg-black/20 rounded-md"
    >
      <div className="flex-shrink-0 w-5">
        {isFirst && <CheckIcon className="w-5 h-5 text-green-400" title="Active Key" />}
      </div>
      <input
        type="text"
        value={apiKey.name}
        onChange={(e) => onUpdate(apiKey.id, e.target.value, apiKey.value)}
        placeholder="Key Name (e.g., Main)"
        className="aurora-input text-sm p-1.5 w-32"
        aria-label="API Key Name"
      />
      <input
        type={isKeyVisible ? 'text' : 'password'}
        value={apiKey.value}
        onChange={(e) => onUpdate(apiKey.id, apiKey.name, e.target.value)}
        placeholder="Paste API Key Value"
        className="aurora-input text-sm p-1.5 flex-grow font-mono"
        aria-label="API Key Value"
      />
      <div className="flex items-center space-x-0.5">
        <ReorderButton onClick={() => onMoveToTop(apiKey.id)} disabled={isFirst} title="Move to Top">
            <ChevronDoubleUpIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={() => onMoveUp(apiKey.id)} disabled={isFirst} title="Move Up">
            <ChevronUpIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={() => onMoveDown(apiKey.id)} disabled={isLast} title="Move Down">
            <ChevronDownIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={() => onMoveToBottom(apiKey.id)} disabled={isLast} title="Move to Bottom">
            <ChevronDoubleDownIcon className="w-4 h-4" />
        </ReorderButton>
      </div>
      <button onClick={handleDeleteClick} title="Delete Key" className="p-1.5 text-red-500 hover:text-red-400">
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  );
};


const ApiKeyManager: React.FC = () => {
  const { apiKeys, isKeyVisible, addApiKey, updateApiKey, deleteApiKey, toggleKeyVisibility, moveKey, moveKeyToEdge } = useApiKeyContext();
  const { setIsDeleteConfirmationOpen, deleteTarget } = useUIContext();

  React.useEffect(() => {
    if (!deleteTarget || deleteTarget.messageId !== 'api-key') return;

    // A bit of a hack: The confirmation modal uses sessionId for the ID to delete.
    deleteApiKey(deleteTarget.sessionId); 
    // Reset the confirmation modal state in UIContext
    setIsDeleteConfirmationOpen(false);

  }, [deleteTarget, deleteApiKey, setIsDeleteConfirmationOpen]);
  
  const EyeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
  );
  
  const EyeOffIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75C20.27 7.61 16 4.5 12 4.5c-1.77 0-3.39.53-4.79 1.4L8.83 7.52C9.79 7.18 10.86 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L21.73 23 20.46 21.73 3.27 2 2 3.27zm4.54 4.79l3.08 3.08c-.05.33-.08.66-.08 1 0 1.66 1.34 3 3 3 .34 0 .67-.03 1-.08l3.08 3.08c-.92.44-1.93.7-2.99.7-4.54 0-8.3-2.9-9.82-5.18.96-1.56 2.4-2.87 4.1-3.78zM12 10.5c-1.18 0-2.24.53-2.92 1.33l1.58 1.58c.2-.07.4-.11.64-.11.83 0 1.5.67 1.5 1.5 0 .24-.04.48-.11.69l1.58 1.58c.8-.68 1.33-1.74 1.33-2.92 0-1.93-1.57-3.5-3.5-3.5z"/></svg>
  );

  return (
    <div className="border-t border-[var(--aurora-border)] pt-4">
      <h3 className="text-md font-medium text-gray-300 mb-2">API Key Management</h3>
      <div className="space-y-2">
        {apiKeys.map((key, index) => (
          <ApiKeyItem
            key={key.id}
            apiKey={key}
            isFirst={index === 0}
            isLast={index === apiKeys.length - 1}
            isKeyVisible={isKeyVisible}
            onUpdate={updateApiKey}
            onDelete={deleteApiKey}
            onMoveUp={() => moveKey(key.id, 'up')}
            onMoveDown={() => moveKey(key.id, 'down')}
            onMoveToTop={() => moveKeyToEdge(key.id, 'top')}
            onMoveToBottom={() => moveKeyToEdge(key.id, 'bottom')}
          />
        ))}
        {apiKeys.length === 0 && <p className="text-sm text-gray-400 italic">No API keys added.</p>}
      </div>
      <div className="mt-3 flex space-x-2">
        <button onClick={addApiKey} className="flex items-center px-3 py-2 text-xs font-medium text-white bg-blue-600/80 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(59,130,246,0.6)]">
          <PlusIcon className="w-4 h-4 mr-1.5" /> Add API Key
        </button>
        <button onClick={toggleKeyVisibility} title={isKeyVisible ? "Hide Keys" : "Show Keys"} className="p-2 text-gray-300 bg-white/5 rounded-md hover:text-white">
          {isKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
};

export default ApiKeyManager;