import type { BookingStep } from './BookingFlow';

export function StepIndicator({
  steps,
  current,
}: {
  steps: Array<{ id: BookingStep; label: string }>;
  current: BookingStep;
}) {
  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <ol className="flex items-center w-full text-sm font-medium text-center text-slate-500">
      {steps.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li
            key={s.id}
            className={`flex items-center ${
              idx < steps.length - 1
                ? "after:content-[''] after:w-full after:h-0.5 after:border-b after:border-slate-200 after:border-1 after:hidden sm:after:inline-block after:mx-2"
                : ''
            }`}
          >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  active
                    ? 'bg-brand-600 text-white'
                    : done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {done ? '✓' : idx + 1}
              </span>
              <span className={`hidden sm:inline ${active ? 'text-slate-900' : ''}`}>
                {s.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
