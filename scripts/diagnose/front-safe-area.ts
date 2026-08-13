import { markdownTable, withLayoutPages, writeMarkdown } from './front-layout-common.ts';

type SafeAreaIssue = {
  selector: string;
  text: string;
  top: number;
  bottom: number;
  fixedTop: number;
  overlap: number;
};

type SafeAreaData = {
  fixedBottomTop: number | null;
  issues: SafeAreaIssue[];
};

async function main(): Promise<void> {
  const results = await withLayoutPages<SafeAreaData>(async (page) =>
    page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
    };
    const fixedBars = Array.from(document.querySelectorAll('.tabbar,.reply-bar,.submit-bar,.sheet-actions'))
      .filter(visible)
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (style.position === 'fixed' || rect.bottom > window.innerHeight - 90) && rect.height > 28;
      });
    const fixedTop = fixedBars.reduce((top, el) => Math.min(top, el.getBoundingClientRect().top), window.innerHeight);
    if (!fixedBars.length) return { fixedBottomTop: null, issues: [] };

    const contentSelector =
      '.treehole-card,.detail-card,.reply-card,.panel-card,.write-card,.letter-card,.advice-section,.feature-card,.growth-card,.report-panel,.settings-card,.feedback-form,.decompose-input-card,.decompose-result-card,.diary-card,.letter-list-card,.favorite-card,.faq-card,.tool-tile,.me-list,.clear-wide';
    const contentRoots = Array.from(document.querySelectorAll(contentSelector)).filter(visible);
    const elements = contentRoots.flatMap((root) =>
      Array.from(root.querySelectorAll('button,a,h1,h2,h3,p,strong,small,label,textarea,select,input')).filter((el) => {
        if (!visible(el)) return false;
        if (fixedBars.some((bar) => bar.contains(el))) return false;
        if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
        const text = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder || el.value : el.textContent;
        return (text ?? '').replace(/\s+/g, '').length > 0;
      }),
    );
    const issues = elements
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const overlap = rect.bottom - fixedTop;
        return {
          selector: el.className ? `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase(),
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 34),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          fixedTop: Math.round(fixedTop),
          overlap: Math.round(overlap),
        };
      })
      .filter((item) => item.overlap > 6 && item.top < fixedTop)
      .slice(0, 16);

    return { fixedBottomTop: Math.round(fixedTop), issues };
    }),
  );

  const rows = results.map((item) => [
    item.page,
    item.viewport,
    item.data.fixedBottomTop ?? 'none',
    item.data.issues.length,
    item.data.issues.length ? 'REVIEW' : 'OK',
  ]);

  await writeMarkdown(
    'artifacts/layout/front-safe-area.md',
    [
      '# Front Safe Area Report',
      '',
      markdownTable(['page', 'viewport', 'fixedTop', 'overlappedContent', 'result'], rows),
      '',
      'Rows marked REVIEW mean a visible content block intersects the bottom fixed control zone in the first viewport.',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
