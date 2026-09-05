import i18next from "i18next";
import Link from "next/link";
import { Tsx } from "@/features/i18n/helper";

const SECTIONS = [
  "what",
  "trail",
  "accounts",
  "weight",
  "windows",
  "etiquette-author",
  "budget",
  "look-for",
  "red-flags",
  "signals",
  "hivewatchers",
  "etiquette",
  "becoming",
] as const;

const VP_TABLE: Array<[number, number]> = [
  [55, 0],
  [60, 1.0],
  [65, 2.1],
  [70, 3.1],
  [75, 4.1],
  [80, 5.2],
  [85, 6.2],
  [90, 7.2],
  [95, 8.3],
  [100, 9.3],
];

function sustainable(weightPct: number): number {
  if (weightPct <= 0) return 0;
  return Math.round(20 / ((2 * weightPct) / 100));
}

/**
 * "How Ecency curation works". Server rendered, static, indexable; the copy
 * lives under curation-desk.guide.* so Crowdin picks it up. No "use client".
 */
export function CurationGuide() {
  return (
    <article className="bg-white dark:bg-dark-200 rounded-2xl px-5 py-6 lg:px-8 lg:py-8 max-w-3xl mx-auto prose dark:prose-invert prose-sm">
      <h1>{i18next.t("curation-desk.guide.title")}</h1>
      <p className="lead">{i18next.t("curation-desk.guide.lead")}</p>
      <nav aria-label={i18next.t("curation-desk.guide.contents")}>
        <ol>
          {SECTIONS.map((id) => (
            <li key={id}>
              <a href={`#${id}`}>{i18next.t(`curation-desk.guide.${id}.title`)}</a>
            </li>
          ))}
        </ol>
      </nav>

      {SECTIONS.map((id) => (
        <section key={id} id={id}>
          <h2>{i18next.t(`curation-desk.guide.${id}.title`)}</h2>
          <Tsx k={`curation-desk.guide.${id}.body`}>
            <div />
          </Tsx>
          {id === "weight" && (
            <table>
              <thead>
                <tr>
                  <th>{i18next.t("curation-desk.guide.weight.table-vp")}</th>
                  <th>{i18next.t("curation-desk.guide.weight.table-weight")}</th>
                  <th>{i18next.t("curation-desk.guide.weight.table-votes")}</th>
                </tr>
              </thead>
              <tbody>
                {VP_TABLE.map(([vp, weight]) => (
                  <tr key={vp}>
                    <td>{vp}%</td>
                    <td>{weight.toFixed(1)}%</td>
                    <td>{sustainable(weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <section id="checklist">
        <h2>{i18next.t("curation-desk.guide.checklist.title")}</h2>
        <ol>
          {Array.from({ length: 12 }).map((_, i) => (
            <li key={i}>{i18next.t(`curation-desk.guide.checklist.step-${i + 1}`)}</li>
          ))}
        </ol>
      </section>

      <p>
        <Link href="/curation">{i18next.t("curation-desk.guide.back-to-desk")}</Link>
      </p>
    </article>
  );
}
