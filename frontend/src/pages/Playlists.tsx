import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { ListVideo, Plus, Trash2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import MediaCard from '@/components/media/MediaCard';
import { toast } from 'sonner';

const Playlists = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isAiCreateOpen, setIsAiCreateOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');

    // Fetch Playlists
    const { data: playlists = [], isLoading } = useQuery({
        queryKey: ['playlists'],
        queryFn: () => apiClient.getPlaylists(),
    });

    // Fetch details when a playlist is selected
    const { data: playlistDetails = {} } = useQuery({
        queryKey: ['playlist', selectedPlaylist?.id],
        queryFn: () => apiClient.getPlaylistDetails(selectedPlaylist.id),
        enabled: !!selectedPlaylist,
    });

    // Create Playlist Mutation
    const createMutation = useMutation({
        mutationFn: (name: string) => apiClient.createPlaylist(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            setIsCreateOpen(false);
            setNewPlaylistName('');
            toast.success('تم إنشاء القائمة بنجاح');
        },
        onError: () => toast.error('فشل إنشاء القائمة'),
    });

    // Delete Playlist Mutation
    const deleteMutation = useMutation({
        mutationFn: (id: number) => apiClient.deletePlaylist(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            setSelectedPlaylist(null);
            toast.success('تم حذف القائمة');
        },
    });

    // Remove Item Mutation
    const removeItemMutation = useMutation({
        mutationFn: ({ playlistId, mediaId }: { playlistId: number; mediaId: number }) =>
            apiClient.removeFromPlaylist(playlistId, mediaId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlist', selectedPlaylist?.id] });
            queryClient.invalidateQueries({ queryKey: ['playlists'] }); // Update counts
            toast.success('تم إزالة العنصر من القائمة');
        },
        onError: () => toast.error('فشل إزالة العنصر'),
    });

    const handleCreate = () => {
        if (!newPlaylistName.trim()) return;
        createMutation.mutate(newPlaylistName);
    };

    const aiCreateMutation = useMutation({
        mutationFn: (prompt: string) => apiClient.generateAIPlaylist(prompt),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            setIsAiCreateOpen(false);
            setAiPrompt('');
            toast.success('تم إنشاء القائمة بالذكاء الاصطناعي بنجاح');
        },
        onError: () => toast.error('فشل إنشاء القائمة بالذكاء الاصطناعي'),
    });

    const handleAiCreate = () => {
        if (!aiPrompt.trim()) return;
        aiCreateMutation.mutate(aiPrompt);
    };

    const handleDelete = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (confirm('هل أنت متأكد من حذف هذه القائمة؟')) {
            deleteMutation.mutate(id);
        }
    };

    const handleRemoveItem = (e: React.MouseEvent, mediaId: number) => {
        e.stopPropagation();
        if (selectedPlaylist && confirm('هل تريد إزالة هذا العنصر من القائمة؟')) {
            removeItemMutation.mutate({ playlistId: selectedPlaylist.id, mediaId });
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />
            <main className="container mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <ListVideo className="w-8 h-8 text-primary" />
                        قوائم التشغيل (Playlists)
                    </h1>
                    <div className="flex gap-2">
                        <Button onClick={() => setIsAiCreateOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-lg">
                            إنشاء قائمة بالذكاء الاصطناعي ✨
                        </Button>
                        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            قائمة جديدة
                        </Button>
                    </div>
                </div>

                {isLoading ? (
                    <div>Loading...</div>
                ) : playlists.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <ListVideo className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>لا توجد قوائم تشغيل بعد.</p>
                        <Button variant="link" onClick={() => setIsCreateOpen(true)}>
                            أنشئ أول قائمة لك
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 gap-6">
                        {playlists.map((pl: any) => (
                            <div
                                key={pl.id}
                                onClick={() => setSelectedPlaylist(pl)}
                                className="group cursor-pointer"
                            >
                                <div className="aspect-[2/3] rounded-lg overflow-hidden relative shadow-lg mb-2 border border-transparent group-hover:border-primary transition-all bg-card/50">
                                    {pl.poster_url ? (
                                        <img
                                            src={pl.poster_url}
                                            alt={pl.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"

                                            onError={(e) => (e.target as any).src = '/placeholder.png'}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-muted/20">
                                            <ListVideo className="w-12 h-12 opacity-20" />
                                        </div>
                                    )}

                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded shadow">
                                        {pl.item_count} عناصر
                                    </div>

                                    <button
                                        onClick={(e) => handleDelete(e, pl.id)}
                                        className="absolute top-2 left-2 p-1.5 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>

                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play className="w-10 h-10 text-white fill-white" />
                                    </div>
                                </div>
                                <h3 className="font-bold text-center truncate">{pl.name}</h3>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Create Playlist Details Modal */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إنشاء قائمة تشغيل جديدة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">اسم القائمة</Label>
                            <Input
                                id="name"
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                                placeholder="مثلاً: أفلام مفضلة"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>إلغاء</Button>
                        <Button onClick={handleCreate}>إنشاء</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create AI Playlist Dialog */}
            <Dialog open={isAiCreateOpen} onOpenChange={setIsAiCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            إنشاء قائمة بالذكاء الاصطناعي ✨
                        </DialogTitle>
                        <DialogDescription>
                            صف القائمة التي تريدها، وسيقوم الذكاء الاصطناعي باختيار أفضل الأفلام والمسلسلات من مكتبتك!
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="ai-prompt">ماذا تريد أن تشاهد؟</Label>
                            <Textarea
                                id="ai-prompt"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="مثلاً: اعمل لي قائمة أفلام رعب غامضة لسهرة نهاية الأسبوع"
                                rows={4}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAiCreateOpen(false)} disabled={aiCreateMutation.isPending}>إلغاء</Button>
                        <Button onClick={handleAiCreate} disabled={aiCreateMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {aiCreateMutation.isPending ? 'جاري اختيار الأفلام بالذكاء الاصطناعي...' : 'توليد ✨'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Playlist Details Modal */}
            <Dialog open={!!selectedPlaylist} onOpenChange={(open) => !open && setSelectedPlaylist(null)}>
                <DialogContent className="max-w-5xl h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            {selectedPlaylist?.name}
                            <span className="text-sm font-normal text-muted-foreground">
                                ({playlistDetails?.items?.length || 0} عناصر)
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    {playlistDetails?.items?.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            القائمة فارغة. أضف بعض الأفلام!
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
                            {playlistDetails?.items?.map((item: any) => (
                                <div key={item.id} className="relative group">
                                    <MediaCard media={item} />
                                    <button
                                        onClick={(e) => handleRemoveItem(e, item.id)}
                                        className="absolute top-2 left-2 z-10 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg transform scale-90 hover:scale-100"
                                        title="إزالة من القائمة"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Playlists;


