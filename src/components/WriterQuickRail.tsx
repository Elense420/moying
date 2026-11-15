import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Clapperboard,
  Feather,
  GripVertical,
  Layers,
  RotateCcw,
  X,
} from 'lucide-react';
import { Book, CreativeTrack, DramaProject } from '../types';
import { SNAPPY_EASE } from './MotionPrimitives';

interface WriterQuickRailProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  currentBookId?: string;
  books: Book[];
  dramaProjects: DramaProject[];
  activeTrack?: CreativeTrack;
  onSelectBook?: (book: Book) => void;
  onSelectDramaProject?: (project: DramaProject) => void;
  onSwitchTrack?: (track: CreativeTrack) => void;
}

interface FloatingPos {
  x: number;
  y: number;
}

const STORAGE_KEY = 'writer_quick_rail_pos_v1';
const PANEL_WIDTH = 282;

function getDefaultPos(): FloatingPos {
  if (typeof window === 'undefined') return { x: 14, y: 520 };
  const isMobile = window.innerWidth < 1024;
  return {
    x: 14,
    y: Math.max(76, window.innerHeight - (isMobile ? 132 : 68)),
  };
}

function clampPos(pos: FloatingPos, btnW = 128, btnH = 40): FloatingPos {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(8, window.innerWidth - btnW - 8);
  const maxY = Math.max(72, window.innerHeight - btnH - 12);
  return {
    x: Math.round(Math.min(maxX, Math.max(8, pos.x))),
    y: Math.round(Math.min(maxY, Math.max(70, pos.y))),
  };
}

export const WriterQuickRail: React.FC<WriterQuickRailProps> = ({
  isOpen,
  onToggleOpen,
  onClose,
  currentBookId,
  books,
  dramaProjects,
  activeTrack = 'novel',
  onSelectBook,
  onSelectDramaProject,
  onSwitchTrack,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const fabRef = useRef<HTMLButtonElement>(null);

  const [pos, setPos] = useState<FloatingPos>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return clampPos(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
    return getDefaultPos();
  });

  const [isDragging, setIsDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  const dragMetaRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  const getBtnDimensions = useCallback(() => {
    const rect = fabRef.current?.getBoundingClientRect();
    return {
      w: rect?.width && rect.width > 30 ? rect.width : 124,
      h: rect?.height && rect.height > 24 ? rect.height : 40,
    };
  }, []);

  // Determine contextual drawer anchor direction relative to floating button position
  const btnDims = getBtnDimensions();
  const isLowerHalf = pos.y > viewportSize.h * 0.45;
  const isRightSide = pos.x + btnDims.w / 2 > viewportSize.w * 0.55;

  // Sync CSS custom properties cleanly without JSX inline styles
  useEffect(() => {
    const root = document.documentElement;
    const vw = viewportSize.w;
    const vh = viewportSize.h;
    const actualPanelW = Math.min(PANEL_WIDTH, Math.floor(vw * 0.86));

    root.style.setProperty('--quick-rail-x', `${pos.x}px`);
    root.style.setProperty('--quick-rail-y', `${pos.y}px`);

    const panelX = isRightSide
      ? Math.max(10, Math.min(vw - actualPanelW - 10, pos.x + btnDims.w - actualPanelW))
      : Math.max(10, Math.min(vw - actualPanelW - 10, pos.x));

    root.style.setProperty('--quick-rail-panel-x', `${Math.round(panelX)}px`);

    if (isLowerHalf) {
      const bottomOffset = Math.max(14, vh - pos.y + 10);
      const maxH = Math.max(220, Math.min(540, pos.y - 82));
      root.style.setProperty('--quick-rail-panel-offset', `${Math.round(bottomOffset)}px`);
      root.style.setProperty('--quick-rail-panel-max-h', `${Math.round(maxH)}px`);
    } else {
      const topOffset = Math.max(72, pos.y + btnDims.h + 10);
      const maxH = Math.max(220, Math.min(540, vh - topOffset - 16));
      root.style.setProperty('--quick-rail-panel-offset', `${Math.round(topOffset)}px`);
      root.style.setProperty('--quick-rail-panel-max-h', `${Math.round(maxH)}px`);
    }
  }, [pos, viewportSize, isLowerHalf, isRightSide, btnDims.w, btnDims.h]);

  // Re-clamp on viewport resize so button never escapes screen bounds
  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      const { w, h } = getBtnDimensions();
      setPos((prev) => clampPos(prev, w, h));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getBtnDimensions]);

  // Global pointermove / pointerup listeners during active drag
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const meta = dragMetaRef.current;
      if (!meta || !meta.active || e.pointerId !== meta.pointerId) return;

      const dx = e.clientX - meta.startClientX;
      const dy = e.clientY - meta.startClientY;

      if (!meta.moved && Math.hypot(dx, dy) >= 6) {
        meta.moved = true;
        setIsDragging(true);
      }

      if (meta.moved) {
        const { w, h } = getBtnDimensions();
        const next = clampPos(
          { x: meta.originX + dx, y: meta.originY + dy },
          w,
          h
        );
        setPos(next);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const meta = dragMetaRef.current;
      if (!meta || !meta.active || e.pointerId !== meta.pointerId) return;

      if (meta.moved) {
        suppressNextClickRef.current = true;
        const dx = e.clientX - meta.startClientX;
        const dy = e.clientY - meta.startClientY;
        const { w, h } = getBtnDimensions();
        const finalPos = clampPos(
          { x: meta.originX + dx, y: meta.originY + dy },
          w,
          h
        );
        setPos(finalPos);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPos));
        } catch {
          // ignore storage errors
        }
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 80);
      }

      dragMetaRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [getBtnDimensions]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragMetaRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  };

  const handleResetPosition = () => {
    const def = getDefaultPos();
    const { w, h } = getBtnDimensions();
    const clamped = clampPos(def, w, h);
    setPos(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <>
      {/* Draggable Zero-Footprint Floating Toggle Button */}
      <motion.button
        ref={fabRef}
        type="button"
        onPointerDown={handlePointerDown}
        onClick={() => {
          if (suppressNextClickRef.current) return;
          onToggleOpen();
        }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                scale: isDragging ? 1.06 : 1,
              }
        }
        whileHover={shouldReduceMotion || isDragging ? undefined : { scale: 1.03 }}
        whileTap={shouldReduceMotion || isDragging ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 460, damping: 28 }}
        aria-expanded={isOpen}
        title="点击展开/收起悬浮导航 · 按住拖拽可自由移动位置"
        className={`fixed quick-rail-fab z-[92] min-h-[38px] px-2.5 py-1.5 rounded-xl border shadow-lg backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold select-none transition-colors ${
          isDragging
            ? 'cursor-grabbing shadow-2xl ring-2 ring-[var(--accent)]/40'
            : 'cursor-grab hover:border-[var(--accent)]/60'
        } ${
          isOpen
            ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
            : 'bg-[var(--bg-surface)]/95 text-[var(--text-primary)] border-[var(--border-subtle)]'
        }`}
      >
        <GripVertical
          className={`w-3.5 h-3.5 shrink-0 ${
            isOpen ? 'opacity-80' : 'text-[var(--text-muted)]'
          }`}
        />
        {isOpen ? (
          <>
            <X className="w-3.5 h-3.5 shrink-0" />
            <span>收起导航</span>
          </>
        ) : (
          <>
            <Layers className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>切书 / 剧本</span>
          </>
        )}
      </motion.button>

      {/* Animated Backdrop + Floating Overlay Sidebar Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="quick-rail-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              onClick={onClose}
              className="fixed inset-0 z-[88] bg-black/25 dark:bg-black/45 backdrop-blur-[1.5px]"
              aria-hidden="true"
            />

            <motion.aside
              key="quick-rail-drawer"
              onClick={(e) => e.stopPropagation()}
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.9,
                      x: isRightSide ? 14 : -14,
                      y: isLowerHalf ? 18 : -18,
                    }
              }
              animate={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, x: 0, y: 0 }
              }
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scale: 0.92,
                      x: isRightSide ? 10 : -10,
                      y: isLowerHalf ? 14 : -14,
                    }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0.12 }
                  : {
                      type: 'spring',
                      stiffness: 430,
                      damping: 30,
                      mass: 0.78,
                      opacity: { duration: 0.16, ease: SNAPPY_EASE },
                    }
              }
              className={`fixed ${
                isLowerHalf ? 'quick-rail-drawer-bottom' : 'quick-rail-drawer-top'
              } w-[282px] max-w-[86vw] z-[91] studio-card shadow-2xl overflow-hidden flex flex-col bg-[var(--bg-surface)]/98 backdrop-blur-xl`}
            >
              {/* Mode Switcher: Novel vs Drama */}
              <div className="p-3 border-b border-[var(--border-subtle)] space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--text-muted)]">
                    悬浮快捷导航（按钮可拖拽）
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleResetPosition}
                      className="min-h-[26px] px-1.5 flex items-center gap-1 rounded-lg text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] cursor-pointer"
                      title="将悬浮按钮复位至默认左下角"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>复位</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[26px] min-w-[26px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer"
                      aria-label="收起悬浮栏"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl studio-muted text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchTrack?.('novel');
                      onClose();
                    }}
                    className={`min-h-[34px] px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeTrack === 'novel'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                    }`}
                  >
                    <Feather className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>小说模式</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchTrack?.('drama');
                      onClose();
                    }}
                    className={`min-h-[34px] px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      activeTrack === 'drama'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                    }`}
                  >
                    <Clapperboard className="w-3.5 h-3.5 shrink-0" />
                    <span>剧本模式</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Works Lists */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                {/* Novels */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] px-1">
                    <span>连载小说 ({books.length})</span>
                    <span>点击切换</span>
                  </div>
                  {books.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)] px-1 py-2">暂无其他小说立项</p>
                  ) : (
                    <div className="space-y-1">
                      {books.map((b) => {
                        const isActive = b.id === currentBookId;
                        const wordCount = (b.chapters || []).reduce(
                          (acc, ch) => acc + (ch.text?.length || 0),
                          0
                        );
                        const openAlerts = (b.settings?.liveContinuity?.alerts || []).filter(
                          (a) => a.status === 'open'
                        ).length;

                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              onSelectBook?.(b);
                              onClose();
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                              isActive
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]/55 text-[var(--text-primary)]'
                                : 'border-transparent hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-xs font-semibold truncate">{b.title}</span>
                              {openAlerts > 0 && (
                                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                                  {openAlerts}警
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums truncate">
                              {b.chapters.length}章 · {(wordCount / 1000).toFixed(1)}k字
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Drama Projects */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] px-1">
                    <span>漫剧剧本 ({dramaProjects.length})</span>
                    <span>直达改编</span>
                  </div>
                  {dramaProjects.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)] px-1 py-2">暂无漫剧剧本立项</p>
                  ) : (
                    <div className="space-y-1">
                      {dramaProjects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            onSelectDramaProject?.(proj);
                            onClose();
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-xl border border-transparent hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <Clapperboard className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                            <span className="text-xs font-medium truncate">{proj.title}</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums truncate">
                            已写 {proj.episodes?.length || 0}/{proj.totalPlannedEpisodes} 集
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
