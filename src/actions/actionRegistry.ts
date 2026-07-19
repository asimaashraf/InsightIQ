import type { SmartAction, ActionContext, ActionResult } from './types';

const registry: SmartAction[] = [];

export function registerAction(action: SmartAction) {
  registry.push(action);
}

export function clearActions() {
  registry.length = 0;
}

export function getAvailableActions(context: ActionContext): SmartAction[] {
  return registry.filter((action) => action.isAvailable(context)).slice(0, 6);
}

export async function runAction(actionId: string, context: ActionContext, permission: 'allow-once' | 'always' | 'none' = 'allow-once'): Promise<ActionResult> {
  const action = registry.find((a) => a.id === actionId);
  if (!action) return { ok: false, message: 'Action not found' };
  if (!action.isAvailable(context)) return { ok: false, message: 'Action no longer available on this page' };
  if (action.requiresConfirmation && permission !== 'allow-once' && permission !== 'always') {
    return { ok: false, message: 'Confirmation required' };
  }
  try {
    return await action.execute(context);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export default { registerAction, getAvailableActions, runAction, clearActions };