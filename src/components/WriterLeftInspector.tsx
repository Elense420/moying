import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Compass,
  Crosshair,
  FileText,
  Layers,
  ListOrdered,
  MapPin,
  Plus,
  Search,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react';
import { Book, NovelChapterOutlineItem } from '../types';
import { NOVEL_SETTING_MODULES } from '../data/novelArchitectureSchema';
import { ensureLiveContinuityState } from '../services/liveContinuityService';

interface WriterLeftInspectorProps {
  book: Book;
  currentChapterIndex: number;
  activeChapterText: string;
  onSelectChapter: (idx: number) => void;
  onFillOutlineIntoDirector: (outlineItem: NovelChapterOutlineItem) => void;
  onLocateKeywordInChapter: (keyword: string) => void;
  onAppendReminderToDirector: (reminderText: string) => void;
  onGoToSetup: () => void;
  isGenerating: boolean;
}

function spanContainsChapter(spanStr: string | undefined, chapNum: number): boolean {
  if (!spanStr) return false;
  const nums = (spanStr.match(/\d+/g) || []).map((n) => Number(n));
  if (nums.length >= 2) {
    return chapNum >= nums[0] && chapNum <= nums[1];
  }
  if (nums.length === 1) {
    return chapNum === nums[0];
  }
  return false;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle || needle.length < 2) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

export const WriterLeftInspector: React.FC<WriterLeftInspectorProps> = ({
  book,
  currentChapterIndex,
  activeChapterText,
  onSelectChapter,
  onFillOutlineIntoDirector,
  onLocateKeywordInChapter,
  onAppendReminderToDirector,
  onGoToSetup,
  isGenerating,
}) => {
  const [activeTab, setActiveTab] = useState<'active_radar' | 'chapters' | 'settings'>('active_radar');
  const [searchQuery, setSearchQuery] = useState('');

  const s = book.settings;
  const draftedChapters = book.chapters || [];
  const activeChapObj = draftedChapters[currentChapterIndex];
  const activeChapNum = activeChapObj?.index || currentChapterIndex + 1;
  const liveState = useMemo(() => ensureLiveContinuityState(book), [book]);
  const q = searchQuery.trim().toLowerCase();

  const openAlertsByChapter = useMemo(() => {
    const map = new Map<number, number>();
    liveState.alerts.forEach((a) => {
      if (a.status === 'open') {
        map.set(a.chapterIndex, (map.get(a.chapterIndex) || 0) + 1);
      }
    });
    return map;
  }, [liveState.alerts]);

  const timelineByChapter = useMemo(() => {
    const map = new Map<number, { storyTimeLabel: string; location: string; keyEvent: string }>();
    liveState.timelineLog.forEach((t) => {
      map.set(t.chapterIndex, {
        storyTimeLabel: t.storyTimeLabel,
        location: t.location,
        keyEvent: t.keyEvent,
      });
    });
    return map;
  }, [liveState.timelineLog]);

  // Active chapter L2 / L3 / L4 alignment
  const activeOutline = useMemo(
    () => (s?.chapterOutlines || []).find((c) => c.chapterIndex === activeChapNum),
    [s?.chapterOutlines, activeChapNum]
  );

  const activeVolume = useMemo(() => {
    if (activeOutline?.volumeId) {
      return (s?.volumePlan || []).find((v) => v.id === activeOutline.volumeId);
    }
    return (s?.volumePlan || []).find((v) => spanContainsChapter(v.chapterSpan, activeChapNum));
  }, [s?.volumePlan, activeOutline?.volumeId, activeChapNum]);

  const activeUnit = useMemo(() => {
    if (activeOutline?.unitId) {
      return (s?.storyUnits || []).find((u) => u.id === activeOutline.unitId);
    }
    return (s?.storyUnits || []).find((u) => spanContainsChapter(u.chapterSpan, activeChapNum));
  }, [s?.storyUnits, activeOutline?.unitId, activeChapNum]);

  const activeTimelineEntry = useMemo(
    () => timelineByChapter.get(activeChapNum),
    [timelineByChapter, activeChapNum]
  );

  const activeDelta = useMemo(
    () => liveState.chapterDeltas.find((d) => d.chapterIndex === activeChapNum),
    [liveState.chapterDeltas, activeChapNum]
  );

  // Merge Character Graph + Live Snapshots & compute active-chapter hits
  const activeCharactersList = useMemo(() => {
    const map = new Map<
      string,
      {
        id?: string;
        name: string;
        roleType: string;
        age?: string;
        rankOrTitle?: string;
        physicalState?: string;
        location?: string;
        epistemicBoundary?: string;
        speechStyle?: string;
        mentions: number;
        inOutline: boolean;
      }
    >();

    (s?.characterGraph || []).forEach((node) => {
      if (!node.name) return;
      map.set(node.name, {
        id: node.id,
        name: node.name,
        roleType: node.roleType,
        physicalState: node.currentStatus,
        epistemicBoundary: node.epistemicBoundary,
        speechStyle: node.speechStyle,
        mentions: 0,
        inOutline: Boolean(activeOutline?.linkedCharacterIds?.includes(node.id)),
      });
    });

    liveState.characterSnapshots.forEach((snap) => {
      if (!snap.name) return;
      const existing = map.get(snap.name);
      map.set(snap.name, {
        id: existing?.id,
        name: snap.name,
        roleType: snap.roleType || existing?.roleType || '角色',
        age: snap.age || '',
        rankOrTitle: snap.rankOrTitle || '',
        physicalState: snap.physicalState || existing?.physicalState || '',
        location: snap.location || '',
        epistemicBoundary: snap.knownSecrets || existing?.epistemicBoundary || '',
        speechStyle: existing?.speechStyle,
        mentions: 0,
        inOutline: existing?.inOutline || false,
      });
    });

    const list = Array.from(map.values()).map((c) => {
      const mentions = countOccurrences(activeChapterText, c.name);
      return { ...c, mentions };
    });

    // Sort: appearing in current chapter OR linked in outline first, then by mention count
    return list
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.rankOrTitle || '').toLowerCase().includes(q) ||
          (c.physicalState || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aActive = a.mentions > 0 || a.inOutline ? 1 : 0;
        const bActive = b.mentions > 0 || b.inOutline ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return b.mentions - a.mentions;
      });
  }, [s?.characterGraph, liveState.characterSnapshots, activeChapterText, activeOutline, q]);

  // Active chapter triggered Lorebook / Scene entries
  const activeLoreList = useMemo(() => {
    const entries = s?.lorebook || [];
    return entries
      .filter((entry) => entry.enabled !== false)
      .map((entry) => {
        const keywordPool = [entry.name, ...(entry.keywords || [])].filter(
          (k) => k && k.trim().length >= 2
        );
        const matchedKeys = keywordPool.filter((k) => activeChapterText.includes(k));
        const summaryText =
          [entry.personality, entry.appearance, entry.behaviorQuirks, entry.mustIncludeTaboos]
            .filter(Boolean)
            .join(' · ') || '已挂载世界书规则';
        return {
          entry,
          matchedKeys,
          summaryText,
          isTriggered: matchedKeys.length > 0 || entry.activationMode === 'constant',
        };
      })
      .filter(
        (item) =>
          !q ||
          item.entry.name.toLowerCase().includes(q) ||
          item.summaryText.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.matchedKeys.length || 0) - (a.matchedKeys.length || 0));
  }, [s?.lorebook, activeChapterText, q]);

  // Active chapter Foreshadow & Key Item highlights
  const activeForeshadowList = useMemo(() => {
    return (s?.foreshadowLedger || [])
      .map((f) => {
        const isPlantedHere = f.plantedChapter === activeChapNum;
        const isResolvedHere = f.resolvedChapter === activeChapNum;
        const isExpectedHere = spanContainsChapter(f.expectedResolveChapter, activeChapNum);
        const isProgressedHere = spanContainsChapter(f.progressedChapters, activeChapNum);
        const isLinkedOutline = Boolean(activeOutline?.linkedForeshadowIds?.includes(f.id));
        const mentions = countOccurrences(activeChapterText, f.name);
        const isHighlighted =
          isPlantedHere ||
          isResolvedHere ||
          isExpectedHere ||
          isProgressedHere ||
          isLinkedOutline ||
          mentions > 0;
        const stageTag = isResolvedHere
          ? '本章收回'
          : isPlantedHere
          ? '本章埋下'
          : isExpectedHere
          ? '待本章回收'
          : isProgressedHere || isLinkedOutline || mentions > 0
          ? '本章推进'
          : '';
        return { item: f, isHighlighted, stageTag, mentions };
      })
      .filter(
        (x) =>
          !q ||
          x.item.name.toLowerCase().includes(q) ||
          x.item.note.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.isHighlighted) - Number(a.isHighlighted));
  }, [s?.foreshadowLedger, activeChapNum, activeOutline, activeChapterText, q]);

  const activeKeyItemsList = useMemo(() => {
    return (s?.keyItemRegistry || [])
      .map((item) => {
        const mentions = countOccurrences(activeChapterText, item.name);
        const isOriginHere = item.originChapter === activeChapNum;
        const isLinkedOutline = Boolean(activeOutline?.linkedItemIds?.includes(item.id));
        const isHighlighted = mentions > 0 || isOriginHere || isLinkedOutline;
        return { item, mentions, isOriginHere, isHighlighted };
      })
      .filter(
        (x) =>
          !q ||
          x.item.name.toLowerCase().includes(q) ||
          x.item.holderName.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.isHighlighted) - Number(a.isHighlighted));
  }, [s?.keyItemRegistry, activeChapterText, activeChapNum, activeOutline, q]);

  const nextChapNum = draftedChapters.length + 1;
  const upcomingOutlines = useMemo(
    () => (s?.chapterOutlines || []).filter((co) => co.chapterIndex >= nextChapNum),
    [s?.chapterOutlines, nextChapNum]
  );

  const activeSystemGroups = useMemo(() => {
    const sys = s?.systemSettings || {};
    const notes = s?.systemCustomNotes || {};
    const groups: Array<{
      moduleName: string;
      items: Array<{ fieldLabel: string; values: string[] }>;
      note?: string;
    }> = [];

    NOVEL_SETTING_MODULES.forEach((mod) => {
      const items: Array<{ fieldLabel: string; values: string[] }> = [];
      mod.fields.forEach((field) => {
        const vals = sys[`${mod.id}.${field.id}`];
        if (Array.isArray(vals) && vals.length > 0) {
          if (
            !q ||
            mod.name.toLowerCase().includes(q) ||
            field.label.toLowerCase().includes(q) ||
            vals.some((v) => v.toLowerCase().includes(q))
          ) {
            items.push({ fieldLabel: field.label, values: vals });
          }
        }
      });
      const note = notes[mod.id]?.trim();
      if (items.length > 0 || (note && (!q || note.toLowerCase().includes(q)))) {
        groups.push({ moduleName: `${mod.indexLabel} ${mod.name}`, items, note });
      }
    });
    return groups;
  }, [s?.systemSettings, s?.systemCustomNotes, q]);

  const onStageCharCount = activeCharactersList.filter((c) => c.mentions > 0 || c.inOutline).length;
  const activeClueCount =
    activeForeshadowList.filter((f) => f.isHighlighted).length +
    activeKeyItemsList.filter((k) => k.isHighlighted).length;

  return (
    <div className="studio-card overflow-hidden flex flex-col lg:h-full">
      {/* FIXED TOP: 3-Tab Switcher + Search + Active Progress Strip */}
      <div className="p-2.5 border-b border-[var(--border-subtle)] space-y-2 shrink-0 bg-[var(--bg-surface)]">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl studio-muted text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('active_radar')}
            className={`min-h-[32px] px-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'active_radar'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Compass className="w-3 h-3 shrink-0 text-[var(--accent)]" />
            <span>本章联动</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`min-h-[32px] px-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer tabular-nums ${
              activeTab === 'chapters'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ListOrdered className="w-3 h-3 shrink-0" />
            <span>目录({draftedChapters.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[32px] px-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-3 h-3 shrink-0" />
            <span>全量设定</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'active_radar'
                ? `过滤第 ${activeChapNum} 章出场角色/伏笔/场景...`
                : activeTab === 'chapters'
                ? '检索章节名、时间、地点...'
                : '检索人物、11大设定、L1-L4大纲...'
            }
            className="studio-input w-full pl-8 pr-3 py-1.5 text-xs"
          />
        </div>

        {/* Active Chapter Progress Telemetry Bar */}
        <div className="px-2 py-1.5 rounded-lg bg-[var(--accent-soft)]/50 border border-[var(--accent)]/25 flex items-center justify-between gap-2 text-[11px] tabular-nums">
          <span className="font-semibold text-[var(--text-primary)] truncate">
            当前第 {activeChapNum} 章 · {onStageCharCount} 角色在场 · {activeClueCount} 线索涉及
          </span>
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">
            {activeTimelineEntry?.location || liveState.currentPrimaryLocation}
          </span>
        </div>
      </div>

      {/* INDEPENDENT SCROLL MIDDLE: Scrollable Inspector Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3.5 text-xs">
        {activeTab === 'active_radar' && (
          <>
            {/* 1. 剧情所在节点 & 时空坐标 */}
            <section className="p-2.5 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-soft)]/25 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>第 {activeChapNum} 章剧情坐标</span>
                </span>
                <span className="text-[10px] font-semibold text-[var(--accent)]">实时高亮</span>
              </div>

              {activeVolume && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                  <strong>所属分卷：</strong>第{activeVolume.volumeIndex}卷《{activeVolume.title}》
                </p>
              )}
              {activeUnit && (
                <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                  <strong>所属单元：</strong>{activeUnit.title}（{activeUnit.coreConflict}）
                </p>
              )}
              <p className="text-[11px] text-[var(--text-secondary)] leading-snug flex items-start gap-1">
                <MapPin className="w-3 h-3 mt-0.5 text-[var(--accent)] shrink-0" />
                <span>
                  {activeTimelineEntry?.storyTimeLabel || liveState.currentStoryTime} ·{' '}
                  {activeTimelineEntry?.location || liveState.currentPrimaryLocation}
                </span>
              </p>

              {activeDelta?.summaryNote && (
                <p className="text-[11px] text-[var(--text-primary)] leading-relaxed pt-1 border-t border-[var(--border-subtle)]/60">
                  <strong>本章已发生推进：</strong>{activeDelta.summaryNote}
                </p>
              )}

              {activeOutline && (
                <div className="pt-1 border-t border-[var(--border-subtle)]/60 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">
                    L4 细纲：《{activeOutline.title}》
                  </p>
                  <p className="leading-snug">{activeOutline.summary}</p>
                  {activeOutline.hookNote && (
                    <p className="text-[var(--accent)]">钩子：{activeOutline.hookNote}</p>
                  )}
                </div>
              )}
            </section>

            {/* 2. 本章出场角色动态高亮（点击定位正文 / 一键写入防穿帮叮嘱） */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>出场角色实时高亮 ({onStageCharCount}/{activeCharactersList.length})</span>
                </h4>
              </div>

              {activeCharactersList.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)] py-2">
                  暂未录入角色图谱，可在「作品设定」补充或在右侧生成章节后自动提取。
                </p>
              ) : (
                <div className="space-y-1.5">
                  {activeCharactersList.map((c) => {
                    const isActiveHere = c.mentions > 0 || c.inOutline;
                    return (
                      <div
                        key={c.name}
                        className={`p-2.5 rounded-xl border space-y-1.5 transition-colors ${
                          isActiveHere
                            ? 'border-[var(--accent)]/60 bg-[var(--accent-soft)]/35'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-[var(--text-primary)] truncate">
                              {c.name}
                            </span>
                            {c.age && (
                              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                                {c.age}
                              </span>
                            )}
                          </div>
                          {isActiveHere ? (
                            <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 tabular-nums">
                              {c.mentions > 0 ? `本章出场·${c.mentions}次` : 'L4细纲出场'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                              未在本章现身
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                          {[c.rankOrTitle || c.roleType, c.physicalState, c.location]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>

                        {c.epistemicBoundary && (
                          <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                            知情边界：{c.epistemicBoundary}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {c.mentions > 0 && (
                            <button
                              type="button"
                              onClick={() => onLocateKeywordInChapter(c.name)}
                              className="min-h-[26px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[10px] font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                            >
                              <Crosshair className="w-3 h-3" />
                              <span>正文定位</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() =>
                              onAppendReminderToDirector(
                                `人物防穿帮锁定【${c.name}】：当前身份/体况「${
                                  c.physicalState || c.rankOrTitle || '按设定'
                                }」，知情权边界「${c.epistemicBoundary || '仅知亲历'}」。`
                              )
                            }
                            className="min-h-[26px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-45"
                          >
                            <Plus className="w-3 h-3" />
                            <span>叮嘱导演台</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 3. 本章伏笔与关键道具线索高亮 */}
            <section className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>伏笔与关键道具进展 ({activeClueCount} 项涉及本章)</span>
              </h4>

              {activeForeshadowList.length === 0 && activeKeyItemsList.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)] py-1">
                  暂无伏笔与关键道具台账记录。
                </p>
              ) : (
                <div className="space-y-1.5">
                  {activeForeshadowList.map(({ item, isHighlighted, stageTag, mentions }) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        isHighlighted
                          ? 'border-amber-500/55 bg-amber-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          [伏笔] {item.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            isHighlighted
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {stageTag || (item.status === 'resolved' ? '已回收' : `拟第${item.expectedResolveChapter || '?'}章收`)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                        {item.note}
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {mentions > 0 && (
                          <button
                            type="button"
                            onClick={() => onLocateKeywordInChapter(item.name)}
                            className="min-h-[24px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>定位</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            onAppendReminderToDirector(
                              `伏笔衔接【${item.name}】：${item.note}`
                            )
                          }
                          className="min-h-[24px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        >
                          <Plus className="w-3 h-3" />
                          <span>推进此伏笔</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activeKeyItemsList.map(({ item, mentions, isOriginHere, isHighlighted }) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        isHighlighted
                          ? 'border-[var(--accent)]/55 bg-[var(--accent-soft)]/30'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          [道具] {item.name}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--accent)] shrink-0">
                          {mentions > 0
                            ? `本章出现·${mentions}次`
                            : isOriginHere
                            ? '本章拟登场'
                            : item.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                        持有：{item.holderName || '待定'} · {item.rulesAndCost}
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {mentions > 0 && (
                          <button
                            type="button"
                            onClick={() => onLocateKeywordInChapter(item.name)}
                            className="min-h-[24px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>定位</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            onAppendReminderToDirector(
                              `道具状态约束【${item.name}】：持有者「${item.holderName}」，规则代价「${item.rulesAndCost}」。`
                            )
                          }
                          className="min-h-[24px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-45"
                        >
                          <Plus className="w-3 h-3" />
                          <span>写入导演台</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 4. 本章触发场景与世界书设定高亮 */}
            {activeLoreList.length > 0 && (
              <section className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>场景与世界观词条 ({activeLoreList.filter((l) => l.isTriggered).length} 项触发)</span>
                </h4>
                <div className="space-y-1.5">
                  {activeLoreList.map(({ entry, matchedKeys, summaryText, isTriggered }) => (
                    <div
                      key={entry.id}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        matchedKeys.length > 0
                          ? 'border-emerald-500/50 bg-emerald-500/8'
                          : isTriggered
                          ? 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/40'
                          : 'border-[var(--border-subtle)] opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          {entry.name}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                          {matchedKeys.length > 0
                            ? `命中：${matchedKeys[0]}`
                            : entry.activationMode === 'constant'
                            ? '全程常驻'
                            : '待命'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-snug">
                        {summaryText}
                      </p>
                      {matchedKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onLocateKeywordInChapter(matchedKeys[0])}
                          className="min-h-[24px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>定位「{matchedKeys[0]}」</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === 'chapters' && (
          <>
            {/* Drafted Chapters */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] px-1 pb-1">
                <span>已成稿章节 ({draftedChapters.length})</span>
                <span className="tabular-nums">
                  {(
                    draftedChapters.reduce((acc, c) => acc + (c.text?.length || 0), 0) /
                    1000
                  ).toFixed(1)}
                  k 字
                </span>
              </div>

              {draftedChapters.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">
                  尚无正文章节，在右侧导演台开启第一章创作
                </p>
              ) : (
                draftedChapters.map((ch, idx) => {
                  const tMeta = timelineByChapter.get(ch.index);
                  if (
                    q &&
                    !ch.title.toLowerCase().includes(q) &&
                    !`第${ch.index}章`.includes(q) &&
                    !(tMeta?.location || '').toLowerCase().includes(q)
                  ) {
                    return null;
                  }
                  const isActive = idx === currentChapterIndex;
                  const alertCount = openAlertsByChapter.get(ch.index) || 0;

                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => onSelectChapter(idx)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer disabled:opacity-60 ${
                        isActive
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/55 text-[var(--text-primary)]'
                          : 'border-transparent hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-semibold truncate">
                          第{ch.index}章 ·{' '}
                          {ch.title.replace(/^第[零一二三四五六七八九十百千万\d]+章[：:\s]*/, '')}
                        </span>
                        {alertCount > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 shrink-0 tabular-nums"
                            title={`本章检出 ${alertCount} 条实时逻辑/连贯预警`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {alertCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums truncate">
                        {(ch.text?.length || 0).toLocaleString()} 字
                        {tMeta ? ` · ${tMeta.storyTimeLabel} · ${tMeta.location}` : ''}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {/* Planned L4 Chapter Outlines */}
            {upcomingOutlines.length > 0 && (
              <div className="space-y-1.5 pt-3 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] px-1">
                  <span>后续 L4 待写细纲 ({upcomingOutlines.length})</span>
                  <span>点击填入导演台</span>
                </div>
                {upcomingOutlines.slice(0, 30).map((co) => {
                  if (
                    q &&
                    !co.title.toLowerCase().includes(q) &&
                    !co.summary.toLowerCase().includes(q)
                  ) {
                    return null;
                  }
                  return (
                    <button
                      key={co.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => onFillOutlineIntoDirector(co)}
                      className="w-full text-left px-2.5 py-2 rounded-xl border border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)]/60 hover:bg-[var(--bg-muted)]/60 transition-colors space-y-1 cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--text-primary)] truncate">
                          待写 第{co.chapterIndex}章 · {co.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {co.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3.5">
            {/* 1. 基础档案与简介 */}
            <section className="space-y-1.5">
              <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>基础档案与商业简介</span>
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                {s?.genre || '未设题材'} · {s?.style || '默认文风'} · {s?.pov || '第三人称'} ·{' '}
                {s?.tense || '顺叙'} · 每章 {s?.chapterWords || 3500} 字
              </p>
              {s?.commercialBlurb && (
                <div className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  <strong className="text-[var(--text-primary)]">商业简介承诺：</strong>
                  {s.commercialBlurb}
                </div>
              )}
            </section>

            {/* 2. 世界观与规则 */}
            {s?.world && (!q || s.world.toLowerCase().includes(q)) && (
              <section className="space-y-1.5 pt-2.5 border-t border-[var(--border-subtle)]">
                <h4 className="font-bold text-[var(--text-primary)]">世界观与力量/制度规则</h4>
                <p className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {s.world}
                </p>
              </section>
            )}

            {/* 3. 11大系统已选核心标签 */}
            {activeSystemGroups.length > 0 && (
              <section className="space-y-1.5 pt-2.5 border-t border-[var(--border-subtle)]">
                <h4 className="font-bold text-[var(--text-primary)]">11 大精细化系统已挂载设定</h4>
                <div className="space-y-2">
                  {activeSystemGroups.map((g) => (
                    <div
                      key={g.moduleName}
                      className="p-2 rounded-lg border border-[var(--border-subtle)] space-y-1 text-[11px]"
                    >
                      <p className="font-semibold text-[var(--text-primary)]">{g.moduleName}</p>
                      {g.items.map((it) => (
                        <p key={it.fieldLabel} className="text-[var(--text-secondary)] leading-snug">
                          <span className="text-[var(--text-muted)]">{it.fieldLabel}：</span>
                          {it.values.join(' / ')}
                        </p>
                      ))}
                      {g.note && <p className="text-[var(--text-muted)]">补充：{g.note}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. 人物设定文本 */}
            {s?.characters && (!q || s.characters.toLowerCase().includes(q)) && (
              <section className="space-y-1.5 pt-2.5 border-t border-[var(--border-subtle)]">
                <h4 className="font-bold text-[var(--text-primary)]">人物设定原档</h4>
                <p className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {s.characters}
                </p>
              </section>
            )}

            {/* 5. 四层拆纲 (L1总纲 / L2分卷 / 核心大纲) */}
            {(s?.outline || s?.masterOutlineSpec || (s?.volumePlan?.length || 0) > 0) && (
              <section className="space-y-2 pt-2.5 border-t border-[var(--border-subtle)]">
                <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>L1–L4 四层拆纲全貌</span>
                </h4>
                {s?.masterOutlineSpec && (
                  <div className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] space-y-1">
                    {s.masterOutlineSpec.corePromise && (
                      <p><strong>核心读者契约：</strong>{s.masterOutlineSpec.corePromise}</p>
                    )}
                    {s.masterOutlineSpec.ultimateEnding && (
                      <p><strong>L1 最终结局定调：</strong>{s.masterOutlineSpec.ultimateEnding}</p>
                    )}
                  </div>
                )}
                {s?.volumePlan && s.volumePlan.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                      L2 分卷纲 ({s.volumePlan.length}卷)
                    </p>
                    {s.volumePlan.map((v) => {
                      const isCurVol = activeVolume?.id === v.id;
                      return (
                        <div
                          key={v.id}
                          className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${
                            isCurVol
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)]/35'
                              : 'border-[var(--border-subtle)]'
                          }`}
                        >
                          <p className="font-semibold text-[var(--text-primary)]">
                            第{v.volumeIndex}卷《{v.title}》（{v.chapterSpan}）
                            {isCurVol ? ' · 当前卷' : ''}
                          </p>
                          <p className="text-[var(--text-secondary)]">{v.stageGoal || v.coreConflict}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {s?.outline && (!q || s.outline.toLowerCase().includes(q)) && (
                  <p className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {s.outline}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* FIXED BOTTOM: Quick Status & Settings Entry */}
      <div className="px-3 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--text-muted)] truncate tabular-nums">
          已锁定 {liveState.characterSnapshots.length} 人物 · {(s?.foreshadowLedger || []).length} 伏笔
        </span>
        <button
          type="button"
          onClick={onGoToSetup}
          className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] font-semibold text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Sliders className="w-3 h-3" />
          <span>修改全书设定</span>
        </button>
      </div>
    </div>
  );
};
