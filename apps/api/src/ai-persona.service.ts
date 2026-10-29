import { BadRequestException, Injectable } from '@nestjs/common';
import type { MemoryItem } from '@goodnight/shared-types';
import fs from 'node:fs';
import path from 'node:path';

export type PersonaId = 'night_companion' | 'gentle_listener' | 'rational_clarifier' | 'comfort_guide';

const VALID_PERSONA_IDS = new Set<string>([
  'night_companion',
  'gentle_listener',
  'rational_clarifier',
  'comfort_guide',
]);

export interface PersonaProfile {
  id: PersonaId;
  name: string;
  title: string;
  description: string;
  systemPromptAddition: string;
}

export interface AssembleContextInput {
  taskType: string;
  personaId?: PersonaId;
  taskInstruction: string;
  userContent: string;
  memories?: MemoryItem[];
  allowAiMemoryUse?: boolean;
  mode?: string;
}

@Injectable()
export class AiPersonaService {
  /**
   * System Safety Policy: highest priority, inviolable.
   * Neither user prompt nor persona profile can override this.
   */
  readonly systemSafetyPolicy =
    '【系统最高安全规则】你是晚安树洞的中文情绪陪伴助手。你不是医生，不做心理疾病诊断、不冒充专业人员、不做绝对承诺。' +
    '语气如同深夜朋友手写便条，简短真挚，平实具体，绝不带说教感。严禁使用心理咨询套话、客服腔或机械前缀标签。' +
    '若用户提及即时人身危险或自残意图，提醒其联系身边可信任的人和当地紧急支持（如中国大陆 120 / 12356 心理危机专线）。' +
    '严格保护用户匿名性，严禁索要或泄露任何真实姓名、电话号码、社交账号或位置信息。';

  /**
   * Curated Persona Profiles
   */
  readonly personas: Record<PersonaId, PersonaProfile> = {
    night_companion: {
      id: 'night_companion',
      name: '晚安守夜人',
      title: '守候在黑夜里的平静微光',
      description: '话语少而真挚，平和克制，专注于当下情绪的托底与安心晚安。',
      systemPromptAddition:
        '【角色设定：晚安守夜人】你的语气温和且沉静，像深夜床头的一盏微光。' +
        '不需要连篇累牍的长篇大论，用简短、有温度的几句话托住对方的疲惫，引导其平稳入睡或放下当下的精神紧绷。',
    },
    gentle_listener: {
      id: 'gentle_listener',
      name: '温和倾听者',
      title: '全心接纳一切情绪的朋友',
      description: '专注共情与情感接纳，不急于给出建议，先充分理解脆弱与委屈。',
      systemPromptAddition:
        '【角色设定：温和倾听者】你是一位完全接纳对方所有负面感受的朋友。' +
        '不急于教育对方“应该怎么做”，首先清晰表达对对方难处、委屈与无奈的看见与理解。允许情绪存在，不急躁，充满包容。',
    },
    rational_clarifier: {
      id: 'rational_clarifier',
      name: '理性梳理官',
      title: '厘清混乱与焦虑的整理助手',
      description: '帮助理清事实、情绪与行动，拆解出最小可控的一步。',
      systemPromptAddition:
        '【角色设定：理性梳理官】你的风格清晰、条理分明，但语调始终友好克制。' +
        '善于帮助用户将混作一团的焦虑拆解为：当前客观事实、主观情绪感受、真正被卡住的需求，以及“现在就能做的一件微小可控的事”。',
    },
    comfort_guide: {
      id: 'comfort_guide',
      name: '轻柔引导者',
      title: '带你回归身心锚点的同行者',
      description: '侧重呼吸调节、身体感知与微习惯恢复，带领逐步走出情绪漩涡。',
      systemPromptAddition:
        '【角色设定：轻柔引导者】你擅长引导身心平复。提醒对方关注此刻的呼吸、放松紧绷的肩颈，' +
        '引导通过微小的身体动作（喝一口温水、深呼吸、动动脚趾）重新找回安全感和对当下的感知。',
    },
  };

  /** User persona preferences: userId -> personaId */
  private userPreferences = new Map<string, PersonaId>();
  private readonly storageFile = path.resolve(process.cwd(), 'data/user-personas.json');

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const text = fs.readFileSync(this.storageFile, 'utf8');
        const data = JSON.parse(text);
        if (data && typeof data === 'object') {
          for (const [uid, pid] of Object.entries(data)) {
            if (VALID_PERSONA_IDS.has(pid as string)) {
              this.userPreferences.set(uid, pid as PersonaId);
            }
          }
        }
      }
    } catch {
      // fallback to memory
    }
  }

  private persistToDisk() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = Object.fromEntries(this.userPreferences.entries());
      fs.writeFileSync(this.storageFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // fallback
    }
  }

  getPersonaList(): PersonaProfile[] {
    return Object.values(this.personas);
  }

  getUserPersona(userId: string): PersonaProfile {
    const id = this.userPreferences.get(userId) ?? 'night_companion';
    return this.personas[id] ?? this.personas.night_companion;
  }

  setUserPersona(userId: string, personaId: string): PersonaProfile {
    if (!VALID_PERSONA_IDS.has(personaId)) {
      throw new BadRequestException('无效的人格标识');
    }
    const id = personaId as PersonaId;
    this.userPreferences.set(userId, id);
    this.persistToDisk();
    return this.personas[id];
  }

  /**
   * Context Assembler:
   * Assembles the multi-layered prompt with strict priority:
   * 1. System Safety Policy (highest)
   * 2. Persona Profile (stylistic personality)
   * 3. Task Instruction (specific business task)
   * 4. Consent Scoped Memories (strictly active & non-expired)
   * 5. User Content & Session context (sanitized)
   */
  assemblePrompt(input: AssembleContextInput): string {
    const parts: string[] = [];

    // 1. Highest: System Safety Policy
    parts.push(this.systemSafetyPolicy);

    // 2. Persona Profile
    const persona = input.personaId
      ? this.personas[input.personaId] ?? this.personas.night_companion
      : this.personas.night_companion;
    parts.push(persona.systemPromptAddition);

    // 3. Task Instruction
    if (input.taskInstruction) {
      parts.push(`【任务明确要求】\n${input.taskInstruction}`);
    }

    if (input.mode) {
      parts.push(`【当前模式偏好】\n${input.mode}`);
    }

    // 4. Consent-Scoped Memory (Strict Dynamic Guard)
    // Filter active and non-expired memories only
    const validMemories = (input.memories ?? []).filter((m) => {
      if (!m || m.status !== 'active') return false;
      const exp = Date.parse(m.expiresAt);
      return !Number.isNaN(exp) && exp > Date.now();
    });

    if (input.allowAiMemoryUse && validMemories.length > 0) {
      // Limit to max 6 most relevant items to prevent prompt injection and token bloat
      const safeMemories = validMemories.slice(0, 6).map((m) => {
        const safeTitle = String(m.title || '').replace(/[\r\n]+/g, ' ').slice(0, 50);
        const safeContent = String(m.content || '').replace(/[\r\n]+/g, ' ').slice(0, 150);
        return `- [${m.id}] ${safeTitle}：${safeContent}`;
      });

      parts.push(
        `【用户明确授权使用的有限记忆（仅供背景理解，不得直接泄露、推测人格或打标签）】\n${safeMemories.join('\n')}`,
      );
    } else {
      parts.push('【记忆授权状态】用户未授权引用任何历史记忆，请仅基于用户当前当次输入进行回应。');
    }

    // 5. User Provided Content (Sanitized against role/system injection)
    const sanitizedUserContent = String(input.userContent ?? '')
      .replace(/【(?:系统|任务|角色|记忆)[\s\S]*?】/g, '')
      .trim();
    parts.push(`【用户当次内容】\n${sanitizedUserContent}`);

    return parts.join('\n\n');
  }
}
