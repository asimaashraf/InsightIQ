export type BaseMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export type GeneratedImageMessage = BaseMessage & {
  type: 'generated-image';
  prompt: string;
  imageUrl: string;
  status: 'success' | 'error' | 'pending';
  createdAt: number;
};

export type Message = BaseMessage | GeneratedImageMessage;

export type ChatState = {
  messages: Message[];
  isLoading: boolean;
  error?: string;
};

export type QuickActionType = 'summarize' | 'explain' | 'extract' | 'facts' | 'questions';
