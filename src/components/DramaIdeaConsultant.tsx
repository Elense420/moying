import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  ArrowRight,
  RotateCcw,
  MessageSquarePlus,
  Flame,
  UserCheck,
  Edit3,
} from 'lucide-react';
import {
  ApiConfig,
  UiSettings,
  DramaProject,
  DramaCandidatePlan,
  HOT_DRAMA_TRACKS,
} from '../types';
import { streamChatCompletion } from '../services/apiClient';
import {
  buildDramaConsultantMessages,
  parseDramaConsultantResponse,
  DramaConsultantOption,
  DramaConsultantResponse,
} from '../services/dramaPromptEngine';
import { generateUUID } from '../utils/uuid';
import { MotionButton, StaggerCard } from './MotionPrimitives';

interface ConsultantTurnItem {
  id: string;
  userPrompt: string;
  response: DramaConsultantResponse;
}

interface DramaIdeaConsultantProps {
  configs: ApiConfig[];
  uiSettings: UiSettings;
  mode: 'radar' | 'setup';
  existingProjectId?: string;
  existingCreatedAt?: number;
  onConfirmOption: (project: DramaProject, option: DramaConsultantOption) => void;
  onAutoArchiveCandidates?: (candidates: DramaCandidatePlan[], selectedTitle: string) => void;
}

const EXAMPLE_FUZZY_IDEAS = [
  '我想做一个2.5D精致厚涂风格的偶像恋爱剧，其他的我什么都不知道该设定些什么',
  '想做一部适合抖音9:16竖屏的规则怪谈漫剧，节奏要快但还没想好主角金手指与场景',
  '脑子里只有一个画面：暴雨夜舞台顶流男神替小透明词曲人挡下镜头，帮我做立项分析',
  '想做一部新中式古风玄幻的女频逆袭漫剧，不知道当下观众最吃什么样的人设反差',
];

export const DramaIdeaConsultant: React.FC<DramaIdeaConsultantProps> = ({
  configs,
  uiSettings,
  mode,
  existingProjectId,
  existingCreatedAt,
  onConfirmOption,
  onAutoArchiveCandidates,
}) => {
  const [inputIdea, setInputIdea] = useState('');
  const [turns, setTurns] = useState<ConsultantTurnItem[]>([]);
  const [isConsulting, setIsConsulting] = useState(false);
  const [streamStageText, setStreamStageText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
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
    if (!overrideText) {
      setInputIdea('');
    } else {
      setInputIdea('');
    }

    // Build compact multi-turn conversation history so follow-up tweaks have full context
    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    turns.slice(-3).forEach((t) => {
      historyMessages.push({ role: 'user', content: t.userPrompt });
      const summaryOfPrevOptions = t.response.options
        .map((o, i) => `方案0${i + 1}《${o.title}》（${o.directionTag}）：${o.logline}`)
        .join('\n');
      historyMessages.push({
        role: 'assistant',
        content: `市场诊断：${t.response.marketTrendAnalysis}\n反馈：${t.response.consultantReply}\n已给出的候选方案：\n${summaryOfPrevOptions}`,
      });
    });
    historyMessages.push({ role: 'user', content: promptText });

    try {
      const messages = buildDramaConsultantMessages(historyMessages);
      let rawAccum = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.85,
        onChunk: (chunk) => {
          rawAccum += chunk;
          setStreamStageText(rawAccum);
        },
      });

      const finalRaw = res.content || rawAccum;
      const parsed = parseDramaConsultantResponse(finalRaw);

      if (parsed.options.length === 0 && !parsed.consultantReply) {
        setErrorMsg('模型未返回有效立项建议，请重试或切换主力模型。');
      } else {
        setTurns((prev) => [
          ...prev,
          {
            id: generateUUID(),
            userPrompt: promptText,
            response: parsed,
          },
        ]);
      }
    } catch (err: any) {
      setErrorMsg(`立项顾问请求失败：${err.message || '网络连接异常'}`);
      setInputIdea(promptText);
    } finally {
      setIsConsulting(false);
      setStreamStageText('');
    }
  };

  const handleConfirmAndEnterSetup = (opt: DramaConsultantOption, turn: ConsultantTurnItem) => {
    const now = Date.now();
    const matchedTrack =
      HOT_DRAMA_TRACKS.find((t) => t.id === opt.trackId) || HOT_DRAMA_TRACKS[0];

    const seededCharacters = (opt.seedCharacters || []).map((c) => ({
      id: generateUUID(),
      name: c.name,
      roleTag: c.roleTag,
      ageAndArchetype: c.ageAndArchetype,
      appearanceZh: c.appearanceZh,
      visualPromptEn: c.visualPromptEn,
      voicePersona: c.voicePersona,
      signatureTrait: c.signatureTrait,
    }));

    // Auto-backup the other unselected AI proposals into Candidate Project Plans Directory
    if (onAutoArchiveCandidates && turn.response.options.length > 1) {
      const siblingOptions = turn.response.options.filter((o) => o.optionId !== opt.optionId);
      const candidatesToBackup: DramaCandidatePlan[] = siblingOptions.map((sib, idx) => {
        const sibTrack =
          HOT_DRAMA_TRACKS.find((t) => t.id === sib.trackId) || HOT_DRAMA_TRACKS[0];
        return {
          id: generateUUID(),
          createdAt: now + idx,
          sourceType: 'fuzzy-consultant',
          userPromptOrSpark: turn.userPrompt,
          marketTrendAnalysis: turn.response.marketTrendAnalysis,
          consultantReply: turn.response.consultantReply,
          selectedSiblingTitle: opt.title,
          directionTag: sib.directionTag || `备选方向 0${idx + 1}`,
          title: sib.title,
          trackId: sibTrack.id,
          trackName: sibTrack.name,
          channel: sib.channel || sibTrack.channel,
          visualStyle: sib.visualStyle || sibTrack.visualStyleRecommend,
          aspectRatio: sib.aspectRatio || '9:16 竖屏短剧',
          episodeDurationSec: sib.episodeDurationSec || 90,
          paywallEpisodeIndex: sib.paywallEpisodeIndex || 10,
          marketFitReason: sib.marketFitReason,
          logline: sib.logline,
          targetAudience: sib.targetAudience || sibTrack.targetAudience,
          golden3SecHook: sib.golden3SecHook,
          synopsis: sib.synopsis,
          seedCharacters: (sib.seedCharacters || []).map((c) => ({
            id: generateUUID(),
            name: c.name,
            roleTag: c.roleTag,
            ageAndArchetype: c.ageAndArchetype,
            appearanceZh: c.appearanceZh,
            visualPromptEn: c.visualPromptEn,
            voicePersona: c.voicePersona,
            signatureTrait: c.signatureTrait,
          })),
        };
      });
      if (candidatesToBackup.length > 0) {
        onAutoArchiveCandidates(candidatesToBackup, opt.title);
      }
    }

    const projectPayload: DramaProject = {
      id: existingProjectId || generateUUID(),
      title: opt.title,
      createdAt: existingCreatedAt || now,
      lastModifiedAt: now,
      trackId: matchedTrack.id,
      trackName: matchedTrack.name,
      channel: opt.channel || matchedTrack.channel,
      visualStyle: opt.visualStyle || matchedTrack.visualStyleRecommend,
      aspectRatio: opt.aspectRatio || '9:16 竖屏短剧',
      preferredScriptFormat: 'triangle_standard',
      episodeDurationSec: opt.episodeDurationSec || 90,
      totalPlannedEpisodes: 40,
      paywallEpisodeIndex: opt.paywallEpisodeIndex || 10,
      logline: opt.logline,
      targetAudience: opt.targetAudience || matchedTrack.targetAudience,
      golden3SecHook: opt.golden3SecHook,
      synopsis: opt.synopsis,
      characterAssets: seededCharacters,
      sceneAnchors: [],
      episodePlan: [],
      episodes: [],
    };

    onConfirmOption(projectPayload, opt);
  };

  const handlePrefillRefinement = (opt: DramaConsultantOption, idx: number) => {
    const draft = `我比较看重方案 0${idx + 1}《${opt.title}》（${opt.directionTag}），但我想在此基础上调整一下：`;
    setInputIdea(draft);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return (
    <div className="studio-card p-5 sm:p-7 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--accent)] flex items-center gap-1">
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>AI 漫剧首席制片顾问 · 模糊脑洞探讨台</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>当季热门赛道对标 · 多方案比选 · 一键自动立项</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-editorial-serif">
            脑海里只有一个模糊画风或碎片想法？先和 AI 聊聊再立项
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-3xl">
            哪怕只想到一个画风（如「2.5D精致厚涂偶像恋爱剧」）或半句人设，直接告诉 AI 顾问。系统将结合当下漫剧市场热度与大众喜好给出立项分析，并提供 3 套差异化完整设定方案供您挑选；支持多轮追问微调，确认后自动进入立项阶段。
          </p>
        </div>

        {turns.length > 0 && (
          <button
            type="button"
            disabled={isConsulting}
            onClick={() => {
              setTurns([]);
              setErrorMsg('');
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>清空重聊</span>
          </button>
        )}
      </div>

      {/* Quick Starter Sparks when empty */}
      {turns.length === 0 && !isConsulting && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-muted)]">
            不知道怎么开口？点选任一模糊构想示例直接体验立项诊断：
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {EXAMPLE_FUZZY_IDEAS.map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendIdea(sample)}
                className="text-left p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 hover:border-[var(--accent)]/60 hover:bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] leading-relaxed transition-colors cursor-pointer flex items-start justify-between gap-2 group"
              >
                <span className="line-clamp-2">“{sample}”</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Earlier Conversation History Summary (if > 1 turn) */}
      {turns.length > 1 && (
        <div className="space-y-2 border-b border-[var(--border-subtle)] pb-4">
          <p className="text-[11px] font-medium text-[var(--text-muted)]">
            前序探讨记录 ({turns.length - 1} 轮)：
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {turns.slice(0, -1).map((t, idx) => (
              <div key={t.id} className="p-3 rounded-xl studio-muted text-xs space-y-1">
                <p className="font-semibold text-[var(--text-primary)]">
                  第 {idx + 1} 轮您的构想：{t.userPrompt}
                </p>
                <p className="text-[var(--text-secondary)] line-clamp-2">
                  顾问反馈：{t.response.consultantReply}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest Turn Analysis & 3 Pitch Cards */}
      {latestTurn && (
        <div className="space-y-5">
          {/* User Prompt Echo */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 text-xs flex items-start gap-2.5">
            <span className="font-bold text-[var(--text-primary)] shrink-0">您的构想：</span>
            <span className="text-[var(--text-secondary)] leading-relaxed">{latestTurn.userPrompt}</span>
          </div>

          {/* Market Trend Diagnosis + Producer Advice */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs leading-relaxed">
            {latestTurn.response.marketTrendAnalysis && (
              <div className="lg:col-span-7 p-4 rounded-xl studio-muted space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                  <Flame className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>当季漫剧市场热度与画风受众分析</span>
                </div>
                <p className="text-[var(--text-secondary)] whitespace-pre-line">
                  {latestTurn.response.marketTrendAnalysis}
                </p>
              </div>
            )}

            {latestTurn.response.consultantReply && (
              <div
                className={`${
                  latestTurn.response.marketTrendAnalysis ? 'lg:col-span-5' : 'lg:col-span-12'
                } p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5`}
              >
                <div className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>制片顾问破局建议</span>
                </div>
                <p className="text-[var(--text-secondary)] whitespace-pre-line">
                  {latestTurn.response.consultantReply}
                </p>
              </div>
            )}
          </div>

          {/* 3 Differentiated Selectable Pitch Proposals */}
          {latestTurn.response.options.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  为您量身定制 {latestTurn.response.options.length} 套立项方向建议（确认任一方案即自动带入全部设定与初始主角立绘）：
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  选定其中 1 套进入立项后，其余未选建议将自动备份至「备选项目计划目录」，日后可随时回顾阅览或转正立项。
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {latestTurn.response.options.map((opt, idx) => (
                  <StaggerCard key={opt.optionId} index={idx}>
                    <div className="studio-card studio-card-hover p-5 h-full flex flex-col justify-between gap-4">
                      <div className="space-y-3 text-xs">
                        {/* Metadata line */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                            <span className="font-semibold text-[var(--accent)]">{opt.directionTag}</span>
                            <span className="tabular-nums shrink-0">第 {opt.paywallEpisodeIndex} 集付费点</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {opt.channel} · {opt.visualStyle} · {opt.aspectRatio.split(' ')[0]} · 单集{opt.episodeDurationSec || 90}秒
                          </p>
                        </div>

                        {/* Title & Market Fit */}
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-[var(--text-primary)] font-editorial-serif">
                            《{opt.title}》
                          </h4>
                          {opt.marketFitReason && (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                              爆款切口：{opt.marketFitReason}
                            </p>
                          )}
                        </div>

                        {/* Logline */}
                        <p className="text-[var(--text-secondary)] font-medium leading-relaxed">
                          {opt.logline}
                        </p>

                        {/* Golden 3s Hook */}
                        <div className="p-3 rounded-xl studio-muted space-y-1">
                          <span className="font-semibold text-[var(--text-primary)]">⚡ 首集黄金前3秒：</span>
                          <p className="text-[var(--text-secondary)] leading-relaxed">{opt.golden3SecHook}</p>
                        </div>

                        {/* Pre-seeded Characters */}
                        {opt.seedCharacters && opt.seedCharacters.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                              <span>核心主角人设与立绘预置 ({opt.seedCharacters.length}人)：</span>
                            </span>
                            <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                              {opt.seedCharacters.map((ch, ci) => (
                                <div key={ci} className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40">
                                  <span className="font-bold text-[var(--text-primary)]">{ch.name}</span>
                                  <span className="text-[var(--text-muted)]"> · {ch.roleTag}</span>
                                  <p className="text-[var(--text-secondary)] mt-0.5">{ch.ageAndArchetype}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3-Stage Synopsis */}
                        <div className="space-y-1">
                          <span className="font-semibold text-[var(--text-primary)]">三阶段商业大纲：</span>
                          <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-line max-h-36 overflow-y-auto pr-1">
                            {opt.synopsis}
                          </p>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                        <MotionButton
                          type="button"
                          onClick={() => handleConfirmAndEnterSetup(opt, latestTurn)}
                          className="btn-primary w-full min-h-[42px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <span>
                            {mode === 'setup' ? '确认选用此方案填入立项' : '确认此方案并进入立项阶段'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </MotionButton>

                        <button
                          type="button"
                          onClick={() => handlePrefillRefinement(opt, idx)}
                          className="w-full min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>基于此方案继续向 AI 提修改要求</span>
                        </button>
                      </div>
                    </div>
                  </StaggerCard>
                ))}
              </div>
            </div>
          )}

          {/* Quick Follow-Up Refinement Chips */}
          {latestTurn.response.followUpChips.length > 0 && !isConsulting && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                还想再碰撞一下？点选追问方向或直接在下方输入您的新想法：
              </p>
              <div className="flex flex-wrap gap-2">
                {latestTurn.response.followUpChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendIdea(chip)}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-left transition-colors cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Streaming Progress Box */}
      {isConsulting && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
              <span>AI 制片顾问正在结合当季漫剧热度分析您的构想，并推演 3 套立项方案...</span>
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
            <div className="h-full w-1/2 bg-[var(--accent)] rounded-full animate-shimmer-sweep" />
          </div>
          {streamStageText && (
            <p className="text-[11px] font-mono text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap">
              {streamStageText}
            </p>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-600 dark:text-rose-400">
          {errorMsg}
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-2.5 pt-1">
        <textarea
          ref={inputRef}
          rows={3}
          disabled={isConsulting}
          value={inputIdea}
          onChange={(e) => setInputIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSendIdea();
            }
          }}
          placeholder={
            turns.length === 0
              ? '把您脑子里模糊的构想告诉 AI（例如：我想做一个2.5D精致厚涂风格的偶像恋爱剧，其他的我什么都不知道该设定些什么）...'
              : '继续告诉 AI 您的调整想法（例如：我想要方案2的设定，但把女主改成失聪的天才编曲师，男主再腹黑一点）...'
          }
          className="studio-input w-full p-3.5 text-xs sm:text-sm leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">
            支持按 Ctrl/Cmd + Enter 快捷发送 · 物理级隔离个人小说 XP 偏好
          </span>
          <MotionButton
            type="button"
            disabled={isConsulting || !inputIdea.trim()}
            onClick={() => handleSendIdea()}
            className="btn-primary min-h-[42px] px-5 py-2 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            {isConsulting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>分析与构思中...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{turns.length === 0 ? '发送模糊构想，获取立项分析与建议' : '发送反馈，更新立项建议'}</span>
              </>
            )}
          </MotionButton>
        </div>
      </div>
    </div>
  );
};
