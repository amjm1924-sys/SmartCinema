import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Calendar, Clock, Film } from 'lucide-react';

const getCountdownBadge = (airDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const air = new Date(airDate);
    air.setHours(0, 0, 0, 0);
    
    const diffTime = air.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: "اليوم", color: "bg-green-500/20 text-green-400 border-green-500/30" };
    if (diffDays === 1) return { text: "غداً", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
    if (diffDays < 0) return { text: "صدر مؤخراً", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
    if (diffDays <= 7) return { text: `ينزل بعد ${diffDays} أيام`, color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    
    return { text: `بعد ${diffDays} يوم`, color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
};

const ReleaseCalendar = () => {
    const { data: episodes, isLoading } = useQuery({
        queryKey: ['upcoming-calendar'],
        queryFn: () => apiClient.getUpcomingCalendar(),
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!episodes || episodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-white/50">
                <Calendar className="w-16 h-16 mb-4 opacity-50" />
                <h2 className="text-xl font-semibold">لا توجد إصدارات قادمة</h2>
                <p className="mt-2">لم يتم العثور على أي حلقات قادمة للمسلسلات في مكتبتك.</p>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-8">
                <Calendar className="w-8 h-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold">تقويم الإصدارات</h1>
                    <p className="text-white/60 mt-1">تابع مواعيد نزول الحلقات الجديدة لمسلسلاتك المفضلة</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {episodes.map((ep: any, index: number) => {
                    const badge = getCountdownBadge(ep.air_date);
                    return (
                        <div key={index} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-primary/50 transition-colors group">
                            <div className="relative aspect-video bg-black/50">
                                {ep.poster_url ? (
                                    <img 
                                        src={ep.poster_url.startsWith('http') ? ep.poster_url : `https://image.tmdb.org/t/p/w500${ep.poster_url}`}
                                        alt={ep.series_title}
                                        className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20">
                                        <Film className="w-12 h-12" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                
                                <div className="absolute top-3 right-3">
                                    <span className={`px-3 py-1 rounded-full text-xs border ${badge.color} font-medium backdrop-blur-md`}>
                                        {badge.text}
                                    </span>
                                </div>
                                
                                <div className="absolute bottom-3 left-3 right-3">
                                    <h3 className="font-bold text-lg leading-tight truncate">{ep.series_title}</h3>
                                    <div className="text-sm text-primary font-medium mt-1">
                                        الموسم {ep.season_number} • الحلقة {ep.episode_number}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-4">
                                <h4 className="font-medium text-white/90 truncate mb-3" title={ep.episode_name}>
                                    {ep.episode_name || 'بدون عنوان'}
                                </h4>
                                
                                <div className="flex items-center text-sm text-white/50">
                                    <Clock className="w-4 h-4 ml-2" />
                                    <span dir="ltr">{new Date(ep.air_date).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ReleaseCalendar;
