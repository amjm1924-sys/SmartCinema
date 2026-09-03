import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, ExternalLink, HardDrive } from 'lucide-react';
import MediaCarousel from './MediaCarousel';
import MediaCard from './MediaCard';

interface AIRecommendationsProps {
    mediaId: number;
}

export const AIRecommendations = ({ mediaId }: AIRecommendationsProps) => {
    const { data: recommendations, isLoading, error } = useQuery({
        queryKey: ['ai', 'recommendations', mediaId],
        queryFn: () => apiClient.getAIRecommendations(mediaId),
        staleTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
        retry: false
    });

    if (isLoading) {
        return (
            <div className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                        AI Recommendations
                    </h2>
                </div>
                <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="w-[160px] h-[240px] rounded-lg shrink-0" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !recommendations || recommendations.length === 0) return null;

    return (
        <div className="mb-12">
            <MediaCarousel
                title={
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-purple-500" />
                        <h2 className="text-2xl font-bold">More Like This (AI)</h2>
                        <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-500 ml-2">Beta</Badge>
                    </div>
                }
                 
                items={recommendations as any[]}
                 
                renderItem={(item: any) => {
                    const media = {
                        ...item,
                        id: item.is_local ? item.id : undefined,
                        poster_url: item.poster,
                        in_library: item.is_local,
                        library_id: item.is_local ? item.id : undefined
                    };

                    const customBadge = item.is_local ? (
                        <Badge variant="secondary" className="h-5 px-1 bg-green-500 text-white shadow-md">
                            <HardDrive className="w-3 h-3" />
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="h-5 px-1 bg-purple-500 text-white shadow-md">
                            <ExternalLink className="w-3 h-3" />
                        </Badge>
                    );

                    return <MediaCard media={media} customBadge={customBadge} />;
                }}
            />
        </div>
    );
};


