---
paths:
  - "apps/web/src/**/*.{tsx,scss,css}"
  - "apps/self-hosted/src/**/*.{tsx,scss,css}"
  - "docs/icons.md"
  - "scripts/icon-*"
---

# Icon sizing

**Icon sizing (docs/icons.md):** every UI glyph is sized by exactly one Tailwind `size-N`
class (`size-3.5|4|5|6`; default `size-4`) or by a sanctioned slot (Button `icon=`,
InputGroup, DropdownItemWithIcon — slot icons carry no size class, or exactly one
`!size-N` to deliberately diverge). Never write `svg { width/height }` in SCSS/CSS, never
pass `size=`/`width=`/`height=` to an icon, never pair `w-N h-N` on a glyph. Hand-rolled
element exports always render inside a both-axes sink:
`<span className="inline-flex shrink-0 size-4 [&>svg]:size-full">{fooSvg}</span>`.
Exemptions carry `data-icon-exempt` and live in `scripts/icon-scss-manifest.json`.
**Enforcement is active and will fail CI**: the ESLint icon rules are errors, and
`scripts/icon-tsx-audit.mjs --fail` plus `scripts/icon-scss-audit.mjs` run in the
typecheck workflow — the latter also fails if a retired SCSS rule reappears. The
absence check reads literal classNames only, so a dynamically built one
(`clsx(cond && "size-4")`, `className ?? "size-4"`) can slip past; see the gap
section in docs/icons.md. Any PR changing an icon's size mechanism includes
before/after staging screenshots — tests cannot see pixels. Decorative icons take
`aria-hidden`.
