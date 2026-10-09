import { type ReactNode, useCallback, useMemo } from "react";
import type { MattermostPost, MattermostUser } from "../mattermost-api";
import {
  getPostDisplayName,
  getPostUsername,
  getAddedUserDisplayName,
  getDisplayMessage
} from "../format-utils";
import { decodeMessageEmojis } from "../emoji-utils";
import { proxifyImageSrc } from "@ecency/render-helper";
import { MentionToken } from "../components/mention-token";
import { ChatImage } from "../components/chat-image";
import { HivePostLinkRenderer } from "@/features/post-renderer";
import { USER_MENTION_PURE_REGEX } from "@/features/tiptap-editor/extensions/user-mention-extension-config";
import DOMPurify from "dompurify";
import htmlParse, { domToReact, type HTMLReactParserOptions } from "html-react-parser";
import type { Text } from "domhandler";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

const ECENCY_HOSTNAMES = new Set([
  "ecency.com",
  "www.ecency.com",
  "peakd.com",
  "www.peakd.com",
  "hive.blog",
  "www.hive.blog",
  "leofinance.io",
  "www.leofinance.io",
  "inleo.io",
  "www.inleo.io",
  "snapie.io",
  "www.snapie.io",
  "hivesuite.app",
  "www.hivesuite.app"
]);

function isAbsoluteHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isImageUrl(url: string) {
  const normalizedUrl = url.toLowerCase().trim();
  return (
    /^https?:\/\/images\.ecency\.com\//.test(normalizedUrl) ||
    /\.(png|jpe?g|gif|webp|svg)(\?[^#]*)?(\#.*)?$/i.test(normalizedUrl) ||
    /tenor\.com\/.*\.gif/.test(normalizedUrl) ||
    /^https?:\/\/(?:media\d*\.)?giphy\.com\//.test(normalizedUrl)
  );
}

export function getSafeChatImageUrl(url: string, width = 1024) {
  const normalizedUrl = url.trim();

  if (!isAbsoluteHttpUrl(normalizedUrl)) {
    return null;
  }

  const proxied = proxifyImageSrc(normalizedUrl, width, 0);
  return proxied || null;
}

// Canonical Hive frontend hosts whose /@author/permlink URLs are recognized as
// post links. Kept in sync with WHITE_LIST in @ecency/render-helper, and used
// both to enhance post links and to avoid splitting an in-URL @author into a
// chat mention.
const HIVE_POST_LINK_HOSTS =
  "ecency\\.com|peakd\\.com|hive\\.blog|leofinance\\.io|inleo\\.io|snapie\\.io|hivesuite\\.app";

const HIVE_POST_LINK_MENTION_REGEX = new RegExp(
  `https?://(?:www\\.)?(?:${HIVE_POST_LINK_HOSTS})/[^\\s]*@(?:[a-zA-Z][a-zA-Z0-9.-]{1,15})`,
  "i"
);

function isPartOfEcencyPostLink(before: string, mention: string, after: string) {
  return HIVE_POST_LINK_MENTION_REGEX.test(`${before}${mention}${after}`);
}

function trimTrailingLinkPunctuation(link: string) {
  let trimmed = link;
  while (trimmed.length && /[\).,!?:]$/.test(trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function isEnhanceableEcencyPostLink(href: string) {
  try {
    const url = new URL(href, "https://ecency.com");

    if (url.protocol && url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    if (url.hostname && url.hostname !== "" && !ECENCY_HOSTNAMES.has(url.hostname)) {
      return false;
    }

    if (url.hash.startsWith("#@")) {
      return false;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      return false;
    }

    const permlink = decodeURIComponent(pathParts.pop() ?? "");
    const author = decodeURIComponent(pathParts.pop() ?? "");

    if (!author.startsWith("@") || !permlink) {
      return false;
    }

    return pathParts.length <= 1;
  } catch {
    return false;
  }
}

interface UseMessageRenderingParams {
  usersById: Record<string, MattermostUser>;
  usersByUsername: Record<string, MattermostUser>;
  activeUsername: string | undefined;
  startDirectMessage: (username: string) => void;
  normalizeUsername: (username?: string | null) => string | undefined;
}

export function useMessageRendering({
  usersById,
  usersByUsername,
  activeUsername,
  startDirectMessage,
  normalizeUsername
}: UseMessageRenderingParams) {

  const getProxiedImageUrl = useCallback(
    (url: string) => {
      return getSafeChatImageUrl(url);
    },
    []
  );

  const getDisplayName = useCallback(
    (post: MattermostPost) => getPostDisplayName(post, usersById, normalizeUsername),
    [usersById, normalizeUsername]
  );

  const getUsername = useCallback(
    (post: MattermostPost) => getPostUsername(post, usersById, normalizeUsername),
    [usersById, normalizeUsername]
  );

  const getDecodedDisplayMessage = useCallback(
    (post: MattermostPost) => {
      const baseMessage =
        post.type === "system_add_to_channel"
          ? `${getAddedUserDisplayName(post, usersById)} joined the channel`
          : post.type === "system_header_change"
            ? `${getPostDisplayName(post, usersById, normalizeUsername)} ${getDisplayMessage(post)}`
            : getDisplayMessage(post);

      return decodeMessageEmojis(baseMessage);
    },
    [usersById, normalizeUsername]
  );

  const markdownParser = useCallback(
    (content: string) => simpleMarkdownToHTML(content),
    []
  );

  const ECENCY_POST_LINK_REGEX = useMemo(
    () =>
      new RegExp(
        `https?://(?:www\\.)?(?:${HIVE_POST_LINK_HOSTS})/[^\\s]*@(?:[a-zA-Z][a-zA-Z0-9.-]{1,15})/[^\\s)]+`,
        "gi"
      ),
    []
  );

  const renderMessageContent = useMemo(() => {
    const renderTextWithMentions = (content: string, keyPrefix = "mention") => {
      const mentionMatcher = new RegExp(USER_MENTION_PURE_REGEX.source, "i");
      const parts = content.split(
        /(@(?=[a-zA-Z][a-zA-Z0-9.-]{1,15}\b)[a-zA-Z0-9.-]+)/
      );

      return parts
        .filter((part) => part !== "")
        .map((part, idx) => {
          if (mentionMatcher.test(part)) {
            const prevPart = parts[idx - 1] || "";
            const nextPart = parts[idx + 1] || "";

            if (isPartOfEcencyPostLink(prevPart, part, nextPart)) {
              return <span key={`${keyPrefix}-${part}-${idx}`}>{part}</span>;
            }

            const username = part.slice(1);
            return (
              <MentionToken
                key={`${keyPrefix}-${part}-${idx}`}
                username={username}
                user={usersByUsername[username.toLowerCase()]}
                currentUsername={activeUsername}
                onStartDm={startDirectMessage}
              />
            );
          }

          return <span key={`${keyPrefix}-${part}-${idx}`}>{part}</span>;
        });
    };

    const renderTextWithEnhancements = (content: string) => {
      const matches = Array.from(content.matchAll(ECENCY_POST_LINK_REGEX));

      if (!matches.length) {
        return renderTextWithMentions(content);
      }

      const nodes: ReactNode[] = [];
      let cursor = 0;

      matches.forEach((match, index) => {
        const matchIndex = match.index ?? 0;
        const matchedText = match[0];

        if (matchIndex > cursor) {
          nodes.push(...renderTextWithMentions(content.slice(cursor, matchIndex), `mention-${index}-before`));
        }

        const cleanedLink = trimTrailingLinkPunctuation(matchedText);
        const trailing = matchedText.slice(cleanedLink.length);

        if (isEnhanceableEcencyPostLink(cleanedLink)) {
          const linkHash = cleanedLink.split('/').pop() || index;
          nodes.push(<HivePostLinkRenderer key={`ecency-link-${index}-${linkHash}`} link={cleanedLink} />);
        } else {
          nodes.push(...renderTextWithMentions(cleanedLink, `mention-${index}-link`));
        }

        if (trailing) {
          nodes.push(...renderTextWithMentions(trailing, `mention-${index}-trail`));
        }

        cursor = matchIndex + matchedText.length;
      });

      if (cursor < content.length) {
        nodes.push(...renderTextWithMentions(content.slice(cursor), "mention-tail"));
      }

      return nodes;
    };

    return (text: string) => {
      try {
        const normalized = text.trimEnd();
        const sanitized = DOMPurify.sanitize(markdownParser(normalized), {
          ADD_ATTR: ["target", "rel"]
        });

        const createParseOptions = (inLink = false): HTMLReactParserOptions => ({
          replace(domNode) {
            if (domNode.type === "text") {
              const textContent = (domNode as Text).data || "";
              const trimmedText = textContent.trim();
              if (isImageUrl(trimmedText)) {
                const proxied = getProxiedImageUrl(trimmedText);
                if (!proxied) {
                  return <>{inLink ? renderTextWithMentions(textContent) : renderTextWithEnhancements(textContent)}</>;
                }
                return (
                  <ChatImage
                    src={proxied}
                    alt="Shared image"
                  />
                );
              }
              return <>{inLink ? renderTextWithMentions(textContent) : renderTextWithEnhancements(textContent)}</>;
            }

            if (domNode.type === "tag") {
              if (domNode.name === "p") {
                return (
                  <div className="leading-relaxed">
                    {domToReact((domNode.children ?? []) as any, createParseOptions(inLink))}
                  </div>
                );
              }

              if (domNode.name === "img") {
                const src = domNode.attribs?.src || "";
                const alt = domNode.attribs?.alt || "Shared image";
                const proxied = getProxiedImageUrl(src);

                if (!proxied) {
                  return <></>;
                }

                return (
                  <ChatImage
                    src={proxied}
                    alt={alt}
                  />
                );
              }

              if (domNode.name === "a") {
                const href = domNode.attribs?.href || "";
                const children = domToReact((domNode.children ?? []) as any, createParseOptions(true));
                const containsImage = (domNode.children || []).some(
                  (child) => child.type === "tag" && child.name === "img"
                );

                const childText = (domNode.children || [])
                  .map((child) => (child.type === "text" ? (child as Text).data?.trim() ?? "" : ""))
                  .join("")
                  .trim();
                const isPlainImageLink = !containsImage && isImageUrl(href) && (
                  childText === href ||
                  childText === href.trim() ||
                  !childText ||
                  childText === href.replace(/^https?:\/\//, '').trim() ||
                  isImageUrl(childText)
                );

                if (isPlainImageLink) {
                  const proxied = getProxiedImageUrl(href);
                  if (!proxied) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-500 underline break-all"
                      >
                        {children}
                      </a>
                    );
                  }

                  return (
                    <ChatImage
                      src={proxied}
                      alt={childText || "Shared image"}
                    />
                  );
                }

                // If link wraps an image, render just the image with zoom (no navigation)
                if (containsImage) {
                  return <>{children}</>;
                }

                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 underline break-all"
                  >
                    {children}
                  </a>
                );
              }
            }

            return undefined;
          }
        });

        return htmlParse(sanitized, createParseOptions());
      } catch (error) {
        console.error("Failed to render chat message", error);
        const fallback = DOMPurify.sanitize(text || "", { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        return <span className="whitespace-pre-wrap break-words">{fallback}</span>;
      }
    };
  }, [markdownParser, getProxiedImageUrl, usersByUsername, activeUsername, startDirectMessage, ECENCY_POST_LINK_REGEX]);

  return {
    getProxiedImageUrl,
    getDisplayName,
    getUsername,
    getDecodedDisplayMessage,
    renderMessageContent
  };
}
