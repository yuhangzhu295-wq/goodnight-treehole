import { markdownTable, withLayoutPages, writeMarkdown } from './front-layout-common.ts';

type SpacingIssue = {
  selector: string;
  text: string;
  top: number;
  height: number;
  paddingTop: number;
  paddingBottom: number;
  lineHeightRatio: number | null;
  issue: string;
};

type CardSpacingData = {
  issues: SpacingIssue[];
};

async function main(): Promise<void> {
  const results = await withLayoutPages<CardSpacingData>(async (page) =>
    page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
    };
    const toPx = (value: string) => Number.parseFloat(value) || 0;
    const label = (el: Element) =>
      el.className ? `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase();
    const issues: SpacingIssue[] = [];

    const cardSelector =
      '.card,.panel-card,.treehole-card,.detail-card,.reply-card,.write-card,.letter-card,.letter-intro,.feature-card,.growth-card,.report-summary-card,.report-panel,.settings-card,.feedback-form,.decompose-input-card,.decompose-result-card,.diary-card,.letter-list-card,.favorite-card,.faq-card,.tool-tile,.me-entry';
    for (const el of Array.from(document.querySelectorAll(cardSelector)).filter(visible)) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const paddingTop = toPx(style.paddingTop);
      const paddingBottom = toPx(style.paddingBottom);
      const fontSize = toPx(style.fontSize);
      const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.35 : toPx(style.lineHeight);
      const lineHeightRatio = fontSize ? Number((lineHeight / fontSize).toFixed(2)) : null;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 36);
      const children = Array.from(el.children).filter(visible);
      const childBottom = children.reduce((max, child) => Math.max(max, child.getBoundingClientRect().bottom), rect.top);
      const childTop = children.reduce((min, child) => Math.min(min, child.getBoundingClientRect().top), rect.bottom);

      if (paddingTop < 8 || paddingBottom < 8) {
        issues.push({ selector: label(el), text, top: Math.round(rect.top), height: Math.round(rect.height), paddingTop, paddingBottom, lineHeightRatio, issue: 'padding-too-small' });
      }
      if (lineHeightRatio !== null && lineHeightRatio < 1.28 && text.length > 10) {
        issues.push({ selector: label(el), text, top: Math.round(rect.top), height: Math.round(rect.height), paddingTop, paddingBottom, lineHeightRatio, issue: 'line-height-too-tight' });
      }
      if (childTop < rect.top - 1 || childBottom > rect.bottom + 1) {
        issues.push({ selector: label(el), text, top: Math.round(rect.top), height: Math.round(rect.height), paddingTop, paddingBottom, lineHeightRatio, issue: 'children-outside-card' });
      }
    }
    return { issues: issues.slice(0, 40) };
    }),
  );

  const rows = results.map((item) => [item.page, item.viewport, item.data.issues.length, item.data.issues.length ? 'REVIEW' : 'OK']);

  await writeMarkdown(
    'artifacts/layout/front-card-spacing.md',
    [
      '# Front Card Spacing Report',
      '',
      markdownTable(['page', 'viewport', 'issues', 'result'], rows),
      '',
      'Issue details are intentionally summarized here; use overlap report and screenshots for exact visual triage.',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
