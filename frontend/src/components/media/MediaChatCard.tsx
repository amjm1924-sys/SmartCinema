import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Library, Film, Tv } from 'lucide-react';

interface MediaChatCardProps {
    title: string;
    year: string;
    poster_url: string | null;
    tmdb_id: number;
    media_type: string;
    local_id: number | null;
    tmdb_url: string;
    index?: number;
}

export function MediaChatCard({
    title, year, poster_url, tmdb_id, media_type, local_id, tmdb_url, index = 0
}: MediaChatCardProps) {
    const navigate = useNavigate();

    const handleClick = () => {
        if (local_id) {
            navigate(`/details/${local_id}`);
        } else {
            window.open(tmdb_url, '_blank', 'noopener,noreferrer');
        }
    };

    const isInLibrary = !!local_id;
    const Icon = media_type === 'tv' ? Tv : Film;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.07, duration: 0.35, ease: 'easeOut' }}
            onClick={handleClick}
            className="relative flex-shrink-0 w-28 cursor-pointer group"
            title={`${title} (${year})`}
        >
            {/* Poster */}
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-lg group-hover:shadow-purple-500/30 group-hover:border-white/30 transition-all duration-300 group-hover:scale-105">
                {poster_url ? (
                    <img
                        src={poster_url}
                        alt={title}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <Icon className="w-8 h-8 text-white/30" />
                    </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-xl">
                    {isInLibrary ? (
                        <div className="flex flex-col items-center gap-1">
                            <Library className="w-5 h-5 text-emerald-400" />
                            <span className="text-xs text-emerald-400 font-medium">Open</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
                            <ExternalLink className="w-5 h-5 text-blue-400" />
                            <span className="text-xs text-blue-400 font-medium">TMDB</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Library badge */}
            {isInLibrary && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border border-black/30">
                    <Library className="w-2.5 h-2.5 text-white" />
                </div>
            )}

            {/* Title */}
            <div className="mt-2 px-0.5">
                <p className="text-xs text-white/80 font-medium truncate leading-tight">{title}</p>
                {year && <p className="text-xs text-white/40 mt-0.5">{year}</p>}
            </div>
        </motion.div>
    );
}
