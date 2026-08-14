import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
          <div className="panel p-6 max-w-lg w-full space-y-4 border-red-500/40">
            <h1 className="font-display font-bold text-xl text-red-400">Ops! Algo deu errado.</h1>
            <p className="text-sm text-gray-300">
              A página encontrou um erro inesperado. Isso não deveria acontecer — recarregue para continuar.
            </p>
            <pre className="text-xs text-red-300 bg-dark-900 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="btn-primary w-full"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}