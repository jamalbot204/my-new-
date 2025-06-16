
import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon } from '../constants';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea'; // Import the new hook

interface InstructionEditModalProps {
  isOpen: boolean;
  title: string;
  currentInstruction: string;
  onApply: (newInstruction: string) => void;
  onClose: () => void;
}

const InstructionEditModal: React.FC<InstructionEditModalProps> = ({
  isOpen,
  title,
  currentInstruction,
  onApply,
  onClose,
}) => {
  const [editText, setEditText] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(editText, 400); // Max height 400px

  useEffect(() => {
    if (isOpen) {
      setEditText(currentInstruction);
    }
  }, [isOpen, currentInstruction]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Auto-resize is handled by the hook
    }
  }, [isOpen, textareaRef]); // Depend on textareaRef to ensure it's available

  if (!isOpen) return null;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    // Auto-resize is handled by the useAutoResizeTextarea hook
  };

  const handleApplyClick = () => {
    onApply(editText);
  };

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instruction-edit-modal-title"
    >
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 id="instruction-edit-modal-title" className="text-xl font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
            aria-label={`Close ${title} editor`}
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={editText}
          onChange={handleTextChange}
          className="w-full flex-grow p-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none hide-scrollbar text-sm sm:text-base leading-relaxed"
          placeholder="Enter instruction..."
          style={{ minHeight: '300px' }} 
          aria-label="Instruction content editor"
        />

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyClick}
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstructionEditModal;