export interface IdeaCard {
  id: string;
  content: string;
  tag?: string;
  category?: string;
  order: number;
  createdAt: number;
}

export type LorebookEntryType = 'character' | 'xp_trope' | 'world_rule' | 'scene_pack';
export type ActivationMode = 'constant' | 'keyword';

export interface LorebookEntry {
  id: string;
  name: string;
  entryType?: LorebookEntryType;
  activationMode?: ActivationMode;
  keywords?: string[];
  appearance?: string;
  personality?: string;
  behaviorQuirks?: string;
  mustIncludeTaboos?: string;
  enabled: boolean;
}

export type SkillScope = 'outline' | 'chapter' | 'reroll' | 'polish';
export type SkillCategory = 'style' | 'rule' | 'preference' | 'structure' | 'custom';
export type SkillRuleTier = 'contract' | 'advisory';

export interface SkillReferenceDoc {
  id: string;
  path: string; // e.g. "references/叙事层生成契约.md"
  title: string;
  content: string;
  sizeBytes: number;
  routingTask?: string; // Extracted from SKILL.md routing table
  keywords?: string[]; // Keywords for progressive on-demand context injection
  alwaysLoad?: boolean; // If true, always mount when parent skill is active
}

export interface SkillScriptMeta {
  path: string; // e.g. "scripts/prose_metrics.py"
  name: string;
  purpose?: string;
  sizeBytes: number;
}

export interface SkillQualityTarget {
  metric: string;
  medianTarget: string;
  note?: string;
}

export interface NovelSkill {
  id: string;
  slug?: string; // Technical identifier from YAML `name:` (e.g. novel-character-dialogue)
  name: string; // Human readable name (`display_name` or `name`)
  version?: string;
  description: string; // Supports `description_zh` + `description`
  promptInstruction: string; // Entry point instruction / distilled SKILL.md body
  ruleTier?: SkillRuleTier; // 'contract' (硬性阻断契约) vs 'advisory' (弹性质量观察)
  category?: SkillCategory;
  scopes?: SkillScope[];
  triggerMode?: 'always' | 'keyword';
  keywords?: string[];
  priority?: 'high' | 'normal';
  enabled: boolean;
  isPreset?: boolean;
  packageType?: 'single-md' | 'zip-package';
  references?: SkillReferenceDoc[]; // Sub-documents inside references/ (progressive disclosure)
  scriptsMeta?: SkillScriptMeta[]; // Auxiliary scripts metadata from scripts/
  qualityTargets?: SkillQualityTarget[]; // Measurable prose targets parsed from SKILL.md
  rawSkillMd?: string; // Original lossless SKILL.md for faithful round-trip export
  githubRepo?: {
    owner: string;
    repo: string;
    branch?: string;
    skillPath?: string;
    installedCommitSha?: string;
    installedCommitDate?: string;
  };
  latestRemoteUpdate?: {
    hasUpdate: boolean;
    remoteSha: string;
    remoteDate: string;
    remoteMessage: string;
    checkedAt: number;
  };
}

export interface DomesticApiPreset {
  id: string;
  name: string;
  regionTag: string;
  baseUrl: string;
  defaultModels: Array<{ id: string; name: string }>;
  docHint: string;
}

export const DOMESTIC_API_PRESETS: DomesticApiPreset[] = [
  {
    id: 'preset-deepseek',
    name: 'DeepSeek 官方直连',
    regionTag: '国内免魔法直连',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModels: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (日常正文创作主力)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (大纲构思与逻辑推演)' },
    ],
    docHint: '前往 platform.deepseek.com 获取 API Key，国内网络直接秒连，长文情感细腻且性价比极高。',
  },
  {
    id: 'preset-siliconflow',
    name: '硅基流动 SiliconFlow',
    regionTag: '国内极速聚合',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (满血高速版)' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 (深度思考版)' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B (通义旗舰)' },
    ],
    docHint: '前往 cloud.siliconflow.cn 获取 API Key，支持满血 DeepSeek 与千问全系模型，国内免代理直连。',
  },
  {
    id: 'preset-volcengine',
    name: '火山引擎方舟 (豆包/DeepSeek)',
    regionTag: '字节国内高并发',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModels: [
      { id: 'deepseek-v3-250324', name: 'DeepSeek-V3 (火山高速节点)' },
      { id: 'deepseek-r1-250120', name: 'DeepSeek-R1 (火山推理节点)' },
    ],
    docHint: '字节跳动旗下火山方舟平台，国内超低延迟不卡顿，支持填入模型 ID 或推理接入点 ep-xxx。',
  },
  {
    id: 'preset-aliyun',
    name: '阿里云百炼 (通义千问)',
    regionTag: '国内稳定直连',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: [
      { id: 'qwen-max', name: 'Qwen-Max (通义千问旗舰)' },
      { id: 'qwen-plus', name: 'Qwen-Plus (均衡长文本)' },
      { id: 'deepseek-v3', name: 'DeepSeek-V3 (百炼托管)' },
    ],
    docHint: '阿里云百炼控制台获取 API Key，国内骨干网直连。',
  },
  {
    id: 'preset-moonshot',
    name: '月之暗面 Kimi',
    regionTag: '超长上下文记忆',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModels: [
      { id: 'moonshot-v1-32k', name: 'Moonshot-v1-32k (长篇连载)' },
      { id: 'moonshot-v1-128k', name: 'Moonshot-v1-128k (超长记忆)' },
    ],
    docHint: '前往 platform.moonshot.cn 获取 Key，擅长超长前文记忆与中文语感。',
  },
  {
    id: 'preset-zhipu',
    name: '智谱清言 BigModel',
    regionTag: '国内直连',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModels: [
      { id: 'glm-4-plus', name: 'GLM-4-Plus (高阶创作)' },
      { id: 'glm-4-air', name: 'GLM-4-Air (轻量快速)' },
    ],
    docHint: '智谱开放平台 open.bigmodel.cn 获取 Key，国内直接访问。',
  },
];

import { GITHUB_IMPLANTED_SKILLS, LEGACY_DEPRECATED_SKILL_IDS } from '../data/githubSkillsBundle';

export { LEGACY_DEPRECATED_SKILL_IDS };

export const DEFAULT_PRESET_SKILLS: NovelSkill[] = GITHUB_IMPLANTED_SKILLS;

// ============================================================================
// 四层拆纲法 (L1总纲 → L2分卷纲 → L3剧情单元纲 → L4单章细纲) & 全设定强关联图谱
// ============================================================================

export interface MasterOutlineSpec {
  corePromise: string; // 核心读者契约（读者点进来的第一预期与全书爽点锚点）
  ultimateEnding: string; // 最终结局锚点（主角终局归宿、核心矛盾最终闭合形态）
  worldCeiling: string; // 战力/社会/代价顶层天花板（防止中后期设定膨胀崩盘）
  mainPlotline: string; // 主线推进脉络（贯穿全书的核心冲突主轴）
  emotionalOrSubPlotline: string; // 感情线 / 双主副线交织脉络
  darkPlotline: string; // 暗线 / 幕后终极悬念（与主线互为因果）
}

export interface NovelVolumePlanItem {
  id: string;
  volumeIndex: number;
  title: string;
  chapterSpan: string; // e.g. "第1章 - 第30章"
  stageGoal?: string; // 本卷阶段核心目标（围绕 L1 终局拆解出的阶段里程碑）
  entryState?: string; // 入卷起点状态（主角处境/实力/关系起点）
  exitState?: string; // 出卷终点状态反差（本卷收官时的实质跃迁与遗留新危机）
  turningPoints?: string; // 1/4入局 · 中点惊变 · 3/4绝境 低谷反扑节点
  coreConflict: string;
  climaxGoal: string;
}

export interface NovelStoryUnitItem {
  id: string;
  volumeId: string; // 绑定所属 L2 分卷 ID
  unitIndex: number;
  title: string; // e.g. "第一单元 · 寒山拾魔与巡山危机"
  chapterSpan: string; // e.g. "第1章 - 第6章"
  volumeAlignment: string; // 围绕本卷阶段目标不跑偏锚点（说明本单元如何推进所属分卷目标）
  coreConflict: string; // 单元核心对手/危机事件
  payoffEvent: string; // 单元收束高潮与爽点兑现
  breakthroughMethod: string; // 主角破局手段标签（强制相邻单元不雷同：如智取信息差 vs 底牌爆发 vs 借势反杀）
  linkedCharacterIds?: string[]; // 本单元关联角色 ID 列表
  linkedItemIds?: string[]; // 本单元涉及关键道具 ID 列表
  linkedForeshadowIds?: string[]; // 本单元埋设/推进/回收的伏笔 ID 列表
}

export type ChapterPacingType =
  | '爆发'
  | '推进'
  | '感情关系'
  | '蓄力铺垫'
  | '日常喘息'
  | '过渡转场';

export interface NovelChapterOutlineItem {
  id: string;
  chapterIndex: number;
  title: string;
  summary: string; // 2~4 sentences concise summary of what happens in this chapter
  volumeId?: string; // 绑定所属 L2 分卷 ID
  unitId?: string; // 绑定所属 L3 剧情单元 ID
  volumeTag?: string; // e.g. "第一卷 · 潜龙在渊"
  protagonistGoal?: string; // L4 主角本章具体目标
  coreObstacle?: string; // L4 本章核心外部/内部阻力与反制
  stateDelta?: string; // L4 本章实质推进增量（配额管控：至多1项大突破，防失速或原地踏步）
  hookNote?: string; // L4 章末钩子（悬念/危机/认知反转）
  pacingType?: ChapterPacingType; // 松紧档位（防连续高压疲劳或连续水文）
  linkedCharacterIds?: string[]; // 本章登场/受影响角色 ID
  linkedItemIds?: string[]; // 本章流转/动用的关键道具 ID
  linkedForeshadowIds?: string[]; // 本章埋设/推进/回收的伏笔 ID
  status?: 'planned' | 'drafted';
}

export type NovelCharacterRoleTier = '主角' | '核心主配/CP' | '重要配角' | '阶段反派' | '幕后反派';

export interface NovelCharacterRelationNode {
  id: string;
  name: string;
  roleType: NovelCharacterRoleTier;
  coreDesire: string; // 核心欲望与行动底层动机（利益/恐惧/执念）
  speechStyle: string; // 说话口癖、句长特征与潜台词习惯（供 character-designer 锁死声纹）
  epistemicBoundary: string; // 当前认知与知情权边界（明确角色知道什么、不知道什么，严防开上帝视角）
  currentStatus: string; // 当前状态快照（位置/伤势/立场/修为或资源状态）
  debutChapter?: number;
  relations?: Array<{ targetName: string; relation: string }>; // 与其他角色的动态关系锚点
  lorebookId?: string; // 双向联动的世界书条目 ID
}

export type NovelKeyItemStatus =
  | '未现世'
  | '主角持有'
  | '他人持有'
  | '争夺遗失'
  | '已消耗损毁';

export interface NovelKeyItem {
  id: string;
  name: string;
  category: string; // 信物 / 杀器 / 功法秘籍 / 关键线索 / 契约限制物
  holderName: string; // 当前持有者名称或所在地点
  holderCharacterId?: string; // 绑定关联角色节点 ID
  originChapter?: number; // 首次出场或计划出场章号
  rulesAndCost: string; // 核心功能、使用代价与冷却限制（防机械降神）
  status: NovelKeyItemStatus;
  linkedForeshadowIds?: string[]; // 关联伏笔 ID
  milestoneNote?: string; // 流转轨迹记录
}

export interface NovelForeshadowItem {
  id: string;
  name: string;
  plantedChapter: number;
  progressedChapters?: string; // 中途推进/草蛇灰线呼应章号（如 "第6章、第14章"）
  expectedResolveChapter?: string;
  resolvedChapter?: number; // 实际回收闭合章号
  targetUnitId?: string; // 计划在哪一 L3 剧情单元推进或回收
  status: 'planted' | 'fermenting' | 'resolved';
  note: string;
  linkedCharacterIds?: string[]; // 关联角色 ID（谁埋下/谁受影响）
  linkedItemIds?: string[]; // 关联关键道具 ID（伏笔载体）
}

export interface FourLayerAuditIssue {
  id: string;
  layer: 'L1总纲' | 'L2分卷纲' | 'L3单元纲' | 'L4单章细纲' | '跨设定关联';
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  fixSuggestion: string;
}

// ============================================================================
// 文风蒸馏工坊 (Style Distillation Engine — 替代旧版生硬原文粘贴模仿)
// ============================================================================

export interface StyleQuantitativeMetrics {
  charCount: number;
  sentenceCount: number;
  avgSentenceLen: number;
  sentenceLenStdDev: number; // 句长离散度 σ（Burstiness 核心人类指纹）
  shortRatio: number; // 短句 (<12字) 占比 %
  mediumRatio: number; // 中句 (12~28字) 占比 %
  longRatio: number; // 长句 (>28字) 占比 %
  avgParagraphSentences: number; // 段均句数
  singleSentenceParaRatio: number; // 独句成段占比 %（呼吸留白感）
  dialogueRatio: number; // 对白占比 %
  emDashPer1k: number; // 每千字破折号数
  exclamationPer1k: number; // 每千字感叹号数
}

export interface DistilledStyleProfile {
  id: string;
  name: string; // 蒸馏文风资产名称（如：冷峻古龙风短句留白 / 江南式细腻少年意气）
  sourceAuthor?: string; // 原样本作者或作品备注（仅本地标记，绝不写入生成抄袭指令）
  createdAt: number;
  sampleExcerpt: string; // 本地留存的少量样本节选（不直接粗暴塞入正文防止串名）
  metrics: StyleQuantitativeMetrics; // 精确统计出的句法指纹
  narrativeVoice: string; // 1. 叙事视角距离与冷暖腔调
  sentenceCadence: string; // 2. 句法长短错落与断句呼吸律
  sensorySignature: string; // 3. 五感切入偏好与意象密度
  dialogueCraft: string; // 4. 对白潜台词与动作打断习惯
  lexicalFeatures: string; // 5. 词汇颗粒度、动词力度与虚词习惯
  antiSlopTaboos: string; // 6. 该文风绝对排斥的违和词句与 AI 腔禁区
  anonymizedAnchors: string[]; // 7. 去名化纯粹句法节奏示范锚点（已剥离原作人名地名设定词）
  executableDirective: string; // 凝练可直接注入 System Prompt 的高权重文风契约
}

// ============================================================================
// 腾讯朱雀 AI 检测对抗审查 (Tencent Zhuque Detector & story-deslop / story-review)
// ============================================================================

export interface ZhuqueFinding {
  id: string;
  ruleId: string;
  categoryLabel: string;
  severity: 'blocking' | 'advisory';
  matchedText: string;
  reason: string;
  fixHint: string;
}

export interface ZhuqueAuditReport {
  aiRiskScore: number; // 0 ~ 100 模拟朱雀 AIGC 浓度预估分（<20% 为安全人类过审区）
  verdict: 'pass' | 'borderline' | 'high_risk';
  burstinessStdDev: number; // 句长标准差 σ（人类通常 >= 12.5，AI 常 < 9.5）
  avgSentenceLen: number;
  shortSentencePct: number;
  singleParaPct: number;
  dialoguePct: number;
  blockingCount: number;
  advisoryCount: number;
  findings: ZhuqueFinding[];
}

export interface StoryReviewDimensionResult {
  dimension: string;
  score: number; // 0 ~ 100
  status: 'pass' | 'warn' | 'fail';
  critique: string;
  actionableFixes: string[];
}

export interface AdversarialStoryReviewReport {
  overallPass: boolean;
  overallScore: number;
  summaryVerdict: string;
  dimensions: StoryReviewDimensionResult[];
}

export interface BookSettings {
  genre: string;
  style: string;
  chapterWords: number | string;
  pov: string;
  tense: string;
  temperature: number | string;
  contextMemory: number | string;
  aiPersona: string;
  outline: string;
  characters: string;
  world: string;
  styleReference: string | null;
  lorebook?: LorebookEntry[];
  skills?: NovelSkill[];

  // 文风蒸馏 DNA 挂载（升级替代原始粗放的 styleReference）
  activeDistilledStyle?: DistilledStyleProfile | null;

  // 朱雀过审级自动去 AI 味校准开关
  autoZhuqueDeslop?: boolean;

  // Per-Book XP System Switch & Note (100% pipeline control)
  xpSystemEnabled?: boolean;
  bookXpNote?: string;

  // 11-Module × 20-Item (220-dimension) Commercial Novel Architecture System
  systemSettings?: Record<string, string[]>; // key: `${moduleId}.${fieldId}` -> selected + custom strings
  systemCustomNotes?: Record<string, string>; // key: moduleId -> freeform module supplement
  lastSyncedSettingsHash?: string; // Snapshot hash from last AI outline sync
  systemSettingsDirty?: boolean; // True when user manually tweaks critical settings after AI sync

  // 四层拆纲法 (L1总纲 → L2分卷纲 → L3剧情单元纲 → L4单章细纲) & 全要素强关联图谱
  masterOutlineSpec?: MasterOutlineSpec;
  volumePlan?: NovelVolumePlanItem[];
  storyUnits?: NovelStoryUnitItem[];
  chapterOutlines?: NovelChapterOutlineItem[];
  characterGraph?: NovelCharacterRelationNode[];
  keyItemRegistry?: NovelKeyItem[];
  foreshadowLedger?: NovelForeshadowItem[];

  // Commercial Signing & Platform Submission Package
  targetPlatform?: string;
  commercialBlurb?: string;
  alternateTitles?: string[];
  signingReviewReport?: string;
}

export interface Chapter {
  id: string;
  index: number;
  title: string;
  text: string;
  meta: string;
  userNextPlotInput?: string;
  allSuggestions?: Array<{ suggestions: string[]; timestamp: number }>;
  nextOptions?: string[];
}

export interface ArchivedChapter extends Chapter {
  archivedAt: number;
}

export interface Summary {
  id: string;
  createdAt: number;
  startChapter: number;
  endChapter: number;
  chapterRange: string;
  content: string;
  title: string;
}

export interface Book {
  id: string;
  title: string;
  createdAt: number;
  lastModifiedAt: number;
  chapters: Chapter[];
  archivedChapters: ArchivedChapter[];
  summaries: Summary[];
  settings: BookSettings;
}

export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  provider: 'openai-compatible' | 'built-in-gemini';
  modelsCache?: Array<{ id: string; name?: string }>;
}

export interface InspirationRecord {
  id: string;
  createdAt: number;
  title: string;
  genre: string;
  style: string;
  outline: string;
  characters: string;
  world: string;
  rawContent: string;
  linkedNovels?: Array<{ novelId: string; novelTitle: string }>;
}

export type ThemeName = 'ink' | 'celadon' | 'indigo' | 'cinnabar' | 'amber' | 'green' | 'pink' | 'blue' | 'yellow' | 'purple' | 'white';

export type CreativeTrack = 'novel' | 'drama';

export interface StudioBrandPreset {
  id: string;
  name: string;
  tagline: string;
  desc: string;
}

export const STUDIO_BRAND_PRESETS: StudioBrandPreset[] = [
  {
    id: 'brand-moying',
    name: '墨映工坊',
    tagline: '执笔长篇 · 映现分镜',
    desc: '「墨」代表个人私享小说自由创作，「映」代表商业漫剧视听映像，雅致大气且兼顾双栖定位。',
  },
  {
    id: 'brand-fuguang',
    name: '浮光执笔',
    tagline: '文字与光影的私人造梦台',
    desc: '兼具文学呼吸感与短剧镜头流动感，适合偏文艺与脑洞并重的创作者。',
  },
  {
    id: 'brand-wanxiang',
    name: '万象叙事局',
    tagline: '多维故事孵化与分镜中枢',
    desc: '现代制片厂与内容实验室调性，凸显既能自由写书又能工业化量产剧本。',
  },
  {
    id: 'brand-zaowu',
    name: '造物片场',
    tagline: '一人即剧组 · 落笔成片',
    desc: '强主理人视角，突出从灵感到文字再到 AI 漫剧分镜的完整闭环。',
  },
];

export interface UiSettings {
  theme: ThemeName;
  mode: 'light' | 'dark';
  chapterFontSize: string;
  chapterFontFamily?: 'serif' | 'sans';
  studioBrandName?: string;
  activeTrack?: CreativeTrack;
  writerApiCfgId: string | null;
  writerApiModel: string | null;
  rerollApiCfgId: string | null;
  rerollApiModel: string | null;
  inspirationApiCfgId?: string | null;
  inspirationApiModel?: string | null;
  // Tencent Zhuque (腾讯朱雀 AIGC 内容检测)
  zhuqueApiGatewayUrl?: string;
  zhuqueApiKey?: string;
}

export interface ZhuqueOnlineDetectResult {
  isConfigured: boolean;
  score?: number; // 0-100%
  suspectedAiPct?: number; // 疑似AI比例
  aiFeaturePct?: number; // AI特征比例
  humanFeaturePct?: number; // 人工创作特征比例
  verdict?: 'pass' | 'borderline' | 'high_risk';
  conclusionText?: string;
  rawResponse?: any;
  error?: string;
  checkedAt?: number;
}

export interface HistoryItem {
  id?: number | string;
  createdAt?: number;
  ts?: number;
  content?: string;
  text?: string;
}

// ============================================================================
// AI 漫剧 / 短剧剧本创作 (Commercial Market-Driven Script Studio — 0% XP Leakage)
// ============================================================================

export type DramaAudienceChannel = '男频爆款' | '女频爆款' | '全民脑洞' | '悬疑惊悚';
export type DramaVisualStyle =
  | '2.5D精致厚涂精绘'
  | '国漫厚涂精绘'
  | '日韩唯美赛璐璐网漫'
  | '日韩赛璐璐网漫'
  | '暗黑赛博霓虹'
  | '新中式古风玄幻'
  | '写实电影感漫剧'
  | '美式硬派漫画';

export type DramaAspectRatio = '9:16 竖屏短剧' | '16:9 横屏中剧';

export interface DramaTrackPreset {
  id: string;
  name: string;
  channel: DramaAudienceChannel;
  heatLabel: string;
  targetAudience: string;
  coreEmotion: string;
  golden3SecFormula: string;
  pacingStructure: string;
  paywallHookStrategy: string;
  visualStyleRecommend: DramaVisualStyle;
  avoidTaboos: string;
}

export const HOT_DRAMA_TRACKS: DramaTrackPreset[] = [
  {
    id: 'track-rules-apocalypse',
    name: '末世囤货 / 规则怪谈',
    channel: '全民脑洞',
    heatLabel: 'AI漫剧TOP1赛道',
    targetAudience: '18-35岁短视频重度用户，极度偏好强视觉奇观与生存压迫感',
    coreEmotion: '安全感爽点 + 认知颠覆 + 绝境智商碾压',
    golden3SecFormula: '前3秒直接出现红色倒计时警报/诡异规则纸条特写 + 极寒血月异象，主角当场做出反常举动（如疯狂变卖百亿家产囤积物资）。',
    pacingStructure: '每集90-120秒（8-12个分镜）：开场危机逼近 → 前世害死主角的反派上门道德绑架 → 主角开启顶级安全屋隔绝风雪打脸 → 集末门外出现S级未知怪物黑影。',
    paywallHookStrategy: '第10-12集卡点：安全屋外部防线遭遇前所未见的诡异规则入侵，前世未曾出现的神秘隐藏物资箱即将开启。',
    visualStyleRecommend: '暗黑赛博霓虹',
    avoidTaboos: '严禁超过3句的无画面纯聊天铺垫；严禁圣母心软分物资；视觉画面必须突出室内温暖火锅与室外极寒冰封的强烈冷暖对比。',
  },
  {
    id: 'track-awakening-fantasy',
    name: '全民转职 / 废柴SSS级觉醒',
    channel: '男频爆款',
    heatLabel: 'AI特效漫剧王牌',
    targetAudience: '16-32岁男频受众，热衷数值暴涨、神级特效与越级反杀',
    coreEmotion: '先抑后扬极致打脸 + 隐藏唯一神职震惊全场',
    golden3SecFormula: '觉醒法阵轰然碎裂或降下九彩异象，众人嘲笑主角觉醒“F级生活职业”，下一秒系统面板弹出【唯一禁忌神级词条】。',
    pacingStructure: '每集必须包含至少1次“世俗偏见轻视 → 技能特效炸裂碾压 → 高层大佬失态震惊”的情绪闭环。',
    paywallHookStrategy: '第10集卡点：新手秘境突变为死亡深渊副本，全校天骄绝望求救，主角缓缓拔出禁忌武器准备首次展露真正实力。',
    visualStyleRecommend: '国漫厚涂精绘',
    avoidTaboos: '禁止复杂晦涩的升级公式解说；用直观的巨型召唤物、法阵对比、头顶血条清零画面展现战力差。',
  },
  {
    id: 'track-revenge-rebirth',
    name: '重生复仇 / 断亲手撕渣男绿茶',
    channel: '女频爆款',
    heatLabel: '高完播高付费率',
    targetAudience: '20-40岁女性受众，追求干脆利落不憋屈、清醒搞事业与身份反转',
    coreEmotion: '极致解气 + 追妻/追妹火葬场绝不原谅 + 顶级大佬撑腰',
    golden3SecFormula: '前世惨死火海/手术台的窒息特写瞬间切回订婚宴/认亲宴现场，女主抬手一巴掌扇翻渣男或当众撕毁协议。',
    pacingStructure: '三句之内必起冲突，五镜之内必有反击；反派每次设局都在同一集或隔集被女主提前录音/亮底牌反杀。',
    paywallHookStrategy: '第11集卡点：渣男家族以为捏住女主命脉召开记者会公开羞辱，宴会大门推开，真正的顶级财阀掌权人亲自为女主撑伞入场。',
    visualStyleRecommend: '日韩赛璐璐网漫',
    avoidTaboos: '严禁女主犹豫心软、严禁误会拖延超过两集不解释、严禁苦情哭诉超过两句台词。',
  },
  {
    id: 'track-urban-god-tycoon',
    name: '都市神豪 / 隐龙归来护短',
    channel: '男频爆款',
    heatLabel: '下沉市场常青树',
    targetAudience: '22-45岁泛大众用户，追求极致情绪宣泄与身份揭晓爽感',
    coreEmotion: '扮猪吃虎 + 护佑家人红线 + 百亿排面碾压势利眼',
    golden3SecFormula: '至亲遭受势利反派欺凌的危急关头，主角一脚踹碎大门，一个电话引得全城豪车/直升机列队降临。',
    pacingStructure: '小反派挑衅 → 中层主管助纣为虐 → 大人物赶到向主角鞠躬致敬 → 势利眼彻底崩塌后悔。',
    paywallHookStrategy: '第12集卡点：顶级拍卖会/寿宴现场，各方大佬齐聚等着看主角笑话，主持人颤抖念出主角神秘尊号。',
    visualStyleRecommend: '写实电影感漫剧',
    avoidTaboos: '节奏必须极快，台词短促有力，禁止冗长商战专业术语。',
  },
  {
    id: 'track-ancient-scheme',
    name: '古风权谋 / 替嫁医妃逆袭',
    channel: '女频爆款',
    heatLabel: '国风漫剧高颜值赛道',
    targetAudience: '18-38岁古风爱好者，喜爱中式美学服化道与双强拉扯',
    coreEmotion: '智商博弈 + 惊艳亮相 + 宿敌变宿命拉扯',
    golden3SecFormula: '红盖头染血被长剑挑开，冷面王爷命人杖毙替嫁新娘，女主指尖银针寒光一闪救活太后/道破王爷剧毒。',
    pacingStructure: '每集围绕一个危机事件（验毒、夺嫁妆、宫宴设局），以视觉化的银针、古风机关或华服蜕变完成反转。',
    paywallHookStrategy: '第10集卡点：宫宴之上恶毒嫡姐要求女主当众摘下面纱验明丑颜，面纱滑落瞬间满座皆惊。',
    visualStyleRecommend: '新中式古风玄幻',
    avoidTaboos: '避免大段半文半白晦涩古文，台词须现代观众一听即懂且富有古韵锋芒。',
  },
  {
    id: 'track-cyber-infinite',
    name: '悬疑无限流 / 民俗诡异副本',
    channel: '悬疑惊悚',
    heatLabel: '高互动高追更率',
    targetAudience: '18-30岁年轻猎奇受众，热衷弹幕推理、中式微恐与高智商破局',
    coreEmotion: '肾上腺素飙升 + 细思极恐伏笔回收 + 邪神级骚操作通关',
    golden3SecFormula: '午夜末班公交车广播响起：“请勿回应穿红雨衣的乘客”，主角低头发现自己身上正穿着红雨衣。',
    pacingStructure: '诡异现象出现 → 炮灰违规触发恐怖惩罚 → 主角洞察规则漏洞反向利用NPC → 发现副本更深层真相。',
    paywallHookStrategy: '第9集卡点：众人以为成功逃出副本回到现实，主角却指着镜子里的倒影说：“不对，真正的第二阶段才刚开始。”',
    visualStyleRecommend: '新中式古风玄幻',
    avoidTaboos: '禁止纯文字解谜说教，所有线索必须体现在画面特写道具（如倒走的挂钟、多出来的一双绣花鞋）中。',
  },
  {
    id: 'track-idol-romance',
    name: '偶像甜宠 / 娱乐圈双强暧昧拉扯',
    channel: '女频爆款',
    heatLabel: '2.5D高颜值吸睛王牌',
    targetAudience: '16-35岁年轻女性与泛二次元受众，极度吃2.5D精致厚涂神仙颜值、舞台高光与极限暧昧张力',
    coreEmotion: '极致心动苏感 + 顶流身份反差掉马 + 舞台/镜头前克制与私下占有欲拉满',
    golden3SecFormula: '万人演唱会聚光灯骤然熄灭或后台休息室门锁咔哒落下，高冷顶流导师/死对头将女主抵在化妆镜前，指腹擦过她微红眼尾：“镜头关了，现在还要装不认识我？”',
    pacingStructure: '每集90秒高频心动节拍：公开场合身份悬殊/针锋相对 → 突发舞台危机或直播事故 → 极近距离救场护短/耳麦私语 → 集末狗仔快门闪光或隐藏契约曝光。',
    paywallHookStrategy: '第10集卡点：直播总决赛/红毯盛典现场，绿茶对家恶意放出黑料逼女主退圈，顶流男主直接切掉全场伴奏拿起麦公开唯一私密录音。',
    visualStyleRecommend: '2.5D精致厚涂精绘',
    avoidTaboos: '严禁男女主颜值崩坏或路人化穿搭；严禁超过两集的无聊商业通告流水账；每集必须有至少1个可截图当壁纸的2.5D高光眼神拉丝特写。',
  },
];

export type DramaCharacterTier = 'protagonist' | 'major_support' | 'recurring_antagonist';

export interface DramaCharacterAsset {
  id: string;
  name: string;
  roleTag: string; // 男主 / 女主 / 核心反派 / 重要配角
  tier?: DramaCharacterTier; // 角色层级：核心主角 / 重要配角 / 阶段或常驻反派
  firstAppearanceEp?: number; // 首次登场集数（随剧本推进自动识别归档新配角时记录）
  epistemicNote?: string; // 角色认知边界/当前知情范围备忘（防上帝视角穿帮）
  ageAndArchetype: string;
  appearanceZh: string; // 中文固定外貌服化道特征
  visualPromptEn: string; // MJ / 即梦 / 可灵 一致性英文生图 Tag
  voicePersona: string; // 配音音色与语速指导（如：低沉冷冽青年音，语速偏慢压迫感强）
  signatureTrait: string; // 标志性微动作或记忆点道具
}

export interface DramaSceneAnchor {
  id: string;
  sceneName: string; // 核心场景基础名（如：顶层安全屋客厅 / 星耀演播厅后台）
  stateVariant?: string; // 同一场景的不同状态/时段/气候变体（如：常规备战态·日·内 vs 零下70度断电结冰态·夜·内）
  sourceRef?: string; // 锚点来源标记（如：细纲提取 / 第3集剧本自动归档）
  lightingAndMood: string;
  visualPromptZh: string;
  visualPromptEn: string;
}

export type DramaForeshadowCategory =
  | '关键道具'
  | '身世/人物伏笔'
  | '核心剧情暗线'
  | '规则/契约死穴';

export type DramaForeshadowStatus = 'planted' | 'fermenting' | 'resolved';

export interface DramaForeshadowItem {
  id: string;
  name: string; // 伏笔或关键道具名称（如：破碎银色定制耳返 / 三年前匿名版权书）
  category: DramaForeshadowCategory;
  ownerOrRelation: string; // 关联角色或关系（如：苏晚 ↔ 陆执）
  plantedEpisode: number; // 首次埋设集数
  expectedPayoffEpisode?: string; // 预计发酵或回收的集数区间（如：第10集初揭 / 第28集引爆）
  resolvedEpisode?: number; // 实际完成回收的集数
  status: DramaForeshadowStatus; // planted=待回收, fermenting=发酵推进中, resolved=已回收
  visualAnchorNote?: string; // 关键道具的固定视觉外观描述（供分镜生图锁死道具长相）
  payoffNote?: string; // 回收方式设计或实际回收记录
}

/**
 * 多线叙事结构条目（主线 / 情感副线 / 人物成长线 / 悬疑暗线）
 */
export type DramaStoryArcType = '主线' | '情感副线' | '暗线/反派线' | '群像支线';

export interface DramaStoryArc {
  id: string;
  title: string; // 故事线名称（如：极寒安全屋生存反杀主线 / 沈寂×苏晚前世救赎暗线）
  arcType: DramaStoryArcType;
  spanEpisodes: string; // 覆盖集数区间（如：第1-60集 / 第6-28集）
  progressPct: number; // 当前推进完成度 0 ~ 100
  currentStage: string; // 当前阶段（如：危机铺垫 / 冲突激化 / 中盘反转 / 终局收束）
  coreConflictAndGoal: string; // 核心矛盾推进路径与终极闭环目标
}

/**
 * 剧情节奏点与张力梯度条目（驱动节奏热力图与卡点编排）
 */
export type DramaRhythmTier =
  | '蓄力铺垫'
  | '拉扯升级'
  | '爽点小高潮'
  | '付费大卡点'
  | '终局大爆发';

export interface DramaPlotRhythmPoint {
  id: string;
  anchorEpisode: number; // 锚定核心集数（如 1, 3, 10, 20, 40）
  episodeRange: string; // 集数标注（如：第1集 / 第9-10集）
  rhythmTier: DramaRhythmTier; // 蓄力铺垫 / 拉扯升级 / 爽点小高潮 / 付费大卡点 / 终局大爆发
  tensionScore: number; // 情绪与冲突烈度 1 ~ 100（用于渲染节奏热力图）
  beatGoal: string; // 该节奏点的爆发事件、爽点兑现或断章悬念要求
}

/**
 * 关键道具追踪表条目（Key Prop Manifest：实时追踪持有者、流转历史与生图外观）
 */
export type DramaKeyPropStatus =
  | '持有中'
  | '已移交'
  | '遗失/争夺中'
  | '已损毁'
  | '已引爆回收';

export interface DramaKeyPropItem {
  id: string;
  name: string; // 关键道具名（如：钛合金安全屋总控密钥 / 刻有S.W的碎裂耳返）
  currentHolder: string; // 当前持有角色或存放地点（如：沈寂随身携带 / 锁在反派书房暗格）
  debutEpisode: number; // 首次登场集数
  milestoneEpisodes?: string; // 关键流转或发挥作用集数（如：第1集绑定 → 第12集升级）
  visualSpec: string; // 固定视觉外观特征（供后期AI分镜锁死道具造型）
  narrativeFunction: string; // 核心剧情作用、信息媒介功能或触发限制
  status: DramaKeyPropStatus; // 持有中 / 已移交 / 遗失/争夺中 / 已损毁 / 已引爆回收
}

/**
 * 漫剧专属逻辑与叙事护栏 SKILL（解决跨场瞬移、动机缺失与主角开上帝视角穿帮）
 */
export interface DramaScreenplaySkill {
  id: string;
  name: string;
  badge: string;
  description: string;
  promptDirective: string;
  enabled: boolean;
  isBuiltin?: boolean;
}

/**
 * 单集剧本生成时的前置逻辑与角色认知边界自检记录
 */
export interface DramaEpisodeLogicAudit {
  spatialAndMotiveBridge: string; // 本集承接上集及场次切换的时空与行为动机因果链
  povKnowledgeBoundary: string; // 角色认知隔离核查（明确哪些幕后信息主角尚不知情，或通过何种物理证据获知）
  characterStateAndPropSnapshot?: string; // 本集结束时核心角色状态与持有道具快照（供后5集长文本记忆回溯）
}

export interface DramaNarrativeBible {
  worldSettingAndRules: string; // 世界观背景、核心金手指/赛制/契约底层铁律（防中后期吃书或战力崩坏）
  storylineOverview: string; // 核心故事线与高压时间轴脉络
  mainPlotline: string; // 贯穿全剧的核心主线矛盾、阶段目标与终极闭环
  subPlotlines: string; // 情感暗线、群像副线与反派对照组支线设计
  frameworkStructure: string; // 分幕商业框架结构（引流留存幕 → 首轮付费破局幕 → 升级博弈幕 → 终局高潮幕）
  pacingStrategy: string; // 单集内秒级节奏公式与跨集波浪卡点模型（如3集小高潮、10集大反转）
  characterArcsAndRelations: string; // 核心角色成长弧光与阶段性人物关系拉扯演变网
}

export interface DramaShot {
  id: string;
  shotNumber: number;
  durationSec: number; // e.g. 4s, 6s, 8s
  shotSizeAndCamera: string; // 特写 / 中景 / 远景 + 推镜 / 摇镜 / 震屏
  charactersInShot: string;
  visualDescription: string; // 完整中文AI漫剧生图/生视频提示词（已融合角色外貌锚点）
  imagePromptEn?: string; // 英文生图/生视频辅助提示词
  actionAndExpression: string; // 动作与神态表演细节
  dialogueSpeaker: string; // 说话人（或 旁白OS / 无台词）
  dialogueVoiceStyle: string; // 情绪语气（如：冷笑嘲讽 / 颤抖惊恐）
  dialogueText: string; // 台词正文
  sfxAndBgm: string; // 音效与配乐卡点
}

export type DramaScriptFormat =
  | 'triangle_standard'
  | 'manju_minimal'
  | 'overseas_bilingual';

export interface DramaScriptFormatSpec {
  id: DramaScriptFormat;
  name: string;
  badge: string;
  summary: string;
  whyClientsUseIt: string;
  sampleSnippet: string;
}

export const DRAMA_SCRIPT_FORMATS: DramaScriptFormatSpec[] = [
  {
    id: 'triangle_standard',
    name: '标准短剧 △ 三角场次本',
    badge: '最通用 · 甲方主流',
    summary: '采用「集-场 地点 -- 日/夜 -- 内/外景」场头，所有画面动作一律以 △ 开头，一句一动极简白描，零废话零运镜堆砌。',
    whyClientsUseIt: '源于影视短剧与红果/抖音投流短剧工业标准。一个 △ 天然对应后期制作的一镜画面，制片审稿极快，不绑死后期导演的分镜自由度。',
    sampleSnippet: `**1-1 顶层公寓客厅 -- 日 -- 内景**\n出场人物：沈寂、林薇薇\n\n△ 沈寂猛地从沙发惊醒，抬手看了一眼腕表。\n沈寂：（眼神骤冷，低声）十月十四号……距离全球血月冰封，还有七十二小时！\n△ “砰！”门外传来粗暴的砸门声。`,
  },
  {
    id: 'manju_minimal',
    name: '国漫/动态漫 极简音效场次本',
    badge: '男频玄幻/热血漫剧常用',
    summary: '场头紧跟「出场人物：xxx」（方便后期提前调取角色立绘/LoRA），不打三角号，单句极简动作直给，情绪直接写在冒号前，独立标注【音效】。',
    whyClientsUseIt: '常见于男频玄幻、修仙、末世动态漫甲方。重点标清本场有哪些角色资产与【音效】卡点，砍掉一切小说式心理描写，方便AI生图师与剪辑师流水线分工。',
    sampleSnippet: `第一集：血月倒计时\n\n1-1 顶层公寓门口 转 客厅 日 内\n出场人物：沈寂、林薇薇\n\n林薇薇抱胸站在门外，满脸嫌弃。\n林薇薇嘲讽：沈寂你疯了吧？把婚房焊成铁棺材！\n沈寂冷冷扫了她一眼，抬手按下墙上红色闭门键。\n【音效】：沉重液压钛合金门合拢巨响\n沈寂（冷笑）：从现在起，别再来敲我的门。`,
  },
  {
    id: 'overseas_bilingual',
    name: '出海短剧 △ 中英双语对照本',
    badge: 'ReelShort / DramaBox 出海规范',
    summary: '标准 **集-场 -- 日/夜 -- 内/外景.** 场头 + △ 中文极简动作提示 + 中文情绪台词下紧跟地道英文配音台词，自动剔除 Word 批注乱码。',
    whyClientsUseIt: '专为欧美/东南亚出海 AI 短剧与译制漫剧设计，国内后期看中文 △ 动作做画面，海外 TTS/配音员直接读英文台词，一稿双用。',
    sampleSnippet: `**1-1 投行贵宾室 -- 日 -- 内景.**\n\n△ 沈寂将一整箱不动产证重重推过黑曜石桌面。\n△ 银行经理推了推眼镜，满脸不敢置信。\n沈寂：（不容置疑）三个小时内，我要看到八十亿现金到账。\nWithin three hours, I want eight billion in cash wired to my account.`,
  },
];

export interface DramaEpisode {
  id: string;
  index: number;
  title: string;
  isPaywallHook?: boolean; // 是否为付费卡点集/强钩子集
  targetDurationSec: number; // 默认 90~120秒
  coreConflictSummary: string; // 本集核心爽点/冲突梗概
  continuitySummary?: string; // 长篇跨集记忆专用高密度状态账本（含剧情结果+关系进展+道具/伏笔变化）
  characterStateSnapshot?: string; // 本集结束时核心出场角色的位置、伤势/情绪状态与持有道具快照（供后5集回顾）
  logicAudit?: DramaEpisodeLogicAudit; // 本集时空因果过渡与反上帝视角知情权核查记录
  opening3SecHook: string; // 黄金前3秒画面与台词钩子
  endingCliffhanger: string; // 集末留存断章悬念钩子
  scriptFormat?: DramaScriptFormat; // 甲方标准文学剧本格式流派
  shots: DramaShot[]; // 下游后期执行层：AI漫剧生图与运镜拆解单
  rawScriptText: string; // 上游编剧交付层：极简标准文学剧本（△三角本 / 国漫音效本 / 双语本）
  nextEpisodeHooks?: string[]; // AI 给出的下集 3 个爆款推进方向
  meta?: string;
  updatedAt: number;
}

export interface DramaEpisodePlanItem {
  episodeIndex: number;
  title: string;
  beatSummary: string;
  hookType: '免费强留存' | '小高潮爽点' | '核心付费卡点' | '反转高潮';
  tensionScore?: number; // 单集预期张力值 1-100（用于节奏热力图联动）
  foreshadowingOrProps?: string; // 本集埋设或回收的伏笔、关键道具、核心线索备注
}

export interface DramaProject {
  id: string;
  title: string;
  createdAt: number;
  lastModifiedAt: number;
  trackId: string;
  trackName: string;
  channel: DramaAudienceChannel;
  visualStyle: DramaVisualStyle;
  aspectRatio: DramaAspectRatio;
  preferredScriptFormat?: DramaScriptFormat;
  episodeDurationSec?: number; // 单集目标成片时长（秒，如 60 / 90 / 120 / 180 / 240，与剧本目标字数强挂钩）
  totalPlannedEpisodes: number;
  totalEpisodesReason?: string; // AI 自动分析最佳总集数的商业与叙事测算依据
  paywallEpisodeIndex: number; // 通常第 10 或 12 集
  logline: string; // 一句话商业核心卖点
  targetAudience: string;
  golden3SecHook: string; // 开篇第一集前3秒生死钩子
  synopsis: string; // 全剧起承转合商业大纲
  narrativeBible?: DramaNarrativeBible; // 全剧叙事架构圣经（故事线/主线/支线/框架结构/剧情节奏/底层规则/人物弧光）
  storyArcs?: DramaStoryArc[]; // 结构化多线叙事表（核心主线 / 情感副线 / 人物成长线 / 悬疑暗线及进度）
  plotRhythm?: DramaPlotRhythmPoint[]; // 结构化节奏点与张力梯度表（驱动剧情节奏热力图）
  keyPropManifest?: DramaKeyPropItem[]; // 关键道具追踪表（持有者、流转节点、视觉锚点与当前状态）
  foreshadowingLedger?: DramaForeshadowItem[]; // 全局角色伏笔与暗线追踪回收台账
  dramaSkills?: DramaScreenplaySkill[]; // 漫剧剧本逻辑护栏 SKILL 列表（反上帝视角、时空因果桥接等）
  customProvenanceNote?: string; // 创作者在「逻辑溯源」窗口维护的跨集认知边界与关键上下文锁定备注
  characterAssets: DramaCharacterAsset[];
  sceneAnchors: DramaSceneAnchor[];
  episodePlan: DramaEpisodePlanItem[];
  continuityAuditLog?: string; // 最近一次续写分集细纲时的前序伏笔、关键道具与剧情衔接审阅摘要
  episodes: DramaEpisode[];
  sourceNovelId?: string; // 若由小说改编，记录关联小说ID（但绝不注入XP宪法）
}

export interface DramaCandidatePlan {
  id: string;
  createdAt: number;
  sourceType: 'fuzzy-consultant' | 'track-radar';
  userPromptOrSpark: string;
  marketTrendAnalysis?: string;
  consultantReply?: string;
  selectedSiblingTitle?: string;
  directionTag: string;
  title: string;
  trackId: string;
  trackName: string;
  channel: DramaAudienceChannel;
  visualStyle: DramaVisualStyle;
  aspectRatio: DramaAspectRatio;
  episodeDurationSec?: number;
  totalPlannedEpisodes?: number;
  totalEpisodesReason?: string;
  paywallEpisodeIndex: number;
  marketFitReason?: string;
  logline: string;
  targetAudience: string;
  golden3SecHook: string;
  synopsis: string;
  narrativeBible?: DramaNarrativeBible;
  storyArcs?: DramaStoryArc[];
  plotRhythm?: DramaPlotRhythmPoint[];
  keyPropManifest?: DramaKeyPropItem[];
  foreshadowingLedger?: DramaForeshadowItem[];
  seedCharacters: DramaCharacterAsset[];
  adoptedProjectId?: string;
  adoptedAt?: number;
}



