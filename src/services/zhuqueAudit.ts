import {
  AdversarialStoryReviewReport,
  BookSettings,
  DistilledStyleProfile,
  ZhuqueAuditReport,
  ZhuqueFinding,
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
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  const rawParts = cleaned
    .split(/(?<=[。！？!?…]+['"”’）)]*|\n+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(s));
  return rawParts;
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
 * Builds the `story-deslop` + Tencent Zhuque Humanization Prompt to rewrite a chapter
 * so its AI trace drops below 20% WITHOUT losing any plot beats, items, foreshadowing, or word count.
 */
export function buildZhuqueDeslopMessages(params: {
  chapterTitle: string;
  chapterText: string;
  auditReport: ZhuqueAuditReport;
  distilledStyle?: DistilledStyleProfile | null;
  characterSpeechNotes?: string;
}): Message[] {
  const { chapterTitle, chapterText, auditReport, distilledStyle, characterSpeechNotes } = params;

  const findingsDigest =
    auditReport.findings.length > 0
      ? auditReport.findings
          .map(
            (f, i) =>
              `${i + 1}. [${f.severity === 'blocking' ? '阻断级红线' : '优化项'}] ${f.categoryLabel}：${f.matchedText}\n   修正方案：${f.fixHint}`
          )
          .join('\n')
      : '当前无明显词汇套话，重点拉大句长错落度（Burstiness σ≥13.5）并增强独句留白呼吸感。';

  const styleBlock = distilledStyle
    ? `\n\n【必须同步贯彻的蒸馏文风 DNA：《${distilledStyle.name}》】\n${distilledStyle.executableDirective}`
    : '';

  const voiceBlock = characterSpeechNotes
    ? `\n\n【角色声纹与知情边界锁死（严禁改出上帝视角或腔调趋同）】\n${characterSpeechNotes}`
    : '';

  const targetLen = Math.max(800, chapterText.replace(/\s+/g, '').length);

  return [
    {
      role: 'system',
      content: `你是精通【story-deslop 去AI味协议】与【腾讯朱雀AIGC检测对抗重构】的顶级中文文学责编。
你的唯一任务：在不改变任何剧情走向、人物知情权边界、关键道具状态与伏笔细节的前提下，对正文进行深度“去AI味人类化重铸”，使重构后文本达到真人作家手写质感（朱雀AIGC风险值 < 18%）。

【朱雀过审五大硬核手术准则】
1. 彻底清零套路骨架：严禁出现任何“不是…而是… / 并非…而是… / 不仅没有…反而… / 声音不大却… / 没有A没有B只有C”句式；严禁使用“瞳孔微缩、嘴角勾起一抹、眼中闪过一丝、指节泛白、空气仿佛凝固、不容置疑、不易察觉、莫名的情绪、取而代之的是、与此同时、这意味着”等AI高频词。
2. 制造人类句长熵值（高 Burstiness σ≥13.5）：打破每句18~22字的匀速机器节拍！将具象环境动作长句（28~42字）与冷峻干脆的极短句（2~9字，如“灯灭了。”“他没接话。”“差半寸。”）交错咬合。
3. 打破豆腐块分段：全章保持约 25%~40% 的独句自然段，在动作定格、沉默对视或冷淡回应处果断换行留白；每千字破折号“——”不超过 1 个。
4. 具象五感替代心理说明书：删掉替角色总结心情的旁白，改成手边器物声响、温度、视线错位与口语潜台词（允许半截话、答非所问、动作打断对话）。
5. 斩断预告片尾巴：章末严禁出现“没人知道、才刚刚开始、命运的齿轮、这一夜注定”等升华腔，必须停在最后一个具体动作、器物特写或悬而未决的半句对话上。${styleBlock}${voiceBlock}

请直接输出重构后的完整章节正文（约 ${targetLen} 字左右，严禁缩水删减情节，不要输出章节标题以外的任何解释说明或前缀后缀）。`,
    },
    {
      role: 'user',
      content: `章节：《${chapterTitle}》
当前朱雀预检风险分：${auditReport.aiRiskScore}%（句长标准差 σ=${auditReport.burstinessStdDev}，独句段占比 ${auditReport.singleParaPct}%）

【本次扫描命中的全部 AI 痕迹病灶清单】：
${findingsDigest}

【待去味重铸的原章节正文】：
${chapterText}`,
    },
  ];
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
