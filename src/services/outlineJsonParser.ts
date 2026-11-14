import { NOVEL_SETTING_MODULES } from '../data/novelArchitectureSchema';

export interface ParsedImproveOutlineResult {
  improvedOutline: string;
  realignedOutline?: string;
  characters?: string;
  worldView?: string;
  suggestedGenre?: string;
  suggestedStyle?: string;
  suggestedPov?: string;
  commercialBlurb?: string;
  alternateTitles?: string[];
  systemSettings?: Record<string, string[]>;
  volumePlan?: Array<{
    volumeIndex: number;
    title: string;
    chapterSpan: string;
    coreConflict: string;
    climaxGoal: string;
  }>;
  foreshadowLedger?: Array<{
    name: string;
    plantedChapter: number;
    expectedResolveChapter?: string;
    note?: string;
  }>;
  lorebookEntries?: Array<{
    name: string;
    entryType: string;
    activationMode: string;
    keywords: string[];
    appearance?: string;
    personality?: string;
    behaviorQuirks?: string;
    mustIncludeTaboos?: string;
  }>;
}

export interface ParseOutlineOutput {
  data: ParsedImproveOutlineResult;
  mode: 'strict_json' | 'repaired_json' | 'heuristic_markdown';
  extractedSettingsCount: number;
}

/**
 * Repairs unclosed JSON brackets, braces, and trailing commas when LLM output is truncated
 */
function repairTruncatedJsonString(jsonStr: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
  }

  let repaired = jsonStr;
  if (inString) {
    repaired += '"';
  }

  // Remove trailing comma right before we close brackets
  repaired = repaired.replace(/,\s*$/, '');

  while (stack.length > 0) {
    const closing = stack.pop();
    repaired += closing;
  }

  return repaired;
}

/**
 * Universal JSON extractor & repairer for LLM outputs
 */
export function repairAndParseJson<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  // 1. First attempt: Direct JSON parse on trimmed string
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Extract ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // try repairing code block content below
    }
  }

  // 3. Locate outermost { ... } or [ ... ]
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let startIdx = -1;
  let endChar = '';

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endChar = '}';
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endChar = ']';
  }

  if (startIdx === -1) return null;

  const lastEndIdx = trimmed.lastIndexOf(endChar);
  let candidate = lastEndIdx > startIdx ? trimmed.slice(startIdx, lastEndIdx + 1) : trimmed.slice(startIdx);

  // 4. Try parsing candidate directly
  try {
    return JSON.parse(candidate);
  } catch {
    // continue to repair
  }

  // 5. Clean common JSON corruptions from LLMs
  let cleaned = candidate
    // Fix trailing commas in objects and arrays
    .replace(/,\s*([}\]])/g, '$1')
    // Remove control characters (except newline, tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // Fix literal unescaped newlines in middle of quotes
    .replace(/([^\\])\n/g, '$1\\n');

  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  // 6. Repair truncated braces / quotes
  try {
    const closed = repairTruncatedJsonString(cleaned);
    return JSON.parse(closed);
  } catch {
    // continue
  }

  // 7. Last resort: replace unescaped double quotes inside values (often Chinese quotation marks)
  try {
    const sanitizedQuotes = candidate.replace(
      /:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      (_match, inner) => `: "${inner.replace(/"/g, '”')}"`
    );
    return JSON.parse(repairTruncatedJsonString(sanitizedQuotes));
  } catch {
    return null;
  }
}

const WORD_COUNT_SCALE_REGEX = /(?:万字|短篇|中篇|长篇|连载|盐选)/;

export function hasWordCountScaleTag(tags?: string[]): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => WORD_COUNT_SCALE_REGEX.test(t));
}

export function extractScaleRequirementHint(
  outlineText: string,
  systemSettings?: Record<string, string[]>,
  chapterWords?: number | string
): {
  lockedScaleTags: string[];
  estimatedChapterRange: string;
  estimatedVolumeCount: string;
  promptConstraint: string;
} {
  const userScaleTags = (systemSettings?.['foundation.scale_structure'] || [])
    .map((s) => s.trim())
    .filter(Boolean);
  const wordsPerCh = Math.max(800, Number(chapterWords) || 3000);

  // Check if user already explicitly chose a scale
  if (userScaleTags.length > 0 && hasWordCountScaleTag(userScaleTags)) {
    const joined = userScaleTags.join('、');
    let estimatedChapterRange = '按设定匹配';
    let estimatedVolumeCount = '3~4卷';
    if (/三万字|短篇/.test(joined)) {
      estimatedChapterRange = `约 8~15 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '1 卷（或直接以 2~3 个单元完成起承转合）';
    } else if (/八万字|盐选|中篇/.test(joined)) {
      estimatedChapterRange = `约 20~35 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '2 卷（上/下卷或三幕紧凑结构）';
    } else if (/十五万字|轻长篇/.test(joined)) {
      estimatedChapterRange = `约 45~65 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '2~3 卷';
    } else if (/三十万字/.test(joined)) {
      estimatedChapterRange = `约 90~120 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '3~4 卷';
    } else if (/五十万字/.test(joined)) {
      estimatedChapterRange = `约 150~200 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '4~5 卷';
    } else if (/八十万字/.test(joined)) {
      estimatedChapterRange = `约 240~320 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '4~6 卷';
    } else if (/百万字/.test(joined)) {
      estimatedChapterRange = `约 300~450 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '5~8 卷';
    } else if (/两百万|三百万/.test(joined)) {
      estimatedChapterRange = `约 600~1000+ 章（单章约 ${wordsPerCh} 字）`;
      estimatedVolumeCount = '6~12 卷';
    }
    return {
      lockedScaleTags: userScaleTags,
      estimatedChapterRange,
      estimatedVolumeCount,
      promptConstraint: `【篇幅规模已由作者明确锁定】：${joined}（预计全书总跨度 ${estimatedChapterRange}，分卷建议 ${estimatedVolumeCount}）。严禁擅自更改为“百万字长篇”或偏离该体量的分卷章节数！`,
    };
  }

  // Otherwise inspect outline text for explicit scale clues (ignoring negated phrases)
  const cleanOutline = (outlineText || '').replace(/(?:并非|不是|非|不写|不用)[^，。！？\n]{0,8}(?:百万字|长篇|短篇|中篇)/g, '');
  let inferredHint = '';
  let estimatedChapterRange = '根据大纲事件自然容量决定';
  let estimatedVolumeCount = '2~4卷（视体量定）';

  if (/三万字|3万字|微小说|极短篇/.test(cleanOutline)) {
    inferredHint = '三万字精悍短篇';
    estimatedChapterRange = `约 8~15 章`;
    estimatedVolumeCount = '1~2 卷';
  } else if (/八万字|8万字|十万字|10万字|盐选|短中篇|中篇/.test(cleanOutline)) {
    inferredHint = '八万字盐选中篇';
    estimatedChapterRange = `约 20~35 章`;
    estimatedVolumeCount = '2 卷';
  } else if (/十五万字|15万字|二十万字|20万字|轻长篇/.test(cleanOutline)) {
    inferredHint = '十五万字轻长篇';
    estimatedChapterRange = `约 45~70 章`;
    estimatedVolumeCount = '2~3 卷';
  } else if (/三十万字|30万字/.test(cleanOutline)) {
    inferredHint = '三十万字紧凑长篇';
    estimatedChapterRange = `约 90~120 章`;
    estimatedVolumeCount = '3~4 卷';
  } else if (/五十万字|50万字/.test(cleanOutline)) {
    inferredHint = '五十万字中长篇';
    estimatedChapterRange = `约 150~200 章`;
    estimatedVolumeCount = '4~5 卷';
  } else if (/两百万|200万|三百万|300万/.test(cleanOutline)) {
    inferredHint = /三百万|300万/.test(cleanOutline) ? '三百万字超长篇连载' : '两百万字大长篇';
    estimatedChapterRange = `约 600~1000 章`;
    estimatedVolumeCount = '6~10 卷';
  }

  if (inferredHint) {
    return {
      lockedScaleTags: [inferredHint],
      estimatedChapterRange,
      estimatedVolumeCount,
      promptConstraint: `【从大纲中识别到的体量倾向】：${inferredHint}（预计 ${estimatedChapterRange}，分卷建议 ${estimatedVolumeCount}）。请严格按此真实体量规划篇幅与分卷章节跨度，严禁盲目强行按百万字长篇处理！`,
    };
  }

  return {
    lockedScaleTags: userScaleTags,
    estimatedChapterRange: '严禁盲目默认百万字，须按当前大纲矛盾容量客观判定',
    estimatedVolumeCount: '根据真实故事体量规划 2~6 卷',
    promptConstraint: `【篇幅规模判定铁律】：严禁盲目默认判定为“百万字商业标准长篇”！必须先根据当前大纲的事件数量、势力层级、核心矛盾跨度客观评估真实体量：若是单一事件/短线情感拉扯应选「八万字盐选中篇」或「十五万字轻长篇」；若是紧凑多卷成长应选「三十万字紧凑长篇」或「五十万字中长篇」；只有具备多地图大世界观长线史诗铺垫时才选「百万字商业标准长篇」以上。且后续分卷 chapterSpan 必须与所选篇幅真实匹配！`,
  };
}

/**
 * Scans markdown or plain text against all 11 modules and 220 preset fields,
 * automatically detecting and checking matched options.
 */
export function extract11SettingsFromText(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!text || text.trim().length === 0) return result;

  // Strip negated statements like "不是百万字" / "非长篇" before scanning
  const sanitizedForScan = text.replace(/(?:并非|不是|非|不写|不用)[^，。！？\n]{0,8}(?:百万字|长篇|短篇|中篇)/g, '');
  const normalizedText = sanitizedForScan.toLowerCase();

  for (const mod of NOVEL_SETTING_MODULES) {
    for (const field of mod.fields) {
      const fieldKey = `${mod.id}.${field.id}`;
      const matchedOptions: string[] = [];

      // Check explicit mention like: "题材类型: 都市异能, 悬疑" or "**篇幅规模**: 三十万字"
      const fieldHeaderPattern = new RegExp(
        `(?:${field.label.slice(0, 4)}|${field.id})[：:\\s]*([^\\n\\r]+)`,
        'i'
      );
      const headerMatch = sanitizedForScan.match(fieldHeaderPattern);
      const headerText = headerMatch ? headerMatch[1].toLowerCase() : '';

      for (const opt of field.options) {
        // Strip parentheses from option for matching (e.g. "第三人称限知（紧贴主角）" -> "第三人称限知")
        const cleanOpt = opt.replace(/（[^）]+）|\([^)]+\)/g, '').trim();
        const cleanOptLower = cleanOpt.toLowerCase();

        // 1. Direct match in explicit field line
        if (
          headerText &&
          (headerText.includes(cleanOptLower) ||
            (cleanOpt.length >= 3 && headerText.includes(cleanOpt.slice(0, 3))))
        ) {
          if (!matchedOptions.includes(opt)) matchedOptions.push(opt);
          continue;
        }

        // 2. High-precision fulltext scan for distinctive options (length >= 3 or unique)
        if (cleanOptLower.length >= 3 && normalizedText.includes(cleanOptLower)) {
          if (!matchedOptions.includes(opt)) matchedOptions.push(opt);
        } else if (
          cleanOptLower.length === 2 &&
          ['仙侠', '古言', '末世', '玄幻', '悬疑'].includes(cleanOptLower)
        ) {
          if (normalizedText.includes(cleanOptLower) && !matchedOptions.includes(opt)) {
            matchedOptions.push(opt);
          }
        }
      }

      // Prevent scale_structure from having multiple conflicting word-count options
      if (fieldKey === 'foundation.scale_structure' && matchedOptions.length > 1) {
        const wordCountOpts = matchedOptions.filter((o) => /万字|短篇|中篇|长篇/.test(o));
        const structOpts = matchedOptions.filter((o) => !/万字|短篇|中篇|长篇/.test(o));
        result[fieldKey] = [
          ...(wordCountOpts.length > 0 ? [wordCountOpts[wordCountOpts.length - 1]] : []),
          ...structOpts,
        ].slice(0, 3);
      } else if (matchedOptions.length > 0) {
        // Limit options per field to top 3 to keep prompt focused
        result[fieldKey] = matchedOptions.slice(0, 3);
      }
    }
  }

  return result;
}

/**
 * Heuristically parses pure markdown outline into a structured object,
 * extracting outline, characters, world rules, volume plans, and 11-module settings.
 */
export function parseMarkdownOutlineFallback(rawText: string): ParsedImproveOutlineResult {
  const lines = rawText.split('\n');
  let currentSection = 'outline';
  const outlineLines: string[] = [];
  const characterLines: string[] = [];
  const worldLines: string[] = [];
  const blurbLines: string[] = [];
  const titles: string[] = [];
  const volumePlans: Array<{
    volumeIndex: number;
    title: string;
    chapterSpan: string;
    coreConflict: string;
    climaxGoal: string;
  }> = [];
  const foreshadows: Array<{
    name: string;
    plantedChapter: number;
    expectedResolveChapter?: string;
    note?: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Section headers detection
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:主线大纲|故事大纲|大纲|核心大纲|情节大纲)/i.test(trimmed)) {
      currentSection = 'outline';
      continue;
    }
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:主要角色|角色设定|人物设定|人物档案|登场角色|人设)/i.test(trimmed)) {
      currentSection = 'characters';
      continue;
    }
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:世界观|力量体系|社会规则|背景设定|设定铁律)/i.test(trimmed)) {
      currentSection = 'world';
      continue;
    }
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:商业简介|黄金简介|简介|作品简介)/i.test(trimmed)) {
      currentSection = 'blurb';
      continue;
    }
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:分卷规划|分卷蓝图|卷纲|篇章结构)/i.test(trimmed)) {
      currentSection = 'volume';
      continue;
    }
    if (/^(?:#+|一|二|三|四|五|六|七|八|九|十|\d+)[、.：:\s]*(?:伏笔台账|伏笔清单|长线伏笔|核心伏笔)/i.test(trimmed)) {
      currentSection = 'foreshadow';
      continue;
    }

    // Book titles detection
    const titleMatch = trimmed.match(/(?:备选书名|建议书名|书名)[：:\s]*《?([^》\n,，;]+)》?/);
    if (titleMatch && titleMatch[1]) {
      const candidates = titleMatch[1].split(/[/、,，;]/).map((s) => s.trim().replace(/^《|》$/g, '')).filter(Boolean);
      titles.push(...candidates);
    }

    // Volume detection inside volume section or anywhere
    const volMatch = trimmed.match(/第([一二三四五六七八九十\d]+)卷[：:\s]*([^\n(（]+)(?:[（(]([^）)]+)[）)])?/);
    if (volMatch) {
      const numMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const rawNum = volMatch[1];
      const volIdx = Number(rawNum) || numMap[rawNum] || volumePlans.length + 1;
      const volTitle = volMatch[2].trim();
      const span = volMatch[3] ? volMatch[3].trim() : `第${(volIdx - 1) * 30 + 1}章 - 第${volIdx * 30}章`;

      // Peek next 1-2 lines for conflict/goal
      let conflict = '';
      let goal = '';
      if (i + 1 < lines.length && /矛盾|冲突|阻力/i.test(lines[i + 1])) {
        conflict = lines[i + 1].replace(/^[^\s：:]+[：:]\s*/, '').trim();
      }
      if (i + 2 < lines.length && /高潮|爽点|终局|目标/i.test(lines[i + 2])) {
        goal = lines[i + 2].replace(/^[^\s：:]+[：:]\s*/, '').trim();
      }

      volumePlans.push({
        volumeIndex: volIdx,
        title: volTitle,
        chapterSpan: span,
        coreConflict: conflict || '各方势力暗流涌动，主角面临重大危机',
        climaxGoal: goal || '卷末爆发大战，实现阶层或境界跃迁',
      });
      continue;
    }

    // Foreshadow detection
    if (currentSection === 'foreshadow' || /伏笔|钩子/i.test(trimmed)) {
      const hookMatch = trimmed.match(/[-*•\d.、\s]*([^：:]+)[：:]\s*(.+)/);
      if (hookMatch && hookMatch[1].length <= 20) {
        foreshadows.push({
          name: hookMatch[1].trim(),
          plantedChapter: 1,
          expectedResolveChapter: '第30章',
          note: hookMatch[2].trim(),
        });
        continue;
      }
    }

    // Distribute lines to current section
    if (currentSection === 'characters') {
      characterLines.push(line);
    } else if (currentSection === 'world') {
      worldLines.push(line);
    } else if (currentSection === 'blurb') {
      blurbLines.push(line);
    } else {
      outlineLines.push(line);
    }
  }

  // Scan all 11 modules settings from the full text
  const detectedSettings = extract11SettingsFromText(rawText);

  // If outline is empty, use the rawText as outline
  const finalOutline = outlineLines.join('\n').trim() || rawText.trim();
  const finalCharacters = characterLines.join('\n').trim();
  const finalWorld = worldLines.join('\n').trim();
  const finalBlurb = blurbLines.join('\n').trim();

  // If no volume plans detected, create scale-adapted default skeleton from outline
  if (volumePlans.length === 0) {
    const scaleStr = (detectedSettings['foundation.scale_structure'] || []).join(' ');
    if (/三万字|短篇/.test(scaleStr)) {
      volumePlans.push({
        volumeIndex: 1,
        title: '全篇·起承转合',
        chapterSpan: '第1章 - 第12章',
        coreConflict: '核心危机爆发与情感/局势反转',
        climaxGoal: '干脆利落收束主线结局',
      });
    } else if (/八万字|盐选|中篇/.test(scaleStr)) {
      volumePlans.push(
        { volumeIndex: 1, title: '上卷·入局拉扯', chapterSpan: '第1章 - 第15章', coreConflict: '开局破冰与矛盾升温', climaxGoal: '身份/关系重大转折' },
        { volumeIndex: 2, title: '下卷·破局收官', chapterSpan: '第16章 - 第30章', coreConflict: '终极真相揭露与反击', climaxGoal: '闭合主线达成终局' }
      );
    } else if (/十五万字|轻长篇/.test(scaleStr)) {
      volumePlans.push(
        { volumeIndex: 1, title: '第一卷·初露锋芒', chapterSpan: '第1章 - 第20章', coreConflict: '立足破局与初遇交锋', climaxGoal: '完成初期阶段逆袭' },
        { volumeIndex: 2, title: '第二卷·暗流涌动', chapterSpan: '第21章 - 第40章', coreConflict: '多方势力角逐与伏笔兑现', climaxGoal: '核心危机大爆发' },
        { volumeIndex: 3, title: '第三卷·终局收束', chapterSpan: '第41章 - 第60章', coreConflict: '揭开真相与终极对决', climaxGoal: '完结主线与关系归宿' }
      );
    } else {
      volumePlans.push(
        { volumeIndex: 1, title: '第一卷·入局起势', chapterSpan: '第1章 - 第30章', coreConflict: '开局危机受困与核心优势觉醒', climaxGoal: '打破初期死局，建立立足点' },
        { volumeIndex: 2, title: '第二卷·风起云涌', chapterSpan: '第31章 - 第65章', coreConflict: '多方势力冲突升级与暗线推进', climaxGoal: '卷末大战或重大反转跃迁' },
        { volumeIndex: 3, title: '第三卷·终局收束', chapterSpan: '第66章 - 第100章', coreConflict: '揭开终极真相与最终决战', climaxGoal: '宿命对决完结，闭合全书锚点' }
      );
    }
  }

  return {
    improvedOutline: finalOutline,
    characters: finalCharacters || undefined,
    worldView: finalWorld || undefined,
    commercialBlurb: finalBlurb || undefined,
    alternateTitles: titles.length > 0 ? Array.from(new Set(titles)) : undefined,
    systemSettings: detectedSettings,
    volumePlan: volumePlans,
    foreshadowLedger: foreshadows.length > 0 ? foreshadows : undefined,
  };
}

/**
 * Normalizes keys in case model returned snake_case or slightly different names
 */
function normalizeParsedOutlineData(obj: any): ParsedImproveOutlineResult {
  if (!obj || typeof obj !== 'object') {
    return { improvedOutline: '' };
  }

  const improvedOutline =
    obj.improvedOutline ||
    obj.realignedOutline ||
    obj.outline ||
    obj.mainOutline ||
    obj.improved_outline ||
    obj.storyOutline ||
    obj.dagan ||
    '';

  const characters =
    obj.characters ||
    obj.characterList ||
    obj.roles ||
    obj.characterProfiles ||
    obj.cast ||
    undefined;

  const worldView =
    obj.worldView ||
    obj.world ||
    obj.world_view ||
    obj.worldSetting ||
    obj.rules ||
    undefined;

  const commercialBlurb =
    obj.commercialBlurb ||
    obj.blurb ||
    obj.commercial_blurb ||
    obj.summary ||
    obj.intro ||
    undefined;

  const alternateTitles =
    obj.alternateTitles ||
    obj.titles ||
    obj.alternate_titles ||
    obj.suggestedTitles ||
    undefined;

  const suggestedGenre = obj.suggestedGenre || obj.genre || undefined;
  const suggestedStyle = obj.suggestedStyle || obj.style || undefined;
  const suggestedPov = obj.suggestedPov || obj.pov || undefined;

  let systemSettings = obj.systemSettings || obj.novelSettings || obj.settings || obj.system_settings;
  if (!systemSettings || typeof systemSettings !== 'object' || Array.isArray(systemSettings)) {
    systemSettings = undefined;
  }

  const volumePlan = Array.isArray(obj.volumePlan)
    ? obj.volumePlan
    : Array.isArray(obj.volumes)
    ? obj.volumes
    : Array.isArray(obj.volume_plan)
    ? obj.volume_plan
    : undefined;

  const foreshadowLedger = Array.isArray(obj.foreshadowLedger)
    ? obj.foreshadowLedger
    : Array.isArray(obj.foreshadows)
    ? obj.foreshadows
    : Array.isArray(obj.foreshadow_ledger)
    ? obj.foreshadow_ledger
    : undefined;

  const lorebookEntries = Array.isArray(obj.lorebookEntries)
    ? obj.lorebookEntries
    : Array.isArray(obj.lorebook)
    ? obj.lorebook
    : Array.isArray(obj.lorebook_entries)
    ? obj.lorebook_entries
    : undefined;

  return {
    improvedOutline: typeof improvedOutline === 'string' ? improvedOutline : JSON.stringify(improvedOutline),
    characters: typeof characters === 'string' ? characters : characters ? JSON.stringify(characters) : undefined,
    worldView: typeof worldView === 'string' ? worldView : worldView ? JSON.stringify(worldView) : undefined,
    commercialBlurb: typeof commercialBlurb === 'string' ? commercialBlurb : undefined,
    alternateTitles: Array.isArray(alternateTitles) ? alternateTitles.filter(Boolean).map(String) : undefined,
    suggestedGenre: typeof suggestedGenre === 'string' ? suggestedGenre : undefined,
    suggestedStyle: typeof suggestedStyle === 'string' ? suggestedStyle : undefined,
    suggestedPov: typeof suggestedPov === 'string' ? suggestedPov : undefined,
    systemSettings,
    volumePlan,
    foreshadowLedger,
    lorebookEntries,
  };
}

/**
 * Main entrance to parse AI's response for outline improvement.
 * Guarantees that:
 * 1. Clean or repaired JSON is parsed seamlessly.
 * 2. If the model returns markdown or text, the heuristic fallback extracts the 11 modules and all structured fields.
 * 3. Even if systemSettings in JSON has few entries, it combines full-text scanning to maximize 11-module coverage.
 */
export function parseImproveOutlineResponse(rawContent: string): ParseOutlineOutput {
  const raw = (rawContent || '').trim();

  // 1. Try strict / repaired JSON
  const parsedJson = repairAndParseJson<any>(raw);
  if (parsedJson && typeof parsedJson === 'object') {
    const normalized = normalizeParsedOutlineData(parsedJson);

    // If normalized has an outline or realigned outline
    if (normalized.improvedOutline && normalized.improvedOutline.trim().length > 15) {
      // If the model gave systemSettings, merge them; also supplement with fulltext scanner for missing modules!
      const supplementalSettings = extract11SettingsFromText(
        `${normalized.improvedOutline}\n${normalized.characters || ''}\n${normalized.worldView || ''}`
      );
      const mergedSettings: Record<string, string[]> = { ...(normalized.systemSettings || {}) };

      // Fill in any modules the LLM missed in JSON using fulltext recognition
      Object.entries(supplementalSettings).forEach(([k, opts]) => {
        if (!mergedSettings[k] || mergedSettings[k].length === 0) {
          mergedSettings[k] = opts;
        }
      });

      normalized.systemSettings = mergedSettings;

      let settingCount = 0;
      Object.values(mergedSettings).forEach((v) => {
        if (Array.isArray(v)) settingCount += v.length;
      });

      return {
        data: normalized,
        mode: 'strict_json',
        extractedSettingsCount: settingCount,
      };
    }
  }

  // 2. Fallback to heuristic markdown extraction
  const fallbackData = parseMarkdownOutlineFallback(raw);
  let fallbackCount = 0;
  if (fallbackData.systemSettings) {
    Object.values(fallbackData.systemSettings).forEach((v) => {
      if (Array.isArray(v)) fallbackCount += v.length;
    });
  }

  return {
    data: fallbackData,
    mode: 'heuristic_markdown',
    extractedSettingsCount: fallbackCount,
  };
}

/**
 * Robust parser for Chapter Outlines generation response
 */
export function parseChapterOutlinesResponse(
  rawContent: string,
  startChap: number
): Array<{
  chapterIndex: number;
  title: string;
  summary: string;
  volumeTag?: string;
  hookNote?: string;
}> {
  const parsed = repairAndParseJson<any>(rawContent);
  if (parsed && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
    return parsed.chapters.map((c: any, idx: number) => ({
      chapterIndex: Number(c.chapterIndex) || startChap + idx,
      title: String(c.title || `第${startChap + idx}章推进`).replace(/^第[0-9零一二三四五六七八九十百千万]+章[\s:：·—-]*/u, '').trim(),
      summary: String(c.summary || '').trim(),
      volumeTag: c.volumeTag ? String(c.volumeTag) : undefined,
      hookNote: c.hookNote ? String(c.hookNote) : undefined,
    }));
  }

  // Heuristic markdown list parser for chapters:
  // e.g. "第1章：暗夜苏醒\n主角在病房苏醒，发现世界异变..."
  const chapters: Array<{
    chapterIndex: number;
    title: string;
    summary: string;
    volumeTag?: string;
    hookNote?: string;
  }> = [];

  const lines = rawContent.split('\n');
  let currentChap: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const chapHeaderMatch = trimmed.match(/^第([0-9零一二三四五六七八九十百千万]+)章[\s:：·—]*(.+)/);
    if (chapHeaderMatch) {
      if (currentChap) chapters.push(currentChap);
      const rawNum = chapHeaderMatch[1];
      const chapNum = parseInt(rawNum, 10) || startChap + chapters.length;
      currentChap = {
        chapterIndex: chapNum,
        title: chapHeaderMatch[2].trim(),
        summary: '',
      };
      continue;
    }

    if (currentChap) {
      if (/hook|钩子|卡点/i.test(trimmed)) {
        currentChap.hookNote = trimmed.replace(/^[^:：]+[:：]\s*/, '');
      } else if (trimmed) {
        currentChap.summary += (currentChap.summary ? '\n' : '') + trimmed;
      }
    }
  }

  if (currentChap) chapters.push(currentChap);

  return chapters;
}
