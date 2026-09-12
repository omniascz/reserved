import { useTranslations } from 'next-intl';

// Struktura nadpisů podle reserved-docs/20_production_deploy_checklist.md (sekce 8
// Compliance). Vlastní právní text dodá provozovatel — tady je záměrně jen
// zástupný text, aby bylo na první pohled vidět, že stránka není hotová.
const PLACEHOLDER = 'PLACEHOLDER — nutno doplnit před spuštěním';

const SECTIONS = [
  'provider',
  'definitions',
  'contract',
  'prices',
  'providerObligations',
  'customerObligations',
  'availability',
  'personalData',
  'liability',
  'termination',
  'changes',
  'final',
] as const;

export default function TermsPage() {
  const t = useTranslations('legalTerms');

  return (
    <>
      <section className="py-20 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
          <p className="text-lg text-slate-600">{t('subtitle')}</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-10 rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
            <strong className="block font-bold text-amber-900 mb-1">{PLACEHOLDER}</strong>
            <span className="text-sm text-amber-900">{t('placeholderNote')}</span>
          </div>

          <ol className="space-y-8">
            {SECTIONS.map((key, index) => (
              <li key={key}>
                <h2 className="text-xl font-bold mb-2">
                  {index + 1}. {t(`sections.${key}`)}
                </h2>
                <p className="text-slate-500 italic">{PLACEHOLDER}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
