import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import MediaCard from '@/components/media/MediaCard';
import { Loader2, Search as SearchIcon, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const SearchResults = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const isAi = searchParams.get('ai') === 'true';

    const { data: searchResults, isLoading, refetch } = useQuery({
        queryKey: ['search-page', query, isAi],
        queryFn: () => isAi
            ? apiClient.aiSearchMedia(query)
            : apiClient.getAllMedia({ search: query, limit: 100 }),
        enabled: query.length > 0,
    });

    useEffect(() => {
        if (query) {
            refetch();
        }
    }, [query, refetch]);

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 pt-24 pb-12">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        {isAi ? <Sparkles className="w-8 h-8 text-purple-500 animate-pulse" /> : <SearchIcon className="w-8 h-8 text-primary" />}
                        {isAi ? 'بحث بالذكاء الاصطناعي عن:' : 'نتائج البحث عن:'} <span className={isAi ? "text-purple-500" : "text-primary"}>"{query}"</span>
                    </h1>

                    {isAi && searchResults?.parsed_params && Object.keys(searchResults.parsed_params).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {Object.entries(searchResults.parsed_params).map(([key, value]) => (
                                <div key={key} className="bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full text-xs text-purple-400 flex items-center gap-2">
                                    <span className="opacity-60">{key}:</span>
                                    <span className="font-semibold">{String(value)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <p className="text-muted-foreground mt-4">
                        {isLoading
                            ? 'جاري البحث...'
                            : `تم العثور على ${searchResults?.data?.length || 0} نتيجة`}
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                        <p className="text-xl text-muted-foreground">جاري البحث في المكتبة...</p>
                    </div>
                ) : searchResults?.data && searchResults.data.length > 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 md:gap-6"
                    >
                        {searchResults.data.map((media) => (
                            <MediaCard key={media.id} media={media} />
                        ))}
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-lg border border-border">
                        <SearchIcon className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                        <h2 className="text-2xl font-semibold mb-2">لم يتم العثور على نتائج</h2>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            عذراً، لم نتمكن من العثور على أي أفلام أو مسلسلات تطابق "{query}".
                            جرب استخدام كلمات مفتاحية مختلفة أو تأكد من صحة الإملاء.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default SearchResults;
