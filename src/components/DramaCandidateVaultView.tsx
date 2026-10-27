import React, { useState, useMemo } from 'react';
import {
  FolderArchive,
  Search,
  Sparkles,
  ArrowRight,
  Trash2,
  Eye,
  Copy,
  Check,
  X,
  UserCheck,
  Flame,
  CheckCircle2,
  ArrowLeft,
  Download,
  Upload,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DramaCandidatePlan,
  DramaProject,
  HOT_DRAMA_TRACKS,
} from '../types';
import { inferCharacterTier } from '../services/dramaPromptEngine';
import { generateUUID } from '../utils/uuid';
import {
  ModalPortal,
  MotionButton,
  StaggerCard,
  SPRING_INDICATOR,
} from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

/**
 * Converts an archived AI candidate pitch plan into a formal DramaProject
 * ready for asset extraction & episode scriptwriting.
 */
export function convertCandidateToDramaProject(candidate: DramaCandidatePlan): DramaProject {
  const now = Date.now();
  const matchedTrack =
    HOT_DRAMA_TRACKS.find((t) => t.id === candidate.trackId) || HOT_DRAMA_TRACKS[0];

  const seededCharacters = (candidate.seedCharacters || []).map((c, idx) => ({
    id: generateUUID(),
    name: c.name,
    tier: c.tier || inferCharacterTier(c.roleTag, idx),
    roleTag: c.roleTag,
    firstAppearanceEp: c.firstAppearanceEp || 1,
    ageAndArchetype: c.ageAndArchetype,
    appearanceZh: c.appearanceZh,
    visualPromptEn: c.visualPromptEn,
    voicePersona: c.voicePersona,
    signatureTrait: c.signatureTrait,
    epistemicNote: c.epistemicNote,
  }));

  const seededForeshadows = (candidate.foreshadowingLedger || []).map((f) => ({
    ...f,
    id: generateUUID(),
  }));

  const seededStoryArcs = (candidate.storyArcs || []).map((arc) => ({
    ...arc,
    id: generateUUID(),
  }));

  const seededPlotRhythm = (candidate.plotRhythm || []).map((pt) => ({
    ...pt,
    id: generateUUID(),
  }));

  const seededKeyProps = (candidate.keyPropManifest || []).map((kp) => ({
    ...kp,
    id: generateUUID(),
  }));

  return {
    id: generateUUID(),
    title: candidate.title,
    createdAt: now,
    lastModifiedAt: now,
    trackId: matchedTrack.id,
    trackName: candidate.trackName || matchedTrack.name,
    channel: candidate.channel || matchedTrack.channel,
    visualStyle: candidate.visualStyle || matchedTrack.visualStyleRecommend,
    aspectRatio: candidate.aspectRatio || '9:16 竖屏短剧',
    preferredScriptFormat: 'triangle_standard',
    episodeDurationSec: candidate.episodeDurationSec || 90,
    totalPlannedEpisodes: candidate.totalPlannedEpisodes || 60,
    paywallEpisodeIndex: candidate.paywallEpisodeIndex || 10,
    logline: candidate.logline,
    targetAudience: candidate.targetAudience || matchedTrack.targetAudience,
    golden3SecHook: candidate.golden3SecHook,
    synopsis: candidate.synopsis,
    narrativeBible: candidate.narrativeBible ? { ...candidate.narrativeBible } : undefined,
    storyArcs: seededStoryArcs,
    plotRhythm: seededPlotRhythm,
    keyPropManifest: seededKeyProps,
    foreshadowingLedger: seededForeshadows,
    characterAssets: seededCharacters,
    sceneAnchors: [],
    episodePlan: [],
    episodes: [],
  };
}

interface DramaCandidateDetailModalProps {
  candidate: DramaCandidatePlan | null;
  onClose: () => void;
  onPromote: (candidate: DramaCandidatePlan) => void;
  onDelete: (id: string) => void;
}

export const DramaCandidateDetailModal: React.FC<DramaCandidateDetailModalProps> = ({
  candidate,
  onClose,
  onPromote,
  onDelete,
}) => {
  const [copiedFlag, setCopiedFlag] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!candidate) return null;

  const handleCopyFullPlan = () => {
    const charsText = (candidate.seedCharacters || [])
      .map(
        (c) =>
          `- ${c.name}（${c.roleTag} · ${c.ageAndArchetype}）\n  中文立绘词：${c.appearanceZh}\n  英文Tag：${c.visualPromptEn}`
      )
      .join('\n');

    const nb = candidate.narrativeBible;
    const bibleText = nb
      ? [
          nb.storylineOverview ? `- 故事线脉络：${nb.storylineOverview}` : '',
          nb.mainPlotline ? `- 核心主线：${nb.mainPlotline}` : '',
          nb.subPlotlines ? `- 副线支线：${nb.subPlotlines}` : '',
          nb.frameworkStructure ? `- 分幕框架：${nb.frameworkStructure}` : '',
          nb.pacingStrategy ? `- 剧情节奏：${nb.pacingStrategy}` : '',
          nb.worldSettingAndRules ? `- 底层规则：${nb.worldSettingAndRules}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const fullMd = [
      `# 备选漫剧项目计划：《${candidate.title}》`,
      `方向定位：${candidate.directionTag}`,
      `频道赛道：${candidate.channel} · ${candidate.trackName}`,
      `视觉规格：${candidate.visualStyle} · ${candidate.aspectRatio} · 单集 ${candidate.episodeDurationSec || 90} 秒 · 规划 ${candidate.totalPlannedEpisodes || 60} 集 · 第 ${candidate.paywallEpisodeIndex} 集付费卡点`,
      candidate.totalEpisodesReason ? `集数测算依据：${candidate.totalEpisodesReason}` : '',
      candidate.userPromptOrSpark ? `原始构想：${candidate.userPromptOrSpark}` : '',
      candidate.selectedSiblingTitle ? `同批次当时立项：《${candidate.selectedSiblingTitle}》` : '',
      '',
      `## 一句话商业卖点`,
      candidate.logline,
      '',
      `## 首集黄金前 3 秒生死钩子`,
      candidate.golden3SecHook,
      '',
      charsText ? `## 预置核心角色与立绘设定\n${charsText}\n` : '',
      bibleText ? `## 全剧叙事架构圣经\n${bibleText}\n` : '',
      `## 三阶段商业大纲`,
      candidate.synopsis,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard?.writeText(fullMd);
    setCopiedFlag(true);
    setTimeout(() => setCopiedFlag(false), 1600);
  };

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-3xl max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          {/* Sticky Header */}
          <div className="px-5 py-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)] tabular-nums">
                <span className="font-semibold text-[var(--accent)]">{candidate.directionTag}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {candidate.channel} · {candidate.trackName}
                </span>
                <span aria-hidden="true">·</span>
                <span>{candidate.visualStyle}</span>
                <span aria-hidden="true">·</span>
                <span>{candidate.aspectRatio.split(' ')[0]}</span>
                <span aria-hidden="true">·</span>
                <span>单集 {candidate.episodeDurationSec || 90}s</span>
                <span aria-hidden="true">·</span>
                <span>共 {candidate.totalPlannedEpisodes || 60} 集</span>
                <span aria-hidden="true">·</span>
                <span>第 {candidate.paywallEpisodeIndex} 集付费点</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-editorial-serif truncate">
                《{candidate.title}》
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                备份于 {new Date(candidate.createdAt).toLocaleString()}
                {candidate.selectedSiblingTitle
                  ? ` · 同批已选《${candidate.selectedSiblingTitle}》后自动归档`
                  : ''}
                {candidate.adoptedAt
                  ? ` · 已于 ${new Date(candidate.adoptedAt).toLocaleDateString()} 转正立项`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭弹窗"
              className="min-h-[42px] px-3 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 sm:hidden" />
              <X className="w-4 h-4 hidden sm:block" />
              <span className="sm:hidden">返回</span>
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs sm:text-sm leading-relaxed">
            {/* Origin Context */}
            {candidate.userPromptOrSpark && (
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 space-y-1">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  当时的模糊构想 / 选品灵感记录
                </div>
                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                  {candidate.userPromptOrSpark}
                </p>
              </div>
            )}

            {/* Market Trend & Consultant Advice if available */}
            {(candidate.marketTrendAnalysis || candidate.consultantReply || candidate.marketFitReason) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                {candidate.marketTrendAnalysis && (
                  <div className="p-3.5 rounded-xl studio-muted space-y-1">
                    <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>当季市场热度诊断</span>
                    </div>
                    <p className="text-[var(--text-secondary)] whitespace-pre-line">
                      {candidate.marketTrendAnalysis}
                    </p>
                  </div>
                )}
                {(candidate.marketFitReason || candidate.consultantReply) && (
                  <div className="p-3.5 rounded-xl studio-muted space-y-1">
                    <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>本方案爆款切口与定位</span>
                    </div>
                    {candidate.marketFitReason && (
                      <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {candidate.marketFitReason}
                      </p>
                    )}
                    {candidate.consultantReply && (
                      <p className="text-[var(--text-secondary)] whitespace-pre-line">
                        {candidate.consultantReply}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Logline & Golden 3s Hook */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">一句话商业卖点 (Logline)</h4>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">{candidate.logline}</p>
                {candidate.targetAudience && (
                  <p className="text-[11px] text-[var(--text-muted)] pt-1">
                    目标受众：{candidate.targetAudience}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-xl studio-muted space-y-1.5">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  ⚡ 开篇第 1 集黄金前 3 秒生死钩子
                </h4>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  {candidate.golden3SecHook}
                </p>
              </div>
            </div>

            {/* Pre-seeded Character Visual Assets */}
            {candidate.seedCharacters && candidate.seedCharacters.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[var(--accent)]" />
                  <span>预置核心角色人设与固定立绘词 ({candidate.seedCharacters.length} 人)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {candidate.seedCharacters.map((ch, idx) => (
                    <div
                      key={ch.id || idx}
                      className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{ch.name}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">{ch.roleTag}</span>
                      </div>
                      <p className="text-[var(--text-secondary)] font-medium">{ch.ageAndArchetype}</p>
                      {ch.appearanceZh && (
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                          <strong className="text-[var(--text-secondary)]">中文立绘：</strong>
                          {ch.appearanceZh}
                        </p>
                      )}
                      {ch.visualPromptEn && (
                        <p className="text-[11px] font-mono text-[var(--text-muted)] break-words">
                          {ch.visualPromptEn}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Narrative Architecture Bible & Foreshadowing Seeds if available */}
            {candidate.narrativeBible &&
              (candidate.narrativeBible.mainPlotline ||
                candidate.narrativeBible.subPlotlines ||
                candidate.narrativeBible.frameworkStructure) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    全剧叙事架构圣经（主支线 · 分幕框架 · 节奏与底层规则）
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {candidate.narrativeBible.mainPlotline && (
                      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-1">
                        <span className="font-bold text-[var(--text-primary)]">核心主线：</span>
                        <p className="text-[var(--text-secondary)]">{candidate.narrativeBible.mainPlotline}</p>
                      </div>
                    )}
                    {candidate.narrativeBible.subPlotlines && (
                      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-1">
                        <span className="font-bold text-[var(--text-primary)]">副线支线：</span>
                        <p className="text-[var(--text-secondary)]">{candidate.narrativeBible.subPlotlines}</p>
                      </div>
                    )}
                    {candidate.narrativeBible.frameworkStructure && (
                      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-1">
                        <span className="font-bold text-[var(--text-primary)]">分幕框架结构：</span>
                        <p className="text-[var(--text-secondary)]">{candidate.narrativeBible.frameworkStructure}</p>
                      </div>
                    )}
                    {candidate.narrativeBible.pacingStrategy && (
                      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-1">
                        <span className="font-bold text-[var(--text-primary)]">剧情节奏策略：</span>
                        <p className="text-[var(--text-secondary)]">{candidate.narrativeBible.pacingStrategy}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* 3-Stage Commercial Synopsis */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                全剧三阶段商业大纲（免费留存期 → 付费卡点大钩子 → 主线高潮）
              </h4>
              <div className="p-4 rounded-xl studio-muted text-xs sm:text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
                {candidate.synopsis}
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-5 py-3.5 sm:px-6 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyFullPlan}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {copiedFlag ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedFlag ? '已复制企划' : '复制完整企划'}</span>
              </button>

              {confirmDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(candidate.id);
                    onClose();
                  }}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  确认移除备份
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[42px] px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>移除</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] whitespace-nowrap cursor-pointer"
              >
                关闭阅览
              </button>
              <MotionButton
                type="button"
                onClick={() => {
                  onPromote(candidate);
                  onClose();
                }}
                className="btn-primary min-h-[42px] px-5 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>{candidate.adoptedAt ? '再次以此方案新建漫剧' : '以此备选方案正式立项'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </MotionButton>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

interface DramaCandidateVaultSectionProps {
  candidates: DramaCandidatePlan[];
  onPromoteCandidate: (candidate: DramaCandidatePlan) => void;
  onDeleteCandidate: (id: string) => void;
  onGoToConsultant?: () => void;
  onOpenBackupRestore?: (mode: 'backup' | 'restore') => void;
}

export const DramaCandidateVaultSection: React.FC<DramaCandidateVaultSectionProps> = ({
  candidates,
  onPromoteCandidate,
  onDeleteCandidate,
  onGoToConsultant,
  onOpenBackupRestore,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'adopted'>('all');
  const [inspectingCandidate, setInspectingCandidate] = useState<DramaCandidatePlan | null>(null);

  const pendingCount = useMemo(
    () => candidates.filter((c) => !c.adoptedAt).length,
    [candidates]
  );
  const adoptedCount = useMemo(
    () => candidates.filter((c) => Boolean(c.adoptedAt)).length,
    [candidates]
  );

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        if (statusFilter === 'pending' && c.adoptedAt) return false;
        if (statusFilter === 'adopted' && !c.adoptedAt) return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.logline.toLowerCase().includes(q) ||
          c.visualStyle.toLowerCase().includes(q) ||
          c.trackName.toLowerCase().includes(q) ||
          (c.userPromptOrSpark || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [candidates, searchQuery, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Directory Info Banner & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 studio-muted overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: `全部备选 (${candidates.length})` },
            { id: 'pending', label: `待立项储备 (${pendingCount})` },
            { id: 'adopted', label: `已转正立项 (${adoptedCount})` },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as 'all' | 'pending' | 'adopted')}
                className={`relative min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors tabular-nums ${
                  active
                    ? 'text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="candidate-vault-status-pill"
                    transition={SPRING_INDICATOR}
                    className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenBackupRestore && (
            <>
              <MotionButton
                type="button"
                onClick={() => onOpenBackupRestore('backup')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>备份导出（全选/单选）</span>
              </MotionButton>
              <MotionButton
                type="button"
                onClick={() => onOpenBackupRestore('restore')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>导入恢复</span>
              </MotionButton>
            </>
          )}

          <div className="relative sm:w-64 flex-1 sm:flex-initial">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索备选剧名、原始构想或画风..."
              className="studio-input w-full min-h-[42px] pl-9 pr-3.5 py-2 text-xs sm:text-sm"
            />
          </div>
        </div>
      </div>

      {filteredCandidates.length === 0 ? (
        <div className="studio-card p-10 sm:p-12 text-center space-y-3.5">
          <div className="w-12 h-12 mx-auto rounded-2xl studio-muted flex items-center justify-center text-[var(--text-muted)]">
            <FolderArchive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {candidates.length === 0 ? '备选项目计划目录暂无存档' : '没有匹配的备选项目计划'}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed">
              当您在「模糊构想 · AI 立项探讨」或「热门赛道三连孵化」中选择其中 1 个方案立项时，另外 2 个未选中的建议方案会自动归档保存在此目录，方便日后随时回顾、阅览详情与重新立项制作。
            </p>
          </div>
          {onGoToConsultant && candidates.length === 0 && (
            <div className="pt-1">
              <MotionButton
                type="button"
                onClick={onGoToConsultant}
                className="btn-primary min-h-[42px] px-5 py-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>前往与 AI 探讨构想并生成立项方案</span>
              </MotionButton>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {filteredCandidates.map((cand, idx) => (
            <StaggerCard
              key={cand.id}
              index={idx}
              onContextMenu={(e) =>
                openContextMenu(
                  e,
                  [
                    {
                      id: 'cand-view',
                      label: '阅览完整备选企划与立绘设定',
                      icon: <Eye className="w-3.5 h-3.5" />,
                      onSelect: () => setInspectingCandidate(cand),
                    },
                    {
                      id: 'cand-promote',
                      label: cand.adoptedAt ? '再次以此方案立项新漫剧' : '以此备选方案正式立项',
                      icon: <ArrowRight className="w-3.5 h-3.5" />,
                      onSelect: () => onPromoteCandidate(cand),
                    },
                    {
                      id: 'cand-copy',
                      label: '复制卖点与商业大纲',
                      icon: <Copy className="w-3.5 h-3.5" />,
                      dividerBefore: true,
                      onSelect: () => {
                        navigator.clipboard?.writeText(
                          `《${cand.title}》（${cand.directionTag}）\n卖点：${cand.logline}\n黄金前3秒：${cand.golden3SecHook}\n大纲：\n${cand.synopsis}`
                        );
                        triggerQuickToast(`已复制备选方案《${cand.title}》`);
                      },
                    },
                    {
                      id: 'cand-del',
                      label: '从备选目录移除',
                      icon: <Trash2 className="w-3.5 h-3.5" />,
                      danger: true,
                      dividerBefore: true,
                      onSelect: () => onDeleteCandidate(cand.id),
                    },
                  ],
                  `备选计划 · 《${cand.title}》`
                )
              }
            >
              <article
                onClick={() => setInspectingCandidate(cand)}
                className="studio-card studio-card-hover p-5 sm:p-6 h-full flex flex-col justify-between gap-4 group cursor-pointer"
              >
                <div className="space-y-3">
                  {/* Metadata Line */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <span className="font-semibold text-[var(--accent)]">{cand.directionTag}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {cand.channel} · {cand.trackName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{cand.visualStyle}</span>
                      </div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors font-editorial-serif line-clamp-1">
                        《{cand.title}》
                      </h3>
                    </div>

                    {cand.adoptedAt ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>已立项</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums shrink-0">
                        第 {cand.paywallEpisodeIndex} 集付费点
                      </span>
                    )}
                  </div>

                  {/* Original Fuzzy Idea Context */}
                  {cand.userPromptOrSpark && (
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                      源自构想：“{cand.userPromptOrSpark}”
                      {cand.selectedSiblingTitle ? `（当时优先立项《${cand.selectedSiblingTitle}》）` : ''}
                    </p>
                  )}

                  {/* Logline */}
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {cand.logline}
                  </p>

                  {/* Golden 3s Hook */}
                  {cand.golden3SecHook && (
                    <div className="p-3 rounded-xl studio-muted text-xs space-y-1">
                      <span className="font-semibold text-[var(--text-primary)]">⚡ 黄金前3秒：</span>
                      <p className="text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                        {cand.golden3SecHook}
                      </p>
                    </div>
                  )}

                  {/* Bottom Telemetry */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-muted)] tabular-nums">
                    <span>
                      {cand.sourceType === 'fuzzy-consultant' ? 'AI 模糊构想探讨归档' : '赛道三连孵化归档'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>预置角色 {cand.seedCharacters?.length || 0} 人</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(cand.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Action Footer */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pt-3.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setInspectingCandidate(cand)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>阅览完整企划</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCandidate(cand.id)}
                      title="从备选目录移除"
                      className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <MotionButton
                    type="button"
                    onClick={() => onPromoteCandidate(cand)}
                    className="btn-primary min-h-[40px] px-4 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{cand.adoptedAt ? '再次立项' : '一键正式立项'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </MotionButton>
                </div>
              </article>
            </StaggerCard>
          ))}
        </div>
      )}

      <DramaCandidateDetailModal
        candidate={inspectingCandidate}
        onClose={() => setInspectingCandidate(null)}
        onPromote={(cand) => onPromoteCandidate(cand)}
        onDelete={(id) => onDeleteCandidate(id)}
      />
    </div>
  );
};

interface DramaCandidateVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: DramaCandidatePlan[];
  onPromoteCandidate: (candidate: DramaCandidatePlan) => void;
  onDeleteCandidate: (id: string) => void;
}

export const DramaCandidateVaultModal: React.FC<DramaCandidateVaultModalProps> = ({
  isOpen,
  onClose,
  candidates,
  onPromoteCandidate,
  onDeleteCandidate,
}) => {
  if (!isOpen) return null;

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-5xl max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          <div className="px-5 py-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                <FolderArchive className="w-4 h-4" />
                <span>备选项目计划目录 ({candidates.length})</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                自动备份您在 AI 立项探讨与三连孵化的未选中建议方案，点击卡片可阅览全貌或随时一键转正立项
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>关闭</span>
            </button>
          </div>

          <div className="p-5 sm:p-6 overflow-y-auto flex-1">
            <DramaCandidateVaultSection
              candidates={candidates}
              onPromoteCandidate={(cand) => {
                onPromoteCandidate(cand);
                onClose();
              }}
              onDeleteCandidate={onDeleteCandidate}
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
