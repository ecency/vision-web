"use client";

import { useGlobalStore } from "@/core/global-store";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Entry } from "@/entities";
import { error } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { countPostWords, ensureValidToken } from "@/utils";
import {
  getListenStatusQueryOptions,
  makeIdempotencyKey,
  useListenUnlock,
  type ListenTrack
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { Spinner } from "@ui/spinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilHeadphones, UilPause, UilPlay } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Speech pace for the estimate shown before the post has been analysed.
const SPOKEN_WORDS_PER_MINUTE = 150;
const SPEEDS = [1, 1.25, 1.5];
const MAX_URL_REFRESHES = 3;

interface Props {
  entry: Entry;
}

export function languageName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The reader's interface language if the post has a track in it, else the main one. */
export function pickTrack(tracks: ListenTrack[], uiLanguage: string): ListenTrack | undefined {
  const ui = uiLanguage.split("-")[0];
  return tracks.find((t) => t.lang === ui) ?? tracks[0];
}

/**
 * Natural-voice audio of a post, on top of its body. Readers unlock it once with
 * Points; the audio is generated server-side and cached, so later readers of the same
 * post get it at once. Hidden for comments, for posts in a language without a voice,
 * and while the status is unknown.
 */
export function ListenPlayer({ entry }: Props) {
  const isComment = !!entry.parent_author;
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const toggleUiProp = useGlobalStore((s) => s.toggleUiProp);
  const queryClient = useQueryClient();

  // Resolve a valid token before asking: a stale one is a 401, which would hide the bar.
  const [token, setToken] = useState<{ username?: string; value?: string }>();
  useEffect(() => {
    let cancelled = false;
    if (!username) {
      setToken({});
      return;
    }
    ensureValidToken(username)
      .then((value) => !cancelled && setToken({ username, value }))
      .catch(() => !cancelled && setToken({ username }));
    return () => {
      cancelled = true;
    };
  }, [username]);
  const tokenReady = token !== undefined && token.username === username;

  const statusOptions = getListenStatusQueryOptions(
    entry.author,
    entry.permlink,
    username,
    token?.value,
    entry.updated
  );
  const { data: status } = useQuery({
    ...statusOptions,
    enabled: !isComment && tokenReady && statusOptions.enabled !== false
  });

  const unlock = useListenUnlock(username, token?.value);
  const keyRef = useRef<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [shortfall, setShortfall] = useState<{ required?: number; available?: number }>();

  const onUnlock = useCallback(async () => {
    if (!username) return;
    // Reused until the outcome is known, so a retry after a lost answer is a replay.
    keyRef.current ??= makeIdempotencyKey();
    const code = await ensureValidToken(username);
    unlock.mutate(
      {
        author: entry.author,
        permlink: entry.permlink,
        updated: entry.updated,
        idempotency_key: keyRef.current,
        code
      },
      {
        onSuccess: () => {
          keyRef.current = undefined;
          setConfirming(false);
        },
        onError: (err) => {
          const { status: code, data } = err as Error & {
            status?: number;
            data?: { required?: number; available?: number };
          };
          // A definite answer: the next attempt is a new request.
          if (code && code >= 400 && code < 500) keyRef.current = undefined;
          setConfirming(false);
          if (code === 402) {
            setShortfall({ required: data?.required, available: data?.available });
          } else {
            error(i18next.t("listen.unlock-failed"));
          }
        }
      }
    );
  }, [username, unlock, entry.author, entry.permlink, entry.updated]);

  const estimateMinutes = useMemo(
    () => Math.max(1, Math.round(countPostWords(entry.body) / SPOKEN_WORDS_PER_MINUTE)),
    [entry.body]
  );

  if (isComment || !status || status.status === "unsupported") {
    return null;
  }

  const locale = i18next.language || "en";
  const languages = status.languages.map((l) => languageName(l.lang, locale)).join(" + ");
  const minutes = status.languages.length
    ? Math.max(1, Math.round(Math.max(...status.languages.map((l) => l.seconds)) / 60))
    : estimateMinutes;

  const tracks = status.unlocked && status.status === "ready" ? status.tracks ?? [] : [];
  if (tracks.length > 0) {
    return (
      <ListenAudio
        entry={entry}
        tracks={tracks}
        locale={locale}
        onExpired={() =>
          queryClient.invalidateQueries({ queryKey: statusOptions.queryKey })
        }
      />
    );
  }

  const preparing = status.unlocked && (status.status === "preparing" || status.status === "analyzing");

  return (
    <div className="listen-bar flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[--border-color] px-3 py-2 mb-3 text-sm">
      <UilHeadphones className="size-5 text-blue-dark-sky shrink-0" aria-hidden={true} />
      <div className="flex-1 min-w-[10rem]">
        <div className="font-semibold">{i18next.t("listen.title")}</div>
        <div className="opacity-60">
          {languages ? `${languages} · ` : ""}
          {i18next.t("listen.minutes", { n: minutes })}
          {status.status === "failed" && !status.unlocked && ` · ${i18next.t("listen.failed-refunded")}`}
        </div>
      </div>

      {preparing && (
        <div className="flex items-center gap-2 opacity-75" role="status">
          <Spinner className="size-4" />
          {i18next.t("listen.preparing")}
        </div>
      )}

      {!preparing && !username && (
        <Button size="sm" onClick={() => toggleUiProp("login")}>
          {i18next.t("listen.login")}
        </Button>
      )}

      {!preparing && username && !status.unlocked && !confirming && !shortfall && (
        <Button size="sm" onClick={() => setConfirming(true)}>
          {i18next.t("listen.unlock", { n: status.cost })}
        </Button>
      )}

      {!preparing && username && !status.unlocked && confirming && (
        <div className="flex items-center gap-2">
          <span className="opacity-75">{i18next.t("listen.confirm", { n: status.cost })}</span>
          <Button size="sm" disabled={unlock.isPending} onClick={onUnlock}>
            {unlock.isPending ? <Spinner className="size-4" /> : i18next.t("g.confirm")}
          </Button>
          <Button size="sm" appearance="gray" disabled={unlock.isPending} onClick={() => setConfirming(false)}>
            {i18next.t("g.cancel")}
          </Button>
        </div>
      )}

      {!preparing && username && !status.unlocked && shortfall && (
        <div className="flex items-center gap-2">
          <span className="opacity-75">{i18next.t("listen.not-enough", { n: status.cost })}</span>
          <PointsTopupCta required={shortfall.required} available={shortfall.available} />
        </div>
      )}
    </div>
  );
}

interface AudioProps {
  entry: Entry;
  tracks: ListenTrack[];
  locale: string;
  onExpired: () => void;
}

function ListenAudio({ entry, tracks, locale, onExpired }: AudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [lang, setLang] = useState(() => pickTrack(tracks, locale)?.lang);
  const track = tracks.find((t) => t.lang === lang) ?? tracks[0];
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(track.seconds);
  const [speed, setSpeed] = useState(1);
  // Where to resume after the source changes: a refreshed URL, or a switched track.
  const resumeRef = useRef<{ at: number; play: boolean } | null>(null);
  // Bounds URL refreshes, so an object that is really gone cannot loop forever.
  const refreshesRef = useRef(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: entry.title,
      artist: `@${entry.author}`,
      album: "Ecency"
    });
    const audio = audioRef.current;
    navigator.mediaSession.setActionHandler("play", () => audio?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
    });
    return () => {
      for (const action of ["play", "pause", "seekbackward", "seekforward"] as MediaSessionAction[]) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    };
  }, [entry.title, entry.author]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  return (
    <div className="listen-bar flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[--border-color] px-3 py-2 mb-3 text-sm">
      <audio
        ref={audioRef}
        src={track.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (Number.isFinite(audio.duration)) setDuration(audio.duration);
          audio.playbackRate = speed;
          const resume = resumeRef.current;
          if (resume) {
            resumeRef.current = null;
            audio.currentTime = resume.at;
            if (resume.play) audio.play().catch(() => setPlaying(false));
          }
        }}
        onError={(e) => {
          // Most likely the signed URL expired: fetch a fresh one and pick up here.
          if (refreshesRef.current >= MAX_URL_REFRESHES) return;
          refreshesRef.current += 1;
          const audio = e.currentTarget;
          resumeRef.current = { at: audio.currentTime || time, play: playing };
          onExpired();
        }}
      />
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-center rounded-full bg-blue-dark-sky text-white size-9 shrink-0"
        aria-label={playing ? i18next.t("g.pause") : i18next.t("g.play")}
      >
        {playing ? <UilPause className="size-5" aria-hidden={true} /> : <UilPlay className="size-5" aria-hidden={true} />}
      </button>
      <div className="flex-1 min-w-[10rem] flex items-center gap-2">
        <span className="tabular-nums opacity-60">{formatTime(time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(time)}
          onChange={(e) => {
            const audio = audioRef.current;
            if (audio) audio.currentTime = Number(e.target.value);
          }}
          className="flex-1 accent-blue-dark-sky"
          aria-label={i18next.t("listen.seek")}
        />
        <span className="tabular-nums opacity-60">{formatTime(duration)}</span>
      </div>
      <button
        type="button"
        className="tabular-nums rounded-md border border-[--border-color] px-2 py-0.5"
        aria-label={i18next.t("listen.speed")}
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
          setSpeed(next);
          if (audioRef.current) audioRef.current.playbackRate = next;
        }}
      >
        {speed}x
      </button>
      {tracks.length > 1 && (
        <div className="flex gap-1" role="group" aria-label={i18next.t("listen.language")}>
          {tracks.map((t) => (
            <button
              key={t.lang}
              type="button"
              aria-pressed={t.lang === track.lang}
              onClick={() => {
                if (t.lang === track.lang) return;
                // The element pauses itself on a new source; carry the playing state over.
                resumeRef.current = { at: 0, play: playing };
                setLang(t.lang);
              }}
              className={`rounded-md px-2 py-0.5 border ${
                t.lang === track.lang
                  ? "border-blue-dark-sky text-blue-dark-sky"
                  : "border-[--border-color] opacity-75"
              }`}
            >
              {languageName(t.lang, locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
