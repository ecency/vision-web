/**
 * Browser-safe stand-in for Node's `assert`.
 *
 * `hive-auth-wrapper` imports `assert` and uses it for argument validation. The
 * bundler resolved that to the npm `assert` polyfill, which is a faithful port
 * of Node's implementation and reads `process.emitWarning` and `process.stderr`
 * at module scope. Rspack does not provide a `process` global, so loading the
 * chunk threw `ReferenceError: process is not defined` before any of the app ran
 * and every hosted blog rendered blank.
 *
 * This is aliased in place of that polyfill. It keeps the one behaviour the
 * wrapper relies on, throwing when the condition is falsy, and drops the rest of
 * the port along with its Node globals.
 *
 * See also the note in CLAUDE.md: package code that reaches this SPA must not
 * rely on Node globals, because Next.js shims them and Rsbuild does not. A
 * `Buffer.from()` in render-helper shipped the same class of failure before.
 */

class AssertionError extends Error {
  constructor(message?: string) {
    super(message ?? 'Assertion failed');
    this.name = 'AssertionError';
  }
}

function ok(value: unknown, message?: string): asserts value {
  if (!value) {
    throw new AssertionError(message);
  }
}

function equal(actual: unknown, expected: unknown, message?: string): void {
  // Node's assert.equal is ==, deliberately, not ===.
  if (actual != expected) {
    throw new AssertionError(message ?? `${String(actual)} != ${String(expected)}`);
  }
}

function notEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual == expected) {
    throw new AssertionError(message ?? `${String(actual)} == ${String(expected)}`);
  }
}

function strictEqual(actual: unknown, expected: unknown, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      message ?? `${String(actual)} !== ${String(expected)}`,
    );
  }
}

function fail(message?: string): never {
  throw new AssertionError(message);
}

/** Callable, matching `assert(value, message)`, with the common members attached. */
const assert = Object.assign(ok, {
  ok,
  equal,
  notEqual,
  strictEqual,
  fail,
  AssertionError,
});

export { AssertionError, equal, fail, notEqual, ok, strictEqual };
export default assert;
