// Where code sits in markdown source, read line by line without the parser:
// shared by the renderer (entity handling outside code) and the summary text
// (literal tags inside code), which must not load the parser.

// The containers a line sits in, outermost first: QUOTE for a blockquote
// marker, or a list item's content width (marker, its indent and the spaces
// after it). Read with a moving index, never a pattern: a line of thousands
// of list markers is one pass (an earlier pattern backtracked on it).
const QUOTE = -1
const isSpace = (line: string, at: number) => line.charCodeAt(at) === 0x20

function readContainers(
  line: string,
  from = 0,
  fromColumn = 0,
  carriedIndent = 0
): { containers: number[]; at: number; column: number; carry: number } {
  const containers: number[] = []
  let at = from
  // Columns, not characters: a tab after a list marker indents to the next
  // multiple of four, as the parser counts it. Containers hold content widths
  // in columns, which insideContainers strips the same way.
  let column = fromColumn
  for (let first = true; ; first = false) {
    // Columns of indent a tab already covered before `from` count as indent.
    let indent = first ? carriedIndent : 0
    const spacesFrom = indent
    while (indent < 4 && isSpace(line, at + indent - spacesFrom)) indent++
    if (indent > 3) break
    const markerAt = at + indent - spacesFrom
    const c = line[markerAt]
    if (c === '>') {
      containers.push(QUOTE)
      at = markerAt + 1
      column += indent - spacesFrom + 1
      if (isSpace(line, at)) {
        at++
        column++
      }
      continue
    }
    let markerLength = 0
    if (c === '-' || c === '*' || c === '+') {
      markerLength = 1
    } else {
      let d = markerAt
      while (d - markerAt < 9 && line.charCodeAt(d) >= 0x30 && line.charCodeAt(d) <= 0x39) d++
      if (d > markerAt && (line[d] === '.' || line[d] === ')')) markerLength = d - markerAt + 1
    }
    if (markerLength === 0) break
    const afterMarker = column + indent - spacesFrom + markerLength
    let gapColumns = 0
    let gapChars = 0
    while (gapColumns < 5) {
      const g = line[markerAt + markerLength + gapChars]
      if (g === ' ') gapColumns++
      else if (g === '\t') gapColumns += 4 - ((afterMarker + gapColumns) % 4)
      else break
      gapChars++
    }
    if (gapChars === 0) break
    // Five or more columns after the marker: the content starts one column
    // in, and the rest is an indented code block.
    const wide = gapColumns >= 5
    const width = indent + markerLength + (wide ? 1 : gapColumns)
    containers.push(width)
    at = markerAt + markerLength + (wide ? 1 : gapChars)
    column += width - spacesFrom
    if (wide) {
      // A tab there is consumed whole but the content starts one column in:
      // its other columns count as indent of what follows (so `-\t\t~~~` is
      // indented code, not a fence). Nothing after a wide gap opens a container.
      if (line[at - 1] === '\t') {
        const tabWidth = 4 - (afterMarker % 4)
        return { containers, at, column: column + tabWidth - 1, carry: tabWidth - 1 }
      }
      break
    }
  }
  // No container read: the carried indent still counts before the content.
  return { containers, at, column, carry: containers.length === 0 ? carriedIndent : 0 }
}

// Where a line's content starts inside `containers`: its index, its column,
// and the columns of a tab that ran past the last container's indent (they
// count as indent of what follows). A blockquote needs its `>`, a list item its
// content indent, and a blank line stays in the item; a tab indents to the
// next multiple of four columns, as the parser counts it. A line outside the
// containers has at = -1, and `matched`/`prefixAt` say how many of them it is
// still inside and where that prefix ends, for a caller that falls back to the
// enclosing item.
type Inside = { at: number; column: number; carry: number; matched: number; prefixAt: number }

function insideContainersAt(line: string, containers: number[], blank: boolean): Inside {
  let at = 0
  let column = 0
  let carry = 0
  for (let k = 0; k < containers.length; k++) {
    const container = containers[k]
    const prefix = { at: -1, column, carry, matched: k, prefixAt: at }
    if (container === QUOTE) {
      let indent = 0
      while (indent < 4 && isSpace(line, at + indent)) indent++
      if (indent > 3 || line[at + indent] !== '>') return prefix
      at += indent + 1
      column += indent + 1
      carry = 0
      if (isSpace(line, at)) {
        at++
        column++
      }
    } else {
      if (blank) return { at: line.length, column, carry: 0, matched: containers.length, prefixAt: line.length }
      let needed = container - carry
      carry = 0
      while (needed > 0) {
        if (isSpace(line, at)) {
          at++
          column++
          needed--
        } else if (line[at] === '\t') {
          const width = 4 - (column % 4)
          at++
          column += width
          needed -= width
        } else {
          return prefix
        }
      }
      carry = -needed
    }
  }
  return { at, column, carry, matched: containers.length, prefixAt: at }
}

// The fence run (``` or ~~~, three or more) a line has at `at` after up to
// three columns of indent, or null. `column` is where `at` sits on the line
// and `carried` the columns a tab before `at` already indents past the
// container, so a tab counts to the next four-column stop as the parser reads it.
function fenceAt(line: string, at: number, column = 0, carried = 0): { char: string; length: number; end: number } | null {
  let indent = carried
  let col = column
  let start = at
  while (indent <= 3) {
    if (isSpace(line, start)) {
      indent++
      col++
    } else if (line[start] === '\t') {
      const width = 4 - (col % 4)
      indent += width
      col += width
    } else {
      break
    }
    start++
  }
  if (indent > 3) return null
  const char = line[start]
  if (char !== '`' && char !== '~') return null
  let end = start
  while (line[end] === char) end++
  return end - start >= 3 ? { char, length: end - start, end } : null
}

/**
 * Code in the markdown source, as [start, end) ranges in order: fenced blocks
 * (``` or ~~~ at a line start, inside blockquotes and list items too, to the
 * matching close, the end of the container it sits in, or the end) and inline
 * code spans (a backtick run to the next run of the same length). Linear: each
 * line is read once, and each backtick run is paired through a precomputed
 * "next run of the same length" table rather than a search.
 */
export function codeRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const runs: Array<[number, number]> = [] // [start, length] of backtick runs outside fences
  // The containers of the last list item opened, for its continuation lines
  // (`- item`, blank, then an indented fence).
  let item: number[] | null = null
  let pos = 0
  while (pos < src.length) {
    const eol = src.indexOf('\n', pos)
    const lineEnd = eol === -1 ? src.length : eol
    const line = src.slice(pos, lineEnd)
    const blank = line.trim() === ''
    let containers: number[] = []
    let open: ReturnType<typeof fenceAt> = null
    const read = readContainers(line)
    if (read.containers.length > 0) {
      containers = read.containers
      open = fenceAt(line, read.at, read.column)
      // A quote line outside the item ends it.
      item = containers.some((c) => c !== QUOTE) ? containers : null
    } else if (!blank) {
      if (item) {
        let inside = insideContainersAt(line, item, false)
        if (inside.at === -1 && inside.matched > 0) {
          // Out of the innermost item but still inside an enclosing one (a
          // fence back at the parent's indent after nested bullets).
          item = item.slice(0, inside.matched)
          inside = { ...inside, at: inside.prefixAt }
        }
        if (inside.at === -1) {
          item = null
        } else {
          // A nested item on the parent's continuation line (`- a`, then
          // `\t- ```` or `  - ````), its markers read from the right column.
          const nested = readContainers(line, inside.at, inside.column, inside.carry)
          if (nested.containers.length > 0) {
            containers = [...item, ...nested.containers]
            open = fenceAt(line, nested.at, nested.column, nested.carry)
            if (nested.containers.some((c) => c !== QUOTE)) item = containers
          } else if ((open = fenceAt(line, inside.at, inside.column, inside.carry))) {
            containers = item
          }
        }
      }
      if (!open) open = fenceAt(line, 0)
    }
    if (open) {
      const fence = open
      let end = src.length
      let p = lineEnd + 1
      while (p < src.length) {
        const e = src.indexOf('\n', p)
        const le = e === -1 ? src.length : e
        const next = src.slice(p, le)
        // The fence ends with its container: a quote line without `>`, a
        // list item line indented less than the item's content.
        const inside = insideContainersAt(next, containers, next.trim() === '')
        const at = inside.at
        if (at === -1) {
          end = p - 1
          break
        }
        const close = fenceAt(next, at, inside.column, inside.carry)
        if (close && close.char === fence.char && close.length >= fence.length && next.slice(close.end).trim() === '') {
          end = le
          break
        }
        p = le + 1
      }
      ranges.push([pos, end])
      pos = end + 1
      continue
    }
    for (let i = pos; i < lineEnd; i++) {
      if (src.charCodeAt(i) !== 0x60) continue
      let j = i
      while (j < lineEnd && src.charCodeAt(j) === 0x60) j++
      runs.push([i, j - i])
      i = j - 1
    }
    pos = lineEnd + 1
  }
  // Inline spans: a run opens a span closed by the next run of the same length.
  const nextSame: number[] = new Array(runs.length).fill(-1)
  const lastOfLength = new Map<number, number>()
  for (let k = runs.length - 1; k >= 0; k--) {
    nextSame[k] = lastOfLength.get(runs[k][1]) ?? -1
    lastOfLength.set(runs[k][1], k)
  }
  for (let k = 0; k < runs.length; k++) {
    const close = nextSame[k]
    if (close === -1) continue
    ranges.push([runs[k][0], runs[close][0] + runs[close][1]])
    k = close
  }
  return ranges.sort((a, b) => a[0] - b[0])
}
