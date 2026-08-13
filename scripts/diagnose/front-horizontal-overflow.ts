import { markdownTable, withLayoutPages, writeMarkdown } from './front-layout-common.ts';

type OverflowData = {
  innerWidth: number;
  scrollWidth: number;
  bodyScrollWidth: number;
  overflow: number;
};

async function main(): Promise<void> {
  const results = await withLayoutPages<OverflowData>(async (page) =>
    page.evaluate(() => {
      const innerWidth = window.innerWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      return {
        innerWidth,
        scrollWidth,
        bodyScrollWidth,
        overflow: Math.max(scrollWidth, bodyScrollWidth) - innerWidth,
      };
    }),
  );

  const offenders = results.filter((item) => item.data.overflow > 2);
  const rows = results.map((item) => [
    item.page,
    item.viewport,
    item.data.innerWidth,
    item.data.scrollWidth,
    item.data.bodyScrollWidth,
    item.data.overflow > 2 ? `FAIL +${item.data.overflow}` : 'OK',
  ]);

  await writeMarkdown(
    'artifacts/layout/front-horizontal-overflow.md',
    [
      '# Front Horizontal Overflow Report',
      '',
      markdownTable(['page', 'viewport', 'innerWidth', 'docScrollWidth', 'bodyScrollWidth', 'result'], rows),
      '',
      offenders.length ? `Blocking overflow count: ${offenders.length}` : 'No horizontal overflow over 2px.',
    ].join('\n'),
  );

  if (offenders.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
