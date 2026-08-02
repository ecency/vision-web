import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getPostQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useIsAuthEnabled, useAuth } from "@/features/auth/hooks";
import { BlogSidebar } from "@/features/blog/layout/blog-sidebar";
import { useEffect, useMemo } from "react";
import { t } from "@/core";
import { EditPostEditor } from "@/features/publish/components/edit-post-editor";
import { canEditEntry } from "@/features/publish/utils/can-edit-entry";

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

  const queryOptions = getPostQueryOptions(cleanAuthor, permlink);
  const {
    data: entry,
    isLoading,
    error,
  } = useQuery({ ...queryOptions, enabled: canEdit });

  if (!isAuthEnabled || !canEdit) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-primary">
        <div className="container mx-auto container-padding-theme">
          <div className="text-center py-12 text-theme-muted">
            {t("loadingPost")}
          </div>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-theme-primary">
        <div className="container mx-auto container-padding-theme">
          <div className="text-center py-12 text-theme-muted">
            {t("postNotFound")}
          </div>
        </div>
      </div>
    );
  }

  return <EditPageContent entry={entry} />;
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
