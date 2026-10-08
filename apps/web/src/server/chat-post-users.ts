interface PostWithUsers {
  user_id?: string;
  metadata?: { reactions?: Array<{ user_id?: string }> | null } | null;
}

/**
 * Every user a page of posts refers to: the authors plus everyone who reacted,
 * so clients can name reactors without a lookup per reaction.
 */
export function collectPostUserIds(posts: PostWithUsers[]): string[] {
  const ids = new Set<string>();
  for (const post of posts) {
    if (post.user_id) ids.add(post.user_id);
    for (const reaction of post.metadata?.reactions ?? []) {
      if (reaction?.user_id) ids.add(reaction.user_id);
    }
  }
  return Array.from(ids);
}
