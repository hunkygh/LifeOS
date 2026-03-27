import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[LifeOS] render crash", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-white px-6 py-10 text-[rgb(32,32,32)]">
          <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-red-50 px-6 py-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-700">
              LifeOS Render Error
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-red-950">
              The app crashed during startup.
            </h1>
            <p className="mt-3 text-sm leading-6 text-red-900">
              This deployment loaded, but a runtime error stopped the interface from rendering.
            </p>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-red-200 bg-white px-4 py-3 text-xs leading-5 text-red-950">
              {this.state.error.message || String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
