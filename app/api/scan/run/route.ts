import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { ScannerFunn } from "@/lib/scanner-types";
import type { ProfilScanInput } from "@/lib/scanner-types";
import { isWebScanEnabled } from "@/lib/scanner-web-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Body = { profile?: ProfilScanInput; selskaper?: unknown };

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Kommunekoder for de vanligste byene
function kommuneKode(geo: string): string {
  const g = geo.toLowerCase();
  if (g.includes("bergen"))     return "4601";
  if (g.includes("trondheim"))  return "5001";
  if (g.includes("stavanger"))  return "1103";
  if (g.includes("tromsø"))     return "5401";
  return "0301"; // Oslo
}

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

  const warnings:   string[]       = [];
  const funn:       ScannerFunn[]  = [];
  const webEnabled  = isWebScanEnabled();
  const now         = new Date().toISOString();
  const iÅr         = new Date().getFullYear();
  const sokeord     = (p.seeking || "regnskap").split(" ")[0].toLowerCase();
  const geografi    = p.geography || "Oslo";
  const bransje     = p.industry  || sokeord;
  const kKode       = kommuneKode(geografi);

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 1 — NAV stillinger/api/search (åpent, Elasticsearch-format)
  // ──────────────────────────────────────────────────────────────────────────
  try {
    const navUrl = `https://arbeidsplassen.nav.no/stillinger/api/search?q=${encodeURIComponent(sokeord)}&size=20&municipal=${kKode}`;
    const navRes = await fetch(navUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (navRes.ok) {
      const navData = (await navRes.json()) as { hits?: { hits?: unknown[] } };
      const iDag    = new Date();
      for (const hit of (navData.hits?.hits ?? [])) {
        const h     = hit as Record<string, unknown>;
        const s     = (h._source ?? h) as Record<string, unknown>;
        const uuid  = String(s.uuid ?? h._id ?? "").trim();
        const title = String(s.title ?? "").trim();
        if (!uuid || !title) continue;
        if (s.expires && new Date(s.expires as string) < iDag) continue;
        const locList = (s.locationList as Array<Record<string,unknown>> | undefined) ?? [];
        const municipal = locList[0]?.municipal ?? locList[0]?.city ?? "";
        funn.push({
          id:          uuid,
          signalType:  "Utlyst stilling",
          kategori:    "stilling",
          title,
          company:     String(s.businessName ?? "") || undefined,
          location:    String(municipal) || geografi,
          url:         `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
          beskrivelse: stripHtml(String(s.description ?? "")).slice(0, 300) || undefined,
          dato:        String(s.published ?? "") || undefined,
          deadline:    String(s.expires ?? "") || undefined,
          kilde:       "NAV",
          kildeNavn:   "NAV",
          funnetDato:  now,
        });
      }
    } else {
      const txt = await navRes.text().catch(() => "");
      warnings.push(`NAV: ${navRes.status} ${txt.slice(0, 100)}`);
    }
  } catch (e) {
    warnings.push(`NAV: ${e instanceof Error ? e.message : "feil"}`);
  }
  console.log("NAV:", funn.filter(f => f.kildeNavn === "NAV").length, "stillinger");

  // Søkeordutvidelse — brukes for relevansfiltrering i DEL 2 og DEL 3
  const relevanteSøkeord = [
    sokeord,
    ...(sokeord.includes("regnskap") ? ["regnskapsfører","regnskapsmedarbeider","controller","økonomi","revisjon","revisor","regnskap"] : []),
    ...(sokeord.includes("hr")       ? ["human resources","people","rekruttering","personalansvarlig","personalleder"] : []),
    ...(sokeord.includes("salg")     ? ["salgsansvarlig","sales","account manager","business development"] : []),
    ...(sokeord.includes("it")       ? ["utvikler","developer","engineer","systemutvikler","frontend","backend"] : []),
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 2 — Finn.no via Brave (kun finn.no/job-URLer)
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr     = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const finnSøk = [
      `site:finn.no/job ${sokeord} ${geografi}`,
      `site:finn.no/job ${sokeord} norge`,
    ];
    for (const query of finnSøk) {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=NO&freshness=pw`;
        const res = await fetch(url, { headers: hdr, cache: "no-store" });
        if (!res.ok) { warnings.push(`Finn Brave: ${res.status}`); continue; }
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        for (const item of (data.web?.results ?? [])) {
          const it      = item as Record<string, unknown>;
          const itemUrl = typeof it.url === "string" ? it.url.trim() : "";
          if (!/finn\.no\/job\/(ad\/)?\d+/.test(itemUrl)) continue;
          const title   = stripHtml(typeof it.title === "string" ? it.title.trim() : "");
          if (!title || title.length < 10) continue;
          const ugyldigeTitler = ["alle har rett","godt liv","søk uten cv","lignende annonser","finn jobb"];
          if (ugyldigeTitler.some(u => title.toLowerCase().includes(u))) continue;
          const desc    = stripHtml(typeof it.description === "string" ? it.description : "");
          const tekst   = `${title} ${desc}`.toLowerCase();
          if (!relevanteSøkeord.some(ord => tekst.includes(ord))) continue;
          funn.push({
            id:          randomUUID(),
            signalType:  "Utlyst stilling",
            kategori:    "stilling",
            title,
            location:    geografi,
            beskrivelse: desc.slice(0, 300) || undefined,
            url:         itemUrl,
            kilde:       "Finn.no",
            kildeNavn:   "Finn.no",
            funnetDato:  now,
          });
        }
      } catch (e) {
        warnings.push(`Finn: ${e instanceof Error ? e.message : "feil"}`);
      }
    }
    console.log("Finn.no:", funn.filter(f => f.kildeNavn === "Finn.no").length, "stillinger");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 3 — LinkedIn stillingsinnlegg via Brave
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr          = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const linkedinSøk  = [
      `site:linkedin.com/jobs ${sokeord} ${geografi}`,
      `site:linkedin.com/posts "${sokeord}" "søker" OR "vi ansetter" OR "ledig stilling" ${iÅr}`,
      `site:linkedin.com "${bransje}" stilling ${geografi} ${iÅr}`,
    ];
    for (const query of linkedinSøk) {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=NO&freshness=pm`;
        const res = await fetch(url, { headers: hdr, cache: "no-store" });
        if (!res.ok) { warnings.push(`LinkedIn Brave: ${res.status}`); continue; }
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        for (const item of (data.web?.results ?? [])) {
          const it      = item as Record<string, unknown>;
          const itemUrl = typeof it.url === "string" ? it.url.trim() : "";
          if (!itemUrl.includes("linkedin.com")) continue;
          if (itemUrl.includes("/in/")) continue;
          const title   = stripHtml(typeof it.title === "string" ? it.title.trim() : "");
          if (!title || title.length < 5) continue;
          const desc    = stripHtml(typeof it.description === "string" ? it.description : "");
          const tekst   = `${title} ${desc}`.toLowerCase();
          if (!relevanteSøkeord.some(ord => tekst.includes(ord))) continue;
          funn.push({
            id:          randomUUID(),
            signalType:  "LinkedIn",
            kategori:    "stilling",
            title,
            location:    geografi,
            beskrivelse: desc.slice(0, 300) || undefined,
            url:         itemUrl,
            kilde:       "LinkedIn",
            kildeNavn:   "LinkedIn",
            funnetDato:  now,
          });
        }
      } catch (e) {
        warnings.push(`LinkedIn: ${e instanceof Error ? e.message : "feil"}`);
      }
    }
    console.log("LinkedIn:", funn.filter(f => f.kildeNavn === "LinkedIn").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEL 4 — Signaler (vekst og funding) via Brave — ingen Brreg/Proff
  // ──────────────────────────────────────────────────────────────────────────
  if (webEnabled) {
    const hdr               = { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! };
    const SKIP_DOMENER      = ["brreg.no","proff.no","1881.no","gulesider.no","virksomheter.no","purehelp.no"];
    const SIGNAL_ORD        = ["funding","investering","vekst","ansetter","ekspanderer","millioner","ny ceo","ny cfo","ny direktør","henter kapital"];
    const BRANSJENYHET_DOM  = ["e24.no","finansavisen.no","nrk.no","dn.no","dagbladet.no"];
    const signalSøk         = [
      `${sokeord} selskap funding investering ansetter Norge ${iÅr}`,
      `${bransje} vekst ekspanderer ${geografi} ${iÅr}`,
      `${sokeord} selskap "ny CEO" OR "ny CFO" OR "ny direktør" Norge ${iÅr}`,
    ];
    for (const query of signalSøk) {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=NO&freshness=pm`;
        const res = await fetch(url, { headers: hdr, cache: "no-store" });
        if (!res.ok) { warnings.push(`Signal Brave: ${res.status}`); continue; }
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        for (const item of (data.web?.results ?? [])) {
          const it      = item as Record<string, unknown>;
          const itemUrl = typeof it.url === "string" ? it.url.trim() : "";
          if (!itemUrl) continue;
          if (SKIP_DOMENER.some(d => itemUrl.includes(d))) continue;
          const title  = stripHtml(typeof it.title === "string" ? it.title.trim() : "");
          const desc   = stripHtml(typeof it.description === "string" ? it.description : "");
          const tekst  = `${title} ${desc}`.toLowerCase();
          if (!SIGNAL_ORD.some(s => tekst.includes(s))) continue;

          const erBransje = BRANSJENYHET_DOM.some(d => itemUrl.includes(d));
          const subtype   = erBransje ? "bransjenyhet" as const
            : tekst.includes("funding") || tekst.includes("investering") || tekst.includes("henter kapital") ? "funding"    as const
            : tekst.includes("direktør") || tekst.includes("ceo") || tekst.includes("cfo")                  ? "ny-ledelse" as const
            : "vekst" as const;

          const relevans =
            subtype === "funding"     ? "Selskaper som henter kapital ansetter typisk innen 60–90 dager."  :
            subtype === "ny-ledelse"  ? "Ny leder bygger alltid team i løpet av de første 60 dagene."      :
            subtype === "vekst"       ? "Vekstselskaper ansetter før de lyser ut stillinger offentlig."    :
            "Markedsbevegelser påvirker ansettelser i din bransje.";

          funn.push({
            id:                 randomUUID(),
            signalType:         "Nyhet",
            kategori:           "signal",
            signalSubtype:      subtype,
            relevansForKandidat: relevans,
            title,
            location:           geografi,
            beskrivelse:        desc.slice(0, 300) || undefined,
            url:                itemUrl,
            kilde:              `Signal (${subtype})`,
            funnetDato:         now,
          });
        }
      } catch (e) {
        warnings.push(`Signal: ${e instanceof Error ? e.message : "feil"}`);
      }
    }
    console.log("Signaler:", funn.filter(f => f.kategori === "signal").length);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("=== SCAN FERDIG ===");
  console.log("NAV stillinger:",   funn.filter(f => f.kildeNavn === "NAV").length);
  console.log("Finn.no stillinger:", funn.filter(f => f.kildeNavn === "Finn.no").length);
  console.log("LinkedIn:",         funn.filter(f => f.kildeNavn === "LinkedIn").length);
  console.log("Signaler:",         funn.filter(f => f.kategori === "signal").length);
  console.log("Totalt:",           funn.length);

  const seen    = new Set<string>();
  const deduped = funn.filter(f => { if (seen.has(f.url)) return false; seen.add(f.url); return true; });

  return NextResponse.json({ funn: deduped, warnings, scannedAt: now, webEnabled, webScanningDisabled: !webEnabled });
}
