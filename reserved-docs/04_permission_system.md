# 04 — Permission System & Rules Engine

## Přehled

Systém oprávnění je dvouvrstvý:

1. **Permission Matrix** — kdo smí provést jakou akci (RBAC s granulárními přepisy)
2. **Rules Engine** — za jakých podmínek akci systém povolí (konfigurovatelná obchodní logika)

Obě vrstvy jsou nezávislé a spolupracují: Permission Matrix říká "zaměstnanec smí zrušit rezervaci", Rules Engine říká "ale jen pokud je to více než 2 hodiny před termínem a zákazník ještě nezrušil 2× tento měsíc".

---

## Permission Matrix (RBAC)

### Systémové role

| Role | Popis |
|------|-------|
| `owner` | Majitel — plný přístup ke všemu, nelze omezit |
| `manager` | Manažer pobočky nebo oddělení — řídí tým a rezervace |
| `employee` | Zaměstnanec — vidí a spravuje své rezervace |
| `receptionist` | Recepce — plná správa rezervací, žádný přístup k financím |
| `client` | Zákazník — klientský portál |
| `api` | Systémový API klíč — pro integrace |

### Vlastní role

Majitel si definuje libovolné vlastní role s názvem a přiřazením oprávnění z matice. Příklady:

- Senior stylistka (= employee + vidí tržby svých klientů)
- Franšízant (= manager omezený na jednu pobočku)
- Účetní (= pouze čtení finančních reportů)

### Matice oprávnění (výběr)

| Akce | Owner | Manager | Employee | Receptionist | Client |
|------|-------|---------|----------|--------------|--------|
| Vytvořit rezervaci | ✓ | ✓ | ✓ (vlastní) | ✓ | ✓ (portál) |
| Zrušit rezervaci | ✓ | ✓ | ✓ (vlastní, dle pravidel) | ✓ | ✓ (dle pravidel) |
| Přesunout rezervaci | ✓ | ✓ | ✓ (vlastní, dle pravidel) | ✓ | ✓ (dle pravidel) |
| Přeřadit na kolegu | ✓ | ✓ | — | ✓ | — |
| Hromadné operace | ✓ | ✓ | — | — | — |
| Vidět tržby | ✓ | ✓ (pobočka) | — | — | — |
| Exportovat zákazníky | ✓ | ✓ | — | — | — |
| Spravovat pravidla | ✓ | — | — | — | — |
| Spravovat balíčky | ✓ | ✓ (lokální) | — | — | — |
| Spravovat zaměstnance | ✓ | ✓ (pobočka) | — | — | — |
| Přidat pobočku | ✓ | — | — | — | — |
| Nastavit oprávnění | ✓ | — | — | — | — |

### Implementace

```typescript
// Middleware ověřuje oprávnění před každou akcí
async function checkPermission(
  userId: string,
  action: Permission,
  context: { bookingId?: string; branchId?: string }
): Promise<boolean> {
  const user = await getUser(userId);
  const role = await getEffectiveRole(user); // systémová nebo vlastní role
  
  // Základní RBAC check
  if (!role.permissions.includes(action)) return false;
  
  // Scope check — manažer smí jen v "své" pobočce
  if (role.scopedToBranch && context.branchId) {
    return user.branchIds.includes(context.branchId);
  }
  
  return true;
}
```

---

## Rules Engine

### Princip

Rules Engine je seznam pravidel s typem, scopem, konfigurací a prioritou. Při každé relevantní akci systém spustí evaluaci — projde pravidla seřazená dle priority a vrátí výsledek (allow / deny / require_approval).

### Datová struktura pravidla

```typescript
interface Rule {
  id: string;
  tenant_id: string;
  type: RuleType;
  scope_type: 'global' | 'branch' | 'service' | 'customer_group';
  scope_id: string | null;       // null = platí globálně
  config: RuleConfig;
  priority: number;              // nižší číslo = vyšší priorita
  is_active: boolean;
}
```

### Typy pravidel a jejich konfigurace

#### 1. Cancellation Rule — pravidla storna
```jsonc
{
  "type": "cancellation",
  "config": {
    "allow_client_cancel": true,
    "min_hours_before": 24,         // klient smí zrušit min. 24h před termínem
    "late_cancel_action": "fee",    // "fee" | "forfeit_deposit" | "block"
    "late_cancel_fee": 500,         // v haléřích (5 Kč)
    "free_cancels_per_month": 2,    // první 2 storna bezplatně
    "require_reason": false
  }
}
```

#### 2. Reschedule Rule — pravidla přesunu
```jsonc
{
  "type": "reschedule",
  "config": {
    "allow_client_reschedule": true,
    "min_hours_before": 12,
    "max_reschedules_per_booking": 2,   // max 2× přesuny na jedné rezervaci
    "allowed_slot_offset": null,         // null = libovolný slot, nebo "adjacent"
    "require_approval": false
  }
}
```

#### 3. Visibility Rule — pravidla viditelnosti
```jsonc
{
  "type": "visibility",
  "config": {
    "visible_to": "all",                // "all" | "logged_in" | "group" | "tag"
    "customer_group_ids": [],
    "customer_tags": ["VIP", "member"],
    "show_from_days_ahead": 7,          // zobraz max. 7 dní dopředu
    "show_until_hours_before": 2,       // skryj méně než 2h před termínem
    "condition": {
      "type": "has_active_package",     // zobraz jen pokud má zakoupený balíček
      "package_id": "xxx"
    }
  }
}
```

#### 4. Booking Limit Rule — omezení rezervací
```jsonc
{
  "type": "booking_limit",
  "config": {
    "max_active_bookings": 3,           // zákazník smí mít max. 3 aktivní rezervace
    "max_per_service_per_period": 1,    // max 1× stejná služba za týden
    "period": "week",                   // "day" | "week" | "month"
    "min_gap_hours": 2                  // min. 2h mezi rezervacemi téhož zákazníka
  }
}
```

#### 5. Display Rule — pravidla zobrazení slotů
```jsonc
{
  "type": "display",
  "config": {
    "slot_interval_min": 15,            // sloty po 15 min
    "round_to": "quarter_hour",         // zaokrouhli na čtvrthod.
    "show_only_round_hours": false,
    "priority_strategy": "minimize_gaps", // "minimize_gaps" | "earliest" | "latest"
    "min_buffer_after_min": 10,         // 10 min buffer po každé rezervaci
    "show_next_available": true
  }
}
```

### Evaluace pravidel

```
Příchozí akce: customer_cancel_booking(booking_id, customer_id)

1. Načti všechna aktivní pravidla typu "cancellation" pro daný scope
   (globální + branch + service, seřazeno dle priority)

2. Pro každé pravidlo evaluuj:
   a. min_hours_before: (booking.starts_at - now) >= config.min_hours_before * 3600 ?
   b. free_cancels_per_month: count(cancellations, customer, this_month) < config.free_cancels_per_month ?
   c. allow_client_cancel: config.allow_client_cancel == true ?

3. Vrať výsledek:
   { allowed: true/false, fee: number, reason: string }

4. Pokud allowed: true → proveď storno, strhni případný poplatek
   Pokud allowed: false → zobraz klientovi důvod, nabídni "Žádost o storno"
```

### Priorita pravidel

Pravidla se evaluují od nejnižšího čísla priority. První pravidlo, které vrátí `deny`, vyhraje. Tím lze nastavit:

- Globální pravidlo: storno min. 24h (priority: 100)
- Přepis pro VIP zákazníky: storno min. 2h (priority: 10, scope: customer_group=VIP)
- VIP zákazník dostane přísnější check ze skupinového pravidla, které má vyšší prioritu

### Admin UI pro Rules Engine

Správce pravidel v adminu zobrazuje:
1. Seznam pravidel s typem, scopem, stavem (aktivní/neaktivní)
2. Formulář pro vytvoření pravidla — wizard s výběrem typu → scope → konfigurace
3. Simulátor: zadej zákazníka + akci → systém ukáže výsledek evaluace krok po kroku
4. Audit log změn pravidel (kdo co kdy změnil)

---

## Interaction diagram: zákazník chce zrušit rezervaci

```
Zákazník klikne "Zrušit"
        │
        ▼
Permission check: má customer roli s allow_cancel = true?
        │ ne → zobraz "Kontaktujte nás"
        │ ano
        ▼
Rules Engine: evaluuj cancellation rules pro tuto službu/pobočku
        │
        ├─ allowed: true, fee: 0 → zruš bez poplatku, notifikuj
        │
        ├─ allowed: true, fee: 500 → zobraz "Storno poplatek 5 Kč, pokračovat?"
        │   → zákazník potvrdí → strhni fee → zruš → notifikuj
        │
        └─ allowed: false, reason: "Termín je příliš blízko" 
            → zobraz reason + tlačítko "Požádat o storno"
            → odešle žádost adminovi
```
