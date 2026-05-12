export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-3">Portál rezervací</h1>
        <p className="text-slate-600 mb-6">
          Otevři adresu, kterou ti poslal salon: <code>portal/&lt;salon&gt;</code>
        </p>
        <p className="text-sm text-slate-500">
          Příklad: <code>portal/demo-salon</code>
        </p>
      </div>
    </main>
  );
}
