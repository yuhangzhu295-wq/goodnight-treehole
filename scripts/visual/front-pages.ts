export type FrontVisualPage = {
  id: string;
  name: string;
  route: string;
  design: string;
};

export const frontVisualPages: FrontVisualPage[] = [
  { id: '01', name: '01-square', route: '/pages/square/index', design: 'design_refs/front/01-square.png' },
  { id: '02', name: '02-mood-create', route: '/pages/mood/create', design: 'design_refs/front/02-mood-create.png' },
  { id: '03', name: '03-post-detail', route: '/pages/post/detail?id=post_1', design: 'design_refs/front/03-post-detail.png' },
  {
    id: '04',
    name: '04-post-detail-reply-sheet',
    // The visual runner opens the real detail page first, then activates the
    // visible reply control.  Keeping the route free of `sheet=reply` makes
    // it impossible for a query string to masquerade as the interactive
    // bottom-sheet state.
    route: '/pages/post/detail?id=post_1',
    design: 'design_refs/front/04-post-detail-reply-sheet.png',
  },
  { id: '05', name: '05-letter-today', route: '/pages/letter/index', design: 'design_refs/front/05-letter-today.png' },
  { id: '06', name: '06-tool-index', route: '/pages/tool/index', design: 'design_refs/front/06-tool-index.png' },
  { id: '07', name: '07-tool-decompose', route: '/pages/tool/decompose', design: 'design_refs/front/07-tool-decompose.png' },
  { id: '08', name: '08-me', route: '/pages/me/index', design: 'design_refs/front/08-me.png' },
  { id: '09', name: '09-diary-list', route: '/pages/diary/index', design: 'design_refs/front/09-diary-list.png' },
  { id: '10', name: '10-report-month', route: '/pages/report/month', design: 'design_refs/front/10-report-month.png' },
  { id: '11', name: '11-letter-list', route: '/pages/letter/list', design: 'design_refs/front/11-letter-list.png' },
  { id: '12', name: '12-favorite-list', route: '/pages/favorite/index', design: 'design_refs/front/12-favorite-list.png' },
  { id: '13', name: '13-privacy-settings', route: '/pages/settings/privacy', design: 'design_refs/front/13-privacy-settings.png' },
  { id: '14', name: '14-feedback-help', route: '/pages/help/feedback', design: 'design_refs/front/14-feedback-help.png' },
];

export function pickPages(pageId?: string): FrontVisualPage[] {
  if (!pageId) return frontVisualPages;
  const normalized = pageId.padStart(2, '0');
  const page = frontVisualPages.find((item) => item.id === normalized || item.name.startsWith(`${normalized}-`));
  if (!page) throw new Error(`Unknown front visual page: ${pageId}`);
  return [page];
}
