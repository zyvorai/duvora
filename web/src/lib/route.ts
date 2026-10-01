import { PAGES, type Page } from './navGroups';

/** Read `#page=devices` (Netra-style shareable hash); anything unknown opens the Overview. */
export function readRoute(hash: string): Page {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const page = params.get('page') || '';
  return (PAGES as readonly string[]).includes(page) ? (page as Page) : 'overview';
}

export function routeHash(page: Page): string {
  return `#page=${page}`;
}
