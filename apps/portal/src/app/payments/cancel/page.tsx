'use client';

export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
          ×
        </div>
        <h1 className="text-2xl font-bold mb-2">Platba zrušena</h1>
        <p className="text-slate-600 mb-6">
          Platba nebyla dokončena. Můžete se vrátit k objednávce a zkusit znovu, nebo kontaktovat
          salon.
        </p>
        <button
          onClick={() => window.close()}
          className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-6 py-2.5 rounded-lg"
        >
          Zavřít
        </button>
      </div>
    </main>
  );
}
