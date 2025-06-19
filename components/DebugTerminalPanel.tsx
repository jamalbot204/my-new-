import React, { useState } from 'react';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { ApiRequestLog } from '../types';
import { CloseIcon, TrashIcon, BugAntIcon, ChevronDownIcon, ChevronRightIcon } from './Icons';
import { getModelDisplayName } from '../services/utils';

// No props are needed anymore!
const DebugTerminalPanel: React.FC = () => {
  const { currentChatSession, handleClearApiLogs } = useChatContext();
  const { isDebugTerminalOpen, closeDebugTerminal } = useUIContext();

  if (!isDebugTerminalOpen || !currentChatSession) return null;

  const logs = currentChatSession.apiRequestLogs || [];

  const LogEntry: React.FC<{ log: ApiRequestLog }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const modelName = getModelDisplayName(typeof log.payload.model === 'string' ? log.payload.model : undefined);

    return (
      <div className="border-b border-gray-700">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-700 focus:outline-none"
          aria-expanded={isExpanded}
          aria-controls={`log-payload-${log.id}`}
        >
          <div className="flex items-center space-x-2 text-left overflow-hidden">
            {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            <span className="text-xs text-gray-400 flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${
              log.requestType === 'chat.create' ? 'bg-blue-600 text-blue-100' :
              log.requestType === 'chat.sendMessage' ? 'bg-green-600 text-green-100' :
              log.requestType === 'files.uploadFile' ? 'bg-yellow-600 text-yellow-100' :
              log.requestType === 'files.getFile' ? 'bg-indigo-600 text-indigo-100' :
              'bg-purple-600 text-purple-100' 
            }`}>{log.requestType}</span>
            {log.characterName && <span className="text-xs text-purple-300 flex-shrink-0">(Char: {log.characterName})</span>}
            {log.apiSessionId && (
              <span className="text-xs text-cyan-400 truncate" title={log.apiSessionId}>
                API Session: <span className="font-mono">{log.apiSessionId.substring(0,25)}...</span>
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">Model: {modelName}</span>
        </button>
        {isExpanded && (
          <div id={`log-payload-${log.id}`} className="p-3 bg-gray-900">
             {log.apiSessionId && (
              <p className="text-xs text-cyan-500 mb-1.5">
                <span className="font-semibold">Full API Session ID:</span> <span className="font-mono break-all">{log.apiSessionId}</span>
              </p>
            )}
            <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all bg-gray-800 p-2 rounded-md overflow-x-auto hide-scrollbar">
              <code>{JSON.stringify(log.payload, null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-gray-800 p-0 rounded-lg shadow-xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200 ring-1 ring-gray-700">
        <header className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <div className="flex items-center">
            <BugAntIcon className="w-5 h-5 mr-2 text-orange-400" />
            <h2 className="text-xl font-semibold text-gray-100">API Request Log</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleClearApiLogs(currentChatSession.id)}
              title="Clear logs for this session"
              className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-700 hover:bg-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={logs.length === 0}
            >
              <TrashIcon className="w-4 h-4" />
            </button>
            <button 
                onClick={closeDebugTerminal} 
                className="p-1 text-gray-400 hover:text-gray-100 rounded-full hover:bg-gray-700"
                aria-label="Close API Request Log"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </header>
        <div className="px-4 pt-2 pb-1">
            <p className="text-xs text-gray-400">Showing logs for chat: <span className="font-medium text-gray-300">{currentChatSession.title}</span></p>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-gray-700">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-gray-500 italic">No API requests logged for this session yet, or logging is disabled.</p>
          ) : (
            <div className="divide-y divide-gray-700">
              {logs.slice().reverse().map(log => ( 
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugTerminalPanel;