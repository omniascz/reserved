// Landing page widget — pokud někdo přijde bez slugu, řekneme mu jak ho přidat.

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold">Reserved Widget</h1>
        <p className="text-slate-600">Pro rezervaci přidej slug salonu do URL, např.:</p>
        <code className="block bg-white border rounded-lg p-3 text-sm font-mono break-all">
          http://localhost:3002/<span className="text-brand-600">demo-widget</span>
        </code>
        <p className="text-sm text-slate-500 pt-4">
          Slug salonu získáš při registraci v admin panelu.
        </p>
      </div>
    </div>
  );
}
