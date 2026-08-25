"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Button } from "@/features/ui";
import { ensureValidToken, getAccessToken } from "@/utils";
import { getAiImagesQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import Image from "next/image";
import { useEffect, useState } from "react";

import { downloadImage } from "./download-image";

interface Props {
  onInsert?: (url: string) => void;
  showInsertAction?: boolean;
}

/**
 * The user's recent successful generations, served by the backend. A generation can
 * complete and be billed while the client saw a timeout or an error, so this list is
 * where such an already-paid image is found again.
 */
export function AiImageHistory({ onInsert, showInsertAction = true }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  // getAccessToken can hand back an EXPIRED token while a background refresh runs; the
  // query would then 401 and sit on the error state until remount. Resolve a valid
  // token first and only enable the query once it exists.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!username) {
      setAccessToken(null);
      return;
    }
    ensureValidToken(username)
      .then((token) => {
        if (alive) setAccessToken(token ?? getAccessToken(username) ?? null);
      })
      .catch(() => {
        if (alive) setAccessToken(getAccessToken(username) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [username]);

  const { data, isError } = useQuery(getAiImagesQueryOptions(username, accessToken ?? ""));

  // A disabled query is not an empty history: without an account there was no request.
  if (!username) {
    return (
      <div className="opacity-50 py-4">
        {i18next.t("ai-image-generator.history-login-required")}
      </div>
    );
  }

  if (!data) {
    if (isError) {
      return (
        <div className="opacity-50 py-4">{i18next.t("ai-image-generator.history-error")}</div>
      );
    }
    // Token resolution or the fetch itself is still in flight.
    return <div className="opacity-50 py-4">...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="opacity-50 py-4">{i18next.t("ai-image-generator.history-empty")}</div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 border border-[--border-color] rounded-xl p-2"
        >
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Image
              src={item.url}
              alt={item.prompt}
              width={96}
              height={96}
              className="w-24 h-24 object-cover rounded-lg"
              unoptimized={true}
            />
          </a>
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate" title={item.prompt}>
              {item.prompt}
            </div>
            <div className="text-xs opacity-50 mt-0.5">
              {new Date(item.created).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {showInsertAction && onInsert && (
                <Button size="xs" onClick={() => onInsert(item.url)}>
                  {i18next.t("ai-image-generator.insert-button")}
                </Button>
              )}
              <Button size="xs" appearance="gray" onClick={() => downloadImage(item.url)}>
                {i18next.t("ai-image-generator.download-button")}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
