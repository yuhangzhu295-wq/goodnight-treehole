import { markdownTable, withLayoutPages, writeJson, writeMarkdown } from './front-layout-common.ts';

type RectInfo = {
  selector: string;
  text: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type OverlapData = {
  textOverlaps: Array<{ a: RectInfo; b: RectInfo; area: number }>;
  buttonOverflow: Array<RectInfo & { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }>;
};

async function main(): Promise<void> {
  const results = await withLayoutPages<OverlapData>(async (page) =>
    page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2;
    };
    const shortText = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 42);
    const rectInfo = (el: Element): RectInfo => {
      const rect = el.getBoundingClientRect();
      return {
        selector: el.className ? `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase(),
        text: shortText(el),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const overlapArea = (a: DOMRect, b: DOMRect) => {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };

    const cards = Array.from(
      document.querySelectorAll(
        '.card,.panel-card,.treehole-card,.detail-card,.reply-card,.write-card,.letter-card,.letter-intro,.feature-card,.growth-card,.report-summary-card,.report-panel,.settings-card,.feedback-form,.decompose-input-card,.decompose-result-card,.diary-card,.letter-list-card,.favorite-card,.faq-card,.tool-tile,.me-entry',
      ),
    ).filter(visible);

    const textOverlaps: OverlapData['textOverlaps'] = [];
    for (const card of cards) {
      const elements = Array.from(card.querySelectorAll('h1,h2,h3,p,strong,small,label,button,a,textarea,select,input'))
        .filter(visible)
        .filter((el) => shortText(el).length > 0)
        .slice(0, 28);
      for (let i = 0; i < elements.length; i += 1) {
        for (let j = i + 1; j < elements.length; j += 1) {
          const a = elements[i];
          const b = elements[j];
          if (a.contains(b) || b.contains(a)) continue;
          const area = overlapArea(a.getBoundingClientRect(), b.getBoundingClientRect());
          if (area > 24) textOverlaps.push({ a: rectInfo(a), b: rectInfo(b), area: Math.round(area) });
        }
      }
    }

    const buttonOverflow = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .filter(visible)
      .filter((el) => el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 4)
      .map((el) => ({
        ...rectInfo(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));

    return { textOverlaps: textOverlaps.slice(0, 20), buttonOverflow: buttonOverflow.slice(0, 20) };
    }),
  );

  const summaryRows = results.map((item) => [
    item.page,
    item.viewport,
    item.data.textOverlaps.length,
    item.data.buttonOverflow.length,
    item.data.textOverlaps.length || item.data.buttonOverflow.length ? 'REVIEW' : 'OK',
  ]);

  await writeJson('artifacts/layout/front-overlap-report.json', {
    generatedAt: new Date().toISOString(),
    results,
  });

  await writeMarkdown(
    'artifacts/layout/front-overlap-report.md',
    [
      '# Front Layout Overlap Report',
      '',
      markdownTable(['page', 'viewport', 'textOverlaps', 'buttonOverflow', 'result'], summaryRows),
      '',
      'Notes: overlap detection is DOM-heuristic and is paired with visual screenshot review.',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
