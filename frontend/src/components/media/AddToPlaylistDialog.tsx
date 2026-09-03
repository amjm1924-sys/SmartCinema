import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Plus, Check, ListVideo } from 'lucide-react';
import { toast } from 'sonner';

interface AddToPlaylistDialogProps {
    mediaId: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const AddToPlaylistDialog = ({ mediaId, open, onOpenChange }: AddToPlaylistDialogProps) => {
    const queryClient = useQueryClient();

    const { data: playlists = [] } = useQuery({
        queryKey: ['playlists'],
        queryFn: () => apiClient.getPlaylists(),
        enabled: open,
    });

    const mutation = useMutation({
        mutationFn: ({ playlistId, mediaId }: { playlistId: number, mediaId: number }) =>
            apiClient.addToPlaylist(playlistId, mediaId),
        onSuccess: () => {
            toast.success('تمت الإضافة للقائمة');
            onOpenChange(false);
        },
        onError: () => toast.error('فشل الإضافة'),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>إضافة إلى قائمة تشغيل</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-4 max-h-[60vh] overflow-y-auto">
                    {playlists.length === 0 ? (
                        <div className="text-center text-muted-foreground p-4">
                            لا توجد قوائم. <a href="/playlists" className="underline">أنشئ قائمة أولاً</a>.
                        </div>
                    ) : (
                         
                        playlists.map((pl: any) => (
                            <Button
                                key={pl.id}
                                variant="outline"
                                className="w-full justify-start gap-3 h-14"
                                onClick={() => mutation.mutate({ playlistId: pl.id, mediaId })}
                            >
                                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                                    {pl.poster_url ? (
                                        <img src={pl.poster_url} className="w-full h-full object-cover" />
                                    ) : (
                                        <ListVideo className="w-5 h-5 opacity-50" />
                                    )}
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="font-bold">{pl.name}</span>
                                    <span className="text-xs text-muted-foreground">{pl.item_count} عناصر</span>
                                </div>
                            </Button>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AddToPlaylistDialog;


