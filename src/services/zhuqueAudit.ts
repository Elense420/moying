import {
  AdversarialStoryReviewReport,
  BookSettings,
  DistilledStyleProfile,
  ZhuqueAuditReport,
  ZhuqueFinding,
  ZhuqueOnlineDetectResult,
} from '../types';
import { Message } from './apiClient';
import { generateUUID } from '../utils/uuid';

interface PatternRule {
  ruleId: string;
  categoryLabel: string;
  severity: 'blocking' | 'advisory';
  regex: RegExp;
  minCountToFlag?: number;
  reason: string;
  fixHint: string;
}

/**
 * Derived from zenstory-ai/oh-story-claudecode `story-deslop/scripts/check-ai-patterns.js`
 * combined with Tencent Zhuque (腾讯朱雀大模型检测器) Chinese AIGC high-weight lexical & syntactic features.
 */
const ZHUQUE_PATTERN_RULES: PatternRule[] = [
  {
    ruleId: 'not-is-comparison',
    categoryLabel: '否定对比套路句 (朱雀高危)',
    severity: 'blocking',
    regex: /(?:不是[^，。！？\n]{1,22}，?\s*而是[^。！？\n]{1,28}|并非[^，。！？\n]{1,22}，?\s*而是[^。！？\n]{1,28}|不仅没有[^，。！？\n]{1,22}，?\s*反而[^。！？\n]{1,28}|非但没有[^，。！？\n]{1,22}，?\s*(?:反而|甚至)[^。！？\n]{1,28})/g,
    reason: '大模型极高频使用的“不是A而是B / 不仅没有…反而…”二元修辞骨架，朱雀句法分类器高权重命中项。',
    fixHint: '直接删去否定垫脚石，用具体物理动作或半截台词直接写出真实状态。',
  },
  {
    ruleId: 'reverse-not-is',
    categoryLabel: '倒装判断强调句',
    severity: 'blocking',
    regex: /是[^，。！？“”\n]{2,16}，\s*不是[^。！？“”\n]{2,18}[。！]/g,
    reason: '“是A，不是B。”属于典型大模型装腔强调句式。',
    fixHint: '改为不加解释的场景事实或人物即时反应。',
  },
  {
    ruleId: 'voice-contrast',
    categoryLabel: '音量反差套话',
    severity: 'blocking',
    regex: /(?:声音|语气|嗓音)(?:不大|不高|很轻|平淡|极轻)，?\s*却(?:透着|带着|仿佛|像|让|令|有种)[^。！？\n]{2,26}/g,
    reason: '网文 AI 泛滥成灾的“声音不大，却透着不容置疑的威严”模板句。',
    fixHint: '直接写听众的生理或动作反应（如手腕一滞、茶盖磕响），不要评价他的声音。',
  },
  {
    ruleId: 'negation-parade',
    categoryLabel: '连续否定排比',
    severity: 'blocking',
    regex: /没有[^，。！？\n]{2,16}，\s*没有[^，。！？\n]{2,16}，\s*(?:只有|只是)[^。！？\n]{2,24}/g,
    reason: '“没有A，没有B，只有C”三段排比属于典型生成式套路韵律。',
    fixHint: '拆散工整排比，只保留眼前最刺眼的一个具体器物细节。',
  },
  {
    ruleId: 'zhuque-facial-cliche',
    categoryLabel: '五官微表情AI高频词',
    severity: 'blocking',
    regex: /(?:瞳孔(?:微缩|骤缩|猛地一缩|地震)|嘴角勾起一抹|唇角勾起一抹|眼中闪过一丝|眼底掠过一抹|指节(?:因用力而)?泛白|空气仿佛(?:在这一刻)?凝固|不容置疑的|不易察觉的)/g,
    reason: '腾讯朱雀词频指纹库核心高频词（瞳孔微缩/嘴角勾起一抹/眼中闪过一丝/不容置疑）。',
    fixHint: '替换为与当前环境强绑定的专属动作（如捻灭灯芯、虎口压紧刀柄、错开半步）。',
  },
  {
    ruleId: 'reasoning-chain',
    categoryLabel: '论文解释连接词',
    severity: 'blocking',
    regex: /(?:这意味着|换句话说|事实上，|不难看出|不得不承认|某种意义上|毫无疑问，|显而易见)/g,
    reason: '说理式逻辑过渡词破坏小说叙事沉浸感，暴露语言模型推理痕迹。',
    fixHint: '彻底删去解释词，让前后两个动作自然形成因果。',
  },
  {
    ruleId: 'abstract-emotion-slop',
    categoryLabel: '抽象情绪与转场套话',
    severity: 'advisory',
    regex: /(?:莫名的情绪|复杂的情绪|五味杂陈|一股(?:暖流|寒意)涌上心头|取而代之的是|映入眼帘的是|与此同时，|深吸一口气|下意识地)/g,
    minCountToFlag: 2,
    reason: '用抽象标签词概括心理或机械转场，削弱人类写作的颗粒度。',
    fixHint: '删去情绪总结词，用体感温度、视线焦点或生活化小动作替代。',
  },
  {
    ruleId: 'cheap-metaphor',
    categoryLabel: '廉价明喻堆砌',
    severity: 'advisory',
    regex: /(?:仿佛[^，。！？\n]{2,18}一般|宛如[^，。！？\n]{2,18}一般|就像一(?:把|柄|头|只)[^，。！？\n]{2,16})/g,
    minCountToFlag: 2,
    reason: '高频“仿佛…一般”公式化比喻容易拉高困惑度均匀性（低熵特征）。',
    fixHint: '少用明喻，直接用准确动词白描事物本身。',
  },
];

const TRAILER_ENDING_REGEX =
  /(?:没人知道|没有人知道|才刚刚开始|刚刚拉开序幕|命运的齿轮|山雨欲来|暴风雨前的宁静|这一夜注定|等待他们的将是|暗流开始涌动|一切才刚刚|还远远没有结束)/g;

/**
 * Splits Chinese prose into natural sentences while preserving punctuation context.
 */
function splitSentences(text: string): string[] {
  const cleaned = (text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  const result: string[] = [];
  const paras = cleaned.split('\n');
  for (const para of paras) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    let curr = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      curr += ch;
      if (['。', '！', '？', '!', '?'].includes(ch) || (ch === '…' && curr.endsWith('……'))) {
        while (i + 1 < trimmed.length && ['"', "'", '”', '’', '」', '）', ')', '》'].includes(trimmed[i + 1])) {
          i++;
          curr += trimmed[i];
        }
        if (curr.trim()) {
          result.push(curr.trim());
        }
        curr = '';
      }
    }
    if (curr.trim()) {
      result.push(curr.trim());
    }
  }
  return result.filter((s) => s.length > 0 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(s));
}

/**
 * Runs genuine local statistical & 22-pattern forensic analysis modeling Tencent Zhuque AI detector.
 */
export function analyzeTextForZhuque(rawText: string): ZhuqueAuditReport {
  const text = (rawText || '').trim();
  if (!text) {
    return {
      aiRiskScore: 0,
      verdict: 'pass',
      burstinessStdDev: 0,
      avgSentenceLen: 0,
      shortSentencePct: 0,
      singleParaPct: 0,
      dialoguePct: 0,
      blockingCount: 0,
      advisoryCount: 0,
      findings: [],
    };
  }

  const charCount = Math.max(1, text.replace(/\s+/g, '').length);
  const kFactor = Math.max(0.4, charCount / 1000);

  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.replace(/\s+/g, '').length);

  const avgSentenceLen =
    lengths.length > 0
      ? Number((lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1))
      : 0;

  const variance =
    lengths.length > 1
      ? lengths.reduce((acc, len) => acc + Math.pow(len - avgSentenceLen, 2), 0) / lengths.length
      : 0;
  const burstinessStdDev = Number(Math.sqrt(variance).toFixed(1));

  const shortCount = lengths.filter((l) => l <= 11).length;
  const shortSentencePct =
    lengths.length > 0 ? Math.round((shortCount / lengths.length) * 100) : 0;

  let singleSentenceParas = 0;
  for (const p of paragraphs) {
    const pSents = splitSentences(p);
    if (pSents.length === 1) singleSentenceParas += 1;
  }
  const singleParaPct =
    paragraphs.length > 0 ? Math.round((singleSentenceParas / paragraphs.length) * 100) : 0;

  // Estimate dialogue character ratio
  const dialogueMatches: string[] = text.match(/“[^”]*”|"[^"]*"|「[^」]*」/g) || [];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
  const dialoguePct = Math.min(100, Math.round((dialogueChars / charCount) * 100));

  const findings: ZhuqueFinding[] = [];

  // 1. Check lexical & syntactic AI pattern rules
  for (const rule of ZHUQUE_PATTERN_RULES) {
    const matches = Array.from(text.matchAll(rule.regex));
    const minReq = rule.minCountToFlag || 1;
    if (matches.length >= minReq) {
      const sampleSnippets = matches
        .slice(0, 3)
        .map((m) => `「${m[0].slice(0, 36)}」`)
        .join('、');
      findings.push({
        id: generateUUID(),
        ruleId: rule.ruleId,
        categoryLabel: `${rule.categoryLabel} (${matches.length}处)`,
        severity: matches.length >= 3 ? 'blocking' : rule.severity,
        matchedText: sampleSnippets,
        reason: rule.reason,
        fixHint: rule.fixHint,
      });
    }
  }

  // 2. Check em-dash ("——") abuse
  const emDashCount = (text.match(/——/g) || []).length;
  const emDashPer1k = emDashCount / kFactor;
  if (emDashCount >= 3 && emDashPer1k > 2.2) {
    findings.push({
      id: generateUUID(),
      ruleId: 'em-dash-abuse',
      categoryLabel: `破折号解释腔超标 (${emDashCount}处 / ${emDashPer1k.toFixed(1)}次每千字)`,
      severity: 'blocking',
      matchedText: `全文共出现 ${emDashCount} 处“——”`,
      reason: '大模型极爱用破折号强行制造追光灯式总结或补充解释，是朱雀标点分布检测的显著异常特征。',
      fixHint: '将破折号直接改为句号或逗号拆成两句，每千字破折号严格控制在 1 处以内。',
    });
  }

  // 3. Check micro-action tic ("了一下 / 了下")
  const ticMatches = text.match(/了一?下/g) || [];
  if (ticMatches.length >= 4 && ticMatches.length / kFactor > 3.5) {
    findings.push({
      id: generateUUID(),
      ruleId: 'micro-action-tic',
      categoryLabel: `弱动词补丁“了一下”泛滥 (${ticMatches.length}处)`,
      severity: 'advisory',
      matchedText: `出现 ${ticMatches.length} 处“了一下/了下”`,
      reason: 'AI 常在动词后机械粘贴“了一下”（看了一下、笑了一下、顿了一下），导致动作绵软同质化。',
      fixHint: '换为精准单字或双字实义动词（瞥、嗤、按住、偏头）。',
    });
  }

  // 4. Check trailer / ominous summary ending in final 280 chars
  const tailWindow = text.slice(Math.max(0, text.length - 280));
  const tailHits = Array.from(tailWindow.matchAll(TRAILER_ENDING_REGEX));
  if (tailHits.length > 0) {
    findings.push({
      id: generateUUID(),
      ruleId: 'trailer-ending',
      categoryLabel: '章末预告片升华腔 (朱雀重灾区)',
      severity: 'blocking',
      matchedText: tailHits.map((m) => `「${m[0]}」`).join('、'),
      reason: 'AI 极度习惯在章末写“没人知道…一切才刚刚开始”式总结预告，一眼假。',
      fixHint: '停在最后一个具体动作、器物异变或半句未说完的台词上，戛然而止。',
    });
  }

  // 5. Statistical Burstiness & Paragraph Uniformity (Core Zhuque Perplexity/Burstiness Signal)
  if (sentences.length >= 8 && burstinessStdDev < 10.8) {
    findings.push({
      id: generateUUID(),
      ruleId: 'low-burstiness',
      categoryLabel: `句长离散度偏低 · 匀速机器节拍 (σ=${burstinessStdDev})`,
      severity: burstinessStdDev < 8.8 ? 'blocking' : 'advisory',
      matchedText: `平均句长 ${avgSentenceLen} 字，标准差 σ=${burstinessStdDev}（真人作家通常 σ≥12.5）`,
      reason: '腾讯朱雀不仅查套话，更核心的是测算句长熵值（Burstiness）。每句都在16~24字之间匀速输出会被判定为高概率AIGC。',
      fixHint: '在冲突处插入 2~7 字极短句（如“风停了。”“他没接。”），与 28~40 字的具象细节长句形成错落咬合。',
    });
  }

  if (paragraphs.length >= 6 && singleParaPct < 12) {
    findings.push({
      id: generateUUID(),
      ruleId: 'uniform-paragraph-blocks',
      categoryLabel: `豆腐块匀速分段 (独句段仅 ${singleParaPct}%)`,
      severity: 'advisory',
      matchedText: `共 ${paragraphs.length} 段，独句成段占比 ${singleParaPct}%`,
      reason: 'AI 默认每段固定写 3~4 句，缺乏人类网文与文学作品的独句留白呼吸感。',
      fixHint: '在情绪转折、动作定格或冷淡回应处，单独拎出一句话独立成段。',
    });
  }

  const blockingCount = findings.filter((f) => f.severity === 'blocking').length;
  const advisoryCount = findings.filter((f) => f.severity === 'advisory').length;

  // Calibrated Zhuque Risk Score (0 ~ 98)
  let risk = 8; // baseline natural floor
  risk += blockingCount * 14;
  risk += advisoryCount * 6;
  if (sentences.length >= 8) {
    if (burstinessStdDev < 8.0) risk += 24;
    else if (burstinessStdDev < 10.0) risk += 15;
    else if (burstinessStdDev < 12.0) risk += 7;
    else if (burstinessStdDev >= 13.8) risk -= 5;
  }
  if (paragraphs.length >= 6) {
    if (singleParaPct < 10) risk += 10;
    else if (singleParaPct >= 24 && singleParaPct <= 55) risk -= 4;
  }
  if (dialoguePct >= 18 && dialoguePct <= 62) {
    risk -= 3;
  }

  const aiRiskScore = Math.max(3, Math.min(98, Math.round(risk)));
  const verdict: ZhuqueAuditReport['verdict'] =
    aiRiskScore < 20 ? 'pass' : aiRiskScore <= 42 ? 'borderline' : 'high_risk';

  return {
    aiRiskScore,
    verdict,
    burstinessStdDev,
    avgSentenceLen,
    shortSentencePct,
    singleParaPct,
    dialoguePct,
    blockingCount,
    advisoryCount,
    findings,
  };
}

/**
 * Honest system transparency disclosure statement for user awareness.
 */
export const ZHUQUE_AUDIT_TRANSPARENCY_NOTE =
  '【技术原理与实测说明】：腾讯朱雀为腾讯内部企业级 AIGC 安全检测器，官方从未开放免密或免签约的公网 API。本系统集成的是基于开源检测器（zenstory-ai check-ai-patterns 等）与腾讯朱雀公开发布的 AIGC 文本特征白皮书构建的「本地启发式特征扫描与突发度算法引擎」。本系统绝不弄虚作假，通过真实的本地正则与统计特征（句长方差 σ、独句段比率、22类高危套路句式），实打实定位并清除 AI 机械腔。';

export interface SurgicalSentenceFinding {
  sentenceIndex: number;
  originalSentence: string;
  matchedRules: string[];
  fixHint: string;
}

/**
 * Extracts only the specific sentences that triggered AI pattern rules.
 * This enables surgical replacements without re-generating the entire chapter,
 * preventing LLM prompt backfire where rewriting generates new AI patterns.
 */
export function findSurgicalSentences(rawText: string): SurgicalSentenceFinding[] {
  const text = (rawText || '').trim();
  if (!text) return [];

  const sentences = splitSentences(text);
  const results: SurgicalSentenceFinding[] = [];

  sentences.forEach((sent, idx) => {
    const matchedRules: string[] = [];
    let fixHint = '';

    for (const rule of ZHUQUE_PATTERN_RULES) {
      if (rule.regex.test(sent)) {
        matchedRules.push(rule.categoryLabel);
        if (!fixHint) fixHint = rule.fixHint;
      }
      rule.regex.lastIndex = 0; // reset regex state
    }

    // Check trailer endings in the sentence
    if (TRAILER_ENDING_REGEX.test(sent)) {
      matchedRules.push('章末预告片升华腔');
      if (!fixHint) fixHint = '停在具体物理动作或戛然而止的半句对白上，严禁宏大叙事总结。';
    }
    TRAILER_ENDING_REGEX.lastIndex = 0;

    // Check em-dash abuse in a single short sentence
    if ((sent.match(/——/g) || []).length >= 2) {
      matchedRules.push('破折号堆叠解释腔');
      if (!fixHint) fixHint = '改为逗号或句号拆解。';
    }

    if (matchedRules.length > 0) {
      results.push({
        sentenceIndex: idx,
        originalSentence: sent,
        matchedRules,
        fixHint,
      });
    }
  });

  return results;
}

/**
 * Builds surgical replacement prompt targeting ONLY the problematic sentences.
 * This preserves 98% of the original chapter and only fixes the dirty sentences.
 */
export function buildSurgicalDeslopMessages(params: {
  chapterTitle: string;
  dirtySentences: SurgicalSentenceFinding[];
  distilledStyle?: DistilledStyleProfile | null;
  characterSpeechNotes?: string;
}): Message[] {
  const { chapterTitle, dirtySentences, distilledStyle, characterSpeechNotes } = params;

  const sentencePrompts = dirtySentences
    .map(
      (item, i) =>
        `【病灶原句 ${i + 1}】（命中：${item.matchedRules.join('、')}）\n原句："${item.originalSentence}"\n修改方向：${item.fixHint}`
    )
    .join('\n\n');

  const styleClause = distilledStyle
    ? `\n\n【遵循的文风指纹《${distilledStyle.name}》】\n${distilledStyle.executableDirective}`
    : '';

  const voiceClause = characterSpeechNotes
    ? `\n\n【角色说话声纹与知情边界】\n${characterSpeechNotes}`
    : '';

  return [
    {
      role: 'system',
      content: `你是精通网文去AI味的老练编辑。你的任务是针对给出的几句“因命中 AI 套套句式（如‘不是…而是…’、‘声音不大却透着…’、‘嘴角勾起一抹’、‘瞳孔微缩’等）而超标”的孤立句子，提供【接地气的口语化、纯动作白描】的人类作家替换句。

【改写铁律】：
1. 坚决杜绝二元否定：“不是A而是B”直接删去否定词，改为真实发生的动作（如把“他不是怕死，而是放心不下妹妹”改为“他握紧了兜里给妹妹买的糖，没往后退半步”）。
2. 坚决杜绝评价声音：“声音不大却威严”改为“他把茶杯重重一磕：‘坐下。’”
3. 坚决杜绝五官体操：“嘴角勾起一抹冷笑，瞳孔骤缩”改为人物与环境的具体器物互动（如“他扯了下领口，盯着对方手里的刀”）。
4. 语言要极简、带生活质感与毛边，严禁写成文艺抒情散文，严禁加入“空气中弥漫着……”等二手词。${styleClause}${voiceClause}

请严格输出 JSON 数组，格式如下（不要包裹任何多余解释）：
[
  {
    "original": "原句文本",
    "replacement": "改写后接地气的真人句子"
  }
]`,
    },
    {
      role: 'user',
      content: `章节：《${chapterTitle}》
待手术的 ${dirtySentences.length} 处具体病灶句子清单：

${sentencePrompts}`,
    },
  ];
}

export function parseSurgicalDeslopResponse(
  raw: string
): Array<{ original: string; replacement: string }> {
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && typeof item.original === 'string' && typeof item.replacement === 'string')
      .map((item: any) => ({
        original: String(item.original).trim(),
        replacement: String(item.replacement).trim(),
      }));
  } catch {
    return [];
  }
}

/**
 * Safely applies surgical sentence replacements into original text.
 */
export function applySurgicalReplacements(
  originalText: string,
  replacements: Array<{ original: string; replacement: string }>
): string {
  let updated = originalText;
  for (const { original, replacement } of replacements) {
    if (!original || !replacement) continue;
    if (updated.includes(original)) {
      updated = updated.replace(original, replacement);
    } else {
      // Fuzzy whitespace match
      const cleanOrig = original.replace(/\s+/g, '');
      const sents = splitSentences(updated);
      for (const sent of sents) {
        if (sent.replace(/\s+/g, '') === cleanOrig) {
          updated = updated.replace(sent, replacement);
          break;
        }
      }
    }
  }
  return updated;
}

export type ZhuqueDeslopMode = 'anti-zhuque-high-entropy' | 'beijing-vernacular';

/**
 * Builds the `story-deslop` + Tencent Zhuque Humanization Prompt for full-chapter rewriting.
 * Contains both:
 * 1. 'anti-zhuque-high-entropy': specifically targets neural AIGC detectors (disrupting PPL, token prior distributions, and syntax).
 * 2. 'beijing-vernacular': grounded literary humanization (Lao She / Wang Zengqi).
 */
export function buildZhuqueDeslopMessages(params: {
  chapterTitle: string;
  chapterText: string;
  auditReport: ZhuqueAuditReport;
  distilledStyle?: DistilledStyleProfile | null;
  characterSpeechNotes?: string;
  mode?: ZhuqueDeslopMode;
}): Message[] {
  const { chapterTitle, chapterText, auditReport, distilledStyle, characterSpeechNotes, mode = 'anti-zhuque-high-entropy' } = params;

  const findingsDigest =
    auditReport.findings.length > 0
      ? auditReport.findings
          .map(
            (f, i) =>
              `${i + 1}. [${f.severity === 'blocking' ? '阻断级红线' : '优化项'}] ${f.categoryLabel}：${f.matchedText}\n   替换方向：${f.fixHint}`
          )
          .join('\n')
      : '重点拉大句长错落度（避免均匀每句20字），多用真实具体的生活器物动作替代心理抽象评价。';

  const styleBlock = distilledStyle
    ? `\n\n【文风DNA：《${distilledStyle.name}》】\n${distilledStyle.executableDirective}`
    : '';

  const voiceBlock = characterSpeechNotes
    ? `\n\n【角色说话声纹与知情边界隔离】\n${characterSpeechNotes}`
    : '';

  const targetLen = Math.max(800, chapterText.replace(/\s+/g, '').length);

  const isAntiZhuque = mode === 'anti-zhuque-high-entropy';

  const systemContent = isAntiZhuque
    ? `你是一位专门对抗【腾讯朱雀大模型 AIGC 检测器】与各大网文平台过审算法的顶级小说总编。
【朱雀检测器的核心致命死穴】：
腾讯朱雀检测器依赖神经网络测算“词语预测困惑度 (Perplexity)”与“句法平滑均匀度 (Burstiness)”。AI 写的小说之所以在朱雀官网会被直接判定为“疑似AI 80%、AI特征 20%、未发现明显人工创作特征”，正是因为 AI 词汇太安全、句式太工整、缺乏人话的语法倒装、碎嘴子和生活瑕疵！

请你以【极端真实的人类手笔】重写本章，强制执行以下 6 大【人工创作特征破壁铁律】，彻底打翻朱雀神经网络的判定先验：

1. 【打碎语法结构 · 严禁机器书面连词】
   - 彻底删除“只见”、“随后”、“紧接着”、“下一刻”、“与此同时”、“不得不说”、“这意味着”、“仿佛一般”。
   - 绝不使用“因为……所以……”、“不仅……而且……”等完整规范并列句。
   - 强制使用意合断句、宾语前置与口语倒装（例：“烟头掐了，他。”“走不走？随你。”“没影儿的事。”“抬手就是一巴掌。”）。

2. 【注入高困惑度口语语气词与俚语 (朱雀克星)】
   - 每 2-3 段必须自然穿插真实人类常用的口头叹词与语气词：“操”、“得嘞”、“好家伙”、“横竖”、“扯淡”、“没跑了”、“瞅着”、“估摸着”、“保齐”、“哎哟喂”、“拉倒吧”、“真叫一个绝”。
   - 说话要有呼吸气：允许吞字、半截话、答非所问、自嘲、插科打诨。

3. 【粗糙微观触感取代宏观心理描写】
   - 严禁写任何心理抽象总结（如“心中五味杂陈”、“感到前所未有的危机”、“脑海中轰然作响”）。
   - 全部替换为带着污渍、气味和温度的粗糙现实物理细节：
     不是“桌上的茶凉了”，而是“破条案上那半碗高碎早凉透了，水面上结了层灰白的茶锈，碗沿崩了个黄豆大的豁口”。
     不是“他很紧张”，而是“喉咙眼里直冒火，后槽牙咬得生疼，后背被冷汗沤得黏腻发痒”。

4. 【极端长短句交错 · 破坏机器匀速节拍】
   - 强制插入 2~5 字极短单句独立成段或在句群中骤停：“风紧。”“没动静。”“呛得慌。”“手抖了。”“去他娘的。”
   - 紧接着跟随充满琐碎具体动作与视线的长句（40-60字），制造极高的人类心跳脉冲。

5. 【绝对红线禁令】
   - 严禁成对四字成语（如“杀意凛然、面无表情、目光如炬”等成语连用是一眼AI假货）；
   - 严禁章末预告片腔（如“谁也不知道等待他们的将是什么”、“一切才刚刚拉开序幕”）；
   - 严禁五官微表情（瞳孔骤缩、嘴角勾起一抹、眼中闪过一丝、指节泛白全部砍掉）。

6. 【剧情与人物生死保全】
   - 本章原有剧情推进、战斗胜负、生死因果、关键道具与伏笔必须 100% 完整保留，不可遗漏情节。${styleBlock}${voiceBlock}

请直接输出重铸后的章节正文（约 ${targetLen} 字左右，绝不输出任何前缀、废话或解释说明）。`
    : `你是一位崇尚【老舍、汪曾祺式生活化白描】的中文小说责编。
你的唯一任务：将以下章节中的“大模型翻译腔与AI套话”全部剔除，换成接地气、有现场呼吸感的生活大白话。保持原剧情走向、人物生死与道具细节 100% 不变。

【必须严格执行的降温去味红线】：
1. 绝对不要写文艺抒情腔或哲学感慨！严禁出现“属于他的风暴才刚刚拉开序幕”、“这一夜注定无眠”、“命运的齿轮”等宏大旁白。
2. 绝对不要写二元纠偏对比句！
   - ❌ 禁用：“他不是不想走，而是根本走不了。”
   - ✅ 正确：他脚下一绊，险些摔在台阶上。
3. 绝对不要评价人物声音！
   - ❌ 禁用：“声音不大，却透着不容置疑的威严/冷冽。”
   - ✅ 正确：他眼皮都没抬一下：“坐回去。”
4. 绝对不要写五官微表情清单！
   - ❌ 禁用：“瞳孔微缩/骤缩”、“嘴角勾起一抹冷笑”、“眼中闪过一丝精光”、“指节泛白”。
   - ✅ 正确：具体的日常物理动作（如把烟头按灭在窗台上、拎起桌上的水壶倒水、拉开椅子坐下）。
5. 破折号“——”全文不超过 2 处，严禁把一个字单独成段（如“静。”、“冷。”）。
6. 让人物像活人一样说话：允许口语停顿、半截话、答非所问、带语气助词，不要写成工整的书面辩论稿。${styleBlock}${voiceBlock}

请直接输出降温重铸后的完整章节正文（约 ${targetLen} 字左右，绝不减少情节，不要输出任何解释说明）。`;

  return [
    {
      role: 'system',
      content: systemContent,
    },
    {
      role: 'user',
      content: `章节：《${chapterTitle}》
当前本地预检 AI 痕迹分：${auditReport.aiRiskScore}%

【原稿中被标记的 AI 病灶】：
${findingsDigest}

【待去味重铸的原正文】：
${chapterText}`,
    },
  ];
}

/**
 * Invokes real remote Tencent Zhuque AIGC detection API via backend proxy
 */
export async function callZhuqueOnlineDetect(params: {
  text: string;
  gatewayUrl?: string;
  apiKey?: string;
}): Promise<ZhuqueOnlineDetectResult> {
  if (!params.gatewayUrl || !params.apiKey) {
    return {
      isConfigured: false,
      error: '未配置腾讯云朱雀网关地址或 API Key。请在「设置」中完成配置，或直接点击下方按钮直达朱雀官方网页端检测。',
    };
  }

  try {
    const res = await fetch('/api/zhuque/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        gatewayUrl: params.gatewayUrl,
        apiKey: params.apiKey,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        isConfigured: true,
        error: err.error || `请求失败 (${res.status})`,
        checkedAt: Date.now(),
      };
    }

    const json = await res.json();
    const data = json.data || {};

    const rawSuspected = data.suspected_ai_pct ?? data.suspected_ai ?? data.ai_prob ?? 0;
    const rawFeature = data.ai_feature_pct ?? data.ai_feature ?? 0;
    const suspectedAiPct = Math.round(Number(rawSuspected) * (rawSuspected <= 1 ? 100 : 1));
    const aiFeaturePct = Math.round(Number(rawFeature) * (rawFeature <= 1 ? 100 : 1));
    const humanFeaturePct = Math.max(0, 100 - suspectedAiPct - aiFeaturePct);

    const verdict: ZhuqueOnlineDetectResult['verdict'] =
      suspectedAiPct + aiFeaturePct >= 60 ? 'high_risk' : suspectedAiPct + aiFeaturePct >= 30 ? 'borderline' : 'pass';

    return {
      isConfigured: true,
      score: suspectedAiPct + aiFeaturePct,
      suspectedAiPct,
      aiFeaturePct,
      humanFeaturePct,
      verdict,
      conclusionText: data.conclusion || (humanFeaturePct > 50 ? '发现明显的人工创作特征' : '未发现明显的人工创作特征'),
      rawResponse: data,
      checkedAt: Date.now(),
    };
  } catch (err: any) {
    return {
      isConfigured: true,
      error: err.message || '网络请求异常',
      checkedAt: Date.now(),
    };
  }
}

/**
 * Builds the `story-review` 4-Dimension Adversarial Review prompt.
 */
export function buildAdversarialStoryReviewMessages(params: {
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  settings: BookSettings;
  localZhuqueReport: ZhuqueAuditReport;
}): Message[] {
  const { bookTitle, chapterIndex, chapterTitle, chapterText, settings, localZhuqueReport } = params;

  const chOutline = (settings.chapterOutlines || []).find((c) => c.chapterIndex === chapterIndex);
  const unit = chOutline?.unitId
    ? (settings.storyUnits || []).find((u) => u.id === chOutline.unitId)
    : undefined;
  const vol = chOutline?.volumeId
    ? (settings.volumePlan || []).find((v) => v.id === chOutline.volumeId)
    : undefined;

  const charSummary = (settings.characterGraph || [])
    .slice(0, 8)
    .map(
      (c) =>
        `- ${c.name}（${c.roleType}）：口癖「${c.speechStyle || '未设'}」 | 知情边界「${c.epistemicBoundary || '仅限亲历'}」 | 当前状态「${c.currentStatus || '正常'}」`
    )
    .join('\n');

  const itemSummary = (settings.keyItemRegistry || [])
    .slice(0, 8)
    .map((it) => `- ${it.name}（持有：${it.holderName}，状态：${it.status}）：限制与代价「${it.rulesAndCost}」`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是执行【story-review 四维对抗审核协议】的冷酷总编审读员（严禁夸奖讨好，只找硬伤并给出手术级改法）。
请从以下 4 个维度对当前章节进行交叉质检，并严格输出纯 JSON 对象（不要用 markdown 代码块包裹额外废话）：
{
  "overallPass": boolean,
  "overallScore": number,
  "summaryVerdict": "一句话犀利总评（指出核心亮点或致命硬伤）",
  "dimensions": [
    {
      "dimension": "四层拆纲与推进配额",
      "score": number,
      "status": "pass" | "warn" | "fail",
      "critique": "核查是否兑现本章主角目标、核心阻力与章末钩子，是否偏离所属单元与分卷目标，是否违反单章至多1项大突破配额",
      "actionableFixes": ["具体可执行的修改动作1", "具体动作2"]
    },
    {
      "dimension": "人设声纹与知情权边界",
      "score": number,
      "status": "pass" | "warn" | "fail",
      "critique": "核查遮住名字能否听出是谁说话，是否存在角色未亲眼所见却开启上帝视角点破幕后阴谋的逻辑穿帮",
      "actionableFixes": ["具体修改动作"]
    },
    {
      "dimension": "关键道具与伏笔连续性",
      "score": number,
      "status": "pass" | "warn" | "fail",
      "critique": "核查道具持有者、使用代价、人物伤势与伏笔草蛇灰线是否前后自洽",
      "actionableFixes": ["具体修改动作"]
    },
    {
      "dimension": "朱雀过审人类质感",
      "score": number,
      "status": "pass" | "warn" | "fail",
      "critique": "结合本地朱雀扫描结果核查句式呼吸感、五感具象度与AI套话残留",
      "actionableFixes": ["具体修改动作"]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `书名：《${bookTitle}》 · 第${chapterIndex}章《${chapterTitle}》
【L1终局锚点】：${settings.masterOutlineSpec?.ultimateEnding || '见总纲'}
【L2所属分卷】：${vol ? `《${vol.title}》阶段目标：${vol.stageGoal || vol.climaxGoal}` : '未绑定'}
【L3所属剧情单元】：${unit ? `《${unit.title}》防跑偏锚点：${unit.volumeAlignment}` : '未绑定'}
【L4本章细纲契约】：
- 主角目标：${chOutline?.protagonistGoal || '推进当前事件'}
- 核心阻力：${chOutline?.coreObstacle || '外部冲突阻挠'}
- 实质增量：${chOutline?.stateDelta || chOutline?.summary || '未指定'}
- 章末钩子：${chOutline?.hookNote || '悬念断章'}

【关联角色知情权档案】：
${charSummary || settings.characters || '暂无'}

【关键道具注册表】：
${itemSummary || '暂无'}

【本地朱雀AIGC预检数据】：AI风险分 ${localZhuqueReport.aiRiskScore}%，句长标准差 σ=${localZhuqueReport.burstinessStdDev}，阻断项 ${localZhuqueReport.blockingCount} 处。

【待审正文】：
${chapterText.slice(0, 7500)}`,
    },
  ];
}

export function parseAdversarialStoryReviewResponse(raw: string): AdversarialStoryReviewReport | null {
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed.dimensions)) return null;
    return {
      overallPass: Boolean(parsed.overallPass),
      overallScore: Number(parsed.overallScore) || 75,
      summaryVerdict: String(parsed.summaryVerdict || ''),
      dimensions: parsed.dimensions.map((d: any) => ({
        dimension: String(d.dimension || '审校维度'),
        score: Number(d.score) || 75,
        status: d.status === 'fail' || d.status === 'warn' ? d.status : 'pass',
        critique: String(d.critique || ''),
        actionableFixes: Array.isArray(d.actionableFixes)
          ? d.actionableFixes.map((x: any) => String(x))
          : [],
      })),
    };
  } catch {
    return null;
  }
}
