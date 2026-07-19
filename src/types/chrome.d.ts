declare namespace chrome {
  const runtime: {
    onMessage: {
      addListener: <TMessage = unknown>(listener: (message: TMessage, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | undefined) => void;
      removeListener: <TMessage = unknown>(listener: (message: TMessage, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | undefined) => void;
    };
    sendMessage: (message: unknown) => Promise<unknown>;
    getURL: (path: string) => string;
  };

  const tabs: {
    query: (queryInfo: { active?: boolean; currentWindow?: boolean; tabId?: number; windowId?: number }) => Promise<chromeTab[]>;
    get: (tabId: number) => Promise<chromeTab>;
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
    captureVisibleTab: (windowId?: number, options?: { format?: 'jpeg' | 'png'; quality?: number }) => Promise<string>;
    update: (tabId: number, updateProperties: { active: boolean }) => Promise<chromeTab>;
    onActivated: {
      addListener: (listener: (activeInfo: { tabId: number; windowId: number }) => void) => void;
      removeListener: (listener: (activeInfo: { tabId: number; windowId: number }) => void) => void;
    };
    onUpdated: {
      addListener: (listener: (tabId: number, changeInfo: { status?: string }, tab: chromeTab) => void) => void;
      removeListener: (listener: (tabId: number, changeInfo: { status?: string }, tab: chromeTab) => void) => void;
    };
  };

  const scripting: {
    executeScript: <Args extends unknown[], Result>(injection: {
      target: { tabId: number };
      func: (...args: Args) => Result;
      args?: Args;
    }) => Promise<Array<{ result: Result }>>;
  };

  const storage: {
    local: {
      set: (items: Record<string, unknown>) => Promise<void>;
      get: (key?: string | string[]) => Promise<Record<string, unknown>>;
    };
    session: {
      set: (items: Record<string, unknown>) => Promise<void>;
      get: (key?: string | string[]) => Promise<Record<string, unknown>>;
      remove: (key: string | string[]) => Promise<void>;
    };
  };

  const windows: {
    create: (createData: {
      url: string;
      type: 'popup';
      width: number;
      height: number;
      focused?: boolean;
    }) => Promise<{ id?: number }>;
    getCurrent: () => Promise<{ id?: number; left?: number; top?: number }>;
    update: (windowId: number, updateInfo: { focused?: boolean; left?: number; top?: number }) => Promise<{ id?: number }>;
    onRemoved: {
      addListener: (listener: (windowId: number) => void) => void;
    };
  };

  const sidePanel: {
    setOptions: (options: { tabId?: number; enabled: boolean }) => Promise<void>;
    open: (options: { windowId?: number; tabId?: number }) => Promise<void>;
  };
}

type chromeTab = {
  id?: number;
  windowId?: number;
  title?: string;
  url?: string;
};

interface Window {
  __insightiqDeveloperMode?: boolean;
}
