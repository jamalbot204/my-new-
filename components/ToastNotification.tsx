import React, { useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, CloseIcon as CloseButtonIcon } from './Icons';

interface ToastNotificationProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ message, type, onClose, duration = 2000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
  const IconComponent = type === 'success' ? CheckCircleIcon : XCircleIcon;

  return (
    <div 
      className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] px-4 py-3 rounded-md shadow-lg flex items-center space-x-3 text-white ${bgColor} transition-opacity duration-300 ease-in-out`}
      role="alert"
      aria-live="assertive"
    >
      <IconComponent className="w-5 h-5 flex-shrink-0" />
      <span className="flex-grow">{message}</span>
      <button
        onClick={onClose}
        className="p-1 -mr-1 rounded-full hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label="Close notification"
      >
        <CloseButtonIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ToastNotification;
