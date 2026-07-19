import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '../types/chat';
import type { ChatSession } from '../utils/storage';
import {
  saveChatSession,
  getChatSession,
  getCurrentChatId,
  setCurrentChatId,
  generateChatId,
  generateTitle,
  getSettings,
  importChats,
} from '../utils/storage';
import { generateResponse, routeAIRequest } from '../services/aiService';
import {
  captureCurrentTabScreenshot,
  readFileAsText,
  SpeechRecognitionCancelledError,
  startSpeechRecognition,
  type SpeechRecognitionSession,
} from '../utils/media';
import { executePageActions, getActivePageContent, type PageAction, type PageContent } from '../utils/page';
import Header from '../components/Header';
import type { SmartAction } from '../actions/types';
import ChatMessage from '../components/ChatMessage';
import MessageInput from '../components/MessageInput';
import EmptyState from '../components/EmptyState';
import SettingsModal from '../components/SettingsModal';
import ChatHistory from '../components/ChatHistory';
import ActionConfirmationCard, { type ActionConfirmationState } from '../components/ActionConfirmationCard';
import VoiceInputModal from '../components/VoiceInputModal';
import SmartActionsModal from '../components/SmartActionsModal';
import { COMPACT_WINDOW_STATE_KEY } from '../constants/compact';

type LoadingStage = 'Reading current page...' | 'Analysing page content...' | 'Generating response...' | 'Generating image...' | 'Executing approved action...' | null;

type ActionRequest = {
  id: string;
  action: PageAction;
  targetDescription: string;
  reason: string;
  safetyWarning: string;
  state: ActionConfirmationState;
  error?: string;
};

export type InsightIQSurface = 'popup' | 'sidepanel';

type PopupProps = {
  surface?: InsightIQSurface;
};

type CompactPopupResponse = {
  ok?: boolean;
  error?: string;
};


const PAGE_CONTEXT_REQUEST_PATTERN = /\b(?:this|current|the)\s+(?:web\s*)?(?:page|site|website|tab)\b|\b(?:web\s*)?(?:page|site|website|tab)\s+(?:summary|summar[iy]|content|context|analysis|details?)\b|\b(?:summari[sz]e|analy[sz]e|explain|extract|read)\s+(?:this|the|current)?\s*(?:web\s*)?(?:page|site|website|tab)\b|\bwhat\s+is\s+(?:this|the)\s+(?:web\s*)?(?:page|site|website|tab)\s+about\b/i;
const SHORT_PAGE_CONTEXT_REQUEST_PATTERN = /^\s*(?:summari[sz]e|analy[sz]e|explain|extract(?:\s+key\s+points?)?|key\s+points?|important\s+facts?)\s*(?:please)?[.!?]*\s*$/i;
const IMAGE_GENERATION_PATTERN = /\b(?:generate|create|draw|make|design|visualize|illustrate|render|produce|paint|compose|craft)\b/i;
const IMAGE_NOUN_PATTERN = /\b(?:image|picture|photo|logo|poster|illustration|scene|visual|graphic|art|drawing|rendering|photograph|icon|avatar|banner|flyer)\b/i;
const IMAGE_ANALYSIS_NEGATIVE_PATTERN = /\b(?:analy[sz]e|describe|identify|recognize|caption|tell me about|what is this|what does this)\b/i;

function getHostname(url?: string): string {
  if (!url) return 'No active page';
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function isImageGenerationIntent(instruction: string): boolean {
  const normalized = instruction.trim().toLowerCase();
  if (!IMAGE_GENERATION_PATTERN.test(normalized) || !IMAGE_NOUN_PATTERN.test(normalized)) {
    return false;
  }
  if (IMAGE_ANALYSIS_NEGATIVE_PATTERN.test(normalized)) {
    return false;
  }
  return true;
}

function shouldUsePageContext(instruction: string): boolean {
  const normalized = instruction.trim();
  const explicitPageReference = PAGE_CONTEXT_REQUEST_PATTERN.test(normalized);
  const pageSummaryIntent = /\b(?:summari[sz]e|extract|key\s*points?|study\s*notes|important\s*(?:terms|facts)|main\s*topic|ask\s+about)\b/i;
  const shortPageIntent = /^\s*(?:please\s+)?(?:give me|show me|tell me|what are|what is|summari[sz]e|extract|find|create|generate|translate|describe|explain)\b/i;
  if (explicitPageReference) return true;
  if (shortPageIntent.test(normalized) && pageSummaryIntent.test(normalized)) return true;
  if (/\bexplain\b/i.test(normalized) && /\b(?:page|webpage|site|website|tab)\b/i.test(normalized)) return true;
  return SHORT_PAGE_CONTEXT_REQUEST_PATTERN.test(normalized);
}

function Popup({ surface = 'popup' }: PopupProps) {
  const isSidePanel = surface === 'sidepanel';
  const surfaceSizeClass = isSidePanel
    ? 'h-dvh w-full min-w-[360px]'
    : 'h-dvh w-full min-w-[360px]';
  const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSmartActions, setShowSmartActions] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [imageGenerationPromptPending, setImageGenerationPromptPending] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [actionRequests, setActionRequests] = useState<ActionRequest[]>([]);
  const [pageContext, setPageContext] = useState<PageContent | null>(null);
  const [extractionStatus, setExtractionStatus] = useState('Waiting to extract the active tab.');
  const [_compactSourceTabId, setCompactSourceTabId] = useState<number | null>(null);
  const [_compactSourceWindowId, setCompactSourceWindowId] = useState<number | null>(null);
  const [isRefreshingPage, setIsRefreshingPage] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isVoiceFinishing, setIsVoiceFinishing] = useState(false);
  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState('Listening...');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceSessionRef = useRef<SpeechRecognitionSession | null>(null);
  const voiceStartedAtRef = useRef(0);
  const voiceCancellationRequestedRef = useRef(false);
  const voiceSubmitRequestedRef = useRef(false);
  const popupMountedRef = useRef(true);
  const popupWindowIdRef = useRef<number | null>(null);

  const refreshPageContext = useCallback(async (): Promise<PageContent | null> => {
    setIsRefreshingPage(true);
    setExtractionStatus('Reading current page...');
    try {
      const page = await getActivePageContent();
      setPageContext(page);
      setExtractionStatus('Page context ready.');
      return page;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setPageContext(null);
      setExtractionStatus(`Could not read page: ${reason}`);
      setError(reason);
      return null;
    } finally {
      setIsRefreshingPage(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const resolveTheme = (themeSetting: 'system' | 'dark' | 'light'): 'dark' | 'light' => {
    if (themeSetting === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return themeSetting;
  };

  const loadSettings = useCallback(async () => {
    const settings = await getSettings();
    setTheme(resolveTheme(settings.theme));
  }, []);

  const applyTheme = useCallback((themeSetting: 'system' | 'dark' | 'light') => {
    setTheme(resolveTheme(themeSetting));
  }, []);

  const createNewChat = useCallback(() => {
    const chatId = generateChatId();
    const session: ChatSession = {
      id: chatId,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setCurrentChat(session);
    void setCurrentChatId(chatId);
  }, []);

  const loadChatSession = useCallback(async (id: string) => {
    const session = await getChatSession(id);
    if (!session) {
      createNewChat();
      return;
    }
    setCurrentChat(session);
  }, [createNewChat]);

  const initializeChat = useCallback(async () => {
    const chatId = await getCurrentChatId();
    if (chatId) {
      await loadChatSession(chatId);
    } else {
      createNewChat();
    }
  }, [createNewChat, loadChatSession]);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      void initializeChat();
      void loadSettings();
      void refreshPageContext();
    }, 0);
 
    return () => window.clearTimeout(startupTimer);
  }, [initializeChat, loadSettings, refreshPageContext]);
 
  useEffect(() => {
    void chrome.storage.session.get(COMPACT_WINDOW_STATE_KEY).then((data) => {
      const state = data[COMPACT_WINDOW_STATE_KEY] as { sourceTabId?: number; sourceWindowId?: number } | undefined;
      if (typeof state?.sourceTabId === 'number') {
        setCompactSourceTabId(state.sourceTabId);
      }
      if (typeof state?.sourceWindowId === 'number') {
        setCompactSourceWindowId(state.sourceWindowId);
      }
    }).catch((error) => {
      console.debug('[InsightIQ] Failed to load compact window source state:', error);
    });
  }, []);

  useEffect(() => {
    const refreshForActiveTab = () => {
      setActionRequests([]);
      void refreshPageContext();
    };
    const refreshAfterNavigation = (_tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status === 'complete') {
        setActionRequests([]);
        void refreshPageContext();
      }
    };

    chrome.tabs.onActivated.addListener(refreshForActiveTab);
    chrome.tabs.onUpdated.addListener(refreshAfterNavigation);
    return () => {
      chrome.tabs.onActivated.removeListener(refreshForActiveTab);
      chrome.tabs.onUpdated.removeListener(refreshAfterNavigation);
    };
  }, [refreshPageContext]);

  useEffect(() => {
    const scrollTimer = window.setTimeout(scrollToBottom, 0);
    return () => window.clearTimeout(scrollTimer);
  }, [currentChat?.messages, scrollToBottom]);

  useEffect(() => {
    if (!isVoiceListening) return undefined;

    const timer = window.setInterval(() => {
      setVoiceElapsedSeconds(Math.floor((Date.now() - voiceStartedAtRef.current) / 1000));
    }, 250);

    return () => window.clearInterval(timer);
  }, [isVoiceListening]);

  useEffect(() => {
   popupMountedRef.current = true;

   const runtimeListener = (message: any, _sender: unknown, sendResponse: (response?: unknown) => void) => {
     if (message && message.type === 'ACTION_RESULT_BROADCAST' && message.payload && typeof message.payload.result === 'string') {
       const resultText: string = message.payload.result;
       if (!currentChat) { sendResponse({ ok: false, error: 'No chat open' }); return; }
       const assistantMsg = {
         id: (Date.now() + 1).toString(),
         role: 'assistant',
         content: resultText,
         timestamp: new Date(),
       } as any;
       const updated = { ...currentChat, messages: [...currentChat.messages, assistantMsg], updatedAt: new Date() };
       setCurrentChat(updated);
       void saveChatSession(updated).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
       return true;
     }
     return false;
   };

   chrome.runtime.onMessage.addListener(runtimeListener);

   return () => {
     popupMountedRef.current = false;
     voiceCancellationRequestedRef.current = true;
     voiceSubmitRequestedRef.current = false;
     void voiceSessionRef.current?.cancel();
     try { chrome.runtime.onMessage.removeListener(runtimeListener); } catch {}
   };
  }, [currentChat]);

  useEffect(() => {
    if (isSidePanel) {
      return undefined;
    }

    void chrome.windows.getCurrent().then((currentWindow) => {
      if (typeof currentWindow.id === 'number') {
        popupWindowIdRef.current = currentWindow.id;
      }
    });

    return undefined;
  }, [isSidePanel]);

  const handleNewChat = async () => {
    if (currentChat) {
      await saveChatSession(currentChat);
    }
    createNewChat();
    setUploadedFile(null);
    setUploadProgress(0);
    setError(null);
    setActionRequests([]);
    setLoadingStage(null);
  };

  const handleOpenCompactPopup = () => {
    if (surface !== 'sidepanel') return;

    void chrome.runtime.sendMessage({ type: 'OPEN_COMPACT_WINDOW' })
      .then((response) => {
        const result = response as CompactPopupResponse | undefined;
        if (result?.ok === false) {
          setError(result.error || 'Could not open the compact InsightIQ popup.');
        }
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        setError(`Could not open the compact InsightIQ popup: ${reason}`);
      });
  };

  const buildPageAwarePrompt = (pageContent: PageContent, instruction: string): string => {
    const pageText = pageContent.text.length > 6000
      ? `${pageContent.text.slice(0, 6000)}

[The remaining webpage text was omitted to keep the response fast.]`
      : pageContent.text;

    return `Title: ${pageContent.title || 'Unknown title'}
URL: ${pageContent.url || 'Unknown URL'}

Page text:
${pageText}

${instruction}`;
  };

  const handleOpenSidePanel = () => {
    if (surface !== 'popup') return;

    console.debug('[InsightIQ] open side panel button clicked');
    void (async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }) as CompactPopupResponse | undefined;
        console.debug('[InsightIQ] OPEN_SIDE_PANEL response', response);
        if (!response?.ok) {
          const reason = response?.error || 'The background failed to prepare the Side Panel.';
          throw new Error(reason);
        }

        const sourceTabId = (response as any).sourceTabId as number | undefined;
        const sourceWindowId = (response as any).sourceWindowId as number | undefined;
        if (typeof sourceTabId !== 'number' || typeof sourceWindowId !== 'number') {
          throw new Error('The Side Panel target tab is unavailable.');
        }

        await chrome.sidePanel.setOptions({ tabId: sourceTabId, enabled: true });
        try {
          await chrome.sidePanel.open({ tabId: sourceTabId });
        } catch (openError) {
          console.debug('[InsightIQ] sidePanel.open(tabId) failed', openError);
          await chrome.sidePanel.open({ windowId: sourceWindowId });
        }

        await chrome.runtime.sendMessage({ type: 'CLOSE_COMPACT_WINDOW' });
        if (window.self && window.close) {
          window.close();
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.debug('[InsightIQ] OPEN_SIDE_PANEL failed', reason);
        setError(`Could not open the InsightIQ Side Panel: ${reason}`);
      }
    })();
  };



  const handleSendMessage = async (content: string, pageContent?: PageContent) => {
    if (!currentChat) return;
    setImageGenerationPromptPending(null);
    setError(null);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const updatedMessages = [...currentChat.messages, userMessage];
    const updatedChat = {
      ...currentChat,
      messages: updatedMessages,
      updatedAt: new Date(),
      title: currentChat.title === 'New Chat' ? generateTitle(content) : currentChat.title,
    };

    setCurrentChat(updatedChat);
    setIsLoading(true);
    setError(null);
    let stageTimer: number | undefined;

    try {
      const chatHistory = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
      let aiResponse: string;

      if (pageContent) {
        setLoadingStage('Analysing page content...');
        stageTimer = window.setTimeout(() => setLoadingStage('Generating response...'), 450);
        const pageAwareUserMessage = {
          role: 'user' as const,
          content: buildPageAwarePrompt(pageContent, content),
        };
        const conversation = [...chatHistory.slice(0, -1), pageAwareUserMessage];
        aiResponse = await generateResponse(conversation);
        setActionRequests([]);
      } else {
        setLoadingStage('Generating response...');
        aiResponse = await generateResponse(chatHistory);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };

      const finalChat = {
        ...updatedChat,
        messages: [...updatedMessages, assistantMessage],
      };

      setCurrentChat(finalChat);
      await saveChatSession(finalChat);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate response';
      console.error('[InsightIQ] Error in handleSendMessage:', errorMessage);
      setError(errorMessage);

      // Add error message to chat
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Error: ${errorMessage}`,
        timestamp: new Date(),
      };

      const errorChat = {
        ...updatedChat,
        messages: [...updatedMessages, errorMsg],
      };
      setCurrentChat(errorChat);
      await saveChatSession(errorChat);
    } finally {
      if (stageTimer !== undefined) window.clearTimeout(stageTimer);
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleGenerateImageRequest = async (prompt: string): Promise<boolean> => {
    if (!currentChat) return false;
    const message: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    const updatedMessages = [...currentChat.messages, message];
    const updatedChat = {
      ...currentChat,
      messages: updatedMessages,
      updatedAt: new Date(),
      title: currentChat.title === 'New Chat' ? generateTitle(prompt) : currentChat.title,
    };

    setCurrentChat(updatedChat);
    setImageGenerationPromptPending(null);
    setIsLoading(true);
    setError(null);
    let stageTimer: number | undefined;

    try {
      throw new Error('Image generation is not supported in this version of InsightIQ.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate image';
      console.error('[InsightIQ] Image generation failed:', errorMessage);
      setError(errorMessage);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Error: ${errorMessage}`,
        timestamp: new Date(),
      };

      const errorChat = {
        ...updatedChat,
        messages: [...updatedMessages, errorMsg],
      };
      setCurrentChat(errorChat);
      await saveChatSession(errorChat);
      return false;
    } finally {
      if (stageTimer !== undefined) window.clearTimeout(stageTimer);
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handlePageAction = async (instruction: string) => {
    setIsLoading(true);
    setError(null);
    setLoadingStage('Reading current page...');
    try {
      const pageContent = await refreshPageContext();
      if (!pageContent) {
        setIsLoading(false);
        setLoadingStage(null);
        return;
      }
      await handleSendMessage(instruction, pageContent);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[InsightIQ] Page analysis failed:', errorMessage);
      setError(errorMessage);
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleUserMessage = async (instruction: string): Promise<boolean> => {
    const message = instruction.trim();
    if (!message) return false;

    if (uploadedFile) {
      const attachment = uploadedFile;
      setUploadedFile(null);
      setUploadProgress(0);

      if (attachment.type.startsWith('image/')) {
        // The configured text model cannot receive image bytes. A browser screenshot
        // is still useful because we pair the user's question with fresh page text.
        await handlePageAction(`${message}\n\nA screenshot of the currently visible webpage was attached. Use the current webpage context to answer the question about it.`);
        return true;
      }

      try {
        const content = await readFileAsText(attachment);
        const fileText = content.slice(0, 12000);
        await handleSendMessage(
          `${message}\n\nUse the attached file as context. Reply in the same language as the file unless I ask otherwise.\n\nFile name: ${attachment.name}\n\nFile content:\n${fileText}${content.length > fileText.length ? '\n\n[The remaining file text was omitted because the file is very large.]' : ''}`,
        );
        return true;
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        setError(`Could not read ${attachment.name}: ${reason}`);
        return false;
      }
    }

    if (isImageGenerationIntent(message)) {
      return await handleGenerateImageRequest(message);
    }

    if (shouldUsePageContext(message)) {
      await handlePageAction(message);
      return true;
    }

    // Final routing: normal chat
    await handleSendMessage(message);
    return true;
  };

  const handleRegenerate = async (assistantMessage: Message) => {
    if (!currentChat || isLoading) return;

    const assistantIndex = currentChat.messages.findIndex((message) => message.id === assistantMessage.id);
    const sourceMessage = currentChat.messages
      .slice(0, assistantIndex)
      .reverse()
      .find((message) => message.role === 'user');

    if (!sourceMessage) {
      setError('Could not find the original question to regenerate this response.');
      return;
    }

    setIsLoading(true);
    setError(null);
    let stageTimer: number | undefined;

    try {
      let reply: string;
      if (shouldUsePageContext(sourceMessage.content)) {
        setLoadingStage('Reading current page...');
        const latestPage = await refreshPageContext();
        if (!latestPage) return;

        setLoadingStage('Analysing page content...');
        stageTimer = window.setTimeout(() => setLoadingStage('Generating response...'), 450);
        const pageAwareSource = buildPageAwarePrompt(latestPage, sourceMessage.content);
        const conversationBeforeResponse = currentChat.messages
          .slice(0, assistantIndex)
          .map((message) => ({ role: message.role, content: message.content }));
        const pageConversation = [...conversationBeforeResponse, { role: 'user', content: pageAwareSource }];
        reply = await generateResponse(pageConversation);
        setActionRequests([]);
      } else if ((assistantMessage as any).type === 'generated-image') {
        // Regenerate an image: find the original user prompt and call image generation
        setLoadingStage('Generating image...');
        stageTimer = window.setTimeout(() => setLoadingStage('Generating image...'), 450);
        const conversationBeforeResponse = currentChat.messages
          .slice(0, assistantIndex)
          .map((message) => ({ role: message.role, content: message.content }));
        const lastUser = conversationBeforeResponse.reverse().find((m) => m.role === 'user');
        if (!lastUser) throw new Error('Could not find original prompt to regenerate image.');
        const imageUrl = await routeAIRequest({ type: 'generate-image', instruction: lastUser.content });
        // Replace assistant message content with new image URL
        reply = imageUrl;
        setActionRequests([]);
      } else {
        setLoadingStage('Generating response...');
        const conversationBeforeResponse = currentChat.messages
          .slice(0, assistantIndex)
          .map((message) => ({ role: message.role, content: message.content }));
        reply = await generateResponse(conversationBeforeResponse);
        setActionRequests([]);
      }

      const replacement: Message = {
        ...assistantMessage,
        content: reply,
        timestamp: new Date(),
      };
      const finalChat = {
        ...currentChat,
        messages: currentChat.messages.map((message) => message.id === assistantMessage.id ? replacement : message),
        updatedAt: new Date(),
      };
      setCurrentChat(finalChat);
      await saveChatSession(finalChat);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[InsightIQ] Regeneration failed:', errorMessage);
      setError(errorMessage);
    } finally {
      if (stageTimer !== undefined) window.clearTimeout(stageTimer);
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const finishVoiceSession = (session: SpeechRecognitionSession) => {
    void session.finish().catch((error: unknown) => {
      voiceCancellationRequestedRef.current = true;
      voiceSubmitRequestedRef.current = false;
      void session.cancel();

      if (!popupMountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Could not finish voice input: ${errorMessage}`);
      setIsVoiceFinishing(false);
      setIsVoiceListening(false);
    });
  };

  const handleVoiceInput = async () => {
    if (isVoiceListening) return;

    setError(null);
    setShowActionMenu(false);
    voiceCancellationRequestedRef.current = false;
    voiceSubmitRequestedRef.current = false;
    voiceStartedAtRef.current = Date.now();
    setVoiceElapsedSeconds(0);
    setVoiceStatus('Starting microphone...');
    setIsVoiceFinishing(false);
    setIsVoiceListening(true);

    try {
      const session = await startSpeechRecognition();
      voiceSessionRef.current = session;

      if (!popupMountedRef.current || voiceCancellationRequestedRef.current) {
        void session.cancel();
      } else {
        setVoiceStatus('Listening... Tap Done & send when you finish.');
        if (voiceSubmitRequestedRef.current) {
          finishVoiceSession(session);
        }
      }

      const transcript = await session.transcript;
      if (transcript.trim() && voiceSubmitRequestedRef.current && !voiceCancellationRequestedRef.current) {
        handleUserMessage(transcript);
      } else if (transcript.trim() && !voiceCancellationRequestedRef.current) {
        setError('Voice input stopped before you selected Done & send. Please try again.');
      }
    } catch (err) {
      if (err instanceof SpeechRecognitionCancelledError) {
        return;
      }
      if (!popupMountedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[InsightIQ] Voice input failed:', errorMessage);
      setError(errorMessage);
    } finally {
      voiceSessionRef.current = null;
      if (popupMountedRef.current) {
        setIsVoiceListening(false);
        setIsVoiceFinishing(false);
        setVoiceElapsedSeconds(0);
        setVoiceStatus('Listening...');
        voiceSubmitRequestedRef.current = false;
      }
    }
  };

  const handleFinishVoiceInput = () => {
    if (!isVoiceListening || isVoiceFinishing || voiceCancellationRequestedRef.current) return;

    voiceSubmitRequestedRef.current = true;
    setIsVoiceFinishing(true);
    setVoiceStatus('Preparing your message...');
    if (voiceSessionRef.current) {
      finishVoiceSession(voiceSessionRef.current);
    }
  };

  const handleCancelVoiceInput = () => {
    if (!isVoiceListening) return;

    voiceCancellationRequestedRef.current = true;
    voiceSubmitRequestedRef.current = false;
    setIsVoiceFinishing(false);
    setVoiceStatus('Stopping...');
    void voiceSessionRef.current?.cancel();
  };

  const dismissActionRequest = (requestId: string) => {
    setActionRequests((requests) => requests.filter((request) => request.id !== requestId));
  };

  const retryActionRequest = (requestId: string) => {
    // Retry intentionally returns the action to review state. The user must
    // select Allow once again; retrying never executes an action automatically.
    setActionRequests((requests) => requests.map((request) => (
      request.id === requestId ? { ...request, state: 'pending', error: undefined } : request
    )));
  };

  const allowActionOnce = async (requestId: string) => {
    const request = actionRequests.find((item) => item.id === requestId);
    if (!request || request.state !== 'pending' || isLoading) return;

    setIsLoading(true);
    setError(null);
    setLoadingStage('Executing approved action...');

    try {
      const [result] = await executePageActions([request.action], 'allow-once');
      const readableResult = result || 'The action was completed.';
      setActionRequests((requests) => requests.map((item) => (
        item.id === requestId ? { ...item, state: 'success' } : item
      )));

      if (currentChat) {
        const actionMessage: Message = {
          id: generateChatId(),
          role: 'assistant',
          content: `## Action completed\n- ${readableResult}`,
          timestamp: new Date(),
        };
        const updatedChat = { ...currentChat, messages: [...currentChat.messages, actionMessage], updatedAt: new Date() };
        setCurrentChat(updatedChat);
        await saveChatSession(updatedChat);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[InsightIQ] Approved page action failed:', errorMessage);
      setActionRequests((requests) => requests.map((item) => (
        item.id === requestId ? { ...item, state: 'failure', error: errorMessage } : item
      )));
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleQuickAction = (action: string) => {
    const actionMessages: Record<string, string> = {
      summarize: 'Please summarize this page.',
      explain: 'Please explain the content of this page in simple terms.',
      extract:
        'Extract the key points from this page. Return only concise Markdown bullet lines beginning with "- ". Do not write a heading or any paragraph. If there are no key points, return exactly: - None found.',
      ask: 'What is this page about? Give me a clear overview, explain its purpose, and mention the most important details.',
      facts: 'Please find and list the important facts on this page.',
      questions: 'Please generate important questions about this page.',
    };

    void handlePageAction(actionMessages[action] || 'Analyze this page.');
  };

  const handleActionMenuAction = async (action: string, data: unknown) => {
    setShowActionMenu(false);

    if (action === 'upload-file') {
      const file = data as File;
      setUploadedFile(file);
      setUploadProgress(15);
      setTimeout(() => setUploadProgress(100), 250);
    } else if (action === 'paste-clipboard') {
      const text = data as string;
      if (text) {
        void handlePageAction(`Pasted from clipboard:\n\n${text}`);
      }
    } else if (action === 'analyze-page') {
      void handlePageAction('Please analyze the current webpage.');
    } else if (action === 'screenshot') {
      try {
        const screenshot = await captureCurrentTabScreenshot();
        setUploadedFile(screenshot);
        setUploadProgress(100);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } else if (action === 'import-chats') {
      const file = data as File;
      try {
        const count = await importChats(await file.text());
        alert(`Imported ${count} chats successfully!`);
      } catch (err) {
        console.error('Import failed', err);
        alert('Failed to import chats. Please check the file format.');
      }
    }
  };

  // Handler when a Smart Action is selected from the modal. This must close the
  // modal immediately, bring the user back to the chat, and trigger the
  // appropriate hidden prompt + send flow for AI-backed actions.
  const handleSmartActionSelect = (action: SmartAction) => {
    // Close the modal right away and ensure the chat is visible.
    setShowSmartActions(false);

    // Browser-exec actions (like copying) should not call the AI. Show a small
    // success toast and return. The modal still executes the action in the
    // background (SmartActionsModal runs non-ai actions), but we provide
    // immediate feedback to the user.
    if (action.category === 'browser-exec' || action.id === 'copy-page-url') {
      setSuccessToast(`${action.title} — done`);
      window.setTimeout(() => setSuccessToast(null), 2500);
      return;
    }

    // Map known action IDs to hidden prompts that use page context.
    const actionPrompts: Record<string, string> = {
      'summarize-page': 'Please summarize this page.',
      'copy-selected-text': 'Copy the selected text from this page.',
      'extract-useful-links': 'Extract the useful links from this page and return them as a short list.',
      'generate-faqs': 'Generate frequently asked questions (FAQs) from this page.',
      'create-study-notes': 'Create study notes from this webpage.',
      'detect-main-topic': 'Detect the main topic of this webpage.',
      'translate-page': 'Translate the current webpage.',
    };

    const prompt = actionPrompts[action.id] || action.description || action.title || 'Please analyze this page.';

    // Use existing page-context action flow so the chat shows loading and the
    // response is appended to the current conversation. Do not create a new
    // conversation.
    void handlePageAction(prompt);
  };

  const handleSelectChat = async (selectedChat: ChatSession) => {
    if (currentChat && currentChat.id !== selectedChat.id) {
      await saveChatSession(currentChat);
    }
    setCurrentChat(selectedChat);
    await setCurrentChatId(selectedChat.id);
  };

  if (!currentChat) {
    return (
      <div data-surface={surface} className={`flex ${surfaceSizeClass} items-center justify-center bg-[#090E1D]`}>
        <div className="text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25">
            <span className="text-2xl">⏳</span>
          </div>
          <p className="text-slate-400">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-surface={surface}
      data-theme={theme}
      className={`relative flex ${surfaceSizeClass} flex-col overflow-visible ${theme === 'dark' ? 'bg-[#090E1D] text-slate-100' : 'bg-[#F7F7FB] text-slate-900'}`}
    >
      <Header
        onNewChat={handleNewChat}
        onSettings={() => setShowSettings(true)}
        onHistory={() => setShowHistory(true)}
        onSmartActions={() => setShowSmartActions(true)}
        onOpenPopup={isSidePanel ? handleOpenCompactPopup : undefined}
        onOpenSidePanel={surface === 'popup' ? handleOpenSidePanel : undefined}
        isConnected={true}
        theme={theme}
        pageTitle={pageContext?.title}
        hostname={getHostname(pageContext?.url)}
        characterCount={pageContext?.text.length}
        connectionStatus={isRefreshingPage ? 'Reading current page…' : pageContext ? 'Page context ready' : extractionStatus}
        onRefreshPage={() => {
          setActionRequests([]);
          void refreshPageContext();
        }}
        isRefreshing={isRefreshingPage}
      />

      {successToast && (
        <div className="fixed right-4 top-20 z-50 rounded-md px-3 py-2 text-sm font-medium bg-emerald-600 text-white shadow">
          {successToast}
        </div>
      )}

      {/* Debug panel (developer mode only) */}
      {(
        // Usage: set window.__insightiqDeveloperMode = true from the popup console.
        window.__insightiqDeveloperMode === true
      ) && (
        <section className="border-b border-violet-400/20 bg-violet-500/5 px-4 py-2 text-[11px] text-slate-300" aria-label="Webpage extraction debug panel">
          <p className="mb-1 font-semibold uppercase tracking-wider text-violet-300">Webpage context debug</p>
          <p className="truncate"><span className="text-slate-500">URL:</span> {pageContext?.url || 'Not available'}</p>
          <p className="truncate"><span className="text-slate-500">Title:</span> {pageContext?.title || 'Not available'}</p>
          <p><span className="text-slate-500">Characters extracted:</span> {pageContext?.text.length || 0}</p>
          <p className={extractionStatus.startsWith('Extraction failed') ? 'text-red-300' : 'text-emerald-300'}>
            <span className="text-slate-500">Status:</span> {extractionStatus}
          </p>
        </section>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className={`mx-4 mt-4 rounded-lg border px-4 py-2 text-sm ${theme === 'light' ? 'border-red-300 bg-red-50 text-red-700' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
            {error}
          </div>
        )}

        {imageGenerationPromptPending && (
          <div className={`mx-4 mt-4 rounded-xl border px-4 py-3 ${theme === 'light' ? 'border-violet-200 bg-violet-50 text-slate-900' : 'border-violet-400/30 bg-violet-500/10 text-slate-100'}`}>
            <p className="text-sm font-medium">Image generation is not supported in this version of InsightIQ.</p>
            <p className="mt-1 text-xs text-slate-500">Your image prompt is preserved in the composer so you can retry after configuring your key.</p>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="mt-3 inline-flex items-center rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Open AI settings
            </button>
          </div>
        )}

        {actionRequests.length > 0 && (
          <section className="mx-4 mt-4 space-y-3" aria-label="Proposed webpage actions">
            {actionRequests.map((request) => (
              <ActionConfirmationCard
                key={request.id}
                action={request.action}
                targetDescription={request.targetDescription}
                reason={request.reason}
                safetyWarning={request.safetyWarning}
                state={request.state}
                error={request.error}
                theme={theme}
                onCancel={() => dismissActionRequest(request.id)}
                onAllowOnce={request.state === 'pending' && !isLoading ? () => void allowActionOnce(request.id) : undefined}
                onRetry={request.state === 'failure' && !isLoading ? () => retryActionRequest(request.id) : undefined}
              />
            ))}
          </section>
        )}

        {currentChat.messages.length === 0 ? (
          <EmptyState onQuickAction={handleQuickAction} theme={theme} />
        ) : (
          <div className="space-y-5 p-4">
            {currentChat.messages.map((message) => (
              <ChatMessage key={message.id} message={message} theme={theme} onRegenerate={handleRegenerate} />
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600">
                  <span className="text-[10px] font-bold text-white">IQ</span>
                </div>
                <div className={`min-w-[190px] rounded-2xl rounded-bl-sm px-4 py-3 ${theme === 'light' ? 'border border-slate-200 bg-white shadow-sm' : 'bg-slate-800/60'}`} aria-live="polite">
                  <p className={`text-xs font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>
                    {loadingStage || 'Generating response...'}
                  </p>
                  <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-700/70'}`}>
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-violet-500" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

      </div>

      <MessageInput
        onSend={handleUserMessage}
        onGenerateImage={handleGenerateImageRequest}
        isLoading={isLoading}
        actionMenuOpen={showActionMenu}
        onActionMenuOpen={(open) => {
          setShowActionMenu(open);
        }}
        onAction={handleActionMenuAction}
        onVoiceInput={handleVoiceInput}
        theme={theme}
        uploadedFile={uploadedFile}
        uploadProgress={uploadProgress}
        onRemoveUpload={() => { setUploadedFile(null); setUploadProgress(0); }}
      />

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} theme={theme} onSave={applyTheme} />
      <ChatHistory
        isOpen={showHistory}
        onClose={() => {
          setShowHistory(false);
        }}
        onSelectChat={handleSelectChat}
        currentChatId={currentChat.id}
        theme={theme}
      />
      <VoiceInputModal
        isOpen={isVoiceListening}
        elapsedSeconds={voiceElapsedSeconds}
        onCancel={handleCancelVoiceInput}
        onDone={handleFinishVoiceInput}
        isFinishing={isVoiceFinishing}
        status={voiceStatus}
        theme={theme}
      />
      <SmartActionsModal
        isOpen={showSmartActions}
        onClose={() => setShowSmartActions(false)}
        pageContext={pageContext}
        theme={theme}
        onSelectAction={handleSmartActionSelect}
      />
    </div>
  );
}

export default Popup;
