import baseDefaults from "@/defaults.json";

// Google Preferred Sources (#1495) takes a root domain or subdomain, never a
// path, so the picker can only add the whole site. The canonical host comes
// from the app's default base: any other host running this codebase (a mirror,
// a staging host, a private network address) gets no link, so it never
// promotes a domain it is not serving.
const PREFERRED_SOURCE_HOST = new URL(baseDefaults.base).hostname;

const hostnameOf = (base: string): string | null => {
  try {
    return new URL(base).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function getGooglePreferredSourceUrl(base?: string | null): string | null {
  if (!base || hostnameOf(base) !== PREFERRED_SOURCE_HOST) {
    return null;
  }
  return `https://google.com/preferences/source?q=${PREFERRED_SOURCE_HOST}`;
}
