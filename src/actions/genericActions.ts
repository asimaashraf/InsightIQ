import type { SmartAction, ActionContext, ActionResult } from './types';

export const summarizePage: SmartAction = {
  id: 'summarize-page',
  title: 'Summarize page',
  description: 'Create a concise summary of the current page.',
  category: 'ai-content',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.pageText && context.pageText.trim().length > 50,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'summarize', payload: { text: context.pageText } }) as { ok?: boolean; result?: string; error?: string };
      if (!response?.ok) return { ok: false, message: response?.error || 'AI summarization failed' };
      return { ok: true, message: response.result || 'Summary generated', details: response.result };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const translatePage: SmartAction = {
  id: 'translate-page',
  title: 'Translate Page',
  description: 'Translate the current webpage.',
  category: 'ai-content',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.pageText && context.pageText.trim().length > 50,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      const payloadText = `Translate the following webpage content:\n\n${context.pageText}`;
      const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'translate-page', payload: { text: payloadText } }) as { ok?: boolean; result?: string; error?: string };
      if (!response?.ok) return { ok: false, message: response?.error || 'Translation failed' };
      return { ok: true, message: response.result || 'Translation generated', details: response.result };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const createStudyNotes: SmartAction = {
  id: 'create-study-notes',
  title: 'Create Study Notes',
  description: 'Create study notes from this webpage.',
  category: 'ai-content',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.pageText && context.pageText.trim().length > 200,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      const payloadText = `Create study notes from the following webpage content:\n\n${context.pageText}`;
      const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'create-study-notes', payload: { text: payloadText } }) as { ok?: boolean; result?: string; error?: string };
      if (!response?.ok) return { ok: false, message: response?.error || 'Could not create study notes' };
      return { ok: true, message: response.result || 'Study notes generated', details: response.result };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const generateFaqs: SmartAction = {
  id: 'generate-faqs',
  title: 'Generate FAQs',
  description: 'Generate FAQs from this webpage.',
  category: 'ai-content',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.pageText && context.pageText.trim().length > 200,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      const payloadText = `Generate frequently asked questions (FAQs) from the following webpage content:\n\n${context.pageText}`;
      const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'generate-faqs', payload: { text: payloadText } }) as { ok?: boolean; result?: string; error?: string };
      if (!response?.ok) return { ok: false, message: response?.error || 'Could not generate FAQs' };
      return { ok: true, message: response.result || 'FAQs generated', details: response.result };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const findImportantTerms: SmartAction = {
  id: 'find-important-terms',
  title: 'Find Important Terms',
  description: 'Find important terms and keywords on this page.',
  category: 'ai-content',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.pageText && context.pageText.trim().length > 150,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      const payloadText = `Identify the important terms and keywords from the following webpage content:\n\n${context.pageText}`;
      const response = await chrome.runtime.sendMessage({ type: 'RUN_AI_ACTION', action: 'find-important-terms', payload: { text: payloadText } }) as { ok?: boolean; result?: string; error?: string };
      if (!response?.ok) return { ok: false, message: response?.error || 'Could not identify terms' };
      return { ok: true, message: response.result || 'Important terms identified', details: response.result };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const copyPageUrl: SmartAction = {
  id: 'copy-page-url',
  title: 'Copy page URL',
  description: 'Copy the current page URL to clipboard.',
  category: 'browser-exec',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.url,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      await navigator.clipboard.writeText(context.url);
      return { ok: true, message: 'Page URL copied to clipboard' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

export const copySelectedText: SmartAction = {
  id: 'copy-selected-text',
  title: 'Copy selection',
  description: 'Copy the currently selected text to the clipboard.',
  category: 'browser-exec',
  risk: 'low',
  requiresConfirmation: false,
  isAvailable: (context: ActionContext) => !!context.selectedText && context.selectedText.trim().length > 0,
  execute: async (context: ActionContext): Promise<ActionResult> => {
    try {
      await navigator.clipboard.writeText(context.selectedText || '');
      return { ok: true, message: 'Selected text copied' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  },
};

const actions: SmartAction[] = [
  summarizePage,
  translatePage,
  createStudyNotes,
  generateFaqs,
  findImportantTerms,
  copyPageUrl,
  copySelectedText,
];
export default actions;