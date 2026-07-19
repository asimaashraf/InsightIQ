type PageAction =
  | { type: 'click'; targetId: string; description?: string }
  | { type: 'type'; targetId: string; text: string; description?: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number; description?: string };

const CONTROL_SELECTOR = 'a[href], button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"]';
const SENSITIVE_FIELD_PATTERN = /password|passcode|secret|token|otp|one[- ]?time|credit|card|cvv|cvc|ssn|bank|account[ _-]*number/i;

function getControlLabel(element: Element): string {
  const label = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('title') || element.textContent || '';
  return label.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function collectPageInfo() {
  const title = document.title || 'Untitled page';
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  const controls = Array.from(document.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))
    .filter((element) => element.offsetParent !== null && !element.hasAttribute('disabled'))
    .slice(0, 80)
    .map((element, index) => {
      const id = `insightiq-control-${index}`;
      element.dataset.insightiqId = id;
      return {
        id,
        tag: element.tagName.toLowerCase(),
        label: getControlLabel(element),
        type: element instanceof HTMLInputElement ? element.type : undefined,
      };
    });

  return { title, description, text, url: window.location.href, controls };
}

function findControl(targetId: string): HTMLElement {
  const target = document.querySelector<HTMLElement>(`[data-insightiq-id="${CSS.escape(targetId)}"]`);
  if (!target) throw new Error(`The control ${targetId} is no longer available on this page.`);
  return target;
}

function ensureSafeTarget(target: HTMLElement) {
  const style = window.getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || rect.width === 0 || rect.height === 0) {
    throw new Error('This action is blocked because the target element is hidden.');
  }

  if (target instanceof HTMLInputElement && (target.type === 'password' || target.type === 'hidden')) {
    throw new Error('This action is blocked because the target is a password or hidden input field.');
  }

  const identifiers = [
    target.getAttribute('name'),
    target.getAttribute('id'),
    target.getAttribute('autocomplete'),
    target.getAttribute('aria-label'),
    target.getAttribute('placeholder'),
  ].filter((value): value is string => Boolean(value)).join(' ');
  if (SENSITIVE_FIELD_PATTERN.test(identifiers)) {
    throw new Error('This action is blocked because the target appears to contain sensitive information.');
  }
}

function setText(target: HTMLElement, text: string) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(target, text);
  } else if (target.isContentEditable) {
    target.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  } else {
    throw new Error('This control does not accept typed text.');
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

function executeAction(action: PageAction): string {
  if (action.type === 'scroll') {
    const amount = Math.min(Math.max(action.amount || 600, 100), 2000);
    window.scrollBy({ top: action.direction === 'down' ? amount : -amount, behavior: 'smooth' });
    return `Scrolled ${action.direction}.`;
  }

  const target = findControl(action.targetId);
  ensureSafeTarget(target);
  if (action.type === 'click') {
    target.focus();
    target.click();
    return `Clicked ${getControlLabel(target) || action.targetId}.`;
  }

  setText(target, action.text);
  return `Typed text into ${getControlLabel(target) || action.targetId}.`;
}

function sendPageInfo() {
  void chrome.runtime.sendMessage({ type: 'PAGE_INFO', payload: collectPageInfo() });
}

void sendPageInfo();
window.addEventListener('load', sendPageInfo);

chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
  if (typeof message === 'object' && message !== null && 'type' in message && (message as any).type === 'GET_SMART_ACTIONS') {
    const info = collectPageInfo();
    sendResponse({ ok: true, payload: info });
    return;
  }
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse({ ok: true, payload: collectPageInfo() });
    return;
  }
  if (message.type === 'EXECUTE_PAGE_ACTIONS' && 'actions' in message && Array.isArray(message.actions)) {
    if (!('confirmation' in message) || message.confirmation !== 'allow-once') {
      sendResponse({ ok: false, error: 'This action is blocked until the user selects Allow once.' });
      return;
    }
    try {
      const results = (message.actions as PageAction[]).map(executeAction);
      sendResponse({ ok: true, results });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
});
