import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Feather,
  Download,
  Trash2,
  BookOpen,
  Copy,
  Clapperboard,
  Sparkles,
  Loader2,
  FileCheck2,
} from 'lucide-react';
import {
  Book,
  Chapter,
  ArchivedChapter,
  Summary,
  DramaAspectRatio,
  DramaVisualStyle,
} from '../types';
import { NovelToDramaAdaptationOptions } from '../services/dramaPromptEngine';
import JSZip from 'jszip';
import { MotionButton, StaggerList, StaggerItem, ModalPortal } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface BookDetailModalProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onContinueWriting: (book: Book) => void;
  onOpenDownloadDialog: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onReadChapter: (chapter: Chapter | ArchivedChapter) => void;
  onOpenSummaryView: (summary: Summary) => void;
  onDeleteSummary: (summaryId: string) => void;
  onDramatizeBook?: (book: Book, options: NovelToDramaAdaptationOptions) => Promise<void>;
  isDramatizing?: boolean;
  autoExpandDramatize?: boolean;
  onOpenManuscriptAudit?: (book: Book) => void;
}

const DRAMA_VISUAL_STYLE_OPTIONS: DramaVisualStyle[] = [
  '2.5D精致厚涂精绘',
  '国漫厚涂精绘',
  '新中式古风玄幻',
  '日韩唯美赛璐璐网漫',
  '暗黑赛博霓虹',
  '写实电影感漫剧',
  '美式硬派漫画',
];

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  onClose,
  onContinueWriting,
  onOpenDownloadDialog,
  onDeleteBook,
  onReadChapter,
  onOpenSummaryView,
  onDeleteSummary,
  onDramatizeBook,
  isDramatizing = false,
  autoExpandDramatize = false,
  onOpenManuscriptAudit,
}) => {
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<string[]>([]);
  const [isDramatizePanelOpen, setIsDramatizePanelOpen] = useState<boolean>(autoExpandDramatize);
  const [aspectRatio, setAspectRatio] = useState<DramaAspectRatio>('9:16 竖屏短剧');
  const [episodeDurationSec, setEpisodeDurationSec] = useState<number>(90);
  const [visualStyle, setVisualStyle] = useState<DramaVisualStyle>('2.5D精致厚涂精绘');
  const [totalPlannedEpisodes, setTotalPlannedEpisodes] = useState<number>(60);
  const [initialEpisodePlanCount, setInitialEpisodePlanCount] = useState<number>(12);
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  useEffect(() => {
    if (isOpen) {
      setIsDramatizePanelOpen(Boolean(autoExpandDramatize));
    }
  }, [isOpen, autoExpandDramatize, book?.id]);

  if (!isOpen || !book) return null;

  const toggleArchivedSelection = (id: string) => {
    setSelectedArchivedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleDownloadArchived = async () => {
    if (selectedArchivedIds.length === 0) return;

    const chaptersToDownload = (book.archivedChapters || []).filter((ch) =>
      selectedArchivedIds.includes(ch.id)
    );

    if (chaptersToDownload.length === 1) {
      const chapter = chaptersToDownload[0];
      const content = `【${chapter.title} (存档于 ${new Date(chapter.archivedAt).toLocaleString()})】\n\n${chapter.text}`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      triggerDownload(blob, `[存档] ${book.title} - ${chapter.title}.txt`);
    } else {
      const zip = new JSZip();
      chaptersToDownload.forEach((chapter) => {
        const safeTitle = chapter.title.replace(/[\\/:*?"<>|]/g, '_');
        zip.file(`第${chapter.index}章 - ${safeTitle}.txt`, chapter.text);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(blob, `[存档] ${book.title} (${chaptersToDownload.length}章).zip`);
    }
  };

  const totalWords = (book.chapters || []).reduce((acc, ch) => acc + (ch.text?.length || 0), 0);

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-safe bg-black/55 backdrop-blur-xs"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-3xl max-h-[88dvh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          {/* Header */}
          <div className="px-5 py-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate font-editorial-serif">
              《{book.title}》
            </h2>
            <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-1 tabular-nums">
              <span>{book.settings?.genre || '通用题材'}</span>
              <span aria-hidden="true">·</span>
              <span>{book.chapters.length} 章</span>
              <span aria-hidden="true">·</span>
              <span>{totalWords.toLocaleString()} 字</span>
              <span aria-hidden="true">·</span>
              <span>创建于 {new Date(book.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenManuscriptAudit && (
              <MotionButton
                type="button"
                disabled={isDramatizing || book.chapters.length === 0}
                onClick={() => onOpenManuscriptAudit(book)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 ${
                  (book.manuscriptAudit?.criticalCount || 0) > 0
                    ? 'border-rose-500/45 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)]/50'
                }`}
                title="一键审查全书逻辑、时间线、简介一致度、伏笔回收与多章协同改稿"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>全书终审</span>
              </MotionButton>
            )}

            {onDramatizeBook && (
              <MotionButton
                type="button"
                disabled={isDramatizing}
                onClick={() => setIsDramatizePanelOpen((v) => !v)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isDramatizePanelOpen
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent)]/50'
                }`}
              >
                <Clapperboard className="w-3.5 h-3.5" />
                <span>剧本化</span>
              </MotionButton>
            )}

            <button
              type="button"
              disabled={isDramatizing}
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0 cursor-pointer disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Expandable Novel -> Drama Script Studio Panel (剧本化) */}
          {onDramatizeBook && isDramatizePanelOpen && (
            <section className="p-4 sm:p-5 rounded-2xl border border-[var(--accent)]/45 bg-[var(--accent-soft)]/35 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clapperboard className="w-4 h-4 text-[var(--accent)]" />
                    <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                      小说一键「剧本化」· 转化为 AI 漫剧剧本立项
                    </h3>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    自动读取《{book.title}》的核心大纲（{(book.settings?.outline || '').length}字）、
                    分章细纲（{(book.settings?.chapterOutlines || []).length}章）与已完稿正文（
                    {book.chapters.length}章）作为预设输入，提炼为商业漫剧立项并自动绑定「原作对照分屏」。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDramatizing}
                  onClick={() => setIsDramatizePanelOpen(false)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
                >
                  收起
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-secondary)]">画幅规格</label>
                  <select
                    value={aspectRatio}
                    disabled={isDramatizing}
                    onChange={(e) => setAspectRatio(e.target.value as DramaAspectRatio)}
                    className="studio-input w-full min-h-[38px] px-2.5 py-1.5 text-xs"
                  >
                    <option value="9:16 竖屏短剧">9:16 竖屏短剧</option>
                    <option value="16:9 横屏中剧">16:9 横屏中剧</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-secondary)]">单集目标时长</label>
                  <select
                    value={episodeDurationSec}
                    disabled={isDramatizing}
                    onChange={(e) => setEpisodeDurationSec(Number(e.target.value))}
                    className="studio-input w-full min-h-[38px] px-2.5 py-1.5 text-xs"
                  >
                    <option value={60}>60 秒（快节奏卡点）</option>
                    <option value={90}>90 秒（主流商业标配）</option>
                    <option value={120}>120 秒（深度剧情张力）</option>
                    <option value={180}>180 秒（精品中剧体量）</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[var(--text-secondary)]">漫剧视觉画风</label>
                  <select
                    value={visualStyle}
                    disabled={isDramatizing}
                    onChange={(e) => setVisualStyle(e.target.value as DramaVisualStyle)}
                    className="studio-input w-full min-h-[38px] px-2.5 py-1.5 text-xs"
                  >
                    {DRAMA_VISUAL_STYLE_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--text-secondary)]">规划总集数</label>
                    <select
                      value={totalPlannedEpisodes}
                      disabled={isDramatizing}
                      onChange={(e) => setTotalPlannedEpisodes(Number(e.target.value))}
                      className="studio-input w-full min-h-[38px] px-2 py-1.5 text-xs"
                    >
                      <option value={40}>40 集</option>
                      <option value={60}>60 集</option>
                      <option value={80}>80 集</option>
                      <option value={100}>100 集</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--text-secondary)]">首批细纲</label>
                    <select
                      value={initialEpisodePlanCount}
                      disabled={isDramatizing}
                      onChange={(e) => setInitialEpisodePlanCount(Number(e.target.value))}
                      className="studio-input w-full min-h-[38px] px-2 py-1.5 text-xs"
                    >
                      <option value={10}>前 10 集</option>
                      <option value={12}>前 12 集</option>
                      <option value={16}>前 16 集</option>
                      <option value={20}>前 20 集</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  转化完成后将自动跳转至「AI 漫剧 · 立项与圣经」，原小说数据毫发无损。
                </span>
                <MotionButton
                  type="button"
                  disabled={isDramatizing}
                  onClick={() =>
                    onDramatizeBook(book, {
                      aspectRatio,
                      episodeDurationSec,
                      visualStyle,
                      totalPlannedEpisodes,
                      initialEpisodePlanCount,
                    })
                  }
                  className="btn-primary min-h-[42px] px-5 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isDramatizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI 正在提炼漫剧圣经与分集细纲...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>立即转化为漫剧剧本立项</span>
                    </>
                  )}
                </MotionButton>
              </div>
            </section>
          )}

          {/* Outline Accordion */}
          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsOutlineOpen(!isOutlineOpen)}
              className="w-full min-h-[46px] px-4 py-3 flex items-center justify-between text-left font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
            >
              <span>故事核心大纲</span>
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                {isOutlineOpen ? '收起' : '展开'}
                {isOutlineOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {isOutlineOpen && (
              <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 whitespace-pre-wrap leading-relaxed text-[var(--text-secondary)] text-xs sm:text-sm max-h-60 overflow-y-auto">
                {book.settings?.outline || '未填写大纲'}
              </div>
            )}
          </div>

          {/* Chapters List */}
          <div className="space-y-2.5">
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">
              正文目录 ({book.chapters.length})
            </h3>

            {book.chapters.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
                尚未生成任何章节
              </p>
            ) : (
              <StaggerList className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {book.chapters.map((ch) => (
                  <StaggerItem key={ch.id}>
                    <MotionButton
                      type="button"
                      onClick={() => onReadChapter(ch)}
                      onContextMenu={(e) =>
                        openContextMenu(e, `第 ${ch.index} 章 · ${ch.title}`, [
                          {
                            id: 'read-ch',
                            label: '沉浸阅读本章正文',
                            icon: <BookOpen className="w-3.5 h-3.5" />,
                            onSelect: () => onReadChapter(ch),
                          },
                          {
                            id: 'copy-ch',
                            label: '复制本章全文',
                            icon: <Copy className="w-3.5 h-3.5" />,
                            onSelect: () => {
                              navigator.clipboard?.writeText(`### 第${ch.index}章 ${ch.title}\n\n${ch.text}`);
                              triggerQuickToast(`已复制第 ${ch.index} 章正文`);
                            },
                          },
                          {
                            id: 'dl-ch',
                            label: '单独导出本章 TXT',
                            icon: <Download className="w-3.5 h-3.5" />,
                            dividerBefore: true,
                            onSelect: () => {
                              const blob = new Blob([`### 第${ch.index}章 ${ch.title}\n\n${ch.text}`], {
                                type: 'text/plain;charset=utf-8',
                              });
                              triggerDownload(blob, `${book.title}_第${ch.index}章_${ch.title}.txt`);
                            },
                          },
                        ])
                      }
                      className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-muted)] text-left transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] truncate">
                        第 {ch.index} 章 · {ch.title}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                        {ch.text.length.toLocaleString()} 字
                      </span>
                    </MotionButton>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </div>

          {/* Milestone Summaries */}
          {book.summaries && book.summaries.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-[var(--border-subtle)]">
              <h3 className="font-semibold text-[var(--text-primary)] text-sm">
                阶段剧情总结 ({book.summaries.length})
              </h3>
              <StaggerList className="space-y-2">
                {book.summaries.map((sum) => (
                  <StaggerItem
                    key={sum.id}
                    onContextMenu={(e) =>
                      openContextMenu(e, sum.title || '阶段剧情总结', [
                        {
                          id: 'view-sum',
                          label: '查阅完整总结',
                          icon: <BookOpen className="w-3.5 h-3.5" />,
                          onSelect: () => onOpenSummaryView(sum),
                        },
                        {
                          id: 'copy-sum',
                          label: '复制总结文本',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => {
                            navigator.clipboard?.writeText(sum.content || '');
                            triggerQuickToast('阶段总结已复制');
                          },
                        },
                        {
                          id: 'del-sum',
                          label: '删除该阶段总结',
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          dividerBefore: true,
                          onSelect: () => onDeleteSummary(sum.id),
                        },
                      ])
                    }
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenSummaryView(sum)}
                      className="flex-1 text-left pr-2 cursor-pointer"
                    >
                      <div className="font-medium text-[var(--text-primary)] text-xs sm:text-sm">
                        {sum.title}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                        章节 {sum.chapterRange} · {new Date(sum.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                    <MotionButton
                      type="button"
                      onClick={() => onDeleteSummary(sum.id)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                      title="删除总结"
                    >
                      <Trash2 className="w-4 h-4" />
                    </MotionButton>
                  </StaggerItem>
                ))}
              </StaggerList>
            </div>
          )}

          {/* Archived Chapters */}
          {book.archivedChapters && book.archivedChapters.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">
                  历史重写存档 ({book.archivedChapters.length})
                </h3>
                {selectedArchivedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadArchived}
                    className="px-3 py-1.5 rounded-lg studio-muted text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>导出选中 ({selectedArchivedIds.length})</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {book.archivedChapters.map((arch) => {
                  const isChecked = selectedArchivedIds.includes(arch.id);
                  return (
                    <div
                      key={arch.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[var(--border-subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleArchivedSelection(arch.id)}
                        className="w-4 h-4 rounded-sm cursor-pointer accent-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => onReadChapter(arch)}
                        className="flex-1 text-left truncate text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        {arch.title} · 存档于 {new Date(arch.archivedAt).toLocaleDateString()}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
          <MotionButton
            type="button"
            onClick={() => {
              onClose();
              onDeleteBook(book.id);
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除作品</span>
          </MotionButton>

          <div className="flex flex-wrap items-center gap-2">
            {onDramatizeBook && (
              <MotionButton
                type="button"
                disabled={isDramatizing}
                onClick={() => setIsDramatizePanelOpen(true)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Clapperboard className="w-4 h-4" />
                <span>剧本化</span>
              </MotionButton>
            )}

            <MotionButton
              type="button"
              disabled={isDramatizing}
              onClick={() => onOpenDownloadDialog(book.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>导出电子书</span>
            </MotionButton>

            <MotionButton
              type="button"
              disabled={isDramatizing}
              onClick={() => {
                onClose();
                onContinueWriting(book);
              }}
              className="btn-primary min-h-[44px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Feather className="w-4 h-4" />
              <span>进入执笔</span>
            </MotionButton>
          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
};
