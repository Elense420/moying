import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  ArrowRight,
  RotateCcw,
  BookOpen,
  UserCheck,
  Edit3,
  Sliders,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Archive,
  Award,
} from 'lucide-react';
import {
  ApiConfig,
  UiSettings,
  Book,
  InspirationRecord,
  NovelVolumePlanItem,
} from '../types';
import { streamChatCompletion } from '../services/apiClient';
import { dbPut, STORE_NAMES } from '../services/db';
import { generateUUID } from '../utils/uuid';
import { repairAndParseJson } from '../services/outlineJsonParser';
import { MotionButton, StaggerCard } from './MotionPrimitives';

export interface NovelConsultantOption {
  id: string;
  title: string;
  alternateTitles: string[];
  genre: string;
  targetPlatform: string;
  logline: string;
  golden3ChaptersHook: string;
  l1UltimateEnding: string;
  coreProtagonistAndAntagonist: string;
  synopsis: string;
  charactersSummary: string;
  worldSummary: string;
  volumePlan: Array<{
    volumeIndex: number;
    title: string;
    chapterSpan: string;
    climaxGoal: string;
  }>;
}

export interface NovelConsultantResponse {
  marketTrendAnalysis: string;
  consultantReply: string;
  options: NovelConsultantOption[];
}

interface NovelIdeaConsultantProps {
  configs: ApiConfig[];
  uiSettings: UiSettings;
  xpPreferences: string;
  onConfirmOption: (
    novelData: {
      title: string;
      genre: string;
      outline: string;
      characters: string;
      world: string;
      targetPlatform: string;
      commercialBlurb: string;
      alternateTitles: string[];
      volumePlan: NovelVolumePlanItem[];
      ultimateEnding: string;
    },
    unselectedArchives: NovelConsultantOption[]
  ) => void;
  onClose?: () => void;
}

const EXAMPLE_FUZZY_IDEAS = [
  '想写一本主角拥有熟练度面板但必须苟在凡间开医馆的小说，不轻易出头，暗地里拉扯天下局势',
  '脑海里只有一个画面：大雨滂沱的旧神遗迹前，盲眼道士借着闪电擦拭一柄染血的生锈桃木剑',
  '想做一本契合番茄女性频道的先婚后爱古言权谋，男主表面纨绔腹黑暗卫首领，女主假扮温良真手黑',
  '想写一本现代规则怪谈，主角是城市殡仪馆深夜入殓师，每天接触的遗体都会留下一条怪谈规则',
];

export const NovelIdeaConsultant: React.FC<NovelIdeaConsultantProps> = ({
  configs,
  uiSettings,
  xpPreferences,
  onConfirmOption,
  onClose,
}) => {
  const [inputIdea, setInputIdea] = useState('');
  const [targetPlatformPref, setTargetPlatformPref] = useState('番茄小说');
  const [novelScalePref, setNovelScalePref] = useState('百万字长篇');
  const [xpSystemPref, setXpSystemPref] = useState<boolean>(Boolean(xpPreferences.trim()));

  const [isConsulting, setIsConsulting] = useState(false);
  const [streamStageText, setStreamStageText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentResponse, setCurrentResponse] = useState<NovelConsultantResponse | null>(null);
  const [expandedOptionIdx, setExpandedOptionIdx] = useState<number | null>(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const getActiveApi = () => {
    const cfgId = uiSettings.inspirationApiCfgId || uiSettings.writerApiCfgId;
    const cfg = configs.find((c) => c.id === cfgId) || configs[0];
    const model =
      uiSettings.inspirationApiModel ||
      uiSettings.writerApiModel ||
      cfg?.modelsCache?.[0]?.id ||
      'gemini-3.6-flash';
    return { cfg, model };
  };

  const handleSendIdea = async (overrideText?: string) => {
    const promptText = (overrideText ?? inputIdea).trim();
    if (!promptText || isConsulting) return;

    const { cfg, model } = getActiveApi();
    if (!cfg) {
      setErrorMsg('未检测到可用模型线路，请先前往「引擎与技能」配置 API 线路。');
      return;
    }

    setIsConsulting(true);
    setErrorMsg('');
    setStreamStageText('');
    setInputIdea('');

    const systemInstruction = `你是一位深谙中文网文各大商业平台（番茄、起点、晋江、七猫等）爆款算法与读者心理的顶级金牌总编与立项架构师。
创作者脑海里可能只有一个模糊的碎片灵感、某个人物反差或特定画面。
你的任务是：
1. 一针见血地对创作者的想法进行【市场趋势诊断】（剖析受众爽点、同质化避坑指南与破局切入点）；
2. 依据该核心灵感，推演出【3 套各具特色、定位差异化的小说立项档案】（方案A、方案B、方案C）：
   - 方案A：偏向平台最热卖、高留存强钩子的主流爆款走势；
   - 方案B：偏向高口碑、人物情感拉扯或文笔氛围反差的深度走势；
   - 方案C：偏向脑洞设定解构、高概念强反转的新颖黑马走势。

【硬性要求】：
- 无论哪种方案，必须拆清【黄金三章核心留存钩子】与【L1 终局收束锚点】；
- 必须规划 3~4 卷阶段性分卷纲；
- 严格输出合法纯 JSON 对象（不要包裹 markdown 代码块）：
{
  "marketTrendAnalysis": "一针见血的市场诊断与竞品赛道定位（200字以内）",
  "consultantReply": "对创作者模糊灵感的针对性建议与启发性反馈（150字以内）",
  "options": [
    {
      "id": "opt-1",
      "title": "主书名",
      "alternateTitles": ["备选吸量名1", "备选名2", "备选名3"],
      "genre": "核心题材标签",
      "targetPlatform": "最适宜平台",
      "logline": "一句话核心卖点 (Logline)",
      "golden3ChaptersHook": "前三章核心爆点与留存钩子",
      "l1UltimateEnding": "全书最终结局与母题收束锚点",
      "coreProtagonistAndAntagonist": "核心主角与对手/搭档的人设张力",
      "synopsis": "完整主线大纲草案（含前中后期核心冲突演进）",
      "charactersSummary": "主要角色与重要配角小传档案",
      "worldSummary": "世界观规则或社会力量体系",
      "volumePlan": [
        { "volumeIndex": 1, "title": "第1卷卷名", "chapterSpan": "第1-30章", "climaxGoal": "第1卷阶段大高潮" },
        { "volumeIndex": 2, "title": "第2卷卷名", "chapterSpan": "第31-70章", "climaxGoal": "第2卷阶段大高潮" },
        { "volumeIndex": 3, "title": "第3卷卷名", "chapterSpan": "第71-120章", "climaxGoal": "终卷大决战收束" }
      ]
    }
  ]
}`;

    const userPrompt = `创作者模糊灵感想法：
"${promptText}"

【偏好配置】：
- 目标发布平台：${targetPlatformPref}
- 期望篇幅规模：${novelScalePref}
- XP 审美系统：${xpSystemPref ? '已开启（融入创作者底层审美张力）' : '已关闭（纯商业大众标准）'}
${xpSystemPref && xpPreferences.trim() ? `【创作者底层 XP 审美宪法参考】：\n${xpPreferences.slice(0, 500)}` : ''}

请立即输出市场诊断与 3 套完整独立的小说立项档案 JSON！`;

    try {
      let rawAcc = '';
      await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.75,
        onChunk: (chunk) => {
          rawAcc += chunk;
          setStreamStageText(rawAcc);
        },
      });

      const parsed = repairAndParseJson<NovelConsultantResponse>(rawAcc);
      if (parsed && Array.isArray(parsed.options) && parsed.options.length > 0) {
        setCurrentResponse(parsed);
        setExpandedOptionIdx(0);
      } else {
        throw new Error('未解析出合法的立项方案，请尝试简化描述后重试');
      }
    } catch (err: any) {
      setErrorMsg(`立项推演失败：${err.message || '请检查 API 线路'}`);
    } finally {
      setIsConsulting(false);
      setStreamStageText('');
    }
  };

  const handleSelectOption = async (selectedOpt: NovelConsultantOption) => {
    if (!currentResponse) return;

    const unselected = currentResponse.options.filter((o) => o.id !== selectedOpt.id);

    // Auto-archive unselected options to IndexedDB STORE_NAMES.INSPIRATION_RECORDS
    try {
      const newNovelId = generateUUID();
      for (const unchosen of unselected) {
        const record: InspirationRecord = {
          id: generateUUID(),
          createdAt: Date.now(),
          title: unchosen.title,
          genre: unchosen.genre,
          style: `${unchosen.targetPlatform} 商业网文`,
          outline: `【一句话简介】：${unchosen.logline}\n\n【黄金三章钩子】：\n${unchosen.golden3ChaptersHook}\n\n【主线大纲草案】：\n${unchosen.synopsis}\n\n【L1 终局收束锚点】：\n${unchosen.l1UltimateEnding}`,
          characters: unchosen.charactersSummary || '',
          world: unchosen.worldSummary || '',
          rawContent: JSON.stringify(unchosen, null, 2),
          linkedNovels: [{ novelId: newNovelId, novelTitle: selectedOpt.title }],
        };
        await dbPut(STORE_NAMES.INSPIRATION_RECORDS, record);
      }
    } catch (e) {
      console.warn('Auto-archiving unselected options to inspiration records failed:', e);
    }

    // Call onConfirmOption to instantiate novel project in SetupView
    onConfirmOption(
      {
        title: selectedOpt.title,
        genre: selectedOpt.genre,
        outline: `【一句话简介】：${selectedOpt.logline}\n\n【黄金三章开局】：\n${selectedOpt.golden3ChaptersHook}\n\n【主线大纲】：\n${selectedOpt.synopsis}`,
        characters: selectedOpt.charactersSummary || selectedOpt.coreProtagonistAndAntagonist || '',
        world: selectedOpt.worldSummary || '',
        targetPlatform: selectedOpt.targetPlatform || targetPlatformPref,
        commercialBlurb: selectedOpt.logline,
        alternateTitles: selectedOpt.alternateTitles || [],
        volumePlan: (selectedOpt.volumePlan || []).map((v, i) => ({
          id: generateUUID(),
          volumeIndex: v.volumeIndex || i + 1,
          title: v.title,
          chapterSpan: v.chapterSpan || `第${i * 30 + 1}-${(i + 1) * 30}章`,
          coreConflict: (v as any).coreConflict || '主线矛盾推进',
          climaxGoal: v.climaxGoal,
        })),
        ultimateEnding: selectedOpt.l1UltimateEnding,
      },
      unselected
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
              模糊想法 AI 深度对话构思立项
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            哪怕只有一个画面、一句话梗概或零散萌点，AI 将深度剖析市场趋势并推演 <strong>3 套完整小说立项案</strong>。选用其一创建，<strong>其余备选自动归档至「大纲档案库」</strong>。
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] shrink-0 self-end sm:self-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Preferences Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-[var(--bg-muted)]/60 border border-[var(--border-subtle)] text-xs">
        <div>
          <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
            拟投商业平台
          </label>
          <select
            value={targetPlatformPref}
            onChange={(e) => setTargetPlatformPref(e.target.value)}
            className="studio-input w-full p-2 text-xs"
          >
            <option value="番茄小说">番茄小说 (强情绪/黄金三章/快节奏)</option>
            <option value="起点中文网">起点中文网 (深设定/严谨世界观/长线伏笔)</option>
            <option value="晋江文学城">晋江文学城 (人设反差/极致情感拉扯/氛围感)</option>
            <option value="七猫中文网">七猫中文网 (大众通俗/强冲突下沉)</option>
            <option value="微信读书/出版">微信读书/精英文学 (扎实文笔/生活白描)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
            期望篇幅架构
          </label>
          <select
            value={novelScalePref}
            onChange={(e) => setNovelScalePref(e.target.value)}
            className="studio-input w-full p-2 text-xs"
          >
            <option value="百万字长篇">百万字长篇 (多卷滚动架构)</option>
            <option value="五十万字中长篇">五十万字中长篇 (紧凑强爽感)</option>
            <option value="三十万字精炼本">三十万字精炼本 (单线三幕高潮)</option>
            <option value="单元短篇集">单元短篇集 (独立单元叙事)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
            XP 审美宪法基底
          </label>
          <button
            type="button"
            onClick={() => setXpSystemPref(!xpSystemPref)}
            className={`w-full min-h-[38px] p-2 rounded-xl border text-xs font-medium flex items-center justify-between px-3 cursor-pointer ${
              xpSystemPref
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            <span>{xpSystemPref ? '已开启 XP 创作基底' : '已关闭 (纯商业标准)'}</span>
            <Check className={`w-3.5 h-3.5 ${xpSystemPref ? 'opacity-100' : 'opacity-0'}`} />
          </button>
        </div>
      </div>

      {/* Fuzzy Idea Input */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            ref={inputRef}
            rows={3}
            value={inputIdea}
            onChange={(e) => setInputIdea(e.target.value)}
            placeholder="告诉我你脑子里有什么模糊的碎片想法？例如：某个特定场景、主角的一个反常金手指、一段拉扯关系、或是想要尝试的冷门赛道..."
            className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed pr-24"
            disabled={isConsulting}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSendIdea();
              }
            }}
          />
          <div className="absolute right-3 bottom-3">
            <MotionButton
              type="button"
              disabled={isConsulting || !inputIdea.trim()}
              onClick={() => handleSendIdea()}
              className="btn-primary min-h-[38px] px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {isConsulting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isConsulting ? '构思推演中...' : '推演三套方案'}</span>
            </MotionButton>
          </div>
        </div>

        {/* Quick Inspiration Sparks */}
        {!currentResponse && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-[var(--text-muted)] shrink-0">点击灵感尝试：</span>
            {EXAMPLE_FUZZY_IDEAS.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendIdea(ex)}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-muted)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate max-w-[260px] cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-rose-500/35 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Streaming Stage Output */}
      {isConsulting && streamStageText && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] space-y-2">
          <div className="flex items-center gap-2 font-bold text-[var(--accent)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>AI 资深主编正在推演 3 套独立小说立项方案与分卷架构...</span>
          </div>
          <pre className="font-mono text-[11px] text-[var(--text-muted)] whitespace-pre-wrap max-h-48 overflow-y-auto">
            {streamStageText.slice(-600)}
          </pre>
        </div>
      )}

      {/* Response Display */}
      {currentResponse && (
        <div className="space-y-4">
          {/* Market Diagnosis & Feedback Strip */}
          <div className="p-4 studio-muted space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
              <Award className="w-4 h-4 text-[var(--accent)]" />
              <span>总编市场诊断与竞品赛道研判</span>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {currentResponse.marketTrendAnalysis}
            </p>
            {currentResponse.consultantReply && (
              <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                总编反馈：{currentResponse.consultantReply}
              </p>
            )}
          </div>

          {/* 3 Project Proposals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--text-primary)]">
                推演出的 3 套小说档案方案（选择 1 个立项，其余 2 个自动归档至灵感大纲库）：
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                共 {currentResponse.options.length} 个备选方案
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {currentResponse.options.map((opt, idx) => {
                const isExpanded = expandedOptionIdx === idx;
                const letter = ['A', 'B', 'C'][idx] || `${idx + 1}`;
                return (
                  <div
                    key={opt.id || idx}
                    className="p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm space-y-3.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold font-mono">
                            方案 {letter}
                          </span>
                          <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
                            《{opt.title}》
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--bg-muted)] text-[11px] text-[var(--text-muted)]">
                            {opt.genre} · {opt.targetPlatform}
                          </span>
                        </div>
                        {opt.alternateTitles && opt.alternateTitles.length > 0 && (
                          <p className="text-[11px] text-[var(--text-muted)]">
                            备选吸量名：{opt.alternateTitles.map((t) => `《${t}》`).join('、')}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                        <MotionButton
                          type="button"
                          onClick={() => setExpandedOptionIdx(isExpanded ? null : idx)}
                          className="min-h-[38px] px-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs text-[var(--text-secondary)] flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isExpanded ? '收起详情' : '展开方案'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </MotionButton>

                        <MotionButton
                          type="button"
                          onClick={() => handleSelectOption(opt)}
                          className="btn-primary min-h-[38px] px-4 py-2 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-md"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>选用方案{letter}直接立项创建</span>
                        </MotionButton>
                      </div>
                    </div>

                    {/* Logline & Golden Hook */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-[var(--bg-muted)]/50 border border-[var(--border-subtle)] space-y-1">
                        <div className="text-[11px] font-bold text-[var(--text-primary)]">
                          一句话核心卖点 (Logline)
                        </div>
                        <p className="text-[var(--text-secondary)] leading-relaxed">{opt.logline}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-[var(--bg-muted)]/50 border border-[var(--border-subtle)] space-y-1">
                        <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          黄金三章开局留存钩子
                        </div>
                        <p className="text-[var(--text-secondary)] leading-relaxed">
                          {opt.golden3ChaptersHook}
                        </p>
                      </div>
                    </div>

                    {/* Expandable Details: L1 Ending, Dynamics, Volume Plan */}
                    {isExpanded && (
                      <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                        <div className="space-y-1">
                          <span className="font-bold text-[var(--text-primary)]">
                            L1 终局母题与最终结局锚点：
                          </span>
                          <p className="text-[var(--text-secondary)] leading-relaxed">
                            {opt.l1UltimateEnding}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="font-bold text-[var(--text-primary)]">
                            主线大纲草案：
                          </span>
                          <p className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                            {opt.synopsis}
                          </p>
                        </div>

                        {opt.volumePlan && opt.volumePlan.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="font-bold text-[var(--text-primary)]">
                              分卷蓝图阶段规划：
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {opt.volumePlan.map((vol, vIdx) => (
                                <div
                                  key={vIdx}
                                  className="p-2.5 rounded-xl bg-[var(--bg-muted)] border border-[var(--border-subtle)] text-[11px] space-y-1"
                                >
                                  <div className="font-bold text-[var(--text-primary)]">
                                    {vol.title} ({vol.chapterSpan})
                                  </div>
                                  <div className="text-[var(--text-muted)]">{vol.climaxGoal}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
