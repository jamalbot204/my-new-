import React, { useState, useEffect, useRef } from 'react';
import { SaveDiskIcon, CheckIcon } from './Icons';
interface ManualSaveButtonProps {
  onManualSave: () => Promise<void>;
  disabled?: boolean;
}

const ManualSaveButton: React.FC<ManualSaveButtonProps> = ({ onManualSave, disabled }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  let successTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    if (isSaving || disabled) return;
    setIsSaving(true);
    setShowSuccess(false);
    try {
      await onManualSave();
      setShowSuccess(true);
      successTimeoutRef.current = window.setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Manual save trigger failed:", error);
      // Error display is expected to be handled by the parent's onManualSave (e.g., via toast)
    } finally {
      setIsSaving(false);
    }
  };

  const IconToDisplay = showSuccess ? CheckIcon : SaveDiskIcon;
  const iconColor = showSuccess ? 'text-green-400' : (isSaving ? 'text-blue-400 animate-pulse' : 'text-gray-300');
  const buttonTitle = showSuccess ? "Saved!" : (isSaving ? "Saving..." : "Save App State");

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isSaving}
      className={`p-1.5 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${disabled || isSaving ? 'opacity-60 cursor-not-allowed' : 'hover:text-white'}`}
      title={buttonTitle}
      aria-label={buttonTitle}
    >
      <IconToDisplay className={`w-5 h-5 ${iconColor}`} />
    </button>
  );
};

export default ManualSaveButton;
