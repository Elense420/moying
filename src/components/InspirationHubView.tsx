import React, { useState, useEffect, useMemo } from 'react';
import {
  Lightbulb,
  Sparkles,
  Search,
  Plus,
  Download,
  Upload,
  Trash2,
  Edit3,
  Check,
  Link as LinkIcon,
  X,
  Layers,
  ArrowUp,
  ArrowDown,
  Wand2,
  CheckSquare,
  Square,
  Globe,
  Loader2,
  Feather,
  Copy,
} from 'lucide-react';
import JSZip from 'jszip';
import { generateUUID } from '../utils/uuid';
import { InspirationRecord, Book, UiSettings, ApiConfig, IdeaCard, NovelSkill } from '../types';
import { dbPut, dbGetAll, dbDelete, dbClear, STORE_NAMES } from '../services/db';
import { chatCompletion } from '../services/apiClient';
import { buildUnifiedSystemPrompt } from '../services/promptEngine';
import { MotionButton, StaggerCard } from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

export interface ShareHistoryItem {
  id: string;
  createdAt: number;
  rawText: string;
  result: {
    title: string;
    genre: string;
    cards: Array<{ category: string; tag: string; content: string }>;
  };
}

interface InspirationHubViewProps {
  books: Book[];
  configs: ApiConfig[];
  uiSettings: UiSettings;
  xpPreferences: string;
  globalSkills: NovelSkill[];
  onSelectInspirationForCreation: (record: InspirationRecord) => void;
  onOpenBookFromInspiration: (bookId: string) => void;
}

const DEFAULT_GENRE_TAGS = [
  '现代都市', '豪门世家', '破镜重圆', '娱乐圈', '奇幻灵异', '古代权谋',
  '江湖武侠', '修仙仙侠', '穿书系统', '星际哨向', 'ABO', '末世废土',
  '无限流', '悬疑惊悚', '人外克系', '先婚后爱', '宿敌变情人', '救赎治愈',
];

export const InspirationHubView: React.FC<InspirationHubViewProps> = ({
  books,
  configs,
  uiSettings,
  xpPreferences,
  globalSkills,
  onSelectInspirationForCreation,
  onOpenBookFromInspiration,
}) => {
  const [subTab, setSubTab] = useState<'cards' | 'create' | 'records'>('cards');
  const { openContextMenu, triggerQuickToast } = useContextMenu();

  // Idea Cards State
  const [ideaCards, setIdeaCards] = useState<IdeaCard[]>([]);
  const [newCardContent, setNewCardContent] = useState('');
  const [newCardCategory, setNewCardCategory] = useState<string>('核心爆点');
  const [newCardTag, setNewCardTag] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [isConvertingCards, setIsConvertingCards] = useState(false);

  // Batch Outline Generator State
  const [genreTags, setGenreTags] = useState<string[]>(DEFAULT_GENRE_TAGS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [numOutlines, setNumOutlines] = useState<number>(3);
  const [isGenerating, setIsGenerating] = useState(false);

  // Inspiration Records State
  const [records, setRecords] = useState<InspirationRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  // Detail Modal State
  const [selectedRecord, setSelectedRecord] = useState<InspirationRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDeleteRecord, setConfirmDeleteRecord] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [editStyle, setEditStyle] = useState('');
  const [editWorld, setEditWorld] = useState('');
  const [editCharacters, setEditCharacters] = useState('');
  const [editOutline, setEditOutline] = useState('');

  // Link Novels & Batch Export Modals
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedNovelIdsToLink, setSelectedNovelIdsToLink] = useState<string[]>([]);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<string[]>([]);

  // External Platform Blurb / Share Text AI Deconstructor
  const [isShareImportOpen, setIsShareImportOpen] = useState(false);
  const [shareRawText, setShareRawText] = useState('');
  const [isAnalyzingShare, setIsAnalyzingShare] = useState(false);
  const [shareParseResults, setShareParseResults] = useState<{
    title: string;
    genre: string;
    cards: Array<{ category: string; tag: string; content: string }>;
  } | null>(null);
  const [shareModalTab, setShareModalTab] = useState<'parse' | 'history'>('parse');
  const [shareHistory, setShareHistory] = useState<ShareHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('novel_share_parse_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const notify = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setStatusMessage({ type, text });
  };

  useEffect(() => {
    loadRecords();
    loadIdeaCards();
  }, []);

  const loadRecords = async () => {
    const list = await dbGetAll<InspirationRecord>(STORE_NAMES.INSPIRATION_RECORDS);
    setRecords(list);
  };

  const loadIdeaCards = () => {
    const saved = localStorage.getItem('ai_novelist_idea_cards');
    if (saved) {
      try {
        setIdeaCards(JSON.parse(saved));
        return;
      } catch {
        // fallback below
      }
    }
    const initialCards: IdeaCard[] = [
      {
        id: '1',
        content: '暴雨停电夜，平日冷酷令人生畏的掌权者高烧昏沉，死死攥住主角微凉的手腕低声求他别走',
        tag: '反差名场面',
        category: '核心爆点',
        order: 0,
        createdAt: Date.now(),
      },
      {
        id: '2',
        content: '看似体弱易碎的病美人实则是唯一能安抚暴走精神力的顶级向导，情绪越平静压制力越强',
        tag: '身份张力',
        category: '角色设定',
        order: 1,
        createdAt: Date.now() - 1000,
      },
    ];
    setIdeaCards(initialCards);
    localStorage.setItem('ai_novelist_idea_cards', JSON.stringify(initialCards));
  };

  const saveIdeaCards = (updated: IdeaCard[]) => {
    setIdeaCards(updated);
    localStorage.setItem('ai_novelist_idea_cards', JSON.stringify(updated));
  };

  const handleAddCard = () => {
    if (!newCardContent.trim()) return;
    const newCard: IdeaCard = {
      id: generateUUID(),
      content: newCardContent.trim(),
      tag: newCardTag.trim() || '随手记',
      category: newCardCategory || '核心爆点',
      order: ideaCards.length,
      createdAt: Date.now(),
    };
    saveIdeaCards([newCard, ...ideaCards]);
    setNewCardContent('');
    setNewCardTag('');
  };

  const handleDeleteCard = (cardId: string) => {
    saveIdeaCards(ideaCards.filter((c) => c.id !== cardId));
    setSelectedCardIds((prev) => prev.filter((id) => id !== cardId));
  };

  const handleMoveCard = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ideaCards.length) return;
    const updated = [...ideaCards];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    saveIdeaCards(updated);
  };

  const toggleSelectCard = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const handleSelectAllCards = () => {
    if (selectedCardIds.length === ideaCards.length) {
      setSelectedCardIds([]);
    } else {
      setSelectedCardIds(ideaCards.map((c) => c.id));
    }
  };

  const parseGeneratedOutline = (text: string) => {
    const result = {
      title: '未命名灵感大纲',
      genre: '架空纯爱',
      style: '细腻张力',
      world: '',
      characters: '',
      outline: '',
    };

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let currentField = '';

    for (const line of lines) {
      let match = line.match(/^###\s*(.+)/);
      if (match) {
        result.title = match[1].replace(/大纲标题[：:]*/, '').replace(/[*#]/g, '').trim();
        currentField = '';
        continue;
      }

      match = line.match(/^\*\*书名[：:]*?\*\*\s*(.+)/);
      if (match) {
        result.title = match[1].replace(/^《|》$/g, '').trim();
        continue;
      }

      match = line.match(/^\*\*题材[：:]*?\*\*\s*(.+)/);
      if (match) {
        result.genre = match[1].trim();
        continue;
      }

      match = line.match(/^\*\*风格[：:]*?\*\*\s*(.+)/);
      if (match) {
        result.style = match[1].trim();
        continue;
      }

      match = line.match(/^\*\*核心设定[：:]*?\*\*\s*(.*)/);
      if (match) {
        currentField = 'world';
        if (match[1]) result.world += match[1].trim() + '\n';
        continue;
      }

      match = line.match(/^\*\*主要角色原型[：:]*?\*\*\s*(.*)/);
      if (match) {
        currentField = 'characters';
        if (match[1]) result.characters += match[1].trim() + '\n';
        continue;
      }

      match = line.match(/^\*\*剧情梗概[：:]*?\*\*\s*(.*)/);
      if (match) {
        currentField = 'outline';
        if (match[1]) result.outline += match[1].trim() + '\n';
        continue;
      }

      match = line.match(/^\*\*结局走向[：:]*?\*\*\s*(.*)/);
      if (match) {
        if (match[1]) result.outline += `\n【结局走向】：${match[1].trim()}\n`;
        currentField = '';
        continue;
      }

      if (currentField === 'world') result.world += line + '\n';
      else if (currentField === 'characters') result.characters += line + '\n';
      else if (currentField === 'outline') result.outline += line + '\n';
    }

    result.world = result.world.trim();
    result.characters = result.characters.trim();
    result.outline = result.outline.trim() || text.trim();
    return result;
  };

  // Convert Selected Idea Cards into Full Book Outline (wired through unified promptEngine!)
  const handleConvertCardsToOutline = async (targetCardIds?: string[]) => {
    const idsToUse = targetCardIds || selectedCardIds;
    if (idsToUse.length === 0) {
      notify('请先勾选至少 1 张灵感卡片再执行融合', 'error');
      return;
    }

    const cardsToConvert = ideaCards.filter((c) => idsToUse.includes(c.id));
    const cardTexts = cardsToConvert
      .map((c, i) => `${i + 1}. [${c.category || '灵感'} · ${c.tag || '点子'}] ${c.content}`)
      .join('\n');

    const inspCfg = configs.find((c) => c.id === uiSettings.inspirationApiCfgId) || configs[0];
    const modelToUse = uiSettings.inspirationApiModel || 'gemini-3.6-flash';

    setIsConvertingCards(true);
    notify('正在挂载您的 XP 创作宪法与大纲类 SKILL，将零散卡片融合为完整小说大纲...', 'info');

    try {
      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: '你是一位极具商业敏锐度与文学审美的小说策划主编，擅长把零散名场面与反差设定编织成环环相扣的长篇大纲。',
        globalSkills,
        xpPreferences,
        contextCorpus: cardTexts,
      });

      const userPrompt = `请将以下灵感点子卡片有机融合为一篇冲突饱满、人设张力鲜明的小说大纲，并严格按以下 Markdown 结构输出：
---
### 大纲标题：[小说标题]
**书名：** [小说名称]
**题材：** [题材分类]
**风格：** [风格基调]
**核心设定：** [整合世界观与核心关系机制]
**主要角色原型：** [主角双方身高外貌反差、性格内核与人物弧光]
**剧情梗概：** [包含开篇相遇、中期转折拉扯、高潮危机与收束的完整剧情脉络]
**结局走向：** [结局设定]
---

待融合灵感卡片：
${cardTexts}`;

      const res = await chatCompletion({
        provider: inspCfg?.provider,
        baseUrl: inspCfg?.baseUrl,
        apiKey: inspCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.88,
      });

      const parsed = parseGeneratedOutline(res.content);
      const newRecord: InspirationRecord = {
        id: generateUUID(),
        createdAt: Date.now(),
        title: parsed.title,
        genre: parsed.genre,
        style: parsed.style,
        world: parsed.world,
        characters: parsed.characters,
        outline: parsed.outline,
        rawContent: res.content,
        linkedNovels: [],
      };

      await dbPut(STORE_NAMES.INSPIRATION_RECORDS, newRecord);
      await loadRecords();
      openDetailModal(newRecord);
      setSubTab('records');
      notify(`已成功融合生成大纲《${parsed.title}》（已调用 ${audit.activeSkills.length} 项大纲 SKILL）`, 'success');
    } catch (err: any) {
      notify(`卡片融合失败：${err.message || 'API 响应异常'}`, 'error');
    } finally {
      setIsConvertingCards(false);
    }
  };

  // Batch Brainstorm Outlines (wired through unified promptEngine!)
  const handleGenerateInspirations = async () => {
    if (isGenerating) return;
    const inspCfg = configs.find((c) => c.id === uiSettings.inspirationApiCfgId) || configs[0];
    const modelToUse = uiSettings.inspirationApiModel || 'gemini-3.6-flash';

    setIsGenerating(true);
    notify(`正在结合 XP 宪法与大纲 SKILL 批量构思 ${numOutlines} 篇差异化小说方案...`, 'info');

    try {
      const selectedGenreStr = selectedTags.join('、');
      const keywordsStr = keywordsInput.trim();
      const corpus = `${selectedGenreStr}\n${keywordsStr}`;

      const audit = buildUnifiedSystemPrompt({
        scope: 'outline',
        roleHeader: '你是一位顶尖小说创意总监，擅长在同一核心审美偏好下构思截然不同世界观与开局切入点的新颖大纲。',
        globalSkills,
        xpPreferences,
        contextCorpus: corpus,
      });

      const userPrompt = `请一次性构思 ${numOutlines} 篇背景设定、开篇切入点与核心事件各不相同的高张力小说大纲（严禁几篇大纲剧情雷同！）。
期望题材标签：${selectedGenreStr || '自由发挥'}
核心关键词/名场面梗：${keywordsStr || '自由发挥'}

每篇大纲请严格采用以下结构，并用 "---" 分隔每篇：
---
### 大纲标题：[小说标题]
**书名：** [小说名称]
**题材：** [题材分类]
**风格：** [风格基调]
**核心设定：** [世界观与核心冲突机制]
**主要角色原型：** [主角双方具体身份与反差设定]
**剧情梗概：** [前中后期核心事件推进与情感转折]
**结局走向：** [结局设定]
---`;

      const res = await chatCompletion({
        provider: inspCfg?.provider,
        baseUrl: inspCfg?.baseUrl,
        apiKey: inspCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: audit.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.92,
      });

      const rawContent = res.content || '';
      const blocks = rawContent
        .split('---')
        .filter((b) => b.trim().includes('###') || b.trim().includes('**书名'))
        .map((b) => b.trim());

      if (blocks.length === 0) {
        notify('模型返回格式未能拆分为标准大纲，请调整关键词后重试', 'error');
        return;
      }

      for (const blockText of blocks) {
        const parsed = parseGeneratedOutline(blockText);
        const record: InspirationRecord = {
          id: generateUUID(),
          createdAt: Date.now(),
          title: parsed.title,
          genre: parsed.genre,
          style: parsed.style,
          world: parsed.world,
          characters: parsed.characters,
          outline: parsed.outline,
          rawContent: blockText,
          linkedNovels: [],
        };
        await dbPut(STORE_NAMES.INSPIRATION_RECORDS, record);
      }

      await loadRecords();
      setSubTab('records');
      notify(`成功脑暴并入库 ${blocks.length} 篇新灵感大纲！`, 'success');
    } catch (err: any) {
      notify(`生成灵感失败：${err.message || '网络异常'}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Analyze External Platform Share Text
  const handleAnalyzeShareText = async () => {
    if (!shareRawText.trim()) {
      notify('请先粘贴简介或推文文案', 'error');
      return;
    }

    const inspCfg = configs.find((c) => c.id === uiSettings.inspirationApiCfgId) || configs[0];
    const modelToUse = uiSettings.inspirationApiModel || 'gemini-3.6-flash';

    setIsAnalyzingShare(true);
    try {
      const systemPrompt = `你是一名小说创意拆解专家。请将用户贴入的外部小说简介或推文拆解为结构化灵感卡片。
严格只返回合法的 JSON 对象（不要带代码块标记）：
{
  "title": "提取或拟定的参考标题",
  "genre": "题材类型",
  "cards": [
    { "category": "核心爆点", "tag": "反差名场面", "content": "..." },
    { "category": "角色设定", "tag": "人设核心", "content": "..." }
  ]
}`;

      const res = await chatCompletion({
        provider: inspCfg?.provider,
        baseUrl: inspCfg?.baseUrl,
        apiKey: inspCfg?.apiKey,
        model: modelToUse,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: shareRawText.trim() },
        ],
        temperature: 0.7,
      });

      const cleanStr = (res.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
      const parsed = JSON.parse(cleanStr);

      if (parsed && Array.isArray(parsed.cards)) {
        setShareParseResults(parsed);
        const newHist: ShareHistoryItem = {
          id: generateUUID(),
          createdAt: Date.now(),
          rawText: shareRawText.trim(),
          result: parsed,
        };
        const updatedHist = [newHist, ...shareHistory.slice(0, 19)];
        setShareHistory(updatedHist);
        localStorage.setItem('novel_share_parse_history', JSON.stringify(updatedHist));
      }
    } catch (err: any) {
      notify(`拆解失败：${err.message || 'JSON 解析异常'}`, 'error');
    } finally {
      setIsAnalyzingShare(false);
    }
  };

  const handleImportParsedCardsToDeck = () => {
    if (!shareParseResults?.cards) return;
    const newCards: IdeaCard[] = shareParseResults.cards.map((c, i) => ({
      id: generateUUID(),
      content: c.content,
      tag: c.tag || '拆解灵感',
      category: c.category || '核心爆点',
      order: ideaCards.length + i,
      createdAt: Date.now() - i * 10,
    }));
    saveIdeaCards([...newCards, ...ideaCards]);
    setIsShareImportOpen(false);
    setShareRawText('');
    setShareParseResults(null);
    notify(`已将 ${newCards.length} 张拆解卡片收入灵感堆叠库`, 'success');
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter((rec) => {
        const matchesTitle = rec.title.toLowerCase().includes(searchQuery.toLowerCase().trim());
        const matchesGenre = (rec.genre || '').toLowerCase().includes(genreFilter.toLowerCase().trim());
        return matchesTitle && matchesGenre;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [records, searchQuery, genreFilter]);

  const openDetailModal = (record: InspirationRecord) => {
    setSelectedRecord(record);
    setEditTitle(record.title);
    setEditGenre(record.genre);
    setEditStyle(record.style);
    setEditWorld(record.world);
    setEditCharacters(record.characters);
    setEditOutline(record.outline);
    setIsEditing(false);
    setConfirmDeleteRecord(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedRecord) return;
    const updated: InspirationRecord = {
      ...selectedRecord,
      title: editTitle.trim(),
      genre: editGenre.trim(),
      style: editStyle.trim(),
      world: editWorld.trim(),
      characters: editCharacters.trim(),
      outline: editOutline.trim(),
    };
    await dbPut(STORE_NAMES.INSPIRATION_RECORDS, updated);
    setSelectedRecord(updated);
    setIsEditing(false);
    await loadRecords();
    notify('灵感大纲修改已保存', 'success');
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecord) return;
    await dbDelete(STORE_NAMES.INSPIRATION_RECORDS, selectedRecord.id);
    setSelectedRecord(null);
    setConfirmDeleteRecord(false);
    await loadRecords();
    notify('已删除该条灵感记录', 'info');
  };

  const handleConfirmLinkNovels = async () => {
    if (!selectedRecord) return;
    const newLinked = books
      .filter((b) => selectedNovelIdsToLink.includes(b.id))
      .map((b) => ({ novelId: b.id, novelTitle: b.title }));
    const updated = { ...selectedRecord, linkedNovels: newLinked };
    await dbPut(STORE_NAMES.INSPIRATION_RECORDS, updated);
    setSelectedRecord(updated);
    setIsLinkDialogOpen(false);
    await loadRecords();
  };

  const handleConfirmDownloadInspirations = async () => {
    if (selectedDownloadIds.length === 0) return;
    const items = records.filter((r) => selectedDownloadIds.includes(r.id));
    if (items.length === 1) {
      const r = items[0];
      const content = `# ${r.title}\n\n题材：${r.genre} · 风格：${r.style}\n\n## 核心设定\n${r.world}\n\n## 主要角色原型\n${r.characters}\n\n## 剧情梗概\n${r.outline}`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();
      items.forEach((r) => {
        const content = `# ${r.title}\n\n题材：${r.genre} · 风格：${r.style}\n\n## 核心设定\n${r.world}\n\n## 主要角色原型\n${r.characters}\n\n## 剧情梗概\n${r.outline}`;
        zip.file(`${r.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`, content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI小说家_灵感集_${items.length}篇.zip`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsDownloadDialogOpen(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Header & Sub-Navigation */}
      <section className="studio-card p-5 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)]">创意孵化与脑洞归档 · 自动挂载大纲 SKILL 与 XP 宪法</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
              灵感工坊
            </h1>
          </div>

          <MotionButton
            type="button"
            onClick={() => setIsShareImportOpen(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>贴入外部简介 AI 拆解看点</span>
          </MotionButton>
        </div>

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
            <span>{statusMessage.text}</span>
            <button type="button" onClick={() => setStatusMessage(null)} className="p-1 opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-[var(--border-subtle)]">
          {[
            { id: 'cards', label: `灵感卡片堆叠 (${ideaCards.length})`, icon: Layers },
            { id: 'create', label: 'AI 批量脑暴大纲', icon: Sparkles },
            { id: 'records', label: `大纲档案库 (${records.length})`, icon: Lightbulb },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <MotionButton
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as any)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
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

      {/* TAB 1: Idea Card Stacking */}
      {subTab === 'cards' && (
        <div className="space-y-5">
          <section className="studio-card p-5 sm:p-6 space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">随手记录零散脑洞 / 名场面梗</h2>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                value={newCardContent}
                onChange={(e) => setNewCardContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCard()}
                placeholder="输入一句人物反差、冲突场面或设定点子..."
                className="studio-input sm:col-span-6 px-3.5 py-2.5 text-sm min-h-[44px]"
              />
              <select
                value={newCardCategory}
                onChange={(e) => setNewCardCategory(e.target.value)}
                className="studio-input sm:col-span-3 px-3 py-2.5 text-xs min-h-[44px]"
              >
                <option value="核心爆点">核心爆点</option>
                <option value="角色设定">角色设定</option>
                <option value="金手指/机制">金手指/机制</option>
                <option value="世界观法则">世界观法则</option>
                <option value="收集箱">收集箱</option>
              </select>
              <div className="sm:col-span-3 flex gap-2">
                <input
                  type="text"
                  value={newCardTag}
                  onChange={(e) => setNewCardTag(e.target.value)}
                  placeholder="简短标签"
                  className="studio-input flex-1 min-w-0 px-3 py-2.5 text-xs min-h-[44px]"
                />
                <MotionButton
                  type="button"
                  onClick={handleAddCard}
                  className="btn-primary min-h-[44px] px-4 text-xs flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>收入</span>
                </MotionButton>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <MotionButton
              type="button"
              onClick={handleSelectAllCards}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
            >
              {selectedCardIds.length === ideaCards.length && ideaCards.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
              ) : (
                <Square className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span className="tabular-nums">全选卡片 ({selectedCardIds.length}/{ideaCards.length})</span>
            </MotionButton>

            <MotionButton
              type="button"
              disabled={selectedCardIds.length === 0 || isConvertingCards}
              onClick={() => handleConvertCardsToOutline()}
              className="btn-primary min-h-[44px] px-5 py-2.5 text-xs flex items-center gap-2 disabled:opacity-40 cursor-pointer"
            >
              {isConvertingCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              <span>将已选 ({selectedCardIds.length}) 张卡片融合为完整大纲</span>
            </MotionButton>
          </div>

          {ideaCards.length === 0 ? (
            <div className="studio-card p-12 text-center space-y-2">
              <Layers className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
              <p className="text-sm text-[var(--text-secondary)]">卡片盒暂空，记录下第一个让你心动的画面吧</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ideaCards.map((card, index) => {
                const isSelected = selectedCardIds.includes(card.id);
                return (
                  <StaggerCard
                    key={card.id}
                    index={index}
                    onContextMenu={(e) =>
                      openContextMenu(e, `${card.category || '灵感'} · ${card.tag || '点子'}`, [
                        {
                          id: 'toggle-select',
                          label: isSelected ? '取消勾选此卡片' : '勾选此卡片参与融合',
                          icon: <Check className="w-3.5 h-3.5" />,
                          onSelect: () => toggleSelectCard(card.id),
                        },
                        {
                          id: 'expand-single',
                          label: '将此单卡扩充为完整大纲',
                          icon: <Sparkles className="w-3.5 h-3.5" />,
                          disabled: isConvertingCards,
                          onSelect: () => handleConvertCardsToOutline([card.id]),
                        },
                        {
                          id: 'copy-card',
                          label: '复制灵感卡片文本',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => {
                            navigator.clipboard?.writeText(card.content);
                            triggerQuickToast('已复制灵感卡片内容');
                          },
                        },
                        {
                          id: 'del-card',
                          label: '删除该灵感卡片',
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          dividerBefore: true,
                          onSelect: () => handleDeleteCard(card.id),
                        },
                      ])
                    }
                    className={`studio-card studio-card-hover p-5 flex flex-col justify-between gap-4 transition-colors ${
                      isSelected ? 'ring-2 ring-[var(--accent)]' : ''
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => toggleSelectCard(card.id)}
                          className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          )}
                          <span>
                            {card.category || '收集箱'} · {card.tag || '灵感'}
                          </span>
                        </button>

                        <MotionButton
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10"
                          title="删除卡片"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </MotionButton>
                      </div>

                      <p className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                        {card.content}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
                      <div className="flex items-center gap-1">
                        <MotionButton
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveCard(index, 'up')}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-muted)] disabled:opacity-25"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </MotionButton>
                        <MotionButton
                          type="button"
                          disabled={index === ideaCards.length - 1}
                          onClick={() => handleMoveCard(index, 'down')}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-muted)] disabled:opacity-25"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </MotionButton>
                      </div>

                      <MotionButton
                        type="button"
                        disabled={isConvertingCards}
                        onClick={() => handleConvertCardsToOutline([card.id])}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--bg-muted)] hover:opacity-85 text-xs font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>单卡扩为大纲</span>
                      </MotionButton>
                    </div>
                  </StaggerCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Batch Outline Brainstorm */}
      {subTab === 'create' && (
        <section className="studio-card p-5 sm:p-7 space-y-6">
          <div className="space-y-1 border-b border-[var(--border-subtle)] pb-4">
            <h2 className="text-base font-bold text-[var(--text-primary)]">AI 批量脑暴差异化大纲</h2>
            <p className="text-xs text-[var(--text-muted)]">
              选定心仪题材与核心梗，AI 将严格遵循您的「XP 创作宪法」与「大纲起承转合 SKILL」一次性孵化多篇不同切入点的大纲。
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">点选题材背景（可多选）</label>
            <div className="flex flex-wrap gap-2">
              {genreTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)] font-semibold'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 max-w-sm pt-1">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customTag.trim()) {
                    const t = customTag.trim();
                    if (!genreTags.includes(t)) setGenreTags((prev) => [...prev, t]);
                    if (!selectedTags.includes(t)) setSelectedTags((prev) => [...prev, t]);
                    setCustomTag('');
                  }
                }}
                placeholder="补充自定义题材标签..."
                className="studio-input flex-1 px-3 py-2 text-xs min-h-[40px]"
              />
              <button
                type="button"
                onClick={() => {
                  const t = customTag.trim();
                  if (!t) return;
                  if (!genreTags.includes(t)) setGenreTags((prev) => [...prev, t]);
                  if (!selectedTags.includes(t)) setSelectedTags((prev) => [...prev, t]);
                  setCustomTag('');
                }}
                className="min-h-[40px] px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium whitespace-nowrap"
              >
                添加标签
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                指定核心梗 / 关系张力 / 开局情境（可选）
              </label>
              <textarea
                rows={3}
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="例：年上掌权者攻×清冷病弱美人受、契约同居、先婚后爱但攻早就暗恋多年..."
                className="studio-input w-full p-3.5 text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  单次生成篇数：<span className="font-bold tabular-nums">{numOutlines}</span> 篇
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={numOutlines}
                  onChange={(e) => setNumOutlines(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] my-2"
                />
              </div>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateInspirations}
                className="btn-primary w-full min-h-[48px] px-5 py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在构思大纲...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>立即构思 {numOutlines} 篇大纲</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Inspiration Record Archive */}
      {subTab === 'records' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索灵感书名..."
                  className="studio-input w-full pl-9 pr-3.5 py-2.5 text-xs min-h-[42px]"
                />
              </div>
              <input
                type="text"
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                placeholder="按题材过滤..."
                className="studio-input w-full px-3.5 py-2.5 text-xs min-h-[42px]"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={records.length === 0}
                onClick={() => {
                  setSelectedDownloadIds(records.map((r) => r.id));
                  setIsDownloadDialogOpen(true);
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出 TXT/ZIP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `AI小说家_灵感库备份_${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium cursor-pointer"
              >
                备份 JSON
              </button>

              <label className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>导入</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                      try {
                        const imported = JSON.parse(evt.target?.result as string);
                        if (Array.isArray(imported)) {
                          await dbClear(STORE_NAMES.INSPIRATION_RECORDS);
                          for (const item of imported) {
                            await dbPut(STORE_NAMES.INSPIRATION_RECORDS, item);
                          }
                          await loadRecords();
                          notify(`已成功导入 ${imported.length} 条灵感记录`, 'success');
                        }
                      } catch (err: any) {
                        notify(`导入失败：${err.message}`, 'error');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="studio-card p-12 text-center space-y-2">
              <Lightbulb className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
              <p className="text-sm text-[var(--text-secondary)]">暂无匹配的灵感大纲记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecords.map((rec, idx) => (
                <StaggerCard
                  key={rec.id}
                  index={idx}
                  onClick={() => openDetailModal(rec)}
                  onContextMenu={(e) =>
                    openContextMenu(e, `灵感大纲《${rec.title}》`, [
                      {
                        id: 'launch-book',
                        label: '以此大纲立项开书',
                        icon: <Feather className="w-3.5 h-3.5" />,
                        onSelect: () => onSelectInspirationForCreation(rec),
                      },
                      {
                        id: 'edit-rec',
                        label: '查阅并编辑完整大纲',
                        icon: <Edit3 className="w-3.5 h-3.5" />,
                        onSelect: () => openDetailModal(rec),
                      },
                      {
                        id: 'copy-rec',
                        label: '复制完整剧情梗概',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        onSelect: () => {
                          navigator.clipboard?.writeText(
                            `《${rec.title}》（${rec.genre}）\n\n【世界观】：${rec.world}\n\n【主要角色】：${rec.characters}\n\n【剧情梗概】：${rec.outline}`
                          );
                          triggerQuickToast(`已复制《${rec.title}》完整大纲`);
                        },
                      },
                      {
                        id: 'del-rec',
                        label: '删除该条灵感记录',
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        onSelect: async () => {
                          await dbDelete(STORE_NAMES.INSPIRATION_RECORDS, rec.id);
                          await loadRecords();
                          triggerQuickToast(`已删除《${rec.title}》`);
                        },
                      },
                    ])
                  }
                  className="studio-card studio-card-hover p-5 cursor-pointer flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold text-[var(--text-primary)] font-editorial-serif">
                        《{rec.title}》
                      </h3>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {new Date(rec.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">
                      {rec.genre || '未分类'} · {rec.style || '默认基调'}
                      {rec.linkedNovels && rec.linkedNovels.length > 0
                        ? ` · 已立项 ${rec.linkedNovels.length} 部作品`
                        : ''}
                    </p>

                    <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                      {rec.outline || rec.world}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)] text-xs">
                    <span className="text-[var(--text-muted)]">点击查阅与编辑 · 右键快捷操作</span>
                    <MotionButton
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInspirationForCreation(rec);
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Feather className="w-3 h-3" />
                      <span>立项开书</span>
                    </MotionButton>
                  </div>
                </StaggerCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail & Edit Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-7 shadow-2xl space-y-5 pb-safe">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] font-editorial-serif">
                  {isEditing ? '编辑灵感大纲' : `《${selectedRecord.title}》`}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {selectedRecord.genre} · {selectedRecord.style}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block mb-1 text-[var(--text-secondary)]">书名</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[var(--text-secondary)]">题材</label>
                    <input
                      type="text"
                      value={editGenre}
                      onChange={(e) => setEditGenre(e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[var(--text-secondary)]">风格</label>
                    <input
                      type="text"
                      value={editStyle}
                      onChange={(e) => setEditStyle(e.target.value)}
                      className="studio-input w-full px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">核心世界观设定</label>
                  <textarea
                    rows={3}
                    value={editWorld}
                    onChange={(e) => setEditWorld(e.target.value)}
                    className="studio-input w-full p-3 text-xs leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">主要角色原型</label>
                  <textarea
                    rows={3}
                    value={editCharacters}
                    onChange={(e) => setEditCharacters(e.target.value)}
                    className="studio-input w-full p-3 text-xs leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[var(--text-secondary)]">剧情梗概</label>
                  <textarea
                    rows={6}
                    value={editOutline}
                    onChange={(e) => setEditOutline(e.target.value)}
                    className="studio-input w-full p-3 text-xs leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                {selectedRecord.world && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-[var(--text-primary)]">核心设定与机制</h4>
                    <p className="whitespace-pre-wrap p-3.5 studio-muted">{selectedRecord.world}</p>
                  </div>
                )}
                {selectedRecord.characters && (
                  <div className="space-y-1">
                    <h4 className="font-bold text-[var(--text-primary)]">主要角色原型</h4>
                    <p className="whitespace-pre-wrap p-3.5 studio-muted">{selectedRecord.characters}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <h4 className="font-bold text-[var(--text-primary)]">完整剧情梗概</h4>
                  <p className="whitespace-pre-wrap p-3.5 studio-muted">{selectedRecord.outline}</p>
                </div>

                {selectedRecord.linkedNovels && selectedRecord.linkedNovels.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-[var(--text-primary)]">已关联作品</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedRecord.linkedNovels.map((ln) => (
                        <button
                          key={ln.novelId}
                          type="button"
                          onClick={() => {
                            setSelectedRecord(null);
                            onOpenBookFromInspiration(ln.novelId);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] text-xs font-medium text-[var(--text-primary)] hover:opacity-85"
                        >
                          打开《{ln.novelTitle}》
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="btn-primary min-h-[42px] px-4 py-2 text-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>保存修改</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>编辑</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNovelIdsToLink(
                          (selectedRecord.linkedNovels || []).map((ln) => ln.novelId)
                        );
                        setIsLinkDialogOpen(true);
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1.5"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>关联作品</span>
                    </button>

                    {confirmDeleteRecord ? (
                      <button
                        type="button"
                        onClick={handleDeleteRecord}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                      >
                        确认删除
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRecord(true)}
                        className="min-h-[42px] px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-500/10 text-xs font-medium"
                      >
                        删除
                      </button>
                    )}
                  </>
                )}
              </div>

              {!isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedRecord;
                    setSelectedRecord(null);
                    onSelectInspirationForCreation(target);
                  }}
                  className="btn-primary min-h-[44px] px-5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Feather className="w-3.5 h-3.5" />
                  <span>以此大纲立项写新书</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Link Novels Modal */}
      {isLinkDialogOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 space-y-4 pb-safe">
            <h3 className="text-base font-bold text-[var(--text-primary)]">关联书库中的作品</h3>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {books.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">书库暂无作品</p>
              ) : (
                books.map((b) => {
                  const checked = selectedNovelIdsToLink.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[var(--border-subtle)] cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedNovelIdsToLink((prev) =>
                            checked ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                          )
                        }
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                      <span className="font-medium text-[var(--text-primary)]">《{b.title}》</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLinkDialogOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs"
              >
                取消
              </button>
              <button type="button" onClick={handleConfirmLinkNovels} className="btn-primary min-h-[42px] px-5 text-xs">
                保存关联
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Export Inspirations Modal */}
      {isDownloadDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 space-y-4 pb-safe">
            <h3 className="text-base font-bold text-[var(--text-primary)]">选择要导出的灵感大纲</h3>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {records.map((r) => {
                const checked = selectedDownloadIds.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[var(--border-subtle)] cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedDownloadIds((prev) =>
                          checked ? prev.filter((id) => id !== r.id) : [...prev, r.id]
                        )
                      }
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="truncate text-[var(--text-primary)]">《{r.title}》</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDownloadDialogOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs"
              >
                取消
              </button>
              <button
                type="button"
                disabled={selectedDownloadIds.length === 0}
                onClick={handleConfirmDownloadInspirations}
                className="btn-primary min-h-[42px] px-5 text-xs disabled:opacity-40"
              >
                导出 ({selectedDownloadIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External Platform Share / Blurb AI Analyzer Modal */}
      {isShareImportOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-2xl space-y-4 pb-safe">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">外部简介与推文看点 AI 拆解</h3>
              <button
                type="button"
                onClick={() => setIsShareImportOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[var(--text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShareModalTab('parse')}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium ${
                  shareModalTab === 'parse' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--bg-muted)]'
                }`}
              >
                智能拆解
              </button>
              <button
                type="button"
                onClick={() => setShareModalTab('history')}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium ${
                  shareModalTab === 'history' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-[var(--bg-muted)]'
                }`}
              >
                历史记录 ({shareHistory.length})
              </button>
            </div>

            {shareModalTab === 'parse' ? (
              <div className="space-y-3">
                <textarea
                  rows={5}
                  value={shareRawText}
                  onChange={(e) => setShareRawText(e.target.value)}
                  placeholder="粘贴来自晋江、长佩、番茄等平台的文案简介或推书口令，AI 将提炼其人设张力与核心梗卡片..."
                  className="studio-input w-full p-3.5 text-xs leading-relaxed"
                />

                <button
                  type="button"
                  disabled={isAnalyzingShare || !shareRawText.trim()}
                  onClick={handleAnalyzeShareText}
                  className="btn-primary w-full min-h-[44px] text-xs flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  {isAnalyzingShare ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>拆解核心看点卡片</span>
                </button>

                {shareParseResults && (
                  <div className="p-4 studio-muted space-y-3 text-xs">
                    <p className="font-bold text-[var(--text-primary)]">
                      《{shareParseResults.title}》 · {shareParseResults.genre}（共拆出 {shareParseResults.cards.length} 张看点卡）
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {shareParseResults.cards.map((c, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          <p className="text-[11px] text-[var(--text-muted)] mb-0.5">
                            {c.category} · {c.tag}
                          </p>
                          <p className="text-[var(--text-primary)]">{c.content}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleImportParsedCardsToDeck}
                      className="btn-primary w-full min-h-[42px] text-xs"
                    >
                      一键收入我的灵感卡片库
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {shareHistory.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-6 text-center">暂无拆解记录</p>
                ) : (
                  shareHistory.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setShareRawText(item.rawText);
                        setShareParseResults(item.result);
                        setShareModalTab('parse');
                      }}
                      className="w-full text-left p-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs space-y-1"
                    >
                      <p className="font-semibold text-[var(--text-primary)]">
                        《{item.result.title}》 · {item.result.cards.length} 张卡片
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{item.rawText}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
