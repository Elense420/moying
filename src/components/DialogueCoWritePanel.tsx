import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Play,
  Send,
  Trash2,
} from 'lucide-react';
import { DialogueCoWriteMessage } from '../types';

interface DialogueCoWritePanelProps {
  messages: DialogueCoWriteMessage[];
  nextChapterNum: number;
  isSending: boolean;
  isGenerating: boolean;
  onSendMessage: (text: string) => void;
  onClearHistory: () => void;
  onFillDirective: (directive: string) => void;
  onGenerateWithDirective: (directive: string) => void;
  hideComposer?: boolean;
}

const STARTER_CHIPS = [
  '按当前人物状态与时间线，给我 3 个不会穿帮的下一章冲突提案',
  '我想让反派在下一章提前亮出底牌，这样合不合理？有没有逻辑漏洞？',
  '帮我把当前未收回的伏笔自然穿插进下一章对手戏里',
];

export const DialogueCoWritePanel: React.FC<DialogueCoWritePanelProps> = ({
  messages,
  nextChapterNum,
  isSending,
  isGenerating,
  onSendMessage,
  onClearHistory,
  onFillDirective,
  onGenerateWithDirective,
  hideComposer = false,
}) => {
  const endRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-3 text-xs">
      {/* Banner explaining anti-hallucination verification */}
      <div className="p-2.5 rounded-xl bg-[var(--bg-muted)]/60 border border-[var(--border-subtle)] space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>对话共创 + 设定逻辑核查</span>
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              disabled={isSending || isGenerating}
              onClick={onClearHistory}
              className="text-[11px] text-[var(--text-muted)] hover:text-rose-600 flex items-center gap-1 cursor-pointer disabled:opacity-45"
              title="清空本轮对话历史"
            >
              <Trash2 className="w-3 h-3" />
              <span>清空</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
          说出你的剧情脑洞或对话片段，AI 会先对照全书设定/年龄/时间线/位置进行防穿帮审校，再推演方案并生成可执行指令。
        </p>
      </div>

      {/* Conversation History */}
      <div className="space-y-2.5">
        {messages.length === 0 ? (
          <div className="space-y-2 py-1">
            <p className="text-[11px] font-medium text-[var(--text-muted)]">快捷启发提问：</p>
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isSending || isGenerating}
                onClick={() => onSendMessage(chip)}
                className="w-full text-left p-2.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-muted)]/60 text-[11px] text-[var(--text-secondary)] leading-relaxed transition-colors cursor-pointer disabled:opacity-50"
              >
                “{chip}”
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[90%] p-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2"
              >
                {msg.rationalityPassed !== undefined && (
                  <div
                    className={`flex items-center gap-1.5 text-[11px] font-bold ${
                      msg.rationalityPassed
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {msg.rationalityPassed ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>逻辑与设定自洽核查通过</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>检出潜在穿帮/不合理点（已附修正建议）</span>
                      </>
                    )}
                  </div>
                )}

                <div className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>

                {(msg.directorDirective || msg.content.length > 40) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() =>
                        onFillDirective(msg.directorDirective || msg.content.slice(-360))
                      }
                      className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-45"
                    >
                      <ArrowDownToLine className="w-3 h-3" />
                      <span>填入导演指令</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() =>
                        onGenerateWithDirective(msg.directorDirective || msg.content.slice(-360))
                      }
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-45"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>立即生成第 {nextChapterNum} 章</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {isSending && (
          <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
            <span>正在对照全书设定、人物状态与时间线推演核查...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!hideComposer && (
        <DialogueComposerBar
          isSending={isSending}
          isGenerating={isGenerating}
          onSendMessage={onSendMessage}
        />
      )}
    </div>
  );
};

interface DialogueComposerBarProps {
  isSending: boolean;
  isGenerating: boolean;
  onSendMessage: (text: string) => void;
}

export const DialogueComposerBar: React.FC<DialogueComposerBarProps> = ({
  isSending,
  isGenerating,
  onSendMessage,
}) => {
  const [inputVal, setInputVal] = useState('');

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed || isSending || isGenerating) return;
    setInputVal('');
    onSendMessage(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        rows={2}
        disabled={isSending || isGenerating}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="输入你的剧情点子、想加的转折或对话思路（Enter 发送，Shift+Enter 换行）..."
        className="studio-input w-full p-2.5 text-xs leading-relaxed disabled:opacity-55"
      />
      <button
        type="submit"
        disabled={!inputVal.trim() || isSending || isGenerating}
        className="btn-primary w-full min-h-[38px] px-4 py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 cursor-pointer"
      >
        {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        <span>发送并执行合理性审校推演</span>
      </button>
    </form>
  );
};
