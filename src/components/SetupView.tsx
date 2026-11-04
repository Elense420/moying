import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Save,
  Upload,
  Trash2,
  RotateCcw,
  BookOpen,
  Sliders,
  Plus,
  Edit3,
  X,
  Check,
  BookMarked,
  Zap,
  Loader2,
  Eye,
  Download,
  FileText,
  Feather,
  Copy,
  FolderTree,
  Layers,
  ListOrdered,
  Award,
  AlertTriangle,
} from 'lucide-react';
import { generateUUID } from '../utils/uuid';
import {
  Book,
  BookSettings,
  UiSettings,
  ApiConfig,
  HistoryItem,
  LorebookEntry,
  LorebookEntryType,
  ActivationMode,
  NovelSkill,
  SkillScope,
  SkillCategory,
  SkillRuleTier,
  NovelChapterOutlineItem,
  NovelVolumePlanItem,
  NovelStoryUnitItem,
  NovelCharacterRelationNode,
  NovelKeyItem,
  NovelForeshadowItem,
  MasterOutlineSpec,
  DistilledStyleProfile,
} from '../types';
import {
  dbPut,
  dbGetAll,
  dbDelete,
  STORE_NAMES,
  saveGlobalSkill,
  deleteGlobalSkill,
  resetGlobalSkills,
} from '../services/db';
import { chatCompletion } from '../services/apiClient';
import {
  resolveBookSkills,
  buildUnifiedSystemPrompt,
  serializeSkillToMarkdown,
} from '../services/promptEngine';
import {
  importSkillFilesUniversal,
  exportSingleSkillPackage,
  readFileTextSmart,
} from '../services/skillPackageParser';
import {
  NOVEL_SETTING_MODULES,
  TOTAL_SYSTEM_FIELD_COUNT,
  CRITICAL_SETTING_KEYS,
  computeCriticalSettingsSignature,
  countConfiguredSystemFields,
  buildCompactSchemaGuideForAI,
  formatNovelSystemSettingsForPrompt,
} from '../data/novelArchitectureSchema';
import {
  NovelXpSystemBanner,
  NovelElevenModulesMatrix,
  NovelSigningSubmissionHub,
} from './NovelSystemMatrixPanel';
import { FourLayerOutlineWorkspace } from './FourLayerOutlineWorkspace';
import { StyleDistillationPanel } from './StyleDistillationPanel';
import { SkillPackageInspectorModal } from './SkillPackageInspectorModal';
import { MotionButton, StaggerCard, ModalPortal } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface SetupViewProps {
  currentBook: Book | null;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  xpPreferences: string;
  globalSkills: NovelSkill[];
  onRefreshGlobalSkills: () => Promise<void>;
  onStartWritingFirstChapter: (newBook: Book) => void;
  onUpdateBookSettings: (updatedSettings: BookSettings, updatedTitle: string) => void;
  onSaveDraftBook?: (draftBook: Book) => Promise<void>;
}

const LORE_TYPE_LABELS: Record<LorebookEntryType, string> = {
  character: '角色档案',
  xp_trope: 'XP张力锚点',
  world_rule: '世界法则',
  scene_pack: '情境细节包',
};

const SCOPE_LABELS: Record<SkillScope, string> = {
  outline: '大纲构思',
  chapter: '章节正文',
  reroll: '走向重掷',
  polish: '段落精修',
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  style: '文风质感',
  rule: '硬性约束',
  preference: '审美张力',
  structure: '叙事结构',
  custom: '自定义规则',
};

export const SetupView: React.FC<SetupViewProps> = ({
  currentBook,
  configs,
  uiSettings,
  xpPreferences,
  globalSkills,
  onRefreshGlobalSkills,
  onStartWritingFirstChapter,
  onUpdateBookSettings,
  onSaveDraftBook,
}) => {
  const [setupSection, setSetupSection] = useState<
    'core' | 'matrix' | 'chapter-outlines' | 'signing' | 'lorebook' | 'skills' | 'style'
  >('core');
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('');
  const [chapterWords, setChapterWords] = useState<number | string>(3500);
  const [pov, setPov] = useState('第三人称');
  const [tense, setTense] = useState('现在时');
  const [temperature, setTemperature] = useState<number | string>(0.85);
  const [contextMemory, setContextMemory] = useState<number | string>(4);
  const [characters, setCharacters] = useState('');
  const [world, setWorld] = useState('');
  const [styleReference, setStyleReference] = useState('');
  const [aiPersona, setAiPersona] = useState(
    '你是一位文笔老练、极擅刻画人物张力与细腻情感拉扯的职业小说家。行文自然克制而富有画面感，严格遵循大纲、世界书与已挂载 SKILL 规范。'
  );
  const [outline, setOutline] = useState('');

  // Lorebook 2.0 state
  const [lorebook, setLorebook] = useState<LorebookEntry[]>([]);
  const [isLoreModalOpen, setIsLoreModalOpen] = useState(false);
  const [editingLoreEntry, setEditingLoreEntry] = useState<LorebookEntry | null>(null);
  const [loreName, setLoreName] = useState('');
  const [loreType, setLoreType] = useState<LorebookEntryType>('character');
  const [loreActivation, setLoreActivation] = useState<ActivationMode>('constant');
  const [loreKeywordsInput, setLoreKeywordsInput] = useState('');
  const [loreAppearance, setLoreAppearance] = useState('');
  const [lorePersonality, setLorePersonality] = useState('');
  const [loreBehaviorQuirks, setLoreBehaviorQuirks] = useState('');
  const [loreMustIncludeTaboos, setLoreMustIncludeTaboos] = useState('');

  // SKILL 2.0 state
  const [skills, setSkills] = useState<NovelSkill[]>([]);
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<NovelSkill | null>(null);
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [skillInstruction, setSkillInstruction] = useState('');
  const [skillCategory, setSkillCategory] = useState<SkillCategory>('custom');
  const [skillScopes, setSkillScopes] = useState<SkillScope[]>(['chapter', 'polish']);
  const [skillTriggerMode, setSkillTriggerMode] = useState<'always' | 'keyword'>('always');
  const [skillKeywordsInput, setSkillKeywordsInput] = useState('');
  const [skillPriority, setSkillPriority] = useState<'high' | 'normal'>('normal');
  const [skillRuleTier, setSkillRuleTier] = useState<SkillRuleTier>('contract');
  const [inspectingSkill, setInspectingSkill] = useState<NovelSkill | null>(null);
  const [isGeneratingSkillPrompt, setIsGeneratingSkillPrompt] = useState(false);
  const [confirmResetSkills, setConfirmResetSkills] = useState(false);

  // History snapshots
  const [personaHistory, setPersonaHistory] = useState<HistoryItem[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');
  const [outlineHistory, setOutlineHistory] = useState<HistoryItem[]>([]);
  const [selectedOutlineId, setSelectedOutlineId] = useState('');
  const [styleHistory, setStyleHistory] = useState<HistoryItem[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState('');

  // Per-Book XP System Switch & 11-Module Commercial Architecture State
  const [xpSystemEnabled, setXpSystemEnabled] = useState<boolean>(() =>
    Boolean((xpPreferences || '').trim())
  );
  const [bookXpNote, setBookXpNote] = useState<string>('');
  const [systemSettings, setSystemSettings] = useState<Record<string, string[]>>({});
  const [systemCustomNotes, setSystemCustomNotes] = useState<Record<string, string>>({});
  const [lastSyncedSettingsHash, setLastSyncedSettingsHash] = useState<string>('');
  const [systemSettingsDirty, setSystemSettingsDirty] = useState<boolean>(false);

  // Four-Layer Rolling Outline, Cross-Entity Graph, Style Distillation & Signing State
  const emptyMasterSpec: MasterOutlineSpec = {
    corePromise: '',
    ultimateEnding: '',
    worldCeiling: '',
    mainPlotline: '',
    emotionalOrSubPlotline: '',
    darkPlotline: '',
  };
  const [masterOutlineSpec, setMasterOutlineSpec] = useState<MasterOutlineSpec>(emptyMasterSpec);
  const [volumePlan, setVolumePlan] = useState<NovelVolumePlanItem[]>([]);
  const [storyUnits, setStoryUnits] = useState<NovelStoryUnitItem[]>([]);
  const [chapterOutlines, setChapterOutlines] = useState<NovelChapterOutlineItem[]>([]);
  const [characterGraph, setCharacterGraph] = useState<NovelCharacterRelationNode[]>([]);
  const [keyItemRegistry, setKeyItemRegistry] = useState<NovelKeyItem[]>([]);
  const [foreshadowLedger, setForeshadowLedger] = useState<NovelForeshadowItem[]>([]);
  const [activeDistilledStyle, setActiveDistilledStyle] = useState<DistilledStyleProfile | null>(null);
  const [autoZhuqueDeslop, setAutoZhuqueDeslop] = useState<boolean>(false);
  const [targetPlatform, setTargetPlatform] = useState<string>('番茄小说');
  const [commercialBlurb, setCommercialBlurb] = useState<string>('');
  const [alternateTitles, setAlternateTitles] = useState<string[]>([]);
  const [signingReviewReport, setSigningReviewReport] = useState<string>('');

  const [isGeneratingChapterOutlines, setIsGeneratingChapterOutlines] = useState<boolean>(false);
  const [isGeneratingPackaging, setIsGeneratingPackaging] = useState<boolean>(false);
  const [isRunningSigningReview, setIsRunningSigningReview] = useState<boolean>(false);

  // Feedback & Audit Inspector
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [isImprovingOutline, setIsImprovingOutline] = useState(false);
  const [isExtractingLore, setIsExtractingLore] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditPreviewScope, setAuditPreviewScope] = useState<SkillScope>('chapter');

  const notify = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setStatusMessage({ type, text });
  };

  useEffect(() => {
    if (currentBook) {
      setTitle(currentBook.title || '');
      const s = currentBook.settings || ({} as BookSettings);
      setGenre(s.genre || '');
      setStyle(s.style || '');
      setChapterWords(s.chapterWords || 3500);
      setPov(s.pov || '第三人称');
      setTense(s.tense || '现在时');
      setTemperature(s.temperature ?? 0.85);
      setContextMemory(s.contextMemory ?? 4);
      setCharacters(s.characters || '');
      setWorld(s.world || '');
      if (s.aiPersona) setAiPersona(s.aiPersona);
      setOutline(s.outline || '');
      setStyleReference(s.styleReference || '');
      setActiveDistilledStyle(s.activeDistilledStyle || null);
      setAutoZhuqueDeslop(Boolean(s.autoZhuqueDeslop));
      setLorebook(s.lorebook || []);
      setSkills(resolveBookSkills(currentBook, globalSkills));

      setXpSystemEnabled(
        s.xpSystemEnabled !== undefined ? Boolean(s.xpSystemEnabled) : Boolean((xpPreferences || '').trim())
      );
      setBookXpNote(s.bookXpNote || '');
      setSystemSettings(s.systemSettings || {});
      setSystemCustomNotes(s.systemCustomNotes || {});
      setLastSyncedSettingsHash(s.lastSyncedSettingsHash || '');
      setSystemSettingsDirty(Boolean(s.systemSettingsDirty));
      setMasterOutlineSpec(s.masterOutlineSpec || emptyMasterSpec);
      setVolumePlan(s.volumePlan || []);
      setStoryUnits(s.storyUnits || []);
      setChapterOutlines(s.chapterOutlines || []);
      setCharacterGraph(s.characterGraph || []);
      setKeyItemRegistry(s.keyItemRegistry || []);
      setForeshadowLedger(s.foreshadowLedger || []);
      setTargetPlatform(s.targetPlatform || '番茄小说');
      setCommercialBlurb(s.commercialBlurb || '');
      setAlternateTitles(s.alternateTitles || []);
      setSigningReviewReport(s.signingReviewReport || '');
    } else {
      setTitle('');
      setGenre('');
      setStyle('');
      setChapterWords(3500);
      setPov('第三人称');
      setTense('现在时');
      setTemperature(0.85);
      setContextMemory(4);
      setCharacters('');
      setWorld('');
      setOutline('');
      setStyleReference('');
      setActiveDistilledStyle(null);
      setAutoZhuqueDeslop(false);
      setLorebook([]);
      setSkills(globalSkills.map((g) => ({ ...g })));

      setXpSystemEnabled(Boolean((xpPreferences || '').trim()));
      setBookXpNote('');
      setSystemSettings({});
      setSystemCustomNotes({});
      setLastSyncedSettingsHash('');
      setSystemSettingsDirty(false);
      setMasterOutlineSpec(emptyMasterSpec);
      setVolumePlan([]);
      setStoryUnits([]);
      setChapterOutlines([]);
      setCharacterGraph([]);
      setKeyItemRegistry([]);
      setForeshadowLedger([]);
      setTargetPlatform('番茄小说');
      setCommercialBlurb('');
      setAlternateTitles([]);
      setSigningReviewReport('');
    }
  }, [currentBook?.id, globalSkills]);

  useEffect(() => {
    loadHistories();
  }, []);

  const loadHistories = async () => {
    const [personas, outlines, styles] = await Promise.all([
      dbGetAll<HistoryItem>(STORE_NAMES.PERSONA_HISTORY),
      dbGetAll<HistoryItem>(STORE_NAMES.OUTLINE_HISTORY),
      dbGetAll<HistoryItem>(STORE_NAMES.STYLE_HISTORY),
    ]);
    setPersonaHistory(personas);
    setOutlineHistory(outlines);
    setStyleHistory(styles);
  };

  const parseCommaList = (raw: string): string[] =>
    raw
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleUpdateMatrixFieldValues = (
    fieldKey: string,
    nextValues: string[],
    isCriticalField?: boolean
  ) => {
    setSystemSettings((prev) => {
      const next = { ...prev };
      if (nextValues.length === 0) {
        delete next[fieldKey];
      } else {
        next[fieldKey] = nextValues;
      }

      // Sync foundation.genre_types and foundation.narrative_pov to top-level genre/pov if helpful
      if (fieldKey === 'foundation.genre_types' && nextValues.length > 0 && !genre.trim()) {
        setGenre(nextValues.slice(0, 3).join(' / '));
      }

      // Check whether critical settings diverged from the last AI-synced outline state
      const nextSig = computeCriticalSettingsSignature(next);
      if (outline.trim() && (isCriticalField || CRITICAL_SETTING_KEYS.has(fieldKey))) {
        if (!lastSyncedSettingsHash || nextSig !== lastSyncedSettingsHash) {
          setSystemSettingsDirty(true);
        } else {
          setSystemSettingsDirty(false);
        }
      }
      return next;
    });
  };

  const handleUpdateModuleCustomNote = (moduleId: string, note: string) => {
    setSystemCustomNotes((prev) => ({ ...prev, [moduleId]: note }));
  };

  // Live Prompt Audit computation
  const currentAuditReport = useMemo(() => {
    return buildUnifiedSystemPrompt({
      scope: auditPreviewScope,
      roleHeader:
        auditPreviewScope === 'outline'
          ? '你是一位资深小说主编与结构规划师。'
          : '你是一名顶级职业小说家，正在创作连载章节。',
      customSettings: {
        title,
        genre,
        style,
        pov,
        tense,
        outline,
        characters,
        world,
        aiPersona,
        styleReference: styleReference || null,
        activeDistilledStyle,
        lorebook,
        skills,
        xpSystemEnabled,
        bookXpNote,
        systemSettings,
        systemCustomNotes,
        masterOutlineSpec,
        volumePlan,
        storyUnits,
        chapterOutlines,
        characterGraph,
        keyItemRegistry,
        foreshadowLedger,
        targetPlatform,
      },
      globalSkills,
      xpPreferences,
      contextCorpus: `${title}\n${genre}\n${outline}\n${characters}`,
      targetChapterIndex: 1,
    });
  }, [
    auditPreviewScope,
    title,
    genre,
    style,
    pov,
    tense,
    outline,
    characters,
    world,
    aiPersona,
    styleReference,
    activeDistilledStyle,
    lorebook,
    skills,
    xpSystemEnabled,
    bookXpNote,
    systemSettings,
    systemCustomNotes,
    masterOutlineSpec,
    volumePlan,
    storyUnits,
    chapterOutlines,
    characterGraph,
    keyItemRegistry,
    foreshadowLedger,
    targetPlatform,
    globalSkills,
    xpPreferences,
  ]);

  // Lorebook 2.0 Handlers
  const handleOpenAddLoreModal = () => {
    setEditingLoreEntry(null);
    setLoreName('');
    setLoreType('character');
    setLoreActivation('constant');
    setLoreKeywordsInput('');
    setLoreAppearance('');
    setLorePersonality('');
    setLoreBehaviorQuirks('');
    setLoreMustIncludeTaboos('');
    setIsLoreModalOpen(true);
  };

  const handleOpenEditLoreModal = (entry: LorebookEntry) => {
    setEditingLoreEntry(entry);
    setLoreName(entry.name || '');
    setLoreType(entry.entryType || 'character');
    setLoreActivation(entry.activationMode || 'constant');
    setLoreKeywordsInput((entry.keywords || []).join(', '));
    setLoreAppearance(entry.appearance || '');
    setLorePersonality(entry.personality || '');
    setLoreBehaviorQuirks(entry.behaviorQuirks || '');
    setLoreMustIncludeTaboos(entry.mustIncludeTaboos || '');
    setIsLoreModalOpen(true);
  };

  const handleSaveLoreEntry = () => {
    if (!loreName.trim()) {
      notify('请填写档案条目名称', 'error');
      return;
    }

    const parsedKeywords = parseCommaList(loreKeywordsInput);
    const payload: LorebookEntry = {
      id: editingLoreEntry ? editingLoreEntry.id : generateUUID(),
      name: loreName.trim(),
      entryType: loreType,
      activationMode: loreActivation,
      keywords: parsedKeywords,
      appearance: loreAppearance.trim(),
      personality: lorePersonality.trim(),
      behaviorQuirks: loreBehaviorQuirks.trim(),
      mustIncludeTaboos: loreMustIncludeTaboos.trim(),
      enabled: editingLoreEntry ? editingLoreEntry.enabled : true,
    };

    if (editingLoreEntry) {
      setLorebook((prev) => prev.map((e) => (e.id === editingLoreEntry.id ? payload : e)));
    } else {
      setLorebook((prev) => [...prev, payload]);
    }

    setIsLoreModalOpen(false);
    notify(`世界书档案「${payload.name}」已更新，记得点击顶部保存作品设定`, 'success');
  };

  const handleToggleLoreEntry = (id: string) => {
    setLorebook((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
  };

  const handleDeleteLoreEntry = (id: string) => {
    setLorebook((prev) => prev.filter((e) => e.id !== id));
  };

  // SKILL 2.0 Handlers
  const handleToggleSkill = (id: string) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleToggleSkillScope = (sc: SkillScope) => {
    setSkillScopes((prev) => (prev.includes(sc) ? prev.filter((item) => item !== sc) : [...prev, sc]));
  };

  const handleOpenAddSkillModal = () => {
    setEditingSkill(null);
    setSkillName('');
    setSkillDesc('');
    setSkillInstruction('');
    setSkillCategory('custom');
    setSkillScopes(['chapter', 'polish']);
    setSkillTriggerMode('always');
    setSkillKeywordsInput('');
    setSkillPriority('normal');
    setSkillRuleTier('contract');
    setIsSkillModalOpen(true);
  };

  const handleOpenEditSkillModal = (skill: NovelSkill) => {
    setEditingSkill(skill);
    setSkillName(skill.name || '');
    setSkillDesc(skill.description || '');
    setSkillInstruction(skill.promptInstruction || '');
    setSkillCategory(skill.category || 'custom');
    setSkillScopes(skill.scopes && skill.scopes.length > 0 ? skill.scopes : ['chapter', 'polish']);
    setSkillTriggerMode(skill.triggerMode || 'always');
    setSkillKeywordsInput((skill.keywords || []).join(', '));
    setSkillPriority(skill.priority || 'normal');
    setSkillRuleTier(skill.ruleTier || 'contract');
    setIsSkillModalOpen(true);
  };

  const handleSaveSkill = async () => {
    if (!skillName.trim() || !skillInstruction.trim()) {
      notify('请完整填写 SKILL 名称与指令正文', 'error');
      return;
    }

    const finalScopes: SkillScope[] = skillScopes.length > 0 ? skillScopes : ['chapter'];
    const targetSkill: NovelSkill = {
      ...(editingSkill || {}),
      id: editingSkill ? editingSkill.id : `skill-custom-${generateUUID()}`,
      name: skillName.trim(),
      description: skillDesc.trim() || skillName.trim(),
      promptInstruction: skillInstruction.trim(),
      ruleTier: skillRuleTier,
      category: skillCategory,
      scopes: finalScopes,
      triggerMode: skillTriggerMode,
      keywords: parseCommaList(skillKeywordsInput),
      priority: skillPriority,
      enabled: editingSkill ? editingSkill.enabled : true,
      isPreset: editingSkill ? editingSkill.isPreset : false,
      packageType: editingSkill?.packageType || 'single-md',
    };

    await saveGlobalSkill(targetSkill);
    await onRefreshGlobalSkills();

    setSkills((prev) => {
      const exists = prev.some((s) => s.id === targetSkill.id);
      return exists ? prev.map((s) => (s.id === targetSkill.id ? targetSkill : s)) : [...prev, targetSkill];
    });

    setIsSkillModalOpen(false);
    notify(`SKILL「${targetSkill.name}」已同步至全局技能库并挂载到当前作品`, 'success');
  };

  const handleDeleteSkill = async (id: string) => {
    await deleteGlobalSkill(id);
    await onRefreshGlobalSkills();
    setSkills((prev) => prev.filter((s) => s.id !== id));
    notify('已从技能库移除该 SKILL', 'info');
  };

  const handleResetPresetSkills = async () => {
    const resetList = await resetGlobalSkills();
    await onRefreshGlobalSkills();
    setSkills(resetList);
    setConfirmResetSkills(false);
    notify('已恢复标准 SKILL 2.0 预设技能库', 'success');
  };

  const handleExportSingleSkillMd = async (skill: NovelSkill) => {
    const { blob, filename } = await exportSingleSkillPackage(skill, serializeSkillToMarkdown);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSkillMdFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const { skills: importedList, summary } = await importSkillFilesUniversal(files);
      for (const parsedSkill of importedList) {
        await saveGlobalSkill(parsedSkill);
      }
      await onRefreshGlobalSkills();
      notify(summary, 'success');
      if (importedList.length === 1 && importedList[0].packageType === 'zip-package') {
        setInspectingSkill(importedList[0]);
      }
    } catch (err: any) {
      notify(`导入技能包失败：${err.message || '请确认文件为 .zip 或 .md 格式'}`, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleGenerateSkillInstructionWithAI = async () => {
    if (!skillName.trim() && !skillDesc.trim()) {
      notify('请先填写技能名称或简要意图描述', 'error');
      return;
    }

    setIsGeneratingSkillPrompt(true);
    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const prompt = `请根据以下小说写作技能 (SKILL 2.0) 定义，编写一条严谨、可执行性极高的 AI 写作规则指令（150字以内）：
- 技能名称：${skillName || '未命名技能'}
- 分类：${CATEGORY_LABELS[skillCategory]}
- 适用阶段：${skillScopes.map((s) => SCOPE_LABELS[s]).join('、')}
- 功能意图：${skillDesc || '强化小说文学质感与叙事控制力'}

要求：
1. 以【${skillName || '写作规范'}】开头；
2. 明确指出“必须执行的描写手法”与“严禁出现的反面套路”；
3. 直接输出纯文本规则内容，不要附加任何解释或代码块标记。`;

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: '你是资深文学编辑与小说 Prompt 架构师，擅长撰写简练硬核的写作规范。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      if (res?.content?.trim()) {
        setSkillInstruction(res.content.trim());
      }
    } catch (err: any) {
      notify(`AI 生成规则失败：${err.message || '接口连接异常'}`, 'error');
    } finally {
      setIsGeneratingSkillPrompt(false);
    }
  };

  // AI Deep Outline Refinement + 11-Module Auto-Selection + Volume Plan + Foreshadow + Lorebook 2.0
  const handleImproveOutline = async () => {
    if (!outline.trim() && !title.trim() && !genre.trim()) {
      notify('请先在大纲框内写下几句核心梗概（或填写书名与题材），再交由 AI 深度完善并勾选11大模块设定', 'error');
      return;
    }

    if (outline.trim()) {
      await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: outline.trim() });
      await loadHistories();
    }

    setIsImprovingOutline(true);
    notify(
      xpSystemEnabled
        ? 'AI 正在以 XP 创作宪法为基底，深度推演签约级大纲并同步自动勾选 11 大系统模块与分卷蓝图...'
        : 'AI 正在按大众商业平台签约标准（已隔离个人 XP），深度推演大纲并同步自动勾选 11 大系统模块...',
      'info'
    );

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: xpSystemEnabled
          ? '你是一位顶级商业网文主编与架构策划师。请以创作者的 XP 审美宪法为底层创作基底，结合已挂载的大纲 SKILL，深度扩充签约级大纲，并同步为 11 大系统模块挑选最契合的细化设定项。'
          : '你是一位顶级商业网文主编与架构策划师。当前作品已关闭个人 XP 系统，请严格按照主流网文商业平台签约标准，深度扩充大纲并同步为 11 大系统模块挑选最契合的细化设定项。',
        customSettings: {
          title,
          genre,
          style,
          pov,
          tense,
          outline,
          characters,
          world,
          aiPersona,
          lorebook,
          skills,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
          targetPlatform,
        },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${genre}\n${outline}\n${characters}\n${world}`,
      });

      const compactSchemaGuide = buildCompactSchemaGuideForAI();

      const userPrompt = `请深度完善当前小说大纲（目标投稿平台：${targetPlatform || '主流商业网文平台'}），并同步完成以下商业签约级结构化设定：
1. 扩充完整连载大纲（含核心卖点、前三章黄金开局、阶段冲突升级、核心关系拉扯与终局收束）；
2. 提炼【主要角色设定表】与【世界观与力量/社会规则】；
3. 撰写 250~350 字高点击率【黄金商业简介 (commercialBlurb)】以及 4 个备选高吸量书名 (alternateTitles)；
4. 规划 3~5 卷【分卷结构蓝图 (volumePlan)】与 3~5 条【长线伏笔台账 (foreshadowLedger)】；
5. **重点联动**：对照下方【11大系统设定模块字典】，在 "systemSettings" 对象中为至少 35~65 个关键字段（尤其是基础设定、人物设定、世界观、情节、剧情、风格、推进、物品、感情线、商业与场景氛围中的核心项）自动勾选 1~3 个最契合本书大纲的预设值（也可补充精准自定义词）！
6. 提炼 3~5 条结构化【Lorebook 2.0 世界书档案】（${
        xpSystemEnabled
          ? '核心主角设为 constant；特定情境张力锚点可设为 xp_trope 或 scene_pack 并配 keyword 触发词'
          : '严禁生成 xp_trope 类型！仅生成 character、world_rule 或 scene_pack'
      }）。

【11大系统设定模块字段字典（键名格式为 moduleId.fieldId）】
${compactSchemaGuide}

请严格输出合法的纯 JSON 对象（不要包裹 markdown 代码块）：
{
  "suggestedGenre": "精准题材标签（若原题材为空可补全）",
  "suggestedStyle": "精准文风基调描述",
  "improvedOutline": "结构完整的签约级主线大纲文本",
  "characters": "条理清晰的主要角色与重要配角档案文本",
  "worldView": "世界观背景、升级/社会规则与铁律文本",
  "commercialBlurb": "极具读者点击欲的商业买量简介（250-350字）",
  "alternateTitles": ["备选书名1", "备选书名2", "备选书名3", "备选书名4"],
  "systemSettings": {
    "foundation.genre_types": ["都市异能", "悬疑脑洞"],
    "foundation.scale_structure": ["百万字长篇", "三幕剧结构"],
    "foundation.narrative_pov": ["第三人称限知(主角视角)"]
  },
  "volumePlan": [
    {
      "volumeIndex": 1,
      "title": "第一卷卷名",
      "chapterSpan": "第1章 - 第30章",
      "coreConflict": "本卷核心外部阻力与内部矛盾",
      "climaxGoal": "本卷终局大高潮爽点兑现"
    }
  ],
  "foreshadowLedger": [
    {
      "name": "伏笔简述",
      "plantedChapter": 1,
      "expectedResolveChapter": "第28章",
      "note": "回收方式与真相反转说明"
    }
  ],
  "lorebookEntries": [
    {
      "name": "条目名称",
      "entryType": "character | world_rule | scene_pack${xpSystemEnabled ? ' | xp_trope' : ''}",
      "activationMode": "constant | keyword",
      "keywords": ["关键词1", "关键词2"],
      "appearance": "外貌视觉细节",
      "personality": "性格反差与心理内核",
      "behaviorQuirks": "标志性微动作与说话习惯",
      "mustIncludeTaboos": "必写细节与绝对避雷红线"
    }
  ]
}`;

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.78,
      });

      const rawContent = (res.content || '').trim();
      let parsedData: any = null;
      try {
        const cleanJson = rawContent.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        parsedData = JSON.parse(
          firstBrace >= 0 && lastBrace > firstBrace
            ? cleanJson.slice(firstBrace, lastBrace + 1)
            : cleanJson
        );
      } catch {
        parsedData = null;
      }

      if (parsedData && parsedData.improvedOutline) {
        setOutline(parsedData.improvedOutline);
        if (parsedData.characters) setCharacters(parsedData.characters);
        if (parsedData.worldView) setWorld(parsedData.worldView);
        if (!genre.trim() && parsedData.suggestedGenre) setGenre(parsedData.suggestedGenre);
        if (!style.trim() && parsedData.suggestedStyle) setStyle(parsedData.suggestedStyle);
        if (parsedData.commercialBlurb) setCommercialBlurb(parsedData.commercialBlurb);
        if (Array.isArray(parsedData.alternateTitles) && parsedData.alternateTitles.length > 0) {
          setAlternateTitles(parsedData.alternateTitles.filter(Boolean));
        }

        // Merge AI-selected 11-module system settings
        let mergedSystemSettings: Record<string, string[]> = { ...systemSettings };
        if (parsedData.systemSettings && typeof parsedData.systemSettings === 'object') {
          Object.entries(parsedData.systemSettings).forEach(([k, val]) => {
            if (Array.isArray(val)) {
              const cleaned = val.map((x) => String(x || '').trim()).filter(Boolean);
              if (cleaned.length > 0) {
                const existing = mergedSystemSettings[k] || [];
                mergedSystemSettings[k] = Array.from(new Set([...existing, ...cleaned]));
              }
            }
          });
        }
        setSystemSettings(mergedSystemSettings);
        const newSig = computeCriticalSettingsSignature(mergedSystemSettings);
        setLastSyncedSettingsHash(newSig);
        setSystemSettingsDirty(false);

        // Sync genre/pov from foundation if empty
        if (!genre.trim() && mergedSystemSettings['foundation.genre_types']?.length) {
          setGenre(mergedSystemSettings['foundation.genre_types'].slice(0, 3).join(' / '));
        }

        if (Array.isArray(parsedData.volumePlan) && parsedData.volumePlan.length > 0) {
          setVolumePlan(
            parsedData.volumePlan.map((v: any, idx: number) => ({
              id: generateUUID(),
              volumeIndex: Number(v.volumeIndex) || idx + 1,
              title: v.title || `第${idx + 1}卷`,
              chapterSpan: v.chapterSpan || `第${idx * 30 + 1}章 - 第${(idx + 1) * 30}章`,
              coreConflict: v.coreConflict || '',
              climaxGoal: v.climaxGoal || '',
            }))
          );
        }

        if (Array.isArray(parsedData.foreshadowLedger) && parsedData.foreshadowLedger.length > 0) {
          const newHooks: NovelForeshadowItem[] = parsedData.foreshadowLedger
            .filter((h: any) => h && h.name)
            .map((h: any) => ({
              id: generateUUID(),
              name: String(h.name).trim(),
              plantedChapter: Number(h.plantedChapter) || 1,
              expectedResolveChapter: h.expectedResolveChapter ? String(h.expectedResolveChapter) : undefined,
              status: 'planted' as const,
              note: h.note || '',
            }));
          if (newHooks.length > 0) {
            setForeshadowLedger((prev) => {
              const existingNames = new Set(prev.map((p) => p.name));
              return [...prev, ...newHooks.filter((h) => !existingNames.has(h.name))];
            });
          }
        }

        if (Array.isArray(parsedData.lorebookEntries) && parsedData.lorebookEntries.length > 0) {
          const validTypes: LorebookEntryType[] = xpSystemEnabled
            ? ['character', 'xp_trope', 'world_rule', 'scene_pack']
            : ['character', 'world_rule', 'scene_pack'];
          const newLoreEntries: LorebookEntry[] = parsedData.lorebookEntries
            .filter((e: any) => xpSystemEnabled || e?.entryType !== 'xp_trope')
            .map((e: any) => ({
              id: generateUUID(),
              name: e.name || '核心设定档案',
              entryType: validTypes.includes(e.entryType) ? e.entryType : 'character',
              activationMode: e.activationMode === 'keyword' ? 'keyword' : 'constant',
              keywords: Array.isArray(e.keywords) ? e.keywords.filter(Boolean) : [],
              appearance: e.appearance || '',
              personality: e.personality || '',
              behaviorQuirks: e.behaviorQuirks || '',
              mustIncludeTaboos: e.mustIncludeTaboos || '',
              enabled: true,
            }));

          setLorebook((prev) => {
            const existingNames = new Set(prev.map((p) => p.name));
            const uniqueNew = newLoreEntries.filter((n) => !existingNames.has(n.name));
            return [...prev, ...uniqueNew];
          });
        }

        await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: parsedData.improvedOutline });
        await loadHistories();

        const statsCount = countConfiguredSystemFields(mergedSystemSettings).configuredFields;
        notify(
          `大纲完善完成！已同步自动勾选 11 大模块共 ${statsCount} 项精细设定、${
            Array.isArray(parsedData.volumePlan) ? parsedData.volumePlan.length : 0
          } 卷蓝图与世界书档案（可切换至「11大系统设定矩阵」查阅微调，再去「章节细纲台」一键生成分章细纲）`,
          'success'
        );
      } else {
        setOutline(rawContent);
        await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: rawContent });
        await loadHistories();
        notify('大纲已扩充更新（模型返回了纯文本结构）', 'success');
      }
    } catch (err: any) {
      notify(`完善大纲失败：${err.message || '请检查 API 线路配置'}`, 'error');
    } finally {
      setIsImprovingOutline(false);
    }
  };

  // Re-align Outline & Volume Plan when user manually modifies critical 11-module settings (Req 3.3)
  const handleRealignOutlineFromSettings = async () => {
    const formattedMatrix = formatNovelSystemSettingsForPrompt(systemSettings, systemCustomNotes);
    if (!formattedMatrix.trim()) {
      notify('当前 11 大系统设定模块尚未勾选任何设定项，请先勾选设定后再执行大纲重塑', 'error');
      return;
    }

    if (outline.trim()) {
      await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: outline.trim() });
      await loadHistories();
    }

    setIsImprovingOutline(true);
    notify('AI 正在以您最新手动调整的 11 大系统设定为最高准则，重新校准主线大纲、角色与分卷结构，消除逻辑冲突...', 'info');

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader:
          '你是一位严谨的商业网文总编。作者刚刚手动修改了小说的核心架构设定（如题材、篇幅结构、叙事人称、金手指、感情线或结局形态）。请你以最新的【11大系统设定矩阵】为最高上位准则，重构并校准原有大纲、角色设定与分卷规划，彻底消除新旧设定之间的逻辑断层与前后矛盾！',
        customSettings: {
          title,
          genre,
          style,
          pov,
          tense,
          outline,
          characters,
          world,
          aiPersona,
          lorebook,
          skills,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
          volumePlan,
          foreshadowLedger,
          targetPlatform,
        },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${outline}\n${formattedMatrix}`,
      });

      const userPrompt = `作者已手动调整了本书的【11大系统架构设定】，最新生效设定如下：
${formattedMatrix}

【原故事大纲草稿】
${outline || '（暂无原大纲，请直接根据上方11大系统设定全新构建签约级主线大纲）'}

【原角色设定】
${characters || '（待同步校准）'}

【原世界观设定】
${world || '（待同步校准）'}

请严格按照上方最新勾选的设定（特别是叙事人称、篇幅结构、核心冲突、金手指/升级体系、感情线模式与完结形态），重构并输出完全自洽、无任何设定打架的新版大纲与分卷规划。
严格输出纯 JSON 对象（不要包裹代码块）：
{
  "realignedOutline": "与最新11大模块设定100%对齐的新版主线大纲全文",
  "characters": "同步校准后的角色设定表",
  "worldView": "同步校准后的世界观与底层规则",
  "suggestedGenre": "对齐后的核心题材显示文本",
  "suggestedPov": "第一人称 或 第三人称",
  "commercialBlurb": "同步更新的商业黄金简介（250-350字）",
  "volumePlan": [
    {
      "volumeIndex": 1,
      "title": "第一卷标题",
      "chapterSpan": "第1章 - 第30章",
      "coreConflict": "核心矛盾",
      "climaxGoal": "卷末高潮兑现"
    }
  ]
}`;

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.72,
      });

      const raw = (res.content || '').trim();
      const cleanJson = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
      const fb = cleanJson.indexOf('{');
      const lb = cleanJson.lastIndexOf('}');
      const parsed = JSON.parse(fb >= 0 && lb > fb ? cleanJson.slice(fb, lb + 1) : cleanJson);

      if (parsed.realignedOutline) {
        setOutline(parsed.realignedOutline);
        await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: parsed.realignedOutline });
        await loadHistories();
      }
      if (parsed.characters) setCharacters(parsed.characters);
      if (parsed.worldView) setWorld(parsed.worldView);
      if (parsed.suggestedGenre) setGenre(parsed.suggestedGenre);
      if (parsed.suggestedPov === '第一人称' || parsed.suggestedPov === '第三人称') {
        setPov(parsed.suggestedPov);
      }
      if (parsed.commercialBlurb) setCommercialBlurb(parsed.commercialBlurb);
      if (Array.isArray(parsed.volumePlan) && parsed.volumePlan.length > 0) {
        setVolumePlan(
          parsed.volumePlan.map((v: any, idx: number) => ({
            id: generateUUID(),
            volumeIndex: Number(v.volumeIndex) || idx + 1,
            title: v.title || `第${idx + 1}卷`,
            chapterSpan: v.chapterSpan || `第${idx * 30 + 1}章 - 第${(idx + 1) * 30}章`,
            coreConflict: v.coreConflict || '',
            climaxGoal: v.climaxGoal || '',
          }))
        );
      }

      const syncedHash = computeCriticalSettingsSignature(systemSettings);
      setLastSyncedSettingsHash(syncedHash);
      setSystemSettingsDirty(false);
      notify('已根据最新手动勾选的 11 大系统设定重新校准全书大纲、角色与分卷蓝图，冲突预警已解除！', 'success');
    } catch (err: any) {
      notify(`重新校准大纲失败：${err.message || '返回格式解析异常'}`, 'error');
    } finally {
      setIsImprovingOutline(false);
    }
  };

  // Batch Generate Concise Per-Chapter Outlines (Req 3.3)
  const handleGenerateBatchChapterOutlines = async (
    startChap: number,
    count: number,
    batchDirection: string
  ) => {
    if (!outline.trim()) {
      notify('请先在「大纲与XP基底」填写并完善全书主线大纲，再生成分章细纲', 'error');
      setSetupSection('core');
      return;
    }

    setIsGeneratingChapterOutlines(true);
    const endChap = startChap + count - 1;
    notify(`AI 正在结合全书大纲、11大设定模块与前序脉络，推演第 ${startChap} ~ ${endChap} 章简明细纲...`, 'info');

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader:
          '你是一位极擅商业网文连载节奏把控（黄金三章、小高潮卡点、章末断章留钩）的首席分章策划师。',
        customSettings: {
          title,
          genre,
          style,
          chapterWords: Number(chapterWords) || 3500,
          pov,
          tense,
          outline,
          characters,
          world,
          lorebook,
          skills,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
          volumePlan,
          foreshadowLedger,
          targetPlatform,
        },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${outline}\n${batchDirection}`,
      });

      const priorOutlines = [...chapterOutlines]
        .filter((c) => c.chapterIndex < startChap)
        .sort((a, b) => a.chapterIndex - b.chapterIndex)
        .slice(-15)
        .map((c) => `第${c.chapterIndex}章《${c.title}》：${c.summary}${c.hookNote ? `（章末钩子：${c.hookNote}）` : ''}`)
        .join('\n');

      const userPrompt = `请为小说《${title || '未命名新书'}》规划 **第 ${startChap} 章 至 第 ${endChap} 章（共 ${count} 章）** 的简明章节细纲。
单章目标字数约为 ${chapterWords} 字，因此每章细纲的事件容量要恰当饱满（既不能一句话空洞注水，也不能一章塞入十章的跨度）。

${priorOutlines ? `【前序已定章节细纲回顾（务必严丝合缝承接上一章末尾钩子与人物状态）】\n${priorOutlines}\n` : '【黄金开局要求】第1~3章必须严格执行商业网文黄金三章法则：第1章强冲突/核心困境切入+金手指或核心张力初现；第2章立人设与利益碰撞；第3章首次爽点反击或关键转折留钩！\n'}
${batchDirection.trim() ? `【作者对本批次章节的特别剧情侧重指令】\n${batchDirection.trim()}\n` : ''}

要求：
1. 每章 summary 控制在 **2 ~ 4 句话（约 70~140 字）**，清晰交代：本章场景与核心事件、人物互动/博弈推进、情绪或爽点变化；
2. 每章必须提供具体的章末断章钩子 (hookNote)，提升平台追读率；
3. 若本批次埋下了新的关键长线伏笔，可在 newForeshadows 数组中顺便补充。

请严格输出纯 JSON 对象（不要包裹 markdown 代码块）：
{
  "chapters": [
    {
      "chapterIndex": ${startChap},
      "title": "精炼有悬念的章节名（不含第X章前缀）",
      "volumeTag": "所属分卷（如：第一卷·潜龙在渊）",
      "summary": "2~4句话简述本章核心发生的事件、人物交锋与剧情推进。",
      "hookNote": "章末悬念断章点"
    }
  ],
  "newForeshadows": [
    {
      "name": "新埋伏笔名称",
      "plantedChapter": ${startChap},
      "expectedResolveChapter": "第${endChap + 10}章左右",
      "note": "伏笔作用说明"
    }
  ]
}`;

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.78,
      });

      const raw = (res.content || '').trim();
      const cleanJson = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
      const fb = cleanJson.indexOf('{');
      const lb = cleanJson.lastIndexOf('}');
      const parsed = JSON.parse(fb >= 0 && lb > fb ? cleanJson.slice(fb, lb + 1) : cleanJson);

      const generatedList: NovelChapterOutlineItem[] = (parsed.chapters || []).map(
        (c: any, idx: number) => {
          const chapNum = Number(c.chapterIndex) || startChap + idx;
          const cleanTitle = String(c.title || `章节 ${chapNum}`)
            .replace(/^第[0-9零一二三四五六七八九十百千万]+章[\s:：·—-]*/u, '')
            .trim();
          return {
            id: generateUUID(),
            chapterIndex: chapNum,
            title: cleanTitle || `第${chapNum}章推进`,
            summary: String(c.summary || '').trim(),
            volumeTag: c.volumeTag ? String(c.volumeTag) : undefined,
            hookNote: c.hookNote ? String(c.hookNote) : undefined,
            status:
              currentBook && chapNum <= currentBook.chapters.length ? 'drafted' : 'planned',
          };
        }
      );

      if (generatedList.length === 0) {
        throw new Error('模型未返回有效章节细纲数组');
      }

      setChapterOutlines((prev) => {
        const replacedIndices = new Set(generatedList.map((g) => g.chapterIndex));
        const kept = prev.filter((item) => !replacedIndices.has(item.chapterIndex));
        return [...kept, ...generatedList].sort((a, b) => a.chapterIndex - b.chapterIndex);
      });

      if (Array.isArray(parsed.newForeshadows) && parsed.newForeshadows.length > 0) {
        const addedHooks: NovelForeshadowItem[] = parsed.newForeshadows
          .filter((h: any) => h && h.name)
          .map((h: any) => ({
            id: generateUUID(),
            name: String(h.name).trim(),
            plantedChapter: Number(h.plantedChapter) || startChap,
            expectedResolveChapter: h.expectedResolveChapter
              ? String(h.expectedResolveChapter)
              : undefined,
            status: 'planted' as const,
            note: h.note || '',
          }));
        if (addedHooks.length > 0) {
          setForeshadowLedger((prev) => {
            const names = new Set(prev.map((p) => p.name));
            return [...prev, ...addedHooks.filter((a) => !names.has(a.name))];
          });
        }
      }

      notify(
        `成功生成第 ${startChap} ~ ${startChap + generatedList.length - 1} 章简明细纲！确认无误后可直接点击「进入章节生成」单章或批量连写。`,
        'success'
      );
    } catch (err: any) {
      notify(`生成章节细纲失败：${err.message || '请检查 API 线路'}`, 'error');
    } finally {
      setIsGeneratingChapterOutlines(false);
    }
  };

  // Generate Commercial Packaging: High-CTR Alternate Titles & Golden Blurb (Req 3.4)
  const handleGenerateCommercialPackaging = async () => {
    if (!outline.trim()) {
      notify('请先填写作品大纲后再提炼商业买量包装', 'error');
      return;
    }
    setIsGeneratingPackaging(true);
    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: `你是一位深谙「${targetPlatform}」算法推荐池与书城点击率转化的金牌商业网文责编。`,
        customSettings: {
          title,
          genre,
          style,
          outline,
          characters,
          world,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
          targetPlatform,
        },
        globalSkills,
        xpPreferences,
      });

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          {
            role: 'user',
            content: `请针对投稿平台【${targetPlatform}】的读者阅读偏好，为《${title || '未命名新书'}》打造：
1. 6 个极具点击欲与留存吸引力的备选商业书名（涵盖反差型、悬念情绪型、直接卖点型）；
2. 一段 240~340 字的【黄金买量简介】（开头第一句立住极致反差/冲突身份，中段抛出核心爽点或情感拉扯钩子，结尾留白引爆好奇心，附上阅读排雷/看点提示）。

严格输出纯 JSON 对象：
{
  "alternateTitles": ["书名1", "书名2", "书名3", "书名4", "书名5", "书名6"],
  "commercialBlurb": "黄金商业简介正文"
}`,
          },
        ],
        temperature: 0.82,
      });

      const clean = (res.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
      const fb = clean.indexOf('{');
      const lb = clean.lastIndexOf('}');
      const parsed = JSON.parse(fb >= 0 && lb > fb ? clean.slice(fb, lb + 1) : clean);
      if (Array.isArray(parsed.alternateTitles)) {
        setAlternateTitles(parsed.alternateTitles.filter(Boolean));
      }
      if (parsed.commercialBlurb) {
        setCommercialBlurb(parsed.commercialBlurb);
      }
      notify(`已按「${targetPlatform}」商业调性生成备选书名与黄金简介`, 'success');
    } catch (err: any) {
      notify(`生成商业包装失败：${err.message || '网络异常'}`, 'error');
    } finally {
      setIsGeneratingPackaging(false);
    }
  };

  // Run Qualitative Chief Editor Signing Review (Req 3.4 - No fake cockpit numbers!)
  const handleRunEditorialSigningReview = async () => {
    if (!outline.trim()) {
      notify('请先填写故事大纲后再执行签约内投审稿', 'error');
      return;
    }
    setIsRunningSigningReview(true);
    notify(`正在以「${targetPlatform}」责编签约标准审阅大纲、11大设定模块与前三章细纲...`, 'info');
    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: `你是「${targetPlatform}」资深签约主编，擅长一针见血指出网文内投稿件在商业卖点、黄金三章留存、人设辨识度、长线追读动力与设定自洽度上的优缺点，并给出可直接落地的改稿建议。不要输出虚假数字打分，只输出专业主编审稿意见。`,
        customSettings: {
          title,
          genre,
          style,
          outline,
          characters,
          world,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
          volumePlan,
          chapterOutlines,
          targetPlatform,
          commercialBlurb,
        },
        globalSkills,
        xpPreferences,
      });

      const firstFiveOutlines = [...chapterOutlines]
        .sort((a, b) => a.chapterIndex - b.chapterIndex)
        .slice(0, 5)
        .map((c) => `第${c.chapterIndex}章《${c.title}》：${c.summary}（钩子：${c.hookNote || '无'}）`)
        .join('\n');

      const sampleChapExcerpt =
        currentBook && currentBook.chapters.length > 0
          ? `\n【第一章已写正文节选】\n${(currentBook.chapters[0].text || '').slice(0, 1800)}`
          : '';

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          {
            role: 'user',
            content: `请对以下拟投往【${targetPlatform}】的作品进行签约级主编审稿诊断：
书名：《${title || '未定书名'}》
商业简介：${commercialBlurb || '（未填写商业简介）'}
前五章细纲：
${firstFiveOutlines || '（尚未生成分章细纲）'}${sampleChapExcerpt}

请按以下五个维度输出条理清晰、一针见血的审稿意见（纯文本分段，不要输出虚假百分比或数字打分）：
一、【签约潜力定性与核心长板】
二、【书名与商业简介吸量诊断】
三、【黄金三章开局切入点与情绪留存评估】
四、【11大设定模块与大纲潜在逻辑隐患/中期崩盘风险】
五、【过稿可执行修改清单（按优先级列出3~5条具体改法）】`,
          },
        ],
        temperature: 0.72,
      });

      setSigningReviewReport((res.content || '').trim());
      notify(`已完成「${targetPlatform}」签约主编审稿评估`, 'success');
    } catch (err: any) {
      notify(`签约审稿评估失败：${err.message || '请检查 API 配置'}`, 'error');
    } finally {
      setIsRunningSigningReview(false);
    }
  };

  // Extract Lorebook 2.0 entries independently (strictly respects xpSystemEnabled)
  const handleExtractLorebookFromOutline = async () => {
    if (!outline.trim() && !characters.trim()) {
      notify('请先填写故事大纲或主要角色设定后再执行智能提取', 'error');
      return;
    }

    setIsExtractingLore(true);
    notify(
      xpSystemEnabled
        ? '正在从大纲与 XP 宪法中拆解常驻角色卡与按需触发的 XP 情境卡...'
        : '正在从大纲与 11 大系统设定中拆解常驻角色卡、世界法则与场景细节卡...',
      'info'
    );

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: '你是一位精通人物塑造与动态世界书架构的小说设定师。',
        customSettings: {
          title,
          genre,
          style,
          outline,
          characters,
          world,
          skills,
          xpSystemEnabled,
          bookXpNote,
          systemSettings,
          systemCustomNotes,
        },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${outline}\n${characters}`,
      });

      const prompt = `请根据当前作品大纲与角色表${xpSystemEnabled ? '以及 XP 审美宪法' : '（当前已关闭 XP 系统，严禁生成 xp_trope）'}，提炼 4~6 条结构化【Lorebook 2.0 世界书档案】：
- 将核心主角与重要配角设为 "activationMode": "constant"（常驻注入）；
- ${
        xpSystemEnabled
          ? '将特定互动梗、特殊情境张力（如生病照顾、吃醋失控、伤口处理、雨夜同处等）拆分为独立的 "xp_trope" 或 "scene_pack"，设为 "activationMode": "keyword" 并附上触发关键词数组！'
          : '将特定副本规则、宗门/组织铁律或关键场景设为 "world_rule" 或 "scene_pack"，设为 "activationMode": "keyword" 并附上触发关键词数组！'
      }

严格输出纯 JSON 数组（不要包裹代码块）：
[
  {
    "name": "条目名称",
    "entryType": "character | ${xpSystemEnabled ? 'xp_trope | ' : ''}world_rule | scene_pack",
    "activationMode": "constant | keyword",
    "keywords": ["触发词1", "触发词2"],
    "appearance": "视觉与外貌细节",
    "personality": "性格反差与心理内核",
    "behaviorQuirks": "微动作习惯与语气特征",
    "mustIncludeTaboos": "必写细节与绝对禁忌"
  }
]`;

      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.75,
      });

      const cleanJson = (res.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
      const entries = JSON.parse(cleanJson);

      if (Array.isArray(entries) && entries.length > 0) {
        const validTypes: LorebookEntryType[] = xpSystemEnabled
          ? ['character', 'xp_trope', 'world_rule', 'scene_pack']
          : ['character', 'world_rule', 'scene_pack'];
        const newLoreEntries: LorebookEntry[] = entries
          .filter((e: any) => xpSystemEnabled || e?.entryType !== 'xp_trope')
          .map((e: any) => ({
            id: generateUUID(),
            name: e.name || '世界书档案',
            entryType: validTypes.includes(e.entryType) ? e.entryType : 'character',
            activationMode: e.activationMode === 'keyword' ? 'keyword' : 'constant',
            keywords: Array.isArray(e.keywords) ? e.keywords.filter(Boolean) : [],
            appearance: e.appearance || '',
            personality: e.personality || '',
            behaviorQuirks: e.behaviorQuirks || '',
            mustIncludeTaboos: e.mustIncludeTaboos || '',
            enabled: true,
          }));

        setLorebook((prev) => {
          const existingNames = new Set(prev.map((p) => p.name));
          const uniqueNew = newLoreEntries.filter((n) => !existingNames.has(n.name));
          return [...prev, ...uniqueNew];
        });
        notify(`已成功提取并挂载 ${newLoreEntries.length} 条世界书档案`, 'success');
      }
    } catch (err: any) {
      notify(`提取世界书失败：${err.message || '格式解析或网络异常'}`, 'error');
    } finally {
      setIsExtractingLore(false);
    }
  };

  // Style & History Handlers (Smart UTF-8 / GB18030 decoding to eliminate Chinese txt mojibake)
  const handleStyleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const decoded = await readFileTextSmart(file);
      setStyleReference(decoded);
      notify(`已无损载入文风参考文件：${file.name}`, 'success');
    } catch {
      notify('读取文风文件失败，请确认文件为纯文本格式', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleSaveStyleSnapshot = async () => {
    if (!styleReference.trim()) return;
    await dbPut(STORE_NAMES.STYLE_HISTORY, { content: styleReference.trim(), createdAt: Date.now() });
    await loadHistories();
    notify(`文风样本已存入历史快照（共 ${styleReference.trim().length} 字）`, 'success');
  };

  const handleSavePersonaSnapshot = async () => {
    if (!aiPersona.trim()) return;
    await dbPut(STORE_NAMES.PERSONA_HISTORY, { content: aiPersona.trim(), createdAt: Date.now() });
    await loadHistories();
    notify('执笔人设指令已保存至模板库', 'success');
  };

  const buildSettingsPayload = (): BookSettings => {
    const resolvedGenre =
      genre.trim() ||
      (systemSettings['foundation.genre_types'] || []).slice(0, 3).join(' / ') ||
      '未分类网文';

    return {
      genre: resolvedGenre,
      style: style.trim(),
      chapterWords: Number(chapterWords) || 3500,
      pov,
      tense,
      temperature: Number(temperature) || 0.85,
      contextMemory: Number(contextMemory) ?? 4,
      aiPersona: aiPersona.trim(),
      outline: outline.trim(),
      characters: characters.trim(),
      world: world.trim(),
      styleReference: styleReference.trim() || null,
      activeDistilledStyle,
      autoZhuqueDeslop,
      lorebook,
      skills,
      xpSystemEnabled,
      bookXpNote: bookXpNote.trim(),
      systemSettings,
      systemCustomNotes,
      lastSyncedSettingsHash,
      systemSettingsDirty,
      masterOutlineSpec,
      volumePlan,
      storyUnits,
      chapterOutlines,
      characterGraph,
      keyItemRegistry,
      foreshadowLedger,
      targetPlatform,
      commercialBlurb: commercialBlurb.trim(),
      alternateTitles,
      signingReviewReport,
    };
  };

  // Save settings to current book OR save as a 0-chapter planned book in shelf anytime!
  const handleSaveAllSettings = async () => {
    const cleanTitle = title.trim() || '未命名签约企划案';
    const payload = buildSettingsPayload();
    if (!genre.trim() && payload.genre) {
      setGenre(payload.genre);
    }

    if (currentBook) {
      onUpdateBookSettings(payload, cleanTitle);
      notify(`《${cleanTitle}》的 11 大系统设定、XP 开关、分章细纲与世界书已保存生效！`, 'success');
      return;
    }

    if (onSaveDraftBook) {
      const draftBook: Book = {
        id: generateUUID(),
        title: cleanTitle,
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
        chapters: [],
        archivedChapters: [],
        summaries: [],
        settings: payload,
      };
      if (!title.trim()) setTitle(cleanTitle);
      await onSaveDraftBook(draftBook);
      notify(`已将《${cleanTitle}》立项设定完整保存至书架（随时可继续完善细纲或开始生成章节）！`, 'success');
    }
  };

  const handleStartWriting = () => {
    if (!title.trim()) {
      notify('请先填写作品书名', 'error');
      return;
    }
    const resolvedGenre =
      genre.trim() || (systemSettings['foundation.genre_types'] || []).slice(0, 3).join(' / ');
    if (!resolvedGenre) {
      notify('请填写作品核心题材（或在 11 大模块「基础设定 → 题材类型」中勾选）', 'error');
      setSetupSection('core');
      return;
    }
    if (!outline.trim()) {
      notify('请先填写或用 AI 完善故事核心大纲', 'error');
      setSetupSection('core');
      return;
    }

    // If currentBook already has chapters, save latest settings and let user continue in WriterView;
    // Wait: if currentBook.chapters.length > 0 and user comes from chapter-outlines "进入章节生成", we should update settings & jump or start new book depending on action!
    const payload = buildSettingsPayload();
    const bookId = currentBook && currentBook.chapters.length === 0 ? currentBook.id : generateUUID();
    const bookToStart: Book = {
      id: bookId,
      title: title.trim(),
      createdAt: currentBook && currentBook.chapters.length === 0 ? currentBook.createdAt : Date.now(),
      lastModifiedAt: Date.now(),
      chapters: [],
      archivedChapters: currentBook && currentBook.chapters.length === 0 ? currentBook.archivedChapters : [],
      summaries: currentBook && currentBook.chapters.length === 0 ? currentBook.summaries : [],
      settings: payload,
    };

    onStartWritingFirstChapter(bookToStart);
  };

  const handleProceedFromOutlinesToWriter = () => {
    if (currentBook && currentBook.chapters.length > 0) {
      // Save updated outlines & settings to existing serialized book, then inform user or jump
      onUpdateBookSettings(buildSettingsPayload(), (title || currentBook.title).trim());
      notify('章节细纲与 11 大系统设定已保存至本书！请点击顶部「正文创作」继续单章或批量连写。', 'success');
      return;
    }
    handleStartWriting();
  };

  const enabledLoreCount = lorebook.filter((l) => l.enabled).length;
  const enabledSkillCount = skills.filter((s) => s.enabled).length;
  const configuredMatrixFields = useMemo(
    () => countConfiguredSystemFields(systemSettings).configuredFields,
    [systemSettings]
  );

  const bookPreviewForExport: Book = useMemo(
    () => ({
      id: currentBook?.id || 'draft-preview',
      title: title.trim() || currentBook?.title || '未命名新书企划',
      createdAt: currentBook?.createdAt || Date.now(),
      lastModifiedAt: Date.now(),
      chapters: currentBook?.chapters || [],
      archivedChapters: currentBook?.archivedChapters || [],
      summaries: currentBook?.summaries || [],
      settings: buildSettingsPayload(),
    }),
    [
      currentBook,
      title,
      genre,
      style,
      chapterWords,
      pov,
      tense,
      temperature,
      contextMemory,
      aiPersona,
      outline,
      characters,
      world,
      styleReference,
      activeDistilledStyle,
      autoZhuqueDeslop,
      lorebook,
      skills,
      xpSystemEnabled,
      bookXpNote,
      systemSettings,
      systemCustomNotes,
      masterOutlineSpec,
      volumePlan,
      storyUnits,
      chapterOutlines,
      characterGraph,
      keyItemRegistry,
      foreshadowLedger,
      targetPlatform,
      commercialBlurb,
      alternateTitles,
      signingReviewReport,
    ]
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Top Editorial Header & Book Title */}
      <section className="studio-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">
              {currentBook && currentBook.chapters.length > 0
                ? `连载签约工程维护 · 已完稿 ${currentBook.chapters.length} 章 · 已细化 ${configuredMatrixFields}/${TOTAL_SYSTEM_FIELD_COUNT} 项系统设定`
                : `商业签约级小说立项中枢 · 11大模块(${configuredMatrixFields}/${TOTAL_SYSTEM_FIELD_COUNT}) · 分章细纲(${chapterOutlines.length}章)`}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
              {currentBook ? `《${title || currentBook.title}》体系化工程设定` : '创建商业签约级小说工程'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:opacity-90 text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                挂载透视 ({xpSystemEnabled ? 'XP开' : 'XP关'} · {enabledSkillCount}技能 · {enabledLoreCount}档案)
              </span>
            </button>

            <button
              type="button"
              onClick={handleSaveAllSettings}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{currentBook ? '保存全部设定' : '保存立项至书架'}</span>
            </button>

            <button
              type="button"
              onClick={handleStartWriting}
              className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Feather className="w-3.5 h-3.5" />
              <span>
                {currentBook && currentBook.chapters.length > 0 ? '以此设定另起新书' : '创建并扩写第一章'}
              </span>
            </button>
          </div>
        </div>

        {/* Per-Book XP System Switch Banner (Requirement 5) */}
        <NovelXpSystemBanner
          xpSystemEnabled={xpSystemEnabled}
          onToggleXpSystem={(next) => {
            setXpSystemEnabled(next);
            notify(
              next
                ? '已开启本书 XP 审美基底系统：大纲推演、细纲与章节生成将以 XP 宪法为底层创作锚点'
                : '已关闭本书 XP 系统：全链路物理隔离个人 XP 宪法、XP 世界书与偏好技能，保持纯净商业叙事',
              'info'
            );
          }}
          bookXpNote={bookXpNote}
          onChangeBookXpNote={setBookXpNote}
          globalXpPreferences={xpPreferences}
        />

        {/* Title & Genre Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              作品书名 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入小说书名（也可在「平台签约与伏笔」生成高点击备选书名）..."
              className="studio-input w-full px-3.5 py-2.5 text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              核心题材标签 *
            </label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="例：都市高武 / 古言权谋 / 规则怪谈"
              className="studio-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Global Dirty Warning Strip if critical settings changed while on another tab */}
        {systemSettingsDirty && setupSection !== 'matrix' && (
          <div className="p-3.5 rounded-xl border border-amber-500/45 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                检测到您手动修改了「11大系统设定模块」中的核心骨架设定，随意更改关键设定可能导致大纲与后续剧情前后矛盾。建议立即让 AI 按最新设定重新校准大纲！
              </span>
            </div>
            <button
              type="button"
              disabled={isImprovingOutline}
              onClick={handleRealignOutlineFromSettings}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isImprovingOutline ? '校准大纲中...' : 'AI 按最新设定校准大纲'}
            </button>
          </div>
        )}

        {/* Status Feedback Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              statusMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                : statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-[var(--bg-muted)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
          >
            <span className="leading-relaxed">{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 7-Tab Systematic Architecture Sub-navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-[var(--border-subtle)]">
          {[
            { id: 'core', label: '01 大纲与核心参数', icon: Sliders },
            {
              id: 'matrix',
              label: `02 11大系统设定矩阵 (${configuredMatrixFields}/${TOTAL_SYSTEM_FIELD_COUNT})${systemSettingsDirty ? ' · 待校准' : ''}`,
              icon: Layers,
            },
            {
              id: 'chapter-outlines',
              label: `03 四层拆纲与关联图谱 (${chapterOutlines.length}章)`,
              icon: ListOrdered,
            },
            {
              id: 'signing',
              label: `04 平台签约与伏笔 (${foreshadowLedger.filter((f) => f.status !== 'resolved').length})`,
              icon: Award,
            },
            { id: 'lorebook', label: `05 世界书 (${enabledLoreCount}/${lorebook.length})`, icon: BookMarked },
            { id: 'skills', label: `06 SKILL挂载 (${enabledSkillCount}/${skills.length})`, icon: Zap },
            {
              id: 'style',
              label: `07 执笔人设与文风蒸馏${activeDistilledStyle ? ' · 已挂载' : ''}`,
              icon: FileText,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = setupSection === tab.id;
            return (
              <MotionButton
                key={tab.id}
                type="button"
                onClick={() => setSetupSection(tab.id as any)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </MotionButton>
            );
          })}
        </div>
      </section>

      {/* SECTION 1: Core Parameters & Outline */}
      {setupSection === 'core' && (
        <div className="space-y-6">
          <section className="studio-card p-5 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">故事主线大纲 *</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  点击右侧按钮，AI 将{xpSystemEnabled ? '以 XP 宪法为基底' : '按纯净商业平台标准'}深度完善大纲，并同步为「11大系统设定矩阵」自动勾选对应板块、提取分卷蓝图与世界书！
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSetupSection('matrix')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>查看 11 大系统设定 ({configuredMatrixFields})</span>
                </button>

                <MotionButton
                  type="button"
                  disabled={isImprovingOutline}
                  onClick={handleImproveOutline}
                  className="btn-primary min-h-[44px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isImprovingOutline ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>深度推演并勾选11大模块...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 完善大纲 + 自动勾选11大设定</span>
                    </>
                  )}
                </MotionButton>
              </div>
            </div>

            <textarea
              rows={11}
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder="写下你的故事核心梗概、攻受/男女主相遇契机、核心矛盾与阶段转折。即使只有两三百字草稿，点击右上角「AI 完善大纲并提取世界书」即可一键生成完整连载蓝图..."
              className="studio-input w-full p-4 text-sm leading-relaxed"
            />

            {outlineHistory.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <select
                  value={selectedOutlineId}
                  onChange={(e) => setSelectedOutlineId(e.target.value)}
                  className="studio-input flex-1 min-h-[42px] px-3 py-2 text-xs"
                >
                  <option value="">回滚至历史大纲快照 ({outlineHistory.length})...</option>
                  {outlineHistory.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {new Date(o.ts || o.createdAt || Date.now()).toLocaleString()} · {(o.text || o.content || '').slice(0, 36)}...
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedOutlineId}
                  onClick={() => {
                    const found = outlineHistory.find((o) => String(o.id) === selectedOutlineId);
                    if (found && (found.text || found.content)) {
                      setOutline((found.text || found.content) as string);
                      notify('已恢复至所选历史大纲版本', 'info');
                    }
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  恢复此版本
                </button>
              </div>
            )}
          </section>

          <section className="studio-card p-5 sm:p-7 space-y-5">
            <h2 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3">
              叙事规格与角色世界观
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  基调与文风取向
                </label>
                <input
                  type="text"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="例：冷冽克制、暗潮汹涌、轻松日常带刀"
                  className="studio-input w-full px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  单章目标字数 (<span className="tabular-nums">{chapterWords}</span> 字)
                </label>
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={chapterWords}
                  onChange={(e) => setChapterWords(e.target.value)}
                  className="studio-input w-full px-3.5 py-2.5 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  叙事视角与时态
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={pov}
                    onChange={(e) => setPov(e.target.value)}
                    className="studio-input px-3 py-2.5 text-xs"
                  >
                    <option value="第三人称">第三人称</option>
                    <option value="第一人称">第一人称</option>
                  </select>
                  <select
                    value={tense}
                    onChange={(e) => setTense(e.target.value)}
                    className="studio-input px-3 py-2.5 text-xs"
                  >
                    <option value="现在时">现在时</option>
                    <option value="过去时">过去时</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  发散创造度 Temperature: <span className="tabular-nums font-semibold">{temperature}</span>
                </label>
                <input
                  type="range"
                  min={0.2}
                  max={1.5}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full accent-[var(--accent)] my-2"
                />
                <p className="text-[11px] text-[var(--text-muted)]">建议 0.80 ~ 0.95，兼顾逻辑严密与遣词灵气</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  滑动记忆窗口：最近 <span className="tabular-nums font-semibold">{contextMemory}</span> 章 + 全部阶段分卷总结
                </label>
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={1}
                  value={contextMemory}
                  onChange={(e) => setContextMemory(e.target.value)}
                  className="w-full accent-[var(--accent)] my-2"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  系统对上一章保留首尾关键接续现场，对更早章节提取浓缩回顾，防止全量回灌造成车轱辘话。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  主要角色设定表
                </label>
                <textarea
                  rows={5}
                  value={characters}
                  onChange={(e) => setCharacters(e.target.value)}
                  placeholder="主角与重要配角的身份、性格反差、关系张力..."
                  className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  世界观与底层规则
                </label>
                <textarea
                  rows={5}
                  value={world}
                  onChange={(e) => setWorld(e.target.value)}
                  placeholder="时代背景、特殊能力体系、社会铁律或禁忌..."
                  className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed"
                />
              </div>
            </div>

            {/* Workflow Step Footer inside Core Section */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[var(--text-muted)]">
                规范化创作流：01 完善大纲 → 02 核查11大系统设定矩阵 → 03 一键生成章节细纲 → 正文单章/多章连写
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSetupSection('matrix')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  下一步：核查 11 大系统设定 →
                </button>
                <button
                  type="button"
                  onClick={() => setSetupSection('chapter-outlines')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] font-semibold cursor-pointer"
                >
                  前往章节细纲创作台 →
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* SECTION 02: 11-Module × 20-Item Fine-Grained Novel System Matrix */}
      {setupSection === 'matrix' && (
        <NovelElevenModulesMatrix
          systemSettings={systemSettings}
          systemCustomNotes={systemCustomNotes}
          systemSettingsDirty={systemSettingsDirty}
          isSyncingOutline={isImprovingOutline}
          onUpdateFieldValues={handleUpdateMatrixFieldValues}
          onUpdateModuleCustomNote={handleUpdateModuleCustomNote}
          onAiAutoPopulateFromOutline={handleImproveOutline}
          onAiRealignOutlineFromSettings={handleRealignOutlineFromSettings}
          onSaveSettingsNow={handleSaveAllSettings}
        />
      )}

      {/* SECTION 03: Four-Layer Rolling Outline & Universal Cross-Entity Graph */}
      {setupSection === 'chapter-outlines' && (
        <FourLayerOutlineWorkspace
          bookTitle={title || currentBook?.title || '未命名新书企划'}
          genre={genre}
          style={style}
          outline={outline}
          characters={characters}
          world={world}
          xpEnabled={xpSystemEnabled}
          xpSummary={`${xpPreferences || ''}\n${bookXpNote || ''}`.trim()}
          draftedChapterCount={currentBook?.chapters.length || 0}
          masterOutlineSpec={masterOutlineSpec}
          onChangeMasterSpec={setMasterOutlineSpec}
          volumePlan={volumePlan}
          onChangeVolumePlan={setVolumePlan}
          storyUnits={storyUnits}
          onChangeStoryUnits={setStoryUnits}
          chapterOutlines={chapterOutlines}
          onChangeChapterOutlines={setChapterOutlines}
          characterGraph={characterGraph}
          onChangeCharacterGraph={setCharacterGraph}
          keyItemRegistry={keyItemRegistry}
          onChangeKeyItemRegistry={setKeyItemRegistry}
          foreshadowLedger={foreshadowLedger}
          onChangeForeshadowLedger={setForeshadowLedger}
          lorebook={lorebook}
          onChangeLorebook={setLorebook}
          configs={configs}
          uiSettings={uiSettings}
          onJumpToWriter={handleProceedFromOutlinesToWriter}
        />
      )}

      {/* SECTION 04: Platform Signing Review, Commercial Packaging & Foreshadow Ledger */}
      {setupSection === 'signing' && (
        <NovelSigningSubmissionHub
          bookPreview={bookPreviewForExport}
          targetPlatform={targetPlatform}
          onChangeTargetPlatform={setTargetPlatform}
          commercialBlurb={commercialBlurb}
          onChangeCommercialBlurb={setCommercialBlurb}
          alternateTitles={alternateTitles}
          onApplyAlternateTitle={(newTitle) => {
            setTitle(newTitle);
            notify(`已采用书名《${newTitle}》`, 'success');
          }}
          foreshadowLedger={foreshadowLedger}
          onUpdateForeshadowLedger={setForeshadowLedger}
          signingReviewReport={signingReviewReport}
          isGeneratingPackaging={isGeneratingPackaging}
          isRunningSigningReview={isRunningSigningReview}
          onGenerateCommercialPackaging={handleGenerateCommercialPackaging}
          onRunEditorialSigningReview={handleRunEditorialSigningReview}
          onNotify={notify}
        />
      )}

      {/* SECTION 05: Lorebook 2.0 */}
      {setupSection === 'lorebook' && (
        <section className="studio-card p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                角色与癖好动态世界书 (Lorebook 2.0)
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                支持「常驻核心」与「关键词触发」双模式：主角核心人设保持常驻，特定 XP 情境卡（如生病、雨夜、浴室）仅在章节走向出现对应关键词时自动唤醒注入，彻底解决每章重复套路。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <MotionButton
                type="button"
                disabled={isExtractingLore}
                onClick={handleExtractLorebookFromOutline}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:opacity-90 text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isExtractingLore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>智能拆解中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>从大纲与XP自动生成</span>
                  </>
                )}
              </MotionButton>

              <MotionButton
                type="button"
                onClick={handleOpenAddLoreModal}
                className="btn-primary min-h-[44px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新建档案卡</span>
              </MotionButton>
            </div>
          </div>

          {lorebook.length === 0 ? (
            <div className="py-12 px-4 text-center studio-muted space-y-3">
              <BookMarked className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
              <p className="text-sm text-[var(--text-secondary)]">当前作品尚未建立世界书卡片</p>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                无需逐字手填：先在「大纲与核心参数」写下故事梗概，点击上方「从大纲与XP自动生成」即可自动拆分常驻人设卡与情境触发卡。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lorebook.map((item, idx) => {
                const typeLabel = LORE_TYPE_LABELS[item.entryType || 'character'];
                const modeLabel =
                  item.activationMode === 'keyword'
                    ? `关键词触发 (${(item.keywords || []).join('/') || '未设词'})`
                    : '全程常驻';

                return (
                  <StaggerCard
                    key={item.id}
                    index={idx}
                    onContextMenu={(e) =>
                      openContextMenu(e, `世界书 · ${item.name}`, [
                        {
                          id: 'toggle-lore',
                          label: item.enabled ? '暂停挂载该档案卡' : '启用挂载该档案卡',
                          icon: <Check className="w-3.5 h-3.5" />,
                          onSelect: () => handleToggleLoreEntry(item.id),
                        },
                        {
                          id: 'edit-lore',
                          label: '编辑世界书详情与触发词',
                          icon: <Edit3 className="w-3.5 h-3.5" />,
                          onSelect: () => handleOpenEditLoreModal(item),
                        },
                        {
                          id: 'copy-lore',
                          label: '复制角色/XP细节文本',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => {
                            navigator.clipboard?.writeText(
                              `【${item.name}】\n视觉：${item.appearance}\n内核：${item.personality}\n癖好反应：${item.behaviorQuirks}`
                            );
                            triggerQuickToast(`已复制「${item.name}」设定`);
                          },
                        },
                        {
                          id: 'del-lore',
                          label: '移除该世界书条目',
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          dividerBefore: true,
                          onSelect: () => handleDeleteLoreEntry(item.id),
                        },
                      ])
                    }
                    className={`p-4 rounded-xl border transition-opacity flex flex-col justify-between gap-3 studio-card-hover ${
                      item.enabled
                        ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                        : 'bg-[var(--bg-muted)] border-[var(--border-subtle)] opacity-55'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={() => handleToggleLoreEntry(item.id)}
                            className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer shrink-0"
                          />
                          <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                            {item.name}
                          </span>
                        </label>

                        <div className="flex items-center gap-1 shrink-0">
                          <MotionButton
                            type="button"
                            onClick={() => handleOpenEditLoreModal(item)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                            title="编辑档案"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </MotionButton>
                          <MotionButton
                            type="button"
                            onClick={() => handleDeleteLoreEntry(item.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10"
                            title="删除档案"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </MotionButton>
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--text-muted)]">
                        {typeLabel} · {modeLabel}
                      </p>

                      <div className="text-xs text-[var(--text-secondary)] space-y-1 leading-relaxed pt-1">
                        {item.appearance && <p><span className="font-medium text-[var(--text-primary)]">视觉：</span>{item.appearance}</p>}
                        {item.personality && <p><span className="font-medium text-[var(--text-primary)]">内核：</span>{item.personality}</p>}
                        {item.behaviorQuirks && <p><span className="font-medium text-[var(--text-primary)]">癖好反应：</span>{item.behaviorQuirks}</p>}
                        {item.mustIncludeTaboos && <p><span className="font-medium text-[var(--text-primary)]">必写与禁忌：</span>{item.mustIncludeTaboos}</p>}
                      </div>
                    </div>
                  </StaggerCard>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: SKILL 2.0 Mounting */}
      {setupSection === 'skills' && (
        <section className="studio-card p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                SKILL 2.0 规范化写作技能挂载
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                兼容完整多文件 <code className="font-mono">.zip</code> 工程包（含 <code className="font-mono">SKILL.md</code> + <code className="font-mono">references/</code> 按需渐进路由）及单文件 <code className="font-mono">.md</code>，自动识别 UTF-8 / GB18030 编码杜绝乱码。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>导入 SKILL (.zip / .md)</span>
                <input
                  type="file"
                  accept=".zip,.md,.txt"
                  multiple
                  onChange={handleImportSkillMdFiles}
                  className="hidden"
                />
              </label>

              {confirmResetSkills ? (
                <div className="flex items-center gap-1">
                  <MotionButton
                    type="button"
                    onClick={handleResetPresetSkills}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    确认恢复预设
                  </MotionButton>
                  <MotionButton
                    type="button"
                    onClick={() => setConfirmResetSkills(false)}
                    className="min-h-[42px] px-2.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs"
                  >
                    取消
                  </MotionButton>
                </div>
              ) : (
                <MotionButton
                  type="button"
                  onClick={() => setConfirmResetSkills(true)}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  恢复官方预设
                </MotionButton>
              )}

              <MotionButton
                type="button"
                onClick={handleOpenAddSkillModal}
                className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新建 SKILL</span>
              </MotionButton>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map((skill, idx) => {
              const scopes = (skill.scopes && skill.scopes.length > 0 ? skill.scopes : ['chapter', 'polish'])
                .map((s) => SCOPE_LABELS[s])
                .join(' / ');
              const triggerDesc =
                skill.triggerMode === 'keyword'
                  ? `关键词触发 (${(skill.keywords || []).slice(0, 4).join('、')}${(skill.keywords || []).length > 4 ? '…' : ''})`
                  : '常驻激活';
              const refCount = skill.references?.length || 0;
              const isZipPkg = skill.packageType === 'zip-package' || refCount > 0;

              return (
                <StaggerCard
                  key={skill.id}
                  index={idx}
                  onContextMenu={(e) =>
                    openContextMenu(e, `SKILL · ${skill.name}`, [
                      {
                        id: 'toggle-skill',
                        label: skill.enabled ? '在本书停用该 SKILL' : '在本书启用该 SKILL',
                        icon: <Check className="w-3.5 h-3.5" />,
                        onSelect: () => handleToggleSkill(skill.id),
                      },
                      {
                        id: 'inspect-pkg',
                        label: isZipPkg
                          ? `检视工程包与参考路由 (${refCount} 份文档)`
                          : '检视 SKILL 结构与契约详情',
                        icon: <FolderTree className="w-3.5 h-3.5" />,
                        onSelect: () => setInspectingSkill(skill),
                      },
                      {
                        id: 'edit-skill',
                        label: '编辑 SKILL 指令与触发范围',
                        icon: <Edit3 className="w-3.5 h-3.5" />,
                        onSelect: () => handleOpenEditSkillModal(skill),
                      },
                      {
                        id: 'export-md',
                        label: isZipPkg ? '导出完整 .skill.zip 工程包' : '导出标准 SKILL.md',
                        icon: <Download className="w-3.5 h-3.5" />,
                        onSelect: () => handleExportSingleSkillMd(skill),
                      },
                      {
                        id: 'copy-prompt',
                        label: '复制规则指令正文',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        onSelect: () => {
                          navigator.clipboard?.writeText(skill.promptInstruction);
                          triggerQuickToast(`已复制「${skill.name}」指令`);
                        },
                      },
                      {
                        id: 'del-skill',
                        label: '从技能库彻底删除',
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        onSelect: () => handleDeleteSkill(skill.id),
                      },
                    ])
                  }
                  className={`p-4 rounded-xl border transition-opacity flex flex-col justify-between gap-3 studio-card-hover ${
                    skill.enabled
                      ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                      : 'bg-[var(--bg-muted)] border-[var(--border-subtle)] opacity-55'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={() => handleToggleSkill(skill.id)}
                          className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer shrink-0"
                        />
                        <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {skill.name}
                          {skill.version && (
                            <span className="ml-1.5 font-mono text-[11px] font-normal text-[var(--text-muted)]">
                              v{skill.version}
                            </span>
                          )}
                        </span>
                      </label>

                      <div className="flex items-center gap-1 shrink-0">
                        <MotionButton
                          type="button"
                          onClick={() => setInspectingSkill(skill)}
                          className="min-h-[36px] px-2 flex items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title="检视技能包结构与参考文档按需路由"
                        >
                          <FolderTree className="w-3.5 h-3.5" />
                          {refCount > 0 && <span className="tabular-nums">{refCount}</span>}
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={() => handleExportSingleSkillMd(skill)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title={isZipPkg ? '导出 .skill.zip 工程包' : '导出为标准 SKILL.md'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={() => handleOpenEditSkillModal(skill)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title="编辑 SKILL"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={() => handleDeleteSkill(skill.id)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10"
                          title="删除 SKILL"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </MotionButton>
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isZipPkg ? `ZIP工程包 (${refCount}参考路由)` : '单文件MD'} ·{' '}
                      {skill.ruleTier === 'advisory' ? '质量建议' : '结构契约'} ·{' '}
                      {CATEGORY_LABELS[skill.category || 'custom']} · {scopes} · {triggerDesc}
                    </p>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {skill.description}
                    </p>
                  </div>

                  <div className="p-2.5 studio-muted text-[11px] text-[var(--text-muted)] font-mono line-clamp-2">
                    {skill.promptInstruction}
                  </div>
                </StaggerCard>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 4: Persona & Style Reference */}
      {setupSection === 'style' && (
        <div className="space-y-6">
          <section className="studio-card p-5 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">本书执笔人设指令 (AI Persona)</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  建议在此仅放置文风职责与章节叙事原则，不要把几千字的固定体型差细节塞入此处（请放在全局 XP 宪法或世界书中）。
                </p>
              </div>
              <button
                type="button"
                onClick={handleSavePersonaSnapshot}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-muted)] whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                存为常用人设模板
              </button>
            </div>

            <textarea
              rows={6}
              value={aiPersona}
              onChange={(e) => setAiPersona(e.target.value)}
              className="studio-input w-full p-3.5 text-sm leading-relaxed"
            />

            {personaHistory.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  className="studio-input flex-1 min-h-[42px] px-3 py-2 text-xs"
                >
                  <option value="">加载已保存的执笔人设模板 ({personaHistory.length})...</option>
                  {personaHistory.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {(p.content || '').slice(0, 45)}...
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!selectedPersonaId}
                    onClick={() => {
                      const item = personaHistory.find((p) => String(p.id) === selectedPersonaId);
                      if (item?.content) {
                        setAiPersona(item.content);
                        notify('已载入执笔人设模板', 'info');
                      }
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium disabled:opacity-40"
                  >
                    载入
                  </button>
                  <button
                    type="button"
                    disabled={!selectedPersonaId}
                    onClick={async () => {
                      await dbDelete(STORE_NAMES.PERSONA_HISTORY, Number(selectedPersonaId));
                      setSelectedPersonaId('');
                      await loadHistories();
                      notify('已移除该人设模板', 'info');
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="studio-card p-5 sm:p-7">
            <StyleDistillationPanel
              activeProfile={activeDistilledStyle}
              onChangeActiveProfile={setActiveDistilledStyle}
              legacyStyleReference={styleReference || null}
              onClearLegacyStyleReference={() => setStyleReference('')}
              configs={configs}
              uiSettings={uiSettings}
              onRefreshGlobalSkills={onRefreshGlobalSkills}
            />
          </section>
        </div>
      )}

      {/* Lorebook 2.0 Modal (Bottom-Sheet on Mobile) */}
      {isLoreModalOpen && (
        <ModalPortal onEscape={() => setIsLoreModalOpen(false)}>
          <div
            onClick={() => setIsLoreModalOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {editingLoreEntry ? '编辑世界书档案卡' : '新建世界书档案卡 (Lorebook 2.0)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsLoreModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">条目名称 *</label>
                <input
                  type="text"
                  value={loreName}
                  onChange={(e) => setLoreName(e.target.value)}
                  placeholder="例：主攻·谢凛 / 情境锚点·高烧喂药失控"
                  className="studio-input w-full px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">条目类型</label>
                <select
                  value={loreType}
                  onChange={(e) => setLoreType(e.target.value as LorebookEntryType)}
                  className="studio-input w-full px-3 py-2.5 text-xs"
                >
                  <option value="character">角色核心档案</option>
                  <option value="xp_trope">XP 张力锚点</option>
                  <option value="scene_pack">特定情境细节包</option>
                  <option value="world_rule">世界观硬规则</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">唤醒策略</label>
                <select
                  value={loreActivation}
                  onChange={(e) => setLoreActivation(e.target.value as ActivationMode)}
                  className="studio-input w-full px-3 py-2.5 text-xs"
                >
                  <option value="constant">全程常驻（每章必带）</option>
                  <option value="keyword">关键词触发（命中时才注入）</option>
                </select>
              </div>

              {loreActivation === 'keyword' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    触发关键词（用逗号分隔，命中任意一词即自动注入本章）
                  </label>
                  <input
                    type="text"
                    value={loreKeywordsInput}
                    onChange={(e) => setLoreKeywordsInput(e.target.value)}
                    placeholder="例：发烧, 高烧, 喂药, 病弱, 咳嗽"
                    className="studio-input w-full px-3.5 py-2.5 text-xs"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">视觉与外貌特征</label>
                <textarea
                  rows={2}
                  value={loreAppearance}
                  onChange={(e) => setLoreAppearance(e.target.value)}
                  placeholder="身高体型、冷白或深麦肤色、穿着质感、眼神压迫感..."
                  className="studio-input w-full p-3 text-xs leading-relaxed"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">性格内核与反差</label>
                <textarea
                  rows={2}
                  value={lorePersonality}
                  onChange={(e) => setLorePersonality(e.target.value)}
                  placeholder="对外手腕与对内卑微克制的拉扯反差..."
                  className="studio-input w-full p-3 text-xs leading-relaxed"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">微动作癖好 / 语气 / XP 反应</label>
                <textarea
                  rows={2}
                  value={loreBehaviorQuirks}
                  onChange={(e) => setLoreBehaviorQuirks(e.target.value)}
                  placeholder="紧张时摩挲指节、将人整个拢进大衣、低哑克制的哄慰语气..."
                  className="studio-input w-full p-3 text-xs leading-relaxed"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">必写细节与绝对避雷红线</label>
                <textarea
                  rows={2}
                  value={loreMustIncludeTaboos}
                  onChange={(e) => setLoreMustIncludeTaboos(e.target.value)}
                  placeholder="本章触发时必须体现的细节，以及严禁OOC的底线..."
                  className="studio-input w-full p-3 text-xs leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsLoreModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveLoreEntry}
                className="btn-primary min-h-[44px] px-5 py-2 text-xs"
              >
                保存档案卡
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* SKILL 2.0 Modal (Bottom-Sheet on Mobile) */}
      {isSkillModalOpen && (
        <ModalPortal onEscape={() => setIsSkillModalOpen(false)}>
          <div
            onClick={() => setIsSkillModalOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {editingSkill ? '编辑 SKILL 2.0 技能规范' : '新建 SKILL 2.0 写作技能'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSkillModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">技能名称 *</label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="例：冷感留白叙事法"
                    className="studio-input w-full px-3.5 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">分类与权重</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={skillCategory}
                      onChange={(e) => setSkillCategory(e.target.value as SkillCategory)}
                      className="studio-input px-2.5 py-2.5 text-xs"
                    >
                      <option value="style">文风质感</option>
                      <option value="rule">硬性约束</option>
                      <option value="preference">审美张力</option>
                      <option value="structure">叙事结构</option>
                      <option value="custom">自定义</option>
                    </select>
                    <select
                      value={skillPriority}
                      onChange={(e) => setSkillPriority(e.target.value as 'high' | 'normal')}
                      className="studio-input px-2.5 py-2.5 text-xs"
                    >
                      <option value="high">核心高权重</option>
                      <option value="normal">常规权重</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">技能简要说明</label>
                <input
                  type="text"
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  placeholder="一句话描述这项技能解决什么写作痛点..."
                  className="studio-input w-full px-3.5 py-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  生效生命周期阶段 (Scopes)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['outline', 'chapter', 'reroll', 'polish'] as SkillScope[]).map((sc) => {
                    const checked = skillScopes.includes(sc);
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => handleToggleSkillScope(sc)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                          checked
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span>{SCOPE_LABELS[sc]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">规则层级</label>
                  <select
                    value={skillRuleTier}
                    onChange={(e) => setSkillRuleTier(e.target.value as SkillRuleTier)}
                    className="studio-input w-full px-3 py-2.5 text-xs"
                  >
                    <option value="contract">结构契约 (Contract · 硬性必守)</option>
                    <option value="advisory">质量建议 (Advisory · 弹性校准)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">触发模式</label>
                  <select
                    value={skillTriggerMode}
                    onChange={(e) => setSkillTriggerMode(e.target.value as 'always' | 'keyword')}
                    className="studio-input w-full px-3 py-2.5 text-xs"
                  >
                    <option value="always">常驻生效（在所选阶段始终注入）</option>
                    <option value="keyword">关键词按需触发（出现特定剧情词才注入）</option>
                  </select>
                </div>

                {skillTriggerMode === 'keyword' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">触发关键词（逗号分隔）</label>
                    <input
                      type="text"
                      value={skillKeywordsInput}
                      onChange={(e) => setSkillKeywordsInput(e.target.value)}
                      placeholder="例：亲吻, 拥抱, 发烧, 失控"
                      className="studio-input w-full px-3 py-2.5 text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    底层 Prompt 执行规则 *
                  </label>
                  <button
                    type="button"
                    disabled={isGeneratingSkillPrompt}
                    onClick={handleGenerateSkillInstructionWithAI}
                    className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {isGeneratingSkillPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>AI 辅助拟定规则</span>
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={skillInstruction}
                  onChange={(e) => setSkillInstruction(e.target.value)}
                  placeholder="明确写出 AI 必须遵守的句式、镜头原则与反面禁用示范..."
                  className="studio-input w-full p-3.5 text-xs font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSkillModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveSkill}
                className="btn-primary min-h-[44px] px-5 py-2 text-xs"
              >
                保存至全局技能库
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Prompt & SKILL Live Audit Inspector Modal */}
      {isAuditModalOpen && (
        <ModalPortal onEscape={() => setIsAuditModalOpen(false)}>
          <div
            onClick={() => setIsAuditModalOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-2xl max-h-[88dvh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Prompt 与 SKILL 真实挂载透视镜</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  实时核验各个创作环节真正注入给大模型的 System Prompt 与渐进式参考文档路由，杜绝“假开关”。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(['outline', 'chapter', 'reroll', 'polish'] as SkillScope[]).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setAuditPreviewScope(sc)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 ${
                    auditPreviewScope === sc
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                      : 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                  }`}
                >
                  模拟阶段：{SCOPE_LABELS[sc]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">本书 XP 审美基底开关</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  {!currentAuditReport.xpSystemEnabled
                    ? '已关闭（全链路物理隔离）'
                    : currentAuditReport.hasXpConstitution
                    ? `已开启并注入 (${currentAuditReport.xpLength} 字)`
                    : '已开启 (待填写XP内容)'}
                </p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">本阶段命中 SKILL</p>
                <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {currentAuditReport.activeSkills.length} 项生效 · {currentAuditReport.standbySkills.length} 项待命
                </p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">本阶段唤醒世界书</p>
                <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {currentAuditReport.activeLore.length} 条注入 · {currentAuditReport.standbyLore.length} 条按需待命
                </p>
              </div>
            </div>

            {currentAuditReport.activeSkills.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-primary)]">当前阶段实际注入的 SKILL 与按需子文档路由：</p>
                <div className="text-xs text-[var(--text-secondary)] space-y-1">
                  {currentAuditReport.activeSkills.map(({ skill, reason, matchedKeywords, activeRefs }) => (
                    <div key={skill.id} className="py-1.5 border-b border-[var(--border-subtle)] last:border-b-0 space-y-0.5">
                      <div>
                        <span className="font-medium text-[var(--text-primary)]">{skill.name}</span>
                        <span className="text-[var(--text-muted)]">
                          {' '}· {skill.ruleTier === 'advisory' ? '质量建议' : '结构契约'} ·{' '}
                          {reason === 'keyword' ? `命中词: ${matchedKeywords.join('/')}` : '常驻规则'}
                        </span>
                      </div>
                      {activeRefs && activeRefs.length > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)] pl-3">
                          ↳ 按需挂载参考库：{activeRefs.map((ar) => ar.doc.title).join('、')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                最终编译发送给 AI 的完整 System Prompt ({currentAuditReport.systemPrompt.length} 字符)：
              </p>
              <pre className="p-3.5 studio-muted text-[11px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {currentAuditReport.systemPrompt}
              </pre>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {inspectingSkill && (
        <SkillPackageInspectorModal
          skill={skills.find((s) => s.id === inspectingSkill.id) || inspectingSkill}
          onClose={() => setInspectingSkill(null)}
          onUpdateSkill={async (updated) => {
            await saveGlobalSkill(updated);
            await onRefreshGlobalSkills();
            setSkills((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setInspectingSkill(updated);
          }}
        />
      )}
    </div>
  );
};
