import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Trash2, Edit, RefreshCw, Database, Terminal, Shield, Activity, HardDrive, FileVideo, Search, Eye, Badge as LucideBadge, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { SystemHealth } from './admin/SystemHealth';
import { Inspector } from './admin/Inspector';
import Header from '@/components/layout/Header';

const Admin = () => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('dashboard');

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <div className="container mx-auto p-8 pt-24">
                <div className="flex items-center gap-4 mb-8">
                    <Shield className="w-10 h-10 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                            لوحة تحكم الأدمن
                        </h1>
                        <p className="text-muted-foreground">التحكم الكامل في النظام (God Mode)</p>
                    </div>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="flex flex-wrap w-full h-auto gap-2 bg-muted/50 p-2">
                        <TabsTrigger value="dashboard" className="gap-2"><Activity className="w-4 h-4" /> لوحة المعلومات</TabsTrigger>
                        <TabsTrigger value="health" className="gap-2"><Shield className="w-4 h-4" /> فحص شامل (Eye of God)</TabsTrigger>
                        <TabsTrigger value="inspector" className="gap-2"><Search className="w-4 h-4" /> فحص دقيق</TabsTrigger>
                        <TabsTrigger value="media" className="gap-2"><FileVideo className="w-4 h-4" /> إدارة المحتوى</TabsTrigger>
                        <TabsTrigger value="duplicates" className="gap-2"><Copy className="w-4 h-4" /> المكررات</TabsTrigger>
                        <TabsTrigger value="tools" className="gap-2"><HardDrive className="w-4 h-4" /> أدوات</TabsTrigger>
                        <TabsTrigger value="logs" className="gap-2"><Terminal className="w-4 h-4" /> السجلات</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard">
                        <DashboardTab />
                    </TabsContent>

                    <TabsContent value="health">
                        <SystemHealth />
                    </TabsContent>

                    <TabsContent value="inspector">
                        <Inspector />
                    </TabsContent>

                    <TabsContent value="media">
                        <MediaManagerTab />
                    </TabsContent>

                    <TabsContent value="logs">
                        <LogsTab />
                    </TabsContent>

                    <TabsContent value="tools">
                        <ToolsTab />
                    </TabsContent>

                    <TabsContent value="duplicates">
                        <DuplicatesTab />
                    </TabsContent>
                </Tabs>
            </div >
        </div>
    );
};

const ToolsTab = () => {
    const [seriesId, setSeriesId] = useState('');
    const [seasonNum, setSeasonNum] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleDetect = async () => {
        if (!seriesId || !seasonNum) return toast.error('Please fill all fields');
        setIsLoading(true);
        try {
            const res = await apiClient.detectIntroForSeason(parseInt(seriesId), parseInt(seasonNum));
            toast.success(res.message);
         
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>أدوات النظام (System Tools)</CardTitle>
                <CardDescription>أدوات متقدمة للصيانة والتحليل</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-4 border rounded-lg bg-muted/20">
                    <h3 className="font-bold mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        كشف المقدمة (Intro Detection)
                    </h3>
                    <div className="flex gap-4 items-end">
                        <div className="space-y-2">
                            <Label>Series ID</Label>
                            <Input value={seriesId} onChange={e => setSeriesId(e.target.value)} placeholder="e.g. 12" />
                        </div>
                        <div className="space-y-2">
                            <Label>Season Number</Label>
                            <Input value={seasonNum} onChange={e => setSeasonNum(e.target.value)} placeholder="e.g. 1" />
                        </div>
                        <Button onClick={handleDetect} disabled={isLoading}>
                            {isLoading ? 'جاري التحليل...' : 'بدء التحليل'}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        سيقوم النظام بتحليل الصوت لأول 3 حلقات من الموسم واكتشاف المقدمة المشتركة.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

const DashboardTab = () => {
    const { data: stats } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: () => apiClient.getAdminStats(),
        refetchInterval: 10000
    });

    const { data: system } = useQuery({
        queryKey: ['admin-system'],
        queryFn: () => apiClient.getSystemInfo(),
    });

    const clearCache = useMutation({
        mutationFn: () => apiClient.clearCache(),
        onSuccess: () => toast.success('تم مسح الكاش بنجاح')
    });

    const optimizeDB = useMutation({
        mutationFn: () => apiClient.optimizeDatabase(),
        onSuccess: () => toast.success('تم تحسين قاعدة البيانات')
    });


    const { data: brokenFiles = [] } = useQuery({
        queryKey: ['broken-files'],
        queryFn: () => apiClient.getBrokenFiles(),
    });

    const { data: activeSessions = [] } = useQuery({
        queryKey: ['active-sessions'],
        queryFn: () => apiClient.getActiveSessions(),
        refetchInterval: 5000
    });

    const { data: incompleteMedia = [] } = useQuery({
        queryKey: ['incomplete-media'],
        queryFn: () => apiClient.getIncompleteMedia(),
    });

    return (
        <div className="space-y-6">
            {/* System Resources Monitor */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                        <Activity className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${system?.cpu > 80 ? 'text-red-500' : 'text-green-500'}`}>
                            {system?.cpu || 0}%
                        </div>
                        <p className="text-xs text-muted-foreground">Real-time Load</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Memory</CardTitle>
                        <Activity className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{system?.ram?.percent || 0}%</div>
                        <p className="text-xs text-muted-foreground">
                            {((system?.ram?.used || 0) / 1024 / 1024 / 1024).toFixed(1)} GB used
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Disk Space</CardTitle>
                        <HardDrive className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{system?.disk?.percent || 0}%</div>
                        <p className="text-xs text-muted-foreground">
                            {((system?.disk?.total || 0) / 1024 / 1024 / 1024).toFixed(0)} GB Total
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total Media</CardTitle>
                        <FileVideo className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.media?.total || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats?.media?.movies} Movies • {stats?.media?.series} Shows
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Active Sessions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-500" />
                        Active Streams ({activeSessions.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {activeSessions.length === 0 ? (
                        <p className="text-muted-foreground">No active streams.</p>
                    ) : (
                        <div className="space-y-4">
                            {activeSessions.map((s: any) => (
                                <div key={s.media_id} className="flex justify-between items-center p-3 border rounded-lg bg-muted/50">
                                    <div className="flex-1">
                                        <div className="font-medium">{s.title || 'Unknown Title'}</div>
                                        <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                                            <span>IP: {s.ip}</span>
                                            <span>Progress: {Math.floor(s.progress)}%</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>



            {/* Broken Files Report */}
            {brokenFiles.length > 0 && (
                <Card className="border-red-500/20 bg-red-500/5">
                    <CardHeader>
                        <CardTitle className="text-red-500 flex items-center gap-2">
                            <Shield className="w-5 h-5" /> Found {brokenFiles.length} Broken Files
                        </CardTitle>
                        <CardDescription>Files with 0 duration or missing from disk</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {brokenFiles.map((file: any) => (
                                <div key={file.id} className="flex justify-between items-center p-2 bg-background rounded border">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{file.title}</span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30">
                                                {file.issue}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate text-left ltr" title={file.file_path}>
                                            {file.file_path}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        {/* Only show Rescan if file exists */}
                                        {file.exists && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    // Rescan: Manual import (overwrite)
                                                    apiClient.manualImport(file.file_path, file.type)
                                                        .then(() => {
                                                            toast.success('تم جدولة الفحص');
                                                            queryClient.invalidateQueries({ queryKey: ['broken-files'] });
                                                        })
                                                        .catch(err => toast.error(err.message));
                                                }}
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => {
                                                if (confirm('هل أنت متأكد من حذف هذا السجل من قاعدة البيانات؟')) {
                                                    apiClient.deleteMedia(file.id)
                                                        .then(() => {
                                                            toast.success('تم الحذف');
                                                            queryClient.invalidateQueries({ queryKey: ['broken-files'] });
                                                            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
                                                        })
                                                        .catch(err => toast.error(err.message || 'فشل الحذف'));
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Incomplete Metadata Report (EYE OF GOD) */}
            {incompleteMedia && incompleteMedia.length > 0 && (
                <Card className="border-orange-500/20 bg-orange-500/5">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-orange-500 flex items-center gap-2">
                                    <Eye className="w-5 h-5" />
                                    محتوى ناقص (EYE OF GOD) - {incompleteMedia.length} ملف
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    محاولات جلب البيانات فشلت جزئياً أو كلياً. يرجى التعديل اليدوي أو إعادة الفحص.
                                </CardDescription>
                            </div>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                    toast.promise(apiClient.fixAllMetadata(), {
                                        loading: 'Running Aggressive Auto-Repair...',
                                        success: 'Auto-Repair Started! Check logs/repair.log',
                                        error: 'Failed to start repair'
                                    });
                                }}
                            >
                                <RefreshCw className="w-4 h-4 ml-2" />
                                إصلاح تلقائي كامل
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {incompleteMedia.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center p-2 bg-background rounded border">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{item.title || '(بدون عنوان)'}</span>
                                            <span className="text-xs text-muted-foreground">{item.year}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {item.issues && item.issues.map((field: string) => (
                                                <Badge key={field} variant="outline" className="text-[10px] text-orange-600 border-orange-200">
                                                    ناقص: {field}
                                                </Badge>
                                            ))}
                                            {!item.title && <Badge variant="destructive" className="text-[10px]">مفقود الاسم</Badge>}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate text-left ltr mt-1" title={item.file_path}>
                                            {item.file_path}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <Badge variant="secondary">ID: {item.id}</Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>إجراءات سريعة</CardTitle>
                    <CardDescription>أدوات الصيانة والتحكم</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <Button variant="outline" onClick={() => clearCache.mutate()} disabled={clearCache.isPending}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${clearCache.isPending ? 'animate-spin' : ''}`} />
                        مسح الكاش
                    </Button>
                    <Button variant="outline" onClick={() => optimizeDB.mutate()} disabled={optimizeDB.isPending}>
                        <Database className={`mr-2 h-4 w-4 ${optimizeDB.isPending ? 'animate-pulse' : ''}`} />
                        تحسين قاعدة البيانات
                    </Button>
                    <Button variant="outline" onClick={() => toast.promise(apiClient.batchCacheTrailers([], true), {
                        loading: 'Starting downloads...',
                        success: (data) => `Started downloading ${data.queued_count} trailers`,
                        error: 'Failed to start downloads'
                    })}>
                        <FileVideo className="mr-2 h-4 w-4" />
                        تحميل كل التريلرات (Offline)
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

const MediaManagerTab = () => {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('all');
     
    const [editItem, setEditItem] = useState<any>(null);
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['admin-media', page, search, type],
        queryFn: () => apiClient.getAdminMedia(page, 20, search, type === 'all' ? '' : type),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteMedia(id),
        onSuccess: () => {
            toast.success('تم حذف الملف');
            queryClient.invalidateQueries({ queryKey: ['admin-media'] });
        }
    });

    const updateMutation = useMutation({
         
        mutationFn: (vars: { id: number, data: any }) => apiClient.updateMedia(vars.id, vars.data),
        onSuccess: () => {
            toast.success('تم تحديث البيانات');
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['admin-media'] });
        }
    });

     
    const [editForm, setEditForm] = useState<any>({});

    // Update editForm when editItem changes
    useEffect(() => {
        if (editItem) {
            setEditForm(editItem);
        }
    }, [editItem]);

    const fixMatchMutation = useMutation({
        mutationFn: () => apiClient.fixMatch(editForm.id, editForm.tmdb_id, editForm.type),
        onSuccess: () => {
            toast.success('تم تحديث البيانات من TMDb');
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['admin-media'] });
        },
         
        onError: (err: any) => toast.error('فشل في تحديث البيانات: ' + err.message)
    });

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        updateMutation.mutate({ id: editForm.id, data: editForm });
    };

     
    const handleChange = (field: string, value: any) => {
         
        setEditForm((prev: any) => ({ ...prev, [field]: value }));
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <CardTitle>إدارة مكتبة الوسائط</CardTitle>
                    <div className="flex gap-2">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="secondary" className="gap-2">
                                    <Database className="w-4 h-4" />
                                    استيراد يدوي
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>استيراد ملف يدوي</DialogTitle>
                                </DialogHeader>
                                <ManualImportForm />
                            </DialogContent>
                        </Dialog>

                        <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>تعديل البيانات</DialogTitle>
                                </DialogHeader>
                                {editItem && (
                                    <form onSubmit={handleSave} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>العنوان</Label>
                                                <Input
                                                    value={editForm.title || ''}
                                                    onChange={e => handleChange('title', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>السنة</Label>
                                                <Input
                                                    value={editForm.year || ''}
                                                    onChange={e => handleChange('year', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>الوصف</Label>
                                            <Textarea
                                                value={editForm.overview || ''}
                                                onChange={e => handleChange('overview', e.target.value)}
                                                className="min-h-[100px]"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>البلد (Country)</Label>
                                            <Input
                                                value={editForm.country || ''}
                                                onChange={e => handleChange('country', e.target.value)}
                                                placeholder="e.g. US, EG"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>مسار الملف (File Path)</Label>
                                            <Input
                                                value={editForm.file_path || ''}
                                                onChange={e => handleChange('file_path', e.target.value)}
                                                placeholder="C:\Movies\Movie.mkv"
                                                dir="ltr"
                                                className="text-left font-mono text-sm"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>مسار المجلد (Folder Path)</Label>
                                            <Input
                                                value={editForm.folder_path || ''}
                                                onChange={e => handleChange('folder_path', e.target.value)}
                                                placeholder="C:\Series\ShowName\Season 01"
                                                dir="ltr"
                                                className="text-left font-mono text-sm"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>رابط البوستر</Label>
                                                <Input
                                                    value={editForm.poster_url || ''}
                                                    onChange={e => handleChange('poster_url', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>رابط الخلفية</Label>
                                                <Input
                                                    value={editForm.backdrop_url || ''}
                                                    onChange={e => handleChange('backdrop_url', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>التقييم</Label>
                                                <Input
                                                    value={editForm.tmdb_rating || ''}
                                                    onChange={e => handleChange('tmdb_rating', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>TMDb ID</Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={editForm.tmdb_id || ''}
                                                        onChange={e => handleChange('tmdb_id', e.target.value)}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        title="Fix Match"
                                                        onClick={() => fixMatchMutation.mutate()}
                                                        disabled={fixMatchMutation.isPending}
                                                    >
                                                        {fixMatchMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label>Intro Start (s)</Label>
                                                <Input
                                                    type="number" step="0.1"
                                                    value={editForm.intro_start ?? ''}
                                                    onChange={e => handleChange('intro_start', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Intro End (s)</Label>
                                                <Input
                                                    type="number" step="0.1"
                                                    value={editForm.intro_end ?? ''}
                                                    onChange={e => handleChange('intro_end', e.target.value)}
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    className="w-full gap-2"
                                                    disabled={updateMutation.isPending}
                                                    onClick={() => {
                                                        toast.info('Starting analysis...');
                                                        apiClient.detectIntro(editForm.id)
                                                            .then(res => {
                                                                if (res.guess) {
                                                                    handleChange('intro_start', res.guess.start);
                                                                    handleChange('intro_end', res.guess.end);
                                                                    toast.success(`Found intro: ${res.guess.start}s - ${res.guess.end}s`);
                                                                } else {
                                                                    toast.warning('No intro detected (try manual)');
                                                                }
                                                            })
                                                            .catch(err => toast.error('Analysis failed: ' + err.message));
                                                    }}
                                                >
                                                    <Activity className="w-4 h-4" /> Auto Detect
                                                </Button>
                                            </div>
                                        </div>

                                        <DialogFooter>
                                            <Button type="button" variant="outline" onClick={() => setEditItem(null)}>إلغاء</Button>
                                            <Button type="submit" disabled={updateMutation.isPending}>
                                                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                )}
                            </DialogContent>
                        </Dialog>

                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Activity className="w-4 h-4" />
                                    إدارة المجموعات
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>إدارة المجموعات (Collections)</DialogTitle>
                                </DialogHeader>
                                <CollectionsManager />
                            </DialogContent>
                        </Dialog>

                        <Input
                            placeholder="بحث بالاسم أو ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-48"
                        />
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">الكل</SelectItem>
                                <SelectItem value="movie">أفلام</SelectItem>
                                <SelectItem value="series">مسلسلات</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground text-start">ID</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground text-start">العنوان</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground text-start">النوع</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground text-start">السنة</th>
                                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground text-start">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-4 text-center">جاري التحميل...</td></tr>
                             
                            ) : data?.media.map((item: any) => (
                                <tr key={item.id} className="border-b transition-colors hover:bg-muted/50">
                                    <td className="p-4">{item.id}</td>
                                    <td className="p-4 font-medium flex items-center gap-2">
                                        {!!item.locked && <LucideBadge className="w-4 h-4 text-yellow-500" title="Locked (Manual Edit)" />}
                                        {item.title}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs ${item.type === 'movie' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                                            {item.type === 'movie' ? 'فيلم' : item.type === 'series' ? 'مسلسل' : item.type}
                                        </span>
                                    </td>
                                    <td className="p-4">{item.year || '-'}</td>
                                    <td className="p-4 flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setEditItem(item)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-100/10"
                                            onClick={() => {
                                                if (confirm('هل أنت متأكد من الحذف؟ لا يمكن التراجع.')) {
                                                    deleteMutation.mutate(item.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        السابق
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        صفحة {page} من {data?.pages || 1}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page >= (data?.pages || 1)}
                    >
                        التالي
                    </Button>
                </div>


            </CardContent>
        </Card >
    );
};

const LogsTab = () => {
    const { data } = useQuery({
        queryKey: ['admin-logs'],
        queryFn: () => apiClient.getLogs(),
        refetchInterval: 5000
    });

    const [filter, setFilter] = useState('');
    const [levelFilter, setLevelFilter] = useState('ALL');

    const logs = data?.logs || [];

     
    const filteredLogs = logs.filter((log: any) => {
        if (typeof log === 'string') return log.toLowerCase().includes(filter.toLowerCase());

        const matchesText =
            log.message.toLowerCase().includes(filter.toLowerCase()) ||
            log.logger.toLowerCase().includes(filter.toLowerCase());

        const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter;

        return matchesText && matchesLevel;
    });

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'ERROR': return 'text-red-500';
            case 'WARNING': return 'text-yellow-500';
            case 'INFO': return 'text-blue-500';
            default: return 'text-gray-500';
        }
    };

    return (
        <Card className="h-[700px] flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                        <Terminal className="w-5 h-5" />
                        سجلات النظام (Live)
                    </CardTitle>
                    <div className="flex gap-2">
                        <Select value={levelFilter} onValueChange={setLevelFilter}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Level" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">الكل</SelectItem>
                                <SelectItem value="INFO">INFO</SelectItem>
                                <SelectItem value="WARNING">WARNING</SelectItem>
                                <SelectItem value="ERROR">ERROR</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            placeholder="بحث في السجلات..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-64"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
                <div className="h-full overflow-auto border-t">
                    <table className="w-full text-sm font-mono">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                            <tr>
                                <th className="p-2 text-start w-32 border-b">الوقت</th>
                                <th className="p-2 text-start w-24 border-b">المستوى</th>
                                <th className="p-2 text-start w-32 border-b">المصدر</th>
                                <th className="p-2 text-start border-b">الرسالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map((log: any, i: number) => {
                                // Handle backward compatibility if log is string
                                if (typeof log === 'string') return (
                                    <tr key={i} className="border-b hover:bg-muted/50">
                                        <td colSpan={4} className="p-2">{log}</td>
                                    </tr>
                                );

                                return (
                                    <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-2 text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                                        <td className={`p-2 font-bold ${getLevelColor(log.level)}`}>{log.level}</td>
                                        <td className="p-2 text-muted-foreground">{log.logger}</td>
                                        <td className="p-2 max-w-xl break-words">{log.message}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
};



const ManualImportForm = () => {
    const [path, setPath] = useState('');
    const [type, setType] = useState('movie');
    const [tmdbId, setTmdbId] = useState('');
    const [isFetching, setIsFetching] = useState(false);

    // Custom Metadata State
    const [title, setTitle] = useState('');
    const [overview, setOverview] = useState('');
    const [posterUrl, setPosterUrl] = useState('');
    const [backdropUrl, setBackdropUrl] = useState('');
    const [genres, setGenres] = useState('');
    const [year, setYear] = useState('');



    const handleFetchMetadata = async () => {
        if (!tmdbId) return;
        setIsFetching(true);
        try {
             
            const meta = await apiClient.fetchMetadata(parseInt(tmdbId), type as any);
            setTitle(meta.title || '');
            if (meta.overview) setOverview(meta.overview);
            if (meta.poster_url) setPosterUrl(meta.poster_url);
            if (meta.backdrop_url) setBackdropUrl(meta.backdrop_url);
            if (meta.genres) setGenres(meta.genres);
            if (meta.year) setYear(meta.year.toString());
            toast.success('تم جلب البيانات بنجاح');
         
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsFetching(false);
        }
    };

    const mutation = useMutation({
         
        mutationFn: () => apiClient.manualImport(path, type as any, {
            title,
            overview,
            poster_url: posterUrl,
            backdrop_url: backdropUrl,
            genres,
            year: year ? parseInt(year) : undefined
        }, tmdbId ? parseInt(tmdbId) : undefined),
        onSuccess: () => {
            toast.success('تم بدء الاستيراد بنجاح');
            setPath('');
            setTmdbId('');
            setTitle('');
            setOverview('');
            setPosterUrl('');
            setGenres('');
            setYear('');
        },
         
        onError: (err: any) => toast.error('فشل الاستيراد: ' + err.message)
    });

    return (
        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="space-y-2">
                <Label>مسار الملف أو المجلد (File/Folder Path)</Label>
                <Input
                    placeholder="C:\Movies\Example.mkv"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="dir-ltr text-left"
                />
            </div>

            <div className="space-y-2">
                <Label>النوع</Label>
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="movie">فيلم (Movie)</SelectItem>
                        <SelectItem value="series">مسلسل (Series)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="border-t pt-4 mt-4">
                <h3 className="mb-4 font-semibold text-muted-foreground">بيانات مخصصة (اختياري / Override)</h3>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>العنوان</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الفيلم/المسلسل" />
                    </div>
                    <div className="space-y-2">
                        <Label>السنة</Label>
                        <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" type="number" />
                    </div>
                </div>

                <div className="space-y-2 mt-2">
                    <Label>الوصف</Label>
                    <Textarea value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="قصة الفيلم..." rows={3} />
                </div>

                <div className="space-y-2 mt-2">
                    <Label>رابط البوستر</Label>
                    <Input value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} placeholder="https://..." dir="ltr" />
                </div>

                <div className="space-y-2 mt-2">
                    <Label>رابط الخلفية (Backdrop)</Label>
                    <Input value={backdropUrl} onChange={(e) => setBackdropUrl(e.target.value)} placeholder="https://..." dir="ltr" />
                </div>

                <div className="space-y-2 mt-2">
                    <Label>التصنيفات (Genres)</Label>
                    <Input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Action, Drama, Sci-Fi..." />
                </div>
            </div>

            <div className="border-t pt-4 mt-4">
                <div className="space-y-2">
                    <Label>TMDb ID (اختياري)</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="12345"
                            value={tmdbId}
                            onChange={(e) => setTmdbId(e.target.value)}
                            type="number"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleFetchMetadata}
                            disabled={!tmdbId || isFetching}
                            title="جلب البيانات"
                        >
                            {isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        إذا تم وضعه، سيتم جلب باقي البيانات الناقصة من TMDb تلقائياً.
                    </p>
                </div>
            </div>

            <Button
                className="w-full mt-4"
                onClick={() => mutation.mutate()}
                disabled={!path || mutation.isPending}
            >
                {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin ml-2" /> : <Database className="w-4 h-4 ml-2" />}
                استيراد
            </Button>
        </div>
    );
};

const CollectionsManager = () => {
    const [name, setName] = useState('');
    const [createIds, setCreateIds] = useState('');
     
    const [editCollection, setEditCollection] = useState<any>(null);

    // Manage Items Dialog
     
    const [manageItemsCollection, setManageItemsCollection] = useState<any>(null);
    const [manageAddIds, setManageAddIds] = useState('');
    const [manageRemoveIds, setManageRemoveIds] = useState('');

    const { data: collections, refetch } = useQuery({
        queryKey: ['collections'],
        queryFn: () => apiClient.getCollections()
    });

    const createMutation = useMutation({
        mutationFn: () => {
            const ids = createIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            return apiClient.createCollection(name, ids);
        },
        onSuccess: () => {
            toast.success('تم إنشاء المجموعة');
            setName('');
            setCreateIds('');
            refetch();
        },
         
        onError: (err: any) => toast.error(err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteCollection(id),
        onSuccess: () => {
            toast.success('تم حذف المجموعة');
            refetch();
        }
    });

    const updateMutation = useMutation({
         
        mutationFn: (vars: { id: number, data: any }) => apiClient.updateCollection(vars.id, vars.data),
        onSuccess: () => {
            toast.success('تم تحديث المجموعة');
            setEditCollection(null);
            refetch();
        },
         
        onError: (err: any) => toast.error(err.message)
    });

    const manageItemsMutation = useMutation({
        mutationFn: (vars: { id: number, add: string, remove: string }) => {
            const add = vars.add.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            const remove = vars.remove.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            return apiClient.manageCollectionItems(vars.id, { add_ids: add, remove_ids: remove });
        },
        onSuccess: () => {
            toast.success('تم تحديث العناصر');
            setManageItemsCollection(null);
            setManageAddIds('');
            setManageRemoveIds('');
            refetch();
        },
         
        onError: (err: any) => toast.error(err.message)
    });

    return (
        <div className="space-y-6">
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-sm">إنشاء مجموعة جديدة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            placeholder="اسم المجموعة (مثال: Harry Potter Collection)"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                        <Input
                            placeholder="Media IDs (كومة مفصولة: 1, 2, 3)"
                            value={createIds}
                            onChange={e => setCreateIds(e.target.value)}
                        />
                    </div>
                    <Button
                        disabled={!name || !createIds || createMutation.isPending}
                        onClick={() => createMutation.mutate()}
                        className="w-full"
                    >
                        {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء مجموعة مخصصة'}
                    </Button>
                </CardContent>
            </Card>

            <div className="h-[400px] overflow-y-auto border rounded-xl p-4 space-y-3 bg-muted/10">
                {collections?.length === 0 && <div className="text-center text-muted-foreground p-4">لا توجد مجموعات حالياً.</div>}

                {collections?.map((c: any) => (
                    <div key={c.id} className="flex justify-between items-center p-3 bg-card border rounded-lg hover:shadow-sm transition-all">
                        <div className="flex items-center gap-3">
                            {c.poster_url ? (
                                <img src={c.poster_url} alt={c.name} className="w-10 h-14 rounded object-cover shadow-sm bg-muted" />
                            ) : (
                                <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                                    <Database className="w-4 h-4 text-muted-foreground" />
                                </div>
                            )}
                            <div>
                                <h4 className="font-semibold">{c.name}</h4>
                                <span className="text-xs text-muted-foreground">ID: {c.id} • {c.media_count || c.movie_count} items</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setManageItemsCollection(c)}>
                                <Database className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditCollection(c)}>
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => {
                                if (confirm('هل أنت متأكد من حذف المجموعة؟ لن يتم حذف ملفات الميديا.')) deleteMutation.mutate(c.id);
                            }}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editCollection} onOpenChange={(open) => !open && setEditCollection(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>تعديل المجموعة: {editCollection?.name}</DialogTitle>
                    </DialogHeader>
                    {editCollection && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>الاسم</Label>
                                <Input
                                    value={editCollection.name}
                                    onChange={e => setEditCollection({ ...editCollection, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Poster URL</Label>
                                <Input
                                    value={editCollection.poster_url || ''}
                                    onChange={e => setEditCollection({ ...editCollection, poster_url: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Backdrop URL</Label>
                                <Input
                                    value={editCollection.backdrop_url || ''}
                                    onChange={e => setEditCollection({ ...editCollection, backdrop_url: e.target.value })}
                                />
                            </div>
                            <DialogFooter>
                                <Button onClick={() => updateMutation.mutate({ id: editCollection.id, data: editCollection })}>
                                    حفظ التعديلات
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Manage Items Dialog */}
            <Dialog open={!!manageItemsCollection} onOpenChange={(open) => !open && setManageItemsCollection(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إدارة العناصر: {manageItemsCollection?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-green-600">إضافة IDs (مفصولة بفاصلة)</Label>
                            <Input
                                placeholder="e.g. 101, 102"
                                value={manageAddIds}
                                onChange={e => setManageAddIds(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-red-600">إزالة IDs (مفصولة بفاصلة)</Label>
                            <Input
                                placeholder="e.g. 55, 60"
                                value={manageRemoveIds}
                                onChange={e => setManageRemoveIds(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button onClick={() => manageItemsMutation.mutate({
                                id: manageItemsCollection.id,
                                add: manageAddIds,
                                remove: manageRemoveIds
                            })}>
                                تنفيذ
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const DuplicatesTab = () => {
    const queryClient = useQueryClient();
    const { data: duplicates } = useQuery({
        queryKey: ['admin-duplicates'],
        queryFn: () => apiClient.getDuplicatesReport()
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteMedia(id),
        onSuccess: () => {
            toast.success('تم حذف الملف');
            queryClient.invalidateQueries({ queryKey: ['admin-duplicates'] });
        }
    });

    if (!duplicates) return <div>Loading...</div>;

    const { tmdb_duplicates = [], path_duplicates = [] } = duplicates;
    const hasDuplicates = tmdb_duplicates.length > 0 || path_duplicates.length > 0;

    return (
        <div className="space-y-6">
            {!hasDuplicates && (
                <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                    <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <h3 className="text-lg font-medium">نظيف تماماً!</h3>
                    <p>لا توجد ملفات مكررة في المكتبة.</p>
                </div>
            )}

            {path_duplicates.length > 0 && (
                <Card className="border-red-500/20">
                    <CardHeader>
                        <CardTitle className="text-red-500 flex items-center gap-2">
                            <Copy className="w-5 h-5" /> تكرار في المسار ({path_duplicates.length})
                        </CardTitle>
                        <CardDescription>ملفات بنفس المسار لكن تم إضافتها عدة مرات (خطأ خطير)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {path_duplicates.map((group: any, idx: number) => (
                            <div key={idx} className="p-4 bg-muted/30 rounded-lg border">
                                <div className="font-mono text-xs bg-muted p-2 rounded mb-3 break-all">{group.path}</div>
                                <div className="space-y-2">
                                    {group.items.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center p-2 bg-background rounded border">
                                            <div className="text-sm">
                                                <span className="font-bold">#{item.id}</span> - {item.title} ({item.quality || 'Unknown'})
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    if (confirm('حذف هذا الإصدار؟')) deleteMutation.mutate(item.id);
                                                }}
                                            >
                                                <Trash2 className="w-3 h-3 mr-2" /> حذف
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {tmdb_duplicates.length > 0 && (
                <Card className="border-yellow-500/20">
                    <CardHeader>
                        <CardTitle className="text-yellow-500 flex items-center gap-2">
                            <Copy className="w-5 h-5" /> تكرار في المحتوى (TMDb Duplicates) - {tmdb_duplicates.length} مجموعة
                        </CardTitle>
                        <CardDescription>ملفات مختلفة لنفس الفيلم/المسلسل (نسخ بجودات مختلفة)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {tmdb_duplicates.map((group: any) => (
                            <div key={`${group.type}-${group.tmdb_id}`} className="p-4 bg-muted/30 rounded-lg border">
                                <h4 className="font-bold mb-3 flex items-center gap-2">
                                    {group.items[0]?.title}
                                    <Badge variant="outline">{group.type}</Badge>
                                    <Badge variant="secondary">TMDb: {group.tmdb_id}</Badge>
                                </h4>
                                <div className="space-y-2">
                                    {group.items.sort((a: any, b: any) => (b.quality === '1080p' ? 1 : -1)).map((item: any) => (
                                        <div key={item.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-3 bg-background rounded border gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge>{item.quality || 'Unknown'}</Badge>
                                                    <span className="font-mono text-xs text-muted-foreground ml-2">{item.resolution || ''}</span>
                                                    {item.locked && <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">Locked</Badge>}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate font-mono" title={item.file_path}>
                                                    {item.file_path}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-blue-500 hover:text-blue-600"
                                                    onClick={() => window.open(`/player/${item.id}`, '_blank')}
                                                >
                                                    <Eye className="w-3 h-3 mr-2" /> معاينة
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => {
                                                        if (confirm(`حذف نسخة ${item.quality}؟`)) deleteMutation.mutate(item.id);
                                                    }}
                                                    disabled={deleteMutation.isPending}
                                                >
                                                    <Trash2 className="w-3 h-3 mr-2" /> حذف
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};


export default Admin;


