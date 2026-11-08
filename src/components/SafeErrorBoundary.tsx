import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SafeErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SafeErrorBoundary caught component error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-2xl border border-rose-500/40 bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl max-w-lg mx-auto my-4 space-y-3 z-[200] relative">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{this.props.fallbackTitle || '组件加载异常，已安全隔离'}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-mono text-[11px] bg-[var(--bg-muted)] p-2 rounded-lg break-all">
            {this.state.error?.message || '组件渲染遇到未知错误，主页面已受保护未崩溃。'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-muted)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-[var(--text-primary)]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>关闭并重试</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
