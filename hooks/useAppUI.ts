
import { useState, useEffect, useCallback } from 'react';
import * as layoutService from '../services/layoutService'; // Adjusted path

export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
  duration?: number; // Added duration
}

export function useAppUI() {
  const [isSidebarOpen, setIsSidebarOpenState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const storedSidebarState = localStorage.getItem('geminiChatSidebarOpen');
      const isLargeScreen = window.matchMedia('(min-width: 768px)').matches;
      return storedSidebarState ? JSON.parse(storedSidebarState) : isLargeScreen;
    }
    return false;
  });

  const [layoutDirection, setLayoutDirectionState] = useState<'ltr' | 'rtl'>(layoutService.getLayoutDirection());
  const [toastInfo, setToastInfo] = useState<ToastInfo | null>(null);

  useEffect(() => {
    localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    layoutService.initializeLayout(); // Initialize on mount
    const handleDirectionChange = (event: Event) => {
      setLayoutDirectionState((event as CustomEvent).detail);
    };
    window.addEventListener('layoutDirectionChange', handleDirectionChange);
    return () => {
      window.removeEventListener('layoutDirectionChange', handleDirectionChange);
    };
  }, []);

  const setIsSidebarOpen = useCallback((isOpen: boolean | ((prevState: boolean) => boolean)) => {
    setIsSidebarOpenState(isOpen);
  }, []);

  const closeSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setIsSidebarOpenState(false);
    }
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success', duration: number = 2000) => {
    setToastInfo({ message, type, duration });
  }, []);

  const handleToggleSidebar = useCallback(() => setIsSidebarOpenState(prev => !prev), []);

  const handleToggleLayoutDirection = useCallback(() => {
    layoutService.toggleLayoutDirection(); // This will trigger the event listener and update layoutDirectionState
  }, []);

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    layoutDirection,
    setLayoutDirection: layoutService.setLayoutDirection, // Expose the service function directly
    toastInfo,
    setToastInfo, // Expose for direct clearing if needed
    showToast,
    closeSidebar,
    handleToggleSidebar,
    handleToggleLayoutDirection,
  };
}