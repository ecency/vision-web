/**
 * UTF-8 byte length of a string.
 *
 * `TextEncoder` is missing on some runtimes the SDK ships to (React Native /
 * Hermes), and `String.length` is NOT a substitute: it counts UTF-16 code
 * units, so anything non-ASCII is undercounted. Where that number feeds an RC
 * estimate, undercounting means telling someone a post is affordable when the
 * chain will reject it.
 */
export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }

  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x80) {
      bytes += 1;
    } else if (c < 0x800) {
      bytes += 2;
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length) {
      // surrogate pair encodes as four bytes
      i++;
      bytes += 4;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Byte length of Hive's unsigned LEB128 varint for `value`. */
export function varintByteLength(value: number): number {
  let count = 0;
  let remaining = value;
  do {
    count++;
    remaining >>>= 7;
  } while (remaining > 0);
  return count;
}
