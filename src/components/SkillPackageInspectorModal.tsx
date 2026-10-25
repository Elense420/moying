import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  FolderTree,
  Terminal,
  Search,
  Check,
  Copy,
  Download,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { NovelSkill, SkillReferenceDoc, SkillScope } from '../types';
import { exportSingleSkillPackage } from '../services/skillPackageParser';
import { serializeSkillToMarkdown } from '../services/promptEngine';
import { ModalPortal } from './MotionPrimitives';

interface SkillPackageInspectorModalProps {
  skill: NovelSkill | null;
  onClose: () => void;
  onUpdateSkill: (updatedSkill: NovelSkill) => Promise<void>;
}

const SCOPE_LABELS: Record<SkillScope, string> = {
  outline: '大纲构思',
  chapter: '章节正文',
  reroll: '走向重掷',
  polish: '段落精修',
};

export const SkillPackageInspectorModal: React.FC<SkillPackageInspectorModalProps> = ({
  skill,
  onClose,
  onUpdateSkill,
}) => {
  const [activeTab, setActiveTab] = useState<'entry' | 'references' | 'scripts'>('entry');
  const [showRawMd, setShowRawMd] = useState(false);
  const [refSearch, setRefSearch] = useState('');
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);
  const [savingFlag, setSavingFlag] = useState(false);

  if (!skill) return null;

  const references = skill.references || [];
  const scriptsMeta = skill.scriptsMeta || [];
  const qualityTargets = skill.qualityTargets || [];

  const filteredRefs = useMemo(() => {
    const q = refSearch.trim().toLowerCase();
    if (!q) return references;
    return references.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        (r.routingTask || '').toLowerCase().includes(q) ||
        (r.keywords || []).some((k) => k.toLowerCase().includes(q))
    );
  }, [references, refSearch]);

  const activeRef: SkillReferenceDoc | null =
    filteredRefs.find((r) => r.id === selectedRefId) || filteredRefs[0] || null;

  const handleToggleRefAlwaysLoad = async (refDoc: SkillReferenceDoc) => {
    setSavingFlag(true);
    try {
      const nextRefs = references.map((r) =>
        r.id === refDoc.id ? { ...r, alwaysLoad: !r.alwaysLoad } : r
      );
      await onUpdateSkill({
        ...skill,
        references: nextRefs,
      });
    } finally {
      setSavingFlag(false);
    }
  };

  const handleUpdateRefKeywords = async (refDoc: SkillReferenceDoc, rawKeywords: string) => {
    const parsed = rawKeywords
      .split(/[,，、/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const nextRefs = references.map((r) =>
      r.id === refDoc.id ? { ...r, keywords: parsed } : r
    );
    await onUpdateSkill({
      ...skill,
      references: nextRefs,
    });
  };

  const handleExportPackage = async () => {
    const { blob, filename } = await exportSingleSkillPackage(skill, serializeSkillToMarkdown);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyContent = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedFlag(key);
    setTimeout(() => setCopiedFlag(null), 1500);
  };

  return (
    <ModalPortal onEscape={onClose}>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4 pt-safe"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-4xl max-h-[88dvh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden pb-safe"
        >
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-secondary)]">
                {skill.packageType === 'zip-package' ? '多文件 SKILL 工程压缩包' : '单文件 SKILL.md 规范'}
              </span>
              {skill.version && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">v{skill.version}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {skill.ruleTier === 'advisory' ? '质量建议与观察目标 (Advisory)' : '硬性结构契约 (Contract)'}
              </span>
              {skill.slug && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{skill.slug}</span>
                </>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate">
              {skill.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportPackage}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{skill.packageType === 'zip-package' ? '导出 .skill.zip' : '导出 SKILL.md'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-muted)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-5 sm:px-6 pt-2.5 pb-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 bg-[var(--bg-canvas)]/50">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'entry'
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>主入口契约与质量基准</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('references')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'references'
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span className="tabular-nums">渐进式参考文档路由 ({references.length})</span>
          </button>

          {scriptsMeta.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('scripts')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'scripts'
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="tabular-nums">工程脚本索引 ({scriptsMeta.length})</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {activeTab === 'entry' && (
            <div className="space-y-5">
              {/* Metadata summary */}
              <div className="p-4 rounded-xl studio-muted space-y-2 leading-relaxed">
                <p className="text-[var(--text-primary)] font-medium">{skill.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                  <span>
                    生效环节：
                    {(skill.scopes && skill.scopes.length > 0 ? skill.scopes : ['chapter'])
                      .map((s) => SCOPE_LABELS[s])
                      .join(' / ')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    唤醒模式：
                    {skill.triggerMode === 'keyword'
                      ? `按需关键词触发 (${(skill.keywords || []).join('、') || '未设词'})`
                      : '在所选环节常驻挂载'}
                  </span>
                  {references.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        参考库遵循「按需渐进披露」：每次最多动态挂载 3 份匹配题材/情境的子文档，防止撑爆上下文
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Quality Targets Table if extracted */}
              {qualityTargets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>量化质量目标基准（非硬卡拦截，供创作校准）</span>
                  </h4>
                  <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)]">
                    {qualityTargets.map((qt, i) => (
                      <div
                        key={i}
                        className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-[var(--bg-surface)]"
                      >
                        <span className="font-semibold text-[var(--text-primary)]">{qt.metric}</span>
                        <div className="flex items-center gap-3 text-[var(--text-secondary)] tabular-nums">
                          <span className="font-mono font-semibold text-[var(--accent)]">{qt.target}</span>
                          {qt.note && <span className="text-[var(--text-muted)]">({qt.note})</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Distilled Prompt vs Raw SKILL.md */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-[var(--text-primary)]">
                    {showRawMd
                      ? '原始 SKILL.md 全文（UTF-8 / GB18030 无损解码）'
                      : '已提纯的可执行核心规则（自动剥离 CLI 命令行与版本日志噪音）'}
                  </h4>
                  <div className="flex items-center gap-2">
                    {skill.rawSkillMd && (
                      <button
                        type="button"
                        onClick={() => setShowRawMd(!showRawMd)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[11px] font-medium hover:bg-[var(--bg-muted)] cursor-pointer"
                      >
                        {showRawMd ? '查看提纯执行指令' : '查看原始 SKILL.md'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        copyContent(
                          'entry-md',
                          showRawMd ? skill.rawSkillMd || skill.promptInstruction : skill.promptInstruction
                        )
                      }
                      className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[11px] font-medium flex items-center gap-1 hover:bg-[var(--bg-muted)] cursor-pointer"
                    >
                      {copiedFlag === 'entry-md' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>复制</span>
                    </button>
                  </div>
                </div>

                <pre className="p-4 rounded-xl studio-muted font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                  {showRawMd ? skill.rawSkillMd || skill.promptInstruction : skill.promptInstruction}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'references' && (
            <div className="space-y-4">
              {references.length === 0 ? (
                <div className="p-8 text-center studio-muted rounded-xl space-y-2">
                  <BookOpen className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
                  <p className="font-semibold text-[var(--text-primary)]">当前技能为单文件 SKILL.md</p>
                  <p className="text-[var(--text-muted)]">
                    若导入包含 <code className="font-mono">references/</code> 目录的标准 <code className="font-mono">.zip</code> 技能压缩包，系统将在此展示所有参考文档及渐进式按需路由规则。
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      遵循标准 SKILL 架构「渐进式披露（Progressive Disclosure）」原则：系统不会将全部{' '}
                      <span className="font-semibold tabular-nums">{references.length}</span> 份参考文档一次性硬塞入上下文，而是根据作品题材、章节大纲关键词或「核心常驻」开关智能按需挂载。
                    </p>
                    <div className="relative sm:w-64 shrink-0">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        type="text"
                        value={refSearch}
                        onChange={(e) => setRefSearch(e.target.value)}
                        placeholder="搜索题材卡、方法卡或触发词..."
                        className="studio-input w-full pl-8 pr-3 py-1.5 text-xs min-h-[36px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* Left list */}
                    <div className="lg:col-span-5 border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] max-h-[420px] overflow-y-auto">
                      {filteredRefs.map((ref) => {
                        const isSelected = activeRef?.id === ref.id;
                        return (
                          <button
                            key={ref.id}
                            type="button"
                            onClick={() => setSelectedRefId(ref.id)}
                            className={`w-full text-left p-3 space-y-1 transition-colors cursor-pointer ${
                              isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-muted)]/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[var(--text-primary)] truncate">
                                {ref.title}
                              </span>
                              <span
                                className={`text-[10px] shrink-0 font-medium ${
                                  ref.alwaysLoad ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'
                                }`}
                              >
                                {ref.alwaysLoad ? '核心常驻' : '按需路由'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">{ref.path}</p>
                            {ref.routingTask && (
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">
                                用途：{ref.routingTask}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right detail viewer */}
                    <div className="lg:col-span-7 border border-[var(--border-subtle)] rounded-xl p-4 space-y-3 bg-[var(--bg-canvas)]/40">
                      {activeRef ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                            <div className="min-w-0">
                              <h5 className="font-bold text-sm text-[var(--text-primary)]">{activeRef.title}</h5>
                              <p className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                                {activeRef.path} · {(activeRef.sizeBytes / 1024).toFixed(1)} KB
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={savingFlag}
                                onClick={() => handleToggleRefAlwaysLoad(activeRef)}
                                className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                                  activeRef.alwaysLoad
                                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]'
                                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                                }`}
                              >
                                {activeRef.alwaysLoad ? '✓ 已设为常驻契约' : '设为常驻注入'}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyContent(activeRef.id, activeRef.content)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-xs flex items-center gap-1 hover:bg-[var(--bg-muted)] cursor-pointer"
                              >
                                {copiedFlag === activeRef.id ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>复制</span>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[11px] text-[var(--text-muted)]">
                              自动路由唤醒词（当作品题材、大纲或本章细纲包含任一词时自动注入此文档）：
                            </label>
                            <input
                              type="text"
                              defaultValue={(activeRef.keywords || []).join(', ')}
                              key={activeRef.id}
                              onBlur={(e) => handleUpdateRefKeywords(activeRef, e.target.value)}
                              placeholder="例如：玄幻, 仙侠, 谈判, 对峙, 群像..."
                              className="studio-input w-full px-3 py-1.5 text-xs"
                            />
                          </div>

                          <pre className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-[290px] overflow-y-auto">
                            {activeRef.content}
                          </pre>
                        </>
                      ) : (
                        <p className="text-[var(--text-muted)] py-8 text-center">未找到匹配的子文档</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'scripts' && (
            <div className="space-y-3">
              <p className="text-[var(--text-secondary)] leading-relaxed">
                以下为该 SKILL 工程包内随附的本地 CLI 脚本索引（如语料蒸馏、质量巡检脚本）。在浏览器端纯在线执笔时，系统已将核心写作契约与参考文档路由化接管，无需手动运行命令行。
              </p>
              <div className="border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)]">
                {scriptsMeta.map((sc) => (
                  <div
                    key={sc.path}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <p className="font-mono font-semibold text-[var(--text-primary)]">{sc.name}</p>
                      <p className="text-[var(--text-secondary)]">{sc.purpose}</p>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                      {(sc.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </ModalPortal>
  );
};
