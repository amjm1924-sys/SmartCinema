import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, Search, Film, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api';
import Header from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const ActorsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const search = searchParams.get('search') || '';
    const [searchInput, setSearchInput] = useState(search);

    // Fetch actors
    const { data, isLoading } = useQuery({
        queryKey: ['actors', page, search],
        queryFn: () => apiClient.getAllActors(page, 24, search || undefined),
    });

    const actors = data?.actors || [];
    const totalPages = data?.total_pages || 1;
    const total = data?.total || 0;

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchParams({ page: '1', search: searchInput });
    };

    const goToPage = (newPage: number) => {
        setSearchParams({ page: String(newPage), search });
    };

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 pt-24 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Users className="w-8 h-8 text-primary" />
                            الممثلين
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {total > 0 ? `${total} ممثل في مكتبتك` : 'لا يوجد ممثلين بعد'}
                        </p>
                    </div>

                    {/* Search */}
                    <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="ابحث عن ممثل..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10 bg-white/5 border-white/10"
                            />
                        </div>
                        <Button type="submit" variant="secondary">بحث</Button>
                    </form>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
                    </div>
                )}

                {/* Actors Grid */}
                {!isLoading && actors.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-4"
                    >
                        {actors.map((actor, index) => (
                            <motion.div
                                key={actor.id}
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: "50px" }}
                                transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 8), 4) * 0.15 + (index % 8) * 0.06, ease: "easeOut" }}
                            >
                                <Link
                                    to={`/cast/${actor.id}`}
                                    className="group block bg-card rounded-xl overflow-hidden hover:scale-105 transition-transform duration-300"
                                >
                                    {/* Actor Photo */}
                                    <div className="aspect-[2/3] relative overflow-hidden bg-muted">
                                        {actor.profile_url ? (
                                            <img
                                                src={actor.profile_url}
                                                alt={actor.name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                                                <span className="text-6xl opacity-50">👤</span>
                                            </div>
                                        )}

                                        {/* Overlay gradient */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                        {/* Media count badge */}
                                        <div className="absolute top-2 right-2 bg-primary/90 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                            <Film className="w-3 h-3" />
                                            {actor.media_count}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="p-3 text-center">
                                        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                                            {actor.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {actor.media_count} {actor.media_count === 1 ? 'عمل' : 'أعمال'}
                                        </p>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </motion.div>
                )}

                {/* Empty State */}
                {!isLoading && actors.length === 0 && (
                    <div className="text-center py-20 bg-card/50 rounded-2xl">
                        <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-xl font-medium mb-2">لا يوجد ممثلين</h3>
                        <p className="text-muted-foreground">
                            {search ? 'لم يتم العثور على ممثلين بهذا الاسم' : 'قم بمسح المكتبة لإضافة الممثلين'}
                        </p>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-4 mt-8">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                        >
                            <ChevronRight className="w-4 h-4" />
                            السابق
                        </Button>

                        <div className="flex items-center gap-2">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (page <= 3) {
                                    pageNum = i + 1;
                                } else if (page >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = page - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={pageNum === page ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => goToPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                        >
                            التالي
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ActorsPage;
