// Akční handlery — co provést, když pravidlo matchne.
//
// Každý handler dostane:
//   - tenantId
//   - eventPayload (data o události)
//   - actionConfig (specifická konfigurace akce z DB)
// a vrací výsledek (ok / failed).

import type { Action, BookingEventPayload } from '@reserved/rules-engine';

export interface ActionContext {
  tenantId: string;
  payload: BookingEventPayload;
}

export interface ActionResult {
  action: string;
  status: 'ok' | 'failed' | 'skipped';
  message?: string;
  data?: Record<string, unknown>;
}

export type ActionHandler = (
  ctx: ActionContext,
  config: Record<string, unknown>,
) => Promise<ActionResult>;

/** Registry akčních handlerů. Naplní se v RulesModule. */
export class ActionRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register(type: string, handler: ActionHandler): void {
    this.handlers.set(type, handler);
  }

  async dispatch(action: Action, ctx: ActionContext): Promise<ActionResult> {
    const handler = this.handlers.get(action.type);
    if (!handler) {
      return {
        action: action.type,
        status: 'failed',
        message: `Neznámý typ akce: ${action.type}`,
      };
    }
    try {
      return await handler(ctx, action.config);
    } catch (err) {
      return {
        action: action.type,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
