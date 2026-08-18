/**
 * The toolbar's action bus. Editors broadcast an action name on `window` and
 * the toolbar whose editor holds focus applies it (see `EditorToolbar`).
 *
 * Kept apart from the toolbar component so shortcut handling can be imported,
 * and tested, without dragging the whole toolbar along.
 */
export const detectEvent = (eventType: string) => {
  const ev = new Event(eventType);
  window.dispatchEvent(ev);
};

export const toolbarEventListener = (event: Event, eventType: string) => {
  const ev = new CustomEvent("customToolbarEvent", { detail: { event, eventType } });
  window.dispatchEvent(ev);
};
