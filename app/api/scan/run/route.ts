import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { ProfilScanInput, ScannerFunn, ScannerKategori } from "@/lib/scanner-types";
import { isWebScanEnabled } from "@/lib/scanner-web-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Body = { profile?: ProfilScanInput; selskaper?: unknown };

function makeId(url: string, title: string): string {
  return createHash("sha256").update(`${url}|${title}`).digest("hex").slice(0, 24);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function extractCompany(title: string, url: string): string | undefined {
  if (url.includes("linkedin.com")) {
    const m = title.match(/\bat\s+([^|]+?)\s*\|/i);
    if (m?.[1]) { const c = m[1].trim(); if (c.length >= 2 && c.length <= 70) return c; }
  }
  const clean = title.replace(/\s*\|\s*(FINN\.no|Webcruiter|arbeidsplassen\.nav\.no|NAV|LinkedIn Jobs?|Google Jobs?).*/i, "").trim();
  const parts = clean.split(/\s+[–—]\s+/);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1].trim();
    if (!/^(vi søker|ledig|søker|bli |mulighetsrom)/i.test(candidate) && candidate.length >= 2 && candidate.length <= 70)
      return candidate;
  }
  return undefined;
}

function trekkUtFrist(desc: string): string | undefined {
  const m = desc.match(/frist[:\s]+(\d{1,2}[.\s]\w+\s?\d{4})/i);
  return m ? m[1].trim() : undefined;
}

function kildenavnFraUrl(url: string): string {
  if (url.includes("finn.no"))           return "Finn.no";
  if (url.includes("arbeidsplassen.nav")) return "NAV";
  if (url.includes("linkedin.com"))      return "LinkedIn";
  if (url.includes("webcruiter.com"))    return "Webcruiter";
  if (url.includes("jobbsafari.no"))     return "Jobbsafari";
  if (url.includes("karriere.no"))       return "Karriere.no";
  if (url.includes("careers.") || url.includes("/careers")) return "Karriereside";
  return "Nett";
}

const NON_JOB_DOMAINS = ["proff.no","1881.no","gulesider.no","brreg.no","hitta.no","purehelp.no","trustpilot"];
const NYHETSDOMENER   = ["e24.no","finansavisen.no","nrk.no","dn.no","dagbladet.no","aftenposten.no","vg.no","shifter.io","tu.no"];
const JOBB_ORD        = ["søker","ledig","ansetter","stilling","rolle","hiring","vi ser etter","utlyser","ledighet"];

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 }); }

  const profile = body.profile;
  if (!profile || typeof profile !== "object" || typeof (profile as ProfilScanInput).seeking !== "string")
    return NextResponse.json({ error: "Profil mangler" }, { status: 400 });

  const selskaperRaw = body.selskaper;
  const selskaper = Array.isArray(selskaperRaw) && selskaperRaw.every(x => typeof x === "string")
    ? (selskaperRaw as string[]).map(s => s.trim()).filter(Boolean).slice(0, 8)
    : [];

  const p: ProfilScanInput = {
    name:      typeof profile.name      === "string" ? profile.name      : "",
    seeking:   (profile as ProfilScanInput).seeking,
    industry:  (profile as ProfilScanInput).industry,
    geography: typeof (profile as ProfilScanInput).geography === "string" ? (profile as ProfilScanInput).geography : "",
    bio:       typeof (profile as ProfilScanInput).bio       === "string" ? (profile as ProfilScanInput).bio       : "",
  };

  const warnings: string[] = [];
  const funn: ScannerFunn[] = [];
  const webEnabled = isWebScanEnabled();
  const now = new Date().toISOString();

  const geo      = p.geography || "Oslo";
  const søkTerm  = p.seeking.split(" ")[0] || p.seeking;
  const bransje  = p.industry || søkTerm;
  const iÅr      = new Date().getFullYear();

  // ─────────────────────────────────────────────────────────────────────────
  // DEL 0 — NAV pam-stilling-feed (live, gratis, direkte lenker)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const FEED_BASE  = "https://pam-stilling-feed.nav.no";
    const USER_AGENT = "Mozilla/5.0 (compatible; Jobbagent/1.0)";

    const tokenRes = await fetch(`${FEED_BASE}/api/publicToken`, {
      headers: { "User-Agent": USER_AGENT }, cache: "no-store",
    });

    if (tokenRes.ok) {
      const token = (await tokenRes.text()).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

      if (token) {
        const kw = [...new Set([søkTerm.toLowerCase(), p.seeking.toLowerCase().split(" ")[0]])].filter(Boolean);
        const seen = new Set<string>();
        let path = "/api/v1/feed";

        for (let page = 0; page < 4; page++) {
          const url = path.startsWith("http") ? path : `${FEED_BASE}${path}`;
          const res = await fetch(url, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
            cache: "no-store",
          });
          if (!res.ok) break;

          const data = (await res.json()) as { items?: unknown[]; next_url?: string | null };
          for (const raw of (data.items ?? []) as Array<Record<string, unknown>>) {
            const fe        = (raw._feed_entry ?? raw) as Record<string, unknown>;
            if (fe.status && fe.status !== "ACTIVE") continue;
            const title     = String(fe.jobtitle ?? fe.title ?? raw.title ?? "").trim();
            const uuid      = String(fe.uuid ?? raw.uuid ?? "").trim();
            if (!title || !uuid || seen.has(uuid)) continue;

            const company   = String((fe.employer as Record<string,unknown>|undefined)?.name ?? fe.businessName ?? raw.businessName ?? "");
            const location  = String((fe.workLocations as Array<{municipal?:string}>|undefined)?.[0]?.municipal ?? fe.municipal ?? "");
            const blob      = `${title} ${company} ${location}`.toLowerCase();
            if (!kw.some(k => blob.includes(k))) continue;

            seen.add(uuid);
            funn.push({
              id: uuid, signalType: "Utlyst stilling", kategori: "stilling",
              title, company: company || undefined, location: location || undefined,
              url: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
              kilde: "NAV", kildeNavn: "NAV", funnetDato: now,
            });
          }
          const next = data.next_url;
          if (!next || funn.filter(f => f.kildeNavn === "NAV").length >= 10) break;
          path = next;
        }
      }
    }
  } catch (e) { warnings.push(`NAV: ${e instanceof Error ? e.message : "feil"}`); }
  console.log("NAV:", funn.filter(f => f.kildeNavn === "NAV").length);

  // ─────────────────────────────────────────────────────────────────────────
  // DEL 1 — SerpAPI Google Jobs (Finn.no + LinkedIn + alle jobboards)
  // ─────────────────────────────────────────────────────────────────────────
  if (process.env.SERPAPI_API_KEY) {
    type ApplyOption = { title: string; link: string };
    type GoogleJob   = { title: string; company_name?: string; location?: string; description?: string; apply_options?: ApplyOption[] };

    const serpResults = await Promise.all(
      [`${p.seeking} ${geo}`, `${p.seeking} Norge`].map(q =>
        fetch(`https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(q)}&location=${encodeURIComponent(geo + ", Norway")}&hl=no&gl=no&api_key=${process.env.SERPAPI_API_KEY}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() as Promise<{ jobs_results?: GoogleJob[] }> : null)
          .catch(() => null)
      )
    );

    for (const data of serpResults) {
      if (!data) continue;
      for (const job of data.jobs_results ?? []) {
        if (!job.title) continue;
        const applyUrl =
          job.apply_options?.find(o => o.link.includes("finn.no"))?.link ||
          job.apply_options?.find(o => o.link.includes("linkedin.com/jobs"))?.link ||
          job.apply_options?.find(o => o.link.includes("arbeidsplassen.nav.no"))?.link ||
          job.apply_options?.[0]?.link || "";
        if (!applyUrl) continue;

        funn.push({
          id: makeId(applyUrl, job.title),
          signalType: "Utlyst stilling", kategori: "stilling",
          title: job.title, company: job.company_name || undefined,
          location: job.location || geo, url: applyUrl,
          beskrivelse: job.description?.slice(0, 300) || undefined,
          kilde: "Google Jobs", kildeNavn: kildenavnFraUrl(applyUrl),
          funnetDato: now,
        });
      }
    }
    console.log("Google Jobs:", funn.filter(f => f.kilde === "Google Jobs").length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEL 2 — LinkedIn-innlegg + karrieresider (jobber ikke på NAV/Finn)
  // ─────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const braveHdr = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const burl     = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pm`;

    const linkedinSøk = [
      `site:linkedin.com/posts "${søkTerm}" "søker" OR "ledig" OR "vi ansetter" ${iÅr}`,
      `site:linkedin.com "${bransje}" "stilling" OR "rolle" "${geo}" ${iÅr}`,
      `"careers." OR "jobs." "${søkTerm}" "${geo}" ${iÅr} -site:finn.no -site:nav.no`,
      ...selskaper.slice(0, 4).map(s => `"${s}" ansetter OR stilling OR hiring site:linkedin.com OR site:${s.toLowerCase().replace(/\s+/g, "")}.no`),
    ];

    const linkedinData = await Promise.all(
      linkedinSøk.map(q =>
        fetch(burl(q), { headers: braveHdr, cache: "no-store" })
          .then(r => r.ok ? r.json() as Promise<{ web?: { results?: unknown[] } }> : null)
          .catch(() => null)
      )
    );

    for (const data of linkedinData) {
      if (!data) continue;
      for (const item of (data.web?.results ?? []).slice(0, 3)) {
        const it    = item as Record<string, unknown>;
        const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
        const url   = typeof it.url   === "string" ? it.url.trim() : "";
        const desc  = typeof it.description === "string" ? stripHtml(it.description).slice(0, 200) : "";

        if (!title || title.length < 10 || !url) continue;
        if (url.includes("linkedin.com/in/")) continue;
        if (NON_JOB_DOMAINS.some(d => url.includes(d))) continue;
        if (!JOBB_ORD.some(o => (title + " " + desc).toLowerCase().includes(o))) continue;

        const gamleÅr = ["2022","2021","2020","2019","2018","2017"];
        if (gamleÅr.some(å => (title + desc).includes(å))) continue;

        funn.push({
          id: makeId(url, title), signalType: "LinkedIn", kategori: "stilling",
          title, company: extractCompany(title, url) || undefined,
          location: geo, url, beskrivelse: desc || undefined,
          kilde: kildenavnFraUrl(url), kildeNavn: kildenavnFraUrl(url),
          funnetDato: now,
        });
      }
    }
    console.log("LinkedIn/karriere:", funn.filter(f => f.kildeNavn === "LinkedIn" || f.kildeNavn === "Karriereside").length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEL 3 — Signaler (funding, ny ledelse, vekst) — kun fra nyhetsdomener
  // ─────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const braveHdr = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const burl     = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pm`;
    const nyhetsSite = "site:e24.no OR site:dn.no OR site:finansavisen.no OR site:nrk.no OR site:shifter.io";

    try {
      const [fundingRes, lederRes, vekstRes, bransjeRes] = await Promise.all([
        fetch(burl(`${bransje} selskap "henter" OR "funding" OR "investering" millioner Norge ${iÅr} ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} "ny direktør" OR "ny CEO" OR "ny CFO" OR "ny konserndirektør" Norge ${iÅr} ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} selskap "ekspanderer" OR "vekst" OR "ansetter" Norge ${iÅr} ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} bransje Norge markedsutvikling nyheter ${iÅr} ${nyhetsSite}`), { headers: braveHdr }),
      ]);

      type SignalSubtype = import("@/lib/scanner-types").SignalSubtype;
      const signalTyper: { res: Response; subtype: SignalSubtype; relevans: string }[] = [
        { res: fundingRes,  subtype: "funding",      relevans: "Selskaper som henter kapital ansetter typisk innen 60–90 dager." },
        { res: lederRes,    subtype: "ny-ledelse",   relevans: "Ny leder bygger alltid team i løpet av de første 60 dagene."    },
        { res: vekstRes,    subtype: "vekst",        relevans: "Vekstselskaper ansetter før de lyser ut stillinger offentlig."   },
        { res: bransjeRes,  subtype: "bransjenyhet", relevans: "Markedsbevegelser påvirker ansettelser i din bransje."           },
      ];

      for (const { res, subtype, relevans } of signalTyper) {
        if (!res.ok) continue;
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        let n = 0;
        for (const item of data.web?.results ?? []) {
          if (n >= 3) break;
          const it    = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const url   = typeof it.url   === "string" ? it.url.trim() : "";
          if (!title || title.length < 10 || !url) continue;
          if (["finn.no","arbeidsplassen.nav.no","webcruiter.com","linkedin.com/in/"].some(d => url.includes(d))) continue;
          if (NON_JOB_DOMAINS.some(d => url.includes(d))) continue;

          const erNyhetsKilde = NYHETSDOMENER.some(d => url.includes(d));
          const faktiskSubtype: SignalSubtype = erNyhetsKilde ? "bransjenyhet" : subtype;
          if (faktiskSubtype !== "bransjenyhet") {
            const SIGNAL_ORD = ["funding","kapital","investering","direktør","ceo","cfo","vekst","ekspanderer","henter","millioner"];
            if (!SIGNAL_ORD.some(o => title.toLowerCase().includes(o))) continue;
          }

          const desc = typeof it.description === "string" ? stripHtml(it.description).slice(0, 300) : "";
          funn.push({
            id: makeId(url, title), signalType: "Nyhet", kategori: "signal",
            signalSubtype: faktiskSubtype, relevansForKandidat: relevans,
            title, url, location: geo || undefined, beskrivelse: desc || undefined,
            kilde: `Brave (${faktiskSubtype})`, funnetDato: now,
          });
          n++;
        }
      }
    } catch (e) { warnings.push(`Signalsøk: ${e instanceof Error ? e.message : "feil"}`); }
    console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dedup og returner
  // ─────────────────────────────────────────────────────────────────────────
  console.log("NAV:", funn.filter(f => f.kildeNavn === "NAV").length);
  console.log("Google Jobs:", funn.filter(f => f.kilde === "Google Jobs").length);
  console.log("LinkedIn:", funn.filter(f => f.kildeNavn === "LinkedIn").length);
  console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  console.log("Totalt (før dedup):", funn.length);

  const seen = new Set<string>();
  const deduped = funn.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });

  return NextResponse.json({
    funn: deduped, warnings,
    scannedAt: now, webEnabled, webScanningDisabled: !webEnabled,
  });
}
