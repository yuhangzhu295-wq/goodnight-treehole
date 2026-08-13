export type AdminVisualPage = {
  id: string;
  name: string;
  route: string;
  design: string;
};

export const adminVisualPages: AdminVisualPage[] = [
  { id: '01', name: '01-admin-login', route: '/login', design: 'design_refs/admin/01-admin-login.png' },
  { id: '02', name: '02-admin-dashboard', route: '/dashboard', design: 'design_refs/admin/02-admin-dashboard.png' },
  { id: '03', name: '03-admin-user-list', route: '/users', design: 'design_refs/admin/03-admin-user-list.png' },
  { id: '04', name: '04-admin-post-content', route: '/posts', design: 'design_refs/admin/04-admin-post-content.png' },
  { id: '05', name: '05-admin-reply-moderation', route: '/replies/moderation', design: 'design_refs/admin/05-admin-reply-moderation.png' },
  { id: '06', name: '06-admin-ai-provider-center', route: '/ai/providers', design: 'design_refs/admin/06-admin-ai-provider-center.png' },
  { id: '07', name: '07-admin-ai-style-routing', route: '/ai/routes', design: 'design_refs/admin/07-admin-ai-style-routing.png' },
  { id: '08', name: '08-admin-ai-job-log', route: '/ai/jobs', design: 'design_refs/admin/08-admin-ai-job-log.png' },
  { id: '09', name: '09-admin-feedback-ticket', route: '/ops/feedback', design: 'design_refs/admin/09-admin-feedback-ticket.png' },
  { id: '10', name: '10-admin-system-settings', route: '/ops/config', design: 'design_refs/admin/10-admin-system-settings.png' },
];

export function pickAdminPages(pageId?: string): AdminVisualPage[] {
  if (!pageId) return adminVisualPages;
  const normalized = pageId.padStart(2, '0');
  const page = adminVisualPages.find((item) => item.id === normalized || item.name.startsWith(`${normalized}-`));
  if (!page) throw new Error(`Unknown admin visual page: ${pageId}`);
  return [page];
}
