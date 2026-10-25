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
} from '../types';
import { generateUUID } from '../utils/uuid';

export interface DramaPitchProposal {
  title: string;
  logline: string;
  targetAudience: string;
  golden3SecHook: string;
  paywallEpisodeIndex: number;
  synopsis: string;
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
4. 台词短促抓耳：单句台词严格控制在 30 字以内，口语化、情绪直接、适合 AI 配音（TTS）卡点输出。
5. 集末断章强钩子：每集最后一行必须停在“危机骤降 / 底牌揭晓前一秒 / 惊天反转定格”的最高悬念处。`;

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
        paywallEpisodeIndex: Number(item.paywallEpisodeIndex) || 10,
        synopsis: String(item.synopsis || ''),
      }));
    }
  } catch (e) {
    console.warn('Failed to parse pitch JSON:', e);
  }
  return [];
}

export function buildDramaAssetExtractionMessages(
  project: DramaProject
): Array<{ role: 'system' | 'user'; content: string }> {
  const track = getTrackByProject(project);
  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你是一位专业的 AI 漫剧视觉总监与分集统筹编剧。你的任务是根据剧目大纲，提取高度一致的【角色立绘固定资产】、【核心场景视觉锚点】与【前 12 集商业分集卡点目录】。`;

  const user = `请为以下 AI 漫剧项目生成全套工业化视觉资产与前 12 集节拍规划（包含第 ${project.paywallEpisodeIndex} 集核心付费卡点）：

【剧名】：《${project.title}》
【所属赛道】：${track.name}（${project.channel}）
【视觉画风】：${project.visualStyle} | 【画幅】：${project.aspectRatio}
【核心卖点】：${project.logline}
【黄金前3秒钩子】：${project.golden3SecHook}
【全剧大纲】：
${project.synopsis}

请严格按以下 JSON 对象格式输出（使用 \`\`\`json 包裹）：
\`\`\`json
{
  "characterAssets": [
    {
      "name": "角色姓名",
      "roleTag": "核心男主 / 核心女主 / 头号反派 / 关键配角",
      "ageAndArchetype": "年龄与人设标签（如：25岁 · 重生杀伐果断狠人）",
      "appearanceZh": "中文固定立绘特征（发型发色、五官气质、标志性常驻穿搭、代表配饰，供后期拆解分镜时自动锁定外观）",
      "visualPromptEn": "English AI image generation consistency prompt tags (hair, eyes, outfit, style: ${project.visualStyle}, ${project.aspectRatio})",
      "voicePersona": "配音音色、语速与情绪基调建议",
      "signatureTrait": "标志性镜头微动作或随身视觉道具"
    }
  ],
  "sceneAnchors": [
    {
      "sceneName": "高频核心场景名",
      "lightingAndMood": "光影冷暖色调与情绪氛围",
      "visualPromptZh": "中文场景固定布景描述",
      "visualPromptEn": "English environment prompt tags"
    }
  ],
  "episodePlan": [
    {
      "episodeIndex": 1,
      "title": "单集短标题（不含第X集前缀）",
      "beatSummary": "本集核心冲突事件、爽点打脸闭环与集末悬念（40-70字）",
      "hookType": "免费强留存"
    }
  ]
}
\`\`\`
要求：
1. \`characterAssets\` 提取 3~5 位核心出场角色；
2. \`sceneAnchors\` 提取 2~3 个高频标志性主场景；
3. \`episodePlan\` 完整规划第 1 集至第 ${Math.max(10, Math.min(15, project.paywallEpisodeIndex + 2))} 集，其中第 ${project.paywallEpisodeIndex} 集的 \`hookType\` 必须标记为 \`"核心付费卡点"\`，其余集根据节奏标记为 \`"免费强留存"\`、\`"小高潮爽点"\` 或 \`"反转高潮"\`。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseDramaAssetsJson(raw: string): {
  characterAssets: DramaCharacterAsset[];
  sceneAnchors: DramaSceneAnchor[];
  episodePlan: DramaEpisodePlanItem[];
} {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);

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

  const sceneAnchors: DramaSceneAnchor[] = Array.isArray(parsed.sceneAnchors)
    ? parsed.sceneAnchors.map((s: any) => ({
        id: generateUUID(),
        sceneName: String(s.sceneName || '核心场景'),
        lightingAndMood: String(s.lightingAndMood || ''),
        visualPromptZh: String(s.visualPromptZh || ''),
        visualPromptEn: String(s.visualPromptEn || ''),
      }))
    : [];

  const validHookTypes = ['免费强留存', '小高潮爽点', '核心付费卡点', '反转高潮'] as const;
  const episodePlan: DramaEpisodePlanItem[] = Array.isArray(parsed.episodePlan)
    ? parsed.episodePlan.map((ep: any, idx: number) => ({
        episodeIndex: Number(ep.episodeIndex) || idx + 1,
        title: String(ep.title || `第${idx + 1}集`),
        beatSummary: String(ep.beatSummary || ''),
        hookType: validHookTypes.includes(ep.hookType) ? ep.hookType : '免费强留存',
      }))
    : [];

  return { characterAssets, sceneAnchors, episodePlan };
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
  const isPaywallEp = episodeIndex === project.paywallEpisodeIndex;
  const plannedBeat = project.episodePlan.find((p) => p.episodeIndex === episodeIndex);
  const prevEp = project.episodes
    .filter((e) => e.index < episodeIndex)
    .sort((a, b) => b.index - a.index)[0];

  const castSummary =
    project.characterAssets.length > 0
      ? project.characterAssets
          .map((c) => `- ${c.name}（${c.roleTag}，${c.ageAndArchetype}，说话风格：${c.voicePersona}）`)
          .join('\n')
      : '（根据大纲设定主要角色名与鲜明口吻）';

  const formatRule = buildFormatRulePrompt(scriptFormat, episodeIndex);

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

你现在是资深商业短剧/AI漫剧专职编剧（负责交付给甲方的标准单集文学剧本）。
你深知甲方审稿与后期漫剧制作团队最痛恨“写成啰嗦小说”或“在文学本里塞满生硬运镜参数”。你写的剧本永远节奏极快、场次清晰、一句一动、台词句句带钩子！

【当前项目信息】
- 剧名：《${project.title}》
- 赛道：${track.name}（${project.channel}）
- 赛道节奏要求：${track.pacingStructure}
- 赛道禁忌：${track.avoidTaboos}
- 角色关系与口吻表（仅供把握人物性格，严禁在剧本动作行里大段抄写外貌设定！）：
${castSummary}

${formatRule}`;

  const prevContext = prevEp
    ? `\n【上一集（第${prevEp.index}集）衔接】\n- 上集核心冲突：${prevEp.coreConflictSummary}\n- 上集末尾悬念钩子：${prevEp.endingCliffhanger}\n（本集第 ${episodeIndex}-1 场第一行必须直接承接引爆上集末尾悬念！）`
    : `\n【首集黄金前3秒生死线】\n本集为开篇第 1 集！第 1-1 场前两行动作与台词必须直接兑现黄金前3秒钩子：${project.golden3SecHook}`;

  const paywallNotice = isPaywallEp
    ? `\n🔥【重点：第 ${episodeIndex} 集为全剧核心付费卡点集】🔥\n前半集给出一次干脆利落的反击爽点，最后一场最后一秒必须抛出最炸裂的危机降临或底牌反转戛然而止！`
    : '';

  const adaptationNotice = sourceNovelChapter
    ? `\n【待改编小说章节源文本】（《${sourceNovelChapter.novelTitle}》- ${sourceNovelChapter.chapterTitle}）：
"""
${sourceNovelChapter.chapterText.slice(0, 5500)}
"""
改编铁律：彻底砍掉原小说的心理描写、修辞渲染和慢节奏铺垫，提炼为 1~3 个紧凑场次的漫剧标准剧本！`
    : '';

  const user = `请创作《${project.title}》第 ${episodeIndex} 集【甲方标准文学剧本】（单集时长约 90~120 秒，包含 1~3 个紧凑场次，约 12~22 条精炼动作与台词交互）。
${prevContext}
${plannedBeat ? `\n【本集分集大纲预定节拍】：${plannedBeat.title} —— ${plannedBeat.beatSummary}` : ''}
${paywallNotice}
${directorInstruction.trim() ? `\n【本集具体剧情指令】：${directorInstruction.trim()}` : ''}
${adaptationNotice}

请严格按以下 JSON 结构输出（用 \`\`\`json 包裹），其中 \`scriptText\` 必须是严格遵守上述排版规范的纯净剧本正文：
\`\`\`json
{
  "title": "第${episodeIndex}集：简短抓人的集标题",
  "targetDurationSec": 95,
  "coreConflictSummary": "一句话概括本集冲突与爽点结果（30-50字）",
  "opening3SecHook": "一句话概括开场前3秒动作/冲突钩子",
  "endingCliffhanger": "一句话概括集末最后一秒留存悬念",
  "scriptText": "此处填入严格按所选行业格式排版的完整单集剧本纯文本（使用 \\n 换行，只含场头、出场人物、△极简动作/【音效】与精炼台词，严禁夹杂生图Tag或运镜解析）",
  "nextEpisodeHooks": [
    "【下集推进1：爽点爆发】具体剧情...",
    "【下集推进2：危机加码】具体剧情...",
    "【下集推进3：反转揭秘】具体剧情..."
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
  existingShots: DramaShot[] = []
): DramaEpisode {
  const cleaned = extractJsonString(raw);
  const parsed = JSON.parse(cleaned);
  const cleanScript = cleanMessyClientScriptLocal(String(parsed.scriptText || ''));

  return {
    id: generateUUID(),
    index: episodeIndex,
    title: String(parsed.title || `第${episodeIndex}集`),
    isPaywallHook,
    targetDurationSec: Number(parsed.targetDurationSec) || 95,
    coreConflictSummary: String(parsed.coreConflictSummary || ''),
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
          .map((s) => `- 【${s.sceneName}】（${s.lightingAndMood}）：${s.visualPromptZh}`)
          .join('\n')
      : '（根据场头日/夜/内外景自动匹配戏剧化冷暖光影）';

  const system = `你是拥有百部爆款经验的 AI 漫剧后期执行总导演（精通即梦 Jimeng、可灵 Kling、Vidu 与 Midjourney 分镜制作）。
你的任务是将上游编剧交付的【极简标准文学剧本（△ 动作台词本）】精准拆解为下游生图师与剪辑师直接使用的【视听分镜执行单】（目标约 ${targetShotCount} 个分镜）。

【拆解铁律】：
1. 剧本里的每一个关键 △ 动作、反应特写或强冲突对白，都应拆解为清晰的独立镜头（景别 + 运镜，如：极特写、过肩正反打、仰拍慢推、震屏定格）。
2. 角色立绘锁死：每镜的 \`visualDescription\`（中文生图词）和 \`imagePromptEn\`（英文Tag）必须包含画风「${project.visualStyle}」、画幅「${project.aspectRatio}」，并且只要该角色入镜，必须自然织入下方【角色立绘资产库】里的发型服饰关键词，彻底杜绝换脸穿帮！
3. 严禁篡改原文学剧本的核心剧情与台词原意。

【角色立绘一致性资产库】：
${charBlock}

【核心场景视觉锚点】：
${sceneBlock}`;

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
              `- 【${c.name}】（${c.roleTag} | ${c.ageAndArchetype}）\n  固定外貌词(中文)：${c.appearanceZh}\n  AI生图固定Tag(EN)：${c.visualPromptEn}\n  配音指导：${c.voicePersona}`
          )
          .join('\n')
      : '（暂未锁定角色资产，请在分镜生图词中自行保持主角外观前后统一）';

  const sceneBlock =
    project.sceneAnchors.length > 0
      ? project.sceneAnchors
          .map((s) => `- 【${s.sceneName}】（${s.lightingAndMood}）：${s.visualPromptZh}`)
          .join('\n')
      : '（根据剧情自动匹配高反差光影场景）';

  const system = `${COMMERCIAL_DRAMA_CONSTITUTION}

【当前漫剧项目工业规格】
- 剧名：《${project.title}》
- 赛道规范：${track.name}（${project.channel}）
- 赛道节奏铁律：${track.pacingStructure}
- 赛道禁忌红线：${track.avoidTaboos}
- 全局统一画风：${project.visualStyle} | 画幅比例：${project.aspectRatio}

${formatRule}

【角色立绘一致性资产库（仅供下游 shots 生图词使用，严禁塞进上游 scriptText 文学剧本动作行！）】
${charBlock}

【核心场景视觉锚点】
${sceneBlock}`;

  const prevContext = prevEp
    ? `\n【上一集（第${prevEp.index}集）衔接记忆】\n- 上集核心剧情：${prevEp.coreConflictSummary}\n- 上集末尾留存悬念：${prevEp.endingCliffhanger}\n（本集开场必须直接承接引爆上集末尾悬念！）`
    : `\n【开篇首集生死线】\n本集是全剧开篇第 1 集！开场必须严格兑现黄金前3秒钩子：${project.golden3SecHook}`;

  const paywallNotice = isPaywallEp
    ? `\n🔥【重点警告：本集为第 ${episodeIndex} 集核心付费卡点集！】🔥\n必须在前半段给出一次极度解气的情绪小高潮，并在最后抛出全剧最炸裂的反转或危机戛然而止！`
    : '';

  const adaptationNotice = sourceNovelChapter
    ? `\n【小说章节跨界改编源素材】（来自小说《${sourceNovelChapter.novelTitle}》- ${sourceNovelChapter.chapterTitle}）：
"""
${sourceNovelChapter.chapterText.slice(0, 5500)}
"""
改编要求：剔除原小说冗长心理描写，先提炼为极简标准文学剧本 \`scriptText\`，再同步拆解为 ${targetShotCount} 个漫剧视听分镜 \`shots\`！`
    : '';

  const user = `请创作《${project.title}》第 ${episodeIndex} 集的【甲方标准文学剧本 (scriptText)】并同步拆解【后期 AI 分镜执行单 (shots，约 ${targetShotCount} 镜)】。
${prevContext}
${plannedBeat ? `\n【分集大纲预定节拍】：${plannedBeat.title} —— ${plannedBeat.beatSummary}（定位：${plannedBeat.hookType}）` : ''}
${paywallNotice}
${directorInstruction.trim() ? `\n【本集导演具体执导指令】：${directorInstruction.trim()}` : ''}
${adaptationNotice}

请严格输出以下 JSON 结构（用 \`\`\`json 包裹）：
\`\`\`json
{
  "title": "第${episodeIndex}集：极具冲击力的单集标题",
  "targetDurationSec": 95,
  "coreConflictSummary": "一句话概括本集核心爽点闭环与推进成果",
  "opening3SecHook": "本集前3秒抓人眼球的核心视觉动作/冲突钩子",
  "endingCliffhanger": "本集最后一秒留存断章悬念钩子",
  "scriptText": "严格遵循所选甲方剧本格式的纯净文学剧本（含场头、出场人物、△极简动作/【音效】、角色精炼台词，绝不啰嗦！）",
  "shots": [
    {
      "shotNumber": 1,
      "durationSec": 4,
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
    "【下集方向3：隐藏底牌/新人物登场】具体剧情走向..."
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
  const charMd = project.characterAssets
    .map(
      (c) =>
        `### ${c.name}（${c.roleTag}）\n- **人设定位**：${c.ageAndArchetype}\n- **中文固定立绘词**：${c.appearanceZh}\n- **英文一致性 Tag**：\`${c.visualPromptEn}\`\n- **配音音色指导**：${c.voicePersona}\n- **记忆点微动作**：${c.signatureTrait}`
    )
    .join('\n\n');

  const epMd = [...project.episodes]
    .sort((a, b) => a.index - b.index)
    .map((ep) => `## ${ep.title}\n\n${ep.rawScriptText}`)
    .join('\n\n---\n\n');

  return `# 《${project.title}》AI 漫剧工业化制作圣经\n\n- **热门赛道**：${project.trackName}（${project.channel}）\n- **视觉规格**：${project.visualStyle} · ${project.aspectRatio}\n- **规划集数**：${project.totalPlannedEpisodes} 集（核心付费卡点：第 ${project.paywallEpisodeIndex} 集）\n- **核心卖点 (Logline)**：${project.logline}\n- **开篇黄金前3秒**：${project.golden3SecHook}\n\n## 一、全剧商业大纲\n\n${project.synopsis}\n\n## 二、角色视觉一致性立绘档案\n\n${charMd || '暂未建档'}\n\n## 三、分集甲方标准剧本\n\n${epMd || '暂无已生成分集'}`;
}
