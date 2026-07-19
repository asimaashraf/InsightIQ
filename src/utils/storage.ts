import type { Message } from '../types/chat';

export const STORAGE_KEYS = {
  CHATS: 'insightiq_chats',
  CURRENT_CHAT: 'insightiq_current_chat',
  SETTINGS: 'insightiq_settings',
  AI_KEYS: 'insightiq_ai_keys',
  WINDOW_STATE: 'insightiq_window_state',
} as const;

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
};

export type Settings = {
  theme: 'system' | 'dark' | 'light';
  notifications: boolean;
  autoScroll: boolean;
  chatProvider: 'groq' | 'gemini';
  selectedProvider?: 'openai' | 'groq' | 'gemini';
};

export type AIKeys = {
  openai?: string;
  groq?: string;
  gemini?: string;
};

function toDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : 0);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function hydrateChatSession(value: unknown): ChatSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ChatSession>;
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || !Array.isArray(candidate.messages)) return null;

  const messages = candidate.messages.flatMap((message): Message[] => {
    if (!message || typeof message !== 'object') return [];
    const item = message as any;

    // Generated image message
    if (item.type === 'generated-image' && item.role === 'assistant' && typeof item.id === 'string' && typeof item.imageUrl === 'string' && typeof item.prompt === 'string') {
      return [{
        id: item.id,
        role: 'assistant',
        content: typeof item.content === 'string' ? item.content : item.prompt,
        timestamp: toDate(item.timestamp ?? item.createdAt ?? Date.now()),
        type: 'generated-image',
        prompt: item.prompt,
        imageUrl: item.imageUrl,
        status: (item.status === 'success' || item.status === 'error' || item.status === 'pending') ? item.status : 'success',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      } as Message];
    }

    // Fallback to simple user/assistant messages
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.id !== 'string' || typeof item.content !== 'string') return [];
    return [{ id: item.id, role: item.role, content: item.content, timestamp: toDate(item.timestamp) }];
  });

  return {
    id: candidate.id,
    title: candidate.title,
    messages,
    createdAt: toDate(candidate.createdAt),
    updatedAt: toDate(candidate.updatedAt),
  };
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  const chats = await getChatSessions();
  const index = chats.findIndex((c) => c.id === session.id);

  if (index >= 0) {
    chats[index] = session;
  } else {
    chats.push(session);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.CHATS]: chats });
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.CHATS);
  const chats = data[STORAGE_KEYS.CHATS];
  return Array.isArray(chats)
    ? chats.flatMap((chat) => {
      const session = hydrateChatSession(chat);
      return session ? [session] : [];
    })
    : [];
}

export async function getChatSession(id: string): Promise<ChatSession | null> {
  const chats = await getChatSessions();
  return chats.find((chat) => chat.id === id) || null;
}

export async function deleteChatSession(id: string): Promise<void> {
  const chats = await getChatSessions();
  const filtered = chats.filter((c) => c.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.CHATS]: filtered });
}

export async function renameChatSession(id: string, title: string): Promise<void> {
  const chats = await getChatSessions();
  const chat = chats.find((c) => c.id === id);
  if (chat) {
    chat.title = title;
    await saveChatSession(chat);
  }
}

export async function getCurrentChatId(): Promise<string | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_CHAT);
  const value = data[STORAGE_KEYS.CURRENT_CHAT];
  return typeof value === 'string' ? value : null;
}

export async function setCurrentChatId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_CHAT]: id });
}

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = data[STORAGE_KEYS.SETTINGS];
  const defaultChatProvider = import.meta.env.VITE_AI_PROVIDER === 'gemini' ? 'gemini' : 'groq';
  return settings && typeof settings === 'object' && 'theme' in settings
    ? (settings as Settings)
    : { theme: 'dark', notifications: true, autoScroll: true, chatProvider: defaultChatProvider };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: { ...current, ...settings } });
}

export async function exportChats(): Promise<string> {
  const chats = await getChatSessions();
  return JSON.stringify(chats, null, 2);
}

export async function exportChatSession(id: string): Promise<string> {
  const session = await getChatSession(id);
  if (!session) throw new Error('Chat session not found');
  return JSON.stringify(session, null, 2);
}

export async function getAIKeys(): Promise<AIKeys> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.AI_KEYS);
  const keys = data[STORAGE_KEYS.AI_KEYS];
  return keys && typeof keys === 'object' ? (keys as AIKeys) : {};
}

export async function saveAIKey(provider: keyof AIKeys, apiKey: string): Promise<void> {
  const current = await getAIKeys();
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
  // If trimmed is empty, remove the stored key rather than storing an empty string so env fallbacks remain available
  const next = { ...current } as AIKeys;
  if (trimmed === '') {
    delete (next as any)[provider];
  } else {
    next[provider] = trimmed;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEYS]: next });
}

export async function importChats(jsonData: string): Promise<number> {
  try {
    const parsed = JSON.parse(jsonData);
    let items: unknown[] = [];

    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Accept { chats: [...] } or { conversations: [...] }
      // @ts-ignore
      if (Array.isArray(parsed.chats)) items = parsed.chats;
      // @ts-ignore
      else if (Array.isArray(parsed.conversations)) items = parsed.conversations;
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Invalid format: expected an array or an object with a "chats" or "conversations" array');
    }

    const existing = await getChatSessions();
    const existingIds = new Set(existing.map((c) => c.id));
    const toAdd: ChatSession[] = [];

    for (const item of items) {
      const session = hydrateChatSession(item) || null;
      if (session) {
        if (!existingIds.has(session.id)) {
          toAdd.push(session);
          existingIds.add(session.id);
        }
        continue;
      }

      // Attempt to coerce a partially valid object
      if (!item || typeof item !== 'object') continue;
      const candidate = item as any;
      const id = typeof candidate.id === 'string' ? candidate.id : generateChatId();
      const title = typeof candidate.title === 'string' ? candidate.title : 'Imported Chat';
      const createdAt = toDate(candidate.createdAt ?? new Date());
      const updatedAt = toDate(candidate.updatedAt ?? createdAt);

      const messages = Array.isArray(candidate.messages)
        ? candidate.messages.flatMap((m: any) => {
          if (!m || typeof m !== 'object') return [];
          const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : undefined;
          const content = typeof m.content === 'string' ? m.content : undefined;
          if (!role || typeof content !== 'string') return [];
          const msgId = typeof m.id === 'string' ? m.id : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const timestamp = toDate(m.timestamp ?? new Date());
          return [{ id: msgId, role, content, timestamp }];
        })
        : [];

      // message array is required by ChatSession — allow empty messages but accept
      const coerced: ChatSession = { id, title, messages, createdAt, updatedAt };
      if (!existingIds.has(coerced.id)) {
        toAdd.push(coerced);
        existingIds.add(coerced.id);
      }
    }

    if (toAdd.length === 0) return 0;

    const merged = [...existing, ...toAdd];
    await chrome.storage.local.set({ [STORAGE_KEYS.CHATS]: merged });
    return toAdd.length;
  } catch (error) {
    console.error('Failed to import chats:', error);
    throw new Error(error instanceof Error ? error.message : 'Invalid chat data format');
  }
}

export function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTitle(firstMessage: string): string {
  return firstMessage.substring(0, 50).trim() + (firstMessage.length > 50 ? '...' : '');
}
