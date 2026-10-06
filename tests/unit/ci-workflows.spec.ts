import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'yaml';

describe('GitHub Actions CI Workflow definitions', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  it('validates ci.yml syntax, services, and required steps', () => {
    const ciPath = path.join(repoRoot, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf8');
    const parsed = yaml.parse(content);

    expect(parsed.name).toBe('CI');
    expect(parsed.on).toBeDefined();
    expect(parsed.jobs.test).toBeDefined();

    const job = parsed.jobs.test;
    expect(job.services.postgres).toBeDefined();
    expect(job.services.redis).toBeDefined();

    const steps = job.steps.map((s: { name: string }) => s.name);
    expect(steps).toContain('Migration immutability check');
    expect(steps).toContain('Build test database with prisma migrate deploy');
    expect(steps).toContain('Typecheck');
    expect(steps).toContain('Lint');
    expect(steps).toContain('Run regression gate (Batch 1 specs + persistence-durability)');
    expect(steps).toContain('Run full business suite');
    expect(steps).toContain('Report full business suite results honestly');
  });

  it('validates live-ai.yml syntax and NOT_RUN_NO_SECRET enforcement', () => {
    const liveAiPath = path.join(repoRoot, '.github/workflows/live-ai.yml');
    expect(fs.existsSync(liveAiPath)).toBe(true);
    const content = fs.readFileSync(liveAiPath, 'utf8');
    const parsed = yaml.parse(content);

    expect(parsed.name).toBe('Live AI Verification');
    expect(parsed.on.workflow_dispatch).toBeDefined();
    expect(parsed.jobs['live-ai']).toBeDefined();

    const job = parsed.jobs['live-ai'];
    expect(job.services.postgres).toBeDefined();
    expect(job.services.redis).toBeDefined();

    // Verify NOT_RUN_NO_SECRET check step exists
    const secretCheckStep = job.steps.find((s: { name: string }) =>
      s.name.includes('Secret Presence'),
    );
    expect(secretCheckStep).toBeDefined();
    expect(secretCheckStep.run).toContain('NOT_RUN_NO_SECRET');
    expect(secretCheckStep.run).toContain('exit 1');
  });
});
