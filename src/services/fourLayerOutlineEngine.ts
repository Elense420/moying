import {
  BookSettings,
  FourLayerAuditIssue,
  LorebookEntry,
  MasterOutlineSpec,
  NovelChapterOutlineItem,
  NovelCharacterRelationNode,
  NovelForeshadowItem,
  NovelKeyItem,
  NovelStoryUnitItem,
  NovelVolumePlanItem,
  SkillScope,
} from '../types';
import { Message } from './apiClient';
import { generateUUID } from '../utils/uuid';
import { extractScaleRequirementHint, repairAndParseJson } from './outlineJsonParser';
import {
  buildCompactSchemaGuideForAI,
  formatNovelSystemSettingsForPrompt,
} from '../data/novelArchitectureSchema';

export function extractChapterNumbers(spanText: string | undefined): number[] {
  if (!spanText) return [];
  const nums = (spanText.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  return nums;
}

export function parseChapterSpanRange(
  spanText: string | undefined,
  fallbackStart: number = 1,
  fallbackCount: number = 6
): { start: number; end: number; count: number } {
  const nums = extractChapterNumbers(spanText);
  if (nums.length >= 2) {
    const start = Math.max(1, nums[0]);
    const end = Math.max(start, nums[1]);
    return { start, end, count: Math.max(1, Math.min(20, end - start + 1)) };
  }
  if (nums.length === 1) {
    const start = Math.max(1, nums[0]);
    return { start, end: start + fallbackCount - 1, count: fallbackCount };
  }
  return { start: fallbackStart, end: fallbackStart + fallbackCount - 1, count: fallbackCount };
}

/**
 * Deterministic topological & cross-entity relational graph audit across:
 * L1 总纲 ↔ L2 分卷纲 ↔ L3 剧情单元纲 ↔ L4 单章细纲 ↔ 角色图谱 ↔ 关键道具 ↔ 伏笔账本
 */
export function runLocalFourLayerGraphAudit(
  settings: BookSettings,
  draftedChapterCount: number = 0
): FourLayerAuditIssue[] {
  const issues: FourLayerAuditIssue[] = [];
  const master = settings.masterOutlineSpec;
  const volumes = settings.volumePlan || [];
  const units = settings.storyUnits || [];
  const chapters = [...(settings.chapterOutlines || [])].sort(
    (a, b) => a.chapterIndex - b.chapterIndex
  );
  const chars = settings.characterGraph || [];
  const items = settings.keyItemRegistry || [];
  const foreshadows = settings.foreshadowLedger || [];

  const volumeIds = new Set(volumes.map((v) => v.id));
  const unitIds = new Set(units.map((u) => u.id));
  const charIds = new Set(chars.map((c) => c.id));

  // L1 Check
  if (!master?.ultimateEnding?.trim()) {
    issues.push({
      id: generateUUID(),
      layer: 'L1总纲',
      severity: 'error',
      title: '缺少【最终结局锚点】，长篇连载易在中后盘失速烂尾',
      detail: '四层拆纲法要求第一层总纲必须率先锁死最终结局与战力/社会顶层天花板，所有分卷阶段目标均由此倒推。',
      fixSuggestion: '在 L1 总纲面板填写「最终结局锚点」与「战力/秩序天花板」，或点击「AI 四层拆纲一键推演」。',
    });
  } else if (!master?.corePromise?.trim()) {
    issues.push({
      id: generateUUID(),
      layer: 'L1总纲',
      severity: 'warning',
      title: '尚未明确【核心读者契约】',
      detail: '缺少一句话锁定的读者核心期待（黄金三章承诺），容易导致前期开篇切入偏慢。',
      fixSuggestion: '补充本书最核心的爽点承诺与主暗双线咬合关系。',
    });
  }

  // L2 Check
  if (volumes.length > 0) {
    volumes.forEach((v) => {
      if (!v.stageGoal?.trim() && !v.climaxGoal?.trim()) {
        issues.push({
          id: generateUUID(),
          layer: 'L2分卷纲',
          severity: 'warning',
          title: `第${v.volumeIndex}卷《${v.title}》缺少明确阶段目标`,
          detail: '分卷纲若无阶段里程碑与出入卷状态反差，下辖剧情单元极易变成散装副本。',
          fixSuggestion: `为《${v.title}》补全「阶段核心目标」及「入卷起点 → 出卷终点状态反差」。`,
        });
      }
    });
  }

  // L3 Check
  if (volumes.length > 0 && units.length === 0 && chapters.length >= 6) {
    issues.push({
      id: generateUUID(),
      layer: 'L3单元纲',
      severity: 'warning',
      title: '存在 L2 分卷与 L4 单章细纲，但中间缺失【L3 剧情单元纲】防跑偏层',
      detail: '一卷通常长达25~60章，直接从卷纲跳到单章细纲会导致中段灌水跑偏；需用4~10章一个的剧情单元锁定卷目标。',
      fixSuggestion: '切换到「L3 剧情单元纲」为各分卷拆解 2~5 个叙事单元并绑定卷目标锚点。',
    });
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.volumeId && volumeIds.size > 0 && !volumeIds.has(u.volumeId)) {
      issues.push({
        id: generateUUID(),
        layer: 'L3单元纲',
        severity: 'error',
        title: `剧情单元《${u.title}》绑定的父级分卷已失效`,
        detail: '该单元未正确挂载在现存分卷之下，无法接受分卷阶段目标约束。',
        fixSuggestion: '重新选择该单元所属的 L2 分卷。',
      });
    }
    if (!u.volumeAlignment?.trim()) {
      issues.push({
        id: generateUUID(),
        layer: 'L3单元纲',
        severity: 'warning',
        title: `剧情单元《${u.title}》未填写「围绕卷目标不跑偏锚点」`,
        detail: '缺少本单元对父卷阶段目标的实质贡献说明，支线副本容易喧宾夺主。',
        fixSuggestion: '写明本单元结束后如何把所属分卷目标往前推进一步。',
      });
    }
    if (
      i > 0 &&
      u.breakthroughMethod?.trim() &&
      units[i - 1].breakthroughMethod?.trim() &&
      u.breakthroughMethod.trim() === units[i - 1].breakthroughMethod.trim()
    ) {
      issues.push({
        id: generateUUID(),
        layer: 'L3单元纲',
        severity: 'warning',
        title: `相邻单元《${units[i - 1].title}》与《${u.title}》破局手段雷同`,
        detail: `连续两个剧情单元均采用「${u.breakthroughMethod}」破局，极易引发读者套路审美疲劳。`,
        fixSuggestion: '更换其中一个单元的破局方式（如由硬实力碾压改为利用规则漏洞/信息差设局/借刀杀人）。',
      });
    }
  }

  // L4 Check
  let consecutiveBurst = 0;
  let consecutiveSlack = 0;
  for (const ch of chapters) {
    if (!ch.protagonistGoal?.trim() || !ch.coreObstacle?.trim() || !ch.hookNote?.trim()) {
      issues.push({
        id: generateUUID(),
        layer: 'L4单章细纲',
        severity: 'warning',
        title: `第${ch.chapterIndex}章《${ch.title}》四要素不完整`,
        detail: `缺少${!ch.protagonistGoal?.trim() ? '「主角目标」' : ''}${
          !ch.coreObstacle?.trim() ? '「核心阻力」' : ''
        }${!ch.hookNote?.trim() ? '「章末钩子」' : ''}，行文时容易滑向无冲突水文。`,
        fixSuggestion: '补全该章的主角目标、核心阻力与结尾钩子，或使用「AI 逐层核对补全」。',
      });
    }
    if (ch.unitId && unitIds.size > 0 && !unitIds.has(ch.unitId)) {
      issues.push({
        id: generateUUID(),
        layer: 'L4单章细纲',
        severity: 'warning',
        title: `第${ch.chapterIndex}章《${ch.title}》绑定的剧情单元不存在`,
        detail: '单章细纲游离在剧情单元之外，建议重新归入对应 L3 单元。',
        fixSuggestion: '在 L4 单章细纲编辑器中重新选择所属单元。',
      });
    }

    if (ch.pacingType === '爆发') {
      consecutiveBurst += 1;
      consecutiveSlack = 0;
      if (consecutiveBurst >= 4) {
        issues.push({
          id: generateUUID(),
          layer: 'L4单章细纲',
          severity: 'warning',
          title: `第${ch.chapterIndex - 3}~${ch.chapterIndex}章连续 4 章处于「爆发」档`,
          detail: '连续高强度轰炸缺乏蓄力与余韵沉淀，会导致高潮阈值钝化。',
          fixSuggestion: '在两次大爆发之间插入 1 章「感情关系」或「蓄力铺垫」章做呼吸缓冲。',
        });
      }
    } else if (ch.pacingType === '日常喘息' || ch.pacingType === '过渡转场') {
      consecutiveSlack += 1;
      consecutiveBurst = 0;
      if (consecutiveSlack >= 3) {
        issues.push({
          id: generateUUID(),
          layer: 'L4单章细纲',
          severity: 'warning',
          title: `第${ch.chapterIndex - 2}~${ch.chapterIndex}章连续 3 章平缓过渡，存在掉追读风险`,
          detail: '商业连载连续 3 章无实质推进或冲突钩子会导致读者流失。',
          fixSuggestion: '将其中一章升级为「推进」并植入明确外部危机或信息差反转。',
        });
      }
    } else {
      consecutiveBurst = 0;
      consecutiveSlack = 0;
    }
  }

  // Cross-Entity Relational Graph Checks
  for (const ch of chars) {
    if (!ch.epistemicBoundary?.trim()) {
      issues.push({
        id: generateUUID(),
        layer: '跨设定关联',
        severity: 'warning',
        title: `角色「${ch.name}」未设置【知情权认知边界】`,
        detail: '缺少角色当前知晓/不知晓的情报边界定义，AI 写对白时容易让角色直接说出上帝视角幕后信息。',
        fixSuggestion: `在角色关联库中为「${ch.name}」补充当前知情边界（如：尚不知晓幕后黑手真身）。`,
      });
    }
  }

  for (const item of items) {
    if (item.holderCharacterId && charIds.size > 0 && !charIds.has(item.holderCharacterId)) {
      issues.push({
        id: generateUUID(),
        layer: '跨设定关联',
        severity: 'warning',
        title: `关键道具「${item.name}」绑定的持有角色节点已删除`,
        detail: '道具持有关系悬空，可能导致后续章节道具归属前后矛盾。',
        fixSuggestion: '在关键道具库重新指定持有者。',
      });
    }
    if (item.status === '已消耗损毁') {
      const stillUsedInPlannedChapter = chapters.find(
        (c) =>
          c.status !== 'drafted' &&
          c.chapterIndex > draftedChapterCount &&
          (c.linkedItemIds || []).includes(item.id)
      );
      if (stillUsedInPlannedChapter) {
        issues.push({
          id: generateUUID(),
          layer: '跨设定关联',
          severity: 'error',
          title: `已损毁/消耗道具「${item.name}」仍在第${stillUsedInPlannedChapter.chapterIndex}章细纲中被调用`,
          detail: `「${item.name}」当前状态为【已消耗损毁】，但未写细纲第${stillUsedInPlannedChapter.chapterIndex}章《${stillUsedInPlannedChapter.title}》仍关联了该道具，存在严重吃书风险！`,
          fixSuggestion: '移除后续章节对该已损毁道具的依赖，或增设修复/替代伏笔。',
        });
      }
    }
  }

  const maxChapterRef = Math.max(
    draftedChapterCount,
    chapters.length > 0 ? chapters[chapters.length - 1].chapterIndex : 0
  );
  for (const fs of foreshadows) {
    if (fs.status !== 'resolved' && fs.expectedResolveChapter) {
      const nums = extractChapterNumbers(fs.expectedResolveChapter);
      const latestExpected = nums.length > 0 ? Math.max(...nums) : null;
      if (latestExpected && draftedChapterCount > latestExpected) {
        issues.push({
          id: generateUUID(),
          layer: '跨设定关联',
          severity: 'error',
          title: `伏笔「${fs.name}」已超过预计回收章节（计划：${fs.expectedResolveChapter}，当前已写至第${draftedChapterCount}章）`,
          detail: '超期未回收的伏笔会导致读者认为作者遗忘吃书。',
          fixSuggestion: '在最近一章细纲中挂载该伏笔完成回收，或调整其延期发酵节点。',
        });
      } else if (
        latestExpected &&
        maxChapterRef >= latestExpected &&
        !chapters.some((c) => (c.linkedForeshadowIds || []).includes(fs.id))
      ) {
        issues.push({
          id: generateUUID(),
          layer: '跨设定关联',
          severity: 'warning',
          title: `伏笔「${fs.name}」尚未绑定到任何 L4 单章细纲回收节点`,
          detail: `该伏笔预计在「${fs.expectedResolveChapter}」回收，但对应细纲尚未建立显式关联锚点。`,
          fixSuggestion: '在对应单章细纲中勾选关联该伏笔，确保写作时精准触发回收。',
        });
      }
    }
  }

  return issues.slice(0, 24);
}

/**
 * Syncs `characterGraph` nodes non-destructively into `lorebook` character entries
 * so `promptEngine`'s Lorebook router and `characterGraph` stay 100% unified!
 */
export function syncCharacterGraphToLorebook(
  characterGraph: NovelCharacterRelationNode[],
  existingLorebook: LorebookEntry[] = []
): LorebookEntry[] {
  const updatedLore = [...existingLorebook];

  for (const node of characterGraph) {
    const relText =
      node.relations && node.relations.length > 0
        ? `人物关系网：${node.relations.map((r) => `对${r.targetName}→${r.relation}`).join('；')}`
        : '';

    const idx = updatedLore.findIndex(
      (e) =>
        (node.lorebookId && e.id === node.lorebookId) ||
        (e.entryType === 'character' && e.name.trim() === node.name.trim())
    );

    const synthesizedTaboos = [
      node.epistemicBoundary ? `【知情权边界·严禁上帝视角】：${node.epistemicBoundary}` : '',
      node.currentStatus ? `【当前实时状态】：${node.currentStatus}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    if (idx >= 0) {
      updatedLore[idx] = {
        ...updatedLore[idx],
        name: node.name,
        entryType: 'character',
        personality: [node.roleType, node.coreDesire, relText].filter(Boolean).join(' · '),
        behaviorQuirks: node.speechStyle || updatedLore[idx].behaviorQuirks,
        mustIncludeTaboos: synthesizedTaboos || updatedLore[idx].mustIncludeTaboos,
      };
    } else {
      updatedLore.push({
        id: node.lorebookId || generateUUID(),
        name: node.name,
        entryType: 'character',
        activationMode: node.roleType === '主角' || node.roleType === '核心主配/CP' ? 'constant' : 'keyword',
        keywords: [node.name],
        appearance: '',
        personality: [node.roleType, node.coreDesire, relText].filter(Boolean).join(' · '),
        behaviorQuirks: node.speechStyle,
        mustIncludeTaboos: synthesizedTaboos,
        enabled: true,
      });
    }
  }

  return updatedLore;
}

/**
 * Builds AI prompt to construct/upgrade the complete 4-Layer Architecture + Cross-Entity Relational Graph
 * from the book's current outline/characters/world/220-dim matrix.
 */
export function buildFourLayerCascadeSeedMessages(params: {
  bookTitle: string;
  genre: string;
  style: string;
  outline: string;
  characters: string;
  world: string;
  xpEnabled: boolean;
  xpSummary?: string;
}): Message[] {
  const { bookTitle, genre, style, outline, characters, world, xpEnabled, xpSummary } = params;

  return [
    {
      role: 'system',
      content: `你是精通【novel-creator-skill 四层滚动拆纲法】与【全设定因果关系图谱】的总架构师。
请根据用户当前小说档案，构建严谨咬合的“四层大纲骨架（L1总纲 → L2分卷纲 → L3剧情单元纲 → 首轮L4单章细纲）”以及与之强关联的“核心角色图谱、关键道具库、伏笔账本”。

【核心架构纪律】
1. L1 总纲必须确立【最终结局锚点】与【战力/秩序天花板】；
2. L2 分卷纲（规划 3~4 卷）每卷必须有明确的【阶段核心目标】与【入卷起点 → 出卷终点状态反差】；
3. L3 剧情单元纲（优先为第1卷拆出 2~3 个单元，并为第2卷拆出首个衔接单元）必须写明【围绕本卷目标不跑偏锚点 (volumeAlignment)】，且相邻单元的【破局手段 (breakthroughMethod)】绝不重复；
4. L4 单章细纲（生成前 8 章示范细纲，严格归属在第一卷各单元下）每章必须具备【主角目标】【核心阻力】【实质推进增量（至多1项大突破）】【章末钩子】与【松紧档位】；
5. 角色、关键道具、伏笔必须与剧情单元和单章细纲通过名称精准呼应！${
        xpEnabled && xpSummary
          ? `\n6. 本书已开启 XP 审美基底，拆纲与人物关系拉扯须自然承载该张力内核：${xpSummary.slice(0, 400)}`
          : '\n6. 本书已关闭私人 XP 系统，请纯粹按商业爽点与严密叙事因果推演。'
      }

请严格输出纯 JSON 对象（不要包裹任何多余解释文字）：
{
  "masterOutlineSpec": {
    "corePromise": "核心读者契约与黄金三章期待",
    "ultimateEnding": "最终结局锚点（全书终极闭环形态）",
    "worldCeiling": "力量/权势/规则顶层天花板与终极代价",
    "mainPlotline": "主线核心推进脉络",
    "emotionalOrSubPlotline": "感情线/重要副线交织脉络",
    "darkPlotline": "幕后暗线与认知颠覆悬念"
  },
  "volumes": [
    {
      "volumeIndex": 1,
      "title": "卷名",
      "chapterSpan": "第1章 - 第25章",
      "stageGoal": "本卷阶段核心目标",
      "entryState": "入卷起点处境",
      "exitState": "出卷终点跃迁与新隐患",
      "turningPoints": "1/4入局 · 中点惊变 · 3/4绝境反扑",
      "coreConflict": "本卷核心对抗矛盾",
      "climaxGoal": "卷末大高潮落点"
    }
  ],
  "units": [
    {
      "volumeIndex": 1,
      "unitIndex": 1,
      "title": "第一单元标题",
      "chapterSpan": "第1章 - 第5章",
      "volumeAlignment": "本单元如何精准服务第1卷阶段目标且绝不跑偏",
      "coreConflict": "单元核心危机",
      "payoffEvent": "单元高潮爽点兑现",
      "breakthroughMethod": "破局手段标签（如：利用规则盲区反杀）",
      "linkedCharacterNames": ["角色名A", "角色名B"],
      "linkedItemNames": ["道具名X"],
      "linkedForeshadowNames": ["伏笔名Y"]
    }
  ],
  "chapters": [
    {
      "chapterIndex": 1,
      "volumeIndex": 1,
      "unitIndex": 1,
      "title": "第1章标题（勿带第X章前缀）",
      "pacingType": "推进",
      "protagonistGoal": "主角本章具体目标",
      "coreObstacle": "核心外部/内部阻力",
      "stateDelta": "本章唯一实质推进增量",
      "summary": "2~3句凝练本章关键剧情事件",
      "hookNote": "章末悬念或危机钩子",
      "linkedCharacterNames": ["角色名A"],
      "linkedItemNames": ["道具名X"],
      "linkedForeshadowNames": ["伏笔名Y"]
    }
  ],
  "characters": [
    {
      "name": "角色姓名",
      "roleType": "主角",
      "coreDesire": "核心欲望与执念",
      "speechStyle": "说话口癖、句长与潜台词声纹特征",
      "epistemicBoundary": "当前知情权边界（知道什么/尚不知晓什么幕后秘密）",
      "currentStatus": "开局实时状态",
      "relations": [{ "targetName": "另一角色名", "relation": "张力关系描述" }]
    }
  ],
  "keyItems": [
    {
      "name": "关键道具/信物/杀器名称",
      "category": "核心信物/杀器/线索",
      "holderName": "初始持有者或地点",
      "originChapter": 1,
      "rulesAndCost": "功能机制与严格使用代价限制",
      "status": "主角持有"
    }
  ],
  "foreshadows": [
    {
      "name": "伏笔名称",
      "plantedChapter": 1,
      "expectedResolveChapter": "第18章",
      "status": "planted",
      "note": "埋设细节与后续揭晓反转逻辑",
      "linkedCharacterNames": ["角色名A"],
      "linkedItemNames": ["道具名X"]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle || '未命名长篇'}》
题材：${genre || '未定'} | 风格：${style || '沉浸戏剧张力'}
【当前总纲文本】：
${outline || '请根据题材与角色构思完整长篇架构'}

【当前角色设定】：
${characters || '请构建核心主角、重要主配与阶段反派'}

【当前世界观设定】：
${world || '请构建自洽且有代价约束的世界规则'}`,
    },
  ];
}

export function parseFourLayerCascadeSeedResponse(raw: string): {
  masterOutlineSpec: MasterOutlineSpec;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
} {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('AI 未返回有效 JSON 结构，请重试');
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  const masterOutlineSpec: MasterOutlineSpec = {
    corePromise: String(parsed.masterOutlineSpec?.corePromise || '').trim(),
    ultimateEnding: String(parsed.masterOutlineSpec?.ultimateEnding || '').trim(),
    worldCeiling: String(parsed.masterOutlineSpec?.worldCeiling || '').trim(),
    mainPlotline: String(parsed.masterOutlineSpec?.mainPlotline || '').trim(),
    emotionalOrSubPlotline: String(parsed.masterOutlineSpec?.emotionalOrSubPlotline || '').trim(),
    darkPlotline: String(parsed.masterOutlineSpec?.darkPlotline || '').trim(),
  };

  // Build Entities First so we can bind relational IDs cleanly
  const charNameMap = new Map<string, string>();
  const characterGraph: NovelCharacterRelationNode[] = (parsed.characters || []).map((c: any) => {
    const id = generateUUID();
    const name = String(c.name || '未命名角色').trim();
    charNameMap.set(name, id);
    return {
      id,
      name,
      roleType: (['主角', '核心主配/CP', '重要配角', '阶段反派', '幕后反派'].includes(c.roleType)
        ? c.roleType
        : '重要配角') as NovelCharacterRelationNode['roleType'],
      coreDesire: String(c.coreDesire || '').trim(),
      speechStyle: String(c.speechStyle || '').trim(),
      epistemicBoundary: String(c.epistemicBoundary || '').trim(),
      currentStatus: String(c.currentStatus || '正常').trim(),
      debutChapter: 1,
      relations: Array.isArray(c.relations)
        ? c.relations.map((r: any) => ({
            targetName: String(r.targetName || ''),
            relation: String(r.relation || ''),
          }))
        : [],
    };
  });

  const itemNameMap = new Map<string, string>();
  const keyItemRegistry: NovelKeyItem[] = (parsed.keyItems || []).map((it: any) => {
    const id = generateUUID();
    const name = String(it.name || '关键道具').trim();
    itemNameMap.set(name, id);
    const holderName = String(it.holderName || '未知').trim();
    return {
      id,
      name,
      category: String(it.category || '关键道具').trim(),
      holderName,
      holderCharacterId: charNameMap.get(holderName),
      originChapter: Number(it.originChapter) || 1,
      rulesAndCost: String(it.rulesAndCost || '').trim(),
      status: (['未现世', '主角持有', '他人持有', '争夺遗失', '已消耗损毁'].includes(it.status)
        ? it.status
        : '主角持有') as NovelKeyItem['status'],
    };
  });

  const foreshadowNameMap = new Map<string, string>();
  const foreshadowLedger: NovelForeshadowItem[] = (parsed.foreshadows || []).map((f: any) => {
    const id = generateUUID();
    const name = String(f.name || '核心伏笔').trim();
    foreshadowNameMap.set(name, id);
    const linkedCharIds = Array.isArray(f.linkedCharacterNames)
      ? f.linkedCharacterNames.map((n: string) => charNameMap.get(String(n).trim())).filter(Boolean)
      : [];
    const linkedItemIds = Array.isArray(f.linkedItemNames)
      ? f.linkedItemNames.map((n: string) => itemNameMap.get(String(n).trim())).filter(Boolean)
      : [];
    return {
      id,
      name,
      plantedChapter: Number(f.plantedChapter) || 1,
      expectedResolveChapter: String(f.expectedResolveChapter || '').trim(),
      status: f.status === 'fermenting' || f.status === 'resolved' ? f.status : 'planted',
      note: String(f.note || '').trim(),
      linkedCharacterIds: linkedCharIds as string[],
      linkedItemIds: linkedItemIds as string[],
    };
  });

  const volIndexToId = new Map<number, { id: string; title: string }>();
  const volumePlan: NovelVolumePlanItem[] = (parsed.volumes || []).map((v: any, idx: number) => {
    const id = generateUUID();
    const volumeIndex = Number(v.volumeIndex) || idx + 1;
    const title = String(v.title || `第${volumeIndex}卷`).trim();
    volIndexToId.set(volumeIndex, { id, title });
    return {
      id,
      volumeIndex,
      title,
      chapterSpan: String(v.chapterSpan || '').trim(),
      stageGoal: String(v.stageGoal || '').trim(),
      entryState: String(v.entryState || '').trim(),
      exitState: String(v.exitState || '').trim(),
      turningPoints: String(v.turningPoints || '').trim(),
      coreConflict: String(v.coreConflict || '').trim(),
      climaxGoal: String(v.climaxGoal || '').trim(),
    };
  });

  const unitIndexKeyToId = new Map<string, string>();
  const storyUnits: NovelStoryUnitItem[] = (parsed.units || []).map((u: any, idx: number) => {
    const id = generateUUID();
    const vIdx = Number(u.volumeIndex) || 1;
    const uIdx = Number(u.unitIndex) || idx + 1;
    const parentVol = volIndexToId.get(vIdx) || (volumePlan[0] ? { id: volumePlan[0].id, title: volumePlan[0].title } : { id: '', title: '' });
    unitIndexKeyToId.set(`${vIdx}-${uIdx}`, id);
    unitIndexKeyToId.set(`any-${uIdx}`, id);

    return {
      id,
      volumeId: parentVol.id,
      unitIndex: uIdx,
      title: String(u.title || `第${uIdx}单元`).trim(),
      chapterSpan: String(u.chapterSpan || '').trim(),
      volumeAlignment: String(u.volumeAlignment || '').trim(),
      coreConflict: String(u.coreConflict || '').trim(),
      payoffEvent: String(u.payoffEvent || '').trim(),
      breakthroughMethod: String(u.breakthroughMethod || '').trim(),
      linkedCharacterIds: Array.isArray(u.linkedCharacterNames)
        ? (u.linkedCharacterNames.map((n: string) => charNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
      linkedItemIds: Array.isArray(u.linkedItemNames)
        ? (u.linkedItemNames.map((n: string) => itemNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
      linkedForeshadowIds: Array.isArray(u.linkedForeshadowNames)
        ? (u.linkedForeshadowNames.map((n: string) => foreshadowNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
    };
  });

  const chapterOutlines: NovelChapterOutlineItem[] = (parsed.chapters || []).map((c: any, idx: number) => {
    const chIdx = Number(c.chapterIndex) || idx + 1;
    const vIdx = Number(c.volumeIndex) || 1;
    const uIdx = Number(c.unitIndex) || 1;
    const parentVol = volIndexToId.get(vIdx) || (volumePlan[0] ? { id: volumePlan[0].id, title: volumePlan[0].title } : { id: '', title: '' });
    const unitId = unitIndexKeyToId.get(`${vIdx}-${uIdx}`) || unitIndexKeyToId.get(`any-${uIdx}`) || storyUnits[0]?.id;

    return {
      id: generateUUID(),
      chapterIndex: chIdx,
      title: String(c.title || `未命名章节`).replace(/^第\d+章[：:\s]*/, '').trim(),
      volumeId: parentVol.id || undefined,
      unitId,
      volumeTag: parentVol.title ? `第${vIdx}卷 · ${parentVol.title}` : undefined,
      pacingType: (['爆发', '推进', '感情关系', '蓄力铺垫', '日常喘息', '过渡转场'].includes(c.pacingType)
        ? c.pacingType
        : '推进') as NovelChapterOutlineItem['pacingType'],
      protagonistGoal: String(c.protagonistGoal || '').trim(),
      coreObstacle: String(c.coreObstacle || '').trim(),
      stateDelta: String(c.stateDelta || '').trim(),
      summary: String(c.summary || '').trim(),
      hookNote: String(c.hookNote || '').trim(),
      linkedCharacterIds: Array.isArray(c.linkedCharacterNames)
        ? (c.linkedCharacterNames.map((n: string) => charNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
      linkedItemIds: Array.isArray(c.linkedItemNames)
        ? (c.linkedItemNames.map((n: string) => itemNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
      linkedForeshadowIds: Array.isArray(c.linkedForeshadowNames)
        ? (c.linkedForeshadowNames.map((n: string) => foreshadowNameMap.get(String(n).trim())).filter(Boolean) as string[])
        : [],
      status: 'planned',
    };
  });

  return {
    masterOutlineSpec,
    volumePlan,
    storyUnits,
    chapterOutlines,
    characterGraph,
    keyItemRegistry,
    foreshadowLedger,
  };
}

/**
 * Generates L4 Chapter Outlines strictly anchored to a specific L3 Story Unit & L2 Volume,
 * wiring character/item/foreshadow IDs automatically.
 */
export function buildGenerateUnitChaptersMessages(params: {
  bookTitle: string;
  settings: BookSettings;
  targetUnit: NovelStoryUnitItem;
  parentVolume?: NovelVolumePlanItem;
  startChapter: number;
  chapterCount: number;
}): Message[] {
  const { bookTitle, settings, targetUnit, parentVolume, startChapter, chapterCount } = params;
  const endChapter = startChapter + chapterCount - 1;

  const prevChapters = [...(settings.chapterOutlines || [])]
    .filter((c) => c.chapterIndex < startChapter)
    .sort((a, b) => a.chapterIndex - b.chapterIndex)
    .slice(-5)
    .map(
      (c) =>
        `第${c.chapterIndex}章《${c.title}》[目标:${c.protagonistGoal || '-'} | 增量:${c.stateDelta || c.summary} | 钩子:${c.hookNote || '-'}]`
    )
    .join('\n');

  const charNames = (settings.characterGraph || []).map((c) => `${c.name}(${c.roleType}，知情边界:${c.epistemicBoundary || '正常'})`).join('；');
  const itemNames = (settings.keyItemRegistry || [])
    .filter((i) => i.status !== '已消耗损毁')
    .map((i) => `${i.name}(持有:${i.holderName}，规则:${i.rulesAndCost})`)
    .join('；');
  const activeForeshadows = (settings.foreshadowLedger || [])
    .filter((f) => f.status !== 'resolved')
    .map((f) => `${f.name}(预计回收:${f.expectedResolveChapter || '待定'}，说明:${f.note})`)
    .join('；');

  return [
    {
      role: 'system',
      content: `你是执行【四层拆纲法 · L4 单章细纲精密拆解】的网文总编剧。
请严格围绕当前所属【L2 分卷阶段目标】与【L3 剧情单元防跑偏锚点】，生成第 ${startChapter} 章至第 ${endChapter} 章（共 ${chapterCount} 章）的结构化单章细纲。

【强制拆解铁律】
1. 每章必须明确拆出：主角本章目标 (protagonistGoal)、核心阻力 (coreObstacle)、实质推进增量 (stateDelta，单章至多1项大突破，严禁剧情暴走或原地水字数)、2~3句事件梗概 (summary)、章末悬念钩子 (hookNote) 以及松紧档位 (pacingType: 爆发/推进/感情关系/蓄力铺垫/日常喘息/过渡转场)。
2. 严禁连续 4 章爆发或连续 3 章过渡日常，张弛有度。
3. 严禁出现角色超前知晓未披露暗线的上帝视角设定！
4. 从给定角色库、道具库、伏笔库中精准挑选本章实际涉及的名称填入对应数组。

直接输出纯 JSON 数组：
[
  {
    "chapterIndex": ${startChapter},
    "title": "章节标题（不带第X章前缀）",
    "pacingType": "推进",
    "protagonistGoal": "主角本章具体想达成什么",
    "coreObstacle": "谁或什么规则阻碍了他",
    "stateDelta": "本章结束后局势/关系/线索发生了什么唯一实质改变",
    "summary": "2~3句清晰概括本章发生的具体故事场景与交锋",
    "hookNote": "章末停在什么危机、反常细节或半句台词上",
    "linkedCharacterNames": ["角色名"],
    "linkedItemNames": ["道具名"],
    "linkedForeshadowNames": ["伏笔名"]
  }
]`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》
【L1 最终结局锚点】：${settings.masterOutlineSpec?.ultimateEnding || settings.outline.slice(0, 300)}
【L2 所属分卷】：${parentVolume ? `第${parentVolume.volumeIndex}卷《${parentVolume.title}》 · 阶段目标：${parentVolume.stageGoal || parentVolume.climaxGoal}` : '默认第一卷'}
【L3 当前剧情单元】：《${targetUnit.title}》（${targetUnit.chapterSpan}）
- 围绕卷目标防跑偏锚点：${targetUnit.volumeAlignment}
- 单元核心冲突：${targetUnit.coreConflict}
- 单元高潮兑现：${targetUnit.payoffEvent}
- 本单元破局方式：${targetUnit.breakthroughMethod}

【前序衔接细纲回顾】：
${prevChapters || '当前为开篇起始章节'}

【可关联角色池】：${charNames || '按角色设定提取'}
【可调用未损毁关键道具池】：${itemNames || '暂无'}
【待发酵/待回收伏笔池】：${activeForeshadows || '暂无'}`,
    },
  ];
}

export function parseGeneratedUnitChapters(params: {
  rawResponse: string;
  targetUnit: NovelStoryUnitItem;
  parentVolume?: NovelVolumePlanItem;
  settings: BookSettings;
}): NovelChapterOutlineItem[] {
  const { rawResponse, targetUnit, parentVolume, settings } = params;
  const cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('未解析到有效的单章细纲 JSON 数组');
  }
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error('单章细纲格式错误');

  const charMap = new Map((settings.characterGraph || []).map((c) => [c.name.trim(), c.id]));
  const itemMap = new Map((settings.keyItemRegistry || []).map((i) => [i.name.trim(), i.id]));
  const fsMap = new Map((settings.foreshadowLedger || []).map((f) => [f.name.trim(), f.id]));

  return arr.map((c: any, idx: number) => ({
    id: generateUUID(),
    chapterIndex: Number(c.chapterIndex) || idx + 1,
    title: String(c.title || '未命名章节').replace(/^第\d+章[：:\s]*/, '').trim(),
    volumeId: parentVolume?.id || targetUnit.volumeId || undefined,
    unitId: targetUnit.id,
    volumeTag: parentVolume ? `第${parentVolume.volumeIndex}卷 · ${parentVolume.title}` : undefined,
    pacingType: (['爆发', '推进', '感情关系', '蓄力铺垫', '日常喘息', '过渡转场'].includes(c.pacingType)
      ? c.pacingType
      : '推进') as NovelChapterOutlineItem['pacingType'],
    protagonistGoal: String(c.protagonistGoal || '').trim(),
    coreObstacle: String(c.coreObstacle || '').trim(),
    stateDelta: String(c.stateDelta || '').trim(),
    summary: String(c.summary || '').trim(),
    hookNote: String(c.hookNote || '').trim(),
    linkedCharacterIds: Array.isArray(c.linkedCharacterNames)
      ? (c.linkedCharacterNames.map((n: string) => charMap.get(String(n).trim())).filter(Boolean) as string[])
      : [],
    linkedItemIds: Array.isArray(c.linkedItemNames)
      ? (c.linkedItemNames.map((n: string) => itemMap.get(String(n).trim())).filter(Boolean) as string[])
      : [],
    linkedForeshadowIds: Array.isArray(c.linkedForeshadowNames)
      ? (c.linkedForeshadowNames.map((n: string) => fsMap.get(String(n).trim())).filter(Boolean) as string[])
      : [],
    status: 'planned',
  }));
}

/**
 * AI Layer-by-Layer Error Correction (逐层核对纠错修复器):
 * Audits L1 ↔ L2 ↔ L3 ↔ L4 ↔ Entities for drift, broken causality, and missing hooks,
 * and returns patched chapters/units/character epistemic boundaries!
 */
export function buildAiCascadeAuditAndRepairMessages(params: {
  bookTitle: string;
  settings: BookSettings;
  localIssues: FourLayerAuditIssue[];
}): Message[] {
  const { bookTitle, settings, localIssues } = params;

  const issueText =
    localIssues.length > 0
      ? localIssues.map((iss, i) => `${i + 1}. [${iss.layer}] ${iss.title} —— ${iss.detail}`).join('\n')
      : '本地拓扑无硬性断链，请深度排查剧情单元是否偏离分卷目标、相邻单元套路是否雷同、单章阻力与钩子是否够硬。';

  const unitsBrief = (settings.storyUnits || [])
    .map(
      (u) =>
        `[id=${u.id}] 单元${u.unitIndex}《${u.title}》(${u.chapterSpan}) | 防跑偏锚点:${u.volumeAlignment} | 破局:${u.breakthroughMethod}`
    )
    .join('\n');

  const chaptersBrief = (settings.chapterOutlines || [])
    .filter((c) => c.status !== 'drafted')
    .slice(0, 20)
    .map(
      (c) =>
        `[id=${c.id}] 第${c.chapterIndex}章《${c.title}》 | 目标:${c.protagonistGoal || '缺失'} | 阻力:${c.coreObstacle || '缺失'} | 钩子:${c.hookNote || '缺失'} | 梗概:${c.summary}`
    )
    .join('\n');

  const charsBrief = (settings.characterGraph || [])
    .map((c) => `[id=${c.id}] ${c.name}(${c.roleType}) | 知情边界:${c.epistemicBoundary || '缺失'}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是执行【四层拆纲逐层核对纠错协议】的总架构督导。
请自顶向下（L1终局 → L2卷目标 → L3单元不跑偏锚点 → L4单章目标/阻力/钩子 → 角色知情权与道具伏笔闭环）逐层核查并自动修复缺漏与跑偏项！

输出严格合法的纯 JSON 对象：
{
  "auditConclusion": "2~3句话指出本次逐层核对发现的核心逻辑隐患及已执行的修正策略",
  "patchedMasterUltimateEnding": "若原L1终局锚点为空则补全，否则保留原意微调",
  "patchedUnits": [
    {
      "id": "原单元id",
      "volumeAlignment": "修正后的围绕卷目标不跑偏锚点",
      "breakthroughMethod": "修正后不与相邻单元重复的破局手段"
    }
  ],
  "patchedChapters": [
    {
      "id": "原未写章节id",
      "protagonistGoal": "补全或纠偏后的主角本章目标",
      "coreObstacle": "补全或强化后的本章核心阻力",
      "stateDelta": "单章唯一实质推进增量",
      "hookNote": "补全或强化后的章末悬念钩子"
    }
  ],
  "patchedCharacters": [
    {
      "id": "原角色id",
      "epistemicBoundary": "补全后的严格知情权边界（防止上帝视角穿帮）"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》
【L1 总纲终局】：${settings.masterOutlineSpec?.ultimateEnding || '待补全'} | 主线：${settings.masterOutlineSpec?.mainPlotline || settings.outline.slice(0, 400)}
【L2 分卷纲】：
${(settings.volumePlan || []).map((v) => `第${v.volumeIndex}卷《${v.title}》阶段目标：${v.stageGoal || v.climaxGoal}`).join('\n') || '暂无'}
【L3 剧情单元纲】：
${unitsBrief || '暂无'}
【L4 待写单章细纲（最多前20章）】：
${chaptersBrief || '暂无'}
【角色图谱】：
${charsBrief || '暂无'}
【本地拓扑检测报告】：
${issueText}`,
    },
  ];
}

/**
 * `webnovel-write` Post-Chapter Memory & Cross-Entity State Write-Back:
 * Extracts newly debuted supporting characters, character status/epistemic updates,
 * key item ownership/consumption shifts, and foreshadowing progress after a chapter is written!
 */
export function buildPostChapterMemoryWritebackMessages(params: {
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  settings: BookSettings;
}): Message[] {
  const { chapterIndex, chapterTitle, chapterText, settings } = params;

  const existingChars = (settings.characterGraph || [])
    .map((c) => `[id=${c.id}] ${c.name}（状态:${c.currentStatus} | 知情边界:${c.epistemicBoundary}）`)
    .join('\n');
  const existingItems = (settings.keyItemRegistry || [])
    .map((i) => `[id=${i.id}] ${i.name}（持有:${i.holderName} | 状态:${i.status}）`)
    .join('\n');
  const existingFs = (settings.foreshadowLedger || [])
    .filter((f) => f.status !== 'resolved')
    .map((f) => `[id=${f.id}] ${f.name}（状态:${f.status} | 备注:${f.note}）`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是执行【webnovel-write 双层状态与全设定强关联回写协议】的连载记忆官。
请阅读刚完成的第 ${chapterIndex} 章正文，提取本章对“角色状态与知情边界、新登场重要配角、关键道具流转/损耗、伏笔埋设/发酵/回收”造成的真实变化，输出纯 JSON：
{
  "chapterMemoryDigest": "一句话凝练本章核心因果增量（用于回写单章细纲归档）",
  "updatedCharacters": [
    {
      "id": "已有角色id",
      "currentStatus": "本章结束后的最新位置/伤势/立场状态",
      "epistemicBoundary": "更新后的知情权边界（本章新获知了什么线索，仍不知道什么幕后真相）"
    }
  ],
  "newCharacters": [
    {
      "name": "本章新出场且后续有戏份的重要配角或反派名（路人甲勿录）",
      "roleType": "重要配角",
      "coreDesire": "核心动机",
      "speechStyle": "说话口癖与声纹",
      "epistemicBoundary": "该角色知情边界",
      "currentStatus": "当前状态"
    }
  ],
  "updatedItems": [
    {
      "id": "已有道具id",
      "holderName": "最新持有者或存放地",
      "status": "主角持有" | "他人持有" | "争夺遗失" | "已消耗损毁",
      "milestoneNote": "第${chapterIndex}章流转或动用记录"
    }
  ],
  "newItems": [
    {
      "name": "本章新出现的关键道具/信物（普通茶杯勿录）",
      "category": "关键道具",
      "holderName": "当前持有者",
      "rulesAndCost": "功能与限制代价",
      "status": "主角持有"
    }
  ],
  "updatedForeshadows": [
    {
      "id": "已有伏笔id",
      "status": "fermenting" | "resolved",
      "noteAppend": "第${chapterIndex}章推进或揭晓说明"
    }
  ],
  "newForeshadows": [
    {
      "name": "本章新埋下的草蛇灰线伏笔（无则空数组）",
      "expectedResolveChapter": "预计回收区间",
      "note": "埋设细节与回收构想"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `第${chapterIndex}章《${chapterTitle}》
【已有角色图谱】：
${existingChars || '暂无'}
【已有关键道具库】：
${existingItems || '暂无'}
【未闭合伏笔账本】：
${existingFs || '暂无'}

【本章正文】：
${chapterText.slice(0, 7500)}`,
    },
  ];
}

export function applyPostChapterMemoryWriteback(params: {
  rawJson: string;
  chapterIndex: number;
  settings: BookSettings;
}): {
  nextSettings: BookSettings;
  summaryToast: string;
} {
  const { rawJson, chapterIndex, settings } = params;
  const cleaned = rawJson.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('状态回写返回格式无效');
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  let charCountUpdated = 0;
  let newCharCount = 0;
  let itemCountUpdated = 0;
  let fsCountUpdated = 0;

  const nextChars = [...(settings.characterGraph || [])];
  if (Array.isArray(parsed.updatedCharacters)) {
    for (const u of parsed.updatedCharacters) {
      const idx = nextChars.findIndex((c) => c.id === u.id);
      if (idx >= 0) {
        nextChars[idx] = {
          ...nextChars[idx],
          currentStatus: String(u.currentStatus || nextChars[idx].currentStatus),
          epistemicBoundary: String(u.epistemicBoundary || nextChars[idx].epistemicBoundary),
        };
        charCountUpdated += 1;
      }
    }
  }
  if (Array.isArray(parsed.newCharacters)) {
    for (const nc of parsed.newCharacters) {
      const name = String(nc.name || '').trim();
      if (!name || nextChars.some((c) => c.name === name)) continue;
      nextChars.push({
        id: generateUUID(),
        name,
        roleType: nc.roleType === '阶段反派' || nc.roleType === '幕后反派' ? nc.roleType : '重要配角',
        coreDesire: String(nc.coreDesire || ''),
        speechStyle: String(nc.speechStyle || ''),
        epistemicBoundary: String(nc.epistemicBoundary || `第${chapterIndex}章登场，仅知亲历事件`),
        currentStatus: String(nc.currentStatus || '刚登场'),
        debutChapter: chapterIndex,
      });
      newCharCount += 1;
    }
  }

  const nextItems = [...(settings.keyItemRegistry || [])];
  if (Array.isArray(parsed.updatedItems)) {
    for (const ui of parsed.updatedItems) {
      const idx = nextItems.findIndex((it) => it.id === ui.id);
      if (idx >= 0) {
        nextItems[idx] = {
          ...nextItems[idx],
          holderName: String(ui.holderName || nextItems[idx].holderName),
          status: (['未现世', '主角持有', '他人持有', '争夺遗失', '已消耗损毁'].includes(ui.status)
            ? ui.status
            : nextItems[idx].status) as NovelKeyItem['status'],
          milestoneNote: ui.milestoneNote
            ? [nextItems[idx].milestoneNote, String(ui.milestoneNote)].filter(Boolean).join(' → ')
            : nextItems[idx].milestoneNote,
        };
        itemCountUpdated += 1;
      }
    }
  }
  if (Array.isArray(parsed.newItems)) {
    for (const ni of parsed.newItems) {
      const name = String(ni.name || '').trim();
      if (!name || nextItems.some((it) => it.name === name)) continue;
      nextItems.push({
        id: generateUUID(),
        name,
        category: String(ni.category || '关键道具'),
        holderName: String(ni.holderName || '未知'),
        originChapter: chapterIndex,
        rulesAndCost: String(ni.rulesAndCost || '待补充'),
        status: (['未现世', '主角持有', '他人持有', '争夺遗失', '已消耗损毁'].includes(ni.status)
          ? ni.status
          : '主角持有') as NovelKeyItem['status'],
      });
      itemCountUpdated += 1;
    }
  }

  const nextFs = [...(settings.foreshadowLedger || [])];
  if (Array.isArray(parsed.updatedForeshadows)) {
    for (const uf of parsed.updatedForeshadows) {
      const idx = nextFs.findIndex((f) => f.id === uf.id);
      if (idx >= 0) {
        const nextStatus = uf.status === 'resolved' ? 'resolved' : 'fermenting';
        nextFs[idx] = {
          ...nextFs[idx],
          status: nextStatus,
          resolvedChapter: nextStatus === 'resolved' ? chapterIndex : nextFs[idx].resolvedChapter,
          progressedChapters: [nextFs[idx].progressedChapters, `第${chapterIndex}章`]
            .filter(Boolean)
            .join('、'),
          note: uf.noteAppend ? `${nextFs[idx].note} | ${uf.noteAppend}` : nextFs[idx].note,
        };
        fsCountUpdated += 1;
      }
    }
  }
  if (Array.isArray(parsed.newForeshadows)) {
    for (const nf of parsed.newForeshadows) {
      const name = String(nf.name || '').trim();
      if (!name || nextFs.some((f) => f.name === name)) continue;
      nextFs.push({
        id: generateUUID(),
        name,
        plantedChapter: chapterIndex,
        expectedResolveChapter: String(nf.expectedResolveChapter || '后续单元'),
        status: 'planted',
        note: String(nf.note || ''),
      });
      fsCountUpdated += 1;
    }
  }

  const nextOutlines = [...(settings.chapterOutlines || [])].map((co) =>
    co.chapterIndex === chapterIndex
      ? {
          ...co,
          status: 'drafted' as const,
          stateDelta: parsed.chapterMemoryDigest
            ? String(parsed.chapterMemoryDigest)
            : co.stateDelta,
        }
      : co
  );

  const syncedLorebook = syncCharacterGraphToLorebook(nextChars, settings.lorebook || []);

  const nextSettings: BookSettings = {
    ...settings,
    characterGraph: nextChars,
    keyItemRegistry: nextItems,
    foreshadowLedger: nextFs,
    chapterOutlines: nextOutlines,
    lorebook: syncedLorebook,
  };

  return {
    nextSettings,
    summaryToast: `记忆回写完成：更新角色 ${charCountUpdated} 人（新归档配角 ${newCharCount} 人）、关键道具变动 ${itemCountUpdated} 项、伏笔推进/新埋 ${fsCountUpdated} 项`,
  };
}

/**
 * Formats the complete 4-Layer Hierarchy (L1→L2→L3→L4) + Linked Cross-Entity Relational Context
 * for injection into `promptEngine.ts` during chapter writing, rerolling, or outline evolution.
 */
export function formatFourLayerAndEntityContextForPrompt(
  settings: Partial<BookSettings> | undefined,
  targetChapterIndex: number | undefined,
  scope: SkillScope
): string {
  if (!settings) return '';
  let block = '';

  const master = settings.masterOutlineSpec;
  const volumes = settings.volumePlan || [];
  const units = settings.storyUnits || [];
  const chapters = [...(settings.chapterOutlines || [])].sort(
    (a, b) => a.chapterIndex - b.chapterIndex
  );
  const chars = settings.characterGraph || [];
  const items = settings.keyItemRegistry || [];
  const foreshadows = settings.foreshadowLedger || [];

  // 1. L1 Master Spec
  if (
    master &&
    (master.ultimateEnding || master.corePromise || master.mainPlotline || master.darkPlotline) &&
    (scope === 'outline' || scope === 'chapter' || scope === 'reroll')
  ) {
    const l1Lines: string[] = [];
    if (master.corePromise) l1Lines.push(`- 核心读者契约：${master.corePromise}`);
    if (master.ultimateEnding) l1Lines.push(`- ★ 最终结局锚点（全书倒推终点）：${master.ultimateEnding}`);
    if (master.worldCeiling) l1Lines.push(`- 顶层战力/代价天花板：${master.worldCeiling}`);
    if (master.mainPlotline) l1Lines.push(`- 主线脉络：${master.mainPlotline}`);
    if (master.emotionalOrSubPlotline) l1Lines.push(`- 感情/副线脉络：${master.emotionalOrSubPlotline}`);
    if (master.darkPlotline) l1Lines.push(`- 幕后暗线：${master.darkPlotline}`);
    block += `\n\n# 四层拆纲 · L1 总纲终局与三线锚点\n${l1Lines.join('\n')}`;
  }

  // 2. Locate Current L4 Chapter, L3 Story Unit, and L2 Volume when writing a specific chapter
  const currentCh =
    typeof targetChapterIndex === 'number'
      ? chapters.find((c) => c.chapterIndex === targetChapterIndex)
      : undefined;
  const prevCh =
    typeof targetChapterIndex === 'number'
      ? chapters.find((c) => c.chapterIndex === targetChapterIndex - 1)
      : undefined;
  const nextCh =
    typeof targetChapterIndex === 'number'
      ? chapters.find((c) => c.chapterIndex === targetChapterIndex + 1)
      : undefined;

  const activeUnit = currentCh?.unitId
    ? units.find((u) => u.id === currentCh.unitId)
    : typeof targetChapterIndex === 'number'
    ? units.find((u) => {
        const nums = extractChapterNumbers(u.chapterSpan);
        return nums.length >= 2 && targetChapterIndex >= nums[0] && targetChapterIndex <= nums[1];
      })
    : undefined;

  const activeVolume = currentCh?.volumeId
    ? volumes.find((v) => v.id === currentCh.volumeId)
    : activeUnit?.volumeId
    ? volumes.find((v) => v.id === activeUnit.volumeId)
    : volumes[0];

  if (volumes.length > 0 && (scope === 'outline' || scope === 'reroll')) {
    const volLines = volumes.map(
      (v) =>
        `- 第${v.volumeIndex}卷《${v.title}》（${v.chapterSpan}）：阶段目标「${
          v.stageGoal || v.coreConflict
        }」 | 状态跃迁「${v.entryState || '起点'} → ${v.exitState || v.climaxGoal}」`
    );
    block += `\n\n# 四层拆纲 · L2 全书分卷阶段目标蓝图\n${volLines.join('\n')}`;
  } else if (activeVolume && scope === 'chapter') {
    block += `\n\n# 四层拆纲 · L2 当前所属分卷锚点\n- 第${activeVolume.volumeIndex}卷《${activeVolume.title}》（${activeVolume.chapterSpan}）\n- 本卷阶段核心目标：${activeVolume.stageGoal || activeVolume.coreConflict}\n- 出入卷状态反差：${activeVolume.entryState || '入局'} → ${activeVolume.exitState || activeVolume.climaxGoal}`;
  }

  if (activeUnit && (scope === 'chapter' || scope === 'reroll')) {
    block += `\n\n# 四层拆纲 · L3 当前剧情单元防跑偏契约\n- 当前单元：《${activeUnit.title}》（${activeUnit.chapterSpan}）\n- ★ 围绕本卷目标不跑偏锚点：${activeUnit.volumeAlignment}\n- 单元核心矛盾：${activeUnit.coreConflict} | 单元破局手段：${activeUnit.breakthroughMethod} | 单元收束高潮：${activeUnit.payoffEvent}`;
  }

  if ((currentCh || prevCh || nextCh) && scope === 'chapter') {
    const l4Lines: string[] = [];
    if (prevCh) {
      l4Lines.push(
        `- [上一章回顾 · 第${prevCh.chapterIndex}章《${prevCh.title}》]：${prevCh.stateDelta || prevCh.summary}`
      );
    }
    if (currentCh) {
      l4Lines.push(
        `- ★ [本章强制执行细纲 · 第${currentCh.chapterIndex}章《${currentCh.title}》 | 松紧档位：${
          currentCh.pacingType || '推进'
        }]\n  1) 主角本章目标：${currentCh.protagonistGoal || '推进当前单元目标'}\n  2) 核心外部/内部阻力：${
          currentCh.coreObstacle || '遭遇强力反制'
        }\n  3) 本章唯一实质推进配额（严禁超前透支）：${
          currentCh.stateDelta || currentCh.summary
        }\n  4) 事件梗概：${currentCh.summary}\n  5) 章末必须落地的钩子：${
          currentCh.hookNote || '停在关键悬念或异变动作上'
        }`
      );
    }
    if (nextCh) {
      l4Lines.push(
        `- [下一章边界红线（绝对禁止在本章提前写完！）· 第${nextCh.chapterIndex}章《${nextCh.title}》]：${nextCh.summary}`
      );
    }
    block += `\n\n# 四层拆纲 · L4 单章目标/阻力/钩子精准导航\n${l4Lines.join('\n')}`;
  }

  // 3. Cross-Entity Relational Context (Character Epistemic Boundaries + Key Items + Foreshadowing)
  if (chars.length > 0 && (scope === 'chapter' || scope === 'reroll')) {
    const linkedCharSet = new Set([
      ...(currentCh?.linkedCharacterIds || []),
      ...(activeUnit?.linkedCharacterIds || []),
    ]);
    const prioritizedChars =
      linkedCharSet.size > 0
        ? [
            ...chars.filter((c) => linkedCharSet.has(c.id)),
            ...chars.filter((c) => !linkedCharSet.has(c.id) && (c.roleType === '主角' || c.roleType === '核心主配/CP')),
          ]
        : chars.slice(0, 8);

    if (prioritizedChars.length > 0) {
      const charLines = prioritizedChars.map((c) => {
        const rels =
          c.relations && c.relations.length > 0
            ? ` | 关系锚点：${c.relations.map((r) => `对${r.targetName}→${r.relation}`).join('；')}`
            : '';
        return `- 【${c.name} · ${c.roleType}】核心动机：${c.coreDesire || '见角色设定'} | 专属声纹口癖：${
          c.speechStyle || '贴合身份'
        } | 实时状态：${c.currentStatus || '正常'} | ★知情权隔离红线（未知信息严禁在台词中穿帮点破）：${
          c.epistemicBoundary || '仅知晓本人亲眼所见情报'
        }${rels}`;
      });
      block += `\n\n# 关联角色实时状态、声纹与知情权隔离档案\n${charLines.join('\n')}`;
    }
  }

  if (items.length > 0 && (scope === 'chapter' || scope === 'reroll')) {
    const linkedItemSet = new Set([
      ...(currentCh?.linkedItemIds || []),
      ...(activeUnit?.linkedItemIds || []),
    ]);
    const relevantItems = items.filter(
      (it) => linkedItemSet.has(it.id) || it.status === '主角持有' || it.status === '争夺遗失' || it.status === '已消耗损毁'
    );
    if (relevantItems.length > 0) {
      const itemLines = relevantItems.map(
        (it) =>
          `- 【${it.name} (${it.category})】[当前状态：${it.status}${
            it.status === '已消耗损毁' ? ' —— 严禁凭空再次动用！' : ` | 当前持有：${it.holderName}`
          }] 规则与代价限制：${it.rulesAndCost}`
      );
      block += `\n\n# 关键道具持有权与代价约束账本\n${itemLines.join('\n')}`;
    }
  }

  if (foreshadows.length > 0 && (scope === 'chapter' || scope === 'reroll')) {
    const linkedFsSet = new Set([
      ...(currentCh?.linkedForeshadowIds || []),
      ...(activeUnit?.linkedForeshadowIds || []),
    ]);
    const activeHooks = foreshadows.filter((f) => f.status !== 'resolved');
    if (activeHooks.length > 0) {
      const hookLines = activeHooks.map((f) => {
        const isCurrentChapterFocus = linkedFsSet.has(f.id);
        return `- ${isCurrentChapterFocus ? '★[本章重点关联伏笔] ' : ''}[${
          f.status === 'fermenting' ? '发酵推进中' : '已埋设待呼应'
        } · 第${f.plantedChapter}章埋入${
          f.expectedResolveChapter ? ` / 预计${f.expectedResolveChapter}回收` : ''
        }] ${f.name}：${f.note}`;
      });
      block += `\n\n# 跨章节伏笔因果网络（带★为本章/本单元关联伏笔；未到回收期的暗线仅做草蛇灰线细节呼应，严禁提前泄底）\n${hookLines.join('\n')}`;
    }
  }

  return block;
}

// ============================================================================
// 四层拆纲 · 签名指纹、级联失效追踪与确定性双向拓扑关联引擎
// ============================================================================

function stableStringHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function computeOutlineAndScaleSignature(
  outline: string,
  characters: string,
  world: string,
  systemSettings?: Record<string, string[]>
): string {
  const scale = (systemSettings?.['foundation.scale_structure'] || []).join('|');
  const genres = (systemSettings?.['foundation.genre_types'] || []).join('|');
  return stableStringHash(`${outline.trim()}##${characters.trim()}##${world.trim()}##${scale}##${genres}`);
}

export function computeL1Signature(spec: MasterOutlineSpec): string {
  return stableStringHash(
    [
      spec.corePromise,
      spec.ultimateEnding,
      spec.worldCeiling,
      spec.mainPlotline,
      spec.emotionalOrSubPlotline,
      spec.darkPlotline,
    ]
      .map((s) => (s || '').trim())
      .join('||')
  );
}

export function computeL2Signature(volumes: NovelVolumePlanItem[]): string {
  return stableStringHash(
    volumes
      .map((v) =>
        [v.id, v.volumeIndex, v.title, v.chapterSpan, v.stageGoal, v.entryState, v.exitState, v.coreConflict, v.climaxGoal]
          .map((s) => String(s || '').trim())
          .join('|')
      )
      .join('##')
  );
}

export function computeL3Signature(units: NovelStoryUnitItem[]): string {
  return stableStringHash(
    units
      .map((u) =>
        [u.id, u.volumeId, u.unitIndex, u.title, u.chapterSpan, u.volumeAlignment, u.coreConflict, u.payoffEvent, u.breakthroughMethod]
          .map((s) => String(s || '').trim())
          .join('|')
      )
      .join('##')
  );
}

export function computeGraphSignature(
  chars: NovelCharacterRelationNode[],
  items: NovelKeyItem[],
  foreshadows: NovelForeshadowItem[]
): string {
  const cStr = chars
    .map((c) => `${c.id}:${c.name}:${c.roleType}:${c.epistemicBoundary}:${c.currentStatus}`)
    .join('|');
  const iStr = items
    .map((it) => `${it.id}:${it.name}:${it.holderName}:${it.status}:${it.rulesAndCost}`)
    .join('|');
  const fStr = foreshadows
    .map((f) => `${f.id}:${f.name}:${f.status}:${f.expectedResolveChapter || ''}:${f.note}`)
    .join('|');
  return stableStringHash(`${cStr}##${iStr}##${fStr}`);
}

/**
 * Deterministic bidirectional topology & text auto-linker:
 * 1. Prunes orphan character/item/foreshadow IDs from units/chapters/foreshadows/items.
 * 2. Cascades volume title -> chapter `volumeTag`, and unit's `volumeId` -> child chapter `volumeId`.
 * 3. Re-assigns unlinked chapters to matching L3 units / L2 volumes by chapter index & span.
 * 4. Scans L3 unit & L4 chapter texts to auto-match and bind mentioned character/item/foreshadow IDs.
 * 5. Keeps Lorebook character cards in sync with characterGraph.
 */
export function autoLinkEntitiesAndCascadeTopology(params: {
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
  lorebook: LorebookEntry[];
  renamedCharacter?: { oldName: string; newName: string; id: string };
}): {
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
  lorebook: LorebookEntry[];
  stats: { autoBoundLinks: number; topologyFixes: number };
} {
  let autoBoundLinks = 0;
  let topologyFixes = 0;

  const { volumePlan, renamedCharacter } = params;
  const volMap = new Map(volumePlan.map((v) => [v.id, v]));

  // 1. Cascade character rename inside relations + items + lorebook
  let nextChars = params.characterGraph.map((c) => ({
    ...c,
    relations: c.relations
      ? c.relations.map((r) =>
          renamedCharacter && r.targetName.trim() === renamedCharacter.oldName.trim()
            ? { ...r, targetName: renamedCharacter.newName }
            : r
        )
      : [],
  }));
  const validCharIds = new Set(nextChars.map((c) => c.id));
  const charById = new Map(nextChars.map((c) => [c.id, c]));

  let nextItems = params.keyItemRegistry.map((it) => {
    let holderCharacterId = it.holderCharacterId;
    let holderName = it.holderName;
    if (holderCharacterId && !validCharIds.has(holderCharacterId)) {
      holderCharacterId = undefined;
      topologyFixes++;
    }
    if (renamedCharacter && holderCharacterId === renamedCharacter.id) {
      holderName = renamedCharacter.newName;
      topologyFixes++;
    } else if (!holderCharacterId && holderName) {
      const matched = nextChars.find((c) => c.name.trim() === holderName.trim());
      if (matched) {
        holderCharacterId = matched.id;
        autoBoundLinks++;
      }
    } else if (holderCharacterId && charById.has(holderCharacterId)) {
      const owner = charById.get(holderCharacterId)!;
      if (owner.name.trim() && owner.name.trim() !== holderName.trim()) {
        holderName = owner.name;
        topologyFixes++;
      }
    }
    return { ...it, holderCharacterId, holderName };
  });
  const validItemIds = new Set(nextItems.map((i) => i.id));

  let nextForeshadows = params.foreshadowLedger.map((fs) => {
    const linkedCharIds = (fs.linkedCharacterIds || []).filter((id) => validCharIds.has(id));
    const linkedItemIds = (fs.linkedItemIds || []).filter((id) => validItemIds.has(id));
    const fsText = `${fs.name} ${fs.note}`;
    for (const c of nextChars) {
      if (c.name.trim().length >= 2 && fsText.includes(c.name.trim()) && !linkedCharIds.includes(c.id)) {
        linkedCharIds.push(c.id);
        autoBoundLinks++;
      }
    }
    for (const it of nextItems) {
      if (it.name.trim().length >= 2 && fsText.includes(it.name.trim()) && !linkedItemIds.includes(it.id)) {
        linkedItemIds.push(it.id);
        autoBoundLinks++;
      }
    }
    return { ...fs, linkedCharacterIds: linkedCharIds, linkedItemIds: linkedItemIds };
  });
  const validFsIds = new Set(nextForeshadows.map((f) => f.id));

  // Build span ranges for volumes & units for automatic index matching
  const volRanges = volumePlan.map((v) => ({
    vol: v,
    range: parseChapterSpanRange(v.chapterSpan, (v.volumeIndex - 1) * 20 + 1, 20),
  }));

  // 2. Clean & auto-link L3 Units
  const nextUnits = params.storyUnits.map((u) => {
    let volumeId = u.volumeId;
    if (volumeId && !volMap.has(volumeId)) {
      // Try matching by chapterSpan
      const uRange = parseChapterSpanRange(u.chapterSpan, 1, 6);
      const foundVol = volRanges.find((vr) => uRange.start >= vr.range.start && uRange.start <= vr.range.end);
      volumeId = foundVol?.vol.id || volumePlan[0]?.id || '';
      topologyFixes++;
    } else if (!volumeId && volumePlan.length > 0) {
      const uRange = parseChapterSpanRange(u.chapterSpan, 1, 6);
      const foundVol = volRanges.find((vr) => uRange.start >= vr.range.start && uRange.start <= vr.range.end);
      if (foundVol) {
        volumeId = foundVol.vol.id;
        topologyFixes++;
      }
    }

    const uChars = (u.linkedCharacterIds || []).filter((id) => validCharIds.has(id));
    const uItems = (u.linkedItemIds || []).filter((id) => validItemIds.has(id));
    const uFs = (u.linkedForeshadowIds || []).filter((id) => validFsIds.has(id));
    const unitText = `${u.title} ${u.volumeAlignment} ${u.coreConflict} ${u.payoffEvent} ${u.breakthroughMethod}`;

    for (const c of nextChars) {
      if (c.name.trim().length >= 2 && unitText.includes(c.name.trim()) && !uChars.includes(c.id)) {
        uChars.push(c.id);
        autoBoundLinks++;
      }
    }
    for (const it of nextItems) {
      if (it.name.trim().length >= 2 && unitText.includes(it.name.trim()) && !uItems.includes(it.id)) {
        uItems.push(it.id);
        autoBoundLinks++;
      }
    }
    for (const fs of nextForeshadows) {
      if (fs.name.trim().length >= 2 && unitText.includes(fs.name.trim()) && !uFs.includes(fs.id)) {
        uFs.push(fs.id);
        autoBoundLinks++;
      }
    }

    return {
      ...u,
      volumeId,
      linkedCharacterIds: uChars,
      linkedItemIds: uItems,
      linkedForeshadowIds: uFs,
    };
  });

  const unitMap = new Map(nextUnits.map((u) => [u.id, u]));
  const unitRanges = nextUnits.map((u) => ({
    unit: u,
    range: parseChapterSpanRange(u.chapterSpan, 1, 6),
  }));

  // 3. Clean & auto-link L4 Chapters + cascade volumeId / volumeTag
  const nextChapters = params.chapterOutlines.map((ch) => {
    let unitId = ch.unitId;
    if (unitId && !unitMap.has(unitId)) {
      unitId = undefined;
      topologyFixes++;
    }
    if (!unitId && unitRanges.length > 0) {
      const matchedUnit = unitRanges.find(
        (ur) => ch.chapterIndex >= ur.range.start && ch.chapterIndex <= ur.range.end
      );
      if (matchedUnit) {
        unitId = matchedUnit.unit.id;
        autoBoundLinks++;
      }
    }

    const parentUnit = unitId ? unitMap.get(unitId) : undefined;
    let volumeId = parentUnit?.volumeId || ch.volumeId;
    if (volumeId && !volMap.has(volumeId)) {
      volumeId = undefined;
      topologyFixes++;
    }
    if (!volumeId && volRanges.length > 0) {
      const matchedVol = volRanges.find(
        (vr) => ch.chapterIndex >= vr.range.start && ch.chapterIndex <= vr.range.end
      );
      if (matchedVol) {
        volumeId = matchedVol.vol.id;
        autoBoundLinks++;
      }
    }

    const parentVol = volumeId ? volMap.get(volumeId) : undefined;
    const expectedVolTag = parentVol ? `第${parentVol.volumeIndex}卷 · ${parentVol.title}` : ch.volumeTag;
    if (parentVol && expectedVolTag !== ch.volumeTag) {
      topologyFixes++;
    }

    const chChars = (ch.linkedCharacterIds || []).filter((id) => validCharIds.has(id));
    const chItems = (ch.linkedItemIds || []).filter((id) => validItemIds.has(id));
    const chFs = (ch.linkedForeshadowIds || []).filter((id) => validFsIds.has(id));
    const chText = `${ch.title} ${ch.protagonistGoal || ''} ${ch.coreObstacle || ''} ${ch.stateDelta || ''} ${ch.summary} ${ch.hookNote || ''}`;

    for (const c of nextChars) {
      if (c.name.trim().length >= 2 && chText.includes(c.name.trim()) && !chChars.includes(c.id)) {
        chChars.push(c.id);
        autoBoundLinks++;
      }
    }
    for (const it of nextItems) {
      if (it.name.trim().length >= 2 && chText.includes(it.name.trim()) && !chItems.includes(it.id)) {
        chItems.push(it.id);
        autoBoundLinks++;
      }
    }
    for (const fs of nextForeshadows) {
      if (fs.name.trim().length >= 2 && chText.includes(fs.name.trim()) && !chFs.includes(fs.id)) {
        chFs.push(fs.id);
        autoBoundLinks++;
      }
    }

    return {
      ...ch,
      unitId,
      volumeId,
      volumeTag: expectedVolTag,
      linkedCharacterIds: chChars,
      linkedItemIds: chItems,
      linkedForeshadowIds: chFs,
    };
  });

  // Also backfill unit links from its child chapters
  const finalUnits = nextUnits.map((u) => {
    const childChs = nextChapters.filter((c) => c.unitId === u.id);
    if (childChs.length === 0) return u;
    const charSet = new Set(u.linkedCharacterIds || []);
    const itemSet = new Set(u.linkedItemIds || []);
    const fsSet = new Set(u.linkedForeshadowIds || []);
    for (const ch of childChs) {
      (ch.linkedCharacterIds || []).forEach((id) => charSet.add(id));
      (ch.linkedItemIds || []).forEach((id) => itemSet.add(id));
      (ch.linkedForeshadowIds || []).forEach((id) => fsSet.add(id));
    }
    return {
      ...u,
      linkedCharacterIds: Array.from(charSet),
      linkedItemIds: Array.from(itemSet),
      linkedForeshadowIds: Array.from(fsSet),
    };
  });

  // Ensure keyItems with holderCharacterId have clean lorebook sync
  let nextLorebook = syncCharacterGraphToLorebook(nextChars, params.lorebook);
  if (renamedCharacter) {
    nextLorebook = nextLorebook.map((entry) =>
      entry.entryType === 'character' && entry.name.trim() === renamedCharacter.oldName.trim()
        ? {
            ...entry,
            name: renamedCharacter.newName,
            keywords: Array.from(
              new Set([...(entry.keywords || []).filter((k) => k !== renamedCharacter.oldName), renamedCharacter.newName])
            ),
          }
        : entry
    );
  }

  return {
    storyUnits: finalUnits,
    chapterOutlines: nextChapters,
    characterGraph: nextChars,
    keyItemRegistry: nextItems,
    foreshadowLedger: nextForeshadows,
    lorebook: nextLorebook,
    stats: { autoBoundLinks, topologyFixes },
  };
}

// ============================================================================
// 严格分步推演引擎：L1 总纲 -> L2 全书分卷 -> L3 剧情单元(按卷) -> L4 单章细纲 -> 关联图谱
// ============================================================================

export function buildGenerateL1MasterMessages(params: {
  bookTitle: string;
  genre: string;
  style: string;
  outline: string;
  characters: string;
  world: string;
  chapterWords?: number | string;
  systemSettings?: Record<string, string[]>;
  xpEnabled: boolean;
  xpSummary?: string;
}): Message[] {
  const { bookTitle, genre, style, outline, characters, world, chapterWords, systemSettings, xpEnabled, xpSummary } = params;
  const scaleHint = extractScaleRequirementHint(outline, systemSettings, chapterWords);

  return [
    {
      role: 'system',
      content: `你是精通【四层滚动拆纲法 · 第1步：L1 总纲定最终结局】的小说总架构师。
你的唯一任务是凝练、锁死全书的【L1 总纲与最终结局锚点】，绝不要在这一步拆解分卷、单元或单章。

【核心规则】
1. 必须依据当前大纲与设定中的真实篇幅规模合理设计总纲格局：${scaleHint.promptConstraint}
2. 明确锁死：核心读者契约 (corePromise)、最终结局锚点 (ultimateEnding)、顶层战力/社会秩序天花板 (worldCeiling)、主线脉络 (mainPlotline)、感情/副线脉络 (emotionalOrSubPlotline)、幕后暗线 (darkPlotline)。${
        xpEnabled && xpSummary
          ? `\n3. 本书已开启 XP 审美基底，人物与核心张力线须契合该偏好：${xpSummary.slice(0, 400)}`
          : '\n3. 本书已关闭个人 XP 系统，请纯粹聚焦大众商业逻辑与高潮反转。'
      }

严格输出纯 JSON 对象：
{
  "corePromise": "核心读者契约与开局承诺",
  "ultimateEnding": "全书最终结局锚点（必须写明终极闭环形态、关键人物结局与核心矛盾解决方式）",
  "worldCeiling": "力量/权势/规则顶层天花板及硬代价约束（防止后期战力膨胀）",
  "mainPlotline": "全书主线核心推进脉络（起→承→转→终局完整路径）",
  "emotionalOrSubPlotline": "感情线或核心副线拉扯脉络",
  "darkPlotline": "幕后暗线与认知颠覆悬念"
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle || '未命名企划'}》 | 题材：${genre || '未定'} | 文风：${style || '沉浸强张力'}
${scaleHint.promptConstraint}
【故事大纲】：
${outline || '请基于书名与题材构建完整总纲'}
【核心人物】：
${characters || '待补充'}
【世界观规则】：
${world || '待补充'}`,
    },
  ];
}

export function parseL1MasterResponse(raw: string): MasterOutlineSpec {
  const parsed = repairAndParseJson<any>(raw);
  const src = parsed?.masterOutlineSpec || parsed;
  if (!src || typeof src !== 'object') {
    throw new Error('L1 总纲生成未返回有效 JSON，请重试');
  }
  return {
    corePromise: String(src.corePromise || '').trim(),
    ultimateEnding: String(src.ultimateEnding || '').trim(),
    worldCeiling: String(src.worldCeiling || '').trim(),
    mainPlotline: String(src.mainPlotline || '').trim(),
    emotionalOrSubPlotline: String(src.emotionalOrSubPlotline || '').trim(),
    darkPlotline: String(src.darkPlotline || '').trim(),
  };
}

/**
 * Step 2: Generate COMPLETE L2 Volume Plan strictly anchored to L1 from Chapter 1 all the way to the Ultimate Ending!
 * Supports 'full' rebuild or 'append_to_ending' to complete missing tail volumes without losing front volumes.
 */
export function buildGenerateL2VolumesMessages(params: {
  bookTitle: string;
  genre: string;
  outline: string;
  characters: string;
  world: string;
  chapterWords?: number | string;
  systemSettings?: Record<string, string[]>;
  masterOutlineSpec: MasterOutlineSpec;
  existingVolumes?: NovelVolumePlanItem[];
  mode?: 'full' | 'append_to_ending';
  xpEnabled: boolean;
  xpSummary?: string;
}): Message[] {
  const {
    bookTitle,
    genre,
    outline,
    characters,
    world,
    chapterWords,
    systemSettings,
    masterOutlineSpec,
    existingVolumes = [],
    mode = 'full',
    xpEnabled,
    xpSummary,
  } = params;
  const scaleHint = extractScaleRequirementHint(outline, systemSettings, chapterWords);

  const isAppend = mode === 'append_to_ending' && existingVolumes.length > 0;
  const existingVolSummary = existingVolumes
    .map(
      (v) =>
        `第${v.volumeIndex}卷《${v.title}》（${v.chapterSpan}）：阶段目标「${v.stageGoal || v.coreConflict}」 | 出卷状态「${v.exitState || v.climaxGoal}」`
    )
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是精通【四层滚动拆纲法 · 第2步：L2 全书分卷纲完整规划】的小说架构师。
你的任务是**只聚焦 L2 分卷纲**，将【L1 总纲】从开篇第1章一路严谨拆解到【L1 最终结局锚点】，绝不允许出现“只拆了前面几卷、遗漏中后期乃至终局卷”的半截子烂尾规划！

【核心刚性约束】
1. **体量与卷数精准匹配**：${scaleHint.promptConstraint}
   - 短篇（约3万字）：通常 1~2 卷收官；
   - 盐选中篇（约8万字）：通常 2 卷（上/下卷）完结；
   - 轻长篇（约15万字）：通常 3 卷完结；
   - 30万~50万字长篇：通常 3~5 卷完结；
   - 百万字以上超长篇：通常 5~8 卷贯穿至最终终局。
2. **首尾闭环铁律**：${
        isAppend
          ? '请保留既有前序分卷不要重复输出，紧接最后一卷的出卷状态与章号，把中后期直至【L1最终结局锚点】的全部后续分卷完整补齐！最后一卷必须正式落地 L1 ultimateEnding！'
          : '从第1章出发，各卷 chapterSpan 必须连续衔接、无断档重叠，且【最后一卷的 exitState 与 climaxGoal 必须严丝合缝兑现 L1 的 ultimateEnding（最终结局锚点）】！'
      }
3. 每卷必须包含明确且不空洞的：stageGoal（本卷阶段核心目标）、entryState（入卷起点状态）、exitState（出卷终点状态反差）、turningPoints（1/4入局 · 中点惊变 · 3/4反扑）、coreConflict（核心矛盾）、climaxGoal（卷末大高潮落点）。${
        xpEnabled && xpSummary ? `\n4. 关系推进与阶段爽点可自然融合本书 XP 基调。` : ''
      }

直接输出纯 JSON 对象：
{
  "volumes": [
    {
      "volumeIndex": ${isAppend ? existingVolumes.length + 1 : 1},
      "title": "卷名（勿带第X卷前缀）",
      "chapterSpan": "第X章 - 第Y章",
      "stageGoal": "本卷阶段核心目标",
      "entryState": "主角及局势入卷起点状态",
      "exitState": "本卷收官时的实质跃迁状态（最后一卷须明确写明达成L1最终结局）",
      "turningPoints": "1/4入局 · 中点惊变 · 3/4绝境反扑",
      "coreConflict": "本卷核心冲突矛盾",
      "climaxGoal": "卷末大高潮与情绪引爆点"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》 | 题材：${genre}
【篇幅硬约束】：${scaleHint.promptConstraint}

【已确认的 L1 总纲（最高上位基准）】：
- 核心契约：${masterOutlineSpec.corePromise || '见大纲'}
- ★ 最终结局锚点（最后一卷必须落地）：${masterOutlineSpec.ultimateEnding || '完整收束主线结局'}
- 战力/规则天花板：${masterOutlineSpec.worldCeiling || '严格受控'}
- 主线脉络：${masterOutlineSpec.mainPlotline || outline.slice(0, 800)}
- 感情/副线脉络：${masterOutlineSpec.emotionalOrSubPlotline || '见大纲'}
- 幕后暗线：${masterOutlineSpec.darkPlotline || '见大纲'}

${isAppend ? `【已有前序分卷（请紧接最后一卷继续拆出直到结局的后续分卷）】：\n${existingVolSummary}\n` : ''}
【故事大纲原文参考】：
${outline.slice(0, 1800)}
【主要角色与世界观】：
${characters.slice(0, 700)}\n${world.slice(0, 500)}`,
    },
  ];
}

export function parseL2VolumesResponse(
  raw: string,
  existingVolumes: NovelVolumePlanItem[] = [],
  mode: 'full' | 'append_to_ending' = 'full'
): NovelVolumePlanItem[] {
  const parsed = repairAndParseJson<any>(raw);
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.volumes)
    ? parsed.volumes
    : Array.isArray(parsed?.volumePlan)
    ? parsed.volumePlan
    : [];
  if (rawList.length === 0) {
    throw new Error('L2 分卷纲未解析到有效的 volumes 数组，请重试');
  }

  const startOffset = mode === 'append_to_ending' ? existingVolumes.length : 0;
  const parsedVols: NovelVolumePlanItem[] = rawList.map((v: any, idx: number) => {
    const vIdx = startOffset > 0 ? startOffset + idx + 1 : Number(v.volumeIndex) || idx + 1;
    return {
      id: generateUUID(),
      volumeIndex: vIdx,
      title: String(v.title || `第${vIdx}卷`)
        .replace(/^第[一二三四五六七八九十百\d]+卷[：:\s·]*/u, '')
        .trim(),
      chapterSpan: String(v.chapterSpan || `第${(vIdx - 1) * 20 + 1}章 - 第${vIdx * 20}章`).trim(),
      stageGoal: String(v.stageGoal || '').trim(),
      entryState: String(v.entryState || '').trim(),
      exitState: String(v.exitState || '').trim(),
      turningPoints: String(v.turningPoints || '').trim(),
      coreConflict: String(v.coreConflict || '').trim(),
      climaxGoal: String(v.climaxGoal || '').trim(),
    };
  });

  if (mode === 'append_to_ending' && existingVolumes.length > 0) {
    return [...existingVolumes, ...parsedVols];
  }
  return parsedVols;
}

/**
 * Step 3: Generate L3 Story Units STRICTLY for ONE target L2 Volume grounded in L1 + L2!
 * Focusing one volume per call prevents truncation/omission and guarantees full chapterSpan coverage.
 */
export function buildGenerateL3UnitsForVolumeMessages(params: {
  bookTitle: string;
  outline: string;
  masterOutlineSpec: MasterOutlineSpec;
  allVolumes: NovelVolumePlanItem[];
  targetVolume: NovelVolumePlanItem;
  existingUnitsInOtherVolumes?: NovelStoryUnitItem[];
  startingUnitIndex?: number;
  xpEnabled: boolean;
}): Message[] {
  const {
    bookTitle,
    outline,
    masterOutlineSpec,
    allVolumes,
    targetVolume,
    existingUnitsInOtherVolumes = [],
    startingUnitIndex = 1,
    xpEnabled,
  } = params;

  const span = parseChapterSpanRange(targetVolume.chapterSpan, 1, 25);
  const totalVolChs = Math.max(4, span.end - span.start + 1);
  const targetUnitCount = totalVolChs <= 10 ? 2 : totalVolChs <= 20 ? 3 : totalVolChs <= 35 ? 4 : 5;

  const volOverview = allVolumes
    .map(
      (v) =>
        `${v.id === targetVolume.id ? '★[当前拆解目标] ' : ''}第${v.volumeIndex}卷《${v.title}》（${v.chapterSpan}）：${v.stageGoal || v.coreConflict}`
    )
    .join('\n');

  const usedMethods = Array.from(
    new Set(existingUnitsInOtherVolumes.map((u) => u.breakthroughMethod).filter(Boolean))
  ).slice(-8);

  return [
    {
      role: 'system',
      content: `你是精通【四层滚动拆纲法 · 第3步：L3 剧情单元纲精密拆解】的总策划师。
你必须严格以【L1 总纲】与【L2 全书分卷蓝图】为上位依据，专门为 **第 ${targetVolume.volumeIndex} 卷《${targetVolume.title}》（${targetVolume.chapterSpan}）** 拆解出完整覆盖该卷起止章号（第${span.start}章 ~ 第${span.end}章）的 ${targetUnitCount} 个前后咬合的【L3 剧情单元】。

【L3 防跑偏铁律】
1. 所有单元的 chapterSpan 必须从 第${span.start}章 严丝合缝衔接到 第${span.end}章，完整覆盖本卷头尾，不得遗漏本卷后半段及卷末大高潮！
2. 每个单元必须写明【围绕本卷目标不跑偏锚点 (volumeAlignment)】——清晰说明本单元结束后，如何把“入卷起点状态”推向“出卷终点状态”。
3. **破局手段去同质化**：相邻单元的 breakthroughMethod 必须截然不同（如：情报换位设局 / 利用规则漏洞 / 关键底牌爆发 / 借敌制敌 / 关系破冰联手），避免套路重复。${
        usedMethods.length > 0 ? `前序单元已用过：${usedMethods.join('、')}，请尽量换新破局法。` : ''
      }
4. 仅做 L3 单元拆解，不要擅自改写 L1 或其他分卷；单元内涉及的核心人物/道具名称自然标注即可。${
        xpEnabled ? '\n5. 保持本书 XP 情感/张力推进基调。' : ''
      }

直接输出纯 JSON 对象：
{
  "units": [
    {
      "unitIndex": ${startingUnitIndex},
      "title": "单元标题（不含第X单元前缀）",
      "chapterSpan": "第${span.start}章 - 第...",
      "volumeAlignment": "围绕第${targetVolume.volumeIndex}卷阶段目标不跑偏锚点",
      "coreConflict": "单元核心危机与反派阻力",
      "payoffEvent": "单元高潮事件与情绪/爽点兑现",
      "breakthroughMethod": "独特的破局手段标签",
      "involvedHints": ["核心涉及角色名或道具/伏笔提示词"]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》
【L1 总纲终局基准】：${masterOutlineSpec.ultimateEnding || '见大纲'} | 主线：${masterOutlineSpec.mainPlotline || outline.slice(0, 400)} | 暗线：${masterOutlineSpec.darkPlotline || ''}

【L2 全书分卷全局位置】：
${volOverview}

【当前待拆解目标分卷详情 · 第 ${targetVolume.volumeIndex} 卷《${targetVolume.title}》】：
- 章节跨度：${targetVolume.chapterSpan}（第${span.start}章 至 第${span.end}章）
- 阶段核心目标：${targetVolume.stageGoal || targetVolume.coreConflict}
- 入卷起点状态：${targetVolume.entryState || '见前卷收官'}
- 出卷终点状态：${targetVolume.exitState || targetVolume.climaxGoal}
- 核心矛盾：${targetVolume.coreConflict}
- 卷末大高潮落点：${targetVolume.climaxGoal}
- 节点转折：${targetVolume.turningPoints || '入局→中点惊变→卷末高潮'}`,
    },
  ];
}

export function parseL3UnitsForVolumeResponse(
  raw: string,
  targetVolume: NovelVolumePlanItem,
  startingUnitIndex: number,
  existingChars: NovelCharacterRelationNode[] = [],
  existingItems: NovelKeyItem[] = [],
  existingForeshadows: NovelForeshadowItem[] = []
): NovelStoryUnitItem[] {
  const parsed = repairAndParseJson<any>(raw);
  const rawUnits = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.units)
    ? parsed.units
    : Array.isArray(parsed?.storyUnits)
    ? parsed.storyUnits
    : [];
  if (rawUnits.length === 0) {
    throw new Error(`第${targetVolume.volumeIndex}卷 L3 单元生成未返回有效 JSON 数组，请重试`);
  }

  return rawUnits.map((u: any, idx: number) => {
    const title = String(u.title || `第${startingUnitIndex + idx}单元`)
      .replace(/^第[一二三四五六七八九十百\d]+(?:剧情)?单元[：:\s·]*/u, '')
      .trim();
    const bodyText = `${title} ${u.volumeAlignment || ''} ${u.coreConflict || ''} ${u.payoffEvent || ''} ${(u.involvedHints || []).join(' ')}`;

    return {
      id: generateUUID(),
      volumeId: targetVolume.id,
      unitIndex: startingUnitIndex + idx,
      title,
      chapterSpan: String(u.chapterSpan || targetVolume.chapterSpan).trim(),
      volumeAlignment: String(u.volumeAlignment || '').trim(),
      coreConflict: String(u.coreConflict || '').trim(),
      payoffEvent: String(u.payoffEvent || '').trim(),
      breakthroughMethod: String(u.breakthroughMethod || '').trim(),
      linkedCharacterIds: existingChars
        .filter((c) => c.name.trim().length >= 2 && bodyText.includes(c.name.trim()))
        .map((c) => c.id),
      linkedItemIds: existingItems
        .filter((it) => it.name.trim().length >= 2 && bodyText.includes(it.name.trim()))
        .map((it) => it.id),
      linkedForeshadowIds: existingForeshadows
        .filter((f) => f.name.trim().length >= 2 && bodyText.includes(f.name.trim()))
        .map((f) => f.id),
    };
  });
}

/**
 * Step 5 (Runs automatically AFTER L4 chapters are generated, or manually from Entity Graph tab):
 * Extracts/updates Characters, Key Items, Foreshadows from L1~L4, binds them directly into L3 Units & L4 Chapters,
 * and syncs Character Cards to Lorebook 2.0!
 */
export function buildSyncEntitiesFromFourLayersMessages(params: {
  bookTitle: string;
  charactersText: string;
  worldText: string;
  masterOutlineSpec: MasterOutlineSpec;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  existingCharacters: NovelCharacterRelationNode[];
  existingItems: NovelKeyItem[];
  existingForeshadows: NovelForeshadowItem[];
  xpEnabled: boolean;
}): Message[] {
  const {
    bookTitle,
    charactersText,
    worldText,
    masterOutlineSpec,
    volumePlan,
    storyUnits,
    chapterOutlines,
    existingCharacters,
    existingItems,
    existingForeshadows,
    xpEnabled,
  } = params;

  const chSummaries = [...chapterOutlines]
    .sort((a, b) => a.chapterIndex - b.chapterIndex)
    .slice(0, 40)
    .map(
      (c) =>
        `第${c.chapterIndex}章《${c.title}》：目标[${c.protagonistGoal || '-'}] 阻力[${c.coreObstacle || '-'}] 梗概[${c.summary}] 钩子[${c.hookNote || '-'}]`
    )
    .join('\n');

  const unitSummaries = storyUnits
    .map((u) => `单元${u.unitIndex}《${u.title}》(${u.chapterSpan})：冲突[${u.coreConflict}] 兑现[${u.payoffEvent}]`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是精通【角色/道具/伏笔全链路关联架构】的小说设定总监。
现在 L1 总纲、L2 分卷、L3 单元及 L4 单章细纲均已就绪，请你通读上述四层结构与人设档案，自动梳理并输出完整、互斥无重名的【角色知情权图谱】【关键道具流转库】【长线伏笔账本】，并**精确标出每条设定分别关联到哪些 L3 单元编号和 L4 单章章号**！

【梳理要求】
1. 已有角色/道具/伏笔务必保留核心设定并补全缺失字段（特别是角色知情权隔离边界 epistemicBoundary、声纹口癖 speechStyle、道具规则代价 rulesAndCost），新增在本批 L4 细纲中新登场的关键配角、关键道具与草蛇灰线伏笔。
2. 严禁虚构不存在的章节号，linkedChapterIndices 必须是实际出现或埋设/回收该要素的真实章号数组。${
        xpEnabled ? '\n3. 保留角色关系张力与情感纠葛深度。' : ''
      }

直接输出纯 JSON 对象：
{
  "characters": [
    {
      "name": "角色名",
      "roleType": "主角 | 核心主配/CP | 重要配角 | 阶段反派 | 幕后反派",
      "coreDesire": "核心欲望与行动动机",
      "speechStyle": "说话口癖、句长节奏与潜台词习惯",
      "epistemicBoundary": "当前知情权边界（明确知道什么、绝对不知晓什么幕后信息）",
      "currentStatus": "当前位置/伤势/立场状态",
      "debutChapter": 1,
      "relations": [{ "targetName": "另一角色名", "relation": "动态关系描述" }],
      "linkedChapterIndices": [1, 2, 3],
      "linkedUnitIndices": [1]
    }
  ],
  "keyItems": [
    {
      "name": "关键道具/信物/契约名称",
      "category": "核心信物 | 杀器 | 功法秘籍 | 关键线索",
      "holderName": "当前持有者姓名或存放点",
      "originChapter": 1,
      "rulesAndCost": "功能机制与硬性使用代价限制",
      "status": "未现世 | 主角持有 | 他人持有 | 争夺遗失 | 已消耗损毁",
      "linkedChapterIndices": [1, 4],
      "linkedUnitIndices": [1]
    }
  ],
  "foreshadows": [
    {
      "name": "伏笔名称",
      "plantedChapter": 1,
      "expectedResolveChapter": "第18章",
      "status": "planted | fermenting | resolved",
      "note": "埋设线索细节与后续反转揭晓设计",
      "linkedCharacterNames": ["角色名"],
      "linkedItemNames": ["道具名"],
      "linkedChapterIndices": [1, 5],
      "linkedUnitIndices": [1]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》
【L1 终局与暗线】：终局=${masterOutlineSpec.ultimateEnding || '待定'} | 暗线=${masterOutlineSpec.darkPlotline || '见细纲'}
【L2 分卷】：${volumePlan.map((v) => `第${v.volumeIndex}卷《${v.title}》(${v.chapterSpan})`).join('；')}
【L3 单元纲】：
${unitSummaries || '暂无'}
【L4 单章细纲】：
${chSummaries || '暂无'}
【人物与世界观参考】：
${charactersText.slice(0, 1000)}
${worldText.slice(0, 600)}
【已有关联库节点（请继承并补全）】：
已有角色：${existingCharacters.map((c) => c.name).join('、') || '无'}
已有道具：${existingItems.map((i) => i.name).join('、') || '无'}
已有伏笔：${existingForeshadows.map((f) => f.name).join('、') || '无'}`,
    },
  ];
}

export function applySyncedEntitiesToSettings(params: {
  rawJson: string;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  existingCharacters: NovelCharacterRelationNode[];
  existingItems: NovelKeyItem[];
  existingForeshadows: NovelForeshadowItem[];
  existingLorebook: LorebookEntry[];
}): {
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
  storyUnits: NovelStoryUnitItem[];
  chapterOutlines: NovelChapterOutlineItem[];
  lorebook: LorebookEntry[];
  summaryText: string;
} {
  const parsed = repairAndParseJson<any>(params.rawJson);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('关联图谱提取未返回有效 JSON');
  }

  // Merge Characters non-destructively (keep existing IDs by name)
  const charByName = new Map(params.existingCharacters.map((c) => [c.name.trim(), { ...c }]));
  const charChapterBindings = new Map<string, Set<number>>();
  const charUnitBindings = new Map<string, Set<number>>();

  if (Array.isArray(parsed.characters)) {
    for (const rc of parsed.characters) {
      const name = String(rc?.name || '').trim();
      if (!name) continue;
      const prev = charByName.get(name);
      const id = prev?.id || generateUUID();
      const validRole = ['主角', '核心主配/CP', '重要配角', '阶段反派', '幕后反派'].includes(rc.roleType)
        ? rc.roleType
        : prev?.roleType || '重要配角';
      charByName.set(name, {
        id,
        name,
        roleType: validRole as NovelCharacterRelationNode['roleType'],
        coreDesire: String(rc.coreDesire || prev?.coreDesire || '').trim(),
        speechStyle: String(rc.speechStyle || prev?.speechStyle || '').trim(),
        epistemicBoundary: String(rc.epistemicBoundary || prev?.epistemicBoundary || '').trim(),
        currentStatus: String(rc.currentStatus || prev?.currentStatus || '正常').trim(),
        debutChapter: Number(rc.debutChapter) || prev?.debutChapter || 1,
        relations: Array.isArray(rc.relations) && rc.relations.length > 0
          ? rc.relations.map((r: any) => ({
              targetName: String(r.targetName || ''),
              relation: String(r.relation || ''),
            }))
          : prev?.relations || [],
        lorebookId: prev?.lorebookId,
      });

      if (Array.isArray(rc.linkedChapterIndices)) {
        charChapterBindings.set(id, new Set(rc.linkedChapterIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
      if (Array.isArray(rc.linkedUnitIndices)) {
        charUnitBindings.set(id, new Set(rc.linkedUnitIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
    }
  }
  const mergedChars = Array.from(charByName.values());
  const charNameToId = new Map(mergedChars.map((c) => [c.name.trim(), c.id]));

  // Merge Key Items
  const itemByName = new Map(params.existingItems.map((i) => [i.name.trim(), { ...i }]));
  const itemChapterBindings = new Map<string, Set<number>>();
  const itemUnitBindings = new Map<string, Set<number>>();

  if (Array.isArray(parsed.keyItems)) {
    for (const ri of parsed.keyItems) {
      const name = String(ri?.name || '').trim();
      if (!name) continue;
      const prev = itemByName.get(name);
      const id = prev?.id || generateUUID();
      const holderName = String(ri.holderName || prev?.holderName || '未知').trim();
      itemByName.set(name, {
        id,
        name,
        category: String(ri.category || prev?.category || '关键道具').trim(),
        holderName,
        holderCharacterId: charNameToId.get(holderName) || prev?.holderCharacterId,
        originChapter: Number(ri.originChapter) || prev?.originChapter || 1,
        rulesAndCost: String(ri.rulesAndCost || prev?.rulesAndCost || '').trim(),
        status: (['未现世', '主角持有', '他人持有', '争夺遗失', '已消耗损毁'].includes(ri.status)
          ? ri.status
          : prev?.status || '主角持有') as NovelKeyItem['status'],
        milestoneNote: prev?.milestoneNote,
        linkedForeshadowIds: prev?.linkedForeshadowIds,
      });

      if (Array.isArray(ri.linkedChapterIndices)) {
        itemChapterBindings.set(id, new Set(ri.linkedChapterIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
      if (Array.isArray(ri.linkedUnitIndices)) {
        itemUnitBindings.set(id, new Set(ri.linkedUnitIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
    }
  }
  const mergedItems = Array.from(itemByName.values());
  const itemNameToId = new Map(mergedItems.map((i) => [i.name.trim(), i.id]));

  // Merge Foreshadows
  const fsByName = new Map(params.existingForeshadows.map((f) => [f.name.trim(), { ...f }]));
  const fsChapterBindings = new Map<string, Set<number>>();
  const fsUnitBindings = new Map<string, Set<number>>();

  if (Array.isArray(parsed.foreshadows)) {
    for (const rf of parsed.foreshadows) {
      const name = String(rf?.name || '').trim();
      if (!name) continue;
      const prev = fsByName.get(name);
      const id = prev?.id || generateUUID();
      const cIds = Array.isArray(rf.linkedCharacterNames)
        ? (rf.linkedCharacterNames.map((n: string) => charNameToId.get(String(n).trim())).filter(Boolean) as string[])
        : prev?.linkedCharacterIds || [];
      const iIds = Array.isArray(rf.linkedItemNames)
        ? (rf.linkedItemNames.map((n: string) => itemNameToId.get(String(n).trim())).filter(Boolean) as string[])
        : prev?.linkedItemIds || [];

      fsByName.set(name, {
        id,
        name,
        plantedChapter: Number(rf.plantedChapter) || prev?.plantedChapter || 1,
        expectedResolveChapter: String(rf.expectedResolveChapter || prev?.expectedResolveChapter || '').trim() || undefined,
        status: rf.status === 'fermenting' || rf.status === 'resolved' ? rf.status : prev?.status || 'planted',
        note: String(rf.note || prev?.note || '').trim(),
        linkedCharacterIds: Array.from(new Set([...(prev?.linkedCharacterIds || []), ...cIds])),
        linkedItemIds: Array.from(new Set([...(prev?.linkedItemIds || []), ...iIds])),
      });

      if (Array.isArray(rf.linkedChapterIndices)) {
        fsChapterBindings.set(id, new Set(rf.linkedChapterIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
      if (Array.isArray(rf.linkedUnitIndices)) {
        fsUnitBindings.set(id, new Set(rf.linkedUnitIndices.map((n: any) => Number(n)).filter(Boolean)));
      }
    }
  }
  const mergedFs = Array.from(fsByName.values());

  // Apply explicit index bindings onto Units and Chapters before running full deterministic text cascade
  const preBoundUnits = params.storyUnits.map((u) => {
    const cSet = new Set(u.linkedCharacterIds || []);
    const iSet = new Set(u.linkedItemIds || []);
    const fSet = new Set(u.linkedForeshadowIds || []);
    charUnitBindings.forEach((set, id) => {
      if (set.has(u.unitIndex)) cSet.add(id);
    });
    itemUnitBindings.forEach((set, id) => {
      if (set.has(u.unitIndex)) iSet.add(id);
    });
    fsUnitBindings.forEach((set, id) => {
      if (set.has(u.unitIndex)) fSet.add(id);
    });
    return {
      ...u,
      linkedCharacterIds: Array.from(cSet),
      linkedItemIds: Array.from(iSet),
      linkedForeshadowIds: Array.from(fSet),
    };
  });

  const preBoundChapters = params.chapterOutlines.map((ch) => {
    const cSet = new Set(ch.linkedCharacterIds || []);
    const iSet = new Set(ch.linkedItemIds || []);
    const fSet = new Set(ch.linkedForeshadowIds || []);
    charChapterBindings.forEach((set, id) => {
      if (set.has(ch.chapterIndex)) cSet.add(id);
    });
    itemChapterBindings.forEach((set, id) => {
      if (set.has(ch.chapterIndex)) iSet.add(id);
    });
    fsChapterBindings.forEach((set, id) => {
      if (set.has(ch.chapterIndex)) fSet.add(id);
    });
    return {
      ...ch,
      linkedCharacterIds: Array.from(cSet),
      linkedItemIds: Array.from(iSet),
      linkedForeshadowIds: Array.from(fSet),
    };
  });

  const cascaded = autoLinkEntitiesAndCascadeTopology({
    volumePlan: params.volumePlan,
    storyUnits: preBoundUnits,
    chapterOutlines: preBoundChapters,
    characterGraph: mergedChars,
    keyItemRegistry: mergedItems,
    foreshadowLedger: mergedFs,
    lorebook: params.existingLorebook,
  });

  return {
    characterGraph: cascaded.characterGraph,
    keyItemRegistry: cascaded.keyItemRegistry,
    foreshadowLedger: cascaded.foreshadowLedger,
    storyUnits: cascaded.storyUnits,
    chapterOutlines: cascaded.chapterOutlines,
    lorebook: cascaded.lorebook,
    summaryText: `关联库已自动同步并挂载：角色 ${cascaded.characterGraph.length} 名、关键道具 ${cascaded.keyItemRegistry.length} 件、伏笔 ${cascaded.foreshadowLedger.length} 条，世界书与单章/单元锚点全部贯通！`,
  };
}

/**
 * Targeted Cascade AI Sync when user edits upstream (e.g. L1 changed -> sync L2; L2/Entity changed -> sync affected L3/L4).
 */
export function buildCascadeSyncTargetChaptersMessages(params: {
  bookTitle: string;
  masterOutlineSpec: MasterOutlineSpec;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  targetChapters: NovelChapterOutlineItem[];
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
  changeReason: string;
}): Message[] {
  const unitMap = new Map(params.storyUnits.map((u) => [u.id, u]));
  const volMap = new Map(params.volumePlan.map((v) => [v.id, v]));

  const chList = params.targetChapters
    .slice(0, 16)
    .map((c) => {
      const u = c.unitId ? unitMap.get(c.unitId) : undefined;
      const v = c.volumeId ? volMap.get(c.volumeId) : undefined;
      return `[id=${c.id}] 第${c.chapterIndex}章《${c.title}》(卷:${v?.title || '-'} / 单元:${u?.title || '-'})
  当前梗概:${c.summary} | 目标:${c.protagonistGoal || '-'} | 阻力:${c.coreObstacle || '-'} | 钩子:${c.hookNote || '-'}`;
    })
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是执行【四层拆纲变更联动校准】的总架构师。
上游设定发生了变更，请在不推翻核心主线与已写章的前提下，对受影响的未写单章细纲进行针对性协同微调，使【L1终局 ↔ L2分卷 ↔ L3单元 ↔ L4单章 ↔ 角色知情权/道具状态/伏笔】恢复 100% 一致！

严格输出纯 JSON 对象：
{
  "syncNote": "1~2句话说明联动修改点",
  "patchedChapters": [
    {
      "id": "原章节id",
      "title": "校准后章节标题（不带第X章前缀）",
      "protagonistGoal": "校准后的主角目标",
      "coreObstacle": "校准后的核心阻力",
      "stateDelta": "校准后的单章推进增量",
      "summary": "校准后的2~3句梗概",
      "hookNote": "校准后的章末钩子"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${params.bookTitle}》
【本次上游变更原因】：${params.changeReason}
【L1 总纲】：终局=${params.masterOutlineSpec.ultimateEnding} | 主线=${params.masterOutlineSpec.mainPlotline}
【关联角色边界】：${params.characterGraph.map((c) => `${c.name}(状态:${c.currentStatus}|知情:${c.epistemicBoundary})`).join('；')}
【关联道具状态】：${params.keyItemRegistry.map((i) => `${i.name}(${i.status}|持有:${i.holderName})`).join('；')}
【待校准受影响 L4 单章】：
${chList}`,
    },
  ];
}

// ============================================================================
// 一键执行【AI 平台总编签约过稿诊断审阅】全链路修订流水线（3 阶段稳定不截断）
// ============================================================================

export function buildApplySigningReviewCoreMessages(params: {
  bookTitle: string;
  targetPlatform: string;
  signingReviewReport: string;
  userSupplement?: string;
  outline: string;
  characters: string;
  world: string;
  commercialBlurb: string;
  systemSettings: Record<string, string[]>;
  masterOutlineSpec: MasterOutlineSpec;
  chapterWords?: number | string;
  xpEnabled: boolean;
  xpSummary?: string;
}): Message[] {
  const scaleHint = extractScaleRequirementHint(params.outline, params.systemSettings, params.chapterWords);
  const compactSchema = buildCompactSchemaGuideForAI();
  const formattedMatrix = formatNovelSystemSettingsForPrompt(params.systemSettings);

  return [
    {
      role: 'system',
      content: `你是【${params.targetPlatform}】资深签约主编兼首席网文重修架构师。
刚刚已对作品出具了【签约过稿诊断审稿意见】，现在作者点击了「一键按主编审稿意见全面重构完善」！
你的任务是**直接落地执行审稿意见中的每一条核心修改建议**，全面升级第 1 阶段资产：
1. 书名/备选高点击书名 (alternateTitles) 与 黄金 300 字商业简介 (commercialBlurb)；
2. 主线故事大纲 (improvedOutline)、主要角色人设 (characters)、世界观规则 (worldView)；
3. 11 大系统架构设定微调 (systemSettingsPatches，仅输出需要调整或补充的字段)；
4. 四层拆纲 · L1 总纲与最终结局锚点 (masterOutlineSpec)。

【硬性纪律】
- ${scaleHint.promptConstraint}
- 所有字符串内引语务必使用中文引号“……”或单引号，禁止英文半角双引号破坏 JSON。${
        params.xpEnabled && params.xpSummary
          ? `\n- 本书已开启 XP 审美基底，保留该张力内核：${params.xpSummary.slice(0, 300)}`
          : '\n- 本书已关闭个人 XP，严格按纯大众商业过稿标准优化。'
      }

直接输出纯 JSON 对象：
{
  "suggestedTitle": "若原书名吸量度不足可优化建议主书名，否则保留原书名",
  "alternateTitles": ["高点击备选书名1", "备选书名2", "备选书名3", "备选书名4"],
  "commercialBlurb": "按审稿意见重构后的黄金商业简介（250-350字）",
  "improvedOutline": "按审稿意见彻底修复毒点、强化黄金三章与冲突钩子后的完整主线大纲",
  "characters": "重构强化辨识度与反差动机后的主要角色档案",
  "worldView": "补全自洽漏洞与代价约束后的世界观法则",
  "systemSettingsPatches": {
    "foundation.opening_hook_style": ["..."]
  },
  "masterOutlineSpec": {
    "corePromise": "核心读者契约",
    "ultimateEnding": "最终结局锚点",
    "worldCeiling": "战力/规则天花板",
    "mainPlotline": "主线脉络",
    "emotionalOrSubPlotline": "感情/副线脉络",
    "darkPlotline": "幕后暗线"
  }
}`,
    },
    {
      role: 'user',
      content: `原书名：《${params.bookTitle}》 | 目标平台：${params.targetPlatform}
【★ 主编签约过稿诊断审阅意见（必须逐条落实解决）】：
${params.signingReviewReport}
${params.userSupplement?.trim() ? `\n【作者补充修改指令】：\n${params.userSupplement.trim()}\n` : ''}
【当前商业简介】：${params.commercialBlurb || '无'}
【当前故事大纲】：
${params.outline}
【当前角色设定】：
${params.characters}
【当前世界观】：
${params.world}
【当前 L1 总纲】：
终局：${params.masterOutlineSpec.ultimateEnding || '待补充'} | 主线：${params.masterOutlineSpec.mainPlotline || '待补充'}
【当前已选11大模块核心摘要】：
${formattedMatrix || '尚无'}
【11大模块字段参考】：
${compactSchema}`,
    },
  ];
}

export function buildApplySigningReviewL2L3Messages(params: {
  bookTitle: string;
  targetPlatform: string;
  signingReviewReport: string;
  userSupplement?: string;
  improvedOutline: string;
  masterOutlineSpec: MasterOutlineSpec;
  systemSettings: Record<string, string[]>;
  chapterWords?: number | string;
}): Message[] {
  const scaleHint = extractScaleRequirementHint(params.improvedOutline, params.systemSettings, params.chapterWords);

  return [
    {
      role: 'system',
      content: `你是签约全案重修架构师（第 2 阶段：重构完整 L2 分卷纲 + L3 剧情单元纲）。
请根据已经按审稿意见升级的【新版大纲】与【新版 L1 总纲】，重新梳理并输出完整闭环的 L2 全书分卷与配套 L3 防跑偏剧情单元！
【铁律】：
1. ${scaleHint.promptConstraint}
2. L2 分卷必须从第1章完整规划至最后一卷落地 L1 ultimateEnding，严禁半截漏掉后半部。
3. L3 单元必须通过 volumeIndex 挂载到对应分卷，覆盖前核心开局卷及各卷核心段落，且相邻单元破局手段绝不重复。

输出纯 JSON 对象：
{
  "volumes": [
    {
      "volumeIndex": 1,
      "title": "卷名",
      "chapterSpan": "第1章 - 第25章",
      "stageGoal": "本卷阶段核心目标",
      "entryState": "入卷起点状态",
      "exitState": "出卷终点跃迁状态",
      "turningPoints": "1/4入局 · 中点惊变 · 3/4反扑",
      "coreConflict": "核心冲突",
      "climaxGoal": "卷末高潮落点"
    }
  ],
  "units": [
    {
      "volumeIndex": 1,
      "unitIndex": 1,
      "title": "单元标题",
      "chapterSpan": "第1章 - 第6章",
      "volumeAlignment": "围绕所属分卷目标不跑偏锚点",
      "coreConflict": "单元核心冲突",
      "payoffEvent": "高潮爽点兑现",
      "breakthroughMethod": "独特破局手段"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${params.bookTitle}》 | 平台：${params.targetPlatform}
【审稿核心痛点参考】：
${params.signingReviewReport.slice(0, 1500)}
${params.userSupplement?.trim() ? `【作者补充指令】：${params.userSupplement.trim()}\n` : ''}
【已升级版 L1 总纲】：
- 契约：${params.masterOutlineSpec.corePromise}
- 终局：${params.masterOutlineSpec.ultimateEnding}
- 天花板：${params.masterOutlineSpec.worldCeiling}
- 主线：${params.masterOutlineSpec.mainPlotline}
- 暗线：${params.masterOutlineSpec.darkPlotline}
【已升级版大纲】：
${params.improvedOutline}`,
    },
  ];
}

export function buildApplySigningReviewL4AndGraphMessages(params: {
  bookTitle: string;
  targetPlatform: string;
  signingReviewReport: string;
  userSupplement?: string;
  improvedOutline: string;
  improvedCharacters: string;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  draftedChapters: NovelChapterOutlineItem[];
  plannedChapterCountToGenerate: number;
}): Message[] {
  const startCh =
    params.draftedChapters.length > 0
      ? Math.max(...params.draftedChapters.map((c) => c.chapterIndex)) + 1
      : 1;
  const count = Math.max(6, Math.min(18, params.plannedChapterCountToGenerate));

  return [
    {
      role: 'system',
      content: `你是签约全案重修架构师（第 3 阶段：重构开局/待写 L4 单章细纲 + 全要素关联图谱）。
请严格落地主编审稿意见（特别是黄金三章开局、情绪钩子与设定自洽建议）：
1. 为从第 ${startCh} 章起的 ${count} 章重写/新建高留存 L4 单章细纲（必须包含主角目标、核心阻力、唯一实质增量、章末悬念钩子与松紧档位，并关联对应的 volumeIndex 与 unitIndex）。
2. 构建完整的【角色知情权图谱】【关键道具库】与【伏笔账本】，通过姓名精确关联到章节！

输出纯 JSON 对象：
{
  "chapters": [
    {
      "chapterIndex": ${startCh},
      "volumeIndex": 1,
      "unitIndex": 1,
      "title": "标题（不带第X章）",
      "pacingType": "推进",
      "protagonistGoal": "主角目标",
      "coreObstacle": "核心阻力",
      "stateDelta": "单章唯一实质推进增量",
      "summary": "2~3句事件梗概",
      "hookNote": "章末悬念钩子",
      "linkedCharacterNames": ["角色名"],
      "linkedItemNames": ["道具名"],
      "linkedForeshadowNames": ["伏笔名"]
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "roleType": "主角",
      "coreDesire": "核心欲望",
      "speechStyle": "声纹口癖",
      "epistemicBoundary": "知情权边界",
      "currentStatus": "开局实时状态",
      "relations": [{ "targetName": "另一角色名", "relation": "关系描述" }]
    }
  ],
  "keyItems": [
    {
      "name": "关键道具名",
      "category": "核心信物",
      "holderName": "持有者",
      "originChapter": 1,
      "rulesAndCost": "功能与限制代价",
      "status": "主角持有"
    }
  ],
  "foreshadows": [
    {
      "name": "伏笔名",
      "plantedChapter": 1,
      "expectedResolveChapter": "第20章",
      "status": "planted",
      "note": "埋设细节与反转回收方式",
      "linkedCharacterNames": ["角色名"],
      "linkedItemNames": ["道具名"]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${params.bookTitle}》 | 平台：${params.targetPlatform}
【审稿意见关键改稿清单】：
${params.signingReviewReport.slice(0, 1600)}
${params.userSupplement?.trim() ? `【作者补充指令】：${params.userSupplement.trim()}\n` : ''}
${
  params.draftedChapters.length > 0
    ? `【已成稿章节（绝对保留勿覆盖，须从第${startCh}章衔接）】：\n${params.draftedChapters
        .map((c) => `第${c.chapterIndex}章《${c.title}》:${c.stateDelta || c.summary}`)
        .join('\n')}\n`
    : ''
}
【新 L2 分卷】：
${params.volumePlan.map((v) => `第${v.volumeIndex}卷《${v.title}》(${v.chapterSpan}): ${v.stageGoal || v.coreConflict}`).join('\n')}
【新 L3 剧情单元】：
${params.storyUnits.map((u) => `单元${u.unitIndex}《${u.title}》(${u.chapterSpan}): 锚点[${u.volumeAlignment}]`).join('\n')}
【新人物档案】：
${params.improvedCharacters.slice(0, 1000)}`,
    },
  ];
}

export function parseApplySigningReviewCoreResponse(raw: string): {
  suggestedTitle?: string;
  alternateTitles: string[];
  commercialBlurb?: string;
  improvedOutline?: string;
  characters?: string;
  worldView?: string;
  systemSettingsPatches: Record<string, string[]>;
  masterOutlineSpec?: MasterOutlineSpec;
} {
  const parsed = repairAndParseJson<any>(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('签约全案第 1 阶段（大纲与总纲重修）返回非合法 JSON，请重试');
  }
  const systemSettingsPatches: Record<string, string[]> = {};
  if (parsed.systemSettingsPatches && typeof parsed.systemSettingsPatches === 'object') {
    Object.entries(parsed.systemSettingsPatches).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        const cleaned = v.map((x) => String(x || '').trim()).filter(Boolean);
        if (cleaned.length > 0) systemSettingsPatches[k] = cleaned;
      }
    });
  }
  const spec = parsed.masterOutlineSpec;
  return {
    suggestedTitle: parsed.suggestedTitle ? String(parsed.suggestedTitle).replace(/[《》]/g, '').trim() : undefined,
    alternateTitles: Array.isArray(parsed.alternateTitles)
      ? parsed.alternateTitles.map((x: any) => String(x || '').replace(/[《》]/g, '').trim()).filter(Boolean)
      : [],
    commercialBlurb: parsed.commercialBlurb ? String(parsed.commercialBlurb).trim() : undefined,
    improvedOutline: parsed.improvedOutline ? String(parsed.improvedOutline).trim() : undefined,
    characters: parsed.characters ? String(parsed.characters).trim() : undefined,
    worldView: parsed.worldView ? String(parsed.worldView).trim() : undefined,
    systemSettingsPatches,
    masterOutlineSpec:
      spec && typeof spec === 'object'
        ? {
            corePromise: String(spec.corePromise || '').trim(),
            ultimateEnding: String(spec.ultimateEnding || '').trim(),
            worldCeiling: String(spec.worldCeiling || '').trim(),
            mainPlotline: String(spec.mainPlotline || '').trim(),
            emotionalOrSubPlotline: String(spec.emotionalOrSubPlotline || '').trim(),
            darkPlotline: String(spec.darkPlotline || '').trim(),
          }
        : undefined,
  };
}

export function parseApplySigningReviewL2L3Response(raw: string): {
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
} {
  const parsed = repairAndParseJson<any>(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('签约全案第 2 阶段（分卷与单元重修）返回非合法 JSON，请重试');
  }
  const volIndexToId = new Map<number, string>();
  const volumePlan: NovelVolumePlanItem[] = (parsed.volumes || []).map((v: any, idx: number) => {
    const id = generateUUID();
    const vIdx = Number(v.volumeIndex) || idx + 1;
    volIndexToId.set(vIdx, id);
    return {
      id,
      volumeIndex: vIdx,
      title: String(v.title || `第${vIdx}卷`)
        .replace(/^第[一二三四五六七八九十百\d]+卷[：:\s·]*/u, '')
        .trim(),
      chapterSpan: String(v.chapterSpan || `第${(vIdx - 1) * 20 + 1}章 - 第${vIdx * 20}章`).trim(),
      stageGoal: String(v.stageGoal || '').trim(),
      entryState: String(v.entryState || '').trim(),
      exitState: String(v.exitState || '').trim(),
      turningPoints: String(v.turningPoints || '').trim(),
      coreConflict: String(v.coreConflict || '').trim(),
      climaxGoal: String(v.climaxGoal || '').trim(),
    };
  });

  const storyUnits: NovelStoryUnitItem[] = (parsed.units || []).map((u: any, idx: number) => {
    const vIdx = Number(u.volumeIndex) || 1;
    const uIdx = Number(u.unitIndex) || idx + 1;
    return {
      id: generateUUID(),
      volumeId: volIndexToId.get(vIdx) || volumePlan[0]?.id || '',
      unitIndex: uIdx,
      title: String(u.title || `第${uIdx}单元`)
        .replace(/^第[一二三四五六七八九十百\d]+(?:剧情)?单元[：:\s·]*/u, '')
        .trim(),
      chapterSpan: String(u.chapterSpan || '').trim(),
      volumeAlignment: String(u.volumeAlignment || '').trim(),
      coreConflict: String(u.coreConflict || '').trim(),
      payoffEvent: String(u.payoffEvent || '').trim(),
      breakthroughMethod: String(u.breakthroughMethod || '').trim(),
      linkedCharacterIds: [],
      linkedItemIds: [],
      linkedForeshadowIds: [],
    };
  });

  return { volumePlan, storyUnits };
}

export function parseApplySigningReviewL4AndGraphResponse(params: {
  raw: string;
  volumePlan: NovelVolumePlanItem[];
  storyUnits: NovelStoryUnitItem[];
  draftedChapters: NovelChapterOutlineItem[];
  existingLorebook: LorebookEntry[];
}): {
  chapterOutlines: NovelChapterOutlineItem[];
  storyUnits: NovelStoryUnitItem[];
  characterGraph: NovelCharacterRelationNode[];
  keyItemRegistry: NovelKeyItem[];
  foreshadowLedger: NovelForeshadowItem[];
  lorebook: LorebookEntry[];
} {
  const parsed = repairAndParseJson<any>(params.raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('签约全案第 3 阶段（细纲与关联库重修）返回非合法 JSON，请重试');
  }

  const seeded = parseFourLayerCascadeSeedResponse(
    JSON.stringify({
      masterOutlineSpec: {},
      volumes: [],
      units: [],
      chapters: parsed.chapters || [],
      characters: parsed.characters || [],
      keyItems: parsed.keyItems || [],
      foreshadows: parsed.foreshadows || [],
    })
  );

  // Remap generated chapters to the real new volumePlan & storyUnits IDs by volumeIndex/unitIndex or span
  const volByIdx = new Map(params.volumePlan.map((v) => [v.volumeIndex, v]));
  const unitByIdx = new Map(params.storyUnits.map((u) => [u.unitIndex, u]));

  const remappedPlanned: NovelChapterOutlineItem[] = (parsed.chapters || []).map((rawCh: any, i: number) => {
    const chObj = seeded.chapterOutlines[i];
    const vIdx = Number(rawCh.volumeIndex) || 1;
    const uIdx = Number(rawCh.unitIndex) || 1;
    const vol = volByIdx.get(vIdx) || params.volumePlan[0];
    const unit = unitByIdx.get(uIdx) || params.storyUnits[0];
    return {
      ...chObj,
      volumeId: vol?.id,
      unitId: unit?.id,
      volumeTag: vol ? `第${vol.volumeIndex}卷 · ${vol.title}` : undefined,
      status: 'planned' as const,
    };
  });

  const draftedSet = new Set(params.draftedChapters.map((c) => c.chapterIndex));
  const combinedChapters = [
    ...params.draftedChapters,
    ...remappedPlanned.filter((c) => !draftedSet.has(c.chapterIndex)),
  ].sort((a, b) => a.chapterIndex - b.chapterIndex);

  const cascaded = autoLinkEntitiesAndCascadeTopology({
    volumePlan: params.volumePlan,
    storyUnits: params.storyUnits,
    chapterOutlines: combinedChapters,
    characterGraph: seeded.characterGraph,
    keyItemRegistry: seeded.keyItemRegistry,
    foreshadowLedger: seeded.foreshadowLedger,
    lorebook: params.existingLorebook,
  });

  return {
    chapterOutlines: cascaded.chapterOutlines,
    storyUnits: cascaded.storyUnits,
    characterGraph: cascaded.characterGraph,
    keyItemRegistry: cascaded.keyItemRegistry,
    foreshadowLedger: cascaded.foreshadowLedger,
    lorebook: cascaded.lorebook,
  };
}


