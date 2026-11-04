import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  FlaskConical,
  Upload,
  Check,
  Trash2,
  Zap,
  SplitSquareVertical,
  Loader2,
  X,
  FileCode2,
} from 'lucide-react';
import {
  ApiConfig,
  DistilledStyleProfile,
  NovelSkill,
  UiSettings,
} from '../types';
import {
  deleteDistilledStyle,
  getDistilledStyles,
  saveDistilledStyle,
  saveGlobalSkill,
} from '../services/db';
import {
  buildStyleDistillationMessages,
  buildStyleTrialComparisonMessages,
  computeStyleQuantitativeMetrics,
  convertDistilledStyleToSkill,
  parseDistilledStyleResponse,
} from '../services/styleDistiller';
import { chatCompletion } from '../services/apiClient';
import { MotionButton } from './MotionPrimitives';

interface StyleDistillationPanelProps {
  activeProfile: DistilledStyleProfile | null;
  onChangeActiveProfile: (profile: DistilledStyleProfile | null) => void;
  legacyStyleReference: string | null;
  onClearLegacyStyleReference: () => void;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onRefreshGlobalSkills?: () => Promise<void>;
}

export const StyleDistillationPanel: React.FC<StyleDistillationPanelProps> = ({
  activeProfile,
  onChangeActiveProfile,
  legacyStyleReference,
  onClearLegacyStyleReference,
  configs,
  uiSettings,
  onRefreshGlobalSkills,
}) => {
  const [vaultProfiles, setVaultProfiles] = useState<DistilledStyleProfile[]>([]);
  const [rawCorpus, setRawCorpus] = useState<string>(legacyStyleReference || '');
  const [customName, setCustomName] = useState('');
  const [sourceAuthor, setSourceAuthor] = useState('');
  const [isDistilling, setIsDistilling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Side-by-side Trial Verification state
  const [trialTopic, setTrialTopic] = useState(
    '深夜茶楼包厢，桌上放着半枚带裂纹的旧玉佩，两人心照不宣却谁都没先捅破窗户纸。'
  );
  const [isRunningTrial, setIsRunningTrial] = useState(false);
  const [trialResult, setTrialResult] = useState<{
    baselineSlop: string;
    distilledOutput: string;
    craftDiffNote: string;
  } | null>(null);

  useEffect(() => {
    getDistilledStyles().then(setVaultProfiles).catch(() => {});
  }, []);

  const liveMetrics = useMemo(() => computeStyleQuantitativeMetrics(rawCorpus), [rawCorpus]);

  const getActiveApi = () => {
    const cfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  const handleImportSampleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setRawCorpus(text.slice(0, 12000));
      if (!customName.trim()) {
        setCustomName(file.name.replace(/\.(txt|md)$/i, '') + ' · 蒸馏文风');
      }
      setStatusMsg({ type: 'ok', text: `已载入样本《${file.name}》（截取前 ${Math.min(12000, text.length)} 字用于指纹测算）` });
    } catch (err: any) {
      setStatusMsg({ type: 'err', text: `读取文件失败：${err.message}` });
    } finally {
      e.target.value = '';
    }
  };

  const handleDistillCorpus = async () => {
    const cleanText = rawCorpus.trim();
    if (cleanText.length < 120) {
      setStatusMsg({
        type: 'err',
        text: '请至少粘贴 120 字以上的代表性段落（推荐 600~4000 字），以便准确计算句长标准差 σ 与呼吸指纹。',
      });
      return;
    }

    setIsDistilling(true);
    setStatusMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildStyleDistillationMessages({
        rawCorpus: cleanText,
        customProfileName: customName,
        sourceAuthor,
        metrics: liveMetrics,
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.55,
      });

      const distilled = parseDistilledStyleResponse({
        rawResponse: res.content,
        rawCorpus: cleanText,
        metrics: liveMetrics,
        fallbackName: customName || '自定义蒸馏文风 DNA',
        sourceAuthor,
      });

      const updatedVault = await saveDistilledStyle(distilled);
      setVaultProfiles(updatedVault);
      onChangeActiveProfile(distilled);
      if (legacyStyleReference) {
        onClearLegacyStyleReference();
      }
      setStatusMsg({
        type: 'ok',
        text: `已成功完成去剧情化蒸馏并挂载《${distilled.name}》（已存入全局蒸馏资产库，所有小说可复用）！`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'err', text: `文风蒸馏失败：${err.message}` });
    } finally {
      setIsDistilling(false);
    }
  };

  const handleExportToSkillHub = async (profile: DistilledStyleProfile) => {
    try {
      const newSkill: NovelSkill = convertDistilledStyleToSkill(profile);
      await saveGlobalSkill(newSkill);
      if (onRefreshGlobalSkills) {
        await onRefreshGlobalSkills();
      }
      setStatusMsg({
        type: 'ok',
        text: `已将《${profile.name}》同步转化为全局 SKILL 2.0 规范包，可在引擎与技能中心跨书调配或导出！`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'err', text: `导出到技能中心失败：${err.message}` });
    }
  };

  const handleRunTrialComparison = async () => {
    if (!activeProfile) return;
    setIsRunningTrial(true);
    setTrialResult(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildStyleTrialComparisonMessages({
        profile: activeProfile,
        sceneTopic: trialTopic,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.75,
      });

      const cleaned = res.content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      if (s !== -1 && e !== -1) {
        const parsed = JSON.parse(cleaned.slice(s, e + 1));
        setTrialResult({
          baselineSlop: String(parsed.baselineSlop || ''),
          distilledOutput: String(parsed.distilledOutput || ''),
          craftDiffNote: String(parsed.craftDiffNote || ''),
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'err', text: `试笔对比失败：${err.message}` });
    } finally {
      setIsRunningTrial(false);
    }
  };

  return (
    <div className="space-y-5 pt-4 border-t border-[var(--border-subtle)]">
      {/* Header Explanation */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              文风蒸馏工坊（Style Distillation · 替代传统原文粘贴模仿）
            </h3>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            传统“粘贴一段原文模仿”极易导致大模型生硬照抄样本里的人名、招式或剧情。<strong>文风蒸馏</strong>通过本地量化句法测算（句长离散度 σ、短长句配比、独句留白率）+ AI 去名化基因提炼，只萃取纯粹的镜头机位、断句呼吸与五感颗粒度。
          </p>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusMsg.type === 'err'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="p-1 rounded hover:bg-black/5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Currently Mounted Distilled Style DNA Card */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-primary)]">本书当前挂载的文风蒸馏 DNA：</span>
            {activeProfile ? (
              <span className="text-xs font-semibold text-[var(--accent)]">
                《{activeProfile.name}》
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">暂未挂载（可从下方资产库一键选用或现场投喂蒸馏）</span>
            )}
          </div>

          {activeProfile && (
            <div className="flex flex-wrap items-center gap-2">
              <MotionButton
                type="button"
                onClick={() => handleExportToSkillHub(activeProfile)}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>转为全局 SKILL 规范包</span>
              </MotionButton>
              <MotionButton
                type="button"
                onClick={() => onChangeActiveProfile(null)}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-rose-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                卸下本书挂载
              </MotionButton>
            </div>
          )}
        </div>

        {activeProfile && (
          <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
            {/* Quantitative Fingerprint Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-2.5 studio-muted">
                <div className="text-[11px] text-[var(--text-muted)]">平均句长</div>
                <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {activeProfile.metrics.avgSentenceLen} 字
                </div>
              </div>
              <div className="p-2.5 studio-muted">
                <div className="text-[11px] text-[var(--text-muted)]">句长离散度 σ</div>
                <div className="text-sm font-bold tabular-nums text-[var(--accent)]">
                  {activeProfile.metrics.sentenceLenStdDev}
                </div>
              </div>
              <div className="p-2.5 studio-muted">
                <div className="text-[11px] text-[var(--text-muted)]">短/中/长句比</div>
                <div className="text-xs font-bold tabular-nums text-[var(--text-primary)] pt-0.5">
                  {activeProfile.metrics.shortRatio}% / {activeProfile.metrics.mediumRatio}% / {activeProfile.metrics.longRatio}%
                </div>
              </div>
              <div className="p-2.5 studio-muted">
                <div className="text-[11px] text-[var(--text-muted)]">独句留白段率</div>
                <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {activeProfile.metrics.singleSentenceParaRatio}%
                </div>
              </div>
              <div className="p-2.5 studio-muted">
                <div className="text-[11px] text-[var(--text-muted)]">对白浓度</div>
                <div className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {activeProfile.metrics.dialogueRatio}%
                </div>
              </div>
            </div>

            {/* Qualitative 6-Dimension Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 studio-muted space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">1. 叙事机位与冷暖腔调</div>
                <p className="text-[var(--text-secondary)] leading-relaxed">{activeProfile.narrativeVoice}</p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">2. 句法错落与断句呼吸</div>
                <p className="text-[var(--text-secondary)] leading-relaxed">{activeProfile.sentenceCadence}</p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">3. 五感切入与器物投射</div>
                <p className="text-[var(--text-secondary)] leading-relaxed">{activeProfile.sensorySignature}</p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">4. 对白潜台词与词汇力度</div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {activeProfile.dialogueCraft} {activeProfile.lexicalFeatures}
                </p>
              </div>
            </div>

            {/* Editable Executable Directive */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                注入写作引擎的高权重蒸馏契约（支持手动微调，自动随本书设定保存）：
              </label>
              <textarea
                rows={4}
                value={activeProfile.executableDirective}
                onChange={(e) => {
                  const updated = { ...activeProfile, executableDirective: e.target.value };
                  onChangeActiveProfile(updated);
                }}
                className="studio-input w-full p-3 text-xs leading-relaxed font-mono"
              />
            </div>

            {/* 1-Click Trial Comparison ("同题试笔验风") */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <SplitSquareVertical className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    同题试笔验风（对比普通 AI 腔 vs 蒸馏 DNA 实写效果）
                  </span>
                </div>
                <MotionButton
                  type="button"
                  disabled={isRunningTrial}
                  onClick={handleRunTrialComparison}
                  className="btn-primary min-h-[36px] px-3.5 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isRunningTrial ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>{isRunningTrial ? '正在同题试笔...' : '立即同题试笔验风'}</span>
                </MotionButton>
              </div>

              <input
                type="text"
                value={trialTopic}
                onChange={(e) => setTrialTopic(e.target.value)}
                placeholder="输入任意一句话测试场景命题..."
                className="studio-input w-full px-3 py-2 text-xs"
              />

              {trialResult && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
                      <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                        对照组 · 未蒸馏普通 AI 腔
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                        {trialResult.baselineSlop}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-surface)] space-y-1.5">
                      <div className="text-[11px] font-semibold text-[var(--accent)]">
                        实验组 · 挂载《{activeProfile.name}》蒸馏实写
                      </div>
                      <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-editorial-serif">
                        {trialResult.distilledOutput}
                      </p>
                    </div>
                  </div>
                  {trialResult.craftDiffNote && (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      <strong>笔法兑现核验：</strong>
                      {trialResult.craftDiffNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Global Distilled Style Vault */}
      {vaultProfiles.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              全局文风蒸馏资产库（{vaultProfiles.length} 份可跨书复用 DNA）
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">点击卡片即可一键挂载到当前小说</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vaultProfiles.map((prof) => {
              const isMounted = activeProfile?.id === prof.id;
              return (
                <div
                  key={prof.id}
                  onClick={() => onChangeActiveProfile(prof)}
                  className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                    isMounted
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {prof.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isMounted && (
                          <span className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> 已挂载
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const next = await deleteDistilledStyle(prof.id);
                            setVaultProfiles(next);
                            if (activeProfile?.id === prof.id) {
                              onChangeActiveProfile(null);
                            }
                          }}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-rose-600"
                          title="从资产库删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      均句长 {prof.metrics.avgSentenceLen}字 · 离散度 σ={prof.metrics.sentenceLenStdDev} · 短句 {prof.metrics.shortRatio}% · 独句段 {prof.metrics.singleSentenceParaRatio}%
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {prof.narrativeVoice}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Distill New Sample Corpus */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              投喂新样本语料 · 提取专属蒸馏文风 DNA
            </h4>
            <p className="text-[11px] text-[var(--text-muted)]">
              粘贴您欣赏的任意名家或大神章节片段（推荐 600~5000 字），系统将自动剥离人名剧情，蒸馏出纯文笔基因。
            </p>
          </div>
          <label className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span>导入 .txt / .md 语料</span>
            <input
              type="file"
              accept=".txt,.md"
              onChange={handleImportSampleFile}
              className="hidden"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              蒸馏资产命名（可选，留空由 AI 自动提炼流派名）
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="例：猫腻式疏朗余韵风 / 冷硬悬疑短句流"
              className="studio-input w-full px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              原样本风格参考备注（可选，仅辅助流派识别，绝不写入抄袭指令）
            </label>
            <input
              type="text"
              value={sourceAuthor}
              onChange={(e) => setSourceAuthor(e.target.value)}
              placeholder="例：硬派古风权谋 / 克制现实主义"
              className="studio-input w-full px-3 py-2 text-xs"
            />
          </div>
        </div>

        <textarea
          rows={6}
          value={rawCorpus}
          onChange={(e) => setRawCorpus(e.target.value)}
          placeholder="在此粘贴 600~5000 字的目标文笔样本段落。下方将实时计算该语料的句长标准差 σ、短中长句结构与独句留白比例..."
          className="studio-input w-full p-3.5 text-xs leading-relaxed"
        />

        {/* Real-time Quantitative Fingerprint Preview */}
        {liveMetrics.charCount > 0 && (
          <div className="p-3 studio-muted flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums text-[var(--text-secondary)]">
              <span>语料字数：<strong>{liveMetrics.charCount}</strong> 字 ({liveMetrics.sentenceCount} 句)</span>
              <span>平均句长：<strong>{liveMetrics.avgSentenceLen}</strong> 字</span>
              <span>
                Burstiness σ：<strong className="text-[var(--accent)]">{liveMetrics.sentenceLenStdDev}</strong>
              </span>
              <span>
                短/中/长句：<strong>{liveMetrics.shortRatio}% / {liveMetrics.mediumRatio}% / {liveMetrics.longRatio}%</strong>
              </span>
              <span>独句段占比：<strong>{liveMetrics.singleSentenceParaRatio}%</strong></span>
              <span>对白率：<strong>{liveMetrics.dialogueRatio}%</strong></span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {rawCorpus && (
            <button
              type="button"
              onClick={() => setRawCorpus('')}
              className="min-h-[38px] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap"
            >
              清空样本框
            </button>
          )}
          <MotionButton
            type="button"
            disabled={isDistilling || rawCorpus.trim().length < 120}
            onClick={handleDistillCorpus}
            className="btn-primary min-h-[42px] px-5 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isDistilling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isDistilling ? '正在剥离剧情并萃取文风 DNA...' : '开始深度蒸馏文风 DNA 并挂载'}</span>
          </MotionButton>
        </div>
      </div>
    </div>
  );
};
