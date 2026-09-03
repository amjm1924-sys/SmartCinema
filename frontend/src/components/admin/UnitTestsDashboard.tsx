import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { TerminalIcon, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api';

interface TestResult {
    name: string;
    file: string;
    outcome: 'passed' | 'failed' | 'skipped';
    duration: number;
    error: string | null;
}

interface TestReport {
    success: boolean;
    total: number;
    passed: number;
    failed: number;
    results: TestResult[];
    error?: string;
    traceback?: string;
}

export const UnitTestsDashboard = () => {
    const [report, setReport] = useState<TestReport | null>(null);

    const testMutation = useMutation({
        mutationFn: () => apiClient.runUnitTests(),
         
        onSuccess: (data: any) => setReport(data),
         
        onError: (err: any) => {
            setReport({
                success: false,
                total: 0,
                passed: 0,
                failed: 0,
                results: [],
                error: err.message
            });
        }
    });

    const isRunning = testMutation.isPending;

    return (
        <div className="glass-panel p-6 animate-in slide-in-from-bottom-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-border/50">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                            <TerminalIcon className="w-6 h-6" />
                        </div>
                        الفحص الشامل (Unit Tests)
                    </h2>
                    <p className="text-muted-foreground mt-2">
                        تشغيل اختبارات الوحدة للتأكد من سلامة جميع الوظائف البرمجية (APIs)
                    </p>
                </div>

                <Button
                    size="lg"
                    onClick={() => testMutation.mutate()}
                    disabled={isRunning}
                    className="mt-4 sm:mt-0 font-bold tracking-wide"
                >
                    {isRunning ? (
                        <>
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            جاري الفحص...
                        </>
                    ) : (
                        'تشغيل الفحص الآن'
                    )}
                </Button>
            </div>

            {/* Error State */}
            {(testMutation.isError || (report && !report.success)) && (
                <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        حدث خطأ أثناء تشغيل الاختبارات
                    </h3>
                    <p className="opacity-90">{report?.error || testMutation.error?.message}</p>
                    {report?.traceback && (
                        <pre className="mt-4 p-4 bg-black/40 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono opacity-80" dir="ltr">
                            {report.traceback}
                        </pre>
                    )}
                </div>
            )}

            {/* Results Display */}
            {report && report.success && (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground mb-1">إجمالي الاختبارات</span>
                            <span className="text-4xl font-bold">{report.total}</span>
                        </div>
                        <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-500 flex flex-col items-center justify-center">
                            <span className="text-sm font-medium mb-1">ناجح</span>
                            <span className="text-4xl font-bold flex items-center gap-2">
                                <CheckCircle2 className="w-6 h-6" />
                                {report.passed}
                            </span>
                        </div>
                        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex flex-col items-center justify-center">
                            <span className="text-sm font-medium mb-1">فاشل</span>
                            <span className="text-4xl font-bold flex items-center gap-2">
                                <XCircle className="w-6 h-6" />
                                {report.failed}
                            </span>
                        </div>
                    </div>

                    {/* Overall Progress */}
                    {report.total > 0 && (
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm font-medium">
                                <span>معدل النجاح</span>
                                <span>{Math.round((report.passed / report.total) * 100)}%</span>
                            </div>
                            <Progress
                                value={(report.passed / report.total) * 100}
                                className="h-3"
                            />
                        </div>
                    )}

                    <div className="rounded-xl border border-border/50 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold w-12">الحالة</th>
                                        <th className="px-6 py-4 font-semibold text-right">الاسم</th>
                                        <th className="px-6 py-4 font-semibold text-right">الملف</th>
                                        <th className="px-6 py-4 font-semibold">المدة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50 bg-card">
                                    {report.results.map((r, i) => (
                                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                {r.outcome === 'passed' ? (
                                                    <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">نجاح</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10">فشل</Badge>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-right" dir="ltr">{r.name}</td>
                                            <td className="px-6 py-4 text-muted-foreground text-right" dir="ltr">{r.file}</td>
                                            <td className="px-6 py-4 text-muted-foreground">{r.duration}s</td>
                                        </tr>
                                    ))}
                                    {report.results.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                لا توجد نتائج لعرضها
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Detailed Errors if any */}
                    {report.failed > 0 && (
                        <div className="mt-8 space-y-4">
                            <h3 className="text-lg font-bold text-red-500 mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                تفاصيل الأخطاء
                            </h3>
                            {report.results.filter(r => r.outcome === 'failed').map((r, i) => (
                                <div key={i} className="rounded-xl bg-[#1e1e1e] border border-red-900/30 overflow-hidden text-left" dir="ltr">
                                    <div className="bg-[#2d2d2d] px-4 py-2 border-b border-[#3d3d3d] flex items-center justify-between">
                                        <span className="font-mono text-sm font-semibold text-red-400">{r.name}</span>
                                        <span className="text-xs text-gray-400">{r.file}</span>
                                    </div>
                                    <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                                        {r.error}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


