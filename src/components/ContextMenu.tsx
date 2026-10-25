import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { SNAPPY_EASE } from './MotionPrimitives';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface ContextMenuContextValue {
  openContextMenu: (
    e: React.MouseEvent,
    itemsOrTitle: ContextMenuItem[] | string,
    titleOrItems?: string | ContextMenuItem[]
  ) => void;
  closeContextMenu: () => void;
  triggerQuickToast: (message: string) => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue>({
  openContextMenu: () => {},
  closeContextMenu: () => {},
  triggerQuickToast: () => {},
});

export const useContextMenu = () => useContext(ContextMenuContext);

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const closeContextMenu = useCallback(() => {
    setMenuState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const triggerQuickToast = useCallback((message: string) => {
    setQuickToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setQuickToast(null);
    }, 2400);
  }, []);

  const openContextMenu = useCallback(
    (
      e: React.MouseEvent,
      itemsOrTitle: ContextMenuItem[] | string,
      titleOrItems?: string | ContextMenuItem[]
    ) => {
      const items = Array.isArray(itemsOrTitle)
        ? itemsOrTitle
        : Array.isArray(titleOrItems)
        ? titleOrItems
        : [];
      const title =
        typeof itemsOrTitle === 'string'
          ? itemsOrTitle
          : typeof titleOrItems === 'string'
          ? titleOrItems
          : undefined;
      if (!items || items.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        title,
        items,
      });
    },
    []
  );

  // Position menu via CSS custom properties on ref so zero inline JSX style={{}} is used,
  // while clamping cleanly inside viewport edges.
  useLayoutEffect(() => {
    if (!menuState.isOpen || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const clampedX = Math.max(pad, Math.min(menuState.x, vw - rect.width - pad));
    const clampedY = Math.max(pad, Math.min(menuState.y, vh - rect.height - pad));

    el.style.setProperty('--ctx-x', `${clampedX}px`);
    el.style.setProperty('--ctx-y', `${clampedY}px`);
  }, [menuState]);

  useEffect(() => {
    if (!menuState.isOpen) return;

    const handlePointerDown = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closeContextMenu();
    };
    const handleScrollOrResize = () => closeContextMenu();

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuState.isOpen, closeContextMenu]);

  const overlayNodes = (
    <>
      {/* Floating Right-Click Context Menu */}
      <AnimatePresence>
        {menuState.isOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={menuState.title || '快捷操作菜单'}
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: -4 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: -2 }
            }
            transition={{ duration: 0.14, ease: SNAPPY_EASE }}
            onContextMenu={(e) => e.preventDefault()}
            className="context-menu-floating fixed z-[140] min-w-[208px] max-w-[268px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/96 backdrop-blur-md p-1.5 shadow-2xl select-none"
          >
            {menuState.title && (
              <div className="px-2.5 py-1.5 mb-1 border-b border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-muted)] truncate">
                {menuState.title}
              </div>
            )}

            <div className="space-y-0.5">
              {menuState.items.map((item) => (
                <React.Fragment key={item.id}>
                  {item.dividerBefore && (
                    <div className="my-1 border-t border-[var(--border-subtle)]" />
                  )}
                  <motion.button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    whileHover={
                      shouldReduceMotion || item.disabled ? undefined : { x: 2 }
                    }
                    whileTap={
                      shouldReduceMotion || item.disabled
                        ? undefined
                        : { scale: 0.98 }
                    }
                    onClick={() => {
                      if (item.disabled) return;
                      closeContextMenu();
                      item.onSelect();
                    }}
                    className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between gap-3 text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      item.danger
                        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      {item.icon && (
                        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center opacity-85">
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.shortcut && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                        {item.shortcut}
                      </span>
                    )}
                  </motion.button>
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle Action Feedback Toast */}
      <AnimatePresence>
        {quickToast && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: SNAPPY_EASE }}
            className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[145] max-w-[90vw] sm:max-w-md px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/96 backdrop-blur-md shadow-xl flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] pointer-events-none"
          >
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="leading-snug">{quickToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <ContextMenuContext.Provider
      value={{ openContextMenu, closeContextMenu, triggerQuickToast }}
    >
      {children}
      {typeof document !== 'undefined' ? createPortal(overlayNodes, document.body) : overlayNodes}
    </ContextMenuContext.Provider>
  );
};

