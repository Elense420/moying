import {
  ApiConfig,
  Book,
  BookSettings,
  DialogueCoWriteMessage,
  LiveCharacterRuntimeSnapshot,
  LiveContinuityAlert,
  LiveContinuityCategory,
  LiveContinuityDeltaRecord,
  LiveContinuityState,
  LiveTimelineEvent,
} from '../types';
import { chatCompletion, Message } from './apiClient';
import { generateUUID } from '../utils/uuid';

export interface LiveContinuityAnalysisResult {
  storyTime: string;
  primaryLocation: string;
  summaryNote: string;
  characterUpdates: Array<{
    name: string;
    roleType?: string;
    age?: string;
    rankOrTitle?: string;
    location?: string;
    physicalState?: string;
    relationshipNote?: string;
    knownSecrets?: string;
    changeNote?: string;
  }>;
  propAndClueUpdates: Array<{
    name: string;
    action: 'planted' | 'progressed' | 'resolved' | 'held' | 'destroyed';
    holder?: string;
    note: string;
  }>;
  alerts: Array<{
    category: LiveContinuityCategory;
    severity: 'critical' | 'major' | 'minor';
    title: string;
    detail: string;
    quote?: string;
    suggestion: string;
  }>;
}

/**
 * 1. 初始化/补全作品的写中实时状态机
 */
export function ensureLiveContinuityState(book?: Book | null): LiveContinuityState {
  const existing = book?.settings?.liveContinuity;
  if (existing) {
    return {
      enabled: existing.enabled !== false,
      currentStoryTime: existing.currentStoryTime || '开篇初始时刻',
      currentPrimaryLocation: existing.currentPrimaryLocation || '故事初始舞台',
      characterSnapshots: Array.isArray(existing.characterSnapshots)
        ? existing.characterSnapshots
        : [],
      timelineLog: Array.isArray(existing.timelineLog) ? existing.timelineLog : [],
      chapterDeltas: Array.isArray(existing.chapterDeltas) ? existing.chapterDeltas : [],
      alerts: Array.isArray(existing.alerts) ? existing.alerts : [],
      lastCheckedChapter: Number(existing.lastCheckedChapter || 0),
      updatedAt: existing.updatedAt || Date.now(),
    };
  }

  // 从角色图谱预填充初始人物快照，避免写前完全空白
  const seedSnapshots: LiveCharacterRuntimeSnapshot[] = (
    book?.settings?.characterGraph || []
  ).map((node) => ({
    name: node.name,
    roleType: node.roleType,
    age: '',
    rankOrTitle: node.roleType || '',
    location: '',
    physicalState: node.currentStatus || '健康 / 初始状态',
    relationshipNote:
      node.relations?.map((r) => `${r.targetName}:${r.relation}`).join('；') || node.coreDesire || '',
    knownSecrets: node.epistemicBoundary || '',
    lastUpdatedChapter: 0,
  }));

  return {
    enabled: true,
    currentStoryTime: '开篇初始时刻',
    currentPrimaryLocation: '故事初始舞台',
    characterSnapshots: seedSnapshots,
    timelineLog: [],
    chapterDeltas: [],
    alerts: [],
    lastCheckedChapter: 0,
    updatedAt: Date.now(),
  };
}

/**
 * 2. 零 Token 本地实时确定性扫描（捕获时辰算术错乱、已毁道具复现、已死角色冒头、人称漂移等硬伤）
 */
export function scanChapterWriteTimeRisks(
  book: Book | null,
  chapterIndex: number,
  chapterText: string
): LiveContinuityAlert[] {
  if (!book || !chapterText.trim()) return [];

  const alerts: LiveContinuityAlert[] = [];
  const state = ensureLiveContinuityState(book);
  const now = Date.now();

  // Check A: 时辰与昼夜换算算术矛盾（1个时辰=2小时，1昼夜=12个时辰，48个时辰=4整天）
  const shichenMatch = chapterText.match(
    /(二十四|三十六|四十八|七十二|24|36|48|72)\s*个?时辰/
  );
  if (shichenMatch) {
    const rawNum = shichenMatch[1];
    const hoursMap: Record<string, number> = {
      二十四: 2,
      '24': 2,
      三十六: 3,
      '36': 3,
      四十八: 4,
      '48': 4,
      七十二: 6,
      '72': 6,
    };
    const actualDays = hoursMap[rawNum] || 0;
    const wrongDayRegex = /(两天|两日|两个昼夜|一昼夜|一夜|第二日|次日)/;
    if (
      actualDays >= 3 &&
      wrongDayRegex.test(
        chapterText.slice(
          Math.max(0, (shichenMatch.index || 0) - 80),
          (shichenMatch.index || 0) + 120
        )
      )
    ) {
      alerts.push({
        id: `local-shichen-${chapterIndex}-${rawNum}`,
        chapterIndex,
        category: 'timeline_math',
        severity: 'critical',
        title: `时辰与天数换算穿帮：「${shichenMatch[0]}」实为 ${actualDays} 整天`,
        detail: `古代 1 昼夜 = 12 个时辰。「${shichenMatch[0]}」等于 ${actualDays} 整天（${actualDays * 24} 小时），上下文却疑似写成了“两天/次日”，极易被读者挑刺！`,
        quote: shichenMatch[0],
        suggestion: `若实际只过了两天，请改为「二十四个时辰」或「四十八个钟头/两个昼夜」；若确为${actualDays}天，请同步校准上下文日期表述。`,
        status: 'open',
        createdAt: now,
      });
    }
  }

  // Check B: 视角人称与基础设定飘移检查
  const pov = (book.settings?.pov || '').trim();
  if (pov.includes('第一人称')) {
    const firstPersonMatches = (chapterText.match(/我/g) || []).length;
    if (chapterText.length > 300 && firstPersonMatches < 3) {
      alerts.push({
        id: `local-pov-${chapterIndex}`,
        chapterIndex,
        category: 'setting_conflict',
        severity: 'major',
        title: '视角人称疑似偏离：基础设定为「第一人称」',
        detail: `作品设定明确要求使用「${pov}」，但当前章节正文几乎未出现第一人称“我”，疑似退化成了第三人称上帝视角。`,
        suggestion: '将叙述主语统一回第一人称“我”的感官视野与限制视角。',
        status: 'open',
        createdAt: now,
      });
    }
  }

  // Check C: 已阵亡/退场角色在本章无解释复活出现
  const deadMarkers = ['已死', '身亡', '毙命', '阵亡', '下线', '咽气', '尸体', '葬身'];
  state.characterSnapshots.forEach((snap) => {
    if (!snap.name || snap.name.length < 2 || snap.lastUpdatedChapter >= chapterIndex) return;
    const isDeceased = deadMarkers.some((m) => (snap.physicalState || '').includes(m));
    if (isDeceased) {
      const idx = chapterText.indexOf(snap.name);
      if (idx !== -1) {
        const snippet = chapterText.slice(Math.max(0, idx - 25), idx + 45);
        const recallMarkers = ['回忆', '遗物', '墓', '碑', '想起', '梦中', '当年', '生前', '案卷', '死前'];
        const isJustRecall = recallMarkers.some((r) => snippet.includes(r));
        if (!isJustRecall) {
          alerts.push({
            id: `local-dead-char-${chapterIndex}-${snap.name}`,
            chapterIndex,
            category: 'character_state',
            severity: 'critical',
            title: `角色生死状态疑似穿帮：「${snap.name}」前期状态记录为「${snap.physicalState}」`,
            detail: `角色「${snap.name}」在第 ${snap.lastUpdatedChapter} 章已标记为「${snap.physicalState}」，但在本章正文中直接现身，附近未见“回忆/遗物/生前”等转场标识。`,
            quote: snippet.trim(),
            suggestion: `若为回忆或提及旧事，请明确补足“回忆/生前”提示；若为假死归来，需在本章补全脱险逻辑。`,
            status: 'open',
            createdAt: now,
          });
        }
      }
    }
  });

  // Check D: 已毁/已丢失关键道具在本章直接被使用
  (book.settings?.keyItemRegistry || []).forEach((item) => {
    if (!item.name || item.name.length < 2) return;
    if (item.status === '已消耗损毁' || item.status === '争夺遗失') {
      const idx = chapterText.indexOf(item.name);
      if (idx !== -1) {
        const snippet = chapterText.slice(Math.max(0, idx - 20), idx + 40);
        const recallMarkers = ['毁', '碎', '丢', '失窃', '寻找', '下落', '曾', '残片', '仿品', '夺'];
        if (!recallMarkers.some((r) => snippet.includes(r))) {
          alerts.push({
            id: `local-item-${chapterIndex}-${item.id}`,
            chapterIndex,
            category: 'foreshadow_prop',
            severity: 'major',
            title: `关键道具状态冲突：「${item.name}」当前记录为${item.status}`,
            detail: `道具账本显示「${item.name}」状态为「${item.status}」，但本章中疑似被直接取出或使用。`,
            quote: snippet.trim(),
            suggestion: `确认是否为仿品/残片/寻回过程，否则会与前文道具状态矛盾。`,
            status: 'open',
            createdAt: now,
          });
        }
      }
    }
  });

  return alerts;
}

/**
 * 3. 编译「写中防穿帮实时状态防火墙」，直接注入 promptEngine.ts 强制约束 AI 严禁胡编
 */
export function formatLiveContinuityPromptBlock(book?: Book | null): string {
  if (!book) return '';
  const state = ensureLiveContinuityState(book);
  if (!state.enabled) return '';

  const lines: string[] = [
    `\n\n# 写中防穿帮实时状态防火墙 (Write-Time Continuity Lock — 严禁违背以下已落盘事实)`,
    `【严禁随意编造指令】：以下状态均来自本书基础设定与前文已发生章节的硬账本，执笔或讨论剧情时必须 100% 服从，绝不允许出现年龄突跳、官职称谓错乱、死人无故复活、空间瞬移、时间算术错误或越权泄密：`,
  ];

  lines.push(`- **当前故事基准时间**：${state.currentStoryTime || '开篇阶段'}`);
  lines.push(`- **主角当前所在空间**：${state.currentPrimaryLocation || '依据上一章结尾场景'}`);

  if (book.settings?.commercialBlurb) {
    lines.push(
      `- **作品简介刚性承诺（切忌货不对板）**：${book.settings.commercialBlurb.slice(0, 320)}`
    );
  }

  if (state.characterSnapshots.length > 0) {
    lines.push(`- **在场与已出场人物实时状态账本（年龄 / 身份官职 / 伤势 / 位置 / 知情边界）**：`);
    state.characterSnapshots.slice(0, 14).forEach((c) => {
      const attrs = [
        c.age ? `年龄:${c.age}` : '',
        c.rankOrTitle ? `身份/官职:${c.rankOrTitle}` : '',
        c.physicalState ? `体况:${c.physicalState}` : '',
        c.location ? `现处:${c.location}` : '',
        c.knownSecrets ? `知情边界:${c.knownSecrets}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      lines.push(`  • ${c.name}（更新至第${c.lastUpdatedChapter}章）：${attrs || '以角色初始设定为准'}`);
    });
  }

  const openForeshadows = (book.settings?.foreshadowLedger || []).filter(
    (f) => f.status !== 'resolved'
  );
  if (openForeshadows.length > 0) {
    lines.push(`- **未回收待推进伏笔（勿遗忘或自相矛盾）**：`);
    openForeshadows.slice(0, 10).forEach((f) => {
      lines.push(
        `  • [${f.status === 'planted' ? '已埋下待推进' : '发酵推进中'}] ${f.name}（预定第${f.expectedResolveChapter || '后续'}章回收）：${f.note}`
      );
    });
  }

  const keyItems = (book.settings?.keyItemRegistry || []).slice(0, 10);
  if (keyItems.length > 0) {
    lines.push(`- **关键道具实时归属与状态**：`);
    keyItems.forEach((item) => {
      lines.push(
        `  • ${item.name}（持有者：${item.holderName || '待定'} | 状态：${item.status}）：${item.rulesAndCost}`
      );
    });
  }

  const recentTimeline = state.timelineLog.slice(-5);
  if (recentTimeline.length > 0) {
    lines.push(`- **近期章节时间线与地点轨迹**：`);
    recentTimeline.forEach((t) => {
      lines.push(`  • 第${t.chapterIndex}章 [${t.storyTimeLabel} · ${t.location}]：${t.keyEvent}`);
    });
  }

  const openAlerts = state.alerts.filter((a) => a.status === 'open');
  if (openAlerts.length > 0) {
    lines.push(`- **当前待规避/待弥合的前文隐患预警**：`);
    openAlerts.slice(0, 5).forEach((a) => {
      lines.push(`  • [第${a.chapterIndex}章 · ${a.title}]：${a.suggestion}`);
    });
  }

  lines.push(
    `\n【硬核校验法则】：1) 若角色跨城/跨院转移，必须交代行程或时间流逝；2) 古代记时务必牢记“1昼夜=12时辰”，避免“48个时辰=两天”这类算术错误；3) 本章未经历过的信息，角色绝不可提前脱口而出。`
  );

  return lines.join('\n');
}

/**
 * 4. 提取章节状态变化并执行写中实时逻辑漏洞核查（AI + 本地双轨）
 */
export async function analyzeChapterWriteTimeContinuity(params: {
  book: Book;
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  apiConfig?: ApiConfig;
  model: string;
}): Promise<LiveContinuityAnalysisResult> {
  const { book, chapterIndex, chapterTitle, chapterText, apiConfig, model } = params;
  const state = ensureLiveContinuityState(book);
  const localRisks = scanChapterWriteTimeRisks(book, chapterIndex, chapterText);

  const plannedOutline = (book.settings?.chapterOutlines || []).find(
    (c) => c.chapterIndex === chapterIndex
  );

  const systemPrompt = `你是一位以挑剔严谨著称的头部网文/出版文学连续性总审（Continuity & Logic Firewall Engine）。
你的任务是在作者**刚刚写完一章正文后立刻介入**，提取本章发生的硬性状态变更，并第一时间揪出任何“与基础设定冲突、时间算术错误、年龄/身份篡改、空间瞬移、道具伏笔矛盾、角色越权知晓未发生秘密”的逻辑硬伤。

必须严格输出合法 JSON（严禁输出 markdown 围栏以外的任何废话），结构如下：
{
  "storyTime": "本章结尾时的精确故事时间（例：建元十六年秋九月十二夜子时 / 次日清晨）",
  "primaryLocation": "本章结尾主角所处精准空间地点",
  "summaryNote": "25~45字概括本章真实发生的推进结果",
  "characterUpdates": [
    {
      "name": "人物姓名",
      "roleType": "主角/反派/配角",
      "age": "若本章明确提及或推进年龄则填（否则留空）",
      "rankOrTitle": "当前最新身份/官职/境界",
      "location": "本章末尾所在地点",
      "physicalState": "健康/受伤部位/被囚/已身亡等",
      "relationshipNote": "与主角关系或态度变化",
      "knownSecrets": "截至本章其实际知晓的情报边界",
      "changeNote": "简述本章该人物发生了什么实质改变（如：断臂、升官、得知真相、死亡）"
    }
  ],
  "propAndClueUpdates": [
    {
      "name": "关键道具或伏笔线索名",
      "action": "planted | progressed | resolved | held | destroyed",
      "holder": "当前持有者（如有）",
      "note": "埋入/推进/收回/损毁的具体说明"
    }
  ],
  "alerts": [
    {
      "category": "character_state | timeline_math | location_jump | setting_conflict | foreshadow_prop | logic_gap",
      "severity": "critical | major | minor",
      "title": "简短精准的问题标题（15~28字）",
      "detail": "具体指出哪句话和前文哪条设定/状态/时间线存在矛盾",
      "quote": "从本章原文摘录的有问题原句（15~50字）",
      "suggestion": "明确可落地的局部修改方案"
    }
  ]
}
注意：若本章完全自洽没有发现逻辑漏洞，请将 alerts 返回空数组 []，切勿为了凑数强行鸡蛋里挑骨头！`;

  const snapshotDigest =
    state.characterSnapshots.length > 0
      ? state.characterSnapshots
          .map(
            (c) =>
              `- ${c.name}：年龄=${c.age || '未知'} | 身份=${c.rankOrTitle || '未知'} | 状态=${
                c.physicalState || '正常'
              } | 位置=${c.location || '未知'} | 知情=${c.knownSecrets || '未知'}`
          )
          .join('\n')
      : book.settings?.characters || '暂无前置快照';

  const recentLogDigest =
    state.timelineLog.length > 0
      ? state.timelineLog
          .slice(-6)
          .map((t) => `- 第${t.chapterIndex}章 [${t.storyTimeLabel} · ${t.location}]：${t.keyEvent}`)
          .join('\n')
      : '尚无前置时间线记录';

  const foreshadowDigest = (book.settings?.foreshadowLedger || [])
    .slice(0, 12)
    .map((f) => `- [${f.status}] ${f.name}：${f.note}（拟第${f.expectedResolveChapter || '后续'}章收）`)
    .join('\n');

  const itemDigest = (book.settings?.keyItemRegistry || [])
    .slice(0, 12)
    .map((i) => `- [${i.status}] ${i.name}（持有者:${i.holderName}）：${i.rulesAndCost}`)
    .join('\n');

  const userPrompt = `【作品基础档案】
- 书名：《${book.title}》
- 题材/视角/时序：${book.settings?.genre || ''} | ${book.settings?.pov || ''} | ${book.settings?.tense || ''}
- 核心设定与世界规则：${(book.settings?.world || '').slice(0, 800)}
- 商业简介承诺：${(book.settings?.commercialBlurb || '').slice(0, 400)}

【截至上一章的实时状态基线】
- 当前故事时间：${state.currentStoryTime}
- 主角上一章结尾位置：${state.currentPrimaryLocation}
- 人物实时快照：
${snapshotDigest}
- 近期时间线轨迹：
${recentLogDigest}
- 伏笔账本：
${foreshadowDigest || '暂无'}
- 关键道具账本：
${itemDigest || '暂无'}

${
  plannedOutline
    ? `【本章既定 L4 细纲对照】\n标题：${plannedOutline.title}\n摘要：${plannedOutline.summary}\n`
    : ''
}
【待核查的第 ${chapterIndex} 章《${chapterTitle}》完整正文】：
${chapterText.slice(0, 9500)}`;

  const res = await chatCompletion({
    provider: apiConfig?.provider,
    baseUrl: apiConfig?.baseUrl,
    apiKey: apiConfig?.apiKey,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });

  const parsed = safeParseJsonObject<Partial<LiveContinuityAnalysisResult>>(res.content || '');

  const aiAlerts = Array.isArray(parsed?.alerts)
    ? parsed.alerts.filter((a) => a && a.title && a.detail)
    : [];

  // Merge deterministic local checks into alerts if not duplicated
  const combinedAlerts: LiveContinuityAnalysisResult['alerts'] = [...aiAlerts];
  localRisks.forEach((lr) => {
    const exists = combinedAlerts.some(
      (aa) => aa.category === lr.category && (aa.title === lr.title || (lr.quote && aa.quote === lr.quote))
    );
    if (!exists) {
      combinedAlerts.push({
        category: lr.category,
        severity: lr.severity,
        title: lr.title,
        detail: lr.detail,
        quote: lr.quote,
        suggestion: lr.suggestion,
      });
    }
  });

  return {
    storyTime: parsed?.storyTime?.trim() || state.currentStoryTime || `第${chapterIndex}章时间点`,
    primaryLocation: parsed?.primaryLocation?.trim() || state.currentPrimaryLocation || '未明确',
    summaryNote: parsed?.summaryNote?.trim() || `完成第 ${chapterIndex} 章推进`,
    characterUpdates: Array.isArray(parsed?.characterUpdates) ? parsed.characterUpdates : [],
    propAndClueUpdates: Array.isArray(parsed?.propAndClueUpdates) ? parsed.propAndClueUpdates : [],
    alerts: combinedAlerts,
  };
}

/**
 * 5. 将核查分析结果合并写回 BookSettings（不覆盖未修改的旧字段，且同步更新关键道具/伏笔账本状态）
 */
export function applyLiveContinuityAnalysisToSettings(
  book: Book,
  chapterIndex: number,
  analysis: LiveContinuityAnalysisResult
): BookSettings {
  const prevState = ensureLiveContinuityState(book);
  const now = Date.now();

  // 更新角色快照
  const snapshotMap = new Map<string, LiveCharacterRuntimeSnapshot>();
  prevState.characterSnapshots.forEach((s) => {
    if (s.name) snapshotMap.set(s.name, { ...s });
  });

  const characterChangeLines: string[] = [];
  analysis.characterUpdates.forEach((upd) => {
    const cleanName = (upd.name || '').trim();
    if (!cleanName) return;
    const old = snapshotMap.get(cleanName);
    const merged: LiveCharacterRuntimeSnapshot = {
      name: cleanName,
      roleType: upd.roleType || old?.roleType || '角色',
      age: upd.age || old?.age || '',
      rankOrTitle: upd.rankOrTitle || old?.rankOrTitle || '',
      location: upd.location || old?.location || '',
      physicalState: upd.physicalState || old?.physicalState || '正常',
      relationshipNote: upd.relationshipNote || old?.relationshipNote || '',
      knownSecrets: upd.knownSecrets || old?.knownSecrets || '',
      lastUpdatedChapter: chapterIndex,
    };
    snapshotMap.set(cleanName, merged);
    if (upd.changeNote) {
      characterChangeLines.push(`${cleanName}：${upd.changeNote}`);
    } else if (upd.physicalState || upd.location || upd.rankOrTitle) {
      characterChangeLines.push(
        `${cleanName}（${[upd.rankOrTitle, upd.physicalState, upd.location].filter(Boolean).join(' / ')}）`
      );
    }
  });

  // 更新时间线日志（同一章覆盖更新）
  const nextTimeline: LiveTimelineEvent[] = prevState.timelineLog.filter(
    (t) => t.chapterIndex !== chapterIndex
  );
  nextTimeline.push({
    id: generateUUID(),
    chapterIndex,
    storyTimeLabel: analysis.storyTime,
    location: analysis.primaryLocation,
    keyEvent: analysis.summaryNote,
  });
  nextTimeline.sort((a, b) => a.chapterIndex - b.chapterIndex);

  // 更新伏笔与道具变更记录并反向同步 keyItemRegistry / foreshadowLedger
  const propChangeLines: string[] = [];
  const nextItems = [...(book.settings?.keyItemRegistry || [])];
  const nextForeshadows = [...(book.settings?.foreshadowLedger || [])];

  analysis.propAndClueUpdates.forEach((p) => {
    const actionLabel =
      p.action === 'planted'
        ? '埋下'
        : p.action === 'progressed'
        ? '推进'
        : p.action === 'resolved'
        ? '收回'
        : p.action === 'destroyed'
        ? '损毁'
        : '持有/流转';
    propChangeLines.push(`[${actionLabel}] ${p.name}${p.holder ? `（${p.holder}）` : ''}：${p.note}`);

    const itemIdx = nextItems.findIndex(
      (i) => i.name.includes(p.name) || p.name.includes(i.name)
    );
    if (itemIdx !== -1) {
      const curr = nextItems[itemIdx];
      nextItems[itemIdx] = {
        ...curr,
        holderName: p.holder || curr.holderName,
        status:
          p.action === 'destroyed' || p.action === 'resolved'
            ? '已消耗损毁'
            : curr.status === '未现世' && (p.action === 'planted' || p.action === 'held')
            ? '他人持有'
            : curr.status,
        milestoneNote: `${curr.milestoneNote ? `${curr.milestoneNote}；` : ''}第${chapterIndex}章：${p.note}`.slice(-240),
      };
    }

    const fsIdx = nextForeshadows.findIndex(
      (f) => f.name.includes(p.name) || p.name.includes(f.name)
    );
    if (fsIdx !== -1) {
      const currFs = nextForeshadows[fsIdx];
      nextForeshadows[fsIdx] = {
        ...currFs,
        status:
          p.action === 'resolved'
            ? 'resolved'
            : p.action === 'progressed'
            ? 'fermenting'
            : p.action === 'planted'
            ? 'planted'
            : currFs.status,
        resolvedChapter: p.action === 'resolved' ? chapterIndex : currFs.resolvedChapter,
      };
    }
  });

  // 替换本章旧预警并保留其他章节的预警
  const retainedAlerts = prevState.alerts.filter((a) => a.chapterIndex !== chapterIndex);
  const newAlerts: LiveContinuityAlert[] = analysis.alerts.map((a) => ({
    id: generateUUID(),
    chapterIndex,
    category: a.category || 'logic_gap',
    severity: a.severity || 'major',
    title: a.title,
    detail: a.detail,
    quote: a.quote,
    suggestion: a.suggestion,
    status: 'open',
    createdAt: now,
  }));

  // 更新本章变更记录
  const nextDeltas: LiveContinuityDeltaRecord[] = prevState.chapterDeltas.filter(
    (d) => d.chapterIndex !== chapterIndex
  );
  nextDeltas.push({
    chapterIndex,
    storyTime: analysis.storyTime,
    currentLocation: analysis.primaryLocation,
    characterChanges: characterChangeLines,
    propAndClueChanges: propChangeLines,
    summaryNote: analysis.summaryNote,
    updatedAt: now,
  });
  nextDeltas.sort((a, b) => a.chapterIndex - b.chapterIndex);

  const nextState: LiveContinuityState = {
    enabled: prevState.enabled,
    currentStoryTime: analysis.storyTime,
    currentPrimaryLocation: analysis.primaryLocation,
    characterSnapshots: Array.from(snapshotMap.values()),
    timelineLog: nextTimeline,
    chapterDeltas: nextDeltas,
    alerts: [...newAlerts, ...retainedAlerts],
    lastCheckedChapter: Math.max(prevState.lastCheckedChapter, chapterIndex),
    updatedAt: now,
  };

  return {
    ...book.settings,
    keyItemRegistry: nextItems,
    foreshadowLedger: nextForeshadows,
    liveContinuity: nextState,
  };
}

/**
 * 6. 对话审校创作模式：构建强制携带设定+实时防穿帮防火墙的对话消息链
 */
export function buildDialogueCoWriteMessages(params: {
  book: Book;
  history: DialogueCoWriteMessage[];
  userMessage: string;
  activeChapterTail: string;
  nextChapterNum: number;
}): Message[] {
  const { book, history, userMessage, activeChapterTail, nextChapterNum } = params;
  const s = book.settings;
  const liveLock = formatLiveContinuityPromptBlock(book);
  const nextOutline = (s?.chapterOutlines || []).find((c) => c.chapterIndex === nextChapterNum);

  const systemPrompt = `你是一位兼具“商业网文总编审毒辣眼光”和“一线爆款主笔灵感”的 AI 创作搭档。你正在与作者以【对话共创模式】实时推演《${book.title}》第 ${nextChapterNum} 章及后续剧情。

【绝对核心工作守则 — 不许盲从拍马屁！】：
作者在对话中抛出的每一个脑洞、反转、人物反应或动作设想，你都必须先对照下方《作品全部设定与实时状态防火墙》进行**硬核合理性审校**：
1. 检查是否违背人物年龄、身份官职、伤势体况、当前所在地点（防空间瞬移）与性格人设；
2. 检查是否违背时间线与时辰算术；
3. 检查角色是否说出了他现阶段根本不知道的秘密（防越权泄密）；
4. 检查是否打脸前期简介承诺或忘掉/错误使用关键道具与伏笔。

【输出固定结构（清晰分块，便于作者一键填入导演台）】：
### 【逻辑与设定合理性核查】
（若无任何逻辑冲突，写明「核查通过：与现有设定、人物状态及时间线自洽」并一句话点出依据；**一旦发现任何不合理或穿帮风险，必须用“⚠️ 潜在穿帮预警：...”直接指出问题并给出合规修正改法！**）

### 【剧情推演与协同方案】
（结合合理性校验后的可用点子，给出 1~2 条戏剧张力最强的具体推进方案或关键对话戏码片段）

### 【可直接填入导演台的执行指令】
（用 80~160 字写一段可以直接驱动 AI 扩写第 ${nextChapterNum} 章正文的精炼剧情指令，确保不包含任何时间/人设冲突）

---
【作品核心档案】
- 书名：《${book.title}》 | 题材：${s?.genre || '通用'} | 视角：${s?.pov || '第三人称'} | 时序：${s?.tense || '顺叙'}
- 简介：${(s?.commercialBlurb || s?.outline || '').slice(0, 600)}
- 世界观：${(s?.world || '').slice(0, 700)}
- 角色档案：${(s?.characters || '').slice(0, 900)}
${
  nextOutline
    ? `- 第 ${nextChapterNum} 章预设 L4 细纲：《${nextOutline.title}》—— ${nextOutline.summary}`
    : ''
}
${liveLock}
${activeChapterTail ? `\n【上一章末尾现场】：\n${activeChapterTail.slice(-800)}` : ''}`;

  const recentHistory = history.slice(-10).map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));

  return [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: userMessage },
  ];
}

export function parseDialogueCoWriteReply(rawContent: string): {
  rationalityPassed: boolean;
  flaggedRisks: string[];
  directorDirective: string;
} {
  const clean = (rawContent || '').trim();
  const hasWarning =
    /(?:⚠️|潜在穿帮|穿帮预警|冲突|不合理|违背|矛盾|漏洞)/.test(
      clean.split('【剧情推演')[0] || clean
    ) && !/核查通过[：:]\s*与现有设定/.test(clean.split('【剧情推演')[0] || '');

  const flaggedRisks: string[] = [];
  const checkSection = clean.split(/#{1,4}\s*【剧情推演/)[0] || '';
  checkSection.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (/^(?:[-*•]|⚠️|风险|预警)/.test(t) && t.length > 8) {
      flaggedRisks.push(t.replace(/^[-*•\s]+/, ''));
    }
  });

  let directorDirective = '';
  const dirMatch = clean.match(
    /(?:#{1,4}\s*)?【可直接填入导演台的执行指令】\s*([\s\S]+)$/i
  );
  if (dirMatch?.[1]) {
    directorDirective = dirMatch[1].replace(/^[-—\s]+/, '').trim();
  }

  return {
    rationalityPassed: !hasWarning,
    flaggedRisks: flaggedRisks.slice(0, 4),
    directorDirective,
  };
}

/**
 * 7. 一键局部修复当前章节的实时逻辑预警（保长度保文风，只动出问题段落）
 */
export async function reviseChapterFromLiveAlert(params: {
  book: Book;
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  alert: LiveContinuityAlert;
  apiConfig?: ApiConfig;
  model: string;
}): Promise<string> {
  const { book, chapterIndex, chapterTitle, chapterText, alert, apiConfig, model } = params;
  const liveLock = formatLiveContinuityPromptBlock(book);

  const systemPrompt = `你是一位资深小说局部修稿专家。作者刚写完第 ${chapterIndex} 章《${chapterTitle}》，实时监测系统检出一条逻辑/设定预警。
请你在**绝对保留原有剧情走向、文风韵律、人物对话神态与完整字数规模（字数不得低于原稿的90%）**的前提下，精准修改或补充必要过渡句段，彻底修复这条隐患。
严禁输出任何解释、说明或标题前缀，直接输出修订后的完整章节正文。
${liveLock}`;

  const userPrompt = `【待修复的实时逻辑预警】：
- 问题：${alert.title}
- 详细原因：${alert.detail}
${alert.quote ? `- 问题原句定位：${alert.quote}` : ''}
- 建议改法：${alert.suggestion}

【第 ${chapterIndex} 章当前正文原文（共 ${chapterText.length} 字）】：
${chapterText}`;

  const res = await chatCompletion({
    provider: apiConfig?.provider,
    baseUrl: apiConfig?.baseUrl,
    apiKey: apiConfig?.apiKey,
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.35,
  });

  return (res.content || '').trim();
}

function safeParseJsonObject<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
