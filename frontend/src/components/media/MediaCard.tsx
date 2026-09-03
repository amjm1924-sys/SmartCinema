import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, Star, Clock, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Media } from '@/types/media';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import UserRating from './UserRating';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useSound } from '@/hooks/useSound';

// Use empty string in development to let Vite proxy handle requests
const API_BASE = import.meta.env.VITE_API_URL || '';

interface MediaCardProps {
  media: Media;
  showProgress?: boolean;
  className?: string;
  customBadge?: React.ReactNode;
}

// Helper to extract a dominant color using HTML Canvas natively
function extractDominantColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const imgEl = new Image();
    imgEl.crossOrigin = 'Anonymous';
    imgEl.src = imgSrc;
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return resolve('transparent');

      canvas.width = 50;
      canvas.height = 50;

      try {
        context.drawImage(imgEl, 0, 0, 50, 50);
        const data = context.getImageData(0, 0, 50, 50).data;

        let r = 0, g = 0, b = 0, count = 0;
        const step = 4 * 10; // Sample every 10 pixels for speed

        for (let i = 0; i < data.length; i += step) {
          const alpha = data[i + 3];
          if (alpha > 125 && (data[i] > 20 || data[i + 1] > 20 || data[i + 2] > 20)) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }

        if (count === 0) return resolve('transparent');

        const rgb = [Math.floor(r / count), Math.floor(g / count), Math.floor(b / count)];
        const maxVal = Math.max(...rgb);
        const multiplier = maxVal < 150 ? 1.5 : 1.1; // Brighten dark dominant colors

        const rFin = Math.min(255, Math.floor(rgb[0] * multiplier));
        const gFin = Math.min(255, Math.floor(rgb[1] * multiplier));
        const bFin = Math.min(255, Math.floor(rgb[2] * multiplier));

        const toHex = (c: number) => {
          const hex = c.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        };

        resolve(`#${toHex(rFin)}${toHex(gFin)}${toHex(bFin)}`);
      } catch (e) {
        resolve('transparent');
      }
    };
    imgEl.onerror = () => resolve('transparent');
  });
}

// Helper to get certification badge color
function getCertificationColor(cert: string): string {
  const c = cert.toUpperCase();
  if (['G', 'TV-G'].includes(c)) return 'bg-green-600/90 text-white';
  if (['PG', 'TV-PG', 'TV-Y7'].includes(c)) return 'bg-blue-500/90 text-white';
  if (['PG-13', 'TV-14'].includes(c)) return 'bg-yellow-500/90 text-black';
  if (['R', 'TV-MA'].includes(c)) return 'bg-red-600/90 text-white';
  if (['NC-17'].includes(c)) return 'bg-red-900/90 text-white';
  return 'bg-zinc-600/90 text-white';
}

const MediaCard = ({ media, showProgress = false, className, customBadge }: MediaCardProps) => {
  const isMovie = media.type === 'movie';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { playHover, playClick } = useSound();

  // Helper object to convert country code to name in Arabic, falling back to original string if not a valid code
  const getCountryName = (code: string) => {
    try {
      if (code.length === 2) {
        return new Intl.DisplayNames(['ar'], { type: 'region' }).of(code.toUpperCase()) || code;
      }
    } catch (e) {
      // Ignore
    }
    return code;
  };

  // Build proper image URL
  const getPosterUrl = () => {
    if (!media.poster_url) return '/assets/no_poster.png';
    if (media.poster_url.startsWith('http')) return media.poster_url;
    const cleanPath = media.poster_url.replace(/^\//, '');
    return `${API_BASE}/${cleanPath}`;
  };

  const posterUrl = getPosterUrl();
  const showQuality = media.quality && media.quality !== 'Unknown';

  const addFavoriteMutation = useMutation({
    mutationFn: () => apiClient.addFavorite(media.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite', media.id] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
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

  const handleCardClick = (e: React.MouseEvent) => {
    if (!media.id && !media.library_id && !media.in_library) {
      e.preventDefault();
      const tmdbType = media.type === 'series' ? 'tv' : 'movie';
      if (media.tmdb_id) {
        window.open(`https://www.themoviedb.org/${tmdbType}/${media.tmdb_id}`, '_blank');
      } else {
        toast({
          title: "عفواً غير متوفر",
          description: "رابط TMDB غير متوفر.",
        });
      }
    }
  };

  const targetUrl = media.id ? `/details/${media.id}` : (media.library_id ? `/details/${media.library_id}` : '#');

  const [isHovering, setIsHovering] = useState(false);
  const [dominantColor, setDominantColor] = useState('transparent');
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Store globally outside component to prevent re-render beeps
  let lastMouseX = -1;
  let lastMouseY = -1;

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsHovering(true);
    // Only play hover sound if the mouse actually physically moved, prevents 1-minute re-render bugs
    if (e.clientX !== lastMouseX || e.clientY !== lastMouseY) {
      playHover();
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
    if (dominantColor === 'transparent') {
      extractDominantColor(posterUrl).then(color => {
        if (color !== 'transparent') setDominantColor(color);
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  return (
    <div
      className={cn('relative flex flex-col group w-full cursor-pointer outline-none', className)}
      onMouseEnter={(e) => handleMouseEnter(e)}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
    >
      <Link to={targetUrl} className="contents pointer-events-none">
        <div className="relative w-full">
          {/* 1. The Dynamic Glow Background Layer (Exact Sandbox Style) */}
          <motion.div
            className="absolute inset-0 rounded-2xl blur-2xl opacity-0 transition-opacity duration-1000 ease-out z-0 pointer-events-none"
            initial={false}
            animate={{
              opacity: isHovering && dominantColor !== 'transparent' ? 0.6 : 0,
              scale: isHovering ? 1.05 : 0.95,
            }}
            style={{
              backgroundColor: dominantColor,
              boxShadow: isHovering && dominantColor !== 'transparent' ? `0 0 60px 20px ${dominantColor}80` : 'none'
            }}
          />

          {/* 2. Main Poster Content Area (Exact Sandbox Style) */}
          <motion.div
            className="relative z-10 w-full aspect-[2/3] rounded-2xl overflow-hidden bg-card/50 ring-1 ring-white/5 shadow-xl transition-all duration-500 ease-out pointer-events-auto"
            animate={{
              y: isHovering ? -12 : 0,
              scale: isHovering ? 1.02 : 1
            }}
          >
            {/* Elegant Skeleton Loader while image is fetching */}
            {!isImageLoaded && (
              <div className="absolute inset-0 bg-white/5 animate-[shimmer_2s_infinite_linear] bg-gradient-to-r from-transparent via-white/10 to-transparent bg-[length:200%_100%] z-0" />
            )}

            {/* Poster Image */}
            <img
              src={posterUrl}
              alt={media.title}
              className={cn(
                "w-full h-full object-cover transition-all duration-700 ease-out",
                isHovering ? "scale-110" : "scale-100",
                !isImageLoaded ? "opacity-0 blur-md" : "opacity-100 blur-0"
              )}
              loading="lazy"
              decoding="async"
              onLoad={(e) => {
                setIsImageLoaded(true);
                (e.target as HTMLImageElement).style.opacity = '1';
              }}
              style={{ opacity: 0, transition: 'opacity 0.5s ease-in-out' }}
              onError={(e) => {
                setIsImageLoaded(true);
                (e.target as HTMLImageElement).src = '/assets/no_poster.png';
                (e.target as HTMLImageElement).style.opacity = '1';
              }}
            />

            {/* Quality Badge */}
            {showQuality && (
              <div className={`absolute top-2 right-2 bg-red-600/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-white border border-white/10 shadow-sm z-10 transition-opacity duration-300 ${isHovering ? 'opacity-0' : 'opacity-100'}`}>
                {media.quality}
              </div>
            )}

            {/* Age Rating Badge */}
            {media.certification && (
              <div className={`absolute top-2 left-2 ${getCertificationColor(media.certification)} backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold border border-white/10 shadow-sm z-10 transition-opacity duration-300 ${isHovering ? 'opacity-0' : 'opacity-100'}`}>
                {media.certification}
              </div>
            )}

            {/* Custom Badge */}
            {customBadge && (
              <div className={`absolute top-2 left-2 z-10 transition-opacity duration-300 ${isHovering ? 'opacity-0' : 'opacity-100'}`}>
                {customBadge}
              </div>
            )}

            {/* Progress Bar */}
            {showProgress && media.progress_percent && media.progress_percent > 0 && (
              <div className={`absolute bottom-0 left-0 right-0 h-1 bg-black/50 z-20 transition-opacity duration-300 ${isHovering ? 'opacity-0' : 'opacity-100'}`}>
                <div
                  className="h-full bg-primary shadow-[0_0_10px_2px_rgba(var(--primary),0.5)]"
                  style={{ width: `${Math.min(100, Math.max(0, media.progress_percent))}%` }}
                />
              </div>
            )}

            {/* Info Overlay Panel (Exact Sandbox Style via AnimatePresence) */}
            <AnimatePresence>
              {isHovering && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 p-4 pt-20 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end text-left z-30 pointer-events-none"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Title and Buttons Row */}
                  <div className="w-full mb-3 pointer-events-auto" dir="ltr">
                    {/* Quick Actions (Float Right) */}
                    <div className="float-right flex items-center gap-1.5 ml-2 mb-1">
                      <Button
                        size="icon"
                        className="h-9 w-9 rounded-full bg-white text-black hover:bg-white/90 hover:scale-110 transition-all border-none shadow-xl"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          playClick();
                          // Small delay lets Web Audio start before JS context is destroyed
                          setTimeout(() => { window.location.href = `/player/${media.id}`; }, 80);
                        }}
                      >
                        <Play className="w-4 h-4 fill-current ml-1" />
                      </Button>

                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9 rounded-full border-white/20 bg-black/40 backdrop-blur-md text-white hover:bg-white/20 hover:border-white/40 transition-all shadow-xl"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          addFavoriteMutation.mutate();
                        }}
                      >
                        <Bookmark className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Title Drop Shadow */}
                    <h3 className="text-xl font-bold text-white drop-shadow-md line-clamp-2 leading-tight text-left">
                      {media.title}
                    </h3>
                    <div className="clear-both"></div>
                  </div>

                  {/* Meta Row: Ratings, Country, Year */}
                  <div className="flex items-center gap-2 text-xs text-white/80 font-medium mb-3 flex-wrap text-left" dir="ltr">
                    {media.tmdb_rating && (
                      <span className="flex items-center gap-1 text-yellow-500 font-bold bg-black/40 px-1.5 py-0.5 rounded">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {media.tmdb_rating.toFixed(1)}
                      </span>
                    )}
                    <UserRating rating={media.user_rating} interactive={false} size="sm" showLabel={false} />
                    {media.year && <span className="bg-white/10 px-1.5 py-0.5 rounded backdrop-blur-sm">{media.year}</span>}
                    {media.country && <span className="bg-white/10 px-1.5 py-0.5 rounded backdrop-blur-sm">{getCountryName(media.country)}</span>}
                    {media.certification && (
                      <span className={`${getCertificationColor(media.certification)} px-1.5 py-0.5 rounded text-[10px] font-bold`}>
                        {media.certification}
                      </span>
                    )}
                  </div>

                  {/* Genres */}
                  {media.genres && (
                    <div className="flex justify-start gap-1.5 flex-wrap" dir="ltr">
                      {media.genres.split(',').slice(0, 3).map(g => (
                        <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 border border-white/10 text-white/95 backdrop-blur-md">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Text Details (Always visible below the card) */}
        <div className="mt-2 space-y-0.5 px-0.5 pointer-events-auto">
          <h3 className="font-semibold text-sm leading-tight truncate text-foreground group-hover:text-primary transition-colors">
            {media.title}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground truncate opacity-70">
              {media.type === 'movie' ? 'فيلم' : 'مسلسل'}
            </p>
            {media.duration && media.duration > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-80">
                <Clock className="w-3 h-3" />
                {Math.floor(media.duration / 3600) > 0
                  ? `${Math.floor(media.duration / 3600)}h ${Math.floor((media.duration % 3600) / 60)}m`
                  : `${Math.floor(media.duration / 60)}m`}
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
};

export default MediaCard;
