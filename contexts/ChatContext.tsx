
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ChatSession, ChatMessage, GeminiSettings, Attachment, AICharacter, ApiRequestLog, ExportConfiguration, UserDefinedDefaults } from '../types';
import { useChatSessions } from '../hooks/useChatSessions';
import { useAiCharacters } from '../hooks/useAiCharacters';
import { useGemini } from '../hooks/useGemini';
import { useImportExport } from '../hooks/useImportExport';
import { useAppPersistence } from '../hooks/useAppPersistence';
import { useSidebarActions } from '../hooks/useSidebarActions';
import { useChatInteractions } from '../hooks/useChatInteractions';
import { useAutoFetchAudio } from '../hooks/useAutoFetchAudio';
import { useAutoSend, UseAutoSendReturn } from '../hooks/useAutoSend';
import { useUIContext } from './UIContext';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/EditMessagePanel';


// Define the shape of the Chat context data
interface ChatContextType {
  // From useChatSessions
  chatHistory: ChatSession[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => Promise<void>;
  currentChatSession: ChatSession | null;
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  isLoadingData: boolean;

  // From useGemini (and wrapped by useChatInteractions for handleEditPanelSubmit)
  isLoading: boolean;
  currentGenerationTimeDisplay: string;
  handleSendMessage: (promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[], characterIdForAPICall?: string, isTemporaryContext?: boolean) => Promise<void>;
  handleContinueFlow: () => Promise<void>;
  handleCancelGeneration: () => Promise<void>;
  handleRegenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
  handleRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
  handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, details: EditMessagePanelDetails) => Promise<void>; // This is the wrapper from useChatInteractions

  // From useAiCharacters
  handleToggleCharacterMode: () => Promise<void>;
  handleAddCharacter: (name: string, systemInstruction: string) => Promise<void>;
  handleEditCharacter: (id: string, name: string, systemInstruction: string) => Promise<void>;
  handleDeleteCharacter: (id: string) => Promise<void>;
  handleReorderCharacters: (newCharacters: AICharacter[]) => Promise<void>;
  handleSaveCharacterContextualInfo: (characterId: string, newInfo: string) => Promise<void>;

  // From useImportExport
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  handleImportAll: () => Promise<void>;
  
  // From useAppPersistence
  messagesToDisplayConfig: Record<string, number>;
  setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  currentExportConfig: ExportConfiguration;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  messageGenerationTimes: Record<string, number>;
  handleManualSave: () => Promise<void>;

  // From useSidebarActions
  editingTitleInfo: { id: string | null; value: string };
  handleStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
  handleSaveChatTitle: () => Promise<void>;
  handleCancelEditChatTitle: () => void;
  handleEditTitleInputChange: (newTitle: string) => void;
  handleDuplicateChat: (sessionId: string) => Promise<void>;

  // From useChatInteractions
  handleActualCopyMessage: (content: string) => Promise<boolean>;
  handleDeleteMessageAndSubsequent: (sessionId: string, messageId: string) => Promise<void>;
  handleDeleteSingleMessageOnly: (sessionId: string, messageId: string) => void;
  handleLoadMoreDisplayMessages: (chatId: string, count: number) => Promise<void>;
  handleLoadAllDisplayMessages: (chatId: string) => Promise<void>;
  handleClearApiLogs: (sessionId: string) => Promise<void>;
  handleClearChatCacheForCurrentSession: () => void;
  handleReUploadAttachment: (sessionId: string, messageId: string, attachmentId: string) => Promise<void>;
  
  // From useAutoSend
  autoSendHook: UseAutoSendReturn;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const ui = useUIContext();

  const {
    chatHistory, setChatHistory, currentChatId, setCurrentChatId, currentChatSession,
    updateChatSession, handleNewChat: useChatSessionsHandleNewChat,
    handleSelectChat: useChatSessionsHandleSelectChat,
    handleDeleteChat: useChatSessionsHandleDeleteChat, isLoadingData,
  } = useChatSessions();

  const [loadedMsgGenTimes, setLoadedMsgGenTimes] = useState<Record<string, number>>({});
  const [loadedDisplayConfig, setLoadedDisplayConfig] = useState<Record<string, number>>({});

  const persistence = useAppPersistence(
    chatHistory, currentChatId, loadedMsgGenTimes, setLoadedMsgGenTimes,
    loadedDisplayConfig, setLoadedDisplayConfig, ui.showToast
  );

  const autoFetchHook = useAutoFetchAudio({
    currentChatSession,
    audioControlsPlayText: () => Promise.resolve(), // This will be connected via AudioProvider later
  });

  const gemini = useGemini({
    currentChatSession,
    updateChatSession,
    logApiRequestDirectly: (logDetails) => {
      if (currentChatSession && currentChatSession.settings.debugApiRequests) {
        const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
        updateChatSession(currentChatSession.id, session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
      }
    },
    triggerAutoFetchForNewMessage: autoFetchHook.triggerAutoFetchForNewMessage,
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
  });

  const chatInteractions = useChatInteractions({
    currentChatSession, updateChatSession, showToast: ui.showToast,
    openEditPanel: ui.openEditPanel, closeEditPanel: ui.closeEditPanel,
    geminiHandleEditPanelSubmit: gemini.handleEditPanelSubmit, // Pass the original gemini hook's submit
    geminiHandleCancelGeneration: gemini.handleCancelGeneration,
    isLoadingFromGemini: gemini.isLoading,
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    stopAndCancelAudio: () => {}, // Placeholder for AudioProvider
    activeAutoFetches: new Map(), setActiveAutoFetches: () => {},
    requestDeleteConfirmationModal: ui.requestDeleteConfirmation,
    requestResetAudioCacheConfirmationModal: ui.requestResetAudioCacheConfirmation,
    isSettingsPanelOpen: ui.isSettingsPanelOpen,
    closeSettingsPanel: ui.closeSettingsPanel,
    closeSidebar: ui.closeSidebar,
    logApiRequest: gemini.logApiRequest,
  });

  const autoSend = useAutoSend({
    currentChatSession,
    isLoadingFromGemini: gemini.isLoading,
    sendMessageToGemini: gemini.handleSendMessage,
    cancelGeminiGeneration: gemini.handleCancelGeneration,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
  });
  
  const aiCharacters = useAiCharacters(currentChatSession, updateChatSession);
  const sidebarActions = useSidebarActions({
    chatHistory, setChatHistory, updateChatSession, setCurrentChatId,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig, showToast: ui.showToast,
  });
  const importExport = useImportExport(
    setChatHistory, setCurrentChatId, persistence.setMessageGenerationTimes,
    persistence.setMessagesToDisplayConfig, ui.showToast, chatHistory
  );

  const handleNewChat = useCallback(async () => {
    await useChatSessionsHandleNewChat(persistence.setMessagesToDisplayConfig);
    ui.showToast("New chat created!", "success");
  }, [useChatSessionsHandleNewChat, persistence.setMessagesToDisplayConfig, ui.showToast]);

  const handleSelectChat = useCallback(async (id: string) => {
    if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    await useChatSessionsHandleSelectChat(id, persistence.setMessagesToDisplayConfig);
  }, [useChatSessionsHandleSelectChat, persistence.setMessagesToDisplayConfig, autoSend]);

  const handleDeleteChat = useCallback(async (id: string) => {
    if (currentChatId === id) {
      if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    }
    await useChatSessionsHandleDeleteChat(id, persistence.setMessagesToDisplayConfig, persistence.setMessageGenerationTimes);
    ui.showToast("Chat deleted!", "success");
  }, [currentChatId, useChatSessionsHandleDeleteChat, persistence.setMessagesToDisplayConfig, persistence.setMessageGenerationTimes, autoSend, ui.showToast]);

  const handleAddCharacter = async (name: string, systemInstruction: string) => {
    await aiCharacters.handleAddCharacter(name, systemInstruction);
    ui.showToast("Character added!", "success");
  };

  const handleEditCharacter = async (id: string, name: string, systemInstruction: string) => {
    await aiCharacters.handleEditCharacter(id, name, systemInstruction);
    ui.showToast("Character updated!", "success");
  };

  const handleDeleteCharacter = async (id: string) => {
    await aiCharacters.handleDeleteCharacter(id);
    ui.showToast("Character deleted!", "success");
  };
  
  const value: ChatContextType = {
    chatHistory, setChatHistory, currentChatId, setCurrentChatId, currentChatSession,
    updateChatSession, handleNewChat, handleSelectChat, handleDeleteChat, isLoadingData,
    
    // From useGemini (some are wrapped by useChatInteractions)
    isLoading: gemini.isLoading,
    currentGenerationTimeDisplay: gemini.currentGenerationTimeDisplay,
    handleSendMessage: gemini.handleSendMessage,
    handleContinueFlow: gemini.handleContinueFlow,
    handleCancelGeneration: gemini.handleCancelGeneration,
    handleRegenerateAIMessage: gemini.handleRegenerateAIMessage,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
    handleEditPanelSubmit: chatInteractions.handleEditPanelSubmitWrapper, // Use the wrapper

    // From useAiCharacters
    ...aiCharacters,
    handleAddCharacter, 
    handleEditCharacter, 
    handleDeleteCharacter,
    
    // From useImportExport
    ...importExport,
    
    // From useAppPersistence
    ...persistence,
    
    // From useSidebarActions
    ...sidebarActions,
    
    // From useChatInteractions (specific actions not covered by gemini context directly)
    handleDeleteMessageAndSubsequent: chatInteractions.handleDeleteMessageAndSubsequent,
    handleDeleteSingleMessageOnly: chatInteractions.handleDeleteSingleMessageOnly,
    handleLoadMoreDisplayMessages: chatInteractions.handleLoadMoreDisplayMessages,
    handleLoadAllDisplayMessages: chatInteractions.handleLoadAllDisplayMessages,
    handleClearApiLogs: chatInteractions.handleClearApiLogs,
    handleClearChatCacheForCurrentSession: chatInteractions.handleClearChatCacheForCurrentSession,
    handleReUploadAttachment: chatInteractions.handleReUploadAttachment,
    handleActualCopyMessage: chatInteractions.handleActualCopyMessage,
    
    autoSendHook: autoSend,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};
