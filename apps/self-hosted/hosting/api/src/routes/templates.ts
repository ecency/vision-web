import { Hono } from 'hono';
import { templateCatalog } from '../style-template-display';

/**
 * Public template catalog for the signup UI's picker. Static data straight
 * from the roster and its display map, so the signup can never carry its own
 * copy of the template list. Cacheable: it changes only on deploy.
 */
export const templateRoutes = new Hono();

templateRoutes.get('/', (c) => {
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ templates: templateCatalog() });
});
