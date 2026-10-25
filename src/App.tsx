import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Feather,
  Clapperboard,
  Plus,
  Moon,
  Sun,
  Sliders,
  Flame,
} from 'lucide-react';
import { TopNavbar, MobileBottomNav, CreativeRealmSwitcher } from './components/TopNavbar';
import { LibraryView } from './components/LibraryView';
import { BookDetailModal } from './components/BookDetailModal';
import { ReadChapterModal } from './components/ReadChapterModal';
import { DownloadModal } from './components/DownloadModal';
import { SummaryViewModal } from './components/SummaryViewModal';
import { SetupView } from './components/SetupView';
import { WriterView } from './components/WriterView';
import { InspirationHubView } from './components/InspirationHubView';
import { ConfigView } from './components/ConfigView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { DramaLibraryView, DramaRadarView } from './components/DramaLibraryAndRadarView';
import { DramaSetupView, DramaWriterView } from './components/DramaStudioView';
import {
  PageTransition,
  SNAPPY_EASE,
  MotionButton,
  GlobalMicroLoader,
  WorkspaceSkeleton,
} from './components/MotionPrimitives';
import { ContextMenuProvider, useContextMenu } from './components/ContextMenu';
import { useGlobalActivity, beginGlobalActivity } from './services/activityTracker';

import {
  Book,
  ApiConfig,
  InspirationRecord,
  UiSettings,
  Chapter,
  ArchivedChapter,
  Summary,
  BookSettings,
  NovelSkill,
  DEFAULT_PRESET_SKILLS,
  DramaProject,
  CreativeTrack,
} from './types';
import {
  openDB,
  seedInitialDataIfEmpty,
  dbGetAll,
  dbGet,
  dbPut,
  dbDelete,
  STORE_NAMES,
  BUILTIN_CONFIG_ID,
  DEFAULT_BUILTIN_CONFIG,
  getGlobalSkills,
} from './services/db';
import { generateUUID } from './utils/uuid';

function StudioWorkspace() {
  const [activeTab, setActiveTabState] = useState<string>('novels');
  const [isHydratingDb, setIsHydratingDb] = useState<boolean>(true);
  const [isSwitchingView, setIsSwitchingView] = useState<boolean>(false);
  const routeTimerRef = useRef<number | null>(null);

  const globalActivity = useGlobalActivity();
  const { openContextMenu } = useContextMenu();

  // Track 1: Personal Free Novel Creation Data
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(-1);
  const [globalSkills, setGlobalSkills] = useState<NovelSkill[]>(DEFAULT_PRESET_SKILLS);
  const [xpPreferences, setXpPreferences] = useState<string>('');

  // Track 2: Commercial AI Comic-Drama Script Studio Data (100% XP-Isolated)
  const [dramaProjects, setDramaProjects] = useState<DramaProject[]>([]);
  const [currentDramaProject, setCurrentDramaProject] = useState<DramaProject | null>(null);
  const [currentDramaEpisodeIndex, setCurrentDramaEpisodeIndex] = useState<number>(1);
  const [presetDramaBeat, setPresetDramaBeat] = useState<string>('');
  const [pendingDeleteDrama, setPendingDeleteDrama] = useState<DramaProject | null>(null);

  // Shared Engine & Appearance Settings
  const [configs, setConfigs] = useState<ApiConfig[]>([DEFAULT_BUILTIN_CONFIG]);
  const [uiSettings, setUiSettings] = useState<UiSettings>({
    theme: 'ink',
    mode: 'light',
    chapterFontSize: '1.08rem',
    chapterFontFamily: 'serif',
    studioBrandName: '墨映工坊',
    activeTrack: 'novel',
    writerApiCfgId: BUILTIN_CONFIG_ID,
    writerApiModel: 'gemini-3.6-flash',
    rerollApiCfgId: BUILTIN_CONFIG_ID,
    rerollApiModel: 'gemini-3.6-flash',
    inspirationApiCfgId: BUILTIN_CONFIG_ID,
    inspirationApiModel: 'gemini-3.6-flash',
  });

  // Modals (Novel Track)
  const [bookDetailTarget, setBookDetailTarget] = useState<Book | null>(null);
  const [isBookDetailOpen, setIsBookDetailOpen] = useState(false);

  const [readChapterTarget, setReadChapterTarget] = useState<Chapter | ArchivedChapter | null>(null);
  const [isReadChapterOpen, setIsReadChapterOpen] = useState(false);

  const [downloadBookTarget, setDownloadBookTarget] = useState<Book | null>(null);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

  const [summaryViewTarget, setSummaryViewTarget] = useState<Summary | null>(null);
  const [isSummaryViewOpen, setIsSummaryViewOpen] = useState(false);

  const [pendingDeleteBook, setPendingDeleteBook] = useState<Book | null>(null);

  const activeTrack: CreativeTrack = uiSettings.activeTrack === 'drama' ? 'drama' : 'novel';

  // Smooth view transition with brief skeleton + micro-loader feedback
  const setActiveTab = useCallback(
    (nextTab: string) => {
      if (nextTab === activeTab) return;
      if (routeTimerRef.current) {
        window.clearTimeout(routeTimerRef.current);
      }
      setIsSwitchingView(true);
      setActiveTabState(nextTab);
      routeTimerRef.current = window.setTimeout(() => {
        setIsSwitchingView(false);
        routeTimerRef.current = null;
      }, 175);
    },
    [activeTab]
  );

  useEffect(() => {
    return () => {
      if (routeTimerRef.current) {
        window.clearTimeout(routeTimerRef.current);
      }
    };
  }, []);

  const refreshGlobalSkills = useCallback(async () => {
    const endTrack = beginGlobalActivity('同步 SKILL 规范库...');
    try {
      const loadedSkills = await getGlobalSkills();
      setGlobalSkills(loadedSkills);
    } finally {
      endTrack();
    }
  }, []);

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    setIsHydratingDb(true);
    const endActivity = beginGlobalActivity('正在载入本地创作档案库...');
    try {
      await openDB();
      await seedInitialDataIfEmpty();

      const [loadedBooks, loadedDramas, configsWrapper, loadedUi, loadedXp, loadedSkills] =
        await Promise.all([
          dbGetAll<Book>(STORE_NAMES.BOOKS),
          dbGetAll<DramaProject>(STORE_NAMES.DRAMA_PROJECTS),
          dbGet<{ id: string; data: ApiConfig[] }>(STORE_NAMES.CONFIGS, 'all'),
          dbGet<UiSettings>(STORE_NAMES.UI_SETTINGS, 'current'),
          dbGet<{ id: string; content: string }>(STORE_NAMES.XP_PREFERENCES, 'current'),
          getGlobalSkills(),
        ]);

      setBooks(loadedBooks);
      setDramaProjects(loadedDramas);
      setGlobalSkills(loadedSkills);

      if (configsWrapper && Array.isArray(configsWrapper.data)) {
        setConfigs(configsWrapper.data);
      }

      if (loadedUi) {
        const normalizedUi: UiSettings = {
          ...loadedUi,
          studioBrandName: loadedUi.studioBrandName || '墨映工坊',
          activeTrack: loadedUi.activeTrack || 'novel',
        };
        setUiSettings((prev) => ({ ...prev, ...normalizedUi }));
        if (normalizedUi.activeTrack === 'drama') {
          setActiveTabState('drama-library');
        }
      }

      if (loadedXp?.content) {
        setXpPreferences(loadedXp.content);
      }

      // Restore active Novel
      const lastActiveId = localStorage.getItem('currentBookId');
      if (lastActiveId) {
        const found = loadedBooks.find((b) => b.id === lastActiveId);
        if (found && found.chapters.length > 0) {
          setCurrentBook(found);
          setCurrentChapterIndex(found.chapters.length - 1);
        }
      } else if (loadedBooks.length > 0 && loadedBooks[0].chapters.length > 0) {
        setCurrentBook(loadedBooks[0]);
        setCurrentChapterIndex(loadedBooks[0].chapters.length - 1);
      }

      // Restore active Drama Project
      const lastDramaId = localStorage.getItem('currentDramaId');
      const matchedDrama =
        loadedDramas.find((d) => d.id === lastDramaId) || loadedDramas[0] || null;
      if (matchedDrama) {
        setCurrentDramaProject(matchedDrama);
        const latestEpIdx =
          matchedDrama.episodes?.length > 0
            ? Math.max(...matchedDrama.episodes.map((e) => e.index))
            : 1;
        setCurrentDramaEpisodeIndex(latestEpIdx);
      }
    } catch (err) {
      console.error('App init error:', err);
    } finally {
      endActivity();
      setIsHydratingDb(false);
    }
  };

  // Sync theme, dark mode, brand title, and manuscript font scale to DOM root
  useEffect(() => {
    const root = document.documentElement;
    if (uiSettings.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', uiSettings.theme || 'ink');
    root.style.setProperty('--chapter-content-font-size', uiSettings.chapterFontSize || '1.08rem');
    const brand = (uiSettings.studioBrandName || '墨映工坊').trim() || '墨映工坊';
    document.title = `${brand} · 小说自由创作与AI漫剧剧本中枢`;
    dbPut(STORE_NAMES.UI_SETTINGS, { id: 'current', ...uiSettings }).catch(() => {});
  }, [uiSettings]);

  // Switch between Personal Novel Track and Commercial AI Comic-Drama Track
  const handleSwitchCreativeTrack = (track: CreativeTrack) => {
    setUiSettings((prev) => ({ ...prev, activeTrack: track }));
    if (track === 'drama') {
      if (!activeTab.startsWith('drama-') && activeTab !== 'config') {
        setActiveTab('drama-library');
      }
    } else {
      if (activeTab.startsWith('drama-')) {
        setActiveTab('novels');
      }
    }
  };

  // ======================== Novel Track Handlers ========================
  const handleSaveBook = async (updatedBook: Book) => {
    const endSave = beginGlobalActivity('正在保存小说手稿...');
    try {
      await dbPut(STORE_NAMES.BOOKS, updatedBook);
      setBooks((prev) => {
        const exists = prev.some((b) => b.id === updatedBook.id);
        return exists
          ? prev.map((b) => (b.id === updatedBook.id ? updatedBook : b))
          : [updatedBook, ...prev];
      });
      if (currentBook?.id === updatedBook.id) {
        setCurrentBook(updatedBook);
      }
      if (bookDetailTarget?.id === updatedBook.id) {
        setBookDetailTarget(updatedBook);
      }
      localStorage.setItem('currentBookId', updatedBook.id);
    } finally {
      endSave();
    }
  };

  const handleOpenBookDetail = (book: Book) => {
    setBookDetailTarget(book);
    setIsBookDetailOpen(true);
  };

  const handleContinueWritingBook = (book: Book) => {
    setCurrentBook(book);
    const index = book.chapters.length > 0 ? book.chapters.length - 1 : 0;
    setCurrentChapterIndex(index);
    localStorage.setItem('currentBookId', book.id);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'novel' }));
    setActiveTab('writer');
  };

  const handleEditBookSetup = (book: Book) => {
    setCurrentBook(book);
    localStorage.setItem('currentBookId', book.id);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'novel' }));
    setActiveTab('setup');
  };

  const handleQuickCreateBook = () => {
    setCurrentBook(null);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'novel' }));
    setActiveTab('setup');
  };

  const handleOpenDownloadById = (bookId: string) => {
    const target = books.find((b) => b.id === bookId);
    if (target) {
      setDownloadBookTarget(target);
      setIsDownloadOpen(true);
    }
  };

  const requestDeleteBook = (bookId: string) => {
    const target = books.find((b) => b.id === bookId);
    if (target) {
      setPendingDeleteBook(target);
    }
  };

  const confirmDeleteBookExecution = async () => {
    if (!pendingDeleteBook) return;
    const bookId = pendingDeleteBook.id;
    await dbDelete(STORE_NAMES.BOOKS, bookId);
    const updatedBooks = books.filter((b) => b.id !== bookId);
    setBooks(updatedBooks);

    if (currentBook?.id === bookId) {
      setCurrentBook(updatedBooks[0] || null);
      setCurrentChapterIndex(
        updatedBooks[0]?.chapters.length ? updatedBooks[0].chapters.length - 1 : -1
      );
      if (updatedBooks[0]) {
        localStorage.setItem('currentBookId', updatedBooks[0].id);
      } else {
        localStorage.removeItem('currentBookId');
      }
    }
    setPendingDeleteBook(null);
  };

  const handleDeleteSummary = async (summaryId: string) => {
    if (!bookDetailTarget) return;
    const updatedSummaries = (bookDetailTarget.summaries || []).filter((s) => s.id !== summaryId);
    const updatedBook = { ...bookDetailTarget, summaries: updatedSummaries };
    await handleSaveBook(updatedBook);
    setBookDetailTarget(updatedBook);
  };

  const handleStartWritingFirstChapter = async (newBook: Book) => {
    const inspirationToLinkId = localStorage.getItem('inspirationToLink');
    if (inspirationToLinkId) {
      const inspRecord = await dbGet<InspirationRecord>(
        STORE_NAMES.INSPIRATION_RECORDS,
        inspirationToLinkId
      );
      if (inspRecord) {
        const linked = inspRecord.linkedNovels || [];
        if (!linked.some((l) => l.novelId === newBook.id)) {
          linked.push({ novelId: newBook.id, novelTitle: newBook.title });
          await dbPut(STORE_NAMES.INSPIRATION_RECORDS, { ...inspRecord, linkedNovels: linked });
        }
      }
      localStorage.removeItem('inspirationToLink');
    }

    await dbPut(STORE_NAMES.BOOKS, newBook);
    setBooks((prev) => {
      const filtered = prev.filter((b) => b.id !== newBook.id);
      return [newBook, ...filtered];
    });
    setCurrentBook(newBook);
    setCurrentChapterIndex(0);
    localStorage.setItem('currentBookId', newBook.id);
    setActiveTab('writer');
  };

  const handleUpdateBookSettings = async (updatedSettings: BookSettings, updatedTitle: string) => {
    if (!currentBook) return;
    const updatedBook: Book = {
      ...currentBook,
      title: updatedTitle,
      settings: updatedSettings,
      lastModifiedAt: Date.now(),
    };
    await handleSaveBook(updatedBook);
  };

  const handleSelectInspirationForCreation = (record: InspirationRecord) => {
    const dummyBook: Book = {
      id: generateUUID(),
      title: record.title,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      chapters: [],
      archivedChapters: [],
      summaries: [],
      settings: {
        genre: record.genre || '',
        style: record.style || '',
        chapterWords: 3500,
        pov: '第三人称',
        tense: '现在时',
        temperature: 0.85,
        contextMemory: 4,
        aiPersona:
          '你是一位文笔老练、极擅刻画人物张力与细腻情感拉扯的职业小说家。行文自然克制而富有画面感，严格遵循大纲、世界书与已挂载 SKILL 规范。',
        outline: record.outline || '',
        characters: record.characters || '',
        world: record.world || '',
        styleReference: null,
        lorebook: [],
        skills: globalSkills.map((sk) => ({ ...sk })),
      },
    };

    setCurrentBook(dummyBook);
    localStorage.setItem('inspirationToLink', record.id);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'novel' }));
    setActiveTab('setup');
  };

  // ======================== AI Comic-Drama Track Handlers ========================
  const handleSaveDramaProject = async (project: DramaProject) => {
    const endSave = beginGlobalActivity('正在同步漫剧剧本与分镜资产...');
    try {
      await dbPut(STORE_NAMES.DRAMA_PROJECTS, project);
      setDramaProjects((prev) => {
        const exists = prev.some((d) => d.id === project.id);
        return exists
          ? prev.map((d) => (d.id === project.id ? project : d))
          : [project, ...prev];
      });
      setCurrentDramaProject(project);
      localStorage.setItem('currentDramaId', project.id);
    } finally {
      endSave();
    }
  };

  const handleCreateBlankDrama = () => {
    setCurrentDramaProject(null);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'drama' }));
    setActiveTab('drama-setup');
  };

  const handleAdoptPitchAsDrama = async (newProject: DramaProject) => {
    await handleSaveDramaProject(newProject);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'drama' }));
    setActiveTab('drama-setup');
  };

  const handleEditDramaSetup = (project: DramaProject) => {
    setCurrentDramaProject(project);
    localStorage.setItem('currentDramaId', project.id);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'drama' }));
    setActiveTab('drama-setup');
  };

  const handleOpenDramaWriter = (
    project: DramaProject,
    episodeIdx?: number,
    presetBeat?: string
  ) => {
    setCurrentDramaProject(project);
    localStorage.setItem('currentDramaId', project.id);
    const resolvedEp =
      episodeIdx ??
      (project.episodes?.length > 0
        ? Math.max(...project.episodes.map((e) => e.index))
        : 1);
    setCurrentDramaEpisodeIndex(resolvedEp);
    if (presetBeat) setPresetDramaBeat(presetBeat);
    setUiSettings((prev) => ({ ...prev, activeTrack: 'drama' }));
    setActiveTab('drama-writer');
  };

  const confirmDeleteDramaExecution = async () => {
    if (!pendingDeleteDrama) return;
    const id = pendingDeleteDrama.id;
    await dbDelete(STORE_NAMES.DRAMA_PROJECTS, id);
    const remaining = dramaProjects.filter((d) => d.id !== id);
    setDramaProjects(remaining);
    if (currentDramaProject?.id === id) {
      setCurrentDramaProject(remaining[0] || null);
      if (remaining[0]) {
        localStorage.setItem('currentDramaId', remaining[0].id);
      } else {
        localStorage.removeItem('currentDramaId');
      }
    }
    setPendingDeleteDrama(null);
  };

  // Fallback Workspace Right-Click Menu (never overrides inputs/textareas or active text selection)
  const handleWorkspaceContextMenu = (e: React.MouseEvent) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }
    const selection = window.getSelection()?.toString()?.trim();
    if (selection) return;

    const brand = (uiSettings.studioBrandName || '墨映工坊').trim() || '墨映工坊';
    openContextMenu(e, `${brand} · 全局快捷台`, [
      {
        id: 'ws-switch-track',
        label:
          activeTrack === 'drama'
            ? '切换至「小说自由创作」赛道'
            : '切换至「AI 漫剧剧本」赛道',
        icon:
          activeTrack === 'drama' ? (
            <Feather className="w-3.5 h-3.5" />
          ) : (
            <Clapperboard className="w-3.5 h-3.5" />
          ),
        onSelect: () =>
          handleSwitchCreativeTrack(activeTrack === 'drama' ? 'novel' : 'drama'),
      },
      {
        id: 'ws-new-novel',
        label: '新建私人小说立项',
        icon: <Plus className="w-3.5 h-3.5" />,
        onSelect: handleQuickCreateBook,
      },
      {
        id: 'ws-new-drama',
        label: '新建 AI 漫剧剧本立项',
        icon: <Clapperboard className="w-3.5 h-3.5" />,
        onSelect: handleCreateBlankDrama,
      },
      {
        id: 'ws-radar',
        label: '前往漫剧热门风向雷达',
        icon: <Flame className="w-3.5 h-3.5" />,
        onSelect: () => {
          setUiSettings((prev) => ({ ...prev, activeTrack: 'drama' }));
          setActiveTab('drama-radar');
        },
      },
      {
        id: 'ws-toggle-dark',
        label: uiSettings.mode === 'dark' ? '切换为浅色宣纸日间模式' : '切换为深色沉浸夜间模式',
        icon:
          uiSettings.mode === 'dark' ? (
            <Sun className="w-3.5 h-3.5" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          ),
        dividerBefore: true,
        onSelect: () =>
          setUiSettings((prev) => ({
            ...prev,
            mode: prev.mode === 'dark' ? 'light' : 'dark',
          })),
      },
      {
        id: 'ws-open-config',
        label: '打开引擎线路与 SKILL 中心',
        icon: <Sliders className="w-3.5 h-3.5" />,
        onSelect: () => setActiveTab('config'),
      },
    ]);
  };

  const isMicroLoaderActive =
    isHydratingDb || isSwitchingView || globalActivity.activeCount > 0;
  const microLoaderLabel =
    globalActivity.activeCount > 0
      ? globalActivity.latestLabel
      : isHydratingDb
      ? '正在初始化创作数据库...'
      : '正在切换工作台视图...';

  const showSkeleton = isHydratingDb || isSwitchingView;

  return (
    <div
      onContextMenu={handleWorkspaceContextMenu}
      className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col relative"
    >
      {/* Global Micro Loading Indicator (2px Top Sweep + Floating Corner Status Pill) */}
      <GlobalMicroLoader isActive={isMicroLoaderActive} label={microLoaderLabel} />

      {/* Subtle Ambient Top Lighting Aura (Shifts between Literary Ink & Cinematic Storyboard) */}
      <div
        aria-hidden="true"
        className={`ambient-aura-layer ${
          activeTrack === 'drama' ? 'ambient-aura-drama' : 'ambient-aura-novel'
        }`}
      />

      <TopNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeTrack={activeTrack}
        uiSettings={uiSettings}
        setUiSettings={setUiSettings}
        onQuickCreatePrimary={
          activeTrack === 'drama' ? handleCreateBlankDrama : handleQuickCreateBook
        }
        currentWorkTitle={
          activeTrack === 'drama' ? currentDramaProject?.title : currentBook?.title
        }
      />

      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 md:pb-12">
        <CreativeRealmSwitcher
          activeTrack={activeTrack}
          onSwitchTrack={handleSwitchCreativeTrack}
          novelCount={books.length}
          dramaCount={dramaProjects.length}
        />

        <AnimatePresence mode="wait">
          {showSkeleton ? (
            <PageTransition key={`skeleton-${activeTab}`} viewKey={`skeleton-${activeTab}`}>
              <WorkspaceSkeleton activeTab={activeTab} />
            </PageTransition>
          ) : (
            <PageTransition key={`tab-${activeTab}`} viewKey={activeTab}>
              {activeTab === 'novels' && (
                <LibraryView
                  books={books}
                  onOpenBookDetail={handleOpenBookDetail}
                  onContinueWriting={handleContinueWritingBook}
                  onEditBookSetup={handleEditBookSetup}
                  onGoToSetup={handleQuickCreateBook}
                  onOpenDownloadBook={handleOpenDownloadById}
                  onRequestDeleteBook={requestDeleteBook}
                />
              )}

              {activeTab === 'setup' && (
                <SetupView
                  currentBook={currentBook}
                  configs={configs}
                  uiSettings={uiSettings}
                  xpPreferences={xpPreferences}
                  globalSkills={globalSkills}
                  onRefreshGlobalSkills={refreshGlobalSkills}
                  onStartWritingFirstChapter={handleStartWritingFirstChapter}
                  onUpdateBookSettings={handleUpdateBookSettings}
                />
              )}

              {activeTab === 'writer' && (
                <WriterView
                  currentBook={currentBook}
                  currentChapterIndex={currentChapterIndex}
                  setCurrentChapterIndex={setCurrentChapterIndex}
                  configs={configs}
                  uiSettings={uiSettings}
                  xpPreferences={xpPreferences}
                  globalSkills={globalSkills}
                  onSaveBook={handleSaveBook}
                  onGoToSetup={() => setActiveTab('setup')}
                  onOpenSummaryViewModal={(sum) => {
                    setSummaryViewTarget(sum);
                    setIsSummaryViewOpen(true);
                  }}
                />
              )}

              {activeTab === 'inspiration' && (
                <InspirationHubView
                  books={books}
                  configs={configs}
                  uiSettings={uiSettings}
                  xpPreferences={xpPreferences}
                  globalSkills={globalSkills}
                  onSelectInspirationForCreation={handleSelectInspirationForCreation}
                  onOpenBookFromInspiration={(bookId) => {
                    const b = books.find((item) => item.id === bookId);
                    if (b) handleContinueWritingBook(b);
                  }}
                />
              )}

              {activeTab === 'drama-library' && (
                <DramaLibraryView
                  projects={dramaProjects}
                  onCreateNewDrama={handleCreateBlankDrama}
                  onGoToRadar={() => setActiveTab('drama-radar')}
                  onEditDramaSetup={handleEditDramaSetup}
                  onOpenDramaWriter={(proj, epIdx) => handleOpenDramaWriter(proj, epIdx)}
                  onDeleteDrama={(proj) => setPendingDeleteDrama(proj)}
                />
              )}

              {activeTab === 'drama-radar' && (
                <DramaRadarView
                  configs={configs}
                  uiSettings={uiSettings}
                  onAdoptPitchAsProject={handleAdoptPitchAsDrama}
                />
              )}

              {activeTab === 'drama-setup' && (
                <DramaSetupView
                  currentProject={currentDramaProject}
                  configs={configs}
                  uiSettings={uiSettings}
                  onSaveProject={handleSaveDramaProject}
                  onStartEpisodeInWriter={(proj, epIdx, beat) =>
                    handleOpenDramaWriter(proj, epIdx, beat)
                  }
                />
              )}

              {activeTab === 'drama-writer' && (
                <DramaWriterView
                  currentProject={currentDramaProject}
                  targetEpisodeIndex={currentDramaEpisodeIndex}
                  setTargetEpisodeIndex={setCurrentDramaEpisodeIndex}
                  presetDirectorBeat={presetDramaBeat}
                  clearPresetDirectorBeat={() => setPresetDramaBeat('')}
                  books={books}
                  configs={configs}
                  uiSettings={uiSettings}
                  onSaveProject={handleSaveDramaProject}
                  onGoToDramaSetup={() => setActiveTab('drama-setup')}
                />
              )}

              {activeTab === 'config' && (
                <ConfigView
                  configs={configs}
                  setConfigs={setConfigs}
                  uiSettings={uiSettings}
                  setUiSettings={setUiSettings}
                  xpPreferences={xpPreferences}
                  setXpPreferences={setXpPreferences}
                  globalSkills={globalSkills}
                  onRefreshGlobalSkills={refreshGlobalSkills}
                />
              )}
            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeTrack={activeTrack}
      />
      <OfflineIndicator />

      {/* Novel Modals */}
      <BookDetailModal
        book={bookDetailTarget}
        isOpen={isBookDetailOpen}
        onClose={() => setIsBookDetailOpen(false)}
        onContinueWriting={handleContinueWritingBook}
        onOpenDownloadDialog={handleOpenDownloadById}
        onDeleteBook={requestDeleteBook}
        onReadChapter={(chapter) => {
          setReadChapterTarget(chapter);
          setIsReadChapterOpen(true);
        }}
        onOpenSummaryView={(summary) => {
          setSummaryViewTarget(summary);
          setIsSummaryViewOpen(true);
        }}
        onDeleteSummary={handleDeleteSummary}
      />

      <ReadChapterModal
        chapter={readChapterTarget}
        isOpen={isReadChapterOpen}
        onClose={() => setIsReadChapterOpen(false)}
      />

      <DownloadModal
        book={downloadBookTarget}
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      <SummaryViewModal
        summary={summaryViewTarget}
        isOpen={isSummaryViewOpen}
        onClose={() => setIsSummaryViewOpen(false)}
      />

      {/* Safe Delete Book Confirmation Modal */}
      <AnimatePresence>
        {pendingDeleteBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: SNAPPY_EASE }}
              className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-4 pb-safe"
            >
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                确认删除小说《{pendingDeleteBook.title}》？
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                删除后该书的 {pendingDeleteBook.chapters.length} 章正文与历史存档将从本机移除，此操作无法撤销。建议删除前先导出备份。
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <MotionButton
                  type="button"
                  onClick={() => setPendingDeleteBook(null)}
                  className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium cursor-pointer"
                >
                  取消
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={confirmDeleteBookExecution}
                  className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  彻底删除
                </MotionButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safe Delete Drama Project Confirmation Modal */}
      <AnimatePresence>
        {pendingDeleteDrama && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: SNAPPY_EASE }}
              className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-2xl space-y-4 pb-safe"
            >
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                确认删除漫剧项目《{pendingDeleteDrama.title}》？
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                删除后该剧目的 {pendingDeleteDrama.episodes.length} 集甲方剧本与后期分镜资产将从本机移除，此操作无法撤销。
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <MotionButton
                  type="button"
                  onClick={() => setPendingDeleteDrama(null)}
                  className="min-h-[42px] px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium cursor-pointer"
                >
                  取消
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={confirmDeleteDramaExecution}
                  className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  彻底删除
                </MotionButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ContextMenuProvider>
      <StudioWorkspace />
    </ContextMenuProvider>
  );
}
