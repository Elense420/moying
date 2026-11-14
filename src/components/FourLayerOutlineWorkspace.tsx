import React, { useEffect, useMemo, useState } from 'react';
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
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Link2,
} from 'lucide-react';
import {
  ApiConfig,
  BookSettings,
  ChapterPacingType,
  FourLayerCascadeSyncMeta,
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
  applySyncedEntitiesToSettings,
  autoLinkEntitiesAndCascadeTopology,
  buildAiCascadeAuditAndRepairMessages,
  buildCascadeSyncTargetChaptersMessages,
  buildGenerateL1MasterMessages,
  buildGenerateL2VolumesMessages,
  buildGenerateL3UnitsForVolumeMessages,
  buildGenerateUnitChaptersMessages,
  buildSyncEntitiesFromFourLayersMessages,
  computeGraphSignature,
  computeL1Signature,
  computeL2Signature,
  computeL3Signature,
  computeOutlineAndScaleSignature,
  parseChapterSpanRange,
  parseGeneratedUnitChapters,
  parseL1MasterResponse,
  parseL2VolumesResponse,
  parseL3UnitsForVolumeResponse,
  runLocalFourLayerGraphAudit,
  syncCharacterGraphToLorebook,
} from '../services/fourLayerOutlineEngine';
import { extractScaleRequirementHint, repairAndParseJson } from '../services/outlineJsonParser';
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
  systemSettings?: Record<string, string[]>;
  chapterWords?: number | string;
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
  cascadeSyncMeta?: FourLayerCascadeSyncMeta;
  onChangeCascadeSyncMeta?: (next: FourLayerCascadeSyncMeta) => void;
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
  systemSettings,
  chapterWords,
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
  cascadeSyncMeta,
  onChangeCascadeSyncMeta,
  configs,
  uiSettings,
  onJumpToWriter,
}) => {
  const [subTab, setSubTab] = useState<'l1' | 'l2' | 'l3' | 'l4' | 'graph' | 'audit'>('l1');
  const [selectedVolumeFilter, setSelectedVolumeFilter] = useState<string>('all');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');

  // Batch L4 generation controls
  const [targetGenUnitId, setTargetGenUnitId] = useState<string>(() => storyUnits[0]?.id || '');
  const [genStartCh, setGenStartCh] = useState<number>(() => Math.max(1, chapterOutlines.length + 1));
  const [genCount, setGenCount] = useState<number>(6);

  // Loading states per step
  const [isGeneratingL1, setIsGeneratingL1] = useState(false);
  const [isGeneratingL2, setIsGeneratingL2] = useState(false);
  const [generatingL3VolId, setGeneratingL3VolId] = useState<string | null>(null); // 'ALL' | vol.id | null
  const [isGeneratingUnitChapters, setIsGeneratingUnitChapters] = useState(false);
  const [l4ProgressNote, setL4ProgressNote] = useState<string>('');
  const [isSyncingEntities, setIsSyncingEntities] = useState(false);
  const [isCascadeSyncingChapters, setIsCascadeSyncingChapters] = useState(false);
  const [isRunningAiRepair, setIsRunningAiRepair] = useState(false);
  const [aiAuditSummary, setAiAuditSummary] = useState<string>('');
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const meta = cascadeSyncMeta || {};
  const updateMeta = (patch: Partial<FourLayerCascadeSyncMeta>) => {
    if (!onChangeCascadeSyncMeta) return;
    onChangeCascadeSyncMeta({ ...meta, ...patch });
  };

  // Keep targetGenUnitId valid if storyUnits changes
  useEffect(() => {
    if (storyUnits.length > 0 && !storyUnits.some((u) => u.id === targetGenUnitId)) {
      const first = storyUnits[0];
      setTargetGenUnitId(first.id);
      const span = parseChapterSpanRange(first.chapterSpan, 1, 6);
      setGenStartCh(span.start);
      setGenCount(span.count);
    }
  }, [storyUnits]);

  const handleSelectTargetGenUnit = (unitId: string) => {
    setTargetGenUnitId(unitId);
    const unit = storyUnits.find((u) => u.id === unitId);
    if (unit) {
      const span = parseChapterSpanRange(unit.chapterSpan, Math.max(1, chapterOutlines.length + 1), 6);
      setGenStartCh(span.start);
      setGenCount(span.count);
    }
  };

  const getActiveApi = () => {
    const cfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  // Signatures & Upstream/Downstream Staleness Detection
  const currentOutlineSig = useMemo(
    () => computeOutlineAndScaleSignature(outline, characters, world, systemSettings),
    [outline, characters, world, systemSettings]
  );
  const currentL1Sig = useMemo(() => computeL1Signature(masterOutlineSpec), [masterOutlineSpec]);
  const currentL2Sig = useMemo(() => computeL2Signature(volumePlan), [volumePlan]);
  const currentL3Sig = useMemo(() => computeL3Signature(storyUnits), [storyUnits]);

  const scaleHint = useMemo(
    () => extractScaleRequirementHint(outline, systemSettings, chapterWords),
    [outline, systemSettings, chapterWords]
  );

  const l1Ready = Boolean(masterOutlineSpec.ultimateEnding?.trim() && masterOutlineSpec.mainPlotline?.trim());
  const l1StaleByOutline = Boolean(meta.lastOutlineAndScaleSig && meta.lastOutlineAndScaleSig !== currentOutlineSig);
  const l2StaleByL1 = Boolean(volumePlan.length > 0 && meta.lastL1Sig && meta.lastL1Sig !== currentL1Sig);
  const l3StaleByL2 = Boolean(
    storyUnits.length > 0 &&
      ((meta.lastL2Sig && meta.lastL2Sig !== currentL2Sig) || (meta.staleVolumeIds && meta.staleVolumeIds.length > 0))
  );
  const staleChapterIdsSet = useMemo(() => new Set(meta.staleChapterIds || []), [meta.staleChapterIds]);
  const staleUnitIdsSet = useMemo(() => new Set(meta.staleUnitIds || []), [meta.staleUnitIds]);
  const staleVolumeIdsSet = useMemo(() => new Set(meta.staleVolumeIds || []), [meta.staleVolumeIds]);

  const l4StaleCount = useMemo(
    () =>
      chapterOutlines.filter(
        (c) => c.status !== 'drafted' && (staleChapterIdsSet.has(c.id) || (c.unitId && staleUnitIdsSet.has(c.unitId)))
      ).length,
    [chapterOutlines, staleChapterIdsSet, staleUnitIdsSet]
  );

  // Check if L2 volumes cover the end of L1 / scale reasonably
  const l2TailCoverageWarning = useMemo(() => {
    if (volumePlan.length === 0) return null;
    const lastVol = volumePlan[volumePlan.length - 1];
    const lastRange = parseChapterSpanRange(lastVol.chapterSpan, 1, 20);
    const hasEndingKeywords =
      /终局|结局|完结|落幕|真相大白|最终决战|大结局|达成|闭环/.test(
        `${lastVol.stageGoal || ''} ${lastVol.exitState || ''} ${lastVol.climaxGoal || ''} ${lastVol.title}`
      );
    const scaleText = (systemSettings?.['foundation.scale_structure'] || []).join(' ');
    if (/百万字/.test(scaleText) && lastRange.end < 150) {
      return `当前已拆至第 ${lastRange.end} 章（共 ${volumePlan.length} 卷），但篇幅设定为「${scaleText}」，疑似尚未拆分到终局卷，建议点击「补全后续分卷直至终局」！`;
    }
    if (!hasEndingKeywords && volumePlan.length >= 2 && lastVol.exitState && masterOutlineSpec.ultimateEnding) {
      // Soft check: if there's only 1-2 volumes on a 30w+ scale, alert
      if (/三十万字|五十万字|八十万字/.test(scaleText) && lastRange.end < 70) {
        return `当前末卷止步于第 ${lastRange.end} 章，建议核对是否完整覆盖中后期直至「L1 最终结局锚点」；如有遗漏可点「补全后续分卷直至终局」。`;
      }
    }
    return null;
  }, [volumePlan, systemSettings, masterOutlineSpec.ultimateEnding]);

  const compositeSettingsForAudit = useMemo(
    () =>
      ({
        genre,
        style,
        chapterWords: Number(chapterWords) || 2500,
        pov: '第三人称',
        tense: '现在时',
        temperature: 0.8,
        contextMemory: 3,
        aiPersona: '',
        outline,
        characters,
        world,
        styleReference: null,
        systemSettings,
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
      chapterWords,
      outline,
      characters,
      world,
      systemSettings,
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

  // ============================================================================
  // STEP 1: Generate L1 Master Spec ONLY
  // ============================================================================
  const handleGenerateL1 = async () => {
    setIsGeneratingL1(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildGenerateL1MasterMessages({
        bookTitle,
        genre,
        style,
        outline,
        characters,
        world,
        chapterWords,
        systemSettings,
        xpEnabled,
        xpSummary,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.65,
      });
      const nextSpec = parseL1MasterResponse(res.content);
      onChangeMasterSpec(nextSpec);
      const nextL1Sig = computeL1Signature(nextSpec);
      updateMeta({
        l1Confirmed: false,
        lastOutlineAndScaleSig: currentOutlineSig,
        lastL1Sig: volumePlan.length > 0 ? meta.lastL1Sig : nextL1Sig,
        lastChangeNote: volumePlan.length > 0 ? 'L1 总纲已重新生成，请核对后同步检查 L2 分卷纲' : undefined,
      });
      setBannerMsg({
        type: 'ok',
        text: '第 1 步「L1 总纲与最终结局锚点」已生成！请逐项审阅并微调，确认无误后点击「✓ 确认 L1 无误，进入 L2 分卷纲」。',
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `L1 总纲生成失败：${err.message}` });
    } finally {
      setIsGeneratingL1(false);
    }
  };

  const handleConfirmL1AndNext = () => {
    if (!masterOutlineSpec.ultimateEnding?.trim()) {
      setBannerMsg({ type: 'err', text: '请先填写或 AI 生成「L1 最终结局锚点」再进入下一步。' });
      return;
    }
    updateMeta({
      l1Confirmed: true,
      lastOutlineAndScaleSig: currentOutlineSig,
      lastL1Sig: volumePlan.length === 0 ? currentL1Sig : meta.lastL1Sig || currentL1Sig,
    });
    setSubTab('l2');
  };

  // ============================================================================
  // STEP 2: Generate L2 Volume Plan ONLY (Full to Ending or Append Missing Tail)
  // ============================================================================
  const handleGenerateL2 = async (mode: 'full' | 'append_to_ending' = 'full') => {
    if (!masterOutlineSpec.ultimateEnding?.trim()) {
      setBannerMsg({ type: 'err', text: '请先在 L1 锁定「最终结局锚点」后再生成 L2 分卷纲！' });
      setSubTab('l1');
      return;
    }
    setIsGeneratingL2(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildGenerateL2VolumesMessages({
        bookTitle,
        genre,
        outline,
        characters,
        world,
        chapterWords,
        systemSettings,
        masterOutlineSpec,
        existingVolumes: volumePlan,
        mode,
        xpEnabled,
        xpSummary,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.68,
      });
      const nextVolumes = parseL2VolumesResponse(res.content, volumePlan, mode);
      onChangeVolumePlan(nextVolumes);

      // Cascade updated volume tags to existing chapters/units
      const cascaded = autoLinkEntitiesAndCascadeTopology({
        volumePlan: nextVolumes,
        storyUnits,
        chapterOutlines,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        lorebook,
      });
      onChangeStoryUnits(cascaded.storyUnits);
      onChangeChapterOutlines(cascaded.chapterOutlines);

      const nextL2Sig = computeL2Signature(nextVolumes);
      updateMeta({
        l1Confirmed: true,
        l2Confirmed: false,
        lastL1Sig: currentL1Sig,
        lastL2Sig: storyUnits.length > 0 ? meta.lastL2Sig : nextL2Sig,
        staleVolumeIds: mode === 'full' && storyUnits.length > 0 ? nextVolumes.map((v) => v.id) : [],
        lastChangeNote:
          mode === 'append_to_ending'
            ? `已续补后期分卷至终局（当前共 ${nextVolumes.length} 卷）`
            : `L2 全书分卷已重新生成（共 ${nextVolumes.length} 卷）`,
      });
      setBannerMsg({
        type: 'ok',
        text:
          mode === 'append_to_ending'
            ? `已紧接前序分卷续补至终局（当前全书共 ${nextVolumes.length} 卷）！请检查末尾卷是否已落地 L1 最终结局，确认后进入 L3 单元纲。`
            : `第 2 步「L2 全书分卷纲（共 ${nextVolumes.length} 卷，覆盖至终局）」已生成！请查阅修改，确认无误后点击「✓ 确认 L2 无误，进入 L3 单元纲」。`,
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `L2 分卷纲生成失败：${err.message}` });
    } finally {
      setIsGeneratingL2(false);
    }
  };

  const handleConfirmL2AndNext = () => {
    if (volumePlan.length === 0) {
      setBannerMsg({ type: 'err', text: '请先生成或创建至少 1 个 L2 分卷。' });
      return;
    }
    updateMeta({
      l1Confirmed: true,
      l2Confirmed: true,
      lastL1Sig: currentL1Sig,
      lastL2Sig: storyUnits.length === 0 ? currentL2Sig : meta.lastL2Sig || currentL2Sig,
    });
    setSubTab('l3');
  };

  // ============================================================================
  // STEP 3: Generate L3 Story Units STRICTLY per L2 Volume (No Omissions!)
  // ============================================================================
  const handleGenerateL3ForVolume = async (targetVol: NovelVolumePlanItem, currentUnitsSnapshot?: NovelStoryUnitItem[]) => {
    const baseUnits = currentUnitsSnapshot ?? storyUnits;
    setGeneratingL3VolId(targetVol.id);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const otherUnits = baseUnits.filter((u) => u.volumeId !== targetVol.id);
      const nextUnitIdx =
        otherUnits.length > 0 ? Math.max(...otherUnits.map((u) => u.unitIndex)) + 1 : 1;

      const messages = buildGenerateL3UnitsForVolumeMessages({
        bookTitle,
        outline,
        masterOutlineSpec,
        allVolumes: volumePlan,
        targetVolume: targetVol,
        existingUnitsInOtherVolumes: otherUnits,
        startingUnitIndex: nextUnitIdx,
        xpEnabled,
      });

      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.7,
      });

      const newVolUnits = parseL3UnitsForVolumeResponse(
        res.content,
        targetVol,
        nextUnitIdx,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger
      );

      // Recompute clean sequential unitIndex across volume order
      const volOrderMap = new Map(volumePlan.map((v, i) => [v.id, i]));
      const combined = [...otherUnits, ...newVolUnits].sort((a, b) => {
        const va = volOrderMap.get(a.volumeId) ?? 999;
        const vb = volOrderMap.get(b.volumeId) ?? 999;
        if (va !== vb) return va - vb;
        return a.unitIndex - b.unitIndex;
      });
      const reindexed = combined.map((u, i) => ({ ...u, unitIndex: i + 1 }));

      const cascaded = autoLinkEntitiesAndCascadeTopology({
        volumePlan,
        storyUnits: reindexed,
        chapterOutlines,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        lorebook,
      });
      onChangeStoryUnits(cascaded.storyUnits);
      onChangeChapterOutlines(cascaded.chapterOutlines);

      const remainingStaleVols = (meta.staleVolumeIds || []).filter((id) => id !== targetVol.id);
      updateMeta({
        l2Confirmed: true,
        l3Confirmed: false,
        lastL2Sig: currentL2Sig,
        staleVolumeIds: remainingStaleVols,
      });

      setBannerMsg({
        type: 'ok',
        text: `已严格依据 L1+L2 为第${targetVol.volumeIndex}卷《${targetVol.title}》拆解出 ${newVolUnits.length} 个防跑偏 L3 剧情单元！`,
      });
      return cascaded.storyUnits;
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `第${targetVol.volumeIndex}卷 L3 单元生成失败：${err.message}` });
      return baseUnits;
    } finally {
      setGeneratingL3VolId(null);
    }
  };

  const handleGenerateL3AllVolumesSequential = async () => {
    if (volumePlan.length === 0) {
      setBannerMsg({ type: 'err', text: '请先在 L2 生成分卷纲！' });
      setSubTab('l2');
      return;
    }
    setGeneratingL3VolId('ALL');
    setBannerMsg(null);
    let workingUnits = [...storyUnits];
    let generatedTotal = 0;

    try {
      const { cfg, model } = getActiveApi();
      for (const vol of volumePlan) {
        const otherUnits = workingUnits.filter((u) => u.volumeId !== vol.id);
        const startIdx = otherUnits.length + 1;
        const messages = buildGenerateL3UnitsForVolumeMessages({
          bookTitle,
          outline,
          masterOutlineSpec,
          allVolumes: volumePlan,
          targetVolume: vol,
          existingUnitsInOtherVolumes: otherUnits,
          startingUnitIndex: startIdx,
          xpEnabled,
        });
        const res = await chatCompletion({
          provider: cfg?.provider,
          baseUrl: cfg?.baseUrl,
          apiKey: cfg?.apiKey,
          model,
          messages,
          temperature: 0.7,
        });
        const newVolUnits = parseL3UnitsForVolumeResponse(
          res.content,
          vol,
          startIdx,
          characterGraph,
          keyItemRegistry,
          foreshadowLedger
        );
        generatedTotal += newVolUnits.length;
        const volOrderMap = new Map(volumePlan.map((v, i) => [v.id, i]));
        workingUnits = [...otherUnits, ...newVolUnits]
          .sort((a, b) => {
            const va = volOrderMap.get(a.volumeId) ?? 999;
            const vb = volOrderMap.get(b.volumeId) ?? 999;
            if (va !== vb) return va - vb;
            return a.unitIndex - b.unitIndex;
          })
          .map((u, i) => ({ ...u, unitIndex: i + 1 }));
        onChangeStoryUnits(workingUnits);
      }

      const cascaded = autoLinkEntitiesAndCascadeTopology({
        volumePlan,
        storyUnits: workingUnits,
        chapterOutlines,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        lorebook,
      });
      onChangeStoryUnits(cascaded.storyUnits);
      onChangeChapterOutlines(cascaded.chapterOutlines);
      updateMeta({
        l1Confirmed: true,
        l2Confirmed: true,
        l3Confirmed: false,
        lastL2Sig: currentL2Sig,
        lastL3Sig: computeL3Signature(cascaded.storyUnits),
        staleVolumeIds: [],
      });

      setBannerMsg({
        type: 'ok',
        text: `已按卷依次完成全书 ${volumePlan.length} 卷的 L3 剧情单元拆解（共 ${generatedTotal} 个单元，无遗漏）！请逐卷审阅后确认进入 L4 单章细纲。`,
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `批量拆解 L3 单元中断：${err.message}` });
    } finally {
      setGeneratingL3VolId(null);
    }
  };

  const handleConfirmL3AndNext = () => {
    if (storyUnits.length === 0) {
      setBannerMsg({ type: 'err', text: '请先生成或新增至少 1 个 L3 剧情单元。' });
      return;
    }
    updateMeta({
      l1Confirmed: true,
      l2Confirmed: true,
      l3Confirmed: true,
      lastL2Sig: currentL2Sig,
      lastL3Sig: currentL3Sig,
    });
    if (!targetGenUnitId && storyUnits[0]) {
      handleSelectTargetGenUnit(storyUnits[0].id);
    }
    setSubTab('l4');
  };

  // ============================================================================
  // STEP 5 HELPER: Auto-Extract & Link Entities Graph from L1~L4
  // ============================================================================
  const runEntityGraphAutoSync = async (
    latestUnits: NovelStoryUnitItem[],
    latestChapters: NovelChapterOutlineItem[],
    silentToastPrefix?: string
  ) => {
    setIsSyncingEntities(true);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildSyncEntitiesFromFourLayersMessages({
        bookTitle,
        charactersText: characters,
        worldText: world,
        masterOutlineSpec,
        volumePlan,
        storyUnits: latestUnits,
        chapterOutlines: latestChapters,
        existingCharacters: characterGraph,
        existingItems: keyItemRegistry,
        existingForeshadows: foreshadowLedger,
        xpEnabled,
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.55,
      });
      const synced = applySyncedEntitiesToSettings({
        rawJson: res.content,
        volumePlan,
        storyUnits: latestUnits,
        chapterOutlines: latestChapters,
        existingCharacters: characterGraph,
        existingItems: keyItemRegistry,
        existingForeshadows: foreshadowLedger,
        existingLorebook: lorebook,
      });
      onChangeCharacterGraph(synced.characterGraph);
      onChangeKeyItemRegistry(synced.keyItemRegistry);
      onChangeForeshadowLedger(synced.foreshadowLedger);
      onChangeStoryUnits(synced.storyUnits);
      onChangeChapterOutlines(synced.chapterOutlines);
      onChangeLorebook(synced.lorebook);
      updateMeta({
        l4Confirmed: true,
        graphSynced: true,
        lastGraphSig: computeGraphSignature(
          synced.characterGraph,
          synced.keyItemRegistry,
          synced.foreshadowLedger
        ),
        staleUnitIds: [],
        staleChapterIds: [],
      });
      setBannerMsg({
        type: 'ok',
        text: `${silentToastPrefix ? `${silentToastPrefix} ` : ''}${synced.summaryText}`,
      });
    } catch (err: any) {
      setBannerMsg({
        type: 'warn',
        text: `${silentToastPrefix ? `${silentToastPrefix}，但` : ''}关联库 AI 同步异常（已运行本地文本匹配兜底）：${err.message}`,
      });
    } finally {
      setIsSyncingEntities(false);
    }
  };

  // ============================================================================
  // STEP 4: Generate L4 Chapters per L3 Unit -> Auto-Sync Entity Graph!
  // ============================================================================
  const handleGenerateChaptersForUnit = async (explicitUnit?: NovelStoryUnitItem) => {
    const unit =
      explicitUnit ||
      storyUnits.find((u) => u.id === targetGenUnitId) ||
      storyUnits[0];

    if (!unit) {
      setBannerMsg({
        type: 'err',
        text: '请先在「L3 剧情单元纲」拆解剧情单元，再基于单元生成 L4 单章细纲！',
      });
      setSubTab('l3');
      return;
    }

    const span = parseChapterSpanRange(unit.chapterSpan, genStartCh, genCount);
    const startChapToUse = explicitUnit ? span.start : genStartCh;
    const countToUse = Math.max(1, Math.min(18, explicitUnit ? span.count : genCount));

    const parentVol = volumePlan.find((v) => v.id === unit.volumeId) || volumePlan[0];
    setIsGeneratingUnitChapters(true);
    setL4ProgressNote(`正在基于 L1~L3 生成单元《${unit.title}》第 ${startChapToUse}~${startChapToUse + countToUse - 1} 章细纲...`);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildGenerateUnitChaptersMessages({
        bookTitle,
        settings: compositeSettingsForAudit,
        targetUnit: unit,
        parentVolume: parentVol,
        startChapter: startChapToUse,
        chapterCount: countToUse,
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

      // Preserve already drafted chapters!
      const draftedIdxSet = new Set(
        chapterOutlines.filter((c) => c.status === 'drafted' || c.chapterIndex <= draftedChapterCount).map((c) => c.chapterIndex)
      );
      const filteredGen = generated.filter((g) => !draftedIdxSet.has(g.chapterIndex));
      const genIdxSet = new Set(filteredGen.map((g) => g.chapterIndex));

      const merged = [
        ...chapterOutlines.filter((c) => !genIdxSet.has(c.chapterIndex)),
        ...filteredGen,
      ].sort((a, b) => a.chapterIndex - b.chapterIndex);

      const clearedUnitStale = (meta.staleUnitIds || []).filter((id) => id !== unit.id);
      const clearedChStale = (meta.staleChapterIds || []).filter(
        (id) => !merged.some((m) => m.id === id && genIdxSet.has(m.chapterIndex))
      );
      updateMeta({
        l3Confirmed: true,
        staleUnitIds: clearedUnitStale,
        staleChapterIds: clearedChStale,
      });

      onChangeChapterOutlines(merged);
      setGenStartCh(merged.length > 0 ? merged[merged.length - 1].chapterIndex + 1 : 1);
      setSubTab('l4');

      // Step 5 Triggered Automatically After L4 Generation:
      setL4ProgressNote('L4 细纲已就绪，正在自动关联更新角色/道具/伏笔图谱与世界书...');
      await runEntityGraphAutoSync(
        storyUnits,
        merged,
        `已围绕单元《${unit.title}》生成 ${filteredGen.length} 章 L4 细纲！`
      );
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `单章细纲生成失败：${err.message}` });
    } finally {
      setIsGeneratingUnitChapters(false);
      setL4ProgressNote('');
    }
  };

  // Generate L4 chapters for ALL unplanned L3 units sequentially, then run Entity Sync once at the end
  const handleGenerateAllUnplannedUnitsL4 = async () => {
    const unplannedUnits = storyUnits.filter(
      (u) => !chapterOutlines.some((c) => c.unitId === u.id)
    );
    if (unplannedUnits.length === 0) {
      setBannerMsg({ type: 'ok', text: '所有 L3 剧情单元均已有对应 L4 单章细纲！' });
      return;
    }

    setIsGeneratingUnitChapters(true);
    setBannerMsg(null);
    let workingChapters = [...chapterOutlines];
    const draftedIdxSet = new Set(
      chapterOutlines.filter((c) => c.status === 'drafted' || c.chapterIndex <= draftedChapterCount).map((c) => c.chapterIndex)
    );
    let totalAdded = 0;

    try {
      const { cfg, model } = getActiveApi();
      for (let i = 0; i < unplannedUnits.length; i++) {
        const unit = unplannedUnits[i];
        const parentVol = volumePlan.find((v) => v.id === unit.volumeId) || volumePlan[0];
        const fallbackStart = workingChapters.length > 0 ? Math.max(...workingChapters.map((c) => c.chapterIndex)) + 1 : 1;
        const span = parseChapterSpanRange(unit.chapterSpan, fallbackStart, 6);
        setL4ProgressNote(`(${i + 1}/${unplannedUnits.length}) 正在拆解单元《${unit.title}》第${span.start}~${span.start + span.count - 1}章细纲...`);

        const messages = buildGenerateUnitChaptersMessages({
          bookTitle,
          settings: { ...compositeSettingsForAudit, chapterOutlines: workingChapters },
          targetUnit: unit,
          parentVolume: parentVol,
          startChapter: span.start,
          chapterCount: span.count,
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
        }).filter((g) => !draftedIdxSet.has(g.chapterIndex));

        const genIdxSet = new Set(generated.map((g) => g.chapterIndex));
        workingChapters = [
          ...workingChapters.filter((c) => !genIdxSet.has(c.chapterIndex)),
          ...generated,
        ].sort((a, b) => a.chapterIndex - b.chapterIndex);
        totalAdded += generated.length;
        onChangeChapterOutlines(workingChapters);
      }

      setL4ProgressNote('全单元 L4 细纲拆解完毕，正在自动更新并绑定角色/道具/伏笔关联库...');
      await runEntityGraphAutoSync(
        storyUnits,
        workingChapters,
        `已顺次补齐 ${unplannedUnits.length} 个单元共 ${totalAdded} 章 L4 细纲！`
      );
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `批量单元细纲生成中断：${err.message}` });
    } finally {
      setIsGeneratingUnitChapters(false);
      setL4ProgressNote('');
    }
  };

  // ============================================================================
  // TARGETED CASCADE SYNC FOR STALE L4 CHAPTERS
  // ============================================================================
  const handleCascadeSyncStaleChapters = async () => {
    const staleTargets = chapterOutlines.filter(
      (c) => c.status !== 'drafted' && (staleChapterIdsSet.has(c.id) || (c.unitId && staleUnitIdsSet.has(c.unitId)))
    );
    if (staleTargets.length === 0) return;

    setIsCascadeSyncingChapters(true);
    setBannerMsg(null);
    try {
      const { cfg, model } = getActiveApi();
      const messages = buildCascadeSyncTargetChaptersMessages({
        bookTitle,
        masterOutlineSpec,
        volumePlan,
        storyUnits,
        targetChapters: staleTargets,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        changeReason: meta.lastChangeNote || '上游单元/角色/道具/伏笔设定发生了手动修改',
      });
      const res = await chatCompletion({
        provider: cfg?.provider,
        baseUrl: cfg?.baseUrl,
        apiKey: cfg?.apiKey,
        model,
        messages,
        temperature: 0.55,
      });
      const parsed = repairAndParseJson<any>(res.content);
      if (!parsed || !Array.isArray(parsed.patchedChapters)) {
        throw new Error('联动校准未返回有效 patchedChapters');
      }
      const patchMap = new Map<string, any>(parsed.patchedChapters.map((p: any) => [p.id, p]));
      const nextChapters = chapterOutlines.map((c) => {
        const p = patchMap.get(c.id);
        if (!p) return c;
        return {
          ...c,
          title: p.title ? String(p.title).replace(/^第\d+章[：:\s]*/, '').trim() : c.title,
          protagonistGoal: p.protagonistGoal ? String(p.protagonistGoal) : c.protagonistGoal,
          coreObstacle: p.coreObstacle ? String(p.coreObstacle) : c.coreObstacle,
          stateDelta: p.stateDelta ? String(p.stateDelta) : c.stateDelta,
          summary: p.summary ? String(p.summary) : c.summary,
          hookNote: p.hookNote ? String(p.hookNote) : c.hookNote,
        };
      });
      const cascaded = autoLinkEntitiesAndCascadeTopology({
        volumePlan,
        storyUnits,
        chapterOutlines: nextChapters,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        lorebook,
      });
      onChangeChapterOutlines(cascaded.chapterOutlines);
      onChangeStoryUnits(cascaded.storyUnits);
      updateMeta({
        staleUnitIds: [],
        staleChapterIds: [],
        lastChangeNote: undefined,
      });
      setBannerMsg({
        type: 'ok',
        text: `已完成 ${parsed.patchedChapters.length} 章受影响 L4 细纲联动校准：${parsed.syncNote || '上下游因果已恢复一致！'}`,
      });
    } catch (err: any) {
      setBannerMsg({ type: 'err', text: `联动校准失败：${err.message}` });
    } finally {
      setIsCascadeSyncingChapters(false);
    }
  };

  // Instant Local Topology & Auto-Match Cascade Button
  const handleRunLocalCascadeLink = () => {
    const res = autoLinkEntitiesAndCascadeTopology({
      volumePlan,
      storyUnits,
      chapterOutlines,
      characterGraph,
      keyItemRegistry,
      foreshadowLedger,
      lorebook,
    });
    onChangeStoryUnits(res.storyUnits);
    onChangeChapterOutlines(res.chapterOutlines);
    onChangeCharacterGraph(res.characterGraph);
    onChangeKeyItemRegistry(res.keyItemRegistry);
    onChangeForeshadowLedger(res.foreshadowLedger);
    onChangeLorebook(res.lorebook);
    setBannerMsg({
      type: 'ok',
      text: `本地强关联扫描完成：新绑定 ${res.stats.autoBoundLinks} 处名称锚点，修复 ${res.stats.topologyFixes} 处卷/单元/世界书映射！`,
    });
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

      const parsed = repairAndParseJson<any>(res.content);
      if (!parsed || typeof parsed !== 'object') throw new Error('核对结果未返回有效 JSON');

      if (parsed.patchedMasterUltimateEnding && !masterOutlineSpec.ultimateEnding?.trim()) {
        onChangeMasterSpec({
          ...masterOutlineSpec,
          ultimateEnding: String(parsed.patchedMasterUltimateEnding),
        });
      }

      let nextUnits = [...storyUnits];
      if (Array.isArray(parsed.patchedUnits) && parsed.patchedUnits.length > 0) {
        const patchMap = new Map(parsed.patchedUnits.map((u: any) => [u.id, u]));
        nextUnits = storyUnits.map((u) => {
          const p: any = patchMap.get(u.id);
          if (!p) return u;
          return {
            ...u,
            volumeAlignment: p.volumeAlignment ? String(p.volumeAlignment) : u.volumeAlignment,
            breakthroughMethod: p.breakthroughMethod
              ? String(p.breakthroughMethod)
              : u.breakthroughMethod,
          };
        });
      }

      let nextChapters = [...chapterOutlines];
      if (Array.isArray(parsed.patchedChapters) && parsed.patchedChapters.length > 0) {
        const chPatchMap = new Map(parsed.patchedChapters.map((c: any) => [c.id, c]));
        nextChapters = chapterOutlines.map((c) => {
          const p: any = chPatchMap.get(c.id);
          if (!p) return c;
          return {
            ...c,
            protagonistGoal: p.protagonistGoal ? String(p.protagonistGoal) : c.protagonistGoal,
            coreObstacle: p.coreObstacle ? String(p.coreObstacle) : c.coreObstacle,
            stateDelta: p.stateDelta ? String(p.stateDelta) : c.stateDelta,
            hookNote: p.hookNote ? String(p.hookNote) : c.hookNote,
          };
        });
      }

      let nextChars = [...characterGraph];
      if (Array.isArray(parsed.patchedCharacters) && parsed.patchedCharacters.length > 0) {
        const charPatchMap = new Map(parsed.patchedCharacters.map((c: any) => [c.id, c]));
        nextChars = characterGraph.map((c) => {
          const p: any = charPatchMap.get(c.id);
          if (!p) return c;
          return {
            ...c,
            epistemicBoundary: p.epistemicBoundary
              ? String(p.epistemicBoundary)
              : c.epistemicBoundary,
          };
        });
      }

      const cascaded = autoLinkEntitiesAndCascadeTopology({
        volumePlan,
        storyUnits: nextUnits,
        chapterOutlines: nextChapters,
        characterGraph: nextChars,
        keyItemRegistry,
        foreshadowLedger,
        lorebook,
      });
      onChangeStoryUnits(cascaded.storyUnits);
      onChangeChapterOutlines(cascaded.chapterOutlines);
      onChangeCharacterGraph(cascaded.characterGraph);
      onChangeLorebook(cascaded.lorebook);

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

  // Helper to mark chapters linked to an entity as stale when user edits the entity
  const markLinkedChaptersStaleByEntity = (
    entityType: 'char' | 'item' | 'fs',
    entityId: string,
    note: string
  ) => {
    const affectedIds = chapterOutlines
      .filter((ch) => {
        if (ch.status === 'drafted' || ch.chapterIndex <= draftedChapterCount) return false;
        if (entityType === 'char') return (ch.linkedCharacterIds || []).includes(entityId);
        if (entityType === 'item') return (ch.linkedItemIds || []).includes(entityId);
        return (ch.linkedForeshadowIds || []).includes(entityId);
      })
      .map((c) => c.id);
    if (affectedIds.length > 0) {
      const mergedStale = Array.from(new Set([...(meta.staleChapterIds || []), ...affectedIds]));
      updateMeta({
        staleChapterIds: mergedStale,
        lastChangeNote: note,
      });
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

  const entityTotal = characterGraph.length + keyItemRegistry.length + foreshadowLedger.length;

  return (
    <section className="studio-card p-5 sm:p-7 space-y-5">
      {/* Top Architecture Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              分步式四层滚动拆纲法 & 全设定强关联中枢
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            严格逐层确认推进：<strong>① L1 总纲定终局</strong> → <strong>② L2 全书分卷</strong> → <strong>③ L3 按卷拆剧情单元</strong> → <strong>④ L4 按单元拆单章细纲</strong> → <strong>⑤ 自动联动角色/道具/伏笔图谱</strong>，任意上游改动实时预警并支持一键精准校准。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <MotionButton
            type="button"
            onClick={handleRunLocalCascadeLink}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="立即扫描 L3/L4 文本与名称，自动修复卷归属并补全角色/道具/伏笔关联锚点"
          >
            <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>双向拓扑自动对齐</span>
          </MotionButton>

          <MotionButton
            type="button"
            onClick={() => setSubTab('audit')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
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
            <span>逐层纠错 ({auditIssues.length})</span>
          </MotionButton>
        </div>
      </div>

      {/* 5-Step Guided Cascade Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {[
          {
            id: 'l1' as const,
            step: '步骤 1',
            name: 'L1 总纲终局',
            status: l1StaleByOutline
              ? 'warn'
              : meta.l1Confirmed
              ? 'done'
              : l1Ready
              ? 'pending_confirm'
              : 'empty',
            badge: l1StaleByOutline
              ? '⚠ 需校准'
              : meta.l1Confirmed
              ? '已确认 ✓'
              : l1Ready
              ? '待确认'
              : '待生成',
          },
          {
            id: 'l2' as const,
            step: '步骤 2',
            name: `L2 分卷 (${volumePlan.length})`,
            status: l2StaleByL1 || l2TailCoverageWarning
              ? 'warn'
              : meta.l2Confirmed && volumePlan.length > 0
              ? 'done'
              : volumePlan.length > 0
              ? 'pending_confirm'
              : 'empty',
            badge: l2StaleByL1
              ? '⚠ L1已改'
              : l2TailCoverageWarning
              ? '⚠ 待补尾卷'
              : meta.l2Confirmed && volumePlan.length > 0
              ? '已确认 ✓'
              : volumePlan.length > 0
              ? '待确认'
              : '待生成',
          },
          {
            id: 'l3' as const,
            step: '步骤 3',
            name: `L3 单元 (${storyUnits.length})`,
            status: l3StaleByL2 || staleVolumeIdsSet.size > 0
              ? 'warn'
              : meta.l3Confirmed && storyUnits.length > 0
              ? 'done'
              : storyUnits.length > 0
              ? 'pending_confirm'
              : 'empty',
            badge:
              staleVolumeIdsSet.size > 0 || l3StaleByL2
                ? '⚠ 卷纲已改'
                : meta.l3Confirmed && storyUnits.length > 0
                ? '已确认 ✓'
                : storyUnits.length > 0
                ? '待确认'
                : '待拆解',
          },
          {
            id: 'l4' as const,
            step: '步骤 4',
            name: `L4 细纲 (${chapterOutlines.length})`,
            status:
              l4StaleCount > 0
                ? 'warn'
                : chapterOutlines.length > 0
                ? 'done'
                : 'empty',
            badge:
              l4StaleCount > 0
                ? `⚠ ${l4StaleCount}章待校准`
                : chapterOutlines.length > 0
                ? '已拆纲 ✓'
                : '按单元生成',
          },
          {
            id: 'graph' as const,
            step: '步骤 5',
            name: `关联库 (${entityTotal})`,
            status: entityTotal > 0 ? 'done' : 'empty',
            badge: meta.graphSynced && entityTotal > 0 ? '已自动绑定 ✓' : entityTotal > 0 ? '已建立' : 'L4后自动生成',
          },
        ].map((item) => {
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10px] text-[var(--text-muted)]">
                <span>{item.step}</span>
                <span
                  className={`font-semibold ${
                    item.status === 'warn'
                      ? 'text-amber-600 dark:text-amber-400'
                      : item.status === 'done'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : item.status === 'pending_confirm'
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {item.badge}
                </span>
              </div>
              <div className="text-xs font-bold text-[var(--text-primary)] mt-0.5 truncate">
                {item.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Global Cascade Change Warning Banner across tabs */}
      {l4StaleCount > 0 && subTab !== 'l4' && (
        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              检测到上游变更（{meta.lastChangeNote || '单元/角色/道具/伏笔设定调整'}），共有 <strong>{l4StaleCount}</strong> 章待写 L4 细纲受影响需要联动校准。
            </span>
          </div>
          <MotionButton
            type="button"
            disabled={isCascadeSyncingChapters}
            onClick={handleCascadeSyncStaleChapters}
            className="min-h-[32px] px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {isCascadeSyncingChapters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>AI 一键联动校准受影响细纲</span>
          </MotionButton>
        </div>
      )}

      {bannerMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            bannerMsg.type === 'err'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : bannerMsg.type === 'warn'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
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

      {/* =====================================================================
          LAYER 1: MASTER OUTLINE & ULTIMATE ENDING
      ===================================================================== */}
      {subTab === 'l1' && (
        <div className="space-y-4">
          <div className="p-4 studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-[var(--text-primary)]">
                第 1 步：锁定 L1 总纲与最终结局（当前篇幅：{scaleHint.lockedScaleTags.join('、') || '由大纲判定'} · {scaleHint.estimatedChapterRange}）
              </div>
              <p className="text-[var(--text-muted)] leading-relaxed">
                请先让 AI 或手动确定<strong>最终结局锚点</strong>与三线结构，审阅满意后再点击「确认 L1 进入 L2 分卷纲」。绝不会跳过您的审阅直接生成后面全部层级！
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <MotionButton
                type="button"
                disabled={isGeneratingL1}
                onClick={handleGenerateL1}
                className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {isGeneratingL1 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isGeneratingL1 ? '正在提炼 L1 总纲...' : 'AI 生成/完善 L1 总纲'}</span>
              </MotionButton>
              <MotionButton
                type="button"
                onClick={handleConfirmL1AndNext}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-90"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>确认 L1 无误，进入 L2</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </MotionButton>
            </div>
          </div>

          {l1StaleByOutline && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
              <span>提示：核心大纲文本或篇幅规模设定在 L1 生成后发生过改动，建议点击上方「AI 生成/完善 L1 总纲」重新校准总纲锚点。</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                key: 'ultimateEnding' as const,
                label: '1. 最终结局锚点（全书终极闭合状态 · 必填核心）',
                placeholder: '例：主角彻底斩断灵脉垄断契约，揭开万年真相后重建共生秩序...',
              },
              {
                key: 'corePromise' as const,
                label: '2. 核心读者契约（黄金三章承诺与核心卖点）',
                placeholder: '例：高反差身份掉马 + 绝境智取护短，每卷兑现一次认知颠覆...',
              },
              {
                key: 'worldCeiling' as const,
                label: '3. 战力 / 权势 / 规则顶层天花板（严防后期战力通胀）',
                placeholder: '例：至高境只有三位且每次出手必折损本源，不存在无限套娃换地图升级...',
              },
              {
                key: 'mainPlotline' as const,
                label: '4. 主线核心推进脉络',
                placeholder: '贯穿全书的外部生存/晋升/复仇主轴...',
              },
              {
                key: 'emotionalOrSubPlotline' as const,
                label: '5. 感情线 / 双主副线交织脉络',
                placeholder: '人物关系从戒备试探 → 利益共谋 → 生死托付的阶段拉扯...',
              },
              {
                key: 'darkPlotline' as const,
                label: '6. 幕后暗线与终极悬念（与主线互为因果）',
                placeholder: '藏在水面之下的历史真相或幕后操盘者布局...',
              },
            ].map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--text-primary)]">{field.label}</label>
                <textarea
                  rows={3}
                  value={masterOutlineSpec[field.key]}
                  onChange={(e) => {
                    onChangeMasterSpec({ ...masterOutlineSpec, [field.key]: e.target.value });
                    if (meta.l1Confirmed || volumePlan.length > 0) {
                      updateMeta({
                        l1Confirmed: false,
                        lastChangeNote: `L1「${field.label.split('（')[0]}」已手动修改`,
                      });
                    }
                  }}
                  placeholder={field.placeholder}
                  className="studio-input w-full p-3 text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          LAYER 2: VOLUME PLAN (FULL-TO-ENDING & STAGE CONTRAST)
      ===================================================================== */}
      {subTab === 'l2' && (
        <div className="space-y-4">
          {/* L1 Anchor Banner */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/60 text-xs space-y-1">
            <div className="font-bold text-[var(--text-primary)] flex items-center justify-between gap-2">
              <span>当前 L1 终局基准（L2 所有分卷必须推进并最终落地此结局）：</span>
              <span className="text-[11px] text-[var(--accent)]">
                目标体量：{scaleHint.lockedScaleTags.join('、') || scaleHint.estimatedChapterRange}
              </span>
            </div>
            <p className="text-[var(--text-secondary)]">
              {masterOutlineSpec.ultimateEnding || '⚠ 尚未填写 L1 最终结局锚点，建议先在 L1 补充后生成分卷。'}
            </p>
          </div>

          {l2StaleByL1 && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>检测到 L1 总纲已在分卷生成后被修改，当前 L2 分卷可能与新终局锚点脱节！</span>
              <MotionButton
                type="button"
                disabled={isGeneratingL2}
                onClick={() => handleGenerateL2('full')}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer"
              >
                AI 按最新 L1 重建完整 L2 分卷
              </MotionButton>
            </div>
          )}

          {l2TailCoverageWarning && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>{l2TailCoverageWarning}</span>
              <MotionButton
                type="button"
                disabled={isGeneratingL2}
                onClick={() => handleGenerateL2('append_to_ending')}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer"
              >
                补全后续分卷直至终局
              </MotionButton>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <MotionButton
                type="button"
                disabled={isGeneratingL2}
                onClick={() => handleGenerateL2('full')}
                className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {isGeneratingL2 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isGeneratingL2 ? '正在基于 L1 推演全书分卷...' : 'AI 基于 L1 生成完整 L2 分卷纲'}</span>
              </MotionButton>

              {volumePlan.length > 0 && (
                <MotionButton
                  type="button"
                  disabled={isGeneratingL2}
                  onClick={() => handleGenerateL2('append_to_ending')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>补全后续分卷直至终局</span>
                </MotionButton>
              )}

              <MotionButton
                type="button"
                onClick={() => {
                  const nextIdx = volumePlan.length + 1;
                  const prevLastEnd =
                    volumePlan.length > 0
                      ? parseChapterSpanRange(volumePlan[volumePlan.length - 1].chapterSpan, 1, 20).end
                      : 0;
                  onChangeVolumePlan([
                    ...volumePlan,
                    {
                      id: generateUUID(),
                      volumeIndex: nextIdx,
                      title: `第${nextIdx}卷新篇章`,
                      chapterSpan: `第${prevLastEnd + 1}章 - 第${prevLastEnd + 25}章`,
                      stageGoal: '',
                      entryState: '',
                      exitState: '',
                      turningPoints: '',
                      coreConflict: '',
                      climaxGoal: '',
                    },
                  ]);
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动新增一卷</span>
              </MotionButton>
            </div>

            {volumePlan.length > 0 && (
              <MotionButton
                type="button"
                onClick={handleConfirmL2AndNext}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-90"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>确认 L2 无误，进入 L3</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </MotionButton>
            )}
          </div>

          {volumePlan.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              暂无 L2 分卷纲，请先确认 L1 总纲后点击「AI 基于 L1 生成完整 L2 分卷纲」。
            </div>
          ) : (
            <div className="space-y-3">
              {volumePlan.map((vol, idx) => {
                const updateVolField = (patch: Partial<NovelVolumePlanItem>, cascadeTextChange?: string) => {
                  const nextVols = [...volumePlan];
                  nextVols[idx] = { ...vol, ...patch };
                  onChangeVolumePlan(nextVols);

                  // Immediately cascade title -> chapter volumeTag!
                  if (patch.title !== undefined) {
                    const updatedChapters = chapterOutlines.map((ch) =>
                      ch.volumeId === vol.id
                        ? { ...ch, volumeTag: `第${vol.volumeIndex}卷 · ${patch.title}` }
                        : ch
                    );
                    onChangeChapterOutlines(updatedChapters);
                  }

                  if (cascadeTextChange) {
                    const childUnits = storyUnits.filter((u) => u.volumeId === vol.id).map((u) => u.id);
                    if (childUnits.length > 0 || chapterOutlines.some((c) => c.volumeId === vol.id && c.status !== 'drafted')) {
                      updateMeta({
                        l2Confirmed: false,
                        staleVolumeIds: Array.from(new Set([...(meta.staleVolumeIds || []), vol.id])),
                        staleUnitIds: Array.from(new Set([...(meta.staleUnitIds || []), ...childUnits])),
                        lastChangeNote: `第${vol.volumeIndex}卷「${cascadeTextChange}」已手动修改`,
                      });
                    }
                  }
                };

                return (
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
                          onChange={(e) => updateVolField({ title: e.target.value })}
                          placeholder="卷标题"
                          className="studio-input px-2.5 py-1.5 text-xs font-bold flex-1 min-w-[140px]"
                        />
                        <input
                          type="text"
                          value={vol.chapterSpan}
                          onChange={(e) => updateVolField({ chapterSpan: e.target.value }, '章节跨度')}
                          placeholder="第1章 - 第25章"
                          className="studio-input px-2.5 py-1.5 text-xs w-36 tabular-nums"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVols = volumePlan.filter((v) => v.id !== vol.id);
                          onChangeVolumePlan(nextVols);
                          const cascaded = autoLinkEntitiesAndCascadeTopology({
                            volumePlan: nextVols,
                            storyUnits,
                            chapterOutlines,
                            characterGraph,
                            keyItemRegistry,
                            foreshadowLedger,
                            lorebook,
                          });
                          onChangeStoryUnits(cascaded.storyUnits);
                          onChangeChapterOutlines(cascaded.chapterOutlines);
                        }}
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
                          onChange={(e) => updateVolField({ stageGoal: e.target.value }, '阶段目标')}
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
                          onChange={(e) => updateVolField({ climaxGoal: e.target.value }, '卷末高潮')}
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
                          onChange={(e) => updateVolField({ entryState: e.target.value })}
                          placeholder="入卷起点状态..."
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
                          onChange={(e) => updateVolField({ exitState: e.target.value }, '出卷状态')}
                          placeholder="出卷终点状态跃迁..."
                          className="studio-input w-full px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          LAYER 3: STORY UNITS GROUPED BY L2 VOLUME (STRICTLY L1+L2 GROUNDED)
      ===================================================================== */}
      {subTab === 'l3' && (
        <div className="space-y-4">
          <div className="p-4 studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-[var(--text-primary)]">
                第 3 步：严格基于 L1 + L2 分卷蓝图拆解 L3 剧情单元纲
              </div>
              <p className="text-[var(--text-muted)] leading-relaxed">
                系统采用<strong>逐卷独立推演模式</strong>，可单卷拆解或依次拆解全部分卷，彻底杜绝大纲太长漏掉后半部单元的缺陷！
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <MotionButton
                type="button"
                disabled={generatingL3VolId !== null || volumePlan.length === 0}
                onClick={handleGenerateL3AllVolumesSequential}
                className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {generatingL3VolId === 'ALL' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {generatingL3VolId === 'ALL'
                    ? '正逐卷依次生成 L3 单元...'
                    : `AI 基于 L1+L2 依次生成全部分卷 L3 单元 (${volumePlan.length}卷)`}
                </span>
              </MotionButton>

              {storyUnits.length > 0 && (
                <MotionButton
                  type="button"
                  onClick={handleConfirmL3AndNext}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-90"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>确认 L3 无误，进入 L4</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </MotionButton>
              )}
            </div>
          </div>

          {volumePlan.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              尚未创建 L2 分卷纲，请先前往「L2 分卷」生成分卷蓝图后再拆解 L3 剧情单元。
            </div>
          ) : (
            <div className="space-y-5">
              {volumePlan.map((vol) => {
                const volUnits = storyUnits.filter((u) => u.volumeId === vol.id);
                const isVolStale = staleVolumeIdsSet.has(vol.id);
                const isBusyThisVol = generatingL3VolId === vol.id || generatingL3VolId === 'ALL';

                return (
                  <div
                    key={vol.id}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      isVolStale
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/35'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold">
                            第 {vol.volumeIndex} 卷 · {vol.title}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {vol.chapterSpan}
                          </span>
                          {isVolStale && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                              ⚠ 本卷 L2 设定已改动，建议重拆单元
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          阶段目标：{vol.stageGoal || vol.coreConflict || '未填写'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <MotionButton
                          type="button"
                          disabled={generatingL3VolId !== null}
                          onClick={() => handleGenerateL3ForVolume(vol)}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                            isVolStale
                              ? 'bg-amber-600 text-white'
                              : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          }`}
                        >
                          {isBusyThisVol ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {volUnits.length > 0 ? 'AI 按最新 L1+L2 重拆本卷单元' : 'AI 基于 L1+L2 拆解本卷单元'}
                          </span>
                        </MotionButton>
                        <button
                          type="button"
                          onClick={() => {
                            const nextIdx = storyUnits.length + 1;
                            const span = parseChapterSpanRange(vol.chapterSpan, 1, 6);
                            onChangeStoryUnits([
                              ...storyUnits,
                              {
                                id: generateUUID(),
                                volumeId: vol.id,
                                unitIndex: nextIdx,
                                title: `第${nextIdx}剧情单元`,
                                chapterSpan: `第${span.start}章 - 第${Math.min(span.end, span.start + 5)}章`,
                                volumeAlignment: '',
                                coreConflict: '',
                                payoffEvent: '',
                                breakthroughMethod: '',
                                linkedCharacterIds: [],
                                linkedItemIds: [],
                                linkedForeshadowIds: [],
                              },
                            ]);
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> 手动加单元
                        </button>
                      </div>
                    </div>

                    {volUnits.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-3 text-center">
                        本卷暂未拆解 L3 单元，点击右上角「AI 基于 L1+L2 拆解本卷单元」。
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {volUnits.map((unit) => {
                          const realIdx = storyUnits.findIndex((x) => x.id === unit.id);
                          const unitHasPlannedChapters = chapterOutlines.filter((c) => c.unitId === unit.id).length;
                          const updateUnitField = (patch: Partial<NovelStoryUnitItem>, noteLabel?: string) => {
                            const nextUnits = [...storyUnits];
                            if (realIdx >= 0) {
                              nextUnits[realIdx] = { ...unit, ...patch };
                              onChangeStoryUnits(nextUnits);

                              // If volumeId changed, cascade volumeId & volumeTag to child chapters!
                              if (patch.volumeId !== undefined) {
                                const newVol = volumePlan.find((v) => v.id === patch.volumeId);
                                onChangeChapterOutlines(
                                  chapterOutlines.map((ch) =>
                                    ch.unitId === unit.id
                                      ? {
                                          ...ch,
                                          volumeId: patch.volumeId,
                                          volumeTag: newVol ? `第${newVol.volumeIndex}卷 · ${newVol.title}` : ch.volumeTag,
                                        }
                                      : ch
                                  )
                                );
                              }

                              if (noteLabel && chapterOutlines.some((c) => c.unitId === unit.id && c.status !== 'drafted')) {
                                const affectedChIds = chapterOutlines
                                  .filter((c) => c.unitId === unit.id && c.status !== 'drafted')
                                  .map((c) => c.id);
                                updateMeta({
                                  l3Confirmed: false,
                                  staleUnitIds: Array.from(new Set([...(meta.staleUnitIds || []), unit.id])),
                                  staleChapterIds: Array.from(new Set([...(meta.staleChapterIds || []), ...affectedChIds])),
                                  lastChangeNote: `L3 单元《${unit.title}》的「${noteLabel}」已修改`,
                                });
                              }
                            }
                          };

                          return (
                            <div
                              key={unit.id}
                              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                  <span className="px-2 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-primary)] text-[11px] font-bold tabular-nums shrink-0">
                                    单元 {unit.unitIndex}
                                  </span>
                                  <input
                                    type="text"
                                    value={unit.title}
                                    onChange={(e) => updateUnitField({ title: e.target.value })}
                                    placeholder="单元名称"
                                    className="studio-input px-2.5 py-1 text-xs font-bold flex-1 min-w-[140px]"
                                  />
                                  <input
                                    type="text"
                                    value={unit.chapterSpan}
                                    onChange={(e) => updateUnitField({ chapterSpan: e.target.value }, '章节区间')}
                                    placeholder="第1章 - 第6章"
                                    className="studio-input px-2.5 py-1 text-xs w-32 tabular-nums"
                                  />
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <MotionButton
                                    type="button"
                                    disabled={isGeneratingUnitChapters}
                                    onClick={() => handleGenerateChaptersForUnit(unit)}
                                    className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>
                                      {unitHasPlannedChapters > 0
                                        ? `重拆本单元 L4 细纲 (已有${unitHasPlannedChapters}章)`
                                        : '✨ 按本单元生成 L4 细纲'}
                                    </span>
                                  </MotionButton>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextUnits = storyUnits.filter((u) => u.id !== unit.id);
                                      onChangeStoryUnits(nextUnits);
                                      onChangeChapterOutlines(
                                        chapterOutlines.map((c) => (c.unitId === unit.id ? { ...c, unitId: undefined } : c))
                                      );
                                    }}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                                <div className="md:col-span-2">
                                  <input
                                    type="text"
                                    value={unit.volumeAlignment}
                                    onChange={(e) => updateUnitField({ volumeAlignment: e.target.value }, '卷目标防跑偏锚点')}
                                    placeholder="★ 围绕所属分卷目标不跑偏锚点（本单元必须向卷目标交付什么进度？）"
                                    className="studio-input w-full px-2.5 py-1.5 text-xs"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={unit.coreConflict}
                                  onChange={(e) => updateUnitField({ coreConflict: e.target.value }, '核心冲突')}
                                  placeholder="单元核心冲突..."
                                  className="studio-input w-full px-2.5 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  value={unit.breakthroughMethod}
                                  onChange={(e) => updateUnitField({ breakthroughMethod: e.target.value }, '破局手段')}
                                  placeholder="破局手段标签（强制相邻单元不雷同）..."
                                  className="studio-input w-full px-2.5 py-1.5 text-xs"
                                />
                              </div>
                            </div>
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
          LAYER 4: CHAPTER OUTLINES (PER-UNIT GENERATION + AUTO ENTITY LINK)
      ===================================================================== */}
      {subTab === 'l4' && (
        <div className="space-y-4">
          {l4StaleCount > 0 && (
            <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>
                ⚠ {meta.lastChangeNote || '上游单元或角色/道具/伏笔图谱有变更'}，下方带琥珀色标记的 <strong>{l4StaleCount}</strong> 章未写细纲可能需要联动同步。
              </span>
              <MotionButton
                type="button"
                disabled={isCascadeSyncingChapters}
                onClick={handleCascadeSyncStaleChapters}
                className="min-h-[34px] px-3.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isCascadeSyncingChapters ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>AI 一键联动校准这 {l4StaleCount} 章</span>
              </MotionButton>
            </div>
          )}

          {/* Per-Unit L4 Generation Control Bar */}
          <div className="p-4 studio-muted space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-[var(--text-primary)] whitespace-nowrap">
                  第 4 步 · 选定 L3 单元生成 L4 细纲：
                </span>
                <select
                  value={targetGenUnitId}
                  onChange={(e) => handleSelectTargetGenUnit(e.target.value)}
                  className="studio-input px-2.5 py-1.5 text-xs max-w-[230px]"
                >
                  {storyUnits.length === 0 && <option value="">请先去 L3 拆解剧情单元</option>}
                  {storyUnits.map((u) => {
                    const cnt = chapterOutlines.filter((c) => c.unitId === u.id).length;
                    return (
                      <option key={u.id} value={u.id}>
                        单元{u.unitIndex}《{u.title}》({u.chapterSpan}){cnt > 0 ? ` [已拆${cnt}章]` : ' [待拆]'}
                      </option>
                    );
                  })}
                </select>
                <span className="text-[var(--text-muted)] whitespace-nowrap">起始章</span>
                <input
                  type="number"
                  min={1}
                  value={genStartCh}
                  onChange={(e) => setGenStartCh(Math.max(1, Number(e.target.value) || 1))}
                  className="studio-input w-16 px-2 py-1.5 text-xs tabular-nums text-center"
                />
                <span className="text-[var(--text-muted)] whitespace-nowrap">章数</span>
                <input
                  type="number"
                  min={1}
                  max={18}
                  value={genCount}
                  onChange={(e) =>
                    setGenCount(Math.max(1, Math.min(18, Number(e.target.value) || 6)))
                  }
                  className="studio-input w-14 px-2 py-1.5 text-xs tabular-nums text-center"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <MotionButton
                  type="button"
                  disabled={isGeneratingUnitChapters || isSyncingEntities || storyUnits.length === 0}
                  onClick={() => handleGenerateChaptersForUnit()}
                  className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingUnitChapters || isSyncingEntities ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>按所选单元生成细纲（含自动关联）</span>
                </MotionButton>

                {storyUnits.some((u) => !chapterOutlines.some((c) => c.unitId === u.id)) && (
                  <MotionButton
                    type="button"
                    disabled={isGeneratingUnitChapters || isSyncingEntities}
                    onClick={handleGenerateAllUnplannedUnitsL4}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>依次补齐待拆单元</span>
                  </MotionButton>
                )}

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
                        unitId: targetGenUnitId || storyUnits[0]?.id,
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
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>手动加章</span>
                </MotionButton>
              </div>
            </div>

            {l4ProgressNote && (
              <div className="text-xs text-[var(--accent)] font-medium flex items-center gap-2 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{l4ProgressNote}</span>
              </div>
            )}
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

            <div className="flex items-center gap-2">
              <MotionButton
                type="button"
                onClick={() => setSubTab('graph')}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Network className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>查看关联图谱 ({entityTotal})</span>
              </MotionButton>
              <MotionButton
                type="button"
                onClick={onJumpToWriter}
                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>进入正文工坊按纲执笔</span>
              </MotionButton>
            </div>
          </div>

          {sortedChapters.length === 0 ? (
            <div className="p-8 studio-muted text-center text-xs text-[var(--text-muted)]">
              当前筛选下暂无 L4 单章细纲。请从上方选定 L3 剧情单元并点击「按所选单元生成细纲」，生成完毕后会自动抽取并绑定角色/道具/伏笔关联库！
            </div>
          ) : (
            <div className="space-y-3">
              {sortedChapters.map((ch) => {
                const realIdx = chapterOutlines.findIndex((x) => x.id === ch.id);
                const isChStale =
                  ch.status !== 'drafted' &&
                  (staleChapterIdsSet.has(ch.id) || (ch.unitId ? staleUnitIdsSet.has(ch.unitId) : false));

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
                    className={`p-4 rounded-xl border space-y-3 ${
                      isChStale
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold tabular-nums shrink-0">
                          第 {ch.chapterIndex} 章
                        </span>
                        {isChStale && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                            上游已改·建议同步
                          </span>
                        )}
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
                            const matchedVol = volumePlan.find((v) => v.id === matchedUnit?.volumeId);
                            updateCh({
                              unitId: e.target.value || undefined,
                              volumeId: matchedUnit?.volumeId || ch.volumeId,
                              volumeTag: matchedVol ? `第${matchedVol.volumeIndex}卷 · ${matchedVol.title}` : ch.volumeTag,
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
                          单章实质推进配额
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
          LAYER 5: CROSS-ENTITY RELATIONAL GRAPH (AUTO-LINKED WITH L1~L4)
      ===================================================================== */}
      {subTab === 'graph' && (
        <div className="space-y-6">
          <div className="p-4 studio-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-[var(--text-primary)]">
                第 5 步：角色 / 关键道具 / 伏笔全链路双向关联库
              </div>
              <p className="text-[var(--text-muted)] leading-relaxed">
                生成 L4 细纲后已自动整理并绑定角色、道具与伏笔。<strong>双向联动生效中</strong>：改角色姓名会自动联动更新道具持有者、关系网与世界书；修改知情权或道具状态会实时标记关联细纲待同步！
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <MotionButton
                type="button"
                disabled={isSyncingEntities}
                onClick={() => runEntityGraphAutoSync(storyUnits, chapterOutlines)}
                className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {isSyncingEntities ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isSyncingEntities ? '正在从 L1~L4 提取关联图谱...' : 'AI 基于 L1~L4 自动提取并关联图谱'}</span>
              </MotionButton>
            </div>
          </div>

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
              {characterGraph.map((cg, idx) => {
                const linkedChNums = chapterOutlines
                  .filter((c) => (c.linkedCharacterIds || []).includes(cg.id))
                  .map((c) => `第${c.chapterIndex}章`);
                return (
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
                            const newName = e.target.value;
                            const oldName = cg.name;
                            const updatedChars = [...characterGraph];
                            updatedChars[idx] = { ...cg, name: newName };
                            const cascaded = autoLinkEntitiesAndCascadeTopology({
                              volumePlan,
                              storyUnits,
                              chapterOutlines,
                              characterGraph: updatedChars,
                              keyItemRegistry,
                              foreshadowLedger,
                              lorebook,
                              renamedCharacter:
                                oldName && newName && oldName !== newName
                                  ? { id: cg.id, oldName, newName }
                                  : undefined,
                            });
                            onChangeCharacterGraph(cascaded.characterGraph);
                            onChangeKeyItemRegistry(cascaded.keyItemRegistry);
                            onChangeLorebook(cascaded.lorebook);
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
                        onClick={() => {
                          const filtered = characterGraph.filter((x) => x.id !== cg.id);
                          const cascaded = autoLinkEntitiesAndCascadeTopology({
                            volumePlan,
                            storyUnits,
                            chapterOutlines,
                            characterGraph: filtered,
                            keyItemRegistry,
                            foreshadowLedger,
                            lorebook,
                          });
                          onChangeCharacterGraph(cascaded.characterGraph);
                          onChangeStoryUnits(cascaded.storyUnits);
                          onChangeChapterOutlines(cascaded.chapterOutlines);
                          onChangeKeyItemRegistry(cascaded.keyItemRegistry);
                          onChangeForeshadowLedger(cascaded.foreshadowLedger);
                        }}
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
                      placeholder="专属说话声纹/口癖..."
                      className="studio-input w-full px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={cg.epistemicBoundary}
                      onChange={(e) => {
                        const next = [...characterGraph];
                        next[idx] = { ...cg, epistemicBoundary: e.target.value };
                        onChangeCharacterGraph(next);
                        markLinkedChaptersStaleByEntity('char', cg.id, `角色「${cg.name}」知情权边界发生变更`);
                      }}
                      placeholder="★ 知情权隔离边界（防上帝视角）..."
                      className="studio-input w-full px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={cg.currentStatus}
                      onChange={(e) => {
                        const next = [...characterGraph];
                        next[idx] = { ...cg, currentStatus: e.target.value };
                        onChangeCharacterGraph(next);
                        markLinkedChaptersStaleByEntity('char', cg.id, `角色「${cg.name}」实时状态发生变更`);
                      }}
                      placeholder="实时状态（位置/伤势/立场）..."
                      className="studio-input w-full px-2.5 py-1.5 text-xs"
                    />
                    {linkedChNums.length > 0 && (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        细纲关联章节：{linkedChNums.join('、')}
                      </div>
                    )}
                  </div>
                );
              })}
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
                            markLinkedChaptersStaleByEntity('item', item.id, `关键道具「${item.name}」状态改为【${e.target.value}】`);
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
                        onClick={() => {
                          const filtered = keyItemRegistry.filter((x) => x.id !== item.id);
                          const cascaded = autoLinkEntitiesAndCascadeTopology({
                            volumePlan,
                            storyUnits,
                            chapterOutlines,
                            characterGraph,
                            keyItemRegistry: filtered,
                            foreshadowLedger,
                            lorebook,
                          });
                          onChangeKeyItemRegistry(cascaded.keyItemRegistry);
                          onChangeStoryUnits(cascaded.storyUnits);
                          onChangeChapterOutlines(cascaded.chapterOutlines);
                          onChangeForeshadowLedger(cascaded.foreshadowLedger);
                        }}
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
                        markLinkedChaptersStaleByEntity('item', item.id, `道具「${item.name}」规则/代价发生变更`);
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
              {foreshadowLedger.map((fs, idx) => {
                const linkedChNums = chapterOutlines
                  .filter((c) => (c.linkedForeshadowIds || []).includes(fs.id))
                  .map((c) => `第${c.chapterIndex}章`);
                return (
                  <div
                    key={fs.id}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2 text-xs"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
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
                          markLinkedChaptersStaleByEntity('fs', fs.id, `伏笔「${fs.name}」揭晓反转设计已改动`);
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
                            markLinkedChaptersStaleByEntity('fs', fs.id, `伏笔「${fs.name}」状态改为 ${e.target.value}`);
                          }}
                          className="studio-input px-2 py-1.5 text-xs"
                        >
                          <option value="planted">已埋设</option>
                          <option value="fermenting">发酵中</option>
                          <option value="resolved">已回收</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = foreshadowLedger.filter((x) => x.id !== fs.id);
                            const cascaded = autoLinkEntitiesAndCascadeTopology({
                              volumePlan,
                              storyUnits,
                              chapterOutlines,
                              characterGraph,
                              keyItemRegistry,
                              foreshadowLedger: filtered,
                              lorebook,
                            });
                            onChangeForeshadowLedger(cascaded.foreshadowLedger);
                            onChangeStoryUnits(cascaded.storyUnits);
                            onChangeChapterOutlines(cascaded.chapterOutlines);
                          }}
                          className="p-1 text-[var(--text-muted)] hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {linkedChNums.length > 0 && (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        细纲挂载章节：{linkedChNums.join('、')}
                      </div>
                    )}
                  </div>
                );
              })}
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
