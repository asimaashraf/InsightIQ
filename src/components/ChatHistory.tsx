import { useCallback, useEffect, useState, useRef, type ChangeEvent } from 'react';
import ExportModal from './ExportModal';
import { getChatSessions, getChatSession, renameChatSession, deleteChatSession, importChats } from '../utils/storage';
import type { ChatSession } from '../utils/storage';

type ChatHistoryProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chat: ChatSession) => void;
  currentChatId?: string;
  theme?: 'dark' | 'light';
};

type ExportModalState = {
  mode: 'single' | 'all';
  chat?: ChatSession;
};

function ChatHistory({ isOpen, onClose, onSelectChat, currentChatId, theme = 'dark' }: ChatHistoryProps) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportModalState, setExportModalState] = useState<ExportModalState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  const loadChats = useCallback(async () => {
    setLoading(true);
    const sessions = await getChatSessions();
    setChats([...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const loadTimer = window.setTimeout(() => {
      void loadChats();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [isOpen, loadChats]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleRename = async (id: string) => {
    if (editingTitle.trim()) {
      await renameChatSession(id, editingTitle);
      setEditingId(null);
      await loadChats();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this chat? This cannot be undone.')) {
      await deleteChatSession(id);
      await loadChats();
    }
  };

  const openExportModalForChat = async (id: string) => {
    const session = await getChatSession(id);
    if (!session) {
      alert('Chat not found');
      return;
    }
    setExportModalState({ mode: 'single', chat: session });
    setMenuOpen(false);
  };

  const openExportAllModal = () => {
    setExportModalState({ mode: 'all' });
    setMenuOpen(false);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.json')) {
          throw new Error('Unsupported file type. Only JSON chat export files are supported for import.');
        }

        const text = await file.text();
        const imported = await importChats(text);
        fileInputRef.current!.value = '';
        alert(`${imported} chats imported successfully!`);
        await loadChats();
      } catch (err) {
        console.error('Import failed', err);
        const message = err instanceof Error ? err.message : String(err);
        alert(`Failed to import chats: ${message}`);
      }
    }
    setMenuOpen(false);
  };

  const handleOpenImport = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleClearHistory = async () => {
    if (confirm('Clear all saved chat history? This cannot be undone.')) {
      await chrome.storage.local.set({ insightiq_chats: [] });
      await loadChats();
      setMenuOpen(false);
    }
  };

  if (!isOpen) return null;

  const modalClass = isLight
    ? 'border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]'
    : 'border-violet-400/15 bg-[#10172b] shadow-[0_24px_80px_rgba(2,6,23,0.7)]';
  const primaryTextClass = isLight ? 'text-slate-900' : 'text-slate-50';
  const secondaryTextClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const sectionBorderClass = isLight ? 'border-slate-200' : 'border-slate-800/90';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className={`flex max-h-[calc(100vh-56px)] w-full max-w-[388px] flex-col overflow-hidden rounded-2xl border ${modalClass}`}>
        <div className={`relative flex items-center justify-between border-b px-5 py-4 ${sectionBorderClass}`}>
          <div>
            <h2 id="history-title" className={`text-base font-semibold tracking-tight ${primaryTextClass}`}>Chat history</h2>
            <p className={`mt-0.5 text-[11px] ${secondaryTextClass}`}>Continue a previous conversation</p>
          </div>
          <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                }`}
                aria-label="Open chat history actions"
                aria-expanded={menuOpen}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v.01M12 12v.01M12 18v.01" />
                </svg>
              </button>

              {menuOpen && (
                <div className={`absolute right-0 z-50 mt-2 w-[220px] overflow-hidden rounded-2xl border ${sectionBorderClass} ${isLight ? 'bg-white text-slate-900' : 'bg-[#10172b] text-slate-100'} shadow-lg`}>
                  <button
                    type="button"
                    onClick={openExportAllModal}
                    className="w-full px-4 py-3 text-left text-sm transition-colors hover:bg-violet-50 hover:text-violet-900 dark:hover:bg-violet-500/10"
                  >
                    Export all chats
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenImport}
                    className="w-full px-4 py-3 text-left text-sm transition-colors hover:bg-violet-50 hover:text-violet-900 dark:hover:bg-violet-500/10"
                  >
                    Import chats
                  </button>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="w-full px-4 py-3 text-left text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
                  >
                    Clear chat history
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              }`}
              aria-label="Close chat history"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-[230px] flex-1 overflow-y-auto px-3 py-3" aria-live="polite">

          {loading ? (
            <div className={`flex min-h-[210px] flex-col items-center justify-center text-center ${secondaryTextClass}`}>
              <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl border ${isLight ? 'border-violet-100 bg-violet-50 text-violet-600' : 'border-violet-400/15 bg-violet-500/10 text-violet-300'}`}>
                <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeWidth={1.8} d="M20 12a8 8 0 11-2.34-5.66" />
                </svg>
              </span>
              <p className="text-xs">Loading your conversations…</p>
            </div>
          ) : chats.length === 0 ? (
            <div className={`flex min-h-[210px] flex-col items-center justify-center px-8 text-center ${secondaryTextClass}`}>
              <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-700/80 bg-slate-800/70 text-slate-400'}`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h8m-8 4h8m-8 4h5M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
              </span>
              <p className={`text-xs font-medium ${primaryTextClass}`}>No saved chats yet</p>
              <p className="mt-1 text-[10px] leading-4">Your conversations will appear here after you send a message.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => {
                const isCurrent = chat.id === currentChatId;
                const updatedAt = new Date(chat.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const cardClass = isCurrent
                  ? isLight
                    ? 'border-violet-200 bg-violet-50/80 shadow-sm'
                    : 'border-violet-400/30 bg-violet-500/10 shadow-[0_8px_20px_rgba(76,29,149,0.12)]'
                  : isLight
                    ? 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/45'
                    : 'border-slate-800/90 bg-slate-900/45 hover:border-violet-400/20 hover:bg-slate-800/65';

                return (
                  <div key={chat.id} className={`group rounded-xl border p-3 transition-colors ${cardClass}`}>
                    {editingId === chat.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-violet-400 ${
                            isLight ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-700 bg-slate-950 text-slate-100'
                          }`}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void handleRename(chat.id);
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                          aria-label="Rename chat"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleRename(chat.id)}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            isLight ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-violet-500/80 text-white hover:bg-violet-400'
                          }`}
                          aria-label="Save chat name"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="m5 12 4 4L19 6" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectChat(chat);
                            onClose();
                          }}
                          className="min-w-0 flex-1 text-left"
                          aria-current={isCurrent ? 'page' : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isCurrent ? 'bg-violet-500' : isLight ? 'bg-slate-300' : 'bg-slate-600'}`} aria-hidden="true" />
                            <p className={`truncate text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{chat.title}</p>
                          </div>
                          <p className={`mt-1 pl-3.5 text-[10px] ${secondaryTextClass}`}>
                            {updatedAt} <span aria-hidden="true">·</span> {chat.messages.length} {chat.messages.length === 1 ? 'message' : 'messages'}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(chat.id);
                              setEditingTitle(chat.title);
                            }}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                              isLight ? 'text-slate-400 hover:bg-violet-100 hover:text-violet-700' : 'text-slate-500 hover:bg-violet-500/15 hover:text-violet-200'
                            }`}
                            aria-label={`Rename ${chat.title}`}
                            title="Rename"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m13.5 6.5 4 4M4 20l3.3-.7L19 7.6a2.1 2.1 0 00-3-3L4.3 16.3 4 20z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => void openExportModalForChat(chat.id)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                              isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                            aria-label={`Export ${chat.title}`}
                            title="Export"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v12m0 0 4-4m-4 4-4-4M21 21H3" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDelete(chat.id)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                              isLight ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-red-500/10 hover:text-red-300'
                            }`}
                            aria-label={`Delete ${chat.title}`}
                            title="Delete"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16m-10 4v5m4-5v5M9 4h6l1 3H8l1-3zm-2 3 .8 12h8.4L17 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`border-t px-5 py-3 ${sectionBorderClass}`}>
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-lg border py-2.5 text-xs font-medium transition-colors ${
              isLight
                ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800'
                : 'border-slate-700/80 bg-slate-800/60 text-slate-200 hover:border-violet-400/25 hover:bg-violet-500/10 hover:text-violet-100'
            }`}
          >
            Done
          </button>
        </div>

        <ExportModal
          isOpen={Boolean(exportModalState)}
          onClose={() => setExportModalState(null)}
          chat={exportModalState?.mode === 'single' ? exportModalState.chat ?? null : null}
          chats={exportModalState?.mode === 'all' ? chats : undefined}
          title={exportModalState?.mode === 'all' ? 'Export all chats' : undefined}
          theme={theme}
        />

        <input
          ref={fileInputRef}
          type="file"
          onChange={(event) => void handleImport(event)}
          accept=".json,.md,.markdown,.txt"
          className="hidden"
        />
      </div>
    </div>
  );
};

export default ChatHistory;
