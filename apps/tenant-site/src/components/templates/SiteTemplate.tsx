// Generická mini-web šablona řízená variantou. Tři vizuální styly sdílejí
// stejnou strukturu sekcí, liší se barvami / fonty / tvarem prvků:
//   - elegant: světlá, serif, prostorná (beauty, ordinace)
//   - bold:    tmavá, tučná sans, kontrastní (fitness, EMS, bojové sporty)
//   - fresh:   světlá, zaoblené prvky, barevné akcenty (jóga, pilates, studia)

import type { SiteData } from '@/lib/api';
import { formatPrice, formatDuration, DAY_LABELS } from '@/lib/format';

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

export type SiteVariant = 'elegant' | 'bold' | 'fresh';

interface VariantTokens {
  root: string;
  header: string;
  eyebrow: string;
  heading: string;
  heroHeadline: string;
  altBg: string;
  button: string;
  rounded: string;
  testimonialBg: string;
  footerBg: string;
}

const VARIANTS: Record<SiteVariant, VariantTokens> = {
  elegant: {
    root: 'font-serif text-slate-900 bg-white',
    header: 'bg-white/90 backdrop-blur border-b border-slate-100',
    eyebrow: 'text-xs uppercase tracking-[0.3em] text-slate-500 font-sans',
    heading: 'text-4xl font-light',
    heroHeadline: 'text-5xl md:text-7xl font-light tracking-tight',
    altBg: 'bg-slate-50',
    button: 'text-white text-sm uppercase tracking-widest font-sans font-semibold',
    rounded: '',
    testimonialBg: 'bg-slate-900 text-white',
    footerBg: 'bg-slate-900 text-white',
  },
  bold: {
    root: 'font-sans text-white bg-neutral-950',
    header: 'bg-neutral-950/90 backdrop-blur border-b border-neutral-800',
    eyebrow: 'text-xs uppercase tracking-[0.25em] font-bold',
    heading: 'text-4xl md:text-5xl font-extrabold uppercase tracking-tight',
    heroHeadline: 'text-6xl md:text-8xl font-extrabold uppercase tracking-tighter',
    altBg: 'bg-neutral-900',
    button: 'text-black text-sm uppercase tracking-widest font-extrabold',
    rounded: '',
    testimonialBg: 'bg-neutral-900 text-white',
    footerBg: 'bg-black text-neutral-400',
  },
  fresh: {
    root: 'font-sans text-slate-800 bg-emerald-50/40',
    header: 'bg-white/80 backdrop-blur border-b border-emerald-100',
    eyebrow: 'text-xs uppercase tracking-[0.2em] font-semibold',
    heading: 'text-4xl font-bold',
    heroHeadline: 'text-5xl md:text-7xl font-bold tracking-tight',
    altBg: 'bg-white',
    button: 'text-white text-sm font-semibold rounded-full',
    rounded: 'rounded-3xl',
    testimonialBg: 'bg-emerald-600 text-white',
    footerBg: 'bg-slate-800 text-white',
  },
};

export function SiteTemplate({ site, variant }: { site: SiteData; variant: SiteVariant }) {
  const v = VARIANTS[variant];
  const primary = site.theme.primaryColor ?? (variant === 'bold' ? '#f5f5f5' : '#1a1a1a');
  const widgetSrc = `${WIDGET_URL}/${site.tenant.slug}?lang=${site.tenant.locale.startsWith('en') ? 'en' : 'cs'}`;

  const hero = site.content.hero;
  const about = site.content.about;
  const team = site.content.team;
  const gallery = site.content.gallery;
  const testimonials = site.content.testimonials;
  const faq = site.content.faq;
  const contact = site.content.contact;

  const heroCover = hero?.coverPhotoUrl ?? site.profile.photos[0];
  const enabledSections = site.content.enabledSections ?? [
    'hero',
    'about',
    'services',
    'gallery',
    'team',
    'testimonials',
    'booking',
    'faq',
    'contact',
  ];
  const isEnabled = (section: string): boolean => enabledSections.includes(section);

  return (
    <div style={{ ['--primary' as string]: primary }} className={v.root}>
      {site.theme.customCss && (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: site.theme.customCss }} />
      )}

      {/* Sticky navigation */}
      <header className={`sticky top-0 z-40 ${v.header}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {site.theme.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.theme.logoUrl} alt={site.tenant.name} className="h-10 w-auto" />
            )}
            <div className="text-xl font-semibold tracking-tight">{site.tenant.name}</div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {isEnabled('about') && (
              <a href="#about" className="hover:opacity-70">
                O nás
              </a>
            )}
            {isEnabled('services') && (
              <a href="#services" className="hover:opacity-70">
                Služby
              </a>
            )}
            {isEnabled('gallery') && (
              <a href="#gallery" className="hover:opacity-70">
                Galerie
              </a>
            )}
            {isEnabled('contact') && (
              <a href="#contact" className="hover:opacity-70">
                Kontakt
              </a>
            )}
            <a
              href="#booking"
              className={`px-5 py-2 ${v.button} ${v.rounded}`}
              style={{ backgroundColor: 'var(--primary)' }}
            >
              Rezervovat
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      {isEnabled('hero') && (
        <section className="relative">
          {heroCover && (
            <div className="relative h-[60vh] md:h-[75vh] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroCover} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60"></div>
            </div>
          )}
          <div
            className={`max-w-3xl mx-auto px-6 text-center ${heroCover ? '-mt-40 relative z-10' : 'py-24'} ${heroCover ? 'text-white' : ''}`}
          >
            <p className={`${v.eyebrow} mb-4`}>
              {site.profile.city ? `📍 ${site.profile.city}` : 'Online rezervace'}
            </p>
            <h1 className={`${v.heroHeadline} mb-6`}>{hero?.headline ?? site.tenant.name}</h1>
            {hero?.subheadline && (
              <p className="text-xl leading-relaxed mb-8 max-w-2xl mx-auto opacity-90">
                {hero.subheadline}
              </p>
            )}
            <a
              href="#booking"
              className={`inline-block px-10 py-4 ${v.button} ${v.rounded} hover:opacity-90 transition`}
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {hero?.ctaText ?? 'Rezervovat termín'}
            </a>
          </div>
        </section>
      )}

      {/* ABOUT */}
      {isEnabled('about') && (about?.text || site.profile.description) && (
        <section id="about" className={`py-24 px-6 ${v.altBg}`}>
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className={`${v.eyebrow} mb-4`}>O nás</p>
              <h2 className={`${v.heading} mb-6`}>
                {about?.headline ?? 'Příběh, který stojí za poznání'}
              </h2>
              <div className="leading-relaxed whitespace-pre-wrap opacity-90">
                {about?.text ?? site.profile.description}
              </div>
            </div>
            {about?.photoUrl && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={about.photoUrl}
                  alt=""
                  className={`w-full h-96 object-cover ${v.rounded}`}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* SERVICES */}
      {isEnabled('services') && site.services.length > 0 && (
        <section id="services" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className={`${v.eyebrow} mb-4`}>Služby</p>
              <h2 className={v.heading}>Co pro vás můžeme udělat</h2>
            </div>
            <div className="divide-y divide-current/10">
              {site.services.map((s) => (
                <div key={s.id} className="py-6 flex justify-between items-baseline">
                  <div className="flex-1">
                    <h3 className="text-xl mb-1">{s.name}</h3>
                    {s.description && (
                      <p className="text-sm opacity-70 max-w-xl">{s.description}</p>
                    )}
                    <p className="text-xs opacity-50 mt-1 uppercase tracking-wide">
                      {formatDuration(s.durationMinutes)}
                    </p>
                  </div>
                  <div className="font-semibold text-lg ml-6 whitespace-nowrap">
                    {formatPrice(s.priceHellers, s.currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GALLERY */}
      {isEnabled('gallery') &&
        ((gallery?.photos && gallery.photos.length > 0) || site.profile.photos.length > 1) && (
          <section id="gallery" className={`py-24 px-6 ${v.altBg}`}>
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <p className={`${v.eyebrow} mb-4`}>Galerie</p>
                <h2 className={v.heading}>{gallery?.headline ?? 'Z naší práce'}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(gallery?.photos ?? site.profile.photos.slice(1)).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className={`w-full h-64 object-cover ${v.rounded}`}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

      {/* TEAM */}
      {isEnabled('team') && team?.members && team.members.length > 0 && (
        <section className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className={`${v.eyebrow} mb-4`}>Tým</p>
              <h2 className={v.heading}>{team.headline ?? 'Lidé, kteří se o vás postarají'}</h2>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8">
              {team.members.map((m, i) => (
                <div key={i} className="text-center">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.photoUrl}
                      alt={m.name}
                      className="w-40 h-40 object-cover rounded-full mx-auto mb-4"
                    />
                  ) : (
                    <div className="w-40 h-40 bg-current/10 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="text-lg mb-1">{m.name}</h3>
                  {m.role && <p className="text-sm opacity-60">{m.role}</p>}
                  {m.bio && <p className="text-sm opacity-75 mt-2">{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      {isEnabled('testimonials') && testimonials?.items && testimonials.items.length > 0 && (
        <section className={`py-24 px-6 ${v.testimonialBg}`}>
          <div className="max-w-4xl mx-auto text-center">
            <p className={`${v.eyebrow} mb-8 opacity-80`}>Reference</p>
            <h2 className={`${v.heading} mb-12`}>{testimonials.headline ?? 'Co o nás říkají'}</h2>
            <div className="space-y-12">
              {testimonials.items.map((t, i) => (
                <blockquote key={i} className="text-xl leading-relaxed italic">
                  &ldquo;{t.text}&rdquo;
                  <footer className="text-sm opacity-70 mt-4 not-italic">— {t.author}</footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BOOKING WIDGET */}
      {isEnabled('booking') && (
        <section id="booking" className="py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className={`${v.eyebrow} mb-4`}>Rezervace</p>
              <h2 className={v.heading}>Objednejte se online</h2>
            </div>
            <iframe
              src={widgetSrc}
              width="100%"
              height="700"
              style={{ border: 0, maxWidth: '600px', margin: '0 auto', display: 'block' }}
              title="Online rezervace"
              loading="lazy"
              id="reserved-booking-iframe"
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                window.addEventListener('message', function(e) {
                  if (e.data && e.data.type === 'reserved:resize') {
                    var f = document.getElementById('reserved-booking-iframe');
                    if (f) f.style.height = e.data.height + 'px';
                  }
                });
              `,
              }}
            />
          </div>
        </section>
      )}

      {/* FAQ */}
      {isEnabled('faq') && faq?.items && faq.items.length > 0 && (
        <section className={`py-24 px-6 ${v.altBg}`}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className={`${v.eyebrow} mb-4`}>FAQ</p>
              <h2 className={v.heading}>{faq.headline ?? 'Časté otázky'}</h2>
            </div>
            <div className="space-y-4">
              {faq.items.map((item, i) => (
                <details
                  key={i}
                  className={`bg-current/5 border border-current/10 p-6 group ${v.rounded}`}
                >
                  <summary className="cursor-pointer font-semibold flex justify-between items-center">
                    {item.q}
                    <span className="opacity-40 group-open:rotate-180 transition">▼</span>
                  </summary>
                  <p className="opacity-75 mt-3 leading-relaxed">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      {isEnabled('contact') && (
        <section id="contact" className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className={`${v.eyebrow} mb-4`}>Kontakt</p>
              <h2 className={v.heading}>{contact?.headline ?? 'Kde nás najdete'}</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-4 opacity-90">
                {(contact?.showAddress ?? true) && site.profile.address && (
                  <div>
                    <p className={`${v.eyebrow} mb-1`}>Adresa</p>
                    <p>{site.profile.address}</p>
                  </div>
                )}
                {(contact?.showPhone ?? true) && contact?.phone && (
                  <div>
                    <p className={`${v.eyebrow} mb-1`}>Telefon</p>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </div>
                )}
                {contact?.email && (
                  <div>
                    <p className={`${v.eyebrow} mb-1`}>Email</p>
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </div>
                )}
                {(contact?.showHours ?? true) &&
                  Object.keys(site.profile.businessHours).length > 0 && (
                    <div>
                      <p className={`${v.eyebrow} mb-2`}>Otevírací hodiny</p>
                      <dl className="space-y-1 text-sm">
                        {Object.entries(DAY_LABELS).map(([key, label]) => (
                          <div
                            key={key}
                            className="flex justify-between border-b border-current/10 py-1"
                          >
                            <dt>{label}</dt>
                            <dd>{site.profile.businessHours[key] ?? 'Zavřeno'}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
              </div>
              <div>
                {contact?.mapEmbedUrl ? (
                  <iframe
                    src={contact.mapEmbedUrl}
                    width="100%"
                    height="400"
                    style={{ border: 0 }}
                    loading="lazy"
                    title="Mapa"
                    className={v.rounded}
                  />
                ) : (
                  <div
                    className={`bg-current/10 h-96 flex items-center justify-center opacity-50 ${v.rounded}`}
                  >
                    📍 {site.profile.city ?? 'Mapa není nastavena'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className={`py-12 px-6 text-center text-sm ${v.footerBg}`}>
        <p>
          © {new Date().getFullYear()} {site.tenant.name}
        </p>
        <p className="mt-2 opacity-60 text-xs">
          Vytvořeno s ❤️ na{' '}
          <a
            href="https://reserved.cz"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Reserved
          </a>
        </p>
      </footer>
    </div>
  );
}
