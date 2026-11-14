import {
  ApiConfig,
  Book,
  Chapter,
  ChapterFactCard,
  CoordinatedFixChapterPatch,
  CoordinatedFixPlan,
  ManuscriptAuditCategory,
  ManuscriptAuditIssue,
  ManuscriptAuditLocation,
  ManuscriptAuditReport,
  ManuscriptAuditSeverity,
} from '../types';
import { chatCompletion } from './apiClient';
import { repairAndParseJson } from './outlineJsonParser';
import { generateUUID } from '../utils/uuid';

export const AUDIT_CATEGORY_META: Record<
  ManuscriptAuditCategory,
  { label: string; shortLabel: string; description: string }
> = {
  blurb_mismatch: {
    label: '简介/大纲货不对板',
    shortLabel: '货不对板',
    description: '简介或大纲承诺的人物身份、开篇场景、核心道具或爆发节点与正文不符',
  },
  timeline_math: {
    label: '时间线矛盾与算术错乱',
    shortLabel: '时间线错乱',
    description: '死亡时间、埋骨年限、年号纪年加减、古今时辰换算（如48个时辰≠两天）等前后打架',
  },
  foreshadow_drop: {
    label: '线索伏笔未收/自相矛盾',
    shortLabel: '伏笔未收/矛盾',
    description: '前文埋下的凶手特征（如左撇子vs右手）、关键物证或支线案中途失踪或前后矛盾',
  },
  incomplete_narrative: {
    label: '叙事残缺/隐身兑现',
    shortLabel: '叙事未讲完',
    description: '嘴上说已找到铁证/密信/解药或完成关键动作，正文却未写出取出、展示与验证过程',
  },
  causality_morality: {
    label: '剧情因果与道德风险漏洞',
    shortLabel: '因果/道德漏洞',
    description: '关键死亡、夺权或反转缺失明确凶手与因果链条，导致主角背负弑君等重大道德污点',
  },
  character_backstory: {
    label: '角色身世/身份铺垫缺失',
    shortLabel: '身世铺垫不足',
    description: '双重身份、幕后掌控权或血缘隐秘缺乏“如何瞒天过海、势力为何效忠、姓氏来历”等铺垫',
  },
  contrivance_plot_armor: {
    label: '剧情过顺/降智巧合',
    shortLabel: '降智/巧合过顺',
    description: '反派亲自动手留完美证据、死士随身带私印密信、关键证人恰好猝死等工具人硬伤',
  },
  title_anachronism: {
    label: '称谓官职混乱与避讳考据硬伤',
    shortLabel: '称谓/避讳硬伤',
    description: '同一人物官职品级乱跳、杜撰错乱官制、年号/尊号与主角名重字避讳、时代器物穿帮',
  },
  epistemic_power_leak: {
    label: '认知越界(上帝视角)/战力道具账本冲突',
    shortLabel: '认知/账本冲突',
    description: '角色说出自己绝不可能得知的情报，或伤势、境界、关键道具未交接却瞬移/失效',
  },
  pacing_spatial_rupture: {
    label: '空间瞬移/关系突变/高潮断层',
    shortLabel: '时空/节奏断层',
    description: '未交代赶路却突然换城池、人物态度毫无过渡突变、核心高潮一笔带过或虎头蛇尾',
  },
};

export function normalizeAuditCategory(raw: string): ManuscriptAuditCategory {
  const s = String(raw || '').toLowerCase().trim();
  if (s in AUDIT_CATEGORY_META) return s as ManuscriptAuditCategory;
  if (s.includes('blurb') || s.includes('货不对板') || s.includes('简介')) return 'blurb_mismatch';
  if (s.includes('time') || s.includes('时间') || s.includes('年号') || s.includes('时辰')) return 'timeline_math';
  if (s.includes('foreshadow') || s.includes('伏笔') || s.includes('线索')) return 'foreshadow_drop';
  if (s.includes('incomplete') || s.includes('残缺') || s.includes('未讲完') || s.includes('证据')) return 'incomplete_narrative';
  if (s.includes('causal') || s.includes('moral') || s.includes('因果') || s.includes('道德')) return 'causality_morality';
  if (s.includes('backstory') || s.includes('身世') || s.includes('身份') || s.includes('铺垫')) return 'character_backstory';
  if (s.includes('contrivance') || s.includes('过顺') || s.includes('巧合') || s.includes('降智')) return 'contrivance_plot_armor';
  if (s.includes('title') || s.includes('anachronism') || s.includes('称谓') || s.includes('官职') || s.includes('避讳')) return 'title_anachronism';
  if (s.includes('epistemic') || s.includes('上帝') || s.includes('战力') || s.includes('道具')) return 'epistemic_power_leak';
  return 'pacing_spatial_rupture';
}

export function normalizeAuditSeverity(raw: string): ManuscriptAuditSeverity {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'critical' || s.includes('致命') || s.includes('严重') || s.includes('红') || s === 'high') {
    return 'critical';
  }
  if (s === 'minor' || s.includes('轻') || s.includes('优化') || s.includes('润色') || s.includes('蓝') || s === 'low') {
    return 'minor';
  }
  return 'major';
}

export function computeChapterTextHash(text: string): string {
  const s = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}_${(h >>> 0).toString(36)}`;
}

/**
 * 精确或模糊定位引用句段在原文中的起止下标，用于在阅读/审查视图中分色高亮
 */
export function findQuotePositionInText(
  fullText: string,
  snippet: string
): { start: number; end: number } | null {
  if (!fullText || !snippet) return null;
  const cleanSnippet = snippet.replace(/^["'「『“”]+|["'」』“”]+$/g, '').trim();
  if (cleanSnippet.length < 3) return null;

  // 1. 直接精确查找
  const directIdx = fullText.indexOf(cleanSnippet);
  if (directIdx !== -1) {
    return { start: directIdx, end: directIdx + cleanSnippet.length };
  }

  // 2. 去掉省略号拆段查找核心短句
  const subParts = cleanSnippet
    .split(/\.{2,}|…+|——|\s{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 6);

  for (const part of subParts) {
    const idx = fullText.indexOf(part);
    if (idx !== -1) {
      return { start: idx, end: idx + part.length };
    }
  }

  // 3. 剥离标点和空白做滑动锚点定位
  const strip = (str: string) => str.replace(/[\s，。！？；：“”‘’「」『』、,.!?;:'"()（）\[\]【】—…-]/g, '');
  const strippedTarget = strip(cleanSnippet);
  if (strippedTarget.length < 6) return null;

  // 映射 fullText 非标点字符回原始下标
  const mapIndices: number[] = [];
  let strippedFull = '';
  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i];
    if (!/[\s，。！？；：“”‘’「」『』、,.!?;:'"()（）\[\]【】—…-]/.test(ch)) {
      strippedFull += ch;
      mapIndices.push(i);
    }
  }

  let matchPos = strippedFull.indexOf(strippedTarget);
  let matchLen = strippedTarget.length;
  if (matchPos === -1 && strippedTarget.length >= 10) {
    const anchor = strippedTarget.slice(0, Math.min(14, strippedTarget.length));
    matchPos = strippedFull.indexOf(anchor);
    matchLen = anchor.length;
  }
  if (matchPos !== -1 && mapIndices[matchPos] !== undefined) {
    const endIdxPos = Math.min(mapIndices.length - 1, matchPos + matchLen - 1);
    return {
      start: mapIndices[matchPos],
      end: mapIndices[endIdxPos] + 1,
    };
  }

  return null;
}

/**
 * Phase 1: 本地确定性硬伤预扫描（零 Token 秒级检出时辰算术、年号避讳、官职漂移、简介名词错位）
 */
export function scanBookDeterministicRisks(
  book: Book,
  targetChapters: Chapter[]
): string[] {
  const hints: string[] = [];
  const blurb = (book.settings?.commercialBlurb || '').trim();

  // 1. 提取角色姓名表
  const candidateNames = new Set<string>();
  (book.settings?.characterGraph || []).forEach((c) => {
    if (c.name && c.name.trim().length >= 2 && c.name.trim().length <= 4) {
      candidateNames.add(c.name.trim());
    }
  });
  const charLines = (book.settings?.characters || '').split(/\r?\n/);
  for (const line of charLines) {
    const m = line.match(/^[-*•\s]*([\u4e00-\u9fa5]{2,4})[：:（(]/);
    if (m?.[1]) candidateNames.add(m[1].trim());
  }

  // 2. 时辰换算与天数冲突检测（1个时辰 = 2小时；12个时辰 = 1昼夜）
  for (const ch of targetChapters) {
    const shichenMatches = Array.from(
      (ch.text || '').matchAll(/(\d+|[一二三四五六七八九十百两]+)\s*个?时辰/g)
    );
    for (const m of shichenMatches) {
      const token = m[1];
      const numMap: Record<string, number> = {
        二十四: 24,
        三十六: 36,
        四十八: 48,
        七十二: 72,
      };
      const val = /^\d+$/.test(token) ? Number(token) : numMap[token] || 0;
      if (val >= 24 && val % 12 === 0) {
        const realDays = val / 12;
        const nearbyContext = ch.text.slice(
          Math.max(0, (m.index || 0) - 120),
          Math.min(ch.text.length, (m.index || 0) + 180)
        );
        if (/[两二一]日|[两二一]天|第二日|次日/.test(nearbyContext)) {
          hints.push(
            `[时辰算术硬伤·第${ch.index}章] 出现“${m[0]}”（古代1时辰=2小时，${val}个时辰实为${realDays}昼夜/${val * 2}小时），但附近上下文又出现“两日/次日”，疑误将时辰当小时使用。`
          );
        } else {
          hints.push(
            `[时辰换算提醒·第${ch.index}章] 出现“${m[0]}”（合${realDays}整天/${val * 2}小时），请核对是否本意为“${val}个钟头/时辰数减半”。`
          );
        }
      }
    }
  }

  // 3. 年号/帝号避讳重字扫描（如 建昭 与 宋昭 重字）
  const eraRegex = /([\u4e00-\u9fa5]{2})(?:[一二三四五六七八九十百\d]+年|初年|末年|年间)/g;
  const eraNames = new Map<string, number[]>();
  const skipEraPrefixes = new Set([
    '这几', '那几', '前几', '后几', '许多', '多少', '过去', '未来', '当年', '今年', '明年', '去年',
    '已经', '大约', '足足', '整整', '连续', '短短', '长达', '不过', '不到', '超过', '已有', '将近',
    '至少', '约莫', '还有', '距今', '大概', '之前', '之后', '以来', '最近', '每隔', '最后',
  ]);
  for (const ch of targetChapters) {
    for (const m of (ch.text || '').matchAll(eraRegex)) {
      const era = m[1];
      if (!era || skipEraPrefixes.has(era) || /[一二三四五六七八九十百几多半数]/.test(era)) continue;
      if (!eraNames.has(era)) eraNames.set(era, []);
      const list = eraNames.get(era)!;
      if (!list.includes(ch.index)) list.push(ch.index);
    }
  }
  const namesArr = Array.from(candidateNames);
  eraNames.forEach((chapNums, era) => {
    const eraLastChar = era.slice(-1);
    for (const charName of namesArr) {
      if (charName.includes(eraLastChar) || charName.includes(era[0])) {
        hints.push(
          `[年号避讳风险·第${chapNums.slice(0, 4).join(',')}章] 年号/纪年词“${era}”与角色“${charName}”存在重字（古制皇室年号/帝讳通常避与核心人物同字），请确认是否避讳修改。`
        );
      }
    }
  });

  // 4. 同角色官职/头衔冲突预检
  const titleWords =
    '(?:太傅|太保|太师|丞相|宰相|首辅|尚书|侍郎|少卿|寺卿|御史|提督|督主|九千岁|千岁|侍卫|统领|将军|元帅|亲王|郡王|世子|王爷|侯爷|国公|公主|郡主|县主|皇后|贵妃|太后|仵作|主簿|知府|县令)';
  const rankMap = new Map<string, Map<string, number[]>>();
  for (const ch of targetChapters) {
    const text = ch.text || '';
    for (const name of namesArr) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp(`${escaped}[^。！？\\n]{0,16}?${titleWords}`, 'g');
      const r2 = new RegExp(`${titleWords}[^。！？\\n]{0,8}?${escaped}`, 'g');
      for (const m of [...text.matchAll(r1), ...text.matchAll(r2)]) {
        const tm = m[0].match(new RegExp(titleWords));
        if (tm?.[0]) {
          if (!rankMap.has(name)) rankMap.set(name, new Map());
          const tMap = rankMap.get(name)!;
          if (!tMap.has(tm[0])) tMap.set(tm[0], []);
          if (!tMap.get(tm[0])!.includes(ch.index)) tMap.get(tm[0])!.push(ch.index);
        }
      }
    }
  }
  rankMap.forEach((tMap, name) => {
    if (tMap.size >= 2) {
      const entries = Array.from(tMap.entries())
        .map(([title, chaps]) => `${title}(第${chaps.slice(0, 4).join(',')}章)`)
        .join(' vs ');
      hints.push(`[官职称谓波动待核查·${name}] 全书先后出现多种头衔关联：${entries}，请核对是否存在前后封号/官职错乱或未交代升迁。`);
    }
  });

  // 5. 简介关键实体 vs 开篇前三章校验
  if (blurb.length >= 20 && targetChapters.length > 0) {
    const openingText = targetChapters
      .slice(0, 3)
      .map((c) => c.text)
      .join('\n');
    const blurbCourtKeywords = ['刑部', '大理寺', '都察院', '东厂', '锦衣卫', '灵柩', '公堂', '哑女', '滴血认亲'];
    const missingInOpening: string[] = [];
    for (const kw of blurbCourtKeywords) {
      if (blurb.includes(kw) && !openingText.includes(kw)) {
        missingInOpening.push(kw);
      }
    }
    if (missingInOpening.length > 0) {
      hints.push(
        `[简介开篇核查] 简介中提及的核心意象/地点「${missingInOpening.join('、')}」在前 3 章正文中未直接出现，请重点核对是否存在货不对板或开篇延迟兑现。`
      );
    }
  }

  return hints;
}

function getAuditSystemInstruction(book: Book): string {
  return `你是一位拥有二十年传统出版与头部网文终审经验的“魔鬼挑刺总编”（对《${book.title}》进行发布前全书逻辑与硬伤死磕审校）。
你的任务不是夸奖作者，而是像最挑剔的资深读者+刑侦顾问+历史考据专家一样，逐字抠出全书所有可能导致读者弃书、评论区炸锅的硬伤与漏洞！

【必须地毯式检查的 10 大维度（绝不遗漏）】：
1. blurb_mismatch（简介/大纲货不对板）：简介/开篇承诺的人物身份（例如是否真是哑女）、事件地点（刑部vs大理寺）、关键道具动作（画押/灵柩白布vs停尸板/麻布）、爆发时机是否与正文一致？
2. timeline_math（时间线矛盾与算术错乱）：死亡时间（如刚死半个时辰vs三年前暴毙）、埋骨年限、年号纪年加减（建元十六年/二十三年与距今几年是否算得通）、古代时辰换算（1个时辰=2小时，12时辰=1昼夜，严查把“48个时辰”误当“2天”）。
3. foreshadow_drop（线索/伏笔未收或自相矛盾）：前文推论凶手特征（如左撇子）与后文定罪细节（右手持匕首/踩碎右腕）是否矛盾？前文重点铺开的案中案（如户部军饷案）是否后期人间蒸发？
4. incomplete_narrative（叙事残缺/隐身兑现）：人物嘴上宣称“已取得铁证/残片/密信”，正文究竟有没有写出他亲自取出、当众展示与验证的过程？暗记/半截证据是否真能自证清白？
5. causality_morality（因果断层与主角道德风险）：关键人物之死（如幼帝暴毙）、主角上位/夺权是否交代清楚真正凶手与作案链条？若含糊其辞导致读者怀疑“主角弑君/害人”，必须标红！
6. character_backstory（角色身份/身世铺垫不足）：双重或矛盾身份（如既是九千岁太监督主又是皇子王爷、逆臣之后），正文是否交代清楚如何假扮/隐瞒朝野、势力为何效忠、姓氏与母族来历？
7. contrivance_plot_armor（剧情过顺/反派降智/工具人巧合）：反派亲自动手留下极易追查的随身信物、死士携带带印章和自白字样的密信、关键证人恰逢时机服毒猝死、刚死尸体手里紧攥凶手刻字玉佩等不合理强行推进。
8. title_anachronism（称谓官职混乱与避讳考据硬伤）：同一人物官职/封号前后矛盾、违背常识的官制杜撰（如“世家少卿”）、年号/帝号与主角名犯冲重字避讳（如年号“建昭”与“宋昭”重字）。
9. epistemic_power_leak（认知越界/战力与道具账本冲突）：角色说出当时根本无从得知的内幕（上帝视角穿帮），或受伤残废、物品毁损遗失后下一章又毫发无损地使用。
10. pacing_spatial_rupture（空间瞬移/关系突变/高潮断层）：地理位置跳跃未交代行程时间、人物态度骤变无转折铺垫、高潮草率收尾。

【输出严格要求】：
- 只报告真正有实据的问题，每条必须给出精确的 \`locations\` 数组（包含具体 \`chapterIndex\`，0 代表《简介与大纲设定》；以及该章原文中**原封不动存在的真实短句片段 \`quoteSnippet\`**，长度 10~35 字，以便系统直接高亮定位）。
- 如果问题跨越多个章节（如第2章、第6章、第10章互相矛盾），务必把所有涉事章节全部列进 \`locations\`，并将 \`isCrossChapter\` 设为 \`true\`。
- 问题分级标准：
  - \`critical\`（红标·致命硬伤）：货不对板、时间线死结、凶手/核心证据矛盾、重大道德污点未澄清、核心伏笔烂尾、严重避讳或官制笑话，发出去必被读者群嘲弃书。
  - \`major\`（橙标·逻辑瑕疵）：叙事跳步讲一半、反派降智巧合过重、身世铺垫太薄、认知微越界，强烈建议修补。
  - \`minor\`（蓝标·细节润色）：局部称谓顺滑度、过渡句补充、氛围小修。`;
}

function buildCompactSettingHeader(book: Book): string {
  const s = book.settings || ({} as any);
  const parts: string[] = [
    `【书名】《${book.title}》`,
    `【题材风格】${s.genre || '未填写'} / ${s.style || '未填写'} | 视角：${s.pov || '第三人称'}`,
    `【商业简介（读者期待承诺）】\n${(s.commercialBlurb || '（暂未填写商业简介）').trim()}`,
    `【核心人设与关系】\n${(s.characters || '').slice(0, 1800)}`,
    `【核心大纲与终局锚点】\n${(s.outline || '').slice(0, 2200)}`,
  ];
  if (s.masterOutlineSpec?.ultimateEnding) {
    parts.push(
      `【L1 总纲核心契约】承诺：${s.masterOutlineSpec.corePromise} | 终局：${s.masterOutlineSpec.ultimateEnding} | 暗线：${s.masterOutlineSpec.darkPlotline}`
    );
  }
  if ((s.characterGraph || []).length > 0) {
    parts.push(
      `【角色图谱】\n${s.characterGraph!
        .slice(0, 15)
        .map((c: any) => `- ${c.name}（${c.roleType}）：欲望[${c.coreDesire}] | 知情边界[${c.epistemicBoundary}] | 状态[${c.currentStatus}]`)
        .join('\n')}`
    );
  }
  if ((s.foreshadowLedger || []).length > 0) {
    parts.push(
      `【登记伏笔台账】\n${s.foreshadowLedger!
        .slice(0, 20)
        .map((f: any) => `- [${f.status}] ${f.name}（第${f.plantedChapter}章埋 → 预期${f.expectedResolveChapter || '待定'}）：${f.note}`)
        .join('\n')}`
    );
  }
  return parts.join('\n\n');
}

function normalizeParsedIssues(
  rawIssues: any[],
  chaptersMap: Map<number, Chapter>,
  blurbText: string
): ManuscriptAuditIssue[] {
  if (!Array.isArray(rawIssues)) return [];
  const results: ManuscriptAuditIssue[] = [];

  for (const item of rawIssues) {
    if (!item || !item.title) continue;
    const category = normalizeAuditCategory(item.category || item.categoryLabel || item.title);
    const severity = normalizeAuditSeverity(item.severity);
    const rawLocs = Array.isArray(item.locations) ? item.locations : [];
    const locations: ManuscriptAuditLocation[] = [];

    for (const loc of rawLocs) {
      if (!loc) continue;
      const idx = Number(loc.chapterIndex);
      if (Number.isNaN(idx) || idx < 0) continue;
      const ch = idx > 0 ? chaptersMap.get(idx) : undefined;
      let quote = String(loc.quoteSnippet || '').trim();
      // 校验摘录是否能匹配上，若匹配不上截取前段避免完全无效
      if (idx > 0 && ch && quote) {
        const found = findQuotePositionInText(ch.text, quote);
        if (!found && quote.length > 18) {
          quote = quote.slice(0, 18);
        }
      } else if (idx === 0 && blurbText && quote) {
        const found = findQuotePositionInText(blurbText, quote);
        if (!found && quote.length > 18) {
          quote = quote.slice(0, 18);
        }
      }
      locations.push({
        chapterIndex: idx,
        chapterTitle: idx === 0 ? '简介与大纲设定' : ch?.title || String(loc.chapterTitle || `第${idx}章`),
        quoteSnippet: quote,
        note: String(loc.note || item.description || '').trim(),
      });
    }

    const distinctChapters = new Set(locations.map((l) => l.chapterIndex));
    results.push({
      id: generateUUID(),
      severity,
      category,
      categoryLabel: AUDIT_CATEGORY_META[category].label,
      title: String(item.title).trim(),
      description: String(item.description || '').trim(),
      suggestion: String(item.suggestion || '').trim(),
      isCrossChapter: Boolean(item.isCrossChapter) || distinctChapters.size >= 2,
      locations,
      status: 'open',
    });
  }

  // 按严重程度排序：critical > major > minor
  const weight: Record<ManuscriptAuditSeverity, number> = { critical: 0, major: 1, minor: 2 };
  return results.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

function summarizeReportCounts(issues: ManuscriptAuditIssue[]) {
  let criticalCount = 0;
  let majorCount = 0;
  let minorCount = 0;
  for (const iss of issues) {
    if (iss.status === 'resolved' || iss.status === 'ignored') continue;
    if (iss.severity === 'critical') criticalCount++;
    else if (iss.severity === 'major') majorCount++;
    else minorCount++;
  }
  return { criticalCount, majorCount, minorCount };
}

export interface FullAuditProgressInfo {
  phase: 'prescan' | 'short_direct' | 'map_ledger' | 'fold_arcs' | 'reduce_global' | 'drilldown' | 'done';
  percent: number;
  message: string;
}

export async function runFullManuscriptAudit(params: {
  book: Book;
  cfg?: ApiConfig;
  model: string;
  startChapter?: number;
  endChapter?: number;
  reuseCachedFactLedger?: boolean;
  onProgress?: (info: FullAuditProgressInfo) => void;
  signal?: AbortSignal;
}): Promise<ManuscriptAuditReport> {
  const {
    book,
    cfg,
    model,
    startChapter,
    endChapter,
    reuseCachedFactLedger = true,
    onProgress,
    signal,
  } = params;

  const allSortedChapters = [...(book.chapters || [])].sort((a, b) => a.index - b.index);
  const minCh = startChapter ?? (allSortedChapters[0]?.index || 1);
  const maxCh = endChapter ?? (allSortedChapters[allSortedChapters.length - 1]?.index || 1);
  const targetChapters = allSortedChapters.filter((c) => c.index >= minCh && c.index <= maxCh);

  if (targetChapters.length === 0) {
    throw new Error('所选章节区间内暂无已撰写正文，请先撰写章节后再进行全书终审。');
  }

  const chaptersMap = new Map<number, Chapter>(targetChapters.map((c) => [c.index, c]));
  const totalWordCount = targetChapters.reduce((sum, c) => sum + (c.text?.length || 0), 0);
  const settingHeader = buildCompactSettingHeader(book);
  const blurbText = (book.settings?.commercialBlurb || '').trim();

  // Phase 1: Deterministic Local Pre-Scan
  onProgress?.({
    phase: 'prescan',
    percent: 6,
    message: `正在执行本地规则预扫描（时辰换算 / 年号避讳 / 官职称谓漂移 / 简介核对）...`,
  });
  const deterministicHints = scanBookDeterministicRisks(book, targetChapters);
  const deterministicHintsBlock =
    deterministicHints.length > 0
      ? `【本地确定性脚本预扫警报（请务必逐条复核并纳入问题清单）】\n${deterministicHints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
      : '【本地确定性脚本预扫】暂未触发规则警报，请直接深度细读语义逻辑。';

  const isShortTrack = totalWordCount <= 34000 && targetChapters.length <= 14;

  // ======================== TRACK A: 短篇全量精读直审 ========================
  if (isShortTrack) {
    onProgress?.({
      phase: 'short_direct',
      percent: 25,
      message: `正在调用深度终审模式全文直读（共 ${targetChapters.length} 章，${totalWordCount.toLocaleString()} 字）...`,
    });

    const fullManuscriptBlock = targetChapters
      .map((c) => `=== 第 ${c.index} 章：《${c.title}》（${c.text.length}字）===\n${c.text}`)
      .join('\n\n');

    const prompt = `${settingHeader}

${deterministicHintsBlock}

【待审查全文正文（第 ${minCh} 章 至 第 ${maxCh} 章，全字无删减）】
${fullManuscriptBlock}

请对上述作品进行逐字挑刺式出版级终审，重点挖掘**跨章矛盾、时间线年号算术错乱、简介货不对板、凶手左撇子/右手或证据隐身兑现、幼帝/核心人物死因道德风险、身份铺垫不足、工具人巧合、官职混乱与年号重字避讳**。
请严格返回以下 JSON（不要输出无关解释）：
{
  "executiveSummary": "200字以内的全书质量总评与最急需修复的2~3个核心硬伤概览",
  "factLedger": [
    {
      "chapterIndex": 1,
      "timeAnchor": "本章时间点/年号/耗时",
      "castAndTitles": "登场人物及官职身份/知情状态",
      "plotAndEvidence": "关键事件因果、死因与证据展示",
      "cluesAndProps": "伏笔与道具流向",
      "localRedFlags": ["单章疑点简述"]
    }
  ],
  "issues": [
    {
      "severity": "critical 或 major 或 minor",
      "category": "blurb_mismatch | timeline_math | foreshadow_drop | incomplete_narrative | causality_morality | character_backstory | contrivance_plot_armor | title_anachronism | epistemic_power_leak | pacing_spatial_rupture",
      "title": "直击痛点的简短问题标题（10~25字）",
      "description": "具体指出哪里错了、前后哪几章如何互相打架、读者的直接疑惑是什么",
      "suggestion": "具体可落地的编辑修改方向建议（说明应该把哪几章怎么改统一）",
      "isCrossChapter": true,
      "locations": [
        {
          "chapterIndex": 0,
          "quoteSnippet": "简介或该章正文中的原封不动真实片段（10~35字，用于系统精准标色高亮）",
          "note": "本处具体错误说明"
        }
      ]
    }
  ]
}`;

    const res = await chatCompletion({
      provider: cfg?.provider,
      baseUrl: cfg?.baseUrl,
      apiKey: cfg?.apiKey,
      model,
      signal,
      temperature: 0.25,
      messages: [
        { role: 'system', content: getAuditSystemInstruction(book) },
        { role: 'user', content: prompt },
      ],
    });

    const parsed = repairAndParseJson<any>(res.content);
    if (!parsed) {
      throw new Error('模型返回的审查结构解析失败，请稍后重试。');
    }

    const factLedger: ChapterFactCard[] = targetChapters.map((ch) => {
      const matched = Array.isArray(parsed.factLedger)
        ? parsed.factLedger.find((f: any) => Number(f?.chapterIndex) === ch.index)
        : null;
      return {
        chapterIndex: ch.index,
        title: ch.title,
        charLength: ch.text.length,
        textHash: computeChapterTextHash(ch.text),
        timeAnchor: String(matched?.timeAnchor || '未标注'),
        castAndTitles: String(matched?.castAndTitles || '未标注'),
        plotAndEvidence: String(matched?.plotAndEvidence || '未标注'),
        cluesAndProps: String(matched?.cluesAndProps || '未标注'),
        localRedFlags: Array.isArray(matched?.localRedFlags) ? matched.localRedFlags.map(String) : [],
      };
    });

    const issues = normalizeParsedIssues(parsed.issues || [], chaptersMap, blurbText);
    const counts = summarizeReportCounts(issues);

    onProgress?.({ phase: 'done', percent: 100, message: `全书终审完成，共检出 ${issues.length} 处问题。` });

    return {
      id: generateUUID(),
      createdAt: Date.now(),
      mode: 'short_full_read',
      scopeLabel: `全书第 ${minCh}-${maxCh} 章全文直读终审`,
      auditedChapterCount: targetChapters.length,
      totalWordCount,
      executiveSummary: String(parsed.executiveSummary || `已完成第 ${minCh}-${maxCh} 章全文深度审查。`),
      ...counts,
      deterministicHints,
      factLedger,
      issues,
    };
  }

  // ======================== TRACK B: 长篇 Map-Reduce 分层记忆账本深度审查 ========================
  // 将长篇拆分成每批 <= 13500 字（且 <= 5 章）的窗口抽取结构化事实账本，同时捕抓单章局部硬伤
  const existingCardsMap = new Map<number, ChapterFactCard>(
    (book.manuscriptAudit?.factLedger || []).map((c) => [c.chapterIndex, c])
  );

  const factLedgerMap = new Map<number, ChapterFactCard>();
  const chaptersToExtract: Chapter[] = [];

  for (const ch of targetChapters) {
    const hash = computeChapterTextHash(ch.text);
    const cached = existingCardsMap.get(ch.index);
    if (reuseCachedFactLedger && cached && cached.textHash === hash) {
      factLedgerMap.set(ch.index, cached);
    } else {
      chaptersToExtract.push(ch);
    }
  }

  // Build batches (~13,500 chars / up to 5 chapters per batch)
  const batches: Chapter[][] = [];
  let currentBatch: Chapter[] = [];
  let currentChars = 0;
  for (const ch of chaptersToExtract) {
    const chLen = ch.text.length;
    if (
      currentBatch.length > 0 &&
      (currentChars + chLen > 13500 || currentBatch.length >= 5)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }
    currentBatch.push(ch);
    currentChars += chLen;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  const localIssuesCollected: ManuscriptAuditIssue[] = [];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    const spanText = `第 ${batch[0].index}-${batch[batch.length - 1].index} 章`;
    const pct = 12 + Math.round(((bIdx + 1) / Math.max(1, batches.length)) * 48);
    onProgress?.({
      phase: 'map_ledger',
      percent: pct,
      message: `长篇分层检索 Phase 2 (${bIdx + 1}/${batches.length})：正在抽取 ${spanText} 事实账本与局部硬伤...`,
    });

    const batchContent = batch
      .map((c) => `=== 第 ${c.index} 章：《${c.title}》===\n${c.text}`)
      .join('\n\n');

    const mapPrompt = `【作品设定基准】
书名：《${book.title}》 | 商业简介：${blurbText.slice(0, 600)}
核心人物：${(book.settings?.characters || '').slice(0, 800)}

【本次待抽取批次章节（${spanText}）】
${batchContent}

请完成两项核心任务，并严格输出 JSON：
任务 A：为本批每一章生成极高信息密度的“长篇事实账本（factLedger）”，供后续跨越百章全局对账使用！**务必保留所有精确数字、年号、时长（如48个时辰）、人物当前官职/称谓、死因凶手、左右手特征、关键物证/道具去向、新埋伏笔及该章人物认知状态**。
任务 B：立即记录本批章节内部肉眼可见的单章局部问题（如：巧合降智、时辰算术错误、官职前后矛盾、叙事隐身未展示证据、错别字硬伤、与简介开篇直接不符等），并摘录原文原句 \`quoteSnippet\`。

严格输出 JSON：
{
  "factLedger": [
    {
      "chapterIndex": ${batch[0].index},
      "timeAnchor": "精确记录本章年号/时间点/耗时数字",
      "castAndTitles": "出场人物+精确官职封号+伤势/秘密知情状态",
      "plotAndEvidence": "核心因果链+谁死了/谁下的手+证据是否真正取出展示",
      "cluesAndProps": "新埋伏笔/回收伏笔/关键道具去向/左右手特征",
      "localRedFlags": ["本批内发现的可疑逻辑或硬伤点"]
    }
  ],
  "localIssues": [
    {
      "severity": "critical | major | minor",
      "category": "blurb_mismatch | timeline_math | foreshadow_drop | incomplete_narrative | causality_morality | character_backstory | contrivance_plot_armor | title_anachronism | epistemic_power_leak | pacing_spatial_rupture",
      "title": "问题简述",
      "description": "具体逻辑漏洞或违和处说明",
      "suggestion": "修改建议",
      "isCrossChapter": false,
      "locations": [
        {
          "chapterIndex": ${batch[0].index},
          "quoteSnippet": "该章正文中原封不动的真实短句(10~30字)",
          "note": "此处问题点"
        }
      ]
    }
  ]
}`;

    const mapRes = await chatCompletion({
      provider: cfg?.provider,
      baseUrl: cfg?.baseUrl,
      apiKey: cfg?.apiKey,
      model,
      signal,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是极其严谨的长篇小说事实账本审计员，擅长从数万字正文中无损提取时间线、年号、官职、物证、左右手特征、死亡因果与认知状态，不遗漏任何潜在伏笔与数字矛盾。',
        },
        { role: 'user', content: mapPrompt },
      ],
    });

    const parsedMap = repairAndParseJson<any>(mapRes.content);
    for (const ch of batch) {
      const found = Array.isArray(parsedMap?.factLedger)
        ? parsedMap.factLedger.find((f: any) => Number(f?.chapterIndex) === ch.index)
        : null;
      factLedgerMap.set(ch.index, {
        chapterIndex: ch.index,
        title: ch.title,
        charLength: ch.text.length,
        textHash: computeChapterTextHash(ch.text),
        timeAnchor: String(found?.timeAnchor || '未提取'),
        castAndTitles: String(found?.castAndTitles || '未提取'),
        plotAndEvidence: String(found?.plotAndEvidence || '未提取'),
        cluesAndProps: String(found?.cluesAndProps || '未提取'),
        localRedFlags: Array.isArray(found?.localRedFlags) ? found.localRedFlags.map(String) : [],
      });
    }

    if (Array.isArray(parsedMap?.localIssues)) {
      localIssuesCollected.push(...normalizeParsedIssues(parsedMap.localIssues, chaptersMap, blurbText));
    }
  }

  const orderedLedger = targetChapters
    .map((c) => factLedgerMap.get(c.index))
    .filter((x): x is ChapterFactCard => Boolean(x));

  // Optional Hierarchical Arc Folding for Mega Novels (> 48 chapters)
  let ledgerForReduceText = '';
  if (orderedLedger.length <= 48) {
    ledgerForReduceText = orderedLedger
      .map(
        (f) =>
          `[第${f.chapterIndex}章《${f.title}》]\n时间:${f.timeAnchor} | 人物头衔:${f.castAndTitles}\n因果证据:${f.plotAndEvidence}\n线索道具:${f.cluesAndProps}${
            f.localRedFlags.length ? `\n红旗疑点:${f.localRedFlags.join('；')}` : ''
          }`
      )
      .join('\n\n');
  } else {
    onProgress?.({
      phase: 'fold_arcs',
      percent: 65,
      message: `全书达 ${orderedLedger.length} 章（超长篇体量），正在进行分卷骨架二次折叠压缩，确保跨百章无损交叉对账...`,
    });
    const arcChunks: ChapterFactCard[][] = [];
    for (let i = 0; i < orderedLedger.length; i += 20) {
      arcChunks.push(orderedLedger.slice(i, i + 20));
    }
    const foldedArcSummaries: string[] = [];
    for (let aIdx = 0; aIdx < arcChunks.length; aIdx++) {
      const chunk = arcChunks[aIdx];
      const rawChunkText = chunk
        .map(
          (f) =>
            `第${f.chapterIndex}章(${f.title})|时:${f.timeAnchor}|人:${f.castAndTitles}|事:${f.plotAndEvidence}|线索:${f.cluesAndProps}|疑点:${f.localRedFlags.join(',')}`
        )
        .join('\n');
      const foldRes = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        signal,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              '将20章事实账本折叠为跨卷对账摘要，必须保留所有精确章号、时间年号、人名官职、死因凶手、未回收伏笔与可疑红旗点，严禁丢失章号。',
          },
          { role: 'user', content: rawChunkText },
        ],
      });
      foldedArcSummaries.push(
        `【第 ${chunk[0].chapterIndex}-${chunk[chunk.length - 1].chapterIndex} 章分卷事实总账】\n${foldRes.content}`
      );
    }
    ledgerForReduceText = foldedArcSummaries.join('\n\n');
  }

  // Phase 3: Reduce Global Detective Cross-Check
  onProgress?.({
    phase: 'reduce_global',
    percent: 78,
    message: `正在执行 Phase 3 全局侦探式交叉对账（比对简介、全书时间线、伏笔回收、身份铺垫与道德因果链）...`,
  });

  const reducePrompt = `${settingHeader}

${deterministicHintsBlock}

【全书结构化事实账本（覆盖第 ${minCh} 至 ${maxCh} 章，共 ${orderedLedger.length} 章）】
${ledgerForReduceText}

请以最高规格的出版终审主编视角，对上述**全书跨章事实账本**与**简介/大纲**进行交叉侦探式比对，找出所有：
1. 简介/大纲 vs 前几章/正文“货不对板”；
2. 前后多章时间线/年号/埋骨年限/死亡时间/时辰换算矛盾；
3. 前期悬案、凶手特征（如左撇子vs右手）、关键物证在中后期矛盾或被遗忘烂尾；
4. 重要人物死亡（尤其是主角得利/登基）缺乏凶手与因果说明导致的道德黑点；
5. 双重身份/幕后权力缺乏前文铺垫；
6. 同人物官职/称谓跨章错乱或年号重字避讳；
7. 账本中记录的重大叙事半截未展示与强行巧合。

严格输出 JSON：
{
  "executiveSummary": "220字以内的全书终审总结与优先级建议",
  "globalIssues": [
    {
      "severity": "critical | major | minor",
      "category": "blurb_mismatch | timeline_math | foreshadow_drop | incomplete_narrative | causality_morality | character_backstory | contrivance_plot_armor | title_anachronism | epistemic_power_leak | pacing_spatial_rupture",
      "title": "问题标题",
      "description": "跨章矛盾全景剖析与读者质疑点",
      "suggestion": "跨章统一口径修改方向建议",
      "isCrossChapter": true,
      "locations": [
        {
          "chapterIndex": 6,
          "quoteSnippet": "",
          "note": "该章在账本中引发矛盾的具体事实"
        }
      ]
    }
  ]
}`;

  const reduceRes = await chatCompletion({
    provider: cfg?.provider,
    baseUrl: cfg?.baseUrl,
    apiKey: cfg?.apiKey,
    model,
    signal,
    temperature: 0.25,
    messages: [
      { role: 'system', content: getAuditSystemInstruction(book) },
      { role: 'user', content: reducePrompt },
    ],
  });

  const parsedReduce = repairAndParseJson<any>(reduceRes.content);
  const globalIssues = normalizeParsedIssues(parsedReduce?.globalIssues || [], chaptersMap, blurbText);

  // Phase 4: Deep Drill-Down Verification (精准回读涉事的 2~4 章完整原文，提取逐字高亮锚点并剔除误报)
  const issuesNeedingDrilldown = globalIssues
    .filter((iss) => iss.locations.some((l) => l.chapterIndex > 0 && (!l.quoteSnippet || l.quoteSnippet.length < 8)))
    .slice(0, 10);

  if (issuesNeedingDrilldown.length > 0) {
    onProgress?.({
      phase: 'drilldown',
      percent: 90,
      message: `正在执行 Phase 4 涉事原文精准回读核验（为 ${issuesNeedingDrilldown.length} 项跨章疑点抓取原文高亮坐标）...`,
    });

    const implicatedChapIndices = Array.from(
      new Set(
        issuesNeedingDrilldown.flatMap((iss) =>
          iss.locations.map((l) => l.chapterIndex).filter((idx) => idx > 0 && chaptersMap.has(idx))
        )
      )
    ).slice(0, 10);

    if (implicatedChapIndices.length > 0) {
      const drillChaptersText = implicatedChapIndices
        .map((idx) => {
          const ch = chaptersMap.get(idx)!;
          return `=== 第 ${ch.index} 章：《${ch.title}》===\n${ch.text.slice(0, 4500)}`;
        })
        .join('\n\n');

      const drillQueries = issuesNeedingDrilldown.map((iss) => ({
        issueId: iss.id,
        title: iss.title,
        chapters: iss.locations.map((l) => l.chapterIndex),
        note: iss.description,
      }));

      try {
        const drillRes = await chatCompletion({
          provider: cfg?.provider,
          baseUrl: cfg?.baseUrl,
          apiKey: cfg?.apiKey,
          model,
          signal,
          temperature: 0.15,
          messages: [
            {
              role: 'system',
              content:
                '你是原文核验校对员。请对照涉事章节完整原文，为每条跨章疑点精确摘录原文中一模一样的真实短句(10~35字)作为定位高亮锚点；若经核验原文其实自洽并无该矛盾，将 verified 标为 false。',
            },
            {
              role: 'user',
              content: `【待核验问题清单】\n${JSON.stringify(drillQueries, null, 2)}\n\n【涉事章节原文】\n${drillChaptersText}\n\n请返回 JSON：
{
  "verifications": [
    {
      "issueId": "...",
      "verified": true,
      "refinedLocations": [
        { "chapterIndex": 6, "quoteSnippet": "必须一字不差截取自上方原文的10~35字句子", "note": "核实后的精确说明" }
      ]
    }
  ]
}`,
            },
          ],
        });

        const parsedDrill = repairAndParseJson<any>(drillRes.content);
        if (Array.isArray(parsedDrill?.verifications)) {
          const falsePositiveIds = new Set<string>();
          for (const v of parsedDrill.verifications) {
            if (!v?.issueId) continue;
            if (v.verified === false) {
              falsePositiveIds.add(v.issueId);
              continue;
            }
            const targetIssue = globalIssues.find((i) => i.id === v.issueId);
            if (targetIssue && Array.isArray(v.refinedLocations) && v.refinedLocations.length > 0) {
              const normalizedLocs = normalizeParsedIssues(
                [{ ...targetIssue, locations: v.refinedLocations }],
                chaptersMap,
                blurbText
              )[0]?.locations;
              if (normalizedLocs && normalizedLocs.length > 0) {
                targetIssue.locations = normalizedLocs;
              }
            }
          }
          if (falsePositiveIds.size > 0) {
            for (let i = globalIssues.length - 1; i >= 0; i--) {
              if (falsePositiveIds.has(globalIssues[i].id)) globalIssues.splice(i, 1);
            }
          }
        }
      } catch {
        // Non-fatal fallback: keep global issues as-is if drilldown fails
      }
    }
  }

  // Combine global cross-chapter issues + distinct local issues
  const mergedIssues: ManuscriptAuditIssue[] = [...globalIssues];
  for (const locIss of localIssuesCollected) {
    const duplicate = mergedIssues.some(
      (g) =>
        g.category === locIss.category &&
        g.locations.some((gl) => locIss.locations.some((ll) => ll.chapterIndex === gl.chapterIndex))
    );
    if (!duplicate) {
      mergedIssues.push(locIss);
    }
  }

  const weight: Record<ManuscriptAuditSeverity, number> = { critical: 0, major: 1, minor: 2 };
  mergedIssues.sort((a, b) => weight[a.severity] - weight[b.severity]);
  const counts = summarizeReportCounts(mergedIssues);

  onProgress?.({
    phase: 'done',
    percent: 100,
    message: `长篇分层审查完成：已建立 ${orderedLedger.length} 章事实账本并定位 ${mergedIssues.length} 项待修问题。`,
  });

  return {
    id: generateUUID(),
    createdAt: Date.now(),
    mode: 'long_map_reduce',
    scopeLabel: `第 ${minCh}-${maxCh} 章长篇 Map-Reduce 分层终审（${orderedLedger.length}章事实账本）`,
    auditedChapterCount: targetChapters.length,
    totalWordCount,
    executiveSummary: String(
      parsedReduce?.executiveSummary || `已完成 ${orderedLedger.length} 章长篇事实账本抽取与全局交叉终审。`
    ),
    ...counts,
    deterministicHints,
    factLedger: orderedLedger,
    issues: mergedIssues,
  };
}

// ============================================================================
// 跨多章联动修复方案规划 & 逐章带上游回执外科手术改写引擎
// ============================================================================

export async function generateCoordinatedFixPlan(params: {
  book: Book;
  issue: ManuscriptAuditIssue;
  customInstruction?: string;
  cfg?: ApiConfig;
  model: string;
}): Promise<CoordinatedFixPlan> {
  const { book, issue, customInstruction, cfg, model } = params;
  const chaptersMap = new Map((book.chapters || []).map((c) => [c.index, c]));

  const implicatedChapterIndices = Array.from(
    new Set(
      (issue.locations || [])
        .map((l) => l.chapterIndex)
        .filter((idx) => idx > 0 && chaptersMap.has(idx))
    )
  ).sort((a, b) => a - b);

  // If the issue hits chapter 0 (blurb mismatch) with no chapters listed, include ch 1~3 for reference
  const referenceChapterIndices =
    implicatedChapterIndices.length > 0
      ? implicatedChapterIndices
      : (book.chapters || []).slice(0, 3).map((c) => c.index);

  const involvesBlurb =
    issue.category === 'blurb_mismatch' ||
    (issue.locations || []).some((l) => l.chapterIndex === 0);

  const chapterTextsBlock = referenceChapterIndices
    .map((idx) => {
      const ch = chaptersMap.get(idx);
      if (!ch) return '';
      return `=== 第 ${ch.index} 章：《${ch.title}》===\n${ch.text}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const prompt = `【待修复的审校问题】
- 严重等级：${issue.severity} | 问题类别：${issue.categoryLabel}
- 问题标题：${issue.title}
- 详尽问题剖析：${issue.description}
- 编辑修改建议：${issue.suggestion}
- 问题涉及定位：
${(issue.locations || []).map((l) => `  · 第${l.chapterIndex}章（${l.chapterTitle || ''}）：摘录「${l.quoteSnippet}」 -> ${l.note}`).join('\n')}
${customInstruction?.trim() ? `- 【作者本人指定的修改要求（最高优先级）】\n  ${customInstruction.trim()}` : ''}

【作品核心设定与简介】
书名：《${book.title}》
当前商业简介：\n${book.settings?.commercialBlurb || '（无）'}
核心大纲：\n${(book.settings?.outline || '').slice(0, 1500)}

【涉及章节完整原文】
${chapterTextsBlock}

请制定一份**“全局唯一口径·多章协同修复方案”**！
要求：
1. 在 \`canonicalTruthContract\` 中，把真凶/时间算术/年号/官职称谓/证据展示过程/身世铺垫等彻底拍板写死为唯一权威事实（绝不再左右摇摆）。
2. 若该问题涉及简介货不对板或需要顺带修正简介，设置 \`alsoUpdateBlurb: true\` 并给出精确修改后的 \`revisedBlurb\`（仅微调偏差部分，保留商业吸引力）；否则 \`alsoUpdateBlurb: false\`。
3. 在 \`chapterPatches\` 中，**按章号从小到大列出每一章需要动手术修改的精确任务单**（注意：如果某章只需在某段补两句铺垫或改一个时间词/官职词，务必写清“改哪里、保留什么”，不要把不需要改的章节也拉进来瞎改！）。

严格输出 JSON：
{
  "canonicalTruthContract": "一段清晰明确的全局统一权威设定口径（如：1. 年号改建淳且无重字；2. 明确崔婉三年前失踪但今夜刚被害；3. 裴琰为左撇子，第10章改为踩碎左腕；4. 第11章补写宋昭当庭劈开暗格取出浸毒龙袍残片，并明言毒药系裴渊死士提前混入御药……）",
  "alsoUpdateBlurb": false,
  "revisedBlurb": "",
  "chapterPatches": [
    {
      "chapterIndex": 6,
      "chapterTitle": "章节标题",
      "editTargetSummary": "本章需要精确修改或增补的段落位置、旧词替换或新加细节（务必写清楚具体改法）",
      "preserveConstraints": "本章必须原封不动保留的情节线与章末衔接钩子"
    }
  ]
}`;

  const res = await chatCompletion({
    provider: cfg?.provider,
    baseUrl: cfg?.baseUrl,
    apiKey: cfg?.apiKey,
    model,
    temperature: 0.25,
    messages: [
      {
        role: 'system',
        content:
          '你是顶级小说架构统筹编辑，最擅长“牵一发而同步全身”的跨章协同改稿规划。你先定死唯一不矛盾的事实契约，再按章拆解最小代价的外科手术改稿指令。',
      },
      { role: 'user', content: prompt },
    ],
  });

  const parsed = repairAndParseJson<any>(res.content);
  if (!parsed || !parsed.canonicalTruthContract) {
    throw new Error('协同修复方案解析失败，请稍后重试。');
  }

  const rawPatches = Array.isArray(parsed.chapterPatches) ? parsed.chapterPatches : [];
  const patches: CoordinatedFixChapterPatch[] = [];
  for (const p of rawPatches) {
    const idx = Number(p?.chapterIndex);
    const ch = chaptersMap.get(idx);
    if (!ch) continue;
    patches.push({
      chapterIndex: idx,
      chapterTitle: ch.title,
      editTargetSummary: String(p.editTargetSummary || '').trim(),
      preserveConstraints: String(p.preserveConstraints || '保持本章其余精彩情节、人物语气与章末衔接不变').trim(),
      status: 'pending',
      originalText: ch.text,
    });
  }

  // Ensure sorted ascending by chapterIndex
  patches.sort((a, b) => a.chapterIndex - b.chapterIndex);

  return {
    id: generateUUID(),
    createdAt: Date.now(),
    canonicalTruthContract: String(parsed.canonicalTruthContract).trim(),
    alsoUpdateBlurb: Boolean(parsed.alsoUpdateBlurb) || involvesBlurb,
    revisedBlurb: parsed.revisedBlurb ? String(parsed.revisedBlurb).trim() : undefined,
    chapterPatches: patches,
  };
}

export async function reviseSingleChapterWithCoordinatedContract(params: {
  book: Book;
  chapter: Chapter;
  plan: CoordinatedFixPlan;
  patch: CoordinatedFixChapterPatch;
  upstreamHandOffs: Array<{ chapterIndex: number; summary: string }>;
  userCustomInstruction?: string;
  cfg?: ApiConfig;
  model: string;
}): Promise<{ revisedText: string; handOffNote: string }> {
  const {
    book,
    chapter,
    plan,
    patch,
    upstreamHandOffs,
    userCustomInstruction,
    cfg,
    model,
  } = params;

  const sortedChaps = [...(book.chapters || [])].sort((a, b) => a.index - b.index);
  const pos = sortedChaps.findIndex((c) => c.index === chapter.index);
  const prevTail = pos > 0 ? sortedChaps[pos - 1].text.slice(-550) : '';
  const nextHead = pos >= 0 && pos < sortedChaps.length - 1 ? sortedChaps[pos + 1].text.slice(0, 550) : '';

  const handOffBlock =
    upstreamHandOffs.length > 0
      ? `【前序章节刚刚完成的实际改写回执（本章必须严格承接，确保前后严丝合缝）】\n${upstreamHandOffs
          .map((h) => `- 第 ${h.chapterIndex} 章实改回执：${h.summary}`)
          .join('\n')}`
      : '【前序章节回执】本章是本次协同修改的第一处正文章节。';

  const prompt = `你正在执行《${book.title}》跨章逻辑修复手术。
⚠️ 核心铁律：**外科手术式局部精修，绝不乱删或大改无关情节**！保持作者原有文笔韵律、人称视角、段落呼吸感与字数规模（当前原文字数约 ${chapter.text.length} 字，修订后应与原文体量相当），仅精准修复问题涉及的语句、时间数字、官职称谓、动作细节或补全必要的过程段落。

【全局唯一权威统一口径契约】
${plan.canonicalTruthContract}

${handOffBlock}

【本章（第 ${chapter.index} 章《${chapter.title}》）具体手术任务】
- 修改目标：${patch.editTargetSummary}
- 保留约束：${patch.preserveConstraints}
${userCustomInstruction?.trim() ? `- 作者附加要求：${userCustomInstruction.trim()}` : ''}

${prevTail ? `【上一章结尾衔接参照】\n...${prevTail}` : ''}
${nextHead ? `【下一章开头衔接参照】\n${nextHead}...` : ''}

【第 ${chapter.index} 章完整原稿】
${chapter.text}

请先思考修改位置并确保与全局口径 100% 一致，然后严格按照以下分隔格式输出（不要输出多余解释或 markdown 围栏）：
<<<HANDOFF_NOTE>>>
用1~2句话总结本章实际改动了哪几处细节/时间/证据（供后续章节修改时参考对接）。
<<<REVISED_CHAPTER>>>
此处输出修改完成后的第 ${chapter.index} 章完整正文（直接可发布版本，不要重复输出“第X章 标题”开头行）。`;

  const res = await chatCompletion({
    provider: cfg?.provider,
    baseUrl: cfg?.baseUrl,
    apiKey: cfg?.apiKey,
    model,
    temperature: 0.35,
    messages: [
      {
        role: 'system',
        content:
          '你是资深小说润色与逻辑手术专家。你的职责是在完整保留原作者文风与绝大多数情节的前提下，精准修复指定逻辑硬伤并写出流畅自然的衔接句段，严禁出现“AI腔/套话”或擅自篡改未涉事剧情。',
      },
      { role: 'user', content: prompt },
    ],
  });

  const raw = (res.content || '').trim();
  let handOffNote = `已按统一口径完成第 ${chapter.index} 章局部精修。`;
  let revisedText = raw;

  const markerRe = /<<<HANDOFF_NOTE>>>([\s\S]*?)<<<REVISED_CHAPTER>>>([\s\S]*)/i;
  const m = raw.match(markerRe);
  if (m) {
    handOffNote = (m[1] || handOffNote).trim();
    revisedText = (m[2] || '').trim();
  } else if (raw.includes('<<<REVISED_CHAPTER>>>')) {
    revisedText = raw.split('<<<REVISED_CHAPTER>>>')[1].trim();
  }

  // Strip accidental markdown fence or duplicate chapter title line if model added it
  revisedText = revisedText.replace(/^```[\w]*\n?|```$/g, '').trim();
  if (!revisedText || revisedText.length < Math.max(120, Math.floor(chapter.text.length * 0.35))) {
    throw new Error('模型返回的修订章节正文过短，已触发保护拦截，请重试。');
  }

  return { revisedText, handOffNote };
}
