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

  const g = p.geography.toLowerCase();
  const kommuneKode = g.includes("bergen") ? "4601"
    : g.includes("trondheim") ? "5001"
    : g.includes("stavanger") ? "1103"
    : g.includes("kristiansand") ? "4204"
    : g.includes("tromsø") || g.includes("tromso") ? "5401"
    : "0301";

  // ── Del 1: NAV Ledige stillinger via pam-stilling-feed ───────────────────
  try {
    const FEED_BASE = "https://pam-stilling-feed.nav.no";
    const USER_AGENT = "Mozilla/5.0 (compatible; Jobbagent/1.0)";

    const tokenRes = await fetch(`${FEED_BASE}/api/publicToken`, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });

    if (tokenRes.ok) {
      const tokenText = await tokenRes.text();
      const tokenMatch = tokenText.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      const token = tokenMatch?.[0];

      if (token) {
        const keywords = [
          sokeord,
          p.seeking.split(" ")[0].toLowerCase(),
          "regnskapsfører",
          "regnskapskonsulent",
        ].map((k) => k.toLowerCase());

        const seenNav = new Set<string>();
        let feedPath = "/api/v1/feed";
        const maxPages = 15;
        const now = new Date().toISOString();

        for (let page = 0; page < maxPages && funn.filter(f => f.kategori === "stilling").length < 20; page++) {
          const feedUrl = feedPath.startsWith("http") ? feedPath : `${FEED_BASE}${feedPath}`;
          const feedRes = await fetch(feedUrl, {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
            cache: "no-store",
          });
          if (!feedRes.ok) break;

          const data = (await feedRes.json()) as { items?: unknown[]; next_url?: string | null };
          const items = (data.items ?? []) as Array<Record<string, unknown>>;

          for (const item of items) {
            const fe = item._feed_entry as Record<string, unknown> | undefined;
            if (!fe || fe.status !== "ACTIVE") continue;
            const title = ((fe.title ?? item.title ?? "") as string).trim();
            const uuid = (fe.uuid as string | undefined)?.trim();
            if (!title || !uuid || seenNav.has(uuid)) continue;

            const blob = `${title} ${fe.businessName ?? ""} ${fe.municipal ?? ""}`.toLowerCase();
            if (!keywords.some((k) => blob.includes(k))) continue;

            seenNav.add(uuid);
            const url = `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;
            funn.push({
              id: uuid,
              signalType: "Utlyst stilling",
              kategori: "stilling",
              title,
              company: (fe.businessName as string | undefined) || undefined,
              location: (fe.municipal as string | undefined) || undefined,
              url,
              kilde: "NAV",
              funnetDato: now,
            });
          }

          const next = data.next_url;
          if (!next) break;
          feedPath = next;
        }
      }
    }

    const navCount = funn.filter((f) => f.kategori === "stilling").length;
    console.log("NAV feed stillinger:", navCount);
    if (navCount === 0) warnings.push("NAV: Ingen treff akkurat nå.");
  } catch (e) {
    console.error("NAV feil:", e);
    warnings.push(`NAV stillinger: ${e instanceof Error ? e.message : "ukjent feil"}`);
  }

  const webEnabled = isWebScanEnabled();
  console.log("webEnabled:", webEnabled, "navStillinger:", funn.filter(f => f.kategori === "stilling").length);

  // ── Del 2: LinkedIn + multi-kilde parallell søk ──────────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Oslo";
    const søkTerm = p.seeking.split(" ")[0] || sokeord;

    const linkedinSøk = [
      `site:linkedin.com/jobs/view "${søkTerm}" "${geo}"`,
      `site:linkedin.com/jobs/view "${søkTerm}" Norway`,
      `"${søkTerm}" "vi søker" OR "ledig stilling" site:linkedin.com`,
      `"${søkTerm}" site:finn.no/job`,
      `"${søkTerm}" site:webcruiter.com`,
    ];

    const selskapsSøk = selskaper.slice(0, 5).map((navn) =>
      `"${navn}" ansetter OR stilling OR jobb site:linkedin.com OR site:finn.no OR site:webcruiter.com`
    );

    const alleSøk = [...linkedinSøk, ...selskapsSøk];

    const braveHdr = { Accept: "application/json", "X-Subscription-Token": braveKey };
    const burl = (q: string) =>
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO`;

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
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5&country=NO`;

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

  console.log("NAV:", funn.filter((f) => f.kilde === "NAV").length);
  console.log("LinkedIn:", funn.filter((f) => f.kildeNavn === "LinkedIn").length);
  console.log("Finn.no:", funn.filter((f) => f.kildeNavn === "Finn.no").length);
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
