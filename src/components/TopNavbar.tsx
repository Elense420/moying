import React from 'react';
import {
  BookOpen,
  Sliders,
  Feather,
  Lightbulb,
  Cpu,
  Moon,
  Sun,
  Plus,
  Clapperboard,
  Compass,
  UserCheck,
  Film,
} from 'lucide-react';
import { motion } from 'motion/react';
import { UiSettings, CreativeTrack } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { SPRING_INDICATOR, MotionButton } from './MotionPrimitives';

interface TopNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeTrack: CreativeTrack;
  uiSettings: UiSettings;
  setUiSettings: React.Dispatch<React.SetStateAction<UiSettings>>;
  onQuickCreatePrimary: () => void;
  currentWorkTitle?: string;
}

export const NOVEL_NAV_ITEMS = [
  { id: 'novels', label: '我的书库', shortLabel: '书库', icon: BookOpen },
  { id: 'setup', label: '作品设定', shortLabel: '设定', icon: Sliders },
  { id: 'writer', label: '沉浸执笔', shortLabel: '执笔', icon: Feather },
  { id: 'inspiration', label: '灵感工坊', shortLabel: '灵感', icon: Lightbulb },
  { id: 'config', label: '引擎与技能', shortLabel: '引擎', icon: Cpu },
];

export const DRAMA_NAV_ITEMS = [
  { id: 'drama-library', label: '漫剧片单', shortLabel: '片单', icon: Clapperboard },
  { id: 'drama-radar', label: '赛道雷达', shortLabel: '赛道', icon: Compass },
  { id: 'drama-setup', label: '立项与立绘', shortLabel: '立绘', icon: UserCheck },
  { id: 'drama-writer', label: '剧本分镜台', shortLabel: '剧本', icon: Film },
  { id: 'config', label: '引擎与技能', shortLabel: '引擎', icon: Cpu },
];

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  setActiveTab,
  activeTrack,
  uiSettings,
  setUiSettings,
  onQuickCreatePrimary,
  currentWorkTitle,
}) => {
  const brandName = (uiSettings.studioBrandName || '墨映工坊').trim() || '墨映工坊';
  const navItems = activeTrack === 'drama' ? DRAMA_NAV_ITEMS : NOVEL_NAV_ITEMS;
  const activeNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  const toggleDarkMode = () => {
    setUiSettings((prev) => ({
      ...prev,
      mode: prev.mode === 'dark' ? 'light' : 'dark',
    }));
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-canvas)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] pt-safe">
      {/* Desktop 3-Zone Top Bar Contract (md and up) */}
      <div className="hidden md:flex max-w-7xl mx-auto px-6 lg:px-8 h-16 items-center justify-between gap-8">
        {/* Zone 1: Single-line clean Brand Wordmark */}
        <MotionButton
          type="button"
          onClick={() => setActiveTab(activeTrack === 'drama' ? 'drama-library' : 'novels')}
          className="text-lg font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer text-left font-editorial-serif"
        >
          {brandName}
        </MotionButton>

        {/* Zone 2: 5 concise single-line text navigation links with spring underline */}
        <nav className="flex items-center gap-7 text-sm">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <MotionButton
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-5 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="desktop-top-nav-underline"
                    transition={SPRING_INDICATOR}
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full"
                  />
                )}
              </MotionButton>
            );
          })}
        </nav>

        {/* Zone 3: Primary action & ambient toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton compact />
          <MotionButton
            type="button"
            onClick={toggleDarkMode}
            title={uiSettings.mode === 'dark' ? '切换浅色纸张' : '切换夜间护眼'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
          >
            {uiSettings.mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </MotionButton>
          <MotionButton
            type="button"
            onClick={onQuickCreatePrimary}
            className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{activeTrack === 'drama' ? '新建漫剧' : '新建小说'}</span>
          </MotionButton>
        </div>
      </div>

      {/* Mobile Compact App Bar (< md, strictly 52px height) */}
      <div className="flex md:hidden h-13 px-4 items-center justify-between gap-3">
        <MotionButton
          type="button"
          onClick={() => setActiveTab(activeTrack === 'drama' ? 'drama-library' : 'novels')}
          className="text-base font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 font-editorial-serif"
        >
          {brandName}
        </MotionButton>

        <div className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[48vw]">
          {(activeTab === 'writer' || activeTab === 'drama-writer') && currentWorkTitle
            ? `《${currentWorkTitle}》`
            : activeNav.label}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton compact />
          <MotionButton
            type="button"
            onClick={toggleDarkMode}
            aria-label="切换日夜模式"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-secondary)] active:bg-[var(--bg-muted)]"
          >
            {uiSettings.mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </MotionButton>
        </div>
      </div>
    </header>
  );
};

/**
 * Dual-Track Studio Switcher placed inside main workspace canvas (outside <header>)
 */
export const CreativeRealmSwitcher: React.FC<{
  activeTrack: CreativeTrack;
  onSwitchTrack: (track: CreativeTrack) => void;
  novelCount: number;
  dramaCount: number;
}> = ({ activeTrack, onSwitchTrack, novelCount, dramaCount }) => {
  return (
    <div className="mb-5 sm:mb-7 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-xs">
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-1 relative">
        {[
          {
            id: 'novel' as CreativeTrack,
            label: '小说自由创作',
            count: novelCount,
            icon: Feather,
          },
          {
            id: 'drama' as CreativeTrack,
            label: 'AI 漫剧剧本',
            count: dramaCount,
            icon: Clapperboard,
          },
        ].map((realm) => {
          const Icon = realm.icon;
          const isSelected = activeTrack === realm.id;
          return (
            <MotionButton
              key={realm.id}
              type="button"
              onClick={() => onSwitchTrack(realm.id)}
              className={`relative min-h-[42px] px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${
                isSelected
                  ? 'text-[var(--accent-fg)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId="creative-realm-active-pill"
                  transition={SPRING_INDICATOR}
                  className="absolute inset-0 bg-[var(--accent)] rounded-xl shadow-xs"
                />
              )}
              <Icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
              <span className="relative z-10">{realm.label}</span>
              <span
                className={`relative z-10 text-[11px] tabular-nums ${
                  isSelected ? 'opacity-85' : 'text-[var(--text-muted)]'
                }`}
              >
                ({realm.count})
              </span>
            </MotionButton>
          );
        })}
      </div>

      <p className="hidden lg:block pr-3 text-xs text-[var(--text-muted)] truncate">
        {activeTrack === 'novel'
          ? '当前业务线：私人自由长篇创作 · 已挂载 XP 创作宪法、世界书 2.0 与 SKILL 2.0'
          : '当前业务线：大众商业漫剧/短剧创作 · 上游甲方标准 △ 剧本 + 下游 AI 分镜生图拆解（XP 物理隔离）'}
      </p>
    </div>
  );
};

export const MobileBottomNav: React.FC<{
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeTrack: CreativeTrack;
}> = ({ activeTab, setActiveTab, activeTrack }) => {
  const navItems = activeTrack === 'drama' ? DRAMA_NAV_ITEMS : NOVEL_NAV_ITEMS;

  return (
    <nav
      aria-label="底部主导航"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] pb-safe"
    >
      <div className="grid grid-cols-5 items-center h-15">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <MotionButton
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors select-none ${
                isActive ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-bottom-nav-indicator"
                  transition={SPRING_INDICATOR}
                  className="absolute top-0 w-7 h-0.5 bg-[var(--accent)] rounded-full"
                />
              )}
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-[11px] leading-tight tracking-tight whitespace-nowrap">
                {item.shortLabel}
              </span>
            </MotionButton>
          );
        })}
      </div>
    </nav>
  );
};
