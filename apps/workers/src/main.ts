// Reserved workers entry point.
//
// Spustí všechny pollery na předem nastavených intervalech:
//   - notifications:  emaily + SMS z fronty (tick každých 5s)
//   - slot-holds:     uvolnění expired holds (tick každých 30s)
//
// Graceful shutdown na SIGTERM / SIGINT.

import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { EmailProvider } from './providers/email.provider.js';
import { createSmsProvider } from './providers/sms/index.js';
import { createWhatsAppProvider } from './providers/whatsapp/index.js';
import { Poller } from './lib/poller.js';
import { NotificationsWorker } from './workers/notifications.worker.js';
import { SlotHoldsWorker } from './workers/slot-holds.worker.js';
import { BirthdaysWorker } from './workers/birthdays.worker.js';

async function bootstrap(): Promise<void> {
  const env = loadConfig();
  // eslint-disable-next-line no-console
  console.log(`[workers] starting in ${env.NODE_ENV} mode`);

  const { db, close: closeDb } = createDb(env.DATABASE_APP_URL ?? env.DATABASE_URL);
  const email = new EmailProvider(env);
  const sms = createSmsProvider(env);
  const whatsapp = createWhatsAppProvider(env);

  const notificationsWorker = new NotificationsWorker(db, email, sms, whatsapp);
  const slotHoldsWorker = new SlotHoldsWorker(db);
  const birthdaysWorker = new BirthdaysWorker(db);

  const pollers: Poller[] = [
    new Poller({
      name: 'notifications',
      intervalSeconds: env.WORKER_NOTIFICATION_TICK_SECONDS,
      tick: () => notificationsWorker.tick(),
    }),
    new Poller({
      name: 'slot-holds',
      intervalSeconds: env.WORKER_HOLD_EXPIRY_TICK_SECONDS,
      tick: () => slotHoldsWorker.tick(),
    }),
    // Narozeniny — kontrola po hodině; idempotence zajistí max 1 přání/den/zákazník.
    new Poller({
      name: 'birthdays',
      intervalSeconds: 3600,
      tick: () => birthdaysWorker.tick(),
    }),
  ];

  pollers.forEach((p) => p.start());

  // eslint-disable-next-line no-console
  console.log(`[workers] running (SMS: ${sms.name}, WhatsApp: ${whatsapp.name})`);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[workers] ${signal} received, shutting down...`);
    pollers.forEach((p) => p.stop());
    await closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[workers] failed to start:', err);
  process.exit(1);
});
