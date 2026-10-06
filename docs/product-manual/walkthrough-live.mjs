// Full business-flow walkthrough against the RUNNING dev API (127.0.0.1:3000).
// Prints a step-by-step transcript: which page/button each step corresponds to,
// the request made, and the observed result.
const BASE = 'http://127.0.0.1:3000';
const DEMO = 'user_demo';
const GUEST = 'user_guest';

let step = 0;
const results = [];

function log(section, page, action, outcome, ok) {
  step += 1;
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO';
  results.push({ step, section, page, action, outcome, mark });
  console.log(`\n[${String(step).padStart(2)}] ${section} | ${page}`);
  console.log(`     action : ${action}`);
  console.log(`     result : ${mark} - ${outcome}`);
}

async function call(method, path, { user = DEMO, body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers['x-goodnight-user-id'] = user;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}

const brief = (v, n = 140) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined || s === null ? String(s) : s.length > n ? s.slice(0, n) + '…' : s;
};

async function main() {
  console.log('='.repeat(78));
  console.log(' 晚安树洞 — 完整业务流走查 (live dev stack)');
  console.log('='.repeat(78));

  // ── 主线 A：今晚（夜间主循环）
  console.log('\n\n########## 主线 A：今晚 — 夜里打开 App 做什么 ##########');

  // 隐私开关：默认全部关闭，涉及的功能会返回 403 并提示去隐私设置开启。
  // 这里先按"用户主动开启"的方式打开，用于走通后面的功能。
  let rp = await call('PATCH', '/api/v1/settings/privacy', {
    body: {
      allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true,
      allowAnonymousExperienceShare: true, allowJourneyArchiveRetention: true,
      allowFutureSelfNotifications: true, allowPeerMatching: true,
    },
  });
  log('A 今晚', '我的 → 隐私设置 /pages/settings/privacy', '开启走查需要的隐私开关（默认是关的）',
    `HTTP ${rp.status}`, rp.status === 200);
  rp = await call('PATCH', '/api/v1/settings/privacy', {
    user: GUEST,
    body: { allowAnonymousExperienceShare: true, allowPeerMatching: true, allowRecoveryData: true },
  });
  log('A 今晚', '隐私设置（user_guest）', '给第二个用户也开启匿名分享与同路人匹配',
    `HTTP ${rp.status}`, rp.status === 200);

  let r = await call('GET', '/api/v1/tonight');
  log('A 今晚', '今晚首页 /pages/tonight/index', '打开 App 看到首页',
    `HTTP ${r.status}; journey=${r.data?.item?.journey ? '有进行中的旅程' : '暂无'} activeActions=${r.data?.item?.activeActions?.length ?? '?'} latestLetter=${r.data?.item?.latestLetter?.id ?? '无'}`,
    r.status === 200);

  r = await call('POST', '/api/v1/moods', { body: { emotion: '疲惫', content: '今天加班到很晚，脑子还在转，睡不着。', intensity: 6 } });
  const moodId = r.data?.item?.id;
  log('A 今晚', '写下来 /pages/mood/create', '选择情绪 + 写下今晚发生了什么 + 提交',
    `HTTP ${r.status}; moodId=${moodId ?? brief(r.data)}`, r.status === 201 || r.status === 200);

  r = await call('GET', '/api/v1/letters/today');
  const letterId = r.data?.item?.id;
  log('A 今晚', '今天的信 /pages/letter/index', '打开今天的信',
    `HTTP ${r.status}; letter=${letterId ?? '无'} title=${brief(r.data?.item?.title, 40)}`, r.status === 200);

  if (letterId) {
    r = await call('PATCH', `/api/v1/letters/${letterId}/read`);
    log('A 今晚', '今天的信 → 已读', '读信（标记已读）', `HTTP ${r.status}`, r.status === 200);
    r = await call('POST', `/api/v1/letters/${letterId}/save-to-diary`);
    log('A 今晚', '今天的信 → 收藏到日记', '把信存进日记本', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  }

  // ── 主线 B：旅程 → 行动计划 → 打卡
  console.log('\n\n########## 主线 B：旅程 → 行动计划 → 打卡 ##########');

  r = await call('POST', '/api/v1/journeys', {
    body: { title: '睡前一小时不刷手机', domain: '睡眠', content: '最近总是躺下还在刷手机，第二天很累。想先试着一小时不碰。', intensity: 6 },
  });
  const journeyId = r.data?.journey?.id ?? r.data?.item?.id;
  log('B 旅程', '今晚首页 → 开始整理 /pages/journey/detail', '创建旅程（同时写入处境快照 + 时间线）',
    `HTTP ${r.status}; journeyId=${journeyId ?? brief(r.data)} stage=${r.data?.journey?.stage ?? r.data?.item?.stage ?? '?'}`,
    r.status === 201 && Boolean(journeyId));

  r = await call('PATCH', `/api/v1/journeys/${journeyId}/intent`, { body: { intent: 'NEXT_STEP' } });
  log('B 旅程', '旅程详情 → 我想…（意图选择）', '选择"先走一小步"',
    `HTTP ${r.status}; intent=${r.data?.item?.currentIntent ?? r.data?.journey?.currentIntent ?? '?'}`, r.status === 200);

  r = await call('PATCH', `/api/v1/journeys/${journeyId}/situation`, {
    body: { facts: ['睡前刷手机到很晚'], feelings: ['疲惫', '内疚'], needs: ['想睡好一点'], constraints: ['工作到很晚'], confidence: 'user_confirmed' },
  });
  log('B 旅程', '旅程详情 → 处境确认', '确认系统整理的处境（确认后 AI 不能再改写）',
    `HTTP ${r.status}; confidence=${r.data?.item?.confidence ?? '?'}`, r.status === 200);

  r = await call('POST', `/api/v1/journeys/${journeyId}/action-plan`);
  log('B 旅程', '旅程详情 → 生成行动计划', '让 AI 给一个可执行的小步骤',
    `HTTP ${r.status}; job=${brief(r.data?.job?.id ?? r.data?.jobId, 30)} status=${r.data?.job?.status ?? '?'}`,
    r.status === 200 || r.status === 201);

  r = await call('POST', `/api/v1/journeys/${journeyId}/actions`, {
    body: { title: '睡前把手机放到客厅', dueAt: new Date(Date.now() + 86400000).toISOString() },
  });
  const actionId = r.data?.item?.id ?? r.data?.action?.id;
  log('B 旅程', '旅程详情 → 添加行动承诺', '创建一条行动承诺（ActionCommitment + 待办打卡）',
    `HTTP ${r.status}; actionId=${actionId ?? brief(r.data)} status=${r.data?.item?.status ?? '?'}`,
    r.status === 201 && Boolean(actionId));

  r = await call('POST', `/api/v1/actions/${actionId}/checkin`, {
    body: { status: 'completed', reflection: '昨晚真的把手机放到客厅了，躺下十分钟就睡着。' },
  });
  log('B 旅程', '行动中心 /pages/action/index → 打卡', '打卡并写下实际发生了什么',
    `HTTP ${r.status}; checkin=${r.data?.checkin?.id ?? brief(r.data?.item)} status=${r.data?.checkin?.status ?? '?'}`,
    r.status === 200 || r.status === 201);

  r = await call('GET', `/api/v1/journeys/${journeyId}/timeline`);
  log('B 旅程', '旅程详情 → 时间线', '查看旅程进展',
    `HTTP ${r.status}; updates=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('POST', `/api/v1/journeys/${journeyId}/updates`, {
    body: { type: 'note', content: '第二晚也做到了，虽然有点想刷。' },
  });
  log('B 旅程', '旅程详情 → 追加进展', '自己补一条进展记录', `HTTP ${r.status}`, r.status === 201 || r.status === 200);

  // ── 主线 C：安全路径
  console.log('\n\n########## 主线 C：安全路径（高风险内容）##########');

  r = await call('POST', '/api/v1/journeys', {
    body: { title: '撑不住了', domain: '情绪', content: '我觉得活着没意思，不想再撑下去了。', intensity: 9 },
  });
  const riskJourneyId = r.data?.journey?.id ?? r.data?.item?.id;
  log('C 安全', '今晚首页 → 开始整理', '写下高风险内容（触发安全路径）',
    `HTTP ${r.status}; journeyId=${riskJourneyId}; stage=${r.data?.journey?.stage ?? r.data?.item?.stage ?? '?'}`,
    r.status === 201);

  r = await call('GET', `/api/v1/journeys/${riskJourneyId}`);
  log('C 安全', '安全支持 /pages/safety/index', '查看安全支持页（应显示求助资源）',
    `HTTP ${r.status}; stage=${r.data?.item?.stage ?? '?'}`, r.status === 200);

  r = await call('POST', `/api/v1/journeys/${riskJourneyId}/safety/acknowledge`);
  log('C 安全', '安全支持 → 我知道了', '确认看到安全提示',
    `HTTP ${r.status}`, r.status === 200 || r.status === 201);

  // ── 主线 D：同路人（互助）
  console.log('\n\n########## 主线 D：同路人 — 匿名互助 ##########');

  let expId = null;
  r = await call('POST', '/api/v1/peer-experiences', {
    user: GUEST,
    body: {
      title: '我把消息留到第二天再看', domain: '关系', stage: 'graduated',
      content: '分开以后我总想立刻联系对方，后来学会先把话写下来，隔一天再看。', tags: ['分开后想联系'], consented: true,
    },
  });
  expId = r.data?.item?.id;
  log('D 同路人', '同路人 /pages/peers/index → 分享经历', '匿名分享自己的经历（user_guest）',
    `HTTP ${r.status}; experienceId=${expId ?? brief(r.data)} status=${r.data?.item?.status ?? '?'}`,
    r.status === 201);

  // 后台审核发布
  let adminToken = null;
  r = await call('POST', '/api/admin/v1/login', { user: null, body: { username: 'admin', password: 'admin123' } });
  adminToken = r.data?.token ?? r.data?.accessToken;
  log('D 同路人', '后台 /login', '管理员登录',
    `HTTP ${r.status}; token=${adminToken ? '已获取' : '未获取'}`, r.status === 200 || r.status === 201);

  if (adminToken && expId) {
    r = await call('PATCH', `/api/admin/v1/peer-experiences/${expId}/review`, { user: null, token: adminToken, body: { status: 'published' } });
    log('D 同路人', '后台 → 同路人经历审核', '审核通过（发布）', `HTTP ${r.status}`, r.status === 200);
  }

  r = await call('POST', `/api/v1/journeys/${journeyId}/peer-matches`);
  const matchId = r.data?.items?.[0]?.id;
  log('D 同路人', '旅程详情 → 找同路人', '寻找相似经历的人',
    `HTTP ${r.status}; matches=${r.data?.items?.length ?? '?'} matchId=${matchId ?? '无'}`,
    r.status === 200 || r.status === 201);

  if (matchId) {
    r = await call('PATCH', `/api/v1/peer-matches/${matchId}`, { body: { status: 'requested', requestReason: '我也在学着别急着联系。', requestQuestion: '你当时怎么熬过第一晚？' } });
    log('D 同路人', '同路人 → 发起请求', '向对方发出聊天请求', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

    r = await call('POST', `/api/v1/peer-matches/${matchId}/respond`, { user: GUEST, body: { status: 'connected' } });
    log('D 同路人', '同路人请求 /pages/peer/requests', '经历发布者接受请求（status=connected）', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

    r = await call('POST', `/api/v1/peer-matches/${matchId}/consent`, { user: GUEST });
    log('D 同路人', '双向同意 /pages/peer/consent', '确认匿名边界并开启对话（72 小时）', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

    r = await call('POST', `/api/v1/peer-conversations/${matchId}/messages`, { user: GUEST, body: { content: '第一晚我也睡不着，就起来写了一会儿。' } });
    log('D 同路人', '对话 /pages/peer/conversation', '发送一条消息', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

    r = await call('POST', `/api/v1/peer-conversations/${matchId}/close`, { body: { reason: '聊完了，谢谢。' } });
    log('D 同路人', '对话 → 结束对话', '结束这段对话', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  }

  // ── 主线 E：工具
  console.log('\n\n########## 主线 E：工具箱 ##########');

  r = await call('GET', '/api/v1/tools');
  log('E 工具', '工具 /pages/tool/index', '打开工具箱', `HTTP ${r.status}; tools=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('POST', '/api/v1/tools/emotion-decompose', {
    body: { content: '今天开会又被否了，我是不是根本不行。', scene: 'work' },
  });
  const taskId = r.data?.job?.id ?? r.data?.taskId ?? r.data?.item?.id;
  log('E 工具', '情绪拆解 /pages/tool/decompose', '输入一段话，让 AI 拆解',
    `HTTP ${r.status}; taskId=${brief(taskId, 30)} status=${r.data?.job?.status ?? '?'}`, r.status === 200 || r.status === 201);

  if (taskId) {
    await new Promise((s) => setTimeout(s, 3000));
    r = await call('GET', `/api/v1/ai/tasks/${taskId}`);
    log('E 工具', '情绪拆解 → 等待结果', '轮询 AI 任务结果（无 DAPI key，应为兜底）',
      `HTTP ${r.status}; status=${r.data?.item?.status ?? '?'} fallbackUsed=${r.data?.item?.fallbackUsed ?? '?'}`,
      r.status === 200);
    r = await call('POST', `/api/v1/tools/emotion-decompose/${taskId}/save`, { body: { saveToDiary: true } });
    log('E 工具', '情绪拆解 → 保存', '把结果存进日记', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  }

  // ── 主线 F：我的
  console.log('\n\n########## 主线 F：我的 — 个人中心 ##########');

  r = await call('GET', '/api/v1/diaries');
  log('F 我的', '我的 → 日记本 /pages/diary/index', '查看日记列表', `HTTP ${r.status}; diaries=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('GET', '/api/v1/report/month');
  log('F 我的', '我的 → 本月回顾 /pages/report/month', '查看本月报告', `HTTP ${r.status}`, r.status === 200);

  r = await call('GET', '/api/v1/archive/journeys');
  log('F 我的', '我的 → 归档 /pages/archive/index', '查看归档的旅程', `HTTP ${r.status}; archived=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('GET', '/api/v1/favorites');
  log('F 我的', '我的 → 收藏 /pages/favorite/index', '查看收藏', `HTTP ${r.status}; favorites=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('GET', '/api/v1/settings/privacy');
  log('F 我的', '我的 → 隐私设置 /pages/settings/privacy', '查看隐私开关', `HTTP ${r.status}; ${brief(r.data?.item ?? r.data, 120)}`, r.status === 200);

  r = await call('GET', '/api/v1/memory');
  log('F 我的', '我的 → 记忆中心 /pages/memory/index', '查看 AI 能记住的内容', `HTTP ${r.status}; memories=${r.data?.items?.length ?? '?'}`, r.status === 200);

  r = await call('POST', '/api/v1/decisions', { body: { title: '要不要辞职', question: '现在提离职，还是再等等？', reason: '情绪很高的时候不想做决定。', hours: 24 } });
  const decisionId = r.data?.item?.id;
  log('F 我的', '我的 → 决定保险箱 /pages/decision/index', '把决定先锁起来（冷静期）',
    `HTTP ${r.status}; decisionId=${decisionId ?? brief(r.data)} status=${r.data?.item?.status ?? '?'}`, r.status === 201 || r.status === 200);

  r = await call('POST', '/api/v1/future-messages', { body: { content: '如果今晚很难，就早点睡，明天再说。', deliverAt: new Date(Date.now() + 86400000).toISOString() } });
  log('F 我的', '我的 → 清醒时的你 /pages/future-self/index', '给未来的自己留一句话',
    `HTTP ${r.status}`, r.status === 201 || r.status === 200);

  r = await call('GET', '/api/v1/me/recovery');
  log('F 我的', '我的 → 恢复 /pages/recovery/index', '查看恢复记录', `HTTP ${r.status}`, r.status === 200);

  r = await call('GET', '/api/v1/me/support-plan');
  log('F 我的', '我的 → 支持计划 /pages/support-plan/index', '查看自己的支持计划', `HTTP ${r.status}`, r.status === 200);

  r = await call('GET', '/api/v1/me/stable-self');
  log('F 我的', '我的 → 稳定的我 /pages/stable-self/index', '查看稳定自我描述', `HTTP ${r.status}`, r.status === 200);

  r = await call('GET', '/api/v1/notifications');
  log('F 我的', '通知中心 /pages/notifications/index', '查看通知（打卡提醒等）',
    `HTTP ${r.status}; notifications=${r.data?.items?.length ?? '?'}`, r.status === 200);

  // ── 主线 G：后台
  console.log('\n\n########## 主线 G：后台管理 ##########');

  if (adminToken) {
    r = await call('GET', '/api/admin/v1/dashboard/overview', { user: null, token: adminToken });
    log('G 后台', '后台 /dashboard', '查看总览大盘', `HTTP ${r.status}; ${brief(r.data?.journeySummary ?? r.data, 130)}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/journeys?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 /experience/journeys', '查看旅程列表（含搜索/分页）', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/actions?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 /experience/actions', '查看行动列表', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/checkins?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 /experience/checkins', '查看打卡列表', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/safety/events?pageSize=5', { user: null, token: adminToken });
    const ev = r.data?.items?.[0];
    log('G 后台', '后台 /safety/events', '查看安全事件列表（含触发原文）',
      `HTTP ${r.status}; total=${r.data?.total ?? '?'} 首条status=${ev?.status ?? '?'}`, r.status === 200);

    if (ev?.id) {
      r = await call('PATCH', `/api/admin/v1/safety/events/${ev.id}/handle`, { user: null, token: adminToken, body: { status: 'handled', note: '走查：已确认并跟进。' } });
      log('G 后台', '后台 → 安全事件 → 处理', '处理一条安全事件（status=handled，写审计日志）', `HTTP ${r.status}`, r.status === 200);
    }

    r = await call('GET', '/api/admin/v1/audit-logs?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 → 审计日志', '确认处理动作留下了审计记录', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/users?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 /users', '查看用户列表', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);

    r = await call('GET', '/api/admin/v1/ai/jobs?pageSize=5', { user: null, token: adminToken });
    log('G 后台', '后台 /ai/jobs', '查看 AI 任务队列', `HTTP ${r.status}; total=${r.data?.total ?? '?'}`, r.status === 200);
  }

  // ── 安全边界抽查
  console.log('\n\n########## 安全边界抽查 ##########');
  r = await call('GET', `/api/v1/journeys/${journeyId}`, { user: GUEST });
  log('安全', '任意页（越权访问）', 'user_guest 读 user_demo 的旅程（应 404）', `HTTP ${r.status}`, r.status === 404);
  r = await call('GET', '/api/admin/v1/users', { user: null });
  log('安全', '后台（无 token）', '不带管理员令牌访问后台（应 401）', `HTTP ${r.status}`, r.status === 401);

  // ── 汇总
  const pass = results.filter((x) => x.mark === 'PASS').length;
  const fail = results.filter((x) => x.mark === 'FAIL').length;
  const info = results.filter((x) => x.mark === 'INFO').length;
  console.log('\n\n' + '='.repeat(78));
  console.log(`  走查完成：共 ${results.length} 步 — PASS ${pass} / FAIL ${fail} / INFO ${info}`);
  console.log('='.repeat(78));
  if (fail) {
    console.log('\n未通过步骤：');
    results.filter((x) => x.mark === 'FAIL').forEach((x) => console.log(`  [${x.step}] ${x.page} :: ${x.action} -> ${x.outcome}`));
  }
  console.log('\n关键实体 id：');
  console.log(`  journeyId(正常)=${journeyId}  journeyId(高风险)=${riskJourneyId}`);
  console.log(`  actionId=${actionId}  moodId=${moodId}  letterId=${letterId}`);
  console.log(`  experienceId=${expId}  matchId=${matchId ?? '无'}  decisionId=${decisionId}`);
}

main().catch((e) => { console.error('WALKTHROUGH ERROR:', e); process.exit(1); });
