import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, ArrowRight, Check, AlertTriangle, Loader2, FolderOpen, Play } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Proposal {
    original_path: string;
    new_path: string;
    original_name: string;
    new_name: string;
    type: 'movie' | 'episode' | 'unknown' | 'error';
    status: 'ready' | 'conflict' | 'error' | 'unchanged';
    message?: string;
    result?: 'success' | 'error';
}

interface PreviewData {
    total_files: number;
    preview_count: number;
    proposals: Proposal[];
}

export const FileRenamer = () => {
    const [path, setPath] = useState('');
    const [data, setData] = useState<PreviewData | null>(null);
    const { toast } = useToast();

    const previewMutation = useMutation({
        mutationFn: (path: string) => apiClient.previewRename(path),
        onSuccess: (data) => {
            setData(data);
            if (data.proposals.length === 0) {
                toast({ title: 'No files found', description: 'No suitable video files found in this directory.', variant: 'default' });
            }
        },
         
        onError: (err: any) => {
            toast({ title: 'Error', description: err.message || 'Failed to scan directory', variant: 'destructive' });
        }
    });

    const executeMutation = useMutation({
         
        mutationFn: (operations: any[]) => apiClient.executeRename(operations),
        onSuccess: (res) => {
            toast({ title: 'Success', description: res.message || 'Files renamed successfully' });
            setData(null); // Reset
        },
         
        onError: (err: any) => {
            toast({ title: 'Execution Failed', description: err.message, variant: 'destructive' });
        }
    });

    const handlePreview = () => {
        if (!path.trim()) return;
        previewMutation.mutate(path);
    };

    const handleExecute = () => {
        if (!data || !data.proposals) return;
        const validOps = data.proposals.filter(p => p.status === 'ready');
        if (confirm(`Are you sure you want to rename ${validOps.length} files? This cannot be undone.`)) {
            executeMutation.mutate(validOps);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ready': return 'text-green-500';
            case 'conflict': return 'text-red-500';
            case 'unchanged': return 'text-gray-500';
            case 'error': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-panel p-6">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <FileText className="w-6 h-6 text-primary" />
                    Smart File Renamer
                </h2>

                <Alert className="mb-6 bg-yellow-500/10 border-yellow-500/20 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning</AlertTitle>
                    <AlertDescription>
                        This tool will rename files on your hard drive. Please double-check the preview before executing.
                    </AlertDescription>
                </Alert>

                <div className="flex gap-4 items-end mb-6">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Directory Path</label>
                        <Input
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            placeholder="E:\Movies\My Messy Folder"
                            className="font-mono"
                        />
                    </div>
                    <Button
                        onClick={handlePreview}
                        disabled={previewMutation.isPending || !path.trim()}
                        className="gap-2"
                    >
                        {previewMutation.isPending ? <Loader2 className="animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                        Scan & Preview
                    </Button>
                </div>

                {data && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>Found: <strong className="text-foreground">{data.total_files}</strong></span>
                                <span>Previewing: <strong className="text-foreground">{data.preview_count}</strong></span>
                            </div>

                            <Button
                                onClick={handleExecute}
                                disabled={executeMutation.isPending || data.proposals.filter(p => p.status === 'ready').length === 0}
                                variant={data.proposals.some(p => p.status === 'ready') ? "default" : "secondary"}
                                className="gap-2"
                            >
                                {executeMutation.isPending ? <Loader2 className="animate-spin" /> : <Play className="w-4 h-4" />}
                                Rename Files
                            </Button>
                        </div>

                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">Type</TableHead>
                                        <TableHead>Original Name</TableHead>
                                        <TableHead className="w-[30px]"></TableHead>
                                        <TableHead>New Name</TableHead>
                                        <TableHead className="w-[100px]">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.proposals.map((item, idx) => (
                                        <TableRow key={idx} className={item.status === 'unchanged' ? 'opacity-50' : ''}>
                                            <TableCell>
                                                <Badge variant="outline" className="w-16 justify-center">
                                                    {item.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground dir-ltr">
                                                {item.original_name}
                                            </TableCell>
                                            <TableCell>
                                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                            </TableCell>
                                            <TableCell className={cn("font-mono text-xs font-bold dir-ltr",
                                                item.new_name !== item.original_name ? "text-primary" : "text-muted-foreground"
                                            )}>
                                                {item.new_name}
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn("text-xs font-bold flex items-center gap-1", getStatusColor(item.status))}>
                                                    {item.status === 'ready' && <Check className="w-3 h-3" />}
                                                    {item.status.toUpperCase()}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


