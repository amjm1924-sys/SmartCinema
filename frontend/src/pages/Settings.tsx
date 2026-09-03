

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Trash2, RefreshCw, Plus, HardDrive, CheckCircle2, AlertTriangle, Terminal as TerminalIcon, Lock, Unlock, Zap, Cpu } from 'lucide-react';


import Header from '@/components/layout/Header';
import { apiClient } from '@/lib/api';
import { scannerService } from '@/lib/ScannerService'; // Import the service
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Assuming this exists


import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileRenamer } from '@/components/admin/FileRenamer';
import { AudioConverter } from '@/components/admin/AudioConverter';
import { ThemeSwitcher } from '@/components/admin/ThemeSwitcher';
import { AISettings } from '@/components/admin/AISettings';
import { UnitTestsDashboard } from '@/components/admin/UnitTestsDashboard';
import { BackupManager } from '@/components/admin/BackupManager';
import { LocalAIManager } from '@/components/admin/LocalAIManager';
import { enableTVNavigation, disableTVNavigation } from '@/lib/tvNavigation';

// Helper for Time Formatting
const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const Settings = () => {
    const [newPath, setNewPath] = useState('');
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Stats State
     
    const [scanStatus, setScanStatus] = useState<any>(null); // Use specific type if available
    const [eta, setEta] = useState<string>('00:00:00');
    const [tvMode, setTvMode] = useState(localStorage.getItem('tvMode') === 'true');

    const toggleTvMode = () => {
        if (tvMode) {
            disableTVNavigation();
            setTvMode(false);
        } else {
            enableTVNavigation();
            setTvMode(true);
        }
    };

    // Fetch library paths
     
    const { data: paths = [] as any[] } = useQuery({
        queryKey: ['library', 'paths'],
        queryFn: () => apiClient.getLibraryPaths(),
    });

    // Fetch auto-scan setting
    const { data: autoScanData } = useQuery({
        queryKey: ['settings', 'autoScan'],
        queryFn: () => apiClient.getAutoScan(),
    });
    const autoScanEnabled = autoScanData?.auto_scan ?? true;

    // Fetch GPU status
    const { data: gpuStatus, isLoading: gpuLoading } = useQuery({
        queryKey: ['settings', 'gpuStatus'],
        queryFn: () => apiClient.getGpuStatus(),
    });

    // Fetch library stats (Traditional)
     
    const { data: stats, isLoading: statsLoading } = useQuery<any>({
        queryKey: ['library', 'stats'],
        queryFn: () => apiClient.getLibraryStats(),
        refetchInterval: 5000,
    });

    // Real-time Scan Connection
    useEffect(() => {
        scannerService.connect();

        const unsubscribe = scannerService.subscribe((status) => {
            setScanStatus(status);

            // ETA Calculation
            if (status.is_scanning && status.processed_total > 0 && status.total_items > 0) {
                const elapsed = status.elapsed_seconds;
                const done = status.processed_total;
                const remaining = status.total_items - done;
                // ETA = (Remaining * TimePerItem)
                const rate = elapsed / done; // seconds per item
                const etaSeconds = remaining * rate;
                setEta(formatTime(etaSeconds));
            } else {
                setEta('00:00:00');
            }
        });

        return () => {
            unsubscribe();
            scannerService.disconnect();
        };
    }, []);

    // Add path mutation
    const addPathMutation = useMutation({
        mutationFn: (path: string) => apiClient.addLibraryPath(path),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library', 'paths'] });
            setNewPath('');
            toast({
                title: 'تم الإضافة ✅',
                description: 'تم إضافة المسار بنجاح',
            });
            // Auto-start scan
            setTimeout(() => startScanMutation.mutate(), 500);
        },
         
        onError: (error: any) => {
            toast({
                title: 'خطأ ❌',
                description: error.message || 'فشل إضافة المسار',
                variant: 'destructive',
            });
        },
    });

    const removePathMutation = useMutation({
        mutationFn: (pathId: number) => apiClient.removeLibraryPath(pathId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library', 'paths'] });
            toast({ title: 'تم الحذف', description: 'تم حذف المسار بنجاح' });
        },
    });

    const togglePathMutation = useMutation({
        mutationFn: (id: number) => apiClient.toggleLibraryPath(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library', 'paths'] });
        }
    });

    const startScanMutation = useMutation({
        mutationFn: () => apiClient.startScan(),
        onSuccess: () => {
            toast({
                title: 'بدأ الفحص 🔍',
                description: 'جاري فحص المسارات...',
            });
        },
         
        onError: (error: any) => {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل بدء الفحص',
                variant: 'destructive',
            });
        },
    });

    const setAutoScanMutation = useMutation({
        mutationFn: (enable: boolean) => apiClient.setAutoScan(enable),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['settings', 'autoScan'] });
            toast({
                title: variables ? 'تم التفعيل ✅' : 'تم التعطيل ⏹️',
                description: variables ? 'تم تفعيل الفحص التلقائي للمكتبة' : 'تم تعطيل الفحص التلقائي',
            });
        },
         
        onError: (error: any) => {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل تغيير الإعداد',
                variant: 'destructive',
            });
        }
    });

    const handleAddPath = () => {
        if (newPath.trim()) addPathMutation.mutate(newPath.trim());
    };

    // Calculate Progress Percentage
    const progressPercent = scanStatus?.total_items > 0
        ? Math.min(100, (scanStatus.processed_total / scanStatus.total_items) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 py-8 mt-20 max-w-4xl">
                <h1 className="text-4xl font-bold mb-8">الإعدادات</h1>

                <Tabs defaultValue="library" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 mb-8">
                        <TabsTrigger value="library">المكتبة</TabsTrigger>
                        <TabsTrigger value="toolbox">الأدوات</TabsTrigger>
                        <TabsTrigger value="ai">Smart AI 🤖</TabsTrigger>
                        <TabsTrigger value="localai">
                            <span className="flex items-center gap-1.5">Local AI <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span></span>
                        </TabsTrigger>
                        <TabsTrigger value="theme">المظهر</TabsTrigger>
                        <TabsTrigger value="tests">فحص شامل</TabsTrigger>
                    </TabsList>

                    {/* --- LIBRARY TAB --- */}
                    <TabsContent value="library">
                        {/* --- REAL-TIME SCAN DASHBOARD --- */}
                        {scanStatus?.is_scanning && (
                            <div className="glass-panel p-6 mb-8 border-primary/50 border animate-in fade-in slide-in-from-top-4">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        جاري الفحص المباشر...
                                    </h2>
                                    <div className="flex items-center gap-4 text-sm font-mono">
                                        <span className="text-muted-foreground">ETA: <span className="text-foreground font-bold">{eta}</span></span>
                                        <Badge variant="outline" className="px-3 py-1">
                                            {progressPercent.toFixed(1)}%
                                        </Badge>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="relative h-4 w-full bg-secondary/50 rounded-full overflow-hidden mb-6">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-primary transition-all duration-300 ease-out"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>

                                {/* Summary Table */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    {/* Stats */}
                                    <div className="bg-background/40 rounded-lg border p-4">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-border/50 text-muted-foreground text-right">
                                                    <th className="pb-2">Category</th>
                                                    <th className="pb-2">Status</th>
                                                    <th className="pb-2 text-left">Count</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                <tr>
                                                    <td className="py-2">Movies</td>
                                                    <td className="text-green-400">Completed</td>
                                                    <td className="text-left font-bold">{scanStatus.processed_movies}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2">Series</td>
                                                    <td className="text-purple-400">Completed</td>
                                                    <td className="text-left font-bold">{scanStatus.processed_series}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2">Episodes</td>
                                                    <td className="text-blue-400">Completed</td>
                                                    <td className="text-left font-bold">{scanStatus.processed_episodes}</td>
                                                </tr>
                                                <tr className="border-t border-border/50">
                                                    <td className="py-2">Remaining</td>
                                                    <td className="text-yellow-400">Queue</td>
                                                    <td className="text-left font-bold">
                                                        {Math.max(0, scanStatus.total_items - scanStatus.processed_total)}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Live Terminal */}
                                    <div className="bg-black/80 rounded-lg p-4 font-mono text-xs text-green-500 overflow-hidden flex flex-col shadow-inner">
                                        <div className="flex items-center gap-2 mb-2 text-muted-foreground border-b border-white/10 pb-1">
                                            <TerminalIcon className="w-3 h-3" />
                                            <span>Live Logs</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto max-h-[120px] scrollbar-thin">
                                            <div className="mb-1 opacity-50">...Initializing Scanner</div>
                                            {scanStatus.current_file !== 'Scan complete!' && (
                                                <div className="mb-1">
                                                    <span className="text-blue-400">Scanning: </span>
                                                    <span className="text-white/90 break-all">{scanStatus.current_file}</span>
                                                </div>
                                            )}
                                            {scanStatus.failed_items > 0 && (
                                                <div className="text-red-400 mt-2">
                                                    Warning: {scanStatus.failed_items} items failed validation.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Failure Log (if any) */}
                                {scanStatus.failed_list && scanStatus.failed_list.length > 0 && (
                                    <div className="mt-4 border-t border-destructive/30 pt-4">
                                        <h3 className="text-sm font-bold text-destructive mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            Failed Items ({scanStatus.failed_items})
                                        </h3>
                                        <div className="bg-destructive/10 rounded-lg p-2 max-h-[150px] overflow-y-auto text-xs space-y-1">
                                            {scanStatus.failed_list.map((fail: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-background/20 rounded hover:bg-background/40 transition-colors">
                                                    <div className="flex gap-2 items-center overflow-hidden">
                                                        <Badge variant="destructive" className="h-5 text-xs">FAILED</Badge>
                                                        <span className="text-foreground font-mono text-xs w-24 truncate" title={fail.reason}>{fail.reason}</span>
                                                        <span className="text-muted-foreground text-xs truncate dir-ltr flex-1" title={fail.file}>
                                                            {fail.file}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => window.open(`/admin?search=${encodeURIComponent(fail.file.split(/[/\\]/).pop() || '')}`, '_blank')}>
                                                            Edit Manually
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Library Stats - Always show */}
                        <div className="glass-panel p-6 mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-2xl font-bold">إحصائيات المكتبة</h2>
                                <div className="flex items-center gap-3 bg-secondary/20 px-4 py-2 rounded-full border border-secondary/50">
                                    {scanStatus?.is_scanning ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 text-primary animate-spin" />
                                            <span className="text-sm font-medium text-primary">جاري فحص الملفات الجديدة...</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                            </div>
                                            <span className="text-sm font-medium text-muted-foreground cursor-default" title="يقوم النظام تلقائياً بالبحث عن أي تغييرات في المجلدات المضافة كل 20 ثانية">
                                                متصل بخدمة الفحص
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {statsLoading ? (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary mx-auto"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-primary">{stats?.movies ?? 0}</div>
                                        <div className="text-sm text-muted-foreground">أفلام</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-primary">{stats?.series ?? 0}</div>
                                        <div className="text-sm text-muted-foreground">مسلسلات</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-primary">{stats?.episodes ?? 0}</div>
                                        <div className="text-sm text-muted-foreground">حلقات</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-3xl font-bold text-primary">{stats?.total_size_gb?.toFixed(1) ?? '0.0'}</div>
                                        <div className="text-sm text-muted-foreground">GB</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Library Paths */}
                        <div className="glass-panel p-6 mb-8">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                                <h2 className="text-2xl font-bold">مسارات المكتبة</h2>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        onClick={() => setAutoScanMutation.mutate(!autoScanEnabled)}
                                        variant="outline"
                                        className={cn("gap-2 transition-colors", autoScanEnabled ? 'text-primary border-primary/50 bg-primary/10' : 'text-muted-foreground')}
                                    >
                                        <RefreshCw className={cn("w-4 h-4", autoScanEnabled && "animate-spin-slow")} />
                                        {autoScanEnabled ? 'الفحص التلقائي: مفعل' : 'الفحص التلقائي: معطل'}
                                    </Button>
                                    <Button
                                        onClick={() => startScanMutation.mutate()}
                                        disabled={startScanMutation.isPending || scanStatus?.is_scanning}
                                        className="gap-2 border-primary"
                                    >
                                        <RefreshCw className={cn("w-4 h-4", scanStatus?.is_scanning && "animate-spin")} />
                                        فحص يدوي للمكتبة
                                    </Button>
                                </div>
                            </div>

                            <div className="mb-6 flex gap-2">
                                <Input
                                    placeholder="أدخل مسار المجلد (مثال: H:\CINEMA WORLD)"
                                    value={newPath}
                                    onChange={(e) => setNewPath(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
                                    className="flex-1 text-lg font-mono text-left"
                                    dir="ltr"
                                />
                                <Button onClick={handleAddPath} disabled={!newPath.trim()}>
                                    <Plus className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {(paths as any[]).map((path: any) => (
                                    <div key={path.id} className={cn("flex items-center justify-between p-4 rounded-lg border transition-colors group", path.enabled === 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-muted/50 border-transparent')}>
                                        <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                            <FolderOpen className={cn("w-5 h-5 shrink-0", path.enabled === 0 ? 'text-red-400' : 'text-primary')} />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className={cn("font-medium font-mono text-sm truncate dir-ltr text-left", path.enabled === 0 && 'text-muted-foreground line-through')}>{path.path}</p>
                                                    {path.enabled === 0 && <Badge variant="destructive" className="h-5 text-[10px] px-1">LOCKED</Badge>}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    last scan: {path.last_scanned ? new Date(path.last_scanned).toLocaleString() : 'Never'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => togglePathMutation.mutate(path.id)}
                                                className={cn("transition-colors", path.enabled === 0 ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20' : 'text-muted-foreground hover:text-primary')}
                                                title={path.enabled === 0 ? "Unlock Path" : "Lock Path (Skip Scan)"}
                                            >
                                                {path.enabled === 0 ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removePathMutation.mutate(path.id)}
                                                className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* GPU Acceleration Status */}
                        <div className="glass-panel p-6 mb-8 border-primary/20 border">
                            <div className="flex items-center gap-2 mb-4">
                                <Zap className="w-6 h-6 text-yellow-400" />
                                <h2 className="text-2xl font-bold">تسريع عتاد كارت الشاشة (Hardware Acceleration ⚡)</h2>
                            </div>
                            
                            {gpuLoading ? (
                                <div className="text-center py-4">
                                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
                                </div>
                            ) : gpuStatus ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-4 bg-background/50 p-4 rounded-lg border">
                                        <div className="bg-primary/10 p-3 rounded-full">
                                            {gpuStatus.hardware_accelerated ? (
                                                <HardDrive className="w-8 h-8 text-green-400" />
                                            ) : (
                                                <Cpu className="w-8 h-8 text-blue-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg mb-1">{gpuStatus.encoder_name}</h3>
                                            <div className="flex gap-2">
                                                <Badge variant={gpuStatus.hardware_accelerated ? "default" : "secondary"} className={gpuStatus.hardware_accelerated ? "bg-green-500 hover:bg-green-600" : ""}>
                                                    {gpuStatus.hardware_accelerated ? "مفعل ومستقر ⚡ (GPU)" : "يعمل عبر المعالج (CPU)"}
                                                </Badge>
                                                {gpuStatus.ffmpeg_available && (
                                                    <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                                                        FFmpeg: {gpuStatus.ffmpeg_path}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-red-400">Failed to load GPU status</div>
                            )}
                        </div>
                    </TabsContent>

                    {/* --- TOOLBOX TAB --- */}
                    <TabsContent value="toolbox" className="space-y-6">
                        <BackupManager />
                        <AudioConverter />
                        <FileRenamer />
                    </TabsContent>

                    {/* --- AI TAB --- */}
                    <TabsContent value="ai">
                        <AISettings />
                    </TabsContent>

                    {/* --- LOCAL AI TAB --- */}
                    <TabsContent value="localai">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold mb-1">Local AI — Ollama 🦙</h2>
                            <p className="text-sm text-muted-foreground">إدارة ومراقبة موديلات الذكاء الاصطناعي المحلية المجانية</p>
                        </div>
                        <LocalAIManager />
                    </TabsContent>

                    {/* --- THEME TAB --- */}
                    <TabsContent value="theme" className="space-y-6">
                        <div className="glass-panel p-6 border-primary/20 border flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold mb-2">نمط التلفزيون الذكي والتنقل بالريموت (Smart TV D-Pad Mode) 📺</h2>
                                <p className="text-sm text-muted-foreground">تفعيل التنقل باستخدام أسهم لوحة المفاتيح أو ريموت التلفزيون الذكي</p>
                            </div>
                            <Button 
                                variant={tvMode ? "default" : "outline"} 
                                onClick={toggleTvMode}
                                className={tvMode ? "bg-primary text-primary-foreground" : ""}
                            >
                                {tvMode ? "مفعل" : "معطل"}
                            </Button>
                        </div>
                        <ThemeSwitcher />
                    </TabsContent>

                    {/* --- UNIT TESTS TAB --- */}
                    <TabsContent value="tests">
                        <UnitTestsDashboard />
                    </TabsContent>

                </Tabs>
            </main>
        </div >
    );
};

export default Settings;


