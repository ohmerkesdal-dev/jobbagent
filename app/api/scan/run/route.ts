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

  // ── Del 1: NAV Ledige stillinger ──────────────────────────────────────────
  try {
    const navUrl = `https://arbeidsplassen.nav.no/public-feed/api/v1/ads?size=20&q=${encodeURIComponent(sokeord)}&municipal=${kommuneKode}&sort=published&sort-order=desc`;
    const navRes = await fetch(navUrl, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache",
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (navRes.ok) {
      const navData = (await navRes.json()) as { content?: unknown[] };
      const alleStillinger = navData.content ?? [];

      const iDag = new Date();
      const stillinger = alleStillinger.filter((s) => {
        const a = s as Record<string, unknown>;
        if (!a.expires) return true;
        return new Date(a.expires as string) > iDag;
      });

      console.log(
        "NAV returnerte",
        alleStillinger.length,
        "totalt,",
        stillinger.length,
        "ikke utløpt, søkeord:",
        sokeord,
      );

      const seenNav = new Set<string>();
      for (const s of stillinger) {
        const a = s as Record<string, unknown>;
        const expiresRaw = typeof a.expires === "string" ? a.expires : null;

        const uuid = typeof a.uuid === "string" ? a.uuid : "";
        if (!uuid || seenNav.has(uuid)) continue;
        seenNav.add(uuid);
        const title = typeof a.title === "string" ? a.title : "";
        if (!title) continue;

        const emp = a.employer as { name?: string } | undefined;
        const loc = a.location as { municipal?: string; county?: string } | undefined;
        const rawDesc = typeof a.description === "string" ? a.description : "";
        const desc = rawDesc
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .trim()
          .slice(0, 300);

        funn.push({
          id: uuid,
          signalType: "Utlyst stilling",
          kategori: "stilling",
          title,
          company: emp?.name || undefined,
          location: loc?.municipal || loc?.county || undefined,
          url: `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`,
          dato: typeof a.published === "string" ? a.published : undefined,
          deadline: expiresRaw ?? undefined,
          beskrivelse: desc || undefined,
          kilde: "NAV",
          funnetDato: new Date().toISOString(),
        });
      }
    }

    const navCount = funn.filter((f) => f.kategori === "stilling").length;
    if (navCount === 0) {
      warnings.push("NAV: Ingen treff akkurat nå.");
    }
  } catch (e) {
    console.error("NAV feil:", e);
    warnings.push(`NAV stillinger: ${e instanceof Error ? e.message : "ukjent feil"}`);
  }

  const webEnabled = isWebScanEnabled();

  // ── Del 2: Brave Search — tre målrettede søk ──────────────────────────────
  if (webEnabled) {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY!;
    const geo = p.geography || "Norge";

    const braveSearches: { query: string; kategori: ScannerKategori }[] = [
      {
        query: `${p.seeking} ledig stilling ${geo} 2025 2026`,
        kategori: "stilling",
      },
      {
        query: `${p.industry} selskap vekst ansetter funding Norge 2025 2026`,
        kategori: "signal",
      },
      {
        query: `${p.industry} Norway company hiring growth expansion 2026`,
        kategori: "signal",
      },
    ];

    for (const search of braveSearches) {
      await sleepMs(BRAVE_DELAY_MS);
      try {
        const res = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(search.query)}&count=5&country=NO&search_lang=no`,
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
          const erNav = url.includes("nav.no") || url.includes("arbeidsplassen");
          const erPriskomp =
            text.includes("sammenlign") ||
            text.includes("finn beste") ||
            NON_JOB_DOMAINS.some((d) => url.includes(d));

          if (erNav || erPriskomp) continue;

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

  // ── Del 3: Brønnøysundregisteret — aktive selskaper i bransjen ───────────
  try {
    const brregRes = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(p.industry || sokeord)}&kommunenummer=${kommuneKode}&sort=navn,asc&size=5`,
      { headers: { Accept: "application/json" } },
    );
    if (brregRes.ok) {
      const brregData = (await brregRes.json()) as {
        _embedded?: { enheter?: unknown[] };
      };
      for (const enhet of brregData._embedded?.enheter ?? []) {
        const e = enhet as Record<string, unknown>;
        if (e.konkurs || e.underAvvikling) continue;
        const navn = typeof e.navn === "string" ? e.navn : "";
        if (!navn) continue;
        const orgnr = typeof e.organisasjonsnummer === "string" ? e.organisasjonsnummer : "";
        const form = (e.organisasjonsform as { beskrivelse?: string } | undefined)?.beskrivelse ?? "";
        const adr = (e.forretningsadresse as { poststed?: string } | undefined)?.poststed ?? "";
        funn.push({
          id: orgnr || makeId(`brreg:${navn}`, navn),
          signalType: "Selskap",
          kategori: "signal",
          title: `${navn} — aktiv i ${p.industry || "bransjen"}`,
          company: navn,
          location: adr || undefined,
          url: `https://www.brreg.no/lag-og-foreninger/oppslag-i-registrene/enhetsregisteret/?q=${orgnr}`,
          beskrivelse: `Org.nr: ${orgnr} · ${form} · Ikke under avvikling`,
          kilde: "Brønnøysundregisteret",
          funnetDato: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Brreg feil:", e);
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
