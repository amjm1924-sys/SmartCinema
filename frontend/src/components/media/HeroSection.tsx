import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Media } from '@/types/media';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDuration } from '@/lib/utils';
import UserRating from './UserRating';

import { apiClient } from '@/lib/api';
import { extractDominantColor } from '@/lib/colorUtils';

interface HeroSectionProps {
  items: Media[];
}

const HeroSection = ({ items }: HeroSectionProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [dominantColor, setDominantColor] = useState('transparent');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentItem = items[currentIndex];
  const localTrailer = currentItem?.trailer_local;

  // Parallax Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY, currentTarget } = e;
    const { width, height, left, top } = currentTarget.getBoundingClientRect();
    const x = (clientX - left - width / 2) / 25;
    const y = (clientY - top - height / 2) / 25;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Image Parallax (moves opposite to mouse)
  const imgX = useTransform(mouseX, (val) => -val * 0.8);
  const imgY = useTransform(mouseY, (val) => -val * 0.8);

  // Rotation Logic & Color Extraction
  useEffect(() => {
    if (items.length <= 1 || !currentItem) return;

    // Reset states
    setShowTrailer(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Extract Dominant Color for Adaptive Glow
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = apiClient.getImageUrl(currentItem.backdrop_url || currentItem.poster_url);
    img.onload = async () => {
      const color = await extractDominantColor(img);
      setDominantColor(color);
    };

    // Trailer Logic
    if (localTrailer) {
      timeoutRef.current = setTimeout(() => {
        setShowTrailer(true);
      }, 3000);
    }

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 15000);

    return () => {
      clearInterval(timer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, currentIndex, localTrailer, currentItem?.id]);

  if (!currentItem) return null;

  const isMovie = currentItem.type === 'movie';
  const backdropUrl = apiClient.getImageUrl(currentItem.backdrop_url || currentItem.poster_url);
  const localTrailerUrl = localTrailer ? apiClient.getTrailerUrl(currentItem.id) : null;

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    return `${minutes}m`;
  };

  return (
    <section
      className="relative h-[70vh] md:h-[85vh] overflow-hidden group perspective-1000"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Adaptive Background Glow Effect */}
      <div
        className="absolute inset-0 transition-colors duration-[1500ms] ease-out mix-blend-screen opacity-50 z-0 pointer-events-none"
        style={{
          background: dominantColor !== 'transparent'
            ? `radial-gradient(circle at 60% 40%, ${dominantColor}40 0%, transparent 70%)`
            : 'transparent'
        }}
      />

      {/* Background Image / Trailer */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentItem.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="absolute inset-0 z-0"
        >
          {showTrailer && localTrailerUrl ? (
            <div className="absolute inset-0 w-full h-full pointer-events-none scale-105 transition-transform duration-[2000ms]">
              <video
                className="w-full h-full object-cover"
                src={localTrailerUrl}
                autoPlay
                muted={isMuted}
                loop
                playsInline
                style={{ pointerEvents: 'none' }}
              />
            </div>
          ) : (
            <motion.img
              src={backdropUrl}
              alt={currentItem.title}
              className="w-full h-full object-cover scale-105"
              style={{
                x: imgX,
                y: imgY
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/assets/no_backdrop.png';
              }}
            />
          )}

          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="absolute inset-0 flex items-end pb-20 md:pb-32 z-10 pointer-events-none">
        <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, x: -30, filter: 'blur(10px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 30, filter: 'blur(10px)' }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-2xl pointer-events-auto"
              style={{ x: mouseX, y: mouseY }}
            >
              {/* Quality Badge */}
              {currentItem.quality && (
                <Badge className="mb-4 bg-primary text-white font-bold px-3 py-1 text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(255,0,0,0.5)]">
                  {currentItem.quality}
                </Badge>
              )}

              {/* Title */}
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-4 leading-[1.1] tracking-tighter drop-shadow-2xl text-white">
                {currentItem.title}
              </h1>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 mb-6 text-sm md:text-base text-zinc-300 font-medium drop-shadow-md">
                {(currentItem.imdb_rating || currentItem.tmdb_rating) && (
                  <span className="flex items-center gap-1 bg-yellow-500/20 border border-yellow-500/50 px-2 py-0.5 rounded text-yellow-400 font-bold backdrop-blur-sm">
                    <span className="text-xs">IMDb</span>
                    <span>{(currentItem.imdb_rating || currentItem.tmdb_rating || 0).toFixed(1)}</span>
                  </span>
                )}
                <UserRating rating={currentItem.user_rating} interactive={false} size="sm" showLabel={true} />
                {currentItem.year && <span>{currentItem.year}</span>}
                <span className="border border-zinc-500 px-1.5 py-0.5 rounded-sm text-xs bg-black/60 shadow-inner">
                  {currentItem.certification || '+18'}
                </span>
                {currentItem.duration && isMovie && <span>{formatDuration(currentItem.duration)}</span>}

                {currentItem.genres && (
                  <div className="flex gap-2 ml-2">
                    {currentItem.genres.split(',').slice(0, 3).map((genre) => (
                      <Badge key={genre} variant="outline" className="text-xs border-zinc-500/50 text-zinc-300 bg-black/20 backdrop-blur-md">
                        {genre.trim()}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              {currentItem.overview && (
                <p className="text-base md:text-lg text-zinc-200 line-clamp-3 mb-8 leading-relaxed max-w-xl drop-shadow-xl font-light">
                  {currentItem.overview}
                </p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-4">
                <Link to={`/player/${currentItem.id}`}>
                  <Button size="lg" className="h-14 px-8 gap-3 text-lg font-bold bg-white text-black hover:bg-zinc-200 hover:scale-105 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                    <Play className="w-6 h-6 fill-current" />
                    تشغيل الأن
                  </Button>
                </Link>
                <Link to={`/details/${currentItem.id}`}>
                  <Button size="lg" variant="secondary" className="h-14 px-8 gap-3 text-lg font-bold bg-zinc-800/60 hover:bg-zinc-700/80 text-white backdrop-blur-xl border border-white/10 hover:scale-105 transition-all duration-300">
                    <Info className="w-6 h-6" />
                    المزيد من التفاصيل
                  </Button>
                </Link>

                {showTrailer && localTrailerUrl && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="rounded-full w-14 h-14 bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-xl ml-auto hover:scale-110 transition-all duration-300"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </Button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Indicators */}
      {items.length > 1 && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 py-4 pl-4 border-l border-white/10 hidden lg:flex z-20">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-1.5 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(255,0,0,0.5)] ${index === currentIndex
                ? 'bg-primary h-16'
                : 'bg-zinc-600/50 hover:bg-zinc-400 h-10 opacity-50 hover:opacity-100'
                }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default HeroSection;


