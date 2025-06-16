
import React from 'react';
import { AudioResetIcon } from '../constants'; // Using the new icon

interface ResetAudioCacheButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

const ResetAudioCacheButton: React.FC<ResetAudioCacheButtonProps> = ({
  onClick,
  disabled = false,
  title = "Reset Audio Cache",
  className = "",
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 text-yellow-400 hover:text-yellow-300 rounded-md bg-black bg-opacity-20 hover:bg-opacity-30 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <AudioResetIcon className="w-4 h-4" />
    </button>
  );
};

export default ResetAudioCacheButton;
