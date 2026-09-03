
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Server, Database, Clapperboard, Globe } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthReport {
    health_score: number;
    generated_at: string;
    infrastructure: {
        disk: { free_gb: number; percent: number; total_gb: number };
        internet: boolean;
        ffmpeg: string | null;
        database: string;
        cpu: number;
        ram: number;
    };
    alerts: Array<{ type: 'critical' | 'warning' | 'error'; message: string }>;
    content_health: {
        corrupt_files: Array<{ id: number; title: string; file_path: string }>;
        missing_metadata: Array<{ id: number; title: string }>;
        missing_posters: Array<{ id: number; title: string }>;
        counts: { movies: number; series: number; total: number };
    };
    logs: {
        recent_errors: string[];
    };
}

export const SystemHealth = () => {
    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['system-health'],
        // We need to add this method to apiClient first, or fetch directly for now
        queryFn: async () => {
            const res = await fetch('/api/admin/health/advanced');
            if (!res.ok) throw new Error('Failed to fetch health');
            return res.json() as Promise<HealthReport>;
        },
        refetchInterval: 5000, // Update every 5 seconds automatically
    });

    if (isLoading) return <div className="p-8 space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
    if (!data) return <div className="text-red-500">Failed to load health report.</div>;

    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-green-500';
        if (score >= 70) return 'text-yellow-500';
        return 'text-red-500';
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Score */}
            <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <ShieldCheck className="w-64 h-64" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                            EYE OF GOD SYSTEM DIAGNOSTICS
                        </h2>
                        <p className="text-muted-foreground mt-2">
                            Comprehensive system analysis generated at {new Date(data.generated_at).toLocaleTimeString()}
                        </p>
                    </div>
                    <div className="text-center">
                        <div className={`text-6xl font-black ${getScoreColor(data.health_score)} drop-shadow-lg`}>
                            {data.health_score}%
                        </div>
                        <div className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mt-1">Health Score</div>
                    </div>
                    <div>
                        <Button size="lg" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                            <RefreshCw className={`mr-2 w-5 h-5 ${isRefetching ? 'animate-spin' : ''}`} />
                            Run Diagnostics
                        </Button>
                    </div>
                </div>
            </div>

            {/* Critical Alerts */}
            {data.alerts && data.alerts.length > 0 && (
                <Card className="border-red-500/50 bg-red-500/10 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center text-red-500">
                            <AlertTriangle className="mr-2 w-6 h-6" /> System Alerts ({data.alerts.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {data.alerts.map((alert, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-red-500/10 rounded-md border border-red-500/20">
                                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                                <span className="font-semibold text-red-600 dark:text-red-400">{alert.message}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Infrastructure Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard
                    title="Database"
                    icon={Database}
                    status={data.infrastructure.database === 'Healthy'}
                    detail={data.infrastructure.database}
                />
                <StatusCard
                    title="Internet/TMDb"
                    icon={Globe}
                    status={data.infrastructure.internet}
                    detail={data.infrastructure.internet ? "Online" : "Offline"}
                />
                <StatusCard
                    title="FFmpeg Engine"
                    icon={Clapperboard}
                    status={!!data.infrastructure.ffmpeg}
                    detail={data.infrastructure.ffmpeg ? "Ready" : "Missing"}
                />
                <StatusCard
                    title="Storage"
                    icon={Server}
                    status={data.infrastructure.disk.free_gb > 10}
                    detail={`${data.infrastructure.disk.free_gb} GB Free`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Corrupt Files */}
                <Card className="shadow-md h-[400px] flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center text-destructive">
                            <AlertTriangle className="mr-2 w-5 h-5" /> Corrupt / Zero-Duration Files
                        </CardTitle>
                        <CardDescription>
                            {data.content_health?.corrupt_files?.length || 0} files are unreadable.
                            <span className="font-bold text-destructive"> Must Re-Download.</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            {(!data.content_health?.corrupt_files || data.content_health.corrupt_files.length === 0) ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                                    <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                                    <p>All files verified successfully.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {data.content_health.corrupt_files.map(f => (
                                        <div key={f.id} className="p-3 rounded bg-muted/50 text-sm border-l-4 border-l-destructive">
                                            <div className="font-bold">{f.title}</div>
                                            <div className="text-xs text-muted-foreground font-mono mt-1 break-all">{f.file_path}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* System Logs */}
                <Card className="shadow-md h-[400px] flex flex-col">
                    <CardHeader>
                        <CardTitle>Recent Critical Logs</CardTitle>
                        <CardDescription>Last 50 error events from the server core</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full bg-black/90 text-red-400 p-4 rounded-md font-mono text-xs">
                            {(!data.logs?.recent_errors || data.logs.recent_errors.length === 0) ? (
                                <div className="text-green-400 text-center h-full flex items-center justify-center">
                                    -- No Recent Errors --
                                </div>
                            ) : (
                                data.logs.recent_errors.map((log, i) => (
                                    <div key={i} className="mb-2 pb-2 border-b border-white/10 last:border-0 last:pb-0">
                                        {log}
                                    </div>
                                ))
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

 
const StatusCard = ({ title, icon: Icon, status, detail }: any) => (
    <Card className={`border-l-4 ${status ? 'border-l-green-500' : 'border-l-red-500'}`}>
        <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${status ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <div className="font-semibold text-sm">{title}</div>
                    <div className={`text-xs font-bold ${status ? 'text-green-600' : 'text-red-500'}`}>{detail}</div>
                </div>
            </div>
            {status ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
        </CardContent>
    </Card>
);


