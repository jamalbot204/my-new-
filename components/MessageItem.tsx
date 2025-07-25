

import React, { useState, useEffect, useRef, memo } from 'react'; // Added memo
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LightAsync as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import Mark from 'mark.js/dist/mark.es6.js';
import { ChatMessage, ChatMessageRole, GroundingChunk, Attachment } from '../types';
import ResetAudioCacheButton from './ResetAudioCacheButton';
import RefreshAttachmentButton from './RefreshAttachmentButton';
import { useChatContext } from '../contexts/ChatContext';
import { useUIContext } from '../contexts/UIContext';
import { useAudioContext } from '../contexts/AudioContext';
import { MAX_WORDS_PER_TTS_SEGMENT, MESSAGE_CONTENT_SNIPPET_THRESHOLD } from '../constants';
import { 
    UserIcon, SparklesIcon, PencilIcon, TrashIcon, ClipboardDocumentListIcon, 
    ArrowPathIcon, MagnifyingGlassIcon, DocumentIcon, PlayCircleIcon, 
    ArrowDownTrayIcon, EllipsisVerticalIcon, ClipboardIcon, CheckIcon, UsersIcon,
    ChevronDownIcon, ChevronRightIcon, XCircleIcon, SpeakerWaveIcon, StopCircleIcon, SpeakerXMarkIcon,
    PauseIcon, ChevronUpIcon, BookOpenIcon, ChatBubblePlusIcon
} from './Icons';
import { splitTextForTts, sanitizeFilename } from '../services/utils';

interface MessageItemProps {
  message: ChatMessage;
  canRegenerateFollowingAI?: boolean;
  chatScrollContainerRef?: React.RefObject<HTMLDivElement>;
  highlightTerm?: string;
  onEnterReadMode: (content: string) => void;
}

const CodeBlock: React.FC<React.PropsWithChildren<{ inline?: boolean; className?: string }>> = ({
    inline,
    className, 
    children,
  }) => {
    const [isCodeCopied, setIsCodeCopied] = useState(false); 
    
    const codeString = Array.isArray(children) ? children.join('') : String(children);
    const finalCodeString = codeString.replace(/\n$/, '');

    const handleCopyCode = () => { 
      navigator.clipboard.writeText(finalCodeString).then(() => {
        setIsCodeCopied(true);
        setTimeout(() => setIsCodeCopied(false), 2000);
      }).catch(err => {
        console.error('Failed to copy code: ', err);
        alert('Failed to copy code.');
      });
    };

    if (inline) {
      return (
        <code 
          className="bg-black/30 text-indigo-300 rounded font-mono border border-white/10"
          style={{ 
            padding: '0.1em 0.3em', 
            fontSize: '0.875em', 
            margin: '0 0.05em',
            whiteSpace: 'pre-wrap', 
            wordBreak: 'break-all' 
          }}
        >
          {children}
        </code>
      );
    }
    
    const match = /language-([\w.-]+)/.exec(className || '');
    const lang = match && match[1] ? match[1] : ''; 

    return (
      <div className="relative group/codeblock my-2 rounded-md overflow-hidden shadow border border-white/10 bg-[#0A0910]">
        <div className="flex justify-start items-center px-3 py-1.5 bg-black/20">
          <span className="text-xs text-gray-300 font-mono">
            {lang || 'code'} 
          </span>
        </div>
        {lang ? ( 
          <SyntaxHighlighter
            style={atomOneDark}
            language={lang}
            PreTag="div" 
            customStyle={{ 
                margin: 0, 
                borderRadius: '0 0 0.375rem 0.375rem', 
                padding: '1rem', 
                overflowX: 'hidden', 
                fontSize: '0.9em',
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                backgroundColor: 'transparent'
            }}
            codeTagProps={{ 
                style: { 
                    fontFamily: 'inherit', 
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-word' 
                } 
            }}
            showLineNumbers={false}
            wrapLines={true} 
            lineProps={{ style: { wordBreak: 'break-word', whiteSpace: 'pre-wrap' } }} 
          >
            {finalCodeString}
          </SyntaxHighlighter>
        ) : ( 
          <pre 
            className="bg-transparent text-gray-200 p-4 text-sm font-mono overflow-x-hidden whitespace-pre-wrap break-words m-0 rounded-b-md" 
          >
            <code className={className || ''}> 
              {finalCodeString}
            </code>
          </pre>
        )}
        <button
          onClick={handleCopyCode}
          title={isCodeCopied ? "Copied!" : "Copy code"}
          aria-label={isCodeCopied ? "Copied code to clipboard" : "Copy code to clipboard"}
          className="absolute bottom-3 right-3 p-1.5 bg-black/30 text-gray-300 hover:text-white rounded-md transition-all duration-150 opacity-0 group-hover/codeblock:opacity-100 focus:opacity-100 hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]"
        >
          {isCodeCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      </div>
    );
  };


const MessageItemComponent: React.FC<MessageItemProps> = ({ 
  message, 
  canRegenerateFollowingAI,
  chatScrollContainerRef,
  highlightTerm,
  onEnterReadMode,
}) => {
  const chat = useChatContext();
  const ui = useUIContext();
  const audio = useAudioContext();

  const isUser = message.role === ChatMessageRole.USER;
  const isError = message.role === ChatMessageRole.ERROR;
  const isModel = message.role === ChatMessageRole.MODEL;

  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  
  const initialDropdownHorizontalClass = isUser ? 'left-0' : 'right-0';
  const [dynamicDropdownClass, setDynamicDropdownClass] = useState<string>(initialDropdownHorizontalClass);

  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  
  const markdownContentRef = useRef<HTMLDivElement>(null); 
  const rootDivRef = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  // Multi-select state from context
  const { isSelectionModeActive, selectedMessageIds, toggleMessageSelection } = ui;
  const isSelected = isSelectionModeActive && selectedMessageIds.has(message.id);
  
  let displayContent = message.content;
  let extractedThoughts: string | null = null;
  const thoughtsMarker = "THOUGHTS:"; 

  if (isModel && !isError && message.content) {
    const thoughtsIndex = message.content.indexOf(thoughtsMarker);
    if (thoughtsIndex !== -1) {
      let thoughtsEndIndex = message.content.indexOf("\n\n", thoughtsIndex + thoughtsMarker.length);
      if (thoughtsEndIndex === -1) {
          thoughtsEndIndex = message.content.length;
      }
      extractedThoughts = message.content.substring(thoughtsIndex + thoughtsMarker.length, thoughtsEndIndex).trim();
      displayContent = message.content.substring(thoughtsEndIndex).trim();
      if (displayContent.startsWith("\n\n")) {
          displayContent = displayContent.substring(2).trim();
      } else if (displayContent.startsWith("\n")) {
          displayContent = displayContent.substring(1).trim();
      }
    }
  }

  const actualMaxWords = chat.currentChatSession?.settings?.ttsSettings?.maxWordsPerSegment ?? MAX_WORDS_PER_TTS_SEGMENT;
  const textSegmentsForTts = splitTextForTts(displayContent, actualMaxWords);
  const numExpectedTtsParts = textSegmentsForTts.length;
  
  const hasAnyCachedAudio = message.cachedAudioBuffers && message.cachedAudioBuffers.some(buffer => !!buffer);

  const allTtsPartsCached = hasAnyCachedAudio && 
                           message.cachedAudioBuffers && 
                           message.cachedAudioBuffers.length === numExpectedTtsParts && 
                           message.cachedAudioBuffers.every(buffer => !!buffer);

  const isLongTextContent = displayContent.trim().length > MESSAGE_CONTENT_SNIPPET_THRESHOLD;
  const contentToRender = (isLongTextContent && !isContentExpanded) 
    ? displayContent.trim().substring(0, MESSAGE_CONTENT_SNIPPET_THRESHOLD) + "..." 
    : displayContent;

  useEffect(() => {
    const currentRef = rootDivRef.current;
    if (!currentRef || hasBeenVisible) return; // Don't observe if already visible

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenVisible(true);
          observer.unobserve(currentRef); 
        }
      },
      {
        root: chatScrollContainerRef?.current || null,
        rootMargin: '250px 0px', 
        threshold: 0.01, 
      }
    );

    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [chatScrollContainerRef, message.id, hasBeenVisible]);


  useEffect(() => {
    if (hasBeenVisible && markdownContentRef.current) { // Only highlight if visible and ref available
      const instance = new Mark(markdownContentRef.current);
      instance.unmark({
        done: () => {
          if (highlightTerm && highlightTerm.trim() !== "") {
            instance.mark(highlightTerm, {
              element: "mark",
              className: "highlighted-text", 
              exclude: ["pre *", "code *", "pre", "code"], 
              separateWordSearch: false, 
              accuracy: "partially", 
              wildcards: "disabled", 
            });
          }
        }
      });
    }
  }, [highlightTerm, contentToRender, isContentExpanded, hasBeenVisible]); 


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        optionsButtonRef.current &&
        !optionsButtonRef.current.contains(event.target as Node)
      ) {
        setIsOptionsMenuOpen(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOptionsMenuOpen(false);
      }
    };

    if (isOptionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOptionsMenuOpen]);

  useEffect(() => {
    const calculateAndSetAlignment = () => {
      if (!isOptionsMenuOpen || !optionsButtonRef.current || !dropdownRef.current) {
        return;
      }
      const buttonContainer = optionsButtonRef.current.parentElement;
      if (!buttonContainer) return;

      const containerRect = buttonContainer.getBoundingClientRect(); 
      const dropdownWidth = dropdownRef.current.offsetWidth || 100; 

      let frameLeft = 0;
      let frameRight = window.innerWidth;

      if (chatScrollContainerRef?.current) {
        const chatFrameRect = chatScrollContainerRef.current.getBoundingClientRect();
        frameLeft = chatFrameRect.left;
        frameRight = chatFrameRect.right;
      }
      
      let newAlignmentClass = isUser ? 'left-0' : 'right-0'; 

      if (isUser) { 
        if (containerRect.left + dropdownWidth > frameRight) {
          if (containerRect.right - dropdownWidth >= frameLeft) {
            newAlignmentClass = 'right-0'; 
          } else {
            newAlignmentClass = 'left-0';
          }
        } else {
          newAlignmentClass = 'left-0';
        }
      } else { 
        if (containerRect.right - dropdownWidth < frameLeft) {
          if (containerRect.left + dropdownWidth <= frameRight) {
            newAlignmentClass = 'left-0'; 
          } else {
            newAlignmentClass = 'right-0';
          }
        } else {
          newAlignmentClass = 'right-0';
        }
      }
      setDynamicDropdownClass(newAlignmentClass);
    };
  
    if (isOptionsMenuOpen) {
      requestAnimationFrame(calculateAndSetAlignment); 
      window.addEventListener('resize', calculateAndSetAlignment);
      const scrollTarget = chatScrollContainerRef?.current || window;
      scrollTarget.addEventListener('scroll', calculateAndSetAlignment, true); 
    
      return () => {
        window.removeEventListener('resize', calculateAndSetAlignment);
        scrollTarget.removeEventListener('scroll', calculateAndSetAlignment, true);
      };
    }
  }, [isOptionsMenuOpen, isUser, message.id, chatScrollContainerRef]);


  const handleEditClick = () => {
    if (!chat.currentChatSession) return;
    ui.openEditPanel({ 
        sessionId: chat.currentChatSession.id, 
        messageId: message.id, 
        originalContent: message.content, 
        role: message.role, 
        attachments: message.attachments,
    });
    setIsOptionsMenuOpen(false);
  };

  const handleDownloadAttachmentLocal = (attachment: Attachment) => {
    if (!attachment.dataUrl) {
        alert("Attachment data is not available for download.");
        return;
    }
    const link = document.createElement('a');
    link.href = attachment.dataUrl;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyMessageClick = async () => {
    await chat.handleActualCopyMessage(message.content); 
    setIsOptionsMenuOpen(false); 
  };
  
  const handleMasterPlayButtonClick = () => {
    if (audio.isMainButtonMultiFetchingApi(message.id)) {
        audio.handleCancelMultiPartFetch(message.id);
    } else {
        audio.handlePlayTextForMessage(displayContent, message.id, undefined);
    }
    setIsOptionsMenuOpen(false);
  };

  const handlePartPlayButtonClick = (partIndex: number) => {
    const uniqueSegmentId = `${message.id}_part_${partIndex}`;
    if (audio.isApiFetchingThisSegment(uniqueSegmentId)) {
        audio.onCancelApiFetchThisSegment(uniqueSegmentId);
    } else {
        audio.handlePlayTextForMessage(displayContent, message.id, partIndex);
    }
    setIsOptionsMenuOpen(false);
  };


  const handleResetCacheClick = () => {
    if (!chat.currentChatSession) return;
    ui.requestResetAudioCacheConfirmation(chat.currentChatSession.id, message.id); 
    setIsOptionsMenuOpen(false); 
  };

  const handleReadModeClick = () => {
    onEnterReadMode(displayContent);
    setIsOptionsMenuOpen(false);
  };

  const triggerAudioDownloadModal = (messageId: string) => {
    if (!chat.currentChatSession) return;
  
    const words = message.content.trim().split(/\s+/);
    const firstWords = words.slice(0, 7).join(' ');
    const defaultNameSuggestion = sanitizeFilename(firstWords, 50) || 'audio_download';
    
    ui.openFilenameInputModal({
      defaultFilename: defaultNameSuggestion,
      promptMessage: "Enter filename for audio (extension .mp3 will be added):",
      onSubmit: (userProvidedName) => {
        const finalName = userProvidedName.trim() === '' ? defaultNameSuggestion : userProvidedName.trim();
        audio.handleDownloadAudio(chat.currentChatSession!.id, messageId, finalName);
      }
    });
    setIsOptionsMenuOpen(false);
  };

  const handleInsertEmptyBubbleClick = () => {
    if (!chat.currentChatSession) return;
    const roleToInsert = message.role === ChatMessageRole.USER ? ChatMessageRole.MODEL : ChatMessageRole.USER;
    chat.handleInsertEmptyMessageAfter(chat.currentChatSession.id, message.id, roleToInsert);
    setIsOptionsMenuOpen(false);
  };


  const bubbleClasses = isUser
    ? 'bg-indigo-500/10 border border-indigo-400/30 shadow-lg shadow-indigo-900/20 self-end text-white'
    : isError
    ? 'aurora-surface border-red-500/50 shadow-lg shadow-red-900/30 self-start text-white'
    : 'self-start text-gray-200';
  
  const layoutClasses = isUser ? 'justify-end' : 'justify-start';

  const generationTime = chat.messageGenerationTimes[message.id];
  const groundingChunks = message.groundingMetadata?.groundingChunks;
  
  const getAudioStateForSegment = (baseMessageId: string, partIdx?: number) => {
    const segmentId = partIdx !== undefined ? `${baseMessageId}_part_${partIdx}` : baseMessageId;
    const isCurrentPlayerTarget = audio.audioPlayerState.currentMessageId === segmentId;
    const segmentFetchErr = audio.getSegmentFetchError(segmentId);
    
    let isCached = false;
    if (partIdx !== undefined) {
        isCached = !!message.cachedAudioBuffers?.[partIdx];
    } else {
        if (numExpectedTtsParts > 1) {
            isCached = allTtsPartsCached;
        } else {
            isCached = !!message.cachedAudioBuffers?.[0];
        }
    }

    return {
        uniqueSegmentId: segmentId,
        isCurrentAudioPlayerTarget: isCurrentPlayerTarget,
        isAudioPlayingForThisSegment: isCurrentPlayerTarget && audio.audioPlayerState.isPlaying,
        isAudioLoadingForPlayer: isCurrentPlayerTarget && audio.audioPlayerState.isLoading, 
        hasAudioErrorForThisSegment: (isCurrentPlayerTarget && !!audio.audioPlayerState.error) || !!segmentFetchErr,
        audioErrorMessage: segmentFetchErr || (isCurrentPlayerTarget ? audio.audioPlayerState.error : null),
        isAudioReadyToPlayFromCacheForSegment: isCached && !(isCurrentPlayerTarget && audio.audioPlayerState.isPlaying) && !(isCurrentPlayerTarget && audio.audioPlayerState.isLoading) && !segmentFetchErr,
    };
  };
  
  const { 
    hasAudioErrorForThisSegment: hasErrorOverall, 
    audioErrorMessage: overallAudioErrorMessage,
  } = getAudioStateForSegment(message.id); 

  const isAnyAudioOperationActiveForMessage = 
    message.isStreaming || 
    audio.isMainButtonMultiFetchingApi(message.id) || 
    textSegmentsForTts.some((_, partIdx) => audio.isApiFetchingThisSegment(`${message.id}_part_${partIdx}`)) || 
    (numExpectedTtsParts <= 1 && audio.isApiFetchingThisSegment(message.id)) ||
    (audio.audioPlayerState.currentMessageId?.startsWith(message.id) && (audio.audioPlayerState.isLoading || audio.audioPlayerState.isPlaying));


  const DropdownMenuItem: React.FC<{
    onClick: () => void;
    icon: React.FC<{ className?: string }>;
    label: string; 
    hoverGlowClassName?: string;
    className?: string;
    disabled?: boolean;
  }> = ({ onClick, icon: Icon, label, hoverGlowClassName, className, disabled = false }) => (
    <button
      role="menuitem"
      disabled={disabled}
      title={label} 
      aria-label={label}
      className={`w-auto p-2 text-sm flex items-center justify-center rounded-md transition-all ${
        disabled 
          ? 'text-gray-500 cursor-not-allowed' 
          : `text-gray-200 ${hoverGlowClassName || 'hover:bg-white/10'} ${className || ''}`
      }`}
      onMouseDown={() => { if (!disabled) onClick(); }} 
      onTouchStart={() => { if (!disabled) onClick(); }} 
      onClick={(e) => { e.preventDefault(); }} 
    >
      <Icon className={`w-5 h-5 ${disabled ? 'text-gray-500' : ''}`} />
    </button>
  );

  const renderPlayButtonForSegment = (partIndexInput?: number) => {
    const isMainContextButton = partIndexInput === undefined;
    const segmentState = getAudioStateForSegment(message.id, partIndexInput);
    
    let IconComponent = SpeakerWaveIcon;
    let iconClassName = segmentState.isAudioReadyToPlayFromCacheForSegment ? 'text-green-400' : 'text-gray-300';
    let title = segmentState.isAudioReadyToPlayFromCacheForSegment ? `Play cached` : `Play message`;
    if (isMainContextButton) {
        title = allTtsPartsCached && numExpectedTtsParts > 1 ? "Play All Cached Parts" 
              : (numExpectedTtsParts > 1 ? "Fetch & Prepare All Parts" : (segmentState.isAudioReadyToPlayFromCacheForSegment ? "Play Cached" : "Fetch & Play"));
    } else if (partIndexInput !== undefined) {
        title = `Part ${partIndexInput + 1}: ${segmentState.isAudioReadyToPlayFromCacheForSegment ? "Play cached" : "Play part"}`;
    }
    
    let isDisabled = false;
    let isPulsing = false;

    const isThisSegmentIndividuallyFetching = audio.isApiFetchingThisSegment(segmentState.uniqueSegmentId);
    const isThisTheMainButtonOverallFetching = isMainContextButton && audio.isMainButtonMultiFetchingApi(message.id);

    if (isThisTheMainButtonOverallFetching) {
        IconComponent = XCircleIcon;
        iconClassName = 'text-red-400 hover:text-red-300';
        title = `Cancel fetching ${numExpectedTtsParts} audio parts`;
        isPulsing = true;
    } else if (isThisSegmentIndividuallyFetching && !isMainContextButton) {
        IconComponent = XCircleIcon;
        iconClassName = 'text-red-400 hover:text-red-300';
        title = `Cancel audio fetch for Part ${partIndexInput! + 1}`;
        isPulsing = true;
    } else if (segmentState.isAudioPlayingForThisSegment) {
        IconComponent = PauseIcon;
        iconClassName = 'text-orange-400';
        title = isMainContextButton ? "Pause" : `Pause Part ${partIndexInput! + 1}`;
    } else if (segmentState.isAudioLoadingForPlayer) {
        IconComponent = SpeakerWaveIcon; 
        isPulsing = true; 
        isDisabled = true; 
        title = isMainContextButton ? "Loading audio..." : `Loading Part ${partIndexInput! + 1}...`;
        iconClassName = 'text-blue-400'; 
    } else if (segmentState.hasAudioErrorForThisSegment) {
        IconComponent = SpeakerXMarkIcon;
        iconClassName = 'text-red-400';
        title = `${isMainContextButton ? "" : `Part ${partIndexInput! + 1}: `}Error: ${segmentState.audioErrorMessage || 'Unknown audio error'}. Click to retry.`;
    }
    
    const clickHandler = isMainContextButton ? handleMasterPlayButtonClick : () => handlePartPlayButtonClick(partIndexInput!);

    return (
        <button
            onClick={clickHandler}
            title={title}
            aria-label={title}
            className={`p-1.5 text-gray-300 rounded-md bg-black bg-opacity-20 transition-shadow focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)] hover:text-white hover:shadow-[0_0_8px_1px_rgba(34,197,94,0.6)]
                        ${iconClassName}
                        ${isPulsing ? 'animate-pulse' : ''}
                      `}
            disabled={isDisabled || isSelectionModeActive}
        >
            <IconComponent className="w-4 h-4" />
            {partIndexInput !== undefined && <span className="text-xs ml-1">P{partIndexInput+1}</span>}
        </button>
    );
  };

  const showIndividualPartControls = numExpectedTtsParts > 1 && allTtsPartsCached;

  const Checkbox = () => (
    isSelectionModeActive && (
        <div className="flex-shrink-0 self-center px-2">
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleMessageSelection(message.id)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 text-[var(--aurora-accent-primary)] bg-black/30 border-white/20 rounded focus:ring-[var(--aurora-accent-primary)] focus:ring-offset-black cursor-pointer"
                aria-label={`Select message from ${message.role}`}
            />
        </div>
    )
  );


  return (
    <div 
      ref={rootDivRef} 
      id={`message-item-${message.id}`} 
      className={`group flex items-start mb-1 w-full relative transition-colors duration-200 ${isSelected ? 'bg-blue-900/40 rounded-md' : ''} ${isSelectionModeActive ? 'cursor-pointer' : ''} ${layoutClasses}`} 
      onClick={() => isSelectionModeActive && toggleMessageSelection(message.id)}
      role="listitem"
    >
      {!isUser && isSelectionModeActive && <Checkbox />}
      {!hasBeenVisible ? (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-xl lg:max-w-2xl xl:max-w-3xl w-full`}>
          <div 
            className={`px-4 py-3 rounded-lg opacity-40 animate-pulse w-3/4 sm:w-1/2 bg-white/5`}
            style={{ minHeight: '50px' }} 
          >
            <div className="h-3 bg-white/10 rounded w-3/4 mb-2"></div>
            <div className="h-2 bg-white/10 rounded w-1/2"></div>
          </div>
        </div>
      ) : (
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-xl lg:max-w-2xl xl:max-w-3xl`}>
        {isModel && message.isStreaming && !isError && !extractedThoughts && (
          <div 
            className={`flex items-center space-x-1.5 mb-1.5 px-3 py-1.5 rounded-lg shadow 
                        ${message.characterName ? 'bg-purple-900/30' : 'bg-black/20'} 
                        animate-thinking-dots`}
            aria-label="AI is thinking"
            role="status"
          >
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
          </div>
        )}

        {isModel && !isError && extractedThoughts && !message.isStreaming && (
          <div className="w-full mb-1.5">
            <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg shadow-md">
              <button
                onClick={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
                className="w-full flex items-center justify-between p-2.5 text-sm text-slate-300 transition-colors hover:bg-slate-700/70 rounded-t-lg focus:outline-none"
                aria-expanded={isThoughtsExpanded}
                aria-controls={`thoughts-content-${message.id}`}
              >
                <div className="flex items-center">
                  <SparklesIcon className="w-4 h-4 mr-2 text-blue-400" />
                  <span className="font-medium">Thoughts <span className="text-xs text-slate-400">(experimental)</span></span>
                </div>
                <div className="flex items-center text-slate-400">
                  <span className="mr-1 text-xs">
                    {isThoughtsExpanded ? 'Collapse' : 'Expand'}
                  </span>
                  {isThoughtsExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                </div>
              </button>
              {isThoughtsExpanded && (
                <div id={`thoughts-content-${message.id}`} className="p-3 border-t border-slate-700/80 markdown-content text-xs text-slate-300 max-h-48 overflow-y-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                    {extractedThoughts}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {(isUser || isModel || isError) && (
            <div className={`px-4 py-3 rounded-lg ${bubbleClasses} relative w-full mt-1`}>
                <>
                {isModel && message.characterName && (
                    <div className="flex items-center mb-1.5">
                        <UsersIcon className="w-4 h-4 mr-1.5 text-purple-300" />
                        <p className="text-xs font-semibold text-purple-300">{message.characterName}</p>
                    </div>
                )}
                {contentToRender.trim() && (
                    <div ref={markdownContentRef} className="text-sm markdown-content break-words">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{ code: CodeBlock }}
                    >
                        {contentToRender}
                    </ReactMarkdown>
                    </div>
                )}
                 {isLongTextContent && (
                    <button
                        onClick={() => setIsContentExpanded(!isContentExpanded)}
                        className="text-blue-300 hover:text-blue-200 text-xs mt-1.5 focus:outline-none flex items-center transition-all hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)]"
                        aria-expanded={isContentExpanded}
                    >
                        {isContentExpanded ? "Show less" : "Show more"}
                        {isContentExpanded ? (
                            <ChevronUpIcon className="w-3.5 h-3.5 ml-1" />
                        ) : (
                            <ChevronDownIcon className="w-3.5 h-3.5 ml-1" />
                        )}
                    </button>
                )}
                
                {message.attachments && message.attachments.length > 0 && (
                    <div className={`mt-2 grid gap-2 ${message.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {message.attachments.map(attachment => (
                        <div key={attachment.id} className="relative group/attachment border border-white/10 rounded-md overflow-hidden bg-black/20">
                        {attachment.mimeType.startsWith('image/') && attachment.type === 'image' && attachment.mimeType !== 'application/pdf' ? (
                            <img 
                                src={attachment.dataUrl} 
                                alt={attachment.name} 
                                className="max-w-full max-h-60 object-contain rounded-md cursor-pointer"
                                onClick={() => attachment.dataUrl && window.open(attachment.dataUrl, '_blank')}
                            />
                        ) : attachment.mimeType.startsWith('video/') && attachment.type === 'video' ? (
                            <video 
                                src={attachment.dataUrl} 
                                controls 
                                className="max-w-full max-h-60 object-contain rounded-md"
                            />
                        ) : ( 
                            <div className="p-2 h-full flex flex-col items-center justify-center bg-transparent transition-colors hover:bg-white/5 cursor-pointer" onClick={() => attachment.dataUrl && window.open(attachment.dataUrl, '_blank')}>
                                <DocumentIcon className="w-8 h-8 mb-1 text-gray-300" />
                                <span className="text-xs text-gray-300 text-center break-all px-1">{attachment.name}</span>
                            </div>
                        )}
                        <div className="absolute top-1 right-1 flex space-x-1 opacity-0 group-hover/attachment:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadAttachmentLocal(attachment); }}
                                title={`Download ${attachment.name}`}
                                className="p-1 bg-black bg-opacity-40 text-white rounded-full transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]"
                                aria-label={`Download ${attachment.name}`}
                                disabled={!attachment.dataUrl || isSelectionModeActive}
                            >
                                <ArrowDownTrayIcon className="w-3 h-3" />
                            </button>
                            {attachment.fileUri && (
                                <RefreshAttachmentButton
                                    attachment={attachment}
                                    onReUpload={() => chat.handleReUploadAttachment(chat.currentChatSession!.id, message.id, attachment.id)}
                                    disabled={message.isStreaming || isAnyAudioOperationActiveForMessage || isSelectionModeActive}
                                />
                            )}
                        </div>
                        {attachment.reUploadError && (
                            <p className="text-xs text-red-400 p-1 bg-black/50 absolute bottom-0 w-full text-center" title={attachment.reUploadError}>
                                Refresh Error
                            </p>
                        )}
                        </div>
                    ))}
                    </div>
                )}
                {groundingChunks && groundingChunks.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10">
                    <h4 className="text-xs font-semibold mb-1 opacity-80 flex items-center">
                        <MagnifyingGlassIcon className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                        Sources:
                    </h4>
                    <ul className="list-none pl-0 space-y-1">
                        {groundingChunks.map((chunk: GroundingChunk, index: number) => (
                        <li key={chunk.web.uri + index} className="text-xs">
                            <a
                            href={chunk.web.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={chunk.web.uri}
                            className="text-blue-300 hover:text-blue-200 hover:underline break-all"
                            >
                            {index + 1}. {chunk.web.title || chunk.web.uri}
                            </a>
                        </li>
                        ))}
                    </ul>
                    </div>
                )}
                </>
            
                <>
                    <div className="text-xs mt-1 opacity-60 flex items-center space-x-1.5">
                        <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                        {displayContent.trim() && !isError && (
                            <>
                                <span className="opacity-50">&bull;</span>
                                <span>{displayContent.trim().split(/\s+/).filter(Boolean).length} word{displayContent.trim().split(/\s+/).filter(Boolean).length !== 1 ? 's' : ''}</span>
                            </>
                        )}
                    </div>
                    {isModel && generationTime !== undefined && (
                        <p className="text-xs mt-0.5 text-red-400">
                            Generated in {generationTime.toFixed(1)}s
                        </p>
                    )}
                    {hasErrorOverall && ( 
                        <p className="text-xs mt-0.5 text-red-400" title={overallAudioErrorMessage || undefined}>
                            Audio Error: {overallAudioErrorMessage?.substring(0,50) || "Playback or fetch failed."}
                            {overallAudioErrorMessage && overallAudioErrorMessage.length > 50 ? "..." : ""}
                        </p>
                    )}
                    <div 
                        className={`absolute top-1 ${isUser ? 'left-1' : 'right-1'}
                                    opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 
                                    transition-opacity duration-150 z-10 flex items-center flex-wrap gap-1`}
                        aria-label="Message actions"
                    >
                     {displayContent.trim() && !isError && (
                        <>
                            {!showIndividualPartControls && renderPlayButtonForSegment()}
                            {showIndividualPartControls && textSegmentsForTts.map((_, index) => (
                              <React.Fragment key={`tts-btn-${index}`}>
                                {renderPlayButtonForSegment(index)}
                              </React.Fragment>
                            ))}
                            
                            {hasAnyCachedAudio && !isAnyAudioOperationActiveForMessage && (
                                <ResetAudioCacheButton
                                    onClick={handleResetCacheClick}
                                    disabled={isAnyAudioOperationActiveForMessage || isSelectionModeActive} 
                                    title="Reset Audio Cache"
                                />
                            )}
                        </>
                     )}
                    <button
                        ref={optionsButtonRef}
                        id={`options-menu-button-${message.id}`}
                        onClick={(e) => {
                            if (isSelectionModeActive) return;
                            e.stopPropagation();
                            setIsOptionsMenuOpen(prev => !prev);
                        }}
                        title="Options"
                        aria-haspopup="true"
                        aria-expanded={isOptionsMenuOpen}
                        className={`p-1.5 text-gray-300 rounded-md bg-black bg-opacity-20 transition-shadow focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)] hover:text-white hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)] ${isSelectionModeActive ? 'hidden' : ''}`}
                    >
                        <EllipsisVerticalIcon className="w-4 h-4" />
                    </button>
                    {isOptionsMenuOpen && (
                        <div
                            ref={dropdownRef}
                            className={`absolute aurora-panel ${dynamicDropdownClass} top-full mt-1.5 w-auto rounded-md shadow-lg z-30 p-1 flex space-x-1 focus:outline-none`}
                            role="menu"
                            aria-orientation="horizontal"
                            aria-labelledby={`options-menu-button-${message.id}`}
                        >
                            {(chat.currentChatSession?.settings.showReadModeButton) && (
                                <DropdownMenuItem
                                onClick={handleReadModeClick}
                                icon={BookOpenIcon}
                                label="Read Mode"
                                hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
                                />
                            )}
                             <DropdownMenuItem
                                onClick={handleInsertEmptyBubbleClick}
                                icon={ChatBubblePlusIcon}
                                label="Insert Empty Bubble After"
                                disabled={isAnyAudioOperationActiveForMessage || chat.isLoading}
                                hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
                            />
                            <DropdownMenuItem
                                onClick={handleCopyMessageClick}
                                icon={ClipboardDocumentListIcon}
                                label="Copy Text"
                                hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
                            />
                            {audio.handleDownloadAudio && message.content.trim() && !isError && allTtsPartsCached && (
                                <DropdownMenuItem
                                    onClick={() => triggerAudioDownloadModal(message.id)}
                                    icon={ArrowDownTrayIcon} 
                                    label={"Download Audio"}
                                    disabled={isAnyAudioOperationActiveForMessage} 
                                    hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
                                />
                            )}
                            {!isError && (isUser || isModel) && (
                                <DropdownMenuItem
                                    onClick={handleEditClick}
                                    icon={PencilIcon}
                                    label="Edit Text"
                                    disabled={isAnyAudioOperationActiveForMessage}
                                    hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(90,98,245,0.7)]"
                                />
                            )}
                            {!isError && isModel && !message.characterName && ( 
                                <DropdownMenuItem
                                    onClick={() => { chat.handleRegenerateAIMessage(chat.currentChatSession!.id, message.id); setIsOptionsMenuOpen(false); }}
                                    icon={ArrowPathIcon}
                                    label="Regenerate AI Message"
                                    disabled={isAnyAudioOperationActiveForMessage}
                                    hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(90,98,245,0.7)]"
                                />
                            )}
                            {isUser && canRegenerateFollowingAI && !message.characterName && (
                                <DropdownMenuItem
                                    onClick={() => { chat.handleRegenerateResponseForUserMessage(chat.currentChatSession!.id, message.id); setIsOptionsMenuOpen(false); }}
                                    icon={ArrowPathIcon}
                                    label="Regenerate AI Message"
                                    disabled={isAnyAudioOperationActiveForMessage}
                                    hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(90,98,245,0.7)]"
                                />
                            )}
                             <DropdownMenuItem
                                onClick={() => { chat.handleDeleteSingleMessageOnly(chat.currentChatSession!.id, message.id); setIsOptionsMenuOpen(false); }}
                                icon={XCircleIcon} 
                                label="Delete This Message"
                                className="text-red-400"
                                hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(239,68,68,0.7)]"
                                disabled={isAnyAudioOperationActiveForMessage} 
                            />
                            <DropdownMenuItem
                                onClick={() => { ui.requestDeleteConfirmation(chat.currentChatSession!.id, message.id); setIsOptionsMenuOpen(false); }}
                                icon={TrashIcon} 
                                label="Delete Message & History"
                                className="text-red-400"
                                hoverGlowClassName="hover:shadow-[0_0_10px_1px_rgba(239,68,68,0.7)]"
                                disabled={isAnyAudioOperationActiveForMessage} 
                            />
                        </div>
                    )}
                    </div>
                </>
            </div>
        )}
      </div>
      )}
       {isUser && isSelectionModeActive && <Checkbox />}
    </div>
  );
};

const MessageItem = memo(MessageItemComponent); 

export default MessageItem;