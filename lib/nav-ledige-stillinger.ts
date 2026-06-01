import { createHash } from "crypto";
import type { ProfilScanInput, ScannerFunn } from "@/lib/scanner-types";
import { navSøkeordVarianter } from "@/lib/scanner-queries";

const DEFAULT_NAV_ADS_API =
  "https://arbeidsplassen.nav.no/public-feed/api/v1/ads";
const FEED_BASE = "https://pam-stilling-feed.nav.no";
const USER_AGENT =
  "Mozilla/5.0 (compatible; Jobbagent/1.0; +https://jobbagent.no)";

function makeId(url: string, title: string): string {
  return createHash("sha256")
    .update(`${url}|${title}`)
    .digest("hex")
    .slice(0, 24);
}

function pickString(
  ...vals: Array<unknown>
): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function extractAdObjects(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.content)) return o.content;
  if (Array.isArray(o.ads)) return o.ads;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.results)) return o.results;
  const hits = o.hits as Record<string, unknown> | undefined;
  if (hits && Array.isArray(hits.hits)) {
    return hits.hits.map((h: unknown) => {
      if (h && typeof h === "object" && "_source" in (h as object)) {
        return (h as { _source?: unknown })._source ?? h;
      }
      return h;
    });
  }
  if (Array.isArray(data)) return data;
  return [];
}

function navAdTilFunn(
  raw: unknown,
  kildeLabel: string,
  now: string,
): ScannerFunn | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;

  const title = pickString(
    a.title,
    a.jobtitle,
    a.headline,
    a.name,
  );
  if (!title) return null;

  let url = pickString(a.url, a.link, a.applicationUrl, a.sourceurl);
  const uuid = pickString(a.uuid, a.id);
  if (!url && uuid) {
    url = `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;
  }
  if (!url) return null;

  let company: string | undefined;
  const emp = a.employer;
  if (emp && typeof emp === "object") {
    company = pickString((emp as { name?: string }).name);
  }
  if (!company) {
    company = pickString(a.businessName, a.companyName, a.employerName);
  }

  const beskrivelse = pickString(
    a.description,
    a.lead,
    a.snippet,
    a.summary,
  )?.slice(0, 280);

  const dato = pickString(
    a.published,
    a.publishedDate,
    a.created,
    a.updated,
    a.publishedAt,
  );

  return {
    id: makeId(url, title),
    signalType: "Utlyst stilling",
    title,
    company,
    url,
    dato,
    beskrivelse,
    kilde: kildeLabel,
    funnetDato: now,
  };
}

const MUNICIPAL_CODES: Record<string, string> = {
  oslo: "0301",
  bergen: "4601",
  trondheim: "5001",
  stavanger: "1103",
  tromsø: "5401",
  kristiansand: "4204",
  drammen: "3005",
  fredrikstad: "3004",
  sandnes: "1108",
};

function municipalCode(geography: string): string | null {
  const g = geography.toLowerCase();
  for (const [city, code] of Object.entries(MUNICIPAL_CODES)) {
    if (g.includes(city)) return code;
  }
  return null;
}

async function fetchNavAdsApiJson(
  q: string,
  size: number,
  apiBase: string,
  geography?: string,
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  const url = new URL(apiBase);
  url.searchParams.set("size", String(size));
  url.searchParams.set("q", q);
  const mCode = geography ? municipalCode(geography) : null;
  if (mCode) url.searchParams.set("municipal", mCode);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("json")) {
    return { ok: false };
  }

  try {
    const data: unknown = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

type FeedFeedItem = {
  title?: string;
  url?: string;
  _feed_entry?: {
    uuid?: string;
    status?: string;
    title?: string;
    businessName?: string;
    municipal?: string;
  };
};

type FeedPage = {
  items?: FeedFeedItem[];
  next_url?: string | null;
};

async function fetchPublicFeedToken(): Promise<string | null> {
  const res = await fetch(`${FEED_BASE}/api/publicToken`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const text = await res.text();
  const m = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return m?.[0] ?? null;
}

function matchesTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const t = text.toLowerCase();
  return tokens.some((tok) => t.includes(tok));
}

function feedItemTilFunn(
  item: FeedFeedItem,
  kildeLabel: string,
  now: string,
): ScannerFunn | null {
  const fe = item._feed_entry;
  const uuid = fe?.uuid?.trim();
  if (!uuid) return null;
  const title = (fe?.title ?? item.title ?? "").trim();
  if (!title) return null;

  const url = `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;
  const company = fe?.businessName?.trim();

  const blob = `${title} ${company ?? ""} ${fe?.municipal ?? ""}`;
  const beskrivelse = blob.slice(0, 280);

  return {
    id: makeId(url, title),
    signalType: "Utlyst stilling",
    title,
    company,
    url,
    dato: undefined,
    beskrivelse,
    kilde: kildeLabel,
    funnetDato: now,
  };
}

/**
 * Henter stillinger fra NAV (Ledige stillinger).
 * 1) Prøver GET {NAV_JOBS_API_URL}/api/v2/ads?size=&q= (standard: arbeidsplassen.nav.no).
 * 2) Om det ikke gir JSON (f.eks. 404 fra Next), faller vi tilbake til pam-stilling-feed
 *    med offentlig eksperiment-token og filtrerer lokalt på søkeord.
 */
export async function fetchNavLedigeStillinger(
  p: ProfilScanInput,
  tokens: string[],
  options?: { size?: number },
): Promise<ScannerFunn[]> {
  const size = Math.min(Math.max(options?.size ?? 20, 1), 50);
  const now = new Date().toISOString();
  const apiBase =
    process.env.NAV_JOBS_API_URL?.trim() || DEFAULT_NAV_ADS_API;

  const variants = navSøkeordVarianter(p);
  const seenUrl = new Set<string>();
  const out: ScannerFunn[] = [];

  for (const qRaw of variants) {
    const parsed = await fetchNavAdsApiJson(qRaw, size, apiBase, p.geography);
    if (!parsed.ok) continue;

    const list = extractAdObjects(parsed.data);
    const label = `NAV Ledige stillinger (API · «${qRaw.slice(0, 48)}${qRaw.length > 48 ? "…" : ""}»)`;

    for (const raw of list) {
      const f = navAdTilFunn(raw, label, now);
      if (!f) continue;
      if (seenUrl.has(f.url)) continue;
      seenUrl.add(f.url);
      out.push(f);
      if (out.length >= size) return out;
    }
    if (out.length > 0) return out;
  }

  const token = await fetchPublicFeedToken();
  if (!token) return [];

  let feedPath = "/api/v1/feed";
  const maxPages = 28;
  const feedLabel =
    "NAV (stillingsfeed · filtrert på profil)";

  for (let page = 0; page < maxPages && out.length < size; page++) {
    const feedUrl = feedPath.startsWith("http")
      ? feedPath
      : `${FEED_BASE}${feedPath}`;

    const res = await fetch(feedUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) break;

    let data: FeedPage;
    try {
      data = (await res.json()) as FeedPage;
    } catch {
      break;
    }

    const items = data.items ?? [];
    for (const item of items) {
      const fe = item._feed_entry;
      if (!fe || fe.status !== "ACTIVE") continue;

      const title = (fe.title ?? item.title ?? "").trim();
      if (!title) continue;

      const blob = `${title} ${fe.businessName ?? ""} ${fe.municipal ?? ""}`;
      if (!matchesTokens(blob, tokens)) continue;

      const f = feedItemTilFunn(item, feedLabel, now);
      if (!f) continue;
      if (seenUrl.has(f.url)) continue;
      seenUrl.add(f.url);
      out.push(f);
      if (out.length >= size) return out;
    }

    const next = data.next_url;
    if (!next) break;
    feedPath = next;
  }

  return out;
}
