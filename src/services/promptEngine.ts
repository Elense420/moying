import { Book, LorebookEntry, NovelSkill, SkillScope, SkillCategory } from '../types';
import { generateUUID } from '../utils/uuid';

export interface ActiveSkillMatch {
  skill: NovelSkill;
  reason: 'always' | 'keyword';
  matchedKeywords: string[];
}

export interface ActiveLoreMatch {
  entry: LorebookEntry;
  reason: 'constant' | 'keyword';
  matchedKeywords: string[];
}

export interface PromptAuditReport {
  scope: SkillScope;
  hasXpConstitution: boolean;
  xpLength: number;
  activeSkills: ActiveSkillMatch[];
  standbySkills: NovelSkill[];
  activeLore: ActiveLoreMatch[];
  standbyLore: LorebookEntry[];
  systemPrompt: string;
}

/**
 * Merges latest Global Skills with a Book's per-book skill toggle states.
 * Guarantees that editing a skill's instruction in the Global Skill Hub immediately
 * takes effect across ALL books without stale snapshots, while respecting per-book toggles!
 */
export function resolveBookSkills(book: Book | null | undefined, globalSkills: NovelSkill[]): NovelSkill[] {
  const savedBookSkills = book?.settings?.skills || [];
  if (!globalSkills || globalSkills.length === 0) {
    return savedBookSkills;
  }

  const bookToggleMap = new Map<string, boolean>();
  savedBookSkills.forEach((bs) => {
    bookToggleMap.set(bs.id, bs.enabled);
  });

  const merged = globalSkills.map((gs) => ({
    ...gs,
    enabled: bookToggleMap.has(gs.id) ? Boolean(bookToggleMap.get(gs.id)) : gs.enabled,
  }));

  // Preserve any book-only custom skills not in globalSkills
  const globalIds = new Set(globalSkills.map((g) => g.id));
  savedBookSkills.forEach((bs) => {
    if (!globalIds.has(bs.id)) {
      merged.push(bs);
    }
  });

  return merged;
}

/**
 * Evaluates which Skills should fire for a given lifecycle scope and context text.
 */
export function evaluateSkillsForScope(
  allSkills: NovelSkill[],
  scope: SkillScope,
  contextCorpus: string
): { active: ActiveSkillMatch[]; standby: NovelSkill[] } {
  const active: ActiveSkillMatch[] = [];
  const standby: NovelSkill[] = [];
  const lowerCorpus = (contextCorpus || '').toLowerCase();

  for (const sk of allSkills) {
    if (!sk.enabled) continue;

    const scopes: SkillScope[] = sk.scopes && sk.scopes.length > 0 ? sk.scopes : ['chapter', 'polish'];
    if (!scopes.includes(scope)) {
      standby.push(sk);
      continue;
    }

    if (sk.triggerMode === 'keyword' && sk.keywords && sk.keywords.length > 0) {
      const hits = sk.keywords.filter((kw) => kw.trim() && lowerCorpus.includes(kw.trim().toLowerCase()));
      if (hits.length > 0) {
        active.push({ skill: sk, reason: 'keyword', matchedKeywords: hits });
      } else {
        standby.push(sk);
      }
    } else {
      active.push({ skill: sk, reason: 'always', matchedKeywords: [] });
    }
  }

  // Sort high priority skills first
  active.sort((a, b) => {
    if (a.skill.priority === 'high' && b.skill.priority !== 'high') return -1;
    if (a.skill.priority !== 'high' && b.skill.priority === 'high') return 1;
    return 0;
  });

  return { active, standby };
}

/**
 * Evaluates which Lorebook entries should fire based on constant vs keyword activation.
 */
export function evaluateLorebook(
  lorebook: LorebookEntry[] | undefined,
  contextCorpus: string,
  forceIncludeAllEnabled: boolean = false
): { active: ActiveLoreMatch[]; standby: LorebookEntry[] } {
  const active: ActiveLoreMatch[] = [];
  const standby: LorebookEntry[] = [];
  if (!lorebook || lorebook.length === 0) return { active, standby };

  const lowerCorpus = (contextCorpus || '').toLowerCase();

  for (const entry of lorebook) {
    if (!entry.enabled) continue;

    if (!forceIncludeAllEnabled && entry.activationMode === 'keyword' && entry.keywords && entry.keywords.length > 0) {
      const hits = entry.keywords.filter((kw) => kw.trim() && lowerCorpus.includes(kw.trim().toLowerCase()));
      if (hits.length > 0) {
        active.push({ entry, reason: 'keyword', matchedKeywords: hits });
      } else {
        standby.push(entry);
      }
    } else {
      active.push({ entry, reason: 'constant', matchedKeywords: [] });
    }
  }

  return { active, standby };
}

/**
 * Formats matched Lorebook entries into clean, structured markdown instructions.
 */
export function formatLorebookPromptBlock(matches: ActiveLoreMatch[]): string {
  if (matches.length === 0) return '';
  const typeLabels: Record<string, string> = {
    character: '角色档案',
    xp_trope: 'XP张力锚点',
    world_rule: '世界法则',
    scene_pack: '情境细节包',
  };

  const lines = matches.map(({ entry, reason, matchedKeywords }) => {
    const badge = typeLabels[entry.entryType || 'character'] || '专属档案';
    const triggerNote = reason === 'keyword' ? ` (情境触发: ${matchedKeywords.join('/')})` : '';
    const details: string[] = [];
    if (entry.appearance) details.push(`外貌与视觉特征：${entry.appearance}`);
    if (entry.personality) details.push(`性格与内核反差：${entry.personality}`);
    if (entry.behaviorQuirks) details.push(`动作癖好/语气/XP反应：${entry.behaviorQuirks}`);
    if (entry.mustIncludeTaboos) details.push(`必写细节与绝对禁忌：${entry.mustIncludeTaboos}`);
    return `- 【${badge} · ${entry.name}】${triggerNote}\n  ${details.join('\n  ')}`;
  });

  return `\n\n# 角色与癖好专属世界书 (Lorebook 高权重约束)\n以下档案已在当前情境激活，请在行文细节、微动作与心理描写中精准贯彻，切忌机械背诵设定词：\n${lines.join('\n')}`;
}

/**
 * Formats matched SKILL 2.0 items into structured system rules.
 */
export function formatSkillsPromptBlock(matches: ActiveSkillMatch[]): string {
  if (matches.length === 0) return '';
  const lines = matches.map(({ skill, reason, matchedKeywords }, idx) => {
    const priorityTag = skill.priority === 'high' ? '[核心铁律]' : '[规范执行]';
    const triggerTag = reason === 'keyword' ? ` (触发词: ${matchedKeywords.join('/')})` : '';
    return `${idx + 1}. ${priorityTag}【${skill.name}】${triggerTag}：\n${skill.promptInstruction}`;
  });

  return `\n\n# 已挂载 SKILL 写作技能规范 (必须严格执行)\n${lines.join('\n\n')}`;
}

/**
 * Unified System Prompt Builder for ALL stages:
 * - 'outline': Inspiration generation, card-to-outline fusion, SetupView outline refinement
 * - 'chapter': Chapter 1 & subsequent chapter expansion, chapter rewrite
 * - 'reroll': Next-chapter 4 plot directions reroll
 * - 'polish': Inline paragraph polish / tension boost / rewrite
 */
export function buildUnifiedSystemPrompt(params: {
  scope: SkillScope;
  roleHeader: string;
  book?: Book | null;
  customSettings?: {
    title?: string;
    genre?: string;
    style?: string;
    pov?: string;
    tense?: string;
    outline?: string;
    characters?: string;
    world?: string;
    aiPersona?: string;
    styleReference?: string | null;
    lorebook?: LorebookEntry[];
    skills?: NovelSkill[];
  };
  globalSkills: NovelSkill[];
  xpPreferences?: string;
  contextCorpus: string;
  climaxMode?: boolean;
  forceAllLore?: boolean;
}): PromptAuditReport {
  const {
    scope,
    roleHeader,
    book,
    customSettings,
    globalSkills,
    xpPreferences,
    contextCorpus,
    climaxMode = false,
    forceAllLore = false,
  } = params;

  const s = customSettings || book?.settings;
  const bookTitle = customSettings?.title ?? book?.title ?? '';

  let systemPrompt = roleHeader.trim();

  if (scope === 'chapter') {
    systemPrompt += `\n\n# 叙事动态推进与防死板核心法则（最高执行红线）
1. 【场景事件驱动】：每一章必须有具体的事件发生或空间/关系实质移动（如：前往新地点、外部危机介入、人物交锋、解开或引发误会、实质性关系突破），严禁两人在同一房间原地复读心理独白。
2. 【反车轱辘话与细节化】：严禁机械重复前文写过的体型差概括词与固定套话；将人设魅力化解到具体的一言一行与五感细节中，单章重点打磨 1~2 个核心名场面即可。
3. 【节奏张弛有度】：交替使用对话机锋、环境氛围与微动作交互，保持阅读呼吸感。`;
  }

  if (bookTitle || s?.genre || s?.outline) {
    systemPrompt += `\n\n# 作品核心档案`;
    if (bookTitle) systemPrompt += `\n- 书名：《${bookTitle}》`;
    if (s?.genre) systemPrompt += `\n- 题材：${s.genre}`;
    if (s?.style) systemPrompt += `\n- 风格基调：${s.style}`;
    if (scope === 'chapter' || scope === 'polish') {
      systemPrompt += `\n- 叙事视角与时态：${s?.pov || '第三人称'} / ${s?.tense || '现在时'}`;
    }
    if (s?.outline) systemPrompt += `\n- 核心大纲：\n${s.outline}`;
  }

  if (s?.aiPersona && (scope === 'chapter' || scope === 'polish' || scope === 'outline')) {
    systemPrompt += `\n\n# 执笔人设与核心指令\n${s.aiPersona}`;
  }

  if (s?.characters) {
    systemPrompt += `\n\n# 主要角色设定\n${s.characters}`;
  }

  if (s?.world) {
    systemPrompt += `\n\n# 世界观与底层规则\n${s.world}`;
  }

  if (s?.styleReference && (scope === 'chapter' || scope === 'polish')) {
    systemPrompt += `\n\n# 文笔韵律模仿样本（仅学习其句式节奏、用词质感与冷暖氛围，严禁抄袭样本内人名剧情）\n${s.styleReference.slice(0, 3500)}`;
  }

  const trimmedXp = (xpPreferences || '').trim();
  if (trimmedXp) {
    systemPrompt += `\n\n# 创作者全局 XP 审美宪法与红线禁忌\n${trimmedXp}`;
  }

  // Evaluate Lorebook
  const loreSource = s?.lorebook || [];
  const { active: activeLore, standby: standbyLore } = evaluateLorebook(
    loreSource,
    contextCorpus,
    forceAllLore || scope === 'outline'
  );
  systemPrompt += formatLorebookPromptBlock(activeLore);

  // Resolve & Evaluate Skills
  const effectiveSkills = customSettings?.skills
    ? customSettings.skills
    : resolveBookSkills(book, globalSkills);

  const { active: activeSkills, standby: standbySkills } = evaluateSkillsForScope(
    effectiveSkills,
    scope,
    contextCorpus
  );
  systemPrompt += formatSkillsPromptBlock(activeSkills);

  if (climaxMode && scope === 'chapter') {
    systemPrompt += `\n\n# 名场面高潮慢放指令（当前章节已开启）
本章处于关键情感或冲突爆点！请将核心对手戏镜头放慢 2 倍以上：细腻刻画环境光影明暗、呼吸声频、指尖温度、眼神躲闪或侵略感，将情绪拉扯推向极致，杜绝一笔带过。`;
  }

  return {
    scope,
    hasXpConstitution: trimmedXp.length > 0,
    xpLength: trimmedXp.length,
    activeSkills,
    standbySkills,
    activeLore,
    standbyLore,
    systemPrompt,
  };
}

/**
 * Standard SKILL.md serializer (YAML frontmatter + Markdown instruction body)
 */
export function serializeSkillToMarkdown(skill: NovelSkill): string {
  const scopes = (skill.scopes && skill.scopes.length > 0 ? skill.scopes : ['chapter', 'polish']).join(', ');
  const keywords = (skill.keywords || []).join(', ');
  return `---
name: "${skill.name.replace(/"/g, '\\"')}"
description: "${(skill.description || '').replace(/"/g, '\\"')}"
category: ${skill.category || 'custom'}
scopes: [${scopes}]
triggerMode: ${skill.triggerMode || 'always'}
priority: ${skill.priority || 'normal'}
keywords: [${keywords}]
enabled: ${skill.enabled !== false}
---

${skill.promptInstruction.trim()}
`;
}

/**
 * Standard SKILL.md parser (supports single SKILL.md with YAML frontmatter)
 */
export function parseSkillMarkdown(rawMd: string, fallbackName: string = '导入的写作技能'): NovelSkill {
  const trimmed = rawMd.trim();
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = trimmed.match(fmRegex);

  if (!match) {
    return {
      id: `skill-md-${generateUUID()}`,
      name: fallbackName.replace(/\.md$/i, ''),
      description: '从 Markdown 文件导入的写作技能规则',
      promptInstruction: trimmed,
      category: 'custom',
      scopes: ['chapter', 'polish'],
      triggerMode: 'always',
      priority: 'normal',
      enabled: true,
      isPreset: false,
    };
  }

  const yamlPart = match[1];
  const bodyPart = match[2].trim();
  const meta: Record<string, string> = {};

  yamlPart.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  });

  const parseList = (raw?: string): string[] => {
    if (!raw) return [];
    const inner = raw.replace(/^\[|\]$/g, '').trim();
    if (!inner) return [];
    return inner
      .split(/[,，]/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  };

  const validScopes: SkillScope[] = ['outline', 'chapter', 'reroll', 'polish'];
  const parsedScopes = parseList(meta.scopes || meta.scope).filter((s): s is SkillScope =>
    validScopes.includes(s as SkillScope)
  );

  const validCategories: SkillCategory[] = ['style', 'rule', 'preference', 'structure', 'custom'];
  const cat = validCategories.includes(meta.category as SkillCategory)
    ? (meta.category as SkillCategory)
    : 'custom';

  return {
    id: `skill-md-${generateUUID()}`,
    name: meta.name || fallbackName.replace(/\.md$/i, ''),
    description: meta.description || meta.name || '标准 SKILL.md 导入技能',
    promptInstruction: bodyPart || trimmed,
    category: cat,
    scopes: parsedScopes.length > 0 ? parsedScopes : ['chapter', 'polish'],
    triggerMode: meta.triggerMode === 'keyword' ? 'keyword' : 'always',
    keywords: parseList(meta.keywords),
    priority: meta.priority === 'high' ? 'high' : 'normal',
    enabled: meta.enabled !== 'false',
    isPreset: false,
  };
}
