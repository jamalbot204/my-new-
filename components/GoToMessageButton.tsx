
import React from 'react';

// Simple Target/Locate Icon
const LocateIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5c0 4.968-4.032 9-9 9s-9-4.032-9-9 4.032-9 9-9 9 4.032 9 9z" />
  </svg>
);

interface GoToMessageButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const GoToMessageButton: React.FC<GoToMessageButtonProps> = ({ onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 text-gray-400 hover:text-blue-300 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1 flex-shrink-0`}
      title="Go to playing message"
      aria-label="Go to playing message"
    >
      <LocateIcon />
    </button>
  );
};

export default GoToMessageButton;
