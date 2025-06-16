
import { useState, useCallback } from 'react';
import { EditMessagePanelDetails } from '../components/EditMessagePanel'; // Adjusted path
import { AICharacter, ExportConfiguration } from '../types'; // Adjusted path
import { DEFAULT_EXPORT_CONFIGURATION } from '../constants'; // Adjusted path
import { useAppUI } from './useAppUI'; // To close sidebar when modals open

export function useAppModals(
    closeSidebar: () => void, // Callback from useAppUI
    initialExportConfig?: ExportConfiguration
) {
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isTtsSettingsModalOpen, setIsTtsSettingsModalOpen] = useState(false);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingMessageDetail, setEditingMessageDetail] = useState<EditMessagePanelDetails | null>(null);
  const [isCharacterManagementModalOpen, setIsCharacterManagementModalOpen] = useState(false);
  const [isContextualInfoModalOpen, setIsContextualInfoModalOpen] = useState(false);
  const [editingCharacterForContextualInfo, setEditingCharacterForContextualInfo] = useState<AICharacter | null>(null);
  const [isDebugTerminalOpen, setIsDebugTerminalOpen] = useState(false);
  
  const [isExportConfigModalOpen, setIsExportConfigModalOpenInternal] = useState(false);
  // This hook doesn't manage currentExportConfig state directly, App.tsx or useAppPersistence does.
  // It just handles opening/closing the modal.

  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; messageId: string } | null>(null);
  const [isResetAudioConfirmationOpen, setIsResetAudioConfirmationOpen] = useState(false);
  const [resetAudioTarget, setResetAudioTarget] = useState<{ sessionId: string; messageId: string } | null>(null);

  const openSettingsPanel = useCallback(() => { setIsSettingsPanelOpen(true); closeSidebar(); }, [closeSidebar]);
  const closeSettingsPanel = useCallback(() => setIsSettingsPanelOpen(false), []);
  
  const openTtsSettingsModal = useCallback(() => { setIsTtsSettingsModalOpen(true); closeSidebar(); }, [closeSidebar]);
  const closeTtsSettingsModal = useCallback(() => setIsTtsSettingsModalOpen(false), []);

  const openEditPanel = useCallback((details: EditMessagePanelDetails) => {
    setEditingMessageDetail(details);
    setIsEditPanelOpen(true);
    if (isSettingsPanelOpen) setIsSettingsPanelOpen(false);
    closeSidebar();
  }, [isSettingsPanelOpen, closeSidebar]);
  const closeEditPanel = useCallback(() => { setIsEditPanelOpen(false); setEditingMessageDetail(null); }, []);

  const openCharacterManagementModal = useCallback(() => { setIsCharacterManagementModalOpen(true); closeSidebar(); }, [closeSidebar]);
  const closeCharacterManagementModal = useCallback(() => setIsCharacterManagementModalOpen(false), []);

  const openCharacterContextualInfoModal = useCallback((character: AICharacter) => {
    setEditingCharacterForContextualInfo(character);
    setIsContextualInfoModalOpen(true);
  }, []);
  const closeCharacterContextualInfoModal = useCallback(() => {
    setIsContextualInfoModalOpen(false);
    setEditingCharacterForContextualInfo(null);
  }, []);

  const openDebugTerminal = useCallback(() => { setIsDebugTerminalOpen(true); closeSidebar(); }, [closeSidebar]);
  const closeDebugTerminal = useCallback(() => setIsDebugTerminalOpen(false), []);

  const openExportConfigurationModal = useCallback(() => { setIsExportConfigModalOpenInternal(true); closeSidebar(); }, [closeSidebar]);
  const closeExportConfigurationModal = useCallback(() => setIsExportConfigModalOpenInternal(false), []);

  const requestDeleteConfirmation = useCallback((sessionId: string, messageId: string) => {
    setDeleteTarget({ sessionId, messageId });
    setIsDeleteConfirmationOpen(true);
  }, []);
  const cancelDeleteConfirmation = useCallback(() => {
    setIsDeleteConfirmationOpen(false);
    setDeleteTarget(null);
  }, []);
  // confirmDelete is handled by the calling component as it involves chat updates

  const requestResetAudioCacheConfirmation = useCallback((sessionId: string, messageId: string) => {
    setResetAudioTarget({ sessionId, messageId });
    setIsResetAudioConfirmationOpen(true);
  }, []);
  const cancelResetAudioCacheConfirmation = useCallback(() => {
    setIsResetAudioConfirmationOpen(false);
    setResetAudioTarget(null);
  }, []);
  // confirmResetAudio is handled by the calling component

  return {
    isSettingsPanelOpen, openSettingsPanel, closeSettingsPanel,
    isTtsSettingsModalOpen, openTtsSettingsModal, closeTtsSettingsModal,
    isEditPanelOpen, editingMessageDetail, openEditPanel, closeEditPanel,
    isCharacterManagementModalOpen, openCharacterManagementModal, closeCharacterManagementModal,
    isContextualInfoModalOpen, editingCharacterForContextualInfo, openCharacterContextualInfoModal, closeCharacterContextualInfoModal,
    isDebugTerminalOpen, openDebugTerminal, closeDebugTerminal,
    isExportConfigModalOpen, openExportConfigurationModal, closeExportConfigurationModal,
    isDeleteConfirmationOpen, deleteTarget, requestDeleteConfirmation, cancelDeleteConfirmation, setIsDeleteConfirmationOpen,
    isResetAudioConfirmationOpen, resetAudioTarget, requestResetAudioCacheConfirmation, cancelResetAudioCacheConfirmation, setIsResetAudioConfirmationOpen,
  };
}
