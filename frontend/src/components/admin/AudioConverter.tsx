import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Play, Square, FileAudio, Terminal, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Helper for formatting ETA
const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function AudioConverter() {
    const [path, setPath] = useState('');
    const [isPolling, setIsPolling] = useState(false);

    // Poll status using React Query
    const { data: status, refetch } = useQuery({
        queryKey: ['toolbox', 'audio-convert-status'],
        queryFn: () => apiClient.getAudioConvertStatus(),
        refetchInterval: isPolling ? 1000 : false,
    });

    // Start polling automatically if backend says it's running
    useEffect(() => {
        if (status?.is_running && !isPolling) {
            setIsPolling(true);
        } else if (status && !status.is_running && isPolling) {
            setIsPolling(false);
            if (status.processed_files > 0 && status.global_progress === 100) {
                toast({
                    title: 'اكتمل التحويل ✅',
                    description: `تم تحويل ${status.processed_files} ملفات بنجاح.`,
                });
            }
        }
    }, [status, isPolling]);

    const startMutation = useMutation({
        mutationFn: (targetPath: string) => apiClient.startAudioConvert(targetPath),
        onSuccess: () => {
            toast({ title: 'تم البدء', description: 'جاري فحص المجلد وتحويل الملفات...' });
            setIsPolling(true);
            refetch();
        },
         
        onError: (error: any) => {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل بدء التحويل.',
                variant: 'destructive',
            });
        },
    });

    const startAllMutation = useMutation({
        mutationFn: () => apiClient.startAudioConvertAll(),
        onSuccess: () => {
            toast({ title: 'تم البدء', description: 'جاري فحص جميع مجلدات المكتبة وتحويل الملفات...' });
            setIsPolling(true);
            refetch();
        },
        onError: (error: any) => {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل بدء التحويل لجميع المجلدات.',
                variant: 'destructive',
            });
        },
    });

    const cancelMutation = useMutation({
        mutationFn: () => apiClient.cancelAudioConvert(),
        onSuccess: () => {
            toast({ title: 'تم الإلغاء', description: 'تم إيقاف عملية التحويل.' });
            setIsPolling(false);
            setTimeout(() => refetch(), 1000);
        },
    });

    const handleStart = () => {
        if (!path.trim()) {
            toast({ title: 'مسار مطلوب', description: 'يرجى إدخال مسار المجلد أولاً.', variant: 'destructive' });
            return;
        }
        startMutation.mutate(path);
    };

    const isRunning = status?.is_running || startMutation.isPending;

    return (
        <Card className="border-primary/20 bg-black/40 shadow-xl backdrop-blur-md">
            <CardHeader className="border-b border-primary/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/20 rounded-xl">
                        <FileAudio className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            محول الصوت الذكي
                            {isRunning && (
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                </span>
                            )}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground mt-1 text-sm">
                            يقوم بتحويل صيغ الصوت غير المدعومة (مثل EAC3, TrueHD) إلى AAC داخل المجلد المحدد،
                            مع الاحتفاظ بجودة الفيديو الأصلية دون تغيير مساحته.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">

                {/* Inputs Section */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Input
                            placeholder="مسار المجلد (مثال: H:\CINEMA WORLD)"
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            disabled={isRunning}
                            className="bg-background/50 border-primary/20 h-12 text-lg dir-ltr pl-4 font-mono w-full"
                        />
                    </div>
                    {!isRunning ? (
                        <div className="flex gap-2">
                            <Button
                                onClick={handleStart}
                                disabled={!path.trim()}
                                className="h-12 px-6 bg-primary hover:bg-primary/80 text-primary-foreground gap-2 font-bold shadow-lg shadow-primary/20 transition-all"
                            >
                                <Play className="w-5 h-5" />
                                بدء للمجلد
                            </Button>
                            <Button
                                onClick={() => startAllMutation.mutate()}
                                variant="outline"
                                className="h-12 px-6 border-primary/50 hover:bg-primary/20 text-primary-foreground gap-2 font-bold shadow-lg shadow-primary/10 transition-all"
                            >
                                <Play className="w-5 h-5" />
                                فحص المكتبة كلها
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={() => cancelMutation.mutate()}
                            variant="destructive"
                            className="h-12 px-8 gap-2 font-bold shadow-lg shadow-destructive/20 animate-in fade-in transition-all"
                        >
                            <Square className="w-5 h-5" />
                            إيقاف الآن
                        </Button>
                    )}
                </div>

                {/* Live Progress Section */}
                {status && (isRunning || status.total_files > 0) && (
                    <div className="bg-background/40 border border-primary/10 rounded-xl p-6 space-y-5 animate-in slide-in-from-bottom-4">

                        {/* Status Header */}
                        <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    التقدم الإجمالي
                                </h3>
                                <div className="text-3xl font-black text-primary font-mono tracking-tight">
                                    {status.global_progress.toFixed(1)}%
                                </div>
                            </div>

                            <div className="text-right space-y-1">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    الوقت المتبقي
                                </h3>
                                <div className="text-xl font-bold font-mono">
                                    {formatTime(status.eta_seconds)}
                                </div>
                            </div>
                        </div>

                        <Progress value={status.global_progress} className="h-3 bg-secondary/30" />

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                                <span className="text-muted-foreground text-xs block mb-1">الهدف</span>
                                <span className="font-mono text-lg">{status.total_files}</span>
                            </div>
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                                <span className="text-muted-foreground text-xs block mb-1">تم الانتهاء</span>
                                <span className="font-mono text-lg text-green-400">{status.processed_files}</span>
                            </div>
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                                <span className="text-muted-foreground text-xs block mb-1">قيد المعالجة</span>
                                <span className="font-mono text-lg text-yellow-500">
                                    {status.total_files > 0 && status.processed_files < status.total_files ? 1 : 0}
                                </span>
                            </div>
                            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                                <span className="text-muted-foreground text-xs block mb-1">متبقي</span>
                                <span className="font-mono text-lg text-blue-400">
                                    {Math.max(0, status.total_files - status.processed_files)}
                                </span>
                            </div>
                        </div>

                        {/* Terminal view of current file */}
                        <div className="bg-black/80 rounded-lg p-4 font-mono text-xs text-green-500 overflow-hidden shadow-inner border border-white/10 relative group">
                            <div className="flex items-center justify-between mb-3 text-muted-foreground border-b border-white/10 pb-2">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-3 h-3" />
                                    <span>المسار الحالي</span>
                                </div>
                                <span className="text-[10px] uppercase text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded">
                                    Active Process
                                </span>
                            </div>

                            <div className="space-y-2">
                                <div className="flex gap-2 text-white/90">
                                    <span className="text-blue-500 select-none">&gt;</span>
                                    <span className="truncate flex-1 min-w-0" title={status.current_file}>
                                        {status.current_file || "Waiting for initialization..."}
                                    </span>
                                </div>

                                {isRunning && status.file_progress > 0 && status.current_file !== 'Scan complete. Analyzing audio codecs...' && (
                                    <div className="mt-2 flex items-center gap-3">
                                        <Progress value={status.file_progress} className="h-1.5 flex-1 bg-white/10" />
                                        <span className="text-[10px] w-10 text-right">{status.file_progress.toFixed(0)}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Info Alert */}
                <div className="flex items-start gap-3 bg-blue-500/10 text-blue-400 p-4 rounded-lg border border-blue-500/20 text-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                        هذه الأداة آمنة تماماً، ستقوم بصنع نسخة احتياطية أثناء التحويل وتحل محل الملف الأصلي فقط عند نجاح تحويل الصوت 100%. لن يتم المساس بالملفات التي يعمل صوتها بشكل طبيعي على المتصفح.
                    </p>
                </div>

            </CardContent>
        </Card>
    );
}


