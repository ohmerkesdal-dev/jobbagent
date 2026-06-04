import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ScannerFunn, SignalSubtype } from "@/lib/scanner-types";
import type { ProfilScanInput } from "@/lib/scanner-types";
import { isWebScanEnabled } from "@/lib/scanner-web-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Body = { profile?: ProfilScanInput; selskaper?: unknown };

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function extractFinnCompany(title: string): string | undefined {
  const m = title.match(/·\s*([^·|]{2,80}?)\s*\|\s*FINN/i);
  if (m?.[1]) return m[1].trim();
  return undefined;
}

function kommuneKode(geo: string): string {
  const g = geo.toLowerCase();
  if (g.includes("bergen"))    return "4601";
  if (g.includes("trondheim")) return "5001";
  if (g.includes("stavanger")) return "1103";
  if (g.includes("tromsø"))    return "5401";
  return "0301";
}

// Karriere-ordbok: primærnøkkel → liste med søkeord
const KARRIERE_ORDBOK: Record<string, string[]> = {
  regnskap:             ["regnskapsfører","regnskapsmedarbeider","regnskapskonsulent","controller","økonomi","revisor","accounting","finance"],
  hr:                   ["HR","human resources","personalansvarlig","people operations","rekruttering","HR-leder","talent","people manager"],
  controller:           ["controller","business controller","finanscontroller","økonomicontroller","group controller"],
  revisor:              ["revisor","revisjon","statsautorisert revisor","audit"],
  cfo:                  ["CFO","økonomisjef","finansdirektør","finance director","økonomisjef"],
  markedsføring:        ["markedskoordinator","markedsansvarlig","marketing manager","digital markedsføring","growth","kommunikasjon"],
  forretningsutvikling: ["forretningsutvikling","business development","BD manager","growth manager","strategi","strategisk rådgiver","innovasjon","partnership manager","kommersiell"],
  salg:                 ["salg","salgskonsulent","key account","account manager","salgsleder","business development","salgsansvarlig"],
  teknologi:            ["produktsjef","product manager","teknologileder","CTO","tech lead","løsningsarkitekt","systemutvikler","developer"],
  konsulent:            ["konsulent","management consulting","rådgiver","analytiker","analyst"],
  prosjekt:             ["prosjektleder","project manager","PMO","program manager"],
  økonomi:              ["økonom","finansanalytiker","analyst","treasury","investor relations","finansanalytiker"],
  it:                   ["utvikler","developer","engineer","systemutvikler","frontend","backend","software","teknologi","devops"],
};

// Genererer søkeord dynamisk med Claude Haiku — fallback til KARRIERE_ORDBOK ved feil
async function genererSøkeord(p: ProfilScanInput): Promise<string[]> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Du er en norsk karriererådgiver. Brukeren søker: "${p.seeking || ""}", bransje: "${p.industry || ""}", bio: "${p.bio || ""}".

Generer 8 relevante norske og engelske stillingstitler og søkeord denne personen bør søke på i Norge.

Returner KUN en JSON-array med strings, ingen forklaring:
["søkeord1", "søkeord2", ...]`,
      }],
    });
    const tekst    = msg.content.find(b => b.type === "text") ? (msg.content.find(b => b.type === "text") as { type: "text"; text: string }).text : "[]";
    const parsed   = JSON.parse(tekst.replace(/```json|```/g, "").trim()) as unknown;
    const søkeord  = Array.isArray(parsed) ? (parsed as unknown[]).filter(x => typeof x === "string") as string[] : [];
    console.log("AI-genererte søkeord:", søkeord.join(", "));
    return søkeord.length > 0 ? søkeord : [];
  } catch (e) {
    console.error("Søkeord-generering feil:", e instanceof Error ? e.message : e);
    return [];
  }
}

const SIGNAL_ORD  = ["funding","investering","vekst","ansetter","ekspanderer","millioner","ny ceo","ny cfo","ny direktør","henter kapital"];
const SKIP_DOMENER = ["brreg.no","proff.no","1881.no","gulesider.no","virksomheter.no","youtube.com","facebook.com","instagram.com"];
const BRANSJENYHET_DOM = ["e24.no","finansavisen.no","nrk.no","dn.no","dagbladet.no"];
const GAMLE_ÅR    = ["2019","2020","2021","2022","2023","2024"];

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 }); }

  const profile = body.profile as ProfilScanInput | undefined;
  if (!profile || typeof profile.seeking !== "string")
    return NextResponse.json({ error: "Profil mangler" }, { status: 400 });

  const p: ProfilScanInput = {
    name:      typeof profile.name      === "string" ? profile.name      : "",
    seeking:   profile.seeking,
    industry:  profile.industry,
    geography: typeof profile.geography === "string" ? profile.geography : "",
    bio:       typeof profile.bio       === "string" ? profile.bio       : "",
  };

  const warnings:  string[]      = [];
  const funn:      ScannerFunn[] = [];
  const webEnabled = isWebScanEnabled();
  const now        = new Date().toISOString();
  const iÅr        = new Date().getFullYear();

  // ── Bygg søkeProfil med AI + statisk fallback ─────────────────────────────
  const primær   = (p.seeking || "regnskap").split(" ")[0].toLowerCase();
  const geografi = p.geography || "Oslo";
  const bransje  = p.industry  || primær;
  const kKode    = kommuneKode(geografi);

  // AI-genererte søkeord — faller tilbake til kariereordbok ved feil
  const aiSøkeord = await genererSøkeord(p);

  let alleOrd: string[];
  if (aiSøkeord.length > 0) {
    // Sett primærordet først, deduper
    alleOrd = [primær, ...aiSøkeord.filter(o => o.toLowerCase() !== primær)];
  } else {
    // Statisk fallback
    const ordNøkkel = Object.keys(KARRIERE_ORDBOK).find(k =>
      primær.includes(k) || k.includes(primær) || bransje.toLowerCase().includes(k)
    ) ?? primær;
    const ordFraBok = KARRIERE_ORDBOK[ordNøkkel] ?? [];
    alleOrd = [primær, ...ordFraBok.filter(o => o.toLowerCase() !== primær)];
  }

  const søkeProfil = { primær, alle: alleOrd, geografi, kommuneKode: kKode };

  console.log("=== SØKEPROFIL ===");
  console.log("AI søkeord for", p.seeking, ":", søkeProfil.alle.slice(0, 6).join(", "));
  console.log("Geografi:", søkeProfil.geografi, "| Kommune:", søkeProfil.kommuneKode);

  // ── DEL 1 — NAV parallelle søk (Elasticsearch, åpent API) ─────────────────
  try {
    const navKeywords = søkeProfil.alle.slice(0, 3);
    const navHitsAll  = await Promise.all(navKeywords.map(async (kw) => {
      const url = `https://arbeidsplassen.nav.no/stillinger/api/search?q=${encodeURIComponent(kw)}&size=15&municipal=${kKode}`;
      const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) { warnings.push(`NAV ${kw}: ${res.status}`); return []; }
      const data = (await res.json()) as { hits?: { hits?: unknown[] } };
      return data.hits?.hits ?? [];
    }));

    const iDag           = new Date();
    const historiskeBatch: ScannerFunn[] = [];
    const seenUuid        = new Set<string>();

    for (const hit of navHitsAll.flat()) {
      const h     = hit as Record<string, unknown>;
      const s     = (h._source ?? h) as Record<string, unknown>;
      const uuid  = String(s.uuid ?? h._id ?? "").trim();
      const title = String(s.title ?? "").trim();
      if (!uuid || !title || seenUuid.has(uuid)) continue;

      // Lokal relevansjekk mot søkeProfil.alle
      const tekst = `${title} ${String(s.description ?? "")}`.toLowerCase();
      if (!søkeProfil.alle.some(ord => tekst.includes(ord.toLowerCase()))) continue;

      seenUuid.add(uuid);
      const locList   = (s.locationList as Array<Record<string,unknown>> | undefined) ?? [];
      const municipal = String(locList[0]?.municipal ?? locList[0]?.city ?? "") || geografi;
      const company   = String(s.businessName ?? "") || undefined;
      const navUrl    = `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;

      if (s.expires && new Date(s.expires as string) < iDag) {
        const dagerSiden = Math.ceil((Date.now() - new Date(s.expires as string).getTime()) / 86400000);
        if (dagerSiden > 0 && dagerSiden < 180) {
          historiskeBatch.push({
            id:                  randomUUID(),
            signalType:          "Nyhet",
            kategori:            "signal",
            signalSubtype:       "historisk",
            relevansForKandidat: "Bedriften ansetter periodisk i denne rollen — verdt å ta kontakt proaktivt.",
            title:               `${company ?? title} — "${title}" utløp for ${dagerSiden} dager siden`,
            company,
            location:            municipal,
            url:                 navUrl,
            beskrivelse:         `Stillingen utløp for ${dagerSiden} dager siden. Behovet kan fortsatt være der.`,
            kilde:               "Historisk signal",
            funnetDato:          now,
          });
        }
        continue;
      }

      funn.push({
        id:          uuid,
        signalType:  "Utlyst stilling",
        kategori:    "stilling",
        title,
        company,
        location:    municipal,
        url:         navUrl,
        beskrivelse: stripHtml(String(s.description ?? "")).slice(0, 300) || undefined,
        dato:        String(s.published ?? "") || undefined,
        deadline:    String(s.expires ?? "") || undefined,
        kilde:       "NAV",
        kildeNavn:   "NAV",
        funnetDato:  now,
      });
    }
    funn.push(...historiskeBatch.slice(0, 3));
  } catch (e) {
    warnings.push(`NAV: ${e instanceof Error ? e.message : "feil"}`);
  }
  console.log("NAV relevante stillinger:", funn.filter(f => f.kildeNavn === "NAV").length);
  console.log("Historiske signaler:", funn.filter(f => f.signalSubtype === "historisk").length);

  // ── DEL 2 — Google Jobs via Apify ─────────────────────────────────────────
  const apifyKey = process.env.APIFY_API_KEY;
  if (apifyKey) {
    try {
      const søk      = `${søkeProfil.primær} ${geografi} Norway`;
      const apifyRes = await fetch(
        `https://api.apify.com/v2/actors/khadinakbar~google-jobs-scraper/run-sync-get-dataset-items?token=${apifyKey}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ queries: [søk], maxResults: 10, datePostedFilter: "week", proxyCountry: "NO" }),
          cache:   "no-store",
          signal:  AbortSignal.timeout(25000),
        }
      );
      if (apifyRes.ok) {
        const jobs = (await apifyRes.json()) as Array<Record<string, unknown>>;
        // Debug: vis første jobb-objekt råformat
        if (jobs?.[0]) console.log("Apify rådata første jobb:", JSON.stringify(jobs[0], null, 2));
        for (const job of (jobs ?? [])) {
          const title = String(job.title ?? "").trim();
          if (!title) continue;
          const tekst = `${title} ${String(job.description ?? "")}`.toLowerCase();
          if (!søkeProfil.alle.some(ord => tekst.includes(ord.toLowerCase()))) continue;
          const via = String(job.via ?? "").toLowerCase();
          const kildeNavn = via.includes("finn") ? "Finn.no"
            : via.includes("linkedin") ? "LinkedIn"
            : via.includes("nav")      ? "NAV"
            : String(job.via ?? "Google Jobs");
          funn.push({
            id:          randomUUID(),
            signalType:  "Utlyst stilling",
            kategori:    "stilling",
            title,
            company:     String(job.company ?? job.companyName ?? "") || undefined,
            location:    String(job.location ?? "") || geografi,
            beskrivelse: String(job.description ?? "").slice(0, 300) || undefined,
            url:         String(job.applyLink ?? job.jobUrl ?? job.url ?? ""),
            kilde:       "Google Jobs",
            kildeNavn,
            funnetDato:  now,
          });
        }
        console.log("Google Jobs (Apify):", jobs?.length, "treff →", funn.filter(f => f.kilde === "Google Jobs").length, "relevante");
      } else {
        const txt = await apifyRes.text().catch(() => "");
        console.log("Apify Google Jobs feilet:", apifyRes.status, txt.slice(0, 200));
        warnings.push(`Apify Google Jobs: ${apifyRes.status}`);
      }
    } catch (e) {
      console.error("Apify Google Jobs feil:", e instanceof Error ? e.message : e);
      warnings.push(`Apify Google Jobs: ${e instanceof Error ? e.message : "feil"}`);
    }
  }

  // ── DEL 3 — LinkedIn Jobs via Apify (khadinakbar~linkedin-jobs-scraper) ───
  if (apifyKey) {
    try {
      const liRes = await fetch(
        `https://api.apify.com/v2/actors/khadinakbar~linkedin-jobs-scraper/run-sync-get-dataset-items?token=${apifyKey}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ queries: [`${søkeProfil.primær} ${geografi}`], location: "Norway", maxResults: 10 }),
          cache:   "no-store",
          signal:  AbortSignal.timeout(25000),
        }
      );
      if (liRes.ok) {
        const liJobs = (await liRes.json()) as Array<Record<string, unknown>>;
        if (liJobs?.[0]) console.log("LinkedIn første:", JSON.stringify(liJobs[0]));
        for (const job of (liJobs ?? [])) {
          const title = String(job.title ?? "").trim();
          if (!title) continue;
          funn.push({
            id:          randomUUID(),
            signalType:  "LinkedIn",
            kategori:    "stilling",
            title,
            company:     String(job.company ?? job.companyName ?? "") || undefined,
            location:    String(job.location ?? "") || geografi,
            beskrivelse: String(job.description ?? job.snippet ?? "").slice(0, 300) || undefined,
            url:         String(job.jobUrl ?? job.url ?? ""),
            kilde:       "LinkedIn",
            kildeNavn:   "LinkedIn",
            funnetDato:  now,
          });
        }
        console.log("LinkedIn Jobs (Apify):", liJobs?.length, "treff →", funn.filter(f => f.kilde === "LinkedIn").length, "totalt LinkedIn");
      } else {
        const txt = await liRes.text().catch(() => "");
        console.log("LinkedIn feilet:", liRes.status, txt.slice(0, 200));
        warnings.push(`Apify LinkedIn: ${liRes.status}`);
      }
    } catch (e) {
      console.error("LinkedIn feil:", e instanceof Error ? e.message : e);
      warnings.push(`Apify LinkedIn: ${e instanceof Error ? e.message : "feil"}`);
    }
  }

  // ── DEL 4+5+6 — Unified Brave Search ──────────────────────────────────────
  if (webEnabled) {
    const hdr = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };

    const braveSøk = [
      // Finn direkte annonser — ingen anførselstegn for bredere treff
      `site:finn.no/job/ad ${søkeProfil.primær} ${geografi}`,
      `site:finn.no/job/ad ${søkeProfil.alle.slice(0, 2).join(" OR ")} Oslo`,
      // LinkedIn
      `site:linkedin.com/jobs "${søkeProfil.primær}" ${geografi} ${iÅr}`,
      `site:linkedin.com/posts "${søkeProfil.primær}" "vi søker" OR "ledig stilling" ${iÅr}`,
      // Generelle stillinger
      `"${søkeProfil.primær}" stilling ${geografi} ${iÅr} -site:proff.no -site:brreg.no -site:facebook.com`,
      // Signaler
      `${søkeProfil.alle.slice(0, 2).join(" OR ")} selskap funding investering ansetter Norge ${iÅr}`,
      `${søkeProfil.primær} selskap "ny CEO" OR "ny CFO" OR "ny direktør" OR vekst Norge ${iÅr}`,
    ];

    for (const query of braveSøk) {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&country=NO&freshness=pm`;
        const res = await fetch(url, { headers: hdr, cache: "no-store" });
        if (!res.ok) { warnings.push(`Brave: ${res.status}`); continue; }
        const data = (await res.json()) as { web?: { results?: unknown[] } };

        for (const item of (data.web?.results ?? [])) {
          const it      = item as Record<string, unknown>;
          const itemUrl = typeof it.url === "string" ? it.url.trim() : "";
          if (!itemUrl) continue;
          if (SKIP_DOMENER.some(d => itemUrl.includes(d))) continue;

          const rawTitle = stripHtml(typeof it.title === "string" ? it.title.trim() : "");
          const desc     = stripHtml(typeof it.description === "string" ? it.description : "");
          if (!rawTitle || rawTitle.length < 10) continue;

          // Filtrer gamle årstall (kun i tittel)
          if (GAMLE_ÅR.some(å => rawTitle.includes(å))) continue;

          const tekst = `${rawTitle} ${desc}`.toLowerCase();

          // Relevansjekk
          if (!søkeProfil.alle.some(ord => tekst.includes(ord.toLowerCase()))) continue;

          // Klassifiser
          const erLinkedIn = itemUrl.includes("linkedin.com");
          const erFinn     = /finn\.no\/job\/(ad\/)?\d+/.test(itemUrl);
          const erSignal   = SIGNAL_ORD.some(s => tekst.includes(s));

          // Skip LinkedIn-profiler
          if (erLinkedIn && itemUrl.includes("/in/")) continue;

          // Ugyldig Finn-tittel
          const ugyldigeTitler = ["alle har rett","godt liv","søk uten cv","lignende annonser","finn jobb"];
          if (erFinn && ugyldigeTitler.some(u => rawTitle.toLowerCase().includes(u))) continue;

          if (erSignal) {
            const erBransje = BRANSJENYHET_DOM.some(d => itemUrl.includes(d));
            const subtype: SignalSubtype = erBransje ? "bransjenyhet"
              : tekst.includes("funding") || tekst.includes("investering") || tekst.includes("henter kapital") ? "funding"
              : tekst.includes("direktør") || tekst.includes("ceo") || tekst.includes("cfo")                  ? "ny-ledelse"
              : "vekst";

            const relevans =
              subtype === "funding"    ? "Selskaper som henter kapital ansetter typisk innen 60–90 dager." :
              subtype === "ny-ledelse" ? "Ny leder bygger alltid team i løpet av de første 60 dagene."     :
              subtype === "vekst"      ? "Vekstselskaper ansetter før de lyser ut stillinger offentlig."   :
              "Markedsbevegelser påvirker ansettelser i din bransje.";

            funn.push({
              id:                  randomUUID(),
              signalType:          "Nyhet",
              kategori:            "signal",
              signalSubtype:       subtype,
              relevansForKandidat: relevans,
              title:               rawTitle,
              location:            geografi,
              beskrivelse:         desc.slice(0, 300) || undefined,
              url:                 itemUrl,
              kilde:               `Signal (${subtype})`,
              funnetDato:          now,
            });
          } else {
            const cleanTitle = erFinn
              ? rawTitle.replace(/\s*\|\s*FINN(\.no|\.no\s*Jobb|\s*Jobb)?$/i, "").trim()
              : rawTitle;
            funn.push({
              id:          randomUUID(),
              signalType:  erLinkedIn ? "LinkedIn" : "Utlyst stilling",
              kategori:    "stilling",
              title:       cleanTitle,
              company:     erFinn ? extractFinnCompany(rawTitle) : undefined,
              location:    geografi,
              beskrivelse: desc.slice(0, 300) || undefined,
              url:         itemUrl,
              kilde:       erLinkedIn ? "LinkedIn" : erFinn ? "Finn.no" : "Nett",
              kildeNavn:   erLinkedIn ? "LinkedIn" : erFinn ? "Finn.no" : undefined,
              funnetDato:  now,
            });
          }
        }
      } catch (e) {
        warnings.push(`Brave søk feil: ${e instanceof Error ? e.message : "feil"}`);
      }
    }
    console.log("Brave stillinger:", funn.filter(f => f.kategori === "stilling" && f.kilde !== "NAV").length);
    console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("=== SCAN FERDIG ===");
  console.log("NAV stillinger:",     funn.filter(f => f.kildeNavn === "NAV").length);
  console.log("Finn.no stillinger:", funn.filter(f => f.kildeNavn === "Finn.no").length);
  console.log("LinkedIn:",           funn.filter(f => f.kildeNavn === "LinkedIn").length);
  console.log("Signaler:",           funn.filter(f => f.kategori === "signal").length);
  console.log("Totalt:",             funn.length);

  const seen    = new Set<string>();
  const deduped = funn.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });

  return NextResponse.json({ funn: deduped, warnings, scannedAt: now, webEnabled, webScanningDisabled: !webEnabled });
}
