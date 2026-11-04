import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  Sparkles,
  Copy,
  ListOrdered,
  FileText,
  Link2,
  Check,
  Wand2,
} from 'lucide-react';
import { Book, DramaProject } from '../types';
import { MotionButton } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface DramaSourceNovelSidebarProps {
  project: DramaProject;
  books: Book[];
  targetEpisodeIndex: number;
  isGenerating: boolean;
  onBindSourceNovel: (novelId: string) => void;
  onInsertExcerptToDirector: (text: string) => void;
  onAdaptChapterToEpisode: (params: {
    novelTitle: string;
    chapterTitle: string;
    chapterText: string;
  }) => void;
  onClose: () => void;
}

export const DramaSourceNovelSidebar: React.FC<DramaSourceNovelSidebarProps> = ({
  project,
  books,
  targetEpisodeIndex,
  isGenerating,
  onBindSourceNovel,
  onInsertExcerptToDirector,
  onAdaptChapterToEpisode,
  onClose,
}) => {
  const { triggerQuickToast } = useContextMenu();

  const resolvedBookId = useMemo(() => {
    if (project.sourceNovelId && books.some((b) => b.id === project.sourceNovelId)) {
      return project.sourceNovelId;
    }
    return books[0]?.id || '';
  }, [project.sourceNovelId, books]);

  const activeBook = useMemo(
    () => books.find((b) => b.id === resolvedBookId) || null,
    [books, resolvedBookId]
  );

  const [subTab, setSubTab] = useState<'chapters' | 'outlines' | 'bible'>('chapters');
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [fontScale, setFontScale] = useState<'xs' | 'sm' | 'base'>('sm');
  const [copiedFlag, setCopiedFlag] = useState<boolean>(false);

  // Smartly align default chapter index with targetEpisodeIndex (or [对应原著第X章] hint in episodePlan!)
  useEffect(() => {
    if (!activeBook) return;
    if (activeBook.chapters.length === 0) {
      if ((activeBook.settings?.chapterOutlines || []).length > 0) {
        setSubTab('outlines');
      } else {
        setSubTab('bible');
      }
      setSelectedChapterIdx(0);
      return;
    }

    const epPlan = project.episodePlan.find((p) => p.episodeIndex === targetEpisodeIndex);
    const matchChapRef = epPlan?.beatSummary?.match(/原著第\s*(\d+)\s*章/);
    if (matchChapRef && matchChapRef[1]) {
      const targetChapNum = Number(matchChapRef[1]);
      const foundIdx = activeBook.chapters.findIndex((c) => c.index === targetChapNum);
      if (foundIdx >= 0) {
        setSelectedChapterIdx(foundIdx);
        return;
      }
    }

    const fallbackIdx = Math.min(
      activeBook.chapters.length - 1,
      Math.max(0, targetEpisodeIndex - 1)
    );
    setSelectedChapterIdx(fallbackIdx);
  }, [activeBook?.id, targetEpisodeIndex]);

  const currentChapter = activeBook?.chapters?.[selectedChapterIdx] || null;

  const filteredParagraphs = useMemo(() => {
    if (!currentChapter?.text) return [];
    const paras = currentChapter.text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return paras;
    return paras.filter((line) => line.toLowerCase().includes(q));
  }, [currentChapter?.text, searchKeyword]);

  const handleQuoteSelectionOrSnippet = () => {
    const selectedText = window.getSelection()?.toString()?.trim();
    if (selectedText && selectedText.length > 2) {
      onInsertExcerptToDirector(`【原作细节对照摘录】：\n${selectedText}`);
      triggerQuickToast('已将选中的原著片段填入剧本执笔台');
      return;
    }
    if (currentChapter) {
      onInsertExcerptToDirector(
        `【严格对照原著《${activeBook?.title}》第${currentChapter.index}章《${currentChapter.title}》情节改编】：保留核心因果与台词锋芒，砍掉静态心理描写。`
      );
      triggerQuickToast(`已关联第 ${currentChapter.index} 章改编指引至执笔台`);
    }
  };

  const fontSizeClass =
    fontScale === 'xs'
      ? 'text-xs leading-relaxed'
      : fontScale === 'base'
      ? 'text-base leading-loose'
      : 'text-sm leading-relaxed';

  return (
    <aside className="studio-card p-4 sm:p-5 space-y-3.5 border-[var(--accent)]/35">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
              原作对照分屏阅读器
            </h3>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            边看原著章节与人设边写剧本，杜绝改编吃书与因果断层
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer shrink-0"
          title="收起原作对照侧边栏"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {books.length === 0 ? (
        <div className="p-8 text-center space-y-2 studio-muted text-xs">
          <p className="font-semibold text-[var(--text-primary)]">小说书库暂无原著作品</p>
          <p className="text-[var(--text-muted)] leading-relaxed">
            可先切换至顶部「小说自由创作」打磨小说大纲与章节，再使用「剧本化」或回到此处分屏对照改编。
          </p>
        </div>
      ) : (
        <>
          {/* Source Novel Selector & Bind Control */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={resolvedBookId}
              onChange={(e) => {
                const nextId = e.target.value;
                onBindSourceNovel(nextId);
              }}
              aria-label="选择对照原著小说"
              className="studio-input flex-1 min-h-[38px] px-3 py-1.5 text-xs font-semibold"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  原著：《{b.title}》（{b.chapters.length}章正文 ·{' '}
                  {(b.settings?.chapterOutlines || []).length}章细纲）
                </option>
              ))}
            </select>

            {activeBook && project.sourceNovelId !== activeBook.id && (
              <button
                type="button"
                onClick={() => {
                  onBindSourceNovel(activeBook.id);
                  triggerQuickToast(`已将《${activeBook.title}》绑定为本漫剧固定原著`);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>绑定原著</span>
              </button>
            )}
          </div>

          {/* 3-Mode Content Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl studio-muted text-xs">
            <button
              type="button"
              onClick={() => setSubTab('chapters')}
              className={`min-h-[32px] rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                subTab === 'chapters'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>章节原文 ({activeBook?.chapters.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('outlines')}
              className={`min-h-[32px] rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                subTab === 'outlines'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <ListOrdered className="w-3 h-3" />
              <span>分章细纲 ({activeBook?.settings?.chapterOutlines?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('bible')}
              className={`min-h-[32px] rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                subTab === 'bible'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>大纲与人设</span>
            </button>
          </div>

          {/* TAB 1: Full Novel Chapter Reader */}
          {subTab === 'chapters' && activeBook && (
            <div className="space-y-3">
              {activeBook.chapters.length === 0 ? (
                <div className="p-6 text-center studio-muted text-xs space-y-2">
                  <p className="text-[var(--text-secondary)]">《{activeBook.title}》尚未撰写章节正文</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    您可以切换至上方「分章细纲」或「大纲与人设」对照设定，或先去小说赛道生成正文。
                  </p>
                </div>
              ) : (
                <>
                  {/* Chapter Navigation & Font Size */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={selectedChapterIdx <= 0}
                      onClick={() => setSelectedChapterIdx((i) => Math.max(0, i - 1))}
                      className="min-h-[36px] min-w-[36px] rounded-lg border border-[var(--border-subtle)] flex items-center justify-center disabled:opacity-35 cursor-pointer"
                      title="上一章"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>

                    <select
                      value={selectedChapterIdx}
                      onChange={(e) => setSelectedChapterIdx(Number(e.target.value))}
                      className="studio-input flex-1 min-h-[36px] px-2.5 py-1 text-xs font-medium truncate"
                    >
                      {activeBook.chapters.map((ch, idx) => (
                        <option key={ch.id} value={idx}>
                          第 {ch.index} 章 · {ch.title} ({ch.text.length}字)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={selectedChapterIdx >= activeBook.chapters.length - 1}
                      onClick={() =>
                        setSelectedChapterIdx((i) =>
                          Math.min(activeBook.chapters.length - 1, i + 1)
                        )
                      }
                      className="min-h-[36px] min-w-[36px] rounded-lg border border-[var(--border-subtle)] flex items-center justify-center disabled:opacity-35 cursor-pointer"
                      title="下一章"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFontScale((s) => (s === 'xs' ? 'sm' : s === 'sm' ? 'base' : 'xs'))
                      }
                      className="min-h-[36px] px-2.5 rounded-lg border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] cursor-pointer shrink-0"
                      title="切换对照字号"
                    >
                      Aa
                    </button>
                  </div>

                  {/* In-Chapter Keyword Filter */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="在本章原文中检索台词、道具或人物细节..."
                      className="studio-input w-full min-h-[34px] pl-8 pr-7 py-1 text-xs"
                    />
                    {searchKeyword && (
                      <button
                        type="button"
                        onClick={() => setSearchKeyword('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Scrollable Chapter Manuscript */}
                  {currentChapter && (
                    <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] max-h-[540px] overflow-y-auto space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] font-editorial-serif">
                          第 {currentChapter.index} 章 · {currentChapter.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(currentChapter.text);
                            setCopiedFlag(true);
                            setTimeout(() => setCopiedFlag(false), 1600);
                          }}
                          className="text-[11px] text-[var(--accent)] flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedFlag ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedFlag ? '已复制' : '复制全文'}</span>
                        </button>
                      </div>

                      {filteredParagraphs.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                          本章未找到包含「{searchKeyword}」的段落
                        </p>
                      ) : (
                        <div className={`space-y-2.5 text-[var(--text-primary)] font-editorial-serif ${fontSizeClass}`}>
                          {filteredParagraphs.map((para, pIdx) => (
                            <p key={pIdx} className="indent-6">
                              {para}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Adaptation Actions */}
                  {currentChapter && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={handleQuoteSelectionOrSnippet}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="涂黑选中上方任意原著句子可精准摘录，未选中则填入本章关联指令"
                      >
                        <Wand2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>摘录选中句至执笔台</span>
                      </button>

                      <MotionButton
                        type="button"
                        disabled={isGenerating}
                        onClick={() =>
                          onAdaptChapterToEpisode({
                            novelTitle: activeBook.title,
                            chapterTitle: currentChapter.title,
                            chapterText: currentChapter.text,
                          })
                        }
                        className="btn-primary min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>按本章改编第 {targetEpisodeIndex} 集剧本</span>
                      </MotionButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: Per-Chapter Brief Outlines */}
          {subTab === 'outlines' && activeBook && (
            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1 text-xs">
              {(activeBook.settings?.chapterOutlines || []).length === 0 ? (
                <div className="p-6 text-center studio-muted space-y-1.5">
                  <p className="text-[var(--text-secondary)]">该小说尚未生成分章细纲</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    可在小说「作品设定 → 03 章节细纲创作台」一键生成每章简明细纲。
                  </p>
                </div>
              ) : (
                (activeBook.settings?.chapterOutlines || []).map((co) => (
                  <div
                    key={co.id}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[var(--text-primary)]">
                        第 {co.chapterIndex} 章《{co.title}》
                      </span>
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => {
                          onInsertExcerptToDirector(
                            `[对照原著第${co.chapterIndex}章《${co.title}》细纲改编]：${co.summary}${
                              co.hookNote ? `（集末卡点：${co.hookNote}）` : ''
                            }`
                          );
                          triggerQuickToast(`已载入原著第 ${co.chapterIndex} 章细纲至执笔台`);
                        }}
                        className="text-[11px] font-semibold text-[var(--accent)] hover:underline shrink-0 cursor-pointer"
                      >
                        填入执笔台
                      </button>
                    </div>
                    <p className="text-[var(--text-secondary)] leading-relaxed">{co.summary}</p>
                    {co.hookNote && (
                      <p className="text-[11px] text-[var(--text-muted)]">章末钩子：{co.hookNote}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Novel Master Outline, Characters & Foreshadowing */}
          {subTab === 'bible' && activeBook && (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 text-xs leading-relaxed">
              {activeBook.settings?.characters && (
                <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                  <h4 className="font-bold text-[var(--text-primary)]">原著主要角色档案</h4>
                  <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
                    {activeBook.settings.characters}
                  </p>
                </div>
              )}

              {activeBook.settings?.world && (
                <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                  <h4 className="font-bold text-[var(--text-primary)]">原著世界观与底层铁律</h4>
                  <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
                    {activeBook.settings.world}
                  </p>
                </div>
              )}

              {(activeBook.settings?.foreshadowLedger || []).length > 0 && (
                <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5">
                  <h4 className="font-bold text-[var(--text-primary)]">原著伏笔台账（防改编遗漏）</h4>
                  {(activeBook.settings?.foreshadowLedger || []).map((f) => (
                    <div key={f.id} className="text-[11px] text-[var(--text-secondary)]">
                      • <strong>{f.name}</strong>（第{f.plantedChapter}章埋 →{' '}
                      {f.expectedResolveChapter || '待回收'}）：{f.note}
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                <h4 className="font-bold text-[var(--text-primary)]">原著故事总大纲</h4>
                <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
                  {activeBook.settings?.outline || '暂无原著大纲'}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
