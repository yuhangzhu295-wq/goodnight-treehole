import fs from 'node:fs/promises';
import path from 'node:path';

export const truthAuditRoot = path.resolve('artifacts', 'final-ui-truth-audit', 'first-stage');
export const referenceRoot = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明';
const captureRoot = path.resolve('artifacts', 'reference-fidelity', 'first-stage');

export type TruthAuditPage = {
  directory: string;
  state: string;
  reference: string;
  title: string;
  navigation: 'four-tab' | 'detail';
};

export const truthAuditPages: TruthAuditPage[] = [
  { directory: '01-tonight', state: 'tonight', reference: '01_今晚怎么了.png', title: '今晚怎么了', navigation: 'four-tab' },
  { directory: '36-situation', state: 'confirm', reference: '36_经历指纹确认_正式版.png', title: '经历指纹确认', navigation: 'four-tab' },
  { directory: '29-temperature', state: 'temperature', reference: '29_情绪温度计.png', title: '情绪温度计', navigation: 'four-tab' },
  { directory: '13-intent', state: 'intent', reference: '13_你现在最需要什么.png', title: '支持意图', navigation: 'four-tab' },
  { directory: '32-stabilize', state: 'stabilize', reference: '32_我先接住你.png', title: '我先接住你', navigation: 'four-tab' },
  { directory: '33-safety', state: 'safety', reference: '33_SafetyFlow_正式版.png', title: '安全支持', navigation: 'detail' },
  { directory: '16-handoff', state: 'reality', reference: '16_现实求助卡.png', title: '现实求助卡', navigation: 'detail' },
  { directory: '06-action', state: 'action', reference: '06_今晚只做这一件事.png', title: '今晚，只做这一件事', navigation: 'four-tab' },
  { directory: '37-adaptive', state: 'adaptive', reference: '37_AdaptiveMicroAction.png', title: 'Adaptive Micro Action', navigation: 'four-tab' },
  { directory: '39-notification', state: 'notification', reference: '39_提醒与回访.png', title: '提醒与回访', navigation: 'four-tab' },
  { directory: '34-timeline', state: 'timeline', reference: '34_Journey时间线_正式版.png', title: 'Journey 时间线', navigation: 'detail' },
];

async function requireFile(file: string) {
  try {
    await fs.access(file);
  } catch {
    throw new Error(`Missing fresh capture evidence: ${file}`);
  }
}

async function copy(source: string, destination: string) {
  await requireFile(source);
  await fs.copyFile(source, destination);
}

/** This deliberately materializes evidence only; it cannot approve a page. */
export async function materializeTruthEvidence() {
  await fs.mkdir(truthAuditRoot, { recursive: true });
  for (const page of truthAuditPages) {
    const destination = path.join(truthAuditRoot, page.directory);
    await fs.mkdir(destination, { recursive: true });
    await copy(path.join(referenceRoot, page.reference), path.join(destination, 'reference.png'));
    await copy(path.join(captureRoot, `${page.state}-actual.png`), path.join(destination, 'actual.png'));
    await copy(path.join(captureRoot, `${page.state}-side-by-side.png`), path.join(destination, 'side-by-side.png'));
    await copy(path.join(captureRoot, `${page.state}-difference.png`), path.join(destination, 'difference.png'));
    await fs.writeFile(path.join(destination, 'evidence.json'), JSON.stringify({
      page: page.title,
      state: page.state,
      reference: page.reference,
      viewport: '420x786',
      navigationReference: page.navigation,
      sources: {
        reference: path.join(referenceRoot, page.reference),
        actual: path.join(captureRoot, `${page.state}-actual.png`),
        sideBySide: path.join(captureRoot, `${page.state}-side-by-side.png`),
        difference: path.join(captureRoot, `${page.state}-difference.png`),
      },
    }, null, 2), 'utf8');
  }
}

if (process.argv[1]?.endsWith('materialize-first-stage-final-audit.ts')) {
  materializeTruthEvidence().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
