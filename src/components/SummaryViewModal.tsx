import React from 'react';
import { X } from 'lucide-react';
import { Summary } from '../types';

interface SummaryViewModalProps {
  summary: Summary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SummaryViewModal: React.FC<SummaryViewModalProps> = ({
  summary,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !summary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="studio-card w-full sm:max-w-2xl max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl pb-safe">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--text-primary)] text-base sm:text-lg truncate">
              {summary.title}
            </h3>
            <p className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
              章节 {summary.chapterRange} · {new Date(summary.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
          {summary.content}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-xl studio-muted text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
