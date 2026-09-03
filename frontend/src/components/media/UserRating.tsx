import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface UserRatingProps {
    rating: number | null | undefined;
    onRate?: (rating: number | null) => void;
    interactive?: boolean;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
    className?: string;
}

const sizeMap = {
    sm: { star: 'w-3.5 h-3.5', text: 'text-xs', gap: 'gap-0.5', px: 'px-1.5 py-0.5' },
    md: { star: 'w-4 h-4', text: 'text-sm', gap: 'gap-1', px: 'px-2 py-1' },
    lg: { star: 'w-5 h-5', text: 'text-base', gap: 'gap-1', px: 'px-2.5 py-1.5' },
};

const UserRating = ({
    rating,
    onRate,
    interactive = false,
    size = 'md',
    showLabel = true,
    className,
}: UserRatingProps) => {
    const [hoverValue, setHoverValue] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const s = sizeMap[size];

    // Display-only mode (for MediaCard, HeroSection)
    if (!interactive) {
        if (!rating) return null;
        return (
            <span className={cn(
                'flex items-center gap-1 text-violet-400 font-bold bg-violet-500/20 border border-violet-500/30 rounded backdrop-blur-sm',
                s.px, s.text,
                className
            )}>
                <Star className={cn(s.star, 'fill-violet-400 text-violet-400')} />
                {rating.toFixed(1)}
            </span>
        );
    }

    // Interactive mode (for Details page)
    const displayValue = hoverValue ?? rating ?? 0;
    const totalStars = 10;

    const handleClick = (value: number) => {
        if (onRate) {
            // If clicking the same value, clear rating
            if (value === rating) {
                onRate(null);
            } else {
                onRate(value);
            }
        }
    };

    return (
        <div className={cn('flex items-center gap-2', className)}>
            {showLabel && (
                <span className="text-violet-300 text-sm font-medium">تقييمي</span>
            )}
            <div
                className="flex items-center gap-0.5 relative"
                onMouseLeave={() => setHoverValue(null)}
            >
                {Array.from({ length: totalStars }, (_, i) => {
                    const value = i + 1;
                    const isFilled = value <= displayValue;
                    return (
                        <motion.button
                            key={i}
                            type="button"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onMouseEnter={() => setHoverValue(value)}
                            onClick={() => handleClick(value)}
                            className="p-0 border-0 bg-transparent cursor-pointer focus:outline-none"
                        >
                            <Star
                                className={cn(
                                    'w-5 h-5 transition-all duration-150',
                                    isFilled
                                        ? 'fill-violet-400 text-violet-400 drop-shadow-[0_0_4px_rgba(139,92,246,0.5)]'
                                        : 'text-zinc-600 hover:text-violet-300'
                                )}
                            />
                        </motion.button>
                    );
                })}
                <AnimatePresence>
                    {(rating != null && rating > 0) && (
                        <motion.span
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="ml-2 text-violet-300 font-bold text-lg"
                        >
                            {rating.toFixed(1)}
                        </motion.span>
                    )}
                </AnimatePresence>
                {rating != null && rating > 0 && onRate && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        type="button"
                        onClick={() => onRate(null)}
                        className="ml-1 p-0.5 rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors"
                        title="حذف التقييم"
                    >
                        <X className="w-4 h-4" />
                    </motion.button>
                )}
            </div>
            {hoverValue && (
                <span className="text-violet-300/70 text-xs font-medium">
                    {hoverValue}/10
                </span>
            )}
        </div>
    );
};

export default UserRating;
