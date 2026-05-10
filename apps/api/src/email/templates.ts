// Jednoduché email šablony. {{var}} substituce — žádné HTML inženýrství.
// V budoucnu nahradíme React Email nebo MJML; pro MVP stačí plain text.

export interface BookingEmailVars {
  customerName: string;
  serviceName: string;
  employeeName: string;
  tenantName: string;
  startsAt: string;
  endsAt: string;
  referenceCode: string;
  /** Volitelná poznámka — důvod zrušení / přesunu. */
  reason?: string;
  /** Volitelný starý čas (pro reschedule). */
  oldStartsAt?: string;
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  booking_confirmed: {
    subject: 'Potvrzení rezervace — {{tenantName}}',
    body: `Dobrý den {{customerName}},

děkujeme za rezervaci v {{tenantName}}.

Detaily:
  Služba:       {{serviceName}}
  Zaměstnanec:  {{employeeName}}
  Začátek:      {{startsAt}}
  Konec:        {{endsAt}}
  Číslo rezervace: {{referenceCode}}

Pokud potřebujete cokoliv změnit, kontaktujte nás.

Tým {{tenantName}}`,
  },
  booking_cancelled: {
    subject: 'Vaše rezervace byla zrušena — {{tenantName}}',
    body: `Dobrý den {{customerName}},

vaše rezervace č. {{referenceCode}} ({{serviceName}}, {{startsAt}}) byla zrušena.

{{reason}}

Tým {{tenantName}}`,
  },
  booking_rescheduled: {
    subject: 'Vaše rezervace byla přesunuta — {{tenantName}}',
    body: `Dobrý den {{customerName}},

vaše rezervace č. {{referenceCode}} byla přesunuta.

Nový termín:
  Začátek:  {{startsAt}}
  Konec:    {{endsAt}}
  Služba:   {{serviceName}}

Předchozí termín ({{oldStartsAt}}) byl zrušen.

Tým {{tenantName}}`,
  },
};

export function renderEmail(templateCode: string, vars: BookingEmailVars): EmailTemplate {
  const tpl = TEMPLATES[templateCode];
  if (!tpl) {
    throw new Error(`Unknown email template: ${templateCode}`);
  }
  return {
    subject: render(tpl.subject, vars as unknown as Record<string, unknown>),
    body: render(tpl.body, vars as unknown as Record<string, unknown>),
  };
}
