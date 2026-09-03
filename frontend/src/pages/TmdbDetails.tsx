import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Play, Calendar, Star, X, Info, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/layout/Header';
import { useToast } from '@/hooks/use-toast';

const TmdbDetails = () => {
    const { mediaType, tmdbId } = useParams<{ mediaType: string; tmdbId: string }>();
    const navigate = useNavigate();
    const id = parseInt(tmdbId || '0', 10);
    const { toast } = useToast();

    const [showTrailer, setShowTrailer] = useState(false);

    // Fetch details
    const { data: media, isLoading, error } = useQuery({
        queryKey: ['tmdbDetails', mediaType, id],
        queryFn: () => apiClient.getTmdbDetails(mediaType || 'movie', id),
        enabled: !!id && !!mediaType,
    });

    // Extract YouTube video ID from trailer URL
    const getYoutubeId = (url: string | undefined) => {
        if (!url) return null;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        return match ? match[1] : null;
    };

    const trailerVideoId = getYoutubeId(media?.trailer_url);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
            </div>
        );
    }

    if (error || !media) {
        return (
            <div className="min-h-screen bg-background">
                <Header />
                <div className="flex flex-col items-center justify-center mt-20 py-20">
                    <h2 className="text-2xl font-bold mb-4">المحتوى غير موجود</h2>
                    <Button onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 ml-2" />
                        العودة
                    </Button>
                </div>
            </div>
        );
    }

    const isMovie = mediaType === 'movie';
    const hasTrailer = !!media.trailer_url;

    return (
        <div className="min-h-screen bg-background text-foreground dir-rtl">
            <Header />

            {/* Trailer Modal */}
            {showTrailer && trailerVideoId && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
                    <div className="relative w-full max-w-6xl aspect-video">
                        <button
                            onClick={() => setShowTrailer(false)}
                            className="absolute -top-12 right-0 p-2 text-white hover:bg-white/20 rounded-full transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <iframe
                            src={`https://www.youtube.com/embed/${trailerVideoId}?autoplay=1`}
                            className="w-full h-full rounded-lg"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                </div>
            )}

            {/* Hero Section */}
            <div className="relative h-[70vh] md:h-[85vh] overflow-hidden mt-16">
                {/* Backdrop Image */}
                {media.backdrop_url && (
                    <img
                        src={media.backdrop_url}
                        alt={media.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '/assets/no_backdrop.png';
                        }}
                    />
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />

                {/* Content */}
                <div className="absolute inset-0 flex items-end pb-20 md:pb-32">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-col md:flex-row gap-8 items-end">
                            {/* Poster */}
                            {media.poster_url && (
                                <motion.div
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="hidden md:block flex-shrink-0"
                                >
                                    <img
                                        src={media.poster_url}
                                        alt={media.title}
                                        className="w-64 rounded-2xl shadow-2xl border-4 border-white/10"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '/assets/no_poster.png';
                                        }}
                                    />
                                </motion.div>
                            )}

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex-1 max-w-4xl"
                            >
                                {/* Title & Metadata */}
                                <div className="mb-6 space-y-4">
                                    <h1 className="text-4xl md:text-6xl font-bold text-white drop-shadow-lg leading-tight">
                                        {media.title}
                                    </h1>

                                    <div className="flex flex-wrap items-center gap-4 text-sm md:text-base text-gray-200">
                                        {media.year && (
                                            <span className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
                                                {media.release_date?.substring(0, 4)}
                                            </span>
                                        )}
                                        {media.certification && (
                                            <span className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full border border-yellow-500/30">
                                                {media.certification}
                                            </span>
                                        )}
                                        {media.runtime > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-4 h-4" />
                                                <span>{isMovie ? `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m` : `${media.runtime}m`}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 text-yellow-400">
                                            <Star className="w-4 h-4 fill-yellow-400" />
                                            <span className="font-bold">{media.vote_average?.toFixed(1)}</span>
                                        </div>
                                    </div>

                                    {/* Genres */}
                                    <div className="flex flex-wrap gap-2">
                                        {media.genres?.map((g: any) => (
                                            <Badge key={g.id} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-none">
                                                {g.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-wrap gap-4 mb-8">
                                    {hasTrailer && (
                                        <Button
                                            size="lg"
                                            onClick={() => setShowTrailer(true)}
                                            className="gap-2 bg-white text-black hover:bg-white/90 font-bold"
                                        >
                                            <Play className="w-5 h-5 fill-black" />
                                            تشغيل التريلر
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="gap-2 border-white/20 hover:bg-white/10"
                                        onClick={() => toast({ title: "قريباً", description: "ستتمكن من إضافة هذا العرض للمكتبة في التحديث القادم" })}
                                    >
                                        <Info className="w-5 h-5" />
                                        غير متوفر في المكتبة
                                    </Button>
                                </div>

                                {/* Plot */}
                                <p className="text-lg text-gray-300 leading-relaxed max-w-2xl line-clamp-4 md:line-clamp-none">
                                    {media.overview}
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cast Section */}
            {media.cast && media.cast.length > 0 && (
                <div className="container mx-auto px-4 py-12">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <span>الممثلين</span>
                        <span className="text-sm font-normal text-muted-foreground">({media.cast.length})</span>
                    </h2>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-6">
                        {media.cast.map((actor: any) => (
                            <motion.div
                                key={actor.id}
                                whileHover={{ scale: 1.05 }}
                                className="group cursor-pointer"
                                onClick={() => navigate(`/cast/${actor.id}`)}
                            >
                                <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 bg-muted relative">
                                    {actor.profile_url ? (
                                        <img
                                            src={actor.profile_url}
                                            alt={actor.name}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                            <span className="text-4xl">👤</span>
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-semibold text-sm truncate">{actor.name}</h3>
                                <p className="text-xs text-muted-foreground truncate">{actor.character}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TmdbDetails;


