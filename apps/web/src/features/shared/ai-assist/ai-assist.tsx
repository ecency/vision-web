"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { withFeatureFlag } from "@/core/react-query";
import { error, success } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { getAiAssistErrorMessage } from "./ai-assist-error-message";
import { Button, FormControl } from "@/features/ui";
import { getAccessToken, ensureValidToken } from "@/utils";
import {
  getAiAssistPriceQueryOptions,
  getPointsQueryOptions,
  useAiAssist,
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import i18next from "i18next";
import { useCallback, useMemo, useState } from "react";

const ACTIONS = ["improve", "suggest_tags", "generate_title", "summarize", "check_grammar"] as const;
export type AiAssistAction = (typeof ACTIONS)[number];

type DiffSegment = { type: "equal" | "add" | "remove"; text: string };

function computeWordDiff(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const m = oldWords.length;
  const n = newWords.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldWords[i - 1] === newWords[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const raw: DiffSegment[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      raw.unshift({ type: "equal", text: oldWords[--i] });
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: "add", text: newWords[--j] });
    } else {
      raw.unshift({ type: "remove", text: oldWords[--i] });
    }
  }

  // Merge consecutive same-type segments
  const merged: DiffSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

interface Props {
  onApply?: (output: string, action: AiAssistAction) => void;
  initialText?: string;
}

export function AiAssist({ onApply, initialText = "" }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const accessToken = username ? getAccessToken(username) : "";

  const { data: activeUserPoints, isPending: isPointsPending } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(username)
    )
  );

  const { data: prices, isLoading: isPricesLoading } = useQuery(
    getAiAssistPriceQueryOptions(username, accessToken ?? "")
  );

  const { mutateAsync: runAssist, isPending: isProcessing } = useAiAssist(username, accessToken);

  const maxInput = 10000;

  const [selectedAction, setSelectedAction] = useState<AiAssistAction | null>(null);
  const [text, setText] = useState(initialText.slice(0, maxInput));
  const [result, setResult] = useState<{ output: string; action: AiAssistAction } | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedPrice = useMemo(() => {
    if (!selectedAction || !prices) return null;
    return prices.find((p) => p.action === selectedAction) ?? null;
  }, [selectedAction, prices]);

  const minInput = useMemo(() => {
    if (!selectedAction) return 50;
    if (selectedAction === "improve" || selectedAction === "check_grammar") return 50;
    return 100;
  }, [selectedAction]);

  const charsRemaining = Math.max(0, maxInput - text.length);

  const isFree = selectedPrice ? (selectedPrice.free_remaining ?? 0) > 0 : false;

  const isInsufficientBalance = useMemo(() => {
    if (isFree) return false;
    if (activeUserPoints && selectedPrice) {
      return +activeUserPoints.points < selectedPrice.cost;
    }
    return false;
  }, [activeUserPoints, selectedPrice, isFree]);

  const canSubmit =
    selectedAction && selectedPrice && !isPricesLoading && text.trim().length >= minInput && !isInsufficientBalance && !isProcessing;

  const handleSubmit = useCallback(async () => {
    if (!selectedAction || !text.trim()) return;

    if (text.trim().length < minInput) {
      error(i18next.t("ai-assist.error-text-too-short", { count: minInput }));
      return;
    }

    try {
      const token = username ? await ensureValidToken(username) : undefined;
      if (!token) {
        error(i18next.t("ai-assist.error-auth"));
        return;
      }

      const res = await runAssist({
        action: selectedAction,
        text: text.trim().slice(0, maxInput),
        code: token,
      });

      const resAction = ACTIONS.includes(res.action as AiAssistAction)
        ? (res.action as AiAssistAction)
        : selectedAction!;
      setResult({ output: res.output, action: resAction });
      success(i18next.t("ai-assist.success"));
    } catch (err) {
      error(getAiAssistErrorMessage(err));
    }
  }, [selectedAction, text, username, runAssist, minInput]);

  const handleTryAgain = useCallback(() => {
    setResult(null);
  }, []);

  const handleTryAnother = useCallback(() => {
    setResult(null);
    setSelectedAction(null);
  }, []);

  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0);
  const [showDiff, setShowDiff] = useState(false);

  const hasDiff = result && (result.action === "improve" || result.action === "check_grammar");

  const diffSegments = useMemo(() => {
    if (!hasDiff || !result) return [];
    return computeWordDiff(text, result.output);
  }, [hasDiff, result, text]);

  const parsedResult = useMemo(() => {
    if (!result) return null;

    const stripped = result.output
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    if (result.action === "generate_title") {
      try {
        const titles = JSON.parse(stripped);
        if (Array.isArray(titles) && titles.length > 0 && titles.every((t) => typeof t === "string")) {
          return { type: "titles" as const, titles: titles.map((t: string) => t.trim()).filter(Boolean) };
        }
      } catch {}
    }

    if (result.action === "suggest_tags") {
      try {
        const tags = JSON.parse(stripped);
        if (Array.isArray(tags) && tags.length > 0 && tags.every((t) => typeof t === "string")) {
          return { type: "tags" as const, tags: tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean) };
        }
      } catch {}
    }

    return { type: "text" as const };
  }, [result]);

  // Result view
  if (result) {
    const getApplyValue = () => {
      if (parsedResult?.type === "titles") {
        return parsedResult.titles[selectedTitleIndex] || parsedResult.titles[0];
      }
      if (parsedResult?.type === "tags") {
        return JSON.stringify(parsedResult.tags);
      }
      return result.output;
    };

    const getCopyValue = () => {
      if (parsedResult?.type === "tags") {
        return parsedResult.tags.join(", ");
      }
      if (parsedResult?.type === "titles") {
        return parsedResult.titles[selectedTitleIndex] || parsedResult.titles[0];
      }
      return result.output;
    };

    return (
      <div className="animate-fade-in-up flex flex-col gap-4">
        <div className="font-semibold">{i18next.t("ai-assist.result-title")}</div>

        {parsedResult?.type === "titles" ? (
          <div className="flex flex-col gap-2">
            {parsedResult.titles.map((title, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedTitleIndex(i)}
                className={clsx(
                  "border px-4 py-3 rounded-lg cursor-pointer text-left text-sm w-full",
                  selectedTitleIndex === i
                    ? "border-blue-dark-sky bg-blue-dark-sky/10"
                    : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {title}
              </button>
            ))}
          </div>
        ) : parsedResult?.type === "tags" ? (
          <div className="border border-[--border-color] rounded-xl p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              {parsedResult.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-dark-sky/10 text-blue-dark-sky text-xs font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="border border-[--border-color] rounded-xl p-4 max-h-[400px] overflow-y-auto whitespace-pre-wrap text-sm">
            {hasDiff && showDiff ? (
              diffSegments.map((seg, i) =>
                seg.type === "equal" ? (
                  <span key={i}>{seg.text}</span>
                ) : seg.type === "remove" ? (
                  <span key={i} className="bg-red/15 text-red line-through">{seg.text}</span>
                ) : (
                  <span key={i} className="bg-green/15 text-green">{seg.text}</span>
                )
              )
            ) : (
              result.output
            )}
          </div>
        )}

        {hasDiff && (
          <button
            type="button"
            className="text-xs text-blue-dark-sky hover:text-blue-dark-sky-hover self-start"
            onClick={() => setShowDiff(!showDiff)}
          >
            {showDiff ? i18next.t("ai-assist.hide-changes") : i18next.t("ai-assist.show-changes")}
          </button>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {onApply && (
            <Button size="sm" onClick={() => onApply(getApplyValue(), result.action)}>
              {i18next.t("ai-assist.apply-button")}
            </Button>
          )}
          <Button
            size="sm"
            appearance="gray"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(getCopyValue());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
          >
            {copied ? i18next.t("ai-assist.copied") : i18next.t("ai-assist.copy-button")}
          </Button>
          <Button size="sm" appearance="gray-link" onClick={handleTryAgain}>
            {i18next.t("ai-assist.try-again")}
          </Button>
          <Button size="sm" appearance="gray-link" onClick={handleTryAnother}>
            {i18next.t("ai-assist.try-another")}
          </Button>
        </div>
      </div>
    );
  }

  // Form view
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="opacity-50">{i18next.t("ai-assist.balance-label")}:</div>
          <div className="text-blue-dark-sky">
            {isPointsPending
              ? "..."
              : `${activeUserPoints?.points ?? "0"} ${i18next.t("ai-assist.points-unit")}`}
          </div>
        </div>
        {selectedPrice && (
          <div className="flex items-center gap-2">
            <div className="opacity-50">{i18next.t("ai-assist.cost-label")}:</div>
            <div className="text-blue-dark-sky font-semibold">
              {isFree ? (
                <span className="text-green-500">{i18next.t("ai-assist.free-label")}</span>
              ) : (
                `${selectedPrice.cost} ${i18next.t("ai-assist.points-unit")}`
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">
          {i18next.t("ai-assist.action-label")}
        </label>
        {isPricesLoading ? (
          <div className="opacity-50">...</div>
        ) : (
          <div className="flex flex-col gap-2">
            {ACTIONS.map((action, i) => {
              const price = prices?.find((p) => p.action === action);
              const freeRemaining = price?.free_remaining ?? 0;

              return (
                <button
                  type="button"
                  key={action}
                  style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
                  aria-pressed={selectedAction === action}
                  className={clsx(
                    "animate-fade-in-up border px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between text-left w-full",
                    selectedAction === action
                      ? "border-blue-dark-sky bg-blue-dark-sky/10"
                      : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                  onClick={() => setSelectedAction(action)}
                >
                  <div>
                    <div className={clsx(
                      "text-sm font-medium",
                      selectedAction === action && "text-blue-dark-sky"
                    )}>
                      {i18next.t(`ai-assist.action-${action}`)}
                    </div>
                    <div className="text-xs opacity-50">
                      {i18next.t(`ai-assist.action-${action}-desc`)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                    {freeRemaining > 0 && (
                      <span className="text-green-500 font-medium">
                        {i18next.t("ai-assist.free-remaining", { count: freeRemaining })}
                      </span>
                    )}
                    <span className="opacity-50">
                      {price?.cost ?? "?"} {i18next.t("ai-assist.points-unit")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAction && (
        <div className="animate-fade-in-up">
          <label className="text-sm font-medium mb-1 block">
            {i18next.t("ai-assist.text-label")}
          </label>
          <FormControl
            type="textarea"
            value={text}
            onChange={(e: any) => setText(e.target.value.slice(0, maxInput))}
            placeholder={i18next.t("ai-assist.text-placeholder")}
            rows={6}
          />
          <div className="flex justify-between mt-1">
            <div className={clsx(
              "text-xs",
              text.length < minInput ? "text-red" : "opacity-50"
            )}>
              {text.length < minInput
                ? i18next.t("ai-assist.min-chars", { count: minInput })
                : i18next.t("ai-assist.chars-remaining", { count: charsRemaining })}
            </div>
          </div>
        </div>
      )}

      {isInsufficientBalance && (
        <div className="flex items-center flex-wrap gap-3">
          <small className="text-red block">
            {i18next.t("ai-assist.error-insufficient-points", {
              required: selectedPrice?.cost ?? 0,
              available: activeUserPoints?.points ?? "0",
            })}
          </small>
          <PointsTopupCta
            required={selectedPrice?.cost}
            available={+(activeUserPoints?.points ?? 0)}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!canSubmit}
          isLoading={isProcessing}
          onClick={handleSubmit}
        >
          {isProcessing
            ? i18next.t("ai-assist.submitting")
            : i18next.t("ai-assist.submit-button")}
        </Button>
      </div>
    </div>
  );
}
