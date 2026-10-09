/**
 * Mutation harness for persistence Batch 3, step 1
 * (`PrivacySetting`, `TrustedContact`, `StableSelfProfile`, `RealityHandoff`, `PersonalSupportPlan`).
 *
 * Same discipline as `scripts/batch2-mutation-check.ts`: a guard is only proven if removing it makes
 * a **named** test fail. The harness refuses to run at all unless its baseline is green, requires a
 * clean child exit, reports `PROVEN-UNRELATED` when the failures do not include the named test, and
 * restores every patched file in a `finally` that also covers patch application.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SELF = 'apps/api/src/self-persistence.service.ts';
const STORE = 'apps/api/src/store.service.ts';
const CONTROLLERS = 'apps/api/src/controllers.ts';
const REGISTRY = 'apps/api/src/direct-db-models.ts';
const SELF_SPEC = 'tests/business/batch3-self-verification.spec.ts';
const PRIVACY_SPEC = 'tests/business/third-stage-privacy-2.spec.ts';
const TRANSITION_SPEC = 'tests/business/batch3-journey-transition.spec.ts';
const RECOVERY_SPEC = 'tests/business/batch3-recovery-atomicity.spec.ts';
const IDENTITY_SPEC = 'tests/business/batch3-identity-matrix.spec.ts';
const ADMIN_DISCLOSURE_SPEC = 'tests/business/batch3-admin-disclosure.spec.ts';
const RECONSENT_SPEC = 'tests/business/batch3-memory-reconsent.spec.ts';
const CREDENTIAL_SPEC = 'tests/business/batch3-identity-credential.spec.ts';
const CREDENTIAL = 'apps/api/src/identity-credential.ts';
const USERNOTIFICATION_SPEC = 'tests/business/batch1-usernotification.spec.ts';
const WORKER = 'apps/api/src/follow-up-worker.service.ts';
const B1 = 'apps/api/src/batch1-persistence.service.ts';
const MAPPER = 'apps/api/src/relational-runtime.mapper.ts';
const DECISION_SPEC = 'tests/business/batch3-decision-cooldown.spec.ts';

const mutations = [
  {
    id: 'M1 support plan: an unspecified journeyId detaches instead of being omitted',
    spec: SELF_SPEC,
    expectFailing: ['3.1'],
    patches: [
      {
        file: SELF,
        old: "        if (journeyIdSpecified) {\n          if (params.journeyId === null) {\n            updateData.journey = { disconnect: true };\n          } else if (suppliedJourneyId) {\n            updateData.journey = { connect: { id: suppliedJourneyId } };\n          }\n        }",
        new: '        updateData.journey = { disconnect: true };',
      },
    ],
  },
  {
    id: 'M2 reality handoff: the journey ownership check removed',
    spec: SELF_SPEC,
    expectFailing: ['2.1'],
    patches: [
      {
        file: SELF,
        old: "      if (targetJourneyId) {\n        const journey = await tx.lifeJourney.findUnique({ where: { id: targetJourneyId } });\n        if (!journey || journey.userId !== params.userId) {\n          throw new NotFoundException('旅程不存在或无权访问');\n        }\n      }",
        new: '      // mutation: journey ownership not checked',
      },
    ],
  },
  {
    id: 'M3 support plan: the in-transaction privacy gate removed',
    spec: SELF_SPEC,
    expectFailing: ['2.8'],
    patches: [
      {
        file: SELF,
        old: "      const privacy = await tx.privacySetting.findUnique({ where: { userId: params.userId } });\n      if (privacy?.allowRecoveryData !== true) {\n        throw new ForbiddenException('请先在隐私设置中允许保存支持计划');\n      }",
        new: '      // mutation: privacy gate removed',
      },
    ],
  },
  {
    id: 'M4 admin support-plan list: the plan JSON is returned again',
    spec: SELF_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: SELF,
        old: '        select: {\n          id: true,\n          userId: true,\n          journeyId: true,\n          title: true,\n          active: true,\n          createdAt: true,\n          updatedAt: true,\n        },',
        new: '        select: {\n          id: true,\n          userId: true,\n          journeyId: true,\n          title: true,\n          plan: true,\n          active: true,\n          createdAt: true,\n          updatedAt: true,\n        },',
      },
      {
        file: SELF,
        old: '        title: r.title,\n        active: r.active,',
        new: '        title: r.title,\n        plan: (r as { plan?: unknown }).plan,\n        active: r.active,',
      },
    ],
  },
  {
    id: 'M5 admin audited read: content returned without persisting the audit row',
    spec: SELF_SPEC,
    expectFailing: ['1.7'],
    patches: [
      {
        file: SELF,
        old: "    await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'SUPPORT_PLAN_READ_FULL',",
        new: "    if (false) await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'SUPPORT_PLAN_READ_FULL',",
      },
    ],
  },
  {
    id: 'M6 registry: PersonalSupportPlan unregistered (legacy writer returns)',
    spec: SELF_SPEC,
    expectFailing: ['5.1'],
    patches: [{ file: REGISTRY, old: "  PersonalSupportPlan: 'personalSupportPlans',\n", new: '' }],
  },
  {
    id: 'M7 registry: PrivacySetting unregistered (destructive per-user upsert returns)',
    spec: SELF_SPEC,
    expectFailing: ['4.1'],
    patches: [{ file: REGISTRY, old: "  PrivacySetting: 'privacySettings',\n", new: '' }],
  },
  {
    id: 'M8 the export privacy gate loses its await again (the gate stops enforcing)',
    spec: PRIVACY_SPEC,
    expectFailing: ['persists independent consent'],
    patches: [
      {
        file: STORE,
        old: "    await this.privacyAllows(userId, 'allowDataExport', '请先在隐私设置中允许导出个人数据');\n    const generatedAt = now();",
        new: "    this.privacyAllows(userId, 'allowDataExport', '请先在隐私设置中允许导出个人数据');\n    const generatedAt = now();",
      },
    ],
  },
  {
    id: 'M9 patchJourney: pre-lock read AND an unconditional write (the ordering claim)',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        // The mutant's read must happen BEFORE the barrier. Placing it where the real guard sits
        // would let it observe the post-graduation status and refuse exactly like the real guard,
        // so the test would pass against the racy implementation and prove nothing.
        file: B1,
        old: '      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      // §0.5/A4: the owner User is locked first on EVERY status write, not only on activation —',
        new: '      const [preRow] = await tx.$queryRaw<any[]>`SELECT * FROM "LifeJourney" WHERE id = ${journeyId}`;\n      const preLockStatus = preRow.status;\n      if (body.status && preLockStatus !== body.status && !(ALLOWED_JOURNEY_TRANSITIONS[preLockStatus] ?? []).includes(body.status)) {\n        throw new BadRequestException("mutation: pre-lock guard");\n      }\n      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      // §0.5/A4: the owner User is locked first on EVERY status write, not only on activation —',
      },
      {
        file: B1,
        old: '      // The transition rule runs under the LifeJourney lock, so a graduation committing concurrently\n      // cannot slip between the check and the write.\n      const locked = await lockJourneyAndAssertTransition(tx, journeyId, body.status);',
        new: '      const locked = { status: preLockStatus } as any;',
      },
      {
        file: B1,
        old: "        const result = await tx.lifeJourney.updateMany({\n          where: { id: journeyId, status: locked.status },\n          data,\n        });\n        if (result.count === 0) {\n          throw new ConflictException('旅程状态已被并发更新，请刷新重试');\n        }",
        new: '        await tx.lifeJourney.updateMany({ where: { id: journeyId }, data });',
      },
    ],
  },
  {
    id: 'M10 updateJourneyStatus: pre-lock read AND an unconditional write',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: B1,
        old: '      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      const journey = await tx.lifeJourney.findUnique({ where: { id: journeyId } });',
        new: '      const [preRow] = await tx.$queryRaw<any[]>`SELECT * FROM "LifeJourney" WHERE id = ${journeyId}`;\n      const preLockStatus = preRow.status;\n      if (preLockStatus !== status && !(ALLOWED_JOURNEY_TRANSITIONS[preLockStatus] ?? []).includes(status)) {\n        throw new BadRequestException("mutation: pre-lock guard");\n      }\n      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      const journey = await tx.lifeJourney.findUnique({ where: { id: journeyId } });',
      },
      {
        file: B1,
        old: "      // The transition rule runs under the LifeJourney lock (the same helper both entry points use),\n      // and the write is conditional on the status that was read there.\n      const locked = await lockJourneyAndAssertTransition(tx, journeyId, status);\n\n      const updated = await tx.lifeJourney.updateMany({\n        where: { id: journeyId, status: locked.status },\n        data: { status, updatedAt: new Date() },\n      });\n      if (updated.count === 0) {\n        throw new ConflictException('旅程状态已被并发更新，请刷新重试');\n      }",
        new: '      await tx.lifeJourney.updateMany({ where: { id: journeyId }, data: { status, updatedAt: new Date() } });',
      },
    ],
  },
  {
    id: 'M11 graduation: unconditional transition (a repeat graduation counts as a second one)',
    spec: TRANSITION_SPEC,
    expectFailing: ['2.1'],
    patches: [
      {
        file: B1,
        old: "      if (journey.status === 'completed') {\n        return { journey: mapLifeJourneyRow(journey), transitioned: false };\n      }",
        new: '      // mutation: no already-completed short circuit',
      },
      {
        file: B1,
        old: "      const updated = await tx.lifeJourney.updateMany({\n        where: { id: journeyId, status: { notIn: ['completed'] } },\n        data: {\n          status: 'completed',\n          stage: 'graduated',\n          completedAt: nowTime,\n          updatedAt: nowTime,\n        },\n      });",
        new: "      const updated = { count: 1 };\n      await tx.lifeJourney.updateMany({\n        where: { id: journeyId },\n        data: { status: 'completed', stage: 'graduated', completedAt: nowTime, updatedAt: nowTime },\n      });",
      },
    ],
  },
  {
    id: 'M12 same-status requests refused (the hybrid PATCH contract breaks)',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.4'],
    patches: [
      {
        file: B1,
        old: '  if (!target || row.status === target) return row;',
        new: '  if (!target) return row;',
      },
    ],
  },
  {
    id: 'M13 recovery: absence sweep guard removed in legacy mapper',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        file: MAPPER,
        old: '      if (!DIRECT_DB_MODELS.RecoverySnapshot)\n        await deleteAbsent(\n          tx.recoverySnapshot,\n          asArray(state.recoverySnapshots).map((item: any) => item.id),\n        );',
        new: '      await deleteAbsent(\n        tx.recoverySnapshot,\n        asArray(state.recoverySnapshots).map((item: any) => item.id),\n      );',
      },
    ],
  },
  {
    id: 'M14 recovery: legacy upsert guard removed in legacy mapper',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: MAPPER,
        old: '      if (!DIRECT_DB_MODELS.RecoverySnapshot) {\n        for (const item of asArray(state.recoverySnapshots))',
        new: '      if (true) {\n        for (const item of asArray(state.recoverySnapshots))',
      },
    ],
  },
  {
    id: 'M15 recovery: graduation commits before snapshot failure (non-atomic graduation)',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.2'],
    patches: [
      {
        file: B1,
        old: "      let snapshotRecord: RecoverySnapshotRecord | undefined;\n      if (updated.count > 0 && snapshotPayload) {\n        if (snapshotPayload._failDuringSnapshotInsert) {\n          throw new Error('Simulated failure during graduation snapshot insert');\n        }",
        new: '      let snapshotRecord: RecoverySnapshotRecord | undefined;\n      if (updated.count > 0 && snapshotPayload) {\n        // mutation: no in-tx failure check',
      },
      {
        file: B1,
        old: '      return {\n        journey: mapLifeJourneyRow(finalRow),\n        transitioned: updated.count > 0,\n        snapshot: snapshotRecord,\n      };\n    });',
        new: "      return {\n        journey: mapLifeJourneyRow(finalRow),\n        transitioned: updated.count > 0,\n        snapshot: snapshotRecord,\n      };\n    });\n    if (snapshotPayload?._failDuringSnapshotInsert) {\n      throw new Error('Simulated failure during graduation snapshot insert');\n    }",
      },
    ],
  },
  {
    id: 'M16 recovery: duplicate graduation appends an extra snapshot',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.3'],
    patches: [
      {
        file: B1,
        old: "      if (journey.status === 'completed') {\n        return { journey: mapLifeJourneyRow(journey), transitioned: false };\n      }",
        new: '      // mutation: no already-completed check on duplicate graduation',
      },
      {
        file: B1,
        old: '      if (updated.count > 0 && snapshotPayload) {',
        new: '      if (snapshotPayload) {',
      },
    ],
  },
  {
    id: 'M17 registry: RecoverySnapshot unregistered from DIRECT_DB_MODELS',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.7'],
    patches: [
      {
        file: REGISTRY,
        old: "  RecoverySnapshot: 'recoverySnapshots',\n",
        new: '',
      },
    ],
  },
  {
    id: 'M18 recovery: journey ownership check removed in appendRecoverySnapshot',
    spec: RECOVERY_SPEC,
    expectFailing: ['1.10'],
    patches: [
      {
        file: SELF,
        old: "          const journey = await tx.lifeJourney.findUnique({ where: { id: suppliedJourneyId } });\n          if (!journey || journey.userId !== params.userId) {\n            throw new NotFoundException('旅程不存在或无权访问');\n          }",
        new: '          // mutation: journey ownership not checked in appendRecoverySnapshot',
      },
    ],
  },
  {
    id: 'M19 controller identity: requireRuntimeUserId falls back to demo user',
    spec: IDENTITY_SPEC,
    expectFailing: ['1.1'],
    patches: [
      {
        file: CONTROLLERS,
        old: "function requireRuntimeUserId(header?: string): string {\n  const trimmed = header?.trim();\n  if (!trimmed) {\n    throw new UnauthorizedException('缺少用户身份标识');\n  }\n  return trimmed;\n}",
        new: 'function requireRuntimeUserId(header?: string): string {\n  const trimmed = header?.trim();\n  return trimmed || "user_demo";\n}',
      },
    ],
  },
  {
    id: 'M20 store identity: resolveRuntimeUserId falls back to demo user when missing',
    spec: IDENTITY_SPEC,
    expectFailing: ['5.2'],
    patches: [
      {
        file: STORE,
        old: "  resolveRuntimeUserId(requestedUserId?: string) {\n    if (!requestedUserId || !requestedUserId.trim()) {\n      throw new UnauthorizedException('缺少用户身份标识');\n    }\n    const userId = requestedUserId.trim();",
        new: '  resolveRuntimeUserId(requestedUserId?: string) {\n    const userId = requestedUserId?.trim() || this.getDemoUserId();',
      },
    ],
  },
  {
    id: 'M21 decision ownership: updateDecision ownership check removed',
    spec: IDENTITY_SPEC,
    expectFailing: ['3.2'],
    patches: [
      {
        file: STORE,
        old: '    const item = this.decisionRecords.find(\n      (record) => record.id === decisionId && record.userId === userId,\n    );',
        new: '    const item = this.decisionRecords.find(\n      (record) => record.id === decisionId,\n    );',
      },
    ],
  },
  {
    id: 'M22 admin guard: missing admin token allowed to proceed',
    spec: IDENTITY_SPEC,
    expectFailing: ['4.1'],
    patches: [
      {
        file: STORE,
        old: "  verifyToken(token?: string) {\n    if (!token) throw new UnauthorizedException('缺少登录凭证');",
        new: '  verifyToken(token?: string) {\n    if (!token) return this.adminUsers[0];',
      },
    ],
  },
  {
    id: 'M23 memory ownership: deleteMemory ownership check removed',
    spec: IDENTITY_SPEC,
    expectFailing: ['3.1'],
    patches: [
      {
        file: SELF,
        old: "  async deleteMemory(id: string, userId: string, hooks: SelfWriteHooks = {}): Promise<MemoryItemRecord> {\n    return await this.prisma.$transaction(async (tx) => {\n      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      await lockSelfWriteRoots(tx, [userId]);\n      if (hooks._onAfterLock) await hooks._onAfterLock();\n      const existing = await tx.memoryItem.findFirst({ where: { id, userId } });",
        new: "  async deleteMemory(id: string, userId: string, hooks: SelfWriteHooks = {}): Promise<MemoryItemRecord> {\n    return await this.prisma.$transaction(async (tx) => {\n      if (hooks._onBeforeLock) await hooks._onBeforeLock();\n      await lockSelfWriteRoots(tx, [userId]);\n      if (hooks._onAfterLock) await hooks._onAfterLock();\n      const existing = await tx.memoryItem.findFirst({ where: { id } });",
      },
    ],
  },
  {
    id: 'M24 admin audited memory read: content returned without persisting the audit row',
    spec: ADMIN_DISCLOSURE_SPEC,
    expectFailing: ['1.3'],
    patches: [
      {
        file: SELF,
        old: "    await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'MEMORY_READ_FULL',",
        new: "    if (false) await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'MEMORY_READ_FULL',",
      },
    ],
  },
  {
    id: 'M25 admin memory list: memory content returned in list response',
    spec: ADMIN_DISCLOSURE_SPEC,
    expectFailing: ['1.1'],
    patches: [
      {
        file: SELF,
        old: "          category: true,\n          scope: true,",
        new: "          category: true,\n          content: true,\n          scope: true,",
      },
      {
        file: SELF,
        old: "        category: row.category,\n        scope: row.scope,",
        new: "        category: row.category,\n        content: (row as any).content,\n        scope: row.scope,",
      },
    ],
  },
  {
    id: 'M26 re-consent: expired memory allowed to be edited in place',
    spec: RECONSENT_SPEC,
    expectFailing: ['1.3'],
    patches: [
      {
        file: SELF,
        old: "      if (memoryDatePassed(existing)) {\n        // §0.5/A5: an effectively expired row allows read, delete and explicit re-consent only.\n        // Disabling or re-expiring it is not in that set, and allowing it would let an expired row\n        // be moved around as if it were live.\n        throw new BadRequestException('这条记忆已经过期，需要重新确认后才能继续使用');\n      }\n      if (memoryDatePassed(existing)) {\n        throw new BadRequestException('这条记忆已经过期，需要重新确认后才能继续使用');\n      }\n\n      const data: Prisma.MemoryItemUpdateInput = {};",
        new: "      // mutation: in-place edit allowed on expired memory\n      const data: Prisma.MemoryItemUpdateInput = {};",
      },
    ],
  },
  {
    id: 'M27 re-consent: deleted memory allowed to be reactivated',
    spec: RECONSENT_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        file: SELF,
        old: "      const existing = await tx.memoryItem.findFirst({ where: { id, userId } });\n      if (!existing) throw new NotFoundException('记忆不存在');\n      if (existing.status === 'deleted') throw new BadRequestException('已删除的记忆不能恢复');\n\n      const nowTime = new Date();\n      const retention = Math.max(1, Math.min(3650, days));\n      const updated = await tx.memoryItem.updateMany({\n        where: { id: existing.id, status: { not: 'deleted' } },",
        new: "      const existing = await tx.memoryItem.findFirst({ where: { id, userId } });\n      if (!existing) throw new NotFoundException('记忆不存在');\n\n      const nowTime = new Date();\n      const retention = Math.max(1, Math.min(3650, days));\n      const updated = await tx.memoryItem.updateMany({\n        where: { id: existing.id },",
      },
    ],
  },
  {
    id: 'M28 admin guard on memory routes: unauthenticated caller permitted',
    spec: ADMIN_DISCLOSURE_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: STORE,
        old: "  verifyToken(token?: string) {\n    if (!token) throw new UnauthorizedException('缺少登录凭证');",
        new: "  verifyToken(token?: string) {\n    if (!token) return this.adminUsers[0];",
      },
    ],
  },
  {
    id: 'M29 private /me aliases: unauthenticated profile request allowed without identity',
    spec: IDENTITY_SPEC,
    expectFailing: ['1.13'],
    patches: [
      {
        file: CONTROLLERS,
        old: "  @Get('me/profile')\n  profile(@Headers('x-goodnight-user-id') userId?: string) {\n    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));\n    const user = this.store.users.find((item) => item.id === runtimeId);\n    return { item: user ?? null };\n  }",
        new: "  @Get('me/profile')\n  profile(@Headers('x-goodnight-user-id') _userId?: string) {\n    return { item: this.store.users[0] };\n  }",
      },
    ],
  },
  {
    id: 'M30 admin token signature: forged bearer token accepted without HMAC verification',
    spec: ADMIN_DISCLOSURE_SPEC,
    expectFailing: ['1.7'],
    patches: [
      {
        file: STORE,
        old: "    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {\n      throw new UnauthorizedException('登录凭证签名无效');\n    }",
        new: "    // mutation: signature check removed",
      },
    ],
  },
  {
    id: 'M31 admin audited read: non-admin role permitted on memory detail read',
    spec: ADMIN_DISCLOSURE_SPEC,
    expectFailing: ['1.11'],
    patches: [
      {
        file: CONTROLLERS,
        old: "  @Get('memory/:id')\n  async memoryDetail(\n    @Headers('authorization') auth: string,\n    @Param('id') id: string,\n  ) {\n    const admin = this.admin(auth, ['super_admin', 'admin']);",
        new: "  @Get('memory/:id')\n  async memoryDetail(\n    @Headers('authorization') auth: string,\n    @Param('id') id: string,\n  ) {\n    const admin = this.admin(auth);",
      },
    ],
  },
  {
    id: 'M32 decision: running cooldown allows ready transition without deadline check',
    spec: DECISION_SPEC,
    expectFailing: ['1.1'],
    patches: [
      {
        file: SELF,
        old: "          if (!check?.passed) {\n            throw new BadRequestException('冷静时间还没有结束');\n          }",
        new: '          // mutation: premature ready check removed',
      },
    ],
  },
  {
    id: 'M33 cooldown: expired cooldown during held lock allows new cooldown write',
    spec: DECISION_SPEC,
    expectFailing: ['1.2'],
    patches: [
      {
        file: SELF,
        old: "          if (deadlineCheck?.passed) {\n            throw new BadRequestException('这个决定已经结束冷静期');\n          }",
        new: '          // mutation: expired cooling check removed',
      },
    ],
  },
  {
    id: 'M34 supersede: non-open decision check removed allowing concurrent supersedes',
    spec: DECISION_SPEC,
    expectFailing: ['1.3'],
    patches: [
      {
        file: SELF,
        old: "        if (!['draft', 'cooling', 'ready'].includes(target.status)) {\n          throw new ConflictException('该决策已被并发更新或取代');\n        }",
        new: '        // mutation: concurrent supersede CAS conflict check removed',
      },
    ],
  },
  {
    id: 'M35 cooldown: superseded decision allows cooldown creation',
    spec: DECISION_SPEC,
    expectFailing: ['1.4'],
    patches: [
      {
        file: SELF,
        old: "        if (!['draft', 'cooling'].includes(decisionRow.status)) {\n          throw new BadRequestException('这个决定已经结束冷静期');\n        }",
        new: '        // mutation: superseded status check on cooldown creation removed',
      },
    ],
  },
  {
    id: 'M36 decision: updateDecision ownership check removed',
    spec: DECISION_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        file: SELF,
        old: '      const existing = await tx.decisionRecord.findFirst({\n        where: { id, userId },\n      });',
        new: '      const existing = await tx.decisionRecord.findFirst({\n        where: { id },\n      });',
      },
    ],
  },
  {
    id: 'M37 mapper: DecisionRecord absence sweep guard removed in legacy mapper',
    spec: DECISION_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: MAPPER,
        old: '      if (!DIRECT_DB_MODELS.DecisionRecord)\n        await deleteAbsent(\n          tx.decisionRecord,\n          asArray(state.decisionRecords).map((item: any) => item.id),\n        );',
        new: '      await deleteAbsent(\n        tx.decisionRecord,\n        asArray(state.decisionRecords).map((item: any) => item.id),\n      );',
      },
    ],
  },
  {
    id: 'M38 decision: foreign journey validation removed on createDecision',
    spec: DECISION_SPEC,
    expectFailing: ['1.7'],
    patches: [
      {
        file: SELF,
        old: "      if (suppliedJourneyId) {\n        const journey = await tx.lifeJourney.findUnique({ where: { id: suppliedJourneyId } });\n        if (!journey || journey.userId !== params.userId) {\n          throw new NotFoundException('旅程不存在或无权访问');\n        }\n      }\n\n      // Requirement 3: The supersede rule",
        new: '      // mutation: foreign journey ownership not checked\n\n      // Requirement 3: The supersede rule',
      },
    ],
  },
  {
    id: 'M39 worker: decisionId mismatch check removed in deliverCooldownJob',
    spec: DECISION_SPEC,
    expectFailing: ['1.9'],
    patches: [
      {
        file: SELF,
        old: "      if (cd.decisionId !== decisionId) {\n        // Lost its decision (cd.decisionId is null due to delete) or mismatched\n        await tx.followUpJob.update({\n          where: { id: input.id },\n          data: { status: 'superseded', completedAt: null },\n        });\n        return { status: 'superseded' };\n      }",
        new: '      // mutation: decisionId mismatch check removed',
      },
    ],
  },
  {
    id: 'M40 identity: requireRuntimeUserId trusts the raw header again (the B3-R11 hole)',
    spec: CREDENTIAL_SPEC,
    expectFailing: ['1.1'],
    patches: [
      {
        file: CONTROLLERS,
        old: "function requireRuntimeUserId(header?: string): string {\n  const verified = verifyIdentityCredential(header);\n  if (!verified) {\n    throw new UnauthorizedException('缺少用户身份凭证');\n  }\n  return verified;\n}",
        new: "function requireRuntimeUserId(header?: string): string {\n  const verified = header?.trim();\n  if (!verified) {\n    throw new UnauthorizedException('缺少用户身份凭证');\n  }\n  return verified;\n}",
      },
    ],
  },
  {
    id: 'M41 identity: the signature comparison is skipped',
    spec: CREDENTIAL_SPEC,
    expectFailing: ['1.3'],
    patches: [
      {
        file: CREDENTIAL,
        old: '  if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {\n    throw new UnauthorizedException(\'身份凭证签名无效\');\n  }',
        new: '  if (givenBuf.length === -1) {\n    throw new UnauthorizedException(\'身份凭证签名无效\');\n  }',
      },
    ],
  },
  {
    id: 'M42 identity: the credential age is not checked',
    spec: CREDENTIAL_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        file: CREDENTIAL,
        old: '  if (nowMs - issuedAt > IDENTITY_CREDENTIAL_TTL_MS || issuedAt > nowMs + 60_000) {\n    throw new UnauthorizedException(\'身份凭证已过期\');\n  }',
        new: '  if (issuedAt === -1) {\n    throw new UnauthorizedException(\'身份凭证已过期\');\n  }',
      },
    ],
  },
  {
    id: 'M43 identity: the domain-separation prefix is dropped, so an admin token verifies as a credential',
    spec: CREDENTIAL_SPEC,
    expectFailing: ['1.13'],
    patches: [
      {
        file: CREDENTIAL,
        old: '  return crypto.createHmac(\'sha256\', secret).update(`${PURPOSE}:${userId}:${issuedAt}`).digest(\'hex\');',
        new: '  return crypto.createHmac(\'sha256\', secret).update(`${userId}:${issuedAt}`).digest(\'hex\');',
      },
    ],
  },
  {
    id: 'M44 identity: the demo identity endpoint is always enabled',
    spec: CREDENTIAL_SPEC,
    expectFailing: ['1.10'],
    patches: [
      {
        file: CREDENTIAL,
        old: "  return process.env.ALLOW_DEMO_IDENTITY === 'true';",
        new: '  return true;',
      },
    ],
  },
  {
    id: 'M45 worker: the notification is written outside the claim transaction (the pre-A6 ordering)',
    spec: USERNOTIFICATION_SPEC,
    expectFailing: ['2b.'],
    patches: [
      {
        // The claim no longer carries the notification...
        file: WORKER,
        old: '      const notified = await this.writeClaimNotification(tx, input, notificationId);\n      return { count: claim.count, notified };',
        new: '      return { count: claim.count, notified: false };',
      },
      {
        // ...and it is written afterwards instead, in its own transaction, which is exactly the
        // ordering A6 replaced: a failure here leaves the job delivered with no notification.
        file: WORKER,
        old: '    // 2. Reload the runtime store so legacy in-memory state is consistent before the notification is observable',
        new: '    await this.writeClaimNotification(this.prisma, input, notificationId);\n\n    // 2. Reload the runtime store so legacy in-memory state is consistent before the notification is observable',
      },
    ],
  },
];

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const stripAnsi = (text: string) => text.replace(ANSI_PATTERN, '');

function runSpec(spec) {
  const run = spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'scripts/test-runner.ts',
      'vitest',
      'run',
      spec,
      '--pool=forks',
      '--maxWorkers=1',
      '--minWorkers=1',
      '--reporter=basic',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 900_000 },
  );
  const output = stripAnsi(`${run.stdout ?? ''}${run.stderr ?? ''}`);
  const summary = output.match(/Tests:\s+(\d+) failed \| (\d+) passed \((\d+)\)/);
  const failedTests = output
    .split(/\r?\n/)
    .filter((line) => /^\s*(FAIL|×)\s/.test(line))
    .map((line) => line.trim());
  return {
    output,
    status: run.status,
    signal: run.signal,
    spawnError: run.error ? String(run.error.message) : null,
    failed: summary ? Number(summary[1]) : null,
    passed: summary ? Number(summary[2]) : null,
    failedTests,
  };
}

const childOk = (run: { status: number | null; signal: string | null; spawnError: string | null }) =>
  run.spawnError === null && run.signal === null && run.status !== null;

// Optional filter: `tsx scripts/batch3-mutation-check.ts M10` runs one mutation.
const only = process.argv[2];
const selected = only ? mutations.filter((m) => m.id.startsWith(only)) : mutations;
if (!selected.length) {
  console.error(`No mutation matches "${only}"`);
  process.exit(1);
}

const specs = [...new Set(selected.map((m) => m.spec))];
const baselines = new Map<string, ReturnType<typeof runSpec>>();
console.log('=== baseline runs (each must be green before any mutation result is meaningful) ===');
for (const spec of specs) {
  const baseline = runSpec(spec);
  baselines.set(spec, baseline);
  if (!childOk(baseline) || baseline.failed === null || baseline.failed > 0) {
    console.error(`ABORT: baseline for ${spec} is not green (failed=${baseline.failed}, status=${baseline.status}).`);
    console.error(baseline.failedTests.slice(0, 6).join('\n'));
    process.exit(1);
  }
  console.log(`baseline green: ${spec} — ${baseline.passed} passed`);
}
console.log('');

const results = [];

for (const mutation of selected) {
  let verdict = 'INCONCLUSIVE';
  let detail = '';
  const originals = new Map();

  try {
    for (const patch of mutation.patches) {
      if (!originals.has(patch.file)) originals.set(patch.file, fs.readFileSync(patch.file, 'utf8'));
      // Anchors are written with LF, but some tracked files use CRLF. Normalising before matching
      // keeps an anchor from silently becoming PATCH-FAILED just because of the checkout's line
      // endings. The original bytes are restored from `originals` either way.
      const current = fs.readFileSync(patch.file, 'utf8').replace(/\r\n/g, '\n');
      const found = countOccurrences(current, patch.old);
      if (found !== 1) {
        verdict = 'PATCH-FAILED';
        detail = `${patch.file}: expected 1 match, found ${found}`;
        break;
      }
      fs.writeFileSync(patch.file, current.replace(patch.old, patch.new));
    }

    if (verdict !== 'PATCH-FAILED') {
      const run = runSpec(mutation.spec);
      if (!childOk(run)) {
        detail = `child did not exit cleanly: status=${run.status} signal=${run.signal} spawnError=${run.spawnError}`;
      } else if (run.failed === null) {
        detail = 'could not parse the summary';
      } else if (run.failed === 0) {
        verdict = 'NOT PROVEN (test still passes)';
        detail = `0 failed / ${run.passed} passed`;
      } else {
        const matched = run.failedTests.filter((line) =>
          mutation.expectFailing.some((expected) => line.includes(expected)),
        );
        if (matched.length > 0) {
          verdict = 'PROVEN (the named test fails without the guard)';
          detail = `${run.failed} failed / ${run.passed} passed; matched: ${matched[0].slice(0, 80)}`;
        } else {
          verdict = 'PROVEN-UNRELATED (failures did not include the named test)';
          detail = `${run.failed} failed / ${run.passed} passed; failed: ${run.failedTests.slice(0, 2).join(' | ').slice(0, 150)}`;
        }
      }
    }
  } finally {
    for (const [file, content] of originals) fs.writeFileSync(file, content);
  }

  results.push({ id: mutation.id, expectFailing: mutation.expectFailing, verdict, detail });
  console.log(`${mutation.id} -> ${verdict} :: ${detail}`);
}

console.log('\n=== MUTATION SUMMARY ===');
for (const row of results) console.log(`${row.verdict.padEnd(52)} ${row.id}  [${row.detail}]`);

// A mutation that never reached PROVEN proves nothing, and its verdict is easy to read past in a
// summary: M38/M39 sat at PATCH-FAILED while the batch was described as proven. Any non-PROVEN
// verdict now fails the run.
const notProven = results.filter((row) => !row.verdict.startsWith('PROVEN ('));
if (notProven.length > 0) {
  console.error(`\n[MUTATION] FAILED: ${notProven.length} of ${results.length} mutation(s) did not reach PROVEN:`);
  for (const row of notProven) console.error(`  - ${row.verdict} :: ${row.id} [${row.detail}]`);
}

fs.writeFileSync(
  'artifacts/runtime/batch3-step1-mutation-report.json',
  JSON.stringify({ baselines: [...baselines.keys()], results }, null, 2),
);

process.exit(notProven.length > 0 ? 1 : 0);
