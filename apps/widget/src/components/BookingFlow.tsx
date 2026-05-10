'use client';

import { useState } from 'react';
import type {
  AvailableSlot,
  BookingConfirmation,
  HoldResult,
  PublicEmployee,
  PublicService,
} from '@/lib/api';
import { StepIndicator } from './StepIndicator';
import { ServiceStep } from './steps/ServiceStep';
import { EmployeeStep } from './steps/EmployeeStep';
import { DateTimeStep } from './steps/DateTimeStep';
import { ContactStep } from './steps/ContactStep';
import { ConfirmationStep } from './steps/ConfirmationStep';

export type BookingStep = 'service' | 'employee' | 'datetime' | 'contact' | 'confirmation';

export interface BookingState {
  service: PublicService | null;
  employee: PublicEmployee | null;
  slot: AvailableSlot | null;
  hold: HoldResult | null;
  confirmation: BookingConfirmation | null;
}

const STEPS: Array<{ id: BookingStep; label: string }> = [
  { id: 'service', label: 'Služba' },
  { id: 'employee', label: 'Specialista' },
  { id: 'datetime', label: 'Termín' },
  { id: 'contact', label: 'Kontakt' },
  { id: 'confirmation', label: 'Potvrzení' },
];

export function BookingFlow({ slug, tenantName }: { slug: string; tenantName: string }) {
  const [step, setStep] = useState<BookingStep>('service');
  const [state, setState] = useState<BookingState>({
    service: null,
    employee: null,
    slot: null,
    hold: null,
    confirmation: null,
  });

  function update(partial: Partial<BookingState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function goTo(s: BookingStep) {
    setStep(s);
  }

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} current={step} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
        {step === 'service' && (
          <ServiceStep
            slug={slug}
            onPick={(service) => {
              update({ service, employee: null, slot: null });
              goTo('employee');
            }}
          />
        )}

        {step === 'employee' && state.service && (
          <EmployeeStep
            slug={slug}
            service={state.service}
            onPick={(employee) => {
              update({ employee, slot: null });
              goTo('datetime');
            }}
            onBack={() => goTo('service')}
          />
        )}

        {step === 'datetime' && state.service && state.employee && (
          <DateTimeStep
            slug={slug}
            service={state.service}
            employee={state.employee}
            onPick={async (slot, hold) => {
              update({ slot, hold });
              goTo('contact');
            }}
            onBack={() => goTo('employee')}
          />
        )}

        {step === 'contact' && state.service && state.employee && state.slot && state.hold && (
          <ContactStep
            slug={slug}
            service={state.service}
            employee={state.employee}
            slot={state.slot}
            hold={state.hold}
            tenantName={tenantName}
            onConfirm={(confirmation) => {
              update({ confirmation });
              goTo('confirmation');
            }}
            onBack={() => goTo('datetime')}
          />
        )}

        {step === 'confirmation' && state.confirmation && (
          <ConfirmationStep
            confirmation={state.confirmation}
            tenantName={tenantName}
            onNew={() => {
              setState({
                service: null,
                employee: null,
                slot: null,
                hold: null,
                confirmation: null,
              });
              goTo('service');
            }}
          />
        )}
      </div>
    </div>
  );
}
