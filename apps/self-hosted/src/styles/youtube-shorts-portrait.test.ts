import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * YouTube Shorts are 9:16 but share the /embed/<id> URL of a landscape video,
 * so render-helper tags the wrapper with markdown-video-link-youtube-portrait
 * from the posted /shorts/ link (issue #1271). Blog posts render with
 * embedVideosDirectly, so the stylesheet is the only thing that can size the
 * player; without this rule the base 16:9 box pillarboxes every Short.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'blog-markdown.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

describe('YouTube Shorts portrait rule', () => {
  it('sizes the portrait modifier 9:16 with the shared portrait max width', () => {
    const match = CSS.match(
      /\.markdown-body \.markdown-video-link-youtube\.markdown-video-link-youtube-portrait\s*\{([^}]*)\}/
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/padding-bottom:\s*0/);
    expect(body).toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
    expect(body).toMatch(/height:\s*auto/);
    expect(body).toMatch(/max-width:\s*360px/);
  });

  it('keeps pasted Shorts iframes (portrait-embed) out of the 16:9 fallback', () => {
    expect(CSS).toMatch(/\.markdown-body iframe\.portrait-embed\s*\{[^}]*aspect-ratio:\s*9\s*\/\s*16/);
  });
});
