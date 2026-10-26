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

export const DEFAULT_PRESET_SKILLS: NovelSkill[] = [
  {
    id: 'skill-anti-repetition',
    name: '剧情推进与反车轱辘话',
    description: '破除每章重复心理独白与辞藻循环，强制每章必须有明确场景转换或实质事件推进。',
    promptInstruction:
      '【剧情推进与反车轱辘话铁律】\n1. 每章必须有明确的场景目标与外在情节演进（如空间转移、突发外部事件、人物交锋、解开或埋下新伏笔），严禁让角色在同一封闭空间内原地重复上章的情感拉扯。\n2. 前文已交代过的体型差概括、身世背景或阴鸷眼神套话，本章严禁大段复读，须化入当下具体动作交互中一笔带过。',
    category: 'rule',
    scopes: ['outline', 'chapter', 'reroll'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-no-ai-style',
    name: '去 AI 翻译腔与套话',
    description: '禁止“然而”、“不得不承认”、“仿佛在诉说着”、“无形中”、“眼神中闪过一丝”等机械套话。',
    promptInstruction:
      '【去 AI 味语言规范】严禁使用 AI 高频套话与翻译腔（如：然而、不得不承认、仿佛在诉说着、无形中、眼神中闪过一丝、不可否认、某种意义上、空气仿佛凝固了等）。请采用地道、干练、富有呼吸感的中文网文与文学叙事。',
    category: 'style',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-no-negative-progressive',
    name: '禁用生硬否定递进句',
    description: '限制连续使用“不仅没有...反而...”、“非但没有...甚至...”等机械转折句式。',
    promptInstruction:
      '【句式节奏约束】严格限制“不仅没有…反而…”、“非但没有…甚至…”、“看似…实则…”等公式化转折对比句，单章最多出现1次。多使用短句动作、留白与自然顺承句。',
    category: 'rule',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'normal',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-sensory-imagery',
    name: '电影镜头与五感细节',
    description: '用光影、声响、温度、触感与微物理动作替代干瘪的抽象形容词。',
    promptInstruction:
      '【电影镜头与五感叙事】拒绝直接给出“他很愤怒/他很心疼”等抽象结论。必须通过指节泛白的力度、呼吸擦过耳廓的热度、衣物摩挲声、光影明暗切分与细微肢体停顿来折射人物内心。',
    category: 'style',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'normal',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-natural-dialogue',
    name: '潜台词与自然口语台词',
    description: '杜绝舞台朗诵腔与说教式长台词，让人物说话带停顿、克制与言外之意。',
    promptInstruction:
      '【台词与潜台词规范】人物对话必须贴合身份性格，短促自然，允许欲言又止、答非所问或动作打断台词。严禁出现长篇宣讲式心理剖析台词与悬浮剧场腔。',
    category: 'style',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'normal',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-outline-tension',
    name: '大纲起承转合与钩子设计',
    description: '在构思大纲与重掷后续走向时，强制设计外部阻力、情感信息差与章末悬念。',
    promptInstruction:
      '【大纲与剧情设计准则】规划大纲与后续剧情走向时，必须兼顾“外部事件冲突”与“内部情感信息差拉扯”，避免平铺直叙的流水账；每个阶段转折需具备明确的导火索事件与情绪爆点。',
    category: 'structure',
    scopes: ['outline', 'reroll'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'skill-intimacy-tension',
    name: '亲密拉扯与微动作慢放',
    description: '【关键词智能触发】当剧情出现拥抱、亲吻、发烧、失控、同床等词时自动激活张力慢放。',
    promptInstruction:
      '【亲密张力慢放法则】当前剧情涉及近距离肢体接触或情绪失控场面：请放慢叙事倍率，重点捕捉身高体型包裹感、体温反差、克制与失控边缘的呼吸急促感，做到张力拉满而不流于机械套路。',
    category: 'preference',
    scopes: ['chapter', 'polish'],
    triggerMode: 'keyword',
    keywords: ['亲吻', '吻', '拥抱', '抱住', '怀里', '发烧', '生病', '喂药', '失控', '眼眶', '床', '贴近', '气息', '浴室'],
    priority: 'high',
    enabled: true,
    isPreset: true,
  },
];

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
  inspirationApiCfgId: string | null;
  inspirationApiModel: string | null;
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

export interface DramaCharacterAsset {
  id: string;
  name: string;
  roleTag: string; // 男主 / 女主 / 核心反派 / 关键配角
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
  status: DramaForeshadowStatus; // planted=待回收, fermenting=发酵推进中, resolved=已回收
  visualAnchorNote?: string; // 关键道具的固定视觉外观描述（供分镜生图锁死道具长相）
  payoffNote?: string; // 回收方式设计或实际回收记录
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
  foreshadowingLedger?: DramaForeshadowItem[]; // 全局角色伏笔与关键道具追踪回收台账
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
  foreshadowingLedger?: DramaForeshadowItem[];
  seedCharacters: DramaCharacterAsset[];
  adoptedProjectId?: string;
  adoptedAt?: number;
}


