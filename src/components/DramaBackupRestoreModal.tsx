import React, { useState, useMemo, useEffect } from 'react';
import {
  Download,
  Upload,
  CheckSquare,
  Square,
  Clapperboard,
  FolderArchive,
  X,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  FileJson,
} from 'lucide-react';
import { motion } from 'motion/react';
import { DramaProject, DramaCandidatePlan } from '../types';
import { ModalPortal, MotionButton, SPRING_INDICATOR } from './MotionPrimitives';

export interface DramaBackupBundle {
  schemaVersion: 'moying-drama-backup-v1';
  exportedAt: number;
  exportedAtIso: string;
  projects: DramaProject[];
  candidates: DramaCandidatePlan[];
}

interface DramaBackupRestoreModalProps {
  isOpen: boolean;
  initialMode?: 'backup' | 'restore';
  projects: DramaProject[];
  candidates: DramaCandidatePlan[];
  onClose: () => void;
  onRestoreConfirm: (params: {
    projectsToRestore: DramaProject[];
    candidatesToRestore: DramaCandidatePlan[];
    conflictMode: 'overwrite' | 'clone';
  }) => Promise<void>;
}

export const DramaBackupRestoreModal: React.FC<DramaBackupRestoreModalProps> = ({
  isOpen,
  initialMode = 'backup',
  projects,
  candidates,
  onClose,
  onRestoreConfirm,
}) => {
  const [mode, setMode] = useState<'backup' | 'restore'>(initialMode);

  // Backup (Export) selection states
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  // Restore (Import) parsed bundle & selection states
  const [parsedProjects, setParsedProjects] = useState<DramaProject[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<DramaCandidatePlan[]>([]);
  const [restoreProjectIds, setRestoreProjectIds] = useState<Set<string>>(new Set());
  const [restoreCandidateIds, setRestoreCandidateIds] = useState<Set<string>>(new Set());
  const [conflictMode, setConflictMode] = useState<'overwrite' | 'clone'>('overwrite');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState(false);

  // Default select all items when opening backup modal so user can 1-click export or toggle single items
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSelectedProjectIds(new Set(projects.map((p) => p.id)));
      setSelectedCandidateIds(new Set(candidates.map((c) => c.id)));
      setFeedbackMsg(null);
    }
  }, [isOpen, initialMode, projects, candidates]);

  const existingProjectIdSet = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const existingCandidateIdSet = useMemo(() => new Set(candidates.map((c) => c.id)), [candidates]);

  if (!isOpen) return null;

  // ====== Export Helpers ======
  const totalAvailableExport = projects.length + candidates.length;
  const totalSelectedExport = selectedProjectIds.size + selectedCandidateIds.size;
  const isAllExportSelected =
    totalAvailableExport > 0 && totalSelectedExport === totalAvailableExport;

  const toggleAllExport = () => {
    if (isAllExportSelected) {
      setSelectedProjectIds(new Set());
      setSelectedCandidateIds(new Set());
    } else {
      setSelectedProjectIds(new Set(projects.map((p) => p.id)));
      setSelectedCandidateIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const toggleAllExportProjects = () => {
    if (selectedProjectIds.size === projects.length && projects.length > 0) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(projects.map((p) => p.id)));
    }
  };

  const toggleAllExportCandidates = () => {
    if (selectedCandidateIds.size === candidates.length && candidates.length > 0) {
      setSelectedCandidateIds(new Set());
    } else {
      setSelectedCandidateIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const toggleSingleExportProject = (id: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSingleExportCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExecuteExport = () => {
    const chosenProjects = projects.filter((p) => selectedProjectIds.has(p.id));
    const chosenCandidates = candidates.filter((c) => selectedCandidateIds.has(c.id));

    if (chosenProjects.length === 0 && chosenCandidates.length === 0) {
      setFeedbackMsg({ type: 'error', text: '请至少勾选 1 个漫剧项目或备选项目后再导出备份。' });
      return;
    }

    const now = Date.now();
    const bundle: DramaBackupBundle = {
      schemaVersion: 'moying-drama-backup-v1',
      exportedAt: now,
      exportedAtIso: new Date(now).toISOString(),
      projects: chosenProjects,
      candidates: chosenCandidates,
    };

    const jsonStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateTag = new Date(now).toISOString().slice(0, 10);
    const singleTitleSuffix =
      chosenProjects.length === 1 && chosenCandidates.length === 0
        ? `_《${chosenProjects[0].title}》`
        : chosenProjects.length === 0 && chosenCandidates.length === 1
        ? `_备选《${chosenCandidates[0].title}》`
        : `_共${chosenProjects.length}剧${chosenCandidates.length}备选`;

    const a = document.createElement('a');
    a.href = url;
    a.download = `墨映工坊_漫剧备份${singleTitleSuffix}_${dateTag}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setFeedbackMsg({
      type: 'success',
      text: `备份文件已下载：包含 ${chosenProjects.length} 部正式漫剧项目、${chosenCandidates.length} 套备选项目计划。`,
    });
  };

  // ====== Import / Restore Helpers ======
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedbackMsg(null);

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      let incomingProjects: DramaProject[] = [];
      let incomingCandidates: DramaCandidatePlan[] = [];

      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.projects) || Array.isArray(parsed.candidates)) {
          incomingProjects = Array.isArray(parsed.projects)
            ? parsed.projects.filter((p: any) => p && p.id && p.title)
            : [];
          incomingCandidates = Array.isArray(parsed.candidates)
            ? parsed.candidates.filter((c: any) => c && c.id && c.title)
            : [];
        } else if (Array.isArray(parsed)) {
          // Support raw array of DramaProject or DramaCandidatePlan
          parsed.forEach((item: any) => {
            if (!item || !item.id || !item.title) return;
            if ('episodes' in item || 'characterAssets' in item) {
              incomingProjects.push(item as DramaProject);
            } else if ('directionTag' in item || 'sourceType' in item) {
              incomingCandidates.push(item as DramaCandidatePlan);
            }
          });
        } else if (parsed.id && parsed.title) {
          if ('episodes' in parsed || 'characterAssets' in parsed) {
            incomingProjects.push(parsed as DramaProject);
          } else {
            incomingCandidates.push(parsed as DramaCandidatePlan);
          }
        }
      }

      if (incomingProjects.length === 0 && incomingCandidates.length === 0) {
        setFeedbackMsg({
          type: 'error',
          text: '未能在此 JSON 文件中识别出有效的「漫剧立项项目」或「备选项目计划」，请检查备份文件格式。',
        });
        return;
      }

      setUploadedFileName(file.name);
      setParsedProjects(incomingProjects);
      setParsedCandidates(incomingCandidates);
      setRestoreProjectIds(new Set(incomingProjects.map((p) => p.id)));
      setRestoreCandidateIds(new Set(incomingCandidates.map((c) => c.id)));
      setFeedbackMsg({
        type: 'success',
        text: `已解析备份包「${file.name}」：识别到 ${incomingProjects.length} 部正式漫剧项目、${incomingCandidates.length} 套备选项目，可全选或单选恢复。`,
      });
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: `读取备份文件失败：JSON 格式不合法（${err.message || '解析异常'}）`,
      });
    } finally {
      e.target.value = '';
    }
  };

  const totalParsedCount = parsedProjects.length + parsedCandidates.length;
  const totalRestoreSelected = restoreProjectIds.size + restoreCandidateIds.size;
  const isAllRestoreSelected = totalParsedCount > 0 && totalRestoreSelected === totalParsedCount;

  const toggleAllRestore = () => {
    if (isAllRestoreSelected) {
      setRestoreProjectIds(new Set());
      setRestoreCandidateIds(new Set());
    } else {
      setRestoreProjectIds(new Set(parsedProjects.map((p) => p.id)));
      setRestoreCandidateIds(new Set(parsedCandidates.map((c) => c.id)));
    }
  };

  const toggleSingleRestoreProject = (id: string) => {
    setRestoreProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSingleRestoreCandidate = (id: string) => {
    setRestoreCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExecuteRestore = async () => {
    const projectsToRestore = parsedProjects.filter((p) => restoreProjectIds.has(p.id));
    const candidatesToRestore = parsedCandidates.filter((c) => restoreCandidateIds.has(c.id));

    if (projectsToRestore.length === 0 && candidatesToRestore.length === 0) {
      setFeedbackMsg({ type: 'error', text: '请至少勾选 1 个需要恢复的漫剧项目或备选项目。' });
      return;
    }

    setIsRestoring(true);
    try {
      await onRestoreConfirm({
        projectsToRestore,
        candidatesToRestore,
        conflictMode,
      });
      onClose();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `恢复数据失败：${err.message || '写入本地数据库失败'}` });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-4xl max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          {/* Sticky Header */}
          <div className="px-5 py-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--accent)] font-semibold">
                <FileJson className="w-4 h-4" />
                <span>漫剧立项剧目 & 备选项目计划 · 数据备份与恢复中心</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-editorial-serif">
                漫剧资产安全备份与跨设备恢复
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] flex items-center gap-1 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:hidden" />
              <X className="w-4 h-4 hidden sm:block" />
              <span>关闭</span>
            </button>
          </div>

          {/* Mode Switcher Bar */}
          <div className="px-5 py-3 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/45 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="inline-flex items-center gap-1 p-1 studio-muted rounded-xl">
              {[
                { id: 'backup', label: '📤 导出备份（支持全选 / 单选）', icon: Download },
                { id: 'restore', label: '📥 导入恢复（解析预览 / 选择性恢复）', icon: Upload },
              ].map((tab) => {
                const active = mode === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setMode(tab.id as 'backup' | 'restore');
                      setFeedbackMsg(null);
                    }}
                    className={`relative min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                      active
                        ? 'text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="drama-backup-mode-pill"
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

            {mode === 'backup' && totalAvailableExport > 0 && (
              <div className="flex items-center gap-2 text-xs tabular-nums">
                <button
                  type="button"
                  onClick={toggleAllExport}
                  className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  {isAllExportSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                  <span>{isAllExportSelected ? '取消全选全部' : '一键全选全部'}</span>
                </button>
                <span className="text-[var(--text-muted)]">
                  已选 {totalSelectedExport} / {totalAvailableExport} 项
                </span>
              </div>
            )}

            {mode === 'restore' && totalParsedCount > 0 && (
              <div className="flex items-center gap-2 text-xs tabular-nums">
                <button
                  type="button"
                  onClick={toggleAllRestore}
                  className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  {isAllRestoreSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                  <span>{isAllRestoreSelected ? '取消全选' : '一键全选全部'}</span>
                </button>
                <span className="text-[var(--text-muted)]">
                  拟恢复 {totalRestoreSelected} / {totalParsedCount} 项
                </span>
              </div>
            )}
          </div>

          {/* Scrollable Content */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 text-xs">
            {feedbackMsg && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2 leading-relaxed ${
                  feedbackMsg.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {feedbackMsg.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            {mode === 'backup' ? (
              <>
                {/* Group 1: Formal Drama Projects */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)] tabular-nums">
                      <Clapperboard className="w-4 h-4 text-[var(--accent)]" />
                      <span>
                        一、正式立项漫剧项目（已选 {selectedProjectIds.size} / {projects.length} 部）
                      </span>
                    </div>
                    {projects.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllExportProjects}
                        className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        {selectedProjectIds.size === projects.length
                          ? '清空立项剧目选择'
                          : '全选立项剧目'}
                      </button>
                    )}
                  </div>

                  {projects.length === 0 ? (
                    <p className="p-5 rounded-xl studio-muted text-center text-[var(--text-muted)]">
                      当前暂无正式立项剧目可备份。
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {projects.map((proj) => {
                        const checked = selectedProjectIds.has(proj.id);
                        const epCount = proj.episodes?.length || 0;
                        const shotCount = (proj.episodes || []).reduce(
                          (acc, e) => acc + (e.shots?.length || 0),
                          0
                        );
                        return (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => toggleSingleExportProject(proj.id)}
                            className={`text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              checked
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/40'
                            }`}
                          >
                            <div className="pt-0.5 shrink-0">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                              ) : (
                                <Square className="w-4 h-4 text-[var(--text-muted)]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="font-bold text-sm text-[var(--text-primary)] truncate font-editorial-serif">
                                《{proj.title}》
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                {proj.channel} · {proj.trackName} · {proj.visualStyle}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                剧本 {epCount} 集 · 分镜 {shotCount} 镜 · 细纲{' '}
                                {proj.episodePlan?.length || 0} 集 · 角色{' '}
                                {proj.characterAssets?.length || 0} 人
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Group 2: Candidate Project Plans */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)] tabular-nums">
                      <FolderArchive className="w-4 h-4 text-[var(--accent)]" />
                      <span>
                        二、备选项目计划目录（已选 {selectedCandidateIds.size} / {candidates.length} 套）
                      </span>
                    </div>
                    {candidates.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllExportCandidates}
                        className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        {selectedCandidateIds.size === candidates.length
                          ? '清空备选计划选择'
                          : '全选备选计划'}
                      </button>
                    )}
                  </div>

                  {candidates.length === 0 ? (
                    <p className="p-5 rounded-xl studio-muted text-center text-[var(--text-muted)]">
                      当前备选项目计划目录为空。
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {candidates.map((cand) => {
                        const checked = selectedCandidateIds.has(cand.id);
                        return (
                          <button
                            key={cand.id}
                            type="button"
                            onClick={() => toggleSingleExportCandidate(cand.id)}
                            className={`text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                              checked
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/40'
                            }`}
                          >
                            <div className="pt-0.5 shrink-0">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                              ) : (
                                <Square className="w-4 h-4 text-[var(--text-muted)]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="font-bold text-sm text-[var(--text-primary)] truncate font-editorial-serif">
                                《{cand.title}》
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                {cand.directionTag} · {cand.channel} · {cand.visualStyle}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                规划 {cand.totalPlannedEpisodes || 60} 集 · 单集{' '}
                                {cand.episodeDurationSec || 90}s · 预置角色{' '}
                                {cand.seedCharacters?.length || 0} 人
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            ) : (
              /* Restore / Import View */
              <div className="space-y-5">
                <div className="p-5 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="font-bold text-sm text-[var(--text-primary)]">
                      {uploadedFileName
                        ? `当前已载入备份文件：${uploadedFileName}`
                        : '选择本地漫剧备份文件 (.json)'}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      支持本工坊导出的全量/单项备份包，上传后可自由勾选需要恢复的漫剧立项或备选方案。
                    </p>
                  </div>

                  <label className="btn-primary min-h-[42px] px-5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>{uploadedFileName ? '重新选择备份文件' : '上传备份 JSON 文件'}</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {totalParsedCount > 0 && (
                  <>
                    {/* Conflict Strategy Selector */}
                    <div className="p-4 rounded-xl studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="font-bold text-[var(--text-primary)]">同 ID 项目冲突处理策略</div>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          当备份文件中的项目在本机已存在时，选择覆盖更新还是另存为独立新副本
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {[
                          { id: 'overwrite', label: '覆盖更新原项目' },
                          { id: 'clone', label: '生成新副本保留两者' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setConflictMode(opt.id as 'overwrite' | 'clone')}
                            className={`min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                              conflictMode === opt.id
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Parsed Drama Projects */}
                    {parsedProjects.length > 0 && (
                      <section className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                          <span className="font-bold text-sm text-[var(--text-primary)] tabular-nums">
                            备份包内的正式漫剧项目（已选 {restoreProjectIds.size} / {parsedProjects.length}）
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (restoreProjectIds.size === parsedProjects.length) {
                                setRestoreProjectIds(new Set());
                              } else {
                                setRestoreProjectIds(new Set(parsedProjects.map((p) => p.id)));
                              }
                            }}
                            className="text-xs font-medium text-[var(--accent)] cursor-pointer"
                          >
                            {restoreProjectIds.size === parsedProjects.length ? '取消全选剧目' : '全选剧目'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {parsedProjects.map((proj) => {
                            const checked = restoreProjectIds.has(proj.id);
                            const existsLocally = existingProjectIdSet.has(proj.id);
                            return (
                              <button
                                key={proj.id}
                                type="button"
                                onClick={() => toggleSingleRestoreProject(proj.id)}
                                className={`text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                                  checked
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                }`}
                              >
                                <div className="pt-0.5 shrink-0">
                                  {checked ? (
                                    <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[var(--text-muted)]" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-sm text-[var(--text-primary)] truncate font-editorial-serif">
                                      《{proj.title}》
                                    </span>
                                    {existsLocally && (
                                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                                        本机已有同ID
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                                    {proj.trackName} · 剧本 {proj.episodes?.length || 0} 集 · 细纲{' '}
                                    {proj.episodePlan?.length || 0} 集 · 角色{' '}
                                    {proj.characterAssets?.length || 0} 人
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Parsed Candidate Plans */}
                    {parsedCandidates.length > 0 && (
                      <section className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                          <span className="font-bold text-sm text-[var(--text-primary)] tabular-nums">
                            备份包内的备选项目计划（已选 {restoreCandidateIds.size} / {parsedCandidates.length}）
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (restoreCandidateIds.size === parsedCandidates.length) {
                                setRestoreCandidateIds(new Set());
                              } else {
                                setRestoreCandidateIds(new Set(parsedCandidates.map((c) => c.id)));
                              }
                            }}
                            className="text-xs font-medium text-[var(--accent)] cursor-pointer"
                          >
                            {restoreCandidateIds.size === parsedCandidates.length
                              ? '取消全选备选'
                              : '全选备选'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {parsedCandidates.map((cand) => {
                            const checked = restoreCandidateIds.has(cand.id);
                            const existsLocally = existingCandidateIdSet.has(cand.id);
                            return (
                              <button
                                key={cand.id}
                                type="button"
                                onClick={() => toggleSingleRestoreCandidate(cand.id)}
                                className={`text-left p-3.5 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                                  checked
                                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                }`}
                              >
                                <div className="pt-0.5 shrink-0">
                                  {checked ? (
                                    <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                                  ) : (
                                    <Square className="w-4 h-4 text-[var(--text-muted)]" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-sm text-[var(--text-primary)] truncate font-editorial-serif">
                                      《{cand.title}》
                                    </span>
                                    {existsLocally && (
                                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                                        本机已有同ID
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                                    {cand.directionTag} · {cand.channel} · {cand.visualStyle}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="px-5 py-3.5 sm:px-6 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {mode === 'backup'
                ? `将打包导出 ${selectedProjectIds.size} 部漫剧 + ${selectedCandidateIds.size} 套备选计划`
                : totalParsedCount > 0
                ? `已勾选恢复 ${restoreProjectIds.size} 部漫剧 + ${restoreCandidateIds.size} 套备选计划`
                : '请先上传 .json 备份文件'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] cursor-pointer"
              >
                关闭
              </button>

              {mode === 'backup' ? (
                <MotionButton
                  type="button"
                  disabled={totalSelectedExport === 0}
                  onClick={handleExecuteExport}
                  className="btn-primary min-h-[42px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出选中备份 (.json)</span>
                </MotionButton>
              ) : (
                <MotionButton
                  type="button"
                  disabled={totalRestoreSelected === 0 || isRestoring}
                  onClick={handleExecuteRestore}
                  className="btn-primary min-h-[42px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isRestoring ? '正在写入数据库...' : '确认恢复选中项'}</span>
                </MotionButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
