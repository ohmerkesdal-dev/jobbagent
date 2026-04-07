/**
 * Brave Search krever BRAVE_SEARCH_API_KEY og kan skrus av med
 * JOBBAGENT_WEB_SCAN_ENABLED=false.
 */
export function isWebScanEnabled(): boolean {
  if (process.env.JOBBAGENT_WEB_SCAN_ENABLED === "false") return false;
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
}
