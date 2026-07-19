import { COMPACT_WINDOW_STATE_KEY } from '../constants/compact';

type Message = {
  type: 'ANALYZE_PAGE' | 'GENERATE_INSIGHTS' | 'OPEN_COMPACT_WINDOW' | 'OPEN_COMPACT_POPUP' | 'OPEN_SIDE_PANEL' | 'CLOSE_COMPACT_WINDOW';
};

type InsightPayload = {
  title: string;
  summary: string;
  recommendations: string[];
  confidence: string;
};

type SidePanelApi = {
  setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void> | void;
  setOptions: (options: { tabId?: number; enabled: boolean }) => Promise<void> | void;
  open: (options: { windowId: number }) => Promise<void> | void;
};

type ActionApi = {
  setPopup: (options: { popup: string }) => Promise<void> | void;
  onClicked: {
    addListener: (listener: (tab: chromeTab) => void) => void;
  };
};

type CompactPopupWindow = { id?: number };

type WindowsApi = {
  create: (createData: { url: string; type: 'popup'; width: number; height: number }) => Promise<CompactPopupWindow> | CompactPopupWindow;
  update: (windowId: number, updateInfo: { focused?: boolean }) => Promise<CompactPopupWindow> | CompactPopupWindow;
  remove: (windowId: number) => Promise<void> | void;
  onRemoved: {
    addListener: (listener: (windowId: number) => void) => void;
  };
};

type ChromeWithSidePanel = typeof chrome & {
  sidePanel?: SidePanelApi;
  action?: ActionApi;
  windows?: WindowsApi;
};

const chromeWithSidePanel = chrome as ChromeWithSidePanel;

type CompactWindowState = {
  windowId: number;
  sourceTabId: number;
  sourceWindowId?: number;
};

// The service worker owns this ID. It lets InsightIQ focus/reuse its compact
// window instead of creating a second popup for the same extension.
let compactPopupWindowId: number | undefined;
let compactPopupSourceTabId: number | undefined;
let switchingSurfaceCount = 0;

function beginSurfaceSwitch() {
  switchingSurfaceCount += 1;
}

function endSurfaceSwitch() {
  switchingSurfaceCount = Math.max(0, switchingSurfaceCount - 1);
}

function isSwitchingSurface() {
  return switchingSurfaceCount > 0;
}

async function restoreCompactWindowState() {
  if (typeof compactPopupWindowId === 'number') return;
  const data = await chrome.storage.session.get(COMPACT_WINDOW_STATE_KEY);
  const savedState = data[COMPACT_WINDOW_STATE_KEY];
  if (!savedState || typeof savedState !== 'object') return;

  const state = savedState as Partial<CompactWindowState>;
  if (typeof state.windowId === 'number' && typeof state.sourceTabId === 'number') {
    compactPopupWindowId = state.windowId;
    compactPopupSourceTabId = state.sourceTabId;
  }
}

async function saveCompactWindowState(windowId: number, sourceTabId: number, sourceWindowId: number) {
  compactPopupWindowId = windowId;
  compactPopupSourceTabId = sourceTabId;
  await chrome.storage.session.set({ [COMPACT_WINDOW_STATE_KEY]: { windowId, sourceTabId, sourceWindowId } satisfies CompactWindowState });
}

async function clearCompactWindowState() {
  compactPopupWindowId = undefined;
  compactPopupSourceTabId = undefined;
  await chrome.storage.session.remove(COMPACT_WINDOW_STATE_KEY);
}

function isWebpageUrl(url?: string): boolean {
  if (!url) return false;
  const normalizedUrl = url.toLowerCase();
  return !normalizedUrl.startsWith('chrome://')
    && !normalizedUrl.startsWith('edge://')
    && !normalizedUrl.startsWith('about:')
    && !normalizedUrl.startsWith('chrome-extension://');
}

async function getActiveWebpageTab(preferredTabId?: number): Promise<Required<Pick<chromeTab, 'id' | 'windowId'>> & chromeTab> {
  const isUsableTab = (candidate: chromeTab) => (
    typeof candidate.id === 'number'
    && typeof candidate.windowId === 'number'
    && isWebpageUrl(candidate.url)
  );

  if (typeof preferredTabId === 'number') {
    try {
      const preferredTab = await chrome.tabs.get(preferredTabId);
      if (isUsableTab(preferredTab)) {
        return preferredTab as Required<Pick<chromeTab, 'id' | 'windowId'>> & chromeTab;
      }
    } catch {
      // Fall back to any active webpage tab if the preferred tab is unavailable.
    }
  }

  const activeTabs = await chrome.tabs.query({ active: true });
  const tab = activeTabs.find(isUsableTab);

  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    throw new Error('Open a normal website tab before opening InsightIQ. Browser-internal pages cannot be used.');
  }

  return tab as Required<Pick<chromeTab, 'id' | 'windowId'>> & chromeTab;
}

async function setSidePanelVisibility(tabId: number, enabled: boolean) {
  const sidePanel = chromeWithSidePanel.sidePanel;
  if (!sidePanel) throw new Error('Chrome Side Panel is not available in this browser.');
  // The global setting closes a panel that is currently displayed, while the
  // tab-specific setting keeps the selected website in the same state.
  await sidePanel.setOptions({ enabled });
  await sidePanel.setOptions({ tabId, enabled });
}

async function closeCompactWindow() {
  await restoreCompactWindowState();
  const windowId = compactPopupWindowId;
  if (typeof windowId !== 'number') return;

  beginSurfaceSwitch();
  // Clear state first so the onRemoved listener does not re-enable a panel
  // while a requested surface switch is still in progress.
  await clearCompactWindowState();
  try {
    await chromeWithSidePanel.windows?.remove(windowId);
  } catch {
    // The user may already have closed the window; in both cases it is gone.
  } finally {
    endSurfaceSwitch();
  }
}

async function openCompactWindow() {
  if (isSwitchingSurface()) return;
  const windows = chromeWithSidePanel.windows;
  if (!windows?.create || !windows.update) {
    throw new Error('Chrome could not open the compact InsightIQ window.');
  }

  await restoreCompactWindowState();
  const sourceTab = await getActiveWebpageTab();
  // Disable first: the page can never show the Side Panel and compact window together.
  await setSidePanelVisibility(sourceTab.id, false);

  if (typeof compactPopupWindowId === 'number') {
    try {
      await windows.update(compactPopupWindowId, { focused: true });
      return;
    } catch {
      await clearCompactWindowState();
    }
  }

  beginSurfaceSwitch();
  try {
    const popupWindow = await windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 420,
      height: 680,
      focused: true,
    });

    if (typeof popupWindow.id !== 'number') {
      throw new Error('Chrome did not return an ID for the compact InsightIQ window.');
    }
    await saveCompactWindowState(popupWindow.id, sourceTab.id, sourceTab.windowId);
  } finally {
    endSurfaceSwitch();
  }
}

async function openSidePanel(tabFromToolbar?: chromeTab) {
  if (isSwitchingSurface()) return;
  const sidePanel = chromeWithSidePanel.sidePanel;
  if (!sidePanel) {
    throw new Error('Chrome Side Panel is not available in this browser.');
  }

  console.debug('[InsightIQ] OPEN_SIDE_PANEL received');
  await restoreCompactWindowState();
  const compactSourceTabId = compactPopupSourceTabId;
  const sourceTab = tabFromToolbar
    && typeof tabFromToolbar.id === 'number'
    && typeof tabFromToolbar.windowId === 'number'
    && isWebpageUrl(tabFromToolbar.url)
    ? tabFromToolbar as Required<Pick<chromeTab, 'id' | 'windowId'>> & chromeTab
    : await getActiveWebpageTab(compactSourceTabId);

  console.debug('[InsightIQ] OPEN_SIDE_PANEL using source tab', { sourceTabId: sourceTab.id, sourceWindowId: sourceTab.windowId, compactWindowId: compactPopupWindowId });

  if (typeof sourceTab.id !== 'number' || typeof sourceTab.windowId !== 'number') {
    throw new Error('Unable to determine the source browser tab to open the Side Panel.');
  }

  beginSurfaceSwitch();
  try {
    await setSidePanelVisibility(sourceTab.id, true);
    return { sidePanelOpened: true, sourceTabId: sourceTab.id, sourceWindowId: sourceTab.windowId };
  } finally {
    endSurfaceSwitch();
  }
}

chromeWithSidePanel.windows?.onRemoved.addListener((windowId) => {
  void (async () => {
    if (isSwitchingSurface()) return;
    await restoreCompactWindowState();
    if (windowId !== compactPopupWindowId) return;

    const sourceTabId = compactPopupSourceTabId;
    await clearCompactWindowState();
    if (typeof sourceTabId === 'number') {
      await setSidePanelVisibility(sourceTabId, true).catch(() => undefined);
    }
  })();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void (async () => {
    if (isSwitchingSurface()) return;
    await restoreCompactWindowState();
    // Do not revive the Side Panel while its compact replacement is visible.
    if (typeof compactPopupWindowId === 'number') return;

    try {
      const tab = await chrome.tabs.get(tabId);
      if (!isWebpageUrl(tab.url)) return;
    } catch {
      return;
    }

    await setSidePanelVisibility(tabId, true).catch(() => undefined);
  })();
});

async function setPopupFallback(action: ActionApi | undefined) {
  if (!action) return;
  try {
    await action.setPopup({ popup: 'popup.html' });
  } catch (error) {
    console.warn('InsightIQ could not configure the popup fallback.', error);
  }
}

async function configureSidePanel() {
  const { action, sidePanel } = chromeWithSidePanel;
  if (!sidePanel?.setPanelBehavior) {
    await setPopupFallback(action);
    return;
  }

  try {
    // Chrome handles the toolbar gesture natively. This is more reliable than
    // opening a panel asynchronously from an action-click listener.
    await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await sidePanel.setOptions({ enabled: true });
    await action?.setPopup({ popup: '' });
    action?.onClicked.addListener((tab) => {
      if (typeof tab.windowId !== 'number') return;
      // Call open synchronously in the action gesture. This is a fallback for
      // Chrome profiles where the native action behavior is not applied yet.
      void Promise.resolve(sidePanel.open({ windowId: tab.windowId })).catch((error: unknown) => {
        console.error('InsightIQ toolbar Side Panel fallback failed.', error);
      });
      void closeCompactWindow();
    });
  } catch (error) {
    console.warn('InsightIQ Side Panel setup failed. Falling back to the popup.', error);
    await setPopupFallback(action);
  }
}

void configureSidePanel();

async function getCurrentTabInfo() {
  const tab = await getActiveWebpageTab();
  return { title: tab.title ?? 'Current page', url: tab.url ?? 'about:blank' };
}

async function buildInsightPayload() {
  const tabInfo = await getCurrentTabInfo();
  return {
    title: `Page analyzed: ${tabInfo.title}`,
    summary: `InsightIQ detected a page focused on ${tabInfo.url}. This demo streams the active tab context to the popup UI.`,
    recommendations: ['Summarize the page content', 'Highlight actionable insights', 'Prepare follow-up recommendations'],
    confidence: 'High',
  } satisfies InsightPayload;
}

import { routeAIRequest } from '../services/aiService';

chrome.runtime.onMessage.addListener((message: Message | any, _sender: unknown, sendResponse: (response?: unknown) => void) => {
  const respond = (operation: Promise<unknown>) => {
    void operation.then((payload) => {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        sendResponse({ ok: true, ...(payload as Record<string, unknown>) });
      } else {
        sendResponse({ ok: true });
      }
    }).catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  };

  if (message.type === 'OPEN_COMPACT_WINDOW' || message.type === 'OPEN_COMPACT_POPUP') return respond(openCompactWindow());
  if (message.type === 'OPEN_SIDE_PANEL') return respond(openSidePanel());
  if (message.type === 'CLOSE_COMPACT_WINDOW') return respond(closeCompactWindow());

  if (message.type === 'ANALYZE_PAGE') {
    void getCurrentTabInfo().then((tabInfo) => {
      void chrome.storage.local.set({ lastAnalyzed: tabInfo });
      sendResponse({ ok: true, tabInfo });
    });
    return true;
  }

  if (message.type === 'GENERATE_INSIGHTS') {
    void buildInsightPayload().then((payload) => {
      void chrome.storage.local.set({ lastInsights: payload });
      void chrome.runtime.sendMessage({ type: 'INSIGHTS_READY', payload });
      sendResponse({ ok: true, payload });
    });
    return true;
  }

  // New handler for RUN_AI_ACTION used by Smart Actions
  if (message.type === 'RUN_AI_ACTION') {
    (async () => {
      try {
        const action = (message.action as string) || 'summarize';
        const payload = message.payload || {};
        if (action === 'summarize') {
          const text = String(payload.text || '');
          const result = await routeAIRequest({ type: 'chat', instruction: text });
          sendResponse({ ok: true, result });
          return;
        }

        // Fallback: treat as chat instruction
        if (payload && payload.text) {
          const result = await routeAIRequest({ type: 'chat', instruction: String(payload.text) });
          sendResponse({ ok: true, result });
          return;
        }

        sendResponse({ ok: false, error: 'Unsupported RUN_AI_ACTION payload' });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return true; // indicate async response
  }

  // ACTION_RESULT is forwarded to open popups/pages that may handle adding chat messages
  if (message.type === 'ACTION_RESULT') {
    // Forward as a broadcast so popup can listen and append the result to chat
    void chrome.runtime.sendMessage({ type: 'ACTION_RESULT_BROADCAST', payload: { actionId: message.actionId, result: message.result } });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

