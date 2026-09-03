import { useState, useEffect } from 'react';

export const useDominantColor = (imageUrl: string | undefined): { color: string | null; loading: boolean } => {
    const [color, setColor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!imageUrl) {
            setColor(null);
            return;
        }

        let isMounted = true;
        setLoading(true);

        const img = new Image();
        img.crossOrigin = "Anonymous";

        // Handle local API URLs correctly if they lack full path
        const src = imageUrl.startsWith('http')
            ? imageUrl
            : `${import.meta.env.VITE_API_URL || ''}/${imageUrl.replace(/^\//, '')}`;

        img.src = src;

        img.onload = () => {
            if (!isMounted) return;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setLoading(false);
                return;
            }

            // Reduce size for performance and broader sampling
            canvas.width = 50;
            canvas.height = 50;
            ctx.drawImage(img, 0, 0, 50, 50);

            try {
                const imageData = ctx.getImageData(0, 0, 50, 50).data;
                let r = 0, g = 0, b = 0, count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    // Skip transparent pixels
                    if (imageData[i + 3] < 128) continue;

                    const red = imageData[i];
                    const green = imageData[i + 1];
                    const blue = imageData[i + 2];

                    // Heuristic: Avoid near-white and near-black pixels to find "theme" color
                    // Skip very dark
                    if (red < 20 && green < 20 && blue < 20) continue;
                    // Skip very light
                    if (red > 230 && green > 230 && blue > 230) continue;

                    r += red;
                    g += green;
                    b += blue;
                    count++;
                }

                if (count > 0) {
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);

                    // Boost saturation slightly? Maybe too complex. Just raw avg for now.
                    setColor(`rgb(${r}, ${g}, ${b})`);
                } else {
                    setColor(null);
                }
            } catch (e) {
                console.error("Error extracting color from canvas:", e);
                setColor(null);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        img.onerror = () => {
            if (isMounted) {
                setLoading(false);
                setColor(null);
            }
        };

        return () => {
            isMounted = false;
        };

    }, [imageUrl]);

    return { color, loading };
};
