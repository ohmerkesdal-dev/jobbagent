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
  const clean = title.replace(/\s*\|\s*(FINN\.no|Webcruiter|arbeidsplassen\.nav\.no|NAV|LinkedIn|Google).*/i, "").trim();
  const parts = clean.split(/\s+[–—]\s+/);
  if (parts.length >= 2) {
    const c = parts[parts.length - 1].trim();
    if (!/^(vi søker|ledig|søker|bli |mulighetsrom)/i.test(c) && c.length >= 2 && c.length <= 70) return c;
  }
}
function kildeNav(url: string): string {
  if (url.includes("finn.no"))             return "Finn.no";
  if (url.includes("arbeidsplassen.nav"))  return "NAV";
  if (url.includes("linkedin.com"))        return "LinkedIn";
  if (url.includes("webcruiter.com"))      return "Webcruiter";
  if (url.includes("careers.") || url.includes("/careers")) return "Karriereside";
  return "Nett";
}

const NYHETSDOMENER = ["e24.no","finansavisen.no","nrk.no","dn.no","dagbladet.no","aftenposten.no","shifter.io","tu.no"];
const JOBB_ORD      = ["søker","ledig","ansetter","stilling","rolle","hiring","utlyser"];

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 }); }

  const profile = body.profile as ProfilScanInput | undefined;
  if (!profile || typeof profile.seeking !== "string")
    return NextResponse.json({ error: "Profil mangler" }, { status: 400 });

  const selskaper = Array.isArray(body.selskaper) && (body.selskaper as unknown[]).every(x => typeof x === "string")
    ? (body.selskaper as string[]).map(s => s.trim()).filter(Boolean).slice(0, 6)
    : [];

  const p: ProfilScanInput = {
    name: typeof profile.name === "string" ? profile.name : "",
    seeking: profile.seeking,
    industry: profile.industry,
    geography: typeof profile.geography === "string" ? profile.geography : "",
    bio: typeof profile.bio === "string" ? profile.bio : "",
  };

  const warnings: string[] = [];
  const funn: ScannerFunn[] = [];
  const webEnabled = isWebScanEnabled();
  const now  = new Date().toISOString();
  const iÅr  = new Date().getFullYear();
  const geo  = p.geography || "Oslo";
  const søk  = p.seeking.trim();
  const bransje = p.industry || søk.split(" ")[0] || "regnskap";

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 0 — NAV pam-stilling-feed (live, gratis, direkte lenker)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const BASE = "https://pam-stilling-feed.nav.no";
    const UA   = "Mozilla/5.0 (compatible; Jobbagent/1.0)";
    const tr   = await fetch(`${BASE}/api/publicToken`, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (tr.ok) {
      const token = (await tr.text()).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
      if (token) {
        const kw   = [...new Set([søk.toLowerCase(), søk.toLowerCase().split(" ")[0]])].filter(Boolean);
        const seen = new Set<string>();
        let path   = "/api/v1/feed";
        for (let page = 0; page < 4 && funn.filter(f => f.kildeNavn === "NAV").length < 12; page++) {
          const url = path.startsWith("http") ? path : `${BASE}${path}`;
          const r   = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": UA }, cache: "no-store" });
          if (!r.ok) break;
          const data = (await r.json()) as { items?: unknown[]; next_url?: string | null };
          for (const raw of (data.items ?? []) as Array<Record<string, unknown>>) {
            const fe      = (raw._feed_entry ?? raw) as Record<string, unknown>;
            if (fe.status && fe.status !== "ACTIVE") continue;
            const title   = String(fe.jobtitle ?? fe.title ?? "").trim();
            const uuid    = String(fe.uuid ?? "").trim();
            if (!title || !uuid || seen.has(uuid)) continue;
            const company = String((fe.employer as Record<string,unknown>|undefined)?.name ?? fe.businessName ?? "");
            const loc     = String((fe.workLocations as Array<{municipal?:string}>|undefined)?.[0]?.municipal ?? fe.municipal ?? "");
            if (!kw.some(k => `${title} ${company} ${loc}`.toLowerCase().includes(k))) continue;
            seen.add(uuid);
            funn.push({ id: uuid, signalType: "Utlyst stilling", kategori: "stilling",
              title, company: company || undefined, location: loc || undefined,
              url: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
              kilde: "NAV", kildeNavn: "NAV", funnetDato: now });
          }
          if (!data.next_url) break;
          path = data.next_url;
        }
      }
    }
  } catch (e) { warnings.push(`NAV: ${e instanceof Error ? e.message : "feil"}`); }
  console.log("NAV:", funn.filter(f => f.kildeNavn === "NAV").length);

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 1 — SerpAPI Google Jobs (når nøkkel finnes — Finn.no + LinkedIn + alle)
  // ──────────────────────────────────────────────────────────────────────────
  if (process.env.SERPAPI_API_KEY) {
    type AO = { title: string; link: string };
    type GJ = { title: string; company_name?: string; location?: string; description?: string; apply_options?: AO[] };
    const serp = process.env.SERPAPI_API_KEY;
    const res = await Promise.all([`${søk} ${geo}`, `${søk} Norge`].map(q =>
      fetch(`https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(q)}&location=${encodeURIComponent(geo + ", Norway")}&hl=no&gl=no&api_key=${serp}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() as Promise<{ jobs_results?: GJ[] }> : null).catch(() => null)
    ));
    for (const data of res) {
      for (const job of (data?.jobs_results ?? [])) {
        if (!job.title) continue;
        const applyUrl =
          job.apply_options?.find(o => o.link.includes("finn.no"))?.link ||
          job.apply_options?.find(o => o.link.includes("linkedin.com/jobs"))?.link ||
          job.apply_options?.find(o => o.link.includes("arbeidsplassen.nav.no"))?.link ||
          job.apply_options?.[0]?.link || "";
        if (!applyUrl) continue;
        funn.push({ id: makeId(applyUrl, job.title), signalType: "Utlyst stilling", kategori: "stilling",
          title: job.title, company: job.company_name || undefined, location: job.location || geo,
          url: applyUrl, beskrivelse: job.description?.slice(0, 300),
          kilde: "Google Jobs", kildeNavn: kildeNav(applyUrl), funnetDato: now });
      }
    }
    console.log("Google Jobs:", funn.filter(f => f.kilde === "Google Jobs").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 2 — Brave: direkte stillingssøk (alltid, uavhengig av SerpAPI)
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr  = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const burl = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8&country=NO&freshness=pw`;

    const stillingSøk = [
      `"${søk}" stilling "${geo}" ${iÅr} site:finn.no`,
      `"${søk}" stilling "${geo}" ${iÅr} site:arbeidsplassen.nav.no`,
      `site:linkedin.com/jobs/view "${søk}" "${geo}"`,
      `site:webcruiter.com "${søk}" "${geo}"`,
      `"${søk}" "søknadsfrist" "${geo}" ${iÅr} -site:youtube.com -site:facebook.com`,
      ...selskaper.slice(0, 3).map(s => `"${s}" stilling OR ansetter site:linkedin.com OR site:finn.no`),
    ];

    const braveJobRes = await Promise.all(
      stillingSøk.map(q =>
        fetch(burl(q), { headers: hdr, cache: "no-store" })
          .then(r => r.ok ? r.json() as Promise<{ web?: { results?: unknown[] } }> : null).catch(() => null)
      )
    );

    const GYLDIGE = ["finn.no","arbeidsplassen.nav.no","linkedin.com/jobs","webcruiter.com","jobbsafari.no","karriere.no"];
    const SKIP    = ["proff.no","1881.no","gulesider.no","brreg.no","trustpilot","youtube.com","facebook.com"];

    for (const data of braveJobRes) {
      if (!data) continue;
      for (const item of (data.web?.results ?? []).slice(0, 5)) {
        const it    = item as Record<string, unknown>;
        const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
        const url   = typeof it.url   === "string" ? it.url.trim() : "";
        const desc  = typeof it.description === "string" ? stripHtml(it.description).slice(0, 300) : "";
        if (!title || title.length < 10 || !url) continue;
        if (!GYLDIGE.some(d => url.includes(d))) continue;
        if (SKIP.some(d => url.includes(d))) continue;
        // Finn: skip søkesider
        if (url.includes("finn.no") && url.toLowerCase().includes("search")) continue;
        if (url.includes("linkedin.com") && !url.includes("/jobs/view/") && !url.includes("/posts/")) continue;
        // Skip utdaterte
        if (["2022","2021","2020","2019","2018","2017"].some(å => (title + desc).includes(å))) continue;

        funn.push({ id: makeId(url, title), signalType: url.includes("linkedin") ? "LinkedIn" : "Utlyst stilling",
          kategori: "stilling", title, company: extractCompany(title, url) || undefined,
          location: geo, url, beskrivelse: desc || undefined,
          kilde: kildeNav(url), kildeNavn: kildeNav(url), funnetDato: now });
      }
    }
    console.log("Brave stillinger:", funn.filter(f => f.kategori === "stilling" && f.kilde !== "NAV" && f.kilde !== "Google Jobs").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 3 — LinkedIn-innlegg og karrieresider (jobber ikke på NAV/Finn)
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr  = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const burl = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pw`;

    const linkedinSøk = [
      `site:linkedin.com/posts "${søk}" "søker" OR "vi ansetter" OR "ledig stilling" ${iÅr}`,
      `site:linkedin.com "${bransje}" stilling ${geo} ${iÅr}`,
      `"careers." "${bransje}" "${geo}" ${iÅr} -site:finn.no -site:nav.no`,
    ];

    const liRes = await Promise.all(
      linkedinSøk.map(q =>
        fetch(burl(q), { headers: hdr, cache: "no-store" })
          .then(r => r.ok ? r.json() as Promise<{ web?: { results?: unknown[] } }> : null).catch(() => null)
      )
    );

    const GYLDIGE_STILLING = ["finn.no","arbeidsplassen.nav.no","webcruiter.com","linkedin.com","careers."];

    for (const data of liRes) {
      if (!data) continue;
      for (const item of (data.web?.results ?? []).slice(0, 3)) {
        const it    = item as Record<string, unknown>;
        const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
        const url   = typeof it.url   === "string" ? it.url.trim() : "";
        const desc  = typeof it.description === "string" ? stripHtml(it.description).slice(0, 200) : "";
        if (!title || title.length < 10 || !url) continue;
        if (!GYLDIGE_STILLING.some(d => url.includes(d))) continue;
        if (!JOBB_ORD.some(o => (title + " " + desc).toLowerCase().includes(o))) continue;
        funn.push({ id: makeId(url, title), signalType: "LinkedIn", kategori: "stilling",
          title, company: extractCompany(title, url) || undefined, location: geo,
          url, beskrivelse: desc || undefined,
          kilde: kildeNav(url), kildeNavn: "LinkedIn", funnetDato: now });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 4 — Signaler (KUN fra godkjente nyhetsdomener)
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr  = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const burl = (q: string) => `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pm`;

    try {
      const [fundingRes, lederRes, vekstRes, bransjeRes] = await Promise.all([
        fetch(burl(`${bransje} selskap henter OR funding OR investering millioner Norge ${iÅr}`), { headers: hdr }),
        fetch(burl(`${bransje} "ny direktør" OR "ny CEO" OR "ny CFO" ansetter Norge ${iÅr}`), { headers: hdr }),
        fetch(burl(`${bransje} selskap ekspanderer OR vekst ansetter ${geo} ${iÅr}`), { headers: hdr }),
        fetch(burl(`${bransje} bransje Norge nyheter ${iÅr}`), { headers: hdr }),
      ]);

      type ST = import("@/lib/scanner-types").SignalSubtype;
      const signalTyper: { res: Response; subtype: ST; relevans: string }[] = [
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

          // ▶ KUN fra godkjente nyhetsdomener
          if (!NYHETSDOMENER.some(d => url.includes(d))) continue;

          const desc = typeof it.description === "string" ? stripHtml(it.description).slice(0, 300) : "";
          const BRANSJENYHET_DOMENER = ["e24.no","finansavisen.no","nrk.no","dn.no","dagbladet.no"];
          const faktiskSubtype: ST = BRANSJENYHET_DOMENER.some(d => url.includes(d)) ? "bransjenyhet" : subtype;
          if (faktiskSubtype !== "bransjenyhet") {
            const SW = ["funding","kapital","investering","direktør","ceo","cfo","vekst","ekspanderer","henter","millioner"];
            if (!SW.some(o => title.toLowerCase().includes(o))) continue;
          }

          funn.push({ id: makeId(url, title), signalType: "Nyhet", kategori: "signal",
            signalSubtype: faktiskSubtype, relevansForKandidat: relevans,
            title, url, location: geo, beskrivelse: desc || undefined,
            kilde: `Signal (${faktiskSubtype})`, funnetDato: now });
          n++;
        }
      }
    } catch (e) { warnings.push(`Signalsøk: ${e instanceof Error ? e.message : "feil"}`); }
    console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("NAV:", funn.filter(f => f.kildeNavn === "NAV").length);
  console.log("Google Jobs:", funn.filter(f => f.kilde === "Google Jobs").length);
  console.log("Brave stillinger:", funn.filter(f => f.kategori === "stilling" && f.kilde !== "NAV" && f.kilde !== "Google Jobs").length);
  console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  console.log("Totalt:", funn.length);

  const seen = new Set<string>();
  const deduped = funn.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });

  return NextResponse.json({ funn: deduped, warnings, scannedAt: now, webEnabled, webScanningDisabled: !webEnabled });
}
