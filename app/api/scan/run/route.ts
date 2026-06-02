import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { ProfilScanInput, ScannerFunn, ScannerKategori } from "@/lib/scanner-types";
import { isWebScanEnabled } from "@/lib/scanner-web-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Body = {
  profile?: ProfilScanInput;
  selskaper?: unknown;
};

function makeId(url: string, title: string): string {
  return createHash("sha256")
    .update(`${url}|${title}`)
    .digest("hex")
    .slice(0, 24);
}



const NON_JOB_DOMAINS = [
  "proff.no", "1881.no", "gulesider.no", "brreg.no", "hitta.no",
  "purehelp.no", "finansportalen.no", "sammenlign", "trustpilot",
];

const GYLDIGE_STILLING_DOMENER = [
  "finn.no/job",
  "arbeidsplassen.nav.no/stillinger",
  "webcruiter.com",
  "jobbsafari.no",
  "karriere.no",
];

const NYHETSDOMENER = [
  "e24.no", "finansavisen.no", "nrk.no", "dn.no",
  "dagbladet.no", "aftenposten.no", "vg.no",
];

function erGyldigStillingURL(url: string): boolean {
  return GYLDIGE_STILLING_DOMENER.some((d) => url.includes(d));
}

function trekkUtFrist(desc: string): string | undefined {
  const m = desc.match(/frist[:\s]+(\d{1,2}[.\s]\w+\s?\d{4})/i);
  return m ? m[1].trim() : undefined;
}

function extractCompany(title: string, url: string): string | undefined {
  // LinkedIn: "Title at Company | LinkedIn"
  if (url.includes("linkedin.com")) {
    const m = title.match(/\bat\s+([^|]+?)\s*\|/i);
    if (m?.[1]) {
      const c = m[1].trim();
      if (c.length >= 2 && c.length <= 70) return c;
    }
  }
  // Fjern kilde-suffiks: "| FINN.no", "| Webcruiter" osv.
  const clean = title
    .replace(/\s*\|\s*(FINN\.no|Webcruiter|arbeidsplassen\.nav\.no|jobbsafari\.no|karriere\.no|NAV|LinkedIn Jobs?).*/i, "")
    .trim();
  // "Stillingstittel – Selskapsnavn" (em- eller en-dash)
  const parts = clean.split(/\s+[–—]\s+/);
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1].trim();
    const erJobbFragment = /^(vi søker|ledig|søker|bli |mulighetsrom|din |din, |ansvar|oppgaver)/i.test(candidate);
    if (!erJobbFragment && candidate.length >= 2 && candidate.length <= 70) {
      return candidate;
    }
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}


export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const profile = body.profile;
  if (
    !profile ||
    typeof profile !== "object" ||
    typeof profile.industry !== "string" ||
    typeof profile.seeking !== "string"
  ) {
    return NextResponse.json(
      { error: "Profil mangler (industry og seeking påkrevd)" },
      { status: 400 },
    );
  }

  const selskaperRaw = body.selskaper;
  const selskaper =
    Array.isArray(selskaperRaw) &&
    selskaperRaw.every((x) => typeof x === "string")
      ? (selskaperRaw as string[])
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10)
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

  // Computed once — reused by NAV, Brave and Brreg
  const sokeord = (p.seeking || "regnskap")
    .toLowerCase()
    .replace("regnskapsfører", "regnskap")
    .replace("forretningsutvikler", "forretning")
    .replace("markedskoordinator", "markedsføring")
    .replace("controller", "økonomi")
    .split(" ")[0] || "jobb";

  const webEnabled = isWebScanEnabled();
  console.log("webEnabled:", webEnabled);

  // ── Del 1: Presisjons-stillingssøk (site:finn.no/job, NAV, Webcruiter) ──────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Oslo";
    const søkTerm = p.seeking.split(" ")[0] || sokeord;
    const iÅr = new Date().getFullYear();

    const stillingsSøk = [
      `site:finn.no/job ${søkTerm} ${geo} ${iÅr}`,
      `site:finn.no/job ${søkTerm}`,
      `site:arbeidsplassen.nav.no/stillinger ${søkTerm}`,
      `"søknadsfrist" "${søkTerm}" "${geo}" ${iÅr} -site:youtube.com -site:facebook.com`,
    ];

    const braveHdr = { Accept: "application/json", "X-Subscription-Token": braveKey };
    const burlPw = (q: string) =>
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8&country=NO&freshness=pw`;

    const stillingsResultater = await Promise.all(
      stillingsSøk.map((q) =>
        fetch(burlPw(q), { headers: braveHdr, cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ web?: { results?: unknown[] } }>) : null))
          .catch(() => null)
      )
    );

    for (const data of stillingsResultater) {
      if (!data) continue;
      for (const item of (data.web?.results ?? []).slice(0, 5)) {
        const it = item as Record<string, unknown>;
        const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
        const url   = typeof it.url   === "string" ? it.url.trim()   : "";
        const desc  = typeof it.description === "string" ? stripHtml(it.description).slice(0, 300) : "";

        if (!title || title.length < 10 || !url) continue;
        if (!erGyldigStillingURL(url)) continue;
        // Finn: kun individuelle jobbannonser (krever finnkode)
        if (url.includes("finn.no") && !url.includes("finnkode=")) continue;
        // NAV: kun individuelle stillinger (krever /stilling/ UUID-path)
        if (url.includes("arbeidsplassen.nav.no") && !url.includes("/stilling/")) continue;

        const frist    = trekkUtFrist(desc);
        const company  = extractCompany(title, url);
        const erFinn   = url.includes("finn.no");
        const erNAV    = url.includes("arbeidsplassen.nav.no");
        const erWC     = url.includes("webcruiter.com");
        const kildeNavn = erFinn ? "Finn.no" : erNAV ? "NAV" : erWC ? "Webcruiter" : "Karriere";

        funn.push({
          id: makeId(url, title),
          signalType: "Utlyst stilling",
          kategori: "stilling",
          title,
          company: company || undefined,
          url,
          location: geo || undefined,
          beskrivelse: desc || undefined,
          deadline: frist,
          kilde: kildeNavn,
          kildeNavn,
          funnetDato: new Date().toISOString(),
        });
      }
    }
    console.log("Stillinger (Del 1):", funn.filter((f) => f.kategori === "stilling").length);
  }

  // ── Del 2: LinkedIn + multi-kilde parallell søk ──────────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Oslo";
    const søkTerm = p.seeking.split(" ")[0] || sokeord;

    const iÅr = new Date().getFullYear();
    const forrigeÅr = iÅr - 1;

    const linkedinSøk = [
      `site:linkedin.com/jobs/view "${søkTerm}" "${geo}" ${iÅr} OR ${forrigeÅr}`,
      `site:linkedin.com/jobs/view "${søkTerm}" Norway ${iÅr} OR ${forrigeÅr}`,
      `"${søkTerm}" "vi søker" OR "ledig stilling" site:linkedin.com ${iÅr}`,
      `"${søkTerm}" site:finn.no/job ${iÅr} OR ${forrigeÅr}`,
      `"${søkTerm}" site:webcruiter.com ${iÅr} OR ${forrigeÅr}`,
    ];

    const selskapsSøk = selskaper.slice(0, 5).map((navn) =>
      `"${navn}" ansetter OR stilling OR jobb site:linkedin.com OR site:finn.no OR site:webcruiter.com`
    );

    const alleSøk = [...linkedinSøk, ...selskapsSøk];

    const braveHdr = { Accept: "application/json", "X-Subscription-Token": braveKey };
    const burl = (q: string) =>
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pm`;

    const søkResultater = await Promise.all(
      alleSøk.map((query) =>
        fetch(burl(query), { headers: braveHdr, cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<{ web?: { results?: unknown[] } }>) : null))
          .catch(() => null)
      )
    );

    for (const data of søkResultater) {
      if (!data) continue;
      for (const item of (data.web?.results ?? []).slice(0, 3)) {
        const it = item as Record<string, unknown>;
        const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
        const url = typeof it.url === "string" ? it.url.trim() : "";
        if (!title || title.length < 10 || !url) continue;

        const erLinkedIn = url.includes("linkedin.com");
        const erFinn = url.includes("finn.no");
        const erWebcruiter = url.includes("webcruiter.com");
        if (erLinkedIn && url.includes("/in/")) continue;
        if (NON_JOB_DOMAINS.some((d) => url.includes(d))) continue;

        const desc = typeof it.description === "string"
          ? stripHtml(it.description).slice(0, 300)
          : "";

        const gamleÅrstall = ["2022", "2021", "2020", "2019", "2018", "2017"];
        if (gamleÅrstall.some((år) => (title + " " + desc).includes(år))) continue;

        const tekst = `${title} ${desc}`.toLowerCase();
        const signalOrd = ["funding", "investering", "vekst", "ekspanderer", "ny ceo", "ny cfo", "millioner"];
        const erSignal = signalOrd.some((s) => tekst.includes(s));

        const kildeNavn = erLinkedIn ? "LinkedIn" : erFinn ? "Finn.no" : erWebcruiter ? "Webcruiter" : "Nett";
        const signalType: ScannerFunn["signalType"] = erLinkedIn
          ? "LinkedIn"
          : erFinn || erWebcruiter
            ? "Utlyst stilling"
            : "Nyhet";
        const kategori: ScannerKategori = erSignal ? "signal" : "stilling";

        // Forkast stillinger som ikke er fra godkjente stillingssider
        if (kategori === "stilling" && !erGyldigStillingURL(url)) continue;
        // Finn: kun individuelle annonser
        if (url.includes("finn.no") && !url.includes("finnkode=")) continue;
        // NAV: kun individuelle stillinger
        if (url.includes("arbeidsplassen.nav.no") && !url.includes("/stilling/")) continue;

        const company = kategori === "stilling" ? extractCompany(title, url) : undefined;

        funn.push({
          id: makeId(url, title),
          signalType,
          kategori,
          title,
          company: company || undefined,
          url,
          location: geo || undefined,
          beskrivelse: desc || undefined,
          kilde: kildeNavn,
          kildeNavn,
          funnetDato: new Date().toISOString(),
        });
      }
    }
  }

  // ── Del 3: Fire parallelle signalsøk ─────────────────────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const bransje = p.industry || "regnskap";
    const geo = p.geography || "Oslo";

    const braveHdr = { Accept: "application/json", "X-Subscription-Token": braveKey };
    const burl = (q: string) =>
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO&freshness=pm`;

    // Nyhetsdomener brukes direkte i søkene for garantert kvalitet
    const nyhetsSite = "site:e24.no OR site:dn.no OR site:finansavisen.no OR site:nrk.no OR site:shifter.io OR site:tu.no";

    try {
      const [fundingRes, lederRes, vekstRes, bransjeRes] = await Promise.all([
        fetch(burl(`${bransje} selskap "henter" OR "funding" OR "investering" millioner Norge 2026 ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} "ny direktør" OR "ny CEO" OR "ny CFO" OR "ny konserndirektør" Norge 2026 ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} selskap "ekspanderer" OR "vekst" OR "ansetter" Norge 2026 ${nyhetsSite}`), { headers: braveHdr }),
        fetch(burl(`${bransje} bransje Norge markedsutvikling nyheter 2026 ${nyhetsSite}`), { headers: braveHdr }),
      ]);

      const signalTyper: {
        res: Response;
        subtype: import("@/lib/scanner-types").SignalSubtype;
        relevans: string;
      }[] = [
        { res: fundingRes,  subtype: "funding",      relevans: "Selskaper som henter kapital ansetter typisk innen 60–90 dager." },
        { res: lederRes,    subtype: "ny-ledelse",   relevans: "Ny leder bygger alltid team i løpet av de første 60 dagene."    },
        { res: vekstRes,    subtype: "vekst",        relevans: "Vekstselskaper ansetter før de lyser ut stillinger offentlig."   },
        { res: bransjeRes,  subtype: "bransjenyhet", relevans: "Markedsbevegelser påvirker ansettelser i din bransje."           },
      ];

      for (const { res, subtype, relevans } of signalTyper) {
        if (!res.ok) continue;
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        let antall = 0;
        for (const item of data.web?.results ?? []) {
          if (antall >= 3) break;
          const it = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const url   = typeof it.url   === "string" ? it.url.trim() : "";
          if (!title || title.length < 10 || !url) continue;
          if (url.includes("linkedin.com")) continue;
          if (NON_JOB_DOMAINS.some((d) => url.includes(d))) continue;

          // Skip jobblistingdomener fra signal-søk (disse er stillinger, ikke signaler)
          const JOBB_DOMENER = ["arbeidsplassen.nav.no", "finn.no", "webcruiter.com", "jobbsafari.no", "karriere.no"];
          if (JOBB_DOMENER.some((d) => url.includes(d))) continue;

          const desc = typeof it.description === "string"
            ? stripHtml(it.description).slice(0, 300)
            : "";

          // Klassifiser som bransjenyhet hvis kilden er en nyhetsside
          const erNyhetsKilde = NYHETSDOMENER.some((d) => url.includes(d));
          const faktiskSubtype = erNyhetsKilde ? "bransjenyhet" : subtype;

          // For funding/ledelse/vekst: krev at signal-ord finnes i tittelen
          if (faktiskSubtype !== "bransjenyhet") {
            const SIGNAL_ORD_TITTEL = [
              "funding", "kapital", "investering", "direktør", "ceo", "cfo",
              "konserndirektør", "vekst", "ekspanderer", "henter", "millioner", "kjøper",
            ];
            if (!SIGNAL_ORD_TITTEL.some((o) => title.toLowerCase().includes(o))) continue;
          }

          funn.push({
            id: makeId(url, title),
            signalType: "Nyhet",
            kategori: "signal",
            signalSubtype: faktiskSubtype,
            relevansForKandidat: relevans,
            title,
            url,
            location: geo || undefined,
            beskrivelse: desc || undefined,
            kilde: `Brave Search (${faktiskSubtype})`,
            funnetDato: new Date().toISOString(),
          });
          antall++;
        }
      }
      console.log("Signal-funn:", funn.filter((f) => f.kategori === "signal").length);
    } catch (e) {
      warnings.push(`Signalsøk: ${e instanceof Error ? e.message : "feil"}`);
    }
  }

  console.log("Finn.no:", funn.filter((f) => f.kildeNavn === "Finn.no").length);
  console.log("LinkedIn:", funn.filter((f) => f.kildeNavn === "LinkedIn").length);
  console.log("Webcruiter:", funn.filter((f) => f.kildeNavn === "Webcruiter").length);
  console.log("Totalt:", funn.length);

  const seen = new Set<string>();
  const deduped = funn.filter((f) => {
    if (seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });

  return NextResponse.json({
    funn: deduped,
    warnings,
    scannedAt: new Date().toISOString(),
    webEnabled,
    webScanningDisabled: !webEnabled,
  });
}
