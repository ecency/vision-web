/**
 * The newsletter contract types live in @ecency/sdk (modules/newsletter),
 * shared with the mobile app; this file re-exports them under the names the
 * web app has always used. The subscribe `source` union stays in lockstep
 * with SOURCES in app/api/newsletter/subscribe/route.ts by hand: a value in
 * the union that the route does not accept is a silent 400 with a generic
 * message.
 */
export type {
  DigestCadence,
  DigestStatus,
  DigestSubscribeSource,
  DigestSubscription,
  DigestType,
} from "@ecency/sdk";
export type {
  DigestSubscribeInput as SubscribeInput,
  DigestSubscribeResult as SubscribeResult,
} from "@ecency/sdk";
