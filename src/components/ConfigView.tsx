import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Heart,
  Palette,
  Database,
  Trash2,
  Plus,
  Edit3,
  Sparkles,
  X,
  Zap,
  Upload,
  Download,
  Check,
  Loader2,
  Globe,
  ShieldCheck,
  Copy,
  FolderTree,
} from 'lucide-react';
import JSZip from 'jszip';
import { motion } from 'motion/react';
import { generateUUID } from '../utils/uuid';
import {
  ApiConfig,
  UiSettings,
  HistoryItem,
  NovelSkill,
  SkillScope,
  SkillCategory,
  SkillRuleTier,
  DOMESTIC_API_PRESETS,
  DomesticApiPreset,
  ThemeName,
  STUDIO_BRAND_PRESETS,
} from '../types';
import {
  dbPut,
  dbGetAll,
  dbGet,
  dbDelete,
  dbClear,
  STORE_NAMES,
  saveGlobalSkill,
  deleteGlobalSkill,
  resetGlobalSkills,
} from '../services/db';
import { testAndFetchModels, chatCompletion } from '../services/apiClient';
import { serializeSkillToMarkdown } from '../services/promptEngine';
import {
  importSkillFilesUniversal,
  exportSingleSkillPackage,
} from '../services/skillPackageParser';
import { SkillPackageInspectorModal } from './SkillPackageInspectorModal';
import { PWAInstallButton } from './PWAInstallButton';
import { SPRING_INDICATOR, MotionButton, StaggerCard, StaggerList, StaggerItem, ModalPortal } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface ConfigViewProps {
  configs: ApiConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<ApiConfig[]>>;
  uiSettings: UiSettings;
  setUiSettings: React.Dispatch<React.SetStateAction<UiSettings>>;
  xpPreferences: string;
  setXpPreferences: React.Dispatch<React.SetStateAction<string>>;
  globalSkills: NovelSkill[];
  onRefreshGlobalSkills: () => Promise<void>;
}

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

const EDITORIAL_THEMES: Array<{ id: ThemeName; label: string; swatchClass: string }> = [
  { id: 'ink', label: '水墨玄笺', swatchClass: 'bg-zinc-900 dark:bg-stone-200' },
  { id: 'celadon', label: '天青汝窑', swatchClass: 'bg-teal-700 dark:bg-teal-400' },
  { id: 'indigo', label: '靛蓝藏书', swatchClass: 'bg-indigo-800 dark:bg-indigo-400' },
  { id: 'cinnabar', label: '朱砂批注', swatchClass: 'bg-rose-700 dark:bg-rose-400' },
  { id: 'amber', label: '琥珀暖金', swatchClass: 'bg-amber-700 dark:bg-amber-400' },
];

export const ConfigView: React.FC<ConfigViewProps> = ({
  configs,
  setConfigs,
  uiSettings,
  setUiSettings,
  xpPreferences,
  setXpPreferences,
  globalSkills,
  onRefreshGlobalSkills,
}) => {
  const [configTab, setConfigTab] = useState<'api' | 'xp' | 'skills' | 'appearance'>('api');
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  // API Line Form State
  const [editingCfgId, setEditingCfgId] = useState<string | null>(null);
  const [cfgName, setCfgName] = useState('');
  const [cfgProvider, setCfgProvider] = useState<'openai-compatible' | 'built-in-gemini'>('openai-compatible');
  const [cfgBaseUrl, setCfgBaseUrl] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [presetDefaultModels, setPresetDefaultModels] = useState<Array<{ id: string; name?: string }>>([]);
  const [activePresetHint, setActivePresetHint] = useState('');
  const [cfgStatus, setCfgStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteCfgId, setConfirmDeleteCfgId] = useState<string | null>(null);

  // Per-Task Model Lists
  const [writerModels, setWriterModels] = useState<Array<{ id: string; name?: string }>>([]);
  const [rerollModels, setRerollModels] = useState<Array<{ id: string; name?: string }>>([]);
  const [inspirationModels, setInspirationModels] = useState<Array<{ id: string; name?: string }>>([]);
  const [loadingTaskModels, setLoadingTaskModels] = useState<Record<string, boolean>>({});

  // XP Constitution State
  const [xpHistory, setXpHistory] = useState<HistoryItem[]>([]);
  const [selectedXpHistoryId, setSelectedXpHistoryId] = useState('');
  const [xpStatus, setXpStatus] = useState('');

  // Global SKILL 2.0 Modal State
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
  const [skillStatusMsg, setSkillStatusMsg] = useState('');
  const [confirmResetSkills, setConfirmResetSkills] = useState(false);

  // Data Backup & Restore State
  const [backupStatus, setBackupStatus] = useState('');
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    loadXpHistory();
    populateCachedModels('writer', uiSettings.writerApiCfgId);
    populateCachedModels('reroll', uiSettings.rerollApiCfgId);
    populateCachedModels('inspiration', uiSettings.inspirationApiCfgId);
  }, []);

  const loadXpHistory = async () => {
    const list = await dbGetAll<HistoryItem>(STORE_NAMES.XP_PREFERENCES_HISTORY);
    setXpHistory(list);
  };

  const populateCachedModels = (
    taskType: 'writer' | 'reroll' | 'inspiration',
    cfgId: string | null
  ) => {
    const targetCfg = configs.find((c) => c.id === cfgId) || configs[0];
    if (!targetCfg) return;
    const setter =
      taskType === 'writer'
        ? setWriterModels
        : taskType === 'reroll'
        ? setRerollModels
        : setInspirationModels;

    if (targetCfg.modelsCache && targetCfg.modelsCache.length > 0) {
      setter(targetCfg.modelsCache);
    } else if (targetCfg.provider === 'built-in-gemini') {
      setter([
        { id: 'gemini-3.6-flash', name: 'Gemini Flash (内置极速)' },
        { id: 'gemini-3.6-pro', name: 'Gemini Pro (内置深度)' },
      ]);
    }
  };

  const updateUiSettingsPartial = async (patch: Partial<UiSettings>) => {
    const updated = { ...uiSettings, ...patch };
    setUiSettings(updated);
    await dbPut(STORE_NAMES.UI_SETTINGS, { id: 'current', ...updated });
  };

  // Apply 1-Click Domestic Direct Preset
  const handleSelectDomesticPreset = (preset: DomesticApiPreset) => {
    setEditingCfgId(null);
    setCfgName(preset.name);
    setCfgProvider('openai-compatible');
    setCfgBaseUrl(preset.baseUrl);
    setPresetDefaultModels(preset.defaultModels);
    setActivePresetHint(preset.docHint);
    setCfgStatus({
      type: 'info',
      text: `已自动填入「${preset.name}」直连地址与推荐模型，只需填入该平台的密钥并点击「保存并设为全局主力线路」即可免魔法直连！`,
    });
  };

  const handleSaveConfig = async (applyToAllTasks: boolean = false) => {
    if (!cfgName.trim() || !cfgBaseUrl.trim() || !cfgApiKey.trim()) {
      setCfgStatus({ type: 'error', text: '请完整填写线路名称、接口地址与平台密钥' });
      return;
    }

    const defaultModelsToUse =
      presetDefaultModels.length > 0
        ? presetDefaultModels
        : [{ id: 'deepseek-chat', name: 'deepseek-chat' }];

    let savedCfg: ApiConfig;
    let updatedConfigs: ApiConfig[];

    if (editingCfgId) {
      const existing = configs.find((c) => c.id === editingCfgId);
      savedCfg = {
        id: editingCfgId,
        name: cfgName.trim(),
        baseUrl: cfgBaseUrl.trim(),
        apiKey: cfgApiKey.trim(),
        provider: cfgProvider,
        modelsCache:
          existing?.modelsCache && existing.modelsCache.length > 0
            ? existing.modelsCache
            : defaultModelsToUse,
      };
      updatedConfigs = configs.map((c) => (c.id === editingCfgId ? savedCfg : c));
    } else {
      savedCfg = {
        id: generateUUID(),
        name: cfgName.trim(),
        baseUrl: cfgBaseUrl.trim(),
        apiKey: cfgApiKey.trim(),
        provider: cfgProvider,
        modelsCache: defaultModelsToUse,
      };
      updatedConfigs = [...configs, savedCfg];
    }

    setConfigs(updatedConfigs);
    await dbPut(STORE_NAMES.CONFIGS, { id: 'all', data: updatedConfigs });

    if (applyToAllTasks) {
      const primaryModel = savedCfg.modelsCache?.[0]?.id || 'deepseek-chat';
      await updateUiSettingsPartial({
        writerApiCfgId: savedCfg.id,
        writerApiModel: primaryModel,
        rerollApiCfgId: savedCfg.id,
        rerollApiModel: primaryModel,
        inspirationApiCfgId: savedCfg.id,
        inspirationApiModel: primaryModel,
      });
      setWriterModels(savedCfg.modelsCache || []);
      setRerollModels(savedCfg.modelsCache || []);
      setInspirationModels(savedCfg.modelsCache || []);
      setCfgStatus({
        type: 'success',
        text: `线路「${savedCfg.name}」已保存，并已自动设为正文扩写、走向重掷与灵感构思的默认直连线路！`,
      });
    } else {
      setCfgStatus({ type: 'success', text: `线路「${savedCfg.name}」已保存` });
    }

    setEditingCfgId(null);
    setCfgName('');
    setCfgBaseUrl('');
    setCfgApiKey('');
    setPresetDefaultModels([]);
    setActivePresetHint('');
  };

  const handleTestConnection = async () => {
    if (!cfgBaseUrl.trim() || !cfgApiKey.trim()) {
      setCfgStatus({ type: 'error', text: '请先填写接口地址与密钥后再测试连通性' });
      return;
    }

    setCfgStatus({ type: 'info', text: '正在通过浏览器直连测试接口并拉取可用模型...' });
    try {
      const models = await testAndFetchModels(cfgBaseUrl.trim(), cfgApiKey.trim(), cfgProvider);
      if (models.length > 0) {
        setPresetDefaultModels(models);
      }
      setCfgStatus({
        type: 'success',
        text: `直连测试通过！成功获取到 ${models.length} 个模型。`,
      });
    } catch (err: any) {
      setCfgStatus({
        type: 'error',
        text: `提示：${err.message}`,
      });
    }
  };

  const handleFetchModelsForTask = async (
    taskType: 'writer' | 'reroll' | 'inspiration',
    cfgId: string | null
  ) => {
    const targetCfg = configs.find((c) => c.id === cfgId) || configs[0];
    if (!targetCfg) return;

    const setter =
      taskType === 'writer'
        ? setWriterModels
        : taskType === 'reroll'
        ? setRerollModels
        : setInspirationModels;

    setLoadingTaskModels((prev) => ({ ...prev, [taskType]: true }));
    try {
      const models = await testAndFetchModels(targetCfg.baseUrl, targetCfg.apiKey, targetCfg.provider);
      if (models.length > 0) {
        setter(models);
        const updated = configs.map((c) => (c.id === targetCfg.id ? { ...c, modelsCache: models } : c));
        setConfigs(updated);
        await dbPut(STORE_NAMES.CONFIGS, { id: 'all', data: updated });
      }
    } catch (err: any) {
      setCfgStatus({ type: 'info', text: err.message });
    } finally {
      setLoadingTaskModels((prev) => ({ ...prev, [taskType]: false }));
    }
  };

  const handleDeleteSavedConfig = async (id: string) => {
    const updated = configs.filter((c) => c.id !== id);
    setConfigs(updated);
    await dbPut(STORE_NAMES.CONFIGS, { id: 'all', data: updated });
    setConfirmDeleteCfgId(null);
  };

  // XP Constitution Handlers
  const handleSaveXpPreferences = async () => {
    await dbPut(STORE_NAMES.XP_PREFERENCES, { id: 'current', content: xpPreferences.trim() });
    if (xpPreferences.trim()) {
      await dbPut(STORE_NAMES.XP_PREFERENCES_HISTORY, {
        createdAt: Date.now(),
        content: xpPreferences.trim(),
      });
      await loadXpHistory();
    }
    setXpStatus('全局 XP 创作宪法已保存，将在大纲完善、灵感生成、正文扩写与走向重掷中全程生效');
    setTimeout(() => setXpStatus(''), 3500);
  };

  // SKILL 2.0 Hub Handlers
  const parseCommaList = (raw: string): string[] =>
    raw
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

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
    if (!skillName.trim() || !skillInstruction.trim()) return;
    const targetSkill: NovelSkill = {
      ...(editingSkill || {}),
      id: editingSkill ? editingSkill.id : `skill-custom-${generateUUID()}`,
      name: skillName.trim(),
      description: skillDesc.trim() || skillName.trim(),
      promptInstruction: skillInstruction.trim(),
      ruleTier: skillRuleTier,
      category: skillCategory,
      scopes: skillScopes.length > 0 ? skillScopes : ['chapter'],
      triggerMode: skillTriggerMode,
      keywords: parseCommaList(skillKeywordsInput),
      priority: skillPriority,
      enabled: editingSkill ? editingSkill.enabled : true,
      isPreset: editingSkill ? editingSkill.isPreset : false,
      packageType: editingSkill?.packageType || 'single-md',
    };

    await saveGlobalSkill(targetSkill);
    await onRefreshGlobalSkills();
    setIsSkillModalOpen(false);
    setSkillStatusMsg(`已保存 SKILL「${targetSkill.name}」，所有作品已自动同步最新规则内容`);
    setTimeout(() => setSkillStatusMsg(''), 3500);
  };

  const handleExportSingleSkill = async (skill: NovelSkill) => {
    const { blob, filename } = await exportSingleSkillPackage(skill, serializeSkillToMarkdown);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllSkillsZip = async () => {
    const zip = new JSZip();
    globalSkills.forEach((sk) => {
      const safeFolder = (sk.slug || sk.name).replace(/[\\/:*?"<>|]/g, '_');
      if (sk.packageType === 'zip-package' || (sk.references && sk.references.length > 0)) {
        const folder = zip.folder(safeFolder)!;
        folder.file('SKILL.md', '\uFEFF' + (sk.rawSkillMd || serializeSkillToMarkdown(sk)));
        (sk.references || []).forEach((ref) => {
          const cleanPath = ref.path.startsWith('references/') ? ref.path : `references/${ref.path}`;
          folder.file(cleanPath, '\uFEFF' + ref.content);
        });
      } else {
        zip.file(`${safeFolder}.SKILL.md`, '\uFEFF' + serializeSkillToMarkdown(sk));
      }
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const brand = (uiSettings.studioBrandName || '墨映工坊').trim() || '墨映工坊';
    a.download = `${brand}_SKILL规范包_${globalSkills.length}项.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSkillFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const { skills: importedList, summary } = await importSkillFilesUniversal(files);
      for (const sk of importedList) {
        await saveGlobalSkill(sk);
      }
      await onRefreshGlobalSkills();
      setSkillStatusMsg(summary);
      if (importedList.length === 1 && importedList[0].packageType === 'zip-package') {
        setInspectingSkill(importedList[0]);
      }
    } catch (err: any) {
      setSkillStatusMsg(`导入解析失败：${err.message || '请确认为有效的 .zip 或 .md 技能包'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleGenerateSkillInstructionWithAI = async () => {
    if (!skillName.trim() && !skillDesc.trim()) return;
    setIsGeneratingSkillPrompt(true);
    try {
      const activeCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
      const modelToUse = uiSettings.writerApiModel || 'gemini-3.6-flash';
      const res = await chatCompletion({
        provider: activeCfg?.provider,
        baseUrl: activeCfg?.baseUrl,
        apiKey: activeCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: '你是小说写作规则架构师，擅长撰写简明硬核的 AI 写作约束。' },
          {
            role: 'user',
            content: `请为小说技能「${skillName}」（说明：${skillDesc || '提升叙事质感'}）编写一条 150 字以内的严格执行指令，直接输出纯文本规则内容。`,
          },
        ],
        temperature: 0.7,
      });
      if (res?.content?.trim()) setSkillInstruction(res.content.trim());
    } catch (err: any) {
      setSkillStatusMsg(`AI 拟定失败：${err.message}`);
    } finally {
      setIsGeneratingSkillPrompt(false);
    }
  };

  // Full Data Backup & Safe Two-Step Restore
  const handleBackupAllData = async () => {
    try {
      const allData: Record<string, any> = {
        _exportVersion: 3,
        _exportedAt: new Date().toISOString(),
      };
      for (const storeName of Object.values(STORE_NAMES)) {
        allData[storeName] = await dbGetAll(storeName);
      }
      allData.uiSettings = await dbGet(STORE_NAMES.UI_SETTINGS, 'current');

      const localStorageData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) localStorageData[key] = localStorage.getItem(key) || '';
      }
      allData.localStorageData = localStorageData;

      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const brand = (uiSettings.studioBrandName || '墨映工坊').trim() || '墨映工坊';
      a.download = `${brand}_全量备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupStatus('全量数据 JSON 已导出（包含全部小说、AI漫剧剧本、世界书、XP宪法、SKILL 2.0 与线路配置）');
    } catch (err: any) {
      setBackupStatus(`备份导出失败：${err.message}`);
    }
  };

  const executeConfirmedRestore = async () => {
    if (!pendingRestoreFile) return;
    try {
      const raw = await pendingRestoreFile.text();
      const imported = JSON.parse(raw);

      for (const storeName of Object.values(STORE_NAMES)) {
        await dbClear(storeName);
        if (Array.isArray(imported[storeName])) {
          for (const item of imported[storeName]) {
            await dbPut(storeName, item);
          }
        }
      }
      if (imported.uiSettings) {
        await dbPut(STORE_NAMES.UI_SETTINGS, imported.uiSettings);
      }
      if (imported.localStorageData && typeof imported.localStorageData === 'object') {
        Object.entries(imported.localStorageData).forEach(([k, v]) => {
          if (typeof v === 'string') localStorage.setItem(k, v);
        });
      }

      setPendingRestoreFile(null);
      setBackupStatus('全量恢复完成，正在重新加载工作台...');
      setTimeout(() => location.reload(), 900);
    } catch (err: any) {
      setBackupStatus(`恢复失败：备份文件格式有误 (${err.message})`);
      setPendingRestoreFile(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Header & 4-Tab Segmented Bar */}
      <section className="studio-card p-5 sm:p-7 space-y-4">
        <div>
          <p className="text-xs text-[var(--text-muted)]">国内免魔法直连 · XP 创作宪法 · SKILL 2.0 规范中心 · 全量本地存储</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
            引擎与技能中心
          </h1>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-[var(--border-subtle)]">
          {[
            { id: 'api', label: '国内直连与模型分配', icon: Cpu },
            { id: 'xp', label: '小说专属 XP 宪法', icon: Heart },
            { id: 'skills', label: `SKILL 2.0 规范库 (${globalSkills.length})`, icon: Zap },
            { id: 'appearance', label: '品牌名称、外观与备份', icon: Palette },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = configTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setConfigTab(tab.id as any)}
                className={`relative min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'text-[var(--accent-fg)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="config-center-tab-pill"
                    transition={SPRING_INDICATOR}
                    className="absolute inset-0 bg-[var(--accent)] rounded-xl"
                  />
                )}
                <Icon className="w-3.5 h-3.5 shrink-0 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: Domestic Direct-Connect API & Per-Task Model Assignment */}
      {configTab === 'api' && (
        <div className="space-y-6">
          {/* VPN-Free Domestic Guide Banner */}
          <section className="studio-card p-5 sm:p-6 space-y-3">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-xs leading-relaxed">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  如何实现手机与电脑 100% 免“魔法上网”秒开创作？
                </h2>
                <p className="text-[var(--text-secondary)]">
                  1. <strong>模型直连去谷歌化</strong>：点击下方任一国内平台预设（推荐 <strong>DeepSeek 官方</strong> 或 <strong>硅基流动</strong>），浏览器将直接向国内节点发起流式请求，无需经过任何海外中转。
                </p>
                <p className="text-[var(--text-secondary)]">
                  2. <strong>网页托管去谷歌化</strong>：当前预览窗口本身运行在 Google 云域名上，因此仅在 Google 预览器内打开时需要代理；本程序已完成纯静态离线化改造（零外链字体、支持 <code className="font-mono">base: './'</code> 与 PWA 桌面安装）。您只需下载源码执行 <code className="font-mono">npm run build</code>，将生成的 <code className="font-mono">dist</code> 文件夹拖入<strong>腾讯云 EdgeOne Pages / 阿里云 ESA / 国内静态托管</strong>，即可获得国内手机秒开的私人专属网址，并可添加到手机主屏幕离线使用！
                </p>
              </div>
            </div>
          </section>

          {/* 1-Click Domestic Presets */}
          <section className="studio-card p-5 sm:p-7 space-y-5">
            <div className="space-y-1 border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)]">一键载入国内免魔法直连预设</h2>
              <p className="text-xs text-[var(--text-muted)]">
                点选任意平台即可自动填充接口地址与推荐模型列表，数据仅保存在您本机浏览器的 IndexedDB 中。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DOMESTIC_API_PRESETS.map((preset, idx) => (
                <StaggerCard
                  key={preset.id}
                  index={idx}
                  onClick={() => handleSelectDomesticPreset(preset)}
                  onContextMenu={(e) =>
                    openContextMenu(e, preset.name, [
                      {
                        id: 'apply-preset',
                        label: '一键载入该直连平台地址',
                        icon: <Check className="w-3.5 h-3.5" />,
                        onSelect: () => handleSelectDomesticPreset(preset),
                      },
                      {
                        id: 'copy-url',
                        label: '复制平台 Base URL',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        onSelect: () => {
                          navigator.clipboard?.writeText(preset.baseUrl);
                          triggerQuickToast(`已复制 ${preset.baseUrl}`);
                        },
                      },
                    ])
                  }
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-left space-y-1 transition-colors cursor-pointer studio-card-hover"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{preset.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">{preset.regionTag}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">{preset.baseUrl}</p>
                </StaggerCard>
              ))}
            </div>

            {activePresetHint && (
              <p className="text-xs text-[var(--text-secondary)] p-3 studio-muted">{activePresetHint}</p>
            )}

            {/* Line Editor Form */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">线路名称</label>
                <input
                  type="text"
                  value={cfgName}
                  onChange={(e) => setCfgName(e.target.value)}
                  placeholder="例：DeepSeek 主力直连"
                  className="studio-input w-full px-3.5 py-2.5 text-xs min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  接口 Base URL (OpenAI 兼容)
                </label>
                <input
                  type="text"
                  value={cfgBaseUrl}
                  onChange={(e) => setCfgBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="studio-input w-full px-3.5 py-2.5 text-xs font-mono min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">平台令牌 (Key)</label>
                <input
                  type="password"
                  value={cfgApiKey}
                  onChange={(e) => setCfgApiKey(e.target.value)}
                  placeholder="粘贴对应平台生成的 sk-..."
                  className="studio-input w-full px-3.5 py-2.5 text-xs font-mono min-h-[42px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <MotionButton
                type="button"
                onClick={() => handleSaveConfig(true)}
                className="btn-primary min-h-[44px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{editingCfgId ? '更新并设为全局主力线路' : '保存并设为全局主力线路'}</span>
              </MotionButton>

              <MotionButton
                type="button"
                onClick={() => handleSaveConfig(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium cursor-pointer"
              >
                仅保存至备用列表
              </MotionButton>

              <MotionButton
                type="button"
                onClick={handleTestConnection}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium cursor-pointer"
              >
                测试直连连通性
              </MotionButton>

              {editingCfgId && (
                <MotionButton
                  type="button"
                  onClick={() => {
                    setEditingCfgId(null);
                    setCfgName('');
                    setCfgBaseUrl('');
                    setCfgApiKey('');
                  }}
                  className="min-h-[44px] px-3 text-xs text-[var(--text-muted)]"
                >
                  取消编辑
                </MotionButton>
              )}
            </div>

            {cfgStatus && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  cfgStatus.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : cfgStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'studio-muted border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {cfgStatus.text}
              </div>
            )}

            {/* Saved Lines List */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">已保存的线路列表 ({configs.length})</p>
              <StaggerList className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl">
                {configs.map((c) => {
                  const isBuiltIn = c.provider === 'built-in-gemini';
                  return (
                    <StaggerItem
                      key={c.id}
                      onContextMenu={(e) =>
                        openContextMenu(e, `线路 · ${c.name}`, [
                          {
                            id: 'set-primary-line',
                            label: '设为全环节主力线路',
                            icon: <ShieldCheck className="w-3.5 h-3.5" />,
                            onSelect: async () => {
                              const primaryModel = c.modelsCache?.[0]?.id || 'gemini-3.6-flash';
                              await updateUiSettingsPartial({
                                writerApiCfgId: c.id,
                                writerApiModel: primaryModel,
                                rerollApiCfgId: c.id,
                                rerollApiModel: primaryModel,
                                inspirationApiCfgId: c.id,
                                inspirationApiModel: primaryModel,
                              });
                              triggerQuickToast(`已将「${c.name}」设为全局主力线路`);
                            },
                          },
                          ...(!isBuiltIn
                            ? [
                                {
                                  id: 'edit-line',
                                  label: '编辑线路配置',
                                  icon: <Edit3 className="w-3.5 h-3.5" />,
                                  onSelect: () => {
                                    setEditingCfgId(c.id);
                                    setCfgName(c.name);
                                    setCfgProvider(c.provider);
                                    setCfgBaseUrl(c.baseUrl);
                                    setCfgApiKey(c.apiKey);
                                  },
                                },
                                {
                                  id: 'del-line',
                                  label: '删除该备用线路',
                                  icon: <Trash2 className="w-3.5 h-3.5" />,
                                  danger: true,
                                  dividerBefore: true,
                                  onSelect: () => handleDeleteSavedConfig(c.id),
                                },
                              ]
                            : []),
                        ])
                      }
                      className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-[var(--bg-muted)]/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[var(--text-primary)]">{c.name}</span>
                        <span className="text-[var(--text-muted)] font-mono ml-2">
                          {isBuiltIn ? '内置预览线路' : c.baseUrl}
                        </span>
                      </div>

                      {!isBuiltIn && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <MotionButton
                            type="button"
                            onClick={() => {
                              setEditingCfgId(c.id);
                              setCfgName(c.name);
                              setCfgProvider(c.provider);
                              setCfgBaseUrl(c.baseUrl);
                              setCfgApiKey(c.apiKey);
                            }}
                            className="min-h-[34px] px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)]"
                          >
                            编辑
                          </MotionButton>

                          {confirmDeleteCfgId === c.id ? (
                            <MotionButton
                              type="button"
                              onClick={() => handleDeleteSavedConfig(c.id)}
                              className="min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white font-semibold"
                            >
                              确认删除
                            </MotionButton>
                          ) : (
                            <MotionButton
                              type="button"
                              onClick={() => setConfirmDeleteCfgId(c.id)}
                              className="min-h-[34px] px-2.5 rounded-lg text-rose-600 hover:bg-rose-500/10"
                            >
                              删除
                            </MotionButton>
                          )}
                        </div>
                      )}
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            </div>
          </section>

          {/* Per-Task Model Assignment (Supports BOTH Dropdown & Manual Custom Model ID!) */}
          <section className="studio-card p-5 sm:p-7 space-y-5">
            <div className="space-y-1 border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)]">分环节独立模型调配</h2>
              <p className="text-xs text-[var(--text-muted)]">
                例如：可用 DeepSeek-R1 负责「灵感与大纲推演」，用文笔细腻的 DeepSeek-V3 负责「章节正文扩写」。支持下拉选择或直接手填模型 ID（如火山方舟接入点 <code className="font-mono">ep-xxxx</code>）。
              </p>
            </div>

            {[
              {
                key: 'writer' as const,
                title: '章节正文扩写与段落精修',
                cfgKey: 'writerApiCfgId' as const,
                modelKey: 'writerApiModel' as const,
                models: writerModels,
              },
              {
                key: 'reroll' as const,
                title: '下一章 4 走向重掷',
                cfgKey: 'rerollApiCfgId' as const,
                modelKey: 'rerollApiModel' as const,
                models: rerollModels,
              },
              {
                key: 'inspiration' as const,
                title: '灵感脑暴与卡片融合大纲',
                cfgKey: 'inspirationApiCfgId' as const,
                modelKey: 'inspirationApiModel' as const,
                models: inspirationModels,
              },
            ].map((task) => (
              <div key={task.key} className="p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{task.title}</span>
                  <button
                    type="button"
                    disabled={loadingTaskModels[task.key]}
                    onClick={() => handleFetchModelsForTask(task.key, uiSettings[task.cfgKey])}
                    className="min-h-[32px] px-2.5 rounded-lg bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                  >
                    {loadingTaskModels[task.key] && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>刷新模型列表</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">选用线路</label>
                    <select
                      value={uiSettings[task.cfgKey] || ''}
                      onChange={(e) => {
                        const newCfgId = e.target.value;
                        const targetCfg = configs.find((c) => c.id === newCfgId);
                        const defaultModel = targetCfg?.modelsCache?.[0]?.id || uiSettings[task.modelKey] || '';
                        updateUiSettingsPartial({
                          [task.cfgKey]: newCfgId,
                          [task.modelKey]: defaultModel,
                        });
                        populateCachedModels(task.key, newCfgId);
                      }}
                      className="studio-input w-full px-3 py-2 text-xs min-h-[40px]"
                    >
                      {configs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">快速选择推荐/已缓存模型</label>
                    <select
                      value={task.models.some((m) => m.id === uiSettings[task.modelKey]) ? uiSettings[task.modelKey] || '' : ''}
                      onChange={(e) => {
                        if (e.target.value) updateUiSettingsPartial({ [task.modelKey]: e.target.value });
                      }}
                      className="studio-input w-full px-3 py-2 text-xs min-h-[40px]"
                    >
                      <option value="">-- 从列表点选 --</option>
                      {task.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">当前生效模型 ID（支持直接手填）</label>
                    <input
                      type="text"
                      value={uiSettings[task.modelKey] || ''}
                      onChange={(e) => updateUiSettingsPartial({ [task.modelKey]: e.target.value })}
                      placeholder="例：deepseek-chat 或 ep-xxxx"
                      className="studio-input w-full px-3 py-2 text-xs font-mono min-h-[40px]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* TAB 2: Global XP Aesthetic Constitution */}
      {configTab === 'xp' && (
        <section className="studio-card p-5 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">我的私人小说 XP 审美宪法与红线禁忌</h2>
              <p className="text-xs text-[var(--text-muted)]">
                在此定义您最核心的情感审美张力、固定人设偏好与绝对避雷红线（当前共 <span className="tabular-nums font-semibold">{xpPreferences.length}</span> 字）。
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveXpPreferences}
              className="btn-primary min-h-[44px] px-5 py-2 text-xs whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
            >
              保存小说 XP 宪法
            </button>
          </div>

          <div className="p-3.5 rounded-xl studio-muted flex items-start gap-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>双业务线安全隔离机制</strong>：下方的个人 XP 创作宪法<strong>仅在「小说自由创作」业务线生效</strong>；当您切换至「AI 漫剧剧本」业务线时，系统已在底层物理切断 XP 注入，确保商业漫剧剧本 100% 遵循大众热门赛道规范。
            </span>
          </div>

          {xpStatus && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
              {xpStatus}
            </div>
          )}

          <textarea
            rows={14}
            value={xpPreferences}
            onChange={(e) => setXpPreferences(e.target.value)}
            placeholder="在此写入您的核心审美定义、攻受体型/性格反差偏好与严禁出现的雷点..."
            className="studio-input w-full p-4 text-sm leading-relaxed"
          />

          {xpHistory.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <select
                value={selectedXpHistoryId}
                onChange={(e) => setSelectedXpHistoryId(e.target.value)}
                className="studio-input flex-1 min-h-[42px] px-3 py-2 text-xs"
              >
                <option value="">回滚历史 XP 宪法快照 ({xpHistory.length})...</option>
                {xpHistory.map((h) => (
                  <option key={h.id} value={String(h.id)}>
                    {new Date(h.createdAt || Date.now()).toLocaleString()} · {(h.content || '').slice(0, 38)}...
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!selectedXpHistoryId}
                  onClick={() => {
                    const found = xpHistory.find((h) => String(h.id) === selectedXpHistoryId);
                    if (found?.content) setXpPreferences(found.content);
                  }}
                  className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium disabled:opacity-40"
                >
                  载入此版本
                </button>
                <button
                  type="button"
                  disabled={!selectedXpHistoryId}
                  onClick={async () => {
                    await dbDelete(STORE_NAMES.XP_PREFERENCES_HISTORY, Number(selectedXpHistoryId));
                    setSelectedXpHistoryId('');
                    await loadXpHistory();
                  }}
                  className="min-h-[42px] px-3 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium disabled:opacity-40"
                >
                  删除
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Global SKILL 2.0 Specification Hub */}
      {configTab === 'skills' && (
        <section className="studio-card p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">全局 SKILL 2.0 工程规范中心</h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                原生兼容完整多文件 <code className="font-mono">.zip</code> 技能压缩包（含 <code className="font-mono">SKILL.md</code> 主路由、<code className="font-mono">references/</code> 按需渐进披露参考库与 <code className="font-mono">scripts/</code> 索引）以及单文件 <code className="font-mono">.md</code>，内置 UTF-8 / GB18030 智能防乱码解码器。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>导入 SKILL (.zip / .md)</span>
                <input
                  type="file"
                  accept=".zip,.md,.txt"
                  multiple
                  onChange={handleImportSkillFiles}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleExportAllSkillsZip}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>打包导出全部</span>
              </button>

              {confirmResetSkills ? (
                <button
                  type="button"
                  onClick={async () => {
                    await resetGlobalSkills();
                    await onRefreshGlobalSkills();
                    setConfirmResetSkills(false);
                    setSkillStatusMsg('已恢复默认 SKILL 2.0 规范预设');
                  }}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold whitespace-nowrap"
                >
                  确认重置预设
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetSkills(true)}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] whitespace-nowrap"
                >
                  恢复预设
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenAddSkillModal}
                className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新建 SKILL</span>
              </button>
            </div>
          </div>

          {skillStatusMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
              {skillStatusMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {globalSkills.map((skill, idx) => {
              const scopesText = (skill.scopes && skill.scopes.length > 0 ? skill.scopes : ['chapter', 'polish'])
                .map((s) => SCOPE_LABELS[s])
                .join(' / ');
              const refCount = skill.references?.length || 0;
              const isZipPkg = skill.packageType === 'zip-package' || refCount > 0;
              return (
                <StaggerCard
                  key={skill.id}
                  index={idx}
                  onContextMenu={(e) =>
                    openContextMenu(e, `SKILL · ${skill.name}`, [
                      {
                        id: 'inspect-skill',
                        label: isZipPkg
                          ? `检视工程包与参考路由 (${refCount} 份文档)`
                          : '检视 SKILL 结构与契约详情',
                        icon: <FolderTree className="w-3.5 h-3.5" />,
                        onSelect: () => setInspectingSkill(skill),
                      },
                      {
                        id: 'edit-skill',
                        label: '编辑 SKILL 规则与触发器',
                        icon: <Edit3 className="w-3.5 h-3.5" />,
                        onSelect: () => handleOpenEditSkillModal(skill),
                      },
                      {
                        id: 'copy-skill',
                        label: '复制底层 Prompt 指令',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        onSelect: () => {
                          navigator.clipboard?.writeText(skill.promptInstruction);
                          triggerQuickToast(`已复制「${skill.name}」指令`);
                        },
                      },
                      {
                        id: 'export-skill-md',
                        label: isZipPkg ? '导出完整 .skill.zip 工程包' : '导出标准 SKILL.md',
                        icon: <Download className="w-3.5 h-3.5" />,
                        onSelect: () => handleExportSingleSkill(skill),
                      },
                      {
                        id: 'del-skill',
                        label: '删除该 SKILL 规范',
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        onSelect: async () => {
                          await deleteGlobalSkill(skill.id);
                          await onRefreshGlobalSkills();
                          triggerQuickToast(`已删除 SKILL「${skill.name}」`);
                        },
                      },
                    ])
                  }
                  className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between gap-3 studio-card-hover"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {skill.name}
                          {skill.version && (
                            <span className="ml-1.5 font-mono text-[11px] font-normal text-[var(--text-muted)]">
                              v{skill.version}
                            </span>
                          )}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <MotionButton
                          type="button"
                          onClick={() => setInspectingSkill(skill)}
                          className="min-h-[34px] px-2 flex items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title="检视技能包结构与按需参考文档路由"
                        >
                          <FolderTree className="w-3.5 h-3.5" />
                          {refCount > 0 && <span className="tabular-nums">{refCount}</span>}
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={() => handleExportSingleSkill(skill)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title={isZipPkg ? '导出 .skill.zip 工程包' : '导出 SKILL.md'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={() => handleOpenEditSkillModal(skill)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
                          title="编辑"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </MotionButton>
                        <MotionButton
                          type="button"
                          onClick={async () => {
                            await deleteGlobalSkill(skill.id);
                            await onRefreshGlobalSkills();
                          }}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </MotionButton>
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isZipPkg ? `ZIP工程包 (${refCount}参考路由)` : '单文件MD'} ·{' '}
                      {skill.ruleTier === 'advisory' ? '质量建议' : '结构契约'} ·{' '}
                      {CATEGORY_LABELS[skill.category || 'custom']} · {scopesText} ·{' '}
                      {skill.triggerMode === 'keyword'
                        ? `关键词唤醒 (${(skill.keywords || []).slice(0, 4).join('、')})`
                        : '常驻生效'}
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

      {/* TAB 4: Studio Brand Identity, Editorial Appearance, PWA Install & Full Data Backup */}
      {configTab === 'appearance' && (
        <div className="space-y-6">
          {/* Curated Studio Brand Name Switcher */}
          <section className="studio-card p-5 sm:p-7 space-y-4">
            <div className="border-b border-[var(--border-subtle)] pb-3 space-y-1">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                工坊品牌名称设定（告别单一“AI小说家”）
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                新增「AI 漫剧剧本」赛道后，我们为您甄选了 4 个兼顾“私人文学笔墨”与“大众视听映像”的工坊名称，支持一键切换或自由手填命名：
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STUDIO_BRAND_PRESETS.map((preset, idx) => {
                const currentBrand = (uiSettings.studioBrandName || '墨映工坊').trim();
                const isSelected = currentBrand === preset.name;
                return (
                  <StaggerCard
                    key={preset.id}
                    index={idx}
                    onClick={() => updateUiSettingsPartial({ studioBrandName: preset.name })}
                    onContextMenu={(e) =>
                      openContextMenu(e, preset.name, [
                        {
                          id: 'use-brand',
                          label: `立即启用「${preset.name}」作为工坊名`,
                          icon: <Check className="w-3.5 h-3.5" />,
                          onSelect: () => {
                            updateUiSettingsPartial({ studioBrandName: preset.name });
                            triggerQuickToast(`工坊已更名为「${preset.name}」`);
                          },
                        },
                      ])
                    }
                    className={`p-4 rounded-xl border text-left space-y-1.5 transition-all cursor-pointer studio-card-hover ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold text-[var(--text-primary)] font-editorial-serif">
                        {preset.name}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--accent)]">
                        {isSelected ? '当前启用 ✓' : preset.tagline}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{preset.desc}</p>
                  </StaggerCard>
                );
              })}
            </div>

            <div className="pt-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                自定义工坊名称（实时同步顶栏与网页标题）
              </label>
              <input
                type="text"
                maxLength={14}
                value={uiSettings.studioBrandName ?? '墨映工坊'}
                onChange={(e) => updateUiSettingsPartial({ studioBrandName: e.target.value })}
                placeholder="输入您喜欢的专属工坊名..."
                className="studio-input w-full sm:w-80 min-h-[42px] px-3.5 py-2 text-sm font-semibold"
              />
            </div>
          </section>

          <section className="studio-card p-5 sm:p-7 space-y-5">
            <h2 className="text-base font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3">
              纸墨主题与排版字体
            </h2>

            <div className="space-y-2.5">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">书房点缀色系</label>
              <div className="flex flex-wrap gap-2.5">
                {EDITORIAL_THEMES.map((t) => {
                  const selected = uiSettings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => updateUiSettingsPartial({ theme: t.id })}
                      className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-medium flex items-center gap-2.5 cursor-pointer ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${t.swatchClass} shrink-0`} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">正文阅读字体</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'serif', label: '文学衬线宋体' },
                    { id: 'sans', label: '现代清晰黑体' },
                  ].map((f) => {
                    const active = (uiSettings.chapterFontFamily || 'serif') === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => updateUiSettingsPartial({ chapterFontFamily: f.id as 'serif' | 'sans' })}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                          active
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)] font-semibold'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">正文字号大小</label>
                <select
                  value={uiSettings.chapterFontSize}
                  onChange={(e) => updateUiSettingsPartial({ chapterFontSize: e.target.value })}
                  className="studio-input w-full px-3.5 py-2.5 text-xs min-h-[42px]"
                >
                  <option value="0.96rem">紧凑小号 (0.96rem)</option>
                  <option value="1.08rem">舒适标准 (1.08rem)</option>
                  <option value="1.2rem">宽松大号 (1.20rem)</option>
                  <option value="1.35rem">护眼特大 (1.35rem)</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <PWAInstallButton />
            </div>
          </section>

          <section className="studio-card p-5 sm:p-7 space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Database className="w-4 h-4 text-[var(--text-muted)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">私人全量数据安全备份与迁移</h2>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              您的所有小说草稿、历史重写归档、灵感卡片、世界书、XP 宪法与 API 线路全部离线存储在当前设备本地。更换手机或电脑时，导出一份全量 JSON 即可无损迁移。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleBackupAllData}
                className="btn-primary min-h-[44px] px-5 py-2.5 text-xs flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>导出全量数据备份 (.json)</span>
              </button>

              <label className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>从备份 JSON 恢复全站数据</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPendingRestoreFile(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {pendingRestoreFile && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3 text-xs">
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  即将使用「{pendingRestoreFile.name}」覆盖恢复本机全部书库、技能与配置，确定继续吗？
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={executeConfirmedRestore}
                    className="min-h-[40px] px-4 rounded-xl bg-amber-600 text-white font-semibold"
                  >
                    确认覆盖恢复
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRestoreFile(null)}
                    className="min-h-[40px] px-4 rounded-xl border border-[var(--border-subtle)]"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {backupStatus && (
              <p className="text-xs text-[var(--text-secondary)] p-3 studio-muted">{backupStatus}</p>
            )}
          </section>
        </div>
      )}

      {/* SKILL 2.0 Edit/Create Modal */}
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
                {editingSkill ? '修改全局 SKILL 2.0 规范' : '新建全局 SKILL 2.0 规范'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSkillModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">技能名称 *</label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    className="studio-input w-full px-3 py-2.5 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block mb-1 text-[var(--text-secondary)]">分类</label>
                    <select
                      value={skillCategory}
                      onChange={(e) => setSkillCategory(e.target.value as SkillCategory)}
                      className="studio-input w-full px-2.5 py-2.5 text-xs"
                    >
                      <option value="style">文风质感</option>
                      <option value="rule">硬性约束</option>
                      <option value="preference">审美张力</option>
                      <option value="structure">叙事结构</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-[var(--text-secondary)]">权重</label>
                    <select
                      value={skillPriority}
                      onChange={(e) => setSkillPriority(e.target.value as 'high' | 'normal')}
                      className="studio-input w-full px-2.5 py-2.5 text-xs"
                    >
                      <option value="high">高权重</option>
                      <option value="normal">常规</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block mb-1 text-[var(--text-secondary)]">功能简述</label>
                <input
                  type="text"
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  className="studio-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block mb-1.5 text-[var(--text-secondary)]">生效阶段 (Scopes)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['outline', 'chapter', 'reroll', 'polish'] as SkillScope[]).map((sc) => {
                    const checked = skillScopes.includes(sc);
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() =>
                          setSkillScopes((prev) =>
                            checked ? prev.filter((item) => item !== sc) : [...prev, sc]
                          )
                        }
                        className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 ${
                          checked
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                        <span>{SCOPE_LABELS[sc]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">规则层级 (Rule Tier)</label>
                  <select
                    value={skillRuleTier}
                    onChange={(e) => setSkillRuleTier(e.target.value as SkillRuleTier)}
                    className="studio-input w-full px-3 py-2 text-xs"
                  >
                    <option value="contract">结构契约 (Contract · 硬性必守)</option>
                    <option value="advisory">质量目标 (Advisory · 弹性校准)</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">触发方式</label>
                  <select
                    value={skillTriggerMode}
                    onChange={(e) => setSkillTriggerMode(e.target.value as 'always' | 'keyword')}
                    className="studio-input w-full px-3 py-2 text-xs"
                  >
                    <option value="always">常驻生效</option>
                    <option value="keyword">关键词按需唤醒</option>
                  </select>
                </div>
                {skillTriggerMode === 'keyword' && (
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[var(--text-secondary)]">触发词（逗号分隔）</label>
                    <input
                      type="text"
                      value={skillKeywordsInput}
                      onChange={(e) => setSkillKeywordsInput(e.target.value)}
                      placeholder="亲吻, 拥抱, 发烧, 失控"
                      className="studio-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[var(--text-secondary)]">Prompt 执行指令 *</label>
                  <button
                    type="button"
                    disabled={isGeneratingSkillPrompt}
                    onClick={handleGenerateSkillInstructionWithAI}
                    className="text-[var(--accent)] font-semibold flex items-center gap-1"
                  >
                    {isGeneratingSkillPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>AI 辅助拟定</span>
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={skillInstruction}
                  onChange={(e) => setSkillInstruction(e.target.value)}
                  className="studio-input w-full p-3 font-mono text-xs leading-relaxed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSkillModalOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs"
              >
                取消
              </button>
              <button type="button" onClick={handleSaveSkill} className="btn-primary min-h-[42px] px-5 text-xs">
                保存技能
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {inspectingSkill && (
        <SkillPackageInspectorModal
          skill={globalSkills.find((s) => s.id === inspectingSkill.id) || inspectingSkill}
          onClose={() => setInspectingSkill(null)}
          onUpdateSkill={async (updated) => {
            await saveGlobalSkill(updated);
            await onRefreshGlobalSkills();
            setInspectingSkill(updated);
          }}
        />
      )}
    </div>
  );
};
