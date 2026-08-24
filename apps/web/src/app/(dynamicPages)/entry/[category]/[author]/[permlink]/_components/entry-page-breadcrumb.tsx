import { IntentLink } from "@/features/shared/intent-link";

export interface BreadcrumbItem {
  name: string;
  /** Relative path for the visible link, e.g. "/", "/trending/foo". */
  path: string;
}

interface Props {
  items: BreadcrumbItem[];
}

/**
 * Visible, server-rendered breadcrumb trail. Driven by the same items array
 * that builds the BreadcrumbList JSON-LD (in page.tsx) so the two never drift.
 * Every crumb except the last is a crawlable `<a href>`; the last item is the
 * current page, rendered as plain text.
 */
export function EntryPageBreadcrumb({ items }: Props) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="entry-breadcrumb text-sm opacity-75 mb-2 px-2 md:px-0">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.path}-${i}`} className="flex items-center gap-1 min-w-0">
              {isLast ? (
                <span aria-current="page" className="truncate max-w-[18rem]">
                  {item.name}
                </span>
              ) : (
                <>
                  <IntentLink href={item.path} className="hover:underline whitespace-nowrap">
                    {item.name}
                  </IntentLink>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
