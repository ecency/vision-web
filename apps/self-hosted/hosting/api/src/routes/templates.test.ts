import { describe, expect, it } from 'vitest';
import { STYLE_TEMPLATES } from '../style-templates';
import { templateRoutes } from './templates';

describe('GET /v1/templates', () => {
  it('serves one card per roster entry with display fields and a single default', async () => {
    const res = await templateRoutes.request('http://localhost/');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age');

    const body = (await res.json()) as {
      templates: Array<{
        id: string;
        name: string;
        tagline: string;
        isDefault: boolean;
        colors: Record<string, string>;
        headingStyle: string;
      }>;
    };

    expect(body.templates.map((t) => t.id).sort()).toEqual(
      [...STYLE_TEMPLATES].sort(),
    );
    expect(body.templates.filter((t) => t.isDefault)).toHaveLength(1);
    for (const t of body.templates) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.tagline.length).toBeGreaterThan(0);
      for (const key of ['background', 'surface', 'accent', 'text']) {
        expect(t.colors[key], `${t.id} colors.${key}`).toBeTruthy();
      }
      expect(['serif', 'sans', 'mono']).toContain(t.headingStyle);
    }
  });
});
