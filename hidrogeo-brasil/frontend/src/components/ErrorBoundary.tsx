import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("HidroGeo:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 bg-[#0a0e17] p-6 text-center text-slate-200">
          <p className="text-lg font-semibold text-red-400">Erro ao carregar o mapa</p>
          <p className="max-w-lg text-sm text-slate-400">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
