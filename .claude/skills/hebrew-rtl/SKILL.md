---
name: hebrew-rtl
description: Build correct Hebrew right-to-left interfaces, pages, reports and artifacts — direction setup, logical CSS properties, bidi isolation for code and numbers inside Hebrew prose, Hebrew-safe typography, and icon mirroring. Use whenever writing Hebrew UI text, an RTL layout, a Hebrew HTML page or artifact, or when Hebrew text renders with scrambled punctuation, file paths or numbers.
---

# Hebrew / RTL

This project's storefront is Hebrew and right-to-left. Most RTL bugs are not "the layout is
mirrored wrong" — they are punctuation landing in the wrong place, a file path reading
backwards, or a border appearing on the wrong edge. Those all have specific causes.

## Direction goes on a container, not on a style

```html
<div dir="rtl" lang="he"> … </div>
```

`lang="he"` matters as much as `dir` — it drives font selection, hyphenation and screen-reader
voice. Setting `dir` without `lang` gets you correct geometry read in the wrong language.

**In a published Artifact** you do not control `<html>` or `<body>` — the file is wrapped at
publish time. Put `dir="rtl" lang="he"` on your **outermost `<div>`**; it cascades from there.

Never flip direction with `transform: scaleX(-1)` or by reversing DOM order. Both break
selection, copy-paste and screen readers.

## Use logical properties — never left/right

This is the single highest-value rule. Physical properties do not flip; logical ones do.

| Don't                        | Do                                    |
| ---------------------------- | ------------------------------------- |
| `margin-left`                | `margin-inline-start`                 |
| `padding-right`              | `padding-inline-end`                  |
| `border-left`                | `border-inline-start`                 |
| `left: 0`                    | `inset-inline-start: 0`               |
| `text-align: left`           | `text-align: start`                   |
| `border-radius: 4px 0 0 4px` | `border-start-start-radius`, etc.     |

`margin-inline`, `padding-inline` and `padding-block` are also the concise way to set both
sides at once and stay direction-agnostic.

**Flexbox and grid already flip.** `flex-direction: row` lays out right-to-left inside
`dir="rtl"` automatically. Do **not** "fix" it with `row-reverse` — that double-flips and puts
you back where you started. The same applies to grid column order.

## Isolate every LTR run inside Hebrew text

This causes the ugliest and most common bug. Latin identifiers, file paths, URLs, versions and
mixed punctuation reorder unpredictably when dropped into an RTL paragraph — `functions/index.js`
can render as `index.js/functions`, and a trailing period jumps to the wrong end of the line.

Every inline Latin/technical run needs:

```css
code, .ltr {
  direction: ltr;
  unicode-bidi: isolate;
}
```

`isolate` is the important half — it tells the bidi algorithm to treat the span as one opaque
neutral unit rather than letting its characters negotiate with the surrounding Hebrew.
`display: inline-block` on inline code additionally stops it being broken across lines.

For a **block** of code, a file path line, or anything wide:

```css
.code-block {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
  overflow-x: auto;
}
```

Without `text-align: left` the content aligns to the RTL container's right edge and reads oddly.

Bare digits are handled by the bidi algorithm on their own, but **digit sequences joined by
punctuation are not** — `05x-xxxxxxx`, `2026-08-01`, `1.2.3`, and ranges like `3-5` all need
isolation to stay in order.

## Hebrew typography

**Hebrew has no letter case.** `text-transform: uppercase` silently does nothing. If the design
calls for an uppercase eyebrow or label, that device does not exist here — reach for weight,
size, color, or letter-spacing instead. A Latin-only label in a Hebrew page is usually the wrong
call.

**Go easy on `letter-spacing`.** Hebrew letterforms are wide and squarish with little vertical
variation; positive tracking on Hebrew body text reads as broken rather than airy. Reserve it
for short Latin labels.

**Give it more leading than Latin.** Hebrew has almost no ascenders or descenders, so lines sit
closer together optically. `line-height: 1.7–1.8` for body copy where Latin would take 1.5.

**Fonts.** The project stack is defined in `src/index.css`:

```
"Assistant", "Heebo", ui-sans-serif, system-ui, sans-serif
```

Match it. In an Artifact the CSP blocks font CDNs, so **never link a Google Fonts URL** — it
fails silently and you get an unstyled fallback. Either inline the face as a `@font-face` data
URI, or use a system stack with real Hebrew coverage:

```
"Assistant", "Heebo", "Segoe UI", -apple-system, "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif
```

For a serif display role without a webfont: `"Frank Ruhl Libre", "David Libre", David, serif`.

## Mirror what carries direction

Directional icons must flip: a "next" chevron points **left** in Hebrew, "back" points right.
`lucide-react` ships `ChevronRight` and `ChevronLeft` as separate components — pick per
direction rather than rotating one. Same for arrows in carousels, breadcrumbs and pagination.

Do **not** mirror: logos, clocks, media play buttons, checkmarks, or anything representing a
real-world object that does not itself have handedness.

## Currency and numbers in this project

The shekel sign goes **before** the digits — `₪120` — and all prices route through
`formatPrice()` in `src/App.tsx`, which trims float dust. Don't hand-format money.

Use `font-variant-numeric: tabular-nums` anywhere digits stack in a column, so they align.

## Writing the Hebrew

Write in plain Hebrew, not translated-from-English Hebrew. Prefer active voice and the words a
shopper would actually use. Avoid mixing a Latin technical term into a sentence where a Hebrew
one exists — and when a Latin term genuinely has no Hebrew equivalent, isolate it (see above)
rather than leaving it bare.

## Check before you call it done

- No horizontal scroll on the page body at narrow widths — wide content scrolls in its own
  `overflow-x: auto` container.
- Punctuation at the end of every mixed Hebrew/Latin line sits where you meant it to.
- File paths, versions and phone numbers read in the correct order.
- Borders, badges and any offset element sit on the correct edge — check one at each corner.
- Both light and dark themes, if the page is theme-aware.
