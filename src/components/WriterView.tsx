import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  Save,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Play,
  AlertCircle,
  AlertTriangle,
  FileText,
  Check,
  Loader2,
  CheckCircle2,
  Flame,
  X,
  BookOpenText,
  Wand2,
  Clapperboard,
  Sliders,
  Copy,
  Plus,
  Layers,
  ListOrdered,
  Square,
  ShieldCheck,
  ShieldOff,
  FileCheck2,
  MessageSquare,
  Type,
  Search,
} from 'lucide-react';
import {
  Book,
  BookSettings,
  Chapter,
  Summary,
  UiSettings,
  ApiConfig,
  IdeaCard,
  NovelSkill,
  CreativeTrack,
  DramaProject,
  LiveContinuityAlert,
  DialogueCoWriteMessage,
  NovelChapterOutlineItem,
} from '../types';
import { streamChatCompletion, chatCompletion } from '../services/apiClient';
import { buildUnifiedSystemPrompt } from '../services/promptEngine';
import { analyzeTextForZhuque, buildZhuqueDeslopMessages } from '../services/zhuqueAudit';
import {
  analyzeChapterWriteTimeContinuity,
  applyLiveContinuityAnalysisToSettings,
  buildDialogueCoWriteMessages,
  ensureLiveContinuityState,
  parseDialogueCoWriteReply,
  reviseChapterFromLiveAlert,
} from '../services/liveContinuityService';
import { generateUUID } from '../utils/uuid';
import { MotionButton, StaggerList, StaggerItem, ModalPortal } from './MotionPrimitives';
import { ZhuqueAuditModal } from './ZhuqueAuditModal';
import { SafeErrorBoundary } from './SafeErrorBoundary';
import { useContextMenu } from './ContextMenu';
import { WriterQuickRail } from './WriterQuickRail';
import { WriterLeftInspector } from './WriterLeftInspector';
import { LiveContinuityMonitorDock } from './LiveContinuityMonitorDock';
import { DialogueCoWritePanel, DialogueComposerBar } from './DialogueCoWritePanel';

interface WriterViewProps {
  currentBook: Book | null;
  books?: Book[];
  dramaProjects?: DramaProject[];
  currentChapterIndex: number;
  setCurrentChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  xpPreferences: string;
  globalSkills: NovelSkill[];
  onSaveBook: (updatedBook: Book) => Promise<void>;
  onGoToSetup: () => void;
  onOpenSummaryViewModal: (summary: Summary) => void;
  onOpenManuscriptAudit?: (book: Book, focusChapterIndex?: number) => void;
  onSelectBook?: (book: Book) => void;
  onSelectDramaProject?: (project: DramaProject) => void;
  onSwitchTrack?: (track: CreativeTrack) => void;
}

/**
 * Robustly parses generated raw chapter output into Title, Main Body Text, and 4 Suggestions.
 */
export function parseChapterAndSuggestions(rawText: string, defaultTitle: string) {
  const defaultSuggestions = [
    '外部突发事件打破当前室内的微妙平衡，两人被迫共同前往危机现场，在应对外部压力时暴露出极致的保护欲与默契。',
    '关键配角携重要旧日线索登门，无意间触碰主角深藏的伤疤，引发一场暗流汹涌的试探与深夜独处安抚。',
    '主角因先前暗伤或疲惫陷入短暂虚弱，另一方卸下平日冷硬伪装贴身照料，克制已久的情感在近距离接触中濒临失控。',
    '一场涉及双方核心立场的突发交锋骤然降临，两人在信息差拉扯中做出意外抉择，将关系推向无法退回的新临界点。',
  ];

  if (!rawText) {
    return {
      title: defaultTitle,
      bodyText: '',
      suggestions: defaultSuggestions,
    };
  }

  let mainPart = rawText;
  let suggestionsPart = '';

  const suggestionHeaderRegex =
    /(?:(?:\r?\n){1,2}(?:---|___|\*\*\*)\s*)?(?:(?:\r?\n){1,2}#{1,6}\s*|\r?\n\*{2}|\r?\n【|\r?\n)?(?:后续(?:发展|剧情)?(?:建议|思路|方向|走向)|剧情发展建议|后续灵感方向|后续建议)(?:】|\*\*|：|:|\s|\r?\n)*/i;

  const match = rawText.match(suggestionHeaderRegex);
  if (match && match.index !== undefined) {
    mainPart = rawText.substring(0, match.index).trim();
    suggestionsPart = rawText.substring(match.index + match[0].length).trim();
  } else if (rawText.includes('---')) {
    const parts = rawText.split('---');
    mainPart = parts[0] || '';
    suggestionsPart = parts.slice(1).join('\n') || '';
  }

  let title = defaultTitle;
  const titleMatch = mainPart.match(/^(?:\s*#{1,4}\s*|\s*第[零一二三四五六七八九十百千万\d]+章[^\r\n]*)/);
  if (mainPart.match(/###?\s*(.*)/)) {
    const m = mainPart.match(/###?\s*(.*)/);
    if (m && m[1]) {
      const cleaned = m[1].replace(/^[#*\s]+|[#*\s]+$/g, '').trim();
      if (cleaned) title = cleaned;
    }
  } else if (titleMatch) {
    const firstLine = mainPart.split(/\r?\n/)[0].replace(/^[#*\s]+|[#*\s]+$/g, '').trim();
    if (firstLine && firstLine.length <= 40) {
      title = firstLine;
    }
  }

  let bodyText = mainPart.replace(/^###?.*/m, '').trim();
  if (bodyText.startsWith(title) && bodyText.length > title.length + 10) {
    bodyText = bodyText.slice(title.length).trim();
  }

  bodyText = bodyText
    .replace(/(?:\r?\n){1,2}(?:---|___|\*\*\*)\s*$/g, '')
    .replace(/(?:\r?\n){1,2}#{1,6}\s*(?:后续(?:发展|剧情)?(?:建议|思路|方向)|剧情发展建议).*/gi, '')
    .replace(/(?:\r?\n){1,2}【(?:后续(?:发展|剧情)?(?:建议|思路|方向)|剧情发展建议)】.*/gi, '')
    .trim();

  const suggestions: string[] = [];
  if (suggestionsPart) {
    const cleanedText = suggestionsPart
      .replace(/^(?:#{1,6}\s*|\*{1,2}|【)?(?:后续(?:发展|剧情)?(?:建议|思路|方向)|剧情发展建议)[】\*\:\：\s]*/gi, '')
      .trim();

    const lines = cleanedText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const itemMatch = trimmed.match(/^(?:[-*•]\s*|\d+[\.、\s]\s*|(?:\[|【)?(?:建议|选项)\d+(?:\]|】|：|:)?\s*)\s*(.+)/);
      const itemContent = itemMatch?.[1]
        ? itemMatch[1].replace(/^\[|\]$|^【|】$/g, '').trim()
        : trimmed.replace(/^[-*•\d\.、\[\]【】建议选项\:\：\s]+/, '').trim();

      if (
        itemContent &&
        itemContent.length > 4 &&
        !itemContent.startsWith('#') &&
        !itemContent.startsWith('---') &&
        !suggestions.includes(itemContent)
      ) {
        suggestions.push(itemContent);
      }
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(...defaultSuggestions);
  }

  return {
    title,
    bodyText,
    suggestions: suggestions.slice(0, 4),
  };
}

const FOCUS_FONT_CLASSES = ['text-base', 'text-lg', 'text-xl', 'text-2xl'] as const;

export const WriterView: React.FC<WriterViewProps> = ({
  currentBook,
  books = [],
  dramaProjects = [],
  currentChapterIndex,
  setCurrentChapterIndex,
  configs,
  uiSettings,
  xpPreferences,
  globalSkills,
  onSaveBook,
  onGoToSetup,
  onOpenSummaryViewModal,
  onOpenManuscriptAudit,
  onSelectBook,
  onSelectDramaProject,
  onSwitchTrack,
}) => {
  const [isRewriteOpen, setIsRewriteOpen] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [confirmClearSuggestions, setConfirmClearSuggestions] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  // Climax Slow-Motion & Focus Reading Mode
  const [climaxMultiplierEnabled, setClimaxMultiplierEnabled] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusFontStep, setFocusFontStep] = useState<number>(1);
  const [focusTheme, setFocusTheme] = useState<'sepia' | 'dark' | 'light'>('sepia');

  // Audit Modal & Inline Paragraph Polish Modal
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isPolishModalOpen, setIsPolishModalOpen] = useState(false);
  const [polishSourceText, setPolishSourceText] = useState('');
  const [polishRange, setPolishRange] = useState<{ start: number; end: number } | null>(null);
  const [polishMode, setPolishMode] = useState<'anti_ai' | 'sensory_slow' | 'dialogue' | 'custom'>('anti_ai');
  const [polishCustomHint, setPolishCustomHint] = useState('');
  const [polishResultText, setPolishResultText] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);

  // 4-Beat Chapter Director
  const [isGeneratingBeats, setIsGeneratingBeats] = useState(false);

  // Editable chapter fields
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterText, setChapterText] = useState('');

  // Plot inputs
  const [rewritePlotInput, setRewritePlotInput] = useState('');
  const [nextPlotInput, setNextPlotInput] = useState('');

  // Idea Cards Overlay
  const [ideaCards, setIdeaCards] = useState<IdeaCard[]>([]);
  const [selectedIdeaCardIds, setSelectedIdeaCardIds] = useState<string[]>([]);
  const [ideaCategoryFilter, setIdeaCategoryFilter] = useState<string>('核心爆点');
  const [isIdeaCardsSectionOpen, setIsIdeaCardsSectionOpen] = useState(false);

  // Generation & Feedback states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRerolling, setIsRerolling] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [genMeta, setGenMeta] = useState('');
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);
  const [lastFailedRequest, setLastFailedRequest] = useState<{ plotHint: string; isRewrite: boolean } | null>(null);
  const [noticeModal, setNoticeModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastAutoSavedTime, setLastAutoSavedTime] = useState('');

  // Multi-Chapter Batch Generation & Stipulated Word Count State (Requirement 4)
  const [directorMode, setDirectorMode] = useState<'single' | 'batch'>('single');
  const [batchChapterCount, setBatchChapterCount] = useState<number>(3);
  const [stipulatedWordsPerChapter, setStipulatedWordsPerChapter] = useState<number>(() =>
    Number(currentBook?.settings?.chapterWords || 3500)
  );
  const [batchProgress, setBatchProgress] = useState<{
    currentStep: number;
    totalSteps: number;
    currentChapNum: number;
  } | null>(null);
  const stopBatchAfterCurrentRef = useRef<boolean>(false);
  const [stopBatchRequested, setStopBatchRequested] = useState<boolean>(false);
  const [isZhuqueModalOpen, setIsZhuqueModalOpen] = useState<boolean>(false);

  // Floating Quick Rail (collapsed by default -> opens over screen only on click) + Mobile Tab + Dual Creation Mode + Live Continuity States
  const [isQuickRailOpen, setIsQuickRailOpen] = useState<boolean>(false);
  const [mobilePaneTab, setMobilePaneTab] = useState<'chapters_settings' | 'manuscript' | 'director'>('manuscript');
  const [creationMode, setCreationMode] = useState<'outline' | 'dialogue'>('outline');
  const [isCheckingContinuity, setIsCheckingContinuity] = useState<boolean>(false);
  const [fixingAlertId, setFixingAlertId] = useState<string | null>(null);
  const [isDialogueSending, setIsDialogueSending] = useState<boolean>(false);

  // Manual Typography Controls (Line Height & Letter Spacing)
  const [lineHeight, setLineHeight] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('writer_line_height'));
      return Number.isFinite(saved) && saved >= 1.35 && saved <= 2.8 ? saved : 1.92;
    } catch {
      return 1.92;
    }
  });
  const [letterSpacing, setLetterSpacing] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('writer_letter_spacing'));
      return Number.isFinite(saved) && saved >= -0.02 && saved <= 0.16 ? saved : 0.025;
    } catch {
      return 0.025;
    }
  });
  const [isTypographyOpen, setIsTypographyOpen] = useState<boolean>(false);

  // Left-Inspector -> Manuscript Keyword Locating
  const [locatedKeyword, setLocatedKeyword] = useState<string>('');
  const [locatedMatchIndex, setLocatedMatchIndex] = useState<number>(0);

  const liveZhuqueReport = useMemo(() => analyzeTextForZhuque(chapterText), [chapterText]);

  const isInitialChapterLoadRef = useRef(true);
  const autoStartedBookIdsRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const manuscriptScrollRef = useRef<HTMLDivElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);
  const typographyPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentBook?.settings?.chapterWords) {
      setStipulatedWordsPerChapter(Number(currentBook.settings.chapterWords) || 3500);
    }
  }, [currentBook?.id, currentBook?.settings?.chapterWords]);

  useEffect(() => {
    document.documentElement.style.setProperty('--chapter-line-height', String(lineHeight));
    try {
      localStorage.setItem('writer_line_height', String(lineHeight));
    } catch {
      // ignore storage errors
    }
  }, [lineHeight]);

  useEffect(() => {
    document.documentElement.style.setProperty('--chapter-letter-spacing', `${letterSpacing}em`);
    try {
      localStorage.setItem('writer_letter_spacing', String(letterSpacing));
    } catch {
      // ignore storage errors
    }
  }, [letterSpacing]);

  useEffect(() => {
    setLocatedKeyword('');
    setLocatedMatchIndex(0);
  }, [currentBook?.id, currentChapterIndex]);

  useEffect(() => {
    if (!isTypographyOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        typographyPopoverRef.current &&
        !typographyPopoverRef.current.contains(e.target as Node)
      ) {
        setIsTypographyOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [isTypographyOpen]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_novelist_idea_cards');
      if (saved) {
        setIdeaCards(JSON.parse(saved));
        return;
      }
    } catch {
      // ignore parse errors
    }
    setIdeaCards([]);
  }, []);

  const filteredIdeaCards = useMemo(() => {
    if (ideaCategoryFilter === '全部') return ideaCards;
    return ideaCards.filter((card) => (card.category || '收集箱') === ideaCategoryFilter);
  }, [ideaCards, ideaCategoryFilter]);

  const activeChapter: Chapter | undefined = currentBook?.chapters[currentChapterIndex];
  const isLastChapter = Boolean(
    currentBook && (currentBook.chapters.length === 0 || currentChapterIndex === currentBook.chapters.length - 1)
  );

  const writerCfg = configs.find((c) => c.id === uiSettings.writerApiCfgId) || configs[0];
  const activeModelName = uiSettings.writerApiModel || 'gemini-3.6-flash';

  // Live Prompt & SKILL Audit Report for current writing context
  const liveAuditReport = useMemo(() => {
    if (!currentBook) return null;
    const prevTail = activeChapter?.text ? activeChapter.text.slice(-500) : '';
    const selectedCardsText = ideaCards
      .filter((c) => selectedIdeaCardIds.includes(c.id))
      .map((c) => c.content)
      .join('\n');
    const corpus = `${currentBook.title}\n${nextPlotInput}\n${rewritePlotInput}\n${selectedCardsText}\n${prevTail}`;

    return buildUnifiedSystemPrompt({
      scope: 'chapter',
      roleHeader: '你是一名顶级资深职业小说家，正在创作连载小说正文。',
      book: currentBook,
      globalSkills,
      xpPreferences,
      contextCorpus: corpus,
      climaxMode: climaxMultiplierEnabled,
      targetChapterIndex: (currentBook.chapters?.length || 0) + 1,
    });
  }, [
    currentBook,
    activeChapter?.text,
    nextPlotInput,
    rewritePlotInput,
    selectedIdeaCardIds,
    ideaCards,
    globalSkills,
    xpPreferences,
    climaxMultiplierEnabled,
  ]);

  // Build Sliding Memory Context from any Book snapshot (supports multi-chapter continuous loop!)
  const buildMemoryContextForBook = (bookSnap: Book | null, upToChapterIndex?: number) => {
    if (!bookSnap) return '';
    const memoryCount = Number(bookSnap.settings?.contextMemory ?? 4);
    const parts: string[] = [];

    if (bookSnap.summaries && bookSnap.summaries.length > 0) {
      const summaryText = bookSnap.summaries
        .map((s) => `• 【${s.title || s.chapterRange || '阶段总结'}】：${s.content}`)
        .join('\n');
      parts.push(`# 前情阶段总结与伏笔脉络\n${summaryText}`);
    }

    const sourceChapters =
      typeof upToChapterIndex === 'number'
        ? bookSnap.chapters.slice(0, upToChapterIndex)
        : bookSnap.chapters;

    if (memoryCount > 0 && sourceChapters.length > 0) {
      const recentChapters = sourceChapters.slice(-memoryCount);
      const chapterParts: string[] = [];

      recentChapters.forEach((ch, idx) => {
        const isLatest = idx === recentChapters.length - 1;
        const fullText = ch.text || '';
        if (isLatest) {
          if (fullText.length > 1300) {
            const head = fullText.slice(0, 320);
            const tail = fullText.slice(-880);
            chapterParts.push(
              `【第${ch.index}章《${ch.title}》核心接续现场】\n[开篇背景]：${head}...\n\n[章末停笔现场（本章必须从此处紧密顺承，推进新事件）]：\n${tail}`
            );
          } else {
            chapterParts.push(`【第${ch.index}章《${ch.title}》完整现场】\n${fullText}`);
          }
        } else {
          chapterParts.push(`【第${ch.index}章《${ch.title}》前情摘要】\n${fullText.slice(0, 420)}...`);
        }
      });

      parts.push(
        `# 最近 ${recentChapters.length} 章剧情承接\n${chapterParts.join('\n\n')}\n\n【严禁复读警示】：上一章已发生过的心理独白与对话已成定局，本章必须紧接上一章末尾开启新的动作、对话或场景推进！`
      );
    }

    return parts.join('\n\n');
  };

  const buildMemoryContext = (upToChapterIndex?: number) =>
    buildMemoryContextForBook(currentBook, upToChapterIndex);

  const handleToggleBookXpSystem = async () => {
    if (!currentBook || isGenerating) return;
    const currentEnabled =
      currentBook.settings?.xpSystemEnabled !== undefined
        ? Boolean(currentBook.settings.xpSystemEnabled)
        : Boolean((xpPreferences || '').trim());
    const nextEnabled = !currentEnabled;
    const updatedBook: Book = {
      ...currentBook,
      settings: {
        ...currentBook.settings,
        xpSystemEnabled: nextEnabled,
      },
      lastModifiedAt: Date.now(),
    };
    await onSaveBook(updatedBook);
    triggerQuickToast(
      nextEnabled ? '已开启本书 XP 审美基底' : '已关闭本书 XP 系统（纯净商业叙事）'
    );
  };

  const handleSaveChapterEdits = async () => {
    if (!currentBook || currentChapterIndex < 0) return;
    const updatedChapters = [...currentBook.chapters];
    const target = updatedChapters[currentChapterIndex];
    if (!target) return;

    target.title = chapterTitle.trim();
    target.text = chapterText.trim();
    target.meta = `手动保存于 ${new Date().toLocaleTimeString()}`;
    target.userNextPlotInput = nextPlotInput.trim();

    await onSaveBook({
      ...currentBook,
      chapters: updatedChapters,
      lastModifiedAt: Date.now(),
    });

    setLastAutoSavedTime(new Date().toLocaleTimeString());
    setAutoSaveStatus('saved');
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 2000);
  };

  const handleSaveNextPlotInput = async (value: string) => {
    setNextPlotInput(value);
    if (!currentBook || !isLastChapter) return;
    const updatedChapters = [...currentBook.chapters];
    const target = updatedChapters[currentChapterIndex];
    if (target) {
      target.userNextPlotInput = value.trim();
      await onSaveBook({
        ...currentBook,
        chapters: updatedChapters,
      });
    }
  };

  const handleToggleIdeaCard = (id: string) => {
    setSelectedIdeaCardIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Feature: 4-Beat Chapter Director (生成本章 4 幕节拍细纲)
  const handleGenerateChapterBeats = async () => {
    if (!currentBook || isGenerating || isGeneratingBeats) return;
    setIsGeneratingBeats(true);
    setGenMeta('正在结合大纲、前文末尾与 SKILL 编排下一章 4 幕场景节拍...');

    try {
      const targetChapNum = (currentBook.chapters?.length || 0) + 1;
      const prevTail = activeChapter?.text ? activeChapter.text.slice(-700) : '（本书开篇第一章）';

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: '你是一位擅长控制叙事节奏与名场面张力的小说分镜导演。',
        book: currentBook,
        globalSkills,
        xpPreferences,
        contextCorpus: `${currentBook.title}\n${nextPlotInput}\n${prevTail}`,
        targetChapterIndex: targetChapNum,
      });

      const prompt = `请为即将创作的第 ${targetChapNum} 章设计一份简练、可直接驱动正文扩写的【单章 4 幕节拍细纲】：
上一章结尾现场：
${prevTail}

${nextPlotInput.trim() ? `作者当前初步想法：${nextPlotInput.trim()}\n` : ''}
要求：
1. 严格分为【第一幕·承接与异动】、【第二幕·交锋与推进】、【第三幕·情感/冲突高潮点】、【第四幕·章末留钩】四段；
2. 必须包含至少一次具体的空间移动或外部事件介入，杜绝原地纯心理复读；
3. 总字数控制在 220 字以内，纯文本输出，不要带多余寒暄。`;

      const res = await chatCompletion({
        provider: writerCfg?.provider,
        baseUrl: writerCfg?.baseUrl,
        apiKey: writerCfg?.apiKey,
        model: activeModelName,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.85,
      });

      if (res?.content?.trim()) {
        await handleSaveNextPlotInput(res.content.trim());
        setGenMeta(`第 ${targetChapNum} 章 4 幕节拍细纲已生成填入`);
      }
    } catch (err: any) {
      setGenMeta(`节拍生成失败：${err.message || '网络异常'}`);
    } finally {
      setIsGeneratingBeats(false);
    }
  };

  // Feature: Inline Paragraph AI Polish / Tension Boost (scope: 'polish')
  const handleOpenPolishModal = () => {
    if (isEditMode && textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (end > start) {
        setPolishSourceText(chapterText.slice(start, end));
        setPolishRange({ start, end });
        setPolishResultText('');
        setIsPolishModalOpen(true);
        return;
      }
    }
    // If no text is selected, default to last ~350 chars or empty for user to paste/select
    const fallbackSample = chapterText.slice(-380).trim();
    setPolishSourceText(fallbackSample);
    setPolishRange(
      fallbackSample && chapterText.endsWith(fallbackSample)
        ? { start: chapterText.length - fallbackSample.length, end: chapterText.length }
        : null
    );
    setPolishResultText('');
    setIsPolishModalOpen(true);
  };

  const handleRunParagraphPolish = async () => {
    if (!currentBook || !polishSourceText.trim() || isPolishing) return;
    setIsPolishing(true);

    try {
      const audit = buildUnifiedSystemPrompt({
        scope: 'polish',
        roleHeader: '你是一位文字功底深厚的文学精修编辑，专门负责对小说局部段落进行去AI味润色与张力升级。',
        book: currentBook,
        globalSkills,
        xpPreferences,
        contextCorpus: `${polishSourceText}\n${polishCustomHint}`,
      });

      const modeInstructions: Record<typeof polishMode, string> = {
        anti_ai: '彻底剔除翻译腔与“然而/不得不承认/眼神闪过一丝”等套话，改写为地道简练、富有呼吸感的中文文学表达，保持原意与剧情不变。',
        sensory_slow: '将镜头放慢 1.8 倍，补充光影温度、呼吸声频、指节力度与克制拉扯的微动作细节，强化人物张力。',
        dialogue: '打磨人物台词与停顿动作，删去说教味长句，增加言外之意、欲言又止与动作打断效果。',
        custom: polishCustomHint.trim() || '精修文笔质感，提升画面感与情绪张力。',
      };

      const userPrompt = `请对以下小说选段执行精修（直接输出改写后的纯正文段落，严禁附带任何解释或引号说明）：

【精修方向】：${modeInstructions[polishMode]}
${polishMode !== 'custom' && polishCustomHint.trim() ? `【补充要求】：${polishCustomHint.trim()}\n` : ''}
【待精修原文】：
${polishSourceText}`;

      const res = await chatCompletion({
        provider: writerCfg?.provider,
        baseUrl: writerCfg?.baseUrl,
        apiKey: writerCfg?.apiKey,
        model: activeModelName,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.78,
      });

      if (res?.content?.trim()) {
        setPolishResultText(res.content.trim());
      }
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: '段落精修失败',
        message: err.message || 'API 请求异常，请检查网络或模型线路配置。',
      });
    } finally {
      setIsPolishing(false);
    }
  };

  const handleApplyPolishedParagraph = async () => {
    if (!currentBook || !polishResultText.trim()) return;
    let newFullText = chapterText;

    if (polishRange && chapterText.slice(polishRange.start, polishRange.end) === polishSourceText) {
      newFullText =
        chapterText.slice(0, polishRange.start) + polishResultText + chapterText.slice(polishRange.end);
    } else if (polishSourceText && chapterText.includes(polishSourceText)) {
      newFullText = chapterText.replace(polishSourceText, polishResultText);
    } else {
      newFullText = `${chapterText}\n\n${polishResultText}`.trim();
    }

    setChapterText(newFullText);
    setIsPolishModalOpen(false);

    if (currentChapterIndex >= 0 && currentBook.chapters[currentChapterIndex]) {
      const updatedChapters = [...currentBook.chapters];
      updatedChapters[currentChapterIndex] = {
        ...updatedChapters[currentChapterIndex],
        text: newFullText,
        meta: `局部精修于 ${new Date().toLocaleTimeString()}`,
      };
      await onSaveBook({
        ...currentBook,
        chapters: updatedChapters,
        lastModifiedAt: Date.now(),
      });
    }
  };

  // Core Single Chapter Expansion & Rewrite Flow (wired through unified promptEngine!)
  const handleGenerateNextChapter = async (plotHint: string = '', isRewrite: boolean = false) => {
    if (!currentBook || isGenerating) return;

    setIsGenerating(true);
    setBatchProgress(null);
    setConfirmRewrite(false);
    const chapterIndexToGen = isRewrite ? currentChapterIndex + 1 : (currentBook.chapters?.length || 0) + 1;
    const words = Math.max(500, Number(stipulatedWordsPerChapter || currentBook.settings?.chapterWords || 3500));
    setGenMeta(`正在装载11大系统设定、章节细纲与世界书，流式执笔第 ${chapterIndexToGen} 章（规定 ${words} 字）...`);

    const memory = buildMemoryContextForBook(currentBook, isRewrite ? currentChapterIndex : undefined);

    const plannedOutline = (currentBook.settings?.chapterOutlines || []).find(
      (c) => c.chapterIndex === chapterIndexToGen
    );

    let combinedPlotHint = (plotHint || (!isRewrite ? nextPlotInput : '') || '').trim();
    if (plannedOutline && !combinedPlotHint.includes(plannedOutline.summary)) {
      const outlineDirective = `【本章预设章节细纲（第${plannedOutline.chapterIndex}章《${plannedOutline.title}》）】\n${plannedOutline.summary}${
        plannedOutline.hookNote ? `\n章末悬念留钩目标：${plannedOutline.hookNote}` : ''
      }`;
      combinedPlotHint = combinedPlotHint
        ? `${outlineDirective}\n\n【作者补充导演指令】\n${combinedPlotHint}`
        : outlineDirective;
    }

    const selectedCards = ideaCards.filter((c) => selectedIdeaCardIds.includes(c.id));
    if (selectedCards.length > 0) {
      const cardsText = selectedCards
        .map((c) => `- 【${c.category || '核心爆点'} · ${c.tag || '灵感'}】：${c.content}`)
        .join('\n');
      combinedPlotHint = combinedPlotHint
        ? `${combinedPlotHint}\n\n# 本章必须自然融入的灵感卡片：\n${cardsText}`
        : `# 本章必须自然融入的灵感卡片：\n${cardsText}`;
    }

    const prevTailForTrigger =
      currentBook.chapters.length > 0
        ? currentBook.chapters[Math.max(0, chapterIndexToGen - 2)]?.text?.slice(-600) || ''
        : '';

    const audit = buildUnifiedSystemPrompt({
      scope: 'chapter',
      roleHeader: '你是一名顶级资深职业小说家，正在严格按照作品11大系统设定、章节细纲、世界书与已挂载 SKILL 规范创作小说章节。',
      book: currentBook,
      globalSkills,
      xpPreferences,
      contextCorpus: `${currentBook.title}\n${combinedPlotHint}\n${prevTailForTrigger}`,
      climaxMode: climaxMultiplierEnabled,
      targetChapterIndex: chapterIndexToGen,
    });

    const minWords = Math.round(words * 0.9);
    const maxWords = Math.round(words * 1.15);
    let userPrompt = `请创作第 ${chapterIndexToGen} 章正文。
【硬性字数规定】：创作者明确规定本章正文目标字数为 **${words} 字**（有效汉字区间建议 ${minWords} ~ ${maxWords} 字）。请扎实铺陈场景感官、动作交锋与人物对话细节，严禁敷衍缩水或草草收尾！`;
    if (memory) {
      userPrompt += `\n\n${memory}\n`;
    }
    if (combinedPlotHint) {
      userPrompt += `\n# 本章核心推进指令与细纲（最高剧情优先级，请完整落地）：\n${combinedPlotHint}\n`;
    }

    userPrompt += `\n输出格式规范（严格遵守分隔符，正文中严禁出现 "---"）：
### 第${chapterIndexToGen}章：${plannedOutline?.title ? plannedOutline.title : '[拟定富有画面感与张力的章节标题]'}
[此处开始章节正文，段落清晰，对话与微动作交织，严格写足约 ${words} 字]
---
#### 后续发展建议
- [建议1：包含具体外部事件触发、人物互动与悬念留钩的下一章走向，35~80字]
- [建议2：包含具体空间转换或新矛盾介入的下一章走向，35~80字]
- [建议3：侧重主角双方关系试探、信息差揭露或张力拉扯的下一章走向，35~80字]
- [建议4：意料之外的转折或危机迫近走向，35~80字]`;

    let accumulatedRaw = '';
    const startTime = Date.now();

    try {
      const result = await streamChatCompletion({
        provider: writerCfg?.provider,
        baseUrl: writerCfg?.baseUrl,
        apiKey: writerCfg?.apiKey,
        model: activeModelName,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: Number(currentBook.settings?.temperature || 0.85),
        onChunk: (chunk) => {
          accumulatedRaw += chunk;
          const parsed = parseChapterAndSuggestions(accumulatedRaw, `第 ${chapterIndexToGen} 章`);
          if (parsed.title) setChapterTitle(parsed.title);
          setChapterText(parsed.bodyText);
        },
      });

      const latency = Date.now() - startTime;
      const finalRaw = result.content || accumulatedRaw;
      const parsed = parseChapterAndSuggestions(finalRaw, `第 ${chapterIndexToGen} 章`);

      // Empty response (0-word) guard
      if (parsed.bodyText.trim().length === 0) {
        if (activeChapter) {
          setChapterText(activeChapter.text || '');
          setChapterTitle(activeChapter.title || '');
        }
        setGenMeta('AI 本次返回正文为 0 字（空回），已自动拦截并保护原章节与您的走向指令。');
        setLastFailedRequest({ plotHint: plotHint || nextPlotInput, isRewrite });

        setNoticeModal({
          isOpen: true,
          type: 'error',
          title: '已拦截 AI 空回（正文 0 字）',
          message:
            '模型本次未输出有效正文（常见于节点拥堵、超时截断或安全拦截）。\n\n系统未计入废章，原有章节与您刚才填写的扩写指令均已完整保留，点击「一键重试生成该章节」即可直接重发！',
        });
        setIsGenerating(false);
        return;
      }

      setLastFailedRequest(null);

      let finalBodyText = parsed.bodyText;
      let deslopTag = '';

      // Optional Automatic Post-Write Zhuque De-Slop Pass when enabled and AI risk >= 22%
      if (currentBook.settings?.autoZhuqueDeslop) {
        const preAudit = analyzeTextForZhuque(finalBodyText);
        if (preAudit.aiRiskScore >= 22) {
          setGenMeta(
            `初稿完成（朱雀风险 ${preAudit.aiRiskScore}%），正在自动执行 story-deslop 人类化去味重铸...`
          );
          const charVoiceNotes = (currentBook.settings?.characterGraph || [])
            .map(
              (c) =>
                `${c.name}(${c.roleType})：声纹「${c.speechStyle || '贴合人设'}」 | 知情边界「${
                  c.epistemicBoundary || '仅知亲历'
                }」`
            )
            .join('\n');
          const deslopMsgs = buildZhuqueDeslopMessages({
            chapterTitle: parsed.title,
            chapterText: finalBodyText,
            auditReport: preAudit,
            distilledStyle: currentBook.settings?.activeDistilledStyle,
            characterSpeechNotes: charVoiceNotes,
          });
          let deslopAcc = '';
          const deslopRes = await streamChatCompletion({
            provider: writerCfg?.provider,
            baseUrl: writerCfg?.baseUrl,
            apiKey: writerCfg?.apiKey,
            model: activeModelName,
            messages: deslopMsgs,
            temperature: 0.35,
            onChunk: (c) => {
              deslopAcc += c;
              setChapterText(deslopAcc);
            },
          });
          const cleanedDeslop = (deslopRes.content || deslopAcc).trim();
          if (cleanedDeslop.length >= finalBodyText.length * 0.65) {
            finalBodyText = cleanedDeslop;
            const postAudit = analyzeTextForZhuque(finalBodyText);
            deslopTag = ` · 朱雀去味(${preAudit.aiRiskScore}%→${postAudit.aiRiskScore}%)`;
          }
        }
      }

      const metaText = `${activeModelName} · ${(latency / 1000).toFixed(1)}s · ${finalBodyText.length}/${words}字 · ${audit.xpSystemEnabled ? 'XP开' : 'XP关'} · ${audit.activeSkills.length}项SKILL${deslopTag}`;

      const newChapter: Chapter = {
        id: generateUUID(),
        index: chapterIndexToGen,
        title: parsed.title,
        text: finalBodyText,
        meta: metaText,
        userNextPlotInput: '',
        allSuggestions: [{ suggestions: parsed.suggestions, timestamp: Date.now() }],
      };

      let updatedChapters = [...currentBook.chapters];
      const archivedChapters = [...(currentBook.archivedChapters || [])];

      if (isRewrite) {
        const chaptersToArchive = updatedChapters.slice(currentChapterIndex);
        chaptersToArchive.forEach((ch) => {
          archivedChapters.push({ ...ch, archivedAt: Date.now() });
        });
        updatedChapters = updatedChapters.slice(0, currentChapterIndex);
        updatedChapters.push(newChapter);
      } else {
        if (updatedChapters.length > 0) {
          const prevCh = updatedChapters[updatedChapters.length - 1];
          if (prevCh && (plotHint || nextPlotInput)) {
            prevCh.userNextPlotInput = (plotHint || nextPlotInput).trim();
          }
        }
        updatedChapters.push(newChapter);
      }

      const updatedChapterOutlines = (currentBook.settings?.chapterOutlines || []).map((co) =>
        co.chapterIndex === chapterIndexToGen ? { ...co, status: 'drafted' as const } : co
      );

      let savedBook: Book = {
        ...currentBook,
        chapters: updatedChapters,
        archivedChapters,
        settings: {
          ...currentBook.settings,
          chapterWords: words,
          chapterOutlines: updatedChapterOutlines,
        },
        lastModifiedAt: Date.now(),
      };

      await onSaveBook(savedBook);
      setCurrentChapterIndex(updatedChapters.length - 1);
      setRewritePlotInput('');
      setNextPlotInput('');
      setGenMeta(metaText);

      // Automatic Write-Time Live Continuity Firewall Tracking & Logic Verification
      if (ensureLiveContinuityState(savedBook).enabled) {
        try {
          setIsCheckingContinuity(true);
          setGenMeta(`${metaText} · 正在同步状态账本并实时核查逻辑漏洞...`);
          const analysis = await analyzeChapterWriteTimeContinuity({
            book: savedBook,
            chapterIndex: chapterIndexToGen,
            chapterTitle: parsed.title,
            chapterText: finalBodyText,
            apiConfig: writerCfg,
            model: activeModelName,
          });
          const nextSettings = applyLiveContinuityAnalysisToSettings(
            savedBook,
            chapterIndexToGen,
            analysis
          );
          savedBook = {
            ...savedBook,
            settings: nextSettings,
            lastModifiedAt: Date.now(),
          };
          await onSaveBook(savedBook);

          const openAlertsCount = analysis.alerts.length;
          if (openAlertsCount > 0) {
            setGenMeta(`${metaText} · 实时监测检出 ${openAlertsCount} 条隐患（见正文下方监测台）`);
            triggerQuickToast(`第 ${chapterIndexToGen} 章写后监测发现 ${openAlertsCount} 条逻辑/设定隐患，建议立即下方查看修复`);
          } else {
            setGenMeta(`${metaText} · 实时监测全链路自洽`);
          }
        } catch {
          // Non-blocking: chapter text is already safely persisted
        } finally {
          setIsCheckingContinuity(false);
        }
      }
    } catch (err: any) {
      const errMsg = err.message || '网络连接或模型响应异常';
      if (activeChapter) {
        setChapterText(activeChapter.text || '');
        setChapterTitle(activeChapter.title || '');
      }
      setGenMeta(`生成中断：${errMsg}`);
      setLastFailedRequest({ plotHint: plotHint || nextPlotInput, isRewrite });

      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: isRewrite ? '重写章节未完成' : '扩写章节未完成',
        message: `请求异常：${errMsg}。\n您刚才编写的剧情走向与卡片选择已完整保留，可直接点击「一键重试生成该章节」。`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Multi-Chapter Continuous Streaming Generator with Stipulated Word Count per Chapter (Requirement 4)
  const handleBatchGenerateChapters = async () => {
    if (!currentBook || isGenerating) return;
    const totalSteps = Math.max(1, Math.min(30, Number(batchChapterCount) || 3));
    const words = Math.max(500, Number(stipulatedWordsPerChapter || currentBook.settings?.chapterWords || 3500));
    const minWords = Math.round(words * 0.9);
    const maxWords = Math.round(words * 1.15);

    setIsGenerating(true);
    stopBatchAfterCurrentRef.current = false;
    setStopBatchRequested(false);
    setConfirmRewrite(false);

    let workingBook: Book = {
      ...currentBook,
      chapters: [...(currentBook.chapters || [])],
      settings: {
        ...currentBook.settings,
        chapterWords: words,
      },
    };

    const initialUserPlotNote = nextPlotInput.trim();
    const selectedCards = ideaCards.filter((c) => selectedIdeaCardIds.includes(c.id));
    let completedCount = 0;

    try {
      for (let step = 1; step <= totalSteps; step++) {
        const chapNum = (workingBook.chapters?.length || 0) + 1;
        setBatchProgress({
          currentStep: step,
          totalSteps,
          currentChapNum: chapNum,
        });
        setChapterTitle(`第 ${chapNum} 章 · 批量连写中 (${step}/${totalSteps})...`);
        setChapterText('');
        setGenMeta(`批量连写进度：正在流式生成第 ${chapNum} 章（本批第 ${step}/${totalSteps} 章 · 规定每章 ${words} 字）...`);

        const memory = buildMemoryContextForBook(workingBook);
        const plannedOutline = (workingBook.settings?.chapterOutlines || []).find(
          (c) => c.chapterIndex === chapNum
        );
        const nextPlannedOutline = (workingBook.settings?.chapterOutlines || []).find(
          (c) => c.chapterIndex === chapNum + 1
        );

        const directiveBlocks: string[] = [];
        if (plannedOutline) {
          directiveBlocks.push(
            `【本章既定章节细纲 · 第${plannedOutline.chapterIndex}章《${plannedOutline.title}》】\n${plannedOutline.summary}${
              plannedOutline.hookNote ? `\n本章结尾断章钩子：${plannedOutline.hookNote}` : ''
            }`
          );
        } else {
          directiveBlocks.push(
            `【连载递进要求】当前为连续批量生成的第 ${step}/${totalSteps} 章（全书第 ${chapNum} 章），请严格承接上一章末尾悬念并结合主线大纲与分卷目标稳步推进实质剧情，切勿快进跳章或原地踏步！`
          );
        }

        if (nextPlannedOutline) {
          directiveBlocks.push(
            `【下一章（第${chapNum + 1}章）预告边界（仅供收尾铺垫，严禁在本章提前透支写完！）】：${nextPlannedOutline.summary}`
          );
        }

        if (initialUserPlotNote) {
          directiveBlocks.push(
            step === 1
              ? `【作者对本轮连写的总体导演指令（自本章起贯彻）】：\n${initialUserPlotNote}`
              : `【作者本轮连写总体基调参考】：\n${initialUserPlotNote}`
          );
        }

        if (step === 1 && selectedCards.length > 0) {
          directiveBlocks.push(
            `【首章需自然融入的灵感卡片】：\n${selectedCards
              .map((c) => `- [${c.category || '灵感'}] ${c.content}`)
              .join('\n')}`
          );
        }

        const combinedDirective = directiveBlocks.join('\n\n');
        const prevTail =
          workingBook.chapters.length > 0
            ? workingBook.chapters[workingBook.chapters.length - 1]?.text?.slice(-650) || ''
            : '';

        const audit = buildUnifiedSystemPrompt({
          scope: 'chapter',
          roleHeader:
            '你是一名顶级资深职业连载小说家，正在执行多章节连续执笔任务。每一章都必须严丝合缝承接上一章结尾现场，严格执行章节细纲边界与规定字数。',
          book: workingBook,
          globalSkills,
          xpPreferences,
          contextCorpus: `${workingBook.title}\n${combinedDirective}\n${prevTail}`,
          climaxMode: climaxMultiplierEnabled,
          targetChapterIndex: chapNum,
        });

        let userPrompt = `请创作《${workingBook.title}》第 ${chapNum} 章正文（当前为连续生成批次的第 ${step}/${totalSteps} 章）。
【硬性每章字数规定】：本章正文必须写足约 **${words} 字**（建议区间 ${minWords} ~ ${maxWords} 字），充实展开场景细节、人物动作与对话博弈，严禁因为批量连写而缩水敷衍！`;

        if (memory) {
          userPrompt += `\n\n${memory}\n`;
        }
        userPrompt += `\n# 本章推进蓝图与边界控制：\n${combinedDirective}\n`;
        userPrompt += `\n输出格式规范（正文中严禁出现 "---"）：
### 第${chapNum}章：${plannedOutline?.title ? plannedOutline.title : '[拟定富有画面感与张力的章节标题]'}
[此处开始第${chapNum}章完整正文，严格写足约 ${words} 字]
---
#### 后续发展建议
- [下一章走向建议1，35~80字]
- [下一章走向建议2，35~80字]
- [下一章走向建议3，35~80字]
- [下一章走向建议4，35~80字]`;

        let accumulatedRaw = '';
        const chapStart = Date.now();

        const result = await streamChatCompletion({
          provider: writerCfg?.provider,
          baseUrl: writerCfg?.baseUrl,
          apiKey: writerCfg?.apiKey,
          model: activeModelName,
          messages: [
            { role: 'system', content: audit.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: Number(workingBook.settings?.temperature || 0.85),
          onChunk: (chunk) => {
            accumulatedRaw += chunk;
            const parsed = parseChapterAndSuggestions(accumulatedRaw, `第 ${chapNum} 章`);
            if (parsed.title) setChapterTitle(parsed.title);
            setChapterText(parsed.bodyText);
          },
        });

        const chapLatency = Date.now() - chapStart;
        const finalRaw = result.content || accumulatedRaw;
        const parsed = parseChapterAndSuggestions(finalRaw, `第 ${chapNum} 章`);

        if (!parsed.bodyText.trim()) {
          throw new Error(`第 ${chapNum} 章模型返回空文本（已完成并自动保存前 ${completedCount} 章）`);
        }

        const metaText = `批量连写(${step}/${totalSteps}) · ${activeModelName} · ${(chapLatency / 1000).toFixed(1)}s · ${parsed.bodyText.length}/${words}字`;
        const newChap: Chapter = {
          id: generateUUID(),
          index: chapNum,
          title: parsed.title,
          text: parsed.bodyText,
          meta: metaText,
          userNextPlotInput: '',
          allSuggestions: [{ suggestions: parsed.suggestions, timestamp: Date.now() }],
        };

        const updatedOutlines = (workingBook.settings?.chapterOutlines || []).map((co) =>
          co.chapterIndex === chapNum ? { ...co, status: 'drafted' as const } : co
        );

        workingBook = {
          ...workingBook,
          chapters: [...workingBook.chapters, newChap],
          settings: {
            ...workingBook.settings,
            chapterWords: words,
            chapterOutlines: updatedOutlines,
          },
          lastModifiedAt: Date.now(),
        };

        await onSaveBook(workingBook);
        completedCount += 1;
        setCurrentChapterIndex(workingBook.chapters.length - 1);
        setChapterTitle(newChap.title);
        setChapterText(newChap.text);
        setGenMeta(metaText);

        // Update Live Continuity Firewall after each chapter in batch so step+1 inherits accurate character/time/prop states!
        if (ensureLiveContinuityState(workingBook).enabled) {
          try {
            setIsCheckingContinuity(true);
            const analysis = await analyzeChapterWriteTimeContinuity({
              book: workingBook,
              chapterIndex: chapNum,
              chapterTitle: newChap.title,
              chapterText: newChap.text,
              apiConfig: writerCfg,
              model: activeModelName,
            });
            const nextSettings = applyLiveContinuityAnalysisToSettings(
              workingBook,
              chapNum,
              analysis
            );
            workingBook = {
              ...workingBook,
              settings: nextSettings,
              lastModifiedAt: Date.now(),
            };
            await onSaveBook(workingBook);
          } catch {
            // Non-blocking in batch loop
          } finally {
            setIsCheckingContinuity(false);
          }
        }

        if (stopBatchAfterCurrentRef.current && step < totalSteps) {
          setGenMeta(`已按您的指令在第 ${chapNum} 章完稿后安全停止（本次共成功连写 ${completedCount} 章）`);
          break;
        }
      }

      if (completedCount > 0) {
        setNextPlotInput('');
        triggerQuickToast(`连续生成完成：共新增 ${completedCount} 章并自动保存！`);
      }
    } catch (err: any) {
      const errMsg = err.message || '网络或模型响应中断';
      setGenMeta(`批量连写中断（已安全保存 ${completedCount} 章）：${errMsg}`);
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: `批量连写在第 ${completedCount + 1} 步中断`,
        message: `已完成的前 ${completedCount} 章正文均已实时存入本地书库，绝无丢失！\n中断原因：${errMsg}`,
      });
    } finally {
      setIsGenerating(false);
      setBatchProgress(null);
      stopBatchAfterCurrentRef.current = false;
      setStopBatchRequested(false);
    }
  };

  // Auto-trigger Chapter 1 when opening a newly created 0-chapter book
  useEffect(() => {
    if (
      currentBook &&
      currentBook.chapters.length === 0 &&
      !isGenerating &&
      !autoStartedBookIdsRef.current.has(currentBook.id)
    ) {
      autoStartedBookIdsRef.current.add(currentBook.id);
      setChapterTitle('第一章：正在执笔生成中...');
      setChapterText('');
      handleGenerateNextChapter('', false);
    }
  }, [currentBook?.id, currentBook?.chapters?.length]);

  // Sync active chapter into editor state
  useEffect(() => {
    if (activeChapter) {
      const parsed = parseChapterAndSuggestions(
        activeChapter.text || '',
        activeChapter.title || `第 ${currentChapterIndex + 1} 章`
      );
      setChapterTitle(activeChapter.title || parsed.title);
      setChapterText(parsed.bodyText);
      setGenMeta(activeChapter.meta || '');
      setNextPlotInput(activeChapter.userNextPlotInput || '');
      isInitialChapterLoadRef.current = true;
      setAutoSaveStatus('idle');
    } else if (!isGenerating) {
      setChapterTitle('');
      setChapterText('');
      setGenMeta('');
      setNextPlotInput('');
    }
  }, [currentChapterIndex, currentBook?.id, Boolean(activeChapter)]);

  // Debounced Auto-save on manual edits
  useEffect(() => {
    if (!currentBook || !activeChapter || isGenerating) return;
    if (isInitialChapterLoadRef.current) {
      isInitialChapterLoadRef.current = false;
      return;
    }

    const titleChanged = chapterTitle !== (activeChapter.title || '');
    const textChanged = chapterText !== (activeChapter.text || '');
    if (!titleChanged && !textChanged) return;

    setAutoSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const updatedChapters = [...currentBook.chapters];
        const target = updatedChapters[currentChapterIndex];
        if (target) {
          target.title = chapterTitle.trim();
          target.text = chapterText.trim();
          target.meta = `自动保存于 ${new Date().toLocaleTimeString()}`;

          await onSaveBook({
            ...currentBook,
            chapters: updatedChapters,
            lastModifiedAt: Date.now(),
          });
          setLastAutoSavedTime(new Date().toLocaleTimeString());
          setAutoSaveStatus('saved');
        }
      } catch {
        setAutoSaveStatus('idle');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [chapterTitle, chapterText]);

  // Reroll 4 Plot Suggestions (wired through unified promptEngine scope: 'reroll'!)
  const handleRerollSuggestions = async () => {
    if (isGenerating || isRerolling || !currentBook || !activeChapter || !isLastChapter) return;

    const rerollCfg = configs.find((c) => c.id === uiSettings.rerollApiCfgId) || writerCfg;
    const rerollModel = uiSettings.rerollApiModel || activeModelName;

    setIsRerolling(true);
    setGenMeta('正在调用重掷模型与大纲结构 SKILL 推演 4 条全新走向...');

    try {
      const existingSuggestionsStr = (activeChapter.allSuggestions || [])
        .flatMap((g) => g.suggestions)
        .join('\n- ');

      const chapterTail = activeChapter.text.slice(-900);
      const audit = buildUnifiedSystemPrompt({
        scope: 'reroll',
        roleHeader: '你是一位深谙连载节奏与悬念钩子的小说创意总监，负责为下一章提供 4 个截然不同、极具张力的具体推进选项。',
        book: currentBook,
        globalSkills,
        xpPreferences,
        contextCorpus: `${currentBook.title}\n${chapterTail}`,
      });

      const userPrompt = `当前第 ${activeChapter.index} 章末尾现场：
${chapterTail}

已有建议（请彻底避开重复套路）：
- ${existingSuggestionsStr || '无'}

请给出 4 个全新的下一章具体发展走向（每条 35~80 字，必须有明确事件、空间转换或关系突破）：
#### 后续发展建议
- [建议1]
- [建议2]
- [建议3]
- [建议4]`;

      const res = await chatCompletion({
        provider: rerollCfg?.provider,
        baseUrl: rerollCfg?.baseUrl,
        apiKey: rerollCfg?.apiKey,
        model: rerollModel,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.92,
      });

      const parsed = parseChapterAndSuggestions(res.content, '建议');
      const updatedChapters = [...currentBook.chapters];
      const targetCh = updatedChapters[currentChapterIndex];
      if (targetCh) {
        if (!targetCh.allSuggestions) targetCh.allSuggestions = [];
        targetCh.allSuggestions.unshift({
          suggestions: parsed.suggestions,
          timestamp: Date.now(),
        });
      }

      await onSaveBook({ ...currentBook, chapters: updatedChapters });
      setGenMeta(`已重掷 4 条新走向 · 模型: ${rerollModel}`);
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: '重掷剧情建议失败',
        message: err.message || 'API 连接异常，请检查重掷线路设置。',
      });
    } finally {
      setIsRerolling(false);
    }
  };

  const handleClearSuggestions = async () => {
    if (!currentBook || !activeChapter || !isLastChapter) return;
    const updatedChapters = [...currentBook.chapters];
    const targetCh = updatedChapters[currentChapterIndex];
    if (targetCh) {
      targetCh.allSuggestions = [];
      delete targetCh.nextOptions;
    }
    await onSaveBook({ ...currentBook, chapters: updatedChapters });
    setConfirmClearSuggestions(false);
  };

  // Generate Stage Summary
  const handleGenerateSummary = async () => {
    if (!currentBook || currentBook.chapters.length === 0 || isSummarizing) return;
    setIsSummarizing(true);
    setGenMeta('正在归纳全书阶段伏笔与感情进展总结...');

    try {
      const chaptersText = currentBook.chapters
        .map((ch) => `第${ch.index}章《${ch.title}》\n${ch.text.slice(0, 3000)}`)
        .join('\n\n---\n\n');

      const res = await chatCompletion({
        provider: writerCfg?.provider,
        baseUrl: writerCfg?.baseUrl,
        apiKey: writerCfg?.apiKey,
        model: activeModelName,
        messages: [
          { role: 'system', content: '你是一位资深小说连载统筹主编，擅长精准提炼剧情主线、未回收伏笔与人物关系变化。' },
          {
            role: 'user',
            content: `请对《${currentBook.title}》截至第 ${currentBook.chapters.length} 章的内容生成结构化连载总结（含：1.主线事件进度；2.人物关系与情感拉扯节点；3.待回收伏笔与物品线索）：\n\n${chaptersText}`,
          },
        ],
        temperature: 0.65,
      });

      const newSummary: Summary = {
        id: generateUUID(),
        createdAt: Date.now(),
        startChapter: 1,
        endChapter: currentBook.chapters.length,
        chapterRange: `1 - ${currentBook.chapters.length}`,
        title: `第 1 - ${currentBook.chapters.length} 章阶段总结`,
        content: res.content,
      };

      const updatedSummaries = [...(currentBook.summaries || []), newSummary];
      await onSaveBook({ ...currentBook, summaries: updatedSummaries });
      setGenMeta('阶段总结已生成并加入长期记忆池');
      onOpenSummaryViewModal(newSummary);
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: '阶段总结生成失败',
        message: err.message || '网络异常，请稍后重试。',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  // Toggle Floating Quick Rail
  const handleToggleQuickRail = () => {
    setIsQuickRailOpen((prev) => !prev);
  };

  // Live Continuity Radar Handlers
  const handleToggleLiveContinuityEnabled = async () => {
    if (!currentBook || isGenerating) return;
    const prevState = ensureLiveContinuityState(currentBook);
    const nextEnabled = !prevState.enabled;
    await onSaveBook({
      ...currentBook,
      settings: {
        ...currentBook.settings,
        liveContinuity: {
          ...prevState,
          enabled: nextEnabled,
          updatedAt: Date.now(),
        },
      },
      lastModifiedAt: Date.now(),
    });
    triggerQuickToast(
      nextEnabled
        ? '已开启写中防穿帮实时监测（每章完稿自动更新人物/时间/道具状态并排雷）'
        : '已暂停自动实时监测（仍可随时手动点击监测）'
    );
  };

  const handleRunManualLiveMonitor = async () => {
    if (!currentBook || !activeChapter || isGenerating || isCheckingContinuity) return;
    setIsCheckingContinuity(true);
    try {
      const chapNum = activeChapter.index || currentChapterIndex + 1;
      const liveBody = chapterText.trim() || activeChapter.text;
      const liveTitle = chapterTitle.trim() || activeChapter.title;
      const analysis = await analyzeChapterWriteTimeContinuity({
        book: currentBook,
        chapterIndex: chapNum,
        chapterTitle: liveTitle,
        chapterText: liveBody,
        apiConfig: writerCfg,
        model: activeModelName,
      });
      const nextSettings = applyLiveContinuityAnalysisToSettings(
        currentBook,
        chapNum,
        analysis
      );
      await onSaveBook({
        ...currentBook,
        settings: nextSettings,
        lastModifiedAt: Date.now(),
      });
      if (analysis.alerts.length > 0) {
        triggerQuickToast(`第 ${chapNum} 章监测完成：发现 ${analysis.alerts.length} 条潜在穿帮点`);
      } else {
        triggerQuickToast(`第 ${chapNum} 章监测完成：人物、时间线与设定自洽无异常`);
      }
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: '实时状态监测异常',
        message: err.message || '网络或模型请求异常，请检查 API 配置后重试。',
      });
    } finally {
      setIsCheckingContinuity(false);
    }
  };

  const handleUpdateAlertStatus = async (
    alertId: string,
    status: 'resolved' | 'dismissed' | 'open'
  ) => {
    if (!currentBook) return;
    const state = ensureLiveContinuityState(currentBook);
    const nextAlerts = state.alerts.map((a) => (a.id === alertId ? { ...a, status } : a));
    await onSaveBook({
      ...currentBook,
      settings: {
        ...currentBook.settings,
        liveContinuity: {
          ...state,
          alerts: nextAlerts,
          updatedAt: Date.now(),
        },
      },
      lastModifiedAt: Date.now(),
    });
  };

  const handleFixAlertInChapter = async (alert: LiveContinuityAlert) => {
    if (!currentBook || isGenerating || fixingAlertId) return;
    const targetIdx = currentBook.chapters.findIndex((c) => c.index === alert.chapterIndex);
    const chapObj = targetIdx >= 0 ? currentBook.chapters[targetIdx] : activeChapter;
    if (!chapObj) return;

    const isCurrentViewing = targetIdx === currentChapterIndex;
    const sourceText = isCurrentViewing ? chapterText : chapObj.text;
    const sourceTitle = isCurrentViewing ? chapterTitle : chapObj.title;

    if (!sourceText.trim()) return;
    setFixingAlertId(alert.id);
    try {
      const fixedText = await reviseChapterFromLiveAlert({
        book: currentBook,
        chapterIndex: chapObj.index,
        chapterTitle: sourceTitle,
        chapterText: sourceText,
        alert,
        apiConfig: writerCfg,
        model: activeModelName,
      });

      if (!fixedText || fixedText.length < sourceText.length * 0.65) {
        throw new Error('模型返回修稿文本过短，已保护原章节未被覆盖。');
      }

      const updatedChapters = [...currentBook.chapters];
      const realIdx = targetIdx >= 0 ? targetIdx : currentChapterIndex;
      updatedChapters[realIdx] = {
        ...updatedChapters[realIdx],
        text: fixedText,
        meta: `AI局部防穿帮修复于 ${new Date().toLocaleTimeString()}`,
      };

      const state = ensureLiveContinuityState(currentBook);
      const nextAlerts = state.alerts.map((a) =>
        a.id === alert.id ? { ...a, status: 'resolved' as const } : a
      );

      await onSaveBook({
        ...currentBook,
        chapters: updatedChapters,
        settings: {
          ...currentBook.settings,
          liveContinuity: {
            ...state,
            alerts: nextAlerts,
            updatedAt: Date.now(),
          },
        },
        lastModifiedAt: Date.now(),
      });

      if (isCurrentViewing || targetIdx >= 0) {
        setCurrentChapterIndex(realIdx);
        setChapterText(fixedText);
      }
      triggerQuickToast(`已局部修复第 ${chapObj.index} 章逻辑问题并保存！`);
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: 'AI 局部修复未完成',
        message: err.message || '请求中断，原章节正文完好无损。',
      });
    } finally {
      setFixingAlertId(null);
    }
  };

  // Dialogue Co-Writing with Setting & Rationality Audit
  const handleSendDialogueMessage = async (userText: string) => {
    if (!currentBook || isDialogueSending || isGenerating) return;
    const prevHistory = currentBook.settings?.dialogueHistory || [];
    const userMsg: DialogueCoWriteMessage = {
      id: generateUUID(),
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };

    const withUserHistory = [...prevHistory, userMsg];
    let updatedBook: Book = {
      ...currentBook,
      settings: {
        ...currentBook.settings,
        dialogueHistory: withUserHistory,
      },
      lastModifiedAt: Date.now(),
    };
    await onSaveBook(updatedBook);
    setIsDialogueSending(true);

    try {
      const nextNum = (currentBook.chapters?.length || 0) + 1;
      const tail =
        currentBook.chapters.length > 0
          ? currentBook.chapters[currentBook.chapters.length - 1]?.text?.slice(-800) || ''
          : '';
      const messages = buildDialogueCoWriteMessages({
        book: updatedBook,
        history: prevHistory,
        userMessage: userText,
        activeChapterTail: tail,
        nextChapterNum: nextNum,
      });

      const res = await chatCompletion({
        provider: writerCfg?.provider,
        baseUrl: writerCfg?.baseUrl,
        apiKey: writerCfg?.apiKey,
        model: activeModelName,
        messages,
        temperature: 0.72,
      });

      const parsed = parseDialogueCoWriteReply(res.content || '');
      const aiMsg: DialogueCoWriteMessage = {
        id: generateUUID(),
        role: 'assistant',
        content: (res.content || '').trim() || '模型未返回内容，请重试。',
        rationalityPassed: parsed.rationalityPassed,
        flaggedRisks: parsed.flaggedRisks,
        directorDirective: parsed.directorDirective,
        timestamp: Date.now(),
      };

      await onSaveBook({
        ...updatedBook,
        settings: {
          ...updatedBook.settings,
          dialogueHistory: [...withUserHistory, aiMsg],
        },
        lastModifiedAt: Date.now(),
      });
    } catch (err: any) {
      setNoticeModal({
        isOpen: true,
        type: 'error',
        title: '对话共创审校请求失败',
        message: err.message || '网络或模型响应异常，请检查线路后重试。',
      });
    } finally {
      setIsDialogueSending(false);
    }
  };

  const handleClearDialogueHistory = async () => {
    if (!currentBook) return;
    await onSaveBook({
      ...currentBook,
      settings: {
        ...currentBook.settings,
        dialogueHistory: [],
      },
      lastModifiedAt: Date.now(),
    });
    triggerQuickToast('已清空本轮共创对话记忆');
  };

  const handleFillOutlineIntoDirector = (co: NovelChapterOutlineItem) => {
    const formatted = `【L4细纲 · 第${co.chapterIndex}章《${co.title}》】\n${co.summary}${
      co.hookNote ? `\n【章末悬念钩子】${co.hookNote}` : ''
    }`;
    handleSaveNextPlotInput(formatted);
    setCreationMode('outline');
    setMobilePaneTab('director');
    triggerQuickToast(`已将第 ${co.chapterIndex} 章 L4 细纲填入导演台`);
  };

  const scrollToLocatedMatch = (targetIdx: number) => {
    requestAnimationFrame(() => {
      const container = manuscriptScrollRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(`[data-locate-idx="${targetIdx}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const handleLocateKeywordInChapter = (keyword: string) => {
    const kw = keyword.trim();
    if (!kw) return;
    setLocatedKeyword(kw);
    setLocatedMatchIndex(0);
    setMobilePaneTab('manuscript');

    const firstPos = chapterText.indexOf(kw);
    if (firstPos < 0) {
      triggerQuickToast(`当前章正文中暂未直接出现「${kw}」字样`);
      return;
    }

    if (isEditMode && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(firstPos, firstPos + kw.length);
      return;
    }
    scrollToLocatedMatch(0);
  };

  const handleAppendReminderToDirector = (reminderText: string) => {
    const clean = reminderText.trim();
    if (!clean) return;
    if (nextPlotInput.includes(clean)) {
      setCreationMode('outline');
      setMobilePaneTab('director');
      triggerQuickToast('该防穿帮叮嘱已在导演台指令中');
      return;
    }
    const combined = nextPlotInput.trim()
      ? `${nextPlotInput.trim()}\n• [防穿帮叮嘱] ${clean}`
      : `• [防穿帮叮嘱] ${clean}`;
    handleSaveNextPlotInput(combined);
    setCreationMode('outline');
    setMobilePaneTab('director');
    triggerQuickToast('已写入右侧导演台防穿帮叮嘱');
  };

  if (!currentBook) {
    return (
      <div className="max-w-lg mx-auto my-12 studio-card p-8 sm:p-12 text-center space-y-4">
        <AlertCircle className="w-9 h-9 mx-auto text-[var(--text-muted)]" />
        <h2 className="text-lg font-bold text-[var(--text-primary)] font-editorial-serif">尚未打开连载作品</h2>
        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          请从「我的书库」选择一部作品继续执笔，或前往「作品设定」立项新书并挂载专属世界书与 SKILL。
        </p>
        <button
          type="button"
          onClick={onGoToSetup}
          className="btn-primary min-h-[44px] px-5 py-2.5 text-xs inline-flex items-center gap-2 cursor-pointer"
        >
          <span>前往创建新作品</span>
        </button>
      </div>
    );
  }

  const totalWordCount = (currentBook.chapters || []).reduce((acc, ch) => acc + (ch.text?.length || 0), 0);
  const targetChapterWords = Math.max(500, Number(stipulatedWordsPerChapter || currentBook.settings?.chapterWords || 3500));
  const nextChapterNum = (currentBook.chapters?.length || 0) + 1;
  const upcomingPlannedOutline = (currentBook.settings?.chapterOutlines || []).find(
    (c) => c.chapterIndex === nextChapterNum
  );
  const batchEndChapNum = nextChapterNum + Math.max(1, Number(batchChapterCount) || 3) - 1;
  const plannedCountInBatchRange = (currentBook.settings?.chapterOutlines || []).filter(
    (c) => c.chapterIndex >= nextChapterNum && c.chapterIndex <= batchEndChapNum
  ).length;
  const isBookXpEnabled =
    currentBook.settings?.xpSystemEnabled !== undefined
      ? Boolean(currentBook.settings.xpSystemEnabled)
      : Boolean((xpPreferences || '').trim());
  const progressPercent = Math.min(
    99,
    Math.max(4, Math.floor((chapterText.length / Math.max(500, targetChapterWords)) * 100))
  );
  const manuscriptFontClass =
    uiSettings.chapterFontFamily === 'sans' ? 'font-sans' : 'font-editorial-serif';

  const liveContinuityState = useMemo(
    () => (currentBook ? ensureLiveContinuityState(currentBook) : null),
    [currentBook]
  );

  // Locate Keyword Matches for Highlight Rendering
  const locatedHighlight = useMemo(() => {
    const kw = locatedKeyword.trim();
    if (!kw || !chapterText) {
      return { totalMatches: 0, nodes: null as React.ReactNode };
    }
    const parts = chapterText.split(kw);
    const total = parts.length - 1;
    if (total <= 0) {
      return { totalMatches: 0, nodes: null as React.ReactNode };
    }
    const activeIdx = Math.min(locatedMatchIndex, total - 1);
    const nodes: React.ReactNode[] = [];
    parts.forEach((seg, idx) => {
      if (seg) nodes.push(seg);
      if (idx < total) {
        const isActive = idx === activeIdx;
        nodes.push(
          <mark
            key={`loc-${idx}`}
            data-locate-idx={idx}
            className={`px-1 py-0.5 rounded font-semibold transition-colors ${
              isActive
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] ring-2 ring-[var(--accent)]/40'
                : 'bg-amber-300/65 dark:bg-amber-500/35 text-[var(--text-primary)]'
            }`}
          >
            {kw}
          </mark>
        );
      }
    });
    return { totalMatches: total, nodes };
  }, [chapterText, locatedKeyword, locatedMatchIndex]);

  return (
    <div className="w-full pb-2 lg:pb-0">
      {/* Zone 0: Floating Quick-Switch Overlay Button & Drawer (Zero footprint on main 3 columns) */}
      <WriterQuickRail
        isOpen={isQuickRailOpen}
        onToggleOpen={handleToggleQuickRail}
        onClose={() => setIsQuickRailOpen(false)}
        currentBookId={currentBook.id}
        books={books}
        dramaProjects={dramaProjects}
        activeTrack="novel"
        onSelectBook={onSelectBook}
        onSelectDramaProject={onSelectDramaProject}
        onSwitchTrack={onSwitchTrack}
      />

      {/* Main 3-Column Editorial Workstation Area */}
      <div className="w-full space-y-2.5 lg:space-y-0">
        {/* Mobile Pane Switcher (< lg) */}
        <div className="lg:hidden grid grid-cols-3 gap-1 p-1 rounded-xl studio-muted text-[11px]">
          {[
            { id: 'chapters_settings', label: '目录 / 本章联动' },
            { id: 'manuscript', label: '正文 / 实时监测' },
            { id: 'director', label: '创作 / 对话台' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobilePaneTab(tab.id as any)}
              className={`min-h-[34px] rounded-lg font-semibold whitespace-nowrap cursor-pointer ${
                mobilePaneTab === tab.id
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Empty-Response / Network Failure 1-Click Retry Banner */}
        {lastFailedRequest && !isGenerating && (
          <div className="p-3.5 lg:mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                上次生成未返回有效正文（已自动拦截保护，未覆盖章节）。您输入的剧情走向与灵感卡片均已保留，可直接重试：
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleGenerateNextChapter(lastFailedRequest.plotHint, lastFailedRequest.isRewrite)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>一键重试生成该章节</span>
            </button>
          </div>
        )}

        {/* 3-Column Independent-Scroll PC Workstation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)_332px] xl:grid-cols-[300px_minmax(0,1fr)_372px] gap-3 xl:gap-3.5 items-stretch lg:h-[calc(100dvh-5.35rem)] lg:min-h-[480px]">
          {/* LEFT PANE: Active-Chapter Highlighting + Directory + Settings Inspector (Independent Scroll + Fixed Header/Footer) */}
          <div
            className={`lg:h-full lg:min-h-0 ${
              mobilePaneTab === 'chapters_settings' ? 'block' : 'hidden lg:block'
            }`}
          >
            <WriterLeftInspector
              book={currentBook}
              currentChapterIndex={currentChapterIndex}
              activeChapterText={chapterText}
              onSelectChapter={(idx) => {
                setCurrentChapterIndex(idx);
                setMobilePaneTab('manuscript');
              }}
              onFillOutlineIntoDirector={handleFillOutlineIntoDirector}
              onLocateKeywordInChapter={handleLocateKeywordInChapter}
              onAppendReminderToDirector={handleAppendReminderToDirector}
              onGoToSetup={onGoToSetup}
              isGenerating={isGenerating}
            />
          </div>

          {/* CENTER PANE: Fixed Top Toolbar + Scroll-Only Manuscript Body + Pinned Bottom Live Continuity Dock */}
          <div
            className={`lg:h-full lg:min-h-0 flex flex-col gap-2.5 overflow-hidden ${
              mobilePaneTab === 'manuscript' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* Manuscript Card (Fixed Header, Independently Scrollable Body) */}
            <article className="studio-card flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* COMPACT PINNED TOP HEADER (Reclaims vertical height so 75%+ goes to Manuscript prose) */}
              <div className="shrink-0 px-3.5 py-2 sm:px-4 sm:py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5 z-10">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  {/* Chapter Nav */}
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      disabled={currentChapterIndex <= 0 || isGenerating}
                      onClick={() => setCurrentChapterIndex((prev) => Math.max(0, prev - 1))}
                      className="min-h-[32px] min-w-[32px] px-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] disabled:opacity-35 flex items-center justify-center text-xs cursor-pointer"
                      title="上一章"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>

                    <select
                      disabled={isGenerating}
                      value={currentChapterIndex}
                      onChange={(e) => setCurrentChapterIndex(Number(e.target.value))}
                      className="studio-input min-h-[32px] max-w-[140px] sm:max-w-[175px] px-2 py-0.5 text-xs font-medium truncate"
                    >
                      {currentBook.chapters.length === 0 ? (
                        <option value={0}>第 1 章 · 初稿生成中</option>
                      ) : (
                        currentBook.chapters.map((ch, idx) => (
                          <option key={ch.id} value={idx}>
                            第 {ch.index} 章 · {ch.title}
                          </option>
                        ))
                      )}
                    </select>

                    <button
                      type="button"
                      disabled={currentChapterIndex >= currentBook.chapters.length - 1 || isGenerating}
                      onClick={() =>
                        setCurrentChapterIndex((prev) => Math.min(currentBook.chapters.length - 1, prev + 1))
                      }
                      className="min-h-[32px] min-w-[32px] px-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] disabled:opacity-35 flex items-center justify-center text-xs cursor-pointer"
                      title="下一章"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Editorial Toolbar */}
                  <div className="flex flex-wrap items-center gap-1">
                    <MotionButton
                      type="button"
                      disabled={isGenerating || !chapterText.trim()}
                      onClick={() => setIsZhuqueModalOpen(true)}
                      className={`min-h-[32px] px-2 py-0.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer tabular-nums ${
                        !chapterText.trim()
                          ? 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                          : liveZhuqueReport.verdict === 'pass'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : liveZhuqueReport.verdict === 'borderline'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-rose-500/45 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      }`}
                      title="打开腾讯朱雀AIGC检测、一键去AI味重铸、四维对抗审读与章节记忆回写"
                    >
                      <ShieldCheck className="w-3 h-3 shrink-0" />
                      <span>
                        朱雀{chapterText.trim() ? `·${liveZhuqueReport.aiRiskScore}%` : ''}
                      </span>
                    </MotionButton>

                    {onOpenManuscriptAudit && (
                      <MotionButton
                        type="button"
                        disabled={isGenerating || currentBook.chapters.length === 0}
                        onClick={() =>
                          onOpenManuscriptAudit(
                            currentBook,
                            activeChapter?.index || currentChapterIndex + 1
                          )
                        }
                        className={`min-h-[32px] px-2 py-0.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer tabular-nums ${
                          (currentBook.manuscriptAudit?.criticalCount || 0) > 0
                            ? 'border-rose-500/45 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : 'border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)]'
                        }`}
                        title="一键审查全书与简介一致度、时间线闭合、伏笔回收、身份铺垫与跨章协同改稿"
                      >
                        <FileCheck2 className="w-3 h-3 shrink-0" />
                        <span>
                          终审
                          {currentBook.manuscriptAudit
                            ? `·${
                                (currentBook.manuscriptAudit.criticalCount || 0) +
                                (currentBook.manuscriptAudit.majorCount || 0)
                              }`
                            : ''}
                        </span>
                      </MotionButton>
                    )}

                    <MotionButton
                      type="button"
                      disabled={isGenerating || !chapterText.trim()}
                      onClick={handleOpenPolishModal}
                      className="min-h-[32px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
                      title="选中文本或针对局部段落进行去AI味精修与张力慢放"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>精修</span>
                    </MotionButton>

                    {/* Manual Typography Controls Popover (行间距 + 字间距) */}
                    <div ref={typographyPopoverRef} className="relative">
                      <MotionButton
                        type="button"
                        onClick={() => setIsTypographyOpen((prev) => !prev)}
                        className={`min-h-[32px] px-2 py-0.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                          isTypographyOpen
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                        }`}
                        title="手动调整正文行间距与字间距"
                      >
                        <Type className="w-3 h-3" />
                        <span>排版</span>
                      </MotionButton>

                      {isTypographyOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 p-4 rounded-2xl studio-card shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] z-40 space-y-3.5 text-xs">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                            <span className="font-bold text-[var(--text-primary)]">正文排版间距调节</span>
                            <button
                              type="button"
                              onClick={() => {
                                setLineHeight(1.92);
                                setLetterSpacing(0.025);
                                triggerQuickToast('已恢复默认阅读行距与字距');
                              }}
                              className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                            >
                              恢复默认
                            </button>
                          </div>

                          {/* Line Height Slider & Presets */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-[var(--text-secondary)]">行间距</span>
                              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                                {lineHeight.toFixed(2)}x
                              </span>
                            </div>
                            <input
                              type="range"
                              min={1.4}
                              max={2.6}
                              step={0.05}
                              value={lineHeight}
                              onChange={(e) => setLineHeight(Number(e.target.value))}
                              className="w-full accent-[var(--accent)] cursor-pointer"
                            />
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { label: '紧凑', val: 1.6 },
                                { label: '适中', val: 1.92 },
                                { label: '舒展', val: 2.2 },
                                { label: '宽松', val: 2.45 },
                              ].map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => setLineHeight(p.val)}
                                  className={`py-1 rounded-lg border text-[10.5px] cursor-pointer ${
                                    Math.abs(lineHeight - p.val) < 0.04
                                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-bold'
                                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Letter Spacing Slider & Presets */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-[var(--text-secondary)]">字间距</span>
                              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                                {letterSpacing.toFixed(3)}em
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={0.14}
                              step={0.005}
                              value={letterSpacing}
                              onChange={(e) => setLetterSpacing(Number(e.target.value))}
                              className="w-full accent-[var(--accent)] cursor-pointer"
                            />
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { label: '紧致', val: 0 },
                                { label: '标准', val: 0.025 },
                                { label: '疏朗', val: 0.06 },
                                { label: '宽距', val: 0.1 },
                              ].map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => setLetterSpacing(p.val)}
                                  className={`py-1 rounded-lg border text-[10.5px] cursor-pointer ${
                                    Math.abs(letterSpacing - p.val) < 0.006
                                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-bold'
                                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <MotionButton
                      type="button"
                      onClick={() => setIsFocusMode(true)}
                      className="min-h-[32px] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpenText className="w-3 h-3" />
                      <span>沉浸</span>
                    </MotionButton>

                    <MotionButton
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setIsEditMode(!isEditMode)}
                      className={`min-h-[32px] px-2 py-0.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer ${
                        isEditMode
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                      }`}
                    >
                      {isEditMode ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                      <span>{isEditMode ? '预览' : '编辑'}</span>
                    </MotionButton>

                    {isEditMode && (
                      <MotionButton
                        type="button"
                        disabled={isGenerating}
                        onClick={handleSaveChapterEdits}
                        className="btn-primary min-h-[32px] px-2.5 py-0.5 text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {saveSuccessToast ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                        <span>{saveSuccessToast ? '已保存' : '保存'}</span>
                      </MotionButton>
                    )}
                  </div>
                </div>

                {/* Compact Single-Band Title & Word Telemetry Row */}
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-3">
                  <input
                    type="text"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    disabled={!isEditMode || isGenerating}
                    placeholder="章节标题..."
                    className={`flex-1 min-w-0 text-base sm:text-lg font-bold bg-transparent text-[var(--text-primary)] focus:outline-none ${manuscriptFontClass} ${
                      isEditMode ? 'border-b border-[var(--accent)] pb-0.5' : ''
                    }`}
                  />

                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                    <span>
                      {chapterText.length.toLocaleString()} 字 · 行{lineHeight.toFixed(1)}/字{letterSpacing.toFixed(2)}
                    </span>
                    <span className="hidden xl:inline opacity-75">
                      {autoSaveStatus === 'saving'
                        ? '保存中...'
                        : autoSaveStatus === 'saved' && lastAutoSavedTime
                        ? `已存 ${lastAutoSavedTime}`
                        : genMeta || activeModelName}
                    </span>
                  </div>
                </div>

                {/* Pinned Streaming Progress Header (Visible while scrolling manuscript) */}
                {isGenerating && (
                  <div className="p-2.5 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-soft)]/35 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                        <span>
                          {batchProgress
                            ? `连续生成第 ${batchProgress.currentStep}/${batchProgress.totalSteps} 章（第 ${batchProgress.currentChapNum} 章）`
                            : 'AI 流式扩写中 · 编辑与输入已锁定'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[var(--text-secondary)] tabular-nums text-[11px]">
                          {chapterText.length} / {targetChapterWords} 字 ({progressPercent}%)
                        </span>
                        {batchProgress && batchProgress.currentStep < batchProgress.totalSteps && (
                          <button
                            type="button"
                            disabled={stopBatchRequested}
                            onClick={() => {
                              stopBatchAfterCurrentRef.current = true;
                              setStopBatchRequested(true);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                          >
                            写完本章停止
                          </button>
                        )}
                      </div>
                    </div>

                    <progress
                      value={progressPercent}
                      max={100}
                      className="w-full h-1.5 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-[var(--bg-muted)] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-[var(--accent)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all [&::-moz-progress-bar]:bg-[var(--accent)]"
                    />
                  </div>
                )}

                {/* Pinned Locate Match Navigator (Active when jumping from Left Inspector) */}
                {locatedKeyword && (
                  <div className="px-3 py-1.5 rounded-xl bg-[var(--accent-soft)]/50 border border-[var(--accent)]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
                      <Search className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span>
                        正文定位：「<strong>{locatedKeyword}</strong>」·{' '}
                        {locatedHighlight.totalMatches > 0 ? (
                          <span className="tabular-nums">
                            第 {Math.min(locatedMatchIndex + 1, locatedHighlight.totalMatches)} /{' '}
                            {locatedHighlight.totalMatches} 处
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">本章正文暂未出现</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {locatedHighlight.totalMatches > 1 && !isEditMode && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const nextIdx =
                                (locatedMatchIndex - 1 + locatedHighlight.totalMatches) %
                                locatedHighlight.totalMatches;
                              setLocatedMatchIndex(nextIdx);
                              scrollToLocatedMatch(nextIdx);
                            }}
                            className="px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] hover:bg-[var(--bg-muted)] cursor-pointer"
                          >
                            上一处
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextIdx = (locatedMatchIndex + 1) % locatedHighlight.totalMatches;
                              setLocatedMatchIndex(nextIdx);
                              scrollToLocatedMatch(nextIdx);
                            }}
                            className="px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] hover:bg-[var(--bg-muted)] cursor-pointer"
                          >
                            下一处
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setLocatedKeyword('');
                          setLocatedMatchIndex(0);
                        }}
                        className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="清除正文定位高亮"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ONLY SCROLLABLE MIDDLE AREA (Manuscript Body) */}
              <div
                ref={manuscriptScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-7 sm:py-5"
              >
                <div
                  className={`relative h-full transition-opacity ${
                    isGenerating
                      ? 'select-none pointer-events-none bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_75%)] rounded-xl p-2 sm:p-4'
                      : ''
                  }`}
                >
                  {isEditMode && !isGenerating ? (
                    <div className="h-full flex flex-col gap-1.5">
                      <p className="text-[11px] text-[var(--text-muted)] shrink-0">
                        提示：选中段落点击顶部「精修」可局部润色，改完点击底部「监测」校验逻辑连贯性。
                      </p>
                      <textarea
                        ref={textareaRef}
                        value={chapterText}
                        onChange={(e) => setChapterText(e.target.value)}
                        placeholder="在此直接校对或撰写章节正文..."
                        className={`studio-input w-full flex-1 min-h-[260px] p-4 text-[var(--text-primary)] chapter-canvas resize-none ${manuscriptFontClass}`}
                      />
                    </div>
                  ) : (
                    <div
                      onContextMenu={(e) => {
                        const selected = window.getSelection()?.toString()?.trim();
                        openContextMenu(e, selected ? '选中文本快捷操作' : chapterTitle || '章节原稿画布', [
                          ...(selected
                            ? [
                                {
                                  id: 'polish-sel',
                                  label: 'AI 精修当前选中段落',
                                  icon: <Wand2 className="w-3.5 h-3.5" />,
                                  onSelect: () => {
                                    setPolishSourceText(selected);
                                    setPolishRange(null);
                                    setPolishResultText('');
                                    setIsPolishModalOpen(true);
                                  },
                                },
                                {
                                  id: 'copy-sel',
                                  label: '复制选中文本',
                                  icon: <Copy className="w-3.5 h-3.5" />,
                                  onSelect: () => {
                                    navigator.clipboard?.writeText(selected);
                                    triggerQuickToast('已复制选中句段');
                                  },
                                },
                              ]
                            : []),
                          {
                            id: 'copy-full-ch',
                            label: '复制本章完整正文',
                            icon: <Copy className="w-3.5 h-3.5" />,
                            disabled: !chapterText.trim(),
                            onSelect: () => {
                              navigator.clipboard?.writeText(`### ${chapterTitle}\n\n${chapterText}`);
                              triggerQuickToast('已复制本章完整正文');
                            },
                          },
                          {
                            id: 'focus-read',
                            label: '开启全屏沉浸阅读',
                            icon: <BookOpenText className="w-3.5 h-3.5" />,
                            onSelect: () => setIsFocusMode(true),
                          },
                          {
                            id: 'edit-ch',
                            label: '进入手工校对模式',
                            icon: <Edit3 className="w-3.5 h-3.5" />,
                            disabled: isGenerating,
                            onSelect: () => setIsEditMode(true),
                          },
                        ]);
                      }}
                      className={`whitespace-pre-wrap text-[var(--text-primary)] chapter-canvas ${manuscriptFontClass}`}
                    >
                      {locatedHighlight.nodes ||
                        chapterText ||
                        (isGenerating
                          ? '正在等待模型首字流式返回...'
                          : '本章暂无正文，点击右侧「继续扩写」或通过对话审校共创开始写作。')}
                      <div ref={streamEndRef} />
                    </div>
                  )}
                </div>
              </div>
            </article>

            {/* PINNED BOTTOM DOCK: Live Continuity Monitor (Fixed at bottom, does NOT scroll with manuscript) */}
            <div className="shrink-0">
              <LiveContinuityMonitorDock
                book={currentBook}
                currentChapterIndex={currentChapterIndex}
                isChecking={isCheckingContinuity}
                fixingAlertId={fixingAlertId}
                isGenerating={isGenerating}
                onToggleEnabled={handleToggleLiveContinuityEnabled}
                onRunChapterCheck={handleRunManualLiveMonitor}
                onFixAlertInChapter={handleFixAlertInChapter}
                onUpdateAlertStatus={handleUpdateAlertStatus}
                onSelectChapterByNumber={(chapNum) => {
                  const idx = currentBook.chapters.findIndex((c) => c.index === chapNum);
                  if (idx >= 0) setCurrentChapterIndex(idx);
                }}
              />
            </div>
          </div>

          {/* RIGHT PANE: Fixed Top Guardrails & Mode Bar + Independent Scroll Console/Suggestions + Pinned Bottom CTA/Composer */}
          <aside
            className={`lg:h-full lg:min-h-0 studio-card flex flex-col overflow-hidden ${
              mobilePaneTab === 'director' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* PINNED TOP HEADER (Firewall Status + 4 Guardrail Switches + Dual-Mode Tabs) */}
            <div className="shrink-0 p-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">引擎与防穿帮控制台</h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums truncate">
                    {liveAuditReport?.activeSkills.length || 0} SKILL · {liveAuditReport?.activeLore.length || 0} 世界书 ·{' '}
                    {(currentBook.settings?.chapterOutlines || []).length} 章细纲
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAuditModalOpen(true)}
                    className="min-h-[32px] px-2.5 py-1 rounded-xl bg-[var(--bg-muted)] hover:opacity-85 text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>透视</span>
                  </button>
                  <button
                    type="button"
                    onClick={onGoToSetup}
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] cursor-pointer"
                    title="修改11大系统设定、章节细纲与SKILL开关"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleToggleBookXpSystem}
                  className={`min-h-[32px] px-2 py-1 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                    isBookXpEnabled
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]/45 text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    {isBookXpEnabled ? (
                      <ShieldCheck className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    ) : (
                      <ShieldOff className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span className="truncate">XP 基底</span>
                  </span>
                  <span className="font-semibold shrink-0">{isBookXpEnabled ? '开' : '关'}</span>
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setClimaxMultiplierEnabled(!climaxMultiplierEnabled)}
                  className={`min-h-[32px] px-2 py-1 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                    climaxMultiplierEnabled
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <Flame className="w-3 h-3 shrink-0" />
                    <span className="truncate">慢放 2x</span>
                  </span>
                  <span className="font-semibold shrink-0">{climaxMultiplierEnabled ? '开' : '关'}</span>
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={async () => {
                    if (!currentBook) return;
                    const nextFlag = !currentBook.settings?.autoZhuqueDeslop;
                    await onSaveBook({
                      ...currentBook,
                      settings: {
                        ...currentBook.settings,
                        autoZhuqueDeslop: nextFlag,
                      },
                      lastModifiedAt: Date.now(),
                    });
                    triggerQuickToast(
                      nextFlag
                        ? '已开启写后自动过朱雀去味校准（AI痕≥22%时自动重铸）'
                        : '已关闭写后自动去味'
                    );
                  }}
                  className={`min-h-[32px] px-2 py-1 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                    currentBook.settings?.autoZhuqueDeslop
                      ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span className="truncate">自动去味</span>
                  </span>
                  <span className="font-semibold shrink-0">
                    {currentBook.settings?.autoZhuqueDeslop ? '开' : '关'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleToggleLiveContinuityEnabled}
                  className={`min-h-[32px] px-2 py-1 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                    liveContinuityState?.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  <span className="flex items-center gap-1 truncate">
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    <span className="truncate">防穿帮锁</span>
                  </span>
                  <span className="font-semibold shrink-0">
                    {liveContinuityState?.enabled ? '开' : '关'}
                  </span>
                </button>
              </div>

              {isLastChapter && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl studio-muted text-xs">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setCreationMode('outline')}
                    className={`min-h-[34px] rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      creationMode === 'outline'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <ListOrdered className="w-3.5 h-3.5 shrink-0" />
                    <span>按纲章创作</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setCreationMode('dialogue')}
                    className={`min-h-[34px] rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      creationMode === 'dialogue'
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>对话审校创作</span>
                  </button>
                </div>
              )}
            </div>

            {/* INDEPENDENTLY SCROLLABLE MIDDLE REGION (Director Controls, Chat History, 4 Follow-Up Options, Rewrite) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
              {isLastChapter ? (
                <>
                  {creationMode === 'dialogue' ? (
                    <DialogueCoWritePanel
                      messages={currentBook.settings?.dialogueHistory || []}
                      nextChapterNum={nextChapterNum}
                      isSending={isDialogueSending}
                      isGenerating={isGenerating}
                      onSendMessage={handleSendDialogueMessage}
                      onClearHistory={handleClearDialogueHistory}
                      onFillDirective={(directive) => {
                        handleSaveNextPlotInput(directive);
                        setCreationMode('outline');
                        triggerQuickToast('已填入导演台指令框，可微调字数与细纲后点击扩写！');
                      }}
                      onGenerateWithDirective={(directive) => {
                        handleSaveNextPlotInput(directive);
                        handleGenerateNextChapter(directive, false);
                      }}
                      hideComposer={true}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-[var(--text-primary)]">
                          导演指令与纲章 (第 {nextChapterNum} 章起)
                        </h3>
                        <MotionButton
                          type="button"
                          disabled={isGenerating || isGeneratingBeats}
                          onClick={handleGenerateChapterBeats}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--bg-muted)] hover:opacity-85 text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer"
                          title="AI 自动规划起承转合4幕场景节拍，彻底杜绝原地水字数"
                        >
                          {isGeneratingBeats ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Clapperboard className="w-3.5 h-3.5" />
                          )}
                          <span>生成4幕细纲</span>
                        </MotionButton>
                      </div>

                      {/* Single vs Multi-Chapter Continuous Mode Switcher */}
                      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl studio-muted text-xs">
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => setDirectorMode('single')}
                          className={`min-h-[30px] rounded-lg font-semibold transition-colors cursor-pointer ${
                            directorMode === 'single'
                              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          单章精写模式
                        </button>
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => setDirectorMode('batch')}
                          className={`min-h-[30px] rounded-lg font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                            directorMode === 'batch'
                              ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-2xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>多章连续生成</span>
                        </button>
                      </div>

                      {/* Stipulated Word Count Per Chapter Control */}
                      <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="font-semibold text-[var(--text-primary)]">
                            规定每章目标字数
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={500}
                              max={15000}
                              step={250}
                              disabled={isGenerating}
                              value={stipulatedWordsPerChapter}
                              onChange={(e) =>
                                setStipulatedWordsPerChapter(Math.max(500, Number(e.target.value) || 2000))
                              }
                              className="studio-input w-20 px-2 py-1 text-xs font-bold tabular-nums text-right"
                            />
                            <span className="text-[11px] text-[var(--text-muted)]">字/章</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[2000, 3000, 3500, 4500].map((presetW) => (
                            <button
                              key={presetW}
                              type="button"
                              disabled={isGenerating}
                              onClick={() => setStipulatedWordsPerChapter(presetW)}
                              className={`py-1 rounded-lg border text-[11px] tabular-nums transition-colors cursor-pointer ${
                                Number(stipulatedWordsPerChapter) === presetW
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {presetW}字
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Multi-Chapter Batch Count Selector */}
                      {directorMode === 'batch' && (
                        <div className="p-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/35 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[var(--text-primary)]">
                              本次连续生成章节数
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={2}
                                max={30}
                                disabled={isGenerating}
                                value={batchChapterCount}
                                onChange={(e) =>
                                  setBatchChapterCount(
                                    Math.min(30, Math.max(1, Number(e.target.value) || 2))
                                  )
                                }
                                className="studio-input w-16 px-2 py-1 text-xs font-bold tabular-nums text-right"
                              />
                              <span className="text-[11px] text-[var(--text-muted)]">章</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-5 gap-1.5">
                            {[2, 3, 5, 8, 10].map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                disabled={isGenerating}
                                onClick={() => setBatchChapterCount(cnt)}
                                className={`py-1 rounded-lg border text-[11px] tabular-nums transition-colors cursor-pointer ${
                                  Number(batchChapterCount) === cnt
                                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)] font-bold'
                                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                                }`}
                              >
                                连写{cnt}章
                              </button>
                            ))}
                          </div>

                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed tabular-nums">
                            将连写 <strong>第 {nextChapterNum} ~ {batchEndChapNum} 章</strong>（其中{' '}
                            {plannedCountInBatchRange}/{batchChapterCount} 章已有L4细纲；每章完稿后自动刷新防穿帮防火墙）。
                          </p>
                        </div>
                      )}

                      {/* Upcoming Chapter 4-Layer Outline Preview Card */}
                      {upcomingPlannedOutline && (
                        <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/55 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[var(--text-primary)] flex items-center gap-1 truncate">
                              <ListOrdered className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                              <span className="truncate">
                                第 {upcomingPlannedOutline.chapterIndex} 章 L4：《{upcomingPlannedOutline.title}》
                              </span>
                            </span>
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() => handleSaveNextPlotInput(upcomingPlannedOutline.summary)}
                              className="text-[11px] font-medium text-[var(--accent)] hover:underline shrink-0 cursor-pointer"
                            >
                              填入框内
                            </button>
                          </div>
                          {(upcomingPlannedOutline.protagonistGoal ||
                            upcomingPlannedOutline.coreObstacle ||
                            upcomingPlannedOutline.hookNote) && (
                            <div className="space-y-0.5 text-[11px] text-[var(--text-secondary)] pt-0.5">
                              {upcomingPlannedOutline.protagonistGoal && (
                                <p>· <strong>主角目标：</strong>{upcomingPlannedOutline.protagonistGoal}</p>
                              )}
                              {upcomingPlannedOutline.coreObstacle && (
                                <p>· <strong>核心阻力：</strong>{upcomingPlannedOutline.coreObstacle}</p>
                              )}
                              {upcomingPlannedOutline.hookNote && (
                                <p className="text-[var(--accent)]">· <strong>章末钩子：</strong>{upcomingPlannedOutline.hookNote}</p>
                              )}
                            </div>
                          )}
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                            {upcomingPlannedOutline.summary}
                          </p>
                        </div>
                      )}

                      <textarea
                        rows={4}
                        disabled={isGenerating}
                        value={nextPlotInput}
                        onChange={(e) => handleSaveNextPlotInput(e.target.value)}
                        placeholder={
                          isGenerating
                            ? 'AI 正在流式扩写中，导演输入框已锁定...'
                            : directorMode === 'batch'
                            ? '（选填）输入本轮连续多章生成的总体剧情要求、节奏叮嘱或左侧导入的防穿帮提醒...'
                            : '（选填）输入下一章补充要求，可点左侧「+ 叮嘱导演台」或下方 AI 走向建议...'
                        }
                        className="studio-input w-full p-2.5 text-xs leading-relaxed disabled:opacity-55 disabled:cursor-not-allowed"
                      />
                    </div>
                  )}

                  {/* PRESERVED PERSISTENT SECTION: 后续剧情走向建议 (4 Post-Chapter Expansion Options) */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">后续剧情走向建议</span>
                      <div className="flex items-center gap-1.5">
                        <MotionButton
                          type="button"
                          disabled={isGenerating || isRerolling || !activeChapter}
                          onClick={handleRerollSuggestions}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRerolling ? 'animate-spin' : ''}`} />
                          <span>重掷</span>
                        </MotionButton>

                        {activeChapter?.allSuggestions && activeChapter.allSuggestions.length > 0 && (
                          confirmClearSuggestions ? (
                            <MotionButton
                              type="button"
                              onClick={handleClearSuggestions}
                              className="min-h-[30px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              确认清空
                            </MotionButton>
                          ) : (
                            <MotionButton
                              type="button"
                              onClick={() => setConfirmClearSuggestions(true)}
                              className="min-h-[30px] px-2 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-rose-600"
                            >
                              清空
                            </MotionButton>
                          )
                        )}
                      </div>
                    </div>

                    {activeChapter?.allSuggestions && activeChapter.allSuggestions.length > 0 ? (
                      <StaggerList className="space-y-2">
                        {activeChapter.allSuggestions[0].suggestions.map((opt, idx) => (
                          <StaggerItem
                            key={idx}
                            onContextMenu={(e) =>
                              openContextMenu(e, `后续走向选项 #${idx + 1}`, [
                                {
                                  id: 'adopt-plot',
                                  label: '采用此走向填入导演台',
                                  icon: <Check className="w-3.5 h-3.5" />,
                                  disabled: isGenerating,
                                  onSelect: () => {
                                    handleSaveNextPlotInput(opt);
                                    setCreationMode('outline');
                                  },
                                },
                                {
                                  id: 'run-now',
                                  label: '以此走向立即扩写下一章',
                                  icon: <Play className="w-3.5 h-3.5" />,
                                  disabled: isGenerating,
                                  onSelect: () => {
                                    handleSaveNextPlotInput(opt);
                                    handleGenerateNextChapter(opt, false);
                                  },
                                },
                                {
                                  id: 'append-plot',
                                  label: '叠加追加到当前导演指令',
                                  icon: <Plus className="w-3.5 h-3.5" />,
                                  disabled: isGenerating,
                                  onSelect: () => {
                                    const combined = nextPlotInput ? `${nextPlotInput.trim()}\n• ${opt}` : opt;
                                    handleSaveNextPlotInput(combined);
                                    setCreationMode('outline');
                                  },
                                },
                                {
                                  id: 'copy-plot',
                                  label: '复制此条走向文本',
                                  icon: <Copy className="w-3.5 h-3.5" />,
                                  dividerBefore: true,
                                  onSelect: () => {
                                    navigator.clipboard?.writeText(opt);
                                    triggerQuickToast('已复制走向建议');
                                  },
                                },
                              ])
                            }
                            className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/55 hover:border-[var(--accent)]/40 transition-colors space-y-2 text-[11.5px] text-[var(--text-secondary)] leading-relaxed"
                          >
                            <p>{opt}</p>
                            <div className="flex items-center justify-end gap-1.5">
                              <MotionButton
                                type="button"
                                disabled={isGenerating}
                                onClick={() => {
                                  handleSaveNextPlotInput(opt);
                                  setCreationMode('outline');
                                }}
                                className="min-h-[28px] px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] hover:opacity-85 disabled:opacity-40 cursor-pointer"
                              >
                                采用此走向
                              </MotionButton>
                              <MotionButton
                                type="button"
                                disabled={isGenerating}
                                onClick={() => {
                                  const combined = nextPlotInput ? `${nextPlotInput.trim()}\n• ${opt}` : opt;
                                  handleSaveNextPlotInput(combined);
                                  setCreationMode('outline');
                                }}
                                className="min-h-[28px] px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                              >
                                + 叠加
                              </MotionButton>
                              <MotionButton
                                type="button"
                                disabled={isGenerating}
                                onClick={() => {
                                  handleSaveNextPlotInput(opt);
                                  handleGenerateNextChapter(opt, false);
                                }}
                                className="min-h-[28px] px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>立即扩写</span>
                              </MotionButton>
                            </div>
                          </StaggerItem>
                        ))}
                      </StaggerList>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)] py-3 text-center studio-muted">
                        暂无建议，点击右上角「重掷」生成 4 条全新走向
                      </p>
                    )}
                  </div>

                  {/* Collapsible Idea Cards Overlay */}
                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setIsIdeaCardsSectionOpen(!isIdeaCardsSectionOpen)}
                      className="w-full min-h-[34px] flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <span>
                        叠加灵感工坊爆点卡 {selectedIdeaCardIds.length > 0 ? `(已选 ${selectedIdeaCardIds.length} 张)` : ''}
                      </span>
                      {isIdeaCardsSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {isIdeaCardsSectionOpen && (
                      <div className="pt-2 space-y-2.5">
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                          {['核心爆点', '角色设定', '金手指/机制', '全部'].map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setIdeaCategoryFilter(cat)}
                              className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap shrink-0 ${
                                ideaCategoryFilter === cat
                                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                                  : 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>

                        {filteredIdeaCards.length === 0 ? (
                          <p className="text-[11px] text-[var(--text-muted)] py-2">该分类暂无卡片，可在「灵感工坊」添加</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {filteredIdeaCards.map((card) => {
                              const selected = selectedIdeaCardIds.includes(card.id);
                              return (
                                <button
                                  key={card.id}
                                  type="button"
                                  onClick={() => handleToggleIdeaCard(card.id)}
                                  className={`w-full text-left p-2 rounded-xl border text-xs leading-relaxed transition-colors ${
                                    selected
                                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-medium'
                                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                                  }`}
                                >
                                  {card.content}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 space-y-1.5 text-xs text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">
                    当前正在查阅历史章节（第 {currentChapterIndex + 1} / {currentBook.chapters.length} 章）
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    您可直接在中间编辑校对、跑局部实时监测或下文重铸，或点击底部按钮返回最新章继续向后扩写。
                  </p>
                </div>
              )}

              {/* Chapter Rewrite & Long-Term Stage Summary */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRewriteOpen(!isRewriteOpen)}
                    className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>重写第 {currentChapterIndex + 1} 章</span>
                    {isRewriteOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating || isSummarizing || currentBook.chapters.length === 0}
                    onClick={handleGenerateSummary}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                    title="浓缩生成阶段全局总结，作为后续所有章节的永久长期记忆"
                  >
                    {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>阶段总结</span>
                  </button>
                </div>

                {isRewriteOpen && (
                  <div className="pt-1 space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)]">
                      重写后原章节会自动移入书库「历史归档」，绝不丢失旧稿。
                    </p>
                    <textarea
                      rows={3}
                      disabled={isGenerating}
                      value={rewritePlotInput}
                      onChange={(e) => setRewritePlotInput(e.target.value)}
                      placeholder={
                        isGenerating ? '流式重写进行中，输入已锁定...' : '输入本章重写调整方向（例：放慢对手戏节奏、改变冲突结局）...'
                      }
                      className="studio-input w-full p-2.5 text-xs leading-relaxed disabled:opacity-55"
                    />

                    {confirmRewrite ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleGenerateNextChapter(rewritePlotInput, true)}
                          className="flex-1 min-h-[36px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          确认归档旧稿并重写
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRewrite(false)}
                          className="min-h-[36px] px-3 rounded-xl border border-[var(--border-subtle)] text-xs"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setConfirmRewrite(true)}
                        className="w-full min-h-[36px] rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-45 cursor-pointer"
                      >
                        重写本章
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* PINNED BOTTOM FOOTER (Primary Generation CTA or Dialogue Chat Composer) */}
            <div className="shrink-0 p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {!isLastChapter ? (
                <button
                  type="button"
                  onClick={() => setCurrentChapterIndex(currentBook.chapters.length - 1)}
                  className="btn-primary w-full min-h-[42px] text-xs cursor-pointer"
                >
                  跳至最新章继续执笔
                </button>
              ) : creationMode === 'dialogue' ? (
                <DialogueComposerBar
                  isSending={isDialogueSending}
                  isGenerating={isGenerating}
                  onSendMessage={handleSendDialogueMessage}
                />
              ) : directorMode === 'batch' ? (
                <div className="space-y-2">
                  <MotionButton
                    type="button"
                    disabled={isGenerating}
                    onClick={handleBatchGenerateChapters}
                    className="btn-primary w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isGenerating && batchProgress ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          连写第 {batchProgress.currentStep}/{batchProgress.totalSteps} 章 (第 {batchProgress.currentChapNum} 章)...
                        </span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4" />
                        <span>
                          连续生成 {batchChapterCount} 章（每章 {targetChapterWords} 字）
                        </span>
                      </>
                    )}
                  </MotionButton>

                  {isGenerating && batchProgress && batchProgress.currentStep < batchProgress.totalSteps && (
                    <button
                      type="button"
                      disabled={stopBatchRequested}
                      onClick={() => {
                        stopBatchAfterCurrentRef.current = true;
                        setStopBatchRequested(true);
                      }}
                      className="w-full min-h-[34px] px-3 py-1 rounded-xl border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>
                        {stopBatchRequested
                          ? `第 ${batchProgress.currentChapNum} 章写完后安全停止`
                          : '写完当前章后安全停止连写'}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <MotionButton
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGenerateNextChapter(nextPlotInput, false)}
                  className="btn-primary w-full min-h-[44px] px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>正在流式执笔中...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>继续扩写第 {nextChapterNum} 章（{targetChapterWords} 字）</span>
                    </>
                  )}
                </MotionButton>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Inline Paragraph Polish Modal */}
      {isPolishModalOpen && (
        <ModalPortal onEscape={() => setIsPolishModalOpen(false)}>
          <div
            onClick={() => setIsPolishModalOpen(false)}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-2xl max-h-[88dvh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe"
            >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">局部段落 AI 精修与张力慢放</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  自动调用当前挂载的「段落精修 (polish)」阶段 SKILL 与文风参考样本
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPolishModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'anti_ai', label: '去 AI 套话精炼' },
                { id: 'sensory_slow', label: '五感与微动作慢放' },
                { id: 'dialogue', label: '台词潜台词打磨' },
                { id: 'custom', label: '自定义指令改写' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPolishMode(m.id as any)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                    polishMode === m.id
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                      : 'bg-[var(--bg-muted)] text-[var(--text-secondary)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={polishCustomHint}
              onChange={(e) => setPolishCustomHint(e.target.value)}
              placeholder="可选补充要求（例：突出攻指尖发抖的克制感，把景物描写压暗）..."
              className="studio-input w-full px-3.5 py-2.5 text-xs"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">待精修原文段落</label>
                <textarea
                  rows={7}
                  value={polishSourceText}
                  onChange={(e) => setPolishSourceText(e.target.value)}
                  className="studio-input w-full p-3 text-xs leading-relaxed font-editorial-serif"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">AI 精修后预览</label>
                <textarea
                  rows={7}
                  value={polishResultText}
                  onChange={(e) => setPolishResultText(e.target.value)}
                  placeholder="点击下方「开始精修」生成改写版本..."
                  className="studio-input w-full p-3 text-xs leading-relaxed font-editorial-serif"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPolishing || !polishSourceText.trim()}
                onClick={handleRunParagraphPolish}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
              >
                {isPolishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                <span>{polishResultText ? '重新精修一版' : '开始精修'}</span>
              </button>

              <button
                type="button"
                disabled={!polishResultText.trim()}
                onClick={handleApplyPolishedParagraph}
                className="btn-primary min-h-[44px] px-5 py-2 text-xs disabled:opacity-40 cursor-pointer"
              >
                替换写回正文
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Live Prompt & SKILL Audit Modal */}
      {isAuditModalOpen && liveAuditReport && (
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
                <h3 className="text-base font-bold text-[var(--text-primary)]">本章执笔 Prompt 与 SKILL 实时透视</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  根据您输入的「下一章走向」与「上一章结尾」实时计算关键词唤醒结果
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">本书 XP 审美基底</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  {!liveAuditReport.xpSystemEnabled
                    ? '已关闭 (物理隔离)'
                    : liveAuditReport.hasXpConstitution
                    ? `已开启并注入 (${liveAuditReport.xpLength} 字)`
                    : '已开启 (待填全局XP)'}
                </p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">当前生效 SKILL</p>
                <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {liveAuditReport.activeSkills.length} 项激活 · {liveAuditReport.standbySkills.length} 项待命
                </p>
              </div>
              <div className="p-3 studio-muted space-y-1">
                <p className="text-[var(--text-muted)]">当前唤醒世界书</p>
                <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {liveAuditReport.activeLore.length} 条注入 · {liveAuditReport.standbyLore.length} 条待命
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="font-semibold text-[var(--text-primary)]">已激活 SKILL 明细：</p>
              {liveAuditReport.activeSkills.length === 0 ? (
                <p className="text-[var(--text-muted)]">当前未勾选任何章节类 SKILL</p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl px-3">
                  {liveAuditReport.activeSkills.map(({ skill, reason, matchedKeywords, activeRefs }) => (
                    <div key={skill.id} className="py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--text-primary)]">
                          {skill.name}
                          {skill.version ? ` v${skill.version}` : ''}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                          {skill.ruleTier === 'advisory' ? '质量建议 · ' : ''}
                          {reason === 'keyword' ? `关键词唤醒: ${matchedKeywords.join('/')}` : '常驻生效'}
                        </span>
                      </div>
                      {activeRefs && activeRefs.length > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          ↳ 按需路由子文档：{activeRefs.map((ar) => ar.doc.title).join('、')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {liveAuditReport.activeLore.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-[var(--text-primary)]">已唤醒世界书档案明细：</p>
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl px-3">
                  {liveAuditReport.activeLore.map(({ entry, reason, matchedKeywords }) => (
                    <div key={entry.id} className="py-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{entry.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                        {reason === 'keyword' ? `情境唤醒: ${matchedKeywords.join('/')}` : '全程常驻'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                真实发送给模型的 System Prompt 原文 ({liveAuditReport.systemPrompt.length} 字符)：
              </p>
              <pre className="p-3.5 studio-muted text-[11px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                {liveAuditReport.systemPrompt}
              </pre>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Fullscreen Immersive Focus Reading Overlay (Portaled above TopNavbar & MobileBottomNav) */}
      {isFocusMode && (
        <ModalPortal onEscape={() => setIsFocusMode(false)}>
          <div
            id="immersive-focus-reader-scroll"
            className={`fixed inset-0 z-[105] h-[100dvh] overflow-y-auto ${
              focusTheme === 'sepia'
                ? 'bg-[#f6efe2] text-[#3a2e21]'
                : focusTheme === 'dark'
                ? 'bg-[#121211] text-[#dfdcd5]'
                : 'bg-[#faf9f6] text-[#18181b]'
            }`}
          >
            {/* Top Sticky Reader Bar with Prominent Left Back Button */}
            <div
              className={`sticky top-0 z-30 px-3.5 py-2.5 sm:px-8 sm:py-3 backdrop-blur-md border-b border-black/10 dark:border-white/10 pt-safe ${
                focusTheme === 'sepia'
                  ? 'bg-[#f6efe2]/92'
                  : focusTheme === 'dark'
                  ? 'bg-[#121211]/92'
                  : 'bg-[#faf9f6]/92'
              }`}
            >
              <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setIsFocusMode(false)}
                    className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-opacity hover:opacity-90 ${
                      focusTheme === 'dark'
                        ? 'bg-[#dfdcd5] text-[#121211]'
                        : 'bg-[#18181b] text-white'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>返回</span>
                  </button>

                  <div className="min-w-0">
                    <h2 className="font-bold text-xs sm:text-sm truncate font-editorial-serif">
                      《{currentBook.title}》 · {chapterTitle}
                    </h2>
                    <p className="text-[11px] opacity-70 tabular-nums truncate">
                      第 {currentChapterIndex + 1} / {currentBook.chapters.length} 章 · {chapterText.length} 字
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/10 p-1 rounded-xl text-xs">
                    <button
                      type="button"
                      onClick={() => setFocusFontStep((prev) => Math.max(0, prev - 1))}
                      className="min-h-[34px] px-2 sm:px-2.5 rounded-lg font-bold cursor-pointer"
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFocusFontStep((prev) => Math.min(FOCUS_FONT_CLASSES.length - 1, prev + 1))
                      }
                      className="min-h-[34px] px-2 sm:px-2.5 rounded-lg font-bold cursor-pointer"
                    >
                      A+
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/10 p-1 rounded-xl text-xs">
                    {[
                      { id: 'sepia', label: '宣纸' },
                      { id: 'light', label: '素白' },
                      { id: 'dark', label: '玄夜' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFocusTheme(t.id as any)}
                        className={`min-h-[34px] px-2 sm:px-2.5 rounded-lg font-medium cursor-pointer ${
                          focusTheme === t.id ? 'bg-black/15 dark:bg-white/20 font-semibold' : ''
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Reader Content & Unobstructed Bottom Chapter Controls */}
            <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-8 sm:pt-14 pb-16 sm:pb-20 pb-safe space-y-8 font-editorial-serif">
              <div className="space-y-2 text-center">
                <p className="text-xs font-sans opacity-60 tabular-nums">
                  第 {currentChapterIndex + 1} / {currentBook.chapters.length} 章
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {chapterTitle || `第 ${currentChapterIndex + 1} 章`}
                </h1>
              </div>

              <div className={`whitespace-pre-wrap chapter-canvas ${FOCUS_FONT_CLASSES[focusFontStep]}`}>
                {chapterText || '本章暂无正文内容'}
              </div>

              {/* Unobstructed Bottom Chapter Switcher + Return Button */}
              <div className="pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2.5 font-sans text-xs">
                <button
                  type="button"
                  disabled={currentChapterIndex <= 0}
                  onClick={() => {
                    setCurrentChapterIndex((prev) => Math.max(0, prev - 1));
                    document.getElementById('immersive-focus-reader-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-black/8 dark:bg-white/10 disabled:opacity-30 font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                  <span>上一章</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFocusMode(false)}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-black/15 dark:border-white/15 font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>返回执笔台</span>
                </button>

                <button
                  type="button"
                  disabled={currentChapterIndex >= currentBook.chapters.length - 1}
                  onClick={() => {
                    setCurrentChapterIndex((prev) => Math.min(currentBook.chapters.length - 1, prev + 1));
                    document.getElementById('immersive-focus-reader-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-black/8 dark:bg-white/10 disabled:opacity-30 font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>下一章</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Notice Modal */}
      {noticeModal && noticeModal.isOpen && (
        <ModalPortal onEscape={() => setNoticeModal(null)}>
          <div
            onClick={() => setNoticeModal(null)}
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-safe bg-black/55 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-t-3xl sm:rounded-2xl p-6 max-w-md w-full max-h-[88dvh] overflow-y-auto shadow-2xl space-y-4 pb-safe"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {noticeModal.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <h3 className="text-base font-bold text-[var(--text-primary)]">{noticeModal.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setNoticeModal(null)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs sm:text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {noticeModal.message}
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                {lastFailedRequest && noticeModal.type === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      const req = lastFailedRequest;
                      setNoticeModal(null);
                      handleGenerateNextChapter(req.plotHint, req.isRewrite);
                    }}
                    className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>一键重试生成该章节</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNoticeModal(null)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium cursor-pointer"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Tencent Zhuque Audit + story-deslop + story-review + webnovel-write Memory Modal */}
      {currentBook && isZhuqueModalOpen && (
        <SafeErrorBoundary
          fallbackTitle="朱雀质检弹窗加载异常"
          onReset={() => setIsZhuqueModalOpen(false)}
        >
          <ZhuqueAuditModal
            isOpen={isZhuqueModalOpen}
            onClose={() => setIsZhuqueModalOpen(false)}
            bookTitle={currentBook.title}
            chapterIndex={activeChapter?.index || currentChapterIndex + 1}
            chapterTitle={chapterTitle || activeChapter?.title || `第 ${currentChapterIndex + 1} 章`}
            chapterText={chapterText}
            settings={currentBook.settings}
            configs={configs}
            uiSettings={uiSettings}
            onApplyRewrittenText={async (newText: string) => {
              setChapterText(newText);
              if (currentChapterIndex >= 0 && currentBook.chapters[currentChapterIndex]) {
                const postReport = analyzeTextForZhuque(newText);
                const nextChapters = [...currentBook.chapters];
                nextChapters[currentChapterIndex] = {
                  ...nextChapters[currentChapterIndex],
                  text: newText,
                  meta: `story-deslop 朱雀过审重铸 (AI痕 ${postReport.aiRiskScore}% · σ=${postReport.burstinessStdDev}) · ${new Date().toLocaleTimeString()}`,
                };
                await onSaveBook({
                  ...currentBook,
                  chapters: nextChapters,
                  lastModifiedAt: Date.now(),
                });
              }
            }}
            onApplyMemoryWritebackSettings={async (nextSettings: BookSettings, toastMsg: string) => {
              await onSaveBook({
                ...currentBook,
                settings: nextSettings,
                lastModifiedAt: Date.now(),
              });
              triggerQuickToast(toastMsg);
            }}
          />
        </SafeErrorBoundary>
      )}
    </div>
  );
};
