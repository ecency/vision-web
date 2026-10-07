/**
 * Whether `pathname` is the page `section` or a page under it. Never a substring
 * test: a post at /@ecency/raidstead-... is not in /raidstead, and /@alicebob is
 * not alice's profile.
 */
export function isPathInSection(pathname: string | null | undefined, section: string): boolean {
  return !!pathname && (pathname === section || pathname.startsWith(`${section}/`));
}

/** The editor pages, where the floating Ecency Center would cover the composer. */
export function isEditorPath(pathname: string | null | undefined): boolean {
  return (
    !!pathname &&
    (["/submit", "/publish", "/draft"].some((s) => isPathInSection(pathname, s)) ||
      pathname.endsWith("/edit"))
  );
}
