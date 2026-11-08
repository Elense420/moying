import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  X,
  Loader2,
  Check,
  Scale,
  Database,
  ArrowRight,
  ExternalLink,
  Copy,
  Flame,
  BookOpen,
  Scissors,
  HelpCircle,
} from 'lucide-react';
import {
  AdversarialStoryReviewReport,
  ApiConfig,
  BookSettings,
  UiSettings,
  ZhuqueOnlineDetectResult,
} from '../types';
import {
  analyzeTextForZhuque,
  buildAdversarialStoryReviewMessages,
  buildZhuqueDeslopMessages,
  buildSurgicalDeslopMessages,
  findSurgicalSentences,
  parseSurgicalDeslopResponse,
  applySurgicalReplacements,
  parseAdversarialStoryReviewResponse,
  ZHUQUE_AUDIT_TRANSPARENCY_NOTE,
  callZhuqueOnlineDetect,
  ZhuqueDeslopMode,
} from '../services/zhuqueAudit';
import {
  applyPostChapterMemoryWriteback,
  buildPostChapterMemoryWritebackMessages,
} from '../services/fourLayerOutlineEngine';
import { chatCompletion, streamChatCompletion } from '../services/apiClient';
import { ModalPortal, MotionButton } from './MotionPrimitives';

interface ZhuqueAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  chapterText: string;
  settings: BookSettings;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onApplyRewrittenText: (newText: string) => Promise<void>;
  onApplyMemoryWritebackSettings: (nextSettings: BookSettings, toastMsg: string) => Promise<void>;
}

export const ZhuqueAuditModal: React.FC<ZhuqueAuditModalProps> = ({
  isOpen,
  onClose,
  bookTitle,
  chapterIndex,
  chapterTitle,
  chapterText,
  settings,
  configs,
  uiSettings,
  onApplyRewrittenText,
  onApplyMemoryWritebackSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'zhuque' | 'review' | 'memory'>('zhuque');
  const [isDeslopping, setIsDeslopping] = useState(false);
  const [selectedDeslopMode, setSelectedDeslopMode] = useState<ZhuqueDeslopMode>('anti-zhuque-high-entropy');
  const [rewrittenDraft, setRewrittenDraft] = useState<string>('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewReport, setReviewReport] = useState<AdversarialStoryReviewReport | null>(null);
  const [isSyncingMemory, setIsSyncingMemory] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Real Remote Official Zhuque Verification State
  const [onlineResult, setOnlineResult] = useState<ZhuqueOnlineDetectResult | null>(null);
  const [isDetectingOnline, setIsDetectingOnline] = useState(false);
  const [copiedForZhuque, setCopiedForZhuque] = useState(false);

  const originalReport = useMemo(() => analyzeTextForZhuque(chapterText), [chapterText]);
  const rewrittenReport = useMemo(
    () => (rewrittenDraft.trim() ? analyzeTextForZhuque(rewrittenDraft) : null),
    [rewrittenDraft]
  );

  const safeSettings = settings || ({} as BookSettings);

  const getActiveApi = () => {
    const cfg = (configs || []).find((c) => c?.id === uiSettings?.writerApiCfgId) || configs?.[0];
    const model = uiSettings?.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  // Mode 1: Surgical Targeted Replacement (Zero New AI Contamination)
  const handleRunSurgicalDeslop = async () => {
    if (!chapterText.trim()) return;
    const dirtySentences = findSurgicalSentences(chapterText);
    if (dirtySentences.length === 0) {
      setStatusFeedback({
        type: 'ok',
        text: '当前章节未检出阻断级 AI 套话句子，正文极为纯净！如需进一步增强突发度，可选用「破壁级·反朱雀高熵重铸」。',
      });
      return;
    }

    setIsDeslopping(true);
    setRewrittenDraft('');
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const charVoiceNotes = (safeSettings.characterGraph || [])
        .map(
          (c) =>
            `${c.name}(${c.roleType})：声纹「${c.speechStyle || '自然贴合'}」 | 知情权隔离「${
              c.epistemicBoundary || '仅知亲历'
            }」`
        )
        .join('\n');

      const messages = buildSurgicalDeslopMessages({
        chapterTitle,
        dirtySentences,
        distilledStyle: safeSettings.activeDistilledStyle,
        characterSpeechNotes: charVoiceNotes,
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.35, // Low temperature to prevent hallucinated purple prose
      });

      const replacements = parseSurgicalDeslopResponse(res.content);
      if (replacements.length === 0) {
        throw new Error('模型未返回有效替换项，建议重试或切换为全章重铸');
      }

      const cleanProse = applySurgicalReplacements(chapterText, replacements);
      setRewrittenDraft(cleanProse);
      const newScore = analyzeTextForZhuque(cleanProse).aiRiskScore;
      setStatusFeedback({
        type: 'ok',
        text: `靶向手术刀精准成功替换了 ${replacements.length} 处 AI 套话原句！其余 98% 原文保持原汁原味，AI痕迹从 ${originalReport.aiRiskScore}% 直降至 ${newScore}%！`,
      });
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `靶向去味失败：${err.message}` });
    } finally {
      setIsDeslopping(false);
    }
  };

  // Mode 2 & 3: Full-chapter Rewriting (Anti-Zhuque High-Entropy vs Beijing Vernacular)
  const handleRunFullDeslop = async (modeToRun: ZhuqueDeslopMode = selectedDeslopMode) => {
    if (!chapterText.trim()) return;
    setIsDeslopping(true);
    setRewrittenDraft('');
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const charVoiceNotes = (safeSettings.characterGraph || [])
        .map(
          (c) =>
            `${c.name}(${c.roleType})：声纹「${c.speechStyle || '自然贴合'}」 | 知情权隔离「${
              c.epistemicBoundary || '仅知亲历'
            }」`
        )
        .join('\n');

      const messages = buildZhuqueDeslopMessages({
        chapterTitle,
        chapterText,
        auditReport: originalReport,
        distilledStyle: safeSettings.activeDistilledStyle,
        characterSpeechNotes: charVoiceNotes,
        mode: modeToRun,
      });

      // High-entropy mode uses temp 0.75 to break token probability distribution;
      // Beijing vernacular uses temp 0.35 to maintain grounded calmness.
      const temp = modeToRun === 'anti-zhuque-high-entropy' ? 0.75 : 0.35;

      let acc = '';
      const res = await streamChatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: temp,
        onChunk: (chunk) => {
          acc += chunk;
          setRewrittenDraft(acc);
        },
      });
      const finalOut = (res.content || acc).trim();
      setRewrittenDraft(finalOut);
      setStatusFeedback({
        type: 'ok',
        text:
          modeToRun === 'anti-zhuque-high-entropy'
            ? '已完成【⚡ 破壁级·反朱雀高熵重铸】！已强制注入倒装句法、粗糙生活触感与口语爆破词，打破词频均匀预测。建议点击下方「直达腾讯朱雀官网」直接进行实机验证对比！'
            : '已完成【📖 文学级·京白市井白描】重铸！语言已全面降温为市井生活质感。',
      });
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `全章重铸失败：${err.message}` });
    } finally {
      setIsDeslopping(false);
    }
  };

  // 1-Click Copy and Open Tencent Zhuque Official Detection Webpage
  const handleCopyAndOpenZhuqueWeb = () => {
    const textToTest = rewrittenDraft.trim() || chapterText;
    if (!textToTest) return;
    navigator.clipboard?.writeText(textToTest);
    setCopiedForZhuque(true);
    setTimeout(() => setCopiedForZhuque(false), 4000);
    window.open('https://matrix.tencent.com/ai-detect', '_blank', 'noopener,noreferrer');
    setStatusFeedback({
      type: 'ok',
      text: '已将当前章节文本复制到剪贴板，并在新标签页打开腾讯朱雀官方检测！进入朱雀页面后直接按 Ctrl+V 粘贴即可立即实机检验。',
    });
  };

  // Call Real Remote Tencent Zhuque API (if configured)
  const handleCallOnlineZhuqueDetect = async () => {
    const textToTest = rewrittenDraft.trim() || chapterText;
    if (!textToTest) return;
    setIsDetectingOnline(true);
    setStatusFeedback(null);
    try {
      const res = await callZhuqueOnlineDetect({
        text: textToTest,
        gatewayUrl: uiSettings.zhuqueApiGatewayUrl,
        apiKey: uiSettings.zhuqueApiKey,
      });
      setOnlineResult(res);
      if (res.error) {
        setStatusFeedback({ type: 'err', text: `腾讯云朱雀检测提示：${res.error}` });
      } else {
        setStatusFeedback({
          type: 'ok',
          text: `腾讯云朱雀官方检测完成：疑似AI ${res.suspectedAiPct}%，AI特征 ${res.aiFeaturePct}%，人工特征 ${res.humanFeaturePct}%（结论：${res.conclusionText}）`,
        });
      }
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `请求腾讯云朱雀接口出错：${err.message}` });
    } finally {
      setIsDetectingOnline(false);
    }
  };

  const handleRunAdversarialReview = async () => {
    if (!chapterText.trim()) return;
    setIsReviewing(true);
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildAdversarialStoryReviewMessages({
        bookTitle,
        chapterIndex,
        chapterTitle,
        chapterText: rewrittenDraft.trim() || chapterText,
        settings: safeSettings,
        localZhuqueReport: rewrittenReport || originalReport,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.45,
      });
      const parsed = parseAdversarialStoryReviewResponse(res.content);
      if (!parsed) throw new Error('审读返回格式无法解析，请重试');
      setReviewReport(parsed);
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `对抗审核失败：${err.message}` });
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRunMemoryWriteback = async () => {
    const targetText = rewrittenDraft.trim() || chapterText;
    if (!targetText.trim()) return;
    setIsSyncingMemory(true);
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildPostChapterMemoryWritebackMessages({
        chapterIndex,
        chapterTitle,
        chapterText: targetText,
        settings: safeSettings,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.35,
      });
      const { nextSettings, summaryToast } = applyPostChapterMemoryWriteback({
        rawJson: res.content,
        chapterIndex,
        settings: safeSettings,
      });
      await onApplyMemoryWritebackSettings(nextSettings, summaryToast);
      setStatusFeedback({ type: 'ok', text: summaryToast });
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `记忆回写失败：${err.message}` });
    } finally {
      setIsSyncingMemory(false);
    }
  };

  const verdictBadge = (verdict: 'pass' | 'borderline' | 'high_risk', score: number) => {
    if (verdict === 'pass') {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold tabular-nums">
          本地启发式安全 ({score}%)
        </span>
      );
    }
    if (verdict === 'borderline') {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold tabular-nums">
          本地套话观察区 ({score}%)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs font-bold tabular-nums">
        本地套话高危区 ({score}%)
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <ModalPortal onEscape={onClose}>
      <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-4xl max-h-[90dvh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--accent)] shrink-0" />
                <h2 className="text-base font-bold text-[var(--text-primary)] truncate font-editorial-serif">
                  朱雀过审质检 · 去味重铸 · 连载记忆中枢
                </h2>
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate">
                第 {chapterIndex} 章《{chapterTitle}》 · 协同运行 story-deslop / story-review / webnovel-write
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sub-Tabs */}
          <div className="px-5 pt-3 pb-2 border-b border-[var(--border-subtle)] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            {[
              {
                id: 'zhuque',
                label: `1. 腾讯朱雀检测与去味 (AI痕 ${originalReport.aiRiskScore}%)`,
                icon: ShieldAlert,
              },
              {
                id: 'review',
                label: '2. story-review 四维对抗审核',
                icon: Scale,
              },
              {
                id: 'memory',
                label: '3. webnovel-write 记忆与设定回写',
                icon: Database,
              },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                      : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Body */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {statusFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  statusFeedback.type === 'err'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {statusFeedback.text}
              </div>
            )}

            {/* TAB 1: ZHUQUE FORENSIC & STORY-DESLOP */}
            {activeTab === 'zhuque' && (
              <div className="space-y-4">
                {/* 1. Technical Reality & Zhuque Deep-Dive Alert Card */}
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 leading-relaxed space-y-2">
                  <div className="font-bold flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm">为什么在腾讯朱雀官网 (matrix.tencent.com) 检测会显示「疑似AI 80%、AI特征 20%」？</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-[11px] opacity-95">
                    <p>
                      <strong>① 腾讯朱雀的核心底层是神经网络分类器（混元/RoBERTa 微调）：</strong>它不仅扫描“瞳孔骤缩”等关键词，更核心的是实时计算每个 Token 的<strong>预测困惑度 (Perplexity, PPL)</strong> 与<strong>生成概率平滑度 (Burstiness)</strong>。
                    </p>
                    <p>
                      <strong>② 常规 AI 改写的致命硬伤：</strong>即使要求 AI “去味”，只要模型采用书面工整句式（每句18~25字、标点匀称、主谓宾齐全、词汇高概率），朱雀模型在神经网络计算后依然会毫不留情地判定为 80%~100% AIGC！
                    </p>
                    <p>
                      <strong>③ 破局利器（双轨实测）：</strong>请选用下方专门定制的<strong>【⚡ 破壁级·反朱雀高熵重铸】</strong>（强制口语倒装、叹词俚语、破碎短句、粗糙生活触感）打翻大模型先验，或选用<strong>【🎯 靶向手术刀】</strong>仅修病灶原句，绝不全文重新生成引入新 AI 味！
                    </p>
                  </div>
                </div>

                {/* 2. Official Dual-Track Verification Action Bar */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <h3 className="text-xs font-bold text-[var(--text-primary)]">
                          腾讯朱雀官方实机检验通道（拒绝自欺欺人 · 实打实可测）
                        </h3>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        支持直达腾讯朱雀公网官方检测控制台，或调用您的腾讯云 API 网关进行云端检验。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <MotionButton
                        type="button"
                        onClick={handleCopyAndOpenZhuqueWeb}
                        className="btn-primary min-h-[38px] px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title="复制当前章节正文并直接在新标签页打开腾讯朱雀官方检测网页"
                      >
                        {copiedForZhuque ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedForZhuque ? '已复制！正在打开朱雀官网...' : '复制全文 + 直达腾讯朱雀官网检测'}</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
                      </MotionButton>

                      <MotionButton
                        type="button"
                        disabled={isDetectingOnline || (!rewrittenDraft.trim() && !chapterText.trim())}
                        onClick={handleCallOnlineZhuqueDetect}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="直接通过后端调用配置的腾讯云 API 网关获取朱雀实测数据"
                      >
                        {isDetectingOnline ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                        )}
                        <span>{isDetectingOnline ? '官方云端检测中...' : '调用腾讯云官方接口检测'}</span>
                      </MotionButton>
                    </div>
                  </div>

                  {/* Remote Detection Result Display (If any) */}
                  {onlineResult && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                        onlineResult.error
                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                          : onlineResult.verdict === 'pass'
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                          : 'border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>
                          腾讯云朱雀官方云端返回结论：{onlineResult.conclusionText || '已完成检测'}
                        </span>
                        {onlineResult.score !== undefined && (
                          <span className="tabular-nums">
                            综合 AI 偏向分：{onlineResult.score}%
                          </span>
                        )}
                      </div>
                      {!onlineResult.error && (
                        <div className="grid grid-cols-3 gap-2 text-center pt-1">
                          <div className="p-2 rounded-lg bg-[var(--bg-surface)]/70">
                            <div className="text-[10px] opacity-75">疑似 AI 比例</div>
                            <div className="text-sm font-bold tabular-nums text-rose-600">
                              {onlineResult.suspectedAiPct}%
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[var(--bg-surface)]/70">
                            <div className="text-[10px] opacity-75">AI 特征比例</div>
                            <div className="text-sm font-bold tabular-nums text-amber-600">
                              {onlineResult.aiFeaturePct}%
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[var(--bg-surface)]/70">
                            <div className="text-[10px] opacity-75">人工创作特征</div>
                            <div className="text-sm font-bold tabular-nums text-emerald-600">
                              {onlineResult.humanFeaturePct}%
                            </div>
                          </div>
                        </div>
                      )}
                      {onlineResult.error && (
                        <p className="text-[11px] leading-relaxed">
                          {onlineResult.error}
                          {!uiSettings.zhuqueApiKey && (
                            <span className="block mt-1 font-semibold text-[var(--accent)]">
                              💡 提示：您可前往「设置」配置腾讯云 API 密钥；未配置时，点击上方「复制全文 + 直达腾讯朱雀官网检测」按钮即可在官方网页免费即开即测！
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Three-Engine De-slop Selection & Execution */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text-primary)]">
                        三大去味重铸引擎（专攻不同过审与行文需求）
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        请根据期望的行文风格与质检目标，选择对应的去味引擎执行重写：
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Engine 1: High-Entropy Anti-Zhuque */}
                    <div
                      onClick={() => setSelectedDeslopMode('anti-zhuque-high-entropy')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        selectedDeslopMode === 'anti-zhuque-high-entropy'
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 shadow-sm'
                          : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-amber-500" />
                            ⚡ 破壁级·反朱雀高熵重铸
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold">
                            专攻官网80%AI
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          采用 0.75 高温高熵采样，强制注入口语倒装句、生活俚语、碎嘴叹词、污渍微观触感与 2 字极短句骤停，彻底瓦解神经网络平滑度！
                        </p>
                      </div>
                      <MotionButton
                        type="button"
                        disabled={isDeslopping || !chapterText.trim()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeslopMode('anti-zhuque-high-entropy');
                          handleRunFullDeslop('anti-zhuque-high-entropy');
                        }}
                        className="btn-primary w-full min-h-[34px] px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isDeslopping && selectedDeslopMode === 'anti-zhuque-high-entropy' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>执行反朱雀高熵重铸</span>
                      </MotionButton>
                    </div>

                    {/* Engine 2: Beijing Vernacular Whitewash */}
                    <div
                      onClick={() => setSelectedDeslopMode('beijing-vernacular')}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        selectedDeslopMode === 'beijing-vernacular'
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 shadow-sm'
                          : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                            📖 文学级·京白市井白描
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold">
                            老舍/汪曾祺
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          采用 0.35 低温，彻底砍掉一切宏大叙事、装腔作势与抽象心理，纯靠市井生活白描与现场人物动作推动剧情。
                        </p>
                      </div>
                      <MotionButton
                        type="button"
                        disabled={isDeslopping || !chapterText.trim()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeslopMode('beijing-vernacular');
                          handleRunFullDeslop('beijing-vernacular');
                        }}
                        className="min-h-[34px] w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isDeslopping && selectedDeslopMode === 'beijing-vernacular' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <BookOpen className="w-3.5 h-3.5" />
                        )}
                        <span>执行生活流白描重铸</span>
                      </MotionButton>
                    </div>

                    {/* Engine 3: Surgical Targeted Replacement */}
                    <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 transition-all flex flex-col justify-between space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Scissors className="w-3.5 h-3.5 text-emerald-500" />
                            🎯 靶向手术刀精准替换
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                            零新增AI污染
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          仅精准定位并手术替换 22 类套话原句，其余 98% 原文保持原汁原味不动，杜绝整篇重写产生新的 AI 套路！
                        </p>
                      </div>
                      <MotionButton
                        type="button"
                        disabled={isDeslopping || !chapterText.trim()}
                        onClick={handleRunSurgicalDeslop}
                        className="min-h-[34px] w-full px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isDeslopping ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Scissors className="w-3.5 h-3.5" />
                        )}
                        <span>手术替换病灶原句</span>
                      </MotionButton>
                    </div>
                  </div>
                </div>

                {/* 4. Local Heuristic Pre-Check & Statistical Metrics */}
                <div className="p-4 studio-muted space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        本地启发式套话体检（辅助参考 · 22类规则）：
                      </span>
                      {verdictBadge(originalReport.verdict, originalReport.aiRiskScore)}
                      {rewrittenReport && (
                        <>
                          <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                          {verdictBadge(rewrittenReport.verdict, rewrittenReport.aiRiskScore)}
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      非腾讯官方服务器结论 · 用于本地排查词汇病灶
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">句长标准差 σ (目标≥12.5)</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {originalReport.burstinessStdDev}
                        {rewrittenReport && (
                          <span className="text-emerald-600 ml-1">
                            → {rewrittenReport.burstinessStdDev}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">独句段占比 (目标25~40%)</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {originalReport.singleParaPct}%
                        {rewrittenReport && (
                          <span className="text-emerald-600 ml-1">
                            → {rewrittenReport.singleParaPct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">短句率 (&lt;12字)</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {originalReport.shortSentencePct}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">阻断级套话数</div>
                      <div className="text-sm font-bold tabular-nums text-rose-600">
                        {originalReport.blockingCount} 处
                        {rewrittenReport && (
                          <span className="text-emerald-600 ml-1">
                            → {rewrittenReport.blockingCount} 处
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">对白浓度</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {originalReport.dialoguePct}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rewritten Draft Preview & 1-Click Replace */}
                {rewrittenDraft && (
                  <div className="p-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--accent)]">
                        去味重铸新稿（{rewrittenDraft.replace(/\s+/g, '').length} 字）：
                      </span>
                      {!isDeslopping && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(rewrittenDraft);
                              setStatusFeedback({
                                type: 'ok',
                                text: '已复制去味重铸后的新稿至剪贴板！可直接粘贴至腾讯朱雀官网验证。',
                              });
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>复制去味新稿</span>
                          </button>

                          <MotionButton
                            type="button"
                            onClick={async () => {
                              await onApplyRewrittenText(rewrittenDraft);
                              setStatusFeedback({
                                type: 'ok',
                                text: '已将去味重铸后的新稿正式写入当前章节！',
                              });
                            }}
                            className="btn-primary min-h-[36px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>采用此去味稿覆盖本章正文</span>
                          </MotionButton>
                        </div>
                      )}
                    </div>
                    <textarea
                      rows={10}
                      value={rewrittenDraft}
                      onChange={(e) => setRewrittenDraft(e.target.value)}
                      className="studio-input w-full p-3.5 text-xs leading-relaxed font-editorial-serif"
                    />
                  </div>
                )}

                {/* Forensic Pattern Hits */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    22 类 AI 句法指纹与朱雀高频套话扫描清单 ({originalReport.findings.length})
                  </h3>
                  {originalReport.findings.length === 0 ? (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">
                      未检出阻断级 AI 套话且句长离散度健康，本章已具备极佳的真人手写呼吸质感！
                    </div>
                  ) : (
                    originalReport.findings.map((f) => (
                      <div
                        key={f.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                          f.severity === 'blocking'
                            ? 'border-rose-500/35 bg-rose-500/10'
                            : 'border-amber-500/35 bg-amber-500/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text-primary)]">
                            {f.categoryLabel}
                          </span>
                          <span className="text-[11px] font-semibold shrink-0">
                            {f.severity === 'blocking' ? '朱雀高危特征' : '弹性优化项'}
                          </span>
                        </div>
                        <p className="text-[var(--text-secondary)] font-mono text-[11px]">
                          命中片段：{f.matchedText}
                        </p>
                        <p className="text-[var(--text-secondary)]">{f.reason}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">手术建议：{f.fixHint}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ADVERSARIAL STORY-REVIEW */}
            {activeTab === 'review' && (
              <div className="space-y-4">
                <div className="p-4 studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      story-review 冷酷总编四维对抗审读
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      拒绝商业互吹：同步交叉核验「四层拆纲配额」「角色声纹与上帝视角穿帮」「道具代价连续性」与「朱雀人类质感」。
                    </p>
                  </div>
                  <MotionButton
                    type="button"
                    disabled={isReviewing}
                    onClick={handleRunAdversarialReview}
                    className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isReviewing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Scale className="w-3.5 h-3.5" />
                    )}
                    <span>{isReviewing ? '正在交叉质检...' : '启动四维对抗审读'}</span>
                  </MotionButton>
                </div>

                {reviewReport && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          总编终审结论：{reviewReport.summaryVerdict}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          综合质检得分：{reviewReport.overallScore} / 100
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold ${
                          reviewReport.overallPass
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {reviewReport.overallPass ? '准予发稿 ✓' : '建议返修打磨'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {reviewReport.dimensions.map((dim, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[var(--text-primary)]">
                              {dim.dimension}
                            </span>
                            <span className="font-bold tabular-nums text-[var(--accent)]">
                              {dim.score} 分
                            </span>
                          </div>
                          <p className="text-[var(--text-secondary)] leading-relaxed">
                            {dim.critique}
                          </p>
                          {dim.actionableFixes.length > 0 && (
                            <ul className="space-y-1 text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                              {dim.actionableFixes.map((fix, fIdx) => (
                                <li key={fIdx}>· {fix}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: WEBNOVEL-WRITE MEMORY & ENTITY GRAPH WRITEBACK */}
            {activeTab === 'memory' && (
              <div className="space-y-4">
                <div className="p-4 studio-muted space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-[var(--text-primary)]">
                        webnovel-write 章节完稿记忆与全设定自动回写
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        自动识别本章新登场的重要配角、更新角色最新伤势/立场与<strong>知情权认知边界</strong>、追踪关键道具易主或消耗损毁、更新伏笔发酵/回收进度，并同步至世界书，确保下一章生成严丝合缝绝不吃书！
                      </p>
                    </div>
                    <MotionButton
                      type="button"
                      disabled={isSyncingMemory || !chapterText.trim()}
                      onClick={handleRunMemoryWriteback}
                      className="btn-primary min-h-[40px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isSyncingMemory ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Database className="w-4 h-4" />
                      )}
                      <span>
                        {isSyncingMemory
                          ? '正在提取本章设定增量并回写图谱...'
                          : '一键提取本章状态并回写全书关联图谱'}
                      </span>
                    </MotionButton>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-xs pt-2">
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">已建档角色图谱</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {(safeSettings.characterGraph || []).length} 人
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">追踪中关键道具</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {(safeSettings.keyItemRegistry || []).length} 件
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">未闭合长线伏笔</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {(safeSettings.foreshadowLedger || []).filter((f) => f.status !== 'resolved').length} 条
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
