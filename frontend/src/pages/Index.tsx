import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState } from 'react';
import Header from '@/components/layout/Header';
import HeroSection from '@/components/media/HeroSection';
import MediaCarousel from '@/components/media/MediaCarousel';
import MediaCard from '@/components/media/MediaCard';
import CollectionCard from '@/components/media/CollectionCard';
import { apiClient } from '@/lib/api';
import { Media, Collection } from '@/types/media';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';


const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const searchQuery = urlSearch;

  // Fetch all media for hero section
  const { data: allMedia = [], isLoading: loadingAll } = useQuery({
    queryKey: ['media', 'all'],
    queryFn: () => apiClient.getAllMedia({ limit: 50 }),

    select: (data: any) => data.data || [],
    refetchInterval: 30000,
  });

  // Fetch Featured media (Daily)
  const { data: featuredItems = [] } = useQuery<Media[]>({
    queryKey: ['media', 'featured'],
    queryFn: () => apiClient.getFeatured(5),
    staleTime: 1000 * 60 * 60, // Data changes daily, cache for 1 hour instead of polling
  });

  // Fetch continue watching
  const { data: continueWatching = [] } = useQuery<Media[]>({
    queryKey: ['history', 'continue'],
    queryFn: () => apiClient.getContinueWatching(10),
    refetchInterval: 10000,
  });

  // Fetch recently added
  const { data: recentlyAdded = [] } = useQuery({
    queryKey: ['media', 'recent'],
    queryFn: () => apiClient.getAllMedia({ sort: 'added_at', limit: 10 }),

    select: (data: any) => data.data || [],
    refetchInterval: 30000,
  });

  // Fetch movies (Random)
  const { data: movies = [] } = useQuery({
    queryKey: ['media', 'movies', 'random'],
    queryFn: () => apiClient.getAllMedia({ type: 'movie', sort: 'random', limit: 20 }),

    select: (data: any) => data.data || [],
    refetchInterval: 0,
    staleTime: 0,
  });

  // Fetch series (Random)
  const { data: series = [] } = useQuery({
    queryKey: ['media', 'series', 'random'],
    queryFn: () => apiClient.getAllMedia({ type: 'series', sort: 'random', limit: 20 }),

    select: (data: any) => data.data || [],
    refetchInterval: 0,
    staleTime: 0,
  });

  // Fetch Sagas (Collections)
  const { data: sagas = [] } = useQuery<Collection[]>({
    queryKey: ['collections', 'home'],
    queryFn: () => apiClient.getCollections(),
    refetchInterval: 0,
  });

  // Fetch Smart Collections (AI)
  const { data: smartCollections = {} } = useQuery<Record<string, Media[]>>({
    queryKey: ['media', 'smart_collections'],
    queryFn: () => apiClient.getSmartCollections(),
    refetchInterval: 0,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  // Server-Side Hybrid Search
  const { data: searchResponse, isLoading: loadingSearch } = useQuery({
    queryKey: ['media', 'search', searchQuery],
    queryFn: () => apiClient.getAllMedia({ search: searchQuery }),
    enabled: !!searchQuery.trim(),
    keepPreviousData: true,
  });

  // Extract results
  const searchResults = searchResponse?.data || [];
  const relatedResults = searchResponse?.related || [];

  // Fallback if featured is empty
  const displayFeatured = featuredItems.length > 0 ? featuredItems : allMedia.slice(0, 5);

  if (loadingAll && !searchQuery) {
    return (
      <div className="min-h-screen bg-background pb-10">
        <Header />
        <div className="container mx-auto px-4 mt-24 space-y-10">
          {/* Hero Skeleton */}
          <div className="w-full aspect-[21/9] rounded-xl overflow-hidden relative">
            <Skeleton className="w-full h-full" />
            <div className="absolute bottom-10 left-10 space-y-4 w-1/3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <div className="flex gap-4">
                <Skeleton className="h-12 w-32 rounded-lg" />
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
            </div>
          </div>

          {/* Carousel Skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-4">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="aspect-[2/3] rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="w-full">
        {/* Show search results if searching */}
        {searchQuery.trim() ? (
          <div className="container mx-auto px-4 py-8 mt-20">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">نتائج البحث</h1>
                <p className="text-muted-foreground">
                  {loadingSearch ? "جاري البحث..." : `النتائج لـ "${searchQuery}"`}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setSearchParams({})}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                مسح البحث
              </Button>
            </div>

            {loadingSearch ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {/* 1. Exact/Keyword Matches */}
                {searchResults.length > 0 && (
                  <div className="mb-10">
                    <h2 className="text-xl font-semibold mb-4 text-primary">تطابق مباشر</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-6">
                      {searchResults.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: 30 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, margin: "50px" }}
                          transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 7), 5) * 0.15 + (index % 7) * 0.06, ease: "easeOut" }}
                        >
                          <MediaCard media={item} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Related/Semantic Matches */}
                {relatedResults.length > 0 && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 text-secondary flex items-center gap-2">
                      ✨ نتائج مقترحة (ذكاء اصطناعي)
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-6">
                      {relatedResults.map((item, index) => (
                        <motion.div
                          key={item.id}
                          className="relative group"
                          initial={{ opacity: 0, x: 30 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, margin: "50px" }}
                          transition={{ duration: 0.4, delay: Math.min(Math.floor(index / 7), 5) * 0.15 + (index % 7) * 0.06, ease: "easeOut" }}
                        >
                          <MediaCard media={item} />
                          {item.relevance_score && (
                            <div className="absolute -top-2 -right-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg z-20 border border-white/20">
                              %{(item.relevance_score * 100).toFixed(0)} تطابق
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {searchResults.length === 0 && relatedResults.length === 0 && (
                  <div className="text-center py-20">
                    <h3 className="text-2xl font-bold mb-2">لا توجد نتائج</h3>
                    <p className="text-muted-foreground">لم نعثر على أي تطابق مباشر أو مقترح.</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Hero Section */}
            <div className="snap-start min-h-[85vh] md:min-h-screen w-full relative">
              {displayFeatured.length > 0 && <HeroSection items={displayFeatured} />}
            </div>

            {/* Content Sections */}
            <div className="container mx-auto pb-20">
              {/* Continue Watching */}
              {continueWatching.length > 0 && (
                <MediaCarousel
                  title="متابعة المشاهدة"
                  items={continueWatching}
                  showProgress
                />
              )}

              {/* Recently Added */}
              {recentlyAdded.length > 0 && (
                <MediaCarousel title="أُضيف حديثاً" items={recentlyAdded} />
              )}

              {/* Smart Collections (AI) */}
              {Object.entries(smartCollections).map(([name, items]) => (
                items.length > 0 && (
                  <MediaCarousel key={name} title={name} items={items} />
                )
              ))}

              {/* Movie Sagas Row (Collections) */}
              {sagas.length > 0 && (
                <MediaCarousel
                  title="سلاسل الأفلام (Sagas)"
                  items={sagas}
                  renderItem={(item) => (
                    <CollectionCard
                      collection={item}
                      onClick={() => navigate('/collections')}
                    />
                  )}
                />
              )}

              {/* Movies Section */}
              {movies.length > 0 && (
                <MediaCarousel title="الأفلام" items={movies} />
              )}

              {/* Series Section */}
              {series.length > 0 && (
                <MediaCarousel title="المسلسلات" items={series} />
              )}

              {/* Empty State */}
              {allMedia.length === 0 && (
                <div className="text-center py-20">
                  <h3 className="text-2xl font-bold mb-2">لا توجد محتويات</h3>
                  <p className="text-muted-foreground">أضف مسار مكتبة من الإعدادات لبدء المسح</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;


