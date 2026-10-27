import React, { useState } from 'react';
import {
  Kanban,
  KeyRound,
  GitBranch,
  Flame,
  Package,
  ShieldAlert,
  History,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  ArrowLeft,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DramaProject,
  DramaForeshadowStatus,
  DramaKeyPropItem,
  DramaKeyPropStatus,
  DramaStoryArc,
  DramaScreenplaySkill,
  DramaEpisodePlanItem,
} from '../types';
import {
  ContinuityMemoryDiagnostics,
  deriveEffectivePlotRhythm,
  resolveDramaScreenplaySkills,
  buildLongSeriesContinuityPromptBlock,
} from '../services/dramaPromptEngine';
import { generateUUID } from '../utils/uuid';
import { ModalPortal, MotionButton, SPRING_INDICATOR } from './MotionPrimitives';

/**
 * Maps 0~100 percentage to discrete Tailwind width utility classes (strictly zero inline style={{}})
 */
function getDiscreteWidthClass(pct: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (clamped === 0) return 'w-0';
  if (clamped <= 10) return 'w-[10%]';
  if (clamped <= 20) return 'w-[20%]';
  if (clamped <= 30) return 'w-[30%]';
  if (clamped <= 40) return 'w-[40%]';
  if (clamped <= 50) return 'w-[50%]';
  if (clamped <= 60) return 'w-[60%]';
  if (clamped <= 70) return 'w-[70%]';
  if (clamped <= 80) return 'w-[80%]';
  if (clamped <= 90) return 'w-[90%]';
  return 'w-full';
}

function getHeatCellClasses(tension: number, isCurrentEp: boolean): string {
  const ringCls = isCurrentEp ? 'ring-2 ring-[var(--accent)] font-bold' : '';
  if (tension >= 92) {
    return `bg-rose-500/25 border-rose-500/50 text-rose-800 dark:text-rose-200 ${ringCls}`;
  }
  if (tension >= 80) {
    return `bg-amber-500/25 border-amber-500/45 text-amber-900 dark:text-amber-200 ${ringCls}`;
  }
  if (tension >= 65) {
    return `bg-orange-500/15 border-orange-500/35 text-orange-800 dark:text-orange-300 ${ringCls}`;
  }
  return `bg-emerald-500/12 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 ${ringCls}`;
}

// ============================================================================
// 1. 漫剧剧本编辑器「逻辑溯源」窗口 + 角色知情权/转场因果护栏 SKILL 面板
// ============================================================================

interface DramaLogicProvenanceWindowProps {
  project: DramaProject;
  upcomingEpisodeIndex: number;
  diagnostics: ContinuityMemoryDiagnostics;
  onSaveProject: (updated: DramaProject) => Promise<void>;
  onInsertDirectiveToOutline: (directive: string, summaryToast: string) => void;
}

export const DramaLogicProvenanceWindow: React.FC<DramaLogicProvenanceWindowProps> = ({
  project,
  upcomingEpisodeIndex,
  diagnostics,
  onSaveProject,
  onInsertDirectiveToOutline,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isPromptPreviewOpen, setIsPromptPreviewOpen] = useState<boolean>(false);
  const [customNoteDraft, setCustomNoteDraft] = useState<string>(
    project.customProvenanceNote || ''
  );
  const [isAddingSkill, setIsAddingSkill] = useState<boolean>(false);
  const [newSkillName, setNewSkillName] = useState<string>('');
  const [newSkillDirective, setNewSkillDirective] = useState<string>('');

  const skills = resolveDramaScreenplaySkills(project);
  const enabledSkillsCount = skills.filter((s) => s.enabled).length;

  const handleToggleSkill = async (skillId: string) => {
    const nextSkills: DramaScreenplaySkill[] = skills.map((s) =>
      s.id === skillId ? { ...s, enabled: !s.enabled } : s
    );
    await onSaveProject({
      ...project,
      dramaSkills: nextSkills,
      lastModifiedAt: Date.now(),
    });
  };

  const handleSaveCustomNote = async () => {
    await onSaveProject({
      ...project,
      customProvenanceNote: customNoteDraft.trim() || undefined,
      lastModifiedAt: Date.now(),
    });
  };

  const handleCreateCustomDramaSkill = async () => {
    if (!newSkillName.trim() || !newSkillDirective.trim()) return;
    const created: DramaScreenplaySkill = {
      id: `custom-drama-skill-${generateUUID()}`,
      name: newSkillName.trim(),
      badge: '自定义护栏',
      description: newSkillDirective.trim().slice(0, 70),
      promptDirective: `【自定义编剧护栏 · ${newSkillName.trim()}】：${newSkillDirective.trim()}`,
      enabled: true,
      isBuiltin: false,
    };
    await onSaveProject({
      ...project,
      dramaSkills: [...skills, created],
      lastModifiedAt: Date.now(),
    });
    setNewSkillName('');
    setNewSkillDirective('');
    setIsAddingSkill(false);
  };

  const supportingCastCount = (project.characterAssets || []).filter(
    (c) => c.tier === 'major_support' || c.tier === 'recurring_antagonist'
  ).length;

  return (
    <section className="studio-card p-4 sm:p-5 space-y-3.5 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)] cursor-pointer text-left"
        >
          <History className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>
            逻辑溯源与防上帝视角中枢（第 {upcomingEpisodeIndex} 集生成前自动注入 AI）
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-muted)] tabular-nums">
          <span>前 5 集深度回溯 ({diagnostics.priorFiveNodes.length} 集)</span>
          <span aria-hidden="true">·</span>
          <span>遗留伏笔 {diagnostics.activeForeshadows.length} 项</span>
          <span aria-hidden="true">·</span>
          <span>持有道具 {diagnostics.activeKeyProps.length} 件</span>
          <span aria-hidden="true">·</span>
          <span>配角/反派 {supportingCastCount} 人</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            逻辑护栏 SKILL {enabledSkillsCount}/{skills.length} 已挂载
          </span>
          <button
            type="button"
            onClick={() => setIsPromptPreviewOpen(true)}
            className="text-[var(--accent)] font-semibold hover:underline flex items-center gap-1 cursor-pointer ml-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>预览注入上下文</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
          {/* 1. Preceding 5 Episodes Mandatory Memory Nodes */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-[var(--text-primary)]">
                ① 长文本记忆维护协议 · 前 5 集关键剧情节点与角色知情快照
              </span>
              {diagnostics.compressedEarlyRange && (
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                  更早集数：{diagnostics.compressedEarlyRange}
                </span>
              )}
            </div>

            {upcomingEpisodeIndex === 1 ? (
              <div className="p-3 rounded-xl studio-muted text-[var(--text-secondary)]">
                当前为开篇第 1 集：系统已自动锁定「全剧叙事圣经 + 首集黄金前 3 秒生死钩子 + 初始角色知情权边界」。从第 2 集起将自动展示前 5 集完整逻辑溯源链。
              </div>
            ) : diagnostics.priorFiveNodes.length === 0 ? (
              <div className="p-3 rounded-xl studio-muted text-[var(--text-secondary)]">
                前序集数尚无正文或细纲，生成时将自动依据全剧总大纲与叙事圣经衔接。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {diagnostics.priorFiveNodes.map((node) => (
                  <div
                    key={node.episodeIndex}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--text-primary)] tabular-nums">
                        第 {node.episodeIndex} 集《{node.title}》
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {node.source === 'written_episode' ? '已成稿正文溯源' : '分集细纲溯源'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      <strong>关键节点：</strong>
                      {node.coreNodeSummary}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                      <strong>角色/道具状态：</strong>
                      {node.characterAndPropState}
                    </p>
                    {node.povBoundaryNote && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-1">
                        <strong>知情隔离：</strong>
                        {node.povBoundaryNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Previous Episode Self-Audit Report (if available) + Unresolved Foreshadow Quick Summary */}
          {diagnostics.prevLogicAudit &&
            (diagnostics.prevLogicAudit.spatialAndMotiveBridge ||
              diagnostics.prevLogicAudit.povKnowledgeBoundary) && (
              <div className="p-3 rounded-xl studio-muted grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                {diagnostics.prevLogicAudit.spatialAndMotiveBridge && (
                  <div className="space-y-0.5">
                    <div className="font-bold text-[var(--text-primary)]">
                      🧭 上集转场因果与空间落点记录：
                    </div>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {diagnostics.prevLogicAudit.spatialAndMotiveBridge}
                    </p>
                  </div>
                )}
                {diagnostics.prevLogicAudit.povKnowledgeBoundary && (
                  <div className="space-y-0.5">
                    <div className="font-bold text-[var(--text-primary)]">
                      🛡️ 上集角色知情权边界审计（防本集开天眼）：
                    </div>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {diagnostics.prevLogicAudit.povKnowledgeBoundary}
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* 3. Built-in & Custom Screenplay Logic Guardrail SKILLs */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>
                  ② 漫剧编剧逻辑护栏 SKILL（解决突兀瞬移、无动机行为与主角开“上帝视角”说破盲区）
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingSkill((v) => !v)}
                className="text-[11px] font-medium text-[var(--accent)] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{isAddingSkill ? '收起' : '新增自定义逻辑护栏'}</span>
              </button>
            </div>

            {isAddingSkill && (
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="护栏名称（如：古装身份礼仪硬约束）"
                    className="studio-input px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={newSkillDirective}
                    onChange={(e) => setNewSkillDirective(e.target.value)}
                    placeholder="具体编剧约束指令（如：暗卫未摘面具前主角绝不可认出其真实身份）..."
                    className="studio-input px-2.5 py-1.5 text-xs sm:col-span-2"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateCustomDramaSkill}
                    className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] font-semibold text-xs cursor-pointer"
                  >
                    保存并挂载此 SKILL
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {skills.map((sk) => (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => handleToggleSkill(sk.id)}
                  className={`text-left p-3 rounded-xl border transition-colors space-y-1 cursor-pointer ${
                    sk.enabled
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-primary)] truncate">{sk.name}</span>
                    <span
                      className={`text-[10px] font-semibold shrink-0 ${
                        sk.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {sk.enabled ? '✓ 已启用' : '已停用'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {sk.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Author Custom Provenance & Epistemic Lock Note */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={customNoteDraft}
              onChange={(e) => setCustomNoteDraft(e.target.value)}
              placeholder="📌 逻辑溯源与知情权特别锁定备忘（例：主角A目前根本没见过幕后黑手B，遇刺后只能从刺客袖口残片怀疑到东城商会，严禁直接喊出B名字！）..."
              className="studio-input flex-1 min-h-[38px] px-3 py-1.5 text-xs"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveCustomNote}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>锁定进溯源Prompt</span>
              </button>
              {customNoteDraft.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    onInsertDirectiveToOutline(
                      `【逻辑与知情权硬约束】：${customNoteDraft.trim()}`,
                      '已将该逻辑约束同步写入当前大纲'
                    )
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl studio-muted hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--accent)] cursor-pointer"
                >
                  + 插入当前大纲
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Injected Context Modal Preview */}
      {isPromptPreviewOpen && (
        <ModalPortal onEscape={() => setIsPromptPreviewOpen(false)}>
          <div
            onClick={() => setIsPromptPreviewOpen(false)}
            className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="studio-card w-full sm:max-w-3xl max-h-[86dvh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
            >
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    第 {upcomingEpisodeIndex} 集生成时自动注入 AI 的「逻辑溯源与长文本记忆上下文」
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    以下完整内容将在每次生成新一集剧本时实时注入模型提示词，保障伏笔回收、道具一致与零上帝视角穿帮
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPromptPreviewOpen(false)}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 sm:hidden" />
                  <X className="w-4 h-4 hidden sm:block" />
                  <span>关闭</span>
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                <pre className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {buildLongSeriesContinuityPromptBlock(project, upcomingEpisodeIndex)}
                </pre>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </section>
  );
};

// ============================================================================
// 2. 漫剧剧本创作「实时结构化看板」（角色伏笔清单 · 关键道具库 · 多线叙事进度表 · 剧情节奏热力图）
// ============================================================================

interface DramaStructuredKanbanProps {
  project: DramaProject;
  targetEpisodeIndex: number;
  onSaveProject: (updated: DramaProject) => Promise<void>;
  onInsertToCurrentOutline: (directiveText: string, itemLabel: string) => void;
  onJumpToSetup?: () => void;
}

export const DramaStructuredKanban: React.FC<DramaStructuredKanbanProps> = ({
  project,
  targetEpisodeIndex,
  onSaveProject,
  onInsertToCurrentOutline,
  onJumpToSetup,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeBoard, setActiveBoard] = useState<
    'foreshadows' | 'keyProps' | 'storyArcs' | 'rhythmHeatmap' | 'supportingCast'
  >('foreshadows');
  const [selectedRhythmEp, setSelectedRhythmEp] = useState<number>(targetEpisodeIndex);

  // Quick inline add state for Key Prop
  const [isAddingProp, setIsAddingProp] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropHolder, setNewPropHolder] = useState('');
  const [newPropFunc, setNewPropFunc] = useState('');

  const foreshadows = project.foreshadowingLedger || [];
  const keyProps = project.keyPropManifest || [];
  const storyArcs = project.storyArcs || [];
  const rhythmPoints = deriveEffectivePlotRhythm(project);
  const allCharacters = project.characterAssets || [];

  const currentPlannedOutline: DramaEpisodePlanItem | undefined = (
    project.episodePlan || []
  ).find((p) => p.episodeIndex === targetEpisodeIndex);

  const handleUpdateForeshadowStatus = async (id: string, status: DramaForeshadowStatus) => {
    const next = foreshadows.map((f) =>
      f.id === id
        ? {
            ...f,
            status,
            resolvedEpisode: status === 'resolved' ? targetEpisodeIndex : undefined,
          }
        : f
    );
    await onSaveProject({ ...project, foreshadowingLedger: next, lastModifiedAt: Date.now() });
  };

  const handleUpdatePropStatusOrHolder = async (
    id: string,
    patch: Partial<DramaKeyPropItem>
  ) => {
    const next = keyProps.map((p) => (p.id === id ? { ...p, ...patch } : p));
    await onSaveProject({ ...project, keyPropManifest: next, lastModifiedAt: Date.now() });
  };

  const handleQuickAddProp = async () => {
    if (!newPropName.trim()) return;
    const item: DramaKeyPropItem = {
      id: generateUUID(),
      name: newPropName.trim(),
      currentHolder: newPropHolder.trim() || '主角持有',
      debutEpisode: targetEpisodeIndex,
      milestoneEpisodes: `第${targetEpisodeIndex}集登场`,
      visualSpec: '',
      narrativeFunction: newPropFunc.trim() || '关键物证/反制道具',
      status: '持有中',
    };
    await onSaveProject({
      ...project,
      keyPropManifest: [...keyProps, item],
      lastModifiedAt: Date.now(),
    });
    setNewPropName('');
    setNewPropHolder('');
    setNewPropFunc('');
    setIsAddingProp(false);
  };

  const handleStepArcProgress = async (arc: DramaStoryArc, delta: number) => {
    const nextPct = Math.max(0, Math.min(100, (arc.progressPct || 0) + delta));
    const nextArcs = storyArcs.map((a) =>
      a.id === arc.id ? { ...a, progressPct: nextPct } : a
    );
    await onSaveProject({ ...project, storyArcs: nextArcs, lastModifiedAt: Date.now() });
  };

  const inspectedRhythm =
    rhythmPoints.find((r) => r.anchorEpisode === selectedRhythmEp) ||
    rhythmPoints.find((r) => r.anchorEpisode === targetEpisodeIndex) ||
    rhythmPoints[0];

  return (
    <section className="studio-card p-4 sm:p-5 space-y-4 text-xs">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)] cursor-pointer text-left"
        >
          <Kanban className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span>结构化实时追踪看板（点击任意卡片可直接插入第 {targetEpisodeIndex} 集当前大纲）</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>

        {currentPlannedOutline && (
          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-md tabular-nums">
            当前第 {targetEpisodeIndex} 集大纲：《{currentPlannedOutline.title}》
          </span>
        )}
      </div>

      {isOpen && (
        <div className="space-y-4 pt-1 border-t border-[var(--border-subtle)]">
          {/* Sub-board Switcher */}
          <div className="flex flex-wrap items-center gap-1 p-1 studio-muted rounded-xl">
            {[
              {
                id: 'foreshadows',
                label: `角色伏笔清单 (${foreshadows.filter((f) => f.status !== 'resolved').length}/${foreshadows.length})`,
                icon: KeyRound,
              },
              {
                id: 'keyProps',
                label: `关键道具库 (${keyProps.length})`,
                icon: Package,
              },
              {
                id: 'storyArcs',
                label: `多线叙事进度表 (${storyArcs.length})`,
                icon: GitBranch,
              },
              {
                id: 'rhythmHeatmap',
                label: `剧情节奏热力图 (${rhythmPoints.length})`,
                icon: Flame,
              },
              {
                id: 'supportingCast',
                label: `主角与重要配角花名册 (${allCharacters.length})`,
                icon: UserCheck,
              },
            ].map((tab) => {
              const active = activeBoard === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveBoard(tab.id as typeof activeBoard)}
                  className={`relative min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors tabular-nums ${
                    active
                      ? 'text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="drama-kanban-board-pill"
                      transition={SPRING_INDICATOR}
                      className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 text-[var(--accent)] relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* BOARD 1: Character Foreshadowing Checklist */}
          {activeBoard === 'foreshadows' && (
            <div className="space-y-2.5">
              {foreshadows.length === 0 ? (
                <div className="p-6 rounded-xl studio-muted text-center space-y-2">
                  <p className="text-[var(--text-muted)]">
                    当前暂无角色伏笔记录。生成剧本时将自动捕获新伏笔，也可前往立项页由 AI 推演全剧伏笔台账。
                  </p>
                  {onJumpToSetup && (
                    <button
                      type="button"
                      onClick={onJumpToSetup}
                      className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                    >
                      前往立项页推演伏笔台账 →
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-68 overflow-y-auto pr-1">
                  {foreshadows.map((f) => {
                    const resolved = f.status === 'resolved';
                    return (
                      <div
                        key={f.id}
                        className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                          resolved
                            ? 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 opacity-75'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[var(--text-primary)] truncate">
                              {f.name}
                            </span>
                            <select
                              value={f.status}
                              onChange={(e) =>
                                handleUpdateForeshadowStatus(
                                  f.id,
                                  e.target.value as DramaForeshadowStatus
                                )
                              }
                              className="studio-input px-2 py-0.5 text-[11px] font-medium"
                            >
                              <option value="planted">待回收</option>
                              <option value="fermenting">发酵中</option>
                              <option value="resolved">✓ 已回收</option>
                            </select>
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {f.category} · 关联：{f.ownerOrRelation} · 第{f.plantedEpisode}集埋
                            {f.expectedPayoffEpisode ? ` → 预计${f.expectedPayoffEpisode}` : ''}
                          </div>
                          {f.payoffNote && (
                            <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                              {f.payoffNote}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[var(--border-subtle)]/60">
                          <MotionButton
                            type="button"
                            onClick={() =>
                              onInsertToCurrentOutline(
                                `【伏笔推进/回收 · ${f.name}】（关联：${f.ownerOrRelation}）：${
                                  f.payoffNote || '在本集通过具象现场线索推进或引爆该伏笔'
                                }`,
                                `伏笔「${f.name}」`
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] cursor-pointer"
                          >
                            + 点击插入当前大纲
                          </MotionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* BOARD 2: Key Prop Manifest */}
          {activeBoard === 'keyProps' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">
                  实时追踪关键实体道具当前持有人与流转状态，杜绝道具凭空瞬移或前后矛盾
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingProp((v) => !v)}
                  className="text-xs font-medium text-[var(--accent)] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingProp ? '取消' : '快速登记关键道具'}</span>
                </button>
              </div>

              {isAddingProp && (
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    placeholder="道具名称（如：染血家徽袖扣）"
                    className="studio-input px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={newPropHolder}
                    onChange={(e) => setNewPropHolder(e.target.value)}
                    placeholder="当前持有人（如：沈寂搜获）"
                    className="studio-input px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={newPropFunc}
                    onChange={(e) => setNewPropFunc(e.target.value)}
                    placeholder="关键物证/叙事作用..."
                    className="studio-input px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddProp}
                    className="btn-primary min-h-[34px] px-3 py-1.5 text-xs cursor-pointer"
                  >
                    确认入库
                  </button>
                </div>
              )}

              {keyProps.length === 0 ? (
                <p className="p-6 rounded-xl studio-muted text-center text-[var(--text-muted)]">
                  暂无关键道具记录。可点击右上角快速登记，或在立项页一键提取全剧关键道具表。
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-68 overflow-y-auto pr-1">
                  {keyProps.map((kp) => (
                    <div
                      key={kp.id}
                      className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 flex flex-col justify-between gap-2"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--text-primary)] truncate">
                            🗝️ {kp.name}
                          </span>
                          <select
                            value={kp.status}
                            onChange={(e) =>
                              handleUpdatePropStatusOrHolder(kp.id, {
                                status: e.target.value as DramaKeyPropStatus,
                              })
                            }
                            className="studio-input px-2 py-0.5 text-[11px] font-medium"
                          >
                            <option value="持有中">持有中</option>
                            <option value="已移交">已移交</option>
                            <option value="遗失/争夺中">遗失/争夺中</option>
                            <option value="已损毁">已损毁</option>
                            <option value="已引爆回收">已引爆回收</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-[var(--text-muted)] shrink-0">当前持有人：</span>
                          <input
                            type="text"
                            value={kp.currentHolder}
                            onChange={(e) =>
                              handleUpdatePropStatusOrHolder(kp.id, {
                                currentHolder: e.target.value,
                              })
                            }
                            className="studio-input px-2 py-0.5 text-[11px] flex-1"
                          />
                        </div>

                        {kp.visualSpec && (
                          <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                            外观锚点：{kp.visualSpec}
                          </p>
                        )}
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          作用：{kp.narrativeFunction}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]/60">
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                          第 {kp.debutEpisode} 集首秀 · {kp.milestoneEpisodes}
                        </span>
                        <MotionButton
                          type="button"
                          onClick={() =>
                            onInsertToCurrentOutline(
                              `【关键道具调度 · ${kp.name}】（当前持有：${kp.currentHolder}，状态：${kp.status}）：${kp.narrativeFunction}`,
                              `关键道具「${kp.name}」`
                            )
                          }
                          className="min-h-[30px] px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] cursor-pointer"
                        >
                          + 点击插入当前大纲
                        </MotionButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BOARD 3: Multi-line Narrative Progress Table */}
          {activeBoard === 'storyArcs' && (
            <div className="space-y-3">
              {storyArcs.length === 0 ? (
                <div className="p-6 rounded-xl studio-muted text-center space-y-2">
                  <p className="text-[var(--text-muted)]">
                    暂未建立结构化多线叙事表。可在立项页点击「AI 推演补全叙事圣经」一键生成主线、情感副线与暗线进度。
                  </p>
                  {onJumpToSetup && (
                    <button
                      type="button"
                      onClick={onJumpToSetup}
                      className="text-[var(--accent)] font-semibold hover:underline cursor-pointer"
                    >
                      前往立项页配置故事线 →
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {storyArcs.map((arc) => (
                    <div
                      key={arc.id}
                      className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--accent)]">{arc.arcType}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-[var(--text-primary)]">
                            《{arc.title}》
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            （{arc.spanEpisodes}）
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 tabular-nums">
                          <button
                            type="button"
                            onClick={() => handleStepArcProgress(arc, -10)}
                            className="px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] cursor-pointer"
                          >
                            -10%
                          </button>
                          <span className="font-bold text-[var(--text-primary)] w-10 text-center">
                            {arc.progressPct}%
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStepArcProgress(arc, 10)}
                            className="px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] cursor-pointer"
                          >
                            +10%
                          </button>
                          <MotionButton
                            type="button"
                            onClick={() =>
                              onInsertToCurrentOutline(
                                `【${arc.arcType}推进 · 《${arc.title}》】（当前阶段：${arc.currentStage}）：${arc.coreConflictAndGoal}`,
                                `故事线《${arc.title}》`
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] cursor-pointer ml-1"
                          >
                            + 插入当前大纲
                          </MotionButton>
                        </div>
                      </div>

                      {/* Discrete Tailwind Progress Bar (Zero inline styles) */}
                      <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
                        <div
                          className={`h-full bg-[var(--accent)] rounded-full transition-all duration-300 ${getDiscreteWidthClass(
                            arc.progressPct
                          )}`}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                        <span className="font-medium text-[var(--text-primary)]">
                          当前阶段：{arc.currentStage}
                        </span>
                        <span className="text-[var(--text-secondary)] truncate max-w-xl">
                          目标闭环：{arc.coreConflictAndGoal}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BOARD 4: Plot Rhythm Heatmap */}
          {activeBoard === 'rhythmHeatmap' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                <span>
                  点击下方任意热力集数块可检视节奏目标，或一键将该节奏要求插入当前第 {targetEpisodeIndex} 集大纲：
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-emerald-700 dark:text-emerald-300">■ 蓄力铺垫</span>
                  <span className="text-orange-700 dark:text-orange-300">■ 拉扯升级</span>
                  <span className="text-amber-700 dark:text-amber-300">■ 爽点小高潮</span>
                  <span className="text-rose-700 dark:text-rose-300">■ 付费卡点/大爆发</span>
                </div>
              </div>

              {rhythmPoints.length === 0 ? (
                <p className="p-6 rounded-xl studio-muted text-center text-[var(--text-muted)]">
                  尚无分集节拍或节奏点规划，生成前 12 集细纲后将自动点亮剧情节奏热力图。
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {rhythmPoints.map((pt) => {
                      const isTarget = pt.anchorEpisode === targetEpisodeIndex;
                      const isSelected = pt.anchorEpisode === selectedRhythmEp;
                      return (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => setSelectedRhythmEp(pt.anchorEpisode)}
                          className={`p-2 rounded-xl border text-left transition-transform cursor-pointer tabular-nums ${getHeatCellClasses(
                            pt.tensionScore,
                            isTarget || isSelected
                          )}`}
                        >
                          <div className="text-[11px] font-bold truncate">
                            第{pt.anchorEpisode}集
                          </div>
                          <div className="text-[10px] opacity-90 truncate">{pt.rhythmTier}</div>
                          <div className="text-[10px] font-mono opacity-80">
                            🔥 {pt.tensionScore}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {inspectedRhythm && (
                    <div className="p-3.5 rounded-xl studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="font-bold text-[var(--text-primary)] tabular-nums">
                          {inspectedRhythm.episodeRange} · {inspectedRhythm.rhythmTier}（紧张度热力值{' '}
                          {inspectedRhythm.tensionScore}/100）
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {inspectedRhythm.beatGoal}
                        </p>
                      </div>
                      <MotionButton
                        type="button"
                        onClick={() =>
                          onInsertToCurrentOutline(
                            `【剧情节奏卡点 · ${inspectedRhythm.rhythmTier}（紧张度 ${inspectedRhythm.tensionScore}/100）】：${inspectedRhythm.beatGoal}`,
                            `节奏卡点「${inspectedRhythm.rhythmTier}」`
                          )
                        }
                        className="btn-primary min-h-[36px] px-3.5 py-1.5 text-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>插入当前大纲</span>
                      </MotionButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* BOARD 5: Protagonists & Auto-Discovered Supporting Cast Roster */}
          {activeBoard === 'supportingCast' && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-[var(--text-muted)]">
                随每集剧本推进，新登场的重要配角与阶段反派会自动识别入库（过滤无名龙套），点击角色可将其登场与知情边界插入当前大纲：
              </p>
              {allCharacters.length === 0 ? (
                <p className="p-6 rounded-xl studio-muted text-center text-[var(--text-muted)]">
                  暂未录入角色档案。
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-68 overflow-y-auto pr-1">
                  {allCharacters.map((ch) => {
                    const tierLabel =
                      ch.tier === 'protagonist'
                        ? '核心主角'
                        : ch.tier === 'recurring_antagonist'
                        ? '关键反派'
                        : '重要配角';
                    return (
                      <div
                        key={ch.id}
                        className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 flex flex-col justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[var(--text-primary)]">
                              {ch.name} · <span className="text-[var(--accent)]">{tierLabel}</span>
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                              第 {ch.firstAppearanceEp || 1} 集登场 · {ch.roleTag}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">
                            {ch.ageAndArchetype}
                          </p>
                          {ch.epistemicNote && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-1">
                              知情边界：{ch.epistemicNote}
                            </p>
                          )}
                        </div>

                        <div className="flex justify-end pt-1 border-t border-[var(--border-subtle)]/60">
                          <MotionButton
                            type="button"
                            onClick={() =>
                              onInsertToCurrentOutline(
                                `【角色调度 · ${ch.name}（${ch.roleTag}）】：${ch.ageAndArchetype}${
                                  ch.epistemicNote ? `；注意知情权边界：${ch.epistemicNote}` : ''
                                }`,
                                `角色「${ch.name}」`
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)] cursor-pointer"
                          >
                            + 插入当前大纲
                          </MotionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
