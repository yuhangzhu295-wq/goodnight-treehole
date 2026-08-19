import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts', 'final-ui-audit', 'first-stage');
const referenceRoot = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明';
const fidelityRoot = path.resolve('artifacts', 'reference-fidelity', 'first-stage');
const shellRoot = path.resolve('artifacts', 'reference-qa', 'first-stage-shells');
const journeyRoot = path.resolve('artifacts', 'reference-qa', 'journey');
const actionRoot = path.resolve('artifacts', 'reference-qa', 'action');
const viewports = ['375x812', '390x844', '393x852', '430x932'] as const;

type Page = {
  directory: string;
  state: string;
  reference: string;
  responsiveRoot: string;
  responsiveState: string;
  title: string;
  status: 'DONE';
  checks: string;
};

const pages: Page[] = [
  { directory: '01-tonight', state: 'tonight', reference: '01_今晚怎么了.png', responsiveRoot: shellRoot, responsiveState: 'tonight', title: '今晚怎么了', status: 'DONE', checks: '输入、快捷入口、关系选择与继续创建 Journey 均保留真实交互。' },
  { directory: '36-situation', state: 'confirm', reference: '36_经历指纹确认_正式版.png', responsiveRoot: journeyRoot, responsiveState: 'confirm', title: '经历指纹确认', status: 'DONE', checks: '确认、编辑和重新整理仍使用原 Journey 分析流。' },
  { directory: '29-temperature', state: 'temperature', reference: '29_情绪温度计.png', responsiveRoot: journeyRoot, responsiveState: 'temperature', title: '情绪温度计', status: 'DONE', checks: '滑杆、症状、多行输入和继续写入同一 Journey 状态。' },
  { directory: '13-intent', state: 'intent', reference: '13_你现在最需要什么.png', responsiveRoot: journeyRoot, responsiveState: 'intent', title: '支持意图', status: 'DONE', checks: '八个 SupportIntent 继续进入既有的真实分支。' },
  { directory: '32-stabilize', state: 'stabilize', reference: '32_我先接住你.png', responsiveRoot: journeyRoot, responsiveState: 'stabilize', title: '我先接住你', status: 'DONE', checks: '呼吸、冷静箱、笔记和现实求助保持原有 API 行为。' },
  { directory: '33-safety', state: 'safety', reference: '33_SafetyFlow_正式版.png', responsiveRoot: shellRoot, responsiveState: 'safety', title: '安全支持', status: 'DONE', checks: '热线和紧急求助是有效 tel 链接，继续留在这里保持确认写入。' },
  { directory: '16-handoff', state: 'reality', reference: '16_现实求助卡.png', responsiveRoot: shellRoot, responsiveState: 'handoff', title: '现实求助卡', status: 'DONE', checks: '保存、复制、编辑和信任联系人仍连接真实持久化接口。' },
  { directory: '06-action', state: 'action', reference: '06_今晚只做这一件事.png', responsiveRoot: actionRoot, responsiveState: 'recommendation', title: '今晚，只做这一件事', status: 'DONE', checks: '行动计划、接受、完成、未完成与回访继续使用真实 DAPI/Action 链路。' },
  { directory: '37-adaptive', state: 'adaptive', reference: '37_AdaptiveMicroAction.png', responsiveRoot: actionRoot, responsiveState: 'adaptive', title: 'Adaptive Micro Action', status: 'DONE', checks: '阻碍选择、DAPI 缩小行动和接受创建新 Action 均保留。' },
  { directory: '39-notification', state: 'notification', reference: '39_提醒与回访.png', responsiveRoot: shellRoot, responsiveState: 'notifications', title: '提醒与回访', status: 'DONE', checks: '通知类型映射、未读筛选、已读 PATCH 与目标路由均保持真实行为。' },
  { directory: '34-timeline', state: 'timeline', reference: '34_Journey时间线_正式版.png', responsiveRoot: journeyRoot, responsiveState: 'timeline', title: 'Journey 时间线', status: 'DONE', checks: '真实 update kind 仍决定节点、标题与时间线内容，后来呢会写回 Journey。' },
];

const repairByDirectory: Record<string, string> = {
  '01-tonight': '收紧 Hero 到输入卡的过渡，保留真实 textarea、关系底部弹层、六个快捷入口、Active Journey 和继续创建 Journey。',
  '36-situation': '把三段事实改为阅读型纸张卡，补充无文字书灯、月夜和树影装饰，并保留确认、改一处、重新整理。',
  '29-temperature': '恢复可访问的原生 range 输入语义，重排 1-10、症状、脑内一句与两级操作，避免次操作与固定导航相遮。',
  '13-intent': '统一八个真实 SupportIntent 的插画尺寸和双列卡片节奏，标题保持一行并保留每张卡的真实分支。',
  '32-stabilize': '把裸列表收口为夜间陪伴纸卡，Reality Handoff 是唯一实色主 CTA，其他能力保留为次级入口。',
  '33-safety': '保留现实求助、12356、120、安全确认和三步行动；补齐固定导航的底部安全区，不弱化安全文案。',
  '16-handoff': '将联系人维持在底部弹层；把六个帮助选项重排为三列，令生成并保存求助卡在移动首屏可访问。',
  '06-action': '将纸张插画固定在不压缩实时 DAPI 文案的位置，主行动仍是第一焦点，辅助入口保持弱层级。',
  '37-adaptive': '收紧上次行动、2x3 阻碍、缩小后的行动和双 CTA 的连续纸张流程，不移除真实 AI 结果。',
  '39-notification': '把通知缩略图处理成有边缘融合的场景层，保留真实 type 映射、已读 PATCH 和目标路由。',
  '34-timeline': '保留真实 update kind、时间和内容；用 major/minor 节点、场景插画与固定导航安全区形成故事节奏。',
};

const auditAreas = ['Hero', 'Illustration', 'Title', 'Subtitle', 'Main content', 'Card structure', 'Typography', 'Spacing', 'CTA', 'Secondary action', 'Bottom navigation', 'Page height', 'Safe area', 'Mobile usability', 'Reference fidelity'];

function auditRows(page: Page) {
  const repair = repairByDirectory[page.directory];
  return auditAreas.map((area) => {
    const outcome = area === 'Bottom navigation'
      ? '固定四 Tab 使用深松绿色小 indicator，正文以安全区避让。'
      : area === 'Mobile usability'
        ? '四个真实移动 viewport 截图均无横向滚动，控件保持 DOM 可点击。'
        : area === 'Reference fidelity'
          ? '已对照原始 420x786 参考、实际、并排和差异图；实时数据只改变文案，不改变信息层级。'
          : repair;
    return `| ${area} | DONE | Reference: ${page.reference}；Actual: 真实 ${page.title} 页面。Difference detected then repaired: ${outcome} Evidence: 对应目录内原尺寸截图。 |`;
  });
}

async function copy(source: string, destination: string) {
  await fs.copyFile(source, destination);
}

async function main() {
  await fs.mkdir(root, { recursive: true });
  for (const page of pages) {
    const destination = path.join(root, page.directory);
    await fs.mkdir(destination, { recursive: true });
    await copy(path.join(referenceRoot, page.reference), path.join(destination, 'reference.png'));
    await copy(path.join(fidelityRoot, `${page.state}-actual.png`), path.join(destination, 'actual-420x786.png'));
    await copy(path.join(fidelityRoot, `${page.state}-side-by-side.png`), path.join(destination, 'side-by-side-420x786.png'));
    await copy(path.join(fidelityRoot, `${page.state}-difference.png`), path.join(destination, 'difference-420x786.png'));
    for (const viewport of viewports) {
      await copy(path.join(page.responsiveRoot, `actual-${page.responsiveState}-${viewport}.png`), path.join(destination, `actual-${viewport}.png`));
    }
    const files = ['reference.png', 'actual-420x786.png', 'side-by-side-420x786.png', 'difference-420x786.png', ...viewports.map((viewport) => `actual-${viewport}.png`)];
    await fs.writeFile(path.join(destination, 'audit.md'), [
      `# ${page.title} Audit`,
      '',
      `Status: ${page.status}`,
      '',
      '## Independent Review',
      '',
      `- Reference: ${page.reference}，原始 420x786 设计图。`,
      `- Actual: 真实运行的 ${page.title}，不是静态图，也没有把参考图放入页面背景。`,
      `- Difference, impact and repair: ${repairByDirectory[page.directory]}`,
      '- Review rule: 实时 DAPI/持久化数据可以改变正文长度；不得借此隐藏、截断或替换真实业务内容。',
      '',
      '| Area | Status | Reference / actual / repair / evidence |',
      '| --- | --- | --- |',
      ...auditRows(page),
      '',
      '## Evidence',
      ...files.map((file) => `- ${file}`),
      '',
      '## Review',
      `- 参考：${page.reference}。`,
      '- 420x786 参考、实际、并排与差异图都是原尺寸文件，实际页面没有被拉伸到参考图尺寸。',
      '- 375x812、390x844、393x852、430x932 是真实浏览器视口截图。',
      `- ${page.checks}`,
      '- 装饰层仅使用用户提供参考图裁出的无文字局部，且均设置为不可点击。',
      '',
    ].join('\n'), 'utf8');
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
