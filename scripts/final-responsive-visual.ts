import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { adminVisualPages } from './visual/admin-pages.ts';
import { frontVisualPages } from './visual/front-pages.ts';

const root = process.cwd();
function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return value;
}

const fixtureManifestPath = option('--fixture-manifest') ?? process.env.VISUAL_FIXTURE_MANIFEST;
const fixtureStrict = process.argv.includes('--fixture-strict') || process.env.VISUAL_FIXTURE_STRICT === '1';
const requestedPage = option('--page')?.padStart(2, '0');
const requestedScope = option('--scope');
if (requestedScope && requestedScope !== 'admin' && requestedScope !== 'front') throw new Error(`Unknown visual scope ${requestedScope}.`);
const adminBase = (option('--admin-base') ?? process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174').replace(/\/$/, '');
const frontBase = (option('--front-base') ?? process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const apiBase = (option('--api-base') ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const artifactRoot = path.resolve(option('--artifact-root') ?? process.env.VISUAL_ARTIFACT_ROOT ?? 'artifacts');
const reportFileName = process.env.VISUAL_REPORT_FILE ?? (fixtureManifestPath ? 'visual-fixture-report.md' : 'final-visual-report.md');
const traceFileName = process.env.VISUAL_TRACE_FILE ?? (fixtureManifestPath ? 'visual-fixture-trace.json' : 'final-responsive-visual.json');
const adminScreenshotsDir = path.join(artifactRoot, 'screenshots', 'admin-final');
const frontScreenshotsDir = path.join(artifactRoot, 'screenshots', 'front-final');
const diffRoot = path.join(artifactRoot, 'diffs', 'final');
const traceRoot = path.join(artifactRoot, 'traces', 'final');
const reportRoot = path.join(artifactRoot, 'test-report');
type FixtureManifest = {
  id: string;
  version: string;
  fixtureOnly: boolean;
  runtimeInstanceId: string;
  reference: { front: { postId: string; emotionAnalysisJobId: string; reportMonth: string }; admin: { userId: string; postId: string; replyId: string; jobId: string; ticketId: string } };
};
let fixtureManifest: FixtureManifest | undefined;
const fixtureNetworkLeaks: string[] = [];
const adminSizes = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
const frontSizes = [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
// The supplied design references are native 941x1672 captures of a 430x764
// CSS viewport at this DPR. Pixel comparison is meaningful only at that
// native reference frame; responsive viewports below are audited for reflow.
const frontReferenceSize = { width: 430, height: 764, deviceScaleFactor: 941 / 430 };
const adminReferenceSize = { width: 1448, height: 1086 };
const fixedCaptureClock = {
  admin: '2025-05-26T10:21:33+08:00',
  front: '2026-04-30T23:17:00+08:00',
} as const;

const visualMaskRoles = ['time', 'userText', 'aiText', 'stat', 'userImage'] as const;
const visualMaskPolicyVersion = 'final-responsive-visual-mask/v1';
const maxMaskUnionPercent: Record<VisualScope, number> = { front: 6, admin: 4 };
const maxUserImageMaskUnionPercent = 2.5;

type VisualScope = 'front' | 'admin';
type VisualMaskRole = typeof visualMaskRoles[number];
type CssRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type NativeMaskRect = { x: number; y: number; width: number; height: number };
type NativeReferenceFrame = { width: number; height: number; systemChromeInset: number };
type NativeMaskMapping = { rect: NativeMaskRect; reason?: never } | { rect?: never; reason: string };
type BrowserMaskCandidate = {
  sourceIndex: number;
  role?: VisualMaskRole;
  kind?: 'text' | 'image';
  rects: CssRect[];
  offscreenOnly?: boolean;
  rejectionReasons: string[];
};
type BrowserMaskDiscovery = {
  viewport: { width: number; height: number };
  candidates: BrowserMaskCandidate[];
};
type VisualMaskRecord = {
  sourceIndex: number;
  role: VisualMaskRole;
  kind: 'text' | 'image';
  rects: NativeMaskRect[];
  areaPixels: number;
};
type VisualMaskRejection = { sourceIndex: number; reasons: string[] };
type VisualMaskMetadata = {
  policyVersion: string;
  scope: VisualScope;
  capturePhase: 'reference-only';
  coordinateSpace: 'native-reference-fixed';
  currentPageCoordinatesCollected: false;
  nativeReference: NativeReferenceFrame;
  sourceCount: number;
  skippedOffscreenMaskCount: number;
  acceptedMaskCount: number;
  acceptedRectCount: number;
  rejectedMasks: VisualMaskRejection[];
  policyViolations: string[];
  boundsValid: boolean;
  coverageValid: boolean;
  policyPassed: boolean;
  maskingApplied: boolean;
  coverage: {
    referencePixels: number;
    unionPixels: number;
    unionPercent: number;
    maxUnionPercent: number;
    userImageUnionPixels: number;
    userImageUnionPercent: number;
    maxUserImageUnionPercent: number;
  };
  masks: VisualMaskRecord[];
  appliedRects: NativeMaskRect[];
};
type ImageDiff = {
  rawDiffPercent: number;
  maskedDiffPercent: number;
  rawDiffPixels: number;
  maskedDiffPixels: number;
  productPixels: number;
  rawDiffImage: PNG;
  maskedDiffImage: PNG;
  overlayImage: PNG;
};
type Row = {
  scope: string;
  page: string;
  viewport: string;
  hscroll: boolean;
  overflow: boolean;
  pageErrors: string[];
  corruptedText: boolean;
  wideControls: string[];
  rawDiffPercent?: number;
  maskedDiffPercent?: number;
  visualMask?: VisualMaskMetadata;
  referenceState?: string;
  stateApplied?: boolean;
  stateDetail?: string;
};

const nativeReferenceFrameCache = new Map<string, NativeReferenceFrame>();

function nativeReferenceFrame(designFile: string): NativeReferenceFrame {
  const cached = nativeReferenceFrameCache.get(designFile);
  if (cached) return cached;
  const design = PNG.sync.read(fsSync.readFileSync(designFile));
  const systemChromeInset = designFile.replace(/\\/g, '/').includes('design_refs/front/') ? 62 : 0;
  const frame = { width: design.width, height: design.height, systemChromeInset };
  nativeReferenceFrameCache.set(designFile, frame);
  return frame;
}

function clonePng(source: PNG) {
  const cloned = new PNG({ width: source.width, height: source.height });
  source.data.copy(cloned.data);
  return cloned;
}

function createOverlay(reference: PNG, current: PNG) {
  const overlay = new PNG({ width: reference.width, height: reference.height });
  for (let offset = 0; offset < reference.data.length; offset += 4) {
    overlay.data[offset] = Math.round((reference.data[offset] + current.data[offset]) / 2);
    overlay.data[offset + 1] = Math.round((reference.data[offset + 1] + current.data[offset + 1]) / 2);
    overlay.data[offset + 2] = Math.round((reference.data[offset + 2] + current.data[offset + 2]) / 2);
    overlay.data[offset + 3] = 255;
  }
  return overlay;
}

function countDiffPixels(reference: PNG, current: PNG, diffImage = new PNG({ width: reference.width, height: reference.height })) {
  return pixelmatch(
    reference.data,
    current.data,
    diffImage.data,
    reference.width,
    reference.height,
    { threshold: 0.12, includeAA: true },
  );
}

function assertNativeMaskBounds(mask: NativeMaskRect, frame: NativeReferenceFrame) {
  if (
    !Number.isInteger(mask.x)
    || !Number.isInteger(mask.y)
    || !Number.isInteger(mask.width)
    || !Number.isInteger(mask.height)
    || mask.width <= 0
    || mask.height <= 0
    || mask.x < 0
    || mask.y < 0
    || mask.x + mask.width > frame.width
    || mask.y + mask.height > frame.height
  ) throw new Error('Visual mask escaped the validated native reference bounds.');
}

function paintMask(image: PNG, mask: NativeMaskRect) {
  for (let y = mask.y; y < mask.y + mask.height; y += 1) for (let x = mask.x; x < mask.x + mask.width; x += 1) {
    const offset = (y * image.width + x) * 4;
    // The same opaque value is written into both images. The rectangle is
    // reference-fixed, so a layout shift remains visible outside this region.
    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 255;
  }
}

function imageDiff(designFile: string, screenshotFile: string, masks: NativeMaskRect[] = []): ImageDiff {
  const design = PNG.sync.read(fsSync.readFileSync(designFile));
  const shot = PNG.sync.read(fsSync.readFileSync(screenshotFile));
  const frame = nativeReferenceFrame(designFile);
  const normalized = new PNG({ width: design.width, height: design.height });
  // The supplied handset references include iOS status-bar chrome, while the
  // product screenshots deliberately capture the web viewport only. Do not
  // score that operating-system strip as a product difference. This remains
  // the only non-DOM exclusion and is separate from dynamic mask policy.
  const systemChromeInset = Math.min(frame.systemChromeInset, design.height);
  for (let y = 0; y < design.height; y += 1) for (let x = 0; x < design.width; x += 1) {
    const sx = Math.min(shot.width - 1, Math.floor((x / design.width) * shot.width));
    const sy = Math.min(shot.height - 1, Math.floor((y / design.height) * shot.height));
    const source = (sy * shot.width + sx) * 4;
    const target = (y * design.width + x) * 4;
    if (y < systemChromeInset) {
      normalized.data[target] = design.data[target];
      normalized.data[target + 1] = design.data[target + 1];
      normalized.data[target + 2] = design.data[target + 2];
      normalized.data[target + 3] = design.data[target + 3];
    } else {
      normalized.data[target] = shot.data[source];
      normalized.data[target + 1] = shot.data[source + 1];
      normalized.data[target + 2] = shot.data[source + 2];
      normalized.data[target + 3] = shot.data[source + 3];
    }
  }
  const productPixels = design.width * (design.height - systemChromeInset);
  const rawDiffImage = new PNG({ width: design.width, height: design.height });
  const rawDiffPixels = countDiffPixels(design, normalized, rawDiffImage);
  const maskedReference = clonePng(design);
  const maskedCurrent = clonePng(normalized);
  for (const mask of masks) {
    assertNativeMaskBounds(mask, frame);
    paintMask(maskedReference, mask);
    paintMask(maskedCurrent, mask);
  }
  const maskedDiffImage = new PNG({ width: design.width, height: design.height });
  const maskedDiffPixels = countDiffPixels(maskedReference, maskedCurrent, maskedDiffImage);
  return {
    rawDiffPercent: (rawDiffPixels / productPixels) * 100,
    maskedDiffPercent: (maskedDiffPixels / productPixels) * 100,
    rawDiffPixels,
    maskedDiffPixels,
    productPixels,
    rawDiffImage,
    maskedDiffImage,
    overlayImage: createOverlay(design, normalized),
  };
}

async function writeReferenceDiff(scope: VisualScope, page: string, diff: ImageDiff) {
  const dir = path.join(diffRoot, scope);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, `${page}-overlay.png`), PNG.sync.write(diff.overlayImage)),
    fs.writeFile(path.join(dir, `${page}-raw-diff.png`), PNG.sync.write(diff.rawDiffImage)),
    fs.writeFile(path.join(dir, `${page}-masked-diff.png`), PNG.sync.write(diff.maskedDiffImage)),
  ]);
}

function unionYLength(rects: NativeMaskRect[]) {
  if (!rects.length) return 0;
  const intervals = rects
    .map((rect) => ({ start: rect.y, end: rect.y + rect.height }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let length = 0;
  let start = intervals[0].start;
  let end = intervals[0].end;
  for (const interval of intervals.slice(1)) {
    if (interval.start > end) {
      length += end - start;
      start = interval.start;
      end = interval.end;
    } else end = Math.max(end, interval.end);
  }
  return length + end - start;
}

function unionRectArea(rects: NativeMaskRect[]) {
  if (!rects.length) return 0;
  const events = rects.flatMap((rect, index) => [
    { x: rect.x, kind: 'start' as const, index },
    { x: rect.x + rect.width, kind: 'end' as const, index },
  ]).sort((left, right) => left.x - right.x || (left.kind === right.kind ? 0 : left.kind === 'end' ? -1 : 1));
  const active = new Map<number, NativeMaskRect>();
  let area = 0;
  let cursor = events[0].x;
  let eventIndex = 0;
  while (eventIndex < events.length) {
    const x = events[eventIndex].x;
    if (x > cursor) area += (x - cursor) * unionYLength([...active.values()]);
    while (eventIndex < events.length && events[eventIndex].x === x) {
      const event = events[eventIndex];
      if (event.kind === 'start') active.set(event.index, rects[event.index]);
      else active.delete(event.index);
      eventIndex += 1;
    }
    cursor = x;
  }
  return area;
}

function mapCssRectToNative(rect: CssRect, viewport: { width: number; height: number }, frame: NativeReferenceFrame): NativeMaskMapping {
  const values = [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height, viewport.width, viewport.height];
  if (!values.every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || rect.width <= 0 || rect.height <= 0) return { reason: 'invalid-mask-geometry' as const };
  if (rect.left < 0 || rect.top < 0 || rect.right > viewport.width || rect.bottom > viewport.height) return { reason: 'mask-outside-reference-viewport' as const };
  const x = Math.floor((rect.left / viewport.width) * frame.width);
  const y = Math.floor((rect.top / viewport.height) * frame.height);
  const right = Math.ceil((rect.right / viewport.width) * frame.width);
  const bottom = Math.ceil((rect.bottom / viewport.height) * frame.height);
  const mapped = { x, y, width: right - x, height: bottom - y };
  try {
    assertNativeMaskBounds(mapped, frame);
  } catch {
    return { reason: 'mask-outside-native-reference' as const };
  }
  return { rect: mapped };
}

function insetNativeMaskRect(rect: NativeMaskRect, inset: number, frame: NativeReferenceFrame): NativeMaskMapping {
  const insetRect = { x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 };
  try {
    assertNativeMaskBounds(insetRect, frame);
  } catch {
    return { reason: 'user-image-too-small-for-required-native-inset' as const };
  }
  return { rect: insetRect };
}

async function collectVisualMasks(page: Page, scope: VisualScope, frame: NativeReferenceFrame): Promise<VisualMaskMetadata> {
  // This is intentionally the only DOM read for dynamic masks. It occurs on
  // the reference capture page; the current image is never queried for mask
  // coordinates, so data-driven layout shifts cannot be hidden.
  const discovery = await page.evaluate((allowedRoles) => {
    const validRoles = new Set(allowedRoles);
    const structuralTags = new Set([
      'button', 'input', 'textarea', 'select', 'option', 'optgroup', 'fieldset',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
      'main', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'form', 'dialog',
      'canvas', 'video', 'audio', 'iframe', 'object',
    ]);
    const structuralName = /(^|[\s_-])(card|table|grid|layout|container|panel|drawer|modal|dialog|chart)(?=$|[\s_-])/i;
    const interactiveSelector = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="switch"], [contenteditable="true"]';
    const candidates = [...document.querySelectorAll<HTMLElement>('[data-visual-mask]')].map((element, sourceIndex) => {
      const rejectionReasons: string[] = [];
      const rawRole = (element.getAttribute('data-visual-mask') || '').trim();
      const role = (validRoles.has(rawRole as typeof allowedRoles[number]) ? rawRole : undefined) as VisualMaskRole | undefined;
      if (!role) rejectionReasons.push('unsupported-mask-role');
      if (element.children.length !== 0) rejectionReasons.push('mask-target-is-not-dom-leaf');
      const tag = element.tagName.toLowerCase();
      const identity = `${element.id} ${typeof element.className === 'string' ? element.className : ''} ${element.getAttribute('data-testid') || ''}`;
      const selfRole = (element.getAttribute('role') || '').toLowerCase();
      if (
        structuralTags.has(tag)
        || element instanceof SVGElement
        || Boolean(element.closest('svg'))
        || ['button', 'textbox', 'checkbox', 'combobox', 'menuitem', 'option', 'slider', 'switch', 'tab'].includes(selfRole)
        || structuralName.test(identity)
      ) rejectionReasons.push('structural-input-button-card-table-or-svg-mask');
      const interactiveAncestor = element.closest(interactiveSelector);
      if (interactiveAncestor) rejectionReasons.push('mask-target-is-inside-interactive-control');
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) rejectionReasons.push('mask-target-is-not-visible');

      let kind: 'text' | 'image' | undefined;
      let rects: CssRect[] = [];
      if (role === 'userImage') {
        kind = 'image';
        if (!(element instanceof HTMLImageElement)) rejectionReasons.push('user-image-mask-must-target-img');
        else if (!element.complete || element.naturalWidth <= 0 || element.naturalHeight <= 0) rejectionReasons.push('user-image-is-not-loaded');
        else {
          const rect = element.getBoundingClientRect();
          const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
          const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
          const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
          const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
          rects = [{
            left: rect.left + borderLeft,
            top: rect.top + borderTop,
            right: rect.right - borderRight,
            bottom: rect.bottom - borderBottom,
            width: rect.width - borderLeft - borderRight,
            height: rect.height - borderTop - borderBottom,
          }];
        }
      } else if (role) {
        kind = 'text';
        if (element instanceof HTMLImageElement) rejectionReasons.push('text-mask-cannot-target-img');
        else {
          const range = document.createRange();
          range.selectNodeContents(element);
          if (!range.toString().trim()) rejectionReasons.push('text-mask-has-no-text');
          rects = [...range.getClientRects()].map((rect) => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }));
        }
      }
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const clippedRects = rects.flatMap((rect) => {
        if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport.width || rect.top >= viewport.height) return [];
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(viewport.width, rect.right);
        const bottom = Math.min(viewport.height, rect.bottom);
        return right > left && bottom > top ? [{ left, top, right, bottom, width: right - left, height: bottom - top }] : [];
      });
      const offscreenOnly = rects.length > 0 && clippedRects.length === 0;
      if (!clippedRects.length && !offscreenOnly) rejectionReasons.push('mask-target-has-no-visible-rect');
      return { sourceIndex, role, kind, rects: clippedRects, offscreenOnly, rejectionReasons };
    });
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      candidates,
    };
  }, [...visualMaskRoles]) as BrowserMaskDiscovery;

  const masks: VisualMaskRecord[] = [];
  const rejectedMasks: VisualMaskRejection[] = [];
  const policyViolations: string[] = [];
  let boundsValid = true;
  let skippedOffscreenMaskCount = 0;
  for (const candidate of discovery.candidates) {
    if (candidate.offscreenOnly && candidate.rejectionReasons.length === 0) {
      skippedOffscreenMaskCount += 1;
      continue;
    }
    if (candidate.rejectionReasons.length || !candidate.role || !candidate.kind) {
      rejectedMasks.push({ sourceIndex: candidate.sourceIndex, reasons: candidate.rejectionReasons.length ? candidate.rejectionReasons : ['invalid-mask-candidate'] });
      policyViolations.push(...candidate.rejectionReasons);
      continue;
    }
    const rects: NativeMaskRect[] = [];
    const mappingReasons: string[] = [];
    for (const rect of candidate.rects) {
      const mapped = mapCssRectToNative(rect, discovery.viewport, frame);
      if (mapped.reason) mappingReasons.push(mapped.reason);
      else if (mapped.rect) {
        const safeRect = candidate.role === 'userImage'
          ? insetNativeMaskRect(mapped.rect, 2, frame)
          : { rect: mapped.rect };
        if (safeRect.reason) mappingReasons.push(safeRect.reason);
        else if (safeRect.rect) rects.push(safeRect.rect);
      }
    }
    if (mappingReasons.length || !rects.length) {
      boundsValid = false;
      rejectedMasks.push({ sourceIndex: candidate.sourceIndex, reasons: mappingReasons.length ? mappingReasons : ['mask-target-has-no-native-rect'] });
      policyViolations.push(...mappingReasons);
      continue;
    }
    masks.push({ sourceIndex: candidate.sourceIndex, role: candidate.role, kind: candidate.kind, rects, areaPixels: unionRectArea(rects) });
  }

  const allRects = masks.flatMap((mask) => mask.rects);
  const userImageRects = masks.filter((mask) => mask.role === 'userImage').flatMap((mask) => mask.rects);
  const referencePixels = frame.width * frame.height;
  const unionPixels = unionRectArea(allRects);
  const userImageUnionPixels = unionRectArea(userImageRects);
  const unionPercent = (unionPixels / referencePixels) * 100;
  const userImageUnionPercent = (userImageUnionPixels / referencePixels) * 100;
  const coverageValid = unionPercent <= maxMaskUnionPercent[scope] && userImageUnionPercent <= maxUserImageMaskUnionPercent;
  if (unionPercent > maxMaskUnionPercent[scope]) policyViolations.push('mask-union-coverage-exceeds-scope-limit');
  if (userImageUnionPercent > maxUserImageMaskUnionPercent) policyViolations.push('user-image-mask-union-coverage-exceeds-limit');
  const policyPassed = rejectedMasks.length === 0 && boundsValid && coverageValid;
  const appliedRects = policyPassed ? allRects : [];
  return {
    policyVersion: visualMaskPolicyVersion,
    scope,
    capturePhase: 'reference-only',
    coordinateSpace: 'native-reference-fixed',
    currentPageCoordinatesCollected: false,
    nativeReference: frame,
    sourceCount: discovery.candidates.length,
    skippedOffscreenMaskCount,
    acceptedMaskCount: masks.length,
    acceptedRectCount: allRects.length,
    rejectedMasks,
    policyViolations: [...new Set(policyViolations)],
    boundsValid,
    coverageValid,
    policyPassed,
    maskingApplied: policyPassed && appliedRects.length > 0,
    coverage: {
      referencePixels,
      unionPixels,
      unionPercent: Number(unionPercent.toFixed(4)),
      maxUnionPercent: maxMaskUnionPercent[scope],
      userImageUnionPixels,
      userImageUnionPercent: Number(userImageUnionPercent.toFixed(4)),
      maxUserImageUnionPercent: maxUserImageMaskUnionPercent,
    },
    masks,
    appliedRects,
  };
}

async function loadFixtureManifest() {
  if (!fixtureManifestPath) {
    if (fixtureStrict) throw new Error('--fixture-strict requires --fixture-manifest.');
    return;
  }
  const file = path.resolve(fixtureManifestPath);
  fixtureManifest = JSON.parse(await fs.readFile(file, 'utf8')) as FixtureManifest;
  if (!fixtureManifest.fixtureOnly || fixtureManifest.id !== 'visual-v1' || fixtureManifest.version !== 'v1' || fixtureManifest.runtimeInstanceId !== 'visual-fixture-v1') {
    throw new Error('Fixture manifest identity is invalid.');
  }
  const expectedRoot = path.resolve(root, 'artifacts', 'visual-fixtures');
  if (fixtureStrict && !artifactRoot.startsWith(`${expectedRoot}${path.sep}`)) {
    throw new Error(`Fixture evidence must remain below ${expectedRoot}; received ${artifactRoot}.`);
  }
}

async function assertFixtureIdentity() {
  if (!fixtureStrict) return;
  const response = await fetch(`${apiBase}/api/health`);
  if (!response.ok) throw new Error(`Fixture API health check failed: HTTP ${response.status}.`);
  const health = await response.json() as { fixture?: { enabled?: boolean; version?: string }; fingerprint?: { runtimeInstanceId?: string } };
  if (health.fixture?.enabled !== true || health.fixture.version !== fixtureManifest?.version || health.fingerprint?.runtimeInstanceId !== fixtureManifest?.runtimeInstanceId) {
    throw new Error('Fixture API health identity did not match the manifest.');
  }
}

function attachFixtureNetworkGuard(page: Page) {
  if (!fixtureStrict) return;
  page.on('request', (request) => {
    try {
      const target = new URL(request.url());
      const isApi = target.pathname === '/api' || target.pathname.startsWith('/api/');
      if (isApi && target.origin !== apiBase) fixtureNetworkLeaks.push(`${request.method()} ${target.origin}${target.pathname}`);
      if (target.hostname === '127.0.0.1' && target.port === '3000') fixtureNetworkLeaks.push(`${request.method()} unexpected-live-api ${target.href}`);
    } catch { /* non-HTTP resource */ }
  });
}

function fixtureReferenceId(kind: keyof FixtureManifest['reference']['admin']) {
  const value = fixtureManifest?.reference.admin[kind];
  if (fixtureStrict && !value) throw new Error(`Fixture manifest does not define admin reference ${kind}.`);
  return value;
}

async function login(page: Page) {
  await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
}

async function inspect(page: Page, pageErrors: string[]) {
  const metric = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const wideControls = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, [role="button"]')].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return [];
      const text = (element.getAttribute('aria-label') || element.innerText || element.getAttribute('data-testid') || element.tagName).replace(/\s+/g, ' ').trim().slice(0, 80);
      return [`${element.tagName.toLowerCase()}:${text || '(unnamed)'}@${Math.round(rect.left)}..${Math.round(rect.right)}`];
    });
    const text = document.body.innerText;
    return { hscroll: document.documentElement.scrollWidth > viewportWidth || document.body.scrollWidth > viewportWidth, overflow: wideControls.length > 0, wideControls, corruptedText: text.includes('??') || text.toLowerCase().includes('jiaolv') };
  });
  return { ...metric, pageErrors };
}

async function waitForLiveData(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  const busy = page.locator('[aria-busy="true"]');
  if (await busy.count()) await busy.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function prepareCapturePage(page: Page, scope: VisualScope) {
  const fixedNow = fixedCaptureClock[scope];
  await page.addInitScript(`
    (() => {
      const fixedNow = ${JSON.stringify(fixedNow)};
      const NativeDate = Date;
      class VisualFixtureDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedNow])); }
        static now() { return new NativeDate(fixedNow).getTime(); }
      }
      globalThis.Date = VisualFixtureDate;
    })();
  `);
}

function selectedPages<T extends { id: string }>(scope: VisualScope, pages: T[]) {
  if (requestedScope && requestedScope !== scope) return [];
  if (!requestedPage) return pages;
  const selected = pages.filter((page) => page.id === requestedPage || page.id === requestedPage.replace(/^0+/, '').padStart(2, '0'));
  if (!selected.length) throw new Error(`Unknown ${scope} visual page ${requestedPage}.`);
  return selected;
}

const selectedAdminVisualPages = selectedPages('admin', adminVisualPages);
const selectedFrontVisualPages = selectedPages('front', frontVisualPages);
if (requestedPage && selectedAdminVisualPages.length + selectedFrontVisualPages.length !== 1) throw new Error(`Visual page ${requestedPage} must resolve to exactly one scope.`);

async function captureAdminReferenceState(page: Page, item: { id: string }) {
  const stateByPage: Record<string, string> = {
    '03': 'first-user-detail',
    '04': 'first-post-detail',
    '05': 'first-reply-detail',
    '08': 'first-job-detail',
    '09': 'first-feedback-detail',
  };
  const referenceState = stateByPage[item.id] ?? 'initial-page';
  if (referenceState === 'initial-page') return { referenceState, stateApplied: true };

  const rows = page.locator('tbody tr');
  const targetByPage: Record<string, keyof FixtureManifest['reference']['admin']> = { '03': 'userId', '04': 'postId', '05': 'replyId', '08': 'jobId', '09': 'ticketId' };
  const targetId = targetByPage[item.id] ? fixtureReferenceId(targetByPage[item.id]) : undefined;
  const target = targetId ? page.locator(`tbody tr[data-visual-id="${targetId}"]`) : rows.nth(0);
  const count = await target.count();
  if (count !== 1) {
    if (fixtureStrict) throw new Error(`Fixture admin reference ${item.id} could not find exactly one row for ${targetId ?? 'first row'}.`);
    return { referenceState, stateApplied: false, stateDetail: 'No real table row available to activate.' };
  }
  await target.click();
  const detail = item.id === '08' ? page.getByTestId('admin-ai-job-detail') : page.getByTestId('admin-detail-drawer');
  if (fixtureStrict) await detail.waitFor({ state: 'visible', timeout: 5000 });
  else await detail.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  await waitForLiveData(page);
  return { referenceState, stateApplied: true };
}

async function existingEmotionAnalysisJobId() {
  if (fixtureManifest?.reference.front.emotionAnalysisJobId) return fixtureManifest.reference.front.emotionAnalysisJobId;
  try {
    const loginResponse = await fetch(`${apiBase}/api/admin/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    if (!loginResponse.ok) return undefined;
    const loginBody = await loginResponse.json() as { token?: string };
    if (!loginBody.token) return undefined;
    const jobsResponse = await fetch(`${apiBase}/api/admin/v1/ai/jobs?page=1&pageSize=100`, {
      headers: { authorization: `Bearer ${loginBody.token}` },
    });
    if (!jobsResponse.ok) return undefined;
    const jobsBody = await jobsResponse.json() as { items?: Array<{ id?: string; jobType?: string; taskType?: string; status?: string; promptSummary?: string }> };
    const candidates = jobsBody.items?.filter((job) => (job.jobType === 'emotion_analysis' || job.taskType === 'emotion_analysis') && ['succeeded', 'fallback'].includes(job.status ?? '')) ?? [];
    for (const candidate of candidates) {
      if (!candidate.id) continue;
      const detailResponse = await fetch(`${apiBase}/api/admin/v1/ai/jobs/${candidate.id}`, {
        headers: { authorization: `Bearer ${loginBody.token}` },
      });
      if (!detailResponse.ok) continue;
      const detailBody = await detailResponse.json() as { item?: { promptSummary?: string } };
      if (/我在会议|被否定/.test(detailBody.item?.promptSummary ?? '')) return candidate.id;
    }
    return candidates[0]?.id;
  } catch {
    return undefined;
  }
}

async function resolveFrontReferenceUrl(item: { id: string; route: string }) {
  if (item.id === '07') {
    const jobId = await existingEmotionAnalysisJobId();
    if (!jobId) {
      if (fixtureStrict) throw new Error('Fixture does not have a deterministic emotion-analysis job.');
      return `${frontBase}${item.route}`;
    }
    const url = new URL(item.route, frontBase);
    url.searchParams.set('job', jobId);
    return url.toString();
  }
  if (item.id === '10' && fixtureManifest?.reference.front.reportMonth) {
    const url = new URL(item.route, frontBase);
    url.searchParams.set('month', fixtureManifest.reference.front.reportMonth);
    return url.toString();
  }
  if (!['03', '04'].includes(item.id)) return `${frontBase}${item.route}`;
  if (fixtureManifest?.reference.front.postId) {
    const url = new URL(item.route, frontBase);
    url.searchParams.set('id', fixtureManifest.reference.front.postId);
    return url.toString();
  }
  try {
    const response = await fetch(`${apiBase}/api/v1/posts?page=1&pageSize=1`);
    const body = await response.json() as { items?: Array<{ id?: string }> };
    const postId = body.items?.[0]?.id;
    if (!postId) return `${frontBase}${item.route}`;
    const url = new URL(item.route, frontBase);
    url.searchParams.set('id', postId);
    return url.toString();
  } catch (error) {
    if (fixtureStrict) throw error;
    return `${frontBase}${item.route}`;
  }
}

function frontReferenceState(item: { id: string }) {
  if (item.id === '03') return 'first-public-post-detail';
  if (item.id === '04') return 'first-public-post-reply-sheet';
  if (item.id === '07') return 'existing-emotion-analysis-result';
  return 'initial-page';
}

async function captureFrontReferenceState(page: Page, item: { id: string }) {
  const referenceState = frontReferenceState(item);
  if (item.id !== '04') return { referenceState, stateApplied: true };
  const openReply = page.getByTestId('btn-open-reply');
  if (await openReply.count() !== 1) {
    if (fixtureStrict) throw new Error('Fixture reply-sheet reference could not find exactly one real reply button.');
    return { referenceState, stateApplied: false, stateDetail: 'No real reply trigger available.' };
  }
  await openReply.click();
  const sheet = page.locator('[data-state="reply-sheet"]');
  if (fixtureStrict) await sheet.waitFor({ state: 'visible', timeout: 5000 });
  else await sheet.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  await waitForLiveData(page);
  return { referenceState, stateApplied: true };
}

function maskPolicySummary(mask: VisualMaskMetadata | undefined) {
  if (!mask) return { policy: '-', coverage: '-' };
  return {
    policy: `${mask.policyPassed ? 'PASS' : 'REJECT'}; sources=${mask.sourceCount}; accepted=${mask.acceptedMaskCount}; rejected=${mask.rejectedMasks.length}; applied=${mask.maskingApplied}`,
    coverage: `${mask.coverage.unionPercent.toFixed(2)}%/${mask.coverage.maxUnionPercent.toFixed(2)}%; userImage=${mask.coverage.userImageUnionPercent.toFixed(2)}%/${mask.coverage.maxUserImageUnionPercent.toFixed(2)}%`,
  };
}

async function main() {
  await loadFixtureManifest();
  await assertFixtureIdentity();
  await Promise.all([fs.mkdir(adminScreenshotsDir, { recursive: true }), fs.mkdir(frontScreenshotsDir, { recursive: true }), fs.mkdir(traceRoot, { recursive: true }), fs.mkdir(reportRoot, { recursive: true })]);
  const browser = await chromium.launch({ headless: true });
  const rows: Row[] = [];
  try {
    for (const size of adminSizes) {
      const context = await browser.newContext({ viewport: size, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      await prepareCapturePage(page, 'admin');
      attachFixtureNetworkGuard(page);
      let currentErrors: string[] = [];
      page.on('pageerror', (error) => currentErrors.push(error.message));
      await login(page);
      for (const item of selectedAdminVisualPages) {
        currentErrors = [];
        if (item.id === '01') await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
        else await page.goto(`${adminBase}${item.route}`, { waitUntil: 'domcontentloaded' });
        await page.locator(item.id === '01' ? '.login-card' : 'main').waitFor({ state: 'visible', timeout: 10000 });
        await waitForLiveData(page);
        const file = path.join(adminScreenshotsDir, `${item.name}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const result = await inspect(page, currentErrors);
        rows.push({ scope: 'admin', page: item.name, viewport: `${size.width}x${size.height}`, referenceState: 'initial-page', stateApplied: true, ...result });
      }
      await context.close();
    }

    // Compare against the source design at its native dimensions. Resizing a
    // 16:9 operational viewport into the 4:3 reference would create a
    // synthetic pixel failure rather than measure the rendered design.
    {
      const context = await browser.newContext({ viewport: adminReferenceSize, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      await prepareCapturePage(page, 'admin');
      attachFixtureNetworkGuard(page);
      let currentErrors: string[] = [];
      page.on('pageerror', (error) => currentErrors.push(error.message));
      await login(page);
      for (const item of selectedAdminVisualPages) {
        currentErrors = [];
        if (item.id === '01') await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
        else await page.goto(`${adminBase}${item.route}`, { waitUntil: 'domcontentloaded' });
        await page.locator(item.id === '01' ? '.login-card' : 'main').waitFor({ state: 'visible', timeout: 10000 });
        await waitForLiveData(page);
        const state = item.id === '01'
          ? { referenceState: 'initial-page', stateApplied: true }
          : await captureAdminReferenceState(page, item);
        const designFile = path.join(root, item.design);
        const visualMask = await collectVisualMasks(page, 'admin', nativeReferenceFrame(designFile));
        const file = path.join(adminScreenshotsDir, `${item.name}-reference-${adminReferenceSize.width}x${adminReferenceSize.height}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const result = await inspect(page, currentErrors);
        const diff = imageDiff(designFile, file, visualMask.appliedRects);
        await writeReferenceDiff('admin', item.name, diff);
        rows.push({
          scope: 'admin-reference',
          page: item.name,
          viewport: `${adminReferenceSize.width}x${adminReferenceSize.height}`,
          ...state,
          ...result,
          visualMask,
          rawDiffPercent: Number(diff.rawDiffPercent.toFixed(2)),
          maskedDiffPercent: Number(diff.maskedDiffPercent.toFixed(2)),
        });
      }
      await context.close();
    }
    for (const size of frontSizes) {
      const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      await prepareCapturePage(page, 'front');
      attachFixtureNetworkGuard(page);
      let currentErrors: string[] = [];
      page.on('pageerror', (error) => currentErrors.push(error.message));
      for (const item of selectedFrontVisualPages) {
        currentErrors = [];
        await page.goto(await resolveFrontReferenceUrl(item), { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.locator('main.phone-shell').waitFor({ state: 'visible', timeout: 10000 });
        await waitForLiveData(page);
        const file = path.join(frontScreenshotsDir, `${item.name}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const result = await inspect(page, currentErrors);
        rows.push({ scope: 'front', page: item.name, viewport: `${size.width}x${size.height}`, referenceState: 'initial-page', stateApplied: true, ...result });
      }
      await context.close();
    }

    {
      const context = await browser.newContext({ viewport: frontReferenceSize, isMobile: true, hasTouch: true, deviceScaleFactor: frontReferenceSize.deviceScaleFactor, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      await prepareCapturePage(page, 'front');
      attachFixtureNetworkGuard(page);
      let currentErrors: string[] = [];
      page.on('pageerror', (error) => currentErrors.push(error.message));
      for (const item of selectedFrontVisualPages) {
        currentErrors = [];
        const targetUrl = await resolveFrontReferenceUrl(item);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.locator('main.phone-shell').waitFor({ state: 'visible', timeout: 10000 });
        await waitForLiveData(page);
        const state = await captureFrontReferenceState(page, item);
        const designFile = path.join(root, item.design);
        const visualMask = await collectVisualMasks(page, 'front', nativeReferenceFrame(designFile));
        const file = path.join(frontScreenshotsDir, `${item.name}-reference-${frontReferenceSize.width}x${frontReferenceSize.height}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const result = await inspect(page, currentErrors);
        const diff = imageDiff(designFile, file, visualMask.appliedRects);
        await writeReferenceDiff('front', item.name, diff);
        rows.push({
          scope: 'front-reference',
          page: item.name,
          viewport: `${frontReferenceSize.width}x${frontReferenceSize.height}@${frontReferenceSize.deviceScaleFactor.toFixed(4)}x`,
          ...state,
          ...result,
          visualMask,
          rawDiffPercent: Number(diff.rawDiffPercent.toFixed(2)),
          maskedDiffPercent: Number(diff.maskedDiffPercent.toFixed(2)),
        });
      }
      await context.close();
    }
  } finally { await browser.close(); }
  if (fixtureStrict && fixtureNetworkLeaks.length) throw new Error(`Fixture browser contacted an unexpected API endpoint: ${[...new Set(fixtureNetworkLeaks)].join(' | ')}`);
  const layoutFailures = rows.filter((row) => row.hscroll || row.overflow || row.corruptedText || row.pageErrors.length);
  const visualFailures = rows.filter((row) => (row.maskedDiffPercent ?? 0) > 5);
  const maskPolicyFailures = rows.filter((row) => row.visualMask && !row.visualMask.policyPassed);
  const report = [
    '# Final multi-viewport visual acceptance', '',
    `Rows: ${rows.length}; layout failures: ${layoutFailures.length}; visual threshold failures (>5% masked diff): ${visualFailures.length}; visual-mask policy failures: ${maskPolicyFailures.length}.`, '',
    'Responsive rows are captured at the required operational viewports (front: 375x812, 390x844, 430x932; admin: 1366x768, 1440x900, 1920x1080) and are evaluated for reflow, overflow, errors, and corrupted text. Pixel threshold rows use the native dimensions of the supplied design references, so cross-aspect resizing cannot masquerade as a product visual defect.', '',
    `Dynamic mask policy ${visualMaskPolicyVersion}: only DOM-leaf [data-visual-mask] regions with roles ${visualMaskRoles.join(', ')} are eligible. Text uses DOM Range line rectangles and userImage must be a loaded img inner rectangle with an additional 2-native-pixel inset on every edge. Fully offscreen leaf regions are skipped because they do not exist in the captured frame; partial regions are clipped to the reference viewport. Structural, input, button, card, table, and SVG targets are rejected. Reference-native coordinates are collected exactly once before the reference screenshot and painted into both reference and current images; current DOM coordinates are never collected, so layout shifts remain visible. Dynamic union coverage is capped at front 6%, admin 4%, and userImage 2.5% of the native reference. Metadata contains geometry and policy results only, never masked text.`, '',
    'The front handset comparison retains the existing 62-pixel operating-system status-bar exclusion from the supplied raster references. It is not a DOM mask and does not cover application content.', '',
    `For every native design-reference row, ${path.relative(root, diffRoot).replace(/\\/g, '/')}/<scope>/<page>-raw-diff.png and ...-masked-diff.png are generated from the same capture. Raw diff remains the unmasked evidence; masked diff applies only the policy-approved fixed reference coordinates documented in the trace.`, '',
    '| Scope | Page | Viewport | Reference state | Applied | HScroll | Control overflow | Errors | Corrupted text | Raw diff | Masked diff | Mask policy | Mask coverage |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |',
    ...rows.map((row) => {
      const mask = maskPolicySummary(row.visualMask);
      return `| ${row.scope} | ${row.page} | ${row.viewport} | ${row.referenceState ?? '-'} | ${row.stateApplied === undefined ? '-' : row.stateApplied} | ${row.hscroll} | ${row.overflow} | ${row.pageErrors.length} | ${row.corruptedText} | ${row.rawDiffPercent === undefined ? '-' : `${row.rawDiffPercent.toFixed(2)}%`} | ${row.maskedDiffPercent === undefined ? '-' : `${row.maskedDiffPercent.toFixed(2)}%`} | ${mask.policy} | ${mask.coverage} |`;
    }), '',
    ...(maskPolicyFailures.length ? ['## Visual-mask policy failures', '', ...maskPolicyFailures.map((row) => `- ${row.scope} / ${row.page} / ${row.viewport}: ${(row.visualMask?.policyViolations || []).join(', ') || 'policy-failed-without-reported-reason'}.`), ''] : []),
    ...(layoutFailures.length ? ['## Layout failure details', '', ...layoutFailures.map((row) => `- ${row.scope} / ${row.page} / ${row.viewport}: hscroll=${row.hscroll}, controls=${row.wideControls.join('; ') || 'none'}, errors=${row.pageErrors.join(' | ') || 'none'}, corrupted=${row.corruptedText}`), ''] : []),
  ].join('\n');
  const maskPolicy = {
    version: visualMaskPolicyVersion,
    allowedRoles: [...visualMaskRoles],
    capturePhase: 'reference-only',
    coordinateSpace: 'native-reference-fixed',
    currentPageCoordinatesCollected: false,
    maxUnionPercent: maxMaskUnionPercent,
    maxUserImageUnionPercent: maxUserImageMaskUnionPercent,
    frontSystemChromeInset: 62,
  };
  await Promise.all([
    fs.writeFile(path.join(reportRoot, reportFileName), report, 'utf8'),
    fs.writeFile(path.join(traceRoot, traceFileName), JSON.stringify({ generatedAt: new Date().toISOString(), fixture: fixtureManifest ? { id: fixtureManifest.id, version: fixtureManifest.version, strict: fixtureStrict, apiBase, frontBase, adminBase, artifactRoot, networkLeaks: fixtureNetworkLeaks } : undefined, captureEnvironment: { locale: 'zh-CN', timezoneId: 'Asia/Shanghai', fixedClock: fixedCaptureClock, requestedScope: requestedScope ?? 'all', requestedPage: requestedPage ?? 'all', animations: 'disabled', scrollPosition: 'top' }, maskPolicy, rows, layoutFailures, visualFailures, maskPolicyFailures }, null, 2), 'utf8'),
  ]);
  if (layoutFailures.length || visualFailures.length || maskPolicyFailures.length) throw new Error(`Visual acceptance failed: layout=${layoutFailures.length}, diff=${visualFailures.length}, maskPolicy=${maskPolicyFailures.length}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
