import { useAuth } from "@/features/auth/hooks";
import { useNavigate } from "@tanstack/react-router";
import { useComment } from "@ecency/sdk";
import { useMutation } from "@tanstack/react-query";
import { createBroadcastAdapter } from "@/providers/sdk";

export function useUpdatePost() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const adapter = createBroadcastAdapter();
  const commentMutation = useComment(user?.username, { adapter });

  return useMutation({
    mutationKey: ["update-post"],
    mutationFn: async ({
      permlink,
      parentPermlink,
      title,
      body,
      tags,
      jsonMetadata,
      preserveOriginalFormat,
    }: {
      permlink: string;
      parentPermlink: string;
      title: string;
      body: string;
      tags: string[];
      jsonMetadata?: Record<string, unknown>;
      /**
       * Only true when the body was edited as raw markdown and therefore still
       * carries whatever format it was published with. The rich text editor
       * always re-serialises the body to markdown, so keeping an inherited
       * "html" format would advertise the post as something it no longer is.
       */
      preserveOriginalFormat?: boolean;
    }) => {
      if (!user) {
        throw new Error("Authentication required to update post");
      }

      if (!title.trim()) {
        throw new Error("Title cannot be empty");
      }

      if (!body.trim()) {
        throw new Error("Post content cannot be empty");
      }

      const normalizedTags = [...new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0)
      )];

      if (!normalizedTags.length) {
        throw new Error("At least one tag is required");
      }

      return commentMutation.mutateAsync({
        author: user.username,
        permlink,
        parentAuthor: "",
        parentPermlink,
        title: title.trim(),
        body: body.trim(),
        // Carry the post's existing metadata forward. Rebuilding it from scratch
        // would drop image/thumbnail, description, users, links and any app
        // specific block (3Speak's video object, for example) that was written
        // by whichever client originally published the post.
        jsonMetadata: {
          ...jsonMetadata,
          tags: normalizedTags,
          app: "ecency-selfhost/1.0",
          format:
            preserveOriginalFormat && typeof jsonMetadata?.format === "string"
              ? jsonMetadata.format
              : "markdown",
        },
      });
    },
    onSuccess: (_data, variables) => {
      if (!user?.username) return;

      navigate({
        to: "/$author/$permlink",
        params: { author: `@${user.username}`, permlink: variables.permlink },
        search: { raw: undefined },
      });
    },
  });
}
