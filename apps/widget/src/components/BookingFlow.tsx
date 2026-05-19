'use client';

import { useEffect, useState } from 'react';
import {
  listBranches,
  type AvailableSlot,
  type BookingConfirmation,
  type HoldResult,
  type PublicBranch,
  type PublicEmployee,
  type PublicService,
} from '@/lib/api';
import { useT } from '@/i18n/I18nProvider';
import { StepIndicator } from './StepIndicator';
import { BranchStep } from './steps/BranchStep';
import { ServiceStep } from './steps/ServiceStep';
import { EmployeeStep } from './steps/EmployeeStep';
import { DateTimeStep } from './steps/DateTimeStep';
import { ContactStep } from './steps/ContactStep';
import { ConfirmationStep } from './steps/ConfirmationStep';

export type BookingStep =
  | 'branch'
  | 'service'
  | 'employee'
  | 'datetime'
  | 'contact'
  | 'confirmation';

export interface BookingState {
  branch: PublicBranch | null;
  service: PublicService | null;
  employee: PublicEmployee | null;
  slot: AvailableSlot | null;
  hold: HoldResult | null;
  confirmation: BookingConfirmation | null;
}

export function BookingFlow({ slug, tenantName }: { slug: string; tenantName: string }) {
  const t = useT();
  const [branches, setBranches] = useState<PublicBranch[] | null>(null);
  const [step, setStep] = useState<BookingStep>('branch');
  const [state, setState] = useState<BookingState>({
    branch: null,
    service: null,
    employee: null,
    slot: null,
    hold: null,
    confirmation: null,
  });

  // Load branches on mount. Pokud je jen 1, automaticky přeskoč na 'service'.
  useEffect(() => {
    listBranches(slug)
      .then((bs) => {
        setBranches(bs);
        if (bs.length === 1) {
          setState((s) => ({ ...s, branch: bs[0]! }));
          setStep('service');
        }
      })
      .catch(() => {
        setBranches([]);
        setStep('service');
      });
  }, [slug]);

  function update(partial: Partial<BookingState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  function goTo(s: BookingStep) {
    setStep(s);
  }

  const hasMultipleBranches = (branches?.length ?? 0) > 1;
  const STEPS: Array<{ id: BookingStep; label: string }> = [
    ...(hasMultipleBranches ? [{ id: 'branch' as const, label: t('step.branch') }] : []),
    { id: 'service', label: t('step.service') },
    { id: 'employee', label: t('step.employee') },
    { id: 'datetime', label: t('step.datetime') },
    { id: 'contact', label: t('step.contact') },
    { id: 'confirmation', label: t('step.confirmation') },
  ];

  if (branches === null) {
    return <div className="text-slate-400">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} current={step} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
        {step === 'branch' && (
          <BranchStep
            branches={branches}
            onPick={(branch) => {
              update({ branch, service: null, employee: null, slot: null });
              goTo('service');
            }}
          />
        )}

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
            branchId={state.branch?.id}
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
              const initialBranch = branches && branches.length === 1 ? branches[0]! : null;
              setState({
                branch: initialBranch,
                service: null,
                employee: null,
                slot: null,
                hold: null,
                confirmation: null,
              });
              goTo(hasMultipleBranches ? 'branch' : 'service');
            }}
          />
        )}
      </div>
    </div>
  );
}
