import { CONFIG, INTERNAL_API_TIMEOUT_MS, getBoundFetch, withTimeoutSignal } from "@/modules/core";
import { SearchResponse } from "./types/search-response";
import { isSearchResponse, parseJsonResponse } from "./parse-json-response";

export async function search(
  q: string,
  sort: string,
  hideLow: string,
  since?: string,
  scroll_id?: string,
  votes?: number,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const data: {
    q: string;
    sort: string;
    hide_low: string;
    since?: string;
    scroll_id?: string;
    votes?: number;
  } = { q, sort, hide_low: hideLow };

  if (since) {
    data.since = since;
  }
  if (scroll_id) {
    data.scroll_id = scroll_id;
  }
  if (votes) {
    data.votes = votes;
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/search-api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ecency-Client": CONFIG.clientId,
    },
    body: JSON.stringify(data),
    signal: withTimeoutSignal(INTERNAL_API_TIMEOUT_MS, signal),
  });

  return parseJsonResponse<SearchResponse>(response, isSearchResponse);
}

export async function similar(
  params: {
    author: string;
    permlink: string;
    title?: string;
    body?: string;
    tags?: string[];
    since?: string;
  },
  signal?: AbortSignal,
  timeoutMs: number = INTERNAL_API_TIMEOUT_MS
): Promise<SearchResponse> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/search-api/similar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ecency-Client": CONFIG.clientId,
    },
    body: JSON.stringify(params),
    signal: withTimeoutSignal(timeoutMs, signal),
  });

  return parseJsonResponse<SearchResponse>(response, isSearchResponse);
}

export async function searchPath(q: string, signal?: AbortSignal): Promise<string[]> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/search-api/search-path", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ecency-Client": CONFIG.clientId,
    },
    body: JSON.stringify({ q }),
    signal: withTimeoutSignal(INTERNAL_API_TIMEOUT_MS, signal),
  });

  const data = await parseJsonResponse<string[]>(response, Array.isArray);
  return data?.length > 0 ? data : [q];
}
