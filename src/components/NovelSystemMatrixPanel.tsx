import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  X,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Save,
  Feather,
  Loader2,
  Download,
  ShieldCheck,
  ShieldOff,
  Trash2,
  BookOpenCheck,
  Flag,
  Layers,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  Book,
  NovelChapterOutlineItem,
  NovelVolumePlanItem,
  NovelForeshadowItem,
} from '../types';
import {
  NOVEL_SETTING_MODULES,
  COMMERCIAL_NOVEL_PLATFORMS,
  TOTAL_SYSTEM_FIELD_COUNT,
  countConfiguredSystemFields,
  exportBookSigningPackageMarkdown,
} from '../data/novelArchitectureSchema';
import { generateUUID } from '../utils/uuid';
import { MotionButton } from './MotionPrimitives';

// ============================================================================
// 1. Per-Book XP System Switch Banner (Requirement 5)
// ============================================================================
interface NovelXpSystemBannerProps {
  xpSystemEnabled: boolean;
  onToggleXpSystem: (next: boolean) => void;
  bookXpNote: string;
  onChangeBookXpNote: (val: string) => void;
  globalXpPreferences: string;
}

export const NovelXpSystemBanner: React.FC<NovelXpSystemBannerProps> = ({
  xpSystemEnabled,
  onToggleXpSystem,
  bookXpNote,
  onChangeBookXpNote,
  globalXpPreferences,
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const globalLen = (globalXpPreferences || '').trim().length;

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-colors space-y-3 ${
        xpSystemEnabled
          ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)]/45'
          : 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/45'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {xpSystemEnabled ? (
              <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
            ) : (
              <ShieldOff className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            )}
            <span className="text-sm font-bold text-[var(--text-primary)]">
              本书 XP 审美基底系统：{xpSystemEnabled ? '已开启（全链路作为创作基底）' : '已关闭（全链路纯净商业叙事）'}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {xpSystemEnabled
              ? `当前已挂载全局 XP 宪法（${globalLen > 0 ? `${globalLen} 字` : '可在引擎与技能页补充全局XP'}）+ XP 世界书条目 + 张力慢放 SKILL；从大纲推演、11大模块自动勾选、章节细纲到单/多章正文生成均以此为核心审美基底。`
              : '当前已物理隔离全部个人 XP 宪法、XP 张力世界书条目与亲密偏好 SKILL；AI 生成大纲、章节细纲与小说正文时绝不掺入任何私人 XP 设定，适合纯粹大众商业平台投稿。'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {showDetail ? '收起专属补充' : '本书专属XP微调'}
          </button>

          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => onToggleXpSystem(true)}
              className={`min-h-[34px] px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                xpSystemEnabled
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              开启 XP 基底
            </button>
            <button
              type="button"
              onClick={() => onToggleXpSystem(false)}
              className={`min-h-[34px] px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                !xpSystemEnabled
                  ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              关闭 XP
            </button>
          </div>
        </div>
      </div>

      {showDetail && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2 text-xs">
          {xpSystemEnabled ? (
            <>
              <label className="block font-medium text-[var(--text-primary)]">
                本书专属 XP 张力补充（仅对当前小说生效，与全局 XP 宪法叠加注入）：
              </label>
              <textarea
                rows={2}
                value={bookXpNote}
                onChange={(e) => onChangeBookXpNote(e.target.value)}
                placeholder="例如：本书侧重宿敌身份掉马后的失控反差、冷白皮战损包扎拉扯、绝对1v1身心唯一..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </>
          ) : (
            <p className="text-[var(--text-muted)]">
              当前处于「关闭 XP」模式，本书专属 XP 补充与全局 XP 宪法均不会注入任何 AI 提示词。如需启用请先点击右侧「开启 XP 基底」。
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. 11-Module × 20-Item (220-Dimension) Fine-Grained Novel Architecture Matrix
// ============================================================================
interface NovelElevenModulesMatrixProps {
  systemSettings: Record<string, string[]>;
  systemCustomNotes: Record<string, string>;
  systemSettingsDirty: boolean;
  isSyncingOutline: boolean;
  onUpdateFieldValues: (fieldKey: string, nextValues: string[], isCriticalField?: boolean) => void;
  onUpdateModuleCustomNote: (moduleId: string, note: string) => void;
  onAiAutoPopulateFromOutline: () => void;
  onAiRealignOutlineFromSettings: () => void;
  onSaveSettingsNow?: () => void;
}

export const NovelElevenModulesMatrix: React.FC<NovelElevenModulesMatrixProps> = ({
  systemSettings,
  systemCustomNotes,
  systemSettingsDirty,
  isSyncingOutline,
  onUpdateFieldValues,
  onUpdateModuleCustomNote,
  onAiAutoPopulateFromOutline,
  onAiRealignOutlineFromSettings,
  onSaveSettingsNow,
}) => {
  const [activeModuleId, setActiveModuleId] = useState<string>(NOVEL_SETTING_MODULES[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'selected' | 'critical'>('all');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>(() => ({
    'foundation.genre_types': true,
    'foundation.scale_structure': true,
    'foundation.narrative_pov': true,
    'foundation.opening_hook_style': true,
  }));
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});

  const stats = useMemo(
    () => countConfiguredSystemFields(systemSettings),
    [systemSettings]
  );

  const activeModule = useMemo(
    () => NOVEL_SETTING_MODULES.find((m) => m.id === activeModuleId) || NOVEL_SETTING_MODULES[0],
    [activeModuleId]
  );

  // If searchQuery is typed, search across ALL 11 modules (220 fields)! Otherwise show activeModule's 20 fields.
  const displayedFields = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sourceList = q
      ? NOVEL_SETTING_MODULES.flatMap((mod) =>
          mod.fields.map((field) => ({ mod, field, fullKey: `${mod.id}.${field.id}` }))
        )
      : activeModule.fields.map((field) => ({
          mod: activeModule,
          field,
          fullKey: `${activeModule.id}.${field.id}`,
        }));

    return sourceList.filter(({ mod, field, fullKey }) => {
      const selected = systemSettings[fullKey] || [];
      if (filterMode === 'selected' && selected.length === 0) return false;
      if (filterMode === 'critical' && !field.isCritical) return false;
      if (!q) return true;
      return (
        field.label.toLowerCase().includes(q) ||
        field.hint.toLowerCase().includes(q) ||
        mod.name.toLowerCase().includes(q) ||
        field.options.some((o) => o.toLowerCase().includes(q)) ||
        selected.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [activeModule, searchQuery, filterMode, systemSettings]);

  const toggleExpandField = (fullKey: string) => {
    setExpandedKeys((prev) => ({ ...prev, [fullKey]: !prev[fullKey] }));
  };

  const handleExpandAllInCurrentView = (expand: boolean) => {
    const next = { ...expandedKeys };
    displayedFields.forEach(({ fullKey }) => {
      next[fullKey] = expand;
    });
    setExpandedKeys(next);
  };

  const handleTogglePresetOption = (
    fullKey: string,
    option: string,
    isCritical?: boolean
  ) => {
    const current = systemSettings[fullKey] || [];
    const exists = current.includes(option);
    const next = exists ? current.filter((item) => item !== option) : [...current, option];
    onUpdateFieldValues(fullKey, next, isCritical);
  };

  const handleAddCustomOption = (fullKey: string, isCritical?: boolean) => {
    const raw = (customDrafts[fullKey] || '').trim();
    if (!raw) return;
    const parts = raw
      .split(/[,，、;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const current = systemSettings[fullKey] || [];
    const merged = Array.from(new Set([...current, ...parts]));
    onUpdateFieldValues(fullKey, merged, isCritical);
    setCustomDrafts((prev) => ({ ...prev, [fullKey]: '' }));
  };

  return (
    <div className="space-y-5">
      {/* Manual Modification Plot-Chaos Warning Banner (Requirement 3.3) */}
      {systemSettingsDirty && (
        <div className="rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                关键设定手动变动预警 · 谨防长篇剧情前后逻辑混乱
              </p>
              <p className="text-amber-800/90 dark:text-amber-200/90">
                系统检测到您手动调整了核心架构设定（如题材、篇幅结构、叙事人称、金手指、CP编制或推进红线等）。随意手动改动关键设定而不同步更新大纲，极易导致后续生成章节时出现设定打架或剧情混乱！建议调整完毕后立即点击右侧按钮让 AI 重新完善对齐小说大纲。
              </p>
            </div>
          </div>

          <MotionButton
            type="button"
            disabled={isSyncingOutline}
            onClick={onAiRealignOutlineFromSettings}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isSyncingOutline ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在重新对齐大纲...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>AI 按最新设定重新完善大纲</span>
              </>
            )}
          </MotionButton>
        </div>
      )}

      {/* Top Overview & Global Actions */}
      <section className="studio-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              11 大同层级核心系统 · 共 {TOTAL_SYSTEM_FIELD_COUNT} 项商业化精细设定 · 已配置{' '}
              <strong className="text-[var(--text-primary)]">{stats.configuredFields}</strong> 项（共{' '}
              <strong className="text-[var(--text-primary)]">{stats.totalTags}</strong> 个设定锚点）
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-editorial-serif">
              规范化商业小说精细设定矩阵
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <MotionButton
              type="button"
              disabled={isSyncingOutline}
              onClick={onAiAutoPopulateFromOutline}
              className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {isSyncingOutline ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>AI 正在同步 11 大系统...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 完善大纲并自动勾选 11 大模块</span>
                </>
              )}
            </MotionButton>

            {onSaveSettingsNow && (
              <MotionButton
                type="button"
                onClick={onSaveSettingsNow}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存设定到本书</span>
              </MotionButton>
            )}
          </div>
        </div>

        {/* 11 Peer Modules Grid Switcher */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {NOVEL_SETTING_MODULES.map((mod) => {
            const active = !searchQuery.trim() && mod.id === activeModuleId;
            const count = stats.perModuleCounts[mod.id] || 0;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveModuleId(mod.id);
                }}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between gap-1.5 ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] tabular-nums">
                  <span className="font-mono text-[var(--text-muted)]">{mod.indexLabel}</span>
                  <span
                    className={
                      count > 0
                        ? 'font-semibold text-[var(--accent)]'
                        : 'text-[var(--text-muted)]'
                    }
                  >
                    {count}/{mod.fields.length}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  {mod.name}
                </div>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="跨 11 大模块搜索 220 项设定（如：金手指、叙事人称、篇幅、爽点、修罗场、去AI味...）"
              className="studio-input w-full min-h-[40px] pl-9 pr-8 py-2 text-xs sm:text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
            <div className="flex items-center p-1 studio-muted">
              {[
                { id: 'all', label: '全部板块' },
                { id: 'selected', label: '仅看已选' },
                { id: 'critical', label: '核心骨架项' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors ${
                    filterMode === f.id
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleExpandAllInCurrentView(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              全部展开
            </button>
            <button
              type="button"
              onClick={() => handleExpandAllInCurrentView(false)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              全部收起
            </button>
          </div>
        </div>
      </section>

      {/* Active Module Header & Expandable 20 Field Cards */}
      <section className="studio-card p-5 sm:p-6 space-y-4">
        {!searchQuery.trim() && (
          <div className="border-b border-[var(--border-subtle)] pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                模块 {activeModule.indexLabel} / 11
              </span>
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
                {activeModule.name}（共 {activeModule.fields.length} 个子设定板块）
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{activeModule.subtitle}</p>
            </div>
            <span className="text-xs text-[var(--text-secondary)] tabular-nums">
              点击任一板块即可展开多选或自定义输入添加
            </span>
          </div>
        )}

        {displayedFields.length === 0 ? (
          <div className="p-10 text-center text-xs text-[var(--text-muted)] studio-muted">
            没有匹配的设定板块，可切换筛选条件或清空搜索关键词。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {displayedFields.map(({ mod, field, fullKey }, idx) => {
              const selectedValues = systemSettings[fullKey] || [];
              const isExpanded = Boolean(expandedKeys[fullKey]) || Boolean(searchQuery.trim());
              const customOptions = selectedValues.filter((v) => !field.options.includes(v));

              return (
                <div
                  key={fullKey}
                  className={`rounded-xl border transition-colors overflow-hidden ${
                    selectedValues.length > 0
                      ? 'border-[var(--accent)]/40 bg-[var(--bg-surface)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                  }`}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleExpandField(fullKey)}
                    className="w-full px-4 py-3 text-left flex items-start justify-between gap-3 hover:bg-[var(--bg-muted)]/60 transition-colors cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                        <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
                          {searchQuery.trim() ? `${mod.name} ·` : `${String(idx + 1).padStart(2, '0')}.`}
                        </span>
                        <span>{field.label}</span>
                        {field.isCritical && (
                          <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                            · 核心骨架
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                        {selectedValues.length > 0
                          ? `已选 (${selectedValues.length})：${selectedValues.join(' · ')}`
                          : field.hint}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {selectedValues.length > 0 && (
                        <span className="text-xs font-semibold text-[var(--accent)] tabular-nums">
                          {selectedValues.length}项
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Multi-Select Options + Custom Input */}
                  {isExpanded && (
                    <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 space-y-3 text-xs">
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        {field.hint}（支持点选多项组合，也可在下方自行输入专属设定词）
                      </p>

                      {/* Preset Selectable Options */}
                      <div className="flex flex-wrap gap-1.5">
                        {field.options.map((opt) => {
                          const isSelected = selectedValues.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                handleTogglePresetOption(fullKey, opt, field.isCritical)
                              }
                              className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)] font-semibold'
                                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 shrink-0" />}
                              <span>{opt}</span>
                            </button>
                          );
                        })}

                        {/* User-Added Custom Values */}
                        {customOptions.map((customVal) => (
                          <button
                            key={customVal}
                            type="button"
                            onClick={() =>
                              handleTogglePresetOption(fullKey, customVal, field.isCritical)
                            }
                            className="min-h-[32px] px-2.5 py-1 rounded-lg border bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)] font-semibold text-xs flex items-center gap-1 cursor-pointer"
                            title="点击移除该自定义项"
                          >
                            <span>自定义：{customVal}</span>
                            <X className="w-3 h-3 shrink-0" />
                          </button>
                        ))}
                      </div>

                      {/* Custom Input Row */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={customDrafts[fullKey] || ''}
                          onChange={(e) =>
                            setCustomDrafts((prev) => ({ ...prev, [fullKey]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomOption(fullKey, field.isCritical);
                            }
                          }}
                          placeholder="自行输入补充设定（多个用逗号分隔，回车添加）..."
                          className="studio-input flex-1 min-h-[36px] px-3 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCustomOption(fullKey, field.isCritical)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-muted)] hover:bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加</span>
                        </button>
                        {selectedValues.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onUpdateFieldValues(fullKey, [], field.isCritical)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600 shrink-0 cursor-pointer"
                            title="清空本项已选"
                          >
                            清空
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Module-Level Freeform Note */}
        {!searchQuery.trim() && (
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              「{activeModule.name}」模块专属补充批注（自由输入特殊规则，将直接并入本书创作提示词）：
            </label>
            <textarea
              rows={2}
              value={systemCustomNotes[activeModule.id] || ''}
              onChange={(e) => onUpdateModuleCustomNote(activeModule.id, e.target.value)}
              placeholder={`补充「${activeModule.name}」中更细致的个性化要求...`}
              className="studio-input w-full p-3 text-xs leading-relaxed"
            />
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// 3. Chapter Outline Workshop & Volume Blueprint (Requirement 3.3)
// ============================================================================
interface NovelChapterOutlineWorkshopProps {
  chapterOutlines: NovelChapterOutlineItem[];
  volumePlan: NovelVolumePlanItem[];
  draftedChapterCount: number;
  isGeneratingChapterOutlines: boolean;
  onGenerateBatchChapterOutlines: (startChap: number, count: number, batchDirection: string) => void;
  onUpdateChapterOutlines: (next: NovelChapterOutlineItem[]) => void;
  onUpdateVolumePlan: (next: NovelVolumePlanItem[]) => void;
  onConfirmAndProceedToWriter: () => void;
}

export const NovelChapterOutlineWorkshop: React.FC<NovelChapterOutlineWorkshopProps> = ({
  chapterOutlines,
  volumePlan,
  draftedChapterCount,
  isGeneratingChapterOutlines,
  onGenerateBatchChapterOutlines,
  onUpdateChapterOutlines,
  onUpdateVolumePlan,
  onConfirmAndProceedToWriter,
}) => {
  const sortedOutlines = useMemo(
    () => [...chapterOutlines].sort((a, b) => a.chapterIndex - b.chapterIndex),
    [chapterOutlines]
  );

  const nextStartChap =
    sortedOutlines.length > 0
      ? sortedOutlines[sortedOutlines.length - 1].chapterIndex + 1
      : 1;

  const [batchStart, setBatchStart] = useState<number>(nextStartChap);
  const [batchCount, setBatchCount] = useState<number>(15);
  const [batchDirection, setBatchDirection] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  React.useEffect(() => {
    setBatchStart(nextStartChap);
  }, [nextStartChap]);

  const handleAddManualChapterOutline = () => {
    const newItem: NovelChapterOutlineItem = {
      id: generateUUID(),
      chapterIndex: nextStartChap,
      title: `待拟定章节标题`,
      summary: '在此简述本章核心发生的事件、人物交锋与关系推进（2~4句话）...',
      volumeTag: volumePlan[0] ? `第${volumePlan[0].volumeIndex}卷 · ${volumePlan[0].title}` : '第一卷',
      hookNote: '章末留钩悬念',
      status: 'planned',
    };
    onUpdateChapterOutlines([...sortedOutlines, newItem]);
    setEditingId(newItem.id);
  };

  const handleAddManualVolume = () => {
    const nextIdx = volumePlan.length + 1;
    const newVol: NovelVolumePlanItem = {
      id: generateUUID(),
      volumeIndex: nextIdx,
      title: `第${nextIdx}卷标题`,
      chapterSpan: `第${(nextIdx - 1) * 30 + 1}章 - 第${nextIdx * 30}章`,
      coreConflict: '本卷核心外部阻力与内部矛盾',
      climaxGoal: '本卷终局大高潮爽点兑现',
    };
    onUpdateVolumePlan([...volumePlan, newVol]);
  };

  return (
    <div className="space-y-6">
      {/* Multi-Volume Blueprint Card */}
      <section className="studio-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              全书分卷结构蓝图 ({volumePlan.length} 卷)
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              在展开每章细纲之前，先用分卷锚定长篇阶段目标，防止写到中期跑偏注水。
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddManualVolume}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增分卷</span>
          </button>
        </div>

        {volumePlan.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] py-5 text-center studio-muted">
            点击「大纲与XP基底」中的「AI 完善大纲」可自动生成全书分卷蓝图，也可点击右上角手动添加分卷。
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {volumePlan.map((vol, idx) => (
              <div
                key={vol.id}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-mono text-[var(--accent)] font-bold shrink-0">
                      VOL.{String(vol.volumeIndex).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={vol.title}
                      onChange={(e) => {
                        const next = [...volumePlan];
                        next[idx] = { ...vol, title: e.target.value };
                        onUpdateVolumePlan(next);
                      }}
                      className="studio-input flex-1 px-2.5 py-1 text-xs font-bold"
                    />
                  </div>
                  <input
                    type="text"
                    value={vol.chapterSpan}
                    onChange={(e) => {
                      const next = [...volumePlan];
                      next[idx] = { ...vol, chapterSpan: e.target.value };
                      onUpdateVolumePlan(next);
                    }}
                    className="studio-input w-32 px-2 py-1 text-[11px] tabular-nums text-right"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateVolumePlan(volumePlan.filter((item) => item.id !== vol.id))
                    }
                    className="p-1 text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={vol.coreConflict}
                    onChange={(e) => {
                      const next = [...volumePlan];
                      next[idx] = { ...vol, coreConflict: e.target.value };
                      onUpdateVolumePlan(next);
                    }}
                    placeholder="本卷核心矛盾冲突..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={vol.climaxGoal}
                    onChange={(e) => {
                      const next = [...volumePlan];
                      next[idx] = { ...vol, climaxGoal: e.target.value };
                      onUpdateVolumePlan(next);
                    }}
                    placeholder="卷末大高潮与阶段收束目标..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* One-Click AI Chapter Outline Generator & Sequel Continuer */}
      <section className="studio-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              章节细纲创作台（已规划 {sortedOutlines.length} 章 · 已完稿正文 {draftedChapterCount} 章）
            </h2>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              一键生成每章 2~4 句话简明细纲，让您在正式生成章节前对每一章发生什么了然于胸；后续单章扩写与多章连续批量生成将严格按此细纲推进！
            </p>
          </div>

          <MotionButton
            type="button"
            onClick={onConfirmAndProceedToWriter}
            className="btn-primary min-h-[44px] px-5 py-2.5 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Feather className="w-4 h-4" />
            <span>确认细纲 · 进入章节生成（支持多章连写）</span>
          </MotionButton>
        </div>

        {/* Batch Generation Controls */}
        <div className="p-4 rounded-2xl studio-muted space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="block mb-1 font-medium text-[var(--text-secondary)]">
                起始章节号
              </label>
              <input
                type="number"
                min={1}
                value={batchStart}
                onChange={(e) => setBatchStart(Math.max(1, Number(e.target.value) || 1))}
                className="studio-input w-full min-h-[40px] px-3 py-2 text-xs tabular-nums"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block mb-1 font-medium text-[var(--text-secondary)]">
                本次生成章数
              </label>
              <select
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="studio-input w-full min-h-[40px] px-3 py-2 text-xs tabular-nums"
              >
                <option value={10}>生成 10 章细纲</option>
                <option value={15}>生成 15 章细纲（推荐）</option>
                <option value={20}>生成 20 章细纲</option>
                <option value={30}>生成 30 章整卷细纲</option>
              </select>
            </div>

            <div className="sm:col-span-6">
              <label className="block mb-1 font-medium text-[var(--text-secondary)]">
                本批次剧情侧重指令（选填）
              </label>
              <input
                type="text"
                value={batchDirection}
                onChange={(e) => setBatchDirection(e.target.value)}
                placeholder={`例：第 ${batchStart}~${batchStart + batchCount - 1} 章重点推进主角初入王都立威，第 ${batchStart + 7} 章设计一次掉马试探小高潮...`}
                className="studio-input w-full min-h-[40px] px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              目标区间：第 {batchStart} 章 ~ 第 {batchStart + batchCount - 1} 章（AI 将自动审阅前序章节细纲、11大设定模块与未闭合伏笔）
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddManualChapterOutline}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动加一章细纲</span>
              </button>

              <MotionButton
                type="button"
                disabled={isGeneratingChapterOutlines}
                onClick={() =>
                  onGenerateBatchChapterOutlines(batchStart, batchCount, batchDirection)
                }
                className="btn-primary min-h-[40px] px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingChapterOutlines ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在推演第 {batchStart}~{batchStart + batchCount - 1} 章细纲...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {sortedOutlines.length === 0
                        ? `一键生成前 ${batchCount} 章简明细纲`
                        : `继续生成第 ${batchStart}~${batchStart + batchCount - 1} 章细纲`}
                    </span>
                  </>
                )}
              </MotionButton>
            </div>
          </div>
        </div>

        {/* Chapter Outlines List */}
        {sortedOutlines.length === 0 ? (
          <div className="p-10 text-center space-y-2 studio-muted">
            <BookOpenCheck className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">尚未生成章节细纲</p>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
              点击上方「一键生成前 15 章简明细纲」，AI 会结合大纲与 11 大系统设定，为您列出每章 2~4 句话的核心事件推进脉络。
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
            {sortedOutlines.map((item) => {
              const isDrafted = item.chapterIndex <= draftedChapterCount;
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-colors space-y-2 text-xs ${
                    isDrafted
                      ? 'border-emerald-500/35 bg-emerald-500/5'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-[var(--accent)] tabular-nums">
                        第 {String(item.chapterIndex).padStart(2, '0')} 章
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) =>
                            onUpdateChapterOutlines(
                              sortedOutlines.map((c) =>
                                c.id === item.id ? { ...c, title: e.target.value } : c
                              )
                            )
                          }
                          className="studio-input px-2.5 py-1 text-xs font-bold w-56"
                        />
                      ) : (
                        <span className="font-bold text-sm text-[var(--text-primary)]">
                          《{item.title}》
                        </span>
                      )}
                      {item.volumeTag && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                          · {item.volumeTag}
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-medium ${
                          isDrafted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        · {isDrafted ? '正文已完稿' : '待执笔'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : item.id)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        {isEditing ? '完成微调' : '编辑细纲'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateChapterOutlines(
                            sortedOutlines.filter((c) => c.id !== item.id)
                          )
                        }
                        className="p-1 text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                        title="删除此章细纲"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={3}
                        value={item.summary}
                        onChange={(e) =>
                          onUpdateChapterOutlines(
                            sortedOutlines.map((c) =>
                              c.id === item.id ? { ...c, summary: e.target.value } : c
                            )
                          )
                        }
                        placeholder="2~4句话简述本章核心事件与人物交锋..."
                        className="studio-input w-full p-2.5 text-xs leading-relaxed"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={item.volumeTag || ''}
                          onChange={(e) =>
                            onUpdateChapterOutlines(
                              sortedOutlines.map((c) =>
                                c.id === item.id ? { ...c, volumeTag: e.target.value } : c
                              )
                            )
                          }
                          placeholder="所属分卷标签（如：第一卷）"
                          className="studio-input px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={item.hookNote || ''}
                          onChange={(e) =>
                            onUpdateChapterOutlines(
                              sortedOutlines.map((c) =>
                                c.id === item.id ? { ...c, hookNote: e.target.value } : c
                              )
                            )
                          }
                          placeholder="章末断章钩子..."
                          className="studio-input px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[var(--text-secondary)] leading-relaxed">{item.summary}</p>
                      {item.hookNote && (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          章末留钩：{item.hookNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// 4. Platform Signing Review, Commercial Packaging & Foreshadow Ledger (Req 3.4)
// ============================================================================
interface NovelSigningSubmissionHubProps {
  bookPreview: Book;
  targetPlatform: string;
  onChangeTargetPlatform: (val: string) => void;
  commercialBlurb: string;
  onChangeCommercialBlurb: (val: string) => void;
  alternateTitles: string[];
  onApplyAlternateTitle: (newTitle: string) => void;
  foreshadowLedger: NovelForeshadowItem[];
  onUpdateForeshadowLedger: (next: NovelForeshadowItem[]) => void;
  signingReviewReport: string;
  isGeneratingPackaging: boolean;
  isRunningSigningReview: boolean;
  isExecutingSigningRevisions?: boolean;
  signingRevisionProgress?: string;
  onGenerateCommercialPackaging: () => void;
  onRunEditorialSigningReview: () => void;
  onExecuteSigningReviewRevisions?: (supplementNote?: string) => void;
  onNotify: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const NovelSigningSubmissionHub: React.FC<NovelSigningSubmissionHubProps> = ({
  bookPreview,
  targetPlatform,
  onChangeTargetPlatform,
  commercialBlurb,
  onChangeCommercialBlurb,
  alternateTitles,
  onApplyAlternateTitle,
  foreshadowLedger,
  onUpdateForeshadowLedger,
  signingReviewReport,
  isGeneratingPackaging,
  isRunningSigningReview,
  isExecutingSigningRevisions = false,
  signingRevisionProgress = '',
  onGenerateCommercialPackaging,
  onRunEditorialSigningReview,
  onExecuteSigningReviewRevisions,
  onNotify,
}) => {
  const [newHookName, setNewHookName] = useState('');
  const [newHookPlanted, setNewHookPlanted] = useState<number>(1);
  const [newHookResolve, setNewHookResolve] = useState('');
  const [newHookNote, setNewHookNote] = useState('');
  const [revisionSupplementNote, setRevisionSupplementNote] = useState('');

  const handleAddForeshadow = () => {
    if (!newHookName.trim()) return;
    const item: NovelForeshadowItem = {
      id: generateUUID(),
      name: newHookName.trim(),
      plantedChapter: Math.max(1, Number(newHookPlanted) || 1),
      expectedResolveChapter: newHookResolve.trim() || undefined,
      status: 'planted',
      note: newHookNote.trim() || '长线草蛇灰线伏笔',
    };
    onUpdateForeshadowLedger([item, ...foreshadowLedger]);
    setNewHookName('');
    setNewHookResolve('');
    setNewHookNote('');
  };

  const handleExportSubmissionPackage = () => {
    const md = exportBookSigningPackageMarkdown(bookPreview);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${bookPreview.title || '未命名新书'}》_${targetPlatform || '平台签约'}_内投稿件包.md`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('已导出完整商业平台签约内投稿件包 (.md)', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Platform Positioning & Commercial Title/Blurb Packaging */}
      <section className="studio-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              首发平台对齐与高点击率书名简介包装
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              对齐番茄、起点、晋江、七猫等主流平台签约责编审稿标准，一键生成吸睛备选书名、黄金300字书城简介与内投稿件包。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <MotionButton
              type="button"
              disabled={isGeneratingPackaging}
              onClick={onGenerateCommercialPackaging}
              className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingPackaging ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在生成商业书名与简介...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 提炼爆款书名与黄金简介</span>
                </>
              )}
            </MotionButton>

            <MotionButton
              type="button"
              onClick={handleExportSubmissionPackage}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出平台签约内投稿件包 (.md)</span>
            </MotionButton>
          </div>
        </div>

        {/* Target Platform Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {COMMERCIAL_NOVEL_PLATFORMS.map((p) => {
            const active = targetPlatform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChangeTargetPlatform(p.id)}
                className={`p-3.5 rounded-xl border text-left space-y-1 transition-colors cursor-pointer ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                <div className="font-bold text-[var(--text-primary)] flex items-center justify-between">
                  <span>{p.name}</span>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {p.focus}
                </p>
              </button>
            );
          })}
        </div>

        {/* High-CTR Alternate Titles */}
        {alternateTitles.length > 0 && (
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              AI 拟定高点击率备选书名（点击即可一键设为当前书名）：
            </label>
            <div className="flex flex-wrap gap-2">
              {alternateTitles.map((t, i) => {
                const clean = t.replace(/[《》]/g, '').trim();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onApplyAlternateTitle(clean)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    《{clean}》
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Commercial Golden Blurb */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-primary)]">
              黄金 300 字书城投放商业简介（含核心卖点梗 · 名场面切片 · 立意标明）：
            </label>
            {commercialBlurb && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(commercialBlurb);
                  onNotify('商业简介已复制到剪贴板', 'info');
                }}
                className="text-xs text-[var(--accent)] flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>复制简介</span>
              </button>
            )}
          </div>
          <textarea
            rows={6}
            value={commercialBlurb}
            onChange={(e) => onChangeCommercialBlurb(e.target.value)}
            placeholder="点击上方「AI 提炼爆款书名与黄金简介」，或在此撰写用于番茄/起点/晋江作品主页展示的吸睛简介..."
            className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed"
          />
        </div>
      </section>

      {/* Long-Form Foreshadowing & Key Prop Ledger */}
      <section className="studio-card p-5 sm:p-6 space-y-4">
        <div className="space-y-1 border-b border-[var(--border-subtle)] pb-3.5">
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif flex items-center gap-2">
            <Flag className="w-4 h-4 text-[var(--accent)]" />
            <span>长篇连载草蛇灰线伏笔与关键道具台账 ({foreshadowLedger.length})</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            未回收的伏笔会自动注入后续章节生成提示词中，彻底解决长篇写到百章后遗忘前期暗线与信物的痛点。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
          <input
            type="text"
            value={newHookName}
            onChange={(e) => setNewHookName(e.target.value)}
            placeholder="伏笔或关键道具名称（例：半枚染血玄铁令）"
            className="studio-input sm:col-span-4 min-h-[40px] px-3 py-2"
          />
          <input
            type="number"
            min={1}
            value={newHookPlanted}
            onChange={(e) => setNewHookPlanted(Math.max(1, Number(e.target.value) || 1))}
            placeholder="埋设章"
            className="studio-input sm:col-span-2 min-h-[40px] px-3 py-2 tabular-nums"
          />
          <input
            type="text"
            value={newHookResolve}
            onChange={(e) => setNewHookResolve(e.target.value)}
            placeholder="预计回收节点（如：第二卷末）"
            className="studio-input sm:col-span-2 min-h-[40px] px-3 py-2"
          />
          <div className="sm:col-span-4 flex gap-2">
            <input
              type="text"
              value={newHookNote}
              onChange={(e) => setNewHookNote(e.target.value)}
              placeholder="真相底牌与回收方式备注..."
              className="studio-input flex-1 min-w-0 min-h-[40px] px-3 py-2"
            />
            <button
              type="button"
              onClick={handleAddForeshadow}
              className="btn-primary min-h-[40px] px-3.5 text-xs shrink-0 cursor-pointer"
            >
              登记
            </button>
          </div>
        </div>

        {foreshadowLedger.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {foreshadowLedger.map((f) => (
              <div
                key={f.id}
                className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{f.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      第 {f.plantedChapter} 章埋入
                      {f.expectedResolveChapter ? ` · 预计 ${f.expectedResolveChapter} 回收` : ''}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)]">{f.note}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={f.status}
                    onChange={(e) =>
                      onUpdateForeshadowLedger(
                        foreshadowLedger.map((item) =>
                          item.id === f.id ? { ...item, status: e.target.value as any } : item
                        )
                      )
                    }
                    className="studio-input px-2.5 py-1 text-xs"
                  >
                    <option value="planted">已埋设（待触发）</option>
                    <option value="fermenting">持续发酵中</option>
                    <option value="resolved">已圆满回收</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateForeshadowLedger(foreshadowLedger.filter((item) => item.id !== f.id))
                    }
                    className="p-1.5 text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Chief Editor Signing Readiness Qualitative Review */}
      <section className="studio-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--accent)]" />
              <span>AI 平台总编签约过稿诊断审阅</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              模拟「{targetPlatform || '主流商业网文平台'}」资深责编视角，对当前大纲、11大设定自洽度、毒点隐患与黄金开篇钩子出具定性改稿意见。
            </p>
          </div>

          <MotionButton
            type="button"
            disabled={isRunningSigningReview}
            onClick={onRunEditorialSigningReview}
            className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isRunningSigningReview ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>责编正在审读全案...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>执行签约过稿审读评估</span>
              </>
            )}
          </MotionButton>
        </div>

        {signingReviewReport ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl studio-muted whitespace-pre-wrap text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {signingReviewReport}
            </div>

            {onExecuteSigningReviewRevisions && (
              <div className="p-4 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span>一键按主编审稿意见全面重构与完善全案</span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      自动依循上述审稿诊断与可落地改稿清单，分 3 阶段连续重修：<strong>① 书名/商业简介/主大纲/人设/11大设定与 L1 总纲</strong> → <strong>② L2 完整分卷与 L3 剧情单元</strong> → <strong>③ 未写 L4 单章细纲与角色/道具/伏笔关联图谱</strong>（已成稿正文与细纲绝对保留）。
                    </p>
                  </div>

                  <MotionButton
                    type="button"
                    disabled={isExecutingSigningRevisions || isRunningSigningReview}
                    onClick={() => onExecuteSigningReviewRevisions(revisionSupplementNote)}
                    className="btn-primary min-h-[42px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isExecutingSigningRevisions ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>全链路重修执行中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键按审稿意见全面重构全案</span>
                      </>
                    )}
                  </MotionButton>
                </div>

                <input
                  type="text"
                  value={revisionSupplementNote}
                  onChange={(e) => setRevisionSupplementNote(e.target.value)}
                  placeholder="可选补充微调指令（例：保留女主高冷设定，只重点按意见第3、4条强化前三章生死危机与钩子...）"
                  className="studio-input w-full px-3 py-2 text-xs"
                />

                {isExecutingSigningRevisions && signingRevisionProgress && (
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent)]/30 text-xs text-[var(--accent)] font-medium flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>{signingRevisionProgress}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
            点击右上角「执行签约过稿审读评估」，获取针对核心卖点、前三章留存力、设定冲突隐患与商业化改进方案的专业审稿反馈。
          </p>
        )}
      </section>
    </div>
  );
};
