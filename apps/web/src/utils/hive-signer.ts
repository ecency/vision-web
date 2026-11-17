import hs from "hivesigner";

import { b64uEnc } from "./b64";
import { decodeToken } from "./hs-token";
import { getAccessToken } from "./user-token";
import { HiveSignerMessage } from "@/types";

export { decodeToken };

const HS_LOGIN_STATE_KEY = "hs_login_state";

/** A one-time value for this tab's login, which the /auth callback must bring back. */
function issueHsLoginState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    sessionStorage.setItem(HS_LOGIN_STATE_KEY, state);
  } catch {
    // No storage: the callback then refuses, and the user signs in again.
  }
  return state;
}

/** True when `state` is the value this tab issued, consuming it either way. */
export function consumeHsLoginState(state: string | null | undefined): boolean {
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(HS_LOGIN_STATE_KEY);
    sessionStorage.removeItem(HS_LOGIN_STATE_KEY);
  } catch {
    return false;
  }
  return !!expected && !!state && expected === state;
}

export function getAuthUrl(app: string, redir: string = `${window.location.origin}/auth`) {
  const scope =
    "vote,comment,delete_comment,comment_options,custom_json,claim_reward_balance,offline";

  return `https://hivesigner.com/oauth2/authorize?client_id=${app}&redirect_uri=${encodeURIComponent(
    redir
  )}&response_type=code&scope=${encodeURIComponent(scope)}&state=${issueHsLoginState()}`;
}

export function getTokenUrl(code: string, secret: string) {
  return `https://hivesigner.com/api/oauth2/token?code=${code}&client_secret=${secret}`;
}

export function getDecodedMemo(username: string, memo: string): Promise<any> {
  // With hivesigner access token
  let token = getAccessToken(username);
  return token
    ? new hs.Client({
        accessToken: token
      })
        .decode(memo)
        .then((r: any) => r)
    : Promise.resolve(0);
}

export function validateToken(code: string | null): boolean {
  if (!code) {
    return false;
  }

  const dt = decodeToken(code);
  const sevenDaysAgo: Date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  if (dt) {
    if (new Date(dt.timestamp * 1000) > sevenDaysAgo) {
      return true;
    }
  }
  return false;
}

export async function makeHsCode(
  hsClientId: string,
  account: string,
  signer: (message: string) => Promise<string>
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);

  const messageObj: HiveSignerMessage = {
    signed_message: { type: "code", app: hsClientId },
    authors: [account],
    timestamp
  };

  const message = JSON.stringify(messageObj);

  const signature = await signer(message);

  messageObj.signatures = [signature];
  return b64uEnc(JSON.stringify(messageObj));
}

export function buildHotSignUrl(
  endpoint: string,
  params: {
    [key: string]: string;
  },
  redirect: string
): any {
  const _params = {
    ...params,
    redirect_uri: `https://ecency.com/${redirect}`
  };

  const queryString = new URLSearchParams(_params).toString();
  return `https://hivesigner.com/sign/${endpoint}?${queryString}`;
}
