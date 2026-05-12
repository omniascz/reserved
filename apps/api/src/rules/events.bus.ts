// In-memory event bus pro rules engine.
//
// V Phase 1: synchronní in-process. Listenery se zaregistrují v module init,
// rules service je hlavní listener. V budoucnu může být upgraded na BullMQ
// (Redis-backed) pro retry + delayed execution.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TriggerEvent, BookingEventPayload } from '@reserved/rules-engine';

export interface DomainEvent {
  tenantId: string;
  type: TriggerEvent;
  payload: BookingEventPayload;
  emittedAt: Date;
}

export type EventListener = (event: DomainEvent) => Promise<void> | void;

@Injectable()
export class EventBus {
  private readonly logger = new Logger('EventBus');
  private readonly listeners = new Set<EventListener>();

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async emit(event: Omit<DomainEvent, 'emittedAt'>): Promise<void> {
    const fullEvent: DomainEvent = { ...event, emittedAt: new Date() };
    this.logger.debug(`Event: ${event.type} for tenant ${event.tenantId}`);

    // Run listeners independently — pokud jeden selže, ostatní pokračují.
    const promises = Array.from(this.listeners).map(async (l) => {
      try {
        await l(fullEvent);
      } catch (err) {
        this.logger.error(`Listener failed for ${event.type}: ${(err as Error).message}`);
      }
    });
    await Promise.allSettled(promises);
  }
}
