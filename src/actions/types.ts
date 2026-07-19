export type ActionCategory = 'ai-content' | 'browser-exec' | 'site-specific';

export type ActionRisk = 'low' | 'medium' | 'high';

export type ActionStatus = 'idle' | 'awaiting-confirmation' | 'running' | 'completed' | 'failed';

export type ActionPermission = 'allow-once' | 'always' | 'none';

export type ActionContext = {
  title: string;
  url: string;
  hostname: string;
  selectedText?: string;
  pageText?: string;
  controls?: Array<{ id: string; tag: string; label: string; type?: string }>;
};

export type ActionResult = {
  ok: boolean;
  message: string;
  details?: any;
};

export type SmartAction = {
  id: string;
  title: string;
  description: string;
  icon?: string; // icon path
  category: ActionCategory;
  supportedHostnames?: string[]; // empty or undefined means generic
  risk: ActionRisk;
  requiresConfirmation?: boolean;
  isAvailable: (context: ActionContext) => boolean;
  execute: (context: ActionContext) => Promise<ActionResult>;
};