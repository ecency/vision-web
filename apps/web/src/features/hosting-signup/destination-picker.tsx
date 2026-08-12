"use client";

import i18next from "i18next";
import { FormControl } from "@ui/input";

export type HostingDestination = "managed" | "self-host";

interface Props {
  value: HostingDestination;
  onChange: (value: HostingDestination) => void;
  /** Where the owner will serve an independent deployment, if they know yet. */
  domain: string;
  onDomainChange: (value: string) => void;
  disabled?: boolean;
}

const OPTIONS: {
  id: HostingDestination;
  titleKey: string;
  bodyKey: string;
}[] = [
  {
    id: "managed",
    titleKey: "hosting.destination-managed",
    bodyKey: "hosting.destination-managed-hint"
  },
  {
    id: "self-host",
    titleKey: "hosting.destination-self",
    bodyKey: "hosting.destination-self-hint"
  }
];

/**
 * Where the blog someone just customized will actually live: on Ecency's
 * hosting, or on their own server. The self-host branch is free and creates
 * nothing, so this choice sits INSIDE the customize step rather than after
 * it: the reader sees both routes while they are still deciding, and the
 * flow does not grow a click for the paid path everyone else takes.
 */
export function DestinationPicker({
  value,
  onChange,
  domain,
  onDomainChange,
  disabled
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={i18next.t("hosting.destination-label")} className="grid sm:grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`text-left rounded-2xl border p-3 transition-colors disabled:opacity-50 ${
                selected
                  ? "border-blue-dark-sky bg-blue-dark-sky-030"
                  : "border-[--border-color] hover:border-blue-dark-sky"
              }`}
            >
              <div className="text-sm font-semibold">{i18next.t(option.titleKey)}</div>
              <div className="text-xs opacity-75 mt-1">{i18next.t(option.bodyKey)}</div>
            </button>
          );
        })}
      </div>

      {value === "self-host" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold" htmlFor="self-host-domain">
            {i18next.t("hosting.self-host-domain-label")}
          </label>
          <FormControl
            id="self-host-domain"
            type="text"
            value={domain}
            disabled={disabled}
            onChange={(e: any) => onDomainChange(e.target.value)}
            placeholder="blog.example.com"
          />
          <p className="text-xs opacity-60">{i18next.t("hosting.self-host-domain-hint")}</p>
        </div>
      )}
    </div>
  );
}
