import { useEffect, useRef } from 'react';
import type { PageContent } from '../utils/page';
import type { ActionContext } from '../actions/types';
import { getAvailableActions, registerAction, runAction } from '../actions/actionRegistry';
import genericActions from '../actions/genericActions';
import githubActions from '../actions/adapters/githubActions';

import type { SmartAction } from '../actions/types';

type SmartActionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: PageContent | null;
  theme?: 'dark' | 'light';
  /** Called immediately when the user selects an action (modal can close right away).
   * The modal will continue executing the action in the background and will broadcast
   * results via the ACTION_RESULT runtime message so popups can append the assistant reply.
   */
  onSelectAction?: (action: SmartAction) => void;
};

function SmartActionsModal({ isOpen, onClose, pageContext, theme = 'dark', onSelectAction }: SmartActionsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Register default actions and adapters once
    genericActions.forEach((a) => registerAction(a as any));
    githubActions.forEach((a) => registerAction(a as any));
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !pageContext) {
    return null;
  }

  const ctx: ActionContext = {
    title: pageContext.title || '',
    url: pageContext.url || '',
    hostname: pageContext.url ? new URL(pageContext.url).hostname : '',
    selectedText: undefined,
    pageText: pageContext.text,
    controls: pageContext.controls,
  };

  // Only show the curated advanced Smart Actions in the requested order.
  const desiredOrder = [
    'translate-page',
    'create-study-notes',
    'generate-faqs',
    'find-important-terms',
    'copy-page-url',
  ];
  const allAvailable = getAvailableActions(ctx);
  const availableActions = desiredOrder.map((id) => allAvailable.find((a) => a.id === id)).filter(Boolean) as SmartAction[];

  const handleRunAction = async (actionId: string, requiresConfirmation = false) => {
    try {
      const result = await runAction(actionId, ctx, requiresConfirmation ? 'allow-once' : 'allow-once');
      // Broadcast result so any open popup/sidepanel can append the assistant message.
      if (result.ok && result.details && typeof result.details === 'string') {
        void chrome.runtime.sendMessage({ type: 'ACTION_RESULT', actionId, result: result.details }).catch(() => null);
      }
    } catch (error) {
      console.error('[InsightIQ] Smart Action failed:', error);
    }
  };

  const isLight = theme === 'light';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Panel */}
      <div
        ref={modalRef}
        className={`fixed right-4 top-16 z-40 w-80 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border shadow-xl ${
          isLight
            ? 'border-slate-200 bg-white'
            : 'border-slate-700/80 bg-slate-900/95 backdrop-blur-sm'
        }`}
      >
        <div className={`sticky top-0 border-b px-4 py-3 ${isLight ? 'border-slate-200 bg-white/95' : 'border-slate-700/80 bg-slate-900/95'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              ✨ Smart Actions
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2 p-3">
          {availableActions.length === 0 ? (
            <div className={`py-6 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              No actions available for this page.
            </div>
          ) : (
            availableActions.map((action: any) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  // Notify parent immediately and close the modal; run the action in the background.
                  onSelectAction?.(action as SmartAction);
                  onClose();
                  // For AI content actions, the popup will perform the AI request itself
                  // so skip running the action here to avoid duplicate requests. For
                  // browser-exec and site-specific actions, run them in the background.
                  if (action.category !== 'ai-content') {
                    void handleRunAction(action.id, action.requiresConfirmation);
                  }
                }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  isLight
                    ? 'border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-900'
                    : 'border-slate-700/60 hover:border-violet-400/50 hover:bg-violet-500/10 text-slate-100'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {action.icon && (
                    <img src={action.icon} alt="" className="h-5 w-5 rounded-md object-contain flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{action.title}</p>
                    <p className={`mt-0.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default SmartActionsModal;
