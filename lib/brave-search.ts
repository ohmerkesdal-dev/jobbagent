/**
 * Brave Search API — samme felter som tidligere nett-søk: title, link, snippet.
 * @see https://api.search.brave.com/res/v1/web/search
 */

const BRAVE_WEB = "https://api.search.brave.com/res/v1/web/search";

export type WebSearchItem = {
  title?: string;
  link?: string;
  snippet?: string;
};

export type WebSearchResponse =
  | { ok: true; items: WebSearchItem[] }
  | { ok: false; status: number; detail: string };

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
};

type BraveWebSearchJson = {
  web?: { results?: BraveWebResult[] };
};

/**
 * Filtrer mot norsk / relevant innhold (domene, språk, kjente kilder).
 */
export function filterNorwegianRelevant(items: WebSearchItem[]): WebSearchItem[] {
  const signals = [
    /\.no(\/|$)/i,
    /norge|norsk|norway|norwegian|oslo|bergen|trondheim|stavanger|tromsø/i,
    /linkedin\.com/i,
    /nav\.no|finn\.no|nrk\.no|vg\.no|aftenposten|dn\.no|e24\.|tu\.no|dinside|finansavisen/i,
    /[æøåÆØÅ]/,
  ];
  const noise = /\.(ru|cn|tk|ml)(\/|$)/i;

  return items.filter((it) => {
    const url = it.link ?? "";
    const title = it.title ?? "";
    const snippet = it.snippet ?? "";
    const blob = `${url} ${title} ${snippet}`;
    if (noise.test(url) && !/norge|norsk|\.no/i.test(blob)) return false;
    return signals.some((re) => re.test(blob));
  });
}

function mapBraveResults(raw: BraveWebResult[]): WebSearchItem[] {
  const out: WebSearchItem[] = [];
  for (const r of raw) {
    const title = r.title?.trim();
    const link = r.url?.trim();
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    out.push({
      title,
      link,
      snippet: r.description?.trim() || undefined,
    });
  }
  return out;
}

export async function fetchBraveWebSearch(
  q: string,
  options?: { maxResults?: number; apiKey?: string },
): Promise<WebSearchResponse> {
  const key = (options?.apiKey ?? process.env.BRAVE_SEARCH_API_KEY)?.trim();
  if (!key) {
    return { ok: false, status: 0, detail: "BRAVE_SEARCH_API_KEY mangler." };
  }

  const count = Math.min(Math.max(options?.maxResults ?? 10, 1), 20);
  const params = new URLSearchParams({
    q: q.trim(),
    count: String(count),
    country: "NO",
    lang: "no",
  });

  let res: Response;
  try {
    res = await fetch(`${BRAVE_WEB}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: e instanceof Error ? e.message : "Nettverksfeil mot Brave Search.",
    };
  }

  const text = await res.text();
  let data: BraveWebSearchJson;
  try {
    data = JSON.parse(text) as BraveWebSearchJson;
  } catch {
    return {
      ok: false,
      status: res.status,
      detail: res.ok
        ? "Uventet svar fra Brave Search (ikke JSON)."
        : `Brave Search feilet (${res.status}).`,
    };
  }

  if (!res.ok) {
    const msg =
      typeof (data as { message?: string }).message === "string"
        ? (data as { message: string }).message
        : text.slice(0, 200);
    return {
      ok: false,
      status: res.status,
      detail: `Brave Search feilet (${res.status}): ${msg}`,
    };
  }

  const raw = data.web?.results ?? [];
  const mapped = mapBraveResults(raw);
  const filtered = filterNorwegianRelevant(mapped);
  const badTld = /\.(ru|cn|tk|ml)(\/|$)/i;
  let items = filtered.slice(0, count);
  if (items.length === 0 && mapped.length > 0) {
    items = mapped.filter((it) => !badTld.test(it.link ?? "")).slice(0, count);
  }

  return { ok: true, items };
}

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
