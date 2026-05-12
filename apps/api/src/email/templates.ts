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

/** Vars pro portal/auth e-maily (sprint 2.3). */
export interface PortalEmailVars {
  customerName: string;
  tenantName: string;
  /** Plný URL s ?token= — vygenerovaný v PortalAuthService. */
  magicLinkUrl?: string;
  /** Minut do expirace (typicky 15). */
  expiresInMinutes?: number;
}

export type EmailVars = BookingEmailVars | PortalEmailVars;

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
  magic_link: {
    subject: 'Přihlašovací odkaz — {{tenantName}}',
    body: `Dobrý den {{customerName}},

klikněte na odkaz níže a budete přihlášen/a do svého účtu v {{tenantName}}.
Žádné heslo nepotřebujete.

  {{magicLinkUrl}}

Odkaz vyprší za {{expiresInMinutes}} minut. Pokud jste o přihlášení nežádali,
e-mail můžete ignorovat.

Tým {{tenantName}}`,
  },
  password_set_confirm: {
    subject: 'Heslo bylo nastaveno — {{tenantName}}',
    body: `Dobrý den {{customerName}},

vaše heslo pro účet v {{tenantName}} bylo úspěšně nastaveno. Příště
se můžete přihlásit e-mailem a heslem bez čekání na odkaz.

Pokud jste heslo neměnili, okamžitě kontaktujte salon.

Tým {{tenantName}}`,
  },
};

export function renderEmail(templateCode: string, vars: EmailVars): EmailTemplate {
  const tpl = TEMPLATES[templateCode];
  if (!tpl) {
    throw new Error(`Unknown email template: ${templateCode}`);
  }
  return {
    subject: render(tpl.subject, vars as unknown as Record<string, unknown>),
    body: render(tpl.body, vars as unknown as Record<string, unknown>),
  };
}
