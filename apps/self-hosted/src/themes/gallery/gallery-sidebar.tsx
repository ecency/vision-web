/**
 * Gallery renders no sidebar: the grid is the page, and a rail beside it
 * would take the width the pictures want.
 *
 * This is a seam override rather than a CSS hide on purpose. The default
 * sidebar fetches followers, following and chain information; hiding it in
 * CSS would still run all of that for a column nobody sees. Returning null
 * here means the queries are never made. gallery.css collapses the grid
 * column the shell reserves.
 */
export function GallerySidebar() {
  return null;
}
