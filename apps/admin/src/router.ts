import { createRouter, createWebHistory } from 'vue-router';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import TablePage from './views/TablePage.vue';
import UsersPage from './views/UsersPage.vue';
import PostsPage from './views/PostsPage.vue';
import RepliesPage from './views/RepliesPage.vue';
import FeedbackTicketsPage from './views/FeedbackTicketsPage.vue';
import AIProvidersPage from './views/AIProvidersPage.vue';
import AIRoutesPage from './views/AIRoutesPage.vue';
import AIJobsPage from './views/AIJobsPage.vue';
import ReplyPresetsPage from './views/ReplyPresetsPage.vue';
import FaqPage from './views/FaqPage.vue';
import FeedbackCategoriesPage from './views/FeedbackCategoriesPage.vue';
import ConfigPage from './views/ConfigPage.vue';
import AuditLogsPage from './views/AuditLogsPage.vue';
import { tokenKey } from './api';

export type AdminMenuItem = {
  path: string;
  label: string;
  resource: string;
  group: string;
};

export type AdminMenuGroup = {
  label: string;
  items: AdminMenuItem[];
};

export const menuGroups: AdminMenuGroup[] = [
  {
    label: '总览',
    items: [{ path: '/dashboard', label: '数据总览', resource: 'dashboard', group: '总览' }],
  },
  {
    label: '内容运营',
    items: [
      { path: '/posts', label: '树洞内容', resource: 'posts', group: '内容运营' },
      { path: '/replies/moderation', label: '回应审核', resource: 'replies', group: '内容运营' },
      { path: '/users', label: '用户管理', resource: 'users', group: '内容运营' },
      { path: '/ops/feedback', label: '反馈工单', resource: 'tickets', group: '内容运营' },
    ],
  },
  {
    label: 'AI 管理',
    items: [
      { path: '/ai/providers', label: 'AI 配置中心', resource: 'providers', group: 'AI 管理' },
      { path: '/ai/routes', label: '风格路由', resource: 'routes', group: 'AI 管理' },
      { path: '/ai/jobs', label: 'AI 任务记录', resource: 'jobs', group: 'AI 管理' },
      { path: '/ops/reply-presets', label: '回复预设', resource: 'presets', group: 'AI 管理' },
    ],
  },
  {
    label: '知识与分类',
    items: [
      { path: '/ops/faqs', label: 'FAQ 管理', resource: 'faqs', group: '知识与分类' },
      { path: '/ops/feedback-categories', label: '反馈分类', resource: 'categories', group: '知识与分类' },
    ],
  },
  {
    label: '体验网络',
    items: [
      { path: '/experience/journeys', label: '现实旅程', resource: 'journeys', group: '体验网络' },
      { path: '/experience/actions', label: '行动承诺', resource: 'actions', group: '体验网络' },
      { path: '/experience/checkins', label: '结果回访', resource: 'checkins', group: '体验网络' },
      { path: '/experience/peers', label: '同路经历', resource: 'peer-experiences', group: '体验网络' },
      { path: '/experience/matches', label: '匹配记录', resource: 'peer-matches', group: '体验网络' },
      { path: '/experience/follow-ups', label: '随访队列', resource: 'follow-ups', group: '体验网络' },
      { path: '/experience/peer-conversations', label: '匿名会话', resource: 'peer-conversations', group: '体验网络' },
      { path: '/experience/notifications', label: '用户提醒', resource: 'notifications', group: '体验网络' },
    ],
  },
  {
    label: '安全与陪伴',
    items: [
      { path: '/safety/events', label: '安全事件', resource: 'safety-events', group: '安全与陪伴' },
      { path: '/safety/support-plans', label: '支持计划', resource: 'support-plans', group: '安全与陪伴' },
      { path: '/safety/memory', label: '有限记忆', resource: 'memory', group: '安全与陪伴' },
    ],
  },
  {
    label: '系统',
    items: [
      { path: '/ops/config', label: '系统设置', resource: 'settings', group: '系统' },
      { path: '/audit-logs', label: '审计日志', resource: 'audit', group: '系统' },
    ],
  },
];

export const menu = menuGroups.flatMap((group) => group.items);

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: Login },
    { path: '/dashboard', component: Dashboard, meta: { title: '数据总览', group: '总览' } },
    { path: '/users', component: UsersPage, meta: { title: '用户管理', group: '内容运营' } },
    { path: '/posts', component: PostsPage, meta: { title: '树洞内容', group: '内容运营' } },
    { path: '/replies/moderation', component: RepliesPage, meta: { title: '回应审核', group: '内容运营' } },
    { path: '/ops/feedback', component: FeedbackTicketsPage, meta: { title: '反馈工单', group: '内容运营' } },
    { path: '/ai/providers', component: AIProvidersPage, meta: { title: 'AI 配置中心', group: 'AI 管理' } },
    { path: '/ai/routes', component: AIRoutesPage, meta: { title: '风格路由', group: 'AI 管理' } },
    { path: '/ai/jobs', component: AIJobsPage, meta: { title: 'AI 任务记录', group: 'AI 管理' } },
    { path: '/ops/reply-presets', component: ReplyPresetsPage, meta: { title: '回复预设', group: 'AI 管理' } },
    { path: '/ops/faqs', component: FaqPage, meta: { title: 'FAQ 管理', group: '知识与分类' } },
    { path: '/ops/feedback-categories', component: FeedbackCategoriesPage, meta: { title: '反馈分类', group: '知识与分类' } },
    { path: '/ops/config', component: ConfigPage, meta: { title: '系统设置', group: '系统' } },
    { path: '/audit-logs', component: AuditLogsPage, meta: { title: '审计日志', group: '系统' } },
    ...menu
      .filter((item) => !['/dashboard', '/users', '/posts', '/replies/moderation', '/ops/feedback', '/ai/providers', '/ai/routes', '/ai/jobs', '/ops/reply-presets', '/ops/faqs', '/ops/feedback-categories', '/ops/config', '/audit-logs'].includes(item.path))
      .map((item) => ({
        path: item.path,
        component: TablePage,
        props: { resource: item.resource, title: item.label },
        meta: { title: item.label, group: item.group },
      })),
  ],
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !localStorage.getItem(tokenKey)) return '/login';
  return true;
});
