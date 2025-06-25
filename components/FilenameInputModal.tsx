
import React, { useState, useEffect, useRef } from 'react';
import { useUIContext } from '../contexts/UIContext'; // Assuming UIContext exports close and submit actions
import { CheckIcon, CloseIcon as CancelIcon, ArrowDownTrayIcon } from './Icons'; // Re-using existing icons

interface FilenameInputModalProps {
  isOpen: boolean;
  defaultFilename: string;
  promptMessage: string;
  onSubmit: (filename: string) => void;
  onClose: () => void;
}

const FilenameInputModal: React.FC<FilenameInputModalProps> = ({
  isOpen,
  defaultFilename,
  promptMessage,
  onSubmit,
  onClose,
}) => {
  const [currentFilename, setCurrentFilename] = useState(defaultFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentFilename(defaultFilename);
      // Focus the input when the modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultFilename]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(currentFilename.trim() || defaultFilename);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFilename(e.target.value);
  };

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filename-input-modal-title"
        onClick={onClose} // Close on backdrop click
    >
      <div 
        className="bg-gray-800 p-6 rounded-lg shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="filename-input-modal-title" className="text-lg font-semibold text-gray-100 flex items-center">
            <ArrowDownTrayIcon className="w-5 h-5 mr-2 text-blue-400" />
            Name Audio File
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 p-1 rounded-full hover:bg-gray-700"
            aria-label="Close filename input"
          >
            <CancelIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-3">{promptMessage}</p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={currentFilename}
            onChange={handleInputChange}
            className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200 mb-6"
            aria-label="Filename for audio"
            placeholder="Enter filename"
          />
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors flex items-center"
            >
              <CancelIcon className="w-4 h-4 mr-1.5" /> Cancel
            </button>
            <button
              type="submit"
              disabled={!currentFilename.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4 mr-1.5" /> Download
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FilenameInputModal;
