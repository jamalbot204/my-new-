
import React, { useRef, useEffect } from 'react';
import { ChatSession } from '../types';
import { PlusIcon, TrashIcon, CogIcon, ExportIcon, ImportIcon, APP_TITLE, UsersIcon, IconDirectionLtr, IconDirectionRtl, PencilIcon, CheckIcon, XCircleIcon, DocumentDuplicateIcon } from '../constants';

interface SidebarProps {
  chatHistory: ChatSession[];
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onToggleSettings: () => void;
  onOpenExportModal: () => void; // Changed from onAppExportAll
  onAppImportAll: () => void; 
  onToggleCharacterMode: () => void; 
  isCurrentChatInCharacterMode?: boolean; 
  layoutDirection: 'ltr' | 'rtl';
  onToggleLayoutDirection: () => void;
  // Props for inline title editing
  editingTitleInfo: { id: string | null; value: string };
  onStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
  onSaveChatTitle: () => void;
  onCancelEditChatTitle: () => void;
  onEditTitleInputChange: (newTitle: string) => void;
  onDuplicateChat: (sessionId: string) => void; 
}

const Sidebar: React.FC<SidebarProps> = ({
  chatHistory,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onToggleSettings,
  onOpenExportModal, // Changed from onAppExportAll
  onAppImportAll,
  onToggleCharacterMode,
  isCurrentChatInCharacterMode,
  layoutDirection,
  onToggleLayoutDirection,
  editingTitleInfo,
  onStartEditChatTitle,
  onSaveChatTitle,
  onCancelEditChatTitle,
  onEditTitleInputChange,
  onDuplicateChat,
}) => {
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitleInfo.id && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTitleInfo.id]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSaveChatTitle();
    } else if (e.key === 'Escape') {
      onCancelEditChatTitle();
    }
  };

  return (
    <div className="w-72 bg-gray-800 h-full flex flex-col border-r border-gray-700">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-100">{APP_TITLE}</h1>
        <button
          onClick={onToggleLayoutDirection}
          title={layoutDirection === 'rtl' ? "Switch to Left-to-Right" : "Switch to Right-to-Left"}
          className="p-1.5 text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={layoutDirection === 'rtl' ? "Switch to Left-to-Right layout" : "Switch to Right-to-Left layout"}
        >
          {layoutDirection === 'rtl' ? <IconDirectionLtr className="w-5 h-5" /> : <IconDirectionRtl className="w-5 h-5" />}
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex space-x-2">
            <button
            onClick={onNewChat}
            className="flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
            <PlusIcon className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" /> 
            New Chat
            </button>
            <button
                onClick={onToggleCharacterMode}
                disabled={!currentChatId} // Disable if no chat is selected
                title={isCurrentChatInCharacterMode ? "Disable Character Mode" : "Enable Character Mode"}
                className={`p-2.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-opacity-50
                            ${isCurrentChatInCharacterMode 
                                ? 'bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-500' 
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 focus:ring-gray-500'}
                            ${!currentChatId ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <UsersIcon className="w-5 h-5" />
            </button>
        </div>
        <div className="flex space-x-2 rtl:space-x-reverse">
            <button
                onClick={onOpenExportModal} // Changed from onAppExportAll
                title="Export Selected Chats"
                className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
            >
                <ExportIcon className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                Export
            </button>
            <button
                onClick={onAppImportAll}
                title="Import Chats"
                className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
            >
                <ImportIcon className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0" />
                Import
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">History</h2>
        {chatHistory.length === 0 && (
          <p className="text-sm text-gray-400 italic">No chats yet.</p>
        )}
        {chatHistory.map(session => (
          <div
            key={session.id}
            onClick={() => editingTitleInfo.id !== session.id && onSelectChat(session.id)}
            className={`flex items-center justify-between p-2.5 rounded-md group transition-colors
                        ${editingTitleInfo.id === session.id ? 'bg-gray-700 ring-1 ring-blue-500' : 
                         currentChatId === session.id ? 'bg-blue-500 bg-opacity-30 text-blue-300' : 
                         'text-gray-300 hover:bg-gray-700 cursor-pointer'}`}
          >
            <div className="flex items-center overflow-hidden flex-grow">
                {session.isCharacterModeActive && <UsersIcon className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0 text-purple-400 flex-shrink-0"/>}
                {editingTitleInfo.id === session.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingTitleInfo.value}
                    onChange={(e) => onEditTitleInputChange(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    onBlur={() => setTimeout(onCancelEditChatTitle, 100)} // Delay to allow save/cancel click
                    className="text-sm bg-gray-600 text-gray-100 rounded-sm px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    aria-label="Edit chat title"
                  />
                ) : (
                  <span className="truncate text-sm" title={session.title}>{session.title}</span>
                )}
            </div>
            <div className="flex items-center space-x-0.5 ml-2 rtl:mr-2 rtl:ml-0 flex-shrink-0"> {/* Reduced space-x-1 to space-x-0.5 or space-x-0 */}
              {editingTitleInfo.id === session.id ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSaveChatTitle(); }}
                    className="p-1 text-green-400 hover:text-green-300"
                    title="Save title"
                    aria-label="Save chat title"
                  >
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancelEditChatTitle(); }}
                    className="p-1 text-gray-400 hover:text-gray-200"
                    title="Cancel edit"
                    aria-label="Cancel editing chat title"
                  >
                    <XCircleIcon className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartEditChatTitle(session.id, session.title); }}
                    className="p-1 text-gray-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit title"
                    aria-label="Edit chat title"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicateChat(session.id); }}
                    className="p-1 text-gray-400 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Duplicate chat"
                    aria-label="Duplicate chat session"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
                    className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={onToggleSettings}
          className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <CogIcon className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
