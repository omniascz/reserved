// Widget i18n — flat klíčový slovník pro CS + EN.
// Widget je embed do cizí stránky, takže jazyk volíme přes ?lang=cs|en
// (nebo dle tenant.locale jako default — TODO).

export const messages = {
  cs: {
    // Page + headers
    onlineBooking: 'Online rezervace',
    notFound: 'Salon nenalezen',
    notFoundHelp: 'Zkontroluj, že máš v adrese správný slug salonu.',
    cantLoad: 'Nelze načíst informace o salonu.',
    loading: 'Načítám…',

    // Steps
    'step.branch': 'Pobočka',
    'step.service': 'Služba',
    'step.employee': 'Specialista',
    'step.datetime': 'Termín',
    'step.contact': 'Kontakt',
    'step.confirmation': 'Potvrzení',

    // BranchStep
    'branch.title': 'Vyber pobočku',
    'branch.subtitle': 'Kam chceš přijít na rezervaci?',

    // ServiceStep
    'service.title': 'Vyber službu',
    'service.loading': 'Načítám služby…',
    'service.none': 'Tento salon zatím nemá veřejně dostupné služby.',
    'service.error': 'Chyba při načítání služeb.',

    // EmployeeStep
    'employee.title': 'Vyber specialistu',
    'employee.forService': 'Pro službu',
    'employee.none': 'Tuto službu zatím nikdo nenabízí.',
    'common.back': '← Zpět',

    // DateTimeStep
    'datetime.title': 'Vyber termín',
    'datetime.loading': 'Načítám termíny…',
    'datetime.noSlots': 'Pro tento den nejsou žádné volné termíny. Vyber jiný den.',
    'datetime.prevDay': 'Předchozí den',
    'datetime.nextDay': 'Další den',
    'datetime.locking': 'zamykám…',
    'datetime.slotTaken': 'Tento termín už si někdo zarezervoval. Vyber jiný.',
    'datetime.bookingError': 'Chyba při rezervaci',

    // ContactStep
    'contact.title': 'Tvoje údaje',
    'contact.name': 'Jméno a příjmení *',
    'contact.email': 'Email *',
    'contact.phone': 'Telefon (volitelně)',
    'contact.note': 'Poznámka (volitelně)',
    'contact.submit': 'Potvrdit rezervaci',
    'contact.submitting': 'Potvrzuji…',
    'contact.gdpr':
      'Klikem na Potvrdit souhlasíš se zpracováním osobních údajů pro účely rezervace.',
    'contact.holdExpired': 'Časový limit pro dokončení rezervace vypršel. Vyber termín znovu.',
    'contact.genericError': 'Chyba',

    // ConfirmationStep
    'confirm.title': 'Rezervace potvrzena',
    'confirm.thanks': 'Děkujeme za rezervaci v {tenant}. Potvrzení jsme ti poslali emailem.',
    'confirm.reference': 'Číslo rezervace',
    'confirm.day': 'Den',
    'confirm.time': 'Čas',
    'confirm.newBooking': 'Vytvořit další rezervaci',

    // CountdownTimer
    'timer.expired': '⏱ Termín už není rezervovaný — vrať se prosím a vyber znovu.',
    'timer.lockedFor': '⏱ Slot je pro tebe zamknutý ještě',
  },
  en: {
    onlineBooking: 'Online booking',
    notFound: 'Salon not found',
    notFoundHelp: "Check that the salon's slug is correct in the URL.",
    cantLoad: 'Unable to load salon information.',
    loading: 'Loading…',

    'step.branch': 'Branch',
    'step.service': 'Service',
    'step.employee': 'Staff',
    'step.datetime': 'Date & time',
    'step.contact': 'Contact',
    'step.confirmation': 'Confirmation',

    'branch.title': 'Pick a branch',
    'branch.subtitle': 'Where would you like to come?',

    'service.title': 'Pick a service',
    'service.loading': 'Loading services…',
    'service.none': "This salon doesn't have any public services yet.",
    'service.error': 'Failed to load services.',

    'employee.title': 'Pick a staff member',
    'employee.forService': 'For service',
    'employee.none': 'No one offers this service yet.',
    'common.back': '← Back',

    'datetime.title': 'Pick a time slot',
    'datetime.loading': 'Loading slots…',
    'datetime.noSlots': 'No free slots on this day. Pick another day.',
    'datetime.prevDay': 'Previous day',
    'datetime.nextDay': 'Next day',
    'datetime.locking': 'locking…',
    'datetime.slotTaken': 'Someone just booked this slot. Pick another.',
    'datetime.bookingError': 'Booking error',

    'contact.title': 'Your details',
    'contact.name': 'Full name *',
    'contact.email': 'Email *',
    'contact.phone': 'Phone (optional)',
    'contact.note': 'Note (optional)',
    'contact.submit': 'Confirm booking',
    'contact.submitting': 'Confirming…',
    'contact.gdpr':
      'By clicking Confirm you agree to the processing of your personal data for booking purposes.',
    'contact.holdExpired': 'Time limit for completing the booking expired. Pick a slot again.',
    'contact.genericError': 'Error',

    'confirm.title': 'Booking confirmed',
    'confirm.thanks': 'Thank you for booking at {tenant}. We sent you a confirmation email.',
    'confirm.reference': 'Reference number',
    'confirm.day': 'Day',
    'confirm.time': 'Time',
    'confirm.newBooking': 'Make another booking',

    'timer.expired': '⏱ Slot reservation expired — please go back and pick again.',
    'timer.lockedFor': '⏱ Slot is locked for you for',
  },
} as const;

export type Lang = keyof typeof messages;
export type MessageKey = keyof (typeof messages)['cs'];

export function isLang(value: string | null | undefined): value is Lang {
  return value === 'cs' || value === 'en';
}
