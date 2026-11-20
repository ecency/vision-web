// The entity placeholder delimiter of the app render in progress
// (markdownToHTML picks one per body), for a.method's in-site path guard:
// only that delimiter marks a placeholder, never an author's look-alike
// character (#2165). Renders are synchronous; the previous value is put back
// when a render ends, so a nested one cannot leak its delimiter.
let active: string | null = null

export const activePlaceholderDelimiter = (): string | null => active

export function withPlaceholderDelimiter<T>(delimiter: string | null, render: () => T): T {
  const previous = active
  active = delimiter
  try {
    return render()
  } finally {
    active = previous
  }
}
