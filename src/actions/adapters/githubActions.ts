import type { SmartAction, ActionContext, ActionResult } from '../types';

export const githubActions: SmartAction[] = [
  {
    id: 'github-copy-repo-url',
    title: 'Copy repo URL',
    description: 'Copy the current repository URL to the clipboard.',
    category: 'site-specific',
    supportedHostnames: ['github.com'],
    risk: 'low',
    requiresConfirmation: false,
    isAvailable: (context: ActionContext) => /github\.com\/.+\/.+/i.test(context.url),
    execute: async (context: ActionContext): Promise<ActionResult> => {
      try {
        await navigator.clipboard.writeText(context.url);
        return { ok: true, message: 'Repository URL copied' };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  },
  {
    id: 'github-summarize-readme',
    title: 'Summarize README',
    description: 'Summarize the repository README if present.',
    category: 'site-specific',
    supportedHostnames: ['github.com'],
    risk: 'low',
    requiresConfirmation: false,
    isAvailable: (context: ActionContext) => /github\.com\/.+\/.+/i.test(context.url) && !!context.pageText && context.pageText.length > 200,
    execute: async (context: ActionContext): Promise<ActionResult> => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'summarize', payload: { text: context.pageText } }) as { ok?: boolean; result?: string; error?: string };
        if (!response?.ok) return { ok: false, message: response?.error || 'Could not summarize README' };
        return { ok: true, message: 'README summarized', details: response.result };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  },
];

export default githubActions;