import { useState, useMemo } from 'react';
import { useTheme } from '@/components/theme-provider';
import { themes, Theme } from '@/lib/themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Paintbrush } from 'lucide-react';

export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();

    // Group themes into logical categories based on names or styles for better UX
    const groupedThemes = useMemo(() => {
         
        const groups: Record<string, { id: Theme; data: any }[]> = {
            "السمات الأساسية (Standard)": [],
            "السمات الحديثة (Modern)": [],
            "السمات الملونة (Vibrant)": [],
            "السمات الهادئة (Soft)": [],
            "السمات الداكنة (Dark)": [],
            "سمات المطورين (Developer)": [],
            "السمات الفاخرة (Luxury)": [],
        };

         
        (Object.entries(themes) as [Theme, any][]).forEach(([key, val]) => {
            const name = val.name.toLowerCase();

            if (['classic', 'minimal'].some(k => name.includes(k))) {
                groups["السمات الأساسية (Standard)"].push({ id: key, data: val });
            } else if (['cyberpunk', 'neon', 'matrix', 'synthwave', 'future'].some(k => name.includes(k))) {
                groups["السمات الملونة (Vibrant)"].push({ id: key, data: val });
            } else if (['luxury', 'gold', 'emerald', 'wine'].some(k => name.includes(k))) {
                groups["السمات الفاخرة (Luxury)"].push({ id: key, data: val });
            } else if (['pastel', 'coffee', 'cream', 'lavender', 'rose'].some(k => name.includes(k))) {
                groups["السمات الهادئة (Soft)"].push({ id: key, data: val });
            } else if (['monokai', 'dracula', 'nord', 'gruvbox', 'solarized', 'vercel', 'github'].some(k => name.includes(k))) {
                groups["سمات المطورين (Developer)"].push({ id: key, data: val });
            } else if (['abyss', 'slate', 'obsidian', 'ocean', 'midnight'].some(k => name.includes(k))) {
                groups["السمات الداكنة (Dark)"].push({ id: key, data: val });
            } else {
                groups["السمات الحديثة (Modern)"].push({ id: key, data: val });
            }
        });

        // Filter out empty groups
        return Object.fromEntries(Object.entries(groups).filter(([_, arr]) => arr.length > 0));
    }, []);

    const hslToCSS = (hslStr: string) => `hsl(${hslStr.replace(/\s+/g, ', ')})`;

    return (
        <Card className="border-primary/20 bg-black/40 shadow-xl backdrop-blur-md">
            <CardHeader className="border-b border-primary/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/20 rounded-xl">
                        <Paintbrush className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            معرض السمات والألوان (Theme Gallery)
                        </CardTitle>
                        <CardDescription className="text-muted-foreground mt-1 text-sm">
                            اختر مظهرك المفضل من بين العشرات من لوحات الألوان الخلابة. سيتم تطبيق التغيير فوراً على كامل النظام وحفظه محلياً في عارضك.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-10">
                {Object.entries(groupedThemes).map(([groupName, collection]) => (
                    <div key={groupName} className="space-y-4">
                        <h3 className="text-lg font-bold text-muted-foreground border-b border-white/5 pb-2">
                            {groupName} <span className="text-xs font-mono ml-2 opacity-50">({collection.length})</span>
                        </h3>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {collection.map(({ id, data }) => {
                                const isSelected = theme === id;
                                const bgColor = hslToCSS(data.colors.background);
                                const primaryColor = hslToCSS(data.colors.primary);
                                const cardColor = hslToCSS(data.colors.card);
                                const textColor = hslToCSS(data.colors.foreground);

                                return (
                                    <button
                                        key={id}
                                        onClick={() => setTheme(id)}
                                        className={`
                                            relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-300
                                            hover:scale-[1.03] group outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                            ${isSelected
                                                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02] shadow-lg shadow-primary/20 bg-primary/10'
                                                : 'border-white/10 hover:border-white/30 bg-black/50 hover:bg-black/80'
                                            }
                                        `}
                                    >
                                        {isSelected && (
                                            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground p-1 rounded-full shadow-md z-10 animate-in zoom-in">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}

                                        {/* Color Palette Preview Swatch */}
                                        <div
                                            className="w-full aspect-video rounded-md mb-3 overflow-hidden shadow-inner border border-white/10 flex flex-col"
                                            style={{ backgroundColor: bgColor }}
                                        >
                                            {/* Header Mockup */}
                                            <div className="h-3 w-full opacity-80" style={{ backgroundColor: cardColor }} />

                                            {/* Body Mockup */}
                                            <div className="flex-1 p-2 flex flex-col gap-1.5 justify-center opacity-90">
                                                <div className="w-3/4 h-1.5 rounded-full" style={{ backgroundColor: textColor, opacity: 0.8 }} />
                                                <div className="w-1/2 h-1.5 rounded-full" style={{ backgroundColor: textColor, opacity: 0.5 }} />

                                                <div className="flex gap-1 mt-auto">
                                                    <div className="w-6 h-3 rounded-sm opacity-90" style={{ backgroundColor: primaryColor }} />
                                                    <div className="w-6 h-3 rounded-sm opacity-40" style={{ backgroundColor: primaryColor }} />
                                                </div>
                                            </div>
                                        </div>

                                        <span className="text-sm font-semibold truncate w-full text-center">
                                            {data.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                            {id}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}


