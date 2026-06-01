"use client";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  stripeUrl: string;
};

export function UpgradeModal({ open, onClose, stripeUrl }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Lukk"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-2xl">
        <h2 id="upgrade-title" className="text-xl font-semibold text-zinc-950">
          Du har brukt dine gratis analyser
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Oppgrader til Jobbagent Pro for 99 kr/mnd og fortsett å analysere
          ubegrenset med signaler.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Lukk
          </button>
          <a
            href={stripeUrl}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Oppgrader for 99 kr/mnd
          </a>
        </div>
      </div>
    </div>
  );
}
