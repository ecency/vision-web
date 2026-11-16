import React from "react";

// Written out whole so Tailwind (and scripts/tailwind-color-audit.mjs) can see
// them: the old `text-${type}` built `text-danger` and `text-muted`, neither in
// the palette, so a transfer error rendered in the body colour (#1742).
const TYPE_CLASS = {
  danger: "text-red",
  muted: "text-gray-600 dark:text-gray-400"
} as const;

interface Props {
  type: keyof typeof TYPE_CLASS;
  msg: string;
}

export function TransferFormText({ type, msg }: Props) {
  return (
    <div className="grid grid-cols-12">
      <div className="col-span-12 md:col-span-10 col-start-2">
        <small className={`${TYPE_CLASS[type]} tr-form-text`}>{msg}</small>
      </div>
    </div>
  );
}
