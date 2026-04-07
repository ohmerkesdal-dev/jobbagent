import { NextResponse } from "next/server";
import { isWebScanEnabled } from "@/lib/scanner-web-config";

/** Brukes av /scanner for å vise banner uten å kjøre full skanning. */
export async function GET() {
  return NextResponse.json({
    webScanningDisabled: !isWebScanEnabled(),
  });
}
