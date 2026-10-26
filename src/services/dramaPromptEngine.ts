import {
  DramaProject,
  DramaTrackPreset,
  HOT_DRAMA_TRACKS,
  DramaCharacterAsset,
  DramaSceneAnchor,
  DramaEpisodePlanItem,
  DramaEpisode,
  DramaShot,
  DramaScriptFormat,
  DRAMA_SCRIPT_FORMATS,
  DramaVisualStyle,
  DramaAspectRatio,
  DramaAudienceChannel,
  DramaNarrativeBible,
  DramaForeshadowItem,
  DramaForeshadowCategory,
  DramaForeshadowStatus,
} from '../types';
import { generateUUID } from '../utils/uuid';

export const EMPTY_NARRATIVE_BIBLE: DramaNarrativeBible = {
  worldSettingAndRules: '',
  storylineOverview: '',
  mainPlotline: '',
  subPlotlines: '',
  frameworkStructure: '',
  pacingStrategy: '',
  characterArcsAndRelations: '',
};

export interface DramaConsultantPreSpecs {
  aspectRatioPref: DramaAspectRatio | 'auto';
  episodeDurationPref: number | 'auto';
  totalEpisodesPref: number | 'auto';
}

export interface DramaConsultantForeshadowSeed {
  name: string;
  category: DramaForeshadowCategory;
  ownerOrRelation: string;
  plantedEpisode: number;
  expectedPayoffEpisode: string;
  visualAnchorNote: string;
  payoffNote: string;
}

export interface DramaPitchProposal {
  title: string;
  logline: string;
  targetAudience: string;
  golden3SecHook: string;
  totalPlannedEpisodes?: number;
  paywallEpisodeIndex: number;
  synopsis: string;
  narrativeBible?: DramaNarrativeBible;
}

export interface DramaConsultantCharacterSeed {
  name: string;
  roleTag: string;
  ageAndArchetype: string;
  appearanceZh: string;
  visualPromptEn: string;
  voicePersona: string;
  signatureTrait: string;
}

export interface DramaConsultantOption {
  optionId: string;
  directionTag: string;
  title: string;
  trackId: string;
  channel: DramaAudienceChannel;
  visualStyle: DramaVisualStyle;
  aspectRatio: DramaAspectRatio;
  episodeDurationSec?: number;
  totalPlannedEpisodes?: number;
  totalEpisodesReason?: string;
  paywallEpisodeIndex: number;
  marketFitReason: string;
  logline: string;
  targetAudience: string;
  golden3SecHook: string;
  synopsis: string;
  narrativeBible?: DramaNarrativeBible;
  seedForeshadowing?: DramaConsultantForeshadowSeed[];
  seedCharacters: DramaConsultantCharacterSeed[];
}

export interface DramaConsultantResponse {
  marketTrendAnalysis: string;
  consultantReply: string;
  options: DramaConsultantOption[];
  followUpChips: string[];
}

export interface DramaDurationSpec {
  durationSec: number;
  label: string;
  minWords: number;
  maxWords: number;
  sceneRange: string;
  beatRange: string;
  recommendedShots: number;
}

export const DRAMA_DURATION_PRESETS: Array<{ sec: number; title: string; badge: string }> = [
  { sec: 60, title: '60秒 · 极速卡点短剧', badge: '约 380~520 字/集' },
  { sec: 90, title: '90秒 · 标准竖屏漫剧', badge: '约 550~750 字/集' },
  { sec: 120, title: '120秒 · 深度拉扯短剧', badge: '约 750~1000 字/集' },
  { sec: 180, title: '180秒 · 精品动态漫(3分钟)', badge: '约 1100~1450 字/集' },
  { sec: 240, title: '240秒 · 中篇叙事漫剧(4分钟)', badge: '约 1450~1900 字/集' },
];

/**
 * 将「单集目标时长（秒）」与「甲方标准剧本目标字数、场次数、动作台词交互条数、建议分镜数」做精确工业级挂钩。
 * 商业漫剧 TTS 正常配音语速约 4~4.5 字/秒，叠加场头与极简 △ 动作白描行后，综合剧本字数约为 6.1~8.3 字/秒。
 */
export function getEpisodeDurationSpec(rawSec?: number): DramaDurationSpec {
  const sec = Math.max(45, Math.min(480, Math.round(Number(rawSec) || 90)));

  if (sec <= 65) {
    return {
      durationSec: sec,
      label: '极速卡点竖屏短剧',
      minWords: Math.round(sec * 6.3),
      maxWords: Math.round(sec * 8.5),
      sceneRange: '1~2 个紧凑场次',
      beatRange: '10~14 条精炼动作与台词交互',
      recommendedShots: 6,
    };
  }
  if (sec <= 100) {
    return {
      durationSec: sec,
      label: '标准竖屏商业漫剧',
      minWords: Math.round(sec * 6.1),
      maxWords: Math.round(sec * 8.3),
      sceneRange: '2~3 个紧凑场次',
      beatRange: '14~20 条精炼动作与台词交互',
      recommendedShots: 8,
    };
  }
  if (sec <= 145) {
    return {
      durationSec: sec,
      label: '中密拉扯叙事短剧',
      minWords: Math.round(sec * 6.2),
      maxWords: Math.round(sec * 8.3),
      sceneRange: '2~4 个完整场次',
      beatRange: '20~26 条动作与台词交锋',
      recommendedShots: Math.max(10, Math.round(sec / 11)),
    };
  }
  if (sec <= 200) {
    return {
      durationSec: sec,
      label: '精品长单集动态漫',
      minWords: Math.round(sec * 6.1),
      maxWords: Math.round(sec * 8.1),
      sceneRange: '3~5 个起承转合场次',
      beatRange: '28~36 条多轮动作与台词博弈',
      recommendedShots: Math.max(14, Math.round(sec / 12)),
    };
  }
  return {
    durationSec: sec,
    label: '中长篇深度动态漫',
    minWords: Math.round(sec * 6.0),
    maxWords: Math.round(sec * 7.9),
    sceneRange: `${Math.max(4, Math.floor(sec / 55))}~${Math.max(5, Math.ceil(sec / 40))} 个层次场次`,
    beatRange: `${Math.round(sec * 0.15)}~${Math.round(sec * 0.2)} 条完整动作与台词推进`,
    recommendedShots: Math.min(24, Math.max(16, Math.round(sec / 12))),
  };
}

/**
 * 商业漫剧总导演底层法则（物理级隔离个人小说 XP 偏好，100% 遵循大众短视频与 AI 漫剧行业真实交付规范）
 */
const COMMERCIAL_DRAMA_CONSTITUTION = `【商业 AI 漫剧 / 短剧工业化创作铁律（严禁违背）】
1. 赛道与受众导向：本模块为正规大众商业漫剧/短剧剧本创作，100% 依附抖音/快手/红果/B站动态漫/海外 ReelShort 等主流平台热门赛道趋势，严禁混入私人小众XP癖好或冗长文艺散文腔。
2. 黄金前 3 秒生死线：每集开场前 3 秒必须直接抛出强视觉动作、极端危机倒计时、打脸冲突或惊悚异象，严禁慢节奏风景铺垫或日常寒暄。
3. 编剧文学本与后期分镜本严格分层：
   - 写【甲方标准文学剧本】时：必须极简、干脆、留白！严禁在剧本正文里堆砌摄影机焦段参数、长篇外貌复读、抽象心理剖析或英文生图Tag！只写「场头 + 出场人物 + △极简动作白描（一句一动，10-28字）+ 角色精炼台词 + 关键【音效】」。
   - 拆【后期 AI 分镜执行单】时：再将文学剧本中的每一条 △ 动作与台词拆解为具体的景别运镜，并自动织入角色固定立绘外貌词供即梦/可灵/Vidu/MJ生图。
4. 时长与字数体量强挂钩：单集设定的成片时长越长，剧本场次深度、人物交锋回合数与总字数必须按比例同步增长；既严禁将长单集缩水写成几百字短梗，也严禁靠废话描写注水。
5. 台词短促抓耳：单句台词严格控制在 30 字以内，口语化、情绪直接、适合 AI 配音（TTS）卡点输出。
6. 集末断章强钩子：每集最后一行必须停在“危机骤降 / 底牌揭晓前一秒 / 惊天反转定格”的最高悬念处。`;

export function getTrackByProject(project: DramaProject): DramaTrackPreset {
  return (
    HOT_DRAMA_TRACKS.find((t) => t.id === project.trackId) ||
    HOT_DRAMA_TRACKS[0]
  );
}

export function getScriptFormatSpec(format?: DramaScriptFormat) {
  return (
    DRAMA_SCRIPT_FORMATS.find((f) => f.id === format) ||
    DRAMA_SCRIPT_FORMATS[0]
  );
}

/**
 * 本地毫秒级清洗甲方 Word / 飞书 / Pandoc 导出的剧本乱码标记（如 [xxx]{.mark}、乱三角号、全半角冒号混用）
 */
export function cleanMessyClientScriptLocal(rawText: string): string {
  if (!rawText) return '';
  return rawText
    // Strip Pandoc Word highlight syntax: [text]{.mark} -> text
    .replace(/\[([^\]]*?)\]\{\.mark\}/g, '$1')
    // Strip residual pandoc/html attributes like {.underline} or <u>
    .replace(/\{\.[a-zA-Z0-9_-]+\}/g, '')
    // Normalize various triangle markers (▲, Δ, ▷, ▸) at line start to standard "△ "
    .replace(/^[ \t]*[▲Δ▷▸△][ \t]*/gm, '△ ')
    // Normalize escaped quotes from docx conversions
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 获取三大主流甲方标准剧本格式的精确排版指令
 */
function buildFormatRulePrompt(format: DramaScriptFormat, epIdx: number): string {
  if (format === 'manju_minimal') {
    return `【严格遵循「国漫/动态漫 极简音效场次本」行业排版规范】
1. 首行写集标题：第${epIdx}集：[简短有力的标题]
2. 每个场次开头两行格式：
   ${epIdx}-1 [具体地点（若有空间切换可用“转”）] [日/夜] [内/外]
   出场人物：[本场出现的全部角色名，顿号分隔]
3. 动作描写：不加三角符号，单独成行，极致精炼白描！一句只写一个清晰动作（10~25字，如：“沈寂停步，回头扫视二人，冷笑。”、“防爆门轰然升起！”），严禁写小说式心理活动和修饰词藻！
4. 音效标注：遇到关键打斗、开关门、爆炸、警报或转场时，单独一行写：【音效】：[简短音效描述]
5. 台词格式：将情绪或语气直接写在冒号前或括号内，如：
   林薇薇恼怒：沈寂你疯了吧？！
   沈寂（冷漠）：从现在起，别再来敲我的门。
   沈寂（OS）：距离血月冰封，还有七十二小时！`;
  }

  if (format === 'overseas_bilingual') {
    return `【严格遵循「出海短剧 △ 中英双语对照本（ReelShort/DramaBox规范）」排版】
1. 每个场次头加粗：**${epIdx}-1 [地点（若为回忆写“闪回 -- 地点”）] -- [日/夜] -- [内景/外景].**
2. 出场人物行：出场人物：[角色A、角色B]
3. 画面动作行：所有纯动作、反应、道具变化一律以“△ ”开头！每条 △ 控制在 28 字以内，只写干净利落的动作结果（如：“△ 沈寂猛地推开金属箱，合同散落一桌。”），严禁混入镜头术语或冗长描写。
4. 双语台词行：先写一行中文台词，紧接着下一行写地道、短促、有戏剧张力的美式英语口语台词（严禁出现任何 {.mark} 符号）：
   沈寂：（眼神冰冷，轻嗤）三个小时内，我要看到八十亿现金到账。
   Within three hours, I want eight billion in cash in my account.`;
  }

  // Default: 'triangle_standard'
  return `【严格遵循「国内主流短剧/漫剧 △ 三角标场次本」行业排版规范】
1. 每个场次头格式：**${epIdx}-1 [具体地点（回忆标“闪回 -- 地点”）] -- [日/夜] -- [内景/外景]**
2. 场头下一行写：出场人物：[本场出场角色名]
3. △ 极简动作行：凡是画面动作、神态反应、突发事件，一律单独成行并以“△ ”开头！
   - 铁律：一个 △ 就是后期的一镜画面，字数严格压在 8~28 字！只写直观可见的物理动作（例如：“△ 沈寂猛地睁眼，抬手看了一眼腕表。”、“△ “砰！”防爆门重重合拢，火花四溅。”）。
   - 严禁在 △ 里写长篇外貌介绍、抽象心理活动、散文修辞或摄影机运镜词！
4. 关键声效可独立一行写：【音效】：[具体声响]（或直接自然融入 △ 拟声词中）。
5. 台词格式：
   角色名：（简短情绪/微动作）台词正文
   角色名（OS）：内心独白或旁白台词`;
}

const VALID_FORESHADOW_CATEGORIES: DramaForeshadowCategory[] = [
  '关键道具',
  '身世/人物伏笔',
  '核心剧情暗线',
  '规则/契约死穴',
];

const VALID_FORESHADOW_STATUSES: DramaForeshadowStatus[] = [
  'planted',
  'fermenting',
  'resolved',
];

export function normalizeNarrativeBible(raw: any): DramaNarrativeBible {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_NARRATIVE_BIBLE };
  }
  return {
    worldSettingAndRules: String(raw.worldSettingAndRules || '').trim(),
    storylineOverview: String(raw.storylineOverview || '').trim(),
    mainPlotline: String(raw.mainPlotline || '').trim(),
    subPlotlines: String(raw.subPlotlines || '').trim(),
    frameworkStructure: String(raw.frameworkStructure || '').trim(),
    pacingStrategy: String(raw.pacingStrategy || '').trim(),
    characterArcsAndRelations: String(raw.characterArcsAndRelations || '').trim(),
  };
}

export function hasPopulatedNarrativeBible(bible?: DramaNarrativeBible): boolean {
  if (!bible) return false;
  return Boolean(
    bible.mainPlotline.trim() ||
      bible.storylineOverview.trim() ||
      bible.subPlotlines.trim() ||
      bible.frameworkStructure.trim() ||
      bible.pacingStrategy.trim() ||
      bible.worldSettingAndRules.trim() ||
      bible.characterArcsAndRelations.trim()
  );
}

/**
 * 拆分场景名中可能内嵌的括号状态（如 "星耀演播厅（暴雨断电夜）" -> baseName="星耀演播厅", state="暴雨断电夜"）
 */
function splitSceneNameAndState(
  rawName: string,
  explicitState?: string
): { baseName: string; stateVariant: string } {
  const cleanedRaw = String(rawName || '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^[【《\[]|[】》\]]$/g, '')
    .trim();

  let baseName = cleanedRaw;
  let embeddedState = '';

  const bracketMatch = cleanedRaw.match(/^(.+?)[（(\[【]([^）)\]】]{1,28})[）)\]】]$/);
  if (bracketMatch) {
    baseName = bracketMatch[1].trim();
    embeddedState = bracketMatch[2].trim();
  }

  const finalState = String(explicitState || embeddedState || '').trim();
  return {
    baseName: baseName || '核心场景',
    stateVariant: finalState,
  };
}

function normalizeSceneBaseKey(name: string): string {
  return String(name || '')
    .replace(/[\s·\-—_"'“”‘’《》【】\[\]()（）:：]/g, '')
    .toLowerCase();
}

function normalizeSceneStateKey(state?: string): string {
  const raw = String(state || '').trim();
  if (!raw) return 'default';
  const compact = raw
    .replace(/[\s·\-—_"'“”‘’《》【】\[\]()（）:：]/g, '')
    .replace(/状态|形态|模式|版$/g, '')
    .toLowerCase();

  if (
    !compact ||
    compact === '常规' ||
    compact === '常规态' ||
    compact === '默认' ||
    compact === '默认态' ||
    compact === '日常' ||
    compact === '日常态' ||
    compact === '正常' ||
    compact === '标准' ||
    compact === '初始'
  ) {
    return 'default';
  }
  return compact;
}

/**
 * 核心场景视觉锚点去重与「同场景异态」智能合并引擎：
 * 1. 完全相同场景且同状态（或新状态只是默认常规态且库内已有该场景） -> 绝不重复填入（仅补充空缺描述）；
 * 2. 同一场景处于显著不同状态（如「星耀练习室 [白昼常规排练态]」vs「星耀练习室 [暴雨停电应急红光态]」） -> 自动作为新状态锚点填入！
 */
export function mergeUniqueSceneAnchors(
  existing: DramaSceneAnchor[],
  incoming: Array<Partial<DramaSceneAnchor> & { sceneName: string }>
): { merged: DramaSceneAnchor[]; addedCount: number } {
  const result: DramaSceneAnchor[] = existing.map((item) => ({ ...item }));
  let addedCount = 0;

  for (const rawItem of incoming) {
    const { baseName, stateVariant } = splitSceneNameAndState(
      rawItem.sceneName,
      rawItem.stateVariant
    );
    const baseKey = normalizeSceneBaseKey(baseName);
    if (!baseKey || baseKey === '新场景' || baseKey === '主场景') continue;

    const incomingStateKey = normalizeSceneStateKey(stateVariant);
    const sameBaseEntries = result.filter(
      (r) => normalizeSceneBaseKey(splitSceneNameAndState(r.sceneName, r.stateVariant).baseName) === baseKey
    );

    if (sameBaseEntries.length > 0) {
      // 若新流入项只是未标注特殊状态的“常规默认态”，而库中已经存在该场景，绝不重复添加！
      if (incomingStateKey === 'default') {
        const defaultTarget =
          sameBaseEntries.find((e) => normalizeSceneStateKey(e.stateVariant) === 'default') ||
          sameBaseEntries[0];
        if (!defaultTarget.visualPromptZh && rawItem.visualPromptZh) {
          defaultTarget.visualPromptZh = String(rawItem.visualPromptZh);
        }
        if (!defaultTarget.visualPromptEn && rawItem.visualPromptEn) {
          defaultTarget.visualPromptEn = String(rawItem.visualPromptEn);
        }
        if (!defaultTarget.lightingAndMood && rawItem.lightingAndMood) {
          defaultTarget.lightingAndMood = String(rawItem.lightingAndMood);
        }
        continue;
      }

      // 检查是否已有高度重合的状态（例如 "暴雨停电" vs "暴雨停电态"）
      const duplicateStateTarget = sameBaseEntries.find((e) => {
        const existStateKey = normalizeSceneStateKey(
          splitSceneNameAndState(e.sceneName, e.stateVariant).stateVariant
        );
        if (existStateKey === incomingStateKey) return true;
        if (
          existStateKey !== 'default' &&
          (existStateKey.includes(incomingStateKey) || incomingStateKey.includes(existStateKey))
        ) {
          return true;
        }
        return false;
      });

      if (duplicateStateTarget) {
        if (!duplicateStateTarget.visualPromptZh && rawItem.visualPromptZh) {
          duplicateStateTarget.visualPromptZh = String(rawItem.visualPromptZh);
        }
        if (!duplicateStateTarget.visualPromptEn && rawItem.visualPromptEn) {
          duplicateStateTarget.visualPromptEn = String(rawItem.visualPromptEn);
        }
        continue;
      }
    }

    // 全新场景，或同一场景下的全新状态变体 -> 自动归档入库！
    result.push({
      id: rawItem.id || generateUUID(),
      sceneName: baseName,
      stateVariant: incomingStateKey === 'default' ? (stateVariant || '常规态') : stateVariant,
      sourceRef: rawItem.sourceRef || '自动提取',
      lightingAndMood: String(rawItem.lightingAndMood || '戏剧化冷暖光影反差'),
      visualPromptZh: String(rawItem.visualPromptZh || ''),
      visualPromptEn: String(rawItem.visualPromptEn || ''),
    });
    addedCount += 1;
  }

  return { merged: result, addedCount };
}

/**
 * 兜底解析器：直接扫描单集剧本场头（如 `**3-2 星耀练习室（停电微光） -- 夜 -- 内景**` 或 `3-2 顶层安全屋 夜 内`），
 * 确保哪怕模型漏输出 JSON 场景数组或用户导入外部洗稿剧本，场景锚点也能 100% 自动去重归档！
 */
export function extractSceneAnchorsFromScriptFallback(
  rawScriptText: string,
  episodeIndex: number,
  visualStyle: DramaVisualStyle,
  aspectRatio: DramaAspectRatio
): Array<Partial<DramaSceneAnchor> & { sceneName: string }> {
  if (!rawScriptText) return [];
  const extracted: Array<Partial<DramaSceneAnchor> & { sceneName: string }> = [];
  const lines = rawScriptText.split('\n');

  for (const rawLine of lines) {
    const clean = rawLine.replace(/^\*\*|\*\*$/g, '').replace(/\.$/, '').trim();
    // Match "**1-2 地点 -- 日/夜 -- 内/外景**" or "1-2 地点 日 内"
    const dashMatch = clean.match(
      /^\d+\s*[-—]\s*\d+\s+(.+?)\s*(?:--|—)\s*([^-\s]+)\s*(?:--|—)\s*([^-\s]+)$/
    );
    const spaceMatch = !dashMatch
      ? clean.match(/^\d+\s*[-—]\s*\d+\s+(.+?)\s+(日|夜|黄昏|清晨|傍晚|凌晨)\s+(内|外|内景|外景|内外)$/)
      : null;

    const match = dashMatch || spaceMatch;
    if (!match) continue;

    let rawLocation = match[1]
      .replace(/^闪回\s*(?:--|—|·|\s)\s*/, '')
      .split(/\s*转\s*/)[0]
      .trim();
    const timeOfDay = match[2].trim();
    const inOut = match[3].trim();

    if (!rawLocation || rawLocation.length > 32) continue;

    const { baseName, stateVariant: bracketState } = splitSceneNameAndState(rawLocation);
    // 若场头自带括号状态（如“火灾后”/“停电”），将其定为异态；否则归为常规态以免普通日夜切换刷屏重复
    const computedState = bracketState
      ? `${bracketState}·${timeOfDay}`
      : '常规态';
    const isNight = /夜|凌晨|晚/.test(timeOfDay);

    extracted.push({
      sceneName: baseName,
      stateVariant: computedState,
      sourceRef: `第${episodeIndex}集剧本自动归档`,
      lightingAndMood: `${timeOfDay} · ${inOut} · ${isNight ? '暗调冷暖高反差光影' : '通透立体戏剧光影'}`,
      visualPromptZh: `${visualStyle}风格，${baseName}${bracketState ? `（${bracketState}）` : ''}，${timeOfDay}${inOut.includes('景') ? inOut : `${inOut}景`}固定布景，空间结构前后统一，细节丰富（无人物空镜锚点）`,
      visualPromptEn: `${visualStyle}, ${baseName}${bracketState ? ` (${bracketState})` : ''}, ${isNight ? 'dramatic night lighting' : 'cinematic daylight'}, detailed environment background, consistent architecture, ${aspectRatio.split(' ')[0]}`,
    });
  }

  return extracted;
}

function normalizeForeshadowKey(name: string): string {
  return String(name || '')
    .replace(/[\s·\-—_"'“”‘’《》【】\[\]()（）:：]/g, '')
    .toLowerCase();
}

export function mergeForeshadowingLedger(
  existing: DramaForeshadowItem[],
  incoming: Array<Partial<DramaForeshadowItem> & { action?: 'plant' | 'ferment' | 'resolve' }>,
  defaultEpisode = 1
): { merged: DramaForeshadowItem[]; updatedCount: number } {
  const result: DramaForeshadowItem[] = existing.map((item) => ({ ...item }));
  let updatedCount = 0;

  for (const raw of incoming) {
    const cleanName = String(raw.name || '').trim();
    const key = normalizeForeshadowKey(cleanName);
    if (!key) continue;

    const matched = result.find((item) => {
      const itemKey = normalizeForeshadowKey(item.name);
      return (
        itemKey === key ||
        (itemKey.length >= 3 && key.length >= 3 && (itemKey.includes(key) || key.includes(itemKey)))
      );
    });

    const targetStatus: DramaForeshadowStatus =
      raw.action === 'resolve'
        ? 'resolved'
        : raw.action === 'ferment'
        ? 'fermenting'
        : VALID_FORESHADOW_STATUSES.includes(raw.status as DramaForeshadowStatus)
        ? (raw.status as DramaForeshadowStatus)
        : 'planted';

    if (matched) {
      if (targetStatus === 'resolved' && matched.status !== 'resolved') {
        matched.status = 'resolved';
        updatedCount += 1;
      } else if (targetStatus === 'fermenting' && matched.status === 'planted') {
        matched.status = 'fermenting';
        updatedCount += 1;
      }
      if (raw.payoffNote && String(raw.payoffNote).trim()) {
        matched.payoffNote = String(raw.payoffNote).trim();
      }
      if (!matched.visualAnchorNote && raw.visualAnchorNote) {
        matched.visualAnchorNote = String(raw.visualAnchorNote).trim();
      }
      if (!matched.expectedPayoffEpisode && raw.expectedPayoffEpisode) {
        matched.expectedPayoffEpisode = String(raw.expectedPayoffEpisode).trim();
      }
    } else {
      const catCandidate = String(raw.category || '').trim() as DramaForeshadowCategory;
      result.push({
        id: raw.id || generateUUID(),
        name: cleanName,
        category: VALID_FORESHADOW_CATEGORIES.includes(catCandidate) ? catCandidate : '关键道具',
        ownerOrRelation: String(raw.ownerOrRelation || '核心主角线').trim(),
        plantedEpisode: Math.max(1, Number(raw.plantedEpisode) || defaultEpisode),
        expectedPayoffEpisode: raw.expectedPayoffEpisode
          ? String(raw.expectedPayoffEpisode).trim()
          : undefined,
        status: targetStatus,
        visualAnchorNote: raw.visualAnchorNote ? String(raw.visualAnchorNote).trim() : undefined,
        payoffNote: raw.payoffNote ? String(raw.payoffNote).trim() : undefined,
      });
      updatedCount += 1;
    }
  }

  return { merged: result, updatedCount };
}

/**
 * 每集剧本生成或洗稿完成后自动调用：
 * 1. 自动从 AI 返回的 `episodeSceneAnchors` + 剧本场头双通道提取新场景或「同场景不同状态」，严格去重后写入 `sceneAnchors`；
 * 2. 自动根据 `foreshadowingUpdates` 更新全局伏笔与关键道具台账（新埋设 / 发酵推进 / 标记已回收）；
 * 3. 自动固化本集 `continuitySummary` 供后续几十集连载滚动记忆使用。
 */
export function applyEpisodeContinuityUpdates(params: {
  project: DramaProject;
  rawModelOutput?: string;
  episode: DramaEpisode;
}): {
  episode: DramaEpisode;
  sceneAnchors: DramaSceneAnchor[];
  foreshadowingLedger: DramaForeshadowItem[];
  addedScenesCount: number;
  updatedForeshadowCount: number;
} {
  const { project, rawModelOutput, episode } = params;
  const incomingScenes: Array<Partial<DramaSceneAnchor> & { sceneName: string }> = [];
  const incomingForeshadows: Array<
    Partial<DramaForeshadowItem> & { action?: 'plant' | 'ferment' | 'resolve' }
  > = [];
  let modelContinuitySummary = episode.continuitySummary || '';

  if (rawModelOutput) {
    try {
      const parsed = JSON.parse(extractJsonString(rawModelOutput));
      if (parsed.continuitySummary) {
        modelContinuitySummary = String(parsed.continuitySummary).trim();
      }
      if (Array.isArray(parsed.episodeSceneAnchors)) {
        parsed.episodeSceneAnchors.forEach((s: any) => {
          if (s && s.sceneName) {
            incomingScenes.push({
              sceneName: String(s.sceneName),
              stateVariant: s.stateVariant ? String(s.stateVariant) : '常规态',
              sourceRef: `第${episode.index}集剧本自动归档`,
              lightingAndMood: String(s.lightingAndMood || ''),
              visualPromptZh: String(s.visualPromptZh || ''),
              visualPromptEn: String(s.visualPromptEn || ''),
            });
          }
        });
      }
      if (Array.isArray(parsed.foreshadowingUpdates)) {
        parsed.foreshadowingUpdates.forEach((f: any) => {
          if (f && f.name) {
            const act =
              f.action === 'resolve' || f.action === 'ferment' || f.action === 'plant'
                ? f.action
                : 'plant';
            incomingForeshadows.push({
              action: act,
              name: String(f.name),
              category: f.category,
              ownerOrRelation: f.ownerOrRelation,
              plantedEpisode: episode.index,
              expectedPayoffEpisode: f.expectedPayoffEpisode,
              visualAnchorNote: f.visualAnchorNote,
              payoffNote:
                act === 'resolve'
                  ? String(f.payoffNote || `已于第 ${episode.index} 集剧本回收兑现`)
                  : f.payoffNote
                  ? String(f.payoffNote)
                  : undefined,
            });
          }
        });
      }
    } catch {
      // Safe fallback when rawModelOutput is plain text or partial
    }
  }

  // Fallback header scan guarantees scene anchors are always populated even if model omitted episodeSceneAnchors
  const headerFallbackScenes = extractSceneAnchorsFromScriptFallback(
    episode.rawScriptText,
    episode.index,
    project.visualStyle,
    project.aspectRatio
  );
  incomingScenes.push(...headerFallbackScenes);

  const { merged: nextSceneAnchors, addedCount: addedScenesCount } = mergeUniqueSceneAnchors(
    project.sceneAnchors || [],
    incomingScenes
  );

  const { merged: nextForeshadowLedger, updatedCount: updatedForeshadowCount } =
    mergeForeshadowingLedger(
      project.foreshadowingLedger || [],
      incomingForeshadows,
      episode.index
    );

  const finalContinuitySummary =
    modelContinuitySummary ||
    `核心进展：${episode.coreConflictSummary || '推进主线冲突'}；集末定格：${
      episode.endingCliffhanger || '见剧本末尾'
    }`;

  return {
    episode: {
      ...episode,
      continuitySummary: finalContinuitySummary,
    },
    sceneAnchors: nextSceneAnchors,
    foreshadowingLedger: nextForeshadowLedger,
    addedScenesCount,
    updatedForeshadowCount,
  };
}

/**
 * 供 UI 看板与 Prompt 引擎共用的「4层金字塔跨集长篇记忆诊断器」
 */
export interface ContinuityMemoryDiagnostics {
  targetEpisodeIndex: number;
  hasNarrativeBible: boolean;
  totalPriorWrittenCount: number;
  compressedEarlyRange: string | null;
  detailedRecentEpisodes: DramaEpisode[];
  prevEpisodeTailLines: string;
  activeForeshadows: DramaForeshadowItem[];
  dueNowForeshadows: DramaForeshadowItem[];
  resolvedForeshadowCount: number;
  upcomingPlanWindow: DramaEpisodePlanItem[];
}

export function getContinuityMemoryDiagnostics(
  project: DramaProject,
  targetEpisodeIndex: number
): ContinuityMemoryDiagnostics {
  const priorEps = [...(project.episodes || [])]
    .filter((e) => e.index < targetEpisodeIndex)
    .sort((a, b) => a.index - b.index);

  const detailedRecentEpisodes = priorEps.slice(-3);
  const earlyEps = priorEps.slice(0, Math.max(0, priorEps.length - 3));
  const compressedEarlyRange =
    earlyEps.length > 0
      ? `第 ${earlyEps[0].index} ~ ${earlyEps[earlyEps.length - 1].index} 集（共 ${earlyEps.length} 集全量浓缩编年史）`
      : null;

  const immediatePrev = priorEps[priorEps.length - 1];
  const prevEpisodeTailLines = immediatePrev?.rawScriptText
    ? immediatePrev.rawScriptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-10)
        .join('\n')
    : '';

  const allLedger = project.foreshadowingLedger || [];
  const activeForeshadows = allLedger.filter((f) => f.status !== 'resolved');
  const resolvedForeshadowCount = allLedger.filter((f) => f.status === 'resolved').length;

  const epNumStr = String(targetEpisodeIndex);
  const dueNowForeshadows = activeForeshadows.filter((f) => {
    if (!f.expectedPayoffEpisode) return false;
    // Match exact episode mention or range containing targetEpisodeIndex
    const rangeMatch = f.expectedPayoffEpisode.match(/(\d+)\s*[-~至]\s*(\d+)/);
    if (rangeMatch) {
      const s = Number(rangeMatch[1]);
      const e = Number(rangeMatch[2]);
      if (targetEpisodeIndex >= s && targetEpisodeIndex <= e) return true;
    }
    const nums: string[] = f.expectedPayoffEpisode.match(/\d+/g) || [];
    return nums.includes(epNumStr);
  });

  const upcomingPlanWindow = [...(project.episodePlan || [])]
    .filter((p) => p.episodeIndex > targetEpisodeIndex && p.episodeIndex <= targetEpisodeIndex + 3)
    .sort((a, b) => a.episodeIndex - b.episodeIndex);

  return {
    targetEpisodeIndex,
    hasNarrativeBible: hasPopulatedNarrativeBible(project.narrativeBible),
    totalPriorWrittenCount: priorEps.length,
    compressedEarlyRange,
    detailedRecentEpisodes,
    prevEpisodeTailLines,
    activeForeshadows,
    dueNowForeshadows,
    resolvedForeshadowCount,
    upcomingPlanWindow,
  };
}

/**
 * 构建「4层金字塔长篇连载记忆与伏笔防丢注入块」（支撑 60~120+ 集不断片、不吃书、不漏收伏笔）
 */
export function buildLongSeriesContinuityPromptBlock(
  project: DramaProject,
  episodeIndex: number
): string {
  const diag = getContinuityMemoryDiagnostics(project, episodeIndex);
  const bible = project.narrativeBible;
  const sections: string[] = [];

  // Layer 1: Global Spine (Narrative Architecture Bible)
  const bibleLines: string[] = [];
  if (bible?.worldSettingAndRules?.trim()) {
    bibleLines.push(`- 底层设定与规则铁律（严禁吃书违背）：${bible.worldSettingAndRules.trim()}`);
  }
  if (bible?.storylineOverview?.trim()) {
    bibleLines.push(`- 全剧故事线脉络：${bible.storylineOverview.trim()}`);
  }
  if (bible?.mainPlotline?.trim()) {
    bibleLines.push(`- 核心主线矛盾：${bible.mainPlotline.trim()}`);
  }
  if (bible?.subPlotlines?.trim()) {
    bibleLines.push(`- 情感/副线支线：${bible.subPlotlines.trim()}`);
  }
  if (bible?.frameworkStructure?.trim()) {
    bibleLines.push(`- 当前所处商业框架位置（第 ${episodeIndex}/${project.totalPlannedEpisodes} 集）：${bible.frameworkStructure.trim()}`);
  }
  if (bible?.pacingStrategy?.trim()) {
    bibleLines.push(`- 剧情节奏与卡点波浪法则：${bible.pacingStrategy.trim()}`);
  }
  if (bible?.characterArcsAndRelations?.trim()) {
    bibleLines.push(`- 角色成长弧光与关系阶段：${bible.characterArcsAndRelations.trim()}`);
  }
  if (bibleLines.length > 0) {
    sections.push(`【第一层记忆 · 全剧叙事架构圣经（防跑偏锚点）】\n${bibleLines.join('\n')}`);
  } else if (project.synopsis?.trim()) {
    sections.push(`【第一层记忆 · 全剧商业总大纲（第 ${episodeIndex}/${project.totalPlannedEpisodes} 集）】\n${project.synopsis.trim()}`);
  }

  // Layer 2: Full-Series Rolling Chronicle (Ep 1 .. N-4) + Recent 3 Detailed + Ep N-1 Verbatim Tail
  if (episodeIndex === 1) {
    sections.push(
      `【第二层记忆 · 首集开篇生死线】\n本集为全剧开篇第 1 集！第 1-1 场前两行动作与首句台词必须直接兑现黄金前3秒钩子：${project.golden3SecHook}`
    );
  } else if (diag.totalPriorWrittenCount > 0) {
    const priorEps = [...(project.episodes || [])]
      .filter((e) => e.index < episodeIndex)
      .sort((a, b) => a.index - b.index);
    const earlyEps = priorEps.slice(0, Math.max(0, priorEps.length - 3));
    const memoryLines: string[] = [];

    if (earlyEps.length > 0) {
      memoryLines.push(`▶ 远期前情全量滚动编年史（第 1 ~ ${earlyEps[earlyEps.length - 1].index} 集，零遗漏压缩账本）：`);
      earlyEps.forEach((ep) => {
        const line = ep.continuitySummary || `${ep.coreConflictSummary}（集末：${ep.endingCliffhanger}）`;
        memoryLines.push(`  · 第${ep.index}集《${ep.title.replace(/^第\d+集[：:\s]*/, '')}》：${line}`);
      });
    }

    if (diag.detailedRecentEpisodes.length > 0) {
      memoryLines.push(`▶ 近期紧邻集数深度剧情记忆：`);
      diag.detailedRecentEpisodes.forEach((ep) => {
        memoryLines.push(
          `  · 第${ep.index}集《${ep.title}》：核心剧情=${ep.coreConflictSummary} ｜ 状态变化=${
            ep.continuitySummary || '承上启下'
          } ｜ 集末悬念=${ep.endingCliffhanger}`
        );
      });
    }

    if (diag.prevEpisodeTailLines) {
      const prevIdx = diag.detailedRecentEpisodes[diag.detailedRecentEpisodes.length - 1]?.index || episodeIndex - 1;
      memoryLines.push(
        `▶ 上一集（第 ${prevIdx} 集）剧本末尾原词切片（本集第 ${episodeIndex}-1 场第一帧动作与台词必须严丝合缝咬合以下画面，严禁断档或重复演一遍！）：\n"""\n${diag.prevEpisodeTailLines}\n"""`
      );
    }

    sections.push(`【第二层记忆 · 跨集连载无缝衔接账本（已记忆前序 ${diag.totalPriorWrittenCount} 集）】\n${memoryLines.join('\n')}`);
  } else {
    // 若用户跳集创作（尚未写前序正文，但已有分集细纲），自动用前序细纲补齐衔接上下文
    const priorPlans = [...(project.episodePlan || [])]
      .filter((p) => p.episodeIndex < episodeIndex)
      .sort((a, b) => a.episodeIndex - b.episodeIndex);
    if (priorPlans.length > 0) {
      const planDigest = priorPlans
        .map(
          (p) =>
            `  · 第${p.episodeIndex}集《${p.title}》：${p.beatSummary}${
              p.foreshadowingOrProps ? `（伏笔/道具：${p.foreshadowingOrProps}）` : ''
            }`
        )
        .join('\n');
      sections.push(`【第二层记忆 · 前序分集细纲脉络回顾】\n${planDigest}`);
    }
  }

  // Layer 3: Active Foreshadowing & Key Prop Ledger
  const plannedBeat = project.episodePlan.find((p) => p.episodeIndex === episodeIndex);
  const recentPlanClues = project.episodePlan
    .filter((p) => p.episodeIndex < episodeIndex && p.foreshadowingOrProps)
    .slice(-5)
    .map((p) => `第${p.episodeIndex}集细纲线索：${p.foreshadowingOrProps}`);

  if (diag.activeForeshadows.length > 0 || plannedBeat?.foreshadowingOrProps || recentPlanClues.length > 0) {
    const ledgerLines: string[] = [];
    if (diag.dueNowForeshadows.length > 0) {
      ledgerLines.push(
        `⚠️ 【本集（第${episodeIndex}集）重点到期/待引爆伏笔与关键道具】：` +
          diag.dueNowForeshadows
            .map(
              (f) =>
                `「${f.name}」（${f.category}，第${f.plantedEpisode}集埋设，关联：${f.ownerOrRelation}${
                  f.payoffNote ? `，预设回收方式：${f.payoffNote}` : ''
                }）`
            )
            .join('；')
      );
    }
    if (diag.activeForeshadows.length > 0) {
      ledgerLines.push(
        `- 全局活跃待回收伏笔/关键道具池（共 ${diag.activeForeshadows.length} 项，哪怕隔了几十集也严禁遗忘或前后矛盾）：`
      );
      diag.activeForeshadows.forEach((f) => {
        ledgerLines.push(
          `  · [${f.status === 'fermenting' ? '发酵中' : '待回收'}|${f.category}] 「${f.name}」（第${
            f.plantedEpisode
          }集埋，关联:${f.ownerOrRelation}${
            f.expectedPayoffEpisode ? `，计划回收:${f.expectedPayoffEpisode}` : ''
          }${f.visualAnchorNote ? `，外观特征:${f.visualAnchorNote}` : ''}）`
        );
      });
    }
    if (plannedBeat?.foreshadowingOrProps) {
      ledgerLines.push(`- 本集细纲指定伏笔/关键道具动作：${plannedBeat.foreshadowingOrProps}`);
    } else if (recentPlanClues.length > 0) {
      ledgerLines.push(`- 近期细纲伏笔备忘：${recentPlanClues.join('；')}`);
    }
    sections.push(`【第三层记忆 · 角色伏笔与关键道具追踪台账】\n${ledgerLines.join('\n')}`);
  }

  // Layer 4: Forward 3-Episode Lookahead Guardrail (Anti-Rushing & Setup)
  if (diag.upcomingPlanWindow.length > 0) {
    const lookaheadLines = diag.upcomingPlanWindow
      .map(
        (p) =>
          `  · 第${p.episodeIndex}集预定节拍《${p.title}》（${p.hookType}）：${p.beatSummary}${
            p.foreshadowingOrProps ? ` [预定道具/伏笔：${p.foreshadowingOrProps}]` : ''
          }`
      )
      .join('\n');
    sections.push(
      `【第四层护栏 · 后 3 集细纲前瞻（严禁抢跑剧透后续高潮，但须在本集末尾自然铺垫通往第 ${
        episodeIndex + 1
      } 集的悬念钩子）】\n${lookaheadLines}`
    );
  }

  return sections.join('\n\n');
}

export function buildDramaPitchMessages(
  track: DramaTrackPreset,
  customIdea: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你现在是国内顶级 AI 漫剧与竖屏付费短剧总制片人兼主编剧。请紧扣当前热门赛道规范，为用户孵化具有极高完播率与付费转化潜力的商业漫剧企划案。`;

  const user = `请基于以下热门赛道参数，一次性构思 3 个差异化、极具爆款潜质的 AI 漫剧立项企划案：

【锁定热门赛道】：${track.name}（${track.channel} · ${track.heatLabel}）
【核心受众】：${track.targetAudience}
【核心情绪爽点】：${track.coreEmotion}
【黄金前3秒公式】：${track.golden3SecFormula}
【单集节奏模型】：${track.pacingStructure}
【付费卡点策略】：${track.paywallHookStrategy}
【赛道避坑红线】：${track.avoidTaboos}
${customIdea.trim() ? `【用户补充微创新灵感】：${customIdea.trim()}` : ''}

请严格输出纯 JSON 数组格式（不要包含多余解释文字，用 \`\`\`json 包裹），数组包含 3 个对象，字段结构如下：
\`\`\`json
[
  {
    "title": "极具网感与点击欲的漫剧剧名（不要书名号）",
    "logline": "一句话商业核心卖点（50-90字，突出极致反差与核心爽点）",
    "targetAudience": "精准受众画像与情绪痛点",
    "golden3SecHook": "第1集前3秒具体视听画面、动作与首句台词钩子",
    "totalPlannedEpisodes": 60,
    "paywallEpisodeIndex": 10,
    "synopsis": "分三阶段（1-9集免费留存爽点、10-12集核心付费大钩子、13集后主线高潮）的完整商业故事大纲（250-400字）"
  }
]
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseDramaPitchProposals(raw: string): DramaPitchProposal[] {
  const cleaned = extractJsonString(raw);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: String(item.title || '未命名爆款漫剧').replace(/[《》]/g, '').trim(),
        logline: String(item.logline || ''),
        targetAudience: String(item.targetAudience || ''),
        golden3SecHook: String(item.golden3SecHook || ''),
        totalPlannedEpisodes: Number(item.totalPlannedEpisodes) || 60,
        paywallEpisodeIndex: Number(item.paywallEpisodeIndex) || 10,
        synopsis: String(item.synopsis || ''),
        narrativeBible: item.narrativeBible ? normalizeNarrativeBible(item.narrativeBible) : undefined,
      }));
    }
  } catch (e) {
    console.warn('Failed to parse pitch JSON:', e);
  }
  return [];
}

/**
 * 独立生成或补全《全剧叙事架构圣经 + 角色伏笔与关键道具追踪台账》
 */
export function buildDramaNarrativeBibleMessages(
  project: DramaProject
): Array<{ role: 'system' | 'user'; content: string }> {
  const track = getTrackByProject(project);
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const existingChars =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map((c) => `- ${c.name}（${c.roleTag} · ${c.ageAndArchetype}，标志特征/信物：${c.signatureTrait || '待定'}）`)
          .join('\n')
      : '（请结合全剧大纲梳理核心角色弧光与关系拉扯）';

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你是顶级商业 AI 漫剧【总编剧兼叙事架构总监】。为了确保长篇连载（共 ${project.totalPlannedEpisodes} 集，单集 ${durSpec.durationSec} 秒）从中前期到终局绝不烂尾、不吃书、不遗漏伏笔，请为该项目构建完整的《全剧叙事架构圣经》与《角色伏笔及关键道具追踪台账》。`;

  const user = `请基于以下立项设定，深度推演并补全《${project.title}》的完整叙事架构（故事线、主线、支线、分幕框架结构、剧情节奏模型、世界观底层规则、角色成长与关系弧光）以及核心伏笔/关键道具台账：

【剧名】：《${project.title}》
【赛道与画风】：${track.name}（${project.channel}） | ${project.visualStyle} · ${project.aspectRatio}
【体量规格】：单集 ${durSpec.durationSec} 秒（约 ${durSpec.minWords}~${durSpec.maxWords} 字/集） | 规划总集数：${project.totalPlannedEpisodes} 集 | 核心付费卡点：第 ${project.paywallEpisodeIndex} 集
【核心卖点】：${project.logline}
【首集黄金前3秒】：${project.golden3SecHook}
【全剧商业大纲】：
${project.synopsis}

【已知核心角色】：
${existingChars}

请严格按以下 JSON 格式输出（使用 \`\`\`json 包裹）：
\`\`\`json
{
  "narrativeBible": {
    "worldSettingAndRules": "世界观背景与底层硬规则铁律（如：金手指触发代价、豪门/娱乐圈契约死穴、末世/怪谈生存法则，防止中后期战力崩坏或吃书，100-180字）",
    "storylineOverview": "核心故事线与高压时间轴脉络（按时间推进梳理从开局危机到终局清算的完整因果链条，120-200字）",
    "mainPlotline": "贯穿全剧的核心主线矛盾、主角阶段性目标与终极爽点闭环（100-180字）",
    "subPlotlines": "2~3条高张力支线设计（如：男女主双向马甲/救赎情感暗线、关键配角群像副线、反派内部狗咬狗利益暗线，120-200字）",
    "frameworkStructure": "结合全剧 ${project.totalPlannedEpisodes} 集与第 ${project.paywallEpisodeIndex} 集付费点的四幕式商业框架结构（第一幕免费强留存期 → 第二幕首轮付费破局幕 → 第三幕地图/身份升级博弈幕 → 第四幕终局真相引爆幕，明确标注各幕集数区间，140-240字）",
    "pacingStrategy": "剧情节奏与商业卡点波浪法则（包含单集 ${durSpec.durationSec} 秒内的起承转合微节奏 + 每3集一小爽点、每8-10集一大反转的中观波浪节奏设计，100-180字）",
    "characterArcsAndRelations": "核心主角的人物成长弧光（前中后期心态蜕变）与核心人物关系拉扯演变网（120-200字）"
  },
  "foreshadowingLedger": [
    {
      "name": "关键道具或核心伏笔名称（如：刻有缩写S.W的破碎银色耳返 / 三年前顶替署名保密协议）",
      "category": "关键道具",
      "ownerOrRelation": "关联角色或关系线（如：苏晚 ↔ 陆执）",
      "plantedEpisode": 1,
      "expectedPayoffEpisode": "第10集首次掉马验证 / 第36集终局公开打脸",
      "visualAnchorNote": "若为实体关键道具，填写固定视觉外观描述（供分镜AI生图锁死道具外观，非实体线索可填简短表现形式）",
      "payoffNote": "该伏笔/道具在中期如何发酵、后期如何反转回收的具体设计"
    }
  ]
}
\`\`\`
要求：\`foreshadowingLedger\` 提取 4~7 个贯穿前中后期的核心【关键道具 / 身世人物伏笔 / 核心剧情暗线 / 规则契约死穴】（\`category\` 必须从这四项中选择）。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseDramaNarrativeBibleJson(raw: string): {
  narrativeBible: DramaNarrativeBible;
  foreshadowingLedger: DramaForeshadowItem[];
} {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const narrativeBible = normalizeNarrativeBible(parsed.narrativeBible || parsed);
  const rawLedger = Array.isArray(parsed.foreshadowingLedger) ? parsed.foreshadowingLedger : [];
  const { merged: foreshadowingLedger } = mergeForeshadowingLedger([], rawLedger, 1);
  return { narrativeBible, foreshadowingLedger };
}

/**
 * 从现有全部「分集细纲」与「已生成分集剧本」中智能扫描并同步核心场景视觉锚点（同场景同态去重，同场景不同状态独立建档）
 */
export function buildSyncSceneAnchorsFromProjectMessages(
  project: DramaProject
): Array<{ role: 'system' | 'user'; content: string }> {
  const existingScenesText =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map((s) => `- ${s.sceneName} [${s.stateVariant || '常规态'}]：${s.visualPromptZh}`)
          .join('\n')
      : '（当前场景锚点库为空）';

  const planScenesDigest =
    project.episodePlan.length > 0
      ? project.episodePlan
          .map((p) => `第${p.episodeIndex}集《${p.title}》：${p.beatSummary}`)
          .join('\n')
      : '（暂无分集细纲）';

  const scriptHeadersDigest =
    project.episodes.length > 0
      ? project.episodes
          .map((ep) => {
            const headers = (ep.rawScriptText || '')
              .split('\n')
              .filter((line) => line.startsWith('**') || /^\d+\s*[-—]\s*\d+\s+/.test(line.trim()))
              .join(' | ');
            return `第${ep.index}集《${ep.title}》场头：${headers || ep.coreConflictSummary}`;
          })
          .join('\n')
      : '（暂无已生成分集剧本）';

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你是 AI 漫剧场景资产管理总监。请扫描该项目的【分集细纲】与【已出剧本场头】，提取需要补充进【核心场景视觉锚点库】的场景。
【核心去重与异态铁律】：
1. 已经在【现有场景锚点库】中存在且状态一致的场景，**严禁重复输出**！
2. 本次输出中相同的场景也严禁重复列出！
3. **同一场景不同状态必须独立填入**：如果某个核心场景在剧情前后发生了显著视觉状态变化（例如：平时是「顶层安全屋客厅 [战前日常储备态]」，极寒降临后变成「顶层安全屋客厅 [零下70度断电结霜红光警报态]」；或者「星耀舞台 [彩排空场态]」与「星耀舞台 [总决赛暴雨事故直播态]」），请保持 \`sceneName\` 一致，并在 \`stateVariant\` 中明确标注不同状态名称！`;

  const user = `请为《${project.title}》（画风：${project.visualStyle}，画幅：${project.aspectRatio}）扫描细纲与剧本中的新增场景或同场景新状态：

【现有场景锚点库（同场景同状态请勿重复输出）】：
${existingScenesText}

【分集细纲全览】：
${planScenesDigest}

【已成稿分集剧本场头全览】：
${scriptHeadersDigest}

请严格按以下 JSON 格式输出（仅输出新增的场景或同一场景的新状态变体，用 \`\`\`json 包裹）：
\`\`\`json
{
  "sceneAnchors": [
    {
      "sceneName": "核心场景基础名称（不含括号状态，如：星耀演播厅舞台）",
      "stateVariant": "场景具体状态（如：常规彩排态 / 暴雨停电应急灯光态）",
      "sourceRef": "来源标注（如：源自第1-12集细纲 / 源自第3集剧本）",
      "lightingAndMood": "光影冷暖色调与氛围词",
      "visualPromptZh": "适配「${project.visualStyle}」的中文固定场景布景与光影描述（纯空镜锚点）",
      "visualPromptEn": "Consistent English environment prompt tags, ${project.visualStyle}, ${project.aspectRatio.split(' ')[0]}"
    }
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseSyncSceneAnchorsJson(raw: string): DramaSceneAnchor[] {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const rawList = Array.isArray(parsed) ? parsed : parsed.sceneAnchors;
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((s: any) => s && s.sceneName)
    .map((s: any) => ({
      id: generateUUID(),
      sceneName: String(s.sceneName || '核心场景').trim(),
      stateVariant: String(s.stateVariant || '常规态').trim(),
      sourceRef: String(s.sourceRef || '细纲/剧本同步').trim(),
      lightingAndMood: String(s.lightingAndMood || ''),
      visualPromptZh: String(s.visualPromptZh || ''),
      visualPromptEn: String(s.visualPromptEn || ''),
    }));
}

export function buildDramaAssetExtractionMessages(
  project: DramaProject,
  initialEpisodeCount?: number
): Array<{ role: 'system' | 'user'; content: string }> {
  const track = getTrackByProject(project);
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const targetInitialCount = Math.max(
    6,
    Math.min(
      20,
      initialEpisodeCount || Math.max(12, Math.min(15, project.paywallEpisodeIndex + 2))
    )
  );

  const bibleHint = hasPopulatedNarrativeBible(project.narrativeBible)
    ? `\n【全剧叙事架构圣经参考】：\n- 主线：${project.narrativeBible?.mainPlotline || ''}\n- 支线：${project.narrativeBible?.subPlotlines || ''}\n- 底层规则：${project.narrativeBible?.worldSettingAndRules || ''}\n- 节奏策略：${project.narrativeBible?.pacingStrategy || ''}`
    : '';

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你是一位专业的 AI 漫剧视觉总监、总编剧与分集统筹导演。你的任务是根据剧目大纲与单集时长规格（单集 ${durSpec.durationSec} 秒，对应单集剧本约 ${durSpec.minWords}~${durSpec.maxWords} 字），一次性提取：
1. 【全剧叙事架构圣经（若尚未完善则自动补全：故事线、主线、支线、框架结构、剧情节奏、底层规则、人物弧光）】；
2. 【角色立绘固定资产】；
3. 【第 1 集至第 ${targetInitialCount} 集商业分集卡点细纲】；
4. 【根据上述细纲自动同步提取的核心场景视觉锚点（重复场景绝不重复填；同一场景若在不同集出现截然不同的视觉状态，如常规态 vs 损毁/断电/极夜态，须以相同 sceneName + 不同 stateVariant 分别填入）】；
5. 【全局角色伏笔与关键道具追踪台账】。`;

  const user = `请为以下 AI 漫剧项目生成全套叙事架构圣经、角色视觉资产、前 ${targetInitialCount} 集节拍细纲（含第 ${project.paywallEpisodeIndex} 集核心付费卡点）、细纲对应场景视觉锚点及关键伏笔道具台账：

【剧名】：《${project.title}》
【所属赛道】：${track.name}（${project.channel}）
【视觉画风】：${project.visualStyle} | 【画幅】：${project.aspectRatio}
【单集时长与体量规格】：单集 ${durSpec.durationSec} 秒（${durSpec.label}，单集剧本目标字数 ${durSpec.minWords}~${durSpec.maxWords} 字，包含 ${durSpec.sceneRange}） | 【全剧规划总集数】：${project.totalPlannedEpisodes} 集
【核心卖点】：${project.logline}
【黄金前3秒钩子】：${project.golden3SecHook}
【全剧大纲】：
${project.synopsis}${bibleHint}

请严格按以下 JSON 对象格式输出（使用 \`\`\`json 包裹）：
\`\`\`json
{
  "narrativeBible": {
    "worldSettingAndRules": "世界观背景与底层规则铁律（防中后期吃书，80-150字）",
    "storylineOverview": "核心故事线与时间轴脉络（100-160字）",
    "mainPlotline": "核心主线矛盾与终极目标闭环（80-150字）",
    "subPlotlines": "情感暗线、群像副线与反派支线设计（80-150字）",
    "frameworkStructure": "全剧 ${project.totalPlannedEpisodes} 集四幕商业框架结构（明确划分集数阶段与第 ${project.paywallEpisodeIndex} 集付费卡点定位，100-180字）",
    "pacingStrategy": "单集 ${durSpec.durationSec} 秒微节奏 + 跨集 3集小高潮/10集大反转节奏模型（80-140字）",
    "characterArcsAndRelations": "核心角色成长弧光与关系拉扯演变网（80-150字）"
  },
  "characterAssets": [
    {
      "name": "角色姓名",
      "roleTag": "核心男主 / 核心女主 / 头号反派 / 关键配角",
      "ageAndArchetype": "年龄与人设标签（如：25岁 · 重生杀伐果断狠人）",
      "appearanceZh": "中文固定立绘特征（发型发色、五官气质、标志性常驻穿搭、代表配饰，供后期拆解分镜时自动锁定外观）",
      "visualPromptEn": "English AI image generation consistency prompt tags (hair, eyes, outfit, style: ${project.visualStyle}, ${project.aspectRatio.split(' ')[0]})",
      "voicePersona": "配音音色、语速与情绪基调建议",
      "signatureTrait": "标志性镜头微动作或随身关键信物/视觉道具"
    }
  ],
  "sceneAnchors": [
    {
      "sceneName": "高频核心场景基础名（不含括号状态）",
      "stateVariant": "场景状态（如：常规日常态；若同一场景在细纲中有特殊剧变状态，再单独建一条写如：暴雨断电封锁态）",
      "lightingAndMood": "光影冷暖色调与情绪氛围",
      "visualPromptZh": "中文场景固定布景描述（无人物空镜锚点）",
      "visualPromptEn": "English environment prompt tags"
    }
  ],
  "foreshadowingLedger": [
    {
      "name": "关键道具或角色伏笔名称",
      "category": "关键道具",
      "ownerOrRelation": "关联角色或关系",
      "plantedEpisode": 1,
      "expectedPayoffEpisode": "预计发酵/回收集数（如：第10集初揭 / 第32集终极反转）",
      "visualAnchorNote": "道具固定视觉特征或线索表现方式",
      "payoffNote": "后续如何回收引爆"
    }
  ],
  "episodePlan": [
    {
      "episodeIndex": 1,
      "title": "单集短标题（不含第X集前缀）",
      "beatSummary": "本集核心冲突事件、爽点/拉扯推进闭环与集末断章悬念（45-85字，剧情容量须匹配 ${durSpec.durationSec} 秒单集时长）",
      "foreshadowingOrProps": "本集埋设或呼应的关键道具、核心伏笔或身份线索",
      "hookType": "免费强留存"
    }
  ]
}
\`\`\`
要求：
1. \`characterAssets\` 提取 3~5 位核心出场角色（若已有预设主角姓名与人设，请继承并深化完善）；
2. \`sceneAnchors\` 根据前 ${targetInitialCount} 集细纲出现的场景自动提取 3~6 个锚点：**完全相同状态的同一场景绝不重复填写；若同一核心场景在细纲中出现不同关键状态（如昼夜剧变、损毁前后、舞台亮灯与停电），必须保持 \`sceneName\` 一致并用 \`stateVariant\` 区分填入**；
3. \`foreshadowingLedger\` 提取 4~6 项核心关键道具/人物伏笔/规则死穴；
4. \`episodePlan\` 完整规划第 1 集至第 ${targetInitialCount} 集，若第 ${project.paywallEpisodeIndex} 集在本区间内，其 \`hookType\` 必须标记为 \`"核心付费卡点"\`。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const VALID_HOOK_TYPES = ['免费强留存', '小高潮爽点', '核心付费卡点', '反转高潮'] as const;

export function parseDramaAssetsJson(raw: string): {
  narrativeBible?: DramaNarrativeBible;
  foreshadowingLedger: DramaForeshadowItem[];
  characterAssets: DramaCharacterAsset[];
  sceneAnchors: DramaSceneAnchor[];
  episodePlan: DramaEpisodePlanItem[];
} {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);

  const narrativeBible = parsed.narrativeBible
    ? normalizeNarrativeBible(parsed.narrativeBible)
    : undefined;

  const { merged: foreshadowingLedger } = mergeForeshadowingLedger(
    [],
    Array.isArray(parsed.foreshadowingLedger) ? parsed.foreshadowingLedger : [],
    1
  );

  const characterAssets: DramaCharacterAsset[] = Array.isArray(parsed.characterAssets)
    ? parsed.characterAssets.map((c: any) => ({
        id: generateUUID(),
        name: String(c.name || '未命名角色'),
        roleTag: String(c.roleTag || '主要角色'),
        ageAndArchetype: String(c.ageAndArchetype || ''),
        appearanceZh: String(c.appearanceZh || ''),
        visualPromptEn: String(c.visualPromptEn || ''),
        voicePersona: String(c.voicePersona || ''),
        signatureTrait: String(c.signatureTrait || ''),
      }))
    : [];

  const rawScenes = Array.isArray(parsed.sceneAnchors)
    ? parsed.sceneAnchors.map((s: any) => ({
        sceneName: String(s.sceneName || '核心场景'),
        stateVariant: s.stateVariant ? String(s.stateVariant) : '常规态',
        sourceRef: '细纲自动提取',
        lightingAndMood: String(s.lightingAndMood || ''),
        visualPromptZh: String(s.visualPromptZh || ''),
        visualPromptEn: String(s.visualPromptEn || ''),
      }))
    : [];
  const { merged: sceneAnchors } = mergeUniqueSceneAnchors([], rawScenes);

  const episodePlan: DramaEpisodePlanItem[] = Array.isArray(parsed.episodePlan)
    ? parsed.episodePlan.map((ep: any, idx: number) => ({
        episodeIndex: Number(ep.episodeIndex) || idx + 1,
        title:
          String(ep.title || `第${idx + 1}集`)
            .replace(/^第\s*\d+\s*集[：:·\s-]*/, '')
            .trim() || `第${idx + 1}集`,
        beatSummary: String(ep.beatSummary || ''),
        foreshadowingOrProps: ep.foreshadowingOrProps
          ? String(ep.foreshadowingOrProps).trim()
          : undefined,
        hookType: VALID_HOOK_TYPES.includes(ep.hookType) ? ep.hookType : '免费强留存',
      }))
    : [];

  return { narrativeBible, foreshadowingLedger, characterAssets, sceneAnchors, episodePlan };
}

/**
 * 滚动续写后续分集剧本细纲（第 startEpisode 至 endEpisode 集）：
 * 强制 AI 先回溯审阅全剧叙事架构圣经 + 伏笔道具台账 + 前序所有已规划分集细纲 + 已成稿剧本，
 * 同时自动提取新阶段细纲里出现的【全新场景或同场景新状态】与【新增/回收伏笔】！
 */
export function buildContinueEpisodePlanMessages(params: {
  project: DramaProject;
  startEpisode: number;
  endEpisode: number;
  arcDirectionHint?: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { project, startEpisode, endEpisode, arcDirectionHint } = params;
  const track = getTrackByProject(project);
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const effectiveTotal = Math.max(project.totalPlannedEpisodes || 40, endEpisode);

  // 1. 整理第 1 ~ (startEpisode - 1) 集的所有已规划分集细纲（含伏笔与关键道具记录）
  const priorPlanned = [...(project.episodePlan || [])]
    .filter((item) => item.episodeIndex < startEpisode)
    .sort((a, b) => a.episodeIndex - b.episodeIndex);

  const priorPlanDigest =
    priorPlanned.length > 0
      ? priorPlanned
          .map(
            (ep) =>
              `- 第 ${ep.episodeIndex} 集《${ep.title}》[${ep.hookType}]：${ep.beatSummary}${
                ep.foreshadowingOrProps ? ` ｜【伏笔/关键道具】：${ep.foreshadowingOrProps}` : ''
              }`
          )
          .join('\n')
      : '（前序尚无分集细纲记录，请依据全剧大纲直接从起始集构建）';

  // 2. 整理已实际成稿的前序剧本
  const priorWrittenEps = [...(project.episodes || [])]
    .filter((e) => e.index < startEpisode)
    .sort((a, b) => a.index - b.index);

  const writtenEpisodesDigest =
    priorWrittenEps.length > 0
      ? priorWrittenEps
          .map(
            (e) =>
              `- 已成稿第 ${e.index} 集（${e.title}）：${
                e.continuitySummary || e.coreConflictSummary
              } ｜ 集末悬念=${e.endingCliffhanger}`
          )
          .join('\n')
      : '（目前尚未撰写具体分集正文剧本，以前序分集细纲与角色资产为准）';

  // 3. 角色标志性随身道具 + 活跃伏笔台账 + 已有场景锚点（供去重参考）
  const castPropsDigest =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map(
            (c) =>
              `- ${c.name}（${c.roleTag} · ${c.ageAndArchetype}）：标志性道具/微动作=${c.signatureTrait || '暂无'}`
          )
          .join('\n')
      : '（按全剧大纲角色设定推进）';

  const activeLedgerDigest =
    (project.foreshadowingLedger || []).filter((f) => f.status !== 'resolved').length > 0
      ? (project.foreshadowingLedger || [])
          .filter((f) => f.status !== 'resolved')
          .map(
            (f) =>
              `- [${f.category}|第${f.plantedEpisode}集埋] 「${f.name}」（关联:${f.ownerOrRelation}${
                f.expectedPayoffEpisode ? `，计划回收:${f.expectedPayoffEpisode}` : ''
              }）：${f.payoffNote || '待推进回收'}`
          )
          .join('\n')
      : '（请从前序细纲与角色信物中主动识别待回收伏笔）';

  const existingScenesList =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map((s) => `${s.sceneName}[${s.stateVariant || '常规态'}]`)
          .join('、')
      : '暂无';

  const bibleDigest = hasPopulatedNarrativeBible(project.narrativeBible)
    ? `\n【全剧叙事架构圣经】\n- 主线：${project.narrativeBible?.mainPlotline}\n- 支线：${project.narrativeBible?.subPlotlines}\n- 分幕框架：${project.narrativeBible?.frameworkStructure}\n- 底层规则：${project.narrativeBible?.worldSettingAndRules}`
    : '';

  const episodeCountToGen = Math.max(1, endEpisode - startEpisode + 1);

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你现在是顶级商业 AI 漫剧【总编审与分集大纲统筹导演】。
创作者已经完成了前序集数的立项与细纲，现在需要你接力续写 **第 ${startEpisode} 集至第 ${endEpisode} 集（共 ${episodeCountToGen} 集）** 的剧本细纲。

【核心编审铁律 —— 先回溯审阅，后续写细纲】：
1. **深度回溯前序集数与伏笔台账**：逐集审阅前序（第 1 ~ ${Math.max(1, startEpisode - 1)} 集）细纲、已成稿剧本与【活跃未解伏笔/关键道具台账】，在本批次合理安排伏笔发酵或回收，绝不断档或吃书！
2. **匹配单集时长体量**：单集时长 **${durSpec.durationSec} 秒（约 ${durSpec.minWords}~${durSpec.maxWords} 字，${durSpec.sceneRange}）**。
3. **同步提取新增场景锚点（去重+异态规则）**：根据第 ${startEpisode}~${endEpisode} 集新细纲涉及的主场景，仅将【此前未出现过的新核心场景】或【已有场景在本阶段出现的全新视觉状态（同一场景不同状态）】输出到 \`newSceneAnchors\`，已存在且状态相同的场景严禁重复输出！`;

  const user = `请先审阅《${project.title}》的前序集数设定、叙事架构圣经与伏笔道具台账，然后精准续写 **第 ${startEpisode} 集至第 ${endEpisode} 集（共 ${episodeCountToGen} 集）** 的剧本细纲！

【项目全局档案】
- 剧名：《${project.title}》 | 赛道：${track.name}（${project.channel}）
- 视觉规格：${project.visualStyle} · ${project.aspectRatio}
- 单集时长设定：${durSpec.durationSec} 秒/集（对应剧本约 ${durSpec.minWords}~${durSpec.maxWords} 字）
- 全剧规划总集数：${effectiveTotal} 集（当前续写阶段：第 ${startEpisode}~${endEpisode} 集 / 共 ${effectiveTotal} 集）
- 一句话卖点：${project.logline}
- 全剧三阶段总大纲：
${project.synopsis}${bibleDigest}

【角色与标志性道具档案】
${castPropsDigest}

【全局活跃待回收伏笔与关键道具台账】
${activeLedgerDigest}

【已有核心场景锚点（相同场景相同状态勿重复输出）】
${existingScenesList}

【前序已规划分集细纲全量回顾（第 1 ~ ${Math.max(1, startEpisode - 1)} 集）】
${priorPlanDigest}

【前序已成稿剧本正文的剧情与道具细节审阅】
${writtenEpisodesDigest}
${
  arcDirectionHint?.trim()
    ? `\n【创作者对本批次（第 ${startEpisode}~${endEpisode} 集）的特别剧情/伏笔指令】：\n${arcDirectionHint.trim()}\n`
    : ''
}
请严格输出以下 JSON 对象（用 \`\`\`json 包裹，\`episodes\` 数组必须完整包含 \`episodeIndex: ${startEpisode}\` 至 \`episodeIndex: ${endEpisode}\`）：
\`\`\`json
{
  "continuityAuditSummary": "120~240字的前序审阅与衔接报告：明确指出从前序集数与台账中提取了哪些【未解伏笔】、【关键道具/信物】与【人物关系卡点】，并说明在第 ${startEpisode}~${endEpisode} 集的哪几集中进行呼应、升级或回收。",
  "episodes": [
    {
      "episodeIndex": ${startEpisode},
      "title": "极具悬念或爽感的单集短标题（不含第X集前缀）",
      "beatSummary": "本集核心冲突推进、爽点/反转闭环与集末断章悬念（50-90字，体量适配 ${durSpec.durationSec} 秒单集）",
      "foreshadowingOrProps": "本集回收的前序伏笔/关键道具，或新埋设的关键线索",
      "hookType": "免费强留存"
    }
  ],
  "newSceneAnchors": [
    {
      "sceneName": "本阶段细纲新出现的核心场景名（或已有场景的基础名）",
      "stateVariant": "常规态（若为已有场景的新状态，请写明新状态如：大火焚毁废墟态）",
      "lightingAndMood": "光影与氛围",
      "visualPromptZh": "中文固定场景描述",
      "visualPromptEn": "English environment prompt tags"
    }
  ],
  "foreshadowingUpdates": [
    {
      "action": "plant",
      "name": "新埋设或推进/回收的伏笔/关键道具名",
      "category": "关键道具",
      "ownerOrRelation": "关联人物",
      "plantedEpisode": ${startEpisode},
      "expectedPayoffEpisode": "预计回收集数",
      "payoffNote": "线索说明或回收记录"
    }
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseContinueEpisodePlanJson(
  raw: string,
  expectedStartEp: number
): {
  continuityAuditSummary: string;
  episodes: DramaEpisodePlanItem[];
  newSceneAnchors: Array<Partial<DramaSceneAnchor> & { sceneName: string }>;
  foreshadowingUpdates: Array<Partial<DramaForeshadowItem> & { action?: 'plant' | 'ferment' | 'resolve' }>;
} {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const rawList = Array.isArray(parsed) ? parsed : parsed.episodes;

  const episodes: DramaEpisodePlanItem[] = Array.isArray(rawList)
    ? rawList.map((ep: any, idx: number) => ({
        episodeIndex: Number(ep.episodeIndex) || expectedStartEp + idx,
        title:
          String(ep.title || `第${expectedStartEp + idx}集`)
            .replace(/^第\s*\d+\s*集[：:·\s-]*/, '')
            .trim() || `剧情推进`,
        beatSummary: String(ep.beatSummary || ''),
        foreshadowingOrProps: ep.foreshadowingOrProps
          ? String(ep.foreshadowingOrProps).trim()
          : undefined,
        hookType: VALID_HOOK_TYPES.includes(ep.hookType) ? ep.hookType : '免费强留存',
      }))
    : [];

  const newSceneAnchors = Array.isArray(parsed.newSceneAnchors)
    ? parsed.newSceneAnchors
        .filter((s: any) => s && s.sceneName)
        .map((s: any) => ({
          sceneName: String(s.sceneName),
          stateVariant: s.stateVariant ? String(s.stateVariant) : '常规态',
          sourceRef: `第${expectedStartEp}-${
            episodes[episodes.length - 1]?.episodeIndex || expectedStartEp
          }集细纲同步`,
          lightingAndMood: String(s.lightingAndMood || ''),
          visualPromptZh: String(s.visualPromptZh || ''),
          visualPromptEn: String(s.visualPromptEn || ''),
        }))
    : [];

  const foreshadowingUpdates = Array.isArray(parsed.foreshadowingUpdates)
    ? parsed.foreshadowingUpdates.filter((f: any) => f && f.name)
    : [];

  return {
    continuityAuditSummary: String(parsed.continuityAuditSummary || '').trim(),
    episodes,
    newSceneAnchors,
    foreshadowingUpdates,
  };
}

/**
 * 上游阶段一：直接创作正宗「甲方标准文学剧本」（△三角场次本 / 国漫极简音效本 / 出海双语本）
 * 绝不混杂生图Tag与啰嗦描述，贴合真实漫剧甲方案头交付习惯！
 */
export function buildLiteraryScriptMessages(params: {
  project: DramaProject;
  episodeIndex: number;
  scriptFormat: DramaScriptFormat;
  directorInstruction: string;
  sourceNovelChapter?: { novelTitle: string; chapterTitle: string; chapterText: string } | null;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { project, episodeIndex, scriptFormat, directorInstruction, sourceNovelChapter } = params;
  const track = getTrackByProject(project);
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const isPaywallEp = episodeIndex === project.paywallEpisodeIndex;
  const plannedBeat = project.episodePlan.find((p) => p.episodeIndex === episodeIndex);

  const castSummary =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map(
            (c) =>
              `- ${c.name}（${c.roleTag}，${c.ageAndArchetype}，说话风格：${c.voicePersona}${
                c.signatureTrait ? `，标志性道具/习惯：${c.signatureTrait}` : ''
              }）`
          )
          .join('\n')
      : '（根据大纲设定主要角色名与鲜明口吻）';

  const existingSceneIndex =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map((s) => `${s.sceneName}[${s.stateVariant || '常规态'}]`)
          .join('、')
      : '（当前场景锚点库为空）';

  const continuityBlock = buildLongSeriesContinuityPromptBlock(project, episodeIndex);
  const formatRule = buildFormatRulePrompt(scriptFormat, episodeIndex);

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你现在是资深商业短剧/AI漫剧专职主编剧（负责交付给甲方的标准单集文学剧本，同时具备全剧 ${project.totalPlannedEpisodes} 集长线统筹记忆能力）。
你写的剧本永远节奏极快、场次清晰、一句一动、台词句句带钩子，并且与前序集数剧情、人物状态、关键道具伏笔严丝合缝咬合！

【当前项目信息与单集时长-字数硬性挂钩指标】
- 剧名：《${project.title}》 | 赛道：${track.name}（${project.channel}）
- ⏱️ 单集目标时长设定：**${durSpec.durationSec} 秒（${durSpec.label}）**
- 📏 剧本正文目标总字数区间：**${durSpec.minWords} ~ ${durSpec.maxWords} 字**（硬性指标！请按此体量扎实铺开 ${durSpec.sceneRange}、约 ${durSpec.beatRange}）
- 赛道节奏要求：${track.pacingStructure}
- 赛道禁忌：${track.avoidTaboos}
- 角色关系与口吻表（仅供把握人物性格与标志道具，严禁在剧本动作行里大段抄写外貌设定！）：
${castSummary}
- 已归档核心场景视觉锚点（写场头地点名时尽量复用统一名称；若本集出现了全新核心场景，或同一场景进入了截然不同的新状态，请在 JSON \`episodeSceneAnchors\` 中输出以便系统自动归档）：
${existingSceneIndex}

${formatRule}`;

  const paywallNotice = isPaywallEp
    ? `\n🔥【重点：第 ${episodeIndex} 集为全剧核心付费卡点集】🔥\n前半集给出一次干脆利落的反击爽点，最后一场最后一秒必须抛出最炸裂的危机降临或底牌反转戛然而止！`
    : '';

  const adaptationNotice = sourceNovelChapter
    ? `\n【待改编小说章节源文本】（《${sourceNovelChapter.novelTitle}》- ${sourceNovelChapter.chapterTitle}）：
"""
${sourceNovelChapter.chapterText.slice(0, 5500)}
"""
改编铁律：彻底砍掉原小说的心理描写、修辞渲染和慢节奏铺垫，提炼为适配 ${durSpec.durationSec} 秒时长（${durSpec.minWords}~${durSpec.maxWords} 字，${durSpec.sceneRange}）的漫剧标准剧本！`
    : '';

  const user = `请结合下方【4层跨集连载记忆与伏笔追踪账本】，创作《${project.title}》第 ${episodeIndex} 集【甲方标准文学剧本】。
⏱️【体量硬约束】：本项目单集设定时长为 **${durSpec.durationSec} 秒**，\`scriptText\` 剧本正文总字数必须控制在 **${durSpec.minWords} ~ ${durSpec.maxWords} 字** 之间，包含 **${durSpec.sceneRange}**，约 **${durSpec.beatRange}**。

${continuityBlock}
${plannedBeat ? `\n【本集分集细纲预定节拍】：《${plannedBeat.title}》 —— ${plannedBeat.beatSummary}（节拍定位：${plannedBeat.hookType}）` : ''}
${paywallNotice}
${directorInstruction.trim() ? `\n【本集具体导演/编剧指令】：${directorInstruction.trim()}` : ''}
${adaptationNotice}

请严格按以下 JSON 结构输出（用 \`\`\`json 包裹），其中 \`scriptText\` 必须是严格遵守上述排版规范且字数匹配 ${durSpec.minWords}~${durSpec.maxWords} 字的纯净剧本正文：
\`\`\`json
{
  "title": "第${episodeIndex}集：简短抓人的集标题",
  "targetDurationSec": ${durSpec.durationSec},
  "coreConflictSummary": "一句话概括本集冲突与爽点结果（30-50字）",
  "continuitySummary": "供后续几十集连载记忆使用的高密度状态账本（50-90字，写明：关键剧情实质结果 + 人物关系/筹码变化 + 关键道具归属或伏笔状态变更）",
  "opening3SecHook": "一句话概括开场前3秒动作/冲突钩子",
  "endingCliffhanger": "一句话概括集末最后一秒留存悬念",
  "scriptText": "此处填入严格按所选行业格式排版的完整单集剧本纯文本（使用 \\n 换行，总字数 ${durSpec.minWords}~${durSpec.maxWords} 字，只含场头、出场人物、△极简动作/【音效】与精炼台词，严禁夹杂生图Tag或运镜解析）",
  "episodeSceneAnchors": [
    {
      "sceneName": "本集出现的全新场景名，或状态发生剧变的已有场景基础名（若本集场景及状态均已在库中存在，此数组可留空 []！）",
      "stateVariant": "场景状态（如：常规态 / 暴雨停电应急红光态 / 爆炸废墟态）",
      "lightingAndMood": "本状态下的光影冷暖色调与情绪氛围",
      "visualPromptZh": "适配「${project.visualStyle}」的中文固定场景空镜描述",
      "visualPromptEn": "English environment prompt tags, ${project.visualStyle}, ${project.aspectRatio.split(' ')[0]}"
    }
  ],
  "foreshadowingUpdates": [
    {
      "action": "plant",
      "name": "本集新埋设(plant)、发酵推进(ferment)或正式回收(resolve)的伏笔/关键道具名（无变化则留空 []）",
      "category": "关键道具",
      "ownerOrRelation": "关联角色",
      "expectedPayoffEpisode": "若为新埋设，填写预计回收集数区间",
      "visualAnchorNote": "若为新实体道具，填写固定外观描述",
      "payoffNote": "本集埋设细节或回收结果说明"
    }
  ],
  "nextEpisodeHooks": [
    "【下集推进1：爽点爆发】具体剧情...",
    "【下集推进2：危机加码】具体剧情...",
    "【下集推进3：伏笔/反转揭秘】具体剧情..."
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseLiteraryScriptEpisode(
  raw: string,
  episodeIndex: number,
  scriptFormat: DramaScriptFormat,
  isPaywallHook: boolean,
  existingShots: DramaShot[] = [],
  defaultDurationSec = 90
): DramaEpisode {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const cleanScript = cleanMessyClientScriptLocal(String(parsed.scriptText || ''));

  return {
    id: generateUUID(),
    index: episodeIndex,
    title: String(parsed.title || `第${episodeIndex}集`),
    isPaywallHook,
    targetDurationSec: Number(parsed.targetDurationSec) || defaultDurationSec,
    coreConflictSummary: String(parsed.coreConflictSummary || ''),
    continuitySummary: parsed.continuitySummary ? String(parsed.continuitySummary).trim() : undefined,
    opening3SecHook: String(parsed.opening3SecHook || ''),
    endingCliffhanger: String(parsed.endingCliffhanger || ''),
    scriptFormat,
    rawScriptText: cleanScript,
    shots: existingShots,
    nextEpisodeHooks: Array.isArray(parsed.nextEpisodeHooks)
      ? parsed.nextEpisodeHooks.map((h: any) => String(h))
      : [],
    updatedAt: Date.now(),
  };
}

/**
 * 甲方乱稿一键规范化洗稿器（将格式混乱、带 Word 标记或小说腔的甲方来稿统一洗成标准 △ 剧本 / 国漫极简音效本）
 */
export function buildStandardizeClientScriptMessages(params: {
  messyScript: string;
  targetFormat: DramaScriptFormat;
  episodeIndex: number;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { messyScript, targetFormat, episodeIndex } = params;
  const preCleaned = cleanMessyClientScriptLocal(messyScript);
  const formatRule = buildFormatRulePrompt(targetFormat, episodeIndex);

  const system = `你是顶级 AI 漫剧剧本统筹主编。市面上不同甲方给过来的剧本格式五花八门（有的带 Word 批注符号、有的不分场次、有的把动作写成冗长小说段落、有的台词冒号括号混乱）。
你的任务是：在不丢失任何关键剧情、关键道具与核心台词原意的前提下，将用户粘贴的甲方原稿清洗重构为干净、利落、可直接进组制作的行业标准剧本！

${formatRule}`;

  const user = `请将以下甲方原始剧本清洗并标准化为第 ${episodeIndex} 集规范剧本，同时提取本集梗概、开场钩子、集末悬念与本集出场角色名单：

【甲方原始来稿】：
"""
${preCleaned.slice(0, 8000)}
"""

请严格输出以下 JSON 格式（用 \`\`\`json 包裹）：
\`\`\`json
{
  "title": "第${episodeIndex}集：[提取或拟定集标题]",
  "coreConflictSummary": "本集核心剧情梗概",
  "opening3SecHook": "本集开场前3秒视觉动作钩子",
  "endingCliffhanger": "本集末尾断章悬念点",
  "detectedCharacters": ["角色1", "角色2"],
  "scriptText": "清洗排版后的完整规范剧本正文"
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * 下游阶段二：由「甲方标准文学剧本（△本/极简本）」一键拆解为「AI 漫剧后期生图分镜执行单」
 * 自动把每一条 △ 动作与台词转化为景别运镜 + 融合角色立绘固定词的即梦/可灵/MJ提示词！
 */
export function buildBreakdownScriptToShotsMessages(params: {
  project: DramaProject;
  episodeIndex: number;
  literaryScriptText: string;
  targetShotCount?: number;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { project, episodeIndex, literaryScriptText, targetShotCount = 10 } = params;

  const charBlock =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map(
            (c) =>
              `- 【${c.name}】（${c.roleTag}）\n  中文固定立绘词：${c.appearanceZh}\n  英文固定Tag：${c.visualPromptEn}\n  配音音色：${c.voicePersona}`
          )
          .join('\n')
      : '（若剧本中出现主要角色，请为其赋予前后高度统一的发型、发色与标志性服饰描述）';

  const sceneBlock =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map(
            (s) =>
              `- 【${s.sceneName}${s.stateVariant ? ` · ${s.stateVariant}` : ''}】（${s.lightingAndMood}）：${s.visualPromptZh}`
          )
          .join('\n')
      : '（根据场头日/夜/内外景自动匹配戏剧化冷暖光影）';

  const propAnchors = (project.foreshadowingLedger || []).filter(
    (f) => f.visualAnchorNote && f.visualAnchorNote.trim()
  );
  const propVisualBlock =
    propAnchors.length > 0
      ? `\n\n【关键道具视觉一致性锚点（若本集剧本出现该道具特写，必须在生图词中保持其固定外观！）】：\n` +
        propAnchors
          .map((p) => `- 【${p.name}】（关联:${p.ownerOrRelation}）：${p.visualAnchorNote}`)
          .join('\n')
      : '';

  const system = `你是拥有百部爆款经验的 AI 漫剧后期执行总导演（精通即梦 Jimeng、可灵 Kling、Vidu 与 Midjourney 分镜制作）。
你的任务是将上游编剧交付的【极简标准文学剧本（△ 动作台词本）】精准拆解为下游生图师与剪辑师直接使用的【视听分镜执行单】（目标约 ${targetShotCount} 个分镜）。

【拆解铁律】：
1. 剧本里的每一个关键 △ 动作、反应特写或强冲突对白，都应拆解为清晰的独立镜头（景别 + 运镜，如：极特写、过肩正反打、仰拍慢推、震屏定格）。
2. 角色立绘与场景状态锁死：每镜的 \`visualDescription\`（中文生图词）和 \`imagePromptEn\`（英文Tag）必须包含画风「${project.visualStyle}」、画幅「${project.aspectRatio}」，并且只要角色、固定场景或关键道具入镜，必须自然织入下方一致性资产库中的外观与对应状态描述，彻底杜绝换脸穿帮！
3. 严禁篡改原文学剧本的核心剧情与台词原意。

【角色立绘一致性资产库】：
${charBlock}

【核心场景视觉锚点（含同场景不同状态）】：
${sceneBlock}${propVisualBlock}`;

  const user = `请将以下《${project.title}》第 ${episodeIndex} 集标准文学剧本拆解为约 ${targetShotCount} 镜的完整 AI 漫剧制作分镜表：

"""
${literaryScriptText}
"""

请严格输出以下 JSON 对象（用 \`\`\`json 包裹）：
\`\`\`json
{
  "shots": [
    {
      "shotNumber": 1,
      "durationSec": 4,
      "shotSizeAndCamera": "景别与运镜（如：面部极特写 → 急速拉远 + 轻微震屏）",
      "charactersInShot": "本镜入镜角色名",
      "visualDescription": "可直接复制给即梦/可灵的完整中文生图/生视频提示词（已融合画风「${project.visualStyle}」、入镜角色固定发型穿搭、动作神态与场景光影）",
      "imagePromptEn": "Complete English AI image/video prompt tags with character appearance consistency, lighting, camera angle, ${project.aspectRatio}",
      "actionAndExpression": "本镜对应的具体动作幅度与微表情（对应原剧本 △ 动作）",
      "dialogueSpeaker": "说话人（如 沈寂 / 沈寂(OS) / 无）",
      "dialogueVoiceStyle": "配音语气指导（如：低沉冷笑 / 惊恐失声）",
      "dialogueText": "本镜配音台词正文（无台词则留空字符串）",
      "sfxAndBgm": "对应【音效】与 BGM 情绪卡点"
    }
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseBreakdownShotsJson(raw: string): DramaShot[] {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const rawList = Array.isArray(parsed) ? parsed : parsed.shots;
  if (!Array.isArray(rawList)) return [];

  return rawList.map((s: any, idx: number) => ({
    id: generateUUID(),
    shotNumber: Number(s.shotNumber) || idx + 1,
    durationSec: Number(s.durationSec) || 5,
    shotSizeAndCamera: String(s.shotSizeAndCamera || '中近景推进'),
    charactersInShot: String(s.charactersInShot || ''),
    visualDescription: String(s.visualDescription || ''),
    imagePromptEn: String(s.imagePromptEn || ''),
    actionAndExpression: String(s.actionAndExpression || ''),
    dialogueSpeaker: String(s.dialogueSpeaker || '无'),
    dialogueVoiceStyle: String(s.dialogueVoiceStyle || ''),
    dialogueText: String(s.dialogueText || ''),
    sfxAndBgm: String(s.sfxAndBgm || ''),
  }));
}

/**
 * 一步全流程模式：同时生成「甲方标准 △ 文学剧本」+「下游 AI 分镜生图拆解单」
 */
export function buildDramaEpisodeMessages(params: {
  project: DramaProject;
  episodeIndex: number;
  scriptFormat?: DramaScriptFormat;
  directorInstruction: string;
  targetShotCount?: number;
  sourceNovelChapter?: { novelTitle: string; chapterTitle: string; chapterText: string } | null;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const {
    project,
    episodeIndex,
    scriptFormat = project.preferredScriptFormat || 'triangle_standard',
    directorInstruction,
    targetShotCount = 8,
    sourceNovelChapter,
  } = params;

  const track = getTrackByProject(project);
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const effectiveShotCount = targetShotCount || durSpec.recommendedShots;
  const isPaywallEp = episodeIndex === project.paywallEpisodeIndex;
  const plannedBeat = project.episodePlan.find((p) => p.episodeIndex === episodeIndex);
  const prevEp = project.episodes
    .filter((e) => e.index < episodeIndex)
    .sort((a, b) => b.index - a.index)[0];

  const formatRule = buildFormatRulePrompt(scriptFormat, episodeIndex);

  const charBlock =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map(
            (c) =>
              `- 【${c.name}】（${c.roleTag} | ${c.ageAndArchetype}${
                c.signatureTrait ? ` | 标志性道具/动作：${c.signatureTrait}` : ''
              }）\n  固定外貌词(中文)：${c.appearanceZh}\n  AI生图固定Tag(EN)：${c.visualPromptEn}\n  配音指导：${c.voicePersona}`
          )
          .join('\n')
      : '（暂未锁定角色资产，请在分镜生图词中自行保持主角外观前后统一）';

  const sceneBlock =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map(
            (s) =>
              `- 【${s.sceneName}${s.stateVariant ? ` · ${s.stateVariant}` : ''}】（${s.lightingAndMood}）：${s.visualPromptZh}`
          )
          .join('\n')
      : '（根据剧情自动匹配高反差光影场景）';

  const continuityBlock = buildLongSeriesContinuityPromptBlock(project, episodeIndex);

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

【当前漫剧项目工业规格与时长-字数强挂钩要求】
- 剧名：《${project.title}》
- 赛道规范：${track.name}（${project.channel}）
- ⏱️ 单集设定成片时长：**${durSpec.durationSec} 秒（${durSpec.label}）**
- 📏 文学剧本正文 \`scriptText\` 目标字数：**${durSpec.minWords} ~ ${durSpec.maxWords} 字**（包含 ${durSpec.sceneRange}，约 ${durSpec.beatRange}；各分镜 \`durationSec\` 累加总时长也须贴近 ${durSpec.durationSec} 秒！）
- 赛道节奏铁律：${track.pacingStructure}
- 赛道禁忌红线：${track.avoidTaboos}
- 全局统一画风：${project.visualStyle} | 画幅比例：${project.aspectRatio}

${formatRule}

【角色立绘一致性资产库（仅供下游 shots 生图词使用，严禁塞进上游 scriptText 文学剧本动作行！）】
${charBlock}

【核心场景视觉锚点（含同场景异态）】
${sceneBlock}`;

  const paywallNotice = isPaywallEp
    ? `\n🔥【重点警告：本集为第 ${episodeIndex} 集核心付费卡点集！】🔥\n必须在前半段给出一次极度解气的情绪小高潮，并在最后抛出全剧最炸裂的反转或危机戛然而止！`
    : '';

  const adaptationNotice = sourceNovelChapter
    ? `\n【小说章节跨界改编源素材】（来自小说《${sourceNovelChapter.novelTitle}》- ${sourceNovelChapter.chapterTitle}）：
"""
${sourceNovelChapter.chapterText.slice(0, 5500)}
"""
改编要求：剔除原小说冗长心理描写，先提炼为 ${durSpec.minWords}~${durSpec.maxWords} 字的极简标准文学剧本 \`scriptText\`，再同步拆解为 ${effectiveShotCount} 个漫剧视听分镜 \`shots\`！`
    : '';

  const user = `请结合下方【4层跨集连载记忆与伏笔追踪账本】，创作《${project.title}》第 ${episodeIndex} 集的【甲方标准文学剧本 (scriptText，目标字数 ${durSpec.minWords}~${durSpec.maxWords} 字，适配单集 ${durSpec.durationSec} 秒)】并同步拆解【后期 AI 分镜执行单 (shots，约 ${effectiveShotCount} 镜)】。

${continuityBlock}
${
  plannedBeat
    ? `\n【本集分集细纲预定节拍】：《${plannedBeat.title}》 —— ${plannedBeat.beatSummary}（定位：${plannedBeat.hookType}）`
    : ''
}
${paywallNotice}
${directorInstruction.trim() ? `\n【本集导演具体执导指令】：${directorInstruction.trim()}` : ''}
${adaptationNotice}

请严格输出以下 JSON 结构（用 \`\`\`json 包裹）：
\`\`\`json
{
  "title": "第${episodeIndex}集：极具冲击力的单集标题",
  "targetDurationSec": ${durSpec.durationSec},
  "coreConflictSummary": "一句话概括本集核心爽点闭环与推进成果",
  "continuitySummary": "供后续几十集连载记忆的高密度状态账本（50-90字：核心剧情结果 + 关系/筹码变化 + 关键道具或伏笔变更）",
  "opening3SecHook": "本集前3秒抓人眼球的核心视觉动作/冲突钩子",
  "endingCliffhanger": "本集最后一秒留存断章悬念钩子",
  "scriptText": "严格遵循所选甲方剧本格式的纯净文学剧本（总字数 ${durSpec.minWords}~${durSpec.maxWords} 字，含场头、出场人物、△极简动作/【音效】、角色精炼台词，绝不啰嗦！）",
  "episodeSceneAnchors": [
    {
      "sceneName": "本集新出现的场景名，或状态发生剧变的已有场景基础名（若均已存在且状态未变可留空 []）",
      "stateVariant": "场景状态（如：常规态 / 暴雨停电态 / 火灾废墟态）",
      "lightingAndMood": "光影冷暖色调与情绪氛围",
      "visualPromptZh": "适配「${project.visualStyle}」的中文固定场景描述",
      "visualPromptEn": "English environment prompt tags"
    }
  ],
  "foreshadowingUpdates": [
    {
      "action": "plant",
      "name": "本集新埋设(plant)、推进(ferment)或回收(resolve)的伏笔/关键道具名（无则留空 []）",
      "category": "关键道具",
      "ownerOrRelation": "关联角色",
      "expectedPayoffEpisode": "预计回收集数",
      "visualAnchorNote": "关键道具外观描述",
      "payoffNote": "埋设或回收说明"
    }
  ],
  "shots": [
    {
      "shotNumber": 1,
      "durationSec": 5,
      "shotSizeAndCamera": "景别与运镜（如：极特写 → 急速拉远 + 震屏特效）",
      "charactersInShot": "本镜出场角色名",
      "visualDescription": "可直接复制给即梦/可灵的完整中文生图/生视频提示词（融合画风「${project.visualStyle}」与角色固定立绘特征）",
      "imagePromptEn": "Complete English AI image/video prompt tags, ${project.aspectRatio}",
      "actionAndExpression": "具体肢体动作与微表情",
      "dialogueSpeaker": "说话角色名（旁白填 角色名(OS)，无台词填 无）",
      "dialogueVoiceStyle": "配音语气指导",
      "dialogueText": "短促有力的台词正文（无台词则留空字符串）",
      "sfxAndBgm": "具体环境音效与BGM卡点"
    }
  ],
  "nextEpisodeHooks": [
    "【下集方向1：强爽点打脸】具体剧情走向...",
    "【下集方向2：危机/规则升级】具体剧情走向...",
    "【下集方向3：隐藏底牌/伏笔回收】具体剧情走向..."
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * 当只有分镜数组时的兜底标准 △ 场次文学剧本合成器（严禁把生图提示词塞进文学剧本！）
 */
export function formatShotsToStandardTriangleScript(
  episodeIndex: number,
  sceneTitle: string,
  shots: DramaShot[],
  format: DramaScriptFormat = 'triangle_standard'
): string {
  const castSet = new Set<string>();
  shots.forEach((s) => {
    (s.charactersInShot || '')
      .split(/[、,，/\s]+/)
      .map((n) => n.replace(/（.*?）|\(.*?\)/g, '').trim())
      .filter((n) => n && n !== '无' && n !== '场景')
      .forEach((n) => castSet.add(n));
  });
  const castLine = castSet.size > 0 ? `出场人物：${Array.from(castSet).join('、')}` : '';

  if (format === 'manju_minimal') {
    const lines: string[] = [
      sceneTitle.startsWith('第') ? sceneTitle : `第${episodeIndex}集：${sceneTitle}`,
      '',
      `${episodeIndex}-1 主场景 日 内`,
    ];
    if (castLine) lines.push(castLine);
    lines.push('');

    shots.forEach((s) => {
      if (s.actionAndExpression) {
        lines.push(`${s.actionAndExpression.replace(/^[△▲]\s*/, '')}`);
      }
      if (s.sfxAndBgm) {
        lines.push(`【音效】：${s.sfxAndBgm}`);
      }
      if (s.dialogueText && s.dialogueText !== '无') {
        const speaker = s.dialogueSpeaker && s.dialogueSpeaker !== '无' ? s.dialogueSpeaker : '旁白';
        const tone = s.dialogueVoiceStyle ? `（${s.dialogueVoiceStyle}）` : '';
        lines.push(`${speaker}${tone}：${s.dialogueText}`);
      }
    });
    return lines.join('\n');
  }

  // Standard △ Triangle Format
  const lines: string[] = [
    `**${episodeIndex}-1 核心主场景 -- 日 -- 内景**`,
  ];
  if (castLine) lines.push(castLine);
  lines.push('');

  shots.forEach((s) => {
    if (s.actionAndExpression) {
      lines.push(`△ ${s.actionAndExpression.replace(/^[△▲]\s*/, '')}`);
    }
    if (s.sfxAndBgm) {
      lines.push(`【音效】：${s.sfxAndBgm}`);
    }
    if (s.dialogueText && s.dialogueText !== '无') {
      const speaker = s.dialogueSpeaker && s.dialogueSpeaker !== '无' ? s.dialogueSpeaker : '旁白';
      const tone = s.dialogueVoiceStyle ? `（${s.dialogueVoiceStyle}）` : '';
      lines.push(`${speaker}：${tone}${s.dialogueText}`);
    }
  });

  return lines.join('\n');
}

export function parseGeneratedDramaEpisode(
  raw: string,
  episodeIndex: number,
  isPaywallHook: boolean,
  scriptFormat: DramaScriptFormat = 'triangle_standard'
): DramaEpisode {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);

  const shots: DramaShot[] = Array.isArray(parsed.shots)
    ? parsed.shots.map((s: any, idx: number) => ({
        id: generateUUID(),
        shotNumber: Number(s.shotNumber) || idx + 1,
        durationSec: Number(s.durationSec) || 5,
        shotSizeAndCamera: String(s.shotSizeAndCamera || '中景推进'),
        charactersInShot: String(s.charactersInShot || ''),
        visualDescription: String(s.visualDescription || ''),
        imagePromptEn: String(s.imagePromptEn || ''),
        actionAndExpression: String(s.actionAndExpression || ''),
        dialogueSpeaker: String(s.dialogueSpeaker || '无'),
        dialogueVoiceStyle: String(s.dialogueVoiceStyle || ''),
        dialogueText: String(s.dialogueText || ''),
        sfxAndBgm: String(s.sfxAndBgm || ''),
      }))
    : [];

  const computedDuration =
    shots.reduce((sum, item) => sum + (item.durationSec || 5), 0) ||
    Number(parsed.targetDurationSec) ||
    90;

  const title = String(parsed.title || `第${episodeIndex}集`);
  const opening3SecHook = String(parsed.opening3SecHook || '');
  const endingCliffhanger = String(parsed.endingCliffhanger || '');

  const rawScriptFromModel = cleanMessyClientScriptLocal(String(parsed.scriptText || ''));
  const finalScriptText =
    rawScriptFromModel ||
    formatShotsToStandardTriangleScript(episodeIndex, title, shots, scriptFormat);

  return {
    id: generateUUID(),
    index: episodeIndex,
    title,
    isPaywallHook,
    targetDurationSec: computedDuration,
    coreConflictSummary: String(parsed.coreConflictSummary || ''),
    continuitySummary: parsed.continuitySummary ? String(parsed.continuitySummary).trim() : undefined,
    opening3SecHook,
    endingCliffhanger,
    scriptFormat,
    shots,
    rawScriptText: finalScriptText,
    nextEpisodeHooks: Array.isArray(parsed.nextEpisodeHooks)
      ? parsed.nextEpisodeHooks.map((h: any) => String(h))
      : [],
    updatedAt: Date.now(),
  };
}

export function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = trimmed.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      return trimmed.slice(firstBracket, lastBracket + 1);
    }
  }
  if (firstBrace !== -1) {
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
  }
  return trimmed;
}

export function exportDramaEpisodeToCsv(project: DramaProject, episode: DramaEpisode): string {
  const headers = [
    '剧名',
    '集数',
    '镜号',
    '时长(秒)',
    '景别与运镜',
    '出场角色',
    '中文AI生图/生视频提示词(即梦/可灵)',
    '英文生图Tag(MJ/Runway)',
    '△动作与微表情',
    '配音角色',
    '配音情绪指导',
    '台词文本',
    '音效与BGM卡点',
  ];

  const escapeCsv = (val: string | number | undefined) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = episode.shots.map((shot) =>
    [
      project.title,
      `第${episode.index}集`,
      shot.shotNumber,
      shot.durationSec,
      shot.shotSizeAndCamera,
      shot.charactersInShot,
      shot.visualDescription,
      shot.imagePromptEn || '',
      shot.actionAndExpression,
      shot.dialogueSpeaker,
      shot.dialogueVoiceStyle,
      shot.dialogueText,
      shot.sfxAndBgm,
    ]
      .map(escapeCsv)
      .join(',')
  );

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
}

export function exportDramaProjectToMarkdown(project: DramaProject): string {
  const durSpec = getEpisodeDurationSpec(project.episodeDurationSec);
  const bible = project.narrativeBible;
  const bibleMd = hasPopulatedNarrativeBible(bible)
    ? [
        bible?.worldSettingAndRules ? `### 1. 世界观与底层规则铁律\n${bible.worldSettingAndRules}` : '',
        bible?.storylineOverview ? `### 2. 核心故事线与时间轴脉络\n${bible.storylineOverview}` : '',
        bible?.mainPlotline ? `### 3. 主线核心矛盾与终极目标\n${bible.mainPlotline}` : '',
        bible?.subPlotlines ? `### 4. 情感暗线与副线支线设计\n${bible.subPlotlines}` : '',
        bible?.frameworkStructure ? `### 5. 分幕商业框架结构\n${bible.frameworkStructure}` : '',
        bible?.pacingStrategy ? `### 6. 剧情节奏与卡点波浪法则\n${bible.pacingStrategy}` : '',
        bible?.characterArcsAndRelations ? `### 7. 角色成长弧光与关系网演变\n${bible.characterArcsAndRelations}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  const charMd = project.characterAssets
    .map(
      (c) =>
        `### ${c.name}（${c.roleTag}）\n- **人设定位**：${c.ageAndArchetype}\n- **中文固定立绘词**：${c.appearanceZh}\n- **英文一致性 Tag**：\`${c.visualPromptEn}\`\n- **配音音色指导**：${c.voicePersona}\n- **记忆点微动作/道具**：${c.signatureTrait}`
    )
    .join('\n\n');

  const sceneMd = (project.sceneAnchors || [])
    .map(
      (s) =>
        `- **${s.sceneName}**（状态：${s.stateVariant || '常规态'} | 光影：${s.lightingAndMood}）：${s.visualPromptZh}`
    )
    .join('\n');

  const ledgerMd = (project.foreshadowingLedger || [])
    .map(
      (f) =>
        `- **[${f.status === 'resolved' ? '已回收' : f.status === 'fermenting' ? '发酵中' : '待回收'} · ${f.category}] ${f.name}**（第 ${f.plantedEpisode} 集埋设 | 关联：${f.ownerOrRelation}${
          f.expectedPayoffEpisode ? ` | 预计回收：${f.expectedPayoffEpisode}` : ''
        }）${f.payoffNote ? `\n  - 说明：${f.payoffNote}` : ''}`
    )
    .join('\n');

  const planMd = [...(project.episodePlan || [])]
    .sort((a, b) => a.episodeIndex - b.episodeIndex)
    .map(
      (p) =>
        `- **第 ${p.episodeIndex} 集《${p.title}》**（${p.hookType}）：${p.beatSummary}${
          p.foreshadowingOrProps ? `\n  - *伏笔/关键道具*：${p.foreshadowingOrProps}` : ''
        }`
    )
    .join('\n');

  const epMd = [...project.episodes]
    .sort((a, b) => a.index - b.index)
    .map((ep) => `## ${ep.title}\n\n${ep.rawScriptText}`)
    .join('\n\n---\n\n');

  return `# 《${project.title}》AI 漫剧工业化制作圣经\n\n- **热门赛道**：${project.trackName}（${project.channel}）\n- **视觉规格**：${project.visualStyle} · ${project.aspectRatio}\n- **单集时长与字数指标**：单集 ${durSpec.durationSec} 秒（目标剧本约 ${durSpec.minWords}~${durSpec.maxWords} 字）\n- **规划集数**：${project.totalPlannedEpisodes} 集（核心付费卡点：第 ${project.paywallEpisodeIndex} 集）\n- **核心卖点 (Logline)**：${project.logline}\n- **开篇黄金前3秒**：${project.golden3SecHook}\n\n## 一、全剧商业大纲与叙事架构圣经\n\n${project.synopsis}\n\n${bibleMd ? `${bibleMd}\n\n` : ''}## 二、角色视觉一致性立绘档案\n\n${charMd || '暂未建档'}\n\n## 三、核心场景视觉锚点（含同场景异态）\n\n${sceneMd || '暂未归档场景'}\n\n## 四、角色伏笔与关键道具追踪台账\n\n${ledgerMd || '暂未登记伏笔台账'}\n\n## 五、分集节拍与伏笔规划目录（已规划 ${project.episodePlan?.length || 0} 集）\n\n${planMd || '暂未生成分集细纲'}\n\n## 六、分集甲方标准剧本\n\n${epMd || '暂无已生成分集'}`;
}

/**
 * 模糊构想 · AI 漫剧立项探讨顾问（支持前期预设或 AI 自动测算【竖屏/横屏、单集时长、总集数】，并同步输出叙事架构圣经与初始伏笔道具）
 */
const VALID_VISUAL_STYLES: DramaVisualStyle[] = [
  '2.5D精致厚涂精绘',
  '国漫厚涂精绘',
  '日韩唯美赛璐璐网漫',
  '日韩赛璐璐网漫',
  '暗黑赛博霓虹',
  '新中式古风玄幻',
  '写实电影感漫剧',
  '美式硬派漫画',
];

const VALID_CHANNELS: DramaAudienceChannel[] = ['女频爆款', '男频爆款', '全民脑洞', '悬疑惊悚'];

export function buildDramaConsultantMessages(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  preSpecs?: DramaConsultantPreSpecs
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const trackCatalog = HOT_DRAMA_TRACKS.map(
    (t) =>
      `- trackId: "${t.id}" | 频道: ${t.channel} | 赛道名: ${t.name} | 热度: ${t.heatLabel} | 推荐画风: ${t.visualStyleRecommend} | 核心爽点: ${t.coreEmotion}`
  ).join('\n');

  const aspectSpecNote =
    !preSpecs || preSpecs.aspectRatioPref === 'auto'
      ? '由你结合题材受众与投放渠道自动判断推荐 `9:16 竖屏短剧` 或 `16:9 横屏中剧`（抖音/快手/红果高频情绪拉扯优先 9:16 竖屏；B站长线世界观/大场面精品动态漫可选 16:9 横屏）'
      : `创作者已明确锁定画幅为：「${preSpecs.aspectRatioPref}」，3套方案必须全部采用该画幅！`;

  const durationSpecNote =
    !preSpecs || preSpecs.episodeDurationPref === 'auto'
      ? '由你根据题材密度自动匹配最佳单集时长（如极速爽剧 60~90 秒，细腻情感/悬疑动态漫 90~150 秒，横屏中剧 180~240 秒）'
      : `创作者已明确指定单集时长为：${preSpecs.episodeDurationPref} 秒/集（剧本字数约 ${getEpisodeDurationSpec(preSpecs.episodeDurationPref).minWords}~${getEpisodeDurationSpec(preSpecs.episodeDurationPref).maxWords} 字/集），3套方案必须严格锁定 \`"episodeDurationSec": ${preSpecs.episodeDurationPref}\`！`;

  const totalEpSpecNote =
    !preSpecs || preSpecs.totalEpisodesPref === 'auto'
      ? '【请 AI 自动测算最佳总集数】：请根据每套方案的故事容量、矛盾层级、支线厚度、单集时长与平台商业回收模型（如精品中短篇 30~45 集、主流商业连载 60~80 集、长线群像升级流 80~100 集），为每套方案科学评估最合适的 `totalPlannedEpisodes`，并在 `totalEpisodesReason` 中一句话写明集数测算依据！'
      : `创作者已指定目标总集数为：${preSpecs.totalEpisodesPref} 集，3套方案请围绕 \`"totalPlannedEpisodes": ${preSpecs.totalEpisodesPref}\` 设计完整分幕框架结构与付费卡点！`;

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你现在是国内一线商业 AI 漫剧与竖屏动态漫【首席立项策划顾问 & 总制片人】。
许多创作者来到立项台时，脑海里往往只有一个模糊构想。你的核心职责是与创作者进行专业立项探讨，并在前期帮创作者把控好工业规格与长线叙事骨架：

【当前创作者前期工业规格约束（必须严格执行）】：
1. **画幅规格（竖屏/横屏）**：${aspectSpecNote}
2. **单集时长设定**：${durationSpecNote}
3. **总集数规划**：${totalEpSpecNote}

【输出内容要求】：
1. \`marketTrendAnalysis\`：结合当季主流漫剧平台热度，分析用户构想的市场潜力、受众爽点、画风优势及规格适配度。
2. \`consultantReply\`：制片人直接回应创作者（含对竖屏/横屏、单集时长与总集数体量的专业建议）。
3. \`options\`：提供 3 套差异化商业漫剧立项方案，每套方案除剧名、卖点、黄金前3秒、三阶段总大纲与 2~3 位主角固定立绘外，还必须同步构建精炼扎实的 \`narrativeBible\`（故事线、主线、支线、分幕框架结构、剧情节奏、底层规则、角色弧光）与 2~3 项初始关键道具/角色伏笔（\`seedForeshadowing\`），确保选定立项后长篇连载骨架一步到位！

【平台可选热门赛道库】：
${trackCatalog}

【合法画风枚举】：${VALID_VISUAL_STYLES.join(' / ')}

请严格输出纯 JSON 对象（用 \`\`\`json 包裹，严禁在代码块外堆砌多余文字）：
\`\`\`json
{
  "marketTrendAnalysis": "120~220字：针对用户模糊构想的当季漫剧市场热度诊断、大众喜好风向、画风与画幅/时长规格分析",
  "consultantReply": "80~160字：制片人给创作者的直接探讨反馈、体量集数建议与破局思路",
  "options": [
    {
      "optionId": "opt-1",
      "directionTag": "方向01 · 简短定位标签（如：错位契约·舞台暗恋拉扯）",
      "title": "极具网感与点击欲的漫剧剧名（不含书名号）",
      "trackId": "从上方赛道库选取最匹配的 trackId",
      "channel": "女频爆款",
      "visualStyle": "2.5D精致厚涂精绘",
      "aspectRatio": "9:16 竖屏短剧",
      "episodeDurationSec": 90,
      "totalPlannedEpisodes": 60,
      "totalEpisodesReason": "一句话说明为什么该题材与冲突容量最适合定为该总集数（如：双马甲掉马+选秀晋级三轮公演+豪门夺权，60集×90秒最利拉满完播与二轮复购）",
      "paywallEpisodeIndex": 10,
      "marketFitReason": "一句话说明该方向为什么能打爆完播率与付费转化",
      "logline": "一句话商业核心卖点（50~90字）",
      "targetAudience": "精准核心受众画像与情绪痛点",
      "golden3SecHook": "第1集黄金前3秒具体画面奇观、肢体冲突与首句抓耳台词",
      "synopsis": "分三阶段（免费留存期 → 付费卡点大钩子 → 主线高潮）的完整商业大纲（220~360字）",
      "narrativeBible": {
        "worldSettingAndRules": "底层规则铁律与背景设定（60~110字）",
        "storylineOverview": "核心故事线时间轴脉络（70~120字）",
        "mainPlotline": "核心主线矛盾与终极目标（60~110字）",
        "subPlotlines": "情感暗线与副线支线设计（60~110字）",
        "frameworkStructure": "匹配 totalPlannedEpisodes 总集数的四幕商业框架集数切分（80~140字）",
        "pacingStrategy": "匹配单集时长与跨集波浪卡点的剧情节奏策略（60~110字）",
        "characterArcsAndRelations": "核心主角成长弧光与关系演变（60~110字）"
      },
      "seedForeshadowing": [
        {
          "name": "核心关键道具或角色伏笔名",
          "category": "关键道具",
          "ownerOrRelation": "关联角色",
          "plantedEpisode": 1,
          "expectedPayoffEpisode": "预计发酵与回收集数",
          "visualAnchorNote": "关键道具固定视觉描述",
          "payoffNote": "回收反转方式"
        }
      ],
      "seedCharacters": [
        {
          "name": "主角姓名",
          "roleTag": "核心女主 / 核心男主",
          "ageAndArchetype": "年龄与高反差人设标签",
          "appearanceZh": "适配该画风的中文固定立绘特征",
          "visualPromptEn": "Consistent English AI art prompt tags",
          "voicePersona": "TTS配音音色与情绪指导",
          "signatureTrait": "标志性镜头微动作或随身信物道具"
        }
      ]
    }
  ],
  "followUpChips": [
    "给创作者追问微调的快捷建议1",
    "给创作者追问微调的快捷建议2",
    "给创作者追问微调的快捷建议3"
  ]
}
\`\`\``;

  return [
    { role: 'system', content: system },
    ...conversationHistory.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
  ];
}

export function parseDramaConsultantResponse(raw: string): DramaConsultantResponse {
  const cleaned = extractJsonString(raw);
  try {
    const parsed = JSON.parse(cleaned);
    const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];

    const options: DramaConsultantOption[] = rawOptions.map((opt: any, idx: number) => {
      const matchedTrack =
        HOT_DRAMA_TRACKS.find((t) => t.id === opt.trackId) ||
        HOT_DRAMA_TRACKS.find((t) => opt.visualStyle?.includes('2.5D') && t.id === 'track-idol-romance') ||
        HOT_DRAMA_TRACKS[0];

      const styleCandidate = String(opt.visualStyle || '').trim() as DramaVisualStyle;
      const visualStyle: DramaVisualStyle = VALID_VISUAL_STYLES.includes(styleCandidate)
        ? styleCandidate
        : matchedTrack.visualStyleRecommend;

      const channelCandidate = String(opt.channel || '').trim() as DramaAudienceChannel;
      const channel: DramaAudienceChannel = VALID_CHANNELS.includes(channelCandidate)
        ? channelCandidate
        : matchedTrack.channel;

      const aspectRatio: DramaAspectRatio =
        opt.aspectRatio === '16:9 横屏中剧' ? '16:9 横屏中剧' : '9:16 竖屏短剧';

      const seedCharacters: DramaConsultantCharacterSeed[] = Array.isArray(opt.seedCharacters)
        ? opt.seedCharacters.map((c: any) => ({
            name: String(c.name || '核心角色'),
            roleTag: String(c.roleTag || '主要角色'),
            ageAndArchetype: String(c.ageAndArchetype || ''),
            appearanceZh: String(c.appearanceZh || ''),
            visualPromptEn: String(c.visualPromptEn || ''),
            voicePersona: String(c.voicePersona || ''),
            signatureTrait: String(c.signatureTrait || ''),
          }))
        : [];

      const seedForeshadowing: DramaConsultantForeshadowSeed[] = Array.isArray(
        opt.seedForeshadowing
      )
        ? opt.seedForeshadowing
            .filter((f: any) => f && f.name)
            .map((f: any) => {
              const cat = String(f.category || '').trim() as DramaForeshadowCategory;
              return {
                name: String(f.name || ''),
                category: VALID_FORESHADOW_CATEGORIES.includes(cat) ? cat : '关键道具',
                ownerOrRelation: String(f.ownerOrRelation || '核心主角线'),
                plantedEpisode: Math.max(1, Number(f.plantedEpisode) || 1),
                expectedPayoffEpisode: String(f.expectedPayoffEpisode || ''),
                visualAnchorNote: String(f.visualAnchorNote || ''),
                payoffNote: String(f.payoffNote || ''),
              };
            })
        : [];

      return {
        optionId: String(opt.optionId || `opt-${idx + 1}-${generateUUID()}`),
        directionTag: String(opt.directionTag || `立项方案 0${idx + 1}`),
        title: String(opt.title || '未命名爆款企划').replace(/[《》]/g, '').trim(),
        trackId: matchedTrack.id,
        channel,
        visualStyle,
        aspectRatio,
        episodeDurationSec: Math.max(45, Math.min(480, Number(opt.episodeDurationSec) || 90)),
        totalPlannedEpisodes: Math.max(12, Math.min(200, Number(opt.totalPlannedEpisodes) || 60)),
        totalEpisodesReason: String(opt.totalEpisodesReason || ''),
        paywallEpisodeIndex: Number(opt.paywallEpisodeIndex) || 10,
        marketFitReason: String(opt.marketFitReason || ''),
        logline: String(opt.logline || ''),
        targetAudience: String(opt.targetAudience || matchedTrack.targetAudience),
        golden3SecHook: String(opt.golden3SecHook || ''),
        synopsis: String(opt.synopsis || ''),
        narrativeBible: opt.narrativeBible
          ? normalizeNarrativeBible(opt.narrativeBible)
          : undefined,
        seedForeshadowing,
        seedCharacters,
      };
    });

    return {
      marketTrendAnalysis: String(parsed.marketTrendAnalysis || ''),
      consultantReply: String(parsed.consultantReply || ''),
      options,
      followUpChips: Array.isArray(parsed.followUpChips)
        ? parsed.followUpChips.map((s: any) => String(s)).filter(Boolean)
        : [],
    };
  } catch (e) {
    console.warn('Failed to parse DramaConsultantResponse JSON:', e);
    return {
      marketTrendAnalysis: '',
      consultantReply: raw.trim(),
      options: [],
      followUpChips: [],
    };
  }
}

