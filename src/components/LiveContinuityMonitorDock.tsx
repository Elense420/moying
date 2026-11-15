import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { Book, LiveContinuityAlert, LiveContinuityCategory } from '../types';
import { ensureLiveContinuityState } from '../services/liveContinuityService';

interface LiveContinuityMonitorDockProps {
  book: Book;
  currentChapterIndex: number; // 0-based index into book.chapters
  isChecking: boolean;
  fixingAlertId: string | null;
  isGenerating: boolean;
  onToggleEnabled: () => void;
  onRunChapterCheck: () => void;
  onFixAlertInChapter: (alert: LiveContinuityAlert) => void;
  onUpdateAlertStatus: (alertId: string, status: 'resolved' | 'dismissed' | 'open') => void;
  onSelectChapterByNumber: (chapNum: number) => void;
}

const CATEGORY_LABEL: Record<LiveContinuityCategory, string> = {
  character_state: '人设/年龄/生死冲突',
  timeline_math: '时间线与时辰算术',
  location_jump: '空间转移异常',
  setting_conflict: '基础设定/简介冲突',
  foreshadow_prop: '伏笔与道具穿帮',
  logic_gap: '因果与剧情漏洞',
};

const SEVERITY_LABEL: Record<LiveContinuityAlert['severity'], string> = {
  critical: '严重红线',
  major: '重要隐患',
  minor: '轻微提示',
};

export const LiveContinuityMonitorDock: React.FC<LiveContinuityMonitorDockProps> = ({
  book,
  currentChapterIndex,
  isChecking,
  fixingAlertId,
  isGenerating,
  onToggleEnabled,
  onRunChapterCheck,
  onFixAlertInChapter,
  onUpdateAlertStatus,
  onSelectChapterByNumber,
}) => {
  const [activeTab, setActiveTab] = useState<'alerts' | 'characters' | 'timeline' | 'deltas'>('alerts');
  const [showResolvedAlerts, setShowResolvedAlerts] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const state = useMemo(() => ensureLiveContinuityState(book), [book]);
  const activeChapNum = book.chapters[currentChapterIndex]?.index || currentChapterIndex + 1;

  const openAlerts = useMemo(
    () => state.alerts.filter((a) => a.status === 'open'),
    [state.alerts]
  );

  const displayedAlerts = useMemo(() => {
    const list = showResolvedAlerts ? state.alerts : openAlerts;
    // Prioritize current chapter alerts first, then severity
    const sevWeight = { critical: 0, major: 1, minor: 2 };
    return [...list].sort((a, b) => {
      const aCur = a.chapterIndex === activeChapNum ? 0 : 1;
      const bCur = b.chapterIndex === activeChapNum ? 0 : 1;
      if (aCur !== bCur) return aCur - bCur;
      if (sevWeight[a.severity] !== sevWeight[b.severity]) {
        return sevWeight[a.severity] - sevWeight[b.severity];
      }
      return b.chapterIndex - a.chapterIndex;
    });
  }, [state.alerts, openAlerts, showResolvedAlerts, activeChapNum]);

  const criticalOpenCount = openAlerts.filter((a) => a.severity === 'critical').length;

  return (
    <section className="studio-card overflow-hidden">
      {/* Slim Pinned Footer Telemetry Strip */}
      <div
        className={`px-3.5 py-2 sm:px-4 flex flex-wrap items-center justify-between gap-2 ${
          isExpanded ? 'border-b border-[var(--border-subtle)]' : ''
        }`}
      >
        <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <div className="flex items-center gap-1.5">
            <Radar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <h3 className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">
              实时监测
            </h3>
            {openAlerts.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>零预警</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap hover:underline cursor-pointer"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>
                  {openAlerts.length} 条预警{criticalOpenCount > 0 ? `(${criticalOpenCount}红线)` : ''}
                </span>
              </button>
            )}
          </div>

          <p className="hidden xl:flex items-center gap-2.5 text-[11px] text-[var(--text-muted)] tabular-nums truncate">
            <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
              <Clock className="w-3 h-3 shrink-0" />
              {state.currentStoryTime}
            </span>
            <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
              <MapPin className="w-3 h-3 shrink-0" />
              {state.currentPrimaryLocation}
            </span>
            <span>至第 {state.lastCheckedChapter} 章</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onToggleEnabled}
            className={`min-h-[28px] px-2 py-0.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50 ${
              state.enabled
                ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
            }`}
            title="开启后，每次写完或批量连写一章后自动更新人物/时间/道具状态账本并实时排查逻辑漏洞"
          >
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span>自动:{state.enabled ? '开' : '关'}</span>
          </button>

          <button
            type="button"
            disabled={isGenerating || isChecking || book.chapters.length === 0}
            onClick={() => {
              setIsExpanded(true);
              onRunChapterCheck();
            }}
            className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-45"
          >
            {isChecking ? (
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            ) : (
              <Activity className="w-3 h-3 shrink-0" />
            )}
            <span>{isChecking ? '监测中...' : `监测第${activeChapNum}章`}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="min-h-[28px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1 whitespace-nowrap cursor-pointer"
            title={isExpanded ? '收起实时监测详情（释放最大正文视野）' : '展开实时监测详情'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{isExpanded ? '收起' : '展开'}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Clean Tab Bar + Independent Scroll Body (Shown when expanded) */}
      {isExpanded && (
        <>
          <div className="px-3.5 sm:px-4 border-b border-[var(--border-subtle)] flex items-center gap-4 overflow-x-auto no-scrollbar text-xs shrink-0">
            {[
              { id: 'alerts', label: `逻辑预警 (${openAlerts.length})` },
              { id: 'characters', label: `人物状态 (${state.characterSnapshots.length})` },
              { id: 'timeline', label: `时间线与地点 (${state.timelineLog.length})` },
              { id: 'deltas', label: `伏笔与道具 (${state.chapterDeltas.length})` },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  className={`py-1.5 border-b-2 font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer tabular-nums ${
                    active
                      ? 'border-[var(--accent)] text-[var(--text-primary)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content with Independent Scroll */}
          <div className="p-3 sm:p-3.5 text-xs max-h-[165px] overflow-y-auto">
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
              <span>
                写中检出的冲突会自动写入后续章节防火墙；建议在继续写下一章前优先消解红色/琥珀预警。
              </span>
              {state.alerts.length > openAlerts.length && (
                <button
                  type="button"
                  onClick={() => setShowResolvedAlerts(!showResolvedAlerts)}
                  className="text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {showResolvedAlerts ? '仅看未处理' : `显示已处理 (${state.alerts.length - openAlerts.length})`}
                </button>
              )}
            </div>

            {displayedAlerts.length === 0 ? (
              <div className="py-6 text-center space-y-1.5 text-[var(--text-muted)]">
                <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="font-medium text-[var(--text-primary)]">
                  当前未检出未解决的写中逻辑矛盾或设定偏离
                </p>
                <p className="text-[11px]">
                  如刚手工修改了正文，可点击右上角「立即监测第 {activeChapNum} 章」重新校准账本。
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayedAlerts.map((alert) => {
                  const isCurrentChap = alert.chapterIndex === activeChapNum;
                  const isFixingThis = fixingAlertId === alert.id;
                  const isDone = alert.status !== 'open';
                  const sevTextClass =
                    alert.severity === 'critical'
                      ? 'text-rose-600 dark:text-rose-400'
                      : alert.severity === 'major'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-sky-600 dark:text-sky-400';

                  return (
                    <div
                      key={alert.id}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        isDone
                          ? 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/35 opacity-70'
                          : alert.severity === 'critical'
                          ? 'border-rose-500/45 bg-rose-500/5'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={`font-bold ${sevTextClass}`}>
                              [{SEVERITY_LABEL[alert.severity]}]
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {CATEGORY_LABEL[alert.category] || '逻辑核查'} · 第 {alert.chapterIndex} 章
                            </span>
                            {alert.status !== 'open' && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                ({alert.status === 'resolved' ? '已修复' : '已忽略'})
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-[var(--text-primary)]">{alert.title}</h4>
                        </div>

                        {!isCurrentChap && (
                          <button
                            type="button"
                            onClick={() => onSelectChapterByNumber(alert.chapterIndex)}
                            className="text-[11px] font-medium text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            跳至第 {alert.chapterIndex} 章
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{alert.detail}</p>

                      {alert.quote && (
                        <p className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-muted)] text-[11px] text-[var(--text-secondary)] italic">
                          原文定位：「{alert.quote}」
                        </p>
                      )}

                      <p className="text-[11px] text-[var(--text-primary)] leading-relaxed">
                        <strong>建议改法：</strong>
                        {alert.suggestion}
                      </p>

                      {alert.status === 'open' && (
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isGenerating || Boolean(fixingAlertId)}
                            onClick={() => onFixAlertInChapter(alert)}
                            className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                          >
                            {isFixingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Wand2 className="w-3 h-3" />
                            )}
                            <span>{isFixingThis ? '正在局部修订...' : 'AI 立即局部修复该章'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateAlertStatus(alert.id, 'resolved')}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>已手工处理</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateAlertStatus(alert.id, 'dismissed')}
                            className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>忽略</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'characters' && (
          <div className="space-y-2.5">
            {state.characterSnapshots.length === 0 ? (
              <p className="text-center py-6 text-[var(--text-muted)]">
                暂无实时人物追踪快照，完成章节生成或点击「立即监测」后自动建立人物档案变化表。
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {state.characterSnapshots.map((c) => (
                  <div
                    key={c.name}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        {c.name}
                        {c.age ? ` · ${c.age}` : ''}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        更新至第 {c.lastUpdatedChapter} 章
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      <strong>身份/境界：</strong>
                      {c.rankOrTitle || '未变动'} · <strong>体况：</strong>
                      {c.physicalState || '正常'}
                    </p>
                    {c.location && (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        <strong>现处位置：</strong>
                        {c.location}
                      </p>
                    )}
                    {c.knownSecrets && (
                      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                        <strong>知情权边界：</strong>
                        {c.knownSecrets}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-2">
            {state.timelineLog.length === 0 ? (
              <p className="text-center py-6 text-[var(--text-muted)]">
                暂无逐章时间线与地点轨迹记录。
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl px-3.5">
                {state.timelineLog.map((ev) => (
                  <div
                    key={ev.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-[var(--text-primary)]">
                        第 {ev.chapterIndex} 章 · {ev.storyTimeLabel} · {ev.location}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        {ev.keyEvent}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectChapterByNumber(ev.chapterIndex)}
                      className="text-[11px] text-[var(--accent)] hover:underline whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
                    >
                      查看该章
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'deltas' && (
          <div className="space-y-3">
            {state.chapterDeltas.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                  分章状态变更与伏笔推进轨迹
                </p>
                {[...state.chapterDeltas].reverse().slice(0, 12).map((d) => (
                  <div
                    key={d.chapterIndex}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--text-primary)]">
                        第 {d.chapterIndex} 章 · {d.storyTime} · {d.currentLocation}
                      </span>
                    </div>
                    {d.characterChanges.length > 0 && (
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        <strong>人物变动：</strong>
                        {d.characterChanges.join('；')}
                      </p>
                    )}
                    {d.propAndClueChanges.length > 0 && (
                      <p className="text-[11px] text-[var(--text-primary)]">
                        <strong>道具/伏笔：</strong>
                        {d.propAndClueChanges.join('；')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {((book.settings?.foreshadowLedger?.length || 0) > 0 ||
              (book.settings?.keyItemRegistry?.length || 0) > 0) && (
              <div className="p-3 rounded-xl bg-[var(--bg-muted)]/50 space-y-1.5 text-[11px]">
                <p className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>全局伏笔与道具实时账本</span>
                </p>
                {book.settings?.foreshadowLedger?.map((f) => (
                  <p key={f.id} className="text-[var(--text-secondary)]">
                    · [伏笔·{f.status === 'resolved' ? '已收回' : f.status === 'fermenting' ? '发酵中' : '已埋下'}] {f.name}（拟第{f.expectedResolveChapter || '?'}章收回）
                  </p>
                ))}
                {book.settings?.keyItemRegistry?.map((item) => (
                  <p key={item.id} className="text-[var(--text-secondary)]">
                    · [道具·{item.status}] {item.name}（持有者：{item.holderName || '待定'}）
                  </p>
                ))}
              </div>
            )}

            {state.chapterDeltas.length === 0 &&
              !(book.settings?.foreshadowLedger?.length) &&
              !(book.settings?.keyItemRegistry?.length) && (
                <p className="text-center py-6 text-[var(--text-muted)]">
                  尚无伏笔或道具流转记录。
                </p>
              )}
          </div>
        )}
          </div>
        </>
      )}
    </section>
  );
};
