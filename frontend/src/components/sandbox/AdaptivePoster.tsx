import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AdaptivePosterProps {
    title: string;
    posterUrl: string;
    year: number;
}

// Helper to extract a dominant color using HTML Canvas natively
function extractDominantColor(imgEl: HTMLImageElement): Promise<string> {
    return new Promise((resolve) => {
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
                // Skip fully transparent pixels and extremely dark ones to keep the glow vibrant
                if (alpha > 125 && (data[i] > 20 || data[i + 1] > 20 || data[i + 2] > 20)) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
            }

            if (count === 0) return resolve('transparent');

            // Boost saturation slightly by pushing max channels up and rounding
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
    });
}

export function AdaptivePoster({ title, posterUrl, year }: AdaptivePosterProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [color, setColor] = useState<string>('transparent');

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = posterUrl;
        img.onload = async () => {
            const extracted = await extractDominantColor(img);
            if (extracted !== 'transparent') setColor(extracted);
        };
    }, [posterUrl]);

    const shadowColorHex = color !== 'transparent' ? `${color}80` : 'transparent'; // 50% opacity hex

    return (
        <div
            className="relative flex flex-col group w-full cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* The Dynamic Glow Background Layer */}
            <motion.div
                className="absolute inset-0 rounded-2xl blur-2xl opacity-0 transition-opacity duration-700 ease-out z-0"
                initial={false}
                animate={{
                    opacity: isHovered ? 0.6 : 0,
                    scale: isHovered ? 1.05 : 0.95,
                }}
                style={{
                    backgroundColor: color,
                    // Give it a strong luminous shadow matching the exact dominant image color
                    boxShadow: isHovered && color !== 'transparent' ? `0 0 60px 20px ${shadowColorHex}` : 'none'
                }}
            />

            {/* Main Poster Content Area */}
            <motion.div
                className="relative z-10 w-full aspect-[2/3] rounded-2xl overflow-hidden bg-muted border border-white/10 shadow-xl transition-all duration-500 ease-out"
                animate={{
                    y: isHovered ? -12 : 0,
                    scale: isHovered ? 1.02 : 1
                }}
            >
                {/* Image */}
                <img
                    src={posterUrl}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                    crossOrigin="anonymous"
                />

                {/* Info Overlay Panel */}
                <AnimatePresence>
                    {isHovered && (
                        <motion.div
                            className="absolute bottom-0 left-0 right-0 p-5 pt-20 bg-gradient-to-t from-black via-black/80 to-transparent"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h3 className="text-xl font-bold text-white drop-shadow-md line-clamp-2 leading-tight mb-1">
                                {title}
                            </h3>
                            <div className="flex items-center gap-2 text-sm text-white/80 font-medium">
                                <span>{year}</span>

                                {/* Dynamic Color Badge based on image */}
                                {color !== 'transparent' && (
                                    <div
                                        className="px-2 py-0.5 rounded text-xs font-bold text-black ml-auto shadow-sm"
                                        style={{ backgroundColor: color }}
                                    >
                                        Theme Match
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
