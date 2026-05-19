export default function ContactPage() {
  return (
    <>
      <section className="py-20 bg-gradient-to-br from-brand-50 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Kontakt</h1>
          <p className="text-lg text-slate-600">Ozveme se obvykle do 24 hodin.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-6">
          <ContactCard
            icon="💬"
            title="Podpora"
            text="Otázka k produktu, pomoc s nastavením, technický problém."
            email="podpora@reserved.cz"
          />
          <ContactCard
            icon="💼"
            title="Prodej (Enterprise)"
            text="Řetězec, vlastní doména, SSO, SLA, custom integrace."
            email="sales@reserved.cz"
          />
          <ContactCard
            icon="🤝"
            title="Partnerství"
            text="Spolupráce, integrace, white-label, affiliate program."
            email="partner@reserved.cz"
          />
          <ContactCard
            icon="📰"
            title="Tisk a média"
            text="Citáty, rozhovory, případové studie, použití loga."
            email="media@reserved.cz"
          />
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold mb-6">Fakturační údaje</h2>
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm space-y-2">
            <div>
              <strong>Reserved s.r.o.</strong>
            </div>
            <div>IČO: 12345678</div>
            <div>DIČ: CZ12345678</div>
            <div>Sídlo: Praha, Česká republika</div>
            <div className="pt-2 text-slate-500">
              Datová schránka: <span className="font-mono">abcd1234</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            (Údaje jsou placeholder — produkce vyplní reálnou s.r.o. po zápisu do OR.)
          </p>
        </div>
      </section>
    </>
  );
}

function ContactCard({
  icon,
  title,
  text,
  email,
}: {
  icon: string;
  title: string;
  text: string;
  email: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 mb-3">{text}</p>
      <a href={`mailto:${email}`} className="text-brand-700 hover:underline font-medium text-sm">
        {email} →
      </a>
    </div>
  );
}
