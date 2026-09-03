import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Media } from '@/types/media';
import MediaCard from './MediaCard';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MediaCarouselProps<T> {
  title?: React.ReactNode | string;
  items: T[];
  showProgress?: boolean;
  className?: string;
  renderItem?: (item: T) => React.ReactNode;
}

const MediaCarousel = <T extends { id: string | number }>({
  title,
  items,
  showProgress = false,
  className,
  renderItem,
}: MediaCarouselProps<T>) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className={cn('relative w-full snap-start py-8', className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-4 px-4 md:px-0">
          <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 md:w-10 md:h-10"
              onClick={() => scroll('right')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 md:w-10 md:h-10"
              onClick={() => scroll('left')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4 md:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item, index) => (
          <motion.div
            key={`${item.id || 'carousel-item'}-${index}`}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "50px" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex-shrink-0 w-32 sm:w-40 md:w-48"
          >
            {renderItem ? (
              renderItem(item)
            ) : (
              <MediaCard
                media={item as unknown as Media}
                showProgress={showProgress}
              />
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default MediaCarousel;
