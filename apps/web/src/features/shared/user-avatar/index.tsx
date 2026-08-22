"use client";

import React, { useMemo } from "react";
import { proxifyImageSrc, setProxyBase } from "@ecency/render-helper";
import defaults from "@/defaults";

setProxyBase(defaults.imageServer);

interface Props {
  username: string;
  size?: string;
  src?: string;
  onClick?: () => void;
  className?: string;
}

export function UserAvatar({ username, size, src, onClick, className }: Props) {
  const imgSize = useMemo(() => {
    switch (size) {
      case "xLarge":
        return "large";
      case "normal":
      case "small":
        return "small";
      case "sLarge":
      case "medium":
        return "medium";
      case "large":
        return "large";
      case "xsmall":
        return "small";
      case "deck-item":
        return "small";
      default:
        return "medium";
    }
  }, [size]);

  const imageSrc = useMemo(() => {
    const proxySize = imgSize === "large" ? 256 : imgSize === "medium" ? 128 : 64;
    return (
        proxifyImageSrc(src, proxySize, proxySize) ||
        `${defaults.imageServer}/u/${username}/avatar/${imgSize}`
    );
  }, [src, imgSize, username]);

  if (onClick) {
    return (
      <span
        onClick={onClick}
        role="button"
        aria-label={`@${username}`}
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`user-avatar ${size ?? ""} ${className ?? ""}`}
        style={{ backgroundImage: `url(${imageSrc})` }}
      />
    );
  }

  return (
      <span
          role="img"
          aria-label={`@${username}`}
          className={`user-avatar ${size ?? ""} ${className ?? ""}`}
          style={{ backgroundImage: `url(${imageSrc})` }}
      />
  );
}

interface PropsL {
  size?: string;
  className?: string;
}

export function UserAvatarLoading({ size, className }: PropsL) {
  return (
      <span
          className={`user-avatar animate-pulse  bg-blue-dark-sky-040 dark:bg-blue-dark-grey ${size} ${className}`}
      />
  );
}
