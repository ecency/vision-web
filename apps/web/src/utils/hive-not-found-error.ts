// A Hive node's answer that the thing asked for does not exist. These come back
// as JSON-RPC errors ("Assert Exception:..."), but they are real answers, not an
// upstream failure: a missing post, account, tag or community. Observed shapes:
//   Assert Exception:Post a/b does not exist          (bridge.get_post, get_discussion, get_content)
//   Assert Exception:Account a does not exist         (bridge.get_account_posts)
//   Assert Exception:[{"a": "account does not exist"}] (bridge.get_profile)
//   Assert Exception:Tag t does not exist             (bridge.get_ranked_posts)
//   Assert Exception:invalid tag `Foo`                (a tag that breaks the format rules)
//   Assert Exception:given community name is not valid (bridge.get_community)
const NOT_FOUND_ASSERTS = [
  /Assert Exception:.*\b(Post|Account|Category|Tag)\b.*does not exist/i,
  /Assert Exception:\s*invalid (tag|category)/i,
  /Assert Exception:\s*given community name is not valid/i
];

export function isHiveNotFoundError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const msg = String((e as { message?: unknown }).message ?? "");
  return NOT_FOUND_ASSERTS.some((pattern) => pattern.test(msg));
}
