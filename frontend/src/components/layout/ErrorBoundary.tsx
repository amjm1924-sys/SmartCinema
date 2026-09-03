import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { logger } from '@/lib/logger';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    logger.error(`React Error Boundary: ${error?.message || 'Unknown render error'}`, {
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-2xl p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                أوبس! حدث خطأ غير متوقع
              </h1>
              <p className="text-muted-foreground">
                نعتذر عن هذا الخطأ. المشكلة ليست منك، بل من عندنا.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="bg-muted p-4 rounded-lg text-left overflow-auto max-h-40">
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button 
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                تحديث الصفحة
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/'}
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                العودة للرئيسية
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
