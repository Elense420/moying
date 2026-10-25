import React from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { Chapter, ArchivedChapter } from '../types';
import { ModalPortal } from './MotionPrimitives';

interface ReadChapterModalProps {
  chapter: Chapter | ArchivedChapter | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReadChapterModal: React.FC<ReadChapterModalProps> = ({
  chapter,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !chapter) return null;

  const isArchived = 'archivedAt' in chapter;

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-safe bg-black/55 backdrop-blur-xs"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="studio-card w-full sm:max-w-3xl max-h-[90dvh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe"
        >
          <div className="px-4 py-3.5 sm:px-6 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 py-1.5 rounded-xl studio-muted hover:opacity-85 text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回</span>
            </button>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h2 className="text-sm sm:text-lg font-bold text-[var(--text-primary)] truncate font-editorial-serif">
                {chapter.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--text-muted)] tabular-nums mt-0.5 truncate">
                {chapter.text.length.toLocaleString()} 字
                {isArchived && ` · 历史存档 (${new Date((chapter as ArchivedChapter).archivedAt).toLocaleString()})`}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭阅读"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 sm:p-8 overflow-y-auto space-y-6 flex-1">
            <div className="whitespace-pre-wrap chapter-canvas font-editorial-serif text-[var(--text-primary)]">
              {chapter.text}
            </div>

            {chapter.userNextPlotInput && chapter.userNextPlotInput.trim() !== '' && (
              <div className="p-4 rounded-xl studio-muted space-y-1">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  衔接下一章的剧情指令
                </div>
                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {chapter.userNextPlotInput}
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              全文共 {chapter.text.length.toLocaleString()} 字
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-5 py-2 rounded-xl studio-muted text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回上页</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

