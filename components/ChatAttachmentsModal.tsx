import React from 'react';
import { AttachmentWithContext, ChatMessageRole } from '../types';
import { CloseIcon, DocumentIcon, PlayCircleIcon, ArrowUturnLeftIcon, UserIcon, SparklesIcon } from './Icons'; // Assuming Sparkles for AI
import { getDisplayFileType } from '../services/utils';
import RefreshAttachmentButton from './RefreshAttachmentButton'; // Import the button
import { useChatContext } from '../contexts/ChatContext'; // Import chat context

interface ChatAttachmentsModalProps {
  isOpen: boolean;
  attachments: AttachmentWithContext[];
  chatTitle: string;
  onClose: () => void;
  onGoToMessage: (messageId: string) => void;
}

const ChatAttachmentsModal: React.FC<ChatAttachmentsModalProps> = ({
  isOpen,
  attachments,
  chatTitle,
  onClose,
  onGoToMessage,
}) => {
  const chat = useChatContext(); // Get chat context

  if (!isOpen) return null;

  const getFileIcon = (item: AttachmentWithContext) => {
    const { attachment } = item;
    if (attachment.dataUrl && attachment.mimeType.startsWith('image/')) {
      return <img src={attachment.dataUrl} alt={attachment.name} className="w-10 h-10 object-cover rounded-md" />;
    }
    if (attachment.dataUrl && attachment.mimeType.startsWith('video/')) {
      return <PlayCircleIcon className="w-10 h-10 text-gray-400" />;
    }
    return <DocumentIcon className="w-10 h-10 text-gray-400" />;
  };
  
  const getRoleIcon = (role: ChatMessageRole) => {
    if (role === ChatMessageRole.USER) return <UserIcon className="w-3 h-3 text-blue-400" />;
    if (role === ChatMessageRole.MODEL) return <SparklesIcon className="w-3 h-3 text-purple-400" />;
    return null;
  };


  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-attachments-modal-title"
    >
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="chat-attachments-modal-title" className="text-xl font-semibold text-gray-100 truncate pr-4">
            Attachments in "{chatTitle}"
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
            aria-label="Close chat attachments"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {attachments.length === 0 ? (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">No attachments found in this chat.</p>
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto space-y-3 pr-2 -mr-2 hide-scrollbar">
            {attachments.map((item) => (
              <div
                key={`${item.messageId}-${item.attachment.id}`}
                className="w-full flex items-center p-3 bg-gray-700 rounded-md group"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-gray-600 rounded-md flex items-center justify-center mr-3">
                  {getFileIcon(item)}
                </div>
                <div className="flex-grow min-w-0 text-left">
                  <p className="text-sm font-medium text-gray-200 truncate" title={item.attachment.name}>
                    {item.attachment.name} ({getDisplayFileType(item.attachment)})
                  </p>
                  <div className="text-xs text-gray-400 flex items-center mt-0.5">
                    {getRoleIcon(item.messageRole)}
                    <span className="ml-1">
                      {item.messageRole === ChatMessageRole.USER ? 'User' : 'AI'} on {new Date(item.messageTimestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5" title={item.messageContentSnippet}>
                    Message: {item.messageContentSnippet || (item.attachment.type === 'image' ? '[Image]' : (item.attachment.type === 'video' ? '[Video]' : '[File]'))}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-3 flex-shrink-0">
                  {item.attachment.fileUri && chat.currentChatSession && (
                    <RefreshAttachmentButton
                      attachment={item.attachment}
                      onReUpload={async () => {
                        if (chat.currentChatSession) {
                           await chat.handleReUploadAttachment(chat.currentChatSession.id, item.messageId, item.attachment.id);
                        }
                      }}
                      disabled={item.attachment.isReUploading || chat.isLoading || chat.autoSendHook.isAutoSendingActive}
                    />
                  )}
                  <button
                    onClick={() => onGoToMessage(item.messageId)}
                    className="p-1.5 text-gray-400 hover:text-blue-300 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label={`Go to message with attachment ${item.attachment.name}`}
                    title="Go to message"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatAttachmentsModal;