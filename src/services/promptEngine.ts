import {
  Book,
  LorebookEntry,
  NovelSkill,
  SkillScope,
  SkillReferenceDoc,
  NovelChapterOutlineItem,
  NovelVolumePlanItem,
  NovelStoryUnitItem,
  NovelCharacterRelationNode,
  NovelKeyItem,
  NovelForeshadowItem,
  MasterOutlineSpec,
  DistilledStyleProfile,
  LEGACY_DEPRECATED_SKILL_IDS,
} from '../types';
import { parseSingleSkillMarkdown } from './skillPackageParser';
import { formatNovelSystemSettingsForPrompt } from '../data/novelArchitectureSchema';
import { formatFourLayerAndEntityContextForPrompt } from './fourLayerOutlineEngine';
import { formatDistilledStylePromptBlock } from './styleDistiller';

export interface ActiveSkillRefHit {
  doc: SkillReferenceDoc;
  reason: 'core' | 'keyword';
  matchedKeywords: string[];
}

export interface ActiveSkillMatch {
  skill: NovelSkill;
  reason: 'always' | 'keyword';
  matchedKeywords: string[];
  activeRefs: ActiveSkillRefHit[];
}

export interface ActiveLoreMatch {
  entry: LorebookEntry;
  reason: 'constant' | 'keyword';
  matchedKeywords: string[];
}

export interface PromptAuditReport {
  scope: SkillScope;
  xpSystemEnabled: boolean;
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
 * Guarantees that editing a skill's instruction or references in the Global Skill Hub immediately
 * takes effect across ALL books without stale snapshots, while respecting per-book toggles!
 */
export function resolveBookSkills(book: Book | null | undefined, globalSkills: NovelSkill[]): NovelSkill[] {
  const legacySet = new Set(LEGACY_DEPRECATED_SKILL_IDS);
  const savedBookSkills = (book?.settings?.skills || []).filter((bs) => !legacySet.has(bs.id));
  if (!globalSkills || globalSkills.length === 0) {
    return savedBookSkills;
  }

  const bookToggleMap = new Map<string, boolean>();
  savedBookSkills.forEach((bs) => {
    bookToggleMap.set(bs.id, bs.enabled);
  });

  const merged = globalSkills
    .filter((gs) => !legacySet.has(gs.id))
    .map((gs) => ({
      ...gs,
      enabled: bookToggleMap.has(gs.id) ? Boolean(bookToggleMap.get(gs.id)) : gs.enabled,
    }));

  // Preserve any book-only custom skills not in globalSkills
  const globalIds = new Set(globalSkills.map((g) => g.id));
  savedBookSkills.forEach((bs) => {
    if (!globalIds.has(bs.id) && !legacySet.has(bs.id)) {
      merged.push(bs);
    }
  });

  return merged;
}

/**
 * Progressive Disclosure Reference Router:
 * Given an active multi-file SKILL package, selects at most 3 high-relevance sub-documents
 * from `references/` based on core contract flag or context keyword matches, preventing context bloat!
 */
function routeSkillReferences(
  skill: NovelSkill,
  lowerCorpus: string
): ActiveSkillRefHit[] {
  if (!skill.references || skill.references.length === 0) return [];

  const hits: ActiveSkillRefHit[] = [];

  for (const doc of skill.references) {
    // Skip raw large JSON parameter tables unless explicitly pinned as core
    if (doc.path.endsWith('.json') && !doc.alwaysLoad) continue;

    if (doc.alwaysLoad) {
      hits.push({ doc, reason: 'core', matchedKeywords: [] });
      continue;
    }

    const kws = doc.keywords || [];
    const matched = kws.filter((kw) => kw.length >= 2 && lowerCorpus.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      hits.push({ doc, reason: 'keyword', matchedKeywords: matched });
    }
  }

  // Sort: core contracts first, then by number of matched keywords descending, cap at top 3
  hits.sort((a, b) => {
    if (a.reason === 'core' && b.reason !== 'core') return -1;
    if (a.reason !== 'core' && b.reason === 'core') return 1;
    return b.matchedKeywords.length - a.matchedKeywords.length;
  });

  return hits.slice(0, 3);
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
        const activeRefs = routeSkillReferences(sk, lowerCorpus);
        active.push({ skill: sk, reason: 'keyword', matchedKeywords: hits, activeRefs });
      } else {
        standby.push(sk);
      }
    } else {
      const activeRefs = routeSkillReferences(sk, lowerCorpus);
      active.push({ skill: sk, reason: 'always', matchedKeywords: [], activeRefs });
    }
  }

  // Sort high priority & contract tier skills first
  active.sort((a, b) => {
    if (a.skill.priority === 'high' && b.skill.priority !== 'high') return -1;
    if (a.skill.priority !== 'high' && b.skill.priority === 'high') return 1;
    if (a.skill.ruleTier !== 'advisory' && b.skill.ruleTier === 'advisory') return -1;
    if (a.skill.ruleTier === 'advisory' && b.skill.ruleTier !== 'advisory') return 1;
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
 * Formats matched SKILL items (including progressively routed `references/` sub-docs and quality targets)
 * into clean, layered system rules.
 */
export function formatSkillsPromptBlock(matches: ActiveSkillMatch[]): string {
  if (matches.length === 0) return '';
  const lines = matches.map(({ skill, reason, matchedKeywords, activeRefs }, idx) => {
    const tierBadge =
      skill.ruleTier === 'advisory'
        ? '[弹性质量参照 · Advisory]'
        : skill.priority === 'high'
        ? '[核心结构契约 · 严禁违背]'
        : '[规范执行契约]';
    const verLabel = skill.version ? ` v${skill.version}` : '';
    const triggerTag = reason === 'keyword' ? ` (触发词: ${matchedKeywords.join('/')})` : '';

    let block = `${idx + 1}. ${tierBadge}【${skill.name}${verLabel}】${triggerTag}：\n${skill.promptInstruction}`;

    // Append measurable prose targets if present
    if (skill.qualityTargets && skill.qualityTargets.length > 0) {
      const targetSummary = skill.qualityTargets
        .slice(0, 6)
        .map((t) => `${t.metric}: ${t.medianTarget}`)
        .join(' | ');
      block += `\n  [量化质量基准参照]：${targetSummary}`;
    }

    // Append progressively routed reference sub-documents (capped per doc to keep context crisp)
    if (activeRefs && activeRefs.length > 0) {
      const refBlocks = activeRefs.map((r) => {
        const snippet =
          r.doc.content.length > 1600
            ? r.doc.content.slice(0, 1600).trim() + '\n...(节选核心契约)...'
            : r.doc.content.trim();
        const routeWhy =
          r.reason === 'core' ? '核心契约常驻' : `按需路由命中: ${r.matchedKeywords.join('/')}`;
        return `  --- 挂载子规范《${r.doc.title}》(${routeWhy}) ---\n${snippet}`;
      });
      block += `\n${refBlocks.join('\n\n')}`;
    }

    return block;
  });

  return `\n\n# 已挂载 SKILL 写作技能工程规范 (含渐进路由子文档)\n${lines.join('\n\n')}`;
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
    chapterWords?: number | string;
    pov?: string;
    tense?: string;
    outline?: string;
    characters?: string;
    world?: string;
    aiPersona?: string;
    styleReference?: string | null;
    activeDistilledStyle?: DistilledStyleProfile | null;
    lorebook?: LorebookEntry[];
    skills?: NovelSkill[];
    xpSystemEnabled?: boolean;
    bookXpNote?: string;
    systemSettings?: Record<string, string[]>;
    systemCustomNotes?: Record<string, string>;
    masterOutlineSpec?: MasterOutlineSpec;
    volumePlan?: NovelVolumePlanItem[];
    storyUnits?: NovelStoryUnitItem[];
    chapterOutlines?: NovelChapterOutlineItem[];
    characterGraph?: NovelCharacterRelationNode[];
    keyItemRegistry?: NovelKeyItem[];
    foreshadowLedger?: NovelForeshadowItem[];
    targetPlatform?: string;
    commercialBlurb?: string;
  };
  globalSkills: NovelSkill[];
  xpPreferences?: string;
  contextCorpus?: string;
  climaxMode?: boolean;
  forceAllLore?: boolean;
  targetChapterIndex?: number;
}): PromptAuditReport {
  const {
    scope,
    roleHeader,
    book,
    customSettings,
    globalSkills,
    xpPreferences,
    contextCorpus = '',
    climaxMode = false,
    forceAllLore = false,
    targetChapterIndex,
  } = params;

  const s = customSettings || book?.settings;
  const bookTitle = customSettings?.title ?? book?.title ?? '';

  // Resolve per-book XP System Switch:
  // Explicitly respects customSettings.xpSystemEnabled ?? book.settings.xpSystemEnabled.
  // If undefined (legacy book), defaults to true only if global xpPreferences is non-empty.
  const explicitXpToggle =
    customSettings?.xpSystemEnabled !== undefined
      ? customSettings.xpSystemEnabled
      : book?.settings?.xpSystemEnabled;
  const effectiveXpEnabled =
    explicitXpToggle !== undefined ? Boolean(explicitXpToggle) : Boolean((xpPreferences || '').trim());

  const resolvedBookXpNote = (
    customSettings?.bookXpNote ??
    book?.settings?.bookXpNote ??
    ''
  ).trim();
  const resolvedSystemSettings = customSettings?.systemSettings ?? book?.settings?.systemSettings;
  const resolvedSystemNotes =
    customSettings?.systemCustomNotes ?? book?.settings?.systemCustomNotes;
  const resolvedMasterSpec =
    customSettings?.masterOutlineSpec ?? book?.settings?.masterOutlineSpec;
  const resolvedVolumePlan = customSettings?.volumePlan ?? book?.settings?.volumePlan;
  const resolvedStoryUnits = customSettings?.storyUnits ?? book?.settings?.storyUnits;
  const resolvedChapterOutlines =
    customSettings?.chapterOutlines ?? book?.settings?.chapterOutlines;
  const resolvedCharacterGraph =
    customSettings?.characterGraph ?? book?.settings?.characterGraph;
  const resolvedKeyItemRegistry =
    customSettings?.keyItemRegistry ?? book?.settings?.keyItemRegistry;
  const resolvedForeshadow =
    customSettings?.foreshadowLedger ?? book?.settings?.foreshadowLedger;
  const resolvedDistilledStyle =
    customSettings?.activeDistilledStyle !== undefined
      ? customSettings.activeDistilledStyle
      : book?.settings?.activeDistilledStyle;
  const resolvedPlatform = customSettings?.targetPlatform ?? book?.settings?.targetPlatform;

  let systemPrompt = roleHeader.trim();

  if (scope === 'chapter' || scope === 'polish') {
    systemPrompt += `\n\n# 叙事动态推进与【腾讯朱雀过审级】人类笔法核心红线（最高执行权重）
1. 【场景事件与四层锚点驱动】：严守单章细纲的「主角目标 + 核心阻力 + 单章唯一推进配额 + 章末钩子」，绝不超前透支后续章节剧情，也绝不原地复读心理独白。
2. 【因果转场与知情权边界】：空间切换必须具备明确物理诱因；角色未亲眼所见、未获渠道证实的幕后阴谋严禁在台词中开启上帝视角点破。
3. 【过朱雀AIGC检测·高熵人类句法】：
   - 保持句长高离散度（Burstiness σ≥13）：将 28~40 字的具象器物动作长句与 2~9 字的冷峻短句错落咬合，保持约 25%~38% 的独句自然段留白；
   - 严禁出现“不是…而是… / 并非…而是… / 不仅没有…反而… / 声音不大却… / 没有A没有B只有C”句式；
   - 严禁出现“瞳孔微缩、嘴角勾起一抹、眼中闪过一丝、指节泛白、空气仿佛凝固、不容置疑、不易察觉、莫名的情绪、取而代之的是、与此同时、这意味着”；
   - 每千字破折号“——”不超过 1 个；章末严禁“没人知道/才刚刚开始/命运的齿轮”预告腔，必须停在具体动作、器物异变或半截台词上。`;
  }

  if (bookTitle || s?.genre || s?.outline || resolvedPlatform) {
    systemPrompt += `\n\n# 作品核心档案`;
    if (bookTitle) systemPrompt += `\n- 书名：《${bookTitle}》`;
    if (resolvedPlatform) systemPrompt += `\n- 目标首发签约平台：${resolvedPlatform}`;
    if (s?.genre) systemPrompt += `\n- 题材：${s.genre}`;
    if (s?.style) systemPrompt += `\n- 风格基调：${s.style}`;
    if (scope === 'chapter' || scope === 'polish') {
      systemPrompt += `\n- 叙事视角与时态：${s?.pov || '第三人称'} / ${s?.tense || '现在时'}`;
    }
    if (s?.outline) systemPrompt += `\n- 核心总纲文本：\n${s.outline}`;
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

  // Inject 11-Module × 20-Item Commercial Novel System Settings
  if (scope === 'outline' || scope === 'chapter' || scope === 'reroll') {
    const sysMatrixBlock = formatNovelSystemSettingsForPrompt(
      resolvedSystemSettings,
      resolvedSystemNotes
    );
    if (sysMatrixBlock) {
      systemPrompt += sysMatrixBlock;
    }
  }

  // Inject 4-Layer Rolling Outline (L1→L2→L3→L4) & Cross-Entity Relational Graph (Characters + Key Items + Foreshadowing)
  const fourLayerBlock = formatFourLayerAndEntityContextForPrompt(
    {
      masterOutlineSpec: resolvedMasterSpec,
      volumePlan: resolvedVolumePlan,
      storyUnits: resolvedStoryUnits,
      chapterOutlines: resolvedChapterOutlines,
      characterGraph: resolvedCharacterGraph,
      keyItemRegistry: resolvedKeyItemRegistry,
      foreshadowLedger: resolvedForeshadow,
    },
    targetChapterIndex,
    scope
  );
  if (fourLayerBlock) {
    systemPrompt += fourLayerBlock;
  }

  // Mount Distilled Style DNA first; fallback to raw styleReference only if no Distilled DNA is mounted
  if (scope === 'chapter' || scope === 'polish') {
    if (resolvedDistilledStyle) {
      systemPrompt += formatDistilledStylePromptBlock(resolvedDistilledStyle);
    } else if (s?.styleReference) {
      systemPrompt += `\n\n# 临时文风参考样本（建议在「执笔人设与文风蒸馏」中升级为去名化蒸馏DNA以防串味）\n${s.styleReference.slice(0, 2600)}`;
    }
  }

  // Strictly gated XP System Constitution (100% ON as core foundation vs 100% OFF physical isolation)
  const combinedXpParts: string[] = [];
  if (effectiveXpEnabled) {
    const trimmedGlobalXp = (xpPreferences || '').trim();
    if (trimmedGlobalXp) combinedXpParts.push(trimmedGlobalXp);
    if (resolvedBookXpNote) combinedXpParts.push(`【本书专属 XP 张力补充基调】：\n${resolvedBookXpNote}`);
  }
  const combinedXpText = combinedXpParts.join('\n\n').trim();

  if (effectiveXpEnabled && combinedXpText) {
    systemPrompt += `\n\n# 创作者 XP 审美基底宪法（当前作品已开启 XP 系统 · 作为大纲、细纲与章节创作的核心审美底座）\n${combinedXpText}`;
  } else if (!effectiveXpEnabled) {
    systemPrompt += `\n\n# 纯正商业/通用叙事隔离护栏（当前作品已关闭 XP 系统）\n本书已明确关闭个人 XP 癖好系统，请完全聚焦于客观故事主线、人物弧光、商业爽点与逻辑推进，严禁强行掺入私人特定恋物/特殊癖好套路。`;
  }

  // Evaluate Lorebook (filter out xp_trope entries when XP system is disabled!)
  const rawLoreSource = s?.lorebook || [];
  const filteredLoreSource = effectiveXpEnabled
    ? rawLoreSource
    : rawLoreSource.filter((entry) => entry.entryType !== 'xp_trope');

  const { active: activeLore, standby: standbyLore } = evaluateLorebook(
    filteredLoreSource,
    `${s?.genre || ''}\n${contextCorpus}`,
    forceAllLore || scope === 'outline'
  );
  systemPrompt += formatLorebookPromptBlock(activeLore);

  // Resolve & Evaluate Skills (filter out preference/XP intimacy skills when XP system is disabled!)
  const rawEffectiveSkills = customSettings?.skills
    ? customSettings.skills
    : resolveBookSkills(book, globalSkills);
  const filteredSkills = effectiveXpEnabled
    ? rawEffectiveSkills
    : rawEffectiveSkills.filter(
        (sk) => sk.category !== 'preference' && sk.id !== 'skill-intimacy-tension'
      );

  const { active: activeSkills, standby: standbySkills } = evaluateSkillsForScope(
    filteredSkills,
    scope,
    `${s?.genre || ''}\n${s?.style || ''}\n${contextCorpus}`
  );
  systemPrompt += formatSkillsPromptBlock(activeSkills);

  if (climaxMode && scope === 'chapter') {
    systemPrompt += `\n\n# 名场面高潮慢放指令（当前章节已开启）
本章处于关键情感或冲突爆点！请将核心对手戏镜头放慢 2 倍以上：细腻刻画环境光影明暗、呼吸声频、指尖温度、眼神躲闪或侵略感，将情绪拉扯推向极致，杜绝一笔带过。`;
  }

  return {
    scope,
    xpSystemEnabled: effectiveXpEnabled,
    hasXpConstitution: effectiveXpEnabled && combinedXpText.length > 0,
    xpLength: effectiveXpEnabled ? combinedXpText.length : 0,
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
  const slugLine = skill.slug ? `name: ${skill.slug}\ndisplay_name: "${skill.name.replace(/"/g, '\\"')}"` : `name: "${skill.name.replace(/"/g, '\\"')}"`;
  const versionLine = skill.version ? `\nversion: ${skill.version}` : '';
  const tierLine = skill.ruleTier ? `\nruleTier: ${skill.ruleTier}` : '';

  return `---
${slugLine}${versionLine}
description: "${(skill.description || '').replace(/"/g, '\\"')}"
category: ${skill.category || 'custom'}
scopes: [${scopes}]
triggerMode: ${skill.triggerMode || 'always'}
priority: ${skill.priority || 'normal'}${tierLine}
keywords: [${keywords}]
enabled: ${skill.enabled !== false}
---

${skill.promptInstruction.trim()}
`;
}

/**
 * Standard SKILL.md parser (delegates to lossless multi-line YAML parser)
 */
export function parseSkillMarkdown(rawMd: string, fallbackName: string = '导入的写作技能'): NovelSkill {
  return parseSingleSkillMarkdown(rawMd, fallbackName);
}
