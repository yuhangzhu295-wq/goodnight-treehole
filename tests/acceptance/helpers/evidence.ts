import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the evidence a business flow produced, in a shape a reviewer can check without rerunning it.
 *
 * Every step records what was expected, what actually happened, and - where it applies - the request,
 * the response and the row read back from PostgreSQL. A step is only PASS when the caller says the
 * expected and actual agree; this helper never decides that on its own, because "the request returned
 * 200" is not the same claim as "the row says what it should".
 *
 * The run id comes from ACCEPTANCE_RUN_ID so every flow in one acceptance run writes under the same
 * directory. Without it a run id is generated, which keeps a bare `vitest run` from scattering files
 * across the tree.
 */

export type EvidenceLayer =
  | 'UI_EVIDENCE'
  | 'API_EVIDENCE'
  | 'DATABASE_EVIDENCE'
  | 'SECURITY_EVIDENCE'
  | 'PERSISTENCE_EVIDENCE';

export type Verdict = 'PASS' | 'FAIL';

export type StepRecord = {
  step: string;
  layer: EvidenceLayer;
  expected?: unknown;
  actual?: unknown;
  request?: unknown;
  response?: unknown;
  sql?: unknown;
  screenshot?: string;
  verdict: Verdict;
  detail?: string;
};

export const ACCEPTANCE_RUN_ID =
  process.env.ACCEPTANCE_RUN_ID ?? `adhoc-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const root = path.resolve(process.cwd(), 'artifacts/acceptance', ACCEPTANCE_RUN_ID);

/** Trims a value so a large response body cannot bury the evidence it is meant to support. */
function trim(value: unknown, limit = 2_000): unknown {
  if (value === undefined) return undefined;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return value;
  return text.length <= limit ? value : `${text.slice(0, limit)}... [truncated ${text.length - limit} chars]`;
}

/** JSON with object keys sorted, so a comparison cannot fail on key order alone. */
function stable(value: unknown): string {
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input as Record<string, unknown>)
          .sort()
          .map((key) => [key, walk((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  };
  return JSON.stringify(walk(value));
}

export class FlowEvidence {
  private readonly steps: StepRecord[] = [];

  constructor(private readonly flowId: string) {}

  /** Records a step. Returns the verdict so a caller can branch on it. */
  record(entry: Omit<StepRecord, 'verdict'> & { verdict: Verdict }): Verdict {
    this.steps.push({
      ...entry,
      expected: trim(entry.expected),
      actual: trim(entry.actual),
      request: trim(entry.request),
      response: trim(entry.response),
      sql: trim(entry.sql),
    });
    return entry.verdict;
  }

  /** Records a comparison and returns whether it held. */
  check(entry: Omit<StepRecord, 'verdict' | 'expected' | 'actual'> & { expected: unknown; actual: unknown }): boolean {
    const pass = stable(entry.expected) === stable(entry.actual);
    this.record({ ...entry, verdict: pass ? 'PASS' : 'FAIL' });
    return pass;
  }

  get failures(): StepRecord[] {
    return this.steps.filter((step) => step.verdict === 'FAIL');
  }

  /**
   * Writes `<flow>/evidence.json` and returns the path. Safe to call once per flow.
   *
   * A FAIL verdict is thrown, not merely written. The first F05 run produced nine steps where two
   * `actual` objects carried an extra diagnostic key, so `check` correctly said FAIL while every
   * `expect` in the spec passed: the suite was green and the evidence said the flow failed. A
   * verdict nobody reads is not a verdict, so the file is written first (for diagnosis) and then
   * the failure is raised. Diagnostics belong in `detail`, which is not compared.
   */
  flush(): string {
    const dir = path.join(root, this.flowId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'evidence.json');
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          flowId: this.flowId,
          runId: ACCEPTANCE_RUN_ID,
          gitSha: process.env.GIT_COMMIT_SHA ?? 'unknown',
          recordedAt: new Date().toISOString(),
          databaseUrl: (process.env.DATABASE_URL ?? '').replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@'),
          verdict: this.failures.length === 0 ? 'PASS' : 'FAIL',
          stepCount: this.steps.length,
          steps: this.steps,
        },
        null,
        2,
      ) + '\n',
    );
    if (this.failures.length > 0) {
      const summary = this.failures.map((step) => `  - ${step.step}`).join('\n');
      throw new Error(
        `${this.flowId}: ${this.failures.length}/${this.steps.length} evidence steps FAILED\n${summary}\nSee ${file}`,
      );
    }
    return file;
  }
}
