import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  EyeOff,
  FileCheck2,
  FileDiff,
  GitCompare,
  Layers,
  Loader2,
  LocateFixed,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import {
  ApiConfig,
  ArchivedChapter,
  Book,
  Chapter,
  CoordinatedFixChapterPatch,
  CoordinatedFixPlan,
  ManuscriptAuditCategory,
  ManuscriptAuditIssue,
  ManuscriptAuditReport,
  ManuscriptAuditSeverity,
  UiSettings,
} from '../types';
import {
  AUDIT_CATEGORY_META,
  findQuotePositionInText,
  FullAuditProgressInfo,
  generateCoordinatedFixPlan,
  reviseSingleChapterWithCoordinatedContract,
  runFullManuscriptAudit,
} from '../services/manuscriptAuditEngine';
import { ModalPortal, MotionButton } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface ManuscriptAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book | null;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onSaveBook: (updatedBook: Book) => Promise<void>;
  initialFocusChapterIndex?: number;
}

interface HighlightSegment {
  text: string;
  issueId?: string;
  severity?: ManuscriptAuditSeverity;
  note?: string;
  anchorKey?: string;
}

function buildHighlightedSegments(
  sourceText: string,
  chapterIndex: number,
  issues: ManuscriptAuditIssue[]
): {
  segments: HighlightSegment[];
  unmatchedIssues: ManuscriptAuditIssue[];
} {
  if (!sourceText) {
    return { segments: [{ text: '' }], unmatchedIssues: [] };
  }

  interface MatchSpan {
    start: number;
    end: number;
    issueId: string;
    severity: ManuscriptAuditSeverity;
    note: string;
  }

  const spans: MatchSpan[] = [];
  const unmatchedIssues: ManuscriptAuditIssue[] = [];
  const severityRank: Record<ManuscriptAuditSeverity, number> = { critical: 3, major: 2, minor: 1 };

  for (const iss of issues) {
    if (iss.status === 'resolved' || iss.status === 'ignored') continue;
    const locs = (iss.locations || []).filter((l) => l.chapterIndex === chapterIndex);
    if (locs.length === 0) continue;

    let anyMatchedForThisIssue = false;
    for (const loc of locs) {
      if (!loc.quoteSnippet) continue;
      const pos = findQuotePositionInText(sourceText, loc.quoteSnippet);
      if (pos && pos.end > pos.start) {
        anyMatchedForThisIssue = true;
        spans.push({
          start: pos.start,
          end: pos.end,
          issueId: iss.id,
          severity: iss.severity,
          note: loc.note || iss.title,
        });
      }
    }
    if (!anyMatchedForThisIssue) {
      unmatchedIssues.push(iss);
    }
  }

  if (spans.length === 0) {
    return { segments: [{ text: sourceText }], unmatchedIssues };
  }

  // Sort by start ascending, then higher severity first
  spans.sort((a, b) => a.start - b.start || severityRank[b.severity] - severityRank[a.severity]);

  // De-overlap spans greedily (preserve higher severity or earlier start)
  const resolvedSpans: MatchSpan[] = [];
  for (const sp of spans) {
    const prev = resolvedSpans[resolvedSpans.length - 1];
    if (!prev || sp.start >= prev.end) {
      resolvedSpans.push(sp);
    } else if (severityRank[sp.severity] > severityRank[prev.severity]) {
      // Trim previous if higher severity overrides overlap tail
      if (sp.start > prev.start) {
        prev.end = sp.start;
        resolvedSpans.push(sp);
      } else {
        resolvedSpans[resolvedSpans.length - 1] = sp;
      }
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const sp of resolvedSpans) {
    if (sp.start > cursor) {
      segments.push({ text: sourceText.slice(cursor, sp.start) });
    }
    segments.push({
      text: sourceText.slice(sp.start, sp.end),
      issueId: sp.issueId,
      severity: sp.severity,
      note: sp.note,
      anchorKey: `hl-${sp.issueId}-ch${chapterIndex}`,
    });
    cursor = sp.end;
  }
  if (cursor < sourceText.length) {
    segments.push({ text: sourceText.slice(cursor) });
  }

  return { segments, unmatchedIssues };
}

function computeSimpleLineDiff(oldText: string, newText: string) {
  const oldLines = (oldText || '').split(/\r?\n/);
  const newLines = (newText || '').split(/\r?\n/);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const removed = oldLines.filter((l) => l.trim() && !newSet.has(l));
  const added = newLines.filter((l) => l.trim() && !oldSet.has(l));
  return { removed, added };
}

const SEVERITY_STYLE_MAP: Record<
  ManuscriptAuditSeverity,
  {
    badgeClass: string;
    label: string;
    markClass: string;
    borderClass: string;
  }
> = {
  critical: {
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
    label: '红标·致命硬伤',
    markClass:
      'bg-rose-500/20 text-rose-950 dark:text-rose-100 underline decoration-rose-500 decoration-2 underline-offset-4 rounded px-0.5 cursor-pointer hover:bg-rose-500/35 transition-colors',
    borderClass: 'border-rose-500/45',
  },
  major: {
    badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40',
    label: '橙标·逻辑瑕疵',
    markClass:
      'bg-amber-500/20 text-amber-950 dark:text-amber-100 underline decoration-amber-500 decoration-2 underline-offset-4 rounded px-0.5 cursor-pointer hover:bg-amber-500/35 transition-colors',
    borderClass: 'border-amber-500/45',
  },
  minor: {
    badgeClass: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/40',
    label: '蓝标·细节优化',
    markClass:
      'bg-sky-500/20 text-sky-950 dark:text-sky-100 underline decoration-sky-500 decoration-wavy underline-offset-4 rounded px-0.5 cursor-pointer hover:bg-sky-500/35 transition-colors',
    borderClass: 'border-sky-500/45',
  },
};

export const ManuscriptAuditModal: React.FC<ManuscriptAuditModalProps> = ({
  isOpen,
  onClose,
  book,
  configs,
  uiSettings,
  onSaveBook,
  initialFocusChapterIndex,
}) => {
  const { triggerQuickToast } = useContextMenu();

  const sortedChapters = useMemo(
    () => [...(book?.chapters || [])].sort((a, b) => a.index - b.index),
    [book?.chapters]
  );

  const totalBookChars = useMemo(
    () => sortedChapters.reduce((sum, ch) => sum + (ch.text?.length || 0), 0),
    [sortedChapters]
  );

  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(1);
  const [reuseCachedLedger, setReuseCachedLedger] = useState<boolean>(true);

  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditProgress, setAuditProgress] = useState<FullAuditProgressInfo | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);
  const [auditError, setAuditError] = useState<string>('');

  // Navigation & Filters
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'review' | 'ledger'>('review');
  const [mobileSubView, setMobileSubView] = useState<'issues' | 'manuscript'>('issues');
  const [viewedChapterIndex, setViewedChapterIndex] = useState<number>(1);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | ManuscriptAuditSeverity | 'resolved' | 'ignored'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ManuscriptAuditCategory>('all');
  const [chapterFilter, setChapterFilter] = useState<'all' | number>('all');

  // Revision Execution States
  const [planningIssueId, setPlanningIssueId] = useState<string | null>(null);
  const [executingIssueId, setExecutingIssueId] = useState<string | null>(null);
  const [executingChapterLabel, setExecutingChapterLabel] = useState<string>('');
  const [expandedFixIssueIds, setExpandedFixIssueIds] = useState<Record<string, boolean>>({});
  const [diffExpandedKeys, setDiffExpandedKeys] = useState<Record<string, boolean>>({});

  const readerContainerRef = useRef<HTMLDivElement>(null);
  const issueListContainerRef = useRef<HTMLDivElement>(null);
  const debounceSaveTimerRef = useRef<number | null>(null);

  const [localReport, setLocalReport] = useState<ManuscriptAuditReport | undefined>(
    book?.manuscriptAudit
  );

  useEffect(() => {
    setLocalReport(book?.manuscriptAudit);
  }, [book?.id, book?.manuscriptAudit]);

  useEffect(() => {
    return () => {
      if (debounceSaveTimerRef.current) {
        window.clearTimeout(debounceSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen && sortedChapters.length > 0) {
      const firstIdx = sortedChapters[0].index;
      const lastIdx = sortedChapters[sortedChapters.length - 1].index;
      setRangeStart(firstIdx);
      setRangeEnd(lastIdx);
      setViewedChapterIndex(
        initialFocusChapterIndex && sortedChapters.some((c) => c.index === initialFocusChapterIndex)
          ? initialFocusChapterIndex
          : firstIdx
      );
      setAuditError('');
    }
  }, [isOpen, book?.id, initialFocusChapterIndex]);

  if (!isOpen || !book) return null;

  const report: ManuscriptAuditReport | undefined = localReport;
  const issues: ManuscriptAuditIssue[] = report?.issues || [];

  const getActiveApi = () => {
    const cfg = (configs || []).find((c) => c?.id === uiSettings?.writerApiCfgId) || configs?.[0];
    const model = uiSettings?.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  const normalizeReportCounts = (nextReport: ManuscriptAuditReport): ManuscriptAuditReport => {
    let c = 0, m = 0, n = 0;
    for (const iss of nextReport.issues) {
      if (iss.status === 'resolved' || iss.status === 'ignored') continue;
      if (iss.severity === 'critical') c++;
      else if (iss.severity === 'major') m++;
      else n++;
    }
    return {
      ...nextReport,
      criticalCount: c,
      majorCount: m,
      minorCount: n,
    };
  };

  const persistReport = async (nextReport: ManuscriptAuditReport, extraBookPatch?: Partial<Book>) => {
    if (debounceSaveTimerRef.current) {
      window.clearTimeout(debounceSaveTimerRef.current);
      debounceSaveTimerRef.current = null;
    }
    const normalizedReport = normalizeReportCounts(nextReport);
    setLocalReport(normalizedReport);
    const updatedBook: Book = {
      ...book,
      ...extraBookPatch,
      manuscriptAudit: normalizedReport,
      lastModifiedAt: Date.now(),
    };
    await onSaveBook(updatedBook);
  };

  const updateSingleIssueDebounced = (
    issueId: string,
    updater: (prev: ManuscriptAuditIssue) => ManuscriptAuditIssue
  ) => {
    if (!report) return;
    const nextIssues = report.issues.map((iss) => (iss.id === issueId ? updater(iss) : iss));
    const nextReport = normalizeReportCounts({ ...report, issues: nextIssues });
    setLocalReport(nextReport);
    if (debounceSaveTimerRef.current) {
      window.clearTimeout(debounceSaveTimerRef.current);
    }
    debounceSaveTimerRef.current = window.setTimeout(() => {
      onSaveBook({
        ...book,
        manuscriptAudit: nextReport,
        lastModifiedAt: Date.now(),
      }).catch(() => {});
    }, 450);
  };

  // Trigger Full-Book Audit
  const handleStartAudit = async () => {
    if (sortedChapters.length === 0 || isAuditing) return;
    const { cfg, model } = getActiveApi();
    const controller = new AbortController();
    auditAbortRef.current = controller;

    setIsAuditing(true);
    setAuditError('');
    setAuditProgress({
      phase: 'prescan',
      percent: 4,
      message: '正在准备全书终审上下文...',
    });

    try {
      const minCh = Math.min(rangeStart, rangeEnd);
      const maxCh = Math.max(rangeStart, rangeEnd);
      const newReport = await runFullManuscriptAudit({
        book,
        cfg,
        model,
        startChapter: minCh,
        endChapter: maxCh,
        reuseCachedFactLedger: reuseCachedLedger,
        signal: controller.signal,
        onProgress: (info) => setAuditProgress(info),
      });

      await persistReport(newReport);
      setActiveWorkspaceTab('review');
      setSeverityFilter('all');
      if (newReport.issues.length > 0) {
        const firstIssue = newReport.issues[0];
        setSelectedIssueId(firstIssue.id);
        const firstLoc = firstIssue.locations?.[0];
        if (firstLoc) setViewedChapterIndex(firstLoc.chapterIndex);
      }
      triggerQuickToast(`全书终审完成：共检出 ${newReport.issues.length} 条问题`);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setAuditError('已手动中止本次审查。');
      } else {
        setAuditError(err?.message || '全书审查中断，请检查模型线路后重试。');
      }
    } finally {
      setIsAuditing(false);
      auditAbortRef.current = null;
    }
  };

  const handleStopAudit = () => {
    if (auditAbortRef.current) {
      auditAbortRef.current.abort();
    }
  };

  // Locate & highlight issue in left manuscript reader
  const handleJumpToLocation = (issueId: string, chapterIndex: number) => {
    setSelectedIssueId(issueId);
    setViewedChapterIndex(chapterIndex);
    setMobileSubView('manuscript');
    setTimeout(() => {
      const el = readerContainerRef.current?.querySelector(`[data-hl-key="hl-${issueId}-ch${chapterIndex}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 90);
  };

  const handleClickHighlightInText = (issueId: string) => {
    setSelectedIssueId(issueId);
    setMobileSubView('issues');
    setTimeout(() => {
      const cardEl = issueListContainerRef.current?.querySelector(`[data-issue-card="${issueId}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 80);
  };

  const updateSingleIssue = async (
    issueId: string,
    updater: (prev: ManuscriptAuditIssue) => ManuscriptAuditIssue
  ) => {
    if (!report) return;
    const nextIssues = report.issues.map((iss) => (iss.id === issueId ? updater(iss) : iss));
    await persistReport({ ...report, issues: nextIssues });
  };

  // Step 1: Generate Coordinated Multi-Chapter / Single-Chapter Fix Plan
  const handleGenerateFixPlan = async (issue: ManuscriptAuditIssue) => {
    if (!report || planningIssueId || executingIssueId) return;
    const { cfg, model } = getActiveApi();
    setPlanningIssueId(issue.id);
    setExpandedFixIssueIds((prev) => ({ ...prev, [issue.id]: true }));
    try {
      const plan = await generateCoordinatedFixPlan({
        book,
        issue,
        customInstruction: issue.userCustomInstruction,
        cfg,
        model,
      });

      await updateSingleIssue(issue.id, (prev) => ({
        ...prev,
        status: prev.status === 'open' ? 'planned' : prev.status,
        fixPlan: plan,
      }));
      triggerQuickToast(`已生成协同修改方案（涉及 ${plan.chapterPatches.length} 个正文章节）`);
    } catch (err: any) {
      triggerQuickToast(`生成修改方案失败：${err?.message || '请稍后重试'}`);
    } finally {
      setPlanningIssueId(null);
    }
  };

  // Step 2: Execute Sequential Upstream-Aware AI Revisions
  const handleRunCoordinatedRevisions = async (issue: ManuscriptAuditIssue) => {
    if (!report || !issue.fixPlan || executingIssueId || planningIssueId) return;
    const { cfg, model } = getActiveApi();
    setExecutingIssueId(issue.id);
    setExpandedFixIssueIds((prev) => ({ ...prev, [issue.id]: true }));

    let workingPlan: CoordinatedFixPlan = {
      ...issue.fixPlan,
      chapterPatches: issue.fixPlan.chapterPatches.map((p) => ({ ...p })),
    };

    const upstreamHandOffs: Array<{ chapterIndex: number; summary: string }> = [];

    try {
      for (let i = 0; i < workingPlan.chapterPatches.length; i++) {
        const patch = workingPlan.chapterPatches[i];
        if (patch.status === 'skipped' || patch.status === 'applied') {
          if (patch.appliedHandOffNote) {
            upstreamHandOffs.push({
              chapterIndex: patch.chapterIndex,
              summary: patch.appliedHandOffNote,
            });
          }
          continue;
        }

        const ch = sortedChapters.find((c) => c.index === patch.chapterIndex);
        if (!ch) continue;

        setExecutingChapterLabel(`第 ${patch.chapterIndex} 章 (${i + 1}/${workingPlan.chapterPatches.length})`);
        workingPlan.chapterPatches[i] = { ...patch, status: 'generating', errorMsg: undefined };
        await updateSingleIssue(issue.id, (prev) => ({ ...prev, fixPlan: workingPlan }));

        try {
          const { revisedText, handOffNote } = await reviseSingleChapterWithCoordinatedContract({
            book,
            chapter: ch,
            plan: workingPlan,
            patch,
            upstreamHandOffs,
            userCustomInstruction: issue.userCustomInstruction,
            cfg,
            model,
          });

          upstreamHandOffs.push({ chapterIndex: ch.index, summary: handOffNote });
          workingPlan.chapterPatches[i] = {
            ...patch,
            status: 'ready',
            originalText: ch.text,
            revisedText,
            appliedHandOffNote: handOffNote,
          };
          setDiffExpandedKeys((prev) => ({ ...prev, [`${issue.id}-${ch.index}`]: true }));
        } catch (chapErr: any) {
          workingPlan.chapterPatches[i] = {
            ...patch,
            status: 'error',
            errorMsg: chapErr?.message || '改写失败',
          };
        }

        await updateSingleIssue(issue.id, (prev) => ({ ...prev, fixPlan: workingPlan }));
      }

      const readyCount = workingPlan.chapterPatches.filter((p) => p.status === 'ready').length;
      if (readyCount > 0) {
        triggerQuickToast(`已完成 ${readyCount} 个章节联动修订稿生成，请审阅对比后点击采纳`);
      }
    } finally {
      setExecutingIssueId(null);
      setExecutingChapterLabel('');
    }
  };

  // Step 3: Safely Adopt Generated Revisions into Book (Archive Old Version First!)
  const handleAdoptPatches = async (
    issue: ManuscriptAuditIssue,
    onlyChapterIndex?: number
  ) => {
    if (!report || !issue.fixPlan) return;

    const targetPatches = issue.fixPlan.chapterPatches.filter(
      (p) =>
        p.status === 'ready' &&
        p.revisedText &&
        (onlyChapterIndex === undefined || p.chapterIndex === onlyChapterIndex)
    );

    const shouldApplyBlurb =
      onlyChapterIndex === undefined &&
      Boolean(issue.fixPlan.alsoUpdateBlurb) &&
      Boolean(issue.fixPlan.revisedBlurb?.trim());

    if (targetPatches.length === 0 && !shouldApplyBlurb) {
      triggerQuickToast('暂无待采纳的已生成修订稿');
      return;
    }

    const updatedChapters: Chapter[] = [...book.chapters];
    const nextArchives: ArchivedChapter[] = [...(book.archivedChapters || [])];
    const now = Date.now();

    const appliedChapterIndices = new Set<number>();
    for (const patch of targetPatches) {
      const idxInArr = updatedChapters.findIndex((c) => c.index === patch.chapterIndex);
      if (idxInArr !== -1 && patch.revisedText) {
        const oldCh = updatedChapters[idxInArr];
        // Safely archive old manuscript before replacing!
        nextArchives.unshift({
          ...oldCh,
          id: `${oldCh.id}-audit-bak-${now}`,
          archivedAt: now,
        });
        updatedChapters[idxInArr] = {
          ...oldCh,
          text: patch.revisedText,
          meta: `${oldCh.meta ? `${oldCh.meta} | ` : ''}终审协同精修(${new Date(now).toLocaleTimeString()})`,
        };
        appliedChapterIndices.add(patch.chapterIndex);
      }
    }

    const nextPatches: CoordinatedFixChapterPatch[] = issue.fixPlan.chapterPatches.map((p) =>
      appliedChapterIndices.has(p.chapterIndex) ? { ...p, status: 'applied' } : p
    );
    const allDone = nextPatches.every((p) => p.status === 'applied' || p.status === 'skipped');

    const nextIssues = report.issues.map((iss) =>
      iss.id === issue.id
        ? {
            ...iss,
            status: allDone ? ('resolved' as const) : iss.status,
            fixPlan: {
              ...issue.fixPlan!,
              chapterPatches: nextPatches,
            },
          }
        : iss
    );

    const nextSettings = shouldApplyBlurb
      ? { ...book.settings, commercialBlurb: issue.fixPlan.revisedBlurb!.trim() }
      : book.settings;

    await persistReport(
      { ...report, issues: nextIssues },
      {
        chapters: updatedChapters,
        archivedChapters: nextArchives,
        settings: nextSettings,
      }
    );

    triggerQuickToast(
      `已安全写入 ${appliedChapterIndices.size} 章修订稿${shouldApplyBlurb ? '并同步商业简介' : ''}（原稿已自动存档）`
    );
  };

  // Filtered issue list
  const filteredIssues = useMemo(() => {
    return issues.filter((iss) => {
      if (severityFilter === 'resolved') {
        if (iss.status !== 'resolved') return false;
      } else if (severityFilter === 'ignored') {
        if (iss.status !== 'ignored') return false;
      } else {
        if (iss.status === 'resolved' || iss.status === 'ignored') return false;
        if (severityFilter !== 'all' && iss.severity !== severityFilter) return false;
      }

      if (categoryFilter !== 'all' && iss.category !== categoryFilter) return false;
      if (
        chapterFilter !== 'all' &&
        !(iss.locations || []).some((l) => l.chapterIndex === chapterFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [issues, severityFilter, categoryFilter, chapterFilter]);

  // Chapter issue counts for selector badges
  const chapterOpenIssueSummary = useMemo(() => {
    const map = new Map<number, { critical: number; major: number; minor: number }>();
    for (const iss of issues) {
      if (iss.status === 'resolved' || iss.status === 'ignored') continue;
      const seen = new Set<number>();
      for (const loc of iss.locations || []) {
        if (seen.has(loc.chapterIndex)) continue;
        seen.add(loc.chapterIndex);
        const cur = map.get(loc.chapterIndex) || { critical: 0, major: 0, minor: 0 };
        cur[iss.severity]++;
        map.set(loc.chapterIndex, cur);
      }
    }
    return map;
  }, [issues]);

  const viewedChapterObj = sortedChapters.find((c) => c.index === viewedChapterIndex);
  const viewedSourceText =
    viewedChapterIndex === 0
      ? `【作品商业简介】\n${book.settings?.commercialBlurb || '（未填写商业简介）'}\n\n【核心大纲设定】\n${book.settings?.outline || '（未填写核心大纲）'}`
      : viewedChapterObj?.text || '';

  const { segments: highlightedSegments, unmatchedIssues: unmatchedForViewedChapter } = useMemo(
    () => buildHighlightedSegments(viewedSourceText, viewedChapterIndex, issues),
    [viewedSourceText, viewedChapterIndex, issues]
  );

  const isLongNovel = totalBookChars > 34000 || sortedChapters.length > 14;

  const resolvedCount = issues.filter((i) => i.status === 'resolved').length;
  const ignoredCount = issues.filter((i) => i.status === 'ignored').length;

  return (
    <ModalPortal onEscape={() => { if (!isAuditing && !executingIssueId) onClose(); }}>
      <div
        onClick={() => { if (!isAuditing && !executingIssueId) onClose(); }}
        className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-safe bg-black/65 backdrop-blur-xs"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-[1440px] h-[94dvh] sm:h-[92vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          {/* ================= Top Control Header ================= */}
          <header className="px-4 py-3.5 sm:px-6 border-b border-[var(--border-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0 bg-[var(--bg-surface)]">
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
                  <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate font-editorial-serif">
                    《{book.title}》出版级全书逻辑终审与跨章协同改稿台
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums">
                  <span>共 {sortedChapters.length} 章</span>
                  <span aria-hidden="true">·</span>
                  <span>{totalBookChars.toLocaleString()} 字</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[var(--text-secondary)]">
                    策略：{isLongNovel ? '长篇 Map-Reduce 分层账本 + 回读核验' : '短篇全量直读死磕审校'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isAuditing || Boolean(executingIssueId)}
                onClick={onClose}
                className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0 cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope & Launch Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs bg-[var(--bg-muted)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] tabular-nums">
                <span className="text-[var(--text-muted)]">范围</span>
                <input
                  type="number"
                  min={sortedChapters[0]?.index || 1}
                  max={sortedChapters[sortedChapters.length - 1]?.index || 1}
                  disabled={isAuditing}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.max(1, Number(e.target.value) || 1))}
                  className="w-12 bg-transparent text-center font-semibold text-[var(--text-primary)] focus:outline-none"
                />
                <span className="text-[var(--text-muted)]">-</span>
                <input
                  type="number"
                  min={sortedChapters[0]?.index || 1}
                  max={sortedChapters[sortedChapters.length - 1]?.index || 1}
                  disabled={isAuditing}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Math.max(1, Number(e.target.value) || 1))}
                  className="w-12 bg-transparent text-center font-semibold text-[var(--text-primary)] focus:outline-none"
                />
                <span className="text-[var(--text-muted)]">章</span>
              </div>

              {isLongNovel && (
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none px-2 py-1">
                  <input
                    type="checkbox"
                    checked={reuseCachedLedger}
                    disabled={isAuditing}
                    onChange={(e) => setReuseCachedLedger(e.target.checked)}
                    className="rounded border-[var(--border-subtle)] accent-[var(--accent)]"
                  />
                  <span>复用未改动章账本</span>
                </label>
              )}

              {isAuditing ? (
                <MotionButton
                  type="button"
                  onClick={handleStopAudit}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>中止审查</span>
                </MotionButton>
              ) : (
                <MotionButton
                  type="button"
                  disabled={sortedChapters.length === 0 || Boolean(executingIssueId)}
                  onClick={handleStartAudit}
                  className="btn-primary min-h-[40px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{report ? '重新全面审查' : '一键审查全文'}</span>
                </MotionButton>
              )}

              <button
                type="button"
                disabled={isAuditing || Boolean(executingIssueId)}
                onClick={onClose}
                className="hidden lg:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0 cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* ================= Live Audit Progress / Error Strip ================= */}
          {(isAuditing || auditError) && (
            <div className="px-4 py-3 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-muted)]/60 shrink-0 space-y-2">
              {isAuditing && auditProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                      <span>{auditProgress.message}</span>
                    </div>
                    <span className="font-mono text-[var(--text-secondary)] tabular-nums shrink-0">
                      {auditProgress.percent}%
                    </span>
                  </div>
                  <progress
                    value={auditProgress.percent}
                    max={100}
                    className="w-full h-1.5 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-[var(--border-subtle)] [&::-webkit-progress-value]:bg-[var(--accent)] [&::-webkit-progress-value]:transition-all"
                  />
                </div>
              )}
              {auditError && (
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{auditError}</span>
                </div>
              )}
            </div>
          )}

          {/* ================= Empty Initial State ================= */}
          {!report && !isAuditing && (
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex items-center justify-center">
              <div className="max-w-2xl w-full space-y-6 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/12 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <FileCheck2 className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-[var(--text-primary)] font-editorial-serif">
                    全书发布前“挑刺总编”终审工作台
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                    专门针对 AI 写完长短篇后常见的致命穿帮进行地毯式排雷：对照简介是否货不对板、年号与古代时辰算术错乱、左右手/凶手伏笔打架、证据只靠嘴说未实际展示、关键人物死因引发的道德污点、双重身份铺垫缺失、降智巧合与官职避讳硬伤。
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left text-xs">
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
                    <div className="font-semibold text-rose-600 dark:text-rose-400">1. 分级标色精准定位</div>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                      按红标致命/橙标瑕疵/蓝标润色三级高亮正文句段，点击旁注一键跳至对应章节原句。
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
                    <div className="font-semibold text-amber-600 dark:text-amber-400">2. 长篇百章分层账本</div>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                      超长篇自动启用 Map-Reduce 事实账本提取 + 分卷折叠对账 + 涉事章原文回读核验，百万字也不怕撑爆窗口。
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">3. 跨章协同联动改稿</div>
                    <p className="text-[var(--text-muted)] leading-relaxed">
                      多章漏洞先定死“全局唯一权威口径”，再按章号顺序带上游回执逐章手术精修，Diff 核对后自动备份原稿写入。
                    </p>
                  </div>
                </div>

                <MotionButton
                  type="button"
                  disabled={sortedChapters.length === 0}
                  onClick={handleStartAudit}
                  className="btn-primary min-h-[46px] px-7 py-2.5 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>立即开始审查《{book.title}》({sortedChapters.length}章)</span>
                </MotionButton>
              </div>
            </div>
          )}

          {/* ================= Report Active Workspace ================= */}
          {report && (
            <>
              {/* Summary & Mode Strip */}
              <div className="px-4 py-2.5 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 shrink-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 p-1 bg-[var(--bg-muted)] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveWorkspaceTab('review')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        activeWorkspaceTab === 'review'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      问题标注与协同修改 ({issues.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveWorkspaceTab('ledger')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        activeWorkspaceTab === 'ledger'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>长篇事实账本 ({report.factLedger.length}章)</span>
                    </button>
                  </div>

                  {/* Mobile sub-switcher when in review tab */}
                  {activeWorkspaceTab === 'review' && (
                    <div className="flex lg:hidden items-center gap-1 p-1 bg-[var(--bg-muted)] rounded-lg">
                      <button
                        type="button"
                        onClick={() => setMobileSubView('issues')}
                        className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                          mobileSubView === 'issues'
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        旁注清单
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileSubView('manuscript')}
                        className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                          mobileSubView === 'manuscript'
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        原文标色
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    红标致命 {report.criticalCount}
                  </span>
                  <span aria-hidden="true" className="text-[var(--border-subtle)]">/</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    橙标瑕疵 {report.majorCount}
                  </span>
                  <span aria-hidden="true" className="text-[var(--border-subtle)]">/</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400">
                    蓝标优化 {report.minorCount}
                  </span>
                  <span aria-hidden="true" className="text-[var(--border-subtle)]">/</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    已解决 {resolvedCount}
                  </span>
                  <span className="hidden sm:inline text-[var(--text-muted)]">
                    · {report.scopeLabel}
                  </span>
                </div>
              </div>

              {/* TAB 1: Split Review & Revision Workspace */}
              {activeWorkspaceTab === 'review' ? (
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                  {/* LEFT PANE (6 cols): Highlighted Manuscript Reader */}
                  <section
                    className={`${
                      mobileSubView === 'manuscript' ? 'flex' : 'hidden lg:flex'
                    } lg:col-span-6 flex-col min-h-0 border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)]`}
                  >
                    {/* Chapter Selector & Legend Bar */}
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <BookOpen className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <select
                            value={viewedChapterIndex}
                            onChange={(e) => setViewedChapterIndex(Number(e.target.value))}
                            className="studio-input min-h-[36px] flex-1 max-w-md px-2.5 py-1 text-xs font-medium truncate"
                          >
                            <option value={0}>
                              第 0 项 · 《商业简介与核心大纲》
                              {(() => {
                                const s = chapterOpenIssueSummary.get(0);
                                return s ? `（红${s.critical} / 橙${s.major} / 蓝${s.minor}）` : '';
                              })()}
                            </option>
                            {sortedChapters.map((ch) => {
                              const s = chapterOpenIssueSummary.get(ch.index);
                              const suffix = s
                                ? ` [红${s.critical} 橙${s.major} 蓝${s.minor}]`
                                : ' [暂无待修]';
                              return (
                                <option key={ch.id} value={ch.index}>
                                  第 {ch.index} 章 · {ch.title}
                                  {suffix}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                          点击正文划色句段可联动右侧改稿单
                        </div>
                      </div>

                      {/* Quick Problematic Chapter Pills */}
                      {chapterOpenIssueSummary.size > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                          <span className="text-[11px] text-[var(--text-muted)] shrink-0">待修章跳转：</span>
                          {Array.from(chapterOpenIssueSummary.entries())
                            .sort((a, b) => a[0] - b[0])
                            .map(([cIdx, stat]) => {
                              const active = viewedChapterIndex === cIdx;
                              return (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => setViewedChapterIndex(cIdx)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap shrink-0 cursor-pointer tabular-nums transition-colors ${
                                    active
                                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                                      : stat.critical > 0
                                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20'
                                      : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                                  }`}
                                >
                                  {cIdx === 0 ? '简介/大纲' : `第${cIdx}章`} · {stat.critical + stat.major + stat.minor}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Scrollable Highlighted Text Body */}
                    <div
                      ref={readerContainerRef}
                      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
                    >
                      {unmatchedForViewedChapter.length > 0 && (
                        <div className="p-3 rounded-xl border border-amber-500/35 bg-amber-500/8 space-y-1.5 text-xs">
                          <div className="font-semibold text-amber-800 dark:text-amber-300">
                            本章另有 {unmatchedForViewedChapter.length} 项全局/隐含缺失类问题（原文未直接出现对应字句，属缺失铺垫或跨章结构冲突）：
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {unmatchedForViewedChapter.map((iss) => (
                              <button
                                key={iss.id}
                                type="button"
                                onClick={() => handleClickHighlightInText(iss.id)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${SEVERITY_STYLE_MAP[iss.severity].badgeClass}`}
                              >
                                {SEVERITY_STYLE_MAP[iss.severity].label}：{iss.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-sm sm:text-[15px] leading-[1.9] whitespace-pre-wrap text-[var(--text-primary)] font-editorial-serif select-text">
                        {highlightedSegments.map((seg, i) => {
                          if (!seg.issueId || !seg.severity) {
                            return <React.Fragment key={i}>{seg.text}</React.Fragment>;
                          }
                          const isFocused = selectedIssueId === seg.issueId;
                          return (
                            <mark
                              key={i}
                              data-hl-key={seg.anchorKey}
                              title={seg.note}
                              onClick={() => handleClickHighlightInText(seg.issueId!)}
                              className={`${SEVERITY_STYLE_MAP[seg.severity].markClass} ${
                                isFocused ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''
                              }`}
                            >
                              {seg.text}
                            </mark>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  {/* RIGHT PANE (6 cols): Margin Annotations + Coordinated Multi-Chapter Patch Engine */}
                  <section
                    className={`${
                      mobileSubView === 'issues' ? 'flex' : 'hidden lg:flex'
                    } lg:col-span-6 flex-col min-h-0 bg-[var(--bg-surface)]`}
                  >
                    {/* Filter Bar */}
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
                      <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-muted)] rounded-xl text-xs">
                        {[
                          { id: 'all', label: `待处理 (${issues.filter((i) => i.status !== 'resolved' && i.status !== 'ignored').length})` },
                          { id: 'critical', label: `红标致命 (${report.criticalCount})` },
                          { id: 'major', label: `橙标瑕疵 (${report.majorCount})` },
                          { id: 'minor', label: `蓝标优化 (${report.minorCount})` },
                          { id: 'resolved', label: `已解决 (${resolvedCount})` },
                          { id: 'ignored', label: `已忽略 (${ignoredCount})` },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSeverityFilter(tab.id as any)}
                            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors tabular-nums ${
                              severityFilter === tab.id
                                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs font-semibold'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value as any)}
                          className="studio-input min-h-[34px] px-2.5 py-1 text-xs flex-1 min-w-[150px]"
                        >
                          <option value="all">全部 10 大问题维度</option>
                          {Object.entries(AUDIT_CATEGORY_META).map(([key, meta]) => (
                            <option key={key} value={key}>
                              {meta.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={chapterFilter}
                          onChange={(e) =>
                            setChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                          }
                          className="studio-input min-h-[34px] px-2.5 py-1 text-xs w-40"
                        >
                          <option value="all">按章节筛选：全部</option>
                          <option value={0}>仅看简介/大纲</option>
                          {sortedChapters.map((c) => (
                            <option key={c.index} value={c.index}>
                              涉及 第 {c.index} 章
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Scrollable Annotations & Patch Plan List */}
                    <div
                      ref={issueListContainerRef}
                      className="flex-1 overflow-y-auto p-4 space-y-4"
                    >
                      {/* Executive Summary & Deterministic Rules Callout */}
                      <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/55 space-y-2 text-xs">
                        <div className="font-semibold text-[var(--text-primary)]">
                          总编全书终审结论
                        </div>
                        <p className="text-[var(--text-secondary)] leading-relaxed">
                          {report.executiveSummary}
                        </p>
                        {report.deterministicHints.length > 0 && (
                          <details className="pt-1">
                            <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-300 select-none">
                              查看本地确定性脚本检出的 {report.deterministicHints.length} 条硬性规则警报
                            </summary>
                            <ul className="mt-1.5 space-y-1 text-[11px] text-[var(--text-secondary)] list-disc pl-4">
                              {report.deterministicHints.map((h, idx) => (
                                <li key={idx}>{h}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>

                      {filteredIssues.length === 0 ? (
                        <div className="py-12 text-center space-y-2 text-xs text-[var(--text-muted)]">
                          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/70" />
                          <p>当前筛选条件下暂无审校问题条目。</p>
                        </div>
                      ) : (
                        filteredIssues.map((issue) => {
                          const sevStyle = SEVERITY_STYLE_MAP[issue.severity];
                          const isSelected = selectedIssueId === issue.id;
                          const isPlanExpanded = Boolean(expandedFixIssueIds[issue.id] || issue.fixPlan);
                          const isPlanningThis = planningIssueId === issue.id;
                          const isExecutingThis = executingIssueId === issue.id;
                          const readyPatchCount = (issue.fixPlan?.chapterPatches || []).filter(
                            (p) => p.status === 'ready'
                          ).length;

                          return (
                            <div
                              key={issue.id}
                              data-issue-card={issue.id}
                              className={`p-4 rounded-2xl border transition-colors space-y-3 bg-[var(--bg-surface)] ${
                                isSelected
                                  ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                                  : sevStyle.borderClass
                              }`}
                            >
                              {/* Issue Header */}
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span
                                      className={`px-2 py-0.5 rounded-md border font-semibold ${sevStyle.badgeClass}`}
                                    >
                                      {sevStyle.label}
                                    </span>
                                    <span className="text-[var(--text-secondary)] font-medium">
                                      {issue.categoryLabel}
                                    </span>
                                    {issue.isCrossChapter && (
                                      <>
                                        <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-0.5">
                                          <Layers className="w-3 h-3" />
                                          跨多章联动
                                        </span>
                                      </>
                                    )}
                                    {issue.status === 'resolved' && (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                        · 已采纳解决
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                                    {issue.title}
                                  </h4>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {issue.status !== 'resolved' ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateSingleIssue(issue.id, (p) => ({ ...p, status: 'resolved' }))
                                      }
                                      className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] text-[var(--text-secondary)] cursor-pointer"
                                      title="手工修改完毕后标记为已解决"
                                    >
                                      标为已改
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateSingleIssue(issue.id, (p) => ({ ...p, status: 'open' }))
                                      }
                                      className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] text-[var(--text-secondary)] cursor-pointer"
                                    >
                                      重开
                                    </button>
                                  )}
                                  {issue.status !== 'ignored' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateSingleIssue(issue.id, (p) => ({ ...p, status: 'ignored' }))
                                      }
                                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer"
                                      title="忽略此建议（作者刻意为之）"
                                    >
                                      <EyeOff className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Issue Description & Editorial Suggestion */}
                              <div className="space-y-2 text-xs leading-relaxed">
                                <p className="text-[var(--text-secondary)]">{issue.description}</p>
                                <div className="p-2.5 rounded-xl bg-[var(--bg-muted)]/70 text-[var(--text-primary)]">
                                  <span className="font-semibold text-[var(--accent)]">修改建议：</span>
                                  {issue.suggestion}
                                </div>
                              </div>

                              {/* Location Jump Anchors */}
                              {(issue.locations || []).length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="text-[var(--text-muted)]">定位涉事处：</span>
                                  {issue.locations.map((loc, lIdx) => (
                                    <button
                                      key={lIdx}
                                      type="button"
                                      onClick={() => handleJumpToLocation(issue.id, loc.chapterIndex)}
                                      className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[var(--text-primary)] flex items-center gap-1 cursor-pointer tabular-nums transition-colors"
                                      title={loc.quoteSnippet ? `摘录：${loc.quoteSnippet}` : loc.note}
                                    >
                                      <LocateFixed className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                      <span>
                                        {loc.chapterIndex === 0 ? '简介/大纲' : `第${loc.chapterIndex}章`}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* User Custom Revision Directive + Trigger AI Plan */}
                              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input
                                    type="text"
                                    disabled={isPlanningThis || isExecutingThis}
                                    value={issue.userCustomInstruction || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      updateSingleIssueDebounced(issue.id, (it) => ({
                                        ...it,
                                        userCustomInstruction: val,
                                      }));
                                    }}
                                    placeholder="可选：补充你的改法指令（如：改年号为建淳；凶手改用左手并在第10章废左腕）"
                                    className="studio-input flex-1 min-h-[36px] px-3 py-1 text-xs"
                                  />

                                  <MotionButton
                                    type="button"
                                    disabled={Boolean(planningIssueId) || Boolean(executingIssueId)}
                                    onClick={() => handleGenerateFixPlan(issue)}
                                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                                  >
                                    {isPlanningThis ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>制定协同方案...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Wand2 className="w-3.5 h-3.5" />
                                        <span>
                                          {issue.fixPlan
                                            ? '重新制定协同方案'
                                            : issue.isCrossChapter
                                            ? 'AI 拟定跨章协同修改方案'
                                            : 'AI 拟定修改方案'}
                                        </span>
                                      </>
                                    )}
                                  </MotionButton>
                                </div>

                                {/* Coordinated Multi-Chapter Patch Workspace */}
                                {issue.fixPlan && (
                                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedFixIssueIds((prev) => ({
                                          ...prev,
                                          [issue.id]: !isPlanExpanded,
                                        }))
                                      }
                                      className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-muted)]/60 cursor-pointer"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <GitCompare className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        <span>
                                          协同改稿方案 · 涉及 {issue.fixPlan.chapterPatches.length} 章
                                          {readyPatchCount > 0 ? `（${readyPatchCount} 章修订稿待采纳）` : ''}
                                        </span>
                                      </span>
                                      {isPlanExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                                      )}
                                    </button>

                                    {isPlanExpanded && (
                                      <div className="p-3.5 pt-2 border-t border-[var(--border-subtle)] space-y-3 text-xs">
                                        {/* Canonical Truth Contract (User Editable!) */}
                                        <div className="space-y-1">
                                          <label className="font-semibold text-[var(--text-primary)] block">
                                            全书唯一权威统一口径契约（可先手动微调再逐章修改）：
                                          </label>
                                          <textarea
                                            rows={3}
                                            disabled={isExecutingThis}
                                            value={issue.fixPlan.canonicalTruthContract}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              updateSingleIssueDebounced(issue.id, (prev) => ({
                                                ...prev,
                                                fixPlan: prev.fixPlan
                                                  ? { ...prev.fixPlan, canonicalTruthContract: val }
                                                  : undefined,
                                              }));
                                            }}
                                            className="studio-input w-full p-2.5 text-xs leading-relaxed"
                                          />
                                        </div>

                                        {/* Blurb Patch if needed */}
                                        {issue.fixPlan.alsoUpdateBlurb && (
                                          <div className="space-y-1 p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/8">
                                            <label className="font-semibold text-amber-800 dark:text-amber-300 block">
                                              同步修正后的商业简介（与正文保持一致）：
                                            </label>
                                            <textarea
                                              rows={3}
                                              disabled={isExecutingThis}
                                              value={issue.fixPlan.revisedBlurb || ''}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                updateSingleIssueDebounced(issue.id, (prev) => ({
                                                  ...prev,
                                                  fixPlan: prev.fixPlan
                                                    ? { ...prev.fixPlan, revisedBlurb: val }
                                                    : undefined,
                                                }));
                                              }}
                                              className="studio-input w-full p-2 text-xs leading-relaxed"
                                            />
                                          </div>
                                        )}

                                        {/* Per-Chapter Sequential Patches */}
                                        <div className="space-y-2">
                                          <div className="font-semibold text-[var(--text-secondary)]">
                                            各章手术任务单（按章号从前到后依次带回执执行）：
                                          </div>
                                          {issue.fixPlan.chapterPatches.map((patch, pIdx) => {
                                            const diffKey = `${issue.id}-${patch.chapterIndex}`;
                                            const isDiffOpen = Boolean(diffExpandedKeys[diffKey]);
                                            const diffInfo =
                                              patch.originalText && patch.revisedText
                                                ? computeSimpleLineDiff(patch.originalText, patch.revisedText)
                                                : null;

                                            return (
                                              <div
                                                key={patch.chapterIndex}
                                                className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2"
                                              >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <div className="font-semibold text-[var(--text-primary)] tabular-nums">
                                                    第 {patch.chapterIndex} 章 · {patch.chapterTitle}
                                                  </div>
                                                  <div className="flex items-center gap-1.5">
                                                    <span
                                                      className={`text-[11px] font-medium ${
                                                        patch.status === 'applied'
                                                          ? 'text-emerald-600 dark:text-emerald-400'
                                                          : patch.status === 'ready'
                                                          ? 'text-[var(--accent)]'
                                                          : patch.status === 'error'
                                                          ? 'text-rose-600'
                                                          : patch.status === 'skipped'
                                                          ? 'text-[var(--text-muted)]'
                                                          : 'text-[var(--text-secondary)]'
                                                      }`}
                                                    >
                                                      {patch.status === 'pending' && '待执行'}
                                                      {patch.status === 'generating' && '正在精修...'}
                                                      {patch.status === 'ready' && '修订稿已就绪'}
                                                      {patch.status === 'applied' && '已安全写入'}
                                                      {patch.status === 'skipped' && '已跳过'}
                                                      {patch.status === 'error' && `失败: ${patch.errorMsg || ''}`}
                                                    </span>

                                                    {patch.status !== 'applied' && (
                                                      <button
                                                        type="button"
                                                        disabled={isExecutingThis}
                                                        onClick={() => {
                                                          updateSingleIssue(issue.id, (prev) => {
                                                            if (!prev.fixPlan) return prev;
                                                            const next = [...prev.fixPlan.chapterPatches];
                                                            next[pIdx] = {
                                                              ...patch,
                                                              status:
                                                                patch.status === 'skipped' ? 'pending' : 'skipped',
                                                            };
                                                            return {
                                                              ...prev,
                                                              fixPlan: { ...prev.fixPlan, chapterPatches: next },
                                                            };
                                                          });
                                                        }}
                                                        className="px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                                      >
                                                        {patch.status === 'skipped' ? '恢复' : '跳过此章'}
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>

                                                <input
                                                  type="text"
                                                  disabled={isExecutingThis || patch.status === 'applied'}
                                                  value={patch.editTargetSummary}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    updateSingleIssueDebounced(issue.id, (prev) => {
                                                      if (!prev.fixPlan) return prev;
                                                      const next = [...prev.fixPlan.chapterPatches];
                                                      next[pIdx] = { ...patch, editTargetSummary: val };
                                                      return {
                                                        ...prev,
                                                        fixPlan: { ...prev.fixPlan, chapterPatches: next },
                                                      };
                                                    });
                                                  }}
                                                  className="studio-input w-full px-2.5 py-1 text-[11px]"
                                                />

                                                {patch.appliedHandOffNote && (
                                                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/8 px-2 py-1 rounded">
                                                    实改回执：{patch.appliedHandOffNote}
                                                  </p>
                                                )}

                                                {patch.status === 'ready' && patch.revisedText && (
                                                  <div className="space-y-2 pt-1">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          setDiffExpandedKeys((prev) => ({
                                                            ...prev,
                                                            [diffKey]: !isDiffOpen,
                                                          }))
                                                        }
                                                        className="text-[11px] font-medium text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                                                      >
                                                        <FileDiff className="w-3.5 h-3.5" />
                                                        <span>
                                                          {isDiffOpen ? '收起对比与修订全文' : '展开逐段改动对比 & 手动微调'}
                                                        </span>
                                                      </button>

                                                      <button
                                                        type="button"
                                                        onClick={() => handleAdoptPatches(issue, patch.chapterIndex)}
                                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                                      >
                                                        <Check className="w-3 h-3" />
                                                        <span>采纳写入第 {patch.chapterIndex} 章</span>
                                                      </button>
                                                    </div>

                                                    {isDiffOpen && (
                                                      <div className="space-y-2 p-2.5 rounded-lg bg-[var(--bg-muted)]/60 border border-[var(--border-subtle)]">
                                                        {diffInfo && (
                                                          <div className="space-y-1.5 text-[11px] max-h-48 overflow-y-auto">
                                                            {diffInfo.removed.map((line, rIdx) => (
                                                              <div
                                                                key={`rem-${rIdx}`}
                                                                className="p-1.5 rounded bg-rose-500/12 text-rose-800 dark:text-rose-200 line-through"
                                                              >
                                                                - {line}
                                                              </div>
                                                            ))}
                                                            {diffInfo.added.map((line, aIdx) => (
                                                              <div
                                                                key={`add-${aIdx}`}
                                                                className="p-1.5 rounded bg-emerald-500/12 text-emerald-900 dark:text-emerald-200"
                                                              >
                                                                + {line}
                                                              </div>
                                                            ))}
                                                            {diffInfo.removed.length === 0 &&
                                                              diffInfo.added.length === 0 && (
                                                                <div className="text-[var(--text-muted)]">
                                                                  正文主要为字词级微调，可直接下方审阅修订全文。
                                                                </div>
                                                              )}
                                                          </div>
                                                        )}

                                                        <div className="space-y-1">
                                                          <span className="text-[11px] font-medium text-[var(--text-muted)]">
                                                            修订后完整正文（支持手动二次修改）：
                                                          </span>
                                                          <textarea
                                                            rows={8}
                                                            value={patch.revisedText}
                                                            onChange={(e) => {
                                                              const val = e.target.value;
                                                              updateSingleIssueDebounced(issue.id, (prev) => {
                                                                if (!prev.fixPlan) return prev;
                                                                const next = [...prev.fixPlan.chapterPatches];
                                                                next[pIdx] = { ...patch, revisedText: val };
                                                                return {
                                                                  ...prev,
                                                                  fixPlan: { ...prev.fixPlan, chapterPatches: next },
                                                                };
                                                              });
                                                            }}
                                                            className="studio-input w-full p-2.5 text-xs leading-relaxed font-editorial-serif"
                                                          />
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Coordinated Execution & Batch Apply Buttons */}
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                          <MotionButton
                                            type="button"
                                            disabled={Boolean(executingIssueId) || Boolean(planningIssueId)}
                                            onClick={() => handleRunCoordinatedRevisions(issue)}
                                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                          >
                                            {isExecutingThis ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                <span>正在协同改写 {executingChapterLabel}...</span>
                                              </>
                                            ) : (
                                              <>
                                                <RefreshCw className="w-3.5 h-3.5" />
                                                <span>按统一口径逐章 AI 生成修订稿</span>
                                              </>
                                            )}
                                          </MotionButton>

                                          {(readyPatchCount > 0 ||
                                            (issue.fixPlan.alsoUpdateBlurb && issue.fixPlan.revisedBlurb)) && (
                                            <MotionButton
                                              type="button"
                                              disabled={Boolean(executingIssueId)}
                                              onClick={() => handleAdoptPatches(issue)}
                                              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              <span>一键采纳全部修订并存档旧稿</span>
                                            </MotionButton>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                /* TAB 2: Long-Novel Fact Ledger Table View */
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        长篇分层“结构化事实账本”（{report.factLedger.length} 章跨篇核心骨架）
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        系统在审校超长篇小说时，会先抽取每章的时间锚点、官职称谓、死亡因果与伏笔流向压入此账本，再对整本账本执行跨百章交叉对账。未修改的章节在后续复审时可秒级增量复用。
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-muted)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                          <th className="p-3 font-semibold whitespace-nowrap">章号 / 标题</th>
                          <th className="p-3 font-semibold min-w-[140px]">时间年号与时长</th>
                          <th className="p-3 font-semibold min-w-[180px]">登场人物与官职状态</th>
                          <th className="p-3 font-semibold min-w-[220px]">核心动作 / 因果证据</th>
                          <th className="p-3 font-semibold min-w-[180px]">伏笔与道具流转</th>
                          <th className="p-3 font-semibold min-w-[160px]">局部红旗疑点</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {report.factLedger.map((card) => (
                          <tr
                            key={card.chapterIndex}
                            className="hover:bg-[var(--bg-muted)]/40 align-top"
                          >
                            <td className="p-3 whitespace-nowrap font-medium text-[var(--text-primary)] tabular-nums">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveWorkspaceTab('review');
                                  setViewedChapterIndex(card.chapterIndex);
                                  setMobileSubView('manuscript');
                                }}
                                className="text-left hover:text-[var(--accent)] cursor-pointer"
                              >
                                <div>第 {card.chapterIndex} 章</div>
                                <div className="text-[11px] text-[var(--text-muted)] max-w-[140px] truncate">
                                  {card.title}
                                </div>
                              </button>
                            </td>
                            <td className="p-3 text-[var(--text-secondary)] leading-relaxed">
                              {card.timeAnchor}
                            </td>
                            <td className="p-3 text-[var(--text-secondary)] leading-relaxed">
                              {card.castAndTitles}
                            </td>
                            <td className="p-3 text-[var(--text-primary)] leading-relaxed">
                              {card.plotAndEvidence}
                            </td>
                            <td className="p-3 text-[var(--text-secondary)] leading-relaxed">
                              {card.cluesAndProps}
                            </td>
                            <td className="p-3">
                              {card.localRedFlags.length > 0 ? (
                                <ul className="space-y-1 text-rose-600 dark:text-rose-400 text-[11px] list-disc pl-3.5">
                                  {card.localRedFlags.map((rf, i) => (
                                    <li key={i}>{rf}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-[var(--text-muted)]">无单章硬伤</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
};
