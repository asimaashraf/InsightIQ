import { useEffect, useRef, type ChangeEvent, type ReactNode } from 'react';
import { readClipboard, validateFileType } from '../utils/media';

type ActionMenuProps = {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string, data?: unknown) => void;
  isLoading?: boolean;
  theme?: 'dark' | 'light';
};

type ActionIconName = 'upload' | 'scan' | 'camera' | 'clipboard';

function ActionIcon({ name }: { name: ActionIconName }) {
  const paths: Record<ActionIconName, ReactNode> = {
    upload: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0L8 8m4-4l4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" />
      </>
    ),
    scan: (
      <>
        <circle cx="11" cy="11" r="5.5" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeWidth={1.8} d="m16 16 3.5 3.5M3.5 8V5.5A2 2 0 015.5 3.5H8M16 3.5h2.5a2 2 0 012 2V8M20.5 16v2.5a2 2 0 01-2 2H16M8 20.5H5.5a2 2 0 01-2-2V16" />
      </>
    ),
    camera: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8.5A2.5 2.5 0 016.5 6H8l1.2-1.8h5.6L16 6h1.5A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5v-8z" />
        <circle cx="12" cy="12.5" r="3" strokeWidth={1.8} />
      </>
    ),
    clipboard: (
      <>
        <rect x="6" y="5" width="12" height="15" rx="2" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5V4a1.5 1.5 0 013 0v1m-3 5h6m-6 4h6" />
      </>
    ),
  };

  return (
    <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

type ContextActionProps = {
  label: string;
  description: string;
  icon: ActionIconName;
  onClick: () => void;
  disabled: boolean;
  isLight: boolean;
  actionClass: string;
  iconClass: string;
};

function ContextAction({ label, description, icon, onClick, disabled, isLight, actionClass, iconClass }: ContextActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${actionClass}`}
      role="menuitem"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconClass}`}>
        <ActionIcon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{label}</span>
        <span className={`mt-0.5 block truncate text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{description}</span>
      </span>
      <svg className={`h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 5 7 7-7 7" />
      </svg>
    </button>
  );
}

function ActionMenu({ isOpen, onClose, onAction, isLoading = false, theme = 'dark' }: ActionMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';
  const menuClass = isLight
    ? 'border-slate-200/90 bg-white text-slate-800 shadow-[0_18px_42px_rgba(15,23,42,0.16)]'
    : 'border-violet-400/15 bg-[#11182d] text-slate-100 shadow-[0_18px_44px_rgba(2,6,23,0.5)]';
  const actionClass = isLight
    ? 'border-slate-100 hover:border-violet-200 hover:bg-violet-50/80 focus-visible:border-violet-400'
    : 'border-slate-800/90 hover:border-violet-400/25 hover:bg-violet-500/10 focus-visible:border-violet-400';
  const iconClass = isLight
    ? 'border-violet-100 bg-violet-50 text-violet-700'
    : 'border-violet-400/15 bg-violet-500/10 text-violet-300';

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && validateFileType(file)) {
      onAction('upload-file', file);
    } else if (file) {
      alert('Unsupported file type. Please use PDF, DOCX, TXT, CSV, or image files.');
    }
    onClose();
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await readClipboard();
      onAction('paste-clipboard', text);
    } catch (error) {
      console.error('Clipboard read failed:', error);
    }
    onClose();
  };

  return (
    <div
      className={`absolute left-0 z-50 w-[260px] rounded-2xl border p-2 ${menuClass} transition-all duration-150 ease-out`}
      role="menu"
      aria-label="Add context"
      style={{ bottom: 'calc(100% + 12px)', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', overflowX: 'hidden' }}
    >
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <div>
          <p className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Add context</p>
          <p className={`mt-0.5 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Give InsightIQ more to work with</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
            isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
          }`}
          aria-label="Close add context menu"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="space-y-1" role="none">
        <ContextAction
          label="Upload file"
          description="Add a document or image to this chat"
          icon="upload"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          isLight={isLight}
          actionClass={actionClass}
          iconClass={iconClass}
        />
        <ContextAction
          label="Analyze current page"
          description="Read the active webpage again"
          icon="scan"
          onClick={() => {
            onAction('analyze-page', null);
            onClose();
          }}
          disabled={isLoading}
          isLight={isLight}
          actionClass={actionClass}
          iconClass={iconClass}
        />
        <ContextAction
          label="Take screenshot"
          description="Capture the visible tab"
          icon="camera"
          onClick={() => {
            onAction('screenshot', null);
            onClose();
          }}
          disabled={isLoading}
          isLight={isLight}
          actionClass={actionClass}
          iconClass={iconClass}
        />
        <ContextAction
          label="Paste clipboard"
          description="Use copied text as context"
          icon="clipboard"
          onClick={() => void handlePasteClipboard()}
          disabled={isLoading}
          isLight={isLight}
          actionClass={actionClass}
          iconClass={iconClass}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
        className="hidden"
      />
    </div>
  );
}

export default ActionMenu;
