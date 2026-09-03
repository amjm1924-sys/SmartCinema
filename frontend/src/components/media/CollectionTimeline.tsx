import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Film, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollectionPart {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    vote_average: number;
    in_library: boolean;
    media_id?: number;
    local_poster?: string;
    quality?: string;
}

interface CollectionData {
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    parts: CollectionPart[];
}

interface CollectionTimelineProps {
    tmdbId: number;
    currentMediaId?: number;
}

const CollectionTimeline = ({ tmdbId, currentMediaId }: CollectionTimelineProps) => {
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const { data: collection, isLoading } = useQuery<CollectionData>({
        queryKey: ['collection', tmdbId],
        queryFn: () => apiClient.getExtendedCollection(tmdbId),
        enabled: !!tmdbId,
    });

    if (isLoading || !collection || !collection.parts || collection.parts.length === 0) {
        return null;
    }

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 300;
            const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
            scrollContainerRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="w-full py-12 bg-gradient-to-b from-background/50 to-background">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
                            {collection.name}
                        </h2>
                        <p className="text-muted-foreground text-sm mt-1">
                            {collection.parts.filter(p => p.in_library).length} من {collection.parts.length} متوفر في المكتبة
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => scroll('right')}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => scroll('left')}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div
                    ref={scrollContainerRef}
                    className="flex gap-6 overflow-x-auto pb-8 snap-x snap-mandatory scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {collection.parts.map((part, index) => {
                        const isCurrent = part.media_id === currentMediaId;
                        const posterUrl = part.in_library && part.local_poster
                            ? part.local_poster.startsWith('http') ? part.local_poster : `${import.meta.env.VITE_API_URL}${part.local_poster}`
                            : part.poster_path
                                ? `https://image.tmdb.org/t/p/w300${part.poster_path}`
                                : '/assets/no_poster.png';

                        return (
                            <motion.div
                                key={part.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={cn(
                                    "relative flex-shrink-0 w-48 snap-center group cursor-pointer rounded-xl overflow-hidden transition-all duration-300",
                                    isCurrent ? "ring-2 ring-primary scale-105" : "",
                                    !part.in_library ? "grayscale hover:grayscale-0" : "hover:scale-105"
                                )}
                                onClick={() => {
                                    if (part.in_library && part.media_id) {
                                        navigate(`/details/${part.media_id}`);
                                    } else {
                                        // Open TMDB page in new tab for discovery
                                        window.open(`https://www.themoviedb.org/movie/${part.id}`, '_blank');
                                    }
                                }}
                            >
                                <div className="aspect-[2/3] w-full relative">
                                    <img
                                        src={posterUrl}
                                        alt={part.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />

                                    {/* Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                                    {/* Status Badge */}
                                    <div className="absolute top-2 right-2">
                                        {!part.in_library && (
                                            <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-0 text-xs">
                                                <Lock className="w-3 h-3 mr-1" />
                                                غير متوفر
                                            </Badge>
                                        )}
                                        {part.in_library && part.quality && (
                                            <Badge className="bg-primary/80 backdrop-blur-md border-0 text-[10px] px-1 h-5">
                                                {part.quality}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <h3 className="text-white font-bold text-sm line-clamp-2 leading-tight">
                                            {part.title}
                                        </h3>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-gray-300">
                                                {part.release_date ? part.release_date.split('-')[0] : 'TBA'}
                                            </span>
                                            {part.vote_average > 0 && (
                                                <span className="text-xs text-yellow-400 font-medium">
                                                    ★ {part.vote_average.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Current Indicator */}
                                    {isCurrent && (
                                        <div className="absolute inset-0 border-4 border-primary rounded-xl pointer-events-none" />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default CollectionTimeline;
