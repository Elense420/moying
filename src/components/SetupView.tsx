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
import { SkillPackageInspectorModal } from './SkillPackageInspectorModal';
import { MotionButton, StaggerCard } from './MotionPrimitives';
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
}) => {
  const [setupSection, setSetupSection] = useState<'core' | 'lorebook' | 'skills' | 'style'>('core');
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
      setLorebook(s.lorebook || []);
      setSkills(resolveBookSkills(currentBook, globalSkills));
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
      setLorebook([]);
      setSkills(globalSkills.map((g) => ({ ...g })));
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
        lorebook,
        skills,
      },
      globalSkills,
      xpPreferences,
      contextCorpus: `${title}\n${genre}\n${outline}\n${characters}`,
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
    lorebook,
    skills,
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

  // AI Deep Outline Refinement + Automatic Lorebook 2.0 Extraction (wired through promptEngine!)
  const handleImproveOutline = async () => {
    if (!outline.trim()) {
      notify('请先在大纲框内写下几句核心梗概或草稿，再交由 AI 深度完善', 'error');
      return;
    }

    await dbPut(STORE_NAMES.OUTLINE_HISTORY, { ts: Date.now(), text: outline.trim() });
    await loadHistories();

    setIsImprovingOutline(true);
    notify('AI 正在结合您的 XP 创作宪法与大纲类 SKILL 深度推演大纲并构建世界书...', 'info');

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader:
          '你是一位顶级小说主编与结构策划师。请严格结合创作者的 XP 审美宪法、已挂载的大纲 SKILL 规范，深度扩充大纲并结构化提取角色表、世界观与世界书档案（Lorebook 2.0）。',
        customSettings: {
          title,
          genre,
          style,
          outline,
          characters,
          world,
          aiPersona,
          lorebook,
          skills,
        },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${genre}\n${outline}\n${characters}`,
      });

      const userPrompt = `请深度完善当前作品大纲，并同步提炼【主要角色表】、【世界观法则】以及 3~5 条结构化【角色与癖好世界书条目 (Lorebook 2.0)】。

注意：
- 核心主角档案请设为 "activationMode": "constant"（全程常驻生效）；
- 特定情境才触发的癖好/场景（如：生病喂药、暴雨夜失控、浴室擦发、特定道具等）请设为 "activationMode": "keyword" 并提供 3~6 个触发关键词，避免每章强行塞入所有设定导致死板！

请严格输出合法的纯 JSON 对象（不要包裹 markdown 代码块）：
{
  "improvedOutline": "包含起承转合、阶段冲突推进、情感拉扯节奏与前3章开篇细纲的完整大纲文本",
  "characters": "条理清晰的主要角色设定文本",
  "worldView": "世界观背景与核心规则文本",
  "lorebookEntries": [
    {
      "name": "条目名称（如：攻·陆沉 / 情境锚点·高烧脆弱态）",
      "entryType": "character 或 xp_trope 或 world_rule 或 scene_pack",
      "activationMode": "constant 或 keyword",
      "keywords": ["关键词1", "关键词2"],
      "appearance": "外貌体型与视觉反差细节",
      "personality": "外在压迫感与内在矛盾心理",
      "behaviorQuirks": "标志性微动作、说话语气或特殊反应",
      "mustIncludeTaboos": "必写张力细节与绝对避雷红线"
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
        temperature: 0.82,
      });

      const rawContent = (res.content || '').trim();
      let parsedData: any = null;
      try {
        const cleanJson = rawContent.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
        parsedData = JSON.parse(cleanJson);
      } catch {
        parsedData = null;
      }

      if (parsedData && parsedData.improvedOutline) {
        setOutline(parsedData.improvedOutline);
        if (parsedData.characters) setCharacters(parsedData.characters);
        if (parsedData.worldView) setWorld(parsedData.worldView);

        if (Array.isArray(parsedData.lorebookEntries) && parsedData.lorebookEntries.length > 0) {
          const validTypes: LorebookEntryType[] = ['character', 'xp_trope', 'world_rule', 'scene_pack'];
          const newLoreEntries: LorebookEntry[] = parsedData.lorebookEntries.map((e: any) => ({
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
        notify(
          `大纲完善完成（已调用 ${audit.activeSkills.length} 项大纲 SKILL${audit.hasXpConstitution ? ' + 全局 XP 宪法' : ''}），并自动同步了角色表、世界观与世界书！`,
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

  // Extract Lorebook 2.0 entries independently
  const handleExtractLorebookFromOutline = async () => {
    if (!outline.trim() && !characters.trim()) {
      notify('请先填写故事大纲或主要角色设定后再执行智能提取', 'error');
      return;
    }

    setIsExtractingLore(true);
    notify('正在从大纲与 XP 宪法中拆解常驻角色卡与按需触发的 XP 情境卡...', 'info');

    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: '你是一位精通人物塑造与动态世界书架构的小说设定师。',
        customSettings: { title, genre, style, outline, characters, world, skills },
        globalSkills,
        xpPreferences,
        contextCorpus: `${title}\n${outline}\n${characters}`,
      });

      const prompt = `请根据当前作品大纲、角色表与全局 XP 审美宪法，提炼 4~6 条结构化【Lorebook 2.0 世界书档案】：
- 将核心主角设为 "activationMode": "constant"（常驻注入）；
- 将特定互动梗、特殊情境癖好（如生病照顾、吃醋失控、伤口处理、雨夜同处等）拆分为独立的 "xp_trope" 或 "scene_pack"，设为 "activationMode": "keyword" 并附上触发关键词数组，让正文只在对应情节自然触发，彻底告别千篇一律！

严格输出纯 JSON 数组（不要包裹代码块）：
[
  {
    "name": "条目名称",
    "entryType": "character | xp_trope | world_rule | scene_pack",
    "activationMode": "constant | keyword",
    "keywords": ["触发词1", "触发词2"],
    "appearance": "视觉与外貌细节",
    "personality": "性格反差与心理内核",
    "behaviorQuirks": "微动作习惯/语气/XP张力表现",
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
        const validTypes: LorebookEntryType[] = ['character', 'xp_trope', 'world_rule', 'scene_pack'];
        const newLoreEntries: LorebookEntry[] = entries.map((e: any) => ({
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

  const buildSettingsPayload = (): BookSettings => ({
    genre: genre.trim(),
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
    lorebook,
    skills,
  });

  const handleStartWriting = () => {
    if (!title.trim()) {
      notify('请先填写作品书名', 'error');
      return;
    }
    if (!genre.trim()) {
      notify('请填写作品题材分类', 'error');
      setSetupSection('core');
      return;
    }
    if (!outline.trim()) {
      notify('请先填写故事核心大纲', 'error');
      setSetupSection('core');
      return;
    }

    const bookId = currentBook && currentBook.chapters.length === 0 ? currentBook.id : generateUUID();
    const bookToStart: Book = {
      id: bookId,
      title: title.trim(),
      createdAt: currentBook ? currentBook.createdAt : Date.now(),
      lastModifiedAt: Date.now(),
      chapters: currentBook && currentBook.chapters.length === 0 ? [] : [],
      archivedChapters: currentBook && currentBook.chapters.length === 0 ? currentBook.archivedChapters : [],
      summaries: currentBook && currentBook.chapters.length === 0 ? currentBook.summaries : [],
      settings: buildSettingsPayload(),
    };

    onStartWritingFirstChapter(bookToStart);
  };

  const handleUpdateCurrentBook = () => {
    if (!currentBook) return;
    if (!title.trim()) {
      notify('作品书名不能为空', 'error');
      return;
    }
    onUpdateBookSettings(buildSettingsPayload(), title.trim());
    notify(`《${title.trim()}》设定、世界书与 SKILL 挂载状态已保存生效`, 'success');
  };

  const enabledLoreCount = lorebook.filter((l) => l.enabled).length;
  const enabledSkillCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Top Editorial Header & Book Title */}
      <section className="studio-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">
              {currentBook && currentBook.chapters.length > 0
                ? `连载设定维护 · 已写 ${currentBook.chapters.length} 章`
                : '新书立项工坊 · 挂载世界书与 SKILL 2.0'}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
              {currentBook ? `《${title || currentBook.title}》作品设定` : '创建新小说设定'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] hover:opacity-90 text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>挂载透视 ({enabledSkillCount} 技能 · {enabledLoreCount} 档案)</span>
            </button>

            {currentBook && currentBook.chapters.length > 0 && (
              <button
                type="button"
                onClick={handleUpdateCurrentBook}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存设定更改</span>
              </button>
            )}

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
              placeholder="输入小说书名..."
              className="studio-input w-full px-3.5 py-2.5 text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              核心题材 *
            </label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="例：现代都市纯爱 / 仙侠双洁 / 星际哨向"
              className="studio-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

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

        {/* Mobile-friendly Segmented Sub-navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-[var(--border-subtle)]">
          {[
            { id: 'core', label: '大纲与核心参数', icon: Sliders },
            { id: 'lorebook', label: `世界书档案 (${enabledLoreCount}/${lorebook.length})`, icon: BookMarked },
            { id: 'skills', label: `SKILL 2.0 挂载 (${enabledSkillCount}/${skills.length})`, icon: Zap },
            { id: 'style', label: '执笔人设与文风样本', icon: FileText },
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
                  AI 完善大纲时会自动读取您的「全局 XP 创作宪法」与「大纲类 SKILL」，并同步生成角色表与世界书卡片。
                </p>
              </div>

              <MotionButton
                type="button"
                disabled={isImprovingOutline}
                onClick={handleImproveOutline}
                className="btn-primary min-h-[44px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isImprovingOutline ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>深度推演中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 完善大纲并提取世界书</span>
                  </>
                )}
              </MotionButton>
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
          </section>
        </div>
      )}

      {/* SECTION 2: Lorebook 2.0 */}
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

          <section className="studio-card p-5 sm:p-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">文笔韵律模仿样本 (可选)</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  贴入 500 ~ 3000 字您钟爱的小说选段，AI 将仅模仿其冷暖语感、分句呼吸与用词密度，绝不抄袭人名剧情。
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-muted)] flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>导入 txt/md</span>
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={handleStyleFileInputChange}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveStyleSnapshot}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-muted)] whitespace-nowrap"
                >
                  保存文风快照
                </button>
              </div>
            </div>

            <textarea
              rows={7}
              value={styleReference}
              onChange={(e) => setStyleReference(e.target.value)}
              placeholder="在此粘贴您喜欢的文笔段落样本..."
              className="studio-input w-full p-3.5 text-sm leading-relaxed font-editorial-serif"
            />

            {styleHistory.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={selectedStyleId}
                  onChange={(e) => setSelectedStyleId(e.target.value)}
                  className="studio-input flex-1 min-h-[42px] px-3 py-2 text-xs"
                >
                  <option value="">选择历史文风快照 ({styleHistory.length})...</option>
                  {styleHistory.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {(s.content || '').slice(0, 42)}...
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!selectedStyleId}
                    onClick={() => {
                      const item = styleHistory.find((s) => String(s.id) === selectedStyleId);
                      if (item?.content) {
                        setStyleReference(item.content);
                        notify('已加载历史文风样本', 'info');
                      }
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium disabled:opacity-40"
                  >
                    载入
                  </button>
                  <button
                    type="button"
                    disabled={!selectedStyleId}
                    onClick={async () => {
                      await dbDelete(STORE_NAMES.STYLE_HISTORY, Number(selectedStyleId));
                      setSelectedStyleId('');
                      await loadHistories();
                      notify('已删除该文风记录', 'info');
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Lorebook 2.0 Modal (Bottom-Sheet on Mobile) */}
      {isLoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
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
      )}

      {/* SKILL 2.0 Modal (Bottom-Sheet on Mobile) */}
      {isSkillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
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
      )}

      {/* Prompt & SKILL Live Audit Inspector Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
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
                <p className="text-[var(--text-muted)]">全局 XP 创作宪法</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  {currentAuditReport.hasXpConstitution
                    ? `已注入 (${currentAuditReport.xpLength} 字)`
                    : '未填写 (可在引擎与技能页配置)'}
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
