import {
  DistilledStyleProfile,
  NovelSkill,
  StyleQuantitativeMetrics,
} from '../types';
import { Message } from './apiClient';
import { generateUUID } from '../utils/uuid';

function splitProseSentences(text: string): string[] {
  const cleaned = (text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/(?<=[。！？!?…]+['"”’）)]*|\n+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(s));
}

/**
 * Computes deterministic quantitative linguistic fingerprints from a raw sample corpus.
 */
export function computeStyleQuantitativeMetrics(rawCorpus: string): StyleQuantitativeMetrics {
  const text = (rawCorpus || '').trim();
  if (!text) {
    return {
      charCount: 0,
      sentenceCount: 0,
      avgSentenceLen: 0,
      sentenceLenStdDev: 0,
      shortRatio: 0,
      mediumRatio: 0,
      longRatio: 0,
      avgParagraphSentences: 0,
      singleSentenceParaRatio: 0,
      dialogueRatio: 0,
      emDashPer1k: 0,
      exclamationPer1k: 0,
    };
  }

  const charCount = Math.max(1, text.replace(/\s+/g, '').length);
  const kFactor = Math.max(0.25, charCount / 1000);

  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sentences = splitProseSentences(text);
  const lengths = sentences.map((s) => s.replace(/\s+/g, '').length);
  const sentenceCount = lengths.length;

  const avgSentenceLen =
    sentenceCount > 0
      ? Number((lengths.reduce((a, b) => a + b, 0) / sentenceCount).toFixed(1))
      : 0;

  const variance =
    sentenceCount > 1
      ? lengths.reduce((sum, l) => sum + Math.pow(l - avgSentenceLen, 2), 0) / sentenceCount
      : 0;
  const sentenceLenStdDev = Number(Math.sqrt(variance).toFixed(1));

  const shortCount = lengths.filter((l) => l < 12).length;
  const mediumCount = lengths.filter((l) => l >= 12 && l <= 28).length;
  const longCount = lengths.filter((l) => l > 28).length;

  const shortRatio = sentenceCount > 0 ? Math.round((shortCount / sentenceCount) * 100) : 0;
  const mediumRatio = sentenceCount > 0 ? Math.round((mediumCount / sentenceCount) * 100) : 0;
  const longRatio =
    sentenceCount > 0 ? Math.max(0, 100 - shortRatio - mediumRatio) : 0;

  let singleParas = 0;
  let totalParaSentences = 0;
  for (const p of paragraphs) {
    const pSents = splitProseSentences(p);
    totalParaSentences += pSents.length;
    if (pSents.length === 1) singleParas += 1;
  }

  const avgParagraphSentences =
    paragraphs.length > 0 ? Number((totalParaSentences / paragraphs.length).toFixed(1)) : 0;
  const singleSentenceParaRatio =
    paragraphs.length > 0 ? Math.round((singleParas / paragraphs.length) * 100) : 0;

  const dialogueMatches: string[] = text.match(/“[^”]*”|"[^"]*"|「[^」]*」/g) || [];
  const dialogueChars = dialogueMatches.reduce((acc, m) => acc + m.length, 0);
  const dialogueRatio = Math.min(100, Math.round((dialogueChars / charCount) * 100));

  const emDashCount = (text.match(/——/g) || []).length;
  const exclamCount = (text.match(/[！!]/g) || []).length;

  return {
    charCount,
    sentenceCount,
    avgSentenceLen,
    sentenceLenStdDev,
    shortRatio,
    mediumRatio,
    longRatio,
    avgParagraphSentences,
    singleSentenceParaRatio,
    dialogueRatio,
    emDashPer1k: Number((emDashCount / kFactor).toFixed(1)),
    exclamationPer1k: Number((exclamCount / kFactor).toFixed(1)),
  };
}

/**
 * Builds the LLM Style Distillation prompt that strips plot/character contamination
 * and extracts pure transferable literary DNA.
 */
export function buildStyleDistillationMessages(params: {
  rawCorpus: string;
  customProfileName?: string;
  sourceAuthor?: string;
  metrics: StyleQuantitativeMetrics;
}): Message[] {
  const { rawCorpus, customProfileName, sourceAuthor, metrics } = params;

  return [
    {
      role: 'system',
      content: `你是计算语言学与中文文学【文风蒸馏师 (Style Distiller)】。
传统的“粘贴原文模仿”极易导致大模型生硬照抄样本中的人名、地名、招式或剧情碎片。你的核心职责是对用户投喂的样本语料进行【去剧情化·深度文风蒸馏】——彻底剥离具体故事内容与专有名词，只提炼纯粹可迁移的“句法呼吸律、镜头机位、五感颗粒度、对白潜台词与用词指纹”。

请结合下方已测算的【硬核句法统计指纹】，输出严格合法的纯 JSON 对象（严禁包含任何专有人名地名）：
{
  "name": "凝练传神的文风DNA名称（如：冷峻短句留白流 / 江南式潮湿少年意气）",
  "narrativeVoice": "叙事机位距离、主观/客观滤镜、冷暖克制度剖析（60~100字）",
  "sentenceCadence": "长短句咬合规律、断句顿挫感、独句成段时机与标点呼吸特征（60~110字）",
  "sensorySignature": "五感切入顺序（视觉/听觉/触觉冷暖/气味）、器物细节投射习惯（60~100字）",
  "dialogueCraft": "台词长短、口语松弛度、潜台词留白方式、动作打断台词的习惯（60~100字）",
  "lexicalFeatures": "动词颗粒度、形容词密度、偏爱的词性质感与虚词取舍特征（60~100字）",
  "antiSlopTaboos": "与该文风严重冲突、必须绝对封杀的AI腔与违和表达（50~90字）",
  "anonymizedAnchors": [
    "去名化句法节拍锚点1（用『某甲』『某乙』重构出的纯韵律示范句，绝对不含原样本专有名词，40~75字）",
    "去名化句法节拍锚点2（展现对白与微动作穿插节奏的纯韵律示范句，40~75字）"
  ],
  "executableDirective": "一段220~320字、可直接注入写作引擎 System Prompt 的高权重硬核执行契约（分1/2/3/4条，结合句长标准差 σ=${metrics.sentenceLenStdDev}、短句比 ${metrics.shortRatio}%、独句段 ${metrics.singleSentenceParaRatio}% 等量化指标给出明确可执行的写作纪律）"
}`,
    },
    {
      role: 'user',
      content: `${customProfileName ? `期望资产命名方向：${customProfileName}\n` : ''}${
        sourceAuthor ? `来源作家/作品参考备注（仅用于理解流派，严禁写入指令导致抄袭）：${sourceAuthor}\n` : ''
      }【本地实测统计指纹】：
- 样本总字数：${metrics.charCount} 字（共 ${metrics.sentenceCount} 句）
- 平均句长：${metrics.avgSentenceLen} 字 | 句长离散度 Burstiness σ = ${metrics.sentenceLenStdDev}
- 短句(<12字)/中句(12-28字)/长句(>28字) 比例：${metrics.shortRatio}% : ${metrics.mediumRatio}% : ${metrics.longRatio}%
- 段均句数：${metrics.avgParagraphSentences} 句 | 独句自然段占比：${metrics.singleSentenceParaRatio}%
- 对白占比：${metrics.dialogueRatio}% | 破折号每千字：${metrics.emDashPer1k} | 感叹号每千字：${metrics.exclamationPer1k}

【待蒸馏原始语料样本】：
${rawCorpus.slice(0, 7500)}`,
    },
  ];
}

export function parseDistilledStyleResponse(params: {
  rawResponse: string;
  rawCorpus: string;
  metrics: StyleQuantitativeMetrics;
  fallbackName?: string;
  sourceAuthor?: string;
}): DistilledStyleProfile {
  const { rawResponse, rawCorpus, metrics, fallbackName, sourceAuthor } = params;
  const cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('蒸馏结果未返回有效 JSON 结构，请重试');
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  return {
    id: generateUUID(),
    name: String(parsed.name || fallbackName || '自定义蒸馏文风 DNA').trim(),
    sourceAuthor: sourceAuthor?.trim() || undefined,
    createdAt: Date.now(),
    sampleExcerpt: rawCorpus.trim().slice(0, 260),
    metrics,
    narrativeVoice: String(parsed.narrativeVoice || '').trim(),
    sentenceCadence: String(parsed.sentenceCadence || '').trim(),
    sensorySignature: String(parsed.sensorySignature || '').trim(),
    dialogueCraft: String(parsed.dialogueCraft || '').trim(),
    lexicalFeatures: String(parsed.lexicalFeatures || '').trim(),
    antiSlopTaboos: String(parsed.antiSlopTaboos || '').trim(),
    anonymizedAnchors: Array.isArray(parsed.anonymizedAnchors)
      ? parsed.anonymizedAnchors.map((x: any) => String(x).trim()).filter(Boolean)
      : [],
    executableDirective: String(parsed.executableDirective || '').trim(),
  };
}

/**
 * Formats a mounted DistilledStyleProfile into a crisp, zero-contamination System Prompt contract.
 */
export function formatDistilledStylePromptBlock(profile: DistilledStyleProfile): string {
  const m = profile.metrics;
  const anchorsText =
    profile.anonymizedAnchors && profile.anonymizedAnchors.length > 0
      ? `\n- 【去名化句法节拍锚点（仅对齐呼吸顿挫，严禁照搬字面）】\n  ${profile.anonymizedAnchors
          .map((a, idx) => `(${idx + 1}) ${a}`)
          .join('\n  ')}`
      : '';

  return `\n\n# 已挂载【文风蒸馏 DNA】高权重笔法契约：《${profile.name}》
- [目标量化句法指纹]：平均句长 ≈ ${m.avgSentenceLen}字 | 句长标准差 Burstiness σ ≈ ${Math.max(12.8, m.sentenceLenStdDev)} | 短/中/长句比 ≈ ${m.shortRatio}%:${m.mediumRatio}%:${m.longRatio}% | 独句成段率 ≈ ${m.singleSentenceParaRatio}% | 对白占比 ≈ ${m.dialogueRatio}%
- [叙事机位与腔调]：${profile.narrativeVoice}
- [句法呼吸与分段]：${profile.sentenceCadence}
- [五感与器物投射]：${profile.sensorySignature}
- [对白与潜台词]：${profile.dialogueCraft}
- [词汇与动词颗粒度]：${profile.lexicalFeatures}
- [文风排斥禁区]：${profile.antiSlopTaboos}${anchorsText}
- [核心执行指令]：
${profile.executableDirective}`;
}

/**
 * Converts a DistilledStyleProfile into a standard portable NovelSkill so users can also mount or export it in SKILL 2.0 Hub.
 */
export function convertDistilledStyleToSkill(profile: DistilledStyleProfile): NovelSkill {
  const m = profile.metrics;
  return {
    id: `skill-distilled-${profile.id.slice(0, 8)}`,
    slug: `distilled-style-${profile.id.slice(0, 6)}`,
    name: `蒸馏文风 · ${profile.name}`,
    version: '1.0.0',
    description: `由文风蒸馏工坊提炼（平均句长 ${m.avgSentenceLen}字，σ=${m.sentenceLenStdDev}，独句段 ${m.singleSentenceParaRatio}%）：${profile.narrativeVoice.slice(0, 60)}`,
    promptInstruction: `${profile.executableDirective}\n\n【叙事机位】：${profile.narrativeVoice}\n【五感颗粒度】：${profile.sensorySignature}\n【对白潜台词】：${profile.dialogueCraft}\n【严禁违和项】：${profile.antiSlopTaboos}`,
    ruleTier: 'contract',
    category: 'style',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    packageType: 'single-md',
    qualityTargets: [
      { metric: '平均句长', medianTarget: `${m.avgSentenceLen}字` },
      { metric: '句长标准差 σ', medianTarget: `≥${Math.max(12.5, m.sentenceLenStdDev)}` },
      { metric: '短句占比', medianTarget: `${m.shortRatio}%` },
      { metric: '独句段占比', medianTarget: `${m.singleSentenceParaRatio}%` },
    ],
  };
}

/**
 * Builds a side-by-side "同题试笔验风" prompt to verify the distilled style DNA on a live scene topic.
 */
export function buildStyleTrialComparisonMessages(params: {
  profile: DistilledStyleProfile;
  sceneTopic: string;
}): Message[] {
  const { profile, sceneTopic } = params;
  return [
    {
      role: 'system',
      content: `你是文风蒸馏验收专家。请围绕用户给定的同一个微场景命题，分别写出两段各约 180~240 字的片段，输出严格合法的纯 JSON：
{
  "baselineSlop": "对照组：未挂载蒸馏DNA的普通网文AI常见写法（四平八稳、含常见套话）",
  "distilledOutput": "实验组：严格执行《${profile.name}》全部句法统计指纹（σ≈${Math.max(13, profile.metrics.sentenceLenStdDev)}，独句段≈${profile.metrics.singleSentenceParaRatio}%）、五感颗粒度与潜台词规范写出的高质感人类笔法片段",
  "craftDiffNote": "一句话点明实验组在断句、动词与潜台词上如何兑现了该蒸馏DNA"
}`,
    },
    {
      role: 'user',
      content: `【试笔命题】：${sceneTopic || '雨夜客栈/走廊重逢，一方递出旧信物，另一方察觉有诈却不动声色。'}
${formatDistilledStylePromptBlock(profile)}`,
    },
  ];
}
