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
} from 'lucide-react';
import { Book, Chapter, Summary, UiSettings, ApiConfig, IdeaCard, NovelSkill } from '../types';
import { streamChatCompletion, chatCompletion } from '../services/apiClient';
import { buildUnifiedSystemPrompt } from '../services/promptEngine';
import { generateUUID } from '../utils/uuid';
import { MotionButton, StaggerList, StaggerItem } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface WriterViewProps {
  currentBook: Book | null;
  currentChapterIndex: number;
  setCurrentChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  configs: ApiConfig[];
  uiSettings: UiSettings;
  xpPreferences: string;
  globalSkills: NovelSkill[];
  onSaveBook: (updatedBook: Book) => Promise<void>;
  onGoToSetup: () => void;
  onOpenSummaryViewModal: (summary: Summary) => void;
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
  currentChapterIndex,
  setCurrentChapterIndex,
  configs,
  uiSettings,
  xpPreferences,
  globalSkills,
  onSaveBook,
  onGoToSetup,
  onOpenSummaryViewModal,
}) => {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
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

  const isInitialChapterLoadRef = useRef(true);
  const autoStartedBookIdsRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

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

  // Build Sliding Memory Context (Stage Summaries + Compressed Earlier Chapters + Head/Tail of Latest Chapter)
  const buildMemoryContext = (upToChapterIndex?: number) => {
    if (!currentBook) return '';
    const memoryCount = Number(currentBook.settings?.contextMemory ?? 4);
    const parts: string[] = [];

    if (currentBook.summaries && currentBook.summaries.length > 0) {
      const summaryText = currentBook.summaries
        .map((s) => `• 【${s.title || s.chapterRange || '阶段总结'}】：${s.content}`)
        .join('\n');
      parts.push(`# 前情阶段总结与伏笔脉络\n${summaryText}`);
    }

    const sourceChapters =
      typeof upToChapterIndex === 'number'
        ? currentBook.chapters.slice(0, upToChapterIndex)
        : currentBook.chapters;

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

  // Core Chapter Expansion & Rewrite Flow (wired through unified promptEngine!)
  const handleGenerateNextChapter = async (plotHint: string = '', isRewrite: boolean = false) => {
    if (!currentBook || isGenerating) return;

    setIsGenerating(true);
    setConfirmRewrite(false);
    setGenMeta('正在装载大纲、世界书与 SKILL 2.0 规范，请求模型流式执笔...');

    const chapterIndexToGen = isRewrite ? currentChapterIndex + 1 : (currentBook.chapters?.length || 0) + 1;
    const words = Number(currentBook.settings?.chapterWords || 3500);
    const memory = buildMemoryContext(isRewrite ? currentChapterIndex : undefined);

    let combinedPlotHint = (plotHint || (!isRewrite ? nextPlotInput : '') || '').trim();
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
      roleHeader: '你是一名顶级资深职业小说家，正在严格按照作品档案、世界书与已挂载 SKILL 规范创作小说章节。',
      book: currentBook,
      globalSkills,
      xpPreferences,
      contextCorpus: `${currentBook.title}\n${combinedPlotHint}\n${prevTailForTrigger}`,
      climaxMode: climaxMultiplierEnabled,
    });

    let userPrompt = `请创作第 ${chapterIndexToGen} 章正文，目标字数约 ${words} 字（请充实展开场景细节与人物对话交锋，切勿敷衍缩水）。`;
    if (memory) {
      userPrompt += `\n\n${memory}\n`;
    }
    if (combinedPlotHint) {
      userPrompt += `\n# 本章核心推进指令（最高剧情优先级，请完整落地）：\n${combinedPlotHint}\n`;
    }

    userPrompt += `\n输出格式规范（严格遵守分隔符，正文中严禁出现 "---"）：
### 第${chapterIndexToGen}章：[拟定富有画面感与张力的章节标题]
[此处开始章节正文，段落清晰，对话与微动作交织]
---
#### 后续发展建议
- [建议1：包含具体外部事件触发、人物互动与悬念留钩的下一章走向，35~80字]
- [建议2：包含具体空间转换或新矛盾介入的下一章走向，35~80字]
- [建议3：侧重主角双方关系试探、信息差揭露或亲密拉扯的下一章走向，35~80字]
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

      // Empty response (0-word) guard: never overwrite existing chapter or lose user input!
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

      const metaText = `${activeModelName} · ${(latency / 1000).toFixed(1)}s · ${parsed.bodyText.length} 字 · 已激活 ${audit.activeSkills.length} 项 SKILL / ${audit.activeLore.length} 条世界书`;

      const newChapter: Chapter = {
        id: generateUUID(),
        index: chapterIndexToGen,
        title: parsed.title,
        text: parsed.bodyText,
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

      const updatedBook: Book = {
        ...currentBook,
        chapters: updatedChapters,
        archivedChapters,
        lastModifiedAt: Date.now(),
      };

      await onSaveBook(updatedBook);
      setCurrentChapterIndex(updatedChapters.length - 1);
      setRewritePlotInput('');
      setNextPlotInput('');
      setGenMeta(metaText);
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
  const targetChapterWords = Number(currentBook.settings?.chapterWords || 3500);
  const progressPercent = Math.min(
    99,
    Math.max(4, Math.floor((chapterText.length / Math.max(500, targetChapterWords)) * 100))
  );
  const manuscriptFontClass =
    uiSettings.chapterFontFamily === 'sans' ? 'font-sans' : 'font-editorial-serif';

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      {/* Empty-Response / Network Failure 1-Click Retry Banner */}
      {lastFailedRequest && !isGenerating && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              上次生成未返回有效正文（已自动拦截保护，未覆盖章节）。您输入的剧情走向与灵感卡片均已保留，可直接重试：
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleGenerateNextChapter(lastFailedRequest.plotHint, lastFailedRequest.isRewrite)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>一键重试生成该章节</span>
          </button>
        </div>
      )}

      {/* 2-Column Editorial Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (8 cols): Full-Height Literary Manuscript Sheet */}
        <div className="lg:col-span-8 space-y-4">
          <article className="studio-card p-4 sm:p-8 lg:p-10 space-y-5">
            {/* Compact Chapter Navigation & Word Telemetry Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  disabled={currentChapterIndex <= 0 || isGenerating}
                  onClick={() => setCurrentChapterIndex((prev) => Math.max(0, prev - 1))}
                  className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] disabled:opacity-35 flex items-center justify-center text-xs cursor-pointer"
                  title="上一章"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <select
                  disabled={isGenerating}
                  value={currentChapterIndex}
                  onChange={(e) => setCurrentChapterIndex(Number(e.target.value))}
                  className="studio-input min-h-[40px] max-w-[180px] sm:max-w-[260px] px-3 py-1.5 text-xs font-medium truncate"
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
                  className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] disabled:opacity-35 flex items-center justify-center text-xs cursor-pointer"
                  title="下一章"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Editorial Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5">
                <MotionButton
                  type="button"
                  disabled={isGenerating || !chapterText.trim()}
                  onClick={handleOpenPolishModal}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
                  title="选中文本或针对局部段落进行去AI味精修与张力慢放"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>段落精修</span>
                </MotionButton>

                <MotionButton
                  type="button"
                  onClick={() => setIsFocusMode(true)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookOpenText className="w-3.5 h-3.5" />
                  <span>沉浸阅读</span>
                </MotionButton>

                <MotionButton
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer ${
                    isEditMode
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  {isEditMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  <span>{isEditMode ? '完成校对' : '编辑正文'}</span>
                </MotionButton>

                {isEditMode && (
                  <MotionButton
                    type="button"
                    disabled={isGenerating}
                    onClick={handleSaveChapterEdits}
                    className="btn-primary min-h-[40px] px-3.5 py-1.5 text-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {saveSuccessToast ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{saveSuccessToast ? '已保存' : '保存'}</span>
                  </MotionButton>
                )}
              </div>
            </div>

            {/* Chapter Title & Word Count Subtitle */}
            <div className="space-y-2">
              <input
                type="text"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                disabled={!isEditMode || isGenerating}
                placeholder="章节标题..."
                className={`w-full text-xl sm:text-2xl lg:text-3xl font-bold bg-transparent text-[var(--text-primary)] focus:outline-none ${manuscriptFontClass} ${
                  isEditMode ? 'border-b border-[var(--accent)] pb-1' : ''
                }`}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)] tabular-nums">
                <span>
                  本章 {chapterText.length.toLocaleString()} 字 · 全书累计 {totalWordCount.toLocaleString()} 字 · 线路 {writerCfg?.name} ({activeModelName})
                </span>
                <span>
                  {autoSaveStatus === 'saving'
                    ? '正在自动保存草稿...'
                    : autoSaveStatus === 'saved' && lastAutoSavedTime
                    ? `已自动保存 ${lastAutoSavedTime}`
                    : genMeta
                    ? genMeta
                    : ''}
                </span>
              </div>
            </div>

            {/* Locked Streaming Progress Header (Active ONLY during AI expansion/rewrite) */}
            {isGenerating && (
              <div className="sticky top-16 z-20 p-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-lg space-y-2.5 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_68%)]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
                    <span>AI 正在流式扩写正文 · 编辑区与输入区已安全锁定</span>
                  </div>
                  <span className="font-mono text-[var(--text-secondary)] tabular-nums">
                    实时输出 {chapterText.length} / 目标 {targetChapterWords} 字 ({progressPercent}%)
                  </span>
                </div>

                <progress
                  value={progressPercent}
                  max={100}
                  className="w-full h-2 rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-[var(--bg-muted)] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-[var(--accent)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all [&::-moz-progress-bar]:bg-[var(--accent)]"
                />
              </div>
            )}

            {/* Main Literary Manuscript Canvas (No nested 60vh scroll trap!) */}
            <div
              className={`relative min-h-[380px] sm:min-h-[520px] pt-2 transition-opacity ${
                isGenerating
                  ? 'select-none pointer-events-none bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_75%)] rounded-xl p-2 sm:p-4'
                  : ''
              }`}
            >
              {isEditMode && !isGenerating ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    提示：在下方文本框中用鼠标或手指涂黑选中任意一段文字，点击顶部「段落精修」即可针对选中句段单独润色或慢放张力。
                  </p>
                  <textarea
                    ref={textareaRef}
                    rows={22}
                    value={chapterText}
                    onChange={(e) => setChapterText(e.target.value)}
                    placeholder="在此直接校对或撰写章节正文..."
                    className={`studio-input w-full p-4 text-[var(--text-primary)] chapter-canvas resize-y min-h-[480px] ${manuscriptFontClass}`}
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
                  {chapterText || (isGenerating ? '正在等待模型首字流式返回...' : '本章暂无正文，点击右侧「继续扩写」开始创作。')}
                  <div ref={streamEndRef} />
                </div>
              )}
            </div>
          </article>

          {/* Collapsible Book Outline & Settings Quick Reference */}
          <div className="studio-card overflow-hidden">
            <button
              type="button"
              onClick={() => setIsReviewOpen(!isReviewOpen)}
              className="w-full min-h-[48px] px-5 py-3.5 flex items-center justify-between text-left hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                <span>查阅本书大纲与角色速览：《{currentBook.title}》</span>
              </span>
              {isReviewOpen ? (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>

            {isReviewOpen && (
              <div className="p-5 border-t border-[var(--border-subtle)] space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
                <p className="text-[var(--text-muted)]">
                  {currentBook.settings?.genre} · {currentBook.settings?.style || '默认基调'} · {currentBook.settings?.pov} / {currentBook.settings?.tense} · 记忆窗口 {currentBook.settings?.contextMemory ?? 4} 章
                </p>
                {currentBook.settings?.characters && (
                  <div>
                    <p className="font-semibold text-[var(--text-primary)] mb-1">主要角色：</p>
                    <p className="whitespace-pre-wrap">{currentBook.settings.characters}</p>
                  </div>
                )}
                {currentBook.settings?.outline && (
                  <div>
                    <p className="font-semibold text-[var(--text-primary)] mb-1">核心大纲：</p>
                    <p className="whitespace-pre-wrap max-h-56 overflow-y-auto p-3 studio-muted">
                      {currentBook.settings.outline}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): Sticky Copilot Director & SKILL Inspector */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          {/* Card 1: Real-time SKILL 2.0 & Lorebook 2.0 Mount Status */}
          <div className="studio-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-[var(--text-primary)]">引擎挂载状态</h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                  {liveAuditReport?.activeSkills.length || 0} 项 SKILL · {liveAuditReport?.activeLore.length || 0} 条世界书 ·{' '}
                  {liveAuditReport?.hasXpConstitution ? 'XP宪法已挂载' : '未设XP宪法'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAuditModalOpen(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-muted)] hover:opacity-85 text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>透视</span>
                </button>
                <button
                  type="button"
                  onClick={onGoToSetup}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] cursor-pointer"
                  title="修改作品设定与SKILL开关"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Climax Slow-Motion Switch */}
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => setClimaxMultiplierEnabled(!climaxMultiplierEnabled)}
              className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                climaxMultiplierEnabled
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>名场面高潮镜头慢放 (2x细节)</span>
              </span>
              <span className="text-[11px] font-semibold">{climaxMultiplierEnabled ? '已开启' : '关闭'}</span>
            </button>
          </div>

          {/* Card 2: Next Chapter Director (Active on latest chapter) */}
          {isLastChapter ? (
            <div className="studio-card p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  下一章导演台 (第 {(currentBook.chapters?.length || 0) + 1} 章)
                </h3>
                <MotionButton
                  type="button"
                  disabled={isGenerating || isGeneratingBeats}
                  onClick={handleGenerateChapterBeats}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--bg-muted)] hover:opacity-85 text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-45 cursor-pointer"
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

              <textarea
                rows={4}
                disabled={isGenerating}
                value={nextPlotInput}
                onChange={(e) => handleSaveNextPlotInput(e.target.value)}
                placeholder={
                  isGenerating
                    ? 'AI 正在流式扩写中，导演输入框已锁定...'
                    : '输入下一章具体剧情要求，或点选下方 AI 走向建议 / 右上角「生成4幕细纲」自动排布冲突节奏...'
                }
                className="studio-input w-full p-3 text-xs leading-relaxed disabled:opacity-55 disabled:cursor-not-allowed"
              />

              <MotionButton
                type="button"
                disabled={isGenerating}
                onClick={() => handleGenerateNextChapter(nextPlotInput, false)}
                className="btn-primary w-full min-h-[48px] px-5 py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在流式执笔中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>继续扩写下一章</span>
                  </>
                )}
              </MotionButton>

              {/* AI 4 Plot Suggestions */}
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">后续剧情走向建议</span>
                  <div className="flex items-center gap-1.5">
                    <MotionButton
                      type="button"
                      disabled={isGenerating || isRerolling || !activeChapter}
                      onClick={handleRerollSuggestions}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRerolling ? 'animate-spin' : ''}`} />
                      <span>重掷</span>
                    </MotionButton>

                    {activeChapter?.allSuggestions && activeChapter.allSuggestions.length > 0 && (
                      confirmClearSuggestions ? (
                        <MotionButton
                          type="button"
                          onClick={handleClearSuggestions}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                        >
                          确认清空
                        </MotionButton>
                      ) : (
                        <MotionButton
                          type="button"
                          onClick={() => setConfirmClearSuggestions(true)}
                          className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-rose-600"
                        >
                          清空
                        </MotionButton>
                      )
                    )}
                  </div>
                </div>

                {activeChapter?.allSuggestions && activeChapter.allSuggestions.length > 0 ? (
                  <StaggerList className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
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
                              onSelect: () => handleSaveNextPlotInput(opt),
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
                        className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/60 hover:border-[var(--accent)]/40 transition-colors space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        <p>{opt}</p>
                        <div className="flex items-center justify-end gap-2">
                          <MotionButton
                            type="button"
                            disabled={isGenerating}
                            onClick={() => handleSaveNextPlotInput(opt)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] hover:opacity-85 disabled:opacity-40 cursor-pointer"
                          >
                            采用此走向
                          </MotionButton>
                          <MotionButton
                            type="button"
                            disabled={isGenerating}
                            onClick={() => {
                              const combined = nextPlotInput ? `${nextPlotInput.trim()}\n• ${opt}` : opt;
                              handleSaveNextPlotInput(combined);
                            }}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                          >
                            + 叠加
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
                  className="w-full min-h-[40px] flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
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
                          className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap shrink-0 ${
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
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {filteredIdeaCards.map((card) => {
                          const selected = selectedIdeaCardIds.includes(card.id);
                          return (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => handleToggleIdeaCard(card.id)}
                              className={`w-full text-left p-2.5 rounded-xl border text-xs leading-relaxed transition-colors ${
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
            </div>
          ) : (
            <div className="studio-card p-4 space-y-2 text-xs text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">
                当前正在查阅历史章节（第 {currentChapterIndex + 1} / {currentBook.chapters.length} 章）
              </p>
              <p className="text-[var(--text-muted)]">跳转至最新一章即可继续向后扩写连载。</p>
              <button
                type="button"
                onClick={() => setCurrentChapterIndex(currentBook.chapters.length - 1)}
                className="btn-primary w-full min-h-[42px] text-xs mt-1 cursor-pointer"
              >
                跳至最新章继续执笔
              </button>
            </div>
          )}

          {/* Card 3: Chapter Rewrite & Long-Term Stage Summary */}
          <div className="studio-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsRewriteOpen(!isRewriteOpen)}
                className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重写当前第 {currentChapterIndex + 1} 章</span>
                {isRewriteOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                disabled={isGenerating || isSummarizing || currentBook.chapters.length === 0}
                onClick={handleGenerateSummary}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 disabled:opacity-45 cursor-pointer"
                title="浓缩生成阶段全局总结，作为后续所有章节的永久长期记忆"
              >
                {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>生成阶段总结</span>
              </button>
            </div>

            {isRewriteOpen && (
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
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
                  className="studio-input w-full p-3 text-xs leading-relaxed disabled:opacity-55"
                />

                {confirmRewrite ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGenerateNextChapter(rewritePlotInput, true)}
                      className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      确认归档旧稿并重写
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRewrite(false)}
                      className="min-h-[42px] px-3 rounded-xl border border-[var(--border-subtle)] text-xs"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setConfirmRewrite(true)}
                    className="w-full min-h-[42px] rounded-xl border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-45 cursor-pointer"
                  >
                    重写本章
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Inline Paragraph Polish Modal */}
      {isPolishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
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
      )}

      {/* Live Prompt & SKILL Audit Modal */}
      {isAuditModalOpen && liveAuditReport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
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
                <p className="text-[var(--text-muted)]">全局 XP 创作宪法</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  {liveAuditReport.hasXpConstitution ? `已注入 (${liveAuditReport.xpLength} 字)` : '未设置'}
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
                  {liveAuditReport.activeSkills.map(({ skill, reason, matchedKeywords }) => (
                    <div key={skill.id} className="py-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{skill.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                        {reason === 'keyword' ? `关键词唤醒: ${matchedKeywords.join('/')}` : '常驻生效'}
                      </span>
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
      )}

      {/* Fullscreen Immersive Focus Reading Overlay (Zero Inline Styles) */}
      {isFocusMode && (
        <div
          className={`fixed inset-0 z-50 overflow-y-auto ${
            focusTheme === 'sepia'
              ? 'bg-[#f6efe2] text-[#3a2e21]'
              : focusTheme === 'dark'
              ? 'bg-[#121211] text-[#dfdcd5]'
              : 'bg-[#faf9f6] text-[#18181b]'
          }`}
        >
          <div className="sticky top-0 z-30 px-4 py-3 sm:px-8 backdrop-blur-md bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 pt-safe">
            <div className="min-w-0">
              <h2 className="font-bold text-sm truncate font-editorial-serif">
                《{currentBook.title}》 · {chapterTitle}
              </h2>
              <p className="text-[11px] opacity-70 tabular-nums">
                第 {currentChapterIndex + 1} / {currentBook.chapters.length} 章 · {chapterText.length} 字
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setFocusFontStep((prev) => Math.max(0, prev - 1))}
                  className="min-h-[34px] px-2.5 rounded-lg font-bold"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFocusFontStep((prev) => Math.min(FOCUS_FONT_CLASSES.length - 1, prev + 1))}
                  className="min-h-[34px] px-2.5 rounded-lg font-bold"
                >
                  A+
                </button>
              </div>

              <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 p-1 rounded-xl text-xs">
                {[
                  { id: 'sepia', label: '宣纸' },
                  { id: 'light', label: '素白' },
                  { id: 'dark', label: '玄夜' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFocusTheme(t.id as any)}
                    className={`min-h-[34px] px-2.5 rounded-lg font-medium ${
                      focusTheme === t.id ? 'bg-black/15 dark:bg-white/20 font-semibold' : ''
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsFocusMode(false)}
                className="min-h-[38px] px-3.5 rounded-xl bg-black/80 dark:bg-white/90 text-white dark:text-black text-xs font-semibold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>退出</span>
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-16 space-y-8 pb-safe font-editorial-serif">
            <h1 className="text-2xl sm:text-3xl font-bold text-center tracking-tight">
              {chapterTitle || `第 ${currentChapterIndex + 1} 章`}
            </h1>

            <div className={`whitespace-pre-wrap leading-loose tracking-wide ${FOCUS_FONT_CLASSES[focusFontStep]}`}>
              {chapterText || '本章暂无正文内容'}
            </div>

            <div className="pt-10 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-4 font-sans text-xs">
              <button
                type="button"
                disabled={currentChapterIndex <= 0}
                onClick={() => setCurrentChapterIndex((prev) => Math.max(0, prev - 1))}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 disabled:opacity-30 font-medium flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>上一章</span>
              </button>

              <span className="opacity-70 tabular-nums">
                {currentChapterIndex + 1} / {currentBook.chapters.length}
              </span>

              <button
                type="button"
                disabled={currentChapterIndex >= currentBook.chapters.length - 1}
                onClick={() =>
                  setCurrentChapterIndex((prev) => Math.min(currentBook.chapters.length - 1, prev + 1))
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 disabled:opacity-30 font-medium flex items-center gap-1.5"
              >
                <span>下一章</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notice Modal */}
      {noticeModal && noticeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-t-3xl sm:rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 pb-safe">
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
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)]"
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
                  className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>一键重试生成该章节</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setNoticeModal(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
