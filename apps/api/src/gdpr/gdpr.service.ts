// GdprService — export a výmaz osobních údajů.
//
// ── PROČ ANONYMIZACE, NE SMAZÁNÍ ────────────────────────────────────────────
// Rezervace, platby, prodeje a permanentky jsou účetní a daňové záznamy. Zákon
// o účetnictví a zákon o DPH je nutí držet roky zpátky; GDPR tuhle povinnost
// výslovně uznává jako důvod pro další zpracování. Smazat řádek by znamenalo
// rozbít účetnictví — a zároveň by to rozbilo cizí klíče a všechny souhrny.
// Proto se řádky NECHÁVAJÍ a mažou se z nich OSOBNÍ ÚDAJE: jméno, e-mail,
// telefon, adresy a volný text. Zůstává částka, datum a stav.
//
// ── ZÁSTUPNÝ E-MAIL ─────────────────────────────────────────────────────────
// Musí splnit tři věci naráz:
//   1. být NÁHODNÝ, ne odvozený z původního e-mailu — otisk (hash) by nestačil,
//      protože e-mailů je konečně mnoho a dal by se uhodnout zkoušením,
//   2. být pro každého smazaného zákazníka JINÝ — nad e-mailem visí unikátní
//      indexy (pořadník lekce, zápis do kurzu, účast ve výzvě, sám zákazník),
//      takže společná hodnota by u druhého výmazu spadla na kolizi,
//   3. být pro jednoho zákazníka STEJNÝ napříč tabulkami, aby zůstaly platné
//      vazby, které se dělají přes e-mail.
// Doména `.invalid` je k tomuhle účelu rezervovaná normou (RFC 2606), takže na
// ni nikdy nikomu nic neodejde.
//
// ── CO TENHLE MODUL VĚDOMĚ NEŘEŠÍ ───────────────────────────────────────────
// Ze 40 tabulek s osobními údaji pokrývá 37. Zbylé tři — `platform_admins`,
// `platform_admin_sessions`, `platform_admin_actions` — jsou účty provozovatele
// PLATFORMY. Stojí mimo tenanta (nemají `tenant_id`, tedy ani RLS) a provozovatel
// studia k nim nemá přístup ani důvod: nejsou to jeho zákazníci ani zaměstnanci.
// Výmaz těchhle účtů patří do správy platformy, ne sem. Zapsáno jako známý dluh,
// ne jako opomenutí.
//
// ── IZOLACE TENANTŮ ─────────────────────────────────────────────────────────
// Všechno běží v `withRlsContext` s kontextem přihlášeného tenanta a NAVÍC má
// každý dotaz `tenant_id` ve WHERE (obranná vrstva podle CLAUDE.md). Export ani
// výmaz se tedy nemůže dotknout cizího tenanta ani při chybě v RLS politice.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';
import type { EraseRequestDto } from './dto/gdpr.dto.js';

/** Export i výmaz smí jen vlastník a manažer — ne recepční ani řadový zaměstnanec. */
const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Osobní údaje smí exportovat a mazat jen vlastník nebo manažer.',
      },
    });
  }
}

function radky(res: unknown): Array<Record<string, unknown>> {
  return Array.isArray(res) ? (res as Array<Record<string, unknown>>) : [];
}

/** Počet dotčených řádků — u dotazů s RETURNING. */
function pocet(res: unknown): number {
  return radky(res).length;
}

/**
 * Tabulky, které se k zákazníkovi váží sloupcem `customer_id`.
 *
 * POZOR: reálný cizí klíč na `customers` má jen 11 z nich. U zbytku je
 * `customer_id` holé UUID bez vazby, takže smazání zákazníka by tam nechalo
 * ležet řádky včetně kopie jména a e-mailu. Proto je tenhle seznam vyčerpávající
 * a projíždí se jak při exportu, tak při výmazu.
 */
const TABULKY_PODLE_ID = [
  'bookings',
  'class_session_waitlist',
  'appointment_records',
  'makeup_credits',
  'orders',
  'pos_sales',
  'stays',
  'table_reservations',
  'access_grants',
  'challenge_participants',
  'course_enrollments',
  'loyalty_transactions',
  'loyalty_reward_redemptions',
  'referral_codes',
  'reviews',
  'intake_submissions',
  'payments',
  'customer_credit_packs',
  'customer_bundle_packs',
  'customer_time_packs',
  'customer_subscriptions',
  'corporate_account_members',
  'customer_tags',
  'customer_notes',
  'customer_sessions',
] as const;

@Injectable()
export class GdprService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  async exportCustomer(tenantId: string, userId: string, role: AppRole, customerId: string) {
    assertCanManage(role);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const zakaznik = await this.nactiZakaznika(tx, tenantId, customerId);
      const email = String(zakaznik.email ?? '').toLowerCase();
      const telefon = zakaznik.phone ? String(zakaznik.phone) : null;

      const data: Record<string, Array<Record<string, unknown>>> = {};

      // 1) Vše, co se váže přes customer_id.
      for (const tabulka of TABULKY_PODLE_ID) {
        const res = await tx.execute(
          sql`SELECT * FROM ${sql.identifier(tabulka)}
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}`,
        );
        data[tabulka] = radky(res);
      }

      // 2) Tabulky, kde zákazník figuruje JEN e-mailem (nemají customer_id).
      //    Bez nich by byl export tiše neúplný.
      data['booking_series'] = radky(
        await tx.execute(
          sql`SELECT * FROM booking_series
              WHERE tenant_id = ${tenantId} AND lower(customer_email) = ${email}`,
        ),
      );

      data['notifications'] = radky(
        await tx.execute(
          sql`SELECT * FROM notifications
              WHERE tenant_id = ${tenantId}
                AND (lower(recipient) = ${email} OR (${telefon}::text IS NOT NULL AND recipient = ${telefon}))`,
        ),
      );

      data['gift_vouchers'] = radky(
        await tx.execute(
          sql`SELECT * FROM gift_vouchers
              WHERE tenant_id = ${tenantId}
                AND (lower(recipient_email) = ${email} OR lower(purchaser_email) = ${email})`,
        ),
      );

      data['referral_redemptions'] = radky(
        await tx.execute(
          sql`SELECT * FROM referral_redemptions
              WHERE tenant_id = ${tenantId}
                AND (referrer_customer_id = ${customerId}
                     OR referee_customer_id = ${customerId}
                     OR lower(referee_email) = ${email})`,
        ),
      );

      data['customer_magic_links'] = radky(
        await tx.execute(
          sql`SELECT * FROM customer_magic_links
              WHERE tenant_id = ${tenantId}
                AND (customer_id = ${customerId} OR lower(email) = ${email})`,
        ),
      );

      // Dispečink zakázek NEMÁ sloupec `customer_id` — na zákazníka se váže jen
      // textem. Párujeme podle TELEFONU a jen když ho zákazník má. Podle jména
      // schválně ne: jmenovců je dost na to, aby se do exportu dostala cizí
      // zakázka — a při výmazu aby se smazala cizí data. Neúplnost je menší zlo
      // než záměna osob, a je přiznaná v poli `nezahrnuto`.
      data['logistics_jobs'] = telefon
        ? radky(
            await tx.execute(
              sql`SELECT * FROM logistics_jobs
                  WHERE tenant_id = ${tenantId} AND customer_phone = ${telefon}`,
            ),
          )
        : [];

      // 3) Navázané přes rezervace / permanentky (druhá úroveň).
      data['booking_status_history'] = radky(
        await tx.execute(
          sql`SELECT h.* FROM booking_status_history h
              JOIN bookings b ON b.id = h.booking_id
              WHERE b.tenant_id = ${tenantId} AND b.customer_id = ${customerId}`,
        ),
      );

      data['credit_uses'] = radky(
        await tx.execute(
          sql`SELECT u.* FROM credit_uses u
              JOIN customer_credit_packs p ON p.id = u.customer_credit_pack_id
              WHERE p.tenant_id = ${tenantId} AND p.customer_id = ${customerId}`,
        ),
      );

      data['bundle_item_uses'] = radky(
        await tx.execute(
          sql`SELECT u.* FROM bundle_item_uses u
              JOIN customer_bundle_packs p ON p.id = u.customer_bundle_pack_id
              WHERE p.tenant_id = ${tenantId} AND p.customer_id = ${customerId}`,
        ),
      );

      data['time_pack_uses'] = radky(
        await tx.execute(
          sql`SELECT u.* FROM time_pack_uses u
              JOIN customer_time_packs p ON p.id = u.customer_time_pack_id
              WHERE p.tenant_id = ${tenantId} AND p.customer_id = ${customerId}`,
        ),
      );

      data['payment_events'] = radky(
        await tx.execute(
          sql`SELECT e.* FROM payment_events e
              JOIN payments p ON p.id = e.payment_id
              WHERE p.tenant_id = ${tenantId} AND p.customer_id = ${customerId}`,
        ),
      );

      data['subscription_events'] = radky(
        await tx.execute(
          sql`SELECT e.* FROM subscription_events e
              JOIN customer_subscriptions s ON s.id = e.customer_subscription_id
              WHERE s.tenant_id = ${tenantId} AND s.customer_id = ${customerId}`,
        ),
      );

      data['order_items'] = radky(
        await tx.execute(
          sql`SELECT i.* FROM order_items i
              JOIN orders o ON o.id = i.order_id
              WHERE i.tenant_id = ${tenantId}
                AND o.tenant_id = ${tenantId} AND o.customer_id = ${customerId}`,
        ),
      );

      // POZOR: spojovací sloupec se jmenuje `sale_id`, ne `pos_sale_id`.
      data['pos_sale_items'] = radky(
        await tx.execute(
          sql`SELECT i.* FROM pos_sale_items i
              JOIN pos_sales s ON s.id = i.sale_id
              WHERE i.tenant_id = ${tenantId}
                AND s.tenant_id = ${tenantId} AND s.customer_id = ${customerId}`,
        ),
      );

      data['access_events'] = radky(
        await tx.execute(
          sql`SELECT e.* FROM access_events e
              JOIN access_grants g ON g.id = e.grant_id
              WHERE e.tenant_id = ${tenantId}
                AND g.tenant_id = ${tenantId} AND g.customer_id = ${customerId}`,
        ),
      );

      const pocty = Object.fromEntries(
        Object.entries(data).map(([klic, hodnota]) => [klic, hodnota.length]),
      );

      return {
        format: 'reserved.gdpr.export.v1',
        generatedAt: new Date().toISOString(),
        tenantId,
        subject: { type: 'customer', id: customerId },
        customer: zakaznik,
        data,
        pocty,
        // Přiznaná neúplnost je lepší než tichá. Tohle se do exportu nedostane
        // a proč:
        nezahrnuto: [
          {
            zdroj: 'rule_executions.event_payload, webhook_deliveries.payload',
            duvod:
              'Technické auditní logy. Obsahují snímek události, ne strukturovaný profil; při výmazu se čistí.',
          },
        ],
      };
    });
  }

  async exportEmployee(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    assertCanManage(role);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const zamestnanec = await this.nactiZamestnance(tx, tenantId, employeeId);
      const data: Record<string, Array<Record<string, unknown>>> = {};

      for (const tabulka of [
        'employee_branches',
        'employee_services',
        'employee_working_hours',
        'employee_schedule_exceptions',
        'commission_rules',
        'payouts',
      ] as const) {
        const res = await tx.execute(
          sql`SELECT * FROM ${sql.identifier(tabulka)} WHERE employee_id = ${employeeId}`,
        );
        data[tabulka] = radky(res);
      }

      // Evidence neúspěšných přihlášení k tomuhle účtu (e-mail + IP). Bez ní by
      // export tvrdil úplnost, kterou nemá — tabulka vznikla až po GDPR fázi.
      const emailZam = String(zamestnanec.email ?? '').toLowerCase();
      data['login_attempts'] = emailZam
        ? radky(
            await tx.execute(
              sql`SELECT id, email, ip_address, user_agent, reason, resolved_at, created_at
                  FROM login_attempts
                  WHERE tenant_id = ${tenantId} AND lower(email) = ${emailZam}`,
            ),
          )
        : [];

      // Napojení na Google kalendář BEZ tokenů — export se předává člověku,
      // přístupové tokeny do něj nepatří (je to přihlašovací údaj, ne osobní údaj
      // k přenositelnosti).
      data['google_calendar_connections'] = radky(
        await tx.execute(
          sql`SELECT id, employee_id, google_email, calendar_id, created_at, updated_at
              FROM google_calendar_connections WHERE employee_id = ${employeeId}`,
        ),
      );

      // Přihlašovací účet, pokud ho zaměstnanec má — bez hesla a bez 2FA tajemství.
      const userId2 = zamestnanec.user_id ? String(zamestnanec.user_id) : null;
      data['users'] = userId2
        ? radky(
            await tx.execute(
              sql`SELECT id, tenant_id, email, first_name, last_name, phone, role,
                         is_active, email_verified_at, last_login_at, created_at
                  FROM users WHERE id = ${userId2} AND tenant_id = ${tenantId}`,
            ),
          )
        : [];

      const pocty = Object.fromEntries(
        Object.entries(data).map(([klic, hodnota]) => [klic, hodnota.length]),
      );

      return {
        format: 'reserved.gdpr.export.v1',
        generatedAt: new Date().toISOString(),
        tenantId,
        subject: { type: 'employee', id: employeeId },
        employee: zamestnanec,
        data,
        pocty,
        nezahrnuto: [
          {
            zdroj: 'google_calendar_connections.access_token / refresh_token',
            duvod: 'Přístupové tokeny jsou přihlašovací údaj, ne osobní údaj k přenositelnosti.',
          },
          {
            zdroj: 'users.password_hash, users.two_factor_secret',
            duvod: 'Totéž — bezpečnostní údaje se neexportují.',
          },
        ],
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VÝMAZ
  // ─────────────────────────────────────────────────────────────────────────

  async eraseCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: EraseRequestDto,
  ) {
    assertCanManage(role);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const zakaznik = await this.nactiZakaznika(tx, tenantId, customerId);
      const puvodniEmail = String(zakaznik.email ?? '').toLowerCase();
      const puvodniTelefon = zakaznik.phone ? String(zakaznik.phone) : null;

      // Jeden náhodný token na zákazníka — viz komentář v hlavičce souboru.
      const token = randomUUID();
      const anonEmail = `anon-${token}@anonymized.invalid`;
      const anonJmeno = 'Smazaný';
      const anonPrijmeni = 'zákazník';
      const anonCele = `${anonJmeno} ${anonPrijmeni}`;

      const smazano: Record<string, number> = {};
      const anonymizovano: Record<string, number> = {};

      // ── 1. SMAZAT ÚPLNĚ ────────────────────────────────────────────────
      // Nemá účetní hodnotu a je to čisté PII. Poznámky a štítky navíc běžně
      // obsahují zdravotní údaje („alergie"), dotazníky taky — ty nemají důvod
      // přežít výmaz v žádné podobě.
      for (const tabulka of [
        'customer_tags',
        'customer_notes',
        'customer_sessions',
        'intake_submissions',
      ] as const) {
        const res = await tx.execute(
          sql`DELETE FROM ${sql.identifier(tabulka)}
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        );
        smazano[tabulka] = pocet(res);
      }

      // Magic linky — i ty, které ještě nemají customer_id a nesou jen e-mail.
      smazano['customer_magic_links'] = pocet(
        await tx.execute(
          sql`DELETE FROM customer_magic_links
              WHERE tenant_id = ${tenantId}
                AND (customer_id = ${customerId} OR lower(email) = ${puvodniEmail})
              RETURNING id`,
        ),
      );

      // ── 2. ANONYMIZOVAT ZÁKAZNÍKA SAMOTNÉHO ────────────────────────────
      anonymizovano['customers'] = pocet(
        await tx.execute(
          sql`UPDATE customers SET
                first_name = ${anonJmeno},
                last_name = ${anonPrijmeni},
                email = ${anonEmail},
                phone = NULL,
                country = NULL,
                date_of_birth = NULL,
                marketing_opt_in = false,
                metadata = '{}'::jsonb,
                password_hash = NULL,
                email_verified_at = NULL,
                last_login_at = NULL,
                user_id = NULL,
                is_active = false,
                deleted_at = now(),
                updated_at = now()
              WHERE tenant_id = ${tenantId} AND id = ${customerId}
              RETURNING id`,
        ),
      );

      // ── 3. ANONYMIZOVAT ZDVOJENÉ KOPIE ÚDAJŮ ───────────────────────────
      // Vazba `customer_id` se ZÁMĚRNĚ nechává. Ukazuje na anonymizovaný řádek,
      // takže souhrny, reporty i cizí klíče drží — jen už nikoho neidentifikují.

      anonymizovano['bookings'] = pocet(
        await tx.execute(
          sql`UPDATE bookings SET
                customer_name = ${anonCele}, customer_email = ${anonEmail},
                customer_phone = NULL, customer_note = NULL, internal_note = NULL,
                confirmation_token = NULL, metadata = '{}'::jsonb, updated_at = now()
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      anonymizovano['booking_series'] = pocet(
        await tx.execute(
          sql`UPDATE booking_series SET
                customer_name = ${anonCele}, customer_email = ${anonEmail},
                customer_phone = NULL, metadata = '{}'::jsonb, updated_at = now()
              WHERE tenant_id = ${tenantId} AND lower(customer_email) = ${puvodniEmail}
              RETURNING id`,
        ),
      );

      anonymizovano['booking_status_history'] = pocet(
        await tx.execute(
          sql`UPDATE booking_status_history SET reason = NULL, metadata = '{}'::jsonb
              WHERE booking_id IN (
                SELECT id FROM bookings WHERE tenant_id = ${tenantId} AND customer_id = ${customerId}
              ) RETURNING id`,
        ),
      );

      for (const tabulka of [
        'class_session_waitlist',
        'appointment_records',
        'makeup_credits',
        'challenge_participants',
        'course_enrollments',
      ] as const) {
        anonymizovano[tabulka] = pocet(
          await tx.execute(
            sql`UPDATE ${sql.identifier(tabulka)} SET
                  customer_name = ${anonCele}, customer_email = ${anonEmail}
                WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
          ),
        );
      }

      // Telefon má jen část z nich.
      anonymizovano['class_session_waitlist_phone'] = pocet(
        await tx.execute(
          sql`UPDATE class_session_waitlist SET customer_phone = NULL
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      anonymizovano['appointment_records_text'] = pocet(
        await tx.execute(
          sql`UPDATE appointment_records SET summary = NULL, private_note = NULL
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      anonymizovano['orders'] = pocet(
        await tx.execute(
          sql`UPDATE orders SET customer_name = ${anonCele}, customer_email = ${anonEmail},
                updated_at = now()
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      for (const tabulka of ['stays', 'table_reservations'] as const) {
        anonymizovano[tabulka] = pocet(
          await tx.execute(
            sql`UPDATE ${sql.identifier(tabulka)} SET
                  customer_name = ${anonCele}, customer_email = ${anonEmail},
                  customer_phone = NULL, note = NULL, updated_at = now()
                WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
          ),
        );
      }

      anonymizovano['table_reservations_detail'] = pocet(
        await tx.execute(
          sql`UPDATE table_reservations SET occasion = NULL, seating_pref = NULL
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      // Dispečink nemá `customer_id` — párujeme podle telefonu, a jen když ho
      // zákazník má. Podle jména ne: jmenovec by přišel o svoje zakázky.
      anonymizovano['logistics_jobs'] = puvodniTelefon
        ? pocet(
            await tx.execute(
              sql`UPDATE logistics_jobs SET
                    customer_name = ${anonCele}, customer_phone = NULL, note = NULL,
                    pickup_address = ${'(smazáno)'}, dropoff_address = ${'(smazáno)'},
                    updated_at = now()
                  WHERE tenant_id = ${tenantId} AND customer_phone = ${puvodniTelefon}
                  RETURNING id`,
            ),
          )
        : 0;

      anonymizovano['access_grants'] = pocet(
        await tx.execute(
          sql`UPDATE access_grants SET customer_name = ${anonCele}
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      anonymizovano['reviews'] = pocet(
        await tx.execute(
          sql`UPDATE reviews SET comment = NULL, updated_at = now()
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      // Volný text u peněžních a věrnostních záznamů. Částky a body zůstávají —
      // jinak by přestaly sedět souhrny a věrnostní zůstatky.
      for (const tabulka of [
        'loyalty_transactions',
        'customer_credit_packs',
        'customer_bundle_packs',
        'customer_time_packs',
        'customer_subscriptions',
        'pos_sales',
      ] as const) {
        anonymizovano[tabulka] = pocet(
          await tx.execute(
            sql`UPDATE ${sql.identifier(tabulka)} SET note = NULL
                WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
          ),
        );
      }

      anonymizovano['payments'] = pocet(
        await tx.execute(
          sql`UPDATE payments SET description = NULL, failure_reason = NULL,
                metadata = '{}'::jsonb, updated_at = now()
              WHERE tenant_id = ${tenantId} AND customer_id = ${customerId} RETURNING id`,
        ),
      );

      anonymizovano['referral_redemptions'] = pocet(
        await tx.execute(
          sql`UPDATE referral_redemptions SET referee_email = ${anonEmail}
              WHERE tenant_id = ${tenantId}
                AND (referrer_customer_id = ${customerId}
                     OR referee_customer_id = ${customerId}
                     OR lower(referee_email) = ${puvodniEmail})
              RETURNING id`,
        ),
      );

      anonymizovano['gift_vouchers'] = pocet(
        await tx.execute(
          sql`UPDATE gift_vouchers SET
                recipient_name = CASE WHEN lower(recipient_email) = ${puvodniEmail}
                                      THEN ${anonCele} ELSE recipient_name END,
                recipient_email = CASE WHEN lower(recipient_email) = ${puvodniEmail}
                                       THEN ${anonEmail} ELSE recipient_email END,
                purchaser_email = CASE WHEN lower(purchaser_email) = ${puvodniEmail}
                                       THEN ${anonEmail} ELSE purchaser_email END,
                note = NULL, updated_at = now()
              WHERE tenant_id = ${tenantId}
                AND (lower(recipient_email) = ${puvodniEmail} OR lower(purchaser_email) = ${puvodniEmail})
              RETURNING id`,
        ),
      );

      // Fronta notifikací drží vyrenderovaný text se jménem i adresátem.
      anonymizovano['notifications'] = pocet(
        await tx.execute(
          sql`UPDATE notifications SET
                recipient = ${anonEmail}, subject = NULL,
                body = ${'(obsah smazán na žádost o výmaz osobních údajů)'},
                metadata = '{}'::jsonb, updated_at = now()
              WHERE tenant_id = ${tenantId}
                AND (lower(recipient) = ${puvodniEmail}
                     OR (${puvodniTelefon}::text IS NOT NULL AND recipient = ${puvodniTelefon}))
              RETURNING id`,
        ),
      );

      // Technické auditní logy se snímkem události — obsahují celá data klienta.
      anonymizovano['rule_executions'] = pocet(
        await tx.execute(
          sql`UPDATE rule_executions SET event_payload = '{}'::jsonb, action_results = '{}'::jsonb
              WHERE tenant_id = ${tenantId}
                AND (event_payload::text ILIKE ${'%' + puvodniEmail + '%'}
                     OR event_payload::text ILIKE ${'%' + customerId + '%'})
              RETURNING id`,
        ),
      );

      anonymizovano['webhook_deliveries'] = pocet(
        await tx.execute(
          sql`UPDATE webhook_deliveries SET payload = '{}'::jsonb, response_body = NULL
              WHERE tenant_id = ${tenantId}
                AND (payload::text ILIKE ${'%' + puvodniEmail + '%'}
                     OR payload::text ILIKE ${'%' + customerId + '%'})
              RETURNING id`,
        ),
      );

      // Auditní stopa o samotném výmazu — bez původních údajů, jen fakt a důvod.
      await tx.execute(
        sql`INSERT INTO customer_notes (tenant_id, customer_id, note, category, visibility, created_by)
            VALUES (${tenantId}, ${customerId},
                    ${`Osobní údaje vymazány na žádost (GDPR). Důvod: ${dto.reason ?? 'neuveden'}.`},
                    'general', 'managers', ${userId})`,
      );

      return {
        subject: { type: 'customer', id: customerId },
        erasedAt: new Date().toISOString(),
        anonymizedEmail: anonEmail,
        smazano,
        anonymizovano,
        ponechano: [
          {
            zdroj: 'payments, orders, pos_sales, customer_*_packs (částky a data)',
            duvod: 'Účetní a daňová evidence — zákon ukládá uchovat. Osobní údaje z nich smazány.',
          },
          {
            zdroj: 'payment_events.payload, subscription_events.payload',
            duvod:
              'Doklad o platební transakci od brány (Stripe/GoPay). Podléhá účetní retenci; smazáním by se ztratil doklad o zaplacení.',
          },
          {
            zdroj: 'bookings.customer_id a další vazby',
            duvod:
              'Ukazují na anonymizovaný řádek. Ponechány schválně, aby držely cizí klíče, souhrny a reporty.',
          },
        ],
      };
    });
  }

  async eraseEmployee(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
    dto: EraseRequestDto,
  ) {
    assertCanManage(role);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const zamestnanec = await this.nactiZamestnance(tx, tenantId, employeeId);
      const ucetId = zamestnanec.user_id ? String(zamestnanec.user_id) : null;

      const token = randomUUID();
      const anonEmail = `anon-${token}@anonymized.invalid`;
      const anonCele = 'Smazaný zaměstnanec';

      const smazano: Record<string, number> = {};
      const anonymizovano: Record<string, number> = {};

      // Napojení na Google kalendář nese přístupové tokeny — mazat, ne anonymizovat.
      smazano['google_calendar_connections'] = pocet(
        await tx.execute(
          sql`DELETE FROM google_calendar_connections
              WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} RETURNING id`,
        ),
      );

      anonymizovano['employees'] = pocet(
        await tx.execute(
          sql`UPDATE employees SET
                first_name = 'Smazaný', last_name = 'zaměstnanec',
                display_name = ${anonCele}, email = ${anonEmail},
                phone = NULL, bio = NULL, avatar_url = NULL, title = NULL,
                metadata = '{}'::jsonb, is_active = false,
                deleted_at = now(), updated_at = now()
              WHERE tenant_id = ${tenantId} AND id = ${employeeId} RETURNING id`,
        ),
      );

      // Výjimky v rozvrhu prozrazují nemoc a dovolenou — volný text pryč.
      anonymizovano['employee_schedule_exceptions'] = pocet(
        await tx.execute(
          sql`UPDATE employee_schedule_exceptions SET note = NULL
              WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} RETURNING id`,
        ),
      );

      // Evidence neúspěšných přihlášení nese e-mail a IP adresu — osobní údaj
      // jako každý jiný. Maže se podle E-MAILU, ne podle user_id: pokusy na
      // neexistující účet (překlep, zkoušení adres) user_id vyplněné nemají.
      const emailZamestnance = String(zamestnanec.email ?? '').toLowerCase();
      smazano['login_attempts'] = emailZamestnance
        ? pocet(
            await tx.execute(
              sql`DELETE FROM login_attempts
                  WHERE tenant_id = ${tenantId} AND lower(email) = ${emailZamestnance}
                  RETURNING id`,
            ),
          )
        : 0;

      if (ucetId) {
        smazano['user_sessions'] = pocet(
          await tx.execute(sql`DELETE FROM user_sessions WHERE user_id = ${ucetId} RETURNING id`),
        );
        smazano['email_verifications'] = pocet(
          await tx.execute(
            sql`DELETE FROM email_verifications
                WHERE tenant_id = ${tenantId} AND user_id = ${ucetId} RETURNING id`,
          ),
        );
        anonymizovano['users'] = pocet(
          await tx.execute(
            sql`UPDATE users SET
                  email = ${anonEmail}, first_name = 'Smazaný', last_name = 'uživatel',
                  phone = NULL, password_hash = NULL, two_factor_secret = NULL,
                  two_factor_enabled = false, email_verified_at = NULL, last_login_at = NULL,
                  is_active = false, deleted_at = now(), updated_at = now()
                WHERE tenant_id = ${tenantId} AND id = ${ucetId} RETURNING id`,
          ),
        );
      }

      return {
        subject: { type: 'employee', id: employeeId },
        erasedAt: new Date().toISOString(),
        anonymizedEmail: anonEmail,
        reason: dto.reason ?? null,
        smazano,
        anonymizovano,
        ponechano: [
          {
            zdroj: 'payouts.employee_name a částky',
            duvod:
              'Mzdový a odvodový doklad. Zaměstnavatel ho musí uchovat po zákonnou dobu a musí z něj být poznat, komu se platilo — anonymizace by ho znehodnotila.',
          },
          {
            zdroj: 'bookings.employee_id, commission_rules',
            duvod: 'Provozní historie a podklad k již vyplaceným provizím.',
          },
        ],
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async nactiZakaznika(
    tx: Database,
    tenantId: string,
    customerId: string,
  ): Promise<Record<string, unknown>> {
    const res = await tx.execute(
      sql`SELECT * FROM customers WHERE tenant_id = ${tenantId} AND id = ${customerId} LIMIT 1`,
    );
    const zakaznik = radky(res)[0];
    if (!zakaznik) {
      // Stejná chyba pro „neexistuje" i „patří cizímu tenantovi" — jinak by
      // endpoint prozrazoval existenci cizích záznamů.
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
      });
    }
    return zakaznik;
  }

  private async nactiZamestnance(
    tx: Database,
    tenantId: string,
    employeeId: string,
  ): Promise<Record<string, unknown>> {
    const res = await tx.execute(
      sql`SELECT * FROM employees WHERE tenant_id = ${tenantId} AND id = ${employeeId} LIMIT 1`,
    );
    const zamestnanec = radky(res)[0];
    if (!zamestnanec) {
      throw new NotFoundException({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
      });
    }
    return zamestnanec;
  }
}
