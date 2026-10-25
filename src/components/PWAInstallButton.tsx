import React, { useState } from 'react';
import { Download, Smartphone, X, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          compact
            ? 'min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[44px] px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-2 whitespace-nowrap shrink-0'
        }
        title="安装为桌面/手机独立应用"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? '安装应用' : '安装到手机/桌面 (离线可用)'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors whitespace-nowrap shrink-0'
              : 'min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs font-medium hover:bg-[var(--bg-muted)] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{compact ? '装至桌面' : '添加到 iPhone 主屏幕'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
            <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  添加到 iPhone / iPad 主屏幕
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-[var(--text-secondary)] space-y-2.5 list-decimal list-inside leading-relaxed">
                <li>点击 Safari 底部工具栏的<strong>「分享」</strong>图标（向上箭头方框）。</li>
                <li>向下滑动菜单，点选<strong>「添加到主屏幕」</strong>。</li>
                <li>从桌面打开即可获得无地址栏的全屏原生阅读与创作体验，本地书库断网亦可随时查阅。</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-[var(--accent)] text-white text-sm font-medium"
              >
                知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>离线模式 · 本地书库与草稿正常读写</span>
    </div>
  );
};
