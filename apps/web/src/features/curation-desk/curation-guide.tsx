import i18next from "i18next";
import Link from "next/link";
import { EcencyConfigManager } from "@/config";
import { Tsx } from "@/features/i18n/helper";
import { Table, Td, Th, Tr } from "@/features/ui/table";

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
  "recommending-well",
  "becoming"
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
  [100, 9.3]
];

const CHECKLIST_STEPS = 12;

/**
 * Body copy comes from Crowdin as HTML (p/ul/li/strong/a survive the xss
 * whitelist), so the rhythm has to be declared on the wrapper: Tailwind's
 * preflight strips list markers and every margin, and this app carries no
 * typography plugin, so unstyled tags render as one solid block of text.
 */
const BODY_CLASS = [
  "space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300",
  "[&_p]:m-0",
  "[&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white",
  "[&_b]:font-semibold",
  "[&_ul]:m-0 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
  "[&_li]:pl-1",
  "[&_a]:underline [&_a]:underline-offset-2"
].join(" ");

function sustainable(weightPct: number): number {
  if (weightPct <= 0) return 0;
  return Math.round(20 / ((2 * weightPct) / 100));
}

/**
 * "How Ecency curation works". Server rendered, static, indexable; the copy
 * lives under curation-desk.guide.* so Crowdin picks it up. Carries no client directive.
 */
export function CurationGuide() {
  // The guide is public and static, so the link to the apply page has to go with
  // the flag: an instance that runs no applications would otherwise send readers
  // from section 14 to a 404. getConfigValue, not useConfig: this component has
  // no client directive and a hook here would make it one.
  const applicationsEnabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.curationDesk.applications.enabled
  );

  return (
    <article className="mx-auto w-full max-w-3xl rounded-2xl reading-surface px-5 py-6 lg:px-8 lg:py-8">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
        {i18next.t("curation-desk.guide.title")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {i18next.t("curation-desk.guide.lead")}
      </p>

      <nav
        aria-label={i18next.t("curation-desk.guide.contents")}
        className="mt-6 rounded-xl border border-[--border-color] px-4 py-3 sm:px-5 sm:py-4"
      >
        <ol className="grid list-none grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {SECTIONS.map((id) => (
            <li key={id}>
              <a className="hover:underline" href={`#${id}`}>
                {i18next.t(`curation-desk.guide.${id}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {SECTIONS.map((id) => (
        <section
          key={id}
          id={id}
          className="mt-8 scroll-mt-20 border-t border-[--border-color] pt-6"
        >
          <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">
            {i18next.t(`curation-desk.guide.${id}.title`)}
          </h2>
          <Tsx k={`curation-desk.guide.${id}.body`}>
            <div className={BODY_CLASS} />
          </Tsx>
          {id === "becoming" && applicationsEnabled && (
            <p className="mt-3">
              {i18next.t("curation-desk.guide.becoming.apply")}{" "}
              <Link className="text-blue-dark-sky" href="/curation/apply">
                {i18next.t("curation-desk.guide.becoming.apply-link")}
              </Link>
            </p>
          )}
          {id === "weight" && (
            <div className="mt-4">
              <Table full={true}>
                <thead>
                  <Tr>
                    <Th>{i18next.t("curation-desk.guide.weight.table-vp")}</Th>
                    <Th>{i18next.t("curation-desk.guide.weight.table-weight")}</Th>
                    <Th>{i18next.t("curation-desk.guide.weight.table-votes")}</Th>
                  </Tr>
                </thead>
                <tbody>
                  {VP_TABLE.map(([vp, weight]) => (
                    <Tr key={vp}>
                      <Td className="tabular-nums">{vp}%</Td>
                      <Td className="tabular-nums">{weight.toFixed(1)}%</Td>
                      <Td className="tabular-nums">{sustainable(weight)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>
      ))}

      <section id="checklist" className="mt-8 scroll-mt-20 border-t border-[--border-color] pt-6">
        <h2 className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">
          {i18next.t("curation-desk.guide.checklist.title")}
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-700 marker:text-gray-500 dark:text-gray-300">
          {Array.from({ length: CHECKLIST_STEPS }).map((_, i) => (
            <li className="pl-1" key={i}>
              {i18next.t(`curation-desk.guide.checklist.step-${i + 1}`)}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 border-t border-[--border-color] pt-6 text-sm">
        <Link className="font-medium hover:underline" href="/curation">
          {i18next.t("curation-desk.guide.back-to-desk")}
        </Link>
      </p>
    </article>
  );
}
