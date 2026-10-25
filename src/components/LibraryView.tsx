import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Feather,
  FolderOpen,
  ArrowUpDown,
  BookOpen,
  Sliders,
  Download,
  Copy,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Book } from '../types';
import {
  StaggerCard,
  AnimatedNumber,
  SPRING_INDICATOR,
  MotionButton,
} from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface LibraryViewProps {
  books: Book[];
  onOpenBookDetail: (book: Book) => void;
  onContinueWriting: (book: Book) => void;
  onEditBookSetup: (book: Book) => void;
  onGoToSetup: () => void;
  onOpenDownloadBook?: (bookId: string) => void;
  onRequestDeleteBook?: (bookId: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  onOpenBookDetail,
  onContinueWriting,
  onEditBookSetup,
  onGoToSetup,
  onOpenDownloadBook,
  onRequestDeleteBook,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('全部');
  const [sortOrder, setSortOrder] = useState<'lastModifiedAt_desc' | 'createdAt_desc' | 'words_desc'>('lastModifiedAt_desc');

  const getBookWordCount = (book: Book) =>
    (book.chapters || []).reduce((acc, ch) => acc + (ch.text?.length || 0), 0);

  const totalWordsAllBooks = useMemo(
    () => books.reduce((sum, b) => sum + getBookWordCount(b), 0),
    [books]
  );

  const totalChaptersAllBooks = useMemo(
    () => books.reduce((sum, b) => sum + (b.chapters?.length || 0), 0),
    [books]
  );

  const genreFilters = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      const g = (b.settings?.genre || '').split(/[\/、,，\s]+/)[0]?.trim();
      if (g) set.add(g);
    });
    return ['全部', ...Array.from(set).slice(0, 6)];
  }, [books]);

  const filteredBooks = useMemo(() => {
    return books
      .filter((book) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          book.title.toLowerCase().includes(q) ||
          (book.settings?.genre || '').toLowerCase().includes(q) ||
          (book.settings?.outline || '').toLowerCase().includes(q);
        const matchesGenre =
          selectedGenre === '全部' ||
          (book.settings?.genre || '').includes(selectedGenre);
        return matchesQuery && matchesGenre;
      })
      .sort((a, b) => {
        if (sortOrder === 'lastModifiedAt_desc') return (b.lastModifiedAt || b.createdAt) - (a.lastModifiedAt || a.createdAt);
        if (sortOrder === 'createdAt_desc') return b.createdAt - a.createdAt;
        if (sortOrder === 'words_desc') return getBookWordCount(b) - getBookWordCount(a);
        return 0;
      });
  }, [books, searchQuery, selectedGenre, sortOrder]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Editorial Studio Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div className="space-y-1.5">
          <p className="text-xs text-[var(--text-muted)]">
            个人自由创作书房 · 挂载专属 XP 宪法与世界书 2.0 · 卡片支持鼠标右键快捷菜单
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
            我的长篇作品书架
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[var(--text-secondary)] tabular-nums pt-0.5">
            <span>
              共 <AnimatedNumber value={books.length} className="font-semibold text-[var(--text-primary)]" /> 部作品
            </span>
            <span aria-hidden="true">·</span>
            <span>
              累计 <AnimatedNumber value={totalChaptersAllBooks} className="font-semibold text-[var(--text-primary)]" /> 章
            </span>
            <span aria-hidden="true">·</span>
            <span>
              总计 <AnimatedNumber value={totalWordsAllBooks} className="font-semibold text-[var(--text-primary)]" /> 字
            </span>
          </div>
        </div>

        <MotionButton
          type="button"
          onClick={onGoToSetup}
          className="btn-primary min-h-[44px] px-5 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>开新书立项</span>
        </MotionButton>
      </section>

      {/* Search, Filter & Sort Toolbar */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Segmented Genre Filter with Spring Pill */}
        <div className="flex items-center gap-1 p-1 studio-muted overflow-x-auto no-scrollbar">
          {genreFilters.map((g) => {
            const active = selectedGenre === g;
            return (
              <MotionButton
                key={g}
                type="button"
                onClick={() => setSelectedGenre(g)}
                className={`relative min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="novel-genre-filter-pill"
                    transition={SPRING_INDICATOR}
                    className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                  />
                )}
                <span className="relative z-10">{g}</span>
              </MotionButton>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索书名、题材或梗概..."
              className="studio-input w-full min-h-[42px] pl-9 pr-3.5 py-2 text-xs sm:text-sm"
            />
          </div>

          <div className="relative shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <select
              value={sortOrder}
              onChange={(e: any) => setSortOrder(e.target.value)}
              className="studio-input min-h-[42px] pl-8 pr-7 py-2 text-xs sm:text-sm appearance-none cursor-pointer"
            >
              <option value="lastModifiedAt_desc">最近更新</option>
              <option value="createdAt_desc">最新创建</option>
              <option value="words_desc">字数最多</option>
            </select>
          </div>
        </div>
      </section>

      {/* Books Grid */}
      {filteredBooks.length === 0 ? (
        <div className="studio-card p-10 sm:p-14 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl studio-muted flex items-center justify-center text-[var(--text-muted)]">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              书架暂无匹配作品
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-md mx-auto">
              可尝试清空筛选关键词，或点击下方按钮开启一部全新长篇连载。
            </p>
          </div>
          <MotionButton
            type="button"
            onClick={onGoToSetup}
            className="btn-primary min-h-[44px] px-5 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>立项创作新小说</span>
          </MotionButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredBooks.map((book, idx) => {
            const wordCount = getBookWordCount(book);
            const chapterCount = (book.chapters || []).length;
            const latestChapter = chapterCount > 0 ? book.chapters[chapterCount - 1] : null;
            const activeLoreCount = (book.settings?.lorebook || []).filter((l) => l.enabled).length;

            return (
              <StaggerCard
                key={book.id}
                index={idx}
                onContextMenu={(e) =>
                  openContextMenu(
                    e,
                    [
                      {
                        id: 'ctx-write',
                        label: chapterCount > 0 ? '继续执笔最新章' : '开始撰写第一章',
                        icon: <Feather className="w-3.5 h-3.5" />,
                        onSelect: () => onContinueWriting(book),
                      },
                      {
                        id: 'ctx-setup',
                        label: '编辑作品设定与世界书',
                        icon: <Sliders className="w-3.5 h-3.5" />,
                        onSelect: () => onEditBookSetup(book),
                      },
                      {
                        id: 'ctx-detail',
                        label: '查看章节目录与历史存档',
                        icon: <FolderOpen className="w-3.5 h-3.5" />,
                        onSelect: () => onOpenBookDetail(book),
                      },
                      {
                        id: 'ctx-export',
                        label: '导出电子书 (.txt / .zip)',
                        icon: <Download className="w-3.5 h-3.5" />,
                        disabled: !onOpenDownloadBook,
                        onSelect: () => onOpenDownloadBook?.(book.id),
                      },
                      {
                        id: 'ctx-copy-outline',
                        label: '复制本书大纲梗概',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        dividerBefore: true,
                        onSelect: () => {
                          navigator.clipboard.writeText(
                            `《${book.title}》（${book.settings?.genre || ''}）\n${book.settings?.outline || ''}`
                          );
                          triggerQuickToast(`已复制《${book.title}》大纲梗概`);
                        },
                      },
                      {
                        id: 'ctx-delete',
                        label: '删除该作品...',
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        disabled: !onRequestDeleteBook,
                        onSelect: () => onRequestDeleteBook?.(book.id),
                      },
                    ],
                    `《${book.title}》`
                  )
                }
              >
                <article className="studio-card studio-card-hover p-5 sm:p-6 h-full flex flex-col justify-between group">
                  <div className="space-y-3">
                    {/* Unboxed clean metadata kicker (Zero-Pill Discipline) */}
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
                      <span className="font-medium text-[var(--text-secondary)]">
                        {book.settings?.genre || '未分类题材'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{chapterCount} 章</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{wordCount.toLocaleString()} 字</span>
                      {activeLoreCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{activeLoreCount} 档案</span>
                        </>
                      )}
                    </div>

                    {/* Book Title */}
                    <h2
                      onClick={() => onOpenBookDetail(book)}
                      className="text-lg sm:text-xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1 cursor-pointer font-editorial-serif"
                    >
                      《{book.title}》
                    </h2>

                    {/* Outline Excerpt */}
                    <p
                      onClick={() => onOpenBookDetail(book)}
                      className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed cursor-pointer"
                    >
                      {book.settings?.outline || '暂无大纲摘要，点击设定补充核心故事线。'}
                    </p>

                    {latestChapter && (
                      <p className="text-xs text-[var(--text-muted)] truncate pt-1">
                        最新连载：第 {latestChapter.index} 章 {latestChapter.title}
                      </p>
                    )}
                  </div>

                  {/* Action Footer */}
                  <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <MotionButton
                        type="button"
                        onClick={() => onOpenBookDetail(book)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>目录与导出</span>
                      </MotionButton>
                      <MotionButton
                        type="button"
                        onClick={() => onEditBookSetup(book)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        设定
                      </MotionButton>
                    </div>

                    <MotionButton
                      type="button"
                      onClick={() => onContinueWriting(book)}
                      className="btn-primary min-h-[40px] px-4 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Feather className="w-3.5 h-3.5" />
                      <span>{chapterCount > 0 ? '继续执笔' : '写第一章'}</span>
                    </MotionButton>
                  </div>
                </article>
              </StaggerCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
