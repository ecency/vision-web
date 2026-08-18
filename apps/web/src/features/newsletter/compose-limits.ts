/**
 * The bounds of a composed digest (news#21), shared by the composer and the
 * relay's request parser so the two cannot drift. Plain constants: this module
 * is imported on both sides and must stay free of client or server imports.
 *
 * COMPOSE_MIN is the composer's floor: a one-post composition is what the
 * service (and the relay) accept as the single-post issue, so the parser
 * bounds posts at 1..COMPOSE_MAX and only the picker asks for two.
 */
export const COMPOSE_MIN = 2;
export const COMPOSE_MAX = 10;
export const SUBJECT_MAX = 120;
export const INTRO_MAX = 500;
