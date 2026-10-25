import React, { useState, useMemo } from 'react';
import {
  Clapperboard,
  Plus,
  Search,
  Sparkles,
  Flame,
  Film,
  Download,
  Trash2,
  Sliders,
  ArrowRight,
  Loader2,
  ShieldCheck,
  FileSpreadsheet,
  Compass,
  Copy,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  DramaProject,
  HOT_DRAMA_TRACKS,
  DramaTrackPreset,
  ApiConfig,
  UiSettings,
} from '../types';
import { streamChatCompletion } from '../services/apiClient';
import {
  buildDramaPitchMessages,
  parseDramaPitchProposals,
  DramaPitchProposal,
  exportDramaEpisodeToCsv,
  exportDramaProjectToMarkdown,
} from '../services/dramaPromptEngine';
import { generateUUID } from '../utils/uuid';
import {
  StaggerCard,
  AnimatedNumber,
  ProgressRing,
  SPRING_INDICATOR,
  MotionButton,
} from './MotionPrimitives';
import { useContextMenu } from './ContextMenu';

interface DramaLibraryViewProps {
  projects: DramaProject[];
  onCreateNewDrama: () => void;
  onGoToRadar: () => void;
  onEditDramaSetup: (project: DramaProject) => void;
  onOpenDramaWriter: (project: DramaProject, episodeIdx?: number) => void;
  onDeleteDrama: (project: DramaProject) => void;
}

export const DramaLibraryView: React.FC<DramaLibraryViewProps> = ({
  projects,
  onCreateNewDrama,
  onGoToRadar,
  onEditDramaSetup,
  onOpenDramaWriter,
  onDeleteDrama,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('全部');

  const channels = ['全部', '全民脑洞', '男频爆款', '女频爆款', '悬疑惊悚'];

  const totalEpisodes = useMemo(
    () => projects.reduce((sum, p) => sum + (p.episodes?.length || 0), 0),
    [projects]
  );

  const totalShots = useMemo(
    () =>
      projects.reduce(
        (sum, p) =>
          sum +
          (p.episodes || []).reduce((epSum, ep) => epSum + (ep.shots?.length || 0), 0),
        0
      ),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    return projects
      .filter((p) => {
        const q = searchQuery.toLowerCase().trim();
        const matchQ =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.trackName.toLowerCase().includes(q) ||
          p.logline.toLowerCase().includes(q);
        const matchChannel = selectedChannel === '全部' || p.channel === selectedChannel;
        return matchQ && matchChannel;
      })
      .sort((a, b) => (b.lastModifiedAt || b.createdAt) - (a.lastModifiedAt || a.createdAt));
  }, [projects, searchQuery, selectedChannel]);

  const handleDownloadProjectMd = (project: DramaProject) => {
    const md = exportDramaProjectToMarkdown(project);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${project.title}》_AI漫剧制作圣经.md`;
    a.click();
    URL.revokeObjectURL(url);
    triggerQuickToast(`已导出《${project.title}》制作圣经`);
  };

  const handleDownloadLatestCsv = (project: DramaProject) => {
    if (!project.episodes || project.episodes.length === 0) return;
    const latestEp = [...project.episodes].sort((a, b) => b.index - a.index)[0];
    if (!latestEp.shots || latestEp.shots.length === 0) return;
    const csv = exportDramaEpisodeToCsv(project, latestEp);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `《${project.title}》_第${latestEp.index}集分镜表.csv`;
    a.click();
    URL.revokeObjectURL(url);
    triggerQuickToast(`已导出第 ${latestEp.index} 集 CSV 分镜表`);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Studio Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              XP 偏好已物理隔离 · 上游甲方标准 △ 剧本 + 下游 AI 生图分镜双层架构
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
            AI 漫剧与短剧片单库
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[var(--text-secondary)] pt-0.5">
            <span>
              立项剧目 <AnimatedNumber value={projects.length} className="font-semibold text-[var(--text-primary)]" /> 部
            </span>
            <span aria-hidden="true">·</span>
            <span>
              已出剧本 <AnimatedNumber value={totalEpisodes} className="font-semibold text-[var(--text-primary)]" /> 集
            </span>
            <span aria-hidden="true">·</span>
            <span>
              已拆解分镜 <AnimatedNumber value={totalShots} className="font-semibold text-[var(--text-primary)]" /> 镜
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <MotionButton
            type="button"
            onClick={onGoToRadar}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs sm:text-sm font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Compass className="w-4 h-4 text-[var(--accent)]" />
            <span>热门赛道选品</span>
          </MotionButton>
          <MotionButton
            type="button"
            onClick={onCreateNewDrama}
            className="btn-primary min-h-[44px] px-5 py-2.5 text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>空白立项新漫剧</span>
          </MotionButton>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 studio-muted overflow-x-auto no-scrollbar">
          {channels.map((ch) => {
            const active = selectedChannel === ch;
            return (
              <MotionButton
                key={ch}
                type="button"
                onClick={() => setSelectedChannel(ch)}
                className={`relative min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="drama-channel-filter-pill"
                    transition={SPRING_INDICATOR}
                    className="absolute inset-0 bg-[var(--bg-surface)] rounded-lg shadow-2xs"
                  />
                )}
                <span className="relative z-10">{ch}</span>
              </MotionButton>
            );
          })}
        </div>

        <div className="relative sm:w-68">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索剧名、赛道或卖点梗概..."
            className="studio-input w-full min-h-[42px] pl-9 pr-3.5 py-2 text-xs sm:text-sm"
          />
        </div>
      </section>

      {/* Drama Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="studio-card p-10 sm:p-14 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl studio-muted flex items-center justify-center text-[var(--text-muted)]">
            <Clapperboard className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">片单暂无匹配漫剧项目</h3>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-md mx-auto">
              您可以先去「热门赛道雷达」用 AI 孵化爆款三连企划案，或直接立项创建一部全新漫剧剧本。
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-1">
            <MotionButton
              type="button"
              onClick={onGoToRadar}
              className="btn-primary min-h-[44px] px-5 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <Flame className="w-4 h-4" />
              <span>前往热门赛道孵化企划</span>
            </MotionButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {filteredProjects.map((project, idx) => {
            const epCount = project.episodes?.length || 0;
            const shotCount = (project.episodes || []).reduce(
              (acc, ep) => acc + (ep.shots?.length || 0),
              0
            );
            const charCount = project.characterAssets?.length || 0;

            return (
              <StaggerCard
                key={project.id}
                index={idx}
                onContextMenu={(e) =>
                  openContextMenu(
                    e,
                    [
                      {
                        id: 'd-open-writer',
                        label: epCount > 0 ? '进入剧本与分镜工作台' : '撰写第 1 集甲方标准剧本',
                        icon: <Film className="w-3.5 h-3.5" />,
                        onSelect: () => onOpenDramaWriter(project),
                      },
                      {
                        id: 'd-setup',
                        label: '编辑立项规格与角色立绘词',
                        icon: <Sliders className="w-3.5 h-3.5" />,
                        onSelect: () => onEditDramaSetup(project),
                      },
                      {
                        id: 'd-copy-hook',
                        label: '复制卖点与前3秒生死钩子',
                        icon: <Copy className="w-3.5 h-3.5" />,
                        dividerBefore: true,
                        onSelect: () => {
                          navigator.clipboard.writeText(
                            `《${project.title}》\n核心卖点：${project.logline}\n黄金前3秒：${project.golden3SecHook}`
                          );
                          triggerQuickToast('已复制漫剧卖点与前3秒钩子');
                        },
                      },
                      {
                        id: 'd-dl-md',
                        label: '导出全剧制作圣经 (.md)',
                        icon: <Download className="w-3.5 h-3.5" />,
                        onSelect: () => handleDownloadProjectMd(project),
                      },
                      {
                        id: 'd-dl-csv',
                        label: '导出最新集 CSV 分镜表',
                        icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
                        disabled: shotCount === 0,
                        onSelect: () => handleDownloadLatestCsv(project),
                      },
                      {
                        id: 'd-delete',
                        label: '删除该漫剧项目...',
                        icon: <Trash2 className="w-3.5 h-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        onSelect: () => onDeleteDrama(project),
                      },
                    ],
                    `《${project.title}》`
                  )
                }
              >
                <article className="studio-card studio-card-hover p-5 sm:p-6 h-full flex flex-col justify-between gap-4 group">
                  <div className="space-y-3">
                    {/* Top Metadata Row + Progress Ring */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-secondary)]">
                            {project.channel} · {project.trackName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{project.visualStyle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{project.aspectRatio.split(' ')[0]}</span>
                        </div>
                        <h2
                          onClick={() => onOpenDramaWriter(project)}
                          className="text-lg sm:text-xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1 cursor-pointer font-editorial-serif"
                        >
                          《{project.title}》
                        </h2>
                      </div>

                      <ProgressRing current={epCount} total={project.totalPlannedEpisodes || 40} size={38} />
                    </div>

                    {/* Commercial Logline */}
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {project.logline || project.synopsis || '暂无一句话商业卖点，请进入立项资产页完善。'}
                    </p>

                    {/* Golden 3s Hook Preview Box */}
                    {project.golden3SecHook && (
                      <div className="p-3 rounded-xl studio-muted text-xs space-y-1">
                        <span className="font-semibold text-[var(--text-primary)]">⚡ 黄金前3秒钩子：</span>
                        <p className="text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {project.golden3SecHook}
                        </p>
                      </div>
                    )}

                    {/* Production Telemetry Metrics (Tabular Numerals) */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] tabular-nums pt-0.5">
                      <span>已出 {epCount}/{project.totalPlannedEpisodes} 集</span>
                      <span aria-hidden="true">·</span>
                      <span>已拆 {shotCount} 镜</span>
                      <span aria-hidden="true">·</span>
                      <span>立绘锁死 {charCount} 角色</span>
                      <span aria-hidden="true">·</span>
                      <span>第 {project.paywallEpisodeIndex} 集付费卡点</span>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <MotionButton
                        type="button"
                        onClick={() => onEditDramaSetup(project)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>立项与立绘词</span>
                      </MotionButton>

                      <MotionButton
                        type="button"
                        onClick={() => handleDownloadProjectMd(project)}
                        title="导出全剧制作圣经 (.md)"
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">圣经</span>
                      </MotionButton>

                      {shotCount > 0 && (
                        <MotionButton
                          type="button"
                          onClick={() => handleDownloadLatestCsv(project)}
                          title="导出最新集 CSV 分镜表（对接剪映/生图工具）"
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">CSV分镜</span>
                        </MotionButton>
                      )}

                      <MotionButton
                        type="button"
                        onClick={() => onDeleteDrama(project)}
                        title="删除此漫剧项目"
                        className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </MotionButton>
                    </div>

                    <MotionButton
                      type="button"
                      onClick={() => onOpenDramaWriter(project)}
                      className="btn-primary min-h-[40px] px-4 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>{epCount > 0 ? '进入剧本台' : '写第1集'}</span>
                    </MotionButton>
                  </div>
                </article>
              </StaggerCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 热门赛道雷达与爆款企划案三连孵化器 (DramaRadarView)
// ============================================================================

interface DramaRadarViewProps {
  configs: ApiConfig[];
  uiSettings: UiSettings;
  onAdoptPitchAsProject: (newProject: DramaProject) => void;
}

export const DramaRadarView: React.FC<DramaRadarViewProps> = ({
  configs,
  uiSettings,
  onAdoptPitchAsProject,
}) => {
  const { openContextMenu, triggerQuickToast } = useContextMenu();
  const [selectedTrack, setSelectedTrack] = useState<DramaTrackPreset>(HOT_DRAMA_TRACKS[0]);
  const [customSpark, setCustomSpark] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamPreview, setStreamPreview] = useState('');
  const [proposals, setProposals] = useState<DramaPitchProposal[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const getActiveApiConfig = () => {
    const cfgId = uiSettings.inspirationApiCfgId || uiSettings.writerApiCfgId;
    const cfg = configs.find((c) => c.id === cfgId) || configs[0];
    const model =
      uiSettings.inspirationApiModel ||
      uiSettings.writerApiModel ||
      cfg?.modelsCache?.[0]?.id ||
      'gemini-3.6-flash';
    return { cfg, model };
  };

  const handleGeneratePitches = async (overrideTrack?: DramaTrackPreset) => {
    const targetTrack = overrideTrack || selectedTrack;
    if (overrideTrack) setSelectedTrack(overrideTrack);

    const { cfg, model } = getActiveApiConfig();
    if (!cfg) {
      setErrorMsg('请先在「引擎与技能」中配置可用模型线路');
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');
    setStreamPreview('');
    setProposals([]);

    try {
      const messages = buildDramaPitchMessages(targetTrack, customSpark);
      let fullRaw = '';
      const res = await streamChatCompletion({
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model,
        messages,
        temperature: 0.88,
        onChunk: (chunk) => {
          fullRaw += chunk;
          setStreamPreview(fullRaw);
        },
      });

      const finalRaw = res.content || fullRaw;
      const parsed = parseDramaPitchProposals(finalRaw);
      if (parsed.length === 0) {
        setErrorMsg('模型返回格式未能完全解析为3套卡片，请点击重新孵化或切换 DeepSeek-V3 模型重试。');
      } else {
        setProposals(parsed);
        triggerQuickToast(`已孵化 ${parsed.length} 套爆款漫剧企划案`);
      }
    } catch (err: any) {
      setErrorMsg(`生成企划失败：${err.message || '网络请求异常'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateFromProposal = (pitch: DramaPitchProposal) => {
    const now = Date.now();
    const newProject: DramaProject = {
      id: generateUUID(),
      title: pitch.title,
      createdAt: now,
      lastModifiedAt: now,
      trackId: selectedTrack.id,
      trackName: selectedTrack.name,
      channel: selectedTrack.channel,
      visualStyle: selectedTrack.visualStyleRecommend,
      aspectRatio: '9:16 竖屏短剧',
      preferredScriptFormat: 'triangle_standard',
      totalPlannedEpisodes: 40,
      paywallEpisodeIndex: pitch.paywallEpisodeIndex || 10,
      logline: pitch.logline,
      targetAudience: pitch.targetAudience || selectedTrack.targetAudience,
      golden3SecHook: pitch.golden3SecHook,
      synopsis: pitch.synopsis,
      characterAssets: [],
      sceneAnchors: [],
      episodePlan: [],
      episodes: [],
    };
    onAdoptPitchAsProject(newProject);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <section className="pb-5 border-b border-[var(--border-subtle)] space-y-1.5">
        <p className="text-xs text-[var(--text-muted)]">
          大众商业趋势驱动 · 黄金前3秒留存模型 · 赛道卡片支持右键一键孵化企划
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-editorial-serif">
          AI 漫剧热门赛道雷达与选题孵化
        </h1>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-3xl leading-relaxed">
          不同于个人自由小说创作，商业漫剧讲究高完播率与情绪最大公约数。点选下方当红赛道即可查看爆款节拍拆解，并调用 AI 一次性孵化 3 套商业立项方案。
        </p>
      </section>

      {/* 6 Viral Track Selector Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {HOT_DRAMA_TRACKS.map((track, idx) => {
          const isSelected = selectedTrack.id === track.id;
          return (
            <StaggerCard
              key={track.id}
              index={idx}
              onContextMenu={(e) =>
                openContextMenu(
                  e,
                  [
                    {
                      id: 'tr-select',
                      label: `锁定「${track.name}」赛道`,
                      icon: <Compass className="w-3.5 h-3.5" />,
                      onSelect: () => setSelectedTrack(track),
                    },
                    {
                      id: 'tr-gen',
                      label: '基于此赛道立即孵化 3 套企划案',
                      icon: <Sparkles className="w-3.5 h-3.5" />,
                      disabled: isGenerating,
                      onSelect: () => handleGeneratePitches(track),
                    },
                    {
                      id: 'tr-copy',
                      label: '复制该赛道爆款前3秒公式',
                      icon: <Copy className="w-3.5 h-3.5" />,
                      dividerBefore: true,
                      onSelect: () => {
                        navigator.clipboard.writeText(
                          `【${track.name}】\n黄金前3秒：${track.golden3SecFormula}\n单集节奏：${track.pacingStructure}`
                        );
                        triggerQuickToast(`已复制「${track.name}」赛道公式`);
                      },
                    },
                  ],
                  track.name
                )
              }
            >
              <button
                type="button"
                onClick={() => setSelectedTrack(track)}
                className={`w-full h-full text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/45'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-secondary)]">{track.channel}</span>
                    <span className="text-[11px] font-medium text-[var(--accent)]">{track.heatLabel}</span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">{track.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    爽点内核：{track.coreEmotion}
                  </p>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]/70 flex items-center justify-between">
                  <span>推荐画风：{track.visualStyleRecommend}</span>
                  {isSelected && <span className="font-semibold text-[var(--text-primary)]">当前锁定 ✓</span>}
                </div>
              </button>
            </StaggerCard>
          );
        })}
      </section>

      {/* Active Track Formula Breakdown + AI Pitch Incubator */}
      <section className="studio-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <span className="text-xs text-[var(--text-muted)]">当前拆解赛道：{selectedTrack.channel}</span>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
              「{selectedTrack.name}」工业化爆款公式
            </h2>
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            推荐视觉：{selectedTrack.visualStyleRecommend} · 9:16 竖屏
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
          <div className="p-4 studio-muted space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">⚡ 黄金前 3 秒生死线</h4>
            <p className="text-[var(--text-secondary)]">{selectedTrack.golden3SecFormula}</p>
          </div>
          <div className="p-4 studio-muted space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">🎬 单集 90 秒爽点闭环</h4>
            <p className="text-[var(--text-secondary)]">{selectedTrack.pacingStructure}</p>
          </div>
          <div className="p-4 studio-muted space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">💎 付费卡点集策略（第9-12集）</h4>
            <p className="text-[var(--text-secondary)]">{selectedTrack.paywallHookStrategy}</p>
          </div>
          <div className="p-4 studio-muted space-y-1.5">
            <h4 className="font-bold text-[var(--text-primary)]">🚫 商业漫剧避坑红线</h4>
            <p className="text-[var(--text-secondary)]">{selectedTrack.avoidTaboos}</p>
          </div>
        </div>

        {/* Custom Micro-Twist Input & Generate Trigger */}
        <div className="pt-2 space-y-3">
          <label className="block text-xs font-semibold text-[var(--text-primary)]">
            微创新脑洞注入（选填，留空则由 AI 直接按当季最热风向生成 3 套企划）
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={customSpark}
              disabled={isGenerating}
              onChange={(e) => setCustomSpark(e.target.value)}
              placeholder="例如：主角的金手指是能听见末世怪物的心声 / 女主重生后直接把渣男上交国家科研所..."
              className="studio-input flex-1 min-h-[44px] px-4 py-2.5 text-xs sm:text-sm"
            />
            <MotionButton
              type="button"
              disabled={isGenerating}
              onClick={() => handleGeneratePitches()}
              className="btn-primary min-h-[44px] px-6 py-2.5 text-xs sm:text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在推演 3 套商业企划...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI 孵化 3 套爆款企划案</span>
                </>
              )}
            </MotionButton>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 dark:text-rose-400 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Live Stream Preview while generating */}
        {isGenerating && streamPreview && (
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2">
            <div className="h-1 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
              <div className="h-full w-1/2 bg-[var(--accent)] rounded-full animate-shimmer-sweep" />
            </div>
            <p className="text-xs font-mono text-[var(--text-muted)] line-clamp-4 whitespace-pre-wrap">
              {streamPreview}
            </p>
          </div>
        )}

        {/* 3 Generated Commercial Proposals */}
        {proposals.length > 0 && (
          <div className="pt-3 space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              已为您生成 {proposals.length} 套「{selectedTrack.name}」商业立项企划：
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {proposals.map((prop, index) => (
                <StaggerCard
                  key={index}
                  index={index}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      [
                        {
                          id: 'prop-adopt',
                          label: '采纳立项并提取角色立绘词',
                          icon: <ArrowRight className="w-3.5 h-3.5" />,
                          onSelect: () => handleCreateFromProposal(prop),
                        },
                        {
                          id: 'prop-copy',
                          label: '复制完整企划案文本',
                          icon: <Copy className="w-3.5 h-3.5" />,
                          onSelect: () => {
                            navigator.clipboard.writeText(
                              `《${prop.title}》\n卖点：${prop.logline}\n前3秒钩子：${prop.golden3SecHook}\n商业大纲：\n${prop.synopsis}`
                            );
                            triggerQuickToast(`已复制企划案《${prop.title}》`);
                          },
                        },
                      ],
                      `企划方案 0${index + 1} · 《${prop.title}》`
                    )
                  }
                >
                  <div className="studio-card studio-card-hover p-5 h-full flex flex-col justify-between gap-4">
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between text-[var(--text-muted)]">
                        <span>方案 0{index + 1}</span>
                        <span>第 {prop.paywallEpisodeIndex} 集付费卡点</span>
                      </div>
                      <h4 className="text-base font-bold text-[var(--text-primary)] font-editorial-serif">
                        《{prop.title}》
                      </h4>
                      <p className="text-[var(--text-secondary)] font-medium leading-relaxed">
                        {prop.logline}
                      </p>
                      <div className="p-3 studio-muted space-y-1">
                        <span className="font-semibold text-[var(--text-primary)]">前3秒钩子：</span>
                        <p className="text-[var(--text-secondary)] leading-relaxed">{prop.golden3SecHook}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="font-semibold text-[var(--text-primary)]">三阶段商业大纲：</span>
                        <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-line line-clamp-6">
                          {prop.synopsis}
                        </p>
                      </div>
                    </div>

                    <MotionButton
                      type="button"
                      onClick={() => handleCreateFromProposal(prop)}
                      className="btn-primary w-full min-h-[42px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>采纳立项并提取角色立绘词</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </MotionButton>
                  </div>
                </StaggerCard>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
