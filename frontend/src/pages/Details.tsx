import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, Plus, Star, Calendar, Film, Tv, Youtube, X, Clock, Download, Loader2, Volume2, VolumeX, DownloadCloud, Image, MonitorPlay, RefreshCw, Sparkles } from 'lucide-react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Media } from '@/types/media';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MediaCarousel from '@/components/media/MediaCarousel';
import Header from '@/components/layout/Header';
import { useToast } from '@/hooks/use-toast';
import { getCountryName } from '@/lib/countries';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import AddToPlaylistDialog from '@/components/media/AddToPlaylistDialog';
import CollectionTimeline from '@/components/media/CollectionTimeline';
import { useDominantColor } from '@/hooks/useDominantColor';
import { AIRecommendations } from '@/components/media/AIRecommendations';
import UserRating from '@/components/media/UserRating';

// Details Page Component
const Details = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const mediaId = parseInt(id || '0', 10);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showTrailer, setShowTrailer] = useState(false);
    const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [isDetectingIntro, setIsDetectingIntro] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Catchup Summary State
    const [showCatchupDialog, setShowCatchupDialog] = useState(false);
    const [catchupSummary, setCatchupSummary] = useState<string | null>(null);
    const [isFetchingCatchup, setIsFetchingCatchup] = useState(false);

    // Parallax 3D Effect for Hero
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const smoothMouseX = useSpring(mouseX, { damping: 30, stiffness: 200, mass: 0.5 });
    const smoothMouseY = useSpring(mouseY, { damping: 30, stiffness: 200, mass: 0.5 });

    // Rotate Poster slightly based on mouse
    const rotateY = useTransform(smoothMouseX, [-0.5, 0.5], [-8, 8]);
    const rotateX = useTransform(smoothMouseY, [-0.5, 0.5], [8, -8]);

    // Parallax Pan Background slightly
    const bgX = useTransform(smoothMouseX, [-0.5, 0.5], [-15, 15]);
    const bgY = useTransform(smoothMouseY, [-0.5, 0.5], [-15, 15]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate relative position from center of the hero (-0.5 to 0.5)
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        mouseX.set(x);
        mouseY.set(y);
    };

    const handleMouseLeave = () => {
        mouseX.set(0);
        mouseY.set(0);
    };

    // Trailer auto-play state
    const trailerVideoRef = useRef<HTMLVideoElement>(null);
    const [trailerMuted, setTrailerMuted] = useState(true);
    const [trailerPlaying, setTrailerPlaying] = useState(false);
    const [cachingTrailer, setCachingTrailer] = useState(false);
    const [visibleEpisodesCount, setVisibleEpisodesCount] = useState(30);
    // Backdrop mode: 'backdrop' initially, switches to 'trailer' after 4s
    const [backdropMode, setBackdropMode] = useState<'trailer' | 'backdrop'>('backdrop');
    // Track if we already triggered auto-download to avoid loops
    const autoCacheTriggered = useRef(false);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    // Cleanup polling interval on unmount
    useEffect(() => {
        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
        };
    }, []);

    // Fetch media details
    const { data: media, isLoading } = useQuery<Media>({
        queryKey: ['media', mediaId],
        queryFn: () => apiClient.getMediaById(mediaId),
        enabled: !!mediaId,
    });

    // Fetch episodes if it's a series
    const { data: episodes = [] } = useQuery({
        queryKey: ['episodes', mediaId],
        queryFn: () => apiClient.getSeriesEpisodes(mediaId),
        enabled: media?.type === 'series',
    });

    // Fetch Local + AI merged recommendations (Offline matching engine)
    const { data: recommendations = [] } = useQuery({
        queryKey: ['recommendations', mediaId, 'local'],
        queryFn: () => apiClient.getRecommendations(mediaId, 12, true),
        enabled: !!mediaId,
    });

    // Fetch TMDB external recommendations
    const { data: tmdbRecommendations = [] } = useQuery({
        queryKey: ['recommendations', mediaId, 'tmdb'],
        queryFn: () => apiClient.getRecommendations(mediaId, 12, false),
        enabled: !!mediaId,
    });

    // Fetch cast for this media
    const { data: cast = [] } = useQuery({
        queryKey: ['mediaCast', mediaId],
        queryFn: () => apiClient.getMediaCast(mediaId, 100),
        enabled: !!mediaId,
    });

    // Fetch TMDB Clear Logos (transparent PNG titles)
    const { data: logosData } = useQuery({
        queryKey: ['mediaLogos', mediaId],
        queryFn: () => apiClient.getMediaLogos(mediaId),
        enabled: !!mediaId,
        staleTime: 1000 * 60 * 60, // Cache 1 hour
    });
    const clearLogo = logosData?.logos?.[0]?.url;

    // Check favorite status
    const { data: favoriteStatus } = useQuery({
        queryKey: ['favorite', mediaId],
        queryFn: () => apiClient.checkFavorite(mediaId),
        enabled: !!mediaId,
    });

    // Add to favorites mutation
    const addFavoriteMutation = useMutation({
        mutationFn: () => apiClient.addFavorite(mediaId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['favorite', mediaId] });
            toast({
                title: 'تمت الإضافة ✅',
                description: 'تمت إضافة المحتوى إلى المفضلة',
            });
        },
        onError: () => {
            toast({
                title: 'خطأ ❌',
                description: 'فشل إضافة المحتوى إلى المفضلة',
                variant: 'destructive',
            });
        },
    });



    // Fetch trailer status
    const { data: trailerStatus, refetch: refetchTrailerStatus } = useQuery({
        queryKey: ['trailerStatus', mediaId],
        queryFn: () => apiClient.getTrailerStatus(mediaId),
        enabled: !!mediaId,
    });

    // Handle caching trailer
    const handleCacheTrailer = async (silent = false) => {
        if (!silent) setCachingTrailer(true);
        try {
            await apiClient.cacheTrailer(mediaId);
            if (!silent) {
                toast({ title: 'جاري تحميل التريلر...', description: 'سيتم تشغيله تلقائياً عند الانتهاء' });
            }
            // Start polling for status
            pollingInterval.current = setInterval(async () => {
                const status = await apiClient.getTrailerStatus(mediaId);
                if (status.cached) {
                    if (pollingInterval.current) {
                        clearInterval(pollingInterval.current);
                        pollingInterval.current = null;
                    }
                    queryClient.invalidateQueries({ queryKey: ['trailerStatus', mediaId] });
                    if (!silent) {
                        toast({ title: 'تم تحميل التريلر ✅' });
                        setCachingTrailer(false);
                    }
                }
            }, 3000);
        } catch {
            if (!silent) {
                toast({ title: 'فشل تحميل التريلر', variant: 'destructive' });
                setCachingTrailer(false);
            }
        }
    };

    // 1. Timer to switch to trailer mode after 4s (ONLY if cached locally to avoid YouTube errors)
    useEffect(() => {
        if (trailerStatus?.cached) {
            const timer = setTimeout(() => {
                setBackdropMode('trailer');
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [trailerStatus?.cached]);

    // 2. Auto-cache trailer if missing
    useEffect(() => {
        if (trailerStatus && !trailerStatus.cached && trailerStatus.has_trailer_url && !autoCacheTriggered.current) {
            console.log("Auto-caching trailer...");
            autoCacheTriggered.current = true;
            handleCacheTrailer(true); // silent = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trailerStatus]);

    // Auto-play trailer when cached and in trailer mode
    useEffect(() => {
        if (trailerStatus?.cached && backdropMode === 'trailer' && trailerVideoRef.current) {
            trailerVideoRef.current.play().catch(() => {
                // Autoplay blocked
            });
        }
    }, [trailerStatus?.cached, backdropMode]);

    // Get unique seasons (combining local episodes and TMDB info)
    const seasons = useMemo(() => {
        const localSeasons = episodes.map((ep: Media) => ep.season_number || 1);
        const tmdbSeasonsList = (media?.tmdb_seasons || [])

            .filter((s: any) => s.season_number > 0)

            .map((s: any) => s.season_number);

        const allSeasons = new Set([...localSeasons, ...tmdbSeasonsList]);

        if (allSeasons.size === 0 && episodes.length === 0) return [];
        if (allSeasons.size === 0) return [1];

        return Array.from(allSeasons).sort((a, b) => a - b);
    }, [episodes, media?.tmdb_seasons]);

    // Set initial selected season when episodes load
    useEffect(() => {
        if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
            setSelectedSeason(seasons[0]);
        }
    }, [seasons, selectedSeason]);

    // Reset pagination when season changes
    useEffect(() => {
        setVisibleEpisodesCount(30);
    }, [selectedSeason]);

    // Filter episodes by selected season
    const seasonEpisodes = useMemo(() => {
        return episodes.filter((ep: Media) => (ep.season_number || 1) === selectedSeason);
    }, [episodes, selectedSeason]);

    // Extract YouTube video ID from trailer URL
    const getYoutubeId = (url: string | undefined) => {
        if (!url) return null;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
        return match ? match[1] : null;
    };

    const trailerVideoId = getYoutubeId(media?.trailer_url);

    // Extract dominant color from poster for dynamic theming
    const { color: dominantColor } = useDominantColor(media?.poster_url);

    // Separate actors and crew

    const actors = useMemo(() => cast.filter((c: any) => c.department === 'Acting' || c.role === 'Actor'), [cast]);

    const crew = useMemo(() => cast.filter((c: any) => c.department !== 'Acting' && c.role !== 'Actor'), [cast]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
            </div>
        );
    }

    if (!media) {
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

    const isMovie = media.type === 'movie';
    const isSeries = media.type === 'series';
    const genres = media.genres?.split(',').map(g => g.trim()) || [];

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
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

            {/* Playlist Dialog */}
            <AddToPlaylistDialog
                mediaId={mediaId}
                open={showPlaylistDialog}
                onOpenChange={setShowPlaylistDialog}
            />

            {/* AI Catchup Summary Dialog */}
            <Dialog open={showCatchupDialog} onOpenChange={setShowCatchupDialog}>
                <DialogContent className="max-w-2xl bg-card border-white/10" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Sparkles className="w-5 h-5 text-yellow-500" />
                            ملخص الأحداث السابقة
                            <Badge variant="outline" className="mr-2 bg-green-500/20 text-green-400 border-green-500/50">بدون حرق 🛡️</Badge>
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground pt-2">
                            {isFetchingCatchup ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-4">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                    <p>جاري توليد الملخص باستخدام الذكاء الاصطناعي...</p>
                                </div>
                            ) : (
                                <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap mt-4 p-4 bg-background/50 rounded-lg border border-white/5">
                                    {catchupSummary || 'عذراً، لم نتمكن من توليد الملخص.'}
                                </div>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>

            {/* Backdrop Section (First Snap Point) */}
            <div
                className="relative snap-start h-[70vh] md:h-[85vh] overflow-hidden mt-16 perspective-1000"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                {/* Auto-Playing Trailer Video (Local Cached) */}
                {trailerStatus?.cached && backdropMode === 'trailer' && (
                    <video
                        ref={trailerVideoRef}
                        src={apiClient.getTrailerUrl(mediaId)}
                        className="absolute inset-0 w-full h-full object-cover"
                        muted={trailerMuted}
                        loop
                        playsInline
                        onPlay={() => setTrailerPlaying(true)}
                        onPause={() => setTrailerPlaying(false)}
                    />
                )}

                {/* Auto-Playing Trailer Video (YouTube Stream) */}
                {!trailerStatus?.cached && trailerVideoId && backdropMode === 'trailer' && (
                    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                        <iframe
                            src={`https://www.youtube.com/embed/${trailerVideoId}?autoplay=1&mute=${trailerMuted ? 1 : 0}&controls=0&showinfo=0&rel=0&loop=1&playlist=${trailerVideoId}&modestbranding=1&iv_load_policy=3&enablejsapi=1&origin=${window.location.origin}`}
                            className="absolute top-1/2 left-1/2 w-[150%] h-[150%] -translate-x-1/2 -translate-y-1/2 object-cover pointer-events-none"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            style={{ opacity: trailerPlaying ? 1 : 0, transition: 'opacity 1s ease-in-out' }}
                            onLoad={() => {
                                // Short timeout to allow player to initialize and start playing before fading in
                                setTimeout(() => setTrailerPlaying(true), 1500);
                            }}
                        ></iframe>
                    </div>
                )}

                {/* Background Image (shown when mode is 'backdrop', or no trailer available, or trailer not yet playing) */}
                {media.backdrop_url && (
                    <motion.img
                        src={media.backdrop_url.startsWith('http')
                            ? media.backdrop_url
                            : `${import.meta.env.VITE_API_URL || ''}/${media.backdrop_url.replace(/^\//, '')}`
                        }
                        alt={media.title}
                        className={`absolute inset-0 w-full h-full object-cover origin-center transition-opacity duration-1000 ${(backdropMode === 'trailer' && trailerPlaying) ? 'opacity-0' : 'opacity-100'
                            }`}
                        style={{
                            scale: 1.05,
                            x: bgX,
                            y: bgY
                        }}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '/assets/no_backdrop.png';
                        }}
                    />
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent pointer-events-none" />

                {/* Trailer Controls */}
                {(trailerStatus?.cached || trailerVideoId) && (
                    <div className="absolute bottom-24 right-6 z-20 flex gap-2">
                        {/* Toggle Backdrop / Trailer */}
                        <button
                            onClick={() => {
                                const newMode = backdropMode === 'trailer' ? 'backdrop' : 'trailer';
                                setBackdropMode(newMode);
                                // Pause/play local video if exists
                                if (trailerStatus?.cached && trailerVideoRef.current) {
                                    if (newMode === 'backdrop') trailerVideoRef.current.pause();
                                    else trailerVideoRef.current.play();
                                }
                                // For YouTube, iframe re-renders with new params automatically
                            }}
                            className="p-3 rounded-full bg-background/50 hover:bg-background/80 backdrop-blur-md transition-all border border-white/10"
                            title={backdropMode === 'trailer' ? 'عرض صورة الخلفية' : 'عرض التريلر'}
                        >
                            {backdropMode === 'trailer' ? <Image className="w-5 h-5" /> : <MonitorPlay className="w-5 h-5" />}
                        </button>

                        {/* Mute/Unmute (only when trailer is showing) */}
                        {backdropMode === 'trailer' && (
                            <button
                                onClick={() => setTrailerMuted(!trailerMuted)}
                                className="p-3 rounded-full bg-background/50 hover:bg-background/80 backdrop-blur-md transition-all border border-white/10"
                                title={trailerMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
                            >
                                {trailerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                        )}
                    </div>
                )}

                {/* Removed Cache Trailer Button as per user request */}

                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-6 left-6 p-3 rounded-full bg-background/50 hover:bg-background/70 backdrop-blur-md transition-all z-10"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>

                {/* Content */}
                <div className="absolute inset-0 flex items-end pb-20 md:pb-32">
                    <div className="container mx-auto px-4">
                        <div className="flex gap-8 items-end">
                            {/* Poster */}
                            {media.poster_url && (
                                <motion.div
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="hidden md:block flex-shrink-0"
                                    style={{
                                        rotateX,
                                        rotateY,
                                        transformStyle: "preserve-3d",
                                        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                                        border: dominantColor ? `1px solid ${dominantColor}40` : '1px solid rgba(255,255,255,0.1)'
                                    }}
                                >
                                    <motion.img
                                        src={media.poster_url.startsWith('http')
                                            ? media.poster_url
                                            : `${import.meta.env.VITE_API_URL || ''}/${media.poster_url.replace(/^\//, '')}`
                                        }
                                        alt={media.title}
                                        className="w-64 rounded-2xl"
                                        style={{ transform: "translateZ(30px)" }} // Pop the image out of the border slightly
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '/assets/no_poster.png';
                                        }}
                                    />
                                </motion.div>
                            )}

                            {/* Info */}
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="flex-1"
                            >
                                {/* Quality Badge */}
                                {media.quality && media.quality !== 'Unknown' && (
                                    <Badge className="mb-4 bg-red-500 text-white font-bold">
                                        {media.quality}
                                    </Badge>
                                )}

                                {/* Title / Clear Logo */}
                                {clearLogo ? (
                                    <motion.img
                                        src={clearLogo}
                                        alt={media.title}
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="max-h-32 md:max-h-44 w-auto max-w-xs md:max-w-md mb-4 object-contain drop-shadow-2xl"
                                        style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.7))' }}
                                        onError={() => {/* Will show title below on error */ }}
                                    />
                                ) : (
                                    <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
                                        {media.title}
                                    </h1>
                                )}

                                {/* Meta Info */}
                                <div className="flex flex-wrap items-center gap-4 mb-6 text-muted-foreground">
                                    {media.tmdb_rating && media.tmdb_rating > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                                            <span className="font-bold">{media.tmdb_rating.toFixed(1)}</span>
                                        </div>
                                    )}
                                    {/* Personal User Rating */}
                                    <UserRating
                                        rating={media.user_rating}
                                        interactive={true}
                                        size="lg"
                                        onRate={async (rating) => {
                                            try {
                                                await apiClient.setUserRating(mediaId, rating);
                                                queryClient.invalidateQueries({ queryKey: ['media', mediaId] });
                                                queryClient.invalidateQueries({ queryKey: ['allMedia'] });
                                                toast({ title: rating ? `تم تقييمك: ${rating}/10 ⭐` : 'تم حذف التقييم' });
                                            } catch (e) {
                                                toast({ title: 'فشل حفظ التقييم', variant: 'destructive' });
                                            }
                                        }}
                                    />
                                    {media.year && (
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-5 h-5" />
                                            <span>{media.year}</span>
                                        </div>
                                    )}
                                    {media.duration && media.duration > 0 && (
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-5 h-5" />
                                            <span>
                                                {Math.floor(media.duration / 3600) > 0
                                                    ? `${Math.floor(media.duration / 3600)}h ${Math.floor((media.duration % 3600) / 60)}m`
                                                    : `${Math.floor(media.duration / 60)}m`}
                                            </span>
                                        </div>
                                    )}

                                    {/* Age Rating Badge */}
                                    {media.certification && (() => {
                                        const c = media.certification.toUpperCase();
                                        let colorClass = 'bg-zinc-600 border-zinc-500';
                                        if (['G', 'TV-G'].includes(c)) colorClass = 'bg-green-600/80 border-green-500/50';
                                        else if (['PG', 'TV-PG', 'TV-Y7'].includes(c)) colorClass = 'bg-blue-500/80 border-blue-400/50';
                                        else if (['PG-13', 'TV-14'].includes(c)) colorClass = 'bg-yellow-500/80 border-yellow-400/50 text-black';
                                        else if (['R', 'TV-MA'].includes(c)) colorClass = 'bg-red-600/80 border-red-500/50';
                                        else if (['NC-17'].includes(c)) colorClass = 'bg-red-900/80 border-red-800/50';
                                        return (
                                            <Badge className={`${colorClass} text-xs font-bold px-2.5 py-1 border backdrop-blur-sm`}>
                                                {media.certification}
                                            </Badge>
                                        );
                                    })()}

                                    {media.tmdb_status && (
                                        <Badge variant="outline" className={`${media.tmdb_status === 'Ended' || media.tmdb_status === 'Canceled' ? 'border-red-500/50 text-red-200' : 'border-green-500/50 text-green-200'} bg-black/50 text-xs font-semibold`}>
                                            {media.tmdb_status === 'Ended' ? 'منتهي' :
                                                media.tmdb_status === 'Returning Series' ? 'مستمر' :
                                                    media.tmdb_status === 'Canceled' ? 'ملغى' : media.tmdb_status}
                                        </Badge>
                                    )}
                                    {isMovie && (
                                        <Badge variant="outline" className="gap-1">
                                            <Film className="w-4 h-4" />
                                            فيلم
                                        </Badge>
                                    )}
                                    {isSeries && (
                                        <Badge variant="outline" className="gap-1">
                                            <Tv className="w-4 h-4" />
                                            مسلسل
                                        </Badge>
                                    )}
                                    {media.country && (
                                        <Badge variant="outline" className="text-xs font-semibold">
                                            {getCountryName(media.country) || media.country}
                                        </Badge>
                                    )}
                                    {genres.slice(0, 3).map((genre) => (
                                        <Badge key={genre} variant="outline" className="text-xs">
                                            {genre}
                                        </Badge>
                                    ))}
                                </div>

                                {/* Overview */}
                                {media.overview && (
                                    <p className="text-lg text-muted-foreground mb-8 max-w-3xl leading-relaxed">
                                        {media.overview}
                                    </p>
                                )}

                                 {/* Action Buttons */}
                                <div className="flex flex-wrap gap-4">
                                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                                        <Button
                                            size="lg"
                                            className="gap-2 text-base hover:brightness-110 transition-all duration-300 border-0"
                                            style={{
                                                backgroundColor: dominantColor || '#ef4444',
                                                boxShadow: dominantColor ? `0 0 20px ${dominantColor}66` : undefined
                                            }}
                                            onClick={() => {
                                                if (isSeries && episodes.length > 0) {
                                                    const watchedEpisodes = episodes
                                                        .filter((ep: any) => (ep.position && ep.position > 5) || (ep.progress_percent && ep.progress_percent > 0))
                                                        .sort((a: any, b: any) => {
                                                            const seasonDiff = (a.season_number || 1) - (b.season_number || 1);
                                                            if (seasonDiff !== 0) return seasonDiff;
                                                            return (a.episode_number || 0) - (b.episode_number || 0);
                                                        });

                                                    if (watchedEpisodes.length > 0) {
                                                        const lastWatched = watchedEpisodes[watchedEpisodes.length - 1];
                                                        navigate(`/player/${lastWatched.id}`);
                                                    } else {
                                                        const firstEpisode = [...episodes]
                                                            .sort((a: Media, b: Media) => {
                                                                const seasonDiff = (a.season_number || 1) - (b.season_number || 1);
                                                                if (seasonDiff !== 0) return seasonDiff;
                                                                return (a.episode_number || 0) - (b.episode_number || 0);
                                                            })[0];
                                                        navigate(`/player/${firstEpisode.id}`);
                                                    }
                                                } else {
                                                    navigate(`/player/${mediaId}`);
                                                }
                                            }}
                                        >
                                            <Play className="w-5 h-5 fill-current" />
                                            {isSeries
                                                ? (() => {
                                                    const watchedEpisodes = episodes
                                                        .filter((ep: any) => (ep.position && ep.position > 5) || (ep.progress_percent && ep.progress_percent > 0))
                                                        .sort((a: any, b: any) => {
                                                            const seasonDiff = (a.season_number || 1) - (b.season_number || 1);
                                                            if (seasonDiff !== 0) return seasonDiff;
                                                            return (a.episode_number || 0) - (b.episode_number || 0);
                                                        });
                                                    if (watchedEpisodes.length > 0) {
                                                        const ep = watchedEpisodes[watchedEpisodes.length - 1];
                                                        return `متابعة - S${String(ep.season_number || 1).padStart(2, '0')}E${String(ep.episode_number || 1).padStart(2, '0')}`;
                                                    }
                                                    return 'تشغيل أول حلقة';
                                                })()
                                                : (media.watch_position && media.watch_position > 5 ? 'استكمال المشاهدة' : 'تشغيل الآن')
                                            }
                                        </Button>

                                        {/* Progress bar for movies or series */}
                                        {(() => {
                                            if (isSeries) {
                                                const lastWatched = episodes
                                                    .filter((ep: any) => (ep.position && ep.position > 5) || (ep.progress_percent && ep.progress_percent > 0))
                                                    .sort((a: any, b: any) => {
                                                        const seasonDiff = (a.season_number || 1) - (b.season_number || 1);
                                                        if (seasonDiff !== 0) return seasonDiff;
                                                        return (a.episode_number || 0) - (b.episode_number || 0);
                                                    });
                                                if (lastWatched.length > 0) {
                                                    const ep = lastWatched[lastWatched.length - 1] as any;
                                                    const pct = ep.progress_percent || 0;
                                                    return (
                                                        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mt-1">
                                                            <div
                                                                className="h-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-300"
                                                                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                                            />
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }
                                            if (media.watch_position && media.duration && media.watch_position > 5) {
                                                return (
                                                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mt-1">
                                                        <div
                                                            className="h-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-300"
                                                            style={{ width: `${Math.min(100, Math.max(0, (media.watch_position / media.duration) * 100))}%` }}
                                                        />
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>



                                    {!isSeries && (
                                        <Button
                                            size="lg"
                                            variant="secondary"
                                            className="gap-2 text-base"
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = `/api/download/${mediaId}`;
                                                a.download = '';
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                            }}
                                        >
                                            <Download className="w-5 h-5" />
                                            تحميل
                                        </Button>
                                    )}



                                    <Button
                                        size="lg"
                                        variant="outline"
                                        className="gap-2 text-base"
                                        onClick={() => addFavoriteMutation.mutate()}
                                        disabled={addFavoriteMutation.isPending}
                                    >
                                        <Plus className="w-5 h-5" />
                                        {addFavoriteMutation.isPending ? 'جاري الإضافة...' : 'أضف للمفضلة'}
                                    </Button>

                                    {trailerVideoId && (
                                        <Button
                                            size="lg"
                                            variant="outline"
                                            className="gap-2 text-base"
                                            onClick={() => setShowTrailer(true)}
                                        >
                                            <Youtube className="w-5 h-5" />
                                            مشاهدة الإعلان
                                        </Button>
                                    )}

                                    {/* AI Catchup Summary Button */}
                                    {(isSeries || media.type === 'episode') && (
                                        <Button
                                            size="lg"
                                            variant="outline"
                                            className="gap-2 text-base bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20"
                                            onClick={async () => {
                                                setShowCatchupDialog(true);
                                                if (catchupSummary) return; // already fetched
                                                setIsFetchingCatchup(true);
                                                try {
                                                    let epNum = 1;
                                                    let sNum = 1;
                                                    let sTitle = media.title;
                                                    
                                                    if (media.type === 'episode') {
                                                        epNum = media.episode_number || 1;
                                                        sNum = media.season_number || 1;
                                                    } else if (isSeries) {
                                                        // For series, get next unwatched episode
                                                        const watchedEpisodes = episodes
                                                            .filter((ep: any) => (ep.position && ep.position > 5) || (ep.progress_percent && ep.progress_percent > 0))
                                                            .sort((a: any, b: any) => {
                                                                const seasonDiff = (a.season_number || 1) - (b.season_number || 1);
                                                                if (seasonDiff !== 0) return seasonDiff;
                                                                return (a.episode_number || 0) - (b.episode_number || 0);
                                                            });
                                                        if (watchedEpisodes.length > 0) {
                                                            const ep = watchedEpisodes[watchedEpisodes.length - 1];
                                                            epNum = ep.episode_number || 1;
                                                            sNum = ep.season_number || 1;
                                                        }
                                                    }
                                                    
                                                    const res = await apiClient.getCatchupSummary(sTitle, sNum, epNum);
                                                    setCatchupSummary(res.summary);
                                                } catch (e) {
                                                    setCatchupSummary('حدث خطأ أثناء محاولة توليد الملخص.');
                                                } finally {
                                                    setIsFetchingCatchup(false);
                                                }
                                            }}
                                        >
                                            <Sparkles className="w-5 h-5" />
                                            ملخص الأحداث السابقة
                                        </Button>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Episodes Section (for series) */}
            {isSeries && (
                <div className="container mx-auto px-4 py-12">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">الحلقات</h2>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 border-primary/30 hover:bg-primary/10 text-primary"
                                onClick={async () => {
                                    if (!mediaId) return;
                                    setIsDetectingIntro(true);
                                    try {
                                        toast({ title: 'جاري فحص التتر...', description: 'يتم الآن تحليل خصائص الصوت لاكتشاف المقدمة' });
                                        // Use the season-specific intro detect if possible, or general media one
                                        // The endpoint in app.py is /api/series/<series_id>/seasons/<season_num>/intro
                                        const result = await apiClient.detectIntro(mediaId, selectedSeason);
                                        if (result.success) {
                                            if (result.processing) {
                                                toast({
                                                    title: 'بدأ الفحص الذكي 🔍',
                                                    description: 'جاري تحليل الموسم في الخلفية، سيظهر زر التخطي في المشغل خلال دقائق.'
                                                });
                                            } else if (result.start !== undefined && result.end !== undefined) {
                                                toast({
                                                    title: 'تم الاكتشاف بنجاح ✅',
                                                    description: `تم تحديد المقدمة: ${Math.floor(result.start)}s - ${Math.floor(result.end)}s`
                                                });
                                                queryClient.invalidateQueries({ queryKey: ['episodes', mediaId] });
                                                queryClient.invalidateQueries({ queryKey: ['media'] });
                                            }
                                        } else {
                                            toast({ title: 'لم يتم العثور على نمط متكرر', variant: 'destructive' });
                                        }
                                    } catch (error) {
                                        toast({ title: 'فشل اكتشاف المقدمة', variant: 'destructive' });
                                    } finally {
                                        setIsDetectingIntro(false);
                                    }
                                }}
                                disabled={isDetectingIntro}
                            >
                                {isDetectingIntro ? <Loader2 className="w-4 h-4 animate-spin" /> : <MonitorPlay className="w-4 h-4" />}
                                كشف المقدمة (Smart Scan)
                            </Button>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => {
                                        toast({ title: 'بدأ تحميل الموسم...', description: 'سيتم تحميل الحلقات تباعاً.' });
                                        seasonEpisodes.forEach((episode, index) => {
                                            setTimeout(() => {
                                                const a = document.createElement('a');
                                                a.href = `/api/download/${episode.id}`;
                                                a.download = '';
                                                a.click();
                                            }, index * 1000); // 1-second delay between downloads
                                        });
                                    }}
                                >
                                    <Download className="w-4 h-4" />
                                    تحميل الموسم
                                </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                    try {
                                        setIsRefreshing(true);
                                        toast({ title: 'جاري التحديث...' });
                                        await apiClient.startSeriesScan(mediaId);
                                        setTimeout(() => {
                                            setIsRefreshing(false);
                                            queryClient.invalidateQueries({ queryKey: ['media', mediaId] });
                                            queryClient.invalidateQueries({ queryKey: ['episodes', mediaId] });
                                            toast({ title: 'اكتمل التحديث ✅' });
                                        }, 4000);
                                    } catch (error) {
                                        toast({ title: 'حدث خطأ', variant: 'destructive' });
                                        setIsRefreshing(false);
                                    }
                                }}
                                disabled={isRefreshing}
                            >
                                {isRefreshing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
                                تحديث الحلقات
                            </Button>
                        </div>
                    </div>
                </div>

                    {/* Season Buttons */}
                    {seasons.length > 1 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {seasons.map((season) => {
                                const localCount = episodes.filter((ep: Media) =>
                                    (ep.season_number || 1) === season
                                ).length;


                                const tmdbSeason = media.tmdb_seasons?.find((s: any) => s.season_number === season);
                                const totalCount = tmdbSeason?.episode_count || localCount;
                                const seasonYear = tmdbSeason?.air_date ? tmdbSeason.air_date.substring(0, 4) : null;
                                const seasonRating = tmdbSeason?.vote_average;

                                return (
                                    <Button
                                        key={season}
                                        variant={selectedSeason === season ? 'default' : 'outline'}
                                        onClick={() => setSelectedSeason(season)}
                                        className="gap-2"
                                    >
                                        الموسم {season}
                                        <Badge variant="secondary" className="ml-2">
                                            {localCount} / {totalCount}
                                        </Badge>
                                        {seasonYear && (
                                            <Badge variant="outline" className="ml-1 text-xs opacity-75">
                                                {seasonYear}
                                            </Badge>
                                        )}
                                        {seasonRating != null && seasonRating > 0 && (
                                            <Badge variant="outline" className="ml-1 text-xs gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                                <Star className="w-3 h-3 fill-yellow-500" />
                                                {seasonRating.toFixed(1)}
                                            </Badge>
                                        )}
                                    </Button>
                                );
                            })}
                        </div>
                    )}

                    {/* Episodes Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(() => {

                            const tmdbSeason = media.tmdb_seasons?.find((s: any) => s.season_number === selectedSeason);
                            const numEpisodesToRender = Math.max(
                                tmdbSeason?.episode_count || 0,
                                Math.max(...seasonEpisodes.map((e: Media) => e.episode_number || 1), 0)
                            );

                            const renderArray = Array.from({ length: numEpisodesToRender }, (_, i) => i + 1);

                            if (renderArray.length === 0) {
                                return <div className="col-span-full py-8 text-center text-gray-500">لا تتوفر حلقات لهذا الموسم.</div>;
                            }

                            return renderArray.slice(0, visibleEpisodesCount).map((epNum) => {
                                const episode = seasonEpisodes.find((ep: Media) => (ep.episode_number || 1) === epNum);

                                if (!episode) {
                                    return (
                                        <div
                                            key={`missing-${epNum}`}
                                            className="group bg-card/50 border border-white/5 border-dashed rounded-lg p-4 transition-colors opacity-60 flex items-center gap-4 pointer-events-none"
                                        >
                                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-black/50 flex flex-col items-center justify-center">
                                                <span className="font-bold text-white/50">{epNum}</span>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-medium text-white/50">
                                                    الحلقة {epNum}
                                                </h3>
                                                <Badge variant="outline" className="mt-1 text-[10px] bg-red-900/20 border-red-500/30 text-red-400">غير متوفر</Badge>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={episode.id}
                                        className="group relative bg-card rounded-lg overflow-hidden p-4 hover:bg-accent cursor-pointer transition-colors flex items-center gap-4"
                                        onClick={() => navigate(`/player/${episode.id}`)}
                                    >
                                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                                            <span className="font-bold">
                                                {episode.episode_number || '?'}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-medium group-hover:text-primary transition-colors">
                                                {episode.episode_title || `الحلقة ${episode.episode_number}`}
                                            </h3>
                                            {episode.quality && episode.quality !== 'Unknown' && (
                                                <p className="text-sm text-muted-foreground">{episode.quality}</p>
                                            )}
                                            {(episode.duration || episode.runtime || media.runtime) && (
                                                <p className="text-sm text-muted-foreground" dir="ltr">
                                                    {episode.duration
                                                        ? (episode.duration_formatted || `${Math.floor(episode.duration / 60)}m`)
                                                        : `${episode.runtime || media.runtime}m`
                                                    }
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-white/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const a = document.createElement('a');
                                                a.href = `/api/download/${episode.id}`;
                                                a.download = '';
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                            }}
                                            title="تحميل الحلقة"
                                        >
                                            <Download className="w-5 h-5 text-muted-foreground hover:text-white" />
                                        </Button>
                                        <Play className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                        {/* Episode Progress Bar */}
                                        {episode.progress_percent && episode.progress_percent > 0 && (
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{ width: `${Math.min(100, Math.max(0, episode.progress_percent))}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                    {/* Load More Button for Episodes */}
                    {(() => {
                        const tmdbSeason = media.tmdb_seasons?.find((s: any) => s.season_number === selectedSeason);
                        const numEpisodesToRender = Math.max(
                            tmdbSeason?.episode_count || 0,
                            Math.max(...seasonEpisodes.map((e: Media) => e.episode_number || 1), 0)
                        );
                        if (numEpisodesToRender > visibleEpisodesCount) {
                            return (
                                <div className="mt-8 flex justify-center">
                                    <Button
                                        onClick={() => setVisibleEpisodesCount(prev => prev + 30)}
                                        variant="outline"
                                        className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 transition-all rounded-full px-8 py-2 font-medium"
                                    >
                                        عرض المزيد ({numEpisodesToRender - visibleEpisodesCount} حلقة متبقية)
                                    </Button>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            )}

            {/* Collection Timeline (Saga View) */}
            {media.collection_tmdb_id && (
                <CollectionTimeline
                    tmdbId={media.collection_tmdb_id}
                    currentMediaId={mediaId}
                />
            )}

            {/* Local Library AI Recommendations */}
            {Array.isArray(recommendations) && recommendations.length > 0 && (
                <div className="container mx-auto px-4 py-8 mt-4">
                    <MediaCarousel title="ترشيحات الذكاء الإصطناعي (مكتبتك)" items={recommendations} />
                </div>
            )}

            {/* External TMDB Recommendations */}
            {Array.isArray(tmdbRecommendations) && tmdbRecommendations.length > 0 && (
                <div className="container mx-auto px-4 py-4">
                    <MediaCarousel title="ترشيحات عالمية (TMDb)" items={tmdbRecommendations} />
                </div>
            )}

            {/* AI Recommendations Component (Beta API) */}
            <div className="container mx-auto px-4 mt-8">
                <AIRecommendations mediaId={mediaId} />
            </div>

            {/* Cast Section - All Actors */}
            {actors.length > 0 && (
                <div className="container mx-auto px-4 pb-8 mt-12">
                    <h2 className="text-2xl font-bold mb-6">طاقم التمثيل</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-4">
                        {actors.map((actor: any, index: number) => (
                            <motion.div
                                key={`${actor.id}-${actor.character_name}`}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 12), 3) * 0.15 + (index % 12) * 0.04, ease: "easeOut" }}
                                whileHover={{ scale: 1.05 }}
                                className="cursor-pointer"
                                onClick={() => navigate(`/cast/${actor.id}`)}
                            >
                                <div className="relative rounded-xl overflow-hidden bg-card aspect-[2/3] mb-2">
                                    {actor.profile_url ? (
                                        <img
                                            src={actor.profile_url}
                                            alt={actor.name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '/assets/no_profile.png';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-muted">
                                            <span className="text-4xl">👤</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-center truncate">{actor.name}</p>
                                {actor.character_name && (
                                    <p className="text-xs text-muted-foreground text-center truncate">
                                        {actor.character_name}
                                    </p>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Crew Section - Directors, Writers, Producers */}
            {crew.length > 0 && (
                <div className="container mx-auto px-4 pb-20">
                    <h2 className="text-2xl font-bold mb-6">طاقم العمل</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-4">
                        {crew.map((member: any, index: number) => (
                            <motion.div
                                key={`${member.id}-${member.role}`}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 12), 3) * 0.15 + (index % 12) * 0.04, ease: "easeOut" }}
                                whileHover={{ scale: 1.05 }}
                                className="cursor-pointer"
                                onClick={() => navigate(`/cast/${member.id}`)}
                            >
                                <div className="relative rounded-xl overflow-hidden bg-card aspect-[2/3] mb-2 border border-white/5">
                                    {member.profile_url ? (
                                        <img
                                            src={member.profile_url}
                                            alt={member.name}
                                            className="w-full h-full object-cover opacity-80"
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '/assets/no_profile.png';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-muted">
                                            <span className="text-4xl opacity-50">🎬</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-center truncate">{member.name}</p>
                                <p className="text-xs text-primary/80 text-center truncate">
                                    {member.role === 'Director' ? 'مخرج' :
                                        member.role === 'Writer' ? 'كاتب' :
                                            member.role === 'Screenplay' ? 'سيناريو' :
                                                member.role === 'Producer' ? 'منتج' :
                                                    member.role}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )
            }
        </div >
    );
};

export default Details;


