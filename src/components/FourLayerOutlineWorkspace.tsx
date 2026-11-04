import React, { useMemo, useState } from 'react';
import {
  Layers,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Trash2,
  Network,
  Compass,
  PenTool,
  Loader2,
  Wrench,
  Package,
  Users,
  Bookmark,
  X,
} from 'lucide-react';
import {
  ApiConfig,
  BookSettings,
  ChapterPacingType,
  LorebookEntry,
  MasterOutlineSpec,
  NovelChapterOutlineItem,
  NovelCharacterRelationNode,
  NovelForeshadowItem,
  NovelKeyItem,
  NovelStoryUnitItem,
  NovelVolumePlanItem,
  UiSettings,
} from '../types';
import {
  buildAiCascadeAuditAndRepairMessages,
  buildFourLayerCascadeSeedMessages,
  buildGenerateUnitChaptersMessages,
  parseFourLayerCascadeSeedResponse,
  parseGeneratedUnitChapters,
  runLocalFourLayerGraphAudit,
  syncCharacterGraphToLorebook,
} from '../services/fourLayerOutlineEngine';
import { chatCompletion } from '../services/apiClient';
import { generateUUID } from '../utils/uuid';
import { MotionButton } from './MotionPrimitives';

interface FourLayerOutlineWorkspaceProps {
  bookTitle: string;
  genre: string;
  style: string;
  outline: string;
  characters: string;
  world: string;
  xpEnabled: boolean;
  xpSummary?: string;
  draftedChapterCount: number;
  masterOutlineSpec: MasterOutlineSpec;
  onChangeMasterSpec: (next: MasterOutlineSpec) => void;
  volumePlan: NovelVolumePlanItem[];
  onChangeVolumePlan: (next: NovelVolumePlanItem[]) => void;
  storyUnits: NovelStoryUnitItem[];
  onChangeStoryUnits: (next: NovelStoryUnitItem[]) => void;
  chapterOutlines: NovelChapterOutlineItem[];
  onChangeChapterOutlines: (next: NovelChapterOutlineItem[]) => void;
  characterGraph: NovelCharacterRelationNode[];
  onChangeCharacterGraph: (next: NovelCharacterRelationNode[]) => void;
  keyItemRegistry: NovelKeyItem[];
  onChangeKeyItemRegistry: (next: NovelKeyItem[]) => void;
  foreshadowLedger: NovelForeshadowItem[];
  onChangeForeshadowLedger: (next: NovelForeshadowItem[]) => void;
  lorebook: LorebookEntry[];
  onChangeLorebook: (next: LorebookEntry[]) => void;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onJumpToWriter: () => void;
}

const PACING_OPTIONS: ChapterPacingType[] = [
  '推进',
  '爆发',
  '感情关系',
  '蓄力铺垫',
  '日常喘息',
  '过渡转场',
];

export const FourLayerOutlineWorkspace: React.FC<FourLayerOutlineWorkspaceProps> = ({
  bookTitle,
  genre,
  style,
  outline,
  characters,
  world,
  xpEnabled,
  xpSummary,
  draftedChapterCount,
  masterOutlineSpec,
  onChangeMasterSpec,
  volumePlan,
  onChangeVolumePlan,
  storyUnits,
  onChangeStoryUnits,
  chapterOutlines,
  onChangeChapterOutlines,
  characterGraph,
  onChangeCharacterGraph,
  keyItemRegistry,
  onChangeKeyItemRegistry,
  foreshadowLedger,
  onChangeForeshadowLedger,
  lorebook,
  onChangeLorebook,
  configs,
  uiSettings,
  onJumpToWriter,
}) => {
  const [subTab, setSubTab] = useState<'l1' | 'l2' | 'l3' | 'l4' | 'graph' | 'audit'>('l1');
  const [selectedVolumeFilter, setSelectedVolumeFilter] = useState<string>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');

  // Batch L4 generation controls
  const [targetGenUnitId, setTargetGenUnitId] = useState<string>('');
  const [genStartCh, setGenStartCh] = useState<number>(Math.max(1, chapterOutlines.length + 1));
  const [genCount, setGenCount] = useState<number>(6);

  const [isGeneratingSeed, setIsGeneratingSeed] = useState(false);
  const [isGeneratingUnitChapters, setIsGeneratingUnitChapters] = useState(false);
  const [isRunningAiRepair, setIsRunningAiRepair] = useState(false);
  const [aiAuditSummary, setAiAuditSummary] = useState<string>('');
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const getActiveApi = () => {
    const cfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  const compositeSettingsForAudit = useMemo(
    () =>
      ({
        genre,
        style,
        chapterWords: 2500,
        pov: '第三人称',
        tense: '现在时',
        temperature: 0.8,
        contextMemory: 3,
        aiPersona: '',
        outline,
        characters,
        world,
        styleReference: null,
        masterOutlineSpec,
        volumePlan,
        storyUnits,
        chapterOutlines,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
      }) as BookSettings,
    [
      genre,
      style,
      outline,
      characters,
      world,
      masterOutlineSpec,
      volumePlan,
      storyUnits,
      chapterOutlines,
      characterGraph,
      keyItemRegistry,
      foreshadowLedger,
    ]
  );

  const auditIssues = useMemo(
    () => runLocalFourLayerGraphAudit(compositeSettingsForAudit, draftedChapterCount),
    [compositeSettingsForAudit, draftedChapterCount]
  );

  const errorCount = auditIssues.filter((i) => i.severity === 'error').length;

  // One-click full 4-layer + entity graph AI cascade seed
  const handleAiSeedAllFourLayers = async () => {
    setIsGeneratingSeed(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildFourLayerCascadeSeedMessages({
        bookTitle,
        genre,
        style,
        outline,
        characters,
        world,
        xpEnabled,
        xpSummary,
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.72,
      });

      const parsed = parseFourLayerCascadeSeedResponse(res.content);
      onChangeMasterSpec(parsed.masterOutlineSpec);
      onChangeVolumePlan(parsed.volumePlan);
      onChangeStoryUnits(parsed.storyUnits);

      // Preserve already drafted chapter outlines while merging newly planned ones
      const draftedExisting = chapterOutlines.filter((c) => c.status === 'drafted');
      const draftedIdxSet = new Set(draftedExisting.map((c) => c.chapterIndex));
      const mergedChapters = [
        ...draftedExisting,
        ...parsed.chapterOutlines.filter((c) => !draftedIdxSet.has(c.chapterIndex)),
      ].sort((a, b) => a.chapterIndex - b.chapterIndex);
      onChangeChapterOutlines(mergedChapters);

      onChangeCharacterGraph(parsed.characterGraph);
      onChangeKeyItemRegistry(parsed.keyItemRegistry);
      onChangeForeshadowLedger(parsed.foreshadowLedger);

      // Sync characters to Lorebook automatically
      const nextLore = syncCharacterGraphToLorebook(parsed.characterGraph, lorebook);
      onChangeLorebook(nextLore);

      if (parsed.storyUnits[0]) {
        setTargetGenUnitId(parsed.storyUnits[0].id);
      }
      setGenStartCh(mergedChapters.length + 1);
      setBannerMsg({
        type: 'ok',
        text: `四层拆纲与关联图谱推演完成：L1终局已锚定 · ${parsed.volumePlan.length}卷 · ${parsed.storyUnits.length}个防跑偏单元 · ${mergedChapters.length}章细纲 · ${parsed.characterGraph.length}名角色 · ${parsed.keyItemRegistry.length}件道具 · ${parsed.foreshadowLedger.length}条伏笔已全部打通（请记得点击保存设定）！`,
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `四层拆纲推演失败：${err.message}` });
    } finally {
      setIsGeneratingSeed(false);
    }
  };

  // Generate L4 Chapters under a chosen L3 Story Unit
  const handleGenerateChaptersForUnit = async (explicitUnit?: NovelStoryUnitItem) => {
    const unit =
      explicitUnit ||
      storyUnits.find((u) => u.id === targetGenUnitId) ||
      storyUnits[0];

    if (!unit) {
      setBannerMsg({
        type: 'err',
        text: '请先在「L3 剧情单元纲」创建至少 1 个剧情单元（或点击右上角 AI 一键推演四层拆纲），确保单章细纲围绕单元与分卷目标不跑偏！',
      });
      setSubTab('l3');
      return;
    }

    const parentVol = volumePlan.find((v) => v.id === unit.volumeId) || volumePlan[0];
    setIsGeneratingUnitChapters(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildGenerateUnitChaptersMessages({
        bookTitle,
        settings: compositeSettingsForAudit,
        targetUnit: unit,
        parentVolume: parentVol,
        startChapter: genStartCh,
        chapterCount: Math.max(1, Math.min(15, genCount)),
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.72,
      });

      const generated = parseGeneratedUnitChapters({
        rawResponse: res.content,
        targetUnit: unit,
        parentVolume: parentVol,
        settings: compositeSettingsForAudit,
      });

      const genIdxSet = new Set(generated.map((g) => g.chapterIndex));
      const merged = [
        ...chapterOutlines.filter((c) => !genIdxSet.has(c.chapterIndex)),
        ...generated,
      ].sort((a, b) => a.chapterIndex - b.chapterIndex);

      onChangeChapterOutlines(merged);
      setGenStartCh(merged.length > 0 ? merged[merged.length - 1].chapterIndex + 1 : 1);
      setSubTab('l4');
      setBannerMsg({
        type: 'ok',
        text: `已围绕单元《${unit.title}》生成 ${generated.length} 章 L4 单章细纲，并自动绑定关联角色、关键道具与伏笔！`,
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `单章细纲生成失败：${err.message}` });
    } finally {
      setIsGeneratingUnitChapters(false);
    }
  };

  // AI Layer-by-Layer Cascade Audit & Auto-Repair
  const handleRunAiCascadeRepair = async () => {
    setIsRunningAiRepair(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildAiCascadeAuditAndRepairMessages({
        bookTitle,
        settings: compositeSettingsForAudit,
        localIssues: auditIssues,
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.5,
      });

      const cleaned = res.content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('核对结果未返回有效 JSON');
      const parsed = JSON.parse(cleaned.slice(s, e + 1));

      if (parsed.patchedMasterUltimateEnding && !masterOutlineSpec.ultimateEnding?.trim()) {
        onChangeMasterSpec({
          ...masterOutlineSpec,
          ultimateEnding: String(parsed.patchedMasterUltimateEnding),
        });
      }

      if (Array.isArray(parsed.patchedUnits) && parsed.patchedUnits.length > 0) {
        const patchMap = new Map(parsed.patchedUnits.map((u: any) => [u.id, u]));
        onChangeStoryUnits(
          storyUnits.map((u) => {
            const p: any = patchMap.get(u.id);
            if (!p) return u;
            return {
              ...u,
              volumeAlignment: p.volumeAlignment ? String(p.volumeAlignment) : u.volumeAlignment,
              breakthroughMethod: p.breakthroughMethod
                ? String(p.breakthroughMethod)
                : u.breakthroughMethod,
            };
          })
        );
      }

      if (Array.isArray(parsed.patchedChapters) && parsed.patchedChapters.length > 0) {
        const chPatchMap = new Map(parsed.patchedChapters.map((c: any) => [c.id, c]));
        onChangeChapterOutlines(
          chapterOutlines.map((c) => {
            const p: any = chPatchMap.get(c.id);
            if (!p) return c;
            return {
              ...c,
              protagonistGoal: p.protagonistGoal ? String(p.protagonistGoal) : c.protagonistGoal,
              coreObstacle: p.coreObstacle ? String(p.coreObstacle) : c.coreObstacle,
              stateDelta: p.stateDelta ? String(p.stateDelta) : c.stateDelta,
              hookNote: p.hookNote ? String(p.hookNote) : c.hookNote,
            };
          })
        );
      }

      if (Array.isArray(parsed.patchedCharacters) && parsed.patchedCharacters.length > 0) {
        const charPatchMap = new Map(parsed.patchedCharacters.map((c: any) => [c.id, c]));
        const nextChars = characterGraph.map((c) => {
          const p: any = charPatchMap.get(c.id);
          if (!p) return c;
          return {
            ...c,
            epistemicBoundary: p.epistemicBoundary
              ? String(p.epistemicBoundary)
              : c.epistemicBoundary,
          };
        });
        onChangeCharacterGraph(nextChars);
        onChangeLorebook(syncCharacterGraphToLorebook(nextChars, lorebook));
      }

      setAiAuditSummary(String(parsed.auditConclusion || '已完成四层逐级核对与缺漏修补。'));
      setBannerMsg({
        type: 'ok',
        text: '逐层核对纠错已完成：已自动补全防跑偏锚点、单章目标/阻力/钩子及角色知情权边界！',
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `逐层核对纠错失败：${err.message}` });
    } finally {
      setIsRunningAiRepair(false);
    }
  };

  // Toggle entity chip helper on L4 Chapter card
  const toggleChapterEntityLink = (
    chapterId: string,
    field: 'linkedCharacterIds' | 'linkedItemIds' | 'linkedForeshadowIds',
    entityId: string
  ) => {
    onChangeChapterOutlines(
      chapterOutlines.map((ch) => {
        if (ch.id !== chapterId) return ch;
        const curr = ch[field] || [];
        const exists = curr.includes(entityId);
        return {
          ...ch,
          [field]: exists ? curr.filter((x) => x !== entityId) : [...curr, entityId],
        };
      })
    );
  };

  const sortedChapters = useMemo(
    () =>
      [...chapterOutlines]
        .filter((c) => {
          if (selectedVolumeFilter !== 'all' && c.volumeId !== selectedVolumeFilter) return false;
          if (selectedUnitFilter !== 'all' && c.unitId !== selectedUnitFilter) return false;
          return true;
        })
        .sort((a, b) => a.chapterIndex - b.chapterIndex),
    [chapterOutlines, selectedVolumeFilter, selectedUnitFilter]
  );

  return (
    <section className="studio-card p-5 sm:p-7 space-y-5">
      {/* Top Architecture Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              四层滚动拆纲法 & 全设定强关联中枢
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            <strong>L1 总纲定最终结局</strong> → <strong>L2 分卷纲定阶段目标</strong> → <strong>L3 剧情单元纲围绕卷目标不跑偏</strong> → <strong>L4 单章细纲定主角目标/阻力/钩子</strong>，并与角色知情权、关键道具流转、伏笔账本实时双向联动。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <MotionButton
            type="button"
            disabled={isGeneratingSeed}
            onClick={handleAiSeedAllFourLayers}
            className="btn-primary min-h-[42px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isGeneratingSeed ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isGeneratingSeed ? '正在推演四层拆纲与关联图谱...' : 'AI 一键推演四层拆纲 + 关联图谱'}</span>
          </MotionButton>

          <MotionButton
            type="button"
            onClick={() => setSubTab('audit')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              errorCount > 0
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : auditIssues.length > 0
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {auditIssues.length > 0 ? (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>逐层核对纠错 ({auditIssues.length})</span>
          </MotionButton>
        </div>
      </div>

      {bannerMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            bannerMsg.type === 'err'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="p-1 rounded hover:bg-black/5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 6-Layer Sub-Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'l1', label: 'L1 总纲与最终结局' },
          { id: 'l2', label: `L2 分卷阶段纲 (${volumePlan.length})` },
          { id: 'l3', label: `L3 剧情单元纲 (${storyUnits.length})` },
          { id: 'l4', label: `L4 单章细纲 (${chapterOutlines.length})` },
          {
            id: 'graph',
            label: `角色/道具/伏笔关联库 (${
              characterGraph.length + keyItemRegistry.length + foreshadowLedger.length
            })`,
          },
          { id: 'audit', label: `逐层核对纠错台 (${auditIssues.length})` },
        ].map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as any)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                  : 'bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          LAYER 1: MASTER OUTLINE & ULTIMATE ENDING
      ===================================================================== */}
      {subTab === 'l1' && (
        <div className="space-y-4">
          <div className="p-3.5 studio-muted text-xs text-[var(--text-secondary)] leading-relaxed">
            <strong>L1 总纲法则：</strong>百万字长篇之所以中后期崩盘，90% 是因为开书只写了前三十章爽点而没有锁死<strong>最终结局锚点</strong>与<strong>战力/秩序天花板</strong>。请在此定下全书终极归宿，L2 分卷与 L3 单元均围绕此终点倒推。
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                1. 最终结局锚点（全书终极闭合状态 · 必填核心）
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.ultimateEnding}
                onChange={(e) =>
                  onChangeMasterSpec({ ...masterOutlineSpec, ultimateEnding: e.target.value })
                }
                placeholder="例：主角彻底斩断三界灵脉垄断契约，与辰渊重建人魔共生新秩序，揭开万年神战真相..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                2. 核心读者契约（黄金三章承诺与核心卖点）
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.corePromise}
                onChange={(e) =>
                  onChangeMasterSpec({ ...masterOutlineSpec, corePromise: e.target.value })
                }
                placeholder="例：高反差身份掉马 + 绝境智取护短，每卷兑现一次认知颠覆..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                3. 战力 / 权势 / 规则顶层天花板（严防后期战力通胀）
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.worldCeiling}
                onChange={(e) =>
                  onChangeMasterSpec({ ...masterOutlineSpec, worldCeiling: e.target.value })
                }
                placeholder="例：至高境只有三位且每次出手必折损本源寿元，不存在无限套娃换地图升级..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                4. 主线核心推进脉络
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.mainPlotline}
                onChange={(e) =>
                  onChangeMasterSpec({ ...masterOutlineSpec, mainPlotline: e.target.value })
                }
                placeholder="贯穿全书的外部生存/晋升/复仇主轴..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                5. 感情线 / 双主副线交织脉络
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.emotionalOrSubPlotline}
                onChange={(e) =>
                  onChangeMasterSpec({
                    ...masterOutlineSpec,
                    emotionalOrSubPlotline: e.target.value,
                  })
                }
                placeholder="人物关系从戒备试探 → 利益共谋 → 生死托付的阶段拉扯..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                6. 幕后暗线与终极悬念（与主线互为因果）
              </label>
              <textarea
                rows={3}
                value={masterOutlineSpec.darkPlotline}
                onChange={(e) =>
                  onChangeMasterSpec({ ...masterOutlineSpec, darkPlotline: e.target.value })
                }
                placeholder="藏在水面之下的历史真相或幕后操盘者布局..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LAYER 2: VOLUME PLAN (STAGE GOALS & ENTRY->EXIT CONTRAST)
      ===================================================================== */}
      {subTab === 'l2' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              L2 分卷纲负责将最终结局切分为可执行的阶段战役，明确每卷<strong>阶段核心目标</strong>及<strong>入卷起点 → 出卷终点状态反差</strong>。
            </p>
            <MotionButton
              type="button"
              onClick={() => {
                const nextIdx = volumePlan.length + 1;
                onChangeVolumePlan([
                  ...volumePlan,
                  {
                    id: generateUUID(),
                    volumeIndex: nextIdx,
                    title: `第${nextIdx}卷新篇章`,
                    chapterSpan: `第${(nextIdx - 1) * 25 + 1}章 - 第${nextIdx * 25}章`,
                    stageGoal: '',
                    entryState: '',
                    exitState: '',
                    turningPoints: '',
                    coreConflict: '',
                    climaxGoal: '',
                  },
                ]);
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增分卷</span>
            </MotionButton>
          </div>

          {volumePlan.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              暂无 L2 分卷纲，可点击右上角「AI 一键推演四层拆纲」或手动新增分卷。
            </div>
          ) : (
            <div className="space-y-3">
              {volumePlan.map((vol, idx) => (
                <div
                  key={vol.id}
                  className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
                      <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold tabular-nums shrink-0">
                        第 {vol.volumeIndex} 卷
                      </span>
                      <input
                        type="text"
                        value={vol.title}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, title: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="卷标题"
                        className="studio-input px-2.5 py-1.5 text-xs font-bold flex-1 min-w-[140px]"
                      />
                      <input
                        type="text"
                        value={vol.chapterSpan}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, chapterSpan: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="第1章 - 第25章"
                        className="studio-input px-2.5 py-1.5 text-xs w-36 tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onChangeVolumePlan(volumePlan.filter((v) => v.id !== vol.id))}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        本卷阶段核心目标（承上启下里程碑）
                      </label>
                      <input
                        type="text"
                        value={vol.stageGoal || ''}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, stageGoal: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="本卷必须拿下的阶段性战略目标..."
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        卷末大高潮与破局落点
                      </label>
                      <input
                        type="text"
                        value={vol.climaxGoal}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, climaxGoal: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="卷末引爆事件与反向刹车新悬念..."
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        入卷起点状态（主角开卷处境）
                      </label>
                      <input
                        type="text"
                        value={vol.entryState || ''}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, entryState: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="例：身处偏远药谷，修为受限，对仙界围猎毫不知情"
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        出卷终点状态反差（收官跃迁）
                      </label>
                      <input
                        type="text"
                        value={vol.exitState || ''}
                        onChange={(e) => {
                          const next = [...volumePlan];
                          next[idx] = { ...vol, exitState: e.target.value };
                          onChangeVolumePlan(next);
                        }}
                        placeholder="例：身份暴露被迫拔营入世，掌握首枚古印但引来上界追缉"
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          LAYER 3: STORY UNITS (ANTI-DRIFT ANCHOR TO VOLUME GOAL)
      ===================================================================== */}
      {subTab === 'l3' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              L3 剧情单元纲（每单元 4~10 章）是<strong>防止长篇中盘水文跑偏</strong>的核心锁扣：每个单元必须写明如何服务父卷目标，且相邻单元破局手段不得重复。
            </p>
            <MotionButton
              type="button"
              onClick={() => {
                const nextIdx = storyUnits.length + 1;
                const defaultVolId = volumePlan[0]?.id || '';
                const newUnit: NovelStoryUnitItem = {
                  id: generateUUID(),
                  volumeId: defaultVolId,
                  unitIndex: nextIdx,
                  title: `第${nextIdx}剧情单元`,
                  chapterSpan: `第${(nextIdx - 1) * 6 + 1}章 - 第${nextIdx * 6}章`,
                  volumeAlignment: '',
                  coreConflict: '',
                  payoffEvent: '',
                  breakthroughMethod: '',
                  linkedCharacterIds: [],
                  linkedItemIds: [],
                  linkedForeshadowIds: [],
                };
                onChangeStoryUnits([...storyUnits, newUnit]);
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增剧情单元</span>
            </MotionButton>
          </div>

          {storyUnits.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              暂无 L3 剧情单元纲。点击上方「AI 一键推演四层拆纲」可自动根据分卷拆出防跑偏剧情单元。
            </div>
          ) : (
            <div className="space-y-3">
              {storyUnits.map((unit, idx) => (
                <div
                  key={unit.id}
                  className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <span className="px-2 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-primary)] text-[11px] font-bold tabular-nums shrink-0">
                        单元 {unit.unitIndex}
                      </span>
                      <select
                        value={unit.volumeId}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, volumeId: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        className="studio-input px-2.5 py-1.5 text-xs"
                      >
                        <option value="">选择所属分卷...</option>
                        {volumePlan.map((v) => (
                          <option key={v.id} value={v.id}>
                            第{v.volumeIndex}卷《{v.title}》
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={unit.title}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, title: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        placeholder="单元名称"
                        className="studio-input px-2.5 py-1.5 text-xs font-bold flex-1 min-w-[140px]"
                      />
                      <input
                        type="text"
                        value={unit.chapterSpan}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, chapterSpan: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        placeholder="第1章 - 第6章"
                        className="studio-input px-2.5 py-1.5 text-xs w-32 tabular-nums"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <MotionButton
                        type="button"
                        disabled={isGeneratingUnitChapters}
                        onClick={() => handleGenerateChaptersForUnit(unit)}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>拆解本单元单章细纲</span>
                      </MotionButton>
                      <button
                        type="button"
                        onClick={() => onChangeStoryUnits(storyUnits.filter((u) => u.id !== unit.id))}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-[var(--accent)] mb-1">
                        ★ 围绕所属分卷目标不跑偏锚点（本单元必须向卷目标交付什么进度？）
                      </label>
                      <input
                        type="text"
                        value={unit.volumeAlignment}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, volumeAlignment: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        placeholder="例：验证主角古药血脉可压制魔尊咒印，迫使仙门探子露出马脚，完成第1卷出山前置条件"
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        单元核心冲突
                      </label>
                      <input
                        type="text"
                        value={unit.coreConflict}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, coreConflict: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        placeholder="本单元主要对手与压迫危机..."
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        破局手段标签（强制相邻单元不雷同）
                      </label>
                      <input
                        type="text"
                        value={unit.breakthroughMethod}
                        onChange={(e) => {
                          const next = [...storyUnits];
                          next[idx] = { ...unit, breakthroughMethod: e.target.value };
                          onChangeStoryUnits(next);
                        }}
                        placeholder="例：伪造药毒假象诱敌入瓮（下单元须换用其他破局法）"
                        className="studio-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          LAYER 4: CHAPTER OUTLINES (GOAL / OBSTACLE / QUOTA / HOOK + ENTITY TAGS)
      ===================================================================== */}
      {subTab === 'l4' && (
        <div className="space-y-4">
          {/* Batch Continue Generation Bar */}
          <div className="p-3.5 studio-muted flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--text-primary)] whitespace-nowrap">
                围绕单元续写细纲：
              </span>
              <select
                value={targetGenUnitId}
                onChange={(e) => setTargetGenUnitId(e.target.value)}
                className="studio-input px-2.5 py-1.5 text-xs max-w-[200px]"
              >
                <option value="">自动选用当前剧情单元</option>
                {storyUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    单元{u.unitIndex}《{u.title}》({u.chapterSpan})
                  </option>
                ))}
              </select>
              <span className="text-[var(--text-muted)] whitespace-nowrap">起始章</span>
              <input
                type="number"
                min={1}
                value={genStartCh}
                onChange={(e) => setGenStartCh(Math.max(1, Number(e.target.value) || 1))}
                className="studio-input w-16 px-2 py-1.5 text-xs tabular-nums text-center"
              />
              <span className="text-[var(--text-muted)] whitespace-nowrap">连生章数</span>
              <input
                type="number"
                min={1}
                max={15}
                value={genCount}
                onChange={(e) =>
                  setGenCount(Math.max(1, Math.min(15, Number(e.target.value) || 6)))
                }
                className="studio-input w-16 px-2 py-1.5 text-xs tabular-nums text-center"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <MotionButton
                type="button"
                disabled={isGeneratingUnitChapters}
                onClick={() => handleGenerateChaptersForUnit()}
                className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isGeneratingUnitChapters ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{isGeneratingUnitChapters ? '正在拆解单章细纲...' : 'AI 生成指定区间单章细纲'}</span>
              </MotionButton>

              <MotionButton
                type="button"
                onClick={() => {
                  const nextIdx =
                    chapterOutlines.length > 0
                      ? Math.max(...chapterOutlines.map((c) => c.chapterIndex)) + 1
                      : 1;
                  onChangeChapterOutlines([
                    ...chapterOutlines,
                    {
                      id: generateUUID(),
                      chapterIndex: nextIdx,
                      title: '新规划章节',
                      volumeId: volumePlan[0]?.id,
                      unitId: storyUnits[0]?.id,
                      pacingType: '推进',
                      protagonistGoal: '',
                      coreObstacle: '',
                      stateDelta: '',
                      summary: '',
                      hookNote: '',
                      linkedCharacterIds: [],
                      linkedItemIds: [],
                      linkedForeshadowIds: [],
                      status: 'planned',
                    },
                  ]);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动加一章</span>
              </MotionButton>
            </div>
          </div>

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedVolumeFilter}
                onChange={(e) => setSelectedVolumeFilter(e.target.value)}
                className="studio-input px-2.5 py-1.5 text-xs"
              >
                <option value="all">全部分卷 ({volumePlan.length})</option>
                {volumePlan.map((v) => (
                  <option key={v.id} value={v.id}>
                    第{v.volumeIndex}卷《{v.title}》
                  </option>
                ))}
              </select>
              <select
                value={selectedUnitFilter}
                onChange={(e) => setSelectedUnitFilter(e.target.value)}
                className="studio-input px-2.5 py-1.5 text-xs"
              >
                <option value="all">全部剧情单元 ({storyUnits.length})</option>
                {storyUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    单元{u.unitIndex}《{u.title}》
                  </option>
                ))}
              </select>
            </div>

            <MotionButton
              type="button"
              onClick={onJumpToWriter}
              className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>进入正文工坊按纲执笔</span>
            </MotionButton>
          </div>

          {sortedChapters.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              当前筛选下暂无 L4 单章细纲。请点击上方「AI 生成指定区间单章细纲」或「AI 一键推演四层拆纲」。
            </div>
          ) : (
            <div className="space-y-3">
              {sortedChapters.map((ch) => {
                const realIdx = chapterOutlines.findIndex((x) => x.id === ch.id);
                const updateCh = (patch: Partial<NovelChapterOutlineItem>) => {
                  const next = [...chapterOutlines];
                  if (realIdx >= 0) {
                    next[realIdx] = { ...ch, ...patch };
                    onChangeChapterOutlines(next);
                  }
                };
                return (
                  <div
                    key={ch.id}
                    className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold tabular-nums shrink-0">
                          第 {ch.chapterIndex} 章
                        </span>
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => updateCh({ title: e.target.value })}
                          placeholder="单章标题"
                          className="studio-input px-2.5 py-1.5 text-xs font-bold flex-1 min-w-[140px]"
                        />
                        <select
                          value={ch.pacingType || '推进'}
                          onChange={(e) => updateCh({ pacingType: e.target.value as ChapterPacingType })}
                          className="studio-input px-2 py-1.5 text-xs"
                        >
                          {PACING_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              节奏：{p}
                            </option>
                          ))}
                        </select>
                        <select
                          value={ch.unitId || ''}
                          onChange={(e) => {
                            const matchedUnit = storyUnits.find((u) => u.id === e.target.value);
                            updateCh({
                              unitId: e.target.value || undefined,
                              volumeId: matchedUnit?.volumeId || ch.volumeId,
                            });
                          }}
                          className="studio-input px-2 py-1.5 text-xs max-w-[160px]"
                        >
                          <option value="">归属单元...</option>
                          {storyUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              单元{u.unitIndex}·{u.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[11px] font-medium ${
                            ch.status === 'drafted' || ch.chapterIndex <= draftedChapterCount
                              ? 'text-emerald-600'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {ch.status === 'drafted' || ch.chapterIndex <= draftedChapterCount
                            ? '已成稿 ✓'
                            : '待执笔'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeChapterOutlines(chapterOutlines.filter((x) => x.id !== ch.id))
                          }
                          className="p-1 rounded text-[var(--text-muted)] hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Core 4-Element L4 Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          1. 主角本章目标
                        </label>
                        <input
                          type="text"
                          value={ch.protagonistGoal || ''}
                          onChange={(e) => updateCh({ protagonistGoal: e.target.value })}
                          placeholder="主角在本章想解决/获取什么？"
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          2. 核心外部/内部阻力
                        </label>
                        <input
                          type="text"
                          value={ch.coreObstacle || ''}
                          onChange={(e) => updateCh({ coreObstacle: e.target.value })}
                          placeholder="遭遇什么强力阻挠、代价或信息差？"
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--accent)] mb-1">
                          3. 章末悬念钩子 (Hook)
                        </label>
                        <input
                          type="text"
                          value={ch.hookNote || ''}
                          onChange={(e) => updateCh({ hookNote: e.target.value })}
                          placeholder="章末停在什么异变或半句台词上？"
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          剧情事件梗概（2~3句）
                        </label>
                        <textarea
                          rows={2}
                          value={ch.summary}
                          onChange={(e) => updateCh({ summary: e.target.value })}
                          className="studio-input w-full p-2.5 text-xs leading-relaxed"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          单章实质推进配额（防剧情加速或原地踏步）
                        </label>
                        <textarea
                          rows={2}
                          value={ch.stateDelta || ''}
                          onChange={(e) => updateCh({ stateDelta: e.target.value })}
                          placeholder="本章唯一改变的局势/关系/线索增量..."
                          className="studio-input w-full p-2.5 text-xs leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Interactive Cross-Entity Relational Binding Row */}
                    {(characterGraph.length > 0 ||
                      keyItemRegistry.length > 0 ||
                      foreshadowLedger.length > 0) && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-[var(--text-muted)] mr-1 flex items-center gap-1">
                          <Network className="w-3 h-3" /> 本章关联锚点：
                        </span>
                        {characterGraph.map((cg) => {
                          const linked = (ch.linkedCharacterIds || []).includes(cg.id);
                          return (
                            <button
                              key={cg.id}
                              type="button"
                              onClick={() =>
                                toggleChapterEntityLink(ch.id, 'linkedCharacterIds', cg.id)
                              }
                              className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                linked
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              角色:{cg.name}
                            </button>
                          );
                        })}
                        {keyItemRegistry.map((it) => {
                          const linked = (ch.linkedItemIds || []).includes(it.id);
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => toggleChapterEntityLink(ch.id, 'linkedItemIds', it.id)}
                              className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                linked
                                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              道具:{it.name}
                            </button>
                          );
                        })}
                        {foreshadowLedger.map((fs) => {
                          const linked = (ch.linkedForeshadowIds || []).includes(fs.id);
                          return (
                            <button
                              key={fs.id}
                              type="button"
                              onClick={() =>
                                toggleChapterEntityLink(ch.id, 'linkedForeshadowIds', fs.id)
                              }
                              className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                linked
                                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold'
                                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              伏笔:{fs.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          CROSS-ENTITY RELATIONAL GRAPH (CHARACTERS / KEY ITEMS / FORESHADOWS)
      ===================================================================== */}
      {subTab === 'graph' && (
        <div className="space-y-6">
          {/* 1. Character Graph & Epistemic Boundaries */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  角色声纹与知情权隔离图谱 ({characterGraph.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <MotionButton
                  type="button"
                  onClick={() => {
                    const nextLore = syncCharacterGraphToLorebook(characterGraph, lorebook);
                    onChangeLorebook(nextLore);
                    setBannerMsg({
                      type: 'ok',
                      text: `已将 ${characterGraph.length} 名角色的声纹与知情权边界双向同步至世界书 (Lorebook)！`,
                    });
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium cursor-pointer"
                >
                  同步至世界书
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={() =>
                    onChangeCharacterGraph([
                      ...characterGraph,
                      {
                        id: generateUUID(),
                        name: '新角色',
                        roleType: '重要配角',
                        coreDesire: '',
                        speechStyle: '',
                        epistemicBoundary: '仅知晓自身亲历事件，不知晓幕后黑手',
                        currentStatus: '正常登场',
                        relations: [],
                      },
                    ])
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 新增角色节点
                </MotionButton>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {characterGraph.map((cg, idx) => (
                <div
                  key={cg.id}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={cg.name}
                        onChange={(e) => {
                          const next = [...characterGraph];
                          next[idx] = { ...cg, name: e.target.value };
                          onChangeCharacterGraph(next);
                        }}
                        className="studio-input px-2.5 py-1 text-xs font-bold w-28"
                      />
                      <select
                        value={cg.roleType}
                        onChange={(e) => {
                          const next = [...characterGraph];
                          next[idx] = { ...cg, roleType: e.target.value as any };
                          onChangeCharacterGraph(next);
                        }}
                        className="studio-input px-2 py-1 text-xs"
                      >
                        {['主角', '核心主配/CP', '重要配角', '阶段反派', '幕后反派'].map((rt) => (
                          <option key={rt} value={rt}>
                            {rt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeCharacterGraph(characterGraph.filter((x) => x.id !== cg.id))
                      }
                      className="p-1 text-[var(--text-muted)] hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={cg.coreDesire}
                    onChange={(e) => {
                      const next = [...characterGraph];
                      next[idx] = { ...cg, coreDesire: e.target.value };
                      onChangeCharacterGraph(next);
                    }}
                    placeholder="核心欲望与执念驱动力..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={cg.speechStyle}
                    onChange={(e) => {
                      const next = [...characterGraph];
                      next[idx] = { ...cg, speechStyle: e.target.value };
                      onChangeCharacterGraph(next);
                    }}
                    placeholder="专属说话声纹/口癖（遮住名字能认出是谁）..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={cg.epistemicBoundary}
                    onChange={(e) => {
                      const next = [...characterGraph];
                      next[idx] = { ...cg, epistemicBoundary: e.target.value };
                      onChangeCharacterGraph(next);
                    }}
                    placeholder="★ 知情权隔离边界（明确尚不知晓什么秘密，防上帝视角）..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={cg.currentStatus}
                    onChange={(e) => {
                      const next = [...characterGraph];
                      next[idx] = { ...cg, currentStatus: e.target.value };
                      onChangeCharacterGraph(next);
                    }}
                    placeholder="实时状态（位置/伤势/立场）..."
                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 2. Key Item Registry */}
          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  关键道具流转与使用代价表 ({keyItemRegistry.length})
                </h3>
              </div>
              <MotionButton
                type="button"
                onClick={() =>
                  onChangeKeyItemRegistry([
                    ...keyItemRegistry,
                    {
                      id: generateUUID(),
                      name: '新关键道具',
                      category: '核心信物',
                      holderName: characterGraph[0]?.name || '主角',
                      holderCharacterId: characterGraph[0]?.id,
                      originChapter: 1,
                      rulesAndCost: '',
                      status: '主角持有',
                    },
                  ])
                }
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增关键道具
              </MotionButton>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {keyItemRegistry.map((item, idx) => {
                const linkedChNums = chapterOutlines
                  .filter((c) => (c.linkedItemIds || []).includes(item.id))
                  .map((c) => `第${c.chapterIndex}章`);
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const next = [...keyItemRegistry];
                            next[idx] = { ...item, name: e.target.value };
                            onChangeKeyItemRegistry(next);
                          }}
                          className="studio-input px-2.5 py-1 text-xs font-bold flex-1"
                        />
                        <select
                          value={item.status}
                          onChange={(e) => {
                            const next = [...keyItemRegistry];
                            next[idx] = { ...item, status: e.target.value as any };
                            onChangeKeyItemRegistry(next);
                          }}
                          className="studio-input px-2 py-1 text-xs"
                        >
                          {['未现世', '主角持有', '他人持有', '争夺遗失', '已消耗损毁'].map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeKeyItemRegistry(keyItemRegistry.filter((x) => x.id !== item.id))
                        }
                        className="p-1 text-[var(--text-muted)] hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={item.holderName}
                        onChange={(e) => {
                          const matchedChar = characterGraph.find(
                            (c) => c.name === e.target.value.trim()
                          );
                          const next = [...keyItemRegistry];
                          next[idx] = {
                            ...item,
                            holderName: e.target.value,
                            holderCharacterId: matchedChar?.id,
                          };
                          onChangeKeyItemRegistry(next);
                        }}
                        placeholder="当前持有者/所在地"
                        className="studio-input px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={item.category}
                        onChange={(e) => {
                          const next = [...keyItemRegistry];
                          next[idx] = { ...item, category: e.target.value };
                          onChangeKeyItemRegistry(next);
                        }}
                        placeholder="分类（杀器/契约/线索）"
                        className="studio-input px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    <input
                      type="text"
                      value={item.rulesAndCost}
                      onChange={(e) => {
                        const next = [...keyItemRegistry];
                        next[idx] = { ...item, rulesAndCost: e.target.value };
                        onChangeKeyItemRegistry(next);
                      }}
                      placeholder="功能规则与硬性使用代价（防机械降神）..."
                      className="studio-input w-full px-2.5 py-1.5 text-xs"
                    />

                    {linkedChNums.length > 0 && (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        细纲调用章节：{linkedChNums.join('、')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Foreshadowing Ledger */}
          <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  长线伏笔因果账本 ({foreshadowLedger.length})
                </h3>
              </div>
              <MotionButton
                type="button"
                onClick={() =>
                  onChangeForeshadowLedger([
                    ...foreshadowLedger,
                    {
                      id: generateUUID(),
                      name: '新埋伏笔',
                      plantedChapter: Math.max(1, draftedChapterCount || 1),
                      expectedResolveChapter: '第20章',
                      status: 'planted',
                      note: '',
                    },
                  ])
                }
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增伏笔
              </MotionButton>
            </div>

            <div className="space-y-2.5">
              {foreshadowLedger.map((fs, idx) => (
                <div
                  key={fs.id}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs"
                >
                  <input
                    type="text"
                    value={fs.name}
                    onChange={(e) => {
                      const next = [...foreshadowLedger];
                      next[idx] = { ...fs, name: e.target.value };
                      onChangeForeshadowLedger(next);
                    }}
                    placeholder="伏笔名称"
                    className="studio-input px-2.5 py-1.5 text-xs font-bold md:col-span-3"
                  />
                  <div className="flex items-center gap-1.5 md:col-span-3">
                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">埋入章</span>
                    <input
                      type="number"
                      min={1}
                      value={fs.plantedChapter}
                      onChange={(e) => {
                        const next = [...foreshadowLedger];
                        next[idx] = { ...fs, plantedChapter: Number(e.target.value) || 1 };
                        onChangeForeshadowLedger(next);
                      }}
                      className="studio-input w-14 px-2 py-1.5 text-xs tabular-nums"
                    />
                    <input
                      type="text"
                      value={fs.expectedResolveChapter || ''}
                      onChange={(e) => {
                        const next = [...foreshadowLedger];
                        next[idx] = { ...fs, expectedResolveChapter: e.target.value };
                        onChangeForeshadowLedger(next);
                      }}
                      placeholder="预计回收章"
                      className="studio-input px-2 py-1.5 text-xs flex-1"
                    />
                  </div>
                  <input
                    type="text"
                    value={fs.note}
                    onChange={(e) => {
                      const next = [...foreshadowLedger];
                      next[idx] = { ...fs, note: e.target.value };
                      onChangeForeshadowLedger(next);
                    }}
                    placeholder="草蛇灰线线索与揭晓反转设计..."
                    className="studio-input px-2.5 py-1.5 text-xs md:col-span-4"
                  />
                  <div className="flex items-center justify-end gap-2 md:col-span-2">
                    <select
                      value={fs.status}
                      onChange={(e) => {
                        const next = [...foreshadowLedger];
                        next[idx] = { ...fs, status: e.target.value as any };
                        onChangeForeshadowLedger(next);
                      }}
                      className="studio-input px-2 py-1.5 text-xs"
                    >
                      <option value="planted">已埋设</option>
                      <option value="fermenting">发酵中</option>
                      <option value="resolved">已回收</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeForeshadowLedger(foreshadowLedger.filter((x) => x.id !== fs.id))
                      }
                      className="p-1 text-[var(--text-muted)] hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CASCADE LAYER-BY-LAYER AUDIT & AUTO-REPAIR CONSOLE
      ===================================================================== */}
      {subTab === 'audit' && (
        <div className="space-y-4">
          <div className="p-4 studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  四层拆纲拓扑体检 & AI 逐层核对自动纠错
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                实时核查：L1终局缺失、L3单元脱离卷目标、相邻单元套路雷同、L4缺少目标/阻力/钩子、已损毁道具被后续细纲误调、伏笔超期未回收、角色缺失知情边界。
              </p>
            </div>

            <MotionButton
              type="button"
              disabled={isRunningAiRepair}
              onClick={handleRunAiCascadeRepair}
              className="btn-primary min-h-[40px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isRunningAiRepair ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4" />
              )}
              <span>{isRunningAiRepair ? '正在逐层核对并修补缺漏...' : 'AI 逐层核对并一键自动修补'}</span>
            </MotionButton>
          </div>

          {aiAuditSummary && (
            <div className="p-3.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-xs text-[var(--text-primary)] leading-relaxed">
              <strong>AI 总架构师核对报告：</strong>
              {aiAuditSummary}
            </div>
          )}

          {auditIssues.length === 0 ? (
            <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>
                当前四层拆纲（L1总纲 ↔ L2分卷 ↔ L3单元 ↔ L4单章）与角色知情权、关键道具、伏笔账本拓扑自洽，无断链冲突！
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {auditIssues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                    issue.severity === 'error'
                      ? 'border-rose-500/35 bg-rose-500/10'
                      : 'border-amber-500/35 bg-amber-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-primary)]">
                      [{issue.layer}] {issue.title}
                    </span>
                    <span className="text-[11px] font-semibold shrink-0">
                      {issue.severity === 'error' ? '阻断级冲突' : '跑偏隐患'}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{issue.detail}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    建议修补：{issue.fixSuggestion}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
