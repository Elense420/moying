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

/**
 * Scans markdown or plain text against all 11 modules and 220 preset fields,
 * automatically detecting and checking matched options.
 */
export function extract11SettingsFromText(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!text || text.trim().length === 0) return result;

  const normalizedText = text.toLowerCase();

  for (const mod of NOVEL_SETTING_MODULES) {
    for (const field of mod.fields) {
      const fieldKey = `${mod.id}.${field.id}`;
      const matchedOptions: string[] = [];

      // Check explicit mention like: "题材类型: 都市异能, 悬疑" or "**篇幅规模**: 百万字"
      const fieldHeaderPattern = new RegExp(
        `(?:${field.label.slice(0, 4)}|${field.id})[：:\\s]*([^\\n\\r]+)`,
        'i'
      );
      const headerMatch = text.match(fieldHeaderPattern);
      const headerText = headerMatch ? headerMatch[1].toLowerCase() : '';

      for (const opt of field.options) {
        // Strip parentheses from option for matching (e.g. "第三人称限知（紧贴主角）" -> "第三人称限知")
        const cleanOpt = opt.replace(/（[^）]+）|\([^)]+\)/g, '').trim();
        const cleanOptLower = cleanOpt.toLowerCase();

        // 1. Direct match in explicit field line
        if (headerText && (headerText.includes(cleanOptLower) || (cleanOpt.length >= 2 && headerText.includes(cleanOpt.slice(0, 3))))) {
          if (!matchedOptions.includes(opt)) matchedOptions.push(opt);
          continue;
        }

        // 2. High-precision fulltext scan for distinctive options (length >= 3 or unique)
        if (cleanOptLower.length >= 3 && normalizedText.includes(cleanOptLower)) {
          if (!matchedOptions.includes(opt)) matchedOptions.push(opt);
        } else if (cleanOptLower.length === 2 && ['仙侠', '古言', '末世', '玄幻', '悬疑', '短篇', '长篇'].includes(cleanOptLower)) {
          if (normalizedText.includes(cleanOptLower) && !matchedOptions.includes(opt)) {
            matchedOptions.push(opt);
          }
        }
      }

      // Limit options per field to top 3 to keep prompt focused
      if (matchedOptions.length > 0) {
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

  // If no volume plans detected, create default 3-volume skeleton from outline
  if (volumePlans.length === 0) {
    volumePlans.push(
      { volumeIndex: 1, title: '初入危局·锋芒初试', chapterSpan: '第1章 - 第30章', coreConflict: '生存受困与金手指觉醒', climaxGoal: '打破开局死局，建立初步立足点' },
      { volumeIndex: 2, title: '名动四方·惊澜再起', chapterSpan: '第31章 - 第70章', coreConflict: '宗门/势力间权力倾轧与利益争夺', climaxGoal: '卷末大战力挽狂澜，名声大噪' },
      { volumeIndex: 3, title: '登临绝顶·终局收束', chapterSpan: '第71章 - 第120章', coreConflict: '揭开终极真相与终极反派决战', climaxGoal: '宿命对决完结，达成全书最高追求' }
    );
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
