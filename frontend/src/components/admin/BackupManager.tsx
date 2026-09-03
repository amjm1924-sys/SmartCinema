import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Server, ShieldCheck, Clock, RefreshCw, AlertCircle, Play } from 'lucide-react';
import { toast } from 'sonner';

export function BackupManager() {
    const queryClient = useQueryClient();

    // Fetch backup status every 2 seconds if a backup is currently running
    const { data: status, refetch } = useQuery({
        queryKey: ['backup-status'],
        queryFn: () => apiClient.getBackupStatus(),
        refetchInterval: (query) => query.state.data?.is_running ? 1000 : 30000, // Fast poll when running, slow poll otherwise
    });

    const startBackupMutation = useMutation({
        mutationFn: () => apiClient.startBackup(),
        onSuccess: (data) => {
            if (data.error) {
                toast.error(data.error);
            } else {
                toast.success('Backup sequence initiated!');
                queryClient.invalidateQueries({ queryKey: ['backup-status'] });
            }
        },
        onError: () => toast.error('Failed to start backup.')
    });

    const isRunning = status?.is_running || false;
    const progressLine = status?.progress_line || '';
    const lastBackupTime = status?.last_backup_time ? new Date(status.last_backup_time).toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' }) : 'لم يتم عمل نسخ احتياطي بعد';

    return (
        <Card className="border-primary/20 bg-black/20 shadow-lg relative overflow-hidden">

            {/* Background glowing effect if running */}
            {isRunning && (
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full animate-pulse pointer-events-none" />
            )}

            <CardHeader className="border-b border-primary/10">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <ShieldCheck className="w-6 h-6 text-primary" />
                            حماية البيانات المتقدمة (Ultra-Fast Backup)
                        </CardTitle>
                        <CardDescription className="mt-1">
                            نظام نسخ احتياطي صاروخي (RoboCopy Multi-Threaded) يقوم بنسخ كافة ملفات الموقع تلقائياً إلى أقراص خارجية مخصصة.
                        </CardDescription>
                    </div>
                    {isRunning ? (
                        <Badge variant="default" className="bg-primary/20 text-primary border-primary gap-2 animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            جاري النسخ...
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" /> مستعد
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">

                {/* Backup Destinations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-white/10 bg-card p-4 rounded-xl flex items-center gap-4 relative overflow-hidden group">
                        <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                            <HardDrive className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">القرص الاحتياطي الأول</p>
                            <p className="font-bold font-mono">H:\SmartCinema</p>
                        </div>
                        {status?.current_target?.includes('H:') && (
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />
                        )}
                    </div>

                    <div className="border border-white/10 bg-card p-4 rounded-xl flex items-center gap-4 relative overflow-hidden group">
                        <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                            <Server className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">القرص الاحتياطي الثاني</p>
                            <p className="font-bold font-mono">E:\SmartCinema</p>
                        </div>
                        {status?.current_target?.includes('E:') && (
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-purple-500 animate-pulse" />
                        )}
                    </div>
                </div>

                {/* Progress Terminal (Visible only when running) */}
                {isRunning && (
                    <div className="bg-neutral-950 rounded-xl p-4 border border-white/5 font-mono text-xs overflow-hidden">
                        <div className="flex items-center gap-2 text-primary mb-2">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>RoboCopy Engine /MT:32 Active</span>
                        </div>
                        <p className="text-green-400 opacity-90 truncate whitespace-nowrap" dir="ltr">
                            {progressLine || 'Scanning directories...'}
                        </p>
                    </div>
                )}

                {/* Details */}
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border/50">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p>
                        يعمل النظام بشكل تلقائي كل 24 ساعة. يتجاهل المجلدات الخفية والمكتبات البرمجية العملاقة (مثل node_modules) لضمان النسخ في ثوانٍ معدودة.
                    </p>
                </div>
            </CardContent>

            <CardFooter className="border-t border-border/50 bg-black/10 flex items-center justify-between p-4">
                <div className="text-sm">
                    <span className="text-muted-foreground">تاريخ آخر نسخة ناجحة: </span>
                    <span className="font-semibold text-foreground" dir="ltr">{lastBackupTime}</span>
                </div>

                <Button
                    onClick={() => startBackupMutation.mutate()}
                    disabled={isRunning || startBackupMutation.isPending}
                    className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
                >
                    {isRunning ? (
                        <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            جاري العمل...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4 fill-current" />
                            بدء النسخ الآن 🚀
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
}
