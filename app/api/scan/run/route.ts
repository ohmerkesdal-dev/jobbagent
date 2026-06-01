import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { ProfilScanInput, ScannerFunn, ScannerKategori } from "@/lib/scanner-types";
import {
  fetchBraveWebSearch,
  sleepMs,
  type WebSearchItem,
} from "@/lib/brave-search";
import { isWebScanEnabled } from "@/lib/scanner-web-config";
import { byggSelskapSøk } from "@/lib/scanner-queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const BRAVE_DELAY_MS = 400;

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

function klassifiser(
  title: string,
  description: string,
  url: string,
): ScannerKategori {
  const text = (title + " " + description + " " + url).toLowerCase();
  if (
    url.includes("linkedin.com") ||
    text.includes("connections on linkedin") ||
    (text.includes("view") && text.includes("profile"))
  )
    return "person";
  if (
    url.includes("nav.no") ||
    text.includes("søker du") ||
    text.includes("ledig stilling") ||
    text.includes("vi søker") ||
    text.includes("søknadsfrist") ||
    text.includes("fulltid") ||
    text.includes("deltid")
  )
    return "stilling";
  if (
    text.includes("funding") ||
    text.includes("millioner") ||
    text.includes("ansetter") ||
    text.includes("ekspanderer") ||
    text.includes("vekst") ||
    text.includes("henter") ||
    text.includes("ny ceo") ||
    text.includes("ny cfo")
  )
    return "signal";
  return "nyhet";
}

function webItemTilFunn(
  item: WebSearchItem,
  kildeLabel: string,
): ScannerFunn | null {
  const title = item.title?.trim();
  const url = item.link?.trim();
  if (!title || !url) return null;
  const rawSnippet = item.snippet ?? "";
  const beskrivelse = stripHtml(rawSnippet);
  const lower = url.toLowerCase();
  const signalType: ScannerFunn["signalType"] = lower.includes("linkedin.com")
    ? "LinkedIn"
    : lower.includes("finn.no")
      ? "Utlyst stilling"
      : "Nyhet";
  const kategori = klassifiser(title, beskrivelse, url);
  return {
    id: makeId(url, title),
    signalType,
    kategori,
    title,
    url,
    beskrivelse,
    kilde: kildeLabel,
    funnetDato: new Date().toISOString(),
  };
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

  // ── Del 2: Brave Search — NAV-stillinger + signaler ───────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Oslo";

    const søkTerm = p.seeking.split(" ")[0] || sokeord;
    const braveSearches: { query: string; kategori: ScannerKategori }[] = [
      {
        query: `site:arbeidsplassen.nav.no ${søkTerm} stilling`,
        kategori: "stilling",
      },
      {
        query: `${søkTerm} ledig stilling ${geo} 2026`,
        kategori: "stilling",
      },
      {
        query: `norsk selskap ${p.industry || søkTerm} ansetter vekst funding 2026`,
        kategori: "signal",
      },
    ];

    for (const search of braveSearches) {
      await sleepMs(BRAVE_DELAY_MS);
      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(search.query)}&count=5&country=NO`,
          { headers: { Accept: "application/json", "X-Subscription-Token": braveKey } },
        );
        if (!res.ok) continue;

        const data = (await res.json()) as { web?: { results?: unknown[] } };
        for (const item of data.web?.results ?? []) {
          const it = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const url = typeof it.url === "string" ? it.url.trim() : "";
          if (!title || !url) continue;

          const desc = typeof it.description === "string"
            ? stripHtml(it.description).slice(0, 300)
            : "";
          const text = `${title} ${desc}`.toLowerCase();

          const erLinkedIn = url.includes("linkedin.com");
          const erPriskomp =
            text.includes("sammenlign") ||
            text.includes("finn beste") ||
            NON_JOB_DOMAINS.some((d) => url.includes(d));

          if (erPriskomp) continue;

          let kategori: ScannerKategori = search.kategori;
          if (erLinkedIn) kategori = "person";

          const signalType: ScannerFunn["signalType"] = erLinkedIn
            ? "LinkedIn"
            : kategori === "stilling"
              ? "Utlyst stilling"
              : "Nyhet";

          funn.push({
            id: makeId(url, title),
            signalType,
            kategori,
            title,
            url,
            location: geo || undefined,
            beskrivelse: desc || undefined,
            kilde: "Brave Search",
            funnetDato: new Date().toISOString(),
          });
        }
      } catch (e) {
        warnings.push(`Brave: ${e instanceof Error ? e.message : "feil"}`);
      }
    }

    // Selskaper brukeren følger
    for (const navn of selskaper) {
      await sleepMs(BRAVE_DELAY_MS);
      const q = byggSelskapSøk(navn);
      const result = await fetchBraveWebSearch(q, { maxResults: 8 });
      if (!result.ok) {
        warnings.push(`Selskap «${navn}»: ${result.detail}`);
        continue;
      }
      for (const it of result.items) {
        const f = webItemTilFunn(it, `Brave Search (selskap: ${navn})`);
        if (f) funn.push({ ...f, signalType: "Selskap", kategori: "signal", company: navn });
      }
    }
  }

  // ── Del 3: Brave signal-søk for norske vekstsignaler ─────────────────────
  if (webEnabled) {
    const signalQuery = `norsk selskap ${p.industry || "regnskap"} ansetter vekst funding 2026`;
    await sleepMs(BRAVE_DELAY_MS);
    try {
      const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(signalQuery)}&count=5&country=NO`,
        { headers: { Accept: "application/json", "X-Subscription-Token": braveKey } },
      );
      if (res.ok) {
        const data = (await res.json()) as { web?: { results?: unknown[] } };
        for (const item of data.web?.results ?? []) {
          const it = item as Record<string, unknown>;
          const title = typeof it.title === "string" ? stripHtml(it.title.trim()) : "";
          const url = typeof it.url === "string" ? it.url.trim() : "";
          if (!title || !url) continue;
          const desc = typeof it.description === "string"
            ? stripHtml(it.description).slice(0, 300)
            : "";
          if (NON_JOB_DOMAINS.some((d) => url.includes(d))) continue;
          funn.push({
            id: makeId(url, title),
            signalType: "Nyhet",
            kategori: "signal",
            title,
            url,
            beskrivelse: desc || undefined,
            kilde: "Brave Search (signal)",
            funnetDato: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      warnings.push(`Signal-søk: ${e instanceof Error ? e.message : "feil"}`);
    }
  }

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
