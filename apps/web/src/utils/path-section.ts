/**
 * Whether `pathname` is the page `section` or a page under it. Never a substring
 * test: a post at /@ecency/raidstead-... is not in /raidstead, and /@alicebob is
 * not alice's profile.
 */
export function isPathInSection(pathname: string | null | undefined, section: string): boolean {
  return !!pathname && (pathname === section || pathname.startsWith(`${section}/`));
}
