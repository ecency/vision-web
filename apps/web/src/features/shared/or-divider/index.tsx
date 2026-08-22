"use client";

import React from "react";
import i18next from "i18next";

export function OrDivider() {
  return <div className="or-divider">{i18next.t("g.or")}</div>;
}
