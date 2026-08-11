import { useEffect, useRef, useState } from "react";
import { BAN_NOTICE_TICK_MS, ChatBanInfo, formatChatBanNotice } from "../chat-ban-notice";

interface Props {
  info: ChatBanInfo;
  /**
   * Called once the ban lapses, so the caller can re-run bootstrap without a reload. Bootstrap
   * only refetches on focus (throttled), so without this a user sitting on the page stays locked
   * out well past their expiry.
   */
  onExpire?: () => void;
}

/**
 * The full-pane ban notice, shared by every bootstrap consumer.
 *
 * There are three of them (the sidebar, the desktop main pane, and the direct-channel route) and
 * each had its own bootstrap error handling. Rendering this in only one produced a split screen:
 * the correct explanation in the sidebar next to a generic failure in the main pane. Keeping the
 * rendering in one component is what stops them drifting apart again.
 *
 * The tick is a bounded interval, never a delay derived from `bannedUntil`: setTimeout takes a
 * 32-bit signed delay, so a multi-year ban would otherwise fire almost immediately.
 */
export function ChatBanScreen({ info, onExpire }: Props) {
  const [now, setNow] = useState(() => Date.now());

  // Held in a ref so an inline arrow from the caller doesn't restart the interval every render.
  // Assigned in an effect rather than during render: a render React discards could otherwise
  // mutate the ref that the already-committed interval reads from.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= info.bannedUntil) {
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, BAN_NOTICE_TICK_MS);
    return () => clearInterval(id);
  }, [info.bannedUntil]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
      <div
        role="status"
        className="max-w-md rounded border border-[--border-color] bg-[--surface-color] p-4 text-center text-sm text-[--text-muted]"
      >
        {formatChatBanNotice(info, now)}
      </div>
    </div>
  );
}
