import { describe, expect, it } from 'vitest';
import { AiPersonaService } from '../../apps/api/src/ai-persona.service.js';
import { StoreService } from '../../apps/api/src/store.service.js';
import { inferMemoryType, inferMemorySensitivity } from '../../apps/api/src/self-persistence.service.js';
import type { MemoryItem } from '@goodnight/shared-types';

describe('P0-B: AI Memory Architecture, 4 Types, Revocation & 5-Tier Assembly', () => {
  describe('1. Four Memory Types Categorization & Inference', () => {
    it('accurately categorizes episodic, semantic, pattern, and state memories', () => {
      expect(inferMemoryType('episodic:大学时光', 'user_saved')).toBe('episodic');
      expect(inferMemoryType('semantic:饮食清淡', 'user_saved')).toBe('semantic');
      expect(inferMemoryType('pattern:失眠规律', 'user_saved')).toBe('pattern');
      expect(inferMemoryType('state:今天头疼', 'user_saved')).toBe('state');

      // Source-based fallback
      expect(inferMemoryType('经历回顾', 'journey_summary')).toBe('episodic');
      expect(inferMemoryType('日常打卡', 'recovery_confirmed')).toBe('pattern');
      expect(inferMemoryType('平复方案', 'support_plan')).toBe('state');
      expect(inferMemoryType('用户备忘', 'user_saved')).toBe('semantic');

      // Sensitivity inference
      expect(inferMemorySensitivity('high:危机警示', 'user_saved')).toBe('high');
      expect(inferMemorySensitivity('备忘', 'support_plan')).toBe('high');
      expect(inferMemorySensitivity('low:日常喜好', 'user_saved')).toBe('low');
      expect(inferMemorySensitivity('一般事项', 'user_saved')).toBe('medium');
    });
  });

  describe('2. 5-Tier Usage Sequence in Prompt Assembly', () => {
    it('strictly orders: SafetyPolicy -> TaskPolicy -> Persona -> AuthorizedMemory -> CurrentTurn', () => {
      const aiPersona = new AiPersonaService();

      const memoryList: MemoryItem[] = [
        {
          id: 'mem_semantic',
          userId: 'user_alice',
          title: '作息偏好',
          content: '习惯在深夜 23:00 后安静独处',
          scope: 'all_ai',
          memoryType: 'semantic',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'mem_state',
          userId: 'user_alice',
          title: '昨天情绪',
          content: '昨天工作非常疲惫，不想说话',
          scope: 'all_ai',
          memoryType: 'state',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const prompt = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封充满关怀的今夜回信',
        userContent: '今天我睡了个好觉，感觉精神好多了！想出门走走',
        allowAiMemoryUse: true,
        memories: memoryList,
        currentUserId: 'user_alice',
      });

      // 1. SafetyPolicy must be at index 0
      const idxSafety = prompt.indexOf('【系统最高安全规则】');
      expect(idxSafety).toBe(0);

      // 2. TaskPolicy must follow SafetyPolicy
      const idxTask = prompt.indexOf('【任务明确要求】');
      expect(idxTask).toBeGreaterThan(idxSafety);

      // 3. Persona must follow TaskPolicy
      const idxPersona = prompt.indexOf('【角色设定：温和倾听者】');
      expect(idxPersona).toBeGreaterThan(idxTask);

      // 4. AuthorizedMemory must follow Persona
      const idxMemory = prompt.indexOf('【用户明确授权使用的有限记忆');
      expect(idxMemory).toBeGreaterThan(idxPersona);

      // 5. CurrentTurn must be the last section
      const idxCurrent = prompt.indexOf('【用户当次内容】');
      expect(idxCurrent).toBeGreaterThan(idxMemory);
    });

    it('enforces that CurrentTurn strictly overrides conflicting State memory', () => {
      const aiPersona = new AiPersonaService();

      const prompt = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'night_companion',
        taskInstruction: '写一封回信',
        userContent: '今天我心情好极了，完成了所有工作！',
        allowAiMemoryUse: true,
        memories: [
          {
            id: 'mem_old_state',
            userId: 'user_alice',
            title: '情绪状态',
            content: '严重焦虑失眠，无法进行任何工作',
            scope: 'all_ai',
            memoryType: 'state',
            status: 'active',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        currentUserId: 'user_alice',
      });

      expect(prompt).toContain('[当前状态备忘 (State - 仅供背景参考)]');
      expect(prompt).toContain('特别消解规则');
      expect(prompt).toContain('必须以用户的当次最新表达为绝对最高准则，严禁执着于过期的历史状态');
    });
  });

  describe('3. Revocation, Expiry & Immediate Melting (授权撤销熔断)', () => {
    it('immediately excludes revoked memory (status=revoked or revokedAt) from prompt assembly', () => {
      const aiPersona = new AiPersonaService();

      const revokedMemory: MemoryItem = {
        id: 'mem_revoked_01',
        userId: 'user_alice',
        title: '已撤销隐私',
        content: '这是用户明确撤销授权的绝密个人隐私信息',
        scope: 'all_ai',
        memoryType: 'semantic',
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const prompt = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封信',
        userContent: '你好呀',
        allowAiMemoryUse: true,
        memories: [revokedMemory],
        currentUserId: 'user_alice',
      });

      // Revoked memory must be 100% melted away from AI prompt
      expect(prompt).not.toContain('已撤销隐私');
      expect(prompt).not.toContain('绝密个人隐私信息');
      expect(prompt).toContain('用户未授权引用任何历史记忆');
    });

    it('StoreService.revokeMemory marks memory as revoked and sets revokedAt timestamp', async () => {
      const store = new StoreService({} as any);
      const userId = 'user_test_revoke';

      store.users.push({
        id: userId,
        nickname: 'TestUser',
        anonymousCode: 'ANON_REVOKE',
        openid: 'op_revoke',
        avatarUrl: '',
        status: 'normal',
        createdAt: new Date().toISOString(),
      });

      (store as any).privacyAllows = async () => true;
      (store as any).batch1Persistence = { getActiveJourneyForUser: async () => null };

      const memoryStore: any[] = [];
      const mockSelfPersistence = {
        createMemory: async (params: any) => {
          const item = {
            id: 'mem_db_01',
            userId: params.userId,
            title: params.title,
            content: params.content,
            category: params.category,
            source: params.source,
            scope: params.scope,
            status: 'active',
            consentedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          memoryStore.push(item);
          return item;
        },
        revokeMemory: async (id: string, uId: string) => {
          const target = memoryStore.find((m) => m.id === id && m.userId === uId);
          if (target) {
            target.status = 'revoked';
            target.revokedAt = new Date().toISOString();
            target.updatedAt = new Date().toISOString();
          }
          return target;
        },
        listAiEligibleMemories: async (uId: string) => {
          return memoryStore.filter((m) => m.userId === uId && m.status === 'active');
        },
      };
      (store as any).selfPersistence = mockSelfPersistence;

      const created = await store.saveMemory(
        {
          title: '即将被撤销的记忆',
          content: '敏感日记摘要内容',
          memoryType: 'semantic',
          days: 30,
        },
        userId,
      );

      expect(created.item.id).toBeDefined();
      expect(created.item.status).toBe('active');

      // User revokes consent
      const revokeRes = await store.revokeMemory(created.item.id, userId);
      expect(revokeRes.ok).toBe(true);
      expect(revokeRes.item.status).toBe('revoked');
      expect((revokeRes.item as any).revokedAt).toBeDefined();

      // Subsequent active memory queries return 0 items for prompt assembly
      const eligible = await (store as any).activeMemoriesForTask(userId, 'today_letter', 'letter');
      expect(eligible.find((m: any) => m.id === created.item.id)).toBeUndefined();
    });
  });

  describe('4. Cross-User Isolation (A/B/C 用户严格隔离)', () => {
    it('defends against cross-user memory leakage if wrong user memory is provided', () => {
      const aiPersona = new AiPersonaService();

      const userAMemory: MemoryItem = {
        id: 'mem_user_a',
        userId: 'user_alice',
        title: 'Alice的私人秘密',
        content: 'Alice在信中写了只有自己知道的家庭秘密',
        scope: 'all_ai',
        memoryType: 'episodic',
        status: 'active',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Prompt assembly for Bob passing Alice's memory must filter Alice's memory out!
      const bobPrompt = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '为 Bob 写一封信',
        userContent: '我是 Bob，请回复我',
        allowAiMemoryUse: true,
        memories: [userAMemory],
        currentUserId: 'user_bob',
      });

      expect(bobPrompt).not.toContain('Alice的私人秘密');
      expect(bobPrompt).not.toContain('家庭秘密');
      expect(bobPrompt).toContain('用户未授权引用任何历史记忆');
    });
  });
});
