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

  // ── Del 1: Finn.no via Brave Search ──────────────────────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Oslo";
    const søkTerm = p.seeking.split(" ")[0] || sokeord;

    const finnUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      `site:finn.no/job ${søkTerm} ${geo}`
    )}&count=10&country=NO&freshness=pm`;

    try {
      const finnRes = await fetch(finnUrl, {
        headers: { Accept: "application/json", "X-Subscription-Token": braveKey },
        cache: "no-store",
      });

      console.log("Finn.no Brave status:", finnRes.status);
      if (finnRes.ok) {
        const finnData = (await finnRes.json()) as { web?: { results?: unknown[] } };
        for (const item of finnData.web?.results ?? []) {
          const it = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const desc = typeof it.description === "string" ? stripHtml(it.description).slice(0, 300) : "";
          if (!title || title.length < 10) continue;
          const url = typeof it.url === "string" ? it.url.trim() : "";
          if (!url) continue;
          funn.push({
            id: makeId(url, title),
            signalType: "Utlyst stilling",
            kategori: "stilling",
            title,
            url,
            location: geo || undefined,
            beskrivelse: desc || undefined,
            kilde: "Finn.no",
            kildeNavn: "Finn.no",
            funnetDato: new Date().toISOString(),
          });
        }
        console.log("Finn.no stillinger:", funn.filter((f) => f.kildeNavn === "Finn.no").length);
      } else {
        warnings.push("Finn.no: Ingen treff akkurat nå.");
      }
    } catch (e) {
      console.error("Finn.no feil:", e);
      warnings.push(`Finn.no: ${e instanceof Error ? e.message : "ukjent feil"}`);
    }
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

        funn.push({
          id: makeId(url, title),
          signalType,
          kategori,
          title,
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

    try {
      const [fundingRes, lederRes, vekstRes, bransjeRes] = await Promise.all([
        fetch(burl(`${bransje} selskap funding investering Norge 2026`), { headers: braveHdr }),
        fetch(burl(`${bransje} ny CEO CFO direktør ansetter Norge 2026`), { headers: braveHdr }),
        fetch(burl(`${bransje} selskap vekst ekspanderer ansetter ${geo} 2026`), { headers: braveHdr }),
        fetch(burl(`${bransje} bransje Norge nyheter markedsutvikling 2026`), { headers: braveHdr }),
      ]);

      const signalTyper: {
        res: Response;
        subtype: import("@/lib/scanner-types").SignalSubtype;
        relevans: string;
      }[] = [
        { res: fundingRes, subtype: "funding", relevans: "Selskaper som henter kapital ansetter typisk innen 60–90 dager." },
        { res: lederRes, subtype: "ny-ledelse", relevans: "Ny leder bygger alltid team i løpet av de første 60 dagene." },
        { res: vekstRes, subtype: "vekst", relevans: "Vekstselskaper ansetter før de lyser ut stillinger offentlig." },
        { res: bransjeRes, subtype: "bransje", relevans: "Markedsbevegelser påvirker ansettelser i din bransje." },
      ];

      for (const { res, subtype, relevans } of signalTyper) {
        if (!res.ok) continue;
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        let antall = 0;
        for (const item of data.web?.results ?? []) {
          if (antall >= 3) break;
          const it = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const url = typeof it.url === "string" ? it.url.trim() : "";
          if (!title || title.length < 10 || !url) continue;
          if (url.includes("linkedin.com")) continue;
          if (NON_JOB_DOMAINS.some((d) => url.includes(d))) continue;
          const desc = typeof it.description === "string"
            ? stripHtml(it.description).slice(0, 300)
            : "";
          funn.push({
            id: makeId(url, title),
            signalType: "Nyhet",
            kategori: "signal",
            signalSubtype: subtype,
            relevansForKandidat: relevans,
            title,
            url,
            location: geo || undefined,
            beskrivelse: desc || undefined,
            kilde: `Brave Search (${subtype})`,
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
