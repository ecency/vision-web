/**
 * The slice of Redis the chat user lock uses (SET NX PX, compare-and-delete,
 * compare-and-PEXPIRE), with real expiry so lapsed locks behave as in Redis.
 */
export class FakeLockRedis {
  private entries = new Map<string, { value: string; expiresAt: number }>();
  failAll = false;
  /** Fail this many upcoming commands, as a slow or reconnecting client does. */
  failNext = 0;
  /** Apply the next SET but lose its reply, as a timed-out command can. */
  loseReplyNext = false;

  private maybeFail() {
    if (this.failAll) throw new Error("redis down");
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("Command timed out");
    }
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  put(key: string, value: string, ttlMs = 60_000) {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  get size() {
    return [...this.entries.keys()].filter((key) => this.get(key) !== undefined).length;
  }

  async set(key: string, value: string, _px: string, ttl: number, _nx: string) {
    this.maybeFail();
    if (this.get(key) !== undefined) return null;
    this.put(key, value, ttl);
    if (this.loseReplyNext) {
      this.loseReplyNext = false;
      throw new Error("Command timed out");
    }
    return "OK";
  }

  async eval(script: string, _keys: number, key: string, owner: string, ttl?: string) {
    this.maybeFail();
    if (this.get(key) !== owner) return 0;
    if (script.includes("PEXPIRE")) {
      this.put(key, owner, Number(ttl));
      return 1;
    }
    this.entries.delete(key);
    return 1;
  }
}
