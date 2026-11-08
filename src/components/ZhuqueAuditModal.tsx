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
} from 'lucide-react';
import {
  AdversarialStoryReviewReport,
  ApiConfig,
  BookSettings,
  UiSettings,
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
  const [rewrittenDraft, setRewrittenDraft] = useState<string>('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewReport, setReviewReport] = useState<AdversarialStoryReviewReport | null>(null);
  const [isSyncingMemory, setIsSyncingMemory] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const originalReport = useMemo(() => analyzeTextForZhuque(chapterText), [chapterText]);
  const rewrittenReport = useMemo(
    () => (rewrittenDraft.trim() ? analyzeTextForZhuque(rewrittenDraft) : null),
    [rewrittenDraft]
  );

  if (!isOpen) return null;

  const getActiveApi = () => {
    const cfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  const [deslopMode, setDeslopMode] = useState<'surgical' | 'full'>('surgical');

  // Mode A: Surgical Targeted Replacement (Zero New AI Contamination)
  const handleRunSurgicalDeslop = async () => {
    if (!chapterText.trim()) return;
    const dirtySentences = findSurgicalSentences(chapterText);
    if (dirtySentences.length === 0) {
      setStatusFeedback({
        type: 'ok',
        text: '当前章节未检出阻断级 AI 套话句子，正文极为纯净！如需进一步增强突发度，可选用「全章白描降温重铸」。',
      });
      return;
    }

    setIsDeslopping(true);
    setRewrittenDraft('');
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const charVoiceNotes = (settings.characterGraph || [])
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
        distilledStyle: settings.activeDistilledStyle,
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

  // Mode B: Full-chapter Grounded Whitewash Deslop (Low Temp 0.35)
  const handleRunFullDeslop = async () => {
    if (!chapterText.trim()) return;
    setIsDeslopping(true);
    setRewrittenDraft('');
    setStatusFeedback(null);
    try {
      const { cfg, model } = getActiveApi();
      const charVoiceNotes = (settings.characterGraph || [])
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
        distilledStyle: settings.activeDistilledStyle,
        characterSpeechNotes: charVoiceNotes,
      });

      let acc = '';
      const res = await streamChatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.35, // Drastically reduced from 0.78 to prevent hallucinated AI flourishes!
        onChunk: (chunk) => {
          acc += chunk;
          setRewrittenDraft(acc);
        },
      });
      const finalOut = (res.content || acc).trim();
      setRewrittenDraft(finalOut);
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: `全章白描重铸失败：${err.message}` });
    } finally {
      setIsDeslopping(false);
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
        settings,
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
        settings,
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
        settings,
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
          朱雀过审安全区 ({score}%)
        </span>
      );
    }
    if (verdict === 'borderline') {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold tabular-nums">
          临界观察区 ({score}% · 建议去味)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs font-bold tabular-nums">
        高危 AIGC 拦截区 ({score}%)
      </span>
    );
  };

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
                {/* Genuine Forensic Transparency Callout */}
                <div className="p-3.5 rounded-xl border border-blue-500/25 bg-blue-500/10 text-xs text-blue-900 dark:text-blue-200 leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-blue-800 dark:text-blue-300">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>启发式 AI 痕迹排查与语感体检 (本地算法引擎)</span>
                  </div>
                  <p className="text-[11px] opacity-90">{ZHUQUE_AUDIT_TRANSPARENCY_NOTE}</p>
                </div>

                {/* Metrics Dashboard */}
                <div className="p-4 studio-muted space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        章节 AI 痕迹浓度预检：
                      </span>
                      {verdictBadge(originalReport.verdict, originalReport.aiRiskScore)}
                      {rewrittenReport && (
                        <>
                          <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                          {verdictBadge(rewrittenReport.verdict, rewrittenReport.aiRiskScore)}
                        </>
                      )}
                    </div>

                    {/* Dual Action Controls: Surgical (Zero Contamination) vs Full Chapter (Low-Temp) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <MotionButton
                        type="button"
                        disabled={isDeslopping || !chapterText.trim()}
                        onClick={handleRunSurgicalDeslop}
                        className="btn-primary min-h-[38px] px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        title="仅精准替换命中的几处 AI 套话原句，其余 98% 原文保持原汁原味，杜绝全文重铸引入新的 AI 痕迹"
                      >
                        {isDeslopping ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isDeslopping ? '正在手术替换...' : '靶向手术刀替换 (推荐 · 零新增AI味)'}
                        </span>
                      </MotionButton>

                      <MotionButton
                        type="button"
                        disabled={isDeslopping || !chapterText.trim()}
                        onClick={handleRunFullDeslop}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        title="采用老舍/汪曾祺生活大白话白描，低温0.35全章降温重铸"
                      >
                        <span>全章白描重铸 (低温0.35)</span>
                      </MotionButton>
                    </div>
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
                        story-deslop 人类化重铸新稿（{rewrittenDraft.replace(/\s+/g, '').length} 字）：
                      </span>
                      {!isDeslopping && (
                        <MotionButton
                          type="button"
                          onClick={async () => {
                            await onApplyRewrittenText(rewrittenDraft);
                            setStatusFeedback({
                              type: 'ok',
                              text: '已将去味重铸后的朱雀过审稿正式写入当前章节！',
                            });
                          }}
                          className="btn-primary min-h-[36px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>采用此去味稿覆盖本章正文</span>
                        </MotionButton>
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
                        {(settings.characterGraph || []).length} 人
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">追踪中关键道具</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {(settings.keyItemRegistry || []).length} 件
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[11px] text-[var(--text-muted)]">未闭合长线伏笔</div>
                      <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                        {(settings.foreshadowLedger || []).filter((f) => f.status !== 'resolved').length} 条
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
