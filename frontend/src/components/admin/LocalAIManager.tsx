import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bot, CheckCircle2, XCircle, RefreshCw, Play, Trash2,
    Download, Cpu, MemoryStick, Zap, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ---------- API helpers (inline, not in api.ts to keep diff small) ----------
async function getOllamaStatus() {
    const res = await fetch('/api/ollama/status');
    return res.json();
}
async function ollamaSetModel(model: string) {
    const res = await fetch('/api/ollama/set-model', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
    });
    return res.json();
}
async function ollamaPull(model: string) {
    const res = await fetch('/api/ollama/pull', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
    });
    return res.json();
}
async function ollamaDelete(model: string) {
    const res = await fetch('/api/ollama/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
    });
    return res.json();
}
// ---------------------------------------------------------------------------

function ModelCard({
    model, isActive, isRunning, onSelect, onDelete
}: {
     
    model: any; isActive: boolean; isRunning: boolean;
    onSelect: () => void; onDelete: () => void;
}) {
    const sizeGB = model.size ? (model.size / 1e9).toFixed(1) : '?';
    const family = model.details?.family || model.name.split(':')[0];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${isActive
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-lg shadow-purple-500/10'
                    : 'bg-white/3 border-white/8 hover:border-white/20 hover:bg-white/5'
                }`}
        >
            {/* Status dot */}
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isRunning ? 'bg-emerald-400 animate-pulse' : isActive ? 'bg-purple-400' : 'bg-white/20'
                }`} />

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-white truncate">{model.name}</span>
                    {isActive && <Badge className="text-[10px] px-1.5 py-0 bg-purple-600/80 border-purple-500/40 text-white">ACTIVE</Badge>}
                    {isRunning && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600/80 border-emerald-500/40 text-white">LOADED</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{family}</span>
                    <span className="flex items-center gap-1"><MemoryStick className="w-3 h-3" />{sizeGB} GB</span>
                    {model.details?.parameter_size && (
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{model.details.parameter_size}</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {!isActive && (
                    <Button size="sm" variant="outline"
                        className="h-7 px-2.5 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
                        onClick={onSelect}
                    >
                        <Play className="w-3 h-3 mr-1" /> تفعيل
                    </Button>
                )}
                <Button size="icon" variant="ghost"
                    className="h-7 w-7 text-white/25 hover:text-red-400 hover:bg-red-500/10"
                    onClick={onDelete}
                    title="حذف الموديل"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </div>
        </motion.div>
    );
}

const POPULAR_MODELS = [
    { name: 'llama3.2', label: 'Llama 3.2 (3B) — موصى به', size: '~2 GB' },
    { name: 'llama3.2:1b', label: 'Llama 3.2 (1B) — الأسرع', size: '~1.3 GB' },
    { name: 'qwen2.5:3b', label: 'Qwen 2.5 (3B) — عربي ممتاز', size: '~2 GB' },
    { name: 'phi3:mini', label: 'Phi-3 Mini (3.8B) — JSON رائع', size: '~2.3 GB' },
    { name: 'mistral', label: 'Mistral (7B) — جودة عالية', size: '~4.1 GB' },
];

export function LocalAIManager() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [pullInput, setPullInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [pullingModel, setPullingModel] = useState('');

    const { data: status, isLoading, refetch } = useQuery({
        queryKey: ['ollama', 'status'],
        queryFn: getOllamaStatus,
        refetchInterval: 8000,
    });

    const setModelMutation = useMutation({
        mutationFn: ollamaSetModel,
        onSuccess: (_, model) => {
            toast({ title: `✅ الموديل النشط: ${model}` });
            qc.invalidateQueries({ queryKey: ['ollama', 'status'] });
            refetch();
        },
    });

    const pullMutation = useMutation({
        mutationFn: ollamaPull,
        onSuccess: (_, model) => {
            setPullingModel(model);
            toast({ title: `⬇️ جاري تحميل ${model}…`, description: 'سيظهر في القائمة بعد اكتمال التحميل' });
            setPullInput('');
            // Poll status every 5s for up to 10min
            const iv = setInterval(() => refetch(), 5000);
            setTimeout(() => { clearInterval(iv); setPullingModel(''); }, 600000);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: ollamaDelete,
        onSuccess: (_, model) => {
            toast({ title: `🗑️ تم حذف ${model}` });
            refetch();
        },
         
        onError: (e: any) => toast({ title: 'خطأ في الحذف', description: e.message, variant: 'destructive' }),
    });

    const isOnline = status?.running === true;
     
    const models: any[] = status?.models || [];
     
    const runningModels: string[] = (status?.running_models || []).map((m: any) => m.name);
    const activeModel: string = status?.active_model || 'llama3.2';

    return (
        <div className="space-y-6">
            {/* STATUS CARD */}
            <div className={`relative overflow-hidden rounded-2xl border p-6 ${isOnline
                    ? 'bg-gradient-to-br from-emerald-950/60 to-teal-950/40 border-emerald-500/20'
                    : 'bg-gradient-to-br from-red-950/60 to-rose-950/40 border-red-500/20'
                }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isOnline ? 'bg-emerald-500/20' : 'bg-red-500/20'
                            }`}>
                            <Bot className={`w-6 h-6 ${isOnline ? 'text-emerald-400' : 'text-red-400'}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-white">Ollama</h3>
                                {isLoading ? (
                                    <RefreshCw className="w-4 h-4 text-white/40 animate-spin" />
                                ) : isOnline ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-red-400" />
                                )}
                            </div>
                            <p className="text-sm text-white/50">
                                {isLoading ? 'جاري الفحص…'
                                    : isOnline
                                        ? `v${status.version} · ${models.length} موديل مثبت · ${runningModels.length} محمّل`
                                        : 'Ollama غير مشغل — شغّل Ollama من جهازك أو افتح cmd واكتب: ollama serve'}
                            </p>
                        </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => refetch()}
                        className="text-white/30 hover:text-white/60 hover:bg-white/8">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Active model pill */}
                {isOnline && (
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-xs text-white/40">الموديل النشط الآن:</span>
                        <span className="text-xs font-mono font-bold text-purple-300 bg-purple-500/15 border border-purple-500/25 px-2.5 py-1 rounded-full">
                            {activeModel}
                        </span>
                    </div>
                )}
            </div>

            {/* NOT RUNNING HELP */}
            {!isOnline && !isLoading && (
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-200/80 space-y-1">
                        <p className="font-semibold">كيف أشغّل Ollama؟</p>
                        <p>1. إذا كنت نزّلت Ollama من <code className="text-amber-300">ollama.com</code> — افتحه من قائمة ابدأ أو system tray.</p>
                        <p>2. أو افتح موجه الأوامر واكتب: <code className="font-mono bg-black/40 px-2 py-0.5 rounded text-amber-300">ollama serve</code></p>
                    </div>
                </div>
            )}

            {/* INSTALLED MODELS */}
            {isOnline && (
                <div>
                    <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">الموديلات المثبتة</h4>
                    {models.length === 0 ? (
                        <p className="text-sm text-white/30 text-center py-6">لا توجد موديلات مثبتة. حمّل موديلاً من الأسفل.</p>
                    ) : (
                        <div className="space-y-2">
                            {models.map((m: any) => (
                                <ModelCard
                                    key={m.name}
                                    model={m}
                                    isActive={m.name === activeModel || m.name.split(':')[0] === activeModel}
                                    isRunning={runningModels.some(r => r === m.name || r.startsWith(m.name))}
                                    onSelect={() => setModelMutation.mutate(m.name)}
                                    onDelete={() => {
                                        if (confirm(`حذف ${m.name}؟`)) deleteMutation.mutate(m.name);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* PULL A NEW MODEL */}
            {isOnline && (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">تحميل موديل جديد</h4>

                    {/* Quick suggestions */}
                    <button
                        onClick={() => setShowSuggestions(v => !v)}
                        className="flex items-center gap-2 text-xs text-purple-400 mb-3 hover:text-purple-300 transition-colors"
                    >
                        {showSuggestions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        موديلات مقترحة
                    </button>

                    <AnimatePresence>
                        {showSuggestions && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden mb-3"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-3">
                                    {POPULAR_MODELS.map(m => (
                                        <button
                                            key={m.name}
                                            onClick={() => setPullInput(m.name)}
                                            className="text-left p-3 rounded-xl border border-white/8 bg-white/3 hover:border-purple-500/40 hover:bg-purple-500/8 transition-all duration-200 group"
                                        >
                                            <div className="text-xs font-mono font-bold text-white group-hover:text-purple-300 truncate">{m.name}</div>
                                            <div className="text-xs text-white/40 mt-0.5">{m.label}</div>
                                            <div className="text-xs text-white/25 mt-0.5">{m.size}</div>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex gap-2">
                        <Input
                            value={pullInput}
                            onChange={e => setPullInput(e.target.value)}
                            placeholder="اسم الموديل مثلاً: llama3.2 أو mistral"
                            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/25 font-mono text-sm"
                            dir="ltr"
                            onKeyDown={e => e.key === 'Enter' && pullInput.trim() && pullMutation.mutate(pullInput.trim())}
                        />
                        <Button
                            disabled={!pullInput.trim() || pullMutation.isPending}
                            onClick={() => pullMutation.mutate(pullInput.trim())}
                            className="bg-gradient-to-br from-purple-600 to-blue-700 hover:from-purple-500 hover:to-blue-600 text-white border-0 gap-2"
                        >
                            <Download className="w-4 h-4" />
                            تحميل
                        </Button>
                    </div>

                    {pullingModel && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-amber-300">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            جاري تحميل <code className="font-mono">{pullingModel}</code> — قد يستغرق دقائق حسب الحجم…
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


