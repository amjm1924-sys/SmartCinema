import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Calendar, Film, Tv, Check, ExternalLink, Search, ArrowUpDown, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CastMember {
    id: number;
    tmdb_person_id: number;
    name: string;
    profile_url?: string;
    biography?: string;
    birthday?: string;
    deathday?: string;

    filmography: any[];
    filmography_count: number;
}

interface FilmographyItem {
    tmdb_id: number;
    title: string;
    original_title?: string;
    media_type: 'movie' | 'tv';
    character?: string;
    poster_url?: string;
    year?: string;
    vote_average?: number;
    in_library: boolean;
    library_id?: number;
    genre_ids?: number[];
}

const GENRES: Record<number, string> = {
    28: "أكشن",
    12: "مغامرة",
    16: "رسوم متحركة",
    35: "كوميديا",
    80: "جريمة",
    99: "وثائقي",
    18: "دراما",
    10751: "عائلي",
    14: "فانتازيا",
    36: "تاريخ",
    27: "رعب",
    10402: "موسيقى",
    9648: "غموض",
    10749: "رومانسية",
    878: "خيال علمي",
    10770: "فيلم تلفزيوني",
    53: "إثارة",
    10752: "حرب",
    37: "ويسترن",
    10759: "أكشن ومغامرة",
    10762: "أطفال",
    10763: "أخبار",
    10764: "واقع",
    10765: "خيال علمي وفانتازيا",
    10766: "مسلسلات طويلة",
    10767: "برامج حوارية",
    10768: "حرب وسياسة"
};

const CastPage = () => {
    const { personId } = useParams<{ personId: string }>();
    const navigate = useNavigate();
    const id = parseInt(personId || '0', 10);
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('year-desc');
    const [selectedGenre, setSelectedGenre] = useState('all');

    // Fetch cast details
    const { data: person, isLoading, error } = useQuery<CastMember>({
        queryKey: ['cast', id],
        queryFn: () => apiClient.getCastDetails(id),
        enabled: !!id,
    });

    // Fetch full filmography from TMDb
    const { data: fullFilmography, isLoading: loadingFilmography } = useQuery({
        queryKey: ['full-filmography', id],
        queryFn: () => apiClient.getFullFilmography(id),
        enabled: !!id && !!person?.tmdb_person_id,
    });

    // Calculate age
    const calculateAge = (birthday: string, deathday?: string) => {
        const birth = new Date(birthday);
        const end = deathday ? new Date(deathday) : new Date();
        let age = end.getFullYear() - birth.getFullYear();
        const monthDiff = end.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
            </div>
        );
    }

    if (error || !person) {
        return (
            <div className="min-h-screen bg-background">
                <Header />
                <div className="flex flex-col items-center justify-center mt-20 py-20">
                    <h2 className="text-2xl font-bold mb-4">الممثل غير موجود</h2>
                    <Button onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 ml-2" />
                        العودة
                    </Button>
                </div>
            </div>
        );
    }

    const filmography = fullFilmography?.filmography || [];
    const libraryItems = filmography.filter((f: FilmographyItem) => f.in_library);
    const libraryCount = fullFilmography?.library_count || person.filmography_count;
    const totalCount = fullFilmography?.total_count || 0;

    // Filter by tab
    // Filter and Sort Logic
    const getFilteredFilmography = () => {
        let result = filmography;

        // 1. Filter by Tab
        if (activeTab === 'library') {
            result = result.filter((f: FilmographyItem) => f.in_library);
        } else if (activeTab === 'movies') {
            result = result.filter((f: FilmographyItem) => f.media_type === 'movie');
        } else if (activeTab === 'series') {
            result = result.filter((f: FilmographyItem) => f.media_type === 'tv');
        }

        // 2. Filter by Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((f: FilmographyItem) =>
                f.title.toLowerCase().includes(query) ||
                (f.original_title && f.original_title.toLowerCase().includes(query)) ||
                (f.character && f.character.toLowerCase().includes(query))
            );
        }

        // 3. Filter by Genre
        if (selectedGenre !== 'all') {
            const genreId = parseInt(selectedGenre);
            result = result.filter((f: FilmographyItem) =>
                f.genre_ids && f.genre_ids.includes(genreId)
            );
        }

        // 4. Sort
        return result.sort((a: FilmographyItem, b: FilmographyItem) => {
            switch (sortBy) {
                case 'year-desc':
                    return (b.year || '0').localeCompare(a.year || '0');
                case 'year-asc':
                    return (a.year || '0').localeCompare(b.year || '0');
                case 'rating-desc':
                    return (b.vote_average || 0) - (a.vote_average || 0);
                case 'rating-asc':
                    return (a.vote_average || 0) - (b.vote_average || 0);
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                default:
                    return 0;
            }
        });
    };

    const filteredFilmography = getFilteredFilmography();

    return (
        <div className="min-h-screen bg-background">
            <Header />

            {/* Cinematic Hero Section */}
            <div className="relative overflow-hidden">
                {/* Blurred Backdrop from Actor Photo */}
                {person.profile_url && (
                    <div className="absolute inset-0 z-0">
                        <img
                            src={person.profile_url}
                            alt=""
                            className="w-full h-full object-cover object-top scale-110"
                            style={{ filter: 'blur(60px)', opacity: 0.3 }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-background/80 to-background" />
                    </div>
                )}

                <div className="relative z-10 pt-28 pb-12">
                    <div className="container mx-auto px-4">
                        {/* Back Button */}
                        <button
                            onClick={() => navigate(-1)}
                            className="absolute top-8 left-6 p-3 rounded-full bg-background/50 hover:bg-background/70 backdrop-blur-md transition-all z-10"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col md:flex-row gap-8 items-start"
                        >
                            {/* Profile Photo — Premium Framed Style */}
                            <div className="flex-shrink-0 relative">
                                {person.profile_url ? (
                                    <div className="relative">
                                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-600/30 blur-xl scale-105" />
                                        <img
                                            src={person.profile_url}
                                            alt={person.name}
                                            className="relative w-48 h-72 rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-48 h-72 rounded-2xl bg-muted flex items-center justify-center">
                                        <span className="text-6xl text-muted-foreground">👤</span>
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1">
                                <h1 className="text-4xl font-bold mb-4 drop-shadow-md">{person.name}</h1>

                                {/* Stats */}
                                <div className="flex flex-wrap gap-4 mb-6">
                                    {person.birthday && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Calendar className="w-4 h-4" />
                                            <span>
                                                {new Date(person.birthday).toLocaleDateString('ar-EG')}
                                                {' '}
                                                ({calculateAge(person.birthday, person.deathday)} سنة)
                                            </span>
                                        </div>
                                    )}
                                    {person.deathday && (
                                        <div className="text-sm text-red-500">
                                            توفي: {new Date(person.deathday).toLocaleDateString('ar-EG')}
                                        </div>
                                    )}
                                </div>

                                {/* Library Stats */}
                                <div className="flex gap-6 mb-6">
                                    <div className="flex items-center gap-2 bg-green-500/10 px-4 py-2 rounded-lg border border-green-500/30">
                                        <Check className="w-5 h-5 text-green-500" />
                                        <span className="font-bold text-green-500">{libraryCount}</span>
                                        <span className="text-muted-foreground">في مكتبتك</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-lg">
                                        <Film className="w-5 h-5 text-primary" />
                                        <span className="font-bold">{totalCount}</span>
                                        <span className="text-muted-foreground">عمل إجمالي</span>
                                    </div>
                                </div>

                                {/* Biography */}
                                {person.biography && (
                                    <p className="text-muted-foreground leading-relaxed max-w-3xl line-clamp-5">
                                        {person.biography}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Filmography Section */}
            <div className="container mx-auto px-4 pb-20">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">
                        جميع أعمال {person.name}
                    </h2>
                </div>

                {/* Filters and Controls */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
                    {/* Tabs */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
                        <TabsList className="bg-card w-full md:w-auto justify-start overflow-x-auto">
                            <TabsTrigger value="all">الكل ({totalCount})</TabsTrigger>
                            <TabsTrigger value="library" className="gap-1">
                                <Check className="w-4 h-4" />
                                في مكتبتك ({libraryCount})
                            </TabsTrigger>
                            <TabsTrigger value="movies">أفلام</TabsTrigger>
                            <TabsTrigger value="series">مسلسلات</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* Search and Sort */}
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث في الأعمال..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-9"
                            />
                        </div>

                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[160px]">
                                <ArrowUpDown className="w-4 h-4 ml-2" />
                                <SelectValue placeholder="ترتيب حسب" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="year-desc">الأحدث إنتاجاً</SelectItem>
                                <SelectItem value="year-asc">الأقدم إنتاجاً</SelectItem>
                                <SelectItem value="rating-desc">الأعلى تقييماً</SelectItem>
                                <SelectItem value="rating-asc">الأقل تقييماً</SelectItem>
                                <SelectItem value="title-asc">الأبجدي (A-Z)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                            <SelectTrigger className="w-[160px]">
                                <Filter className="w-4 h-4 ml-2" />
                                <SelectValue placeholder="التصنيف" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل التصنيفات</SelectItem>
                                {Object.entries(GENRES).map(([id, name]) => (
                                    <SelectItem key={id} value={id}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {loadingFilmography ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
                    </div>
                ) : filteredFilmography.length > 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4"
                    >
                        {filteredFilmography.map((media: FilmographyItem, index: number) => (
                            <motion.div
                                key={`${media.tmdb_id}-${media.media_type}-${index}`}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 8), 4) * 0.15 + (index % 8) * 0.06, ease: "easeOut" }}
                            >
                                {media.in_library && media.library_id ? (
                                    <Link to={`/details/${media.library_id}`}>
                                        <MediaCard media={media} inLibrary={true} />
                                    </Link>
                                ) : (
                                    <a href={`https://www.themoviedb.org/${media.media_type}/${media.tmdb_id}`} target="_blank" rel="noopener noreferrer">
                                        <div className="opacity-70 hover:opacity-100 transition-opacity">
                                            <MediaCard media={media} inLibrary={false} />
                                        </div>
                                    </a>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <div className="text-center py-20 bg-card/50 rounded-2xl">
                        <p className="text-muted-foreground text-lg">
                            لا توجد أعمال في هذه الفئة
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Separate component for media cards
const MediaCard = ({ media, inLibrary }: { media: FilmographyItem; inLibrary: boolean }) => (
    <div className={`group relative overflow-hidden rounded-xl bg-card hover:scale-105 transition-transform duration-300 ${!inLibrary ? 'grayscale-[30%]' : ''}`}>
        {media.poster_url ? (
            <img
                src={media.poster_url}
                alt={media.title}
                className="w-full aspect-[2/3] object-cover"
                loading="lazy"
                onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/no_poster.png';
                }}
            />
        ) : (
            <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                <Film className="w-12 h-12 text-muted-foreground" />
            </div>
        )}

        {/* In Library Badge */}
        {inLibrary && (
            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" />
                موجود
            </div>
        )}

        {/* Media Type Badge */}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {media.media_type === 'movie' ? 'فيلم' : 'مسلسل'}
        </div>

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="absolute bottom-0 left-0 right-0 p-3">
                <h3 className="text-white font-medium text-sm line-clamp-2">{media.title}</h3>
                {media.character && (
                    <p className="text-white/70 text-xs mt-1">كـ {media.character}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    {media.year && <span className="text-white/50 text-xs">{media.year}</span>}
                    {media.vote_average ? (
                        <span className="text-yellow-400 text-xs">⭐ {media.vote_average.toFixed(1)}</span>
                    ) : null}
                </div>
            </div>
        </div>
    </div>
);

export default CastPage;


