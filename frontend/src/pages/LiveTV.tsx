import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import { Tv, Play, Plus, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const LiveTV = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [selectedGroup, setSelectedGroup] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newPlaylistUrl, setNewPlaylistUrl] = useState('');

    // Fetch Groups
    const { data: groups = [] } = useQuery({
        queryKey: ['iptv', 'groups'],
        queryFn: () => apiClient.getIptvGroups(),
    });

    // Fetch Channels
    const { data: channels = [], isLoading } = useQuery({
        queryKey: ['iptv', 'channels', selectedGroup, searchQuery],
        queryFn: () => apiClient.getIptvChannels({ group: selectedGroup, search: searchQuery, limit: 100 }),
    });

    // Add Playlist Mutation
    const addMutation = useMutation({
        mutationFn: (url: string) => apiClient.addPlaylist({ name: 'User Playlist', url }),
        onSuccess: (data) => {
            toast.success(`تم استيراد ${data.count} قناة بنجاح`);
            setIsAddOpen(false);
            setNewPlaylistUrl('');
            queryClient.invalidateQueries({ queryKey: ['iptv'] });
        },
        onError: () => toast.error('فشل استيراد القائمة'),
    });

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <main className="container mx-auto px-4 py-8 flex gap-6 h-[calc(100vh-80px)]">

                {/* Sidebar: Groups */}
                <aside className="w-64 shrink-0 glass-panel p-4 overflow-y-auto h-full hidden md:block">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-lg flex items-center gap-2">
                            <Tv className="w-5 h-5 text-primary" />
                            القنوات
                        </h2>
                        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                            <DialogTrigger asChild>
                                <Button size="icon" variant="ghost"><Plus className="w-4 h-4" /></Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader><DialogTitle>إضافة ملف M3U</DialogTitle></DialogHeader>
                                <div className="space-y-4 pt-4">
                                    <Input
                                        placeholder="https://example.com/playlist.m3u"
                                        value={newPlaylistUrl}
                                        onChange={(e) => setNewPlaylistUrl(e.target.value)}
                                        dir="ltr"
                                    />
                                    <Button onClick={() => addMutation.mutate(newPlaylistUrl)} disabled={addMutation.isPending} className="w-full">
                                        {addMutation.isPending ? 'جاري الاستيراد...' : 'استيراد'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-1">
                        <Button
                            variant={selectedGroup === 'All' ? 'secondary' : 'ghost'}
                            className="w-full justify-start"
                            onClick={() => setSelectedGroup('All')}
                        >
                            الكل
                        </Button>
                        {groups.map((g: any) => (
                            <Button
                                key={g.name}
                                variant={selectedGroup === g.name ? 'secondary' : 'ghost'}
                                className="w-full justify-start justify-between"
                                onClick={() => setSelectedGroup(g.name)}
                            >
                                <span className="truncate">{g.name || 'Uncategorized'}</span>
                                <span className="text-xs opacity-50">{g.count}</span>
                            </Button>
                        ))}
                    </div>
                </aside>

                {/* Main: Channel Grid */}
                <div className="flex-1 overflow-y-auto h-full pb-20">
                    <div className="flex gap-4 mb-6 sticky top-0 bg-background/80 backdrop-blur-md z-10 p-2">
                        <Input
                            placeholder="بحث عن قناة..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="max-w-md"
                        />
                        <div className="md:hidden">
                            {/* Mobile Group Selector could go here */}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <RefreshCw className="w-8 h-8 animate-spin opacity-50" />
                        </div>
                    ) : channels.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <Tv className="w-20 h-20 mx-auto mb-4" />
                            <p>لا توجد قنوات. أضف ملف M3U للبدء.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-4">
                            {channels.map((ch: any) => (
                                <div
                                    key={ch.id}
                                    onClick={() => {
                                        // Navigate to player with state for immediate playback
                                        navigate(`/player/iptv-${ch.id}`, { state: { streamUrl: ch.stream_url, title: ch.name } });
                                    }}
                                    className="group relative aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer border border-transparent hover:border-primary transition-all"
                                >
                                    {ch.logo_url ? (

                                        <img src={ch.logo_url} alt={ch.name} className="w-full h-full object-contain p-4 bg-black/20" onError={(e) => (e.target as any).src = ''} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-card">
                                            <Tv className="w-10 h-10 opacity-20" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Play className="w-12 h-12 fill-white text-white" />
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                                        <p className="font-bold text-sm truncate text-white">{ch.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default LiveTV;


