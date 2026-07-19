
export type HeaderProps = {
  onNewChat: () => void;
  onSettings: () => void;
  onHistory?: () => void;
  onOpenPopup?: () => void;
  onOpenSidePanel?: () => void;
  onSmartActions?: () => void;
  isConnected: boolean;
  theme?: 'dark' | 'light';
  /** Optional, live information about the tab InsightIQ is currently reading. */
  pageTitle?: string;
  hostname?: string;
  characterCount?: number;
  connectionStatus?: string;
  onRefreshPage?: () => void;
  isRefreshing?: boolean;
};

function Header({
  onNewChat,
  onSettings,
  onHistory,
  onOpenPopup,
  onOpenSidePanel,
  onSmartActions,
  isConnected,
  theme = 'dark',
  pageTitle,
  hostname,
  characterCount,
  connectionStatus,
  onRefreshPage,
  isRefreshing = false,
}: HeaderProps) {
  const isLight = theme === 'light';
  const hasPageContext = pageTitle !== undefined
    || hostname !== undefined
    || characterCount !== undefined
    || connectionStatus !== undefined
    || onRefreshPage !== undefined;
  const toolbarButtonClass = isLight
    ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'
    : 'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/80 text-slate-300 shadow-sm shadow-slate-950/20 transition-colors hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400';
  const formattedCharacterCount = new Intl.NumberFormat().format(Math.max(0, characterCount ?? 0));
  const contextStatus = connectionStatus || (isRefreshing ? 'Reading page...' : 'Ready');

  return (
    <header className={`sticky top-0 z-20 shrink-0 border-b px-4 py-3 backdrop-blur-sm ${
      isLight
        ? 'border-slate-200 bg-white/95 shadow-sm shadow-slate-200/70'
        : 'border-slate-800/90 bg-[#081225]/95 shadow-sm shadow-slate-950/40'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-transparent shadow-sm shadow-violet-950/30">
            <img src="/icons/icon32.png" alt="InsightIQ" className="h-8 w-8 rounded-md object-contain" />
          </div>
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${isLight ? 'text-violet-700' : 'text-violet-300'}`}>InsightIQ</p>
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <p className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isConnected ? 'Connected' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {onOpenSidePanel && (
            <button
              type="button"
              onClick={onOpenSidePanel}
              className={toolbarButtonClass}
              title="Open side panel"
              aria-label="Open side panel"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6v6m0-6-8 8M5 7v12a2 2 0 002 2h12a2 2 0 002-2v-5" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={onHistory}
            className={toolbarButtonClass}
            title="Chat history"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className={toolbarButtonClass}
            title="New chat"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {onOpenPopup && (
            <button
              type="button"
              onClick={onOpenPopup}
              className={toolbarButtonClass}
              title="Open compact window"
              aria-label="Open compact window"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6v6m0-6-8 8M5 7v12a2 2 0 002 2h12a2 2 0 002-2v-5" />
              </svg>
            </button>
          )}
          {onSmartActions && (
            <button
              type="button"
              onClick={onSmartActions}
              className={toolbarButtonClass}
              title="Smart Actions"
              aria-label="Smart Actions"
            >
              <span className="text-base">✨</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSettings}
            className={toolbarButtonClass}
            title="Settings"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {hasPageContext && (
        <section
          className={`mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm ${
            isLight
              ? 'border-slate-200 bg-slate-50/90 text-slate-700 shadow-slate-200/60'
              : 'border-slate-700/80 bg-slate-900/70 text-slate-200 shadow-slate-950/25'
          }`}
          aria-label="Current webpage context"
        >
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/15 text-violet-300'
          }`} aria-hidden="true">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.6 9h16.8M3.6 15h16.8M12 3c2.1 2.5 3.2 5.5 3.2 9s-1.1 6.5-3.2 9c-2.1-2.5-3.2-5.5-3.2-9S9.9 5.5 12 3z" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs font-semibold leading-4 ${isLight ? 'text-slate-900' : 'text-slate-100'}`} title={pageTitle || 'No page title available'}>
              {pageTitle || 'No page detected'}
            </p>
            <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className="max-w-[112px] truncate" title={hostname || 'Unknown host'}>{hostname || 'Unknown host'}</span>
              <span className={`h-1 w-1 shrink-0 rounded-full ${isLight ? 'bg-slate-300' : 'bg-slate-600'}`} aria-hidden="true" />
              <span>{formattedCharacterCount} chars</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5" aria-live="polite">
              <span className={`h-1.5 w-1.5 rounded-full ${
                isRefreshing ? 'animate-pulse bg-amber-400' : isConnected ? 'bg-emerald-500' : 'bg-slate-400'
              }`} />
              <span className={`text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{contextStatus}</span>
            </div>
          </div>

          {onRefreshPage && (
            <button
              type="button"
              onClick={onRefreshPage}
              disabled={isRefreshing}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-wait disabled:opacity-60 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500'
                  : 'border-slate-700/90 bg-slate-800 text-slate-300 shadow-sm hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400'
              }`}
              title={isRefreshing ? 'Reading current page' : 'Re-read current page'}
              aria-label={isRefreshing ? 'Reading current page' : 'Re-read current page'}
            >
              <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5.5 15A7 7 0 0018.5 17M18.5 9A7 7 0 005.5 7" />
              </svg>
            </button>
          )}
        </section>
      )}
    </header>
  );
}

export default Header;
