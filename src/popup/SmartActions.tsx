import { useEffect, useState } from 'react';
import type { ActionContext } from '../actions/types';
import { getAvailableActions, registerAction, runAction } from '../actions/actionRegistry';
import { summarizePage, copyPageUrl, copySelectedText } from '../actions/genericActions';
import githubActions from '../actions/adapters/githubActions';

async function buildContext(): Promise<ActionContext> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true } as any);
    const tab = tabs?.[0];
    if (!tab || typeof tab.id !== 'number') return { title: 'Unknown', url: '', hostname: '' };
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' } as any) as any;
    const payload = response?.payload || {};
    const url = payload.url || tab.url || '';
    return {
      title: payload.title || tab.title || 'Untitled',
      url,
      hostname: (() => { try { return new URL(url).hostname } catch { return '' } })(),
      selectedText: undefined,
      pageText: payload.text || undefined,
      controls: payload.controls || undefined,
    };
  } catch (error) {
    return { title: 'Unknown', url: '', hostname: '' };
  }
}

function SmartActions({ pageContext }: { pageContext?: any }) {
  const [actions, setActions] = useState<any[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    // Register default actions and adapters once
    registerAction(summarizePage as any);
    registerAction(copyPageUrl as any);
    registerAction(copySelectedText as any);
    githubActions.forEach((a) => registerAction(a as any));
  }, []);

  useEffect(() => {
    (async () => {
      if (!pageContext) {
        setActions([]);
        return;
      }
      // Convert pageContext to ActionContext shape expected
      const ctx: ActionContext = {
        title: pageContext.title || '',
        url: pageContext.url || '',
        hostname: pageContext.url ? new URL(pageContext.url).hostname : '',
        selectedText: pageContext.selectedText,
        pageText: pageContext.text,
        controls: pageContext.controls,
      };
      const available = getAvailableActions(ctx);
      // show up to 6 actions, prefer site-specific first
      setActions(available.slice(0, 6));
    })();
  }, [pageContext]);

  const run = async (actionId: string, requiresConfirmation = false) => {
    if (!pageContext) return;
    setStatusMap((s) => ({ ...s, [actionId]: 'running' }));
    try {
      // Build ActionContext from pageContext
      const ctx: ActionContext = {
        title: pageContext.title || '',
        url: pageContext.url || '',
        hostname: pageContext.url ? new URL(pageContext.url).hostname : '',
        selectedText: pageContext.selectedText,
        pageText: pageContext.text || pageContext.pageText,
        controls: pageContext.controls,
      };

      const result = await runAction(actionId, ctx, requiresConfirmation ? 'allow-once' : 'allow-once');
      if (result.ok) {
        setStatusMap((s) => ({ ...s, [actionId]: 'completed' }));
        // If the action returned details (e.g., AI generated text), publish it to the popup chat via runtime message
        if (result.details && typeof result.details === 'string') {
          // let the background/popup handler decide how to add to chat
          void chrome.runtime.sendMessage({ type: 'ACTION_RESULT', actionId, result: result.details }).catch(() => null);
        }
      } else {
        setStatusMap((s) => ({ ...s, [actionId]: 'failed' }));
      }
    } catch (error) {
      setStatusMap((s) => ({ ...s, [actionId]: 'failed' }));
    }
  };

  if (!actions || actions.length === 0) return null;

  return (
    <section aria-label="Smart Actions" className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Smart Actions</h3>
        <button type="button" className="text-[11px] underline" onClick={async () => {
          // Refresh page context and recompute actions
          const ctx = pageContext ? pageContext : await buildContext();
          const ac: ActionContext = {
            title: ctx.title || '',
            url: ctx.url || '',
            hostname: ctx.url ? new URL(ctx.url).hostname : '',
            selectedText: ctx.selectedText,
            pageText: ctx.text || ctx.pageText,
            controls: ctx.controls,
          };
          setActions(getAvailableActions(ac));
        }}>Refresh</button>
      </div>
      <p className="text-[11px] text-slate-400">{actions.length} action(s) available on this page</p>
      <div className="grid gap-2">
        {actions.map((action: any) => (
          <div key={action.id} className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <div className="flex items-center gap-2">
                <img src={action.icon ?? '/icons/icon32.png'} alt="" className="h-6 w-6 rounded-md object-contain" />
                <div>
                  <div className="text-sm font-semibold">{action.title}</div>
                  <div className="text-[11px] text-slate-400">{action.description}</div>
                </div>
              </div>
            </div>
            <div>
              <button type="button" onClick={() => run(action.id, action.requiresConfirmation)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs text-white">Run</button>
              <div className="mt-1 text-[11px]">{statusMap[action.id]}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default SmartActions;