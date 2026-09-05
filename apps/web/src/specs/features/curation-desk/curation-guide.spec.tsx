import React from "react";
import fs from "fs";
import path from "path";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurationGuide } from "@/features/curation-desk/curation-guide";

const FEATURE = path.resolve(__dirname, "../../../features/curation-desk");
const ROUTE = path.resolve(__dirname, "../../../app/curation/guide/page.tsx");

describe("CurationGuide", () => {
  it("is a server component: no use client in the guide or its route", () => {
    for (const file of [path.join(FEATURE, "curation-guide.tsx"), ROUTE]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/["']use client["']/);
    }
    expect(fs.readFileSync(ROUTE, "utf8")).toMatch(/export const revalidate = 86400/);
  });

  it("renders the chapter headings from the guide keys", () => {
    render(<CurationGuide />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("curation-desk.guide.title");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "curation-desk.guide.what.title",
      "curation-desk.guide.trail.title",
      "curation-desk.guide.accounts.title",
      "curation-desk.guide.weight.title",
      "curation-desk.guide.windows.title",
      "curation-desk.guide.etiquette-author.title",
      "curation-desk.guide.budget.title",
      "curation-desk.guide.look-for.title",
      "curation-desk.guide.red-flags.title",
      "curation-desk.guide.signals.title",
      "curation-desk.guide.hivewatchers.title",
      "curation-desk.guide.etiquette.title",
      "curation-desk.guide.becoming.title",
      "curation-desk.guide.checklist.title",
    ]);
  });

  it("carries the VP to weight table with the sustainable pace", () => {
    render(<CurationGuide />);
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("55%");
    expect(cells).toContain("100%");
    expect(cells).toContain("9.3%");
    // 20 / (2 x 9.3 / 100) rounds to 108 votes a day at the full weight.
    expect(cells).toContain("108");
  });
});
