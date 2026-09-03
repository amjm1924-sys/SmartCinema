import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import { useNavigate } from 'react-router-dom';
import { Layers, Film } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MediaCard from '@/components/media/MediaCard';

const Collections = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const collectionIdFromUrl = searchParams.get('id');

    const [selectedCollection, setSelectedCollection] = useState<any>(null);

    // Fetch Manual/TMDB Collections
    const { data: collections = [], isLoading } = useQuery({
        queryKey: ['collections'],
        queryFn: () => apiClient.getCollections(),
    });

    // Fetch Smart Collections
    const { data: smartCollections = [], isLoading: isSmartLoading } = useQuery({
        queryKey: ['collections', 'smart'],
        queryFn: () => apiClient.getSmartCollections(),
    });

    // Auto-select collection from URL
    useEffect(() => {
        if (collectionIdFromUrl && collections.length > 0) {

            const target = collections.find((c: any) => c.id.toString() === collectionIdFromUrl.toString());
            if (target) {
                setSelectedCollection(target);
            }
        }
    }, [collectionIdFromUrl, collections]);

    // Fetch details when a collection is selected
    const { data: collectionData, isLoading: isDetailsLoading } = useQuery({
        queryKey: ['collection', selectedCollection?.id, selectedCollection?.type],
        queryFn: () => {
            if (selectedCollection?.type === 'smart') {
                return apiClient.getSmartCollectionItems(selectedCollection.id).then(items => ({
                    name: selectedCollection.name,
                    media: items
                }));
            }
            return apiClient.getCollectionDetails(selectedCollection.id);
        },
        enabled: !!selectedCollection,
    });

    const movies = collectionData?.media || [];

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />
            <main className="container mx-auto px-4 py-8 mt-20">

                {/* --- Smart Collections Section --- */}
                <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <span className="text-primary">✨</span>
                    القوائم الذكية
                </h1>

                {isSmartLoading ? (
                    <div className="flex gap-4 overflow-hidden mb-12">
                        {[1, 2, 3, 4].map(i => <div key={i} className="w-48 h-32 bg-muted/50 rounded-lg animate-pulse" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-4 mb-12">
                        {smartCollections.map((col: any) => (
                            <div
                                key={col.id}
                                onClick={() => setSelectedCollection(col)}
                                className="group cursor-pointer bg-card border border-border/50 hover:border-primary/50 transition-all rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-muted/50 relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="p-3 bg-primary/10 rounded-full text-primary group-hover:scale-110 transition-transform">
                                    {/* Icons would go here based on col.icon */}
                                    <Layers className="w-6 h-6" />
                                </div>
                                <div className="text-center z-10">
                                    <h3 className="font-bold text-lg mb-1">{col.name}</h3>
                                    {col.description && <p className="text-xs text-muted-foreground">{col.description}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}


                <h1 className="text-3xl font-bold mb-8 flex items-center gap-3 border-t pt-8">
                    <Layers className="w-8 h-8 text-primary" />
                    سلاسل الأفلام (Movie Sagas)
                </h1>

                {isLoading ? (
                    <div>Loading...</div>
                ) : collections.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p>لا توجد سلاسل أفلام مكتشفة بعد.</p>
                        <p className="text-sm mt-2">جرب عمل فحص جديد للمكتبة لتحديث البيانات.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 gap-6">
                        {collections.map((col: any) => (
                            <div
                                key={col.id}
                                onClick={() => setSelectedCollection(col)}
                                className="group cursor-pointer"
                            >
                                <div className="aspect-[2/3] rounded-lg overflow-hidden relative shadow-lg mb-2 border border-transparent group-hover:border-primary transition-all">
                                    <img
                                        src={col.poster_url || '/placeholder.png'}
                                        alt={col.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"

                                        onError={(e) => (e.target as any).src = '/placeholder.png'}
                                    />
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded shadow">
                                        {col.item_count || col.media_count} أفلام
                                    </div>
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Layers className="w-10 h-10 text-white" />
                                    </div>
                                </div>
                                <h3 className="font-bold text-center truncate">{col.name}</h3>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Collection Details Modal */}
            <Dialog open={!!selectedCollection} onOpenChange={(open) => !open && setSelectedCollection(null)}>
                <DialogContent className="max-w-5xl h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            {selectedCollection?.name}
                            <span className="text-sm font-normal text-muted-foreground">
                                ({movies.length} عنصر)
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            {selectedCollection?.description || 'تصفح المشاهدة في هذه القائمة.'}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedCollection?.backdrop_url && (
                        <div className="w-full h-48 rounded-lg overflow-hidden mb-6 relative">
                            <img
                                src={selectedCollection.backdrop_url}
                                className="w-full h-full object-cover opacity-60"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                        </div>
                    )}

                    {isDetailsLoading ? (
                        <div className="py-20 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary mx-auto"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7 gap-4">
                            {movies.map((movie: any) => (
                                <MediaCard key={movie.id} media={movie} />
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Collections;


