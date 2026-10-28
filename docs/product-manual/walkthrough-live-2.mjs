/* global console, fetch, process */
// Second pass: the remaining feature lines (archive/restore, graduation, square,
// feedback, trusted contacts, diary CRUD, memory, support plan, stable self).
const BASE = 'http://127.0.0.1:3000';
const DEMO = 'user_demo';
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
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 160); }
  return { status: res.status, data };
}
const brief = (v, n = 120) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(s) : s.length > n ? s.slice(0, n) + '…' : s; };

async function main() {
  console.log('='.repeat(78));
  console.log(' 晚安树洞 — 其余功能线走查 (live dev stack)');
  console.log('='.repeat(78));

  // 归档 → 恢复
  console.log('\n\n########## 主线 H：归档与恢复 ##########');
  let r = await call('POST', '/api/v1/journeys', { body: { title: '归档走查用旅程', domain: '关系', content: '这条用来验证归档与恢复。', intensity: 4 } });
  const jid = r.data?.journey?.id ?? r.data?.item?.id;
  log('H 归档', '旅程详情 → 走完了，结束这段旅程', '创建一条旅程用于归档', `HTTP ${r.status}; journeyId=${jid}`, r.status === 201);

  r = await call('PATCH', `/api/v1/journeys/${jid}/status`, { body: { status: 'completed' } });
  log('H 归档', '旅程详情 → 结束旅程', '把旅程标记为完成（status=completed）', `HTTP ${r.status}; status=${r.data?.item?.status ?? '?'}`, r.status === 200);

  r = await call('GET', '/api/v1/archive/journeys');
  const archived = r.data?.items ?? [];
  log('H 归档', '我的 → 归档 /pages/archive/index', '查看归档列表', `HTTP ${r.status}; archived=${archived.length}`, r.status === 200);

  r = await call('POST', `/api/v1/archive/journeys/${jid}/restore`);
  log('H 归档', '归档 → 恢复这段旅程', '把归档的旅程恢复出来', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

  // 毕业
  console.log('\n\n########## 主线 I：毕业与交接 ##########');
  r = await call('POST', '/api/v1/journeys', { body: { title: '毕业走查用旅程', domain: '睡眠', content: '这条用来验证毕业流程。', intensity: 5 } });
  const gjid = r.data?.journey?.id ?? r.data?.item?.id;
  r = await call('POST', `/api/v1/journeys/${gjid}/actions`, { body: { title: '毕业走查用行动' } });
  const gaid = r.data?.item?.id ?? r.data?.action?.id;
  await call('POST', `/api/v1/actions/${gaid}/checkin`, { body: { status: 'completed', reflection: '走查：完成了。' } });
  log('I 毕业', '旅程详情 → 添加并完成一个行动', '产品要求：完成过至少一个行动才能毕业',
    `HTTP ${r.status}; actionId=${gaid}`, Boolean(gaid));
  r = await call('POST', `/api/v1/journeys/${gjid}/graduation-consent`, { body: { decision: 'willing' } });
  log('I 毕业', '旅程详情 → 毕业前同意', '同意毕业后保留长期分析（decision=willing）', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  r = await call('POST', `/api/v1/journeys/${gjid}/graduate`);
  log('I 毕业', '旅程详情 → 毕业', '让这段旅程毕业', `HTTP ${r.status}; status=${r.data?.item?.status ?? r.data?.journey?.status ?? '?'}`, r.status === 200 || r.status === 201);
  r = await call('GET', '/api/v1/handoffs');
  log('I 毕业', '现实交接 /pages/reality-handoff/index', '查看交接记录', `HTTP ${r.status}; handoffs=${r.data?.items?.length ?? '?'}`, r.status === 200);

  // 树洞广场
  console.log('\n\n########## 主线 J：树洞广场（公开内容）##########');
  r = await call('POST', '/api/v1/posts', { body: { content: '今天把手机放在客厅了，真的睡着了。', visibility: 'PUBLIC', mood: '平静' } });
  const postId = r.data?.item?.id;
  log('J 广场', '写一条 → 发布到树洞 /pages/post/create', '发布一条公开内容',
    `HTTP ${r.status}; postId=${postId ?? brief(r.data)} status=${r.data?.item?.status ?? '?'}`, r.status === 201);

  r = await call('GET', '/api/v1/posts');
  log('J 广场', '树洞 /pages/square/index', '浏览树洞内容', `HTTP ${r.status}; posts=${r.data?.items?.length ?? '?'}`, r.status === 200);

  if (postId) {
    r = await call('POST', `/api/v1/posts/${postId}/hug`);
    log('J 广场', '树洞卡片 → 抱抱', '给这条内容一个抱抱', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
    r = await call('POST', `/api/v1/posts/${postId}/replies`, { body: { content: '我也试过，真的有用。' } });
    log('J 广场', '树洞卡片 → 回应', '回复一条', `HTTP ${r.status}`, r.status === 201 || r.status === 200);
    r = await call('POST', `/api/v1/posts/${postId}/favorite`);
    log('J 广场', '树洞卡片 → 收藏', '收藏这条内容', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
    r = await call('POST', `/api/v1/posts/${postId}/report`, { body: { reason: '走查测试' } });
    log('J 广场', '树洞卡片 → 举报', '举报一条内容', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  }

  // 日记
  console.log('\n\n########## 主线 K：日记本 ##########');
  r = await call('POST', '/api/v1/diaries', { body: { content: '走查：今天写下的一段。', mood: '平静', visibility: 'PRIVATE' } });
  const diaryId = r.data?.item?.id;
  log('K 日记', '日记本 → 新增', '写一篇日记', `HTTP ${r.status}; diaryId=${diaryId ?? brief(r.data)}`, r.status === 201 || r.status === 200);
  r = await call('GET', '/api/v1/diaries');
  log('K 日记', '日记本列表', '查看日记列表', `HTTP ${r.status}; diaries=${r.data?.items?.length ?? '?'}`, r.status === 200);
  if (diaryId) {
    r = await call('GET', `/api/v1/diaries/${diaryId}`);
    log('K 日记', '日记详情 /pages/diary/detail', '打开一篇日记', `HTTP ${r.status}`, r.status === 200);
  }

  // 有限记忆
  console.log('\n\n########## 主线 L：有限记忆 ##########');
  r = await call('POST', '/api/v1/memory', { body: { content: '我更容易在加班后失眠。', scope: 'sleep', consented: true } });
  const memId = r.data?.item?.id;
  log('L 记忆', '记忆中心 → 新增一条', '主动告诉 AI 一条可以记住的事',
    `HTTP ${r.status}; memoryId=${memId ?? brief(r.data)}`, r.status === 201 || r.status === 200);
  r = await call('GET', '/api/v1/me/memories');
  log('L 记忆', '记忆中心 /pages/memory/index', '查看 AI 记住的内容', `HTTP ${r.status}; memories=${r.data?.items?.length ?? '?'}`, r.status === 200);
  if (memId) {
    r = await call('PATCH', `/api/v1/me/memories/${memId}`, { body: { active: false } });
    log('L 记忆', '记忆中心 → 关掉一条', '让 AI 不再使用这条记忆', `HTTP ${r.status}`, r.status === 200);
    r = await call('DELETE', `/api/v1/me/memories/${memId}`);
    log('L 记忆', '记忆中心 → 删除', '删除这条记忆', `HTTP ${r.status}`, r.status === 200 || r.status === 204);
  }

  // 支持计划 / 稳定自我 / 恢复
  console.log('\n\n########## 主线 M：支持计划 / 稳定的我 / 恢复 ##########');
  r = await call('PUT', '/api/v1/me/support-plan', { body: { triggers: ['深夜独处'], helpers: ['给朋友发消息'], note: '走查更新' } });
  log('M 陪伴', '支持计划 /pages/support-plan/index', '更新自己的支持计划', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  r = await call('PUT', '/api/v1/me/stable-self', { body: { profile: { description: '我是一个愿意慢慢来的人。', strengths: ['坚持'] } } });
  log('M 陪伴', '稳定的我 /pages/stable-self/index', '更新稳定自我描述', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  r = await call('POST', '/api/v1/me/recovery', { body: { mood: '平静', note: '走查：今天好一些了。', intensity: 3 } });
  log('M 陪伴', '恢复 /pages/recovery/index', '记录一次恢复状态', `HTTP ${r.status}`, r.status === 200 || r.status === 201);

  // 信任联系人
  console.log('\n\n########## 主线 N：信任联系人 ##########');
  r = await call('POST', '/api/v1/trusted-contacts', { body: { nickname: '朋友A', relation: '朋友', contactHint: '138****0000' } });
  log('N 联系人', '安全支持 → 信任联系人', '添加一位信任联系人', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  r = await call('GET', '/api/v1/trusted-contacts');
  log('N 联系人', '安全支持 → 信任联系人列表', '查看联系人', `HTTP ${r.status}; contacts=${r.data?.items?.length ?? '?'}`, r.status === 200);

  // 反馈
  console.log('\n\n########## 主线 O：帮助与反馈 ##########');
  r = await call('GET', '/api/v1/feedback/faqs');
  log('O 反馈', '帮助 /pages/help/faqs', '查看常见问题', `HTTP ${r.status}; faqs=${r.data?.items?.length ?? '?'}`, r.status === 200);
  r = await call('GET', '/api/v1/feedback/categories');
  log('O 反馈', '反馈 /pages/help/feedback', '查看反馈分类', `HTTP ${r.status}; categories=${r.data?.items?.length ?? '?'}`, r.status === 200);
  r = await call('POST', '/api/v1/feedback', { body: { category: '功能建议', content: '走查：建议增加夜间模式。', contact: 'demo@example.com' } });
  log('O 反馈', '反馈 → 提交', '提交一条反馈工单', `HTTP ${r.status}`, r.status === 201 || r.status === 200);
  r = await call('GET', '/api/v1/feedback');
  log('O 反馈', '反馈 → 我的反馈', '查看自己提交的反馈', `HTTP ${r.status}; tickets=${r.data?.items?.length ?? '?'}`, r.status === 200);

  // 信件其它操作
  console.log('\n\n########## 主线 P：信件与分享 ##########');
  r = await call('GET', '/api/v1/letters');
  const letters = r.data?.items ?? [];
  log('P 信件', '我的 → 信件列表 /pages/letter/list', '查看历史信件', `HTTP ${r.status}; letters=${letters.length}`, r.status === 200);
  if (letters[0]?.id) {
    const lid = letters[0].id;
    r = await call('POST', `/api/v1/letters/${lid}/like`);
    log('P 信件', '信件 → 喜欢', '给一封信点赞', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
    r = await call('POST', `/api/v1/letters/${lid}/favorite`);
    log('P 信件', '信件 → 收藏', '收藏这封信', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
    r = await call('POST', `/api/v1/letters/${lid}/regenerate`);
    log('P 信件', '信件 → 再写一封', '重新生成这封信（无 DAPI key，走兜底）', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  }
  r = await call('GET', '/api/v1/report/month');
  log('P 信件', '情绪月报 /pages/report/month', '查看本月报告', `HTTP ${r.status}`, r.status === 200);

  // 决定保险箱 → 冷静期
  console.log('\n\n########## 主线 Q：决定保险箱 ##########');
  r = await call('POST', '/api/v1/decisions', { body: { title: '要不要换工作', question: '现在换还是等年终？', reason: '不想在情绪里做决定。', hours: 24 } });
  const did = r.data?.item?.id;
  log('Q 决定', '决定保险箱 /pages/decision/index → 锁起来', '把一个决定先锁进冷静期',
    `HTTP ${r.status}; decisionId=${did ?? brief(r.data)}`, r.status === 201 || r.status === 200);
  r = await call('POST', '/api/v1/cooldowns', { body: { decisionId: did, title: '要不要换工作', reason: '先放一晚', hours: 12 } });
  log('Q 决定', '决定保险箱 → 设置冷静期', '设置一个冷静期并安排提醒', `HTTP ${r.status}`, r.status === 200 || r.status === 201);
  r = await call('GET', '/api/v1/decisions');
  log('Q 决定', '决定保险箱列表', '查看所有被锁的决定', `HTTP ${r.status}; decisions=${r.data?.items?.length ?? '?'}`, r.status === 200);
  r = await call('GET', '/api/v1/cooldown');
  log('Q 决定', '决定保险箱 → 冷静中', '查看正在冷静期的决定', `HTTP ${r.status}`, r.status === 200);

  const pass = results.filter((x) => x.mark === 'PASS').length;
  const fail = results.filter((x) => x.mark === 'FAIL').length;
  console.log('\n\n' + '='.repeat(78));
  console.log(`  走查完成：共 ${results.length} 步 — PASS ${pass} / FAIL ${fail}`);
  console.log('='.repeat(78));
  if (fail) results.filter((x) => x.mark === 'FAIL').forEach((x) => console.log(`  [${x.step}] ${x.page} :: ${x.action} -> ${x.outcome}`));
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
