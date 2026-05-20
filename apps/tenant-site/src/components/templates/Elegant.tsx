// Šablona "Elegant" — světlá, minimalistická.
// Cílová skupina: kadeřnictví, beauty salony, lékařské ordinace.
//
// Charakteristika: bílá / krémové pozadí, serif font, prostorný layout,
// elegantní spacing, jemné akcenty.

import type { SiteData } from '@/lib/api';
import { formatPrice, formatDuration, DAY_LABELS } from '@/lib/format';

const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:4004';

export function ElegantTemplate({ site }: { site: SiteData }) {
  const primary = site.theme.primaryColor ?? '#1a1a1a';
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

  function isEnabled(section: string): boolean {
    return enabledSections.includes(section);
  }

  return (
    <div
      style={{ ['--primary' as string]: primary }}
      className="font-serif text-slate-900 bg-white"
    >
      {/* Inline custom CSS z tenant theme */}
      {site.theme.customCss && (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: site.theme.customCss }} />
      )}

      {/* Sticky navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
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
              className="px-5 py-2 text-white text-xs uppercase tracking-widest font-sans font-semibold"
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
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-white/95"></div>
            </div>
          )}
          <div
            className={`max-w-3xl mx-auto px-6 text-center ${heroCover ? '-mt-32 relative z-10' : 'py-24'}`}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
              {site.profile.city ? `📍 ${site.profile.city}` : 'Online rezervace'}
            </p>
            <h1 className="text-5xl md:text-7xl font-light tracking-tight mb-6">
              {hero?.headline ?? site.tenant.name}
            </h1>
            {hero?.subheadline && (
              <p className="text-xl text-slate-600 leading-relaxed mb-8 max-w-2xl mx-auto">
                {hero.subheadline}
              </p>
            )}
            <a
              href="#booking"
              className="inline-block px-10 py-4 text-white text-sm uppercase tracking-widest font-sans font-semibold hover:opacity-90 transition"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {hero?.ctaText ?? 'Rezervovat termín'}
            </a>
          </div>
        </section>
      )}

      {/* ABOUT */}
      {isEnabled('about') && (about?.text || site.profile.description) && (
        <section id="about" className="py-24 px-6 bg-slate-50">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                O nás
              </p>
              <h2 className="text-4xl font-light mb-6">
                {about?.headline ?? 'Příběh, který stojí za poznání'}
              </h2>
              <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                {about?.text ?? site.profile.description}
              </div>
            </div>
            {about?.photoUrl && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={about.photoUrl} alt="" className="w-full h-96 object-cover" />
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                Služby
              </p>
              <h2 className="text-4xl font-light">Co pro vás můžeme udělat</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {site.services.map((s) => (
                <div key={s.id} className="py-6 flex justify-between items-baseline">
                  <div className="flex-1">
                    <h3 className="text-xl mb-1">{s.name}</h3>
                    {s.description && (
                      <p className="text-sm text-slate-500 max-w-xl">{s.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 font-sans uppercase tracking-wide">
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
          <section id="gallery" className="py-24 px-6 bg-slate-50">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                  Galerie
                </p>
                <h2 className="text-4xl font-light">{gallery?.headline ?? 'Z naší práce'}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(gallery?.photos ?? site.profile.photos.slice(1)).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="" className="w-full h-64 object-cover" />
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                Tým
              </p>
              <h2 className="text-4xl font-light">
                {team.headline ?? 'Lidé, kteří se o vás postarají'}
              </h2>
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
                    <div className="w-40 h-40 bg-slate-200 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="text-lg mb-1">{m.name}</h3>
                  {m.role && <p className="text-sm text-slate-500 font-sans">{m.role}</p>}
                  {m.bio && <p className="text-sm text-slate-600 mt-2">{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      {isEnabled('testimonials') && testimonials?.items && testimonials.items.length > 0 && (
        <section className="py-24 px-6 bg-slate-900 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-8 font-sans">
              Reference
            </p>
            <h2 className="text-3xl font-light mb-12">
              {testimonials.headline ?? 'Co o nás říkají'}
            </h2>
            <div className="space-y-12">
              {testimonials.items.map((t, i) => (
                <blockquote key={i} className="text-xl leading-relaxed italic">
                  &ldquo;{t.text}&rdquo;
                  <footer className="text-sm text-slate-400 mt-4 not-italic font-sans">
                    — {t.author}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BOOKING WIDGET */}
      {isEnabled('booking') && (
        <section id="booking" className="py-24 px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                Rezervace
              </p>
              <h2 className="text-4xl font-light">Objednejte se online</h2>
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
        <section className="py-24 px-6 bg-slate-50">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                FAQ
              </p>
              <h2 className="text-4xl font-light">{faq.headline ?? 'Časté otázky'}</h2>
            </div>
            <div className="space-y-4">
              {faq.items.map((item, i) => (
                <details key={i} className="bg-white border border-slate-200 p-6 group">
                  <summary className="cursor-pointer font-semibold flex justify-between items-center">
                    {item.q}
                    <span className="text-slate-400 group-open:rotate-180 transition">▼</span>
                  </summary>
                  <p className="text-slate-600 mt-3 leading-relaxed">{item.a}</p>
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
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4 font-sans">
                Kontakt
              </p>
              <h2 className="text-4xl font-light">{contact?.headline ?? 'Kde nás najdete'}</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-4 text-slate-700">
                {(contact?.showAddress ?? true) && site.profile.address && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-sans mb-1">
                      Adresa
                    </p>
                    <p>{site.profile.address}</p>
                  </div>
                )}
                {(contact?.showPhone ?? true) && contact?.phone && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-sans mb-1">
                      Telefon
                    </p>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </div>
                )}
                {contact?.email && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-sans mb-1">
                      Email
                    </p>
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  </div>
                )}
                {(contact?.showHours ?? true) &&
                  Object.keys(site.profile.businessHours).length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500 font-sans mb-2">
                        Otevírací hodiny
                      </p>
                      <dl className="space-y-1 text-sm">
                        {Object.entries(DAY_LABELS).map(([key, label]) => (
                          <div
                            key={key}
                            className="flex justify-between border-b border-slate-100 py-1"
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
                  />
                ) : (
                  <div className="bg-slate-100 h-96 flex items-center justify-center text-slate-400">
                    📍 {site.profile.city ?? 'Mapa není nastavena'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="py-12 px-6 bg-slate-900 text-white text-center text-sm">
        <p>
          © {new Date().getFullYear()} {site.tenant.name}
        </p>
        <p className="mt-2 text-slate-500 text-xs">
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
