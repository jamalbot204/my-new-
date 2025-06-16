
import React from 'react';
import { CloseIcon } from '../constants'; // Assuming CloseIcon is in constants

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode; // Allow JSX for message
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  if (!isOpen) return null;

  const confirmButtonBaseClass = "px-4 py-2.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800";
  const confirmButtonClass = isDestructive
    ? `${confirmButtonBaseClass} text-white bg-red-600 hover:bg-red-700 focus:ring-red-500`
    : `${confirmButtonBaseClass} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
  const cancelButtonClass = `${confirmButtonBaseClass} text-gray-300 bg-gray-600 hover:bg-gray-500 focus:ring-gray-500`;


  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
    >
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirmation-modal-title" className="text-xl font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
            aria-label="Close confirmation"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="text-sm text-gray-300 mb-6 whitespace-pre-line">
          {message}
        </div>

        <div className="mt-auto flex justify-end space-x-3">
          <button
            onClick={onCancel}
            type="button"
            className={cancelButtonClass}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            type="button"
            className={confirmButtonClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
