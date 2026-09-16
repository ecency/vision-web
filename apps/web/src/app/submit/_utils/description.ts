import { isGeneratedDescription } from "@/app/publish/_utils/content";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";

/**
 * The description to show while a saved post is edited. The classic editor holds whatever it
 * loads until the author changes it, so a stored value that is the body's own summary would
 * be published unchanged however far the body is rewritten. Handing back an empty field for
 * that case lets the publish path summarise the body actually being saved, which is what the
 * composer does. A description the author wrote is returned as it is.
 */
export function descriptionToEdit(stored: string | null | undefined, body: string): string {
  const description = stored ?? "";

  return isGeneratedDescription(description, body, SUBMIT_DESCRIPTION_MAX_LENGTH)
    ? ""
    : description;
}
