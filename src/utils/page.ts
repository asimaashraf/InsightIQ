export type PageControl = {
  id: string;
  tag: string;
  label: string;
  type?: string;
};

export type PageContent = {
  title: string;
  description: string;
  text: string;
  url: string;
  controls: PageControl[];
};

export type PageAction =
  | { type: 'click'; targetId: string; description?: string }
  | { type: 'type'; targetId: string; text: string; description?: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number; description?: string };

export type ActionExecutionConfirmation = 'allow-once';

const DESTRUCTIVE_ACTION_PATTERN = /delete|remove|destroy|erase|discard|unsubscribe|sign[ _-]*out|log[ _-]*out|cancel|revoke|reset|pay|purchase|checkout|submit[ _-]*(order|payment|form)|confirm[ _-]*(purchase|payment|delete)/i;

function extractPageContextInPage(): PageContent {
  const controlSelector = 'a[href], button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"]';
  const controls = Array.from(document.querySelectorAll<HTMLElement>(controlSelector))
    .filter((element) => element.offsetParent !== null && !element.hasAttribute('disabled'))
    .slice(0, 80)
    .map((element, index) => {
      const id = `insightiq-control-${index}`;
      element.dataset.insightiqId = id;
      const label = (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('title') || element.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      return { id, tag: element.tagName.toLowerCase(), label, type: element instanceof HTMLInputElement ? element.type : undefined };
    });

  // innerText contains rendered, user-visible text; scripts and styles do not
  // contribute to it. The extra removal protects pages that expose such nodes.
  const ignored = Array.from(document.querySelectorAll('script, style, noscript'));
  const previousDisplay = ignored.map((element) => ({ element, display: (element as HTMLElement).style.display }));
  previousDisplay.forEach(({ element }) => { (element as HTMLElement).style.display = 'none'; });
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  previousDisplay.forEach(({ element, display }) => { (element as HTMLElement).style.display = display; });

  return {
    title: document.title || 'Untitled page',
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    text,
    url: window.location.href,
    controls,
  };
}

function executeActionsInPage(actions: PageAction[]): string[] {
  const findControl = (targetId: string) => document.querySelector<HTMLElement>(`[data-insightiq-id="${targetId}"]`);
  const sensitiveFieldPattern = /password|passcode|secret|token|otp|one[- ]?time|credit|card|cvv|cvc|ssn|bank|account[ _-]*number/i;

  const isVisible = (element: HTMLElement) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0;
  };

  const isSensitive = (element: HTMLElement) => {
    if (element instanceof HTMLInputElement && (element.type === 'password' || element.type === 'hidden')) return true;
    const identifiers = [
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('autocomplete'),
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
    ].filter((value): value is string => Boolean(value)).join(' ');
    return sensitiveFieldPattern.test(identifiers);
  };

  return actions.map((action) => {
    if (action.type === 'scroll') {
      const amount = Math.min(Math.max(action.amount || 600, 100), 2000);
      window.scrollBy({ top: action.direction === 'down' ? amount : -amount, behavior: 'smooth' });
      return `Scrolled ${action.direction}.`;
    }

    const target = findControl(action.targetId);
    if (!target) throw new Error(`The control ${action.targetId} is no longer available on this page.`);
    if (!isVisible(target)) throw new Error('This action is blocked because the target element is hidden.');
    if (isSensitive(target)) throw new Error('This action is blocked because the target is a password or sensitive input field.');
    if (action.type === 'click') {
      target.focus();
      target.click();
      return `Clicked ${(target.getAttribute('aria-label') || target.innerText || action.targetId).trim()}.`;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(target, action.text);
    } else if (target.isContentEditable) {
      target.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, action.text);
    } else {
      throw new Error('This control does not accept typed text.');
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return `Typed text into ${(target.getAttribute('aria-label') || target.innerText || action.targetId).trim()}.`;
  });
}

function isReadableWebpageTab(tab: chromeTab | undefined): tab is chromeTab & { id: number; url: string } {
  if (!tab?.id || !tab.url) return false;

  const url = tab.url.toLowerCase();
  return !url.startsWith('chrome://')
    && !url.startsWith('edge://')
    && !url.startsWith('about:')
    && !url.startsWith('chrome-extension://');
}

async function getActiveTab(): Promise<chromeTab> {
  const [currentWindowTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = isReadableWebpageTab(currentWindowTab)
    ? currentWindowTab
    : (await chrome.tabs.query({ active: true })).find(isReadableWebpageTab);

  const tab = activeTab;
  if (!tab?.id) throw new Error('Unable to identify the active browser tab.');
  if (!isReadableWebpageTab(tab)) {
    throw new Error('Chrome and browser-internal pages cannot be accessed. Open a normal website and try again.');
  }
  return tab;
}

export async function getActivePageContent(): Promise<PageContent> {
  const tab = await getActiveTab();
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: extractPageContextInPage });
    const page = result?.result;
    if (!page?.text) throw new Error('This page does not contain readable content.');
    return page;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'This page does not contain readable content.') throw error;
    throw new Error(`Could not extract webpage content: ${message}`, { cause: error });
  }
}

export async function executePageActions(actions: PageAction[], confirmation?: ActionExecutionConfirmation): Promise<string[]> {
  if (confirmation !== 'allow-once') {
    throw new Error('This action is blocked until you select Allow once.');
  }
  if (actions.length === 0) return [];

  const tab = await getActiveTab();
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: executeActionsInPage, args: [actions] });
    return result?.result || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not perform the page action: ${message}`, { cause: error });
  }
}

export function describePageAction(action: PageAction): string {
  if (action.description) return action.description;
  if (action.type === 'click') return `Click ${action.targetId}`;
  if (action.type === 'type') return `Type text into ${action.targetId}`;
  return `Scroll ${action.direction}`;
}

export function isPotentiallyDestructiveAction(action: PageAction, targetDescription = ''): boolean {
  const details = [action.description, targetDescription, action.type === 'type' ? action.text : ''].filter(Boolean).join(' ');
  return action.type === 'click' && DESTRUCTIVE_ACTION_PATTERN.test(details);
}
