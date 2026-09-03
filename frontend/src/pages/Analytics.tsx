import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, PieChart, Activity, Clock, HardDrive, Film, Calendar, Globe, Users, Disc } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitorPlay, Clapperboard, Quote } from 'lucide-react';


const Analytics = () => {
    const [days, setDays] = useState(30);
    const [groupBy, setGroupBy] = useState('day');

    // Fetch analytics data
    const { data: overview } = useQuery({
        queryKey: ['analytics-overview'],
        queryFn: () => apiClient.getAnalyticsOverview(),
    });

    const { data: genreData } = useQuery({
        queryKey: ['analytics-genres', days],
        queryFn: () => apiClient.getGenreStats(days),
    });

    const { data: watchTimeData } = useQuery({
        queryKey: ['analytics-watchtime', days, groupBy],
        queryFn: () => apiClient.getWatchTimeStats(days, groupBy),
    });

    const { data: bandwidthData } = useQuery({
        queryKey: ['analytics-bandwidth', days],
        queryFn: () => apiClient.getBandwidthStats(days),
    });

    // New analytics data
    const { data: decadesData } = useQuery({
        queryKey: ['analytics-decades'],
        queryFn: () => apiClient.getDecadesStats(),
    });

    const { data: qualityData } = useQuery({
        queryKey: ['analytics-quality'],
        queryFn: () => apiClient.getQualityStats(),
    });

    const { data: countriesData } = useQuery({
        queryKey: ['analytics-countries'],
        queryFn: () => apiClient.getCountryStats(),
    });

    const { data: topActors } = useQuery({
        queryKey: ['analytics-actors'],
        queryFn: () => apiClient.getTopActors(10),
    });

    const { data: personalStats } = useQuery({
        queryKey: ['analytics-personal'],
        queryFn: () => apiClient.getPersonalStats(),
    });


    const genres = genreData?.genres || [];
    const watchtime = watchTimeData?.watchtime || [];
    const bandwidth = bandwidthData?.bandwidth || [];
    const topMedia = overview?.top_media || [];
    const decades = decadesData || [];
    const qualities = qualityData || [];
    const countries = countriesData || [];
    const actors = topActors || [];

    // Calculate max values for chart scaling
     
    const maxGenreCount = Math.max(...genres.map((g: any) => g.watch_count), 1);
     
    const maxWatchHours = Math.max(...watchtime.map((w: any) => w.total_hours), 1);
     
    const maxDecadeCount = Math.max(...decades.map((d: any) => d.total), 1);

    // Quality colors
    const qualityColors: Record<string, string> = {
        '4K': 'from-purple-500 to-purple-400',
        '1080p': 'from-blue-500 to-blue-400',
        '720p': 'from-green-500 to-green-400',
        '480p': 'from-yellow-500 to-yellow-400',
        'SD': 'from-orange-500 to-orange-400',
        'Unknown': 'from-gray-500 to-gray-400',
    };

    return (
        <div className="min-h-screen bg-background text-white p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-primary" />
                        لوحة التحليلات
                    </h1>
                    <p className="text-white/60 mt-1">إحصائيات المشاهدة والمكتبة</p>
                </div>

                {/* Time Range Selector */}
                <div className="flex gap-3">
                    <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                        <SelectTrigger className="w-32 bg-white/10 border-white/20">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">7 أيام</SelectItem>
                            <SelectItem value="30">30 يوم</SelectItem>
                            <SelectItem value="90">90 يوم</SelectItem>
                            <SelectItem value="365">سنة</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="mb-8 bg-white/5 border border-white/10">
                    <TabsTrigger value="general">إحصائيات عامة</TabsTrigger>
                    <TabsTrigger value="personal">إحصائياتي الشخصية</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-8">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl p-6 border border-blue-500/20">
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="w-5 h-5 text-blue-400" />
                        <span className="text-white/70">إجمالي المشاهدات</span>
                    </div>
                    <div className="text-3xl font-bold">{overview?.total_events || 0}</div>
                </div>

                <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-6 border border-green-500/20">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="w-5 h-5 text-green-400" />
                        <span className="text-white/70">إجمالي وقت المشاهدة</span>
                    </div>
                    <div className="text-3xl font-bold">{overview?.total_watch_hours || 0} <span className="text-lg">ساعة</span></div>
                </div>

                <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl p-6 border border-purple-500/20">
                    <div className="flex items-center gap-3 mb-2">
                        <HardDrive className="w-5 h-5 text-purple-400" />
                        <span className="text-white/70">استهلاك البيانات</span>
                    </div>
                    <div className="text-3xl font-bold">{overview?.total_bandwidth_gb || 0} <span className="text-lg">GB</span></div>
                </div>

                <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-xl p-6 border border-orange-500/20">
                    <div className="flex items-center gap-3 mb-2">
                        <Film className="w-5 h-5 text-orange-400" />
                        <span className="text-white/70">هذا الأسبوع</span>
                    </div>
                    <div className="text-3xl font-bold">{overview?.this_week?.hours || 0} <span className="text-lg">ساعة</span></div>
                </div>
            </div>

            {/* Charts Row 1: Genres & Watch Time */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Genre Stats Chart */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-primary" />
                        الأنواع الأكثر مشاهدة
                    </h3>

                    <div className="space-y-3">
                        {genres.slice(0, 8).map((genre: any, index: number) => (
                            <div key={genre.genre} className="flex items-center gap-3">
                                <div className="w-20 text-sm text-white/70 truncate">{genre.genre}</div>
                                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary to-primary/50 rounded-full transition-all"
                                        style={{ width: `${(genre.watch_count / maxGenreCount) * 100}%` }}
                                    />
                                </div>
                                <div className="w-12 text-sm text-right">{genre.watch_count}</div>
                            </div>
                        ))}
                    </div>

                    {genres.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد بيانات</div>
                    )}
                </div>

                {/* Watch Time Chart */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            وقت المشاهدة
                        </h3>
                        <Select value={groupBy} onValueChange={setGroupBy}>
                            <SelectTrigger className="w-24 bg-white/10 border-white/20 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day">يومي</SelectItem>
                                <SelectItem value="week">أسبوعي</SelectItem>
                                <SelectItem value="month">شهري</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-end gap-1 h-40">
                        {watchtime.slice(-14).map((item: any, index: number) => (
                            <div
                                key={item.period}
                                className="flex-1 bg-gradient-to-t from-green-500 to-green-400 rounded-t hover:opacity-80 transition-all cursor-pointer group relative"
                                style={{ height: `${Math.max((item.total_hours / maxWatchHours) * 100, 5)}%` }}
                                title={`${item.period}: ${item.total_hours} ساعة`}
                            >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap">
                                    {item.total_hours}h
                                </div>
                            </div>
                        ))}
                    </div>

                    {watchtime.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد بيانات</div>
                    )}
                </div>
            </div>

            {/* Charts Row 2: Decades & Quality */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Decades Distribution */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        توزيع العقود
                    </h3>

                    <div className="space-y-3">
                        {decades.slice(0, 8).map((decade: any) => (
                            <div key={decade.decade} className="flex items-center gap-3">
                                <div className="w-16 text-sm text-white/70 font-mono">{decade.decade}</div>
                                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden flex">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                                        style={{ width: `${(decade.movies / maxDecadeCount) * 100}%` }}
                                        title={`${decade.movies} أفلام`}
                                    />
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all"
                                        style={{ width: `${(decade.series / maxDecadeCount) * 100}%` }}
                                        title={`${decade.series} مسلسلات`}
                                    />
                                </div>
                                <div className="w-12 text-sm text-right">{decade.total}</div>
                            </div>
                        ))}
                    </div>

                    {decades.length > 0 && (
                        <div className="flex gap-4 mt-4 text-xs text-white/60">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-blue-500" />
                                <span>أفلام</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded bg-purple-500" />
                                <span>مسلسلات</span>
                            </div>
                        </div>
                    )}

                    {decades.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد بيانات</div>
                    )}
                </div>

                {/* Quality Distribution */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Disc className="w-5 h-5 text-primary" />
                        جودة المكتبة
                    </h3>

                    <div className="space-y-3">
                        {qualities.map((q: any) => (
                            <div key={q.quality} className="flex items-center gap-3">
                                <div className="w-20 text-sm text-white/70 font-mono">{q.quality}</div>
                                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${qualityColors[q.quality] || 'from-gray-500 to-gray-400'} rounded-full transition-all`}
                                        style={{ width: `${q.percentage}%` }}
                                    />
                                </div>
                                <div className="w-20 text-sm text-right text-white/70">{q.count} ({q.percentage}%)</div>
                            </div>
                        ))}
                    </div>

                    {qualities.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد بيانات</div>
                    )}
                </div>
            </div>

            {/* Charts Row 3: Countries & Top Actors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Countries */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-primary" />
                        بلدان الإنتاج
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                        {countries.slice(0, 10).map((c: any, index: number) => (
                            <div key={c.country} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                                <span className="text-lg">{index < 3 ? ['🥇', '🥈', '🥉'][index] : '🎬'}</span>
                                <span className="flex-1 text-sm truncate">{c.country}</span>
                                <span className="text-sm text-white/60">{c.count}</span>
                            </div>
                        ))}
                    </div>

                    {countries.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد بيانات</div>
                    )}
                </div>

                {/* Top Actors */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        أكثر الممثلين في مكتبتك
                    </h3>

                    <div className="grid grid-cols-5 gap-3">
                        {actors.slice(0, 10).map((actor: any, index: number) => (
                            <Link
                                key={actor.id}
                                to={`/cast/${actor.id}`}
                                className="group text-center"
                            >
                                <div className="relative aspect-square rounded-full overflow-hidden bg-white/10 mb-2">
                                    {actor.profile_url ? (
                                        <img
                                            src={actor.profile_url}
                                            alt={actor.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/30">
                                            👤
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                                </div>
                                <div className="text-xs truncate font-medium">{actor.name}</div>
                                <div className="text-[10px] text-white/60">{actor.watched_media_count} عمل مشاهَد</div>
                                <div className="text-[10px] text-primary">{Math.round((actor.total_watch_time || 0) / 3600 * 10) / 10} ساعة</div>
                            </Link>
                        ))}
                    </div>

                    {actors.length === 0 && (
                        <div className="text-center text-white/40 py-8">لا توجد سجلات مشاهدة بعد</div>
                    )}
                </div>
            </div>

            {/* Top Media */}
            {topMedia.length > 0 && (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-4">الأكثر مشاهدة</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {topMedia.map((media: any, index: number) => (
                            <div key={media.id} className="relative group">
                                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/10">
                                    {media.poster_url ? (
                                        <img
                                            src={media.poster_url}
                                            alt={media.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/30">
                                            <Film className="w-12 h-12" />
                                        </div>
                                    )}
                                </div>
                                <div className="absolute top-2 left-2 bg-primary text-white text-xs px-2 py-1 rounded">
                                    #{index + 1}
                                </div>
                                <div className="mt-2 text-sm truncate">{media.title}</div>
                                <div className="text-xs text-white/50">{media.watch_count} مشاهدات</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </TabsContent>
            
            <TabsContent value="personal" className="space-y-8">
                {/* Fun Quote Banner */}
                {personalStats && (
                    <div className="bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 rounded-xl p-8 border border-white/10 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Quote className="w-24 h-24" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2 relative z-10">
                            شاهدت {personalStats.total_hours} ساعة هذا الشهر!
                        </h2>
                        <p className="text-white/70 text-lg relative z-10">
                            أكثر صنف شاهدته: {personalStats.top_genres?.[0]?.genre || 'لم تحدد بعد'}
                        </p>
                    </div>
                )}

                {/* Personal Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                            <Clock className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="text-3xl font-bold mb-1">{personalStats?.total_hours || 0}</div>
                        <div className="text-white/60 text-sm">ساعات المشاهدة الصافية</div>
                        <div className="text-xs text-blue-400 mt-2">هذا الشهر</div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                            <Clapperboard className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="text-3xl font-bold mb-1">{personalStats?.movies_watched || 0}</div>
                        <div className="text-white/60 text-sm">أفلام مكتملة</div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                            <MonitorPlay className="w-6 h-6 text-purple-400" />
                        </div>
                        <div className="text-3xl font-bold mb-1">{personalStats?.episodes_watched || 0}</div>
                        <div className="text-white/60 text-sm">حلقات مضافة</div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-6 border border-white/10 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center mb-4">
                            <Calendar className="w-6 h-6 text-orange-400" />
                        </div>
                        <div className="text-xl font-bold mb-1">{personalStats?.favorite_day || 'غير محدد'}</div>
                        <div className="text-white/60 text-sm">يومك المفضل للمشاهدة</div>
                    </div>
                </div>

                {/* Top Genres Badges */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-primary" />
                        أصنافك المفضلة
                    </h3>
                    
                    <div className="flex flex-wrap gap-4">
                        {personalStats?.top_genres?.map((g: any, i: number) => (
                            <div key={i} className="bg-white/10 border border-white/20 rounded-full px-6 py-3 flex items-center gap-3">
                                <span className="text-lg">{['🥇', '🥈', '🥉'][i] || '🎖️'}</span>
                                <span className="font-medium">{g.genre}</span>
                                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs">
                                    {g.count} مشاهدات
                                </span>
                            </div>
                        ))}
                        {(!personalStats?.top_genres || personalStats.top_genres.length === 0) && (
                            <div className="text-white/40">لا توجد بيانات كافية</div>
                        )}
                    </div>
                </div>
            </TabsContent>
            </Tabs>
        </div>
    );
};

export default Analytics;



