import { useRef, useEffect, useState } from 'react';
import ActionMenu from './ActionMenu';

type MessageInputProps = {
  onSend: (message: string) => Promise<boolean> | boolean;
  onGenerateImage?: (prompt: string) => Promise<boolean> | boolean;
  isLoading?: boolean;
  placeholder?: string;
  actionMenuOpen?: boolean;
  onActionMenuOpen?: (open: boolean) => void;
  onAction?: (action: string, data?: unknown) => void;
  onVoiceInput?: () => Promise<void>;
  theme?: 'dark' | 'light';
  uploadedFile?: File | null;
  uploadProgress?: number;
  onRemoveUpload?: () => void;
};

function MessageInput({ onSend, onGenerateImage, isLoading = false, placeholder = 'Ask me anything...', actionMenuOpen, onActionMenuOpen, onAction, onVoiceInput, theme = 'dark', uploadedFile, uploadProgress = 100, onRemoveUpload }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [uncontrolledActionMenuOpen, setUncontrolledActionMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLight = theme === 'light';
  const isActionMenuOpen = actionMenuOpen ?? uncontrolledActionMenuOpen;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [message]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = message.trim();
      if (!trimmed) return;
      const success = await onSend(trimmed);
      if (success) setMessage('');
    }
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const success = await onSend(trimmed);
    if (success) setMessage('');
  };

  const handleGenerateImage = async () => {
    if (!message.trim() || !onGenerateImage) return;
    const success = await onGenerateImage(message.trim());
    if (success) setMessage('');
  };

  const toggleActionMenu = () => {
    const nextOpen = !isActionMenuOpen;
    if (actionMenuOpen === undefined) {
      setUncontrolledActionMenuOpen(nextOpen);
    }
    onActionMenuOpen?.(nextOpen);
  };

  const handleVoiceInput = async () => {
    if (!onVoiceInput || isLoading || isRecording) return;

    setIsRecording(true);
    try {
      await onVoiceInput();
    } finally {
      setIsRecording(false);
    }
  };

  // ref to detect outside clicks for action menu
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isActionMenuOpen) return;
      if (!containerRef.current) return;
      if (e.target instanceof Node && containerRef.current.contains(e.target)) return;
      // click outside
      if (actionMenuOpen === undefined) setUncontrolledActionMenuOpen(false);
      onActionMenuOpen?.(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActionMenuOpen, actionMenuOpen, onActionMenuOpen]);

  return (
    <div ref={containerRef} className={`shrink-0 border-t p-3 backdrop-blur-sm ${
      isLight
        ? 'border-slate-200 bg-white/95 shadow-[0_-8px_20px_rgba(15,23,42,0.05)]'
        : 'border-[#222A43] bg-[#0C1223]/95 shadow-[0_-8px_20px_rgba(2,6,23,0.2)]'
    }`}>
      {uploadedFile && (
        <div className={`mb-2 flex items-center gap-2 rounded-xl border p-2 text-xs ${isLight ? 'border-violet-200 bg-violet-50 text-slate-700' : 'border-violet-400/20 bg-violet-500/10 text-slate-200'}`}>
          {uploadedFile.type.startsWith('image/') ? <img src={URL.createObjectURL(uploadedFile)} alt="Upload preview" className="h-10 w-10 rounded-lg object-cover" /> : <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-[9px] font-bold ${isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/15 text-violet-200'}`}>FILE</div>}
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{uploadedFile.name}</p><p className="text-[10px] text-slate-500">{(uploadedFile.size / 1024).toFixed(1)} KB &middot; {uploadProgress}%</p><div className={`mt-1 h-1 overflow-hidden rounded ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}><div className="h-full bg-violet-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div></div>
          <button onClick={onRemoveUpload} className={`rounded p-1 text-slate-400 ${isLight ? 'hover:bg-violet-100 hover:text-violet-800' : 'hover:bg-violet-500/15 hover:text-violet-200'}`} title="Remove file" aria-label="Remove uploaded file">&times;</button>
        </div>
      )}
      <div className={`flex gap-2 rounded-2xl border p-2 ring-1 transition-shadow focus-within:ring-violet-500/35 ${
        isLight
          ? 'border-slate-300 bg-white shadow-sm ring-slate-200'
          : 'border-[#28314D] bg-[#11172A] ring-[#202944]'
      }`}>
        <div className="relative">
          <button
            onClick={toggleActionMenu}
            className={`rounded-xl p-2 transition-colors disabled:opacity-50 ${isLight ? 'text-slate-500 hover:bg-violet-50 hover:text-violet-700' : 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-200'}`}
            title="Add action"
            aria-label="Open action menu"
            disabled={isLoading}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <ActionMenu
            isOpen={isActionMenuOpen}
            onClose={() => {
              if (actionMenuOpen === undefined) setUncontrolledActionMenuOpen(false);
              onActionMenuOpen?.(false);
            }}
            onAction={(a, d) => onAction?.(a, d)}
            isLoading={isLoading}
            theme={theme}
          />
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={`flex-1 resize-none bg-transparent text-sm outline-none ${isLight ? 'text-slate-900 placeholder-slate-400' : 'text-slate-100 placeholder-slate-500'}`}
          rows={1}
          style={{ maxHeight: '100px' }}
        />

        <button
          onClick={handleGenerateImage}
          disabled={!message.trim() || isLoading || !onGenerateImage}
          className={`rounded-lg p-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            isLight
              ? 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'
              : 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-200'
          }`}
          title="Generate image"
          aria-label="Generate image"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5V6a2 2 0 012-2h14a2 2 0 012 2v10.5" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8l2.5 3.5L13 8l3.5 4.5H5" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17h8" />
          </svg>
        </button>

        <button
          onClick={() => void handleVoiceInput()}
          disabled={isLoading || isRecording}
          className={`rounded-lg p-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            isRecording
              ? 'bg-red-500/20 text-red-300 ring-1 ring-red-400/40 animate-pulse'
              : isLight
                ? 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'
                : 'text-slate-400 hover:bg-violet-500/10 hover:text-violet-200'
          }`}
          title={isRecording ? 'Listening...' : 'Voice input'}
          aria-label={isRecording ? 'Listening for voice input' : 'Start voice input'}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v2a7 7 0 01-14 0v-2M12 19v3m-4 0h8" />
          </svg>
        </button>

        <button
          onClick={handleSend}
          disabled={!message.trim() || isLoading}
          className="rounded-xl bg-violet-600 p-2 text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          title="Send message"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9-7-9-7-9 7 9 7z"
            />
          </svg>
        </button>
      </div>
      <p className={`mt-2 text-center text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
        Press <span className="font-mono">Enter</span> to send &middot; <span className="font-mono">Shift + Enter</span> for new line
      </p>
    </div>
  );
}

export default MessageInput;
