import { CONFIG, getBoundFetch } from "@/modules/core";
import { ApiNotification, ApiNotificationSetting } from "@/modules/notifications";
import { Draft, DraftMetadata } from "@/modules/posts/types/draft";
import { Schedule } from "@/modules/posts/types/schedule";
import {
  ApiResponse,
  RecoveryErrorBody,
  RecoveryProveResponse,
  RecoveryRequestStatus,
  RecoveryStartResponse,
  RecoveryStatusResponse,
} from "./types";

type RequestError = Error & { status?: number; data?: unknown };

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: unknown = undefined;
    try {
      errorData = await response.json();
    } catch {
      errorData = undefined;
    }
    const error = new Error(`Request failed with status ${response.status}`) as RequestError;
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  // Handle empty responses gracefully (e.g., 204 No Content or empty body)
  const text = await response.text();
  if (!text || text.trim() === "") {
    return "" as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // If JSON parsing fails, return empty string as fallback
    console.warn("[SDK] Failed to parse JSON response:", e, "Response:", text);
    return "" as T;
  }
}

export async function signUp(
  username: string,
  email: string,
  referral: string,
  captchaToken?: string
): Promise<ApiResponse<Record<string, unknown>>> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/account-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, email, referral, captcha_token: captchaToken }),
  });

  const data = await parseJsonResponse<Record<string, unknown>>(response);
  return { status: response.status, data };
}

export async function subscribeEmail(
  email: string
): Promise<ApiResponse<Record<string, unknown>>> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const data = await parseJsonResponse<Record<string, unknown>>(response);
  return { status: response.status, data };
}

export async function usrActivity(
  code: string | undefined,
  ty: number,
  bl: string | number = "",
  tx: string | number = ""
): Promise<void> {
  const params: {
    code: string | undefined;
    ty: number;
    bl?: string | number;
    tx?: string | number;
  } = { code, ty };

  if (bl) {
    params.bl = bl;
  }
  if (tx) {
    params.tx = tx;
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/usr-activity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  await parseJsonResponse(response);
}

export async function getNotifications(
  code: string | undefined,
  filter: string | null,
  since: string | null = null,
  user: string | null = null
): Promise<ApiNotification[]> {
  const data: { code: string | undefined; filter?: string; since?: string; user?: string } = {
    code,
  };

  if (filter) {
    data.filter = filter;
  }

  if (since) {
    data.since = since;
  }

  if (user) {
    data.user = user;
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<ApiNotification[]>(response);
}

export async function saveNotificationSetting(
  code: string | undefined,
  username: string,
  system: string,
  allows_notify: number,
  notify_types: number[],
  token: string
): Promise<ApiNotificationSetting> {
  const data = {
    code,
    username,
    token,
    system,
    allows_notify,
    notify_types,
  };

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/register-device", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<ApiNotificationSetting>(response);
}

export async function getNotificationSetting(
  code: string | undefined,
  username: string,
  token: string
): Promise<ApiNotificationSetting> {
  const data = { code, username, token };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/detail-device", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<ApiNotificationSetting>(response);
}

export async function markNotifications(
  code: string | undefined,
  id?: string
): Promise<Record<string, unknown>> {
  const data: { code: string | undefined; id?: string } = {
    code,
  };
  if (id) {
    data.id = id;
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/notifications/mark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

export async function addImage(code: string | undefined, url: string): Promise<Record<string, unknown>> {
  const data = { code, url };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/images-add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

// Upload always targets the canonical Ecency image server, even when
// the user has changed their viewing proxy (e.g. images.hive.blog).
// i.ecency.com is the same imagehoster endpoint as images.ecency.com
// (identical backend / token validation); it is the canonical host
// because some ISPs SNI-filter the images.ecency.com hostname.
const UPLOAD_HOST = "https://i.ecency.com";

export async function uploadImage(
  file: File,
  token: string,
  signal?: AbortSignal
): Promise<{ url: string }> {
  const fetchApi = getBoundFetch();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchApi(`${UPLOAD_HOST}/hs/${token}`, {
    method: "POST",
    body: formData,
    signal,
  });

  return parseJsonResponse<{ url: string }>(response);
}

/**
 * Upload image using posting key signature (/:username/:signature path).
 * Works with any compatible image server (images.ecency.com, images.hive.blog).
 * The signature is sha256("ImageSigningChallenge" + fileData) signed with the posting key.
 */
export async function uploadImageWithSignature(
  file: File,
  username: string,
  signature: string,
  signal?: AbortSignal
): Promise<{ url: string }> {
  const fetchApi = getBoundFetch();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchApi(`${CONFIG.imageHost}/${username}/${signature}`, {
    method: "POST",
    body: formData,
    signal,
  });

  return parseJsonResponse<{ url: string }>(response);
}

export async function deleteImage(
  code: string | undefined,
  imageId: string
): Promise<Record<string, unknown>> {
  const data = { code, id: imageId };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/images-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

export async function addDraft(
  code: string | undefined,
  title: string,
  body: string,
  tags: string,
  meta: DraftMetadata
): Promise<{ drafts: Draft[] }> {
  const data = { code, title, body, tags, meta };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/drafts-add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<{ drafts: Draft[] }>(response);
}

export async function updateDraft(
  code: string | undefined,
  draftId: string,
  title: string,
  body: string,
  tags: string,
  meta: DraftMetadata
): Promise<{ drafts: Draft[] }> {
  const data = { code, id: draftId, title, body, tags, meta };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/drafts-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<{ drafts: Draft[] }>(response);
}

export async function deleteDraft(
  code: string | undefined,
  draftId: string
): Promise<Record<string, unknown>> {
  const data = { code, id: draftId };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/drafts-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

export async function addSchedule(
  code: string | undefined,
  permlink: string,
  title: string,
  body: string,
  meta: Record<string, unknown>,
  options: Record<string, unknown> | null,
  schedule: string,
  reblog: boolean
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    code,
    permlink,
    title,
    body,
    meta,
    schedule,
    reblog,
  };

  if (options) {
    data.options = options;
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/schedules-add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

export async function deleteSchedule(
  code: string | undefined,
  id: string
): Promise<Record<string, unknown>> {
  const data = { code, id };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/schedules-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

export async function moveSchedule(code: string | undefined, id: string): Promise<Schedule[]> {
  const data = { code, id };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/schedules-move", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<Schedule[]>(response);
}

export async function getPromotedPost(
  code: string | undefined,
  author: string,
  permlink: string
): Promise<{ author: string; permlink: string } | ""> {
  const data = { code, author, permlink };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/promoted-post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return parseJsonResponse<{ author: string; permlink: string } | "">(response);
}

export async function onboardEmail(
  username: string,
  email: string,
  friend: string
): Promise<Record<string, unknown>> {
  const dataBody = {
    username,
    email,
    friend,
  };
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    CONFIG.privateApiHost + "/private-api/account-create-friend",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataBody),
    }
  );

  return parseJsonResponse<Record<string, unknown>>(response);
}

// ── Self-serve account recovery ────────────────────────────────────────────
// These calls answer with an `error` code on failure, which the page shows to
// the user, so they resolve with { status, data } instead of throwing on a
// non-2xx status. Only public data is sent: never a password or private key.

async function recoveryRequest<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T & RecoveryErrorBody>> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    CONFIG.privateApiHost + "/private-api/recovery/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { method: "GET" }
  );

  let data = {} as T & RecoveryErrorBody;
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") {
      data = parsed;
    }
  } catch {
    // Empty or non-JSON body (e.g. a gateway error page): keep the status only.
  }
  return { status: response.status, data };
}

export function recoveryStart(username: string, captchaToken: string) {
  return recoveryRequest<RecoveryStartResponse>("start", {
    username,
    captcha_token: captchaToken,
  });
}

export function recoveryProve(input: {
  requestId: string;
  username: string;
  newOwnerPub: string;
  provenKeyPub: string;
  signature: string;
}) {
  return recoveryRequest<RecoveryProveResponse>("prove", {
    request_id: input.requestId,
    username: input.username,
    new_owner_pub: input.newOwnerPub,
    proven_key_pub: input.provenKeyPub,
    signature: input.signature,
  });
}

export function recoveryVerifyCode(requestId: string, code: string) {
  return recoveryRequest<{ status?: RecoveryRequestStatus }>("verify-code", {
    request_id: requestId,
    code,
  });
}

export function recoveryStatus(requestId: string) {
  return recoveryRequest<RecoveryStatusResponse>(
    "status?request_id=" + encodeURIComponent(requestId)
  );
}

export function recoveryComplete(requestId: string) {
  return recoveryRequest<{ status?: RecoveryRequestStatus }>("complete", {
    request_id: requestId,
  });
}
