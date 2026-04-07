"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PipelineKanal,
  PipelineKontakt,
  PipelineStatus,
} from "@/lib/pipeline-types";
import {
  addHoursToIso,
  loadPipeline,
  newId,
  savePipeline,
  upsertKontakt,
} from "@/lib/pipeline-storage";
import {
  countAktive,
  countByStatus,
  getOppfølgingsKø,
  svarProsent,
} from "@/lib/pipeline-stats";

const STATUS_STYLE: Record<
  PipelineStatus,
  { bg: string; text: string; label: string }
> = {
  sendt: { bg: "bg-[#f59e0b]", text: "text-[#fcd34d]", label: "Sendt" },
  svar: { bg: "bg-[#3b82f6]", text: "text-[#93c5fd]", label: "Svar" },
  møte: { bg: "bg-[#22c55e]", text: "text-[#86efac]", label: "Møte" },
  avsluttet: {
    bg: "bg-white/[0.1]",
    text: "text-zinc-400",
    label: "Avsluttet",
  },
};

function initials(navn: string): string {
  const p = navn.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function dagerSiden(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function KanalIkon({ kanal }: { kanal: PipelineKanal }) {
  if (kanal === "linkedin") {
    return (
      <svg
        className="h-4 w-4 text-[#0a66c2]"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );
  }
  if (kanal === "epost") {
    return (
      <svg
        className="h-4 w-4 text-zinc-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4 text-zinc-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

export default function PipelinePage() {
  const [list, setList] = useState<PipelineKontakt[]>([]);
  const [mounted, setMounted] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterOppfølging, setFilterOppfølging] = useState(false);

  const refresh = useCallback(() => {
    setList(loadPipeline());
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

  const sorted = useMemo(() => {
    const s = [...list].sort(
      (a, b) =>
        new Date(b.sendtDato).getTime() - new Date(a.sendtDato).getTime(),
    );
    if (!filterOppfølging) return s;
    const ids = new Set(getOppfølgingsKø(list).map((k) => k.id));
    return s.filter((k) => ids.has(k.id));
  }, [list, filterOppfølging]);

  const counts = countByStatus(list);
  const oppfølgKø = getOppfølgingsKø(list);
  const aktive = countAktive(list);
  const sp = svarProsent(list);

  const detail = detailId
    ? list.find((k) => k.id === detailId)
    : undefined;

  return (
    <div className="min-h-screen bg-[#0a0a0f] pb-24 pt-6 text-zinc-100 sm:pt-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pipeline
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {aktive} aktive kontakter · {sp} % svar
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="rounded-xl bg-[#111118] px-4 py-2.5 text-sm font-medium text-zinc-100 ring-1 ring-white/10 transition hover:bg-white/5"
          >
            Legg til manuelt
          </button>
        </div>

        {oppfølgKø.length > 0 && (
          <button
            type="button"
            onClick={() => setFilterOppfølging((f) => !f)}
            className="modal-animate mt-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-100 transition hover:bg-amber-500/15"
          >
            ⏰ {oppfølgKø.length} kontakt
            {oppfølgKø.length === 1 ? "" : "er"} venter på oppfølging
            {filterOppfølging ? " (klikk for å vise alle)" : " (klikk for å filtrere)"}
          </button>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Sendt", counts.sendt],
              ["Svar", counts.svar],
              ["Møter", counts.møte],
              ["Svarprosent", `${sp} %`],
            ] as const
          ).map(([label, val]) => (
            <div
              key={label}
              className="rounded-xl border border-white/[0.08] bg-[#111118] px-4 py-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                {label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
                {val}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          {!mounted ? (
            <p className="text-sm text-zinc-500">Laster…</p>
          ) : sorted.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-[#111118]/50 px-6 py-12 text-center text-sm text-zinc-500">
              Ingen kontakter ennå. Analyser et signal og lagre kontaktpersonen i
              pipeline.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sorted.map((k) => (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(k.id)}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/[0.06] bg-[#111118] p-4 text-left transition hover:border-white/10 sm:gap-4"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${STATUS_STYLE[k.status].bg} ${STATUS_STYLE[k.status].text}`}
                    >
                      {initials(k.navn)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-100">
                          {k.navn}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[k.status].bg} ${STATUS_STYLE[k.status].text}`}
                        >
                          {STATUS_STYLE[k.status].label}
                        </span>
                      </div>
                      <p className="truncate text-sm text-zinc-400">
                        {k.tittel}
                        {k.tittel && k.selskap ? " · " : ""}
                        {k.selskap}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <KanalIkon kanal={k.kanal} />
                          {k.kanal}
                        </span>
                        <span>{dagerSiden(k.sendtDato)} d. siden sendt</span>
                        {k.status === "sendt" &&
                          Date.now() > new Date(k.oppfølgingDato).getTime() && (
                            <span className="text-amber-400">
                              Trenger oppfølging
                            </span>
                          )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {manualOpen && (
        <ManualModal
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            refresh();
            setManualOpen(false);
          }}
        />
      )}

      {detail && (
        <DetailModal
          kontakt={detail}
          onClose={() => setDetailId(null)}
          onUpdate={() => refresh()}
        />
      )}
    </div>
  );
}

function ManualModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [navn, setNavn] = useState("");
  const [tittel, setTittel] = useState("");
  const [selskap, setSelskap] = useState("");
  const [kanal, setKanal] = useState<PipelineKanal>("linkedin");
  const [melding, setMelding] = useState("");
  const [signal, setSignal] = useState("");
  const [sendtDato, setSendtDato] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!navn.trim() || !selskap.trim()) return;
    const sendtIso = new Date(sendtDato + "T12:00:00").toISOString();
    const k: PipelineKontakt = {
      id: newId(),
      navn: navn.trim(),
      tittel: tittel.trim(),
      selskap: selskap.trim(),
      kanal,
      status: "sendt",
      melding: melding.trim(),
      signal: signal.trim(),
      sendtDato: sendtIso,
      oppfølgingDato: addHoursToIso(sendtIso, 48),
      notat: "",
      historikk: [{ status: "sendt", dato: sendtIso }],
    };
    upsertKontakt(k);
    onSaved();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-animate max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-50">
          Legg til kontakt
        </h2>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field label="Navn *">
            <input
              required
              value={navn}
              onChange={(e) => setNavn(e.target.value)}
              className="input-surface"
            />
          </Field>
          <Field label="Tittel">
            <input
              value={tittel}
              onChange={(e) => setTittel(e.target.value)}
              className="input-surface"
            />
          </Field>
          <Field label="Selskap *">
            <input
              required
              value={selskap}
              onChange={(e) => setSelskap(e.target.value)}
              className="input-surface"
            />
          </Field>
          <Field label="Kanal">
            <select
              value={kanal}
              onChange={(e) => setKanal(e.target.value as PipelineKanal)}
              className="input-surface"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="epost">E-post</option>
              <option value="telefon">Telefon</option>
            </select>
          </Field>
          <Field label="Første melding sendt">
            <textarea
              rows={4}
              value={melding}
              onChange={(e) => setMelding(e.target.value)}
              className="input-surface resize-y"
            />
          </Field>
          <Field label="Signal som trigget">
            <textarea
              rows={3}
              value={signal}
              onChange={(e) => setSignal(e.target.value)}
              className="input-surface resize-y"
            />
          </Field>
          <Field label="Dato sendt">
            <input
              type="date"
              value={sendtDato}
              onChange={(e) => setSendtDato(e.target.value)}
              className="input-surface"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Avbryt
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Lagre
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="modal-animate absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Lukk"
      />
      <div className="relative z-10 w-full max-w-lg">{children}</div>
    </div>
  );
}

function DetailModal({
  kontakt,
  onClose,
  onUpdate,
}: {
  kontakt: PipelineKontakt;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [notat, setNotat] = useState(kontakt.notat);
  const [followup, setFollowup] = useState<string | null>(null);
  const [loadingFollowup, setLoadingFollowup] = useState(false);
  const [followupErr, setFollowupErr] = useState<string | null>(null);

  useEffect(() => {
    setNotat(kontakt.notat);
  }, [kontakt]);

  const days = dagerSiden(kontakt.sendtDato);
  const past48 =
    kontakt.status === "sendt" &&
    Date.now() > new Date(kontakt.oppfølgingDato).getTime();

  function persistNotat(next: string) {
    setNotat(next);
    const list = loadPipeline();
    const i = list.findIndex((k) => k.id === kontakt.id);
    if (i < 0) return;
    list[i] = { ...list[i], notat: next };
    savePipeline(list);
    onUpdate();
  }

  function setStatus(next: PipelineStatus) {
    const list = loadPipeline();
    const i = list.findIndex((k) => k.id === kontakt.id);
    if (i < 0) return;
    const k = { ...list[i] };
    const now = new Date().toISOString();
    k.status = next;
    k.historikk = [...(k.historikk ?? []), { status: next, dato: now }];
    if (next === "svar" && !k.svarDato) k.svarDato = now;
    if (next === "møte" && !k.møteDato) k.møteDato = now;
    list[i] = k;
    savePipeline(list);
    onUpdate();
  }

  async function genererOppfølging() {
    setLoadingFollowup(true);
    setFollowupErr(null);
    try {
      const res = await fetch("/api/pipeline-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysSince: days,
          melding: kontakt.melding,
          signal: kontakt.signal,
          navn: kontakt.navn,
          selskap: kontakt.selskap,
        }),
      });
      const data = (await res.json()) as {
        followupMessage?: string;
        error?: string;
      };
      if (!res.ok) {
        setFollowupErr(data.error ?? "Feil");
        return;
      }
      setFollowup(data.followupMessage ?? "");
    } catch {
      setFollowupErr("Nettverksfeil");
    } finally {
      setLoadingFollowup(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-animate max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-50">
          {kontakt.navn}
        </h2>
        <p className="text-sm text-zinc-400">
          {kontakt.tittel}
          {kontakt.tittel && kontakt.selskap ? " · " : ""}
          {kontakt.selskap}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[kontakt.status].bg} ${STATUS_STYLE[kontakt.status].text}`}
          >
            {STATUS_STYLE[kontakt.status].label}
          </span>
          <span className="text-xs text-zinc-500">
            Sendt {new Date(kontakt.sendtDato).toLocaleDateString("nb-NO")} ·{" "}
            {days} d. siden
          </span>
        </div>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Signal
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
            {kontakt.signal || "—"}
          </p>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Første melding
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
            {kontakt.melding || "—"}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Statushistorikk
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {(kontakt.historikk ?? []).map((h, i) => (
              <li key={`${h.dato}-${i}`}>
                {STATUS_STYLE[h.status].label} ·{" "}
                {new Date(h.dato).toLocaleString("nb-NO")}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Notat
          </h3>
          <textarea
            value={notat}
            onChange={(e) => persistNotat(e.target.value)}
            rows={3}
            className="input-surface mt-2 w-full resize-y"
            placeholder="Autosave ved skriving…"
          />
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Endre status
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              ["sendt", "svar", "møte", "avsluttet"] as PipelineStatus[]
            ).map((s) => (
              <button
                key={s}
                type="button"
                disabled={kontakt.status === s}
                onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${STATUS_STYLE[s].bg} ${STATUS_STYLE[s].text}`}
              >
                {STATUS_STYLE[s].label}
              </button>
            ))}
          </div>
        </section>

        {past48 && (
          <section className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
              Forslag til oppfølgingsmelding
            </h3>
            <button
              type="button"
              onClick={genererOppfølging}
              disabled={loadingFollowup}
              className="mt-2 rounded-lg bg-amber-500/20 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {loadingFollowup ? "Genererer…" : "Generer oppfølging"}
            </button>
            {followupErr && (
              <p className="mt-2 text-sm text-red-400">{followupErr}</p>
            )}
            {followup && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                {followup}
              </p>
            )}
          </section>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/5"
        >
          Lukk
        </button>
      </div>
    </ModalOverlay>
  );
}
