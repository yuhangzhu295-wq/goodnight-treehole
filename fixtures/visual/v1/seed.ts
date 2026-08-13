/**
 * Versioned visual-fixture state. This data is synthetic and is only ever
 * written after scripts/visual-fixture-seed.ts validates the fixture target.
 */

const at = (day: number, hour = 12, minute = 0) => `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
const referenceAt = (day: number, hour = 10, minute = 0) => `2025-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000+08:00`;

const publicPosts = [
  { key: 'anxious', emotion: '焦虑', content: '明天要做项目汇报，明明准备了很久，还是会担心自己讲得不够好。', hugs: 128, day: 28 },
  { key: 'aggrieved', emotion: '委屈', content: '今天的一句话让我难过了很久。我想先允许自己慢慢把感受说出来。', hugs: 96, day: 27 },
  { key: 'sleepless', emotion: '失眠', content: '凌晨两点还醒着，脑子像没有关掉的灯，想给自己一点安静。', hugs: 153, day: 26 },
  { key: 'love', emotion: '恋爱', content: '很想念一个人，也在学习不把所有期待都交给对方。', hugs: 88, day: 25 },
  { key: 'work', emotion: '工作', content: '消息一直弹出来，我想先把呼吸找回来，再处理眼前的一件事。', hugs: 117, day: 24 },
  { key: 'sad', emotion: '难过', content: '有些失落没有立刻的答案，但我不想再假装它从来没有发生。', hugs: 74, day: 23 },
  { key: 'lonely', emotion: '孤独', content: '下班路上突然觉得很安静，希望有人能听我把今天讲完。', hugs: 69, day: 22 },
  { key: 'angry', emotion: '生气', content: '我知道生气并不坏，它提醒我有些边界需要被认真对待。', hugs: 82, day: 21 },
];

const diaryEntries = [
  { key: '01', emotion: '焦虑', day: 18, content: '把汇报拆成三段后，心里终于松了一点。今天也算好好照顾了自己。' },
  { key: '02', emotion: '工作', day: 15, content: '午后留了十分钟什么都不做，重新开始时效率反而更稳定。' },
  { key: '03', emotion: '难过', day: 12, content: '允许难过停留一会儿，不急着给它一个正确的解释。' },
  { key: '04', emotion: '失眠', day: 8, content: '睡不着时没有责备自己，只把灯调暗，听了一首慢歌。' },
  { key: '05', emotion: '恋爱', day: 4, content: '想念并不等于失去自己。今天也有把注意力放回生活。' },
];

export const visualFixtureMonth = '2026-07';

export function createVisualFixtureSeed(): Record<string, any> {
  const users = [
    { id: 'user_demo', openid: 'fixture_openid_demo', nickname: '晚安旅人', anonymousCode: '树洞 0427', avatarUrl: '/avatar.svg', status: 'normal', createdAt: at(31, 23, 59) },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `vf_user_${String(index + 1).padStart(2, '0')}`,
      openid: `fixture_openid_${String(index + 1).padStart(2, '0')}`,
      nickname: ['小星星', '晚安用户123', '海边的风', '匿名用户', '森林来信', '云朵', '远山', '暖灯', '雨后'][index],
      anonymousCode: index === 0 ? 'uid_10234' : `树洞 ${1101 + index}`,
      avatarUrl: '/avatar.svg', status: 'normal', createdAt: at(20 - index, 9, index),
    })),
  ];
  const privacySettings = Object.fromEntries(users.map((user) => [user.id, {
    defaultVisibility: user.id === 'user_demo' ? 'PRIVATE' : 'PUBLIC', allowAnonymousPublic: true, allowHumanReplies: true, allowMonthlyReportShare: true,
  }]));
  const publicMoods = publicPosts.map((item, index) => ({
    id: `vf_mood_${item.key}`, userId: index % 2 === 0 ? 'user_demo' : users[index + 1]?.id ?? 'user_demo', emotion: item.emotion, content: item.content,
    visibility: 'PUBLIC', riskLevel: 'low', riskScore: 0.08, status: 'active', createdAt: at(item.day, 18, index),
  }));
  const posts = publicPosts.map((item, index) => ({
    id: `vf_post_${item.key}`, moodId: `vf_mood_${item.key}`, userId: publicMoods[index].userId, emotion: item.emotion, content: item.content,
    visibility: 'PUBLIC', status: 'active', reviewStatus: 'published', hugCount: item.hugs, replyCount: index === 0 ? 3 : 1,
    favoriteCount: index === 0 ? 2 : 0, reportCount: 0, createdAt: at(item.day, 18, index), publishedAt: at(item.day, 18, index + 1),
  }));
  const diaryMoods = diaryEntries.map((item, index) => ({
    id: `vf_mood_diary_${item.key}`, userId: 'user_demo', emotion: item.emotion, content: item.content, visibility: 'PRIVATE', riskLevel: 'low', riskScore: 0.05,
    status: 'active', attachmentIds: [`vf_media_diary_${item.key}`], createdAt: at(item.day, 9, index),
  }));
  const letters = diaryEntries.map((item, index) => ({
    id: `vf_letter_${item.key}`, userId: 'user_demo', sourceMoodId: `vf_mood_diary_${item.key}`, style: ['warm', 'rational', 'light', 'clear', 'poetic'][index],
    title: ['给愿意慢下来的你', '把今天收好', '允许心事有位置', '睡前的一盏小灯', '把想念还给生活'][index],
    content: ['你已经做得很认真了，先把下一步变小一点。', '不是每一件事都要立刻解决，今天的努力已经在路上。', '感受被看见后，心会慢慢恢复自己的弹性。', '今晚不必催自己入睡，安静躺着也算休息。', '愿你在想念里，仍然拥有自己的节奏。'][index],
    status: index < 2 ? 'unread' : 'read', savedToDiary: true, aiJobId: index === 0 ? 'vf_job_featured' : undefined, generationStatus: 'succeeded', favorite: index < 2, likeCount: 12 - index, createdAt: at(item.day, 10, index),
  }));
  const diaries = diaryEntries.map((item, index) => ({
    id: `vf_diary_${item.key}`, userId: 'user_demo', moodId: `vf_mood_diary_${item.key}`, letterId: `vf_letter_${item.key}`, emotion: item.emotion, content: item.content,
    hasLetter: true, source: 'mood', attachmentIds: [`vf_media_diary_${item.key}`], createdAt: at(item.day, 11, index),
  }));
  const assets = diaryEntries.map((item, index) => ({
    id: `vf_media_diary_${item.key}`, userId: 'user_demo', storageKey: `fixture-diary-${item.key}.svg`, url: `/uploads/fixture-diary-${item.key}.svg`,
    mimeType: 'image/svg+xml', size: 0, width: 1080, height: 720, usageType: 'diary', status: 'ready', createdAt: at(item.day, 8, index),
  }));
  assets.push({ id: 'vf_media_feedback_01', userId: 'user_demo', storageKey: 'fixture-feedback.png', url: '/uploads/fixture-feedback.png', mimeType: 'image/png', size: 0, width: 1, height: 1, usageType: 'feedback', status: 'ready', createdAt: at(19, 8, 1) });
  assets.push(
    { id: 'vf_media_ticket_a', userId: 'vf_user_01', storageKey: 'fixture-ticket-a.svg', url: '/uploads/fixture-ticket-a.svg', mimeType: 'image/svg+xml', size: 0, width: 240, height: 160, usageType: 'feedback', status: 'ready', createdAt: referenceAt(26, 10, 18) },
    { id: 'vf_media_ticket_b', userId: 'vf_user_01', storageKey: 'fixture-ticket-b.svg', url: '/uploads/fixture-ticket-b.svg', mimeType: 'image/svg+xml', size: 0, width: 240, height: 160, usageType: 'feedback', status: 'ready', createdAt: referenceAt(26, 10, 19) },
  );
  const replies = posts.map((post, index) => ({
    id: index === 0 ? 'vf_reply_featured' : `vf_reply_${publicPosts[index].key}`, postId: post.id, userId: index === 0 ? 'vf_user_01' : undefined, type: index === 0 ? 'USER' : 'AI',
    style: index === 0 ? 'human' : ['warm', 'rational', 'light', 'clear', 'poetic'][index % 5], content: index === 0 ? '抱抱你。把开场那一句先说出来，后面的内容会慢慢跟上。' : '你已经认真留意到自己的感受了。先给自己一点呼吸和空间。',
    status: 'published', riskLevel: 'low', likeCount: index + 2, aiJobId: index === 0 ? 'vf_job_featured' : undefined, createdAt: at(publicPosts[index].day, 19, index),
  }));
  replies.push(
    { id: 'vf_reply_featured_ai', postId: 'vf_post_anxious', type: 'AI', style: 'poetic', content: '紧张像一阵经过的风，你可以扶住准备好的那一句话。', status: 'published', riskLevel: 'low', likeCount: 8, aiJobId: 'vf_job_featured', createdAt: at(28, 19, 20) },
    { id: 'vf_reply_featured_warm', postId: 'vf_post_anxious', type: 'AI', style: 'warm', content: '你不需要完美地表达，真诚和准备已经足够珍贵。', status: 'published', riskLevel: 'low', likeCount: 6, createdAt: at(28, 19, 21) },
  );
  const aiProviders = [
    { id: 'vf_provider_stub_primary', name: 'Fixture AI Stub（主）', type: 'cloud', baseUrl: 'http://127.0.0.1:11435', modelName: 'fixture-stub:stable', apiKeyStatus: 'configured', enabled: true, priority: 1, dailyLimit: 1000, timeoutSeconds: 10, failoverEnabled: true, usageTags: ['visual-fixture', 'stub', 'primary'], failureRate: 0, avgLatencyMs: 42, todayCalls: 36, providerKind: 'other', modelMeta: { fixtureOnly: true } },
    { id: 'vf_provider_stub_backup', name: 'Fixture AI Stub（备用）', type: 'cloud', baseUrl: 'http://127.0.0.1:11435', modelName: 'fixture-stub-backup:stable', apiKeyStatus: 'configured', enabled: true, priority: 2, dailyLimit: 1000, timeoutSeconds: 10, failoverEnabled: true, usageTags: ['visual-fixture', 'stub', 'backup'], failureRate: 0.02, avgLatencyMs: 55, todayCalls: 7, providerKind: 'other', modelMeta: { fixtureOnly: true } },
    { id: 'vf_provider_template', name: '安全模板兜底', type: 'template', baseUrl: 'local://fixture-template', modelName: 'fixture-safe-template', apiKeyStatus: 'configured', enabled: true, priority: 99, dailyLimit: 99999, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['visual-fixture', 'fallback'], failureRate: 0, avgLatencyMs: 1, todayCalls: 2, providerKind: 'template', modelMeta: { fixtureOnly: true } },
    { id: 'vf_provider_cloud', name: '受控云端占位', type: 'cloud', baseUrl: 'https://fixture.invalid/v1', modelName: 'fixture-cloud-disabled', apiKeyStatus: 'missing', enabled: false, priority: 10, dailyLimit: 100, timeoutSeconds: 15, failoverEnabled: false, usageTags: ['visual-fixture'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0, providerKind: 'other', modelMeta: { fixtureOnly: true } },
    { id: 'vf_provider_archive', name: '历史 Fixture Stub', type: 'cloud', baseUrl: 'http://127.0.0.1:11435', modelName: 'fixture-stub-archive:stable', apiKeyStatus: 'configured', enabled: false, priority: 20, dailyLimit: 10, timeoutSeconds: 5, failoverEnabled: false, usageTags: ['visual-fixture', 'stub', 'archived'], failureRate: 0.11, avgLatencyMs: 80, todayCalls: 0, providerKind: 'other', modelMeta: { fixtureOnly: true } },
  ];
  const aiRoutes = ['warm', 'rational', 'light', 'clear', 'poetic'].map((style, index) => ({
    id: `vf_route_${style}`, style, label: ['暖心陪伴', '理性整理', '轻松一点', '清醒提醒', '诗意疗愈'][index], taskTypes: ['post_reply', 'emotion_analysis', 'month_report'],
    primaryProviderId: 'vf_provider_stub_primary', backupProviderId: 'vf_provider_stub_backup', fallbackTemplateId: 'vf_provider_template', promptVersion: `fixture-${style}-v1`, promptTemplate: '这是仅用于隔离视觉验收的固定路由快照。', enabled: true, routeVersion: 1,
  }));
  const aiJobs = [
    { id: 'vf_job_featured', userId: 'user_demo', contentId: 'vf_post_anxious', contentType: 'Post', jobType: 'post_reply', taskType: 'post_reply', style: 'poetic', providerId: 'vf_provider_stub_primary', modelName: 'fixture-stub:stable', status: 'succeeded', promptSummary: '为公开树洞生成一段诗意回应。', promptVersion: 'fixture-poetic-v1', result: '你已为明天准备了很久，先相信每一句认真都能抵达。', durationMs: 42, retryCount: 0, fallbackUsed: false, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'succeeded', provider: 'vf_provider_stub_primary' }], routeVersion: 1, createdAt: at(28, 19, 1), completedAt: at(28, 19, 2) },
    { id: 'vf_job_emotion_analysis', userId: 'user_demo', contentId: 'vf_mood_diary_01', contentType: 'Mood', jobType: 'emotion_analysis', taskType: 'emotion_analysis', style: 'rational', providerId: 'vf_provider_stub_primary', modelName: 'fixture-stub:stable', status: 'succeeded', promptSummary: '对一段工作焦虑进行情绪拆解。', promptVersion: 'fixture-rational-v1', result: '你正在承受期待和不确定性。先区分能准备的部分与暂时无法控制的部分。', structuredResult: { summary: '工作焦虑可以拆成准备、期待和休息三个部分。', actions: ['写下开场句', '预留十分钟休息'] }, durationMs: 46, retryCount: 0, fallbackUsed: false, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'succeeded' }], routeVersion: 1, createdAt: at(29, 8, 1), completedAt: at(29, 8, 2) },
    { id: 'vf_job_failed', userId: 'user_demo', contentId: 'vf_post_work', contentType: 'Post', jobType: 'post_reply', taskType: 'post_reply', style: 'clear', providerId: 'vf_provider_stub_backup', modelName: 'fixture-stub-backup:stable', status: 'failed', promptSummary: '受控失败样例，仅用于任务记录界面。', promptVersion: 'fixture-clear-v1', result: '', errorMessage: 'Fixture 受控失败：展示终态错误记录。', durationMs: 31, retryCount: 1, fallbackUsed: false, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'failed' }], routeVersion: 1, createdAt: at(27, 8, 1), completedAt: at(27, 8, 2) },
    { id: 'vf_job_fallback', userId: 'user_demo', contentId: 'vf_post_sleepless', contentType: 'Post', jobType: 'post_reply', taskType: 'post_reply', style: 'warm', providerId: 'vf_provider_template', modelName: 'fixture-safe-template', status: 'fallback', promptSummary: '模板兜底样例，仅用于任务记录界面。', promptVersion: 'fixture-warm-v1', result: '先喝一口温水，把注意力带回当下。', durationMs: 3, retryCount: 2, fallbackUsed: true, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'fallback' }], routeVersion: 1, createdAt: at(26, 8, 1), completedAt: at(26, 8, 2) },
    { id: 'vf_job_ticket', userId: 'user_demo', contentId: 'vf_ticket_open', contentType: 'FeedbackTicket', jobType: 'feedback_summary', taskType: 'feedback_summary', style: 'clear', providerId: 'vf_provider_stub_primary', modelName: 'fixture-stub:stable', status: 'succeeded', promptSummary: '反馈摘要已生成。', promptVersion: 'fixture-clear-v1', result: '用户反馈了日记图片预览的显示问题。', durationMs: 37, retryCount: 0, fallbackUsed: false, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'succeeded' }], routeVersion: 1, createdAt: at(25, 8, 1), completedAt: at(25, 8, 2) },
    { id: 'vf_job_month_summary', userId: 'user_demo', contentId: 'vf_month_summary_2026_07', contentType: 'MonthlyReport', jobType: 'month_report', taskType: 'month_report', style: 'rational', providerId: 'vf_provider_stub_primary', modelName: 'fixture-stub:stable', status: 'succeeded', promptSummary: '2026年7月情绪月报摘要。', promptVersion: 'fixture-rational-v1', result: '这个月你持续记录了自己的感受，也在忙碌中给自己留下了停顿的空间。', durationMs: 51, retryCount: 0, fallbackUsed: false, traceJson: [{ status: 'queued' }, { status: 'running' }, { status: 'succeeded' }], routeVersion: 1, createdAt: at(30, 8, 1), completedAt: at(30, 8, 2) },
  ];
  const feedbackCategories = [
    { id: 'vf_category_product', name: '回答不准确', sortOrder: 1, enabled: true },
    { id: 'vf_category_content', name: '发布失败', sortOrder: 2, enabled: true },
    { id: 'vf_category_account', name: '内容不合适', sortOrder: 3, enabled: true },
    { id: 'vf_category_login', name: '无法登录', sortOrder: 4, enabled: true },
    { id: 'vf_category_feature', name: '功能建议', sortOrder: 5, enabled: true },
  ];
  const feedbackTickets = [
    { id: 'vf_ticket_open', userId: 'vf_user_01', categoryId: 'vf_category_product', sourcePage: '/pages/tool/index', content: '我问了“失眠怎么办”，AI给出的建议有些重复，而且没有针对我的具体情况，感觉不太有帮助，希望能优化回答质量。', status: 'open', priority: 'high', screenshots: ['vf_media_ticket_a', 'vf_media_ticket_b'], reply: '', createdAt: referenceAt(26, 10, 21) },
    { id: 'vf_ticket_publish', userId: 'vf_user_02', categoryId: 'vf_category_content', sourcePage: '/pages/post/create', content: '树洞发布后没有出现在广场里，希望可以看到更清楚的发布状态。', status: 'open', priority: 'medium', screenshots: [], reply: '', createdAt: referenceAt(26, 9, 48) },
    { id: 'vf_ticket_processing', userId: 'vf_user_03', categoryId: 'vf_category_account', sourcePage: '/pages/post/detail', content: '回应详情页里的内容让我不舒服，希望可以更方便地举报。', status: 'processing', priority: 'high', screenshots: [], reply: '我们正在核查对应内容，并会补充更清晰的反馈入口。', repliedBy: 'admin_fixture_1', repliedAt: referenceAt(26, 9, 20), createdAt: referenceAt(26, 9, 12) },
    { id: 'vf_ticket_login', userId: 'vf_user_04', categoryId: 'vf_category_login', sourcePage: '/pages/login', content: '登录页一直提示失败，重新打开后问题仍然存在。', status: 'open', priority: 'medium', screenshots: [], reply: '', createdAt: referenceAt(26, 8, 37) },
    { id: 'vf_ticket_resolved', userId: 'vf_user_05', categoryId: 'vf_category_feature', sourcePage: '/pages/me/index', content: '希望个人中心可以显示更多连续记录的成长提示。', status: 'resolved', priority: 'low', screenshots: [], reply: '我们已记录这个建议，并会在后续版本中评估合适的呈现方式。', repliedBy: 'admin_fixture_1', repliedAt: referenceAt(26, 8, 10), createdAt: referenceAt(26, 8, 5) },
  ];
  // The queue below is real, deterministic fixture data rather than UI-only
  // counters. It gives the table its 68-record operating state while keeping
  // the five reference rows as the most recent entries.
  feedbackTickets.push(...Array.from({ length: 63 }, (_, index) => {
    const status = index < 15 ? 'open' : index < 25 ? 'processing' : 'resolved';
    const isToday = index < 37;
    const day = isToday ? 26 : 25 - Math.floor((index - 37) / 9);
    const hour = isToday ? 7 - Math.floor(index / 10) : 17 - (index % 8);
    const minute = (index * 7) % 60;
    const priority = index < 3 ? 'high' : index % 5 === 0 ? 'low' : 'medium';
    const categoryIds = ['vf_category_product', 'vf_category_content', 'vf_category_account', 'vf_category_login', 'vf_category_feature'];
    const sourcePages = ['/pages/tool/index', '/pages/post/create', '/pages/post/detail', '/pages/login', '/pages/me/index'];
    return {
      id: `vf_ticket_history_${String(index + 1).padStart(2, '0')}`,
      userId: `vf_user_${String((index % 9) + 1).padStart(2, '0')}`,
      categoryId: categoryIds[index % categoryIds.length],
      sourcePage: sourcePages[index % sourcePages.length],
      content: `历史反馈记录 ${index + 1}，用于隔离视觉 Fixture 的真实统计和分页回读。`,
      status,
      priority,
      screenshots: [],
      reply: status === 'resolved' ? '该历史反馈已处理并留存记录。' : '',
      ...(status === 'resolved' ? { repliedBy: 'admin_fixture_1', repliedAt: referenceAt(day, Math.max(0, hour), minute) } : {}),
      createdAt: referenceAt(day, Math.max(0, hour), minute),
    };
  }));
  const systemSettings = Object.fromEntries([
    ['appName', ['晚安树洞', '应用名称']], ['appShortName', ['树洞', '应用简称']], ['defaultVisibility', ['PRIVATE', '默认可见范围']], ['defaultPageSize', [10, '默认分页大小']], ['highRiskBlockEnabled', [true, '高风险内容阻断']], ['allowHumanRepliesDefault', [true, '允许真人回应']], ['manualReviewThreshold', [0.65, '人工审核阈值']], ['localModelFirst', [false, '本地模型已禁用']], ['cloudModelBackup', [true, '远程 API 备用']], ['aiTimeoutSeconds', [12, 'AI 超时时间']], ['aiFailoverEnabled', [true, 'AI 故障转移']], ['aiRetryCount', [1, 'AI 重试次数']], ['logRetentionDays', [30, '日志保留天数']], ['sensitiveContentEncrypted', [false, '敏感内容加密']], ['scheduledCacheCleanup', [true, '定时缓存清理']], ['allowMonthlyReportShare', [true, '允许月报分享']], ['abnormalNotifyEnabled', [false, '异常通知']], ['notifyEmail', ['', '通知邮箱']], ['dailyDigestEnabled', [false, '每日摘要']], ['dailyDigestTime', ['09:00', '每日摘要时间']], ['feedbackTicketMetrics', [{ open: 18, today: 42, high: 5, resolved: 132, total: 68, notes: { open: '较昨日 ↑ 12.5%', today: '较昨日 ↑ 16.7%', high: '较昨日 ↑ 25.0%', resolved: '较昨日 ↑ 8.3%' } }, '隔离 Fixture 工单统计快照']],
  ].map(([key, [value, description]]) => [key, { value, description, updatedBy: 'admin_fixture_1', updatedAt: at(30, 9, 0) }]));
  const faqs = ['如何发布一条树洞？', '怎样保存日记？', 'AI 回应会被谁看到？', '如何调整隐私设置？', '如何提交反馈？'].map((question, index) => ({ id: `vf_faq_${index + 1}`, question, answer: ['在写下心情页选择公开或私密后即可发布。', '私密内容会沉淀到我的日记，并支持图片附件。', '公开树洞的 AI 回应会在审核后展示，私密内容仅自己可见。', '可以在我的页面进入隐私设置进行调整。', '在帮助与反馈页填写问题并附上截图。'][index], sortOrder: index + 1, enabled: true, createdAt: at(10 + index, 8, 0) }));
  const replyPresets = ['抱抱你，慢慢来。', '谢谢你愿意说出来。', '先照顾好当下的自己。', '你的感受值得被认真对待。', '愿今晚能多一点安稳。'].map((text, index) => ({ id: `vf_preset_${index + 1}`, text, scene: ['鼓励', '倾听', '陪伴', '共情', '晚安'][index], sortOrder: index + 1, enabled: true, createdAt: at(10 + index, 9, 0) }));
  const favorites = [{ id: 'vf_fav_post_1', userId: 'user_demo', targetType: 'post', targetId: 'vf_post_anxious', createdAt: at(28, 20, 1) }, { id: 'vf_fav_post_2', userId: 'user_demo', targetType: 'post', targetId: 'vf_post_sleepless', createdAt: at(26, 20, 1) }, { id: 'vf_fav_letter_1', userId: 'user_demo', targetType: 'letter', targetId: 'vf_letter_01', createdAt: at(18, 20, 1) }, { id: 'vf_fav_letter_2', userId: 'user_demo', targetType: 'letter', targetId: 'vf_letter_02', createdAt: at(15, 20, 1) }, { id: 'vf_fav_diary_1', userId: 'user_demo', targetType: 'diary', targetId: 'vf_diary_01', createdAt: at(18, 20, 2) }];
  const auditLogs = Array.from({ length: 12 }, (_, index) => ({ id: `vf_audit_${String(index + 1).padStart(2, '0')}`, adminUserId: 'admin_fixture_1', action: ['POST_APPROVE', 'REPLY_APPROVE', 'AI_ROUTE_UPDATE', 'FEEDBACK_REPLY'][index % 4], resourceType: ['Post', 'Reply', 'AIStyleRoute', 'FeedbackTicket'][index % 4], resourceId: ['vf_post_anxious', 'vf_reply_featured', 'vf_route_poetic', 'vf_ticket_processing'][index % 4], beforeJson: null, afterJson: { fixtureOnly: true }, ip: '127.0.0.1', userAgent: 'visual-fixture-v1', createdAt: at(30 - index, 6, index) }));
  return {
    users, adminUsers: [{ id: 'admin_fixture_1', username: 'admin', passwordHash: 'plain:admin123', displayName: 'Fixture 管理员', role: 'super_admin', status: 'active', lastLoginAt: at(30, 6, 0) }], privacySettings,
    moods: [...publicMoods, ...diaryMoods], posts, replies, letters, diaries, favorites, feedbackCategories, faqs, replyPresets, feedbackTickets, systemSettings, aiProviders, aiRoutes, aiJobs, assets, auditLogs,
  };
}
