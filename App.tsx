import React from 'react';
import { UIProvider } from './contexts/UIContext';
import { ChatProvider } from './contexts/ChatContext';
import { AudioProvider } from './contexts/AudioContext';
import AppContent from './components/AppContent'; 

const App: React.FC = () => {
  return (
    <UIProvider>
      <ChatProvider>
        <AudioProvider>
          <AppContent />
        </AudioProvider>
      </ChatProvider>
    </UIProvider>
  );
};

export default App;