import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export function Footer() {
  const t = useTranslations('footer');
  const tv = useTranslations('verticals');

  return (
    <footer className="bg-slate-900 text-slate-300 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="text-2xl font-bold text-white mb-3">Reserved</div>
          <p className="text-sm text-slate-400">{t('tagline')}</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">{t('product')}</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/funkce" className="hover:text-white">
                {t('features')}
              </Link>
            </li>
            <li>
              <Link href="/cenik" className="hover:text-white">
                {t('pricing')}
              </Link>
            </li>
            <li>
              <a href="http://localhost:4000/api-docs" className="hover:text-white">
                {t('apiDocs')}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">{t('forIndustry')}</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/pro/kadernictvi" className="hover:text-white">
                {tv('kadernictvi')}
              </Link>
            </li>
            <li>
              <Link href="/pro/fyzioterapie" className="hover:text-white">
                {tv('fyzioterapie')}
              </Link>
            </li>
            <li>
              <Link href="/pro/fitness" className="hover:text-white">
                {tv('fitness')}
              </Link>
            </li>
            <li>
              <Link href="/pro/lekarska-ordinace" className="hover:text-white">
                {tv('lekarska_ordinace')}
              </Link>
            </li>
            <li>
              <Link href="/pro/autoskola" className="hover:text-white">
                {tv('autoskola')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3">{t('company')}</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/o-nas" className="hover:text-white">
                {t('about')}
              </Link>
            </li>
            <li>
              <Link href="/kontakt" className="hover:text-white">
                {t('contact')}
              </Link>
            </li>
            <li>
              <a href="mailto:podpora@reserved.cz" className="hover:text-white">
                {t('support')}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <div>{t('copyright')}</div>
          <div className="flex gap-4">
            <Link href="/pravni/obchodni-podminky" className="hover:text-white">
              {t('terms')}
            </Link>
            <Link href="/pravni/gdpr" className="hover:text-white">
              {t('gdpr')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
