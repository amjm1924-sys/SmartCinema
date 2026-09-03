
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, RefreshCw, Activity, Zap, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Assuming utils exists

export const AISettings = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [newKey, setNewKey] = useState('');
    const [provider, setProvider] = useState('gemini');

    const { data: keys = [], isLoading } = useQuery({
        queryKey: ['ai', 'status'],
        queryFn: () => apiClient.getAIStatus(),
    });

    const addKeyMutation = useMutation({
        mutationFn: () => apiClient.addAIKey(provider, newKey),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai', 'status'] });
            setNewKey('');
            toast({ title: 'Success', description: 'API Key added successfully' });
        },
        onError: () => toast({ title: 'Error', description: 'Failed to add key', variant: 'destructive' })
    });

    const deleteKeyMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteAIKey(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai', 'status'] });
            toast({ title: 'Deleted', description: 'API Key removed' });
        }
    });

     
    const totalTokens = keys.reduce((acc: number, key: any) => acc + (key.total_tokens_used || 0), 0);

    return (
        <div className="space-y-8">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-full text-primary">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Total Tokens Used</p>
                        <p className="text-2xl font-bold font-mono">{totalTokens.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex items-center gap-4">
                    <div className="p-3 bg-green-500/10 rounded-full text-green-500">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Active Keys</p>
                        <p className="text-2xl font-bold font-mono">{keys.filter((k: any) => k.is_active).length}</p>
                    </div>
                </div>
                <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex items-center gap-4">
                    <div className="p-3 bg-red-500/10 rounded-full text-red-500">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Errors</p>
                        <p className="text-2xl font-bold font-mono">{keys.reduce((acc: number, k: any) => acc + (k.error_count || 0), 0)}</p>
                    </div>
                </div>
            </div>

            {/* Keys Management */}
            <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">API Keys & Providers</h2>
                    <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['ai'] })}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>

                <div className="flex gap-2 mb-6 p-4 bg-muted/20 rounded-lg">
                    <Select value={provider} onValueChange={setProvider}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="gemini">Google Gemini</SelectItem>
                            <SelectItem value="groq">Groq</SelectItem>
                            <SelectItem value="openrouter">OpenRouter</SelectItem>
                            <SelectItem value="together">Together AI</SelectItem>
                            <SelectItem value="huggingface">HuggingFace</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        type="password"
                        placeholder="Enter API Key"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="flex-1"
                    />
                    <Button onClick={() => addKeyMutation.mutate()} disabled={!newKey}>
                        <Plus className="w-4 h-4 mr-2" /> Add Key
                    </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Tokens Used</TableHead>
                                <TableHead>Last Used</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-4">Loading keys...</TableCell></TableRow>
                            ) : keys.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No API keys configured</TableCell></TableRow>
                            ) : (
                                 
                                keys.map((key: any) => (
                                    <TableRow key={key.id}>
                                        <TableCell align="left">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="uppercase text-xs font-bold w-24 justify-center">
                                                    {key.provider}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell align="left">
                                            {key.error_count > 0 ? (
                                                <Badge variant="destructive" className="gap-1"><ShieldAlert className="w-3 h-3" /> Error ({key.error_count})</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 gap-1">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Active
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell align="left" className="font-mono">{key.total_tokens_used?.toLocaleString() || 0}</TableCell>
                                        <TableCell align="left" className="text-sm text-muted-foreground">
                                            {key.last_used ? new Date(key.last_used).toLocaleString() : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => deleteKeyMutation.mutate(key.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};


