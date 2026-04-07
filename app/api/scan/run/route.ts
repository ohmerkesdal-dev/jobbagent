import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { ProfilScanInput, ScannerFunn } from "@/lib/scanner-types";
import {
  fetchBraveWebSearch,
  sleepMs,
  type WebSearchItem,
} from "@/lib/brave-search";
import { isWebScanEnabled } from "@/lib/scanner-web-config";
import { byggProfilSøk, byggSelskapSøk } from "@/lib/scanner-queries";
import { fetchNavLedigeStillinger } from "@/lib/nav-ledige-stillinger";

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

function tokenizeForFilter(p: ProfilScanInput): string[] {
  const raw = `${p.industry} ${p.seeking}`.toLowerCase();
  return raw
    .split(/[\s,./]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function webItemTilFunn(
  item: WebSearchItem,
  kildeLabel: string,
): ScannerFunn | null {
  const title = item.title?.trim();
  const url = item.link?.trim();
  if (!title || !url) return null;
  const lower = url.toLowerCase();
  const signalType: ScannerFunn["signalType"] = lower.includes("linkedin.com")
    ? "LinkedIn"
    : lower.includes("finn.no")
      ? "Utlyst stilling"
      : "Nyhet";
  return {
    id: makeId(url, title),
    signalType,
    title,
    url,
    beskrivelse: item.snippet,
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
    Array.isArray(selskaperRaw) && selskaperRaw.every((x) => typeof x === "string")
      ? (selskaperRaw as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 10)
      : [];

  const p: ProfilScanInput = {
    name: typeof profile.name === "string" ? profile.name : "",
    seeking: profile.seeking,
    industry: profile.industry,
    geography: typeof profile.geography === "string" ? profile.geography : "",
    bio: typeof profile.bio === "string" ? profile.bio : "",
  };

  const tokens = tokenizeForFilter(p);
  const warnings: string[] = [];

  const funn: ScannerFunn[] = [];

  try {
    const navItems = await fetchNavLedigeStillinger(p, tokens, { size: 20 });
    funn.push(...navItems);
    if (navItems.length === 0) {
      warnings.push(
        "NAV: Ingen treff som matcher profilen akkurat nå. Prøv å korte ned «Hva du søker» til ett hovedord (f.eks. produktleder) og kjør skanning igjen.",
      );
    }
  } catch (e) {
    warnings.push(
      `NAV stillinger: ${e instanceof Error ? e.message : "ukjent feil"}`,
    );
  }

  const webEnabled = isWebScanEnabled();

  if (webEnabled) {
    const profilQueries = byggProfilSøk(p);
    for (let i = 0; i < profilQueries.length; i++) {
      const q = profilQueries[i];
      if (i > 0) await sleepMs(BRAVE_DELAY_MS);
      const result = await fetchBraveWebSearch(q, { maxResults: 10 });
      if (!result.ok) {
        warnings.push(
          `Brave Search «${q.slice(0, 52)}${q.length > 52 ? "…" : ""}»: ${result.detail}`,
        );
        continue;
      }
      for (const it of result.items) {
        const f = webItemTilFunn(it, "Brave Search (nyheter / nett)");
        if (f) funn.push(f);
      }
    }

    for (let i = 0; i < selskaper.length; i++) {
      const navn = selskaper[i];
      const q = byggSelskapSøk(navn);
      await sleepMs(BRAVE_DELAY_MS);
      const result = await fetchBraveWebSearch(q, { maxResults: 8 });
      if (!result.ok) {
        warnings.push(`Selskap «${navn}»: ${result.detail}`);
        continue;
      }
      for (const it of result.items) {
        const f = webItemTilFunn(it, `Brave Search (selskap: ${navn})`);
        if (f) {
          f.signalType = "Selskap";
          f.company = navn;
          funn.push(f);
        }
      }
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
