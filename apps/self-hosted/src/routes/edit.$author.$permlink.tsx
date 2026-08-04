import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getPostQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useIsAuthEnabled, useAuth } from "@/features/auth/hooks";
import { BlogSidebar } from "@/features/blog/layout/blog-sidebar";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { t } from "@/core";
import { ErrorMessage } from "@/features/shared/error-message";
import { InlineError } from "@/features/shared/inline-error";
import {
  nothingToShow,
  resolveQueryOutcome,
} from "@/features/shared/query-outcome";
import { EditPostEditor } from "@/features/publish/components/edit-post-editor";
import { canEditEntry } from "@/features/publish/utils/can-edit-entry";
import { isReadConfirmed } from "@/features/publish/utils/read-confirmed";

export const Route = createFileRoute("/edit/$author/$permlink")({
  component: RouteComponent,
});

function RouteComponent() {
  const isAuthEnabled = useIsAuthEnabled();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { author, permlink } = Route.useParams();

  const cleanAuthor = author.replace("@", "");
  // Authorship, not instance ownership: on a community instance every member
  // can publish, and requiring ownership here locked them out of their own
  // posts. Broadcasting the edit still requires the author's own key.
  const canEdit = canEditEntry(user?.username, cleanAuthor);

  useEffect(() => {
    if (!isAuthEnabled || !canEdit) {
      navigate({ to: "/blog", search: { filter: "posts" } });
    }
  }, [isAuthEnabled, canEdit, navigate]);

  /** Set once the post has been read successfully, and never cleared. */
  const readConfirmed = useRef(false);

  const queryOptions = getPostQueryOptions(cleanAuthor, permlink);
  const {
    data: entry,
    isEnabled,
    isError,
    isFetchedAfterMount,
    isSuccess,
    refetch,
  } = useQuery({
    ...queryOptions,
    enabled: canEdit,
    // The reading surfaces leave this at its default and serve from cache,
    // which is what they should do. This one cannot. The global staleTime is a
    // minute, so a reader who opens a post and clicks Edit inside that minute
    // would otherwise reach the editor with no request having been made at all,
    // and `isFetchedAfterMount` would stay false forever. Verified against the
    // installed query-core: 'always' is checked before the staleness test, so
    // it issues the fetch regardless of staleTime.
    refetchOnMount: 'always',
  });

  // Was: `if (error || !entry)` renders "Post not found." One failed bridge
  // call told an author their own post did not exist, on the screen they had
  // opened to edit it.
  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: !!entry,
  });

  // Latched during render rather than in an effect, so the editor appears on
  // the same frame the read succeeds instead of flashing a notice first.
  readConfirmed.current = isReadConfirmed(
    { outcome, fetchedAfterMount: isFetchedAfterMount },
    readConfirmed.current,
  );

  if (!isAuthEnabled || !canEdit) {
    return null;
  }

  // Presence of an entry is not enough here, unlike every reading surface, and
  // neither is a successful outcome: an entry served straight from cache reads
  // as a success without a request having been made. An update broadcast
  // carries no version check, so editing either of those could overwrite the
  // author's own newer work with no sign that anything had gone wrong.
  if (entry && readConfirmed.current) {
    return <EditPageContent entry={entry} />;
  }

  if (outcome === "stale") {
    return (
      <EditShell>
        <div className="py-12">
          <InlineError
            message={t("edit_read_failed")}
            onRetry={() => refetch()}
          />
        </div>
      </EditShell>
    );
  }

  if (outcome === "failed") {
    return (
      <EditShell>
        <ErrorMessage onRetry={() => refetch()} />
      </EditShell>
    );
  }

  if (nothingToShow(outcome)) {
    return (
      <EditShell>
        <div className="text-center py-12 text-theme-muted">
          {t("postNotFound")}
        </div>
      </EditShell>
    );
  }

  return (
    <EditShell>
      <div className="text-center py-12 text-theme-muted">
        {t("loadingPost")}
      </div>
    </EditShell>
  );
}

function EditShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="container mx-auto container-padding-theme">
        {children}
      </div>
    </div>
  );
}

/**
 * json_metadata normally arrives parsed, but some nodes hand it back as the raw
 * JSON string. Both shapes have to resolve to an object here: whatever is not
 * carried through ends up erased from the post on the next update.
 */
function parseJsonMetadata(value: unknown): Record<string, unknown> | undefined {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function EditPageContent({ entry }: { entry: any }) {
  const jsonMetadata = useMemo(
    () => parseJsonMetadata(entry.json_metadata),
    [entry]
  );

  const initialTags = useMemo(() => {
    const tags = jsonMetadata?.tags;
    return Array.isArray(tags) ? tags : [];
  }, [jsonMetadata]);

  const parentPermlink = useMemo(() => {
    return entry.parent_permlink || (initialTags[0] ?? "").toLowerCase();
  }, [entry, initialTags]);

  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="container mx-auto container-padding-theme">
        <div className="blog-layout-grid flex flex-col lg:grid layout-gap-theme">
          <main className="blog-main-container order-2 lg:order-1 items-start mt-4 sm:mt-8 section-gap-theme">
            <EditPostEditor
              permlink={entry.permlink}
              parentPermlink={parentPermlink}
              initialTitle={entry.title}
              initialBody={entry.body}
              initialTags={initialTags}
              initialJsonMetadata={jsonMetadata}
            />
          </main>
          <div className="blog-sidebar-container order-1 lg:order-2">
            <BlogSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
