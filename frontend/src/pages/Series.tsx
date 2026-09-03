import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, X, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { apiClient } from '@/lib/api';
import { Media } from '@/types/media';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import MediaCard from '@/components/media/MediaCard';
import { getCountryName } from '@/lib/countries';

// Session storage key for persisting filters
const SERIES_FILTERS_KEY = 'smartcinema_series_filters';

// Arabic genre categories (matching TMDB Arabic genres)
const PREDEFINED_GENRES = [
    'حركة',
    'مغامرة',
    'حركة ومغامرة',
    'رسوم متحركة',
    'كوميديا',
    'جريمة',
    'وثائقي',
    'دراما',
    'عائلي',
    'أطفال',
    'فانتازيا',
    'خيال علمي',
    'خيال علمي وفانتازيا',
    'غموض',
    'أخبار',
    'واقعي',
    'رومانسية',
    'رعب',
    'إثارة',
    'حرب',
    'حرب وسياسة',
    'غربي',
    'موسيقى',
    'تاريخ'
];

// Quality options
const QUALITY_OPTIONS = ['2160p', '1080p', '720p', '480p', 'Unknown'];

// Certification options for TV series
const CERTIFICATION_OPTIONS = [
    { value: 'TV-Y', label: 'TV-Y' },
    { value: 'TV-Y7', label: 'TV-Y7' },
    { value: 'TV-G', label: 'TV-G (عام)' },
    { value: 'TV-PG', label: 'TV-PG (إرشاد أبوي)' },
    { value: 'TV-14', label: 'TV-14 (14+)' },
    { value: 'TV-MA', label: 'TV-MA (للبالغين)' },
];

interface FiltersState {
    search: string;
    selectedGenres: string[];
    selectedCountries: string[];
    selectedCertifications: string[];
    selectedQualities: string[];
    yearRange: number[];
    sortBy: string;
    showFilters: boolean;
}

const defaultFilters: FiltersState = {
    search: '',
    selectedGenres: [],
    selectedCountries: [],
    selectedCertifications: [],
    selectedQualities: [],
    yearRange: [1980, new Date().getFullYear()],
    sortBy: 'added_at',
    showFilters: false,
};

function loadFilters(): FiltersState {
    try {
        const saved = sessionStorage.getItem(SERIES_FILTERS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...defaultFilters, ...parsed };
        }
    } catch {
        // Ignore parse errors
    }
    return { ...defaultFilters };
}

function saveFilters(filters: FiltersState) {
    try {
        sessionStorage.setItem(SERIES_FILTERS_KEY, JSON.stringify(filters));
    } catch {
        // Ignore storage errors
    }
}

const Series = () => {
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || '';

    // Load persisted filters on mount
    const initialFilters = useRef(loadFilters()).current;

    const [search, setSearch] = useState(urlSearch || initialFilters.search);
    const [selectedGenres, setSelectedGenres] = useState<string[]>(initialFilters.selectedGenres);
    const [selectedCountries, setSelectedCountries] = useState<string[]>(initialFilters.selectedCountries);
    const [selectedCertifications, setSelectedCertifications] = useState<string[]>(initialFilters.selectedCertifications);
    const [selectedQualities, setSelectedQualities] = useState<string[]>(initialFilters.selectedQualities);
    const [yearRange, setYearRange] = useState(initialFilters.yearRange);
    const [sortBy, setSortBy] = useState(initialFilters.sortBy);
    const [showFilters, setShowFilters] = useState(initialFilters.showFilters);

    // Check if any filter is active
    const hasActiveFilters = search.trim() !== '' ||
        selectedGenres.length > 0 ||
        selectedCountries.length > 0 ||
        selectedCertifications.length > 0 ||
        selectedQualities.length > 0 ||
        yearRange[0] !== 1980 ||
        yearRange[1] !== new Date().getFullYear();

    // Count active filter categories
    const activeFilterCount = [
        search.trim() !== '',
        selectedGenres.length > 0,
        selectedCountries.length > 0,
        selectedCertifications.length > 0,
        selectedQualities.length > 0,
        yearRange[0] !== 1980 || yearRange[1] !== new Date().getFullYear(),
    ].filter(Boolean).length;

    // Auto-show filters panel if any filter is active
    useEffect(() => {
        if (hasActiveFilters && !showFilters) {
            setShowFilters(true);
        }
    }, []); // Only on mount

    // Persist filters to sessionStorage on every change
    useEffect(() => {
        saveFilters({
            search,
            selectedGenres,
            selectedCountries,
            selectedCertifications,
            selectedQualities,
            yearRange,
            sortBy,
            showFilters,
        });
    }, [search, selectedGenres, selectedCountries, selectedCertifications, selectedQualities, yearRange, sortBy, showFilters]);

    // Update search when URL changes
    useEffect(() => {
        if (urlSearch) {
            setSearch(urlSearch);
            setShowFilters(true);
        }
    }, [urlSearch]);

    // Fetch genres from backend
    const { data: dynamicGenres = [] } = useQuery({
        queryKey: ['genres'],
        queryFn: () => apiClient.getGenres(),
    });

    const allGenres = dynamicGenres.length > 0 ? dynamicGenres : PREDEFINED_GENRES;

    // Fetch ALL series first (no pre-filtering)
    const { data: allSeries = [], isLoading } = useQuery({
        queryKey: ['media', 'series', sortBy],
        queryFn: () =>
            apiClient.getAllMedia({
                type: 'series',

                sort: sortBy as any,
                limit: 1000,
            }),

        select: (data: any) => data.data || [],
    });

    // Extract Unique Countries
    const allCountries = Array.from(new Set(allSeries.map((s: any) => s.country).filter(Boolean))).sort() as string[];

    // Get all unique qualities
    const allQualities = Array.from(new Set(allSeries.map((s: any) => s.quality).filter(Boolean))) as string[];
    const sortedQualities = [...new Set([...QUALITY_OPTIONS.filter(q => allQualities.includes(q)), ...allQualities])];

    // Get all unique certifications from data
    const allCertifications = Array.from(new Set(allSeries.map((s: any) => s.certification).filter(Boolean))) as string[];

    // Client-side filtering for search, genres, and year
    const filteredSeries = allSeries.filter((show) => {
        // Search filter
        if (search && search.trim()) {
            const searchLower = search.toLowerCase().trim();
            const titleMatch = show.title?.toLowerCase().includes(searchLower);
            const originalTitleMatch = show.original_title?.toLowerCase().includes(searchLower);
            if (!titleMatch && !originalTitleMatch) return false;
        }

        // Country Filter (multi-select)
        if (selectedCountries.length > 0) {
            if (!selectedCountries.includes(show.country || '')) return false;
        }

        // Genre filter
        if (selectedGenres.length > 0) {
            const hasMatchingGenre = selectedGenres.some((genre) =>
                show.genres?.includes(genre)
            );
            if (!hasMatchingGenre) return false;
        }

        // Quality filter (multi-select)
        if (selectedQualities.length > 0) {
            const showQuality = show.quality || 'Unknown';
            if (!selectedQualities.includes(showQuality)) return false;
        }

        // Year filter
        if (show.year) {
            if (show.year < yearRange[0] || show.year > yearRange[1]) return false;
        }

        // Certification filter (multi-select)
        if (selectedCertifications.length > 0) {
            if (!selectedCertifications.includes(show.certification || '')) return false;
        }

        return true;
    });

    const toggleGenre = (genre: string) => {
        setSelectedGenres((prev) =>
            prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
        );
    };

    const toggleCountry = (country: string) => {
        setSelectedCountries((prev) =>
            prev.includes(country) ? prev.filter((c) => c !== country) : [...prev, country]
        );
    };

    const toggleCertification = (cert: string) => {
        setSelectedCertifications((prev) =>
            prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
        );
    };

    const toggleQuality = (quality: string) => {
        setSelectedQualities((prev) =>
            prev.includes(quality) ? prev.filter((q) => q !== quality) : [...prev, quality]
        );
    };

    const clearFilters = () => {
        setSelectedGenres([]);
        setSelectedCountries([]);
        setSelectedCertifications([]);
        setSelectedQualities([]);
        setYearRange([1980, new Date().getFullYear()]);
        setSearch('');
    };

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 py-8 mt-20">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-2">المسلسلات</h1>
                        <p className="text-muted-foreground">
                            {filteredSeries.length} مسلسل
                        </p>
                    </div>

                    <div className="flex gap-2">
                        {/* Clear Filters Button - Always visible when filters are active */}
                        {hasActiveFilters && (
                            <Button
                                variant="destructive"
                                onClick={clearFilters}
                                className="gap-2"
                                size="sm"
                            >
                                <X className="w-4 h-4" />
                                إزالة الفلاتر
                                {activeFilterCount > 0 && (
                                    <Badge variant="secondary" className="mr-1 px-1.5 py-0 text-xs rounded-full">
                                        {activeFilterCount}
                                    </Badge>
                                )}
                            </Button>
                        )}
                        <Button
                            variant={showFilters ? 'default' : 'outline'}
                            onClick={() => setShowFilters(!showFilters)}
                            className="gap-2"
                        >
                            <Filter className="w-4 h-4" />
                            الفلاتر
                            {hasActiveFilters && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Active Filters Summary (shown even when panel is collapsed) */}
                {hasActiveFilters && !showFilters && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-wrap gap-2 mb-6 items-center"
                    >
                        <span className="text-sm text-muted-foreground ml-2">
                            <SlidersHorizontal className="w-4 h-4 inline ml-1" />
                            الفلاتر النشطة:
                        </span>
                        {search && (
                            <Badge variant="secondary" className="gap-1">
                                بحث: {search}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => setSearch('')} />
                            </Badge>
                        )}
                        {selectedGenres.map(g => (
                            <Badge key={g} variant="secondary" className="gap-1">
                                {g}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => toggleGenre(g)} />
                            </Badge>
                        ))}
                        {selectedCountries.map(c => (
                            <Badge key={c} variant="secondary" className="gap-1">
                                {getCountryName(c, 'both')}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => toggleCountry(c)} />
                            </Badge>
                        ))}
                        {selectedQualities.map(q => (
                            <Badge key={q} variant="secondary" className="gap-1">
                                {q}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => toggleQuality(q)} />
                            </Badge>
                        ))}
                        {selectedCertifications.map(c => (
                            <Badge key={c} variant="secondary" className="gap-1">
                                {c}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => toggleCertification(c)} />
                            </Badge>
                        ))}
                        {(yearRange[0] !== 1980 || yearRange[1] !== new Date().getFullYear()) && (
                            <Badge variant="secondary" className="gap-1">
                                السنة: {yearRange[0]} - {yearRange[1]}
                                <X className="w-3 h-3 cursor-pointer" onClick={() => setYearRange([1980, new Date().getFullYear()])} />
                            </Badge>
                        )}
                    </motion.div>
                )}

                {/* Filters Panel */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="glass-panel p-6 mb-8 space-y-6"
                        >
                            {/* Search */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">بحث</label>
                                <Input
                                    type="text"
                                    placeholder="ابحث عن مسلسل..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="max-w-md"
                                />
                                {search && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {filteredSeries.length} نتيجة
                                    </p>
                                )}
                            </div>

                            {/* Genres (multi-select badges) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium">الأنواع</label>
                                    {selectedGenres.length > 0 && (
                                        <button
                                            onClick={() => setSelectedGenres([])}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            مسح ({selectedGenres.length})
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                                    {allGenres.map((genre) => (
                                        <Badge
                                            key={genre}
                                            variant={selectedGenres.includes(genre) ? 'default' : 'outline'}
                                            className="cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => toggleGenre(genre)}
                                        >
                                            {genre}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            {/* Quality (multi-select badges) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium">الجودة</label>
                                    {selectedQualities.length > 0 && (
                                        <button
                                            onClick={() => setSelectedQualities([])}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            مسح ({selectedQualities.length})
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {sortedQualities.map((quality) => (
                                        <Badge
                                            key={quality}
                                            variant={selectedQualities.includes(quality) ? 'default' : 'outline'}
                                            className="cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => toggleQuality(quality)}
                                        >
                                            {quality}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            {/* Country (multi-select badges) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium">البلد</label>
                                    {selectedCountries.length > 0 && (
                                        <button
                                            onClick={() => setSelectedCountries([])}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            مسح ({selectedCountries.length})
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                    {allCountries.map((country) => (
                                        <Badge
                                            key={country}
                                            variant={selectedCountries.includes(country) ? 'default' : 'outline'}
                                            className="cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => toggleCountry(country)}
                                        >
                                            {getCountryName(country, 'both')}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            {/* Certification (multi-select badges) */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium">التصنيف العمري</label>
                                    {selectedCertifications.length > 0 && (
                                        <button
                                            onClick={() => setSelectedCertifications([])}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            مسح ({selectedCertifications.length})
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {CERTIFICATION_OPTIONS.map((cert) => (
                                        <Badge
                                            key={cert.value}
                                            variant={selectedCertifications.includes(cert.value) ? 'default' : 'outline'}
                                            className="cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => toggleCertification(cert.value)}
                                        >
                                            {cert.label}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            {/* Year Range */}
                            <div>
                                <label className="text-sm font-medium mb-2 block">
                                    السنة: {yearRange[0]} - {yearRange[1]}
                                </label>
                                <Slider
                                    value={yearRange}
                                    min={1980}
                                    max={new Date().getFullYear()}
                                    step={1}
                                    onValueChange={setYearRange}
                                    className="max-w-md"
                                />
                            </div>

                            {/* Sort + Clear */}
                            <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="text-sm font-medium mb-2 block">الترتيب</label>
                                    <Select value={sortBy} onValueChange={setSortBy}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="title">الاسم (أ-ي)</SelectItem>
                                            <SelectItem value="year">السنة (الأحدث)</SelectItem>
                                            <SelectItem value="year_asc">السنة (الأقدم)</SelectItem>
                                            <SelectItem value="tmdb_rating">التقييم (الأعلى)</SelectItem>
                                            <SelectItem value="rating_asc">التقييم (الأقل)</SelectItem>
                                            <SelectItem value="quality_desc">الجودة (من الأعلى إلى الأقل)</SelectItem>
                                            <SelectItem value="quality_asc">الجودة (من الأقل إلى الأعلى)</SelectItem>
                                            <SelectItem value="added_at">الأحدث إضافة</SelectItem>
                                            <SelectItem value="added_asc">الأقدم إضافة</SelectItem>
                                            {/* Duration might be less useful for Series (episode length vs total?), but user asked for it/all options. 
                                            Actually series duration usually means episode run time. I'll include it. */}
                                            <SelectItem value="duration">المدة (الأطول)</SelectItem>
                                            <SelectItem value="duration_asc">المدة (الأقصر)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Clear Filters */}
                                {hasActiveFilters && (
                                    <Button variant="destructive" onClick={clearFilters} className="gap-2">
                                        <X className="w-4 h-4" />
                                        إزالة الفلاتر
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Series Grid */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
                    </div>
                ) : filteredSeries.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-6">
                        {filteredSeries.map((show, index) => (
                            <motion.div
                                key={show.id}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 7), 5) * 0.15 + (index % 7) * 0.06, ease: "easeOut" }}
                            >
                                <MediaCard media={show} />
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <h3 className="text-2xl font-bold mb-2">لا توجد مسلسلات</h3>
                        <p className="text-muted-foreground">
                            {search || selectedGenres.length > 0
                                ? 'جرب تغيير الفلاتر'
                                : 'أضف مسار مكتبة من الإعدادات'}
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Series;


