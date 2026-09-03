import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { Search, MonitorPlay, Tv, History, Star, Play, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Media } from '@/types/media';

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    // Toggle the menu when ⌘K or Ctrl+K is pressed
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Search Logic with Debounce
    const { data: searchResponse, isLoading } = useQuery({
        queryKey: ['command-search', searchQuery],
        queryFn: () => apiClient.getAllMedia({ search: searchQuery }),
        enabled: searchQuery.trim().length > 1, // Only search if 2+ chars
        staleTime: 60000,
    });

    const results = searchResponse?.data || [];
    const related = searchResponse?.related || [];

    const handleSelectMovie = (id: string | number) => {
        setOpen(false);
        navigate(`/details/${id}`);
    };

    const handleSelectRoute = (route: string) => {
        setOpen(false);
        navigate(route);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <Command
                className="w-full max-w-2xl bg-zinc-950/80 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col scale-in-95 animate-in slide-in-from-bottom-5 duration-300"
                shouldFilter={false} // We handle filtering via API
            >
                <div className="flex items-center px-4 py-4 border-b border-white/10">
                    <Search className="w-6 h-6 text-muted-foreground mr-3" />
                    <Command.Input
                        autoFocus
                        placeholder="ابحث عن فيلم، دقة، ممثل، مخرج..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        className="flex-1 bg-transparent outline-none text-xl md:text-2xl placeholder:text-muted-foreground/50 text-white font-medium"
                    />
                    <kbd className="hidden md:inline-flex items-center gap-1 rounded border border-white/20 bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ml-3">
                        ESC
                    </kbd>
                </div>

                <Command.List className="max-h-[50vh] xl:max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-2">

                    {!isLoading && searchQuery && results.length === 0 && related.length === 0 && (
                        <Command.Empty className="py-14 text-center text-muted-foreground text-lg">
                            لم يتم العثور على أي نتائج لـ "{searchQuery}"
                        </Command.Empty>
                    )}

                    {isLoading && (
                        <div className="py-14 flex items-center justify-center text-primary animate-pulse flex-col gap-3">
                            <MonitorPlay className="w-8 h-8 opacity-50" />
                            <span className="text-sm font-medium">جاري سحب البيانات...</span>
                        </div>
                    )}

                    {/* Quick Navigation Rules (Shown when input is empty) */}
                    {!searchQuery && (
                        <Command.Group heading="انتقال سريع" className="p-2 text-xs font-semibold text-muted-foreground mb-2">
                            <Command.Item
                                onSelect={() => handleSelectRoute('/')}
                                className="flex items-center px-3 py-3 rounded-xl hover:bg-white/10 cursor-pointer mt-1 text-base text-zinc-300 transition-colors"
                            >
                                <MonitorPlay className="w-5 h-5 mr-3 text-primary" />
                                الصفحة الرئيسية
                            </Command.Item>
                            <Command.Item
                                onSelect={() => handleSelectRoute('/movies')}
                                className="flex items-center px-3 py-3 rounded-xl hover:bg-white/10 cursor-pointer mt-1 text-base text-zinc-300 transition-colors"
                            >
                                <Play className="w-5 h-5 mr-3 text-blue-400" />
                                مكتبة الأفلام
                            </Command.Item>
                            <Command.Item
                                onSelect={() => handleSelectRoute('/series')}
                                className="flex items-center px-3 py-3 rounded-xl hover:bg-white/10 cursor-pointer mt-1 text-base text-zinc-300 transition-colors"
                            >
                                <Tv className="w-5 h-5 mr-3 text-emerald-400" />
                                المسلسلات
                            </Command.Item>
                            <Command.Item
                                onSelect={() => handleSelectRoute('/history')}
                                className="flex items-center px-3 py-3 rounded-xl hover:bg-white/10 cursor-pointer mt-1 text-base text-zinc-300 transition-colors"
                            >
                                <History className="w-5 h-5 mr-3 text-purple-400" />
                                متابعة المشاهدة
                            </Command.Item>
                            <Command.Item
                                onSelect={() => handleSelectRoute('/settings')}
                                className="flex items-center px-3 py-3 rounded-xl hover:bg-white/10 cursor-pointer mt-1 text-base text-zinc-300 transition-colors"
                            >
                                <Settings className="w-5 h-5 mr-3 text-zinc-400" />
                                الإعدادات والتحكم
                            </Command.Item>
                        </Command.Group>
                    )}

                    {/* Exact Matches */}
                    {results.length > 0 && (
                        <Command.Group heading="تطابق مباشر" className="p-2 text-xs font-semibold text-primary mb-2">
                            {results.map((media: Media) => (
                                <Command.Item
                                    key={`exact-${media.id}`}
                                    onSelect={() => handleSelectMovie(media.id)}
                                    className="flex items-center gap-4 px-3 py-2 rounded-xl hover:bg-white/10 data-[selected=true]:bg-white/10 cursor-pointer text-base text-zinc-200 transition-all mt-1 group"
                                >
                                    {/* Thumbnail */}
                                    <div className="w-12 h-16 rounded overflow-hidden shrink-0 bg-zinc-800 relative">
                                        <img
                                            src={apiClient.getImageUrl(media.poster_url)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            onError={(e) => (e.currentTarget.src = '/assets/no_poster.png')}
                                        />
                                        <div className="absolute inset-0 bg-black/40 group-hover:opacity-0 transition-opacity" />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-white truncate text-lg leading-tight">{media.title}</h4>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-medium">
                                            {media.year && <span>{media.year}</span>}
                                            {media.quality && (
                                                <span className="px-1.5 rounded bg-primary/20 text-primary border border-primary/30">
                                                    {media.quality}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {/* Semantic Recommendations (AI) */}
                    {related.length > 0 && (
                        <Command.Group heading="مقترحات إضافية" className="p-2 text-xs font-semibold text-purple-400 mt-4 border-t border-white/5 pt-4">
                            {related.map((media: Media) => (
                                <Command.Item
                                    key={`related-${media.id}`}
                                    onSelect={() => handleSelectMovie(media.id)}
                                    className="flex items-center gap-4 px-3 py-2 rounded-xl hover:bg-purple-500/10 data-[selected=true]:bg-purple-500/10 cursor-pointer text-base text-zinc-300 transition-all mt-1 group"
                                >
                                    <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-zinc-800 opacity-80 group-hover:opacity-100 transition-opacity">
                                        <img
                                            src={apiClient.getImageUrl(media.poster_url)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-zinc-200 truncate">{media.title}</h4>
                                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                        {/* @ts-ignore */}
                                        {media.relevance_score && (
                                            <span className="text-xs text-purple-400 mt-0.5 inline-block">
                                                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                                {/* @ts-ignore */}
                                                ~ {Math.round(media.relevance_score * 100)}% تطابق الذكاء الدلالي
                                            </span>
                                        )}
                                    </div>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}
                </Command.List>

                <div className="bg-muted/50 p-3 border-t border-white/10 text-xs text-center text-muted-foreground flex justify-between px-6">
                    <span>استخدم الأسهم ↕️ للتنقل</span>
                    <span>اضغط Enter للفتح</span>
                </div>
            </Command>
        </div>
    );
}


