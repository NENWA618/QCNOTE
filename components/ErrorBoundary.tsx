import React, { ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    
    // Update state to display error UI
    this.setState({
      error,
      errorInfo,
    });

    // Log to external error tracking service (optional)
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark via-primary to-accent-pink p-4">
          <div className="bg-white p-8 rounded-lg max-w-md w-full shadow-lg">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">出错了</h1>
              <p className="text-gray-600 mb-4">
                应用程序遇到了一个意外错误。请刷新页面重试。
              </p>
              
              {process.env.NODE_ENV !== 'production' && this.state.error && (
                <div className="bg-gray-100 p-4 rounded text-left mt-4 max-h-48 overflow-auto">
                  <p className="text-xs font-mono text-red-600 mb-2">
                    <strong>错误详情：</strong>
                  </p>
                  <p className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <p className="text-xs font-mono text-gray-700 mt-2 whitespace-pre-wrap break-words">
                      {this.state.errorInfo.componentStack}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="mt-6 bg-gradient-to-r from-primary to-accent-pink text-white px-6 py-2 rounded-lg hover:shadow-lg transition-shadow"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
