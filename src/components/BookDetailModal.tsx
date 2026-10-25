import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Feather, Download, Trash2, BookOpen, Copy } from 'lucide-react';
import { Book, Chapter, ArchivedChapter, Summary } from '../types';
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
}

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
}) => {
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<string[]>([]);
  const { openContextMenu, triggerQuickToast } = useContextMenu();

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

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
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

          <div className="flex items-center gap-2">
            <MotionButton
              type="button"
              onClick={() => onOpenDownloadDialog(book.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>导出电子书</span>
            </MotionButton>

            <MotionButton
              type="button"
              onClick={() => {
                onClose();
                onContinueWriting(book);
              }}
              className="btn-primary min-h-[44px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
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
