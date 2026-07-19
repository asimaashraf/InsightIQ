import type { PageAction } from '../utils/page';

export type ActionConfirmationState = 'pending' | 'success' | 'failure' | 'blocked';

export type ActionConfirmationCardProps = {
  /** The single page action the user is being asked to review. */
  action: PageAction;
  /** A human-readable description of the element or area the action affects. */
  targetDescription: string;
  /** Why InsightIQ proposed this action. */
  reason: string;
  /** The safety rule or consequence the user should review before allowing it. */
  safetyWarning: string;
  /** The current result of the proposed action. */
  state: ActionConfirmationState;
  /** The readable execution error, when the action fails. */
  error?: string;
  theme?: 'dark' | 'light';
  onCancel?: () => void;
  onAllowOnce?: () => void;
  onRetry?: () => void;
};

function getActionLabel(action: PageAction): string {
  switch (action.type) {
    case 'click':
      return 'Click element';
    case 'type':
      return 'Type text';
    case 'scroll':
      return `Scroll ${action.direction}`;
  }
}

function getFallbackTarget(action: PageAction): string {
  if (action.type === 'scroll') {
    return 'The current webpage';
  }

  return action.description || 'The selected webpage control';
}

function getStateCopy(state: ActionConfirmationState): { title: string; description: string } {
  switch (state) {
    case 'pending':
      return {
        title: 'Review proposed action',
        description: 'InsightIQ will not make this change unless you allow it once.',
      };
    case 'success':
      return {
        title: 'Action completed',
        description: 'The requested webpage action was completed.',
      };
    case 'failure':
      return {
        title: 'Action could not be completed',
        description: 'Nothing else was changed. You can review the error and try again.',
      };
    case 'blocked':
      return {
        title: 'Action blocked for your safety',
        description: 'InsightIQ did not perform this action.',
      };
  }
}

function StateIcon({ state }: { state: ActionConfirmationState }) {
  const iconClass = 'h-5 w-5';

  if (state === 'success') {
    return (
      <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24">
        <path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
      </svg>
    );
  }

  if (state === 'failure') {
    return (
      <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.5v5M12 16.25h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
      </svg>
    );
  }

  if (state === 'blocked') {
    return (
      <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24">
        <path d="M12 3.75 20 7v5.25c0 4.35-3.1 7.45-8 8.9-4.9-1.45-8-4.55-8-8.9V7l8-3.25Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24">
      <path d="M12 3.5 20 7v5.2c0 4.4-3.05 7.45-8 8.95-4.95-1.5-8-4.55-8-8.95V7l8-3.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M12 8v4.25M12 16h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
    </svg>
  );
}

function ActionConfirmationCard({
  action,
  targetDescription,
  reason,
  safetyWarning,
  state,
  error,
  theme = 'dark',
  onCancel,
  onAllowOnce,
  onRetry,
}: ActionConfirmationCardProps) {
  const isLight = theme === 'light';
  const copy = getStateCopy(state);
  const statusTone =
    state === 'success'
      ? isLight
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      : state === 'failure' || state === 'blocked'
        ? isLight
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-red-400/30 bg-red-400/10 text-red-200'
        : isLight
          ? 'border-violet-200 bg-violet-50 text-violet-900'
          : 'border-violet-400/30 bg-violet-400/10 text-violet-100';
  const cardClass = isLight
    ? 'border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-200/70'
    : 'border-slate-700/70 bg-slate-900/95 text-slate-100 shadow-md shadow-slate-950/30';
  const mutedTextClass = isLight ? 'text-slate-600' : 'text-slate-300';
  const detailsClass = isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700/60 bg-slate-950/35';
  const labelClass = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <section
      aria-labelledby="action-confirmation-title"
      className={`overflow-hidden rounded-2xl border ${cardClass}`}
      data-action-state={state}
    >
      <div className="flex items-start gap-3 px-4 pb-3.5 pt-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm ${statusTone}`}>
          <StateIcon state={state} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${labelClass}`}>Webpage action</p>
          <h2 className="mt-0.5 text-sm font-semibold tracking-tight" id="action-confirmation-title">
            {copy.title}
          </h2>
          <p className={`mt-1 text-xs leading-relaxed ${mutedTextClass}`}>{copy.description}</p>
        </div>
      </div>

      <dl className={`mx-4 grid overflow-hidden rounded-xl border text-xs shadow-sm ${detailsClass}`}>
        <div className={`border-b px-3 py-2.5 ${isLight ? 'border-slate-200' : 'border-slate-700/70'}`}>
          <dt className={`text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>Action type</dt>
          <dd className="mt-1 font-semibold">{getActionLabel(action)}</dd>
        </div>
        <div className={`border-b px-3 py-2.5 ${isLight ? 'border-slate-200' : 'border-slate-700/70'}`}>
          <dt className={`text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>Target</dt>
          <dd className="mt-1 break-words font-medium">{targetDescription || getFallbackTarget(action)}</dd>
        </div>
        <div className={`border-b px-3 py-2.5 ${isLight ? 'border-slate-200' : 'border-slate-700/70'}`}>
          <dt className={`text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>Reason</dt>
          <dd className={`mt-1 break-words leading-relaxed ${mutedTextClass}`}>{reason || 'No reason was supplied.'}</dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className={`text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>Safety warning</dt>
          <dd className={`mt-1 break-words leading-relaxed ${mutedTextClass}`}>{safetyWarning || 'Review this action before allowing it.'}</dd>
        </div>
      </dl>

      {state === 'failure' && (
        <div
          aria-live="assertive"
          className={`mx-4 mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
            isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-400/30 bg-red-500/10 text-red-100'
          }`}
        >
          <span className="font-semibold">Error: </span>
          {error || 'The action failed without a readable error.'}
        </div>
      )}

      {state === 'blocked' && error && (
        <div
          aria-live="polite"
          className={`mx-4 mt-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
            isLight ? 'border-red-200 bg-red-50 text-red-800' : 'border-red-400/30 bg-red-500/10 text-red-100'
          }`}
        >
          <span className="font-semibold">Blocked: </span>
          {error}
        </div>
      )}

      <div className={`mt-4 flex items-center justify-end gap-2 border-t px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50/70' : 'border-slate-700/70 bg-slate-950/25'}`}>
        {state === 'pending' && (
          <>
            <button
              className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isLight
                  ? 'text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
                  : 'text-slate-200 hover:bg-slate-800 focus-visible:ring-offset-slate-900'
              }`}
              disabled={!onCancel}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`inline-flex h-8 items-center justify-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-slate-900'
              }`}
              disabled={!onAllowOnce}
              onClick={onAllowOnce}
              type="button"
            >
              Allow once
            </button>
          </>
        )}

        {state === 'failure' && (
          <>
            {onCancel && (
              <button
                className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                  isLight
                    ? 'text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
                    : 'text-slate-200 hover:bg-slate-800 focus-visible:ring-offset-slate-900'
                }`}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            )}
            <button
              className={`inline-flex h-8 items-center justify-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isLight ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-slate-900'
              }`}
              disabled={!onRetry}
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          </>
        )}

        {(state === 'success' || state === 'blocked') && onCancel && (
          <button
            className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
              isLight
                ? 'text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
                : 'text-slate-200 hover:bg-slate-800 focus-visible:ring-offset-slate-900'
            }`}
            onClick={onCancel}
            type="button"
          >
            Dismiss
          </button>
        )}
      </div>
    </section>
  );
}

export default ActionConfirmationCard;
