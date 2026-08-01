// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { LINK_EXTENSION } from './editor-extensions';
import {
  hasUnsupportedMarkup,
  htmlToMarkdown,
  markdownToHtml,
} from './markdown';

/**
 * Mirrors the extension list used by EditPostEditor and usePublishEditor. These
 * assertions are about what a post looks like AFTER it has been loaded into the
 * editor and saved again, which is the path that was silently rewriting posts.
 */
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: [
      StarterKit,
      LINK_EXTENSION,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: true }),
    ],
    content: markdownToHtml(markdown),
  });

  try {
    return htmlToMarkdown(editor.getHTML());
  } finally {
    editor.destroy();
  }
}

describe('edit round-trip', () => {
  it('keeps link targets', () => {
    const body = 'See [my post](https://ecency.com/@user/post) here.';
    expect(roundTrip(body)).toBe(body);
  });

  it('keeps a bare link written as markdown', () => {
    expect(roundTrip('[a](https://ecency.com)')).toBe(
      '[a](https://ecency.com)',
    );
  });

  it('keeps single newlines as line breaks', () => {
    expect(roundTrip('Line one\nLine two')).toBe('Line one\nLine two');
  });

  it('keeps a centered image wrapper', () => {
    const body = '<center><img src="https://files.peakd.com/a.jpg"></center>';
    expect(roundTrip(body)).toContain('<center>');
    expect(roundTrip(body)).toContain('https://files.peakd.com/a.jpg');
  });

  it('keeps centering when the image is written as markdown', () => {
    const out = roundTrip(
      '<center>![img](https://files.peakd.com/a.jpg)</center>',
    );
    expect(out).toContain('<center>');
    expect(out).toContain('https://files.peakd.com/a.jpg');
    // The old pipeline escaped the brackets and stored literal text.
    expect(out).not.toContain('\\[');
  });

  it('keeps a centered image that is wrapped in a link', () => {
    const out = roundTrip(
      '<center><a href="https://ecency.com"><img src="https://files.peakd.com/a.jpg"></a></center>',
    );
    expect(out).toContain('<center>');
    expect(out).toContain('https://ecency.com');
    expect(out).toContain('https://files.peakd.com/a.jpg');
  });

  it('does not leak the editor target/rel attributes into the stored body', () => {
    const out = roundTrip(
      '<center><a href="https://ecency.com"><img src="https://files.peakd.com/a.jpg"></a></center>',
    );
    expect(out).not.toContain('target=');
    expect(out).not.toContain('nofollow');
  });

  it('keeps strikethrough', () => {
    expect(roundTrip('Price: ~~$100~~ $80')).toBe('Price: ~~$100~~ $80');
  });

  it('leaves bare URLs alone instead of rewriting them as markdown links', () => {
    expect(roundTrip('see https://ecency.com/faq here')).toBe(
      'see https://ecency.com/faq here',
    );
  });

  it('leaves bare email and www autolinks alone', () => {
    // marked gives these a mailto:/http:// href, so the href does not equal the
    // link text and a naive comparison would rewrite them.
    expect(roundTrip('mail me@example.com now')).toBe(
      'mail me@example.com now',
    );
    expect(roundTrip('visit www.example.com now')).toBe(
      'visit www.example.com now',
    );
  });

  it('keeps an image title and escapes brackets in alt text', () => {
    expect(roundTrip('![a](https://x.co/i.png "the title")')).toContain(
      '"the title"',
    );
    expect(roundTrip('![fig \\[1\\]](https://x.co/i.png)')).toContain('fig');
  });

  it('escapes backslashes in alt text so they cannot escape the closing bracket', () => {
    // An alt ending in a backslash would otherwise emit "...\](src)", where the
    // "\]" escapes the bracket and the image markdown never closes.
    const out = htmlToMarkdown(
      '<p><img src="https://x.co/i.png" alt="trailing\\"></p>',
    );
    expect(out).toBe('![trailing\\\\](https://x.co/i.png)');
    expect(markdownToHtml(out)).toContain('<img');
  });

  it('escapes quotes in an image title so the title cannot be closed early', () => {
    const out = htmlToMarkdown(
      '<p><img src="https://x.co/i.png" alt="a" title=\'say "hi"\'></p>',
    );
    expect(out).toBe('![a](https://x.co/i.png "say \\"hi\\"")');
  });

  it('keeps alignment carried only by data-align', () => {
    // render-helper drops the inline style and keeps data-align, so a post that
    // has been through it would otherwise lose its alignment on the next edit.
    const out = roundTrip('<p data-align="center">centered</p>');
    expect(out).toContain('data-align="center"');
    expect(out).toContain('centered');
  });

  it('round-trips its own aligned output unchanged', () => {
    const body = '<p style="text-align: center;" data-align="center">hi</p>';
    expect(roundTrip(body)).toBe(body);
  });

  it('is idempotent: a second round trip changes nothing', () => {
    const bodies = [
      'See [my post](https://ecency.com/@user/post) here.',
      'Line one\nLine two',
      '<center><img src="https://files.peakd.com/a.jpg"></center>',
      '```js\nconst a = 1;\n```',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      '- one\n- two\n  - nested',
    ];
    for (const body of bodies) {
      const once = roundTrip(body);
      expect(roundTrip(once)).toBe(once);
    }
  });

  it('keeps a pull-left image wrapper', () => {
    const out = roundTrip(
      '<div class="pull-left"><img src="https://files.peakd.com/a.jpg"></div>',
    );
    expect(out).toContain('pull-left');
    expect(out).toContain('https://files.peakd.com/a.jpg');
  });

  it('leaves wrappers holding block content alone rather than nesting them in a paragraph', () => {
    const html = markdownToHtml(
      '<div class="pull-right"><p>one</p><p>two</p></div>',
    );
    expect(html).not.toContain('<p><p>');
  });

  it('keeps code blocks and blockquotes', () => {
    expect(roundTrip('```js\nconst a = 1;\n```')).toBe(
      '```js\nconst a = 1;\n```',
    );
    expect(roundTrip('> quoted text')).toBe('> quoted text');
  });

  it('keeps mentions and tags untouched', () => {
    expect(roundTrip('Hello @alice and #hive')).toBe('Hello @alice and #hive');
  });

  it('keeps table content', () => {
    const out = roundTrip('| a | b |\n| --- | --- |\n| 1 | 2 |');
    for (const cell of ['a', 'b', '1', '2']) {
      expect(out).toContain(`<p>${cell}</p>`);
    }
  });
});

describe('hasUnsupportedMarkup', () => {
  it('flags embeds the editor schema cannot hold', () => {
    expect(
      hasUnsupportedMarkup(
        '<center><iframe src="https://www.youtube.com/embed/abc"></iframe></center>',
      ),
    ).toBe(true);
    expect(hasUnsupportedMarkup('<video src="a.mp4"></video>')).toBe(true);
    expect(hasUnsupportedMarkup('<script>alert(1)</script>')).toBe(true);
  });

  it('flags raw HTML anchors and reference links with rejected schemes', () => {
    // Detection works on the parsed document, so the link syntax used in the
    // source does not matter: DOMPurify drops the href either way.
    expect(hasUnsupportedMarkup('<a href="hive://sign/op">vote</a>')).toBe(
      true,
    );
    expect(hasUnsupportedMarkup('[vote][sign]\n\n[sign]: hive://sign/op')).toBe(
      true,
    );
    expect(hasUnsupportedMarkup('<a href="https://ecency.com">ok</a>')).toBe(
      false,
    );
  });

  it('flags arbitrary HTML the tag list was never going to enumerate', () => {
    expect(
      hasUnsupportedMarkup('<input type="checkbox" checked> accepted'),
    ).toBe(true);
    expect(
      hasUnsupportedMarkup(
        '<figure><img src="https://x.co/a.jpg"><figcaption>cap</figcaption></figure>',
      ),
    ).toBe(true);
    expect(hasUnsupportedMarkup('<abbr title="HyperText">HTML</abbr>')).toBe(
      true,
    );
    expect(hasUnsupportedMarkup('press <kbd>Ctrl</kbd>')).toBe(true);
    expect(hasUnsupportedMarkup('<span class="x">styled</span>')).toBe(true);
    // DOMPurify deletes comments outright, so there is no node left to find.
    expect(hasUnsupportedMarkup('before <!-- note --> after')).toBe(true);
  });

  it('does not promote a non-http image URL into a live attribute', () => {
    // The <img> is built after DOMPurify has run, so its src is not sanitised
    // there. Such a wrapper has to go to the markdown fallback instead.
    expect(
      hasUnsupportedMarkup('<center>![x](javascript:alert(1))</center>'),
    ).toBe(true);
    expect(
      markdownToHtml('<center>![x](javascript:alert(1))</center>'),
    ).not.toContain('src="javascript:');
  });

  it('flags attribute values the schema would drop, not just names', () => {
    // style is kept for alignment but nothing else, so a colour would vanish.
    expect(hasUnsupportedMarkup('<p style="color:red">red</p>')).toBe(true);
    expect(
      hasUnsupportedMarkup('<p style="text-align:center;color:red">x</p>'),
    ).toBe(true);
    expect(hasUnsupportedMarkup('<p style="text-align:center">x</p>')).toBe(
      false,
    );
    // class is kept for a code language but not for an arbitrary class.
    expect(hasUnsupportedMarkup('<pre><code class="foo">x</code></pre>')).toBe(
      true,
    );
    expect(hasUnsupportedMarkup('```js\nconst a = 1;\n```')).toBe(false);
    expect(
      hasUnsupportedMarkup(
        '<table><tbody><tr><td style="color:red">a</td></tr></tbody></table>',
      ),
    ).toBe(true);
  });

  it('flags elements the sanitiser would remove before the walk could see them', () => {
    // Inspection runs on the unsanitised document precisely so these are caught:
    // DOMPurify unwraps <foo> to its text and drops head elements outright.
    expect(hasUnsupportedMarkup('<foo data-x="1">custom</foo>')).toBe(true);
    expect(hasUnsupportedMarkup('<meta name="x" content="y">\n\ntext')).toBe(
      true,
    );
    expect(
      hasUnsupportedMarkup('<link rel="stylesheet" href="x.css">\n\ntext'),
    ).toBe(true);
    expect(hasUnsupportedMarkup('<base href="https://x.co/">\n\ntext')).toBe(
      true,
    );
  });

  it('flags attributes the schema would drop', () => {
    // Tags alone are not enough: these all parse into supported elements but
    // lose an attribute that carries meaning.
    expect(
      hasUnsupportedMarkup('<img src="https://x.co/a.jpg" class="alignright">'),
    ).toBe(true);
    expect(hasUnsupportedMarkup('[a](https://x.co "tip")')).toBe(true);
    expect(hasUnsupportedMarkup('<h2 id="sec">Section</h2>')).toBe(true);
    expect(hasUnsupportedMarkup('<ol reversed><li>a</li></ol>')).toBe(true);
    // marked emits align="left" on the cells, which tables cannot round-trip.
    expect(hasUnsupportedMarkup('| a | b |\n| :-- | --: |\n| 1 | 2 |')).toBe(
      true,
    );
  });

  it('does not flag markup quoted inside code, which round-trips verbatim', () => {
    expect(
      hasUnsupportedMarkup('```html\n<script>alert(1)</script>\n```'),
    ).toBe(false);
    expect(hasUnsupportedMarkup('use `<script>` carefully')).toBe(false);
    expect(hasUnsupportedMarkup('~~~\n<iframe src="x"></iframe>\n~~~')).toBe(
      false,
    );
    // Still caught when it is real markup rather than quoted.
    expect(hasUnsupportedMarkup('hi <script>alert(1)</script> there')).toBe(
      true,
    );
  });

  it('flags markup the schema silently flattens', () => {
    // <details> is the worst of these: flattening it exposes hidden content.
    expect(
      hasUnsupportedMarkup(
        '<details><summary>Spoiler</summary>\n\nhidden\n\n</details>',
      ),
    ).toBe(true);
    expect(hasUnsupportedMarkup('H<sub>2</sub>O')).toBe(true);
    expect(hasUnsupportedMarkup('x<sup>2</sup>')).toBe(true);
    expect(hasUnsupportedMarkup('<u>underlined</u>')).toBe(true);
  });

  it('flags task lists, whose checkbox state has nowhere to live', () => {
    expect(hasUnsupportedMarkup('- [x] done\n- [ ] todo')).toBe(true);
  });

  it('flags hive deep links, whose scheme is rejected on load', () => {
    expect(hasUnsupportedMarkup('[vote](hive://sign/op)')).toBe(true);
  });

  it('flags alignment wrappers that cannot be rebuilt', () => {
    // A caption alongside the image: the old code turned the image markdown
    // into literal "![" text inside a raw HTML paragraph.
    expect(
      hasUnsupportedMarkup(
        '<center>![img](https://x.co/i.png) photo credit</center>',
      ),
    ).toBe(true);
    // Clickable centered banner written as nested markdown (the 3Speak shape).
    expect(
      hasUnsupportedMarkup(
        '<center>[![thumb](https://x.co/t.jpg)](https://3speak.tv/w/x)</center>',
      ),
    ).toBe(true);
    // Blank lines make marked close the HTML block, giving <center><p>...
    expect(
      hasUnsupportedMarkup(
        '<center>\n\n![img](https://x.co/a.jpg)\n\n</center>',
      ),
    ).toBe(true);
    expect(hasUnsupportedMarkup('<center>Thanks for reading!</center>')).toBe(
      true,
    );
    expect(hasUnsupportedMarkup('<center>\n\n# Title\n\n</center>')).toBe(true);
  });

  it('does not flag ordinary posts', () => {
    expect(
      hasUnsupportedMarkup(
        '# Title\n\nSome **body** with [a link](https://x.co)',
      ),
    ).toBe(false);
    expect(
      hasUnsupportedMarkup(
        '<center><img src="https://files.peakd.com/a.jpg"></center>',
      ),
    ).toBe(false);
    expect(
      hasUnsupportedMarkup(
        '<center>![img](https://files.peakd.com/a.jpg)</center>',
      ),
    ).toBe(false);
    expect(
      hasUnsupportedMarkup(
        '<center><a href="https://ecency.com"><img src="https://x.co/a.jpg"></a></center>',
      ),
    ).toBe(false);
    expect(hasUnsupportedMarkup('- one\n- two\n\n> quote')).toBe(false);
    // A realistic post has to stay in the rich editor, or the fallback would
    // effectively replace the editor rather than protect the few posts it must.
    expect(
      hasUnsupportedMarkup(
        '# Title\n\nHello **world**, see [link](https://x.co).\n\n- one\n- two\n\n![img](https://x.co/a.jpg)\n\n> quote\n\n```js\nconst a=1;\n```',
      ),
    ).toBe(false);
    expect(
      hasUnsupportedMarkup(
        '<center><img src="https://files.peakd.com/a.jpg"></center>\n\nCaption below.\n\n@alice mentioned #hive',
      ),
    ).toBe(false);
    expect(hasUnsupportedMarkup('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe(
      false,
    );
    expect(hasUnsupportedMarkup(undefined)).toBe(false);
  });

  it('is the guard that keeps an iframe post out of the lossy path', () => {
    // Documents why the fallback exists: this body still cannot survive the
    // editor, so EditPostEditor must not load it.
    const body = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
    expect(roundTrip(body)).not.toContain('iframe');
    expect(hasUnsupportedMarkup(body)).toBe(true);
  });
});
