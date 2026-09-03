import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/layout/Header';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const Favorites = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch favorites
    const { data: favorites = [], isLoading } = useQuery({
        queryKey: ['favorites'],
        queryFn: () => apiClient.getFavorites(),
    });

    // Remove from favorites mutation
    const removeFavoriteMutation = useMutation({
        mutationFn: (mediaId: number) => apiClient.removeFavorite(mediaId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['favorites'] });
            toast({
                title: 'تم الإزالة',
                description: 'تم إزالة المحتوى من المفضلة',
            });
        },
    });

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 py-8 mt-20">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">المفضلة</h1>
                        <p className="text-muted-foreground">
                            {favorites.length} محتوى
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
                    </div>
                ) : favorites.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-6">
                        {favorites.map((media: any, index: number) => (
                            <motion.div
                                key={media.id}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 7), 5) * 0.15 + (index % 7) * 0.06, ease: "easeOut" }}
                                whileHover={{ scale: 1.03 }}
                                className="group relative"
                            >
                                <div
                                    className="cursor-pointer"
                                    onClick={() => navigate(`/details/${media.id}`)}
                                >
                                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-3">
                                        {media.poster_url && (
                                            <img
                                                src={apiClient.getImageUrl(media.poster_url)}
                                                alt={media.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/assets/no_poster.png';
                                                }}
                                            />
                                        )}

                                        {media.quality && (
                                            <Badge className="absolute top-2 right-2 bg-primary/90">
                                                {media.quality}
                                            </Badge>
                                        )}

                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFavoriteMutation.mutate(media.id);
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    <h3 className="font-medium line-clamp-2 mb-1">{media.title}</h3>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        {media.year && <span>{media.year}</span>}
                                        {media.tmdb_rating && (
                                            <>
                                                <span>•</span>
                                                <span>⭐ {media.tmdb_rating.toFixed(1)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 glass-panel">
                        <BookmarkPlus className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="text-xl font-bold mb-2">لا توجد محتويات مفضلة</h3>
                        <p className="text-muted-foreground mb-6">
                            أضف محتوى للمفضلة لتسهيل الوصول إليه لاحقاً
                        </p>
                        <Button onClick={() => navigate('/')}>
                            تصفح المحتوى
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Favorites;


