type QuickActionId = 'summarize' | 'extract' | 'explain' | 'ask';

type EmptyStateProps = {
  onQuickAction: (action: string) => void;
  theme?: 'dark' | 'light';
};

type QuickAction = {
  action: QuickActionId;
  title: string;
  description: string;
};

const quickActions: QuickAction[] = [
  {
    action: 'summarize',
    title: 'Summarize',
    description: 'Get a concise overview',
  },
  {
    action: 'extract',
    title: 'Key Points',
    description: 'Pull out what matters',
  },
  {
    action: 'explain',
    title: 'Explain',
    description: 'Make this page clearer',
  },
  {
    action: 'ask',
    title: 'Ask About Page',
    description: 'Ask InsightIQ anything',
  },
];

function QuickActionIcon({ action }: { action: QuickActionId }) {
  const commonProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };

  if (action === 'summarize') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" {...commonProps}>
        <path d="M6 4.75h12M6 9.5h12M6 14.25h7M6 19h9" />
      </svg>
    );
  }

  if (action === 'extract') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" {...commonProps}>
        <path d="M5 6.5h14M5 12h14M5 17.5h8" />
        <path d="m17 16.5 1.5 1.5L21 14.5" />
      </svg>
    );
  }

  if (action === 'explain') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" {...commonProps}>
        <path d="M9.5 18.5h5" />
        <path d="M10 21h4" />
        <path d="M8.8 15.6A6.5 6.5 0 1 1 15.6 15c-.9.72-1.1 1.34-1.1 2H9.5c0-.74-.15-1.18-.7-1.4Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" {...commonProps}>
      <path d="M20 11.5a7.4 7.4 0 0 1-7.5 7.25 8.5 8.5 0 0 1-3.15-.62L4 20l1.75-4.72A7 7 0 0 1 5 12a7.4 7.4 0 0 1 7.5-7.25A7.4 7.4 0 0 1 20 11.5Z" />
      <path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" />
    </svg>
  );
}

function EmptyState({ onQuickAction, theme = 'dark' }: EmptyStateProps) {
  const isLight = theme === 'light';

  return (
    <section className="flex min-h-full flex-col justify-center px-4 py-6 text-left" aria-label="Page assistant welcome">
      <div className="mb-5">
        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${
          isLight
            ? 'bg-violet-50 text-violet-700 ring-violet-200'
            : 'bg-violet-500/15 text-violet-300 ring-violet-400/20'
        }`}>
          <img src="/icons/icon48.png" alt="InsightIQ" className="h-6 w-6 rounded-md object-contain" />
        </div>
        <h2 className={`text-lg font-semibold tracking-tight ${isLight ? 'text-slate-950' : 'text-slate-50'}`}>
          How can I help with this page?
        </h2>
        <p className={`mt-1.5 max-w-sm text-sm leading-5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          Use a quick action or ask a question about the page you are viewing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5" aria-label="Quick actions">
        {quickActions.map((item) => (
          <button
            key={item.action}
            type="button"
            onClick={() => onQuickAction(item.action)}
            className={`group min-h-[94px] rounded-2xl border p-3 text-left shadow-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 active:scale-[0.98] ${
              isLight
                ? 'border-slate-200 bg-white text-slate-900 hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-md focus-visible:ring-offset-white'
                : 'border-slate-700/80 bg-slate-900/60 text-slate-100 shadow-slate-950/20 hover:border-violet-400/50 hover:bg-violet-500/10 hover:shadow-md hover:shadow-violet-950/20 focus-visible:ring-offset-[#081225]'
            }`}
          >
            <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
              isLight
                ? 'bg-violet-50 text-violet-700 group-hover:bg-violet-100'
                : 'bg-violet-500/15 text-violet-300 group-hover:bg-violet-500/20'
            }`}>
              <QuickActionIcon action={item.action} />
            </span>
            <span className="block text-sm font-semibold leading-4">{item.title}</span>
            <span className={`mt-1 block text-[11px] leading-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {item.description}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default EmptyState;
