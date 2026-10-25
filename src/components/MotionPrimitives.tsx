import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion, HTMLMotionProps } from 'motion/react';
import { Loader2 } from 'lucide-react';

export const SNAPPY_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

let activeModalScrollLocks = 0;

/**
 * Portals modals and fullscreen overlays directly to document.body so they escape
 * any parent transform / stacking-context traps (such as PageTransition or StaggerCard),
 * guaranteeing zero occlusion from TopNavbar or MobileBottomNav.
 */
export const ModalPortal: React.FC<{
  children: React.ReactNode;
  onEscape?: () => void;
  lockScroll?: boolean;
}> = ({ children, onEscape, lockScroll = true }) => {
  useEffect(() => {
    if (!lockScroll || typeof document === 'undefined') return;
    activeModalScrollLocks += 1;
    const prevOverflow = document.body.style.overflow;
    if (activeModalScrollLocks === 1) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      activeModalScrollLocks = Math.max(0, activeModalScrollLocks - 1);
      if (activeModalScrollLocks === 0) {
        document.body.style.overflow = prevOverflow === 'hidden' ? '' : prevOverflow;
      }
    };
  }, [lockScroll]);

  useEffect(() => {
    if (!onEscape || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export const SPRING_INDICATOR = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 36,
  mass: 0.8,
};

export const TACTILE_BUTTON_SPRING = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 28,
  mass: 0.65,
};

export const TACTILE_CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

/**
 * Tactile Framer Motion Button with subtle hover lift and crisp press scale-bounce
 */
export const MotionButton: React.FC<HTMLMotionProps<'button'>> = ({
  children,
  disabled,
  className = '',
  ...rest
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      disabled={disabled}
      whileHover={
        shouldReduceMotion || disabled
          ? undefined
          : { y: -1.5, scale: 1.015 }
      }
      whileTap={
        shouldReduceMotion || disabled
          ? undefined
          : { scale: 0.96, y: 0.5 }
      }
      transition={TACTILE_BUTTON_SPRING}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  );
};

/**
 * Smooth page/tab transition wrapper respecting prefers-reduced-motion
 */
export const PageTransition: React.FC<{
  viewKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ viewKey, children, className = '' }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={viewKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: SNAPPY_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Staggered card item entrance + tactile hover elevation & press scale-bounce
 */
export const StaggerCard: React.FC<{
  index: number;
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({
  index,
  children,
  className = '',
  interactive = true,
  onContextMenu,
  onClick,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const delay = Math.min(index * 0.04, 0.28);

  if (shouldReduceMotion) {
    return (
      <div className={className} onContextMenu={onContextMenu} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={interactive ? { y: -3, scale: 1.006 } : undefined}
      whileTap={interactive ? { scale: 0.988 } : undefined}
      transition={{
        opacity: { duration: 0.22, delay, ease: SNAPPY_EASE },
        y: { duration: 0.22, delay, ease: SNAPPY_EASE },
        scale: TACTILE_CARD_SPRING,
      }}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Variants-driven Staggered List & StaggerItem for cascading list entrances
 */
export const StaggerList: React.FC<{
  children: React.ReactNode;
  className?: string;
  staggerSec?: number;
}> = ({ children, className = '', staggerSec = 0.038 }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerSec,
            delayChildren: 0.02,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const StaggerItem: React.FC<{
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({
  children,
  className = '',
  interactive = true,
  onContextMenu,
  onClick,
}) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div className={className} onContextMenu={onContextMenu} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.2, ease: SNAPPY_EASE },
        },
      }}
      whileHover={interactive ? { y: -1.5, scale: 1.005 } : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      transition={TACTILE_CARD_SPRING}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Global Micro Loading Indicator (Top hairline bar + non-intrusive floating pill during data/AI requests)
 */
export const GlobalMicroLoader: React.FC<{
  isActive: boolean;
  label?: string;
}> = ({ isActive, label }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Top 2px viewport hairline sweep */}
          <motion.div
            key="global-top-hairline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden="true"
            className="fixed top-0 left-0 right-0 h-0.5 z-[80] bg-[var(--accent-soft)] overflow-hidden pointer-events-none"
          >
            <div
              className={`h-full w-1/2 bg-[var(--accent)] rounded-full ${
                shouldReduceMotion ? '' : 'animate-shimmer-sweep'
              }`}
            />
          </motion.div>

          {/* Subtle floating micro status indicator */}
          {label && (
            <motion.div
              key="global-micro-chip"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.16, ease: SNAPPY_EASE }}
              role="status"
              aria-live="polite"
              className="fixed top-16 md:top-19 right-4 sm:right-6 z-[60] px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/92 backdrop-blur-md shadow-md flex items-center gap-2 text-[11px] font-medium text-[var(--text-secondary)] pointer-events-none"
            >
              <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)] shrink-0" />
              <span className="truncate max-w-[200px]">{label}</span>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
};

/**
 * Layout-matched Skeleton Loading Screens for initial DB hydration & tab transitions
 */
export const WorkspaceSkeleton: React.FC<{ activeTab: string }> = ({ activeTab }) => {
  const isWriterLike = activeTab === 'writer' || activeTab === 'drama-writer';
  const isFormLike = activeTab === 'setup' || activeTab === 'drama-setup' || activeTab === 'config';

  if (isWriterLike) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" aria-busy="true" aria-label="正在加载工作台">
        <div className="hidden lg:block lg:col-span-3 studio-card p-5 space-y-4">
          <div className="skeleton-bone h-5 w-32" />
          <div className="space-y-2.5 pt-2">
            <div className="skeleton-bone h-10 w-full" />
            <div className="skeleton-bone h-10 w-full" />
            <div className="skeleton-bone h-10 w-5/6" />
          </div>
          <div className="skeleton-bone h-24 w-full mt-4" />
        </div>
        <div className="lg:col-span-9 space-y-5">
          <div className="studio-card p-5 flex items-center justify-between gap-4">
            <div className="skeleton-bone h-8 w-48" />
            <div className="skeleton-bone h-8 w-32" />
          </div>
          <div className="studio-card p-6 sm:p-8 space-y-4">
            <div className="skeleton-bone h-7 w-2/5" />
            <div className="skeleton-bone h-4 w-full" />
            <div className="skeleton-bone h-4 w-11/12" />
            <div className="skeleton-bone h-4 w-4/5" />
            <div className="skeleton-bone h-32 w-full mt-4" />
          </div>
        </div>
      </div>
    );
  }

  if (isFormLike) {
    return (
      <div className="max-w-6xl mx-auto space-y-6" aria-busy="true" aria-label="正在加载设定表单">
        <div className="pb-5 border-b border-[var(--border-subtle)] flex items-end justify-between gap-4">
          <div className="space-y-2.5">
            <div className="skeleton-bone h-3.5 w-48" />
            <div className="skeleton-bone h-8 w-72" />
          </div>
          <div className="skeleton-bone h-10 w-36" />
        </div>
        <div className="studio-card p-6 space-y-5">
          <div className="skeleton-bone h-5 w-44" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="skeleton-bone h-11 sm:col-span-2" />
            <div className="skeleton-bone h-11" />
            <div className="skeleton-bone h-11" />
          </div>
          <div className="skeleton-bone h-28 w-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="studio-card p-5 space-y-3">
            <div className="skeleton-bone h-5 w-36" />
            <div className="skeleton-bone h-16 w-full" />
          </div>
          <div className="studio-card p-5 space-y-3">
            <div className="skeleton-bone h-5 w-36" />
            <div className="skeleton-bone h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Default: Bookshelf / Drama Library / Radar Grid Skeleton
  return (
    <div className="space-y-6 sm:space-y-8" aria-busy="true" aria-label="正在加载作品列表">
      <div className="pb-5 border-b border-[var(--border-subtle)] flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2.5">
          <div className="skeleton-bone h-3.5 w-52" />
          <div className="skeleton-bone h-8 w-64" />
          <div className="skeleton-bone h-4 w-44" />
        </div>
        <div className="skeleton-bone h-11 w-36" />
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="skeleton-bone h-10 w-64" />
        <div className="skeleton-bone h-10 w-56" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="studio-card p-5 sm:p-6 space-y-4">
            <div className="skeleton-bone h-3.5 w-36" />
            <div className="skeleton-bone h-6 w-3/4" />
            <div className="space-y-2">
              <div className="skeleton-bone h-3.5 w-full" />
              <div className="skeleton-bone h-3.5 w-5/6" />
            </div>
            <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <div className="skeleton-bone h-9 w-24" />
              <div className="skeleton-bone h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Smooth tabular-nums counter that animates numeric changes cleanly
 */
export const AnimatedNumber: React.FC<{
  value: number;
  format?: boolean;
  className?: string;
}> = ({ value, format = true, className = '' }) => {
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplayValue(value);
      return;
    }

    const start = displayValue;
    const diff = value - start;
    if (diff === 0) return;

    const durationMs = 260;
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(Math.round(start + diff * eased));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, shouldReduceMotion]);

  return (
    <span className={`tabular-nums ${className}`}>
      {format ? displayValue.toLocaleString() : displayValue}
    </span>
  );
};

/**
 * Clean SVG circular progress ring (zero inline styles, pure SVG geometry attributes)
 */
export const ProgressRing: React.FC<{
  current: number;
  total: number;
  size?: number;
}> = ({ current, total, size = 34 }) => {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const pct = Math.round(ratio * 100);

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" aria-label={`完成度 ${pct}%`}>
      <svg width={size} height={size} className="-rotate-90 text-[var(--border-subtle)]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <span className="absolute text-[9px] font-bold tabular-nums text-[var(--text-secondary)]">
        {pct}%
      </span>
    </div>
  );
};
