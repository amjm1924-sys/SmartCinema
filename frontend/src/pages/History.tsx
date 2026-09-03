import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/layout/Header';
import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const History = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const removeMutation = useMutation({
        mutationFn: (id: number) => apiClient.removeFromHistory(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['history'] });
        },
    });

    // Fetch continue watching

    const { data: continueWatching = [], isLoading: loadingContinue } = useQuery<any[]>({
        queryKey: ['history', 'continue'],
        queryFn: () => apiClient.getContinueWatching(50),
    });

    // Fetch recently watched

    const { data: recentlyWatched = [], isLoading: loadingRecent } = useQuery<any[]>({
        queryKey: ['history', 'recent'],
        queryFn: () => apiClient.getRecentlyWatched(50),
    });

    const isLoading = loadingContinue || loadingRecent;

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 py-8 mt-20">
                {/* Continue Watching Section */}
                <section className="mb-12">
                    <h1 className="text-4xl font-bold mb-2">متابعة المشاهدة</h1>
                    <p className="text-muted-foreground mb-6">
                        كمّل من حيث توقفت
                    </p>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
                        </div>

                    ) : (continueWatching as any[]).length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-6">
                            {(continueWatching as any[]).map((media: any, index: number) => (
                                <motion.div
                                    key={media.id}
                                    initial={{ opacity: 0, x: 30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true, margin: "50px" }}
                                    transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 7), 5) * 0.15 + (index % 7) * 0.06, ease: "easeOut" }}
                                    whileHover={{ scale: 1.03 }}
                                    className="group cursor-pointer"
                                    onClick={() => navigate(`/player/${media.id}`)}
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

                                        {/* Progress Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Play className="w-12 h-12 text-white fill-white" />
                                        </div>

                                        {/* Progress Bar */}
                                        {(media.progress_percent || media.watch_position) && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/30">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{
                                                        width: `${media.progress_percent || (media.watch_position / (media.duration || 1)) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* Quality Badge */}
                                        {media.quality && (
                                            <Badge className="absolute top-2 right-2 bg-primary/90">
                                                {media.quality}
                                            </Badge>
                                        )}

                                        {/* Remove Button */}
                                        <button
                                            className="absolute top-2 left-2 p-1.5 bg-black/60 hover:bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeMutation.mutate(media.id);
                                            }}
                                            title="إزالة من السجل"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <h3 className="font-medium line-clamp-1 mb-1">{media.display_title || media.title}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {media.progress_percent || (media.watch_position && media.duration)
                                            ? `${Math.floor(media.progress_percent || (media.watch_position / media.duration) * 100)}% مكتمل`
                                            : 'ابدأ المشاهدة'}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 glass-panel">
                            <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                            <h3 className="text-xl font-bold mb-2">لا توجد محتويات قيد المشاهدة</h3>
                            <p className="text-muted-foreground">ابدأ بمشاهدة محتوى لتظهر هنا</p>
                        </div>
                    )}
                </section>

                {/* Recently Watched Section */}
                <section>
                    <h2 className="text-3xl font-bold mb-6">شاهدت مؤخراً</h2>

                    {(recentlyWatched as any[]).length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                            {(recentlyWatched as any[]).map((media: any) => (
                                <motion.div
                                    key={media.id}
                                    whileHover={{ scale: 1.05 }}
                                    className="group cursor-pointer"
                                    onClick={() => navigate(`/details/${media.id}`)}
                                >
                                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-2">
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

                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                        {/* Progress Bar for Recently Watched */}
                                        {(media.progress_percent || media.watch_position) && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/20">
                                                <div
                                                    className="h-full bg-primary/70"
                                                    style={{
                                                        width: `${media.progress_percent || (media.watch_position / (media.duration || 1)) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* Remove Button */}
                                        <button
                                            className="absolute top-2 left-2 p-1.5 bg-black/60 hover:bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeMutation.mutate(media.id);
                                            }}
                                            title="إزالة من السجل"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>

                                    <h3 className="text-sm font-medium line-clamp-1">{media.display_title || media.title}</h3>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 glass-panel">
                            <p className="text-muted-foreground">لا يوجد سجل</p>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default History;


