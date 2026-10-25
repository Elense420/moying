import React from 'react';
import { X } from 'lucide-react';
import { Chapter, ArchivedChapter } from '../types';

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="studio-card w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate font-editorial-serif">
              {chapter.title}
            </h2>
            <p className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
              {chapter.text.length.toLocaleString()} 字
              {isArchived && ` · 历史存档 (${new Date((chapter as ArchivedChapter).archivedAt).toLocaleString()})`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-xl studio-muted text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            关闭阅读
          </button>
        </div>
      </div>
    </div>
  );
};
