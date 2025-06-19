import React, { useState, useEffect } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { ChatMessageRole, Attachment } from '../types';
import { CloseIcon, SparklesIcon, UserIcon, SaveDiskIcon } from './Icons';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea';

export enum EditMessagePanelAction {
  CANCEL = 'cancel',
  SAVE_LOCALLY = 'save_locally',
  SAVE_AND_SUBMIT = 'save_and_submit',
  CONTINUE_PREFIX = 'continue_prefix',
}

export interface EditMessagePanelDetails {
  sessionId: string;
  messageId: string;
  originalContent: string;
  role: ChatMessageRole;
  attachments?: Attachment[];
}

// No props are needed anymore!
const EditMessagePanel: React.FC = () => {
  const { isLoading, handleEditPanelSubmit, handleCancelGeneration } = useChatContext();
  const ui = useUIContext();
  const { isEditPanelOpen, editingMessageDetail, closeEditPanel } = ui;

  const [editedContent, setEditedContent] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(editedContent, 300);

  useEffect(() => {
    if (isEditPanelOpen && editingMessageDetail) {
      setEditedContent(editingMessageDetail.originalContent);
    }
  }, [isEditPanelOpen, editingMessageDetail]);

  useEffect(() => {
    if (isEditPanelOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditPanelOpen, textareaRef]);

  if (!isEditPanelOpen || !editingMessageDetail) return null;

  const handlePanelSubmitWrapper = (action: EditMessagePanelAction) => {
    handleEditPanelSubmit(action, editedContent, editingMessageDetail as any);
  };
  
  const panelTitle = editingMessageDetail.role === ChatMessageRole.USER ? "Edit User Message" : "Edit AI Response";
  const IconComponent = editingMessageDetail.role === ChatMessageRole.USER ? UserIcon : SparklesIcon;

  const baseButtonClass = "px-4 py-2.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800";
  const cancelButtonClass = `${baseButtonClass} text-gray-300 bg-gray-600 hover:bg-gray-500 focus:ring-gray-500`;
  const saveLocallyButtonClass = `${baseButtonClass} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
  const continuePrefixButtonClass = `${baseButtonClass} text-white bg-teal-600 hover:bg-teal-700 focus:ring-teal-500`;
  const saveSubmitButtonClass = `${baseButtonClass} text-white bg-green-600 hover:bg-green-700 focus:ring-green-500`;

  const XCircleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
  const SubmitPlayIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>);
  const ContinueArrowIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex justify-center items-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-message-panel-title">
      <div className="bg-gray-800 p-5 sm:p-6 rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <IconComponent className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-gray-400" />
            <h2 id="edit-message-panel-title" className="text-lg sm:text-xl font-semibold text-gray-100">{panelTitle}</h2>
          </div>
          <button onClick={() => handlePanelSubmitWrapper(EditMessagePanelAction.CANCEL)} className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700 disabled:opacity-50" aria-label="Close edit panel" disabled={isLoading && editingMessageDetail.role === ChatMessageRole.MODEL} >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
        <textarea ref={textareaRef} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="w-full flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none hide-scrollbar text-sm sm:text-base leading-relaxed" placeholder="Enter message content..." style={{ minHeight: '200px' }} disabled={isLoading && editingMessageDetail.role === ChatMessageRole.MODEL} aria-label="Message content editor" />
        {editingMessageDetail.attachments && editingMessageDetail.attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-1.5">Attachments (read-only in edit mode):</p>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto hide-scrollbar">
                {editingMessageDetail.attachments.map(att => (
                    <span key={att.id} className="text-xs bg-gray-600 px-2 py-1 rounded-full" title={att.name}>{att.name}</span>
                ))}
                </div>
            </div>
        )}
        <div className="mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => handlePanelSubmitWrapper(EditMessagePanelAction.CANCEL)} className={cancelButtonClass} disabled={isLoading && editingMessageDetail.role === ChatMessageRole.MODEL} aria-label="Cancel edits"><XCircleIcon className="w-4 h-4 mr-1.5" /> Cancel</button>
          <button onClick={() => handlePanelSubmitWrapper(EditMessagePanelAction.SAVE_LOCALLY)} className={saveLocallyButtonClass} disabled={isLoading || editedContent.trim() === editingMessageDetail.originalContent.trim()} aria-label="Save changes locally"><SaveDiskIcon className="w-4 h-4 mr-1.5"/>Save Locally</button>
          <button onClick={() => handlePanelSubmitWrapper(EditMessagePanelAction.CONTINUE_PREFIX)} className={continuePrefixButtonClass} disabled={isLoading || editedContent.trim() === ''} aria-label="Continue prefix with AI">
            {isLoading && editingMessageDetail.role === ChatMessageRole.MODEL ? (<svg className="animate-spin h-4 w-4 mr-1.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : <ContinueArrowIcon className="w-4 h-4 mr-1.5"/>}
            {isLoading && editingMessageDetail.role === ChatMessageRole.MODEL ? 'Continuing...' : 'Continue Prefix'}
          </button>
          <button onClick={() => handlePanelSubmitWrapper(EditMessagePanelAction.SAVE_AND_SUBMIT)} className={saveSubmitButtonClass} disabled={isLoading || editedContent.trim() === ''} aria-label="Save changes and submit for AI response"><SubmitPlayIcon className="w-4 h-4 mr-1.5"/>Save & Submit</button>
        </div>
      </div>
    </div>
  );
};

export default EditMessagePanel;