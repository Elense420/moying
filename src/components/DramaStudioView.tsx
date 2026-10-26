import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Copy,
  Check,
  Film,
  Loader2,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  BookOpen,
  Wand2,
  ListVideo,
  X,
  UserCheck,
  MapPin,
  Flame,
  Edit3,
  FileText,
  Upload,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  MessageSquarePlus,
  FolderArchive,
  Clock,
  KeyRound,
  Compass,
  GitBranch,
  RefreshCw,
  Link2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DramaProject,
  DramaCandidatePlan,
  DramaVisualStyle,
  DramaAspectRatio,
  DramaAudienceChannel,
  HOT_DRAMA_TRACKS,
  DramaCharacterAsset,
  DramaSceneAnchor,
  DramaEpisodePlanItem,
  DramaEpisode,
  DramaShot,
  DramaScriptFormat,
  DRAMA_SCRIPT_FORMATS,
  DramaNarrativeBible,
  DramaForeshadowItem,
  DramaForeshadowCategory,
  DramaForeshadowStatus,
  ApiConfig,
  UiSettings,
  Book,
} from '../types';
import { streamChatCompletion, chatCompletion } from '../services/apiClient';
import {
  EMPTY_NARRATIVE_BIBLE,
  normalizeNarrativeBible,
  hasPopulatedNarrativeBible,
  mergeUniqueSceneAnchors,
  extractSceneAnchorsFromScriptFallback,
  mergeForeshadowingLedger,
  applyEpisodeContinuityUpdates,
  getContinuityMemoryDiagnostics,
  buildDramaNarrativeBibleMessages,
  parseDramaNarrativeBibleJson,
  buildSyncSceneAnchorsFromProjectMessages,
  parseSyncSceneAnchorsJson,
  DRAMA_DURATION_PRESETS,
  getEpisodeDurationSpec,
  buildDramaAssetExtractionMessages,
  parseDramaAssetsJson,
  buildContinueEpisodePlanMessages,
  parseContinueEpisodePlanJson,
  buildLiteraryScriptMessages,
  parseLiteraryScriptEpisode,
  buildStandardizeClientScriptMessages,
  buildBreakdownScriptToShotsMessages,
  parseBreakdownShotsJson,
  buildDramaEpisodeMessages,
  parseGeneratedDramaEpisode,
  cleanMessyClientScriptLocal,
  extractJsonString,
  exportDramaEpisodeToCsv,
  exportDramaProjectToMarkdown,
} from '../services/dramaPromptEngine';
import { generateUUID } from '../utils/uuid';
import {
  SPRING_INDICATOR,
  StaggerCard,
  StaggerList,
  StaggerItem,
  MotionButton,
  SNAPPY_EASE,
  ModalPortal,
} from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';
import { DramaIdeaConsultant } from './DramaIdeaConsultant';
import { DramaCandidateVaultModal } from './DramaCandidateVaultView';

const VISUAL_STYLES: DramaVisualStyle[] = [
  '2.5D精致厚涂精绘',
  '国漫厚涂精绘',
  '日韩唯美赛璐璐网漫',
  '日韩赛璐璐网漫',
  '暗黑赛博霓虹',
  '新中式古风玄幻',
  '写实电影感漫剧',
  '美式硬派漫画',
];

const ASPECT_RATIOS: DramaAspectRatio[] = ['9:16 竖屏短剧', '16:9 横屏中剧'];

/**
 * Renders an authentic industry literary script with clean typographic hierarchy
 * (**Scene Header**, 出场人物, △ Action Beat, 【音效】, Character Dialogue)
 */
const FormattedIndustryScriptLines: React.FC<{ scriptText: string }> = ({ scriptText }) => {
  const lines = (scriptText || '').split('\n');

  return (
    <div className="space-y-2 text-xs sm:text-sm leading-relaxed font-sans">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-2" />;
        }

        // Scene header: **47-1 ...** or 31-1 ... 日/夜 内/外 or 第X集
        const cleanHeader = line.replace(/^\*\*|\*\*$/g, '').trim();
        const isEpisodeHeading = /^第[零一二三四五六七八九十百\d]+集/.test(cleanHeader);
        const isSceneHeader =
          line.startsWith('**') ||
          /^\d+\s*[-—]\s*\d+\s+/.test(cleanHeader);

        if (isEpisodeHeading) {
          return (
            <div
              key={idx}
              className="pt-2 pb-1 text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif border-b border-[var(--border-subtle)]"
            >
              {cleanHeader}
            </div>
          );
        }

        if (isSceneHeader) {
          return (
            <div
              key={idx}
              className="mt-4 pt-2.5 pb-1.5 px-3 rounded-lg studio-muted font-bold text-[var(--text-primary)] tracking-tight"
            >
              {cleanHeader}
            </div>
          );
        }

        // Cast list: 出场人物：...
        if (/^出场人物[：:]/.test(line)) {
          return (
            <div key={idx} className="px-1 text-xs font-medium text-[var(--text-muted)]">
              {line}
            </div>
          );
        }

        // Triangle visual beat: △ ...
        if (line.startsWith('△')) {
          return (
            <div
              key={idx}
              className="pl-2.5 py-0.5 text-[var(--text-secondary)] flex items-start gap-2"
            >
              <span className="font-bold text-[var(--accent)] shrink-0 select-none">△</span>
              <span>{line.replace(/^△\s*/, '')}</span>
            </div>
          );
        }

        // Explicit SFX cue: 【音效】...
        if (line.startsWith('【音效】') || line.startsWith('[音效]')) {
          return (
            <div
              key={idx}
              className="pl-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
            >
              {line}
            </div>
          );
        }

        // Character Dialogue: 角色名（...）：台词 or 角色名：台词
        const dialogueMatch = line.match(/^([^：:\s]{1,16})([：:])(.*)$/);
        if (dialogueMatch) {
          const [, speakerPart, , spokenPart] = dialogueMatch;
          return (
            <div key={idx} className="pl-2.5 py-0.5 text-[var(--text-primary)]">
              <span className="font-bold">{speakerPart}：</span>
              <span>{spokenPart}</span>
            </div>
          );
        }

        // English subtitle line or minimalist action line
        const isEnglishSubtitle = /^[A-Za-z0-9"',.?!\-\s()’“”]+$/.test(line);
        if (isEnglishSubtitle) {
          return (
            <div key={idx} className="pl-6 text-xs italic text-[var(--text-muted)]">
              {line}
            </div>
          );
        }

        return (
          <div key={idx} className="pl-2.5 py-0.5 text-[var(--text-secondary)]">
            {line}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// 1. 漫剧立项、角色固定立绘词与分集卡点目录 (DramaSetupView)
// ============================================================================

interface DramaSetupViewProps {
  currentProject: DramaProject | null;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  candidates?: DramaCandidatePlan[];
  onSaveProject: (project: DramaProject) => Promise<void>;
  onStartEpisodeInWriter: (project: DramaProject, episodeIndex: number, presetBeat?: string) => void;
  onAutoArchiveCandidates?: (candidates: DramaCandidatePlan[], selectedTitle: string) => void;
  onPromoteCandidate?: (candidate: DramaCandidatePlan) => void;
  onDeleteCandidate?: (id: string) => void;
}

export const DramaSetupView: React.FC<DramaSetupViewProps> = ({
  currentProject,
  configs,
  uiSettings,
  candidates = [],
  onSaveProject,
  onStartEpisodeInWriter,
  onAutoArchiveCandidates,
  onPromoteCandidate,
  onDeleteCandidate,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();
  const defaultTrack = HOT_DRAMA_TRACKS[0];

  const [title, setTitle] = useState('');
  const [trackId, setTrackId] = useState(defaultTrack.id);
  const [channel, setChannel] = useState<DramaAudienceChannel>(defaultTrack.channel);
  const [visualStyle, setVisualStyle] = useState<DramaVisualStyle>(defaultTrack.visualStyleRecommend);
  const [aspectRatio, setAspectRatio] = useState<DramaAspectRatio>('9:16 竖屏短剧');
  const [preferredScriptFormat, setPreferredScriptFormat] =
    useState<DramaScriptFormat>('triangle_standard');
  const [episodeDurationSec, setEpisodeDurationSec] = useState<number>(90);
  const [totalPlannedEpisodes, setTotalPlannedEpisodes] = useState<number>(60);
  const [totalEpisodesReason, setTotalEpisodesReason] = useState<string>('');
  const [paywallEpisodeIndex, setPaywallEpisodeIndex] = useState<number>(10);
  const [logline, setLogline] = useState('');
  const [targetAudience, setTargetAudience] = useState(defaultTrack.targetAudience);
  const [golden3SecHook, setGolden3SecHook] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [narrativeBible, setNarrativeBible] = useState<DramaNarrativeBible>({
    ...EMPTY_NARRATIVE_BIBLE,
  });
  const [foreshadowingLedger, setForeshadowingLedger] = useState<DramaForeshadowItem[]>([]);
  const [characterAssets, setCharacterAssets] = useState<DramaCharacterAsset[]>([]);
  const [sceneAnchors, setSceneAnchors] = useState<DramaSceneAnchor[]>([]);
  const [episodePlan, setEpisodePlan] = useState<DramaEpisodePlanItem[]>([]);
  const [continuityAuditLog, setContinuityAuditLog] = useState<string>('');

  const [activeBibleTab, setActiveBibleTab] = useState<
    'plotlines' | 'structure' | 'characters' | 'foreshadow'
  >('plotlines');
  const [isGeneratingBible, setIsGeneratingBible] = useState(false);
  const [bibleStreamText, setBibleStreamText] = useState('');
  const [isSyncingScenes, setIsSyncingScenes] = useState(false);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStreamText, setExtractStreamText] = useState('');
  const [isContinuingPlan, setIsContinuingPlan] = useState(false);
  const [continueStreamText, setContinueStreamText] = useState('');
  const [continueStartEp, setContinueStartEp] = useState<number>(13);
  const [continueEndEp, setContinueEndEp] = useState<number>(24);
  const [continueArcHint, setContinueArcHint] = useState<string>('');
  const [editingPlanEpIdx, setEditingPlanEpIdx] = useState<number | null>(null);
  const [isAuditExpanded, setIsAuditExpanded] = useState<boolean>(true);

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConsultantOpen, setIsConsultantOpen] = useState<boolean>(!currentProject);
  const [isCandidateVaultOpen, setIsCandidateVaultOpen] = useState<boolean>(false);

  const setupDurSpec = getEpisodeDurationSpec(episodeDurationSec);

  const maxPlannedEpisodeIndex =
    episodePlan.length > 0 ? Math.max(...episodePlan.map((ep) => ep.episodeIndex)) : 0;

  useEffect(() => {
    const nextStart = maxPlannedEpisodeIndex + 1;
    const defaultSpan = 12;
    const suggestedEnd =
      totalPlannedEpisodes >= nextStart
        ? Math.min(totalPlannedEpisodes, nextStart + defaultSpan - 1)
        : nextStart + defaultSpan - 1;
    setContinueStartEp(nextStart);
    setContinueEndEp(Math.max(nextStart, suggestedEnd));
  }, [maxPlannedEpisodeIndex]);

  useEffect(() => {
    if (currentProject) {
      setTitle(currentProject.title);
      setTrackId(currentProject.trackId);
      setChannel(currentProject.channel);
      setVisualStyle(currentProject.visualStyle);
      setAspectRatio(currentProject.aspectRatio);
      setPreferredScriptFormat(currentProject.preferredScriptFormat || 'triangle_standard');
      setEpisodeDurationSec(currentProject.episodeDurationSec || 90);
      setTotalPlannedEpisodes(currentProject.totalPlannedEpisodes || 60);
      setTotalEpisodesReason(currentProject.totalEpisodesReason || '');
      setPaywallEpisodeIndex(currentProject.paywallEpisodeIndex || 10);
      setLogline(currentProject.logline || '');
      setTargetAudience(currentProject.targetAudience || '');
      setGolden3SecHook(currentProject.golden3SecHook || '');
      setSynopsis(currentProject.synopsis || '');
      setNarrativeBible(normalizeNarrativeBible(currentProject.narrativeBible));
      setForeshadowingLedger(currentProject.foreshadowingLedger || []);
      setCharacterAssets(currentProject.characterAssets || []);
      setSceneAnchors(currentProject.sceneAnchors || []);
      setEpisodePlan(
        [...(currentProject.episodePlan || [])].sort((a, b) => a.episodeIndex - b.episodeIndex)
      );
      setContinuityAuditLog(currentProject.continuityAuditLog || '');
      setIsConsultantOpen(!currentProject.title && !currentProject.synopsis);
    } else {
      setTitle('');
      setTrackId(defaultTrack.id);
      setChannel(defaultTrack.channel);
      setVisualStyle(defaultTrack.visualStyleRecommend);
      setAspectRatio('9:16 竖屏短剧');
      setPreferredScriptFormat('triangle_standard');
      setEpisodeDurationSec(90);
      setTotalPlannedEpisodes(60);
      setTotalEpisodesReason('');
      setPaywallEpisodeIndex(10);
      setLogline('');
      setTargetAudience(defaultTrack.targetAudience);
      setGolden3SecHook('');
      setSynopsis('');
      setNarrativeBible({ ...EMPTY_NARRATIVE_BIBLE });
      setForeshadowingLedger([]);
      setCharacterAssets([]);
      setSceneAnchors([]);
      setEpisodePlan([]);
      setContinuityAuditLog('');
      setIsConsultantOpen(true);
    }
  }, [currentProject?.id]);

  const handleTrackSelect = (newTrackId: string) => {
    setTrackId(newTrackId);
    const found = HOT_DRAMA_TRACKS.find((t) => t.id === newTrackId);
    if (found) {
      setChannel(found.channel);
      setVisualStyle(found.visualStyleRecommend);
      if (!targetAudience.trim()) setTargetAudience(found.targetAudience);
    }
  };

  const buildSnapshotProject = (overrides?: Partial<DramaProject>): DramaProject => {
    const now = Date.now();
    const matchedTrack = HOT_DRAMA_TRACKS.find((t) => t.id === trackId) || defaultTrack;
    const clampedDuration = Math.max(45, Math.min(480, Math.round(Number(episodeDurationSec) || 90)));
    return {
      id: currentProject?.id || generateUUID(),
      title: title.trim() || '未命名爆款漫剧',
      createdAt: currentProject?.createdAt || now,
      lastModifiedAt: now,
      trackId,
      trackName: matchedTrack.name,
      channel,
      visualStyle,
      aspectRatio,
      preferredScriptFormat,
      episodeDurationSec: clampedDuration,
      totalPlannedEpisodes,
      totalEpisodesReason: totalEpisodesReason || undefined,
      paywallEpisodeIndex,
      logline,
      targetAudience,
      golden3SecHook,
      synopsis,
      narrativeBible,
      foreshadowingLedger,
      characterAssets,
      sceneAnchors,
      episodePlan: [...episodePlan].sort((a, b) => a.episodeIndex - b.episodeIndex),
      continuityAuditLog,
      episodes: currentProject?.episodes || [],
      sourceNovelId: currentProject?.sourceNovelId,
      ...overrides,
    };
  };

  const handleManualSave = async () => {
    if (!title.trim()) {
      setStatusMsg({ type: 'error', text: '请先填写漫剧剧名后再保存立项' });
      return;
    }
    const proj = buildSnapshotProject();
    await onSaveProject(proj);
    setStatusMsg({
      type: 'success',
      text: `《${proj.title}》立项规格（单集 ${proj.episodeDurationSec} 秒 · 目标 ${setupDurSpec.minWords}~${setupDurSpec.maxWords} 字）与视觉资产已保存`,
    });
    triggerQuickToast('漫剧立项档案已保存');
  };

  const handleAiExtractAssetsAndBeats = async () => {
    if (!title.trim() || !synopsis.trim()) {
      setStatusMsg({
        type: 'error',
        text: '请先填写「漫剧剧名」与「全剧商业大纲」（或前往热门赛道雷达一键采纳企划），再执行 AI 视觉资产提取。',
      });
      return;
    }

    const cfgId = uiSettings.writerApiCfgId || uiSettings.inspirationApiCfgId;
    const cfg = configs.find((c) => c.id === cfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';

    if (!cfg) {
      setStatusMsg({ type: 'error', text: '未检测到可用模型线路，请先在「引擎与技能」中配置' });
      return;
    }

    setIsExtracting(true);
    setExtractStreamText('');
    setStatusMsg({
      type: 'info',
      text: `AI 视觉总监正在按「单集 ${setupDurSpec.durationSec} 秒（约 ${setupDurSpec.minWords}~${setupDurSpec.maxWords} 字/集）」规格锁定角色立绘词、核心场景锚点与前 12 集伏笔卡点细纲...`,
    });

    try {
      const snapshot = buildSnapshotProject();
      const messages = buildDramaAssetExtractionMessages(snapshot);
      let rawAccum = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.75,
        onChunk: (chunk) => {
          rawAccum += chunk;
          setExtractStreamText(rawAccum);
        },
      });

      const parsed = parseDramaAssetsJson(res.content || rawAccum);
      const sortedPlan = [...parsed.episodePlan].sort((a, b) => a.episodeIndex - b.episodeIndex);
      const { merged: mergedScenes } = mergeUniqueSceneAnchors(sceneAnchors, parsed.sceneAnchors);
      const { merged: mergedLedger } = mergeForeshadowingLedger(
        foreshadowingLedger,
        parsed.foreshadowingLedger,
        1
      );
      const mergedBible: DramaNarrativeBible = parsed.narrativeBible
        ? {
            worldSettingAndRules:
              parsed.narrativeBible.worldSettingAndRules || narrativeBible.worldSettingAndRules,
            storylineOverview:
              parsed.narrativeBible.storylineOverview || narrativeBible.storylineOverview,
            mainPlotline: parsed.narrativeBible.mainPlotline || narrativeBible.mainPlotline,
            subPlotlines: parsed.narrativeBible.subPlotlines || narrativeBible.subPlotlines,
            frameworkStructure:
              parsed.narrativeBible.frameworkStructure || narrativeBible.frameworkStructure,
            pacingStrategy: parsed.narrativeBible.pacingStrategy || narrativeBible.pacingStrategy,
            characterArcsAndRelations:
              parsed.narrativeBible.characterArcsAndRelations ||
              narrativeBible.characterArcsAndRelations,
          }
        : narrativeBible;

      setNarrativeBible(mergedBible);
      setForeshadowingLedger(mergedLedger);
      setCharacterAssets(parsed.characterAssets);
      setSceneAnchors(mergedScenes);
      setEpisodePlan(sortedPlan);

      const updatedProj: DramaProject = {
        ...snapshot,
        narrativeBible: mergedBible,
        foreshadowingLedger: mergedLedger,
        characterAssets: parsed.characterAssets,
        sceneAnchors: mergedScenes,
        episodePlan: sortedPlan,
        lastModifiedAt: Date.now(),
      };
      await onSaveProject(updatedProj);
      setStatusMsg({
        type: 'success',
        text: `已成功构建叙事架构圣经，锁定 ${parsed.characterAssets.length} 位角色立绘、${mergedScenes.length} 处核心场景锚点（含同场景异态去重）、${mergedLedger.length} 项伏笔关键道具与前 ${sortedPlan.length} 集细纲！`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `提取视觉资产失败：${err.message}` });
    } finally {
      setIsExtracting(false);
      setExtractStreamText('');
    }
  };

  /**
   * 独立生成或补全《全剧叙事架构圣经 + 角色伏笔关键道具追踪台账》
   */
  const handleAiGenerateNarrativeBible = async () => {
    if (!title.trim() || !synopsis.trim()) {
      setStatusMsg({
        type: 'error',
        text: '请先填写「漫剧剧名」与「全剧商业大纲」后再推演叙事架构圣经与伏笔台账。',
      });
      return;
    }

    const cfgId = uiSettings.writerApiCfgId || uiSettings.inspirationApiCfgId;
    const cfg = configs.find((c) => c.id === cfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';

    if (!cfg) {
      setStatusMsg({ type: 'error', text: '未检测到可用模型线路，请先在「引擎与技能」中配置' });
      return;
    }

    setIsGeneratingBible(true);
    setBibleStreamText('');
    setStatusMsg({
      type: 'info',
      text: `AI 总编剧正在推演《${title}》（共 ${totalPlannedEpisodes} 集）的故事线、主支线、四幕框架结构、波浪节奏与伏笔道具台账...`,
    });

    try {
      const snapshot = buildSnapshotProject();
      const messages = buildDramaNarrativeBibleMessages(snapshot);
      let rawAccum = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.76,
        onChunk: (chunk) => {
          rawAccum += chunk;
          setBibleStreamText(rawAccum);
        },
      });

      const parsed = parseDramaNarrativeBibleJson(res.content || rawAccum);
      const { merged: mergedLedger } = mergeForeshadowingLedger(
        foreshadowingLedger,
        parsed.foreshadowingLedger,
        1
      );

      setNarrativeBible(parsed.narrativeBible);
      setForeshadowingLedger(mergedLedger);

      const updatedProj = buildSnapshotProject({
        narrativeBible: parsed.narrativeBible,
        foreshadowingLedger: mergedLedger,
      });
      await onSaveProject(updatedProj);
      setStatusMsg({
        type: 'success',
        text: `已补全 7 大叙事架构维度（故事线/主线/支线/框架结构/剧情节奏/底层规则/人物弧光）并归档 ${mergedLedger.length} 项伏笔关键道具！`,
      });
      triggerQuickToast('全剧叙事架构圣经与伏笔台账已生成');
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `生成叙事圣经失败：${err.message}` });
    } finally {
      setIsGeneratingBible(false);
      setBibleStreamText('');
    }
  };

  /**
   * 从现有全部「分集细纲」与「已成稿单集剧本」中自动扫描同步核心场景视觉锚点（重复场景同态去重，同场景异态独立归档）
   */
  const handleSyncScenesFromOutlineAndScripts = async () => {
    const existingEps = currentProject?.episodes || [];
    if (episodePlan.length === 0 && existingEps.length === 0) {
      setStatusMsg({
        type: 'error',
        text: '当前尚无分集细纲或已生成单集剧本，请先生成细纲或单集剧本后再同步场景锚点。',
      });
      return;
    }

    setIsSyncingScenes(true);
    try {
      // Step 1: Deterministic local extraction from all written episode headers
      let localIncoming: Array<Partial<DramaSceneAnchor> & { sceneName: string }> = [];
      existingEps.forEach((ep) => {
        const extracted = extractSceneAnchorsFromScriptFallback(
          ep.rawScriptText || '',
          ep.index,
          visualStyle,
          aspectRatio
        );
        localIncoming = localIncoming.concat(extracted);
      });
      const localMerge = mergeUniqueSceneAnchors(sceneAnchors, localIncoming);
      let workingScenes = localMerge.merged;
      let totalAdded = localMerge.addedCount;

      // Step 2: AI semantic scan across episode beat outlines + scripts for rich prompts & state variants
      const cfgId = uiSettings.writerApiCfgId || uiSettings.inspirationApiCfgId;
      const cfg = configs.find((c) => c.id === cfgId) || configs[0];
      const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';

      if (cfg) {
        const snapshot = buildSnapshotProject({ sceneAnchors: workingScenes });
        const messages = buildSyncSceneAnchorsFromProjectMessages(snapshot);
        const res = await chatCompletion({
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model,
          messages,
          temperature: 0.65,
        });
        const aiScenes = parseSyncSceneAnchorsJson(res.content);
        const aiMerge = mergeUniqueSceneAnchors(workingScenes, aiScenes);
        workingScenes = aiMerge.merged;
        totalAdded += aiMerge.addedCount;
      }

      setSceneAnchors(workingScenes);
      const updatedProj = buildSnapshotProject({ sceneAnchors: workingScenes });
      await onSaveProject(updatedProj);

      setStatusMsg({
        type: 'success',
        text:
          totalAdded > 0
            ? `已从细纲与单集剧本中自动同步新增 ${totalAdded} 处核心场景/同场景异态锚点（重复同态场景已自动过滤，当前共 ${workingScenes.length} 处）！`
            : `扫描完毕：当前 ${workingScenes.length} 处核心场景视觉锚点已完整覆盖现有细纲与剧本，无重复缺漏。`,
      });
      triggerQuickToast(
        totalAdded > 0 ? `已新增归档 ${totalAdded} 处场景视觉锚点` : '场景锚点已是最新无重复状态'
      );
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `同步场景锚点失败：${err.message}` });
    } finally {
      setIsSyncingScenes(false);
    }
  };

  /**
   * 滚动续写第 X - Y 集剧本细纲（先自动审阅前序所有已规划细纲、已成稿剧本中的伏笔、关键道具与核心剧情，并自动同步新场景与伏笔台账）
   */
  const handleAiContinueEpisodePlan = async () => {
    if (!title.trim() || !synopsis.trim()) {
      setStatusMsg({
        type: 'error',
        text: '请先填写「漫剧剧名」与「全剧商业大纲」后再生成后续分集细纲。',
      });
      return;
    }

    const startEp = Math.max(1, Math.round(Number(continueStartEp) || 1));
    const endEp = Math.max(startEp, Math.round(Number(continueEndEp) || startEp));
    const batchCount = endEp - startEp + 1;

    if (batchCount > 20) {
      setStatusMsg({
        type: 'error',
        text: `单次建议生成不超过 20 集（当前选择了 ${batchCount} 集：第 ${startEp}~${endEp} 集），以确保 AI 能深入审阅前序伏笔与关键道具且不被截断。建议先填第 ${startEp} 至 ${startEp + 19} 集，完成后可一键继续下一批！`,
      });
      setContinueEndEp(startEp + 19);
      return;
    }

    const cfgId = uiSettings.writerApiCfgId || uiSettings.inspirationApiCfgId;
    const cfg = configs.find((c) => c.id === cfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';

    if (!cfg) {
      setStatusMsg({ type: 'error', text: '未检测到可用模型线路，请先在「引擎与技能」中配置' });
      return;
    }

    setIsContinuingPlan(true);
    setContinueStreamText('');
    setStatusMsg({
      type: 'info',
      text: `AI 总编审正在回溯审阅第 1~${Math.max(1, startEp - 1)} 集的伏笔、关键道具与剧情线，并续写第 ${startEp}~${endEp} 集剧本细纲...`,
    });

    try {
      const nextTotalPlanned = Math.max(totalPlannedEpisodes, endEp);
      const snapshot = buildSnapshotProject({ totalPlannedEpisodes: nextTotalPlanned });
      const messages = buildContinueEpisodePlanMessages({
        project: snapshot,
        startEpisode: startEp,
        endEpisode: endEp,
        arcDirectionHint: continueArcHint,
      });

      let rawAccum = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.78,
        onChunk: (chunk) => {
          rawAccum += chunk;
          setContinueStreamText(rawAccum);
        },
      });

      const parsed = parseContinueEpisodePlanJson(res.content || rawAccum, startEp);
      if (parsed.episodes.length === 0) {
        setStatusMsg({
          type: 'error',
          text: '未能解析出新增的分集细纲列表，请点击重试或缩小单次生成集数跨度。',
        });
        return;
      }

      // 按 episodeIndex 精准合并：保留前序及其他集，覆盖或追加本次新生成的 [startEp..endEp] 集并升序排列
      const incomingIndexSet = new Set(parsed.episodes.map((item) => item.episodeIndex));
      const mergedPlan = [
        ...episodePlan.filter((item) => !incomingIndexSet.has(item.episodeIndex)),
        ...parsed.episodes,
      ].sort((a, b) => a.episodeIndex - b.episodeIndex);

      const { merged: mergedScenes, addedCount: addedScenes } = mergeUniqueSceneAnchors(
        sceneAnchors,
        parsed.newSceneAnchors
      );
      const { merged: mergedLedger, updatedCount: updatedLedgerCount } =
        mergeForeshadowingLedger(
          foreshadowingLedger,
          parsed.foreshadowingUpdates,
          startEp
        );

      const newMaxEp = Math.max(...mergedPlan.map((e) => e.episodeIndex), nextTotalPlanned);
      const updatedAudit = parsed.continuityAuditSummary || continuityAuditLog;

      setEpisodePlan(mergedPlan);
      setSceneAnchors(mergedScenes);
      setForeshadowingLedger(mergedLedger);
      setTotalPlannedEpisodes(newMaxEp);
      if (updatedAudit) {
        setContinuityAuditLog(updatedAudit);
        setIsAuditExpanded(true);
      }
      setContinueArcHint('');

      const updatedProj = buildSnapshotProject({
        episodePlan: mergedPlan,
        sceneAnchors: mergedScenes,
        foreshadowingLedger: mergedLedger,
        totalPlannedEpisodes: newMaxEp,
        continuityAuditLog: updatedAudit,
      });
      await onSaveProject(updatedProj);

      const syncExtra =
        addedScenes > 0 || updatedLedgerCount > 0
          ? `（同步归档 ${addedScenes} 处新场景/异态锚点，更新 ${updatedLedgerCount} 项伏笔道具台账）`
          : '';

      setStatusMsg({
        type: 'success',
        text: `已完成前序伏笔与关键道具审阅，成功续写第 ${startEp}~${
          parsed.episodes[parsed.episodes.length - 1].episodeIndex
        } 集细纲（累计已规划 ${mergedPlan.length} 集）${syncExtra}！`,
      });
      triggerQuickToast(`已续写第 ${startEp}~${endEp} 集剧本细纲`);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `续写分集细纲失败：${err.message}` });
    } finally {
      setIsContinuingPlan(false);
      setContinueStreamText('');
    }
  };

  const updateEpisodePlanItem = (
    epIdx: number,
    patch: Partial<DramaEpisodePlanItem>
  ) => {
    setEpisodePlan((prev) =>
      prev
        .map((item) => (item.episodeIndex === epIdx ? { ...item, ...patch } : item))
        .sort((a, b) => a.episodeIndex - b.episodeIndex)
    );
  };

  const handleAddManualEpisodePlanItem = () => {
    const nextIdx = maxPlannedEpisodeIndex + 1;
    const newItem: DramaEpisodePlanItem = {
      episodeIndex: nextIdx,
      title: '新分集剧情节点',
      beatSummary: '',
      foreshadowingOrProps: '',
      hookType: nextIdx === paywallEpisodeIndex ? '核心付费卡点' : '免费强留存',
    };
    setEpisodePlan((prev) => [...prev, newItem].sort((a, b) => a.episodeIndex - b.episodeIndex));
    if (nextIdx > totalPlannedEpisodes) {
      setTotalPlannedEpisodes(nextIdx);
    }
    setEditingPlanEpIdx(nextIdx);
  };

  const copyText = (key: string, val: string, toastMsg = '已复制到剪贴板') => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    triggerQuickToast(toastMsg);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const addBlankCharacter = () => {
    setCharacterAssets((prev) => [
      ...prev,
      {
        id: generateUUID(),
        name: '新角色',
        roleTag: '核心配角',
        ageAndArchetype: '22岁 · 鲜明反差人设',
        appearanceZh: '',
        visualPromptEn: '',
        voicePersona: '',
        signatureTrait: '',
      },
    ]);
  };

  const updateCharField = (id: string, field: keyof DramaCharacterAsset, value: string) => {
    setCharacterAssets((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const updateBibleField = (field: keyof DramaNarrativeBible, value: string) => {
    setNarrativeBible((prev) => ({ ...prev, [field]: value }));
  };

  const addBlankForeshadowItem = () => {
    setForeshadowingLedger((prev) => [
      ...prev,
      {
        id: generateUUID(),
        name: '新伏笔/关键道具',
        category: '关键道具',
        ownerOrRelation: '',
        plantedEpisode: 1,
        expectedPayoffEpisode: `第${paywallEpisodeIndex}集`,
        status: 'planted',
        visualAnchorNote: '',
        payoffNote: '',
      },
    ]);
  };

  const updateForeshadowField = <K extends keyof DramaForeshadowItem>(
    id: string,
    field: K,
    value: DramaForeshadowItem[K]
  ) => {
    setForeshadowingLedger((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* XP Isolation Notice & Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>商业剧本纯净模式：已物理隔离个人小说 XP 宪法，严格对齐市面甲方标准文学剧本与后期分镜双层规范</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
            {currentProject ? `《${title || currentProject.title}》立项与视觉资产` : '新建 AI 漫剧商业立项'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onPromoteCandidate && onDeleteCandidate && (
            <MotionButton
              type="button"
              onClick={() => setIsCandidateVaultOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs sm:text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer tabular-nums"
            >
              <FolderArchive className="w-4 h-4 text-[var(--accent)]" />
              <span>备选计划目录 ({candidates.length})</span>
            </MotionButton>
          )}
          <MotionButton
            type="button"
            onClick={() => setIsConsultantOpen((prev) => !prev)}
            className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              isConsultantOpen
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]'
            }`}
          >
            <MessageSquarePlus className="w-4 h-4 text-[var(--accent)]" />
            <span>{isConsultantOpen ? '收起 AI 立项顾问' : '只有模糊想法？与 AI 探讨立项'}</span>
          </MotionButton>
          <MotionButton
            type="button"
            onClick={handleManualSave}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer"
          >
            保存立项档案
          </MotionButton>
          <MotionButton
            type="button"
            onClick={async () => {
              const proj = buildSnapshotProject();
              await onSaveProject(proj);
              const nextEp = (proj.episodes?.length || 0) + 1;
              onStartEpisodeInWriter(proj, nextEp);
            }}
            className="btn-primary min-h-[44px] px-5 py-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Film className="w-4 h-4" />
            <span>保存并进入剧本台</span>
          </MotionButton>
        </div>
      </section>

      {isConsultantOpen && (
        <DramaIdeaConsultant
          configs={configs}
          uiSettings={uiSettings}
          mode="setup"
          existingProjectId={currentProject?.id}
          existingCreatedAt={currentProject?.createdAt}
          onAutoArchiveCandidates={onAutoArchiveCandidates}
          onConfirmOption={async (adoptedProj) => {
            const adoptedTotalEps = adoptedProj.totalPlannedEpisodes || totalPlannedEpisodes || 60;
            const adoptedBible = normalizeNarrativeBible(adoptedProj.narrativeBible);
            const adoptedLedger = adoptedProj.foreshadowingLedger || [];
            setTitle(adoptedProj.title);
            setTrackId(adoptedProj.trackId);
            setChannel(adoptedProj.channel);
            setVisualStyle(adoptedProj.visualStyle);
            setAspectRatio(adoptedProj.aspectRatio);
            setEpisodeDurationSec(adoptedProj.episodeDurationSec || 90);
            setTotalPlannedEpisodes(adoptedTotalEps);
            setTotalEpisodesReason(adoptedProj.totalEpisodesReason || '');
            setPaywallEpisodeIndex(adoptedProj.paywallEpisodeIndex);
            setLogline(adoptedProj.logline);
            setTargetAudience(adoptedProj.targetAudience);
            setGolden3SecHook(adoptedProj.golden3SecHook);
            setSynopsis(adoptedProj.synopsis);
            if (hasPopulatedNarrativeBible(adoptedBible)) {
              setNarrativeBible(adoptedBible);
            }
            if (adoptedLedger.length > 0) {
              setForeshadowingLedger(adoptedLedger);
            }
            if (adoptedProj.characterAssets.length > 0) {
              setCharacterAssets(adoptedProj.characterAssets);
            }
            const mergedProj: DramaProject = {
              ...adoptedProj,
              preferredScriptFormat,
              episodeDurationSec: adoptedProj.episodeDurationSec || episodeDurationSec || 90,
              totalPlannedEpisodes: adoptedTotalEps,
              totalEpisodesReason: adoptedProj.totalEpisodesReason,
              narrativeBible: hasPopulatedNarrativeBible(adoptedBible) ? adoptedBible : narrativeBible,
              foreshadowingLedger: adoptedLedger.length > 0 ? adoptedLedger : foreshadowingLedger,
              episodes: currentProject?.episodes || [],
              sourceNovelId: currentProject?.sourceNovelId,
            };
            await onSaveProject(mergedProj);
            setIsConsultantOpen(false);
            setStatusMsg({
              type: 'success',
              text: `已确认选用《${adoptedProj.title}》方案（${adoptedProj.aspectRatio} · 单集 ${mergedProj.episodeDurationSec}s · 共 ${adoptedTotalEps} 集），自动载入叙事圣经、${adoptedProj.characterAssets.length} 位角色立绘与 ${mergedProj.foreshadowingLedger?.length || 0} 项核心伏笔！可点击下方按钮一键提取场景锚点与前 12 集细纲。`,
            });
            triggerQuickToast(`《${adoptedProj.title}》已自动填入立项档案`);
          }}
        />
      )}

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium border ${
            statusMsg.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'studio-muted border-[var(--border-subtle)] text-[var(--text-secondary)]'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Part 1: Commercial Specs & Synopsis */}
      <section className="studio-card p-5 sm:p-7 space-y-5">
        <h2 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3">
          一、商业漫剧规格与默认甲方剧本流派
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">漫剧剧名 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：零下七十度：我的百亿安全屋寸步不让"
              className="studio-input w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">绑定热门赛道</label>
            <select
              value={trackId}
              onChange={(e) => handleTrackSelect(e.target.value)}
              className="studio-input w-full min-h-[42px] px-3 py-2 text-xs"
            >
              {HOT_DRAMA_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.channel} · {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">默认文学剧本规范</label>
            <select
              value={preferredScriptFormat}
              onChange={(e) => setPreferredScriptFormat(e.target.value as DramaScriptFormat)}
              className="studio-input w-full min-h-[42px] px-3 py-2 text-xs font-medium"
            >
              {DRAMA_SCRIPT_FORMATS.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">全局统一 AI 画风</label>
            <select
              value={visualStyle}
              onChange={(e) => setVisualStyle(e.target.value as DramaVisualStyle)}
              className="studio-input w-full min-h-[42px] px-3 py-2 text-xs"
            >
              {VISUAL_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">成片画幅比例</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as DramaAspectRatio)}
              className="studio-input w-full min-h-[42px] px-3 py-2 text-xs"
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">规划总集数</label>
            <input
              type="number"
              min={6}
              max={200}
              value={totalPlannedEpisodes}
              onChange={(e) => setTotalPlannedEpisodes(Number(e.target.value) || 60)}
              className="studio-input w-full min-h-[42px] px-3.5 py-2 text-xs tabular-nums"
            />
            {totalEpisodesReason && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)] leading-snug line-clamp-2" title={totalEpisodesReason}>
                AI测算：{totalEpisodesReason}
              </p>
            )}
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">核心付费卡点集（第10-12集）</label>
            <input
              type="number"
              min={3}
              max={50}
              value={paywallEpisodeIndex}
              onChange={(e) => setPaywallEpisodeIndex(Number(e.target.value) || 10)}
              className="studio-input w-full min-h-[42px] px-3.5 py-2 text-xs tabular-nums"
            />
          </div>
        </div>

        {/* Per-Episode Duration Setting Coupled with Script Target Word Count */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
              <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>单集时长设定（与单集剧本创作字数、场次规模及分镜数自动强挂钩）</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[var(--text-muted)] whitespace-nowrap">自定义秒数：</label>
              <input
                type="number"
                min={45}
                max={480}
                step={5}
                value={episodeDurationSec}
                onChange={(e) => setEpisodeDurationSec(Number(e.target.value) || 90)}
                onBlur={() =>
                  setEpisodeDurationSec((prev) =>
                    Math.max(45, Math.min(480, Math.round(Number(prev) || 90)))
                  )
                }
                className="studio-input w-22 min-h-[36px] px-2.5 py-1 text-xs font-semibold tabular-nums text-center"
              />
              <span className="text-[var(--text-muted)]">秒/集</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {DRAMA_DURATION_PRESETS.map((preset) => {
              const active = episodeDurationSec === preset.sec;
              return (
                <button
                  key={preset.sec}
                  type="button"
                  onClick={() => setEpisodeDurationSec(preset.sec)}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer space-y-0.5 ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="font-bold text-xs tabular-nums text-[var(--text-primary)]">
                    {preset.title}
                  </div>
                  <div className="text-[11px] tabular-nums text-[var(--text-muted)]">
                    {preset.badge}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-[11px] sm:text-xs text-[var(--text-secondary)] tabular-nums">
            <span className="font-semibold text-[var(--accent)]">
              当前时长-字数联动标准：
            </span>
            <span>
              单集 <strong>{setupDurSpec.durationSec} 秒</strong>（{setupDurSpec.label}）
            </span>
            <span aria-hidden="true">·</span>
            <span>
              剧本正文目标 <strong>{setupDurSpec.minWords} ~ {setupDurSpec.maxWords} 字</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{setupDurSpec.sceneRange}</span>
            <span aria-hidden="true">·</span>
            <span>{setupDurSpec.beatRange}</span>
            <span aria-hidden="true">·</span>
            <span>建议拆解 {setupDurSpec.recommendedShots} 镜</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">一句话商业卖点 (Logline)</label>
            <textarea
              rows={2}
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              placeholder="用一句话点明主角极致处境反差与核心爽点..."
              className="studio-input w-full p-3 text-xs leading-relaxed"
            />
          </div>
          <div>
            <label className="block mb-1.5 font-medium text-[var(--text-secondary)]">⚡ 开篇第 1 集黄金前 3 秒生死钩子</label>
            <textarea
              rows={2}
              value={golden3SecHook}
              onChange={(e) => setGolden3SecHook(e.target.value)}
              placeholder="前3秒必须出现的视觉奇观、极端冲突或倒计时画面..."
              className="studio-input w-full p-3 text-xs leading-relaxed"
            />
          </div>
        </div>

        <div className="text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
            <label className="font-medium text-[var(--text-secondary)]">
              全剧商业三阶段大纲（免费留存期 → 付费卡点大钩子 → 主线高潮）*
            </label>
            <MotionButton
              type="button"
              disabled={isExtracting}
              onClick={handleAiExtractAssetsAndBeats}
              className="btn-primary min-h-[38px] px-4 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在生成立绘资产与分集表...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 一键提取角色固定立绘词 + 分集卡点目录</span>
                </>
              )}
            </MotionButton>
          </div>
          <textarea
            rows={5}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="输入故事主线梗概，然后点击右上角「AI 一键提取角色固定立绘词 + 分集卡点目录」..."
            className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed"
          />
          {isExtracting && extractStreamText && (
            <div className="mt-3 p-3.5 rounded-xl studio-muted space-y-2">
              <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                <div className="h-full w-1/2 bg-[var(--accent)] rounded-full animate-shimmer-sweep" />
              </div>
              <p className="text-[11px] font-mono text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
                {extractStreamText}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Part 2: Comprehensive Narrative Architecture Bible + Character Visual Lock + Foreshadowing & Props Ledger */}
      <section className="studio-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>二、全剧叙事架构圣经 · 角色固定立绘 · 伏笔关键道具台账</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              集齐「故事线 · 主支线 · 分幕框架 · 波浪节奏 · 世界观底层铁律 · 角色弧光 · 伏笔道具台账」，作为跨 60~120 集长篇连载的第一层防跑偏总纲。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <MotionButton
              type="button"
              disabled={isGeneratingBible || isExtracting}
              onClick={handleAiGenerateNarrativeBible}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isGeneratingBible ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                  <span>正在推演叙事圣经...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>AI 推演补全叙事圣经与伏笔台账</span>
                </>
              )}
            </MotionButton>
          </div>
        </div>

        {isGeneratingBible && bibleStreamText && (
          <div className="p-3.5 rounded-xl studio-muted space-y-2">
            <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div className="h-full w-1/2 bg-[var(--accent)] rounded-full animate-shimmer-sweep" />
            </div>
            <p className="text-[11px] font-mono text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
              {bibleStreamText}
            </p>
          </div>
        )}

        {/* Segmented Tabs for Narrative Architecture, Characters, and Foreshadowing Ledger */}
        <div className="flex flex-wrap items-center gap-1 p-1 studio-muted rounded-xl">
          {[
            { id: 'plotlines', label: '① 故事线 · 主线 · 支线' },
            { id: 'structure', label: '② 框架结构 · 剧情节奏 · 铁律弧光' },
            { id: 'characters', label: `③ 角色固定立绘词 (${characterAssets.length})` },
            { id: 'foreshadow', label: `④ 角色伏笔与关键道具 (${foreshadowingLedger.length})` },
          ].map((tab) => {
            const active = activeBibleTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveBibleTab(tab.id as typeof activeBibleTab)}
                className={`relative min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors tabular-nums ${
                  active ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="drama-bible-subtab"
                    transition={SPRING_INDICATOR}
                    className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Storyline, Main Plotline, Sub-Plotlines */}
        {activeBibleTab === 'plotlines' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                核心故事线与时间轴脉络 (Storyline)
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">
                按时间因果链梳理从开局危机到终局清算的完整事件演进线
              </p>
              <textarea
                rows={6}
                value={narrativeBible.storylineOverview}
                onChange={(e) => updateBibleField('storylineOverview', e.target.value)}
                placeholder="例：倒计时72小时筹备 → 首轮灾难降临 → 前任/仇家上门求收留反遭打脸 → 核心同盟建立 → 幕后财阀黑手浮现 → 终局反杀清算..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                贯穿核心主线 (Main Plotline)
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">
                全剧不可动摇的核心对立矛盾、主角阶段目标与终极爽点闭环
              </p>
              <textarea
                rows={6}
                value={narrativeBible.mainPlotline}
                onChange={(e) => updateBibleField('mainPlotline', e.target.value)}
                placeholder="填写主角贯穿全剧的核心目标、核心阻碍以及最终如何完成身份/命运的彻底逆转..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                高张力情感暗线与副线支线 (Sub-Plotlines)
              </label>
              <p className="text-[11px] text-[var(--text-muted)]">
                双向马甲/救赎情感副线、群像配角成长线、反派内部利益瓦解暗线
              </p>
              <textarea
                rows={6}
                value={narrativeBible.subPlotlines}
                onChange={(e) => updateBibleField('subPlotlines', e.target.value)}
                placeholder="为主线提供中后期续航弹药的 2~3 条支线设计，避免中段剧情单调重复..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* Tab 2: 4-Act Framework Structure, Wave Pacing, World Rules, Character Arcs */}
        {activeBibleTab === 'structure' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                四幕商业框架结构（绑定总集数 {totalPlannedEpisodes} 集与第 {paywallEpisodeIndex} 集付费点）
              </label>
              <textarea
                rows={4}
                value={narrativeBible.frameworkStructure}
                onChange={(e) => updateBibleField('frameworkStructure', e.target.value)}
                placeholder={`第一幕（1-${Math.max(2, paywallEpisodeIndex - 1)}集）引流强留存 → 第二幕（${paywallEpisodeIndex}-${paywallEpisodeIndex + 12}集）首轮付费破局与身份揭秘 → 第三幕升级博弈 → 第四幕终局真相引爆...`}
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                剧情节奏与波浪卡点法则（单集 {setupDurSpec.durationSec}s 微节奏 + 跨集波浪）
              </label>
              <textarea
                rows={4}
                value={narrativeBible.pacingStrategy}
                onChange={(e) => updateBibleField('pacingStrategy', e.target.value)}
                placeholder="单集前3秒抛冲突、中段两次反转拉扯、集末断章悬念；跨集每3集一小爽点兑现、每8-10集一次大地图或大身份升级..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                世界观底层设定与硬规则铁律（防中后期吃书 / 战力崩坏护栏）
              </label>
              <textarea
                rows={4}
                value={narrativeBible.worldSettingAndRules}
                onChange={(e) => updateBibleField('worldSettingAndRules', e.target.value)}
                placeholder="锁定系统/金手指使用代价、豪门契约核心条款、规则怪谈底层真相等硬约束，AI 写到第 50+ 集时也会严格遵守..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[var(--text-primary)]">
                角色成长弧光与阶段性人物关系拉扯网
              </label>
              <textarea
                rows={4}
                value={narrativeBible.characterArcsAndRelations}
                onChange={(e) => updateBibleField('characterArcsAndRelations', e.target.value)}
                placeholder="梳理男女主及核心反派在前、中、后期的心态转变与信任/对立关系递进节点..."
                className="studio-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* Tab 3: Character Visual Consistency Lock Cards */}
        {activeBibleTab === 'characters' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--text-muted)]">
                上游写 △ 文学剧本时只保留人物姓名与性格口吻（绝不啰嗦复读外貌）；下游拆解 AI 分镜单时才会自动织入这些固定立绘词。支持右键卡片快捷复制。
              </p>
              <MotionButton
                type="button"
                onClick={addBlankCharacter}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1 hover:bg-[var(--bg-muted)] cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手动添加角色</span>
              </MotionButton>
            </div>

            {characterAssets.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
                暂未锁定角色立绘资产。填写上方大纲后点击「AI 一键提取角色固定立绘词 + 分集卡点目录」，系统将自动生成中英双语生图固定词。
              </p>
            ) : (
              <StaggerList className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {characterAssets.map((char) => (
                  <StaggerItem
                    key={char.id}
                    onContextMenu={(e) =>
                      openContextMenu(
                        e,
                        [
                          {
                            id: 'copy-zh',
                            label: '复制中文立绘固定词',
                            icon: <Copy className="w-3.5 h-3.5" />,
                            onSelect: () =>
                              copyText(`zh-${char.id}`, char.appearanceZh, `已复制「${char.name}」中文立绘词`),
                          },
                          {
                            id: 'copy-en',
                            label: '复制英文 MJ/Runway Tag',
                            icon: <Copy className="w-3.5 h-3.5" />,
                            onSelect: () =>
                              copyText(`en-${char.id}`, char.visualPromptEn, `已复制「${char.name}」英文 Tag`),
                          },
                          {
                            id: 'copy-voice',
                            label: '复制 TTS 配音音色指导',
                            icon: <FileText className="w-3.5 h-3.5" />,
                            onSelect: () =>
                              copyText(`vo-${char.id}`, char.voicePersona, `已复制「${char.name}」配音指导`),
                          },
                          {
                            id: 'del-char',
                            label: '删除该角色立绘卡',
                            icon: <Trash2 className="w-3.5 h-3.5" />,
                            danger: true,
                            dividerBefore: true,
                            onSelect: () =>
                              setCharacterAssets((prev) => prev.filter((item) => item.id !== char.id)),
                          },
                        ],
                        `角色资产 · ${char.name}`
                      )
                    }
                    className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={char.name}
                          onChange={(e) => updateCharField(char.id, 'name', e.target.value)}
                          className="studio-input px-2.5 py-1.5 font-bold text-sm w-28"
                        />
                        <input
                          type="text"
                          value={char.roleTag}
                          onChange={(e) => updateCharField(char.id, 'roleTag', e.target.value)}
                          className="studio-input px-2.5 py-1.5 text-xs flex-1"
                        />
                      </div>
                      <MotionButton
                        type="button"
                        onClick={() => setCharacterAssets((prev) => prev.filter((item) => item.id !== char.id))}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </MotionButton>
                    </div>

                    <div>
                      <label className="block mb-1 text-[var(--text-muted)]">人设与年龄定位</label>
                      <input
                        type="text"
                        value={char.ageAndArchetype}
                        onChange={(e) => updateCharField(char.id, 'ageAndArchetype', e.target.value)}
                        className="studio-input w-full px-3 py-1.5 text-xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[var(--text-muted)]">中文立绘固定词（即梦 / 可灵垫图与描述）</label>
                        <button
                          type="button"
                          onClick={() => copyText(`zh-${char.id}`, char.appearanceZh)}
                          className="text-[11px] text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `zh-${char.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>复制</span>
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={char.appearanceZh}
                        onChange={(e) => updateCharField(char.id, 'appearanceZh', e.target.value)}
                        className="studio-input w-full p-2.5 text-xs leading-relaxed"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[var(--text-muted)]">英文一致性生图 Tag（Midjourney / Runway）</label>
                        <button
                          type="button"
                          onClick={() => copyText(`en-${char.id}`, char.visualPromptEn)}
                          className="text-[11px] text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `en-${char.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>复制 Tag</span>
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={char.visualPromptEn}
                        onChange={(e) => updateCharField(char.id, 'visualPromptEn', e.target.value)}
                        className="studio-input w-full p-2.5 font-mono text-[11px] leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1 text-[var(--text-muted)]">TTS 配音音色指导</label>
                        <input
                          type="text"
                          value={char.voicePersona}
                          onChange={(e) => updateCharField(char.id, 'voicePersona', e.target.value)}
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-[var(--text-muted)]">标志性道具 / 镜头动作</label>
                        <input
                          type="text"
                          value={char.signatureTrait}
                          onChange={(e) => updateCharField(char.id, 'signatureTrait', e.target.value)}
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </div>
        )}

        {/* Tab 4: Structured Character Foreshadowing & Key Props Tracking Ledger */}
        {activeBibleTab === 'foreshadow' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--text-muted)]">
                每一项「未回收/发酵中」的角色伏笔与关键道具都会在后续每一集剧本生成时自动注入 AI 第三层长篇记忆，直到正式回收兑现，彻底杜绝写长后漏收伏笔！
              </p>
              <MotionButton
                type="button"
                onClick={addBlankForeshadowItem}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1 hover:bg-[var(--bg-muted)] cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增伏笔 / 关键道具</span>
              </MotionButton>
            </div>

            {foreshadowingLedger.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
                暂无伏笔与关键道具台账。可点击右上角「AI 推演补全叙事圣经与伏笔台账」自动规划，或在生成单集剧本时由系统自动捕获新埋伏笔。
              </p>
            ) : (
              <StaggerList className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {foreshadowingLedger.map((item) => {
                  const isResolved = item.status === 'resolved';
                  return (
                    <StaggerItem
                      key={item.id}
                      className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                        isResolved
                          ? 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/45 opacity-80'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateForeshadowField(item.id, 'name', e.target.value)}
                            placeholder="关键道具或伏笔名"
                            className="studio-input px-2.5 py-1.5 font-bold text-xs flex-1"
                          />
                          <select
                            value={item.category}
                            onChange={(e) =>
                              updateForeshadowField(
                                item.id,
                                'category',
                                e.target.value as DramaForeshadowCategory
                              )
                            }
                            className="studio-input px-2 py-1.5 text-xs"
                          >
                            <option value="关键道具">关键道具</option>
                            <option value="身世/人物伏笔">身世/人物伏笔</option>
                            <option value="核心剧情暗线">核心剧情暗线</option>
                            <option value="规则/契约死穴">规则/契约死穴</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <select
                            value={item.status}
                            onChange={(e) => {
                              const nextStat = e.target.value as DramaForeshadowStatus;
                              setForeshadowingLedger((prev) =>
                                prev.map((f) =>
                                  f.id === item.id
                                    ? {
                                        ...f,
                                        status: nextStat,
                                        resolvedEpisode:
                                          nextStat === 'resolved'
                                            ? f.resolvedEpisode || maxPlannedEpisodeIndex || 1
                                            : undefined,
                                      }
                                    : f
                                )
                              );
                            }}
                            className={`studio-input px-2 py-1 text-[11px] font-semibold ${
                              isResolved
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : item.status === 'fermenting'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--accent)]'
                            }`}
                          >
                            <option value="planted">待回收</option>
                            <option value="fermenting">中期发酵中</option>
                            <option value="resolved">✓ 已回收兑现</option>
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setForeshadowingLedger((prev) => prev.filter((f) => f.id !== item.id))
                            }
                            className="min-h-[30px] min-w-[30px] flex items-center justify-center text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block mb-1 text-[11px] text-[var(--text-muted)]">关联角色/关系</label>
                          <input
                            type="text"
                            value={item.ownerOrRelation}
                            onChange={(e) =>
                              updateForeshadowField(item.id, 'ownerOrRelation', e.target.value)
                            }
                            placeholder="如：苏晚 ↔ 陆执"
                            className="studio-input w-full px-2.5 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-[11px] text-[var(--text-muted)]">埋设集数</label>
                          <input
                            type="number"
                            min={1}
                            max={300}
                            value={item.plantedEpisode}
                            onChange={(e) =>
                              updateForeshadowField(
                                item.id,
                                'plantedEpisode',
                                Math.max(1, Number(e.target.value) || 1)
                              )
                            }
                            className="studio-input w-full px-2.5 py-1 text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-[11px] text-[var(--text-muted)]">计划回收节点</label>
                          <input
                            type="text"
                            value={item.expectedPayoffEpisode || ''}
                            onChange={(e) =>
                              updateForeshadowField(item.id, 'expectedPayoffEpisode', e.target.value)
                            }
                            placeholder="如：第10集 / 第35集"
                            className="studio-input w-full px-2.5 py-1 text-xs tabular-nums"
                          />
                        </div>
                      </div>

                      <input
                        type="text"
                        value={item.visualAnchorNote || ''}
                        onChange={(e) =>
                          updateForeshadowField(item.id, 'visualAnchorNote', e.target.value)
                        }
                        placeholder="道具固定视觉特征（供生图锁死外观，如：裂纹银色定制耳返，内侧刻缩写 S.W）..."
                        className="studio-input w-full px-2.5 py-1.5 text-xs"
                      />

                      <textarea
                        rows={2}
                        value={item.payoffNote || ''}
                        onChange={(e) => updateForeshadowField(item.id, 'payoffNote', e.target.value)}
                        placeholder="推进发酵与最终反转回收方式说明..."
                        className="studio-input w-full p-2 text-xs leading-relaxed"
                      />
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            )}
          </div>
        )}
      </section>

      {/* Part 3: Auto-Populated, State-Aware Core Scene Anchors & Planned Episode Paywall Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 studio-card p-5 sm:p-6 space-y-4">
          <div className="space-y-2 border-b border-[var(--border-subtle)] pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 tabular-nums">
                <MapPin className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span>三、核心场景视觉锚点 ({sceneAnchors.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <MotionButton
                  type="button"
                  disabled={isSyncingScenes}
                  onClick={handleSyncScenesFromOutlineAndScripts}
                  title="扫描右侧分集细纲与所有已写剧本，自动补齐新增场景及同场景不同状态（重复同态场景不重复填入）"
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isSyncingScenes ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                  ) : (
                    <RefreshCw className="w-3 h-3 text-[var(--accent)]" />
                  )}
                  <span>从细纲/剧本同步</span>
                </MotionButton>

                <MotionButton
                  type="button"
                  onClick={() =>
                    setSceneAnchors((prev) => [
                      ...prev,
                      {
                        id: generateUUID(),
                        sceneName: '新场景',
                        stateVariant: '常规态',
                        sourceRef: '手动添加',
                        lightingAndMood: '高反差冷暖光影',
                        visualPromptZh: '',
                        visualPromptEn: '',
                      },
                    ])
                  }
                  className="text-xs font-medium text-[var(--accent)] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>手动新增</span>
                </MotionButton>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              细纲提取、续写或每集剧本生成后<strong>自动归档填入</strong>：重复场景绝不重复堆砌；<strong>同一场景不同状态</strong>（如「练习室 · 常规日间态」与「练习室 · 暴雨停电应急灯态」）自动独立建档。
            </p>
          </div>

          {sceneAnchors.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
              提取细纲或生成任意一集剧本后，核心场景与同场景不同状态将自动归档至此。也可点击上方「从细纲/剧本同步」。
            </p>
          ) : (
            <StaggerList className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {sceneAnchors.map((sc) => (
                <StaggerItem
                  key={sc.id}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        {
                          id: 'copy-scene-zh',
                          label: '复制中文场景视觉锚点词',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () =>
                            copyText(
                              `sc-zh-${sc.id}`,
                              sc.visualPromptZh,
                              `已复制「${sc.sceneName}（${sc.stateVariant || '常规态'}）」场景词`
                            ),
                        },
                        {
                          id: 'fork-scene-variant',
                          label: '衍生「同一场景 · 新状态」锚点卡',
                          icon: <Plus className="w-3.5 h-3.5" />,
                          onSelect: () =>
                            setSceneAnchors((prev) => [
                              ...prev,
                              {
                                id: generateUUID(),
                                sceneName: sc.sceneName,
                                stateVariant: '新状态变体（如：夜晚停电/损毁态）',
                                sourceRef: '同场景异态衍生',
                                lightingAndMood: sc.lightingAndMood,
                                visualPromptZh: sc.visualPromptZh,
                                visualPromptEn: sc.visualPromptEn,
                              },
                            ]),
                        },
                        {
                          id: 'del-scene',
                          label: '删除此场景状态锚点',
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          dividerBefore: true,
                          onSelect: () =>
                            setSceneAnchors((prev) => prev.filter((item) => item.id !== sc.id)),
                        },
                      ],
                      `${sc.sceneName} · ${sc.stateVariant || '常规态'}`
                    )
                  }
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/45 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={sc.sceneName}
                      onChange={(e) =>
                        setSceneAnchors((prev) =>
                          prev.map((item) =>
                            item.id === sc.id ? { ...item, sceneName: e.target.value } : item
                          )
                        )
                      }
                      placeholder="场景名称（如：星耀演播厅）"
                      className="studio-input px-2.5 py-1 font-semibold flex-1 min-w-0"
                    />
                    <input
                      type="text"
                      value={sc.stateVariant || ''}
                      onChange={(e) =>
                        setSceneAnchors((prev) =>
                          prev.map((item) =>
                            item.id === sc.id ? { ...item, stateVariant: e.target.value } : item
                          )
                        )
                      }
                      placeholder="状态（如：常规态/暴雨断电态）"
                      title="同一场景不同状态标记：相同场景同状态自动去重，不同状态独立保留"
                      className="studio-input px-2 py-1 text-[11px] font-medium text-[var(--accent)] w-34 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSceneAnchors((prev) => prev.filter((item) => item.id !== sc.id))
                      }
                      className="text-[var(--text-muted)] hover:text-rose-600 p-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="truncate">
                      {sc.sourceRef ? `来源：${sc.sourceRef}` : '核心主场景锚点'}
                      {sc.lightingAndMood ? ` · ${sc.lightingAndMood}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText(`sc-zh-${sc.id}`, sc.visualPromptZh)}
                      className="text-[var(--accent)] font-medium shrink-0 cursor-pointer"
                    >
                      {copiedKey === `sc-zh-${sc.id}` ? '已复制' : '复制场景词'}
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={sc.visualPromptZh}
                    onChange={(e) =>
                      setSceneAnchors((prev) =>
                        prev.map((item) =>
                          item.id === sc.id ? { ...item, visualPromptZh: e.target.value } : item
                        )
                      )
                    }
                    placeholder="中文固定场景布景与光影描述（纯空镜锚点，供下游分镜生图自动对齐）..."
                    className="studio-input w-full p-2 text-xs leading-relaxed"
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </section>

        <section className="lg:col-span-7 studio-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 tabular-nums">
                <Flame className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span>
                  商业分集节拍与付费卡点规划（已规划 {episodePlan.length} / {totalPlannedEpisodes} 集）
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                首次生成前 12 集细纲后，可在下方自由输入/选择后续集数区间（如 13~24 集）继续生成，AI 会自动回溯前序伏笔、关键道具与核心剧情。
              </p>
            </div>
            <MotionButton
              type="button"
              onClick={handleAddManualEpisodePlanItem}
              className="min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>手动新增一集</span>
            </MotionButton>
          </div>

          {/* Preceding Episodes Continuity & Key Prop Audit Report */}
          {continuityAuditLog && (
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsAuditExpanded((v) => !v)}
                  className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer text-left"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>AI 前序集数伏笔、关键道具与剧情衔接审阅报告</span>
                  {isAuditExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                </button>
              </div>
              {isAuditExpanded && (
                <p className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                  {continuityAuditLog}
                </p>
              )}
            </div>
          )}

          {episodePlan.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center studio-muted">
              点击上方「AI 一键提取角色固定立绘词 + 分集卡点目录」自动生成前 12 集起承转合，或直接在下方指定集数区间生成分集剧本细纲。
            </p>
          ) : (
            <StaggerList className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {episodePlan.map((ep) => {
                const isPaywall = ep.hookType === '核心付费卡点' || ep.episodeIndex === paywallEpisodeIndex;
                const alreadyShot = currentProject?.episodes?.some((e) => e.index === ep.episodeIndex);
                const isEditingEp = editingPlanEpIdx === ep.episodeIndex;
                const fullPresetBeat = `${ep.title}：${ep.beatSummary}${
                  ep.foreshadowingOrProps ? `（本集关键道具/伏笔要求：${ep.foreshadowingOrProps}）` : ''
                }`;

                return (
                  <StaggerItem
                    key={ep.episodeIndex}
                    onContextMenu={(e) =>
                      openContextMenu(
                        e,
                        [
                          {
                            id: 'shoot-ep',
                            label: alreadyShot ? `打开第 ${ep.episodeIndex} 集剧本` : `立即执笔第 ${ep.episodeIndex} 集剧本`,
                            icon: <Film className="w-3.5 h-3.5" />,
                            onSelect: async () => {
                              const proj = buildSnapshotProject();
                              await onSaveProject(proj);
                              onStartEpisodeInWriter(proj, ep.episodeIndex, fullPresetBeat);
                            },
                          },
                          {
                            id: 'edit-ep-plan',
                            label: isEditingEp ? '完成细纲微调' : '手动编辑本集细纲与伏笔',
                            icon: <Edit3 className="w-3.5 h-3.5" />,
                            onSelect: () => setEditingPlanEpIdx(isEditingEp ? null : ep.episodeIndex),
                          },
                          {
                            id: 'copy-beat',
                            label: '复制本集剧情节拍梗概',
                            icon: <Copy className="w-3.5 h-3.5" />,
                            onSelect: () =>
                              copyText(
                                `beat-${ep.episodeIndex}`,
                                `第${ep.episodeIndex}集《${ep.title}》：${ep.beatSummary}${
                                  ep.foreshadowingOrProps ? `\n伏笔/关键道具：${ep.foreshadowingOrProps}` : ''
                                }`
                              ),
                          },
                          {
                            id: 'set-paywall',
                            label: `将第 ${ep.episodeIndex} 集设为付费卡点`,
                            icon: <Flame className="w-3.5 h-3.5" />,
                            onSelect: () => {
                              setPaywallEpisodeIndex(ep.episodeIndex);
                              triggerQuickToast(`已将第 ${ep.episodeIndex} 集设为付费卡点`);
                            },
                          },
                          {
                            id: 'del-ep-plan',
                            label: `移除第 ${ep.episodeIndex} 集细纲`,
                            icon: <Trash2 className="w-3.5 h-3.5" />,
                            danger: true,
                            dividerBefore: true,
                            onSelect: () =>
                              setEpisodePlan((prev) =>
                                prev.filter((item) => item.episodeIndex !== ep.episodeIndex)
                              ),
                          },
                        ],
                        `分集大纲 · 第 ${ep.episodeIndex} 集`
                      )
                    }
                    className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                      isPaywall
                        ? 'border-amber-500/45 bg-amber-500/5'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                    }`}
                  >
                    {isEditingEp ? (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                            <span className="font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                              第 {ep.episodeIndex} 集
                            </span>
                            <input
                              type="text"
                              value={ep.title}
                              onChange={(e) =>
                                updateEpisodePlanItem(ep.episodeIndex, { title: e.target.value })
                              }
                              placeholder="单集标题"
                              className="studio-input px-2.5 py-1 text-xs font-semibold flex-1"
                            />
                            <select
                              value={ep.hookType}
                              onChange={(e) =>
                                updateEpisodePlanItem(ep.episodeIndex, {
                                  hookType: e.target.value as DramaEpisodePlanItem['hookType'],
                                })
                              }
                              className="studio-input px-2 py-1 text-xs"
                            >
                              <option value="免费强留存">免费强留存</option>
                              <option value="小高潮爽点">小高潮爽点</option>
                              <option value="核心付费卡点">核心付费卡点</option>
                              <option value="反转高潮">反转高潮</option>
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingPlanEpIdx(null)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] font-semibold text-xs cursor-pointer"
                          >
                            完成
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={ep.beatSummary}
                          onChange={(e) =>
                            updateEpisodePlanItem(ep.episodeIndex, { beatSummary: e.target.value })
                          }
                          placeholder="本集核心冲突推进与集末断章悬念..."
                          className="studio-input w-full p-2 text-xs leading-relaxed"
                        />
                        <input
                          type="text"
                          value={ep.foreshadowingOrProps || ''}
                          onChange={(e) =>
                            updateEpisodePlanItem(ep.episodeIndex, {
                              foreshadowingOrProps: e.target.value,
                            })
                          }
                          placeholder="本集埋设或回收的伏笔 / 关键道具（如：回收第3集旧乐谱伏笔）..."
                          className="studio-input w-full px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold tabular-nums text-[var(--text-primary)]">
                              第 {ep.episodeIndex} 集 · {ep.title}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                isPaywall ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {isPaywall ? '🔥 核心付费卡点' : ep.hookType}
                            </span>
                            {alreadyShot && (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ 已出本
                              </span>
                            )}
                          </div>
                          <p className="text-[var(--text-secondary)] leading-relaxed">{ep.beatSummary}</p>
                          {ep.foreshadowingOrProps && (
                            <p className="text-[11px] text-[var(--accent)] font-medium leading-relaxed">
                              🗝️ 伏笔/关键道具：{ep.foreshadowingOrProps}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingPlanEpIdx(ep.episodeIndex)}
                            title="微调本集细纲与伏笔道具"
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <MotionButton
                            type="button"
                            onClick={async () => {
                              const proj = buildSnapshotProject();
                              await onSaveProject(proj);
                              onStartEpisodeInWriter(proj, ep.episodeIndex, fullPresetBeat);
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {alreadyShot ? '查看剧本' : '写此集 →'}
                          </MotionButton>
                        </div>
                      </div>
                    )}
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}

          {/* Rolling Continuation Control Panel for Episode X - Y Beat Outlines */}
          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <div className="p-4 rounded-2xl studio-muted space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>继续生成后续分集剧本细纲（自动重审前序伏笔、关键道具与剧情推进）</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    支持自由指定需续写或重排的集数范围（单次建议 6~20 集），AI 将先审阅第 1~{Math.max(1, continueStartEp - 1)} 集的伏笔道具再顺延生成。
                  </p>
                </div>
              </div>

              {/* Quick Range Presets + Custom Start/End Episode Inputs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] tabular-nums">
                  <span className="text-[var(--text-muted)]">第</span>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    disabled={isContinuingPlan}
                    value={continueStartEp}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setContinueStartEp(val);
                      if (continueEndEp < val) setContinueEndEp(val + 11);
                    }}
                    className="studio-input w-14 px-2 py-1 text-center font-bold text-xs tabular-nums"
                  />
                  <span className="text-[var(--text-muted)]">集 至 第</span>
                  <input
                    type="number"
                    min={continueStartEp}
                    max={300}
                    disabled={isContinuingPlan}
                    value={continueEndEp}
                    onChange={(e) =>
                      setContinueEndEp(Math.max(continueStartEp, Number(e.target.value) || continueStartEp))
                    }
                    className="studio-input w-14 px-2 py-1 text-center font-bold text-xs tabular-nums"
                  />
                  <span className="text-[var(--text-muted)]">
                    集（共 {Math.max(1, continueEndEp - continueStartEp + 1)} 集）
                  </span>
                </div>

                {[8, 12, 16].map((span) => {
                  const baseStart = maxPlannedEpisodeIndex + 1;
                  const targetEnd = baseStart + span - 1;
                  const isCurrentPreset =
                    continueStartEp === baseStart && continueEndEp === targetEnd;
                  return (
                    <button
                      key={span}
                      type="button"
                      disabled={isContinuingPlan}
                      onClick={() => {
                        setContinueStartEp(baseStart);
                        setContinueEndEp(targetEnd);
                      }}
                      className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-[11px] font-medium tabular-nums whitespace-nowrap cursor-pointer transition-colors ${
                        isCurrentPreset
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)]'
                      }`}
                    >
                      顺延 +{span} 集 ({baseStart}~{targetEnd})
                    </button>
                  );
                })}

                {totalPlannedEpisodes > maxPlannedEpisodeIndex &&
                  totalPlannedEpisodes - maxPlannedEpisodeIndex <= 20 && (
                    <button
                      type="button"
                      disabled={isContinuingPlan}
                      onClick={() => {
                        setContinueStartEp(maxPlannedEpisodeIndex + 1);
                        setContinueEndEp(totalPlannedEpisodes);
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-[11px] font-medium text-[var(--accent)] tabular-nums whitespace-nowrap cursor-pointer"
                    >
                      补齐至总规划第 {totalPlannedEpisodes} 集
                    </button>
                  )}
              </div>

              <input
                type="text"
                disabled={isContinuingPlan}
                value={continueArcHint}
                onChange={(e) => setContinueArcHint(e.target.value)}
                placeholder="选填：本阶段剧情走向或指定想回收的前序伏笔/关键道具（留空则由 AI 自动回溯前文伏笔与总大纲推进）..."
                className="studio-input w-full min-h-[38px] px-3 py-2 text-xs bg-[var(--bg-surface)]"
              />

              {isContinuingPlan && continueStreamText && (
                <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                  <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                    <div className="h-full w-1/2 bg-[var(--accent)] rounded-full animate-shimmer-sweep" />
                  </div>
                  <p className="text-[11px] font-mono text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
                    {continueStreamText}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end">
                <MotionButton
                  type="button"
                  disabled={isContinuingPlan || isExtracting}
                  onClick={handleAiContinueEpisodePlan}
                  className="btn-primary min-h-[42px] px-5 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60 tabular-nums"
                >
                  {isContinuingPlan ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        正在审阅前序伏笔并生成第 {continueStartEp}-{continueEndEp} 集细纲...
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        继续生成第 {continueStartEp} - {continueEndEp} 集剧本细纲
                      </span>
                    </>
                  )}
                </MotionButton>
              </div>
            </div>
          </div>
        </section>
      </div>

      {onPromoteCandidate && onDeleteCandidate && (
        <DramaCandidateVaultModal
          isOpen={isCandidateVaultOpen}
          onClose={() => setIsCandidateVaultOpen(false)}
          candidates={candidates}
          onPromoteCandidate={onPromoteCandidate}
          onDeleteCandidate={onDeleteCandidate}
        />
      )}
    </div>
  );
};

// ============================================================================
// 2. 双层漫剧工作台：上游「甲方标准文学剧本(△本)」 ↔ 下游「AI 分镜拆解单」
// ============================================================================

interface DramaWriterViewProps {
  currentProject: DramaProject | null;
  targetEpisodeIndex: number;
  setTargetEpisodeIndex: (idx: number) => void;
  presetDirectorBeat?: string;
  clearPresetDirectorBeat?: () => void;
  books: Book[];
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onSaveProject: (project: DramaProject) => Promise<void>;
  onGoToDramaSetup: () => void;
}

export const DramaWriterView: React.FC<DramaWriterViewProps> = ({
  currentProject,
  targetEpisodeIndex,
  setTargetEpisodeIndex,
  presetDirectorBeat,
  clearPresetDirectorBeat,
  books,
  configs,
  uiSettings,
  onSaveProject,
  onGoToDramaSetup,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  // Default to 'script' (authentic upstream client △ literary script!)
  const [viewMode, setViewMode] = useState<'script' | 'storyboard'>('script');
  const [scriptFormat, setScriptFormat] = useState<DramaScriptFormat>(
    currentProject?.preferredScriptFormat || 'triangle_standard'
  );
  const [isEditingRawScript, setIsEditingRawScript] = useState(false);
  const [draftScriptText, setDraftScriptText] = useState('');
  const [isFormatGuideOpen, setIsFormatGuideOpen] = useState(false);

  const [directorInput, setDirectorInput] = useState('');
  const [targetShotCount, setTargetShotCount] = useState<number>(8);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStageLabel, setGeneratingStageLabel] = useState('');
  const [streamRawText, setStreamRawText] = useState('');
  const [streamProgress, setStreamProgress] = useState(0);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [polishingShotId, setPolishingShotId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);

  // Client Messy Script Import & Wash Modal
  const [isWashModalOpen, setIsWashModalOpen] = useState(false);
  const [messyClientInput, setMessyClientInput] = useState('');
  const [isWashingScript, setIsWashingScript] = useState(false);

  // Mobile Episode Drawer & Novel-to-Drama Adaptation Modal
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string>(books[0]?.id || '');
  const [selectedBookChapterIdx, setSelectedBookChapterIdx] = useState<number>(0);
  const [isMemoryHubOpen, setIsMemoryHubOpen] = useState<boolean>(true);

  useEffect(() => {
    if (currentProject?.preferredScriptFormat) {
      setScriptFormat(currentProject.preferredScriptFormat);
    }
    if (currentProject) {
      const spec = getEpisodeDurationSpec(currentProject.episodeDurationSec);
      setTargetShotCount(spec.recommendedShots);
    }
  }, [currentProject?.id, currentProject?.episodeDurationSec]);

  useEffect(() => {
    if (presetDirectorBeat) {
      setDirectorInput(presetDirectorBeat);
      if (clearPresetDirectorBeat) clearPresetDirectorBeat();
    }
  }, [presetDirectorBeat]);

  const sortedEpisodes = [...(currentProject?.episodes || [])].sort((a, b) => a.index - b.index);
  const activeEpisode: DramaEpisode | undefined = sortedEpisodes.find(
    (e) => e.index === targetEpisodeIndex
  );

  useEffect(() => {
    if (activeEpisode) {
      setDraftScriptText(activeEpisode.rawScriptText || '');
      if (activeEpisode.scriptFormat) {
        setScriptFormat(activeEpisode.scriptFormat);
      }
      setIsEditingRawScript(false);
    }
  }, [activeEpisode?.id, activeEpisode?.updatedAt]);

  if (!currentProject) {
    return (
      <div className="studio-card p-10 sm:p-14 text-center space-y-4 max-w-2xl mx-auto">
        <Film className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
        <h2 className="text-lg font-bold text-[var(--text-primary)]">尚未选择漫剧项目</h2>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
          请先在「漫剧片单」中选择一部剧目，或前往「立项与立绘」创建一部商业漫剧项目。
        </p>
        <MotionButton
          type="button"
          onClick={onGoToDramaSetup}
          className="btn-primary min-h-[44px] px-5 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>前往立项新漫剧</span>
        </MotionButton>
      </div>
    );
  }

  const nextEpisodeNumber =
    sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1].index + 1 : 1;

  const getWriterApi = () => {
    const cfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
    const model = uiSettings.writerApiModel || cfg?.modelsCache?.[0]?.id || 'gemini-3.6-flash';
    return { cfg, model };
  };

  const handleCopy = (id: string, text: string, label = '已复制到剪贴板') => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    triggerQuickToast(label);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleExportEpisodeTxt = (ep: DramaEpisode) => {
    const content = `${ep.title}\n\n${ep.rawScriptText}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${currentProject.title}》_第${ep.index}集标准剧本.txt`;
    a.click();
    URL.revokeObjectURL(url);
    triggerQuickToast(`已导出第 ${ep.index} 集 .txt 标准剧本`);
  };

  /**
   * 上游主流程：仅生成干净极简的「甲方标准文学剧本（△三角本 / 国漫极简音效本 / 出海双语本）」
   */
  const executeGenerateLiteraryScriptOnly = async (
    epNumberToWrite: number,
    customInstruction: string,
    novelSource?: { novelTitle: string; chapterTitle: string; chapterText: string } | null
  ) => {
    const { cfg, model } = getWriterApi();
    if (!cfg) {
      setErrorAlert('未找到可用的 API 线路，请前往「引擎与技能」配置。');
      return;
    }

    setIsGenerating(true);
    const projectDurSpec = getEpisodeDurationSpec(currentProject.episodeDurationSec);
    setGeneratingStageLabel(
      `正在按「${DRAMA_SCRIPT_FORMATS.find((f) => f.id === scriptFormat)?.name}」撰写第 ${epNumberToWrite} 集极简文学剧本（目标 ${projectDurSpec.durationSec} 秒 · ${projectDurSpec.minWords}~${projectDurSpec.maxWords} 字）...`
    );
    setErrorAlert(null);
    setStreamRawText('');
    setStreamProgress(10);
    setTargetEpisodeIndex(epNumberToWrite);
    setViewMode('script');

    const startTime = Date.now();

    try {
      const messages = buildLiteraryScriptMessages({
        project: currentProject,
        episodeIndex: epNumberToWrite,
        scriptFormat,
        directorInstruction: customInstruction,
        sourceNovelChapter: novelSource,
      });

      let fullRaw = '';
      const estChars = projectDurSpec.maxWords + 550;
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.82,
        onChunk: (chunk) => {
          fullRaw += chunk;
          setStreamRawText(fullRaw);
          const pct = Math.min(95, Math.max(12, Math.round((fullRaw.length / estChars) * 100)));
          setStreamProgress(pct);
        },
      });

      const finalRaw = (res.content || fullRaw).trim();
      if (!finalRaw) {
        setErrorAlert('⚠️ 模型本次发生空回，原指令已保留，请直接点击重试！');
        return;
      }

      const isPaywall = epNumberToWrite === currentProject.paywallEpisodeIndex;
      const existingEp = currentProject.episodes.find((e) => e.index === epNumberToWrite);
      const newEpisode = parseLiteraryScriptEpisode(
        finalRaw,
        epNumberToWrite,
        scriptFormat,
        isPaywall,
        existingEp?.shots || [],
        projectDurSpec.durationSec
      );

      if (!newEpisode.rawScriptText.trim()) {
        setErrorAlert('⚠️ 模型返回内容未能解析出有效剧本正文，请重试。');
        return;
      }

      const fmtName = DRAMA_SCRIPT_FORMATS.find((f) => f.id === scriptFormat)?.name || '标准剧本';
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const charCount = newEpisode.rawScriptText.replace(/\s+/g, '').length;
      newEpisode.meta = `格式: ${fmtName} | 单集设定: ${projectDurSpec.durationSec}s (实测 ${charCount} 字) | 模型: ${model} | 耗时 ${elapsedSec}s${
        newEpisode.shots.length > 0 ? ` | 已拆解 ${newEpisode.shots.length} 镜` : ' | 待拆解后期分镜'
      }`;

      const continuitySync = applyEpisodeContinuityUpdates({
        project: currentProject,
        rawModelOutput: finalRaw,
        episode: newEpisode,
      });

      const otherEps = (currentProject.episodes || []).filter((e) => e.index !== epNumberToWrite);
      const updatedProject: DramaProject = {
        ...currentProject,
        preferredScriptFormat: scriptFormat,
        sceneAnchors: continuitySync.sceneAnchors,
        foreshadowingLedger: continuitySync.foreshadowingLedger,
        episodes: [...otherEps, continuitySync.episode].sort((a, b) => a.index - b.index),
        lastModifiedAt: Date.now(),
      };

      await onSaveProject(updatedProject);
      setStreamProgress(100);
      setDirectorInput('');
      const syncNotes: string[] = [];
      if (continuitySync.addedScenesCount > 0) {
        syncNotes.push(`自动归档 ${continuitySync.addedScenesCount} 处新场景/异态锚点`);
      }
      if (continuitySync.updatedForeshadowCount > 0) {
        syncNotes.push(`同步 ${continuitySync.updatedForeshadowCount} 项伏笔道具状态`);
      }
      triggerQuickToast(
        `第 ${epNumberToWrite} 集标准剧本已生成${syncNotes.length ? `（${syncNotes.join('，')}）` : ''}！`
      );
    } catch (err: any) {
      setErrorAlert(`标准剧本生成异常：${err.message || '网络中断'}（指令已保留）`);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 下游拆解流程：由当前已定稿的「甲方标准文学剧本」一键拆解为「AI 漫剧后期生图分镜单」
   */
  const executeBreakdownShotsFromScript = async () => {
    if (!activeEpisode || !activeEpisode.rawScriptText.trim()) {
      setErrorAlert('当前集尚无文学剧本正文，请先撰写或导入标准剧本后再拆解分镜。');
      return;
    }

    const { cfg, model } = getWriterApi();
    if (!cfg) return;

    setIsGenerating(true);
    setGeneratingStageLabel(
      `正在将第 ${activeEpisode.index} 集 △ 文学剧本拆解为 ${targetShotCount} 镜 AI 生图执行单（自动融合角色立绘固定词）...`
    );
    setErrorAlert(null);
    setStreamRawText('');
    setStreamProgress(8);

    const startTime = Date.now();

    try {
      const scriptSource = isEditingRawScript ? draftScriptText : activeEpisode.rawScriptText;
      const messages = buildBreakdownScriptToShotsMessages({
        project: currentProject,
        episodeIndex: activeEpisode.index,
        literaryScriptText: scriptSource,
        targetShotCount,
      });

      let fullRaw = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.76,
        onChunk: (chunk) => {
          fullRaw += chunk;
          setStreamRawText(fullRaw);
          const est = targetShotCount * 320;
          setStreamProgress(Math.min(95, Math.max(10, Math.round((fullRaw.length / est) * 100))));
        },
      });

      const shots = parseBreakdownShotsJson(res.content || fullRaw);
      if (shots.length === 0) {
        setErrorAlert('⚠️ 未能解析出有效分镜数组，请重试拆解。');
        return;
      }

      const totalSec = shots.reduce((s, item) => s + (item.durationSec || 5), 0);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const updatedEp: DramaEpisode = {
        ...activeEpisode,
        rawScriptText: scriptSource,
        shots,
        targetDurationSec: totalSec,
        meta: `由文学本拆解 ${shots.length} 镜 | 预计 ${totalSec}秒 | 模型: ${model} | 耗时 ${elapsedSec}s`,
        updatedAt: Date.now(),
      };

      const updatedProject: DramaProject = {
        ...currentProject,
        episodes: currentProject.episodes.map((e) => (e.id === activeEpisode.id ? updatedEp : e)),
        lastModifiedAt: Date.now(),
      };

      await onSaveProject(updatedProject);
      setIsEditingRawScript(false);
      setViewMode('storyboard');
      triggerQuickToast(`成功拆解出 ${shots.length} 镜 AI 生图执行表！`);
    } catch (err: any) {
      setErrorAlert(`拆解后期分镜失败：${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 一步全流程模式：同时生成标准 △ 文学剧本 + 下游 AI 分镜执行单
   */
  const executeGenerateFullPipelineEpisode = async (
    epNumberToShoot: number,
    customInstruction: string,
    novelSource?: { novelTitle: string; chapterTitle: string; chapterText: string } | null
  ) => {
    const { cfg, model } = getWriterApi();
    if (!cfg) {
      setErrorAlert('未找到可用的 API 线路，请前往「引擎与技能」配置。');
      return;
    }

    setIsGenerating(true);
    setGeneratingStageLabel(
      `正在同步生成第 ${epNumberToShoot} 集「甲方标准 △ 剧本 + ${targetShotCount} 镜后期生图拆解单」...`
    );
    setErrorAlert(null);
    setStreamRawText('');
    setStreamProgress(6);
    setTargetEpisodeIndex(epNumberToShoot);

    const startTime = Date.now();

    try {
      const messages = buildDramaEpisodeMessages({
        project: currentProject,
        episodeIndex: epNumberToShoot,
        scriptFormat,
        directorInstruction: customInstruction,
        targetShotCount,
        sourceNovelChapter: novelSource,
      });

      let fullRaw = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.82,
        onChunk: (chunk) => {
          fullRaw += chunk;
          setStreamRawText(fullRaw);
          const estimatedTotalChars = targetShotCount * 380 + 800;
          const pct = Math.min(94, Math.max(8, Math.round((fullRaw.length / estimatedTotalChars) * 100)));
          setStreamProgress(pct);
        },
      });

      const finalRaw = (res.content || fullRaw).trim();
      if (!finalRaw) {
        setErrorAlert('⚠️ 模型本次发生空回，执导指令已为您原样保留，请点击重试！');
        return;
      }

      const isPaywall = epNumberToShoot === currentProject.paywallEpisodeIndex;
      const newEpisode = parseGeneratedDramaEpisode(
        finalRaw,
        epNumberToShoot,
        isPaywall,
        scriptFormat
      );

      const elapsedMs = Date.now() - startTime;
      const fmtName = DRAMA_SCRIPT_FORMATS.find((f) => f.id === scriptFormat)?.name || '标准剧本';
      newEpisode.meta = `格式: ${fmtName} | ${newEpisode.shots.length}镜 | 约${newEpisode.targetDurationSec}秒 | 耗时 ${(elapsedMs / 1000).toFixed(1)}s`;

      const continuitySync = applyEpisodeContinuityUpdates({
        project: currentProject,
        rawModelOutput: finalRaw,
        episode: newEpisode,
      });

      const otherEps = (currentProject.episodes || []).filter((e) => e.index !== epNumberToShoot);
      const updatedProject: DramaProject = {
        ...currentProject,
        preferredScriptFormat: scriptFormat,
        sceneAnchors: continuitySync.sceneAnchors,
        foreshadowingLedger: continuitySync.foreshadowingLedger,
        episodes: [...otherEps, continuitySync.episode].sort((a, b) => a.index - b.index),
        lastModifiedAt: Date.now(),
      };

      await onSaveProject(updatedProject);
      setStreamProgress(100);
      setDirectorInput('');
      triggerQuickToast(
        `第 ${epNumberToShoot} 集剧本与分镜已同步生成${
          continuitySync.addedScenesCount > 0
            ? `（自动归档 ${continuitySync.addedScenesCount} 处场景锚点）`
            : ''
        }！`
      );
    } catch (err: any) {
      setErrorAlert(`全流程生成异常：${err.message || '网络中断'}（指令已保留）`);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 保存手动编辑后的文学剧本（同时自动扫描新增场头或异态场景，去重填入核心场景视觉锚点库）
   */
  const handleSaveEditedRawScript = async () => {
    if (!activeEpisode) return;
    const cleaned = cleanMessyClientScriptLocal(draftScriptText);
    const updatedEp: DramaEpisode = {
      ...activeEpisode,
      scriptFormat,
      rawScriptText: cleaned,
      updatedAt: Date.now(),
    };
    const continuitySync = applyEpisodeContinuityUpdates({
      project: currentProject,
      episode: updatedEp,
    });
    const updatedProject: DramaProject = {
      ...currentProject,
      sceneAnchors: continuitySync.sceneAnchors,
      episodes: currentProject.episodes.map((e) =>
        e.id === activeEpisode.id ? continuitySync.episode : e
      ),
      lastModifiedAt: Date.now(),
    };
    await onSaveProject(updatedProject);
    setDraftScriptText(cleaned);
    setIsEditingRawScript(false);
    triggerQuickToast(
      continuitySync.addedScenesCount > 0
        ? `剧本微调已保存，并自动归档 ${continuitySync.addedScenesCount} 处新场景锚点`
        : '标准剧本微调已保存'
    );
  };

  /**
   * 甲方乱稿上传/粘贴一键规范化洗稿入库（同步提取场景锚点去重入库）
   */
  const handleAiWashClientScript = async () => {
    if (!messyClientInput.trim()) return;
    const { cfg, model } = getWriterApi();
    if (!cfg) return;

    setIsWashingScript(true);
    try {
      const epIdx = activeEpisode ? activeEpisode.index : targetEpisodeIndex;
      const messages = buildStandardizeClientScriptMessages({
        messyScript: messyClientInput,
        targetFormat: scriptFormat,
        episodeIndex: epIdx,
      });

      const res = await chatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.5,
      });

      const parsed = JSON.parse(extractJsonString(res.content));
      const washedText = cleanMessyClientScriptLocal(String(parsed.scriptText || messyClientInput));

      const newEp: DramaEpisode = {
        id: activeEpisode?.id || generateUUID(),
        index: epIdx,
        title: String(parsed.title || `第${epIdx}集`),
        isPaywallHook: epIdx === currentProject.paywallEpisodeIndex,
        targetDurationSec: activeEpisode?.targetDurationSec || 95,
        coreConflictSummary: String(parsed.coreConflictSummary || '由甲方来稿清洗导入'),
        opening3SecHook: String(parsed.opening3SecHook || '见第一场开篇动作'),
        endingCliffhanger: String(parsed.endingCliffhanger || '见本集末尾悬念'),
        scriptFormat,
        rawScriptText: washedText,
        shots: activeEpisode?.shots || [],
        meta: `甲方来稿 AI 规范化洗稿完成 | 格式: ${
          DRAMA_SCRIPT_FORMATS.find((f) => f.id === scriptFormat)?.name
        }`,
        updatedAt: Date.now(),
      };

      const continuitySync = applyEpisodeContinuityUpdates({
        project: currentProject,
        rawModelOutput: res.content,
        episode: newEp,
      });

      const otherEps = (currentProject.episodes || []).filter((e) => e.index !== epIdx);
      await onSaveProject({
        ...currentProject,
        sceneAnchors: continuitySync.sceneAnchors,
        foreshadowingLedger: continuitySync.foreshadowingLedger,
        episodes: [...otherEps, continuitySync.episode].sort((a, b) => a.index - b.index),
        lastModifiedAt: Date.now(),
      });

      setIsWashModalOpen(false);
      setMessyClientInput('');
      setViewMode('script');
      triggerQuickToast(
        `甲方来稿已清洗为规范第 ${epIdx} 集剧本${
          continuitySync.addedScenesCount > 0
            ? `（自动归档 ${continuitySync.addedScenesCount} 处场景锚点）`
            : ''
        }！`
      );
    } catch (err: any) {
      setErrorAlert(`甲方剧本规范化失败：${err.message}`);
    } finally {
      setIsWashingScript(false);
    }
  };

  const handleUploadClientTxtFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    setMessyClientInput(cleanMessyClientScriptLocal(raw));
    e.target.value = '';
    triggerQuickToast(`已读取文件「${file.name}」并自动清除 Word 标记`);
  };

  const handlePolishSingleShot = async (shot: DramaShot) => {
    if (!activeEpisode) return;
    const { cfg, model } = getWriterApi();
    if (!cfg) return;

    setPolishingShotId(shot.id);
    try {
      const charContext = currentProject.characterAssets
        .map((c) => `${c.name}：${c.appearanceZh} (${c.visualPromptEn})`)
        .join('\n');

      const prompt = `你是顶级 AI 漫剧分镜导演。请精修升级以下单镜的【中文生图提示词】、【英文Tag】与【台词张力】，保持角色立绘一致并强化画面冲击力（画风：${currentProject.visualStyle}，画幅：${currentProject.aspectRatio}）：
角色固定外观参考：
${charContext}

原分镜：
- 景别运镜：${shot.shotSizeAndCamera}
- 原画面描述：${shot.visualDescription}
- 原动作：${shot.actionAndExpression}
- 原台词(${shot.dialogueSpeaker})：${shot.dialogueText}

请仅输出合法 JSON：
\`\`\`json
{
  "shotSizeAndCamera": "升级后的景别与运镜",
  "visualDescription": "升级后更具电影光影感与角色外观锚点的中文即梦/可灵生图词",
  "imagePromptEn": "Upgraded English prompt tags",
  "actionAndExpression": "更细腻有张力的肢体微表情",
  "dialogueText": "更短促抓耳的台词（无台词则留空）",
  "sfxAndBgm": "更精准的音效卡点"
}
\`\`\``;

      const res = await chatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.78,
      });

      const parsed = JSON.parse(extractJsonString(res.content));

      const updatedShots = activeEpisode.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              shotSizeAndCamera: parsed.shotSizeAndCamera || s.shotSizeAndCamera,
              visualDescription: parsed.visualDescription || s.visualDescription,
              imagePromptEn: parsed.imagePromptEn || s.imagePromptEn,
              actionAndExpression: parsed.actionAndExpression || s.actionAndExpression,
              dialogueText: parsed.dialogueText ?? s.dialogueText,
              sfxAndBgm: parsed.sfxAndBgm || s.sfxAndBgm,
            }
          : s
      );

      const updatedEp: DramaEpisode = {
        ...activeEpisode,
        shots: updatedShots,
        updatedAt: Date.now(),
      };

      const updatedProject: DramaProject = {
        ...currentProject,
        episodes: currentProject.episodes.map((e) => (e.id === activeEpisode.id ? updatedEp : e)),
        lastModifiedAt: Date.now(),
      };
      await onSaveProject(updatedProject);
      triggerQuickToast(`镜号 ${String(shot.shotNumber).padStart(2, '0')} 精修完成`);
    } catch (e: any) {
      setErrorAlert(`单镜精修失败：${e.message}`);
    } finally {
      setPolishingShotId(null);
    }
  };

  const handleUpdateShotField = async (
    shotId: string,
    field: keyof DramaShot,
    value: string | number
  ) => {
    if (!activeEpisode) return;
    const updatedShots = activeEpisode.shots.map((s) =>
      s.id === shotId ? { ...s, [field]: value } : s
    );
    const updatedEp: DramaEpisode = {
      ...activeEpisode,
      shots: updatedShots,
      updatedAt: Date.now(),
    };
    const updatedProject: DramaProject = {
      ...currentProject,
      episodes: currentProject.episodes.map((e) => (e.id === activeEpisode.id ? updatedEp : e)),
      lastModifiedAt: Date.now(),
    };
    await onSaveProject(updatedProject);
  };

  const handleExportCurrentCsv = (epToExport?: DramaEpisode) => {
    const ep = epToExport || activeEpisode;
    if (!ep || ep.shots.length === 0) return;
    const csv = exportDramaEpisodeToCsv(currentProject, ep);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${currentProject.title}》_第${ep.index}集分镜表.csv`;
    a.click();
    URL.revokeObjectURL(url);
    triggerQuickToast(`已导出第 ${ep.index} 集 CSV 分镜单`);
  };

  const handleExportFullMd = () => {
    const md = exportDramaProjectToMarkdown(currentProject);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${currentProject.title}》_全剧漫剧剧本.md`;
    a.click();
    URL.revokeObjectURL(url);
    triggerQuickToast('已导出全剧漫剧制作圣经 (.md)');
  };

  const selectedSourceBook = books.find((b) => b.id === selectedBookId) || books[0];
  const currentFormatSpec =
    DRAMA_SCRIPT_FORMATS.find((f) => f.id === scriptFormat) || DRAMA_SCRIPT_FORMATS[0];
  const writerDurSpec = getEpisodeDurationSpec(currentProject.episodeDurationSec);
  const currentScriptCharCount = (
    isEditingRawScript ? draftScriptText : activeEpisode?.rawScriptText || ''
  ).replace(/\s+/g, '').length;

  const upcomingEpisodeIndex = activeEpisode ? nextEpisodeNumber : targetEpisodeIndex;
  const memoryDiagnostics = getContinuityMemoryDiagnostics(currentProject, upcomingEpisodeIndex);

  const handleToggleForeshadowStatus = async (
    foreshadowId: string,
    nextStatus: DramaForeshadowStatus
  ) => {
    const updatedLedger = (currentProject.foreshadowingLedger || []).map((f) =>
      f.id === foreshadowId
        ? {
            ...f,
            status: nextStatus,
            resolvedEpisode: nextStatus === 'resolved' ? upcomingEpisodeIndex : undefined,
          }
        : f
    );
    await onSaveProject({
      ...currentProject,
      foreshadowingLedger: updatedLedger,
      lastModifiedAt: Date.now(),
    });
    triggerQuickToast(
      nextStatus === 'resolved' ? '已将该伏笔/关键道具标记为已回收' : '已恢复为待回收活跃伏笔'
    );
  };

  const handleQuickChangeProjectDuration = async (newDurationSec: number) => {
    const clamped = Math.max(45, Math.min(480, Math.round(newDurationSec || 90)));
    const newSpec = getEpisodeDurationSpec(clamped);
    setTargetShotCount(newSpec.recommendedShots);
    await onSaveProject({
      ...currentProject,
      episodeDurationSec: clamped,
      lastModifiedAt: Date.now(),
    });
    triggerQuickToast(
      `单集时长已切换为 ${clamped} 秒（目标剧本约 ${newSpec.minWords}~${newSpec.maxWords} 字）`
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Desktop Sidebar: Episode List + Wash Client Script + Novel-to-Drama Bridge + Character Asset Quick Copy */}
      <aside className="hidden lg:block lg:col-span-3 space-y-4 sticky top-22">
        <div className="studio-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--text-muted)] truncate tabular-nums">
                {currentProject.trackName} · 单集 {writerDurSpec.durationSec}s
              </p>
              <h2 className="text-sm font-bold text-[var(--text-primary)] truncate font-editorial-serif">
                《{currentProject.title}》
              </h2>
            </div>
            <MotionButton
              type="button"
              onClick={onGoToDramaSetup}
              className="text-xs text-[var(--accent)] font-medium shrink-0 cursor-pointer"
            >
              立项细纲
            </MotionButton>
          </div>

          {/* Episode Switcher with Stagger & Right-Click Menu */}
          <StaggerList className="space-y-1 max-h-68 overflow-y-auto pr-1">
            {sortedEpisodes.map((ep) => {
              const active = ep.index === targetEpisodeIndex;
              return (
                <StaggerItem
                  key={ep.id}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        {
                          id: 'switch-ep',
                          label: `打开第 ${ep.index} 集`,
                          icon: <FileText className="w-3.5 h-3.5" />,
                          onSelect: () => setTargetEpisodeIndex(ep.index),
                        },
                        {
                          id: 'copy-script',
                          label: '复制本集标准文学剧本',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () =>
                            handleCopy(`ep-ctx-${ep.id}`, ep.rawScriptText, `已复制第 ${ep.index} 集剧本`),
                        },
                        {
                          id: 'dl-txt',
                          label: '导出本集 .txt 剧本',
                          icon: <Download className="w-3.5 h-3.5" />,
                          onSelect: () => handleExportEpisodeTxt(ep),
                        },
                        {
                          id: 'dl-csv',
                          label: '导出本集 CSV 分镜表',
                          icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
                          disabled: ep.shots.length === 0,
                          onSelect: () => handleExportCurrentCsv(ep),
                        },
                      ],
                      ep.title
                    )
                  }
                >
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setTargetEpisodeIndex(ep.index)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      active
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                        : 'hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="truncate">
                      {ep.isPaywallHook ? '🔥 ' : ''}
                      {ep.title}
                    </span>
                    <span className="text-[10px] opacity-80 tabular-nums shrink-0">
                      {ep.shots.length > 0 ? `${ep.shots.length}镜` : '剧本'}
                    </span>
                  </button>
                </StaggerItem>
              );
            })}

            <MotionButton
              type="button"
              disabled={isGenerating}
              onClick={() => setTargetEpisodeIndex(nextEpisodeNumber)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs border border-dashed transition-colors flex items-center gap-1.5 cursor-pointer ${
                !activeEpisode
                  ? 'border-[var(--accent)] text-[var(--text-primary)] font-semibold bg-[var(--accent-soft)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>筹备第 {nextEpisodeNumber} 集新剧本</span>
            </MotionButton>
          </StaggerList>

          {/* Wash Messy Client Script Tool */}
          <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
            <MotionButton
              type="button"
              disabled={isGenerating}
              onClick={() => setIsWashModalOpen(true)}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>导入/清洗甲方乱稿剧本</span>
            </MotionButton>

            {books.length > 0 && (
              <MotionButton
                type="button"
                disabled={isGenerating}
                onClick={() => setIsAdaptModalOpen(true)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl studio-muted hover:bg-[var(--accent-soft)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>从小说章节改编剧本</span>
              </MotionButton>
            )}
          </div>
        </div>

        {/* Locked Character Visual Reference */}
        {currentProject.characterAssets.length > 0 && (
          <div className="studio-card p-4 space-y-2.5 text-xs">
            <h3 className="font-bold text-[var(--text-primary)]">角色立绘固定词速查</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {currentProject.characterAssets.map((c) => (
                <div
                  key={c.id}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        {
                          id: 'c-zh',
                          label: '复制中文立绘词',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => handleCopy(`side-${c.id}`, c.appearanceZh, `已复制「${c.name}」中文外观`),
                        },
                        {
                          id: 'c-en',
                          label: '复制英文生图 Tag',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => handleCopy(`side-en-${c.id}`, c.visualPromptEn, `已复制「${c.name}」英文 Tag`),
                        },
                      ],
                      c.name
                    )
                  }
                  className="p-2.5 studio-muted space-y-1 cursor-context-menu"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`side-${c.id}`, c.appearanceZh)}
                      className="text-[11px] text-[var(--accent)] cursor-pointer"
                    >
                      {copiedId === `side-${c.id}` ? '已复制' : '复制外观'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{c.appearanceZh}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-Archived Scene Visual Anchors Quick Reference */}
        {currentProject.sceneAnchors.length > 0 && (
          <div className="studio-card p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-[var(--text-primary)] tabular-nums">
                核心场景锚点速查 ({currentProject.sceneAnchors.length})
              </h3>
              <span className="text-[10px] text-[var(--text-muted)]">异态独立</span>
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {currentProject.sceneAnchors.map((sc) => (
                <div
                  key={sc.id}
                  className="p-2.5 studio-muted space-y-1"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-[var(--text-primary)] truncate">
                      {sc.sceneName}
                      {sc.stateVariant ? ` · ${sc.stateVariant}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(`side-sc-${sc.id}`, sc.visualPromptZh, `已复制「${sc.sceneName}」场景词`)}
                      className="text-[11px] text-[var(--accent)] shrink-0 cursor-pointer"
                    >
                      {copiedId === `side-sc-${sc.id}` ? '已复制' : '复制'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                    {sc.visualPromptZh}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Two-Stage Script & Storyboard Workspace */}
      <div className="lg:col-span-9 space-y-5">
        {/* Top Action Bar: Stage 1 (甲方标准剧本) <-> Stage 2 (后期分镜拆解单) */}
        <section className="studio-card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <MotionButton
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                className="lg:hidden min-h-[40px] px-3 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1.5"
              >
                <ListVideo className="w-4 h-4" />
                <span>选集 ({sortedEpisodes.length})</span>
              </MotionButton>

              <div className="flex items-center p-1 studio-muted">
                {[
                  { id: 'script', label: '① 甲方标准剧本 (△本)' },
                  {
                    id: 'storyboard',
                    label: `② 后期分镜拆解单${
                      activeEpisode?.shots?.length ? ` (${activeEpisode.shots.length}镜)` : ''
                    }`,
                  },
                ].map((m) => {
                  const active = viewMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewMode(m.id as 'script' | 'storyboard')}
                      className={`relative min-h-[34px] px-3.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        active ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="drama-viewmode-pill"
                          transition={SPRING_INDICATOR}
                          className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                        />
                      )}
                      <span className="relative z-10">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Script Format School Selector */}
              <select
                value={scriptFormat}
                disabled={isGenerating}
                onChange={(e) => setScriptFormat(e.target.value as DramaScriptFormat)}
                aria-label="选择甲方剧本行业规范"
                className="studio-input min-h-[36px] px-3 py-1.5 text-xs font-medium cursor-pointer"
              >
                {DRAMA_SCRIPT_FORMATS.map((fmt) => (
                  <option key={fmt.id} value={fmt.id}>
                    规范：{fmt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MotionButton
                type="button"
                onClick={() => setIsFormatGuideOpen((v) => !v)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl studio-muted text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>甲方剧本行规揭秘</span>
                {isFormatGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </MotionButton>

              <MotionButton
                type="button"
                disabled={isGenerating}
                onClick={() => setIsWashModalOpen(true)}
                className="lg:hidden min-h-[38px] px-3 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>洗乱稿</span>
              </MotionButton>

              {activeEpisode && activeEpisode.shots.length > 0 && (
                <MotionButton
                  type="button"
                  onClick={() => handleExportCurrentCsv()}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>导出 CSV 分镜表</span>
                </MotionButton>
              )}

              <MotionButton
                type="button"
                onClick={handleExportFullMd}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">全剧圣经</span>
              </MotionButton>
            </div>
          </div>

          {/* Collapsible Industry Script School Analysis Drawer */}
          <AnimatePresence>
            {isFormatGuideOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: SNAPPY_EASE }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-1 border-t border-[var(--border-subtle)] space-y-3 text-xs">
                  <div className="p-3.5 rounded-xl studio-muted space-y-1.5 leading-relaxed">
                    <p className="font-bold text-[var(--text-primary)]">
                      💡 为什么市面上甲方给的漫剧剧本不写详细镜头、而且各家格式不一致？
                    </p>
                    <p className="text-[var(--text-secondary)]">
                      在真实 AI 漫剧工业全流程中，<strong>「编剧写的文学场次本」</strong>与<strong>「后期导演拆的分镜生图单」</strong>是上下游分离的两道工序！编剧交稿只追求<strong>极简动作白描（一个 △ 就是一镜动作，零废话）+ 抓耳台词 + 音效卡点</strong>，把运镜与构图空间留给后期；而因为甲方的编剧分别来自传统短剧、网文动态漫或出海译制组，所以市面上形成了以下三大主流流派（点击即可切换当前标准）：
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {DRAMA_SCRIPT_FORMATS.map((fmt) => {
                      const selected = fmt.id === scriptFormat;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setScriptFormat(fmt.id)}
                          className={`p-3.5 rounded-xl border text-left space-y-2 transition-colors cursor-pointer ${
                            selected
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/45'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[var(--text-primary)]">{fmt.name}</span>
                          </div>
                          <p className="text-[11px] font-medium text-[var(--accent)]">{fmt.badge}</p>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{fmt.whyClientsUseIt}</p>
                          <pre className="p-2 rounded-lg bg-[var(--bg-canvas)] text-[10px] text-[var(--text-muted)] whitespace-pre-wrap font-sans leading-relaxed">
                            {fmt.sampleSnippet}
                          </pre>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {errorAlert && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
            {errorAlert}
          </div>
        )}

        {/* Active Streaming Generation Lock Overlay & Live Preview */}
        {isGenerating && (
          <section className="studio-card p-5 sm:p-6 space-y-4 border-[var(--accent)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {generatingStageLabel || `正在生成第 ${targetEpisodeIndex} 集...`}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
                {streamProgress}% · 已输出 {streamRawText.length} 字
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden relative">
              <motion.div
                initial={{ scaleX: 0.05 }}
                animate={{ scaleX: Math.max(0.05, streamProgress / 100) }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="h-full w-full origin-left bg-[var(--accent)] rounded-full"
              />
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-canvas)] max-h-80 overflow-y-auto font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed select-none">
              {streamRawText || '正在连接商业漫剧编导引擎...'}
            </div>
          </section>
        )}

        {/* Populated Episode Script / Storyboard Canvas */}
        {!isGenerating && activeEpisode && (
          <div className="space-y-4">
            {/* Episode Summary Banner */}
            <section className="studio-card p-5 sm:p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-editorial-serif">
                    {activeEpisode.title}
                  </h2>
                  {activeEpisode.isPaywallHook && (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      🔥 付费卡点集
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)] tabular-nums">
                  {activeEpisode.shots.length > 0
                    ? `已拆解 ${activeEpisode.shots.length} 镜 · 实测 ${currentScriptCharCount} 字（单集设定 ${writerDurSpec.durationSec}s · 目标 ${writerDurSpec.minWords}~${writerDurSpec.maxWords} 字）`
                    : `实测 ${currentScriptCharCount} 字 · 单集设定 ${writerDurSpec.durationSec} 秒（目标区间 ${writerDurSpec.minWords}~${writerDurSpec.maxWords} 字）`}
                </span>
              </div>

              {activeEpisode.meta && (
                <p className="text-[11px] text-[var(--text-muted)] font-mono">{activeEpisode.meta}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3.5 studio-muted space-y-1">
                  <span className="font-bold text-[var(--text-primary)]">⚡ 黄金前 3 秒钩子：</span>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{activeEpisode.opening3SecHook}</p>
                </div>
                <div className="p-3.5 studio-muted space-y-1">
                  <span className="font-bold text-[var(--text-primary)]">🪝 集末断章悬念卡点：</span>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{activeEpisode.endingCliffhanger}</p>
                </div>
              </div>
            </section>

            {/* STAGE 1 (Default): Clean Industry Standard Literary Script (△ Triangle / Minimalist Manju / Bilingual) */}
            {viewMode === 'script' ? (
              <section
                onContextMenu={(e) => {
                  if (isEditingRawScript) return;
                  openContextMenu(
                    e,
                    [
                      {
                        id: 'ctx-copy-raw',
                        label: '一键复制整集甲方标准剧本',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        onSelect: () =>
                          handleCopy('raw-script', activeEpisode.rawScriptText, '整集标准剧本已复制'),
                      },
                      {
                        id: 'ctx-edit-raw',
                        label: '切换手动编辑剧本模式',
                        icon: <Edit3 className="w-3.5 h-3.5" />,
                        onSelect: () => {
                          setDraftScriptText(activeEpisode.rawScriptText);
                          setIsEditingRawScript(true);
                        },
                      },
                      {
                        id: 'ctx-breakdown',
                        label: `由本集剧本拆解 ${targetShotCount} 镜 AI 生图单`,
                        icon: <Layers className="w-3.5 h-3.5" />,
                        dividerBefore: true,
                        onSelect: executeBreakdownShotsFromScript,
                      },
                      {
                        id: 'ctx-dl-txt',
                        label: '导出 .txt 标准剧本文件',
                        icon: <Download className="w-3.5 h-3.5" />,
                        onSelect: () => handleExportEpisodeTxt(activeEpisode),
                      },
                    ],
                    `${activeEpisode.title} · 标准文学本`
                  );
                }}
                className="studio-card p-5 sm:p-8 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--border-subtle)] pb-3.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      📄 甲方案头标准文学剧本（一句一动 · 零生图词干扰 · 右键可呼出快捷菜单）
                    </span>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      当前排版流派：{currentFormatSpec.name} —— 审稿满意后可点击右侧「一键拆解 AI 漫剧生图分镜单」进入后期制作
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isEditingRawScript ? (
                      <>
                        <MotionButton
                          type="button"
                          onClick={() => {
                            setDraftScriptText(activeEpisode.rawScriptText);
                            setIsEditingRawScript(false);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium cursor-pointer"
                        >
                          取消
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={handleSaveEditedRawScript}
                          className="btn-primary min-h-[36px] px-3.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>保存剧本修改</span>
                        </MotionButton>
                      </>
                    ) : (
                      <>
                        <MotionButton
                          type="button"
                          onClick={() => {
                            setDraftScriptText(activeEpisode.rawScriptText);
                            setIsEditingRawScript(true);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>微调剧本</span>
                        </MotionButton>

                        <MotionButton
                          type="button"
                          onClick={() => handleExportEpisodeTxt(activeEpisode)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>导出 .txt</span>
                        </MotionButton>

                        <MotionButton
                          type="button"
                          onClick={() => handleCopy('raw-script', activeEpisode.rawScriptText, '整集标准剧本已复制')}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl studio-muted text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === 'raw-script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>复制台本</span>
                        </MotionButton>
                      </>
                    )}

                    <MotionButton
                      type="button"
                      disabled={isGenerating}
                      onClick={executeBreakdownShotsFromScript}
                      className="btn-primary min-h-[36px] px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>
                        {activeEpisode.shots.length > 0
                          ? '重新拆解后期分镜单'
                          : '一键拆解 AI 漫剧分镜单 →'}
                      </span>
                    </MotionButton>
                  </div>
                </div>

                {isEditingRawScript ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-[var(--text-muted)]">快捷插入行业符号：</span>
                      {['△ ', '【音效】：', '**1-1 场景地点 -- 日 -- 内景**\n出场人物：'].map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => setDraftScriptText((prev) => `${prev}\n${sym}`)}
                          className="px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[var(--text-primary)] font-mono cursor-pointer"
                        >
                          + {sym.split('\n')[0]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={18}
                      value={draftScriptText}
                      onChange={(e) => setDraftScriptText(e.target.value)}
                      className="studio-input w-full p-4 font-sans text-xs sm:text-sm leading-loose"
                    />
                  </div>
                ) : (
                  <FormattedIndustryScriptLines scriptText={activeEpisode.rawScriptText} />
                )}
              </section>
            ) : (
              /* STAGE 2: Downstream Production Storyboard Shot Cards */
              <div className="space-y-3.5">
                {activeEpisode.shots.length === 0 ? (
                  <div className="studio-card p-10 text-center space-y-4">
                    <Layers className="w-9 h-9 mx-auto text-[var(--text-muted)]" />
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        本集标准文学剧本已就绪，尚未拆解后期生图分镜单
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
                        点击下方按钮，AI 后期导演将把每一条 △ 动作与台词自动转化为景别运镜，并织入角色固定立绘外貌特征词，生成可直接导入即梦/可灵/剪映的分镜表。
                      </p>
                    </div>
                    <MotionButton
                      type="button"
                      onClick={executeBreakdownShotsFromScript}
                      className="btn-primary min-h-[44px] px-6 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>由本集文学剧本拆解 {targetShotCount} 镜 AI 生图单</span>
                    </MotionButton>
                  </div>
                ) : (
                  activeEpisode.shots.map((shot, idx) => {
                    const isEditingThis = editingShotId === shot.id;
                    const isPolishingThis = polishingShotId === shot.id;

                    return (
                      <StaggerCard
                        key={shot.id}
                        index={idx}
                        onContextMenu={(e) =>
                          openContextMenu(
                            e,
                            [
                              {
                                id: 'shot-copy-zh',
                                label: '复制即梦/可灵中文生图词',
                                icon: <Copy className="w-3.5 h-3.5" />,
                                onSelect: () =>
                                  handleCopy(
                                    `zh-shot-${shot.id}`,
                                    shot.visualDescription,
                                    `已复制镜号 ${String(shot.shotNumber).padStart(2, '0')} 中文生图词`
                                  ),
                              },
                              {
                                id: 'shot-copy-en',
                                label: '复制 MJ/Runway 英文 Tag',
                                icon: <Copy className="w-3.5 h-3.5" />,
                                disabled: !shot.imagePromptEn,
                                onSelect: () =>
                                  handleCopy(
                                    `en-shot-${shot.id}`,
                                    shot.imagePromptEn || '',
                                    `已复制镜号 ${String(shot.shotNumber).padStart(2, '0')} 英文 Tag`
                                  ),
                              },
                              {
                                id: 'shot-copy-vo',
                                label: '复制配音台词',
                                icon: <FileText className="w-3.5 h-3.5" />,
                                disabled: !shot.dialogueText,
                                onSelect: () =>
                                  handleCopy(`vo-shot-${shot.id}`, shot.dialogueText, '配音台词已复制'),
                              },
                              {
                                id: 'shot-polish',
                                label: 'AI 精修升级此镜画面与台词',
                                icon: <Wand2 className="w-3.5 h-3.5" />,
                                dividerBefore: true,
                                onSelect: () => handlePolishSingleShot(shot),
                              },
                              {
                                id: 'shot-edit',
                                label: isEditingThis ? '完成手动微调' : '手动微调此镜',
                                icon: <Edit3 className="w-3.5 h-3.5" />,
                                onSelect: () => setEditingShotId(isEditingThis ? null : shot.id),
                              },
                            ],
                            `镜号 ${String(shot.shotNumber).padStart(2, '0')} · ${shot.shotSizeAndCamera}`
                          )
                        }
                      >
                        <article className="studio-card studio-card-hover p-4 sm:p-5 space-y-3.5 text-xs">
                          {/* Shot Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] font-bold tabular-nums">
                                镜号 {String(shot.shotNumber).padStart(2, '0')}
                              </span>
                              <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                                {shot.durationSec}s
                              </span>
                              <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                              <span className="font-semibold text-[var(--text-secondary)]">
                                {shot.shotSizeAndCamera}
                              </span>
                              {shot.charactersInShot && (
                                <>
                                  <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                                  <span className="text-[var(--text-muted)]">出场：{shot.charactersInShot}</span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <MotionButton
                                type="button"
                                disabled={isPolishingThis}
                                onClick={() => handlePolishSingleShot(shot)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium flex items-center gap-1 cursor-pointer"
                              >
                                {isPolishingThis ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Wand2 className="w-3 h-3 text-[var(--accent)]" />
                                )}
                                <span>AI 精修此镜</span>
                              </MotionButton>

                              <MotionButton
                                type="button"
                                onClick={() => setEditingShotId(isEditingThis ? null : shot.id)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{isEditingThis ? '完成微调' : '手动微调'}</span>
                              </MotionButton>
                            </div>
                          </div>

                          {/* Visual Prompt Block */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-7 p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]/70 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[var(--text-primary)]">
                                  🎨 中文生图/生视频提示词（即梦 / 可灵 / Vidu）
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(`zh-shot-${shot.id}`, shot.visualDescription)}
                                  className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  {copiedId === `zh-shot-${shot.id}` ? (
                                    <>
                                      <Check className="w-3 h-3" />
                                      <span>已复制</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>一键复制</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              {isEditingThis ? (
                                <textarea
                                  rows={3}
                                  value={shot.visualDescription}
                                  onChange={(e) => handleUpdateShotField(shot.id, 'visualDescription', e.target.value)}
                                  className="studio-input w-full p-2 text-xs leading-relaxed"
                                />
                              ) : (
                                <p className="text-[var(--text-secondary)] leading-relaxed">{shot.visualDescription}</p>
                              )}
                            </div>

                            <div className="md:col-span-5 p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]/70 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[var(--text-primary)]">🌐 MJ / Runway 英文 Tag</span>
                                {shot.imagePromptEn && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(`en-shot-${shot.id}`, shot.imagePromptEn || '')}
                                    className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1 cursor-pointer shrink-0"
                                  >
                                    {copiedId === `en-shot-${shot.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    <span>复制</span>
                                  </button>
                                )}
                              </div>
                              {isEditingThis ? (
                                <textarea
                                  rows={3}
                                  value={shot.imagePromptEn || ''}
                                  onChange={(e) => handleUpdateShotField(shot.id, 'imagePromptEn', e.target.value)}
                                  className="studio-input w-full p-2 font-mono text-[11px] leading-relaxed"
                                />
                              ) : (
                                <p className="font-mono text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-4">
                                  {shot.imagePromptEn || '—'}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action, Dialogue & SFX Row */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-0.5">
                            <div className="space-y-1">
                              <span className="text-[var(--text-muted)] font-medium">△ 动作与神态反应：</span>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  value={shot.actionAndExpression}
                                  onChange={(e) => handleUpdateShotField(shot.id, 'actionAndExpression', e.target.value)}
                                  className="studio-input w-full px-2.5 py-1.5 text-xs"
                                />
                              ) : (
                                <p className="text-[var(--text-primary)] leading-relaxed">{shot.actionAndExpression}</p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <span className="text-[var(--text-muted)] font-medium">
                                配音台词（{shot.dialogueSpeaker || '无'}
                                {shot.dialogueVoiceStyle ? ` · ${shot.dialogueVoiceStyle}` : ''}）：
                              </span>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  value={shot.dialogueText}
                                  onChange={(e) => handleUpdateShotField(shot.id, 'dialogueText', e.target.value)}
                                  className="studio-input w-full px-2.5 py-1.5 text-xs"
                                />
                              ) : (
                                <p className="font-semibold text-[var(--text-primary)] leading-relaxed">
                                  {shot.dialogueText ? `“${shot.dialogueText}”` : '（纯画面镜头，无对白）'}
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <span className="text-[var(--text-muted)] font-medium">【音效】与 BGM 卡点：</span>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  value={shot.sfxAndBgm}
                                  onChange={(e) => handleUpdateShotField(shot.id, 'sfxAndBgm', e.target.value)}
                                  className="studio-input w-full px-2.5 py-1.5 text-xs"
                                />
                              ) : (
                                <p className="text-[var(--text-secondary)] leading-relaxed">{shot.sfxAndBgm}</p>
                              )}
                            </div>
                          </div>
                        </article>
                      </StaggerCard>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Writer & Director's Control Deck */}
        <section className="studio-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                🎬 编剧/导演执笔台（目标：第 {activeEpisode ? nextEpisodeNumber : targetEpisodeIndex} 集 · 规范：{currentFormatSpec.name}）
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                时长-字数强挂钩：单集 {writerDurSpec.durationSec} 秒 → 剧本目标 {writerDurSpec.minWords}~{writerDurSpec.maxWords} 字 · {writerDurSpec.sceneRange}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="text-[var(--text-muted)]">单集时长：</label>
              <select
                value={
                  DRAMA_DURATION_PRESETS.some((p) => p.sec === writerDurSpec.durationSec)
                    ? writerDurSpec.durationSec
                    : 'custom'
                }
                disabled={isGenerating}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    handleQuickChangeProjectDuration(Number(e.target.value));
                  }
                }}
                className="studio-input px-2.5 py-1.5 text-xs tabular-nums"
              >
                {DRAMA_DURATION_PRESETS.map((p) => (
                  <option key={p.sec} value={p.sec}>
                    {p.sec}秒（{p.badge}）
                  </option>
                ))}
                {!DRAMA_DURATION_PRESETS.some((p) => p.sec === writerDurSpec.durationSec) && (
                  <option value="custom">
                    自定义 {writerDurSpec.durationSec}秒（约{writerDurSpec.minWords}~{writerDurSpec.maxWords}字）
                  </option>
                )}
              </select>

              <label className="text-[var(--text-muted)]">拆解分镜数：</label>
              <select
                value={targetShotCount}
                disabled={isGenerating}
                onChange={(e) => setTargetShotCount(Number(e.target.value))}
                className="studio-input px-2.5 py-1.5 text-xs tabular-nums"
              >
                <option value={6}>6 镜（60秒极速）</option>
                <option value={8}>8 镜（90秒标准）</option>
                <option value={10}>10 镜（110秒高密）</option>
                <option value={12}>12 镜（120秒叙事）</option>
                <option value={15}>15 镜（180秒动态漫）</option>
                <option value={18}>18 镜（240秒中长集）</option>
                <option value={22}>22 镜（超密分镜）</option>
              </select>
            </div>
          </div>

          {/* 4-Layer Long-Series Continuity & Foreshadowing Memory Hub */}
          <div className="p-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsMemoryHubOpen((v) => !v)}
                className="flex items-center gap-1.5 font-bold text-[var(--text-primary)] cursor-pointer text-left"
              >
                <Link2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>
                  4 层金字塔跨集长篇记忆与伏笔防丢中枢（支撑 60~120+ 集零断片衔接）
                </span>
                {isMemoryHubOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>
                  {memoryDiagnostics.hasNarrativeBible ? '✓ 叙事圣经已挂载' : '○ 大纲骨架挂载'}
                </span>
                <span aria-hidden="true">·</span>
                <span>前情全集记忆 {memoryDiagnostics.totalPriorWrittenCount} 集</span>
                <span aria-hidden="true">·</span>
                <span>待回收伏笔/道具 {memoryDiagnostics.activeForeshadows.length} 项</span>
                {memoryDiagnostics.resolvedForeshadowCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>已回收 {memoryDiagnostics.resolvedForeshadowCount} 项</span>
                  </>
                )}
              </div>
            </div>

            {isMemoryHubOpen && (
              <div className="space-y-3 pt-1 border-t border-[var(--border-subtle)]">
                {/* Continuity Coverage Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
                  <div className="p-2.5 rounded-xl studio-muted space-y-1">
                    <div className="font-semibold text-[var(--text-primary)]">
                      📚 当前第 {upcomingEpisodeIndex} 集注入的前序记忆深度：
                    </div>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      {upcomingEpisodeIndex === 1
                        ? '首集开篇模式：直接挂载全剧叙事圣经 + 第 1 集黄金前 3 秒钩子 + 后 3 集细纲护栏。'
                        : memoryDiagnostics.totalPriorWrittenCount === 0
                        ? '跳集筹备模式：自动挂载全剧叙事圣经 + 前序全部已规划分集细纲脉络 + 后 3 集细纲护栏。'
                        : `${
                            memoryDiagnostics.compressedEarlyRange
                              ? `远期 ${memoryDiagnostics.compressedEarlyRange} + `
                              : ''
                          }近期紧邻 ${memoryDiagnostics.detailedRecentEpisodes.length} 集完整冲突状态 + 上一集末尾 10 行原词画面强咬合。`}
                    </p>
                  </div>

                  {memoryDiagnostics.prevEpisodeTailLines ? (
                    <div className="p-2.5 rounded-xl studio-muted space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">
                        🎬 上一集末尾画面原词咬合锚点（防断片/防重演）：
                      </div>
                      <p className="font-mono text-[10px] text-[var(--text-muted)] line-clamp-3 whitespace-pre-line leading-relaxed">
                        {memoryDiagnostics.prevEpisodeTailLines}
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl studio-muted space-y-1">
                      <div className="font-semibold text-[var(--text-primary)]">
                        🧭 后 3 集细纲前瞻防抢跑护栏：
                      </div>
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        {memoryDiagnostics.upcomingPlanWindow.length > 0
                          ? memoryDiagnostics.upcomingPlanWindow
                              .map((p) => `第${p.episodeIndex}集《${p.title}》`)
                              .join(' → ')
                          : '可在「立项与立绘」继续生成后续分集细纲，为长篇连载提供前瞻路标。'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Due-Now & Active Foreshadowing / Key Prop Quick Action List */}
                {memoryDiagnostics.activeForeshadows.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[var(--text-primary)]">
                        🗝️ 全局待回收伏笔与关键道具池（AI 每集自动追踪，点击可指定在第 {upcomingEpisodeIndex} 集推进或回收）：
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {memoryDiagnostics.activeForeshadows.map((f) => {
                        const isDueNow = memoryDiagnostics.dueNowForeshadows.some(
                          (d) => d.id === f.id
                        );
                        return (
                          <div
                            key={f.id}
                            className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 text-[11px] ${
                              isDueNow
                                ? 'border-amber-500/50 bg-amber-500/5'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                            }`}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-semibold text-[var(--text-primary)] truncate">
                                {isDueNow ? '⚠️ 本集预定节点 · ' : ''}
                                {f.name}
                                <span className="font-normal text-[var(--text-muted)]">
                                  {' '}
                                  · {f.category}（第{f.plantedEpisode}集埋
                                  {f.expectedPayoffEpisode ? ` → 预计${f.expectedPayoffEpisode}` : ''}）
                                </span>
                              </div>
                              {f.payoffNote && (
                                <p className="text-[var(--text-secondary)] line-clamp-1">
                                  {f.payoffNote}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() => {
                                  const directive = `【本集重点回收/推进伏笔道具】：「${f.name}」（关联：${
                                    f.ownerOrRelation || '核心角色'
                                  }${f.payoffNote ? `，回收设计：${f.payoffNote}` : ''}）`;
                                  setDirectorInput((prev) =>
                                    prev.trim() ? `${prev.trim()}\n${directive}` : directive
                                  );
                                  triggerQuickToast(`已将「${f.name}」加入第 ${upcomingEpisodeIndex} 集执导指令`);
                                }}
                                className="px-2 py-1 rounded-lg studio-muted hover:bg-[var(--accent-soft)] text-[var(--accent)] font-medium whitespace-nowrap cursor-pointer"
                              >
                                + 本集回收
                              </button>
                              <button
                                type="button"
                                title="手动标记为已回收"
                                onClick={() => handleToggleForeshadowStatus(f.id, 'resolved')}
                                className="px-1.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:border-emerald-500/50 text-[var(--text-muted)] hover:text-emerald-600 cursor-pointer"
                              >
                                ✓
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clickable Next Episode Viral Hooks */}
          {activeEpisode?.nextEpisodeHooks && activeEpisode.nextEpisodeHooks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[var(--text-muted)]">点选上集预埋的爆款钩子直接填入剧情指令：</p>
              <StaggerList className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {activeEpisode.nextEpisodeHooks.map((hook, i) => (
                  <StaggerItem key={i}>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setDirectorInput(hook)}
                      className="w-full h-full p-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] leading-relaxed transition-colors cursor-pointer"
                    >
                      {hook}
                    </button>
                  </StaggerItem>
                ))}
              </StaggerList>
            </div>
          )}

          <textarea
            rows={3}
            disabled={isGenerating}
            value={directorInput}
            onChange={(e) => setDirectorInput(e.target.value)}
            placeholder="输入本集冲突事件（留空则自动按分集卡点目录与热门赛道公式推进；生成标准剧本时严禁废话，只出干净利落的场头、△动作与台词）..."
            className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed disabled:opacity-60"
          />

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              {activeEpisode && (
                <MotionButton
                  type="button"
                  disabled={isGenerating}
                  onClick={() => executeGenerateLiteraryScriptOnly(activeEpisode.index, directorInput)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  重写当前第 {activeEpisode.index} 集剧本
                </MotionButton>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <MotionButton
                type="button"
                disabled={isGenerating}
                onClick={() =>
                  executeGenerateFullPipelineEpisode(
                    activeEpisode ? nextEpisodeNumber : targetEpisodeIndex,
                    directorInput
                  )
                }
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>同步出 △ 剧本 + 分镜单</span>
              </MotionButton>

              <MotionButton
                type="button"
                disabled={isGenerating}
                onClick={() =>
                  executeGenerateLiteraryScriptOnly(
                    activeEpisode ? nextEpisodeNumber : targetEpisodeIndex,
                    directorInput
                  )
                }
                className="btn-primary min-h-[44px] px-6 py-2.5 text-xs sm:text-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {activeEpisode
                    ? `撰写第 ${nextEpisodeNumber} 集甲方标准剧本 (△本)`
                    : `撰写第 ${targetEpisodeIndex} 集甲方标准剧本 (△本)`}
                </span>
              </MotionButton>
            </div>
          </div>
        </section>
      </div>

      {/* Messy Client Script Import & Wash Modal */}
      {isWashModalOpen && (
        <ModalPortal onEscape={() => setIsWashModalOpen(false)}>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsWashModalOpen(false)}
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.18, ease: SNAPPY_EASE }}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe max-h-[88dvh] sm:max-h-[88vh] overflow-y-auto"
              >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    导入 / 清洗甲方非标来稿剧本
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    自动剔除 Word 批注残余（如 [.mark]）、统一乱三角符号，并可一键重构为规范场次本再拆解 AI 分镜
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWashModalOpen(false)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="min-h-[36px] px-3.5 py-1.5 rounded-xl studio-muted hover:bg-[var(--accent-soft)] font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>上传甲方 .txt 剧本文件</span>
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={handleUploadClientTxtFile}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMessyClientInput((prev) => cleanMessyClientScriptLocal(prev));
                      triggerQuickToast('已执行毫秒级乱码标记清理');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium cursor-pointer"
                  >
                    仅清除 Word 乱码符号
                  </button>
                </div>
              </div>

              <textarea
                rows={10}
                value={messyClientInput}
                onChange={(e) => setMessyClientInput(e.target.value)}
                placeholder="在此粘贴甲方发来的任意格式单集剧本（无论是带三角号、纯对话、带 {.mark} 标记还是偏小说化的草稿）..."
                className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed font-sans"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <span className="text-xs text-[var(--text-muted)]">
                  目标清洗格式：{currentFormatSpec.name}（存入第 {activeEpisode ? activeEpisode.index : targetEpisodeIndex} 集）
                </span>
                <div className="flex items-center gap-2">
                  <MotionButton
                    type="button"
                    onClick={() => setIsWashModalOpen(false)}
                    className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs cursor-pointer"
                  >
                    取消
                  </MotionButton>
                  <MotionButton
                    type="button"
                    disabled={isWashingScript || !messyClientInput.trim()}
                    onClick={handleAiWashClientScript}
                    className="btn-primary min-h-[42px] px-5 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isWashingScript ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>正在规范化重构剧本...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI 规范化洗稿并存入本集</span>
                      </>
                    )}
                  </MotionButton>
                </div>
              </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </ModalPortal>
      )}

      {/* Mobile Episode Switcher Bottom Sheet */}
      {isMobileDrawerOpen && (
        <ModalPortal onEscape={() => setIsMobileDrawerOpen(false)}>
          <div
            onClick={() => setIsMobileDrawerOpen(false)}
            className="fixed inset-0 z-[100] lg:hidden flex items-end bg-black/55 backdrop-blur-xs pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-3xl bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] p-5 space-y-4 max-h-[82dvh] overflow-y-auto pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold">选择漫剧分集</h3>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {sortedEpisodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setTargetEpisodeIndex(ep.index);
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-xs flex items-center justify-between ${
                    ep.index === targetEpisodeIndex
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                      : 'studio-muted text-[var(--text-primary)]'
                  }`}
                >
                  <span>{ep.title}</span>
                  <span className="tabular-nums">
                    {ep.shots.length > 0 ? `${ep.shots.length} 镜` : '标准本'}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTargetEpisodeIndex(nextEpisodeNumber);
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-[var(--border-subtle)] text-xs font-medium"
              >
                + 筹备第 {nextEpisodeNumber} 集新剧本
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Novel Chapter -> Commercial Comic-Drama Adaptation Modal */}
      {isAdaptModalOpen && selectedSourceBook && (
        <ModalPortal onEscape={() => setIsAdaptModalOpen(false)}>
          <div
            onClick={() => setIsAdaptModalOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                小说章节跨界改编为甲方标准剧本
              </h3>
              <button
                type="button"
                onClick={() => setIsAdaptModalOpen(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center text-[var(--text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              系统将彻底砍掉原小说中的慢节奏心理独白与修辞渲染，按「{currentFormatSpec.name}」提炼为第{' '}
              <strong>{activeEpisode ? nextEpisodeNumber : targetEpisodeIndex}</strong> 集极简动作台词剧本。
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 text-[var(--text-secondary)]">选择源小说</label>
                <select
                  value={selectedBookId}
                  onChange={(e) => {
                    setSelectedBookId(e.target.value);
                    setSelectedBookChapterIdx(0);
                  }}
                  className="studio-input w-full min-h-[42px] px-3 py-2"
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      《{b.title}》（共 {b.chapters.length} 章）
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1 text-[var(--text-secondary)]">选择要改编的章节</label>
                <select
                  value={selectedBookChapterIdx}
                  onChange={(e) => setSelectedBookChapterIdx(Number(e.target.value))}
                  className="studio-input w-full min-h-[42px] px-3 py-2"
                >
                  {(selectedSourceBook.chapters || []).map((ch, idx) => (
                    <option key={ch.id} value={idx}>
                      第 {ch.index} 章：{ch.title}（{ch.text.length}字）
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <MotionButton
                type="button"
                onClick={() => setIsAdaptModalOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs cursor-pointer"
              >
                取消
              </MotionButton>
              <MotionButton
                type="button"
                disabled={!selectedSourceBook.chapters?.length}
                onClick={() => {
                  const ch = selectedSourceBook.chapters[selectedBookChapterIdx];
                  if (!ch) return;
                  setIsAdaptModalOpen(false);
                  const epNum = activeEpisode ? nextEpisodeNumber : targetEpisodeIndex;
                  executeGenerateLiteraryScriptOnly(epNum, directorInput, {
                    novelTitle: selectedSourceBook.title,
                    chapterTitle: ch.title,
                    chapterText: ch.text,
                  });
                }}
                className="btn-primary min-h-[42px] px-5 text-xs cursor-pointer"
              >
                改编生成标准剧本
              </MotionButton>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
