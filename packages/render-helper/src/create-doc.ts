import type { Document } from '@xmldom/xmldom'
import { DOMParser } from './consts/dom-parser.const'
import { removeDuplicateAttributes } from './helper'

// Kept out of helper.ts: the shared DOMParser is created at module load, so any
// module importing it brings @xmldom/xmldom into a browser bundle. helper.ts is
// imported by the card image and summary modules, which must stay free of it
// (#2113).

export function createDoc(html: string): Document | null {
  if (html.trim() === '') {
    return null
  }

  // Preprocess to remove duplicate attributes which cause @xmldom/xmldom 0.9+ to throw fatalError
  const cleanedHtml = removeDuplicateAttributes(html)

  // Wrap in body tag to handle multiple root elements
  // This is needed because markdownToHTML can generate multiple top-level elements
  // (e.g., <center>...</center><hr />) which DOMParser doesn't accept without a wrapper
  // Using <body> instead of <div> prevents conflicts with <div> elements in the content
  //
  // @xmldom/xmldom 0.9+ always throws a ParseError from its internal fatalError() path
  // (see dom-parser.js:490) for severely malformed HTML — e.g., mismatched tags like
  // <body>...<p>...</body> — regardless of the onError handler returning undefined.
  // The onError handler only gets to observe; the throw still happens.
  //
  // Wrap in try/catch so that pathologically-malformed post bodies degrade gracefully
  // (no image preload hint) instead of crashing the SSR render of /entry/[...]. Both
  // callers in catch-post-image.ts already handle a null return.
  try {
    return DOMParser.parseFromString(`<body>${cleanedHtml}</body>`, 'text/html')
  } catch {
    return null
  }
}
