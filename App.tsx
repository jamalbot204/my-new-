import React from 'react';
import { UIProvider } from './contexts/UIContext';
import { ChatProvider } from './contexts/ChatContext';
import { AudioProvider } from './contexts/AudioContext';
import { ApiKeyProvider } from './contexts/ApiKeyContext';
import AppContent from './components/AppContent'; 

const App: React.FC = () => {
  return (
    <ApiKeyProvider>
      <UIProvider>
        <ChatProvider>
          <AudioProvider>
            <AppContent />
          </AudioProvider>
        </ChatProvider>
      </UIProvider>
    </ApiKeyProvider>
  );
};

export default App;
