import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowRight, Play, Pause, Volume2, VolumeX, Maximize, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Settings, X, Wand2, Languages, AudioLines, SkipForward, Merge, Download, Loader2, SlidersHorizontal, Trash2, Star } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import Hls from 'hls.js';

import { PlayerSettingsPanel, SubtitleSettings, defaultSubtitleSettings, videoFilterPresets, SettingsTab } from '@/components/player/PlayerSettingsPanel';

const Player = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    // Use location state for IPTV overrides
    const location = useLocation();
    const isIPTV = id?.startsWith('iptv-');
    const iptvState = location.state as { streamUrl?: string; title?: string } | null;

    const mediaId = isIPTV ? 0 : parseInt(id || '0', 10);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(100);
    const [showControls, setShowControls] = useState(true);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [selectedSubtitle, setSelectedSubtitle] = useState('');
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showVolumeOSD, setShowVolumeOSD] = useState(false);
    const volumeOSDTimer = useRef<NodeJS.Timeout | null>(null);
    const durationRef = useRef<number>(0);
    // Guard: prevent position restoration from re-running on media refetches
    const positionRestoredForMediaRef = useRef<number>(0);
    // Guard: prevent duplicate thumbnail generation
    const thumbGenTriggeredRef = useRef<number>(0);

    // Sync duration state to ref for use in closures (like event listeners)
    useEffect(() => {
        durationRef.current = duration;
    }, [duration]);

    // Active unified settings tab
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>(null);

    const [hideNextEpisode, setHideNextEpisode] = useState(false);

    // Seek Animation State (YouTube style)
    const [seekAnimation, setSeekAnimation] = useState<{ side: 'left' | 'right' | null; id: number }>({ side: null, id: 0 });
    const seekAnimationTimeout = useRef<NodeJS.Timeout | null>(null);
    // Advanced Player Features
    const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
    const [videoFilters, setVideoFilters] = useState(() => {
        try {
            const saved = localStorage.getItem(`videoFilters_${isIPTV ? 'iptv' : mediaId}`);
            return saved ? JSON.parse(saved) : { brightness: 100, contrast: 100, saturation: 100 };
        } catch {
            return { brightness: 100, contrast: 100, saturation: 100 };
        }
    });

    useEffect(() => {
        if (mediaId || isIPTV) {
            localStorage.setItem(`videoFilters_${isIPTV ? 'iptv' : mediaId}`, JSON.stringify(videoFilters));
        }
    }, [videoFilters, mediaId, isIPTV]);

    const [autoEnhance, setAutoEnhance] = useState(() => {
        const saved = localStorage.getItem(`autoEnhance_${isIPTV ? 'iptv' : mediaId}`);
        return saved ? saved === 'true' : false;
    });

    useEffect(() => {
        if (mediaId || isIPTV) {
            localStorage.setItem(`autoEnhance_${isIPTV ? 'iptv' : mediaId}`, String(autoEnhance));
        }
    }, [autoEnhance, mediaId, isIPTV]);



    // Custom Subtitle Profiles
    const [customSubtitleProfiles, setCustomSubtitleProfiles] = useState<{ name: string, settings: SubtitleSettings }[]>(() => {
        try {
            const saved = localStorage.getItem('customSubtitleProfiles');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [newProfileName, setNewProfileName] = useState('');
    const [isDeletingSubtitle, setIsDeletingSubtitle] = useState<string | null>(null);

    // Subtitle customization state
    const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() => {
        try {
            // Load from localStorage uniquely per video
            const saved = localStorage.getItem(`subtitleSettings_${isIPTV ? 'iptv' : mediaId}`);
            return saved ? { ...defaultSubtitleSettings, ...JSON.parse(saved) } : defaultSubtitleSettings;
        } catch {
            return defaultSubtitleSettings;
        }
    });

    // OpenSubtitles state

    const [openSubtitlesResults, setOpenSubtitlesResults] = useState<any[]>([]);
    const [isSearchingSubtitles, setIsSearchingSubtitles] = useState(false);
    const [downloadingSubId, setDownloadingSubId] = useState<number | null>(null);

    // Subtitle Merge state
    const [mergeJobId, setMergeJobId] = useState<string | null>(null);
    const [mergeStatus, setMergeStatus] = useState<string>('idle'); // idle | processing | completed | failed
    const [mergeProgress, setMergeProgress] = useState(0);
    const [mergeDownloadUrl, setMergeDownloadUrl] = useState<string | null>(null);
    const [mergeFileSize, setMergeFileSize] = useState<number>(0);
    const mergePollingRef = useRef<NodeJS.Timeout | null>(null);

    // Analytics watch tracking
    const watchStartTimeRef = useRef<number | null>(null);
    const watchEventIdRef = useRef<number | null>(null);
    const [watchEventId, setWatchEventId] = useState<number | null>(null);

    // Sync state to ref
    useEffect(() => {
        watchEventIdRef.current = watchEventId;
    }, [watchEventId]);

    // HLS Quality State
    const hlsRef = useRef<Hls | null>(null);

    const [hlsLevels, setHlsLevels] = useState<any[]>([]);
    const [currentQuality, setCurrentQuality] = useState(-1); // -1 = Auto

    // Audio Track & Embedded Subtitle State
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
    const [audioAutoSelected, setAudioAutoSelected] = useState<boolean>(false);
    const [selectedEmbeddedSub, setSelectedEmbeddedSub] = useState<string>('off');

    // AI Recommendations
    const [showRecommendations, setShowRecommendations] = useState(false);

    const { data = [] } = useQuery({
        queryKey: ['recommendations', mediaId, 'mixed'],

        queryFn: () => apiClient.getRecommendations(mediaId, 20, false) as Promise<any[]>,
        enabled: !!mediaId,
        staleTime: 1000 * 60 * 5, // 5 minutes cache
        refetchOnWindowFocus: false,
    });

    const recommendations = data as any[];

    // X-Ray Data
    const [showXRay, setShowXRay] = useState(true);
    const { data: xrayData } = useQuery({
        queryKey: ['xray', mediaId],
        queryFn: () => apiClient.getMediaXRay(mediaId),
        enabled: !!mediaId && !isIPTV,
        refetchOnWindowFocus: false,
    });

    // Profile Data (for default languages)
    const { data: currentProfile } = useQuery({
        queryKey: ['currentProfile'],
        queryFn: () => apiClient.getCurrentProfile(),
        refetchOnWindowFocus: false,
    });

    // Save subtitle settings to localStorage tied uniquely to each video
    useEffect(() => {
        if (mediaId || isIPTV) {
            localStorage.setItem(`subtitleSettings_${isIPTV ? 'iptv' : mediaId}`, JSON.stringify(subtitleSettings));
        }
    }, [subtitleSettings, mediaId, isIPTV]);

    // Record watch start when playback begins
    useEffect(() => {
        if (isPlaying && mediaId && !watchEventId) {
            watchStartTimeRef.current = Date.now();

            apiClient.recordWatchStart(mediaId).then((result: any) => {
                if (result?.event_id) {
                    setWatchEventId(result.event_id);
                }
            }).catch(() => { });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, mediaId]);

    // Record watch end when leaving or pausing
    useEffect(() => {
        return () => {
            if (watchEventIdRef.current && watchStartTimeRef.current) {
                const durationWatched = Math.floor((Date.now() - watchStartTimeRef.current) / 1000);
                apiClient.recordWatchEnd(watchEventIdRef.current, durationWatched).catch(() => { });
                watchEventIdRef.current = null;
            }
        };
    }, []);

    // Search for subtitles on OpenSubtitles
    const handleSearchSubtitles = async () => {
        if (!mediaId) return;
        setIsSearchingSubtitles(true);
        try {
            const result = await apiClient.searchOpenSubtitles(mediaId);
            setOpenSubtitlesResults(result.subtitles || []);
        } catch (err) {
            console.error('Subtitle search error:', err);
            setOpenSubtitlesResults([]);
        } finally {
            setIsSearchingSubtitles(false);
        }
    };

    // Download a subtitle from OpenSubtitles
    const handleDownloadSubtitle = async (fileId: number, language: string) => {
        if (!mediaId) return;
        setDownloadingSubId(fileId);
        try {
            const result = await apiClient.downloadOpenSubtitle(fileId, mediaId, language) as { success: boolean };
            if (result.success) {
                // Refresh subtitles list
                refetchSubtitles();
            }
        } catch (err) {
            console.error('Subtitle download error:', err);
        } finally {
            setDownloadingSubId(null);
        }
    };

    // Delete a subtitle file
    const handleDeleteSubtitle = async (url: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!mediaId || isIPTV) return;

        try {
            const isLocal = url.includes('path=');
            setIsDeletingSubtitle(url);

            const payload = isLocal
                ? { path: new URL(url, window.location.origin).searchParams.get('path') || '' }
                : { lang: url.split('/').pop() || '' };

            const res = await apiClient.deleteSubtitle(mediaId, payload) as { success?: boolean };

            if (res.success) {
                if (selectedSubtitle === url) setSelectedSubtitle('off');
                refetchSubtitles();
                toast.success('تم حذف الترجمة بنجاح');
            }
        } catch (error) {
            console.error('Error deleting subtitle:', error);
            toast.error('حدث خطأ أثناء حذف الترجمة');
        } finally {
            setIsDeletingSubtitle(null);
        }
    };

    // Merge subtitle into video file
    const handleMergeSubtitle = async (subtitlePath: string) => {
        if (!mediaId || mergeStatus === 'processing') return;

        try {
            setMergeStatus('processing');
            setMergeProgress(5);
            setMergeDownloadUrl(null);
            toast.info('⏳ جاري دمج الترجمة مع الفيديو...');

            // Detect language from subtitle path
            const pathLower = subtitlePath.toLowerCase();
            const lang = (pathLower.includes('arabic') || pathLower.includes('.ar.') || pathLower.includes('_ar'))
                ? 'ara' : 'eng';

            const result = await apiClient.mergeSubtitle(mediaId, subtitlePath, lang);

            if (result.job_id) {
                setMergeJobId(result.job_id);

                // Start polling for status
                const pollStatus = async () => {
                    try {
                        const status = await apiClient.getMergeStatus(result.job_id);
                        setMergeProgress(status.progress || 0);

                        if (status.status === 'completed' && status.download_url) {
                            setMergeStatus('completed');
                            setMergeDownloadUrl(apiClient.getMergeDownloadUrl(status.download_url));
                            setMergeFileSize(status.file_size || 0);
                            setMergeProgress(100);
                            toast.success('✅ تم دمج الترجمة بنجاح! اضغط للتحميل');
                            if (mergePollingRef.current) clearInterval(mergePollingRef.current);
                        } else if (status.status === 'failed') {
                            setMergeStatus('failed');
                            toast.error(`❌ فشل الدمج: ${status.error || 'خطأ غير معروف'}`);
                            if (mergePollingRef.current) clearInterval(mergePollingRef.current);
                        }
                    } catch {
                        // Keep polling
                    }
                };

                mergePollingRef.current = setInterval(pollStatus, 1500);
            }
        } catch (error: any) {
            setMergeStatus('failed');
            toast.error('❌ حدث خطأ أثناء بدء الدمج');
        }
    };

    // Cleanup merge polling on unmount
    useEffect(() => {
        return () => {
            if (mergePollingRef.current) clearInterval(mergePollingRef.current);
        };
    }, []);

    // Custom Profile Functions
    const saveCustomProfile = () => {
        if (!newProfileName.trim()) {
            toast.error('يرجى إدخال اسم للبروفايل');
            return;
        }

        const newProfiles = [...customSubtitleProfiles, { name: newProfileName, settings: { ...subtitleSettings } }];
        setCustomSubtitleProfiles(newProfiles);
        localStorage.setItem('customSubtitleProfiles', JSON.stringify(newProfiles));
        setNewProfileName('');
        toast.success(`تم حفظ البروفايل "${newProfileName}" بنجاح`);
    };

    const deleteCustomProfile = (index: number) => {
        const newProfiles = [...customSubtitleProfiles];
        const deleted = newProfiles.splice(index, 1)[0];
        setCustomSubtitleProfiles(newProfiles);
        localStorage.setItem('customSubtitleProfiles', JSON.stringify(newProfiles));
        toast.success(`تم حذف البروفايل "${deleted.name}"`);
    };

    // Apply subtitle styles to video text tracks
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Create or update style element for ::cue
        let styleEl = document.getElementById('subtitle-style') as HTMLStyleElement;
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'subtitle-style';
            document.head.appendChild(styleEl);
        }

        const bgOpacity = Math.round(subtitleSettings.backgroundOpacity * 2.55).toString(16).padStart(2, '0');
        const bgColor = subtitleSettings.backgroundColor + bgOpacity;

        // Convert text hex to rgba for opacity
        const hexToRgb = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `${r}, ${g}, ${b}`;
        };
        const textColor = `rgba(${hexToRgb(subtitleSettings.color)}, ${subtitleSettings.textOpacity / 100})`;

        // Convert percentage from bottom to percentage from top since VTTCue.line uses 0=top, 100=bottom
        const linePercent = 100 - Math.min(100, Math.max(0, subtitleSettings.positionY));

        styleEl.textContent = `
            video::cue {
                font-size: ${subtitleSettings.fontSize}px;
                color: ${textColor};
                background-color: ${bgColor};
                font-family: ${subtitleSettings.fontFamily}, sans-serif;
            }
        `;

        // Apply line position to all active text track cues securely without jumping
        const applyPosition = () => {
            const tracks = video.textTracks;
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                if (track.mode === 'showing' && track.cues) {
                    for (let j = 0; j < track.cues.length; j++) {
                        const cue = track.cues[j] as VTTCue;
                        // Only assign if modified, to prevent browser VTTCue layout thrashing/jumping

                        if ((cue as any)._customLine !== linePercent) {
                            cue.snapToLines = false;
                            cue.line = linePercent;

                            (cue as any)._customLine = linePercent;
                        }
                    }
                }
            }
        };

        // Apply immediately and on cue changes
        applyPosition();
        const interval = setInterval(applyPosition, 500);

        return () => {
            clearInterval(interval);
            // Cleanup on unmount
            if (styleEl && styleEl.parentNode) {
                styleEl.parentNode.removeChild(styleEl);
            }
        };
    }, [subtitleSettings]);

    // Shift subtitle timing
    const shiftSubtitles = (delta: number) => {
        if (!videoRef.current) return;
        const tracks = videoRef.current.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.mode === 'showing' && track.cues) {
                for (let j = 0; j < track.cues.length; j++) {
                    const cue = track.cues[j] as VTTCue;
                    cue.startTime += delta;
                    cue.endTime += delta;
                }
            }
        }
        setSubtitleOffset(prev => +(prev + delta).toFixed(1));
    };

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
    const clickCountRef = useRef(0);
    const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (volumeOSDTimer.current) clearTimeout(volumeOSDTimer.current);
            if (seekAnimationTimeout.current) clearTimeout(seekAnimationTimeout.current);
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
            if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        };
    }, []);

    // Fetch media details (SKIP if isIPTV)
    const { data: media } = useQuery({
        queryKey: ['media', mediaId],
        queryFn: () => apiClient.getMediaById(mediaId),
        enabled: !!mediaId && !isIPTV,
        refetchOnWindowFocus: false,
    });

    // Construct fake media object for IPTV
    const activeMedia = isIPTV ? {
        title: iptvState?.title || 'Live TV',
        series_id: null,
        watch_position: 0,
        path: iptvState?.streamUrl || ''
    } : media;

    // Determine Stream URL
    const streamUrl = useMemo(() => {
        if (isIPTV) return iptvState?.streamUrl || '';
        const baseUrl = apiClient.getStreamUrl(mediaId);
        // Use HLS 'copy' quality when a different audio track is selected to support seeking natively
        return selectedAudioTrack > 0 ? `${baseUrl}/copy_a${selectedAudioTrack}/playlist.m3u8` : baseUrl;
    }, [isIPTV, iptvState?.streamUrl, mediaId, selectedAudioTrack]);

    const isHls = useMemo(() => {
        return !!streamUrl && (streamUrl.includes('.m3u8') || streamUrl.includes('iptv'));
    }, [streamUrl]);

    // Determine if this is an episode: check type OR series_id presence
    const isEpisode = media?.type === 'episode' || !!media?.series_id;

    // Fetch episodes if this is an episode (to get series episodes for navigation)
    const { data: allEpisodes = [] } = useQuery({
        queryKey: ['episodes', media?.series_id],
        queryFn: () => apiClient.getSeriesEpisodes(media!.series_id!),
        enabled: !!media?.series_id,
    });

    // Fetch series info to get the actual series title for episodes
    const { data: series } = useQuery({
        queryKey: ['media', media?.series_id],
        queryFn: () => apiClient.getMediaById(media!.series_id!),
        enabled: !!media?.series_id && !isIPTV,
        refetchOnWindowFocus: false,
    });

    // Find current episode index and get previous/next

    const currentEpisodeIndex = allEpisodes.findIndex((ep: any) => ep.id === mediaId);
    const previousEpisode = currentEpisodeIndex > 0 ? allEpisodes[currentEpisodeIndex - 1] : null;
    const nextEpisode = currentEpisodeIndex < allEpisodes.length - 1 ? allEpisodes[currentEpisodeIndex + 1] : null;

    // Fetch subtitles
    const { data: subtitles = [], refetch: refetchSubtitles } = useQuery({
        queryKey: ['subtitles', mediaId],
        queryFn: () => apiClient.getSubtitles(mediaId),
        enabled: !!mediaId,
        refetchOnWindowFocus: false,
    });

    // Fetch media tracks (audio tracks + embedded subtitles)
    const { data: mediaTracks } = useQuery({
        queryKey: ['media-tracks', mediaId],
        queryFn: () => apiClient.getMediaTracks(mediaId),
        enabled: !!mediaId && !isIPTV,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 30, // Cache for 30 min
    });

    const audioTracks = mediaTracks?.audio_tracks || [];
    const embeddedSubtitleTracks = mediaTracks?.subtitle_tracks || [];

    // Auto-select audio track based on profile preference
    useEffect(() => {
        if (audioTracks.length > 1 && !audioAutoSelected && currentProfile) {
            const prefLang = currentProfile.default_audio_lang;
            if (prefLang && prefLang !== 'auto') {
                const targetIndex = audioTracks.findIndex((t: any) => 
                    t.language?.toLowerCase().includes(prefLang) || 
                    t.title?.toLowerCase().includes(prefLang === 'ara' ? 'arab' : 'eng')
                );
                
                if (targetIndex !== -1 && selectedAudioTrack !== targetIndex) {
                    if (hlsRef.current && hlsRef.current.audioTracks.length > 0) {
                        hlsRef.current.audioTrack = targetIndex;
                    }
                    setSelectedAudioTrack(targetIndex);
                }
            }
            setAudioAutoSelected(true);
        } else if (audioTracks.length <= 1 && audioTracks.length > 0 && !audioAutoSelected) {
            setAudioAutoSelected(true);
        }
    }, [audioTracks, audioAutoSelected, selectedAudioTrack, currentProfile]);

    const [subAutoSelected, setSubAutoSelected] = useState<boolean>(false);

    // Auto-select subtitle track based on profile preference
    useEffect(() => {
        if (!subAutoSelected && currentProfile && currentProfile.default_sub_lang && currentProfile.default_sub_lang !== 'off') {
            const prefLang = currentProfile.default_sub_lang;
            
            // Check external subtitles first
            if (subtitles.length > 0) {
                const targetSub = subtitles.find((s: any) => s.lang === prefLang || s.lang === (prefLang === 'ara' ? 'ar' : 'en'));
                if (targetSub) {
                    setSelectedSubtitle(apiClient.getSubtitleUrl(targetSub.path));
                    setSubAutoSelected(true);
                    return;
                }
            }
            
            // Check embedded subtitles
            if (embeddedSubtitleTracks.length > 0) {
                const targetTrack = embeddedSubtitleTracks.find((t: any) => 
                    t.language?.toLowerCase().includes(prefLang) || 
                    t.title?.toLowerCase().includes(prefLang === 'ara' ? 'arab' : 'eng')
                );
                if (targetTrack) {
                    setSelectedEmbeddedSub(String(targetTrack.index));
                    setSubAutoSelected(true);
                    return;
                }
            }
            
            // Mark as selected even if not found to avoid infinite loop
            if (subtitles.length > 0 || embeddedSubtitleTracks.length > 0) {
                setSubAutoSelected(true);
            }
        }
    }, [subtitles, embeddedSubtitleTracks, subAutoSelected, currentProfile]);

    // Query client for direct cache updates
    const queryClient = useQueryClient();

    // Fetch thumbnails - ensure mediaId is a string/number, not object
    const { data: thumbnails = [], isFetching: isFetchingThumbnails } = useQuery({
        queryKey: ['thumbnails', mediaId],
        queryFn: () => {
            const id = String(mediaId);
            logger.debug(`Fetching thumbnails for media ID: ${id}`);
            return apiClient.getThumbnails(id);
        },
        enabled: !!mediaId,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    // Auto-generate thumbnails when video loads — with deduplication guard
    useEffect(() => {
        // Only generate if we don't have thumbnails, aren't currently fetching them, and have video duration
        if (mediaId && duration > 0 && thumbnails.length === 0 && !isFetchingThumbnails && thumbGenTriggeredRef.current !== mediaId) {
            thumbGenTriggeredRef.current = mediaId; // Prevent duplicate requests (React StrictMode double-invokes)
            const id = String(mediaId);

            // Dynamic interval calculation:
            // Target roughly 300 thumbnails for performance balance
            // Min interval: 10s, Max interval: 60s
            const targetCount = 300;
            const calculatedInterval = Math.floor(duration / targetCount);
            const interval = Math.max(10, Math.min(60, calculatedInterval));

            // Generate thumbnails in background, then push results directly into cache
            apiClient.generateThumbnails(mediaId, interval, Math.floor(duration))

                .then((result: any) => {
                    logger.debug(`✅ Timeline thumbnails generated for media ${id} (Interval: ${interval}s)`);
                    // Push generated thumbnails directly into React Query cache — instant update, no extra fetch
                    if (result?.thumbnails?.length > 0) {
                        queryClient.setQueryData(['thumbnails', mediaId], result.thumbnails);
                    } else {
                        // Fallback: invalidate cache to force a fresh fetch from the list endpoint
                        queryClient.invalidateQueries({ queryKey: ['thumbnails', mediaId] });
                    }
                })
                .catch((err) => {
                    thumbGenTriggeredRef.current = 0; // Reset on failure so it can retry
                    logger.warn('⚠️ Thumbnail generation skipped:', err.message);
                });
        }
    }, [mediaId, duration, thumbnails.length, isFetchingThumbnails, queryClient]);

    // Update progress mutation
    const updateProgressMutation = useMutation({
        mutationFn: (position: number) => {
            const currentDuration = videoRef.current?.duration || duration;
            // Removed verbose debug log for progress save

            if (!currentDuration || currentDuration === 0) {
                logger.error('❌ Duration is 0, cannot save progress');
                return Promise.reject('Duration not available');
            }

            return apiClient.updateWatchProgress(mediaId, position, currentDuration);
        },
        onSuccess: () => {
            // Intentionally silent — do NOT log to backend /api/logs on every save
            // (was causing ~21,600 HTTP requests per 2-hour movie)
        },
        onError: (error) => {
            logger.error('❌ Failed to save watch progress:', error);
        },
    });

    // =========================================================================
    // BULLETPROOF PROGRESS TRACKING SYSTEM
    // Guarantees progress is saved on: timeupdate(1s), pause, seek, unmount, tab close
    // =========================================================================
    const lastProgressRef = useRef<{ time: number; duration: number }>({ time: 0, duration: 0 });
    const lastSavedRef = useRef<number>(0); // timestamp of last successful save
    const saveThrottleMs = 8000; // save at most once per 8 seconds (was 1s — caused 21,600 req/movie flood)
    const updateProgressMutationRef = useRef(updateProgressMutation);
    updateProgressMutationRef.current = updateProgressMutation;

    // Core save function — fires the API call
    const saveProgressNow = useCallback((pos: number, dur: number) => {
        if (pos > 0 && dur > 0 && mediaId && !isIPTV) {
            updateProgressMutationRef.current.mutate(pos);
            lastSavedRef.current = Date.now();
        }
    }, [mediaId, isIPTV]);

    // Sync save for unload/unmount — uses sendBeacon for guaranteed delivery
    const saveProgressSync = useCallback(() => {
        const pos = videoRef.current?.currentTime || lastProgressRef.current.time;
        let dur = videoRef.current?.duration || lastProgressRef.current.duration;
        if (!dur || dur === Infinity) dur = durationRef.current;
        
        if (pos > 0 && dur > 0 && dur !== Infinity && mediaId && !isIPTV) {
            try {
                const payload = JSON.stringify({ media_id: mediaId, position: pos, duration: dur });
                const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
                const url = `${apiBase}/api/history/update`;
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
                } else {
                    // Fallback: synchronous XHR (last resort)
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', url, false); // synchronous
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.send(payload);
                }
            } catch (e) { /* silent */ }
        }
    }, [mediaId, isIPTV]);

    // Restore watch position when media loads — ONCE per mediaId only.
    // Without the ref guard, this effect re-runs on every React Query background
    // refetch of `media` (new object reference), causing the video to jump back
    // to the original saved position mid-playback ("scene replaying" bug).
    useEffect(() => {
        if (media?.watch_position && videoRef.current && duration > 0 && positionRestoredForMediaRef.current !== mediaId) {
            const position = media.watch_position;
            logger.debug(`🔄 Restoring: ${Math.floor(position)}s / ${Math.floor(duration)}s (${Math.floor(position / duration * 100)}%)`);
            videoRef.current.currentTime = position;
            setCurrentTime(position);
            positionRestoredForMediaRef.current = mediaId;
            logger.info('✅ Position restored');
        }
    }, [media, duration, mediaId]);

    // MASTER EFFECT: Attach all video event listeners for progress tracking
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !mediaId || isIPTV) return;

        // 1. On every timeupdate (~250ms by browser), update the ref.
        //    Throttle actual API save calls to once per second.
        const handleTimeUpdate = () => {
            const pos = video.currentTime;
            let dur = video.duration;
            if (!dur || dur === Infinity) dur = durationRef.current;
            if (!pos || !dur || dur === 0 || dur === Infinity) return;

            // Always update the ref (so unmount/unload always has fresh data)
            lastProgressRef.current = { time: pos, duration: dur };

            // Throttle: only save to backend if 1 second has passed
            const now = Date.now();
            if (now - lastSavedRef.current >= saveThrottleMs) {
                saveProgressNow(pos, dur);
            }
        };

        // 2. On pause: ALWAYS save immediately (user may navigate away right after)
        const handlePause = () => {
            const pos = video.currentTime;
            let dur = video.duration;
            if (!dur || dur === Infinity) dur = durationRef.current;
            if (pos > 0 && dur > 0 && dur !== Infinity) {
                lastProgressRef.current = { time: pos, duration: dur };
                saveProgressNow(pos, dur);
            }
        };

        // 3. On seeked: save the new position immediately
        const handleSeeked = () => {
            const pos = video.currentTime;
            let dur = video.duration;
            if (!dur || dur === Infinity) dur = durationRef.current;
            if (pos > 0 && dur > 0 && dur !== Infinity) {
                lastProgressRef.current = { time: pos, duration: dur };
                saveProgressNow(pos, dur);
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('pause', handlePause);
        video.addEventListener('seeked', handleSeeked);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('seeked', handleSeeked);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaId, isIPTV]);

    // Tab/Browser close handler (sendBeacon)
    useEffect(() => {
        if (!mediaId || isIPTV) return;

        window.addEventListener('beforeunload', saveProgressSync);
        return () => {
            window.removeEventListener('beforeunload', saveProgressSync);
            // Component unmount: guaranteed final save
            saveProgressSync();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaId, isIPTV]);

    // Auto trigger Next Episode when countdown hits 0
    // Guard: only when actively playing to prevent false triggers during buffering/loading
    useEffect(() => {
        if (!hideNextEpisode && nextEpisode && duration > 0 && isPlaying && duration - currentTime <= 0.5) {
            navigate(`/player/${nextEpisode.id}`);
        }
    }, [currentTime, duration, hideNextEpisode, nextEpisode, navigate, isPlaying]);

    // Initialize video volume when video element loads
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const initVolume = () => {
            // Use ref to get latest volume value instead of stale closure
            video.volume = volume / 100;
            // Only unmute on first load, not on stream changes
            console.log('[Player] Volume set:', video.volume);
        };

        // Set immediately
        initVolume();

        // Also set on canplay and loadeddata events (in case video wasn't ready)
        video.addEventListener('canplay', initVolume);
        video.addEventListener('loadeddata', initVolume);

        return () => {
            video.removeEventListener('canplay', initVolume);
            video.removeEventListener('loadeddata', initVolume);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamUrl, volume]); // Include volume in dependencies to avoid stale closure

    // Video event handlers
    // HLS Support
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !streamUrl) return;

        let hls: Hls | null = null;
        const streamIsHls = streamUrl.includes('.m3u8') || streamUrl.includes('iptv');

        if (streamIsHls && Hls.isSupported()) {
            logger.info('🔌 Initializing HLS.js for stream:', streamUrl);
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });

            hlsRef.current = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                // Determine levels
                console.log('HLS Levels:', data.levels);
                setHlsLevels(data.levels);
            });

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    logger.error('HLS Fatal Error:', data.type);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls?.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls?.recoverMediaError();
                            break;
                        default:
                            hls?.destroy();
                            break;
                    }
                }
            });
        }

        return () => {
            if (hls) {
                hls.destroy();
                hlsRef.current = null;
            }
        };
    }, [streamUrl]);

    const handlePlayPause = async () => {
        if (videoRef.current) {
            try {
                if (isPlaying) {
                    videoRef.current.pause();
                } else {
                    await videoRef.current.play();
                }
                setIsPlaying(!isPlaying);
            } catch (error) {
                // Ignore AbortError which happens when play() is interrupted by pause()

                if ((error as any).name !== 'AbortError') {
                    console.error('Playback error:', error);
                }
            }
        }
    };

    const handleVolumeChange = (value: number[]) => {
        const newVolume = value[0];
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume / 100;
            setIsMuted(newVolume === 0);
        }
        triggerVolumeOSD();
    };

    const triggerVolumeOSD = () => {
        setShowVolumeOSD(true);
        if (volumeOSDTimer.current) {
            clearTimeout(volumeOSDTimer.current);
        }
        volumeOSDTimer.current = setTimeout(() => {
            setShowVolumeOSD(false);
        }, 3000); // 3 Seconds
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
            triggerVolumeOSD();
        }
    };

    const handleSeek = (value: number[]) => {
        const newTime = value[0];
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    const handleSkip = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
            // Update current time state for UI
            setCurrentTime(videoRef.current.currentTime);
            triggerSeekAnimation(seconds);
        }
    };

    const triggerSeekAnimation = (seconds: number) => {
        const side = seconds > 0 ? 'right' : 'left';

        // Trigger animation
        setSeekAnimation({ side, id: Date.now() });

        // Clear existing timeout
        if (seekAnimationTimeout.current) {
            clearTimeout(seekAnimationTimeout.current);
        }

        // Hide after animation (1s)
        seekAnimationTimeout.current = setTimeout(() => {
            setSeekAnimation({ side: null, id: 0 });
        }, 800);
    };


    const handleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        if (!document.fullscreenElement) {
            container.requestFullscreen().then(() => {
                setIsFullscreen(true);
            }).catch((err) => {
                logger.error('Fullscreen error:', err);
            });
        } else {
            document.exitFullscreen().then(() => {
                setIsFullscreen(false);
            });
        }
    };

    // Listen to fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Auto-hide controls after 3 seconds of inactivity
    useEffect(() => {
        if (showControls && isPlaying) {
            // Clear existing timer
            if (hideControlsTimerRef.current) {
                clearTimeout(hideControlsTimerRef.current);
            }

            // Set new timer to hide controls after 3 seconds
            hideControlsTimerRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }

        // Cleanup
        return () => {
            if (hideControlsTimerRef.current) {
                clearTimeout(hideControlsTimerRef.current);
            }
        };
    }, [showControls, isPlaying]);

    const handlePlaybackRateChange = (rate: string) => {
        const newRate = parseFloat(rate);
        setPlaybackRate(newRate);
        if (videoRef.current) {
            videoRef.current.playbackRate = newRate;
        }
    };

    // Handle audio track change
    const handleAudioTrackChange = (audioIndex: string) => {
        const idx = parseInt(audioIndex);
        
        // For HLS streams — use hls.js API
        if (hlsRef.current && hlsRef.current.audioTracks.length > 0) {
            hlsRef.current.audioTrack = idx;
            setSelectedAudioTrack(idx);
            toast.success(`🔊 تم تغيير مسار الصوت`);
            return;
        }

        // Save current state before React re-renders with new src
        const video = videoRef.current;
        if (video) {
            const savedTime = video.currentTime;
            const wasPlaying = !video.paused;
            
            const onCanPlay = () => {
                video.currentTime = savedTime;
                if (wasPlaying) video.play().catch(() => {});
                video.removeEventListener('canplay', onCanPlay);
            };
            video.addEventListener('canplay', onCanPlay);
        }

        setSelectedAudioTrack(idx);
        toast.success(`🔊 تم تغيير مسار الصوت`);
    };

    // Audio Track Stripping / Removal State & Handlers
    const [audioModal, setAudioModal] = useState<{
        isOpen: boolean;
        mode: 'remove' | 'keep';
        audioIdx: number;
        trackLabel: string;
    } | null>(null);
    const [isModifyingAudio, setIsModifyingAudio] = useState<boolean>(false);

    const handleRemoveAudioTrackClick = (audioIdx: number, trackLabel: string) => {
        setAudioModal({
            isOpen: true,
            mode: 'remove',
            audioIdx,
            trackLabel,
        });
    };

    const handleKeepOnlyAudioTrackClick = (audioIdx: number, trackLabel: string) => {
        setAudioModal({
            isOpen: true,
            mode: 'keep',
            audioIdx,
            trackLabel,
        });
    };

    const handleConfirmAudioAction = async () => {
        if (!audioModal || !mediaId) return;
        setIsModifyingAudio(true);

        const video = videoRef.current;
        const savedTime = video?.currentTime || 0;
        const wasPlaying = video ? !video.paused : false;

        try {
            // Unload player media to release file handle on Windows
            if (hlsRef.current) {
                try { hlsRef.current.detachMedia(); } catch (e) {}
            }
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.load();
            }

            // Wait 300ms for browser socket to close
            await new Promise(r => setTimeout(r, 300));

            const payload = audioModal.mode === 'keep'
                ? { keep_audio_index: audioModal.audioIdx }
                : { remove_audio_index: audioModal.audioIdx };

            const res = await apiClient.removeAudioTrack(mediaId, payload);
            if (res.success) {
                toast.success(
                    audioModal.mode === 'keep'
                        ? 'تم الاحتفاظ بهذا الصوت كافتراضي وحذف الأصوات الأخرى! ✨'
                        : 'تم حذف المسار الصوتي بنجاح من ملف الفيديو! ✨'
                );
                setAudioModal(null);
                queryClient.invalidateQueries(['media-tracks', mediaId]);
                setSelectedAudioTrack(0);

                // Reload player media cleanly
                setTimeout(() => {
                    const streamUrl = isIPTV 
                        ? (iptvState?.streamUrl || '') 
                        : apiClient.getStreamUrl(mediaId);

                    if (video) {
                        video.src = streamUrl;
                        const onCanPlay = () => {
                            video.currentTime = savedTime;
                            if (wasPlaying) video.play().catch(() => {});
                            video.removeEventListener('canplay', onCanPlay);
                        };
                        video.addEventListener('canplay', onCanPlay);
                        video.load();
                    }
                }, 200);
            } else {
                toast.error(res.message || 'حدث خطأ أثناء التعديل على الملف');
                if (video) {
                    video.src = apiClient.getStreamUrl(mediaId);
                    video.currentTime = savedTime;
                }
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.message || 'فشلت عملية التعديل على الصوت');
            if (video) {
                video.src = apiClient.getStreamUrl(mediaId);
                video.currentTime = savedTime;
            }
        } finally {
            setIsModifyingAudio(false);
        }
    };

    // Handle embedded subtitle track change
    const handleEmbeddedSubChange = (value: string) => {
        setSelectedEmbeddedSub(value);
        if (value !== 'off') {
            toast.success(`📝 تم تفعيل الترجمة المدمجة`);
            
            // Allow React to render the track, then force it to display
            setTimeout(() => {
                if (videoRef.current) {
                    const tracks = videoRef.current.textTracks;
                    for (let i = 0; i < tracks.length; i++) {
                        if (tracks[i].label === (embeddedSubtitleTracks[parseInt(value)]?.label || 'Embedded')) {
                            tracks[i].mode = 'showing';
                        } else {
                            tracks[i].mode = 'hidden';
                        }
                    }
                }
            }, 100);
        } else if (videoRef.current) {
            for (let i = 0; i < videoRef.current.textTracks.length; i++) {
                videoRef.current.textTracks[i].mode = 'hidden';
            }
        }
    };

    const handleSubtitleChange = (subtitlePath: string) => {
        setSelectedSubtitle(subtitlePath);
        if (videoRef.current) {
            const tracks = videoRef.current.textTracks;

            // First, hide all tracks
            for (let i = 0; i < tracks.length; i++) {
                tracks[i].mode = 'hidden';
            }

            // Then show the matching track if not 'off'
            if (subtitlePath !== 'off') {
                const subIndex = subtitles.findIndex((s: any) => s.url === subtitlePath);
                if (subIndex >= 0 && tracks[subIndex]) {
                    tracks[subIndex].mode = 'showing';
                } else {
                    // Fallback: try matching by src attribute on the track element
                    const expectedSrc = apiClient.getSubtitleUrl(subtitlePath);
                    for (let i = 0; i < tracks.length; i++) {
                        // TextTrack doesn't have src, but we can match by label or index
                        const matchingSub = subtitles[i];
                        if (matchingSub && apiClient.getSubtitleUrl(matchingSub.url) === expectedSrc) {
                            tracks[i].mode = 'showing';
                            break;
                        }
                    }
                }
            }
        }
    };


    // Timeline hover handlers
    const handleTimelineHover = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const time = percentage * (duration || 0);
        setHoverTime(time);
        setHoverPosition({ x: e.clientX, y: rect.top });
    };

    const handleTimelineLeave = () => {
        setHoverTime(null);
        setHoverPosition(null);
    };

    // Sort thumbnails by timestamp for efficient lookup
    const sortedThumbnails = useMemo(() => {
        if (!thumbnails || thumbnails.length === 0) return [];

        return [...thumbnails].sort((a: any, b: any) => a.timestamp - b.timestamp);
    }, [thumbnails]);

    // Get closest thumbnail for hover time using Binary Search
    const getHoverThumbnail = (targetTime: number | null) => {
        if (targetTime === null || sortedThumbnails.length === 0) return null;


        // Simpler Binary Search for Closest
        let low = 0;
        let high = sortedThumbnails.length - 1;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (sortedThumbnails[mid].timestamp < targetTime) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        // 'low' is the candidate index (upper bound)
        const candidates = [low, low - 1].filter(i => i >= 0 && i < sortedThumbnails.length);
        let best = sortedThumbnails[low] || sortedThumbnails[0];
        let bestDiff = Math.abs(best.timestamp - targetTime);

        for (const idx of candidates) {
            const thumb = sortedThumbnails[idx];
            if (!thumb) continue;
            const diff = Math.abs(thumb.timestamp - targetTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = thumb;
            }
        }

        return best;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const currentHoverThumbnail = useMemo(() => getHoverThumbnail(hoverTime), [hoverTime, sortedThumbnails]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            // Don't handle shortcuts if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    handlePlayPause();
                    break;
                case 'f':
                    handleFullscreen();
                    break;
                case 'm':
                    handleMuteToggle();
                    break;
                case 'arrowleft':
                    handleSkip(-5);
                    break;
                case 'arrowright':
                    handleSkip(5);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    setVolume((prev) => {
                        const newVol = Math.min(100, prev + 10);
                        if (videoRef.current) {
                            videoRef.current.volume = newVol / 100;
                            setIsMuted(newVol === 0);
                        }
                        triggerVolumeOSD();
                        return newVol;
                    });
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    setVolume((prev) => {
                        const newVol = Math.max(0, prev - 10);
                        if (videoRef.current) {
                            videoRef.current.volume = newVol / 100;
                            setIsMuted(newVol === 0);
                        }
                        triggerVolumeOSD();
                        return newVol;
                    });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    });

    // Format time helper
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0
            ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            : `${m}:${s.toString().padStart(2, '0')}`;
    };





    return (
        <div className="min-h-screen bg-black">
            {/* Video Player Container */}
            <div
                ref={containerRef}
                className={`relative w-full h-screen flex items-center justify-center`}
                style={{ cursor: showControls ? 'default' : 'none' }}
                onMouseMove={() => setShowControls(true)}
                onMouseLeave={() => isPlaying && setShowControls(false)}
                onWheel={(e) => {
                    // Control volume with mouse wheel
                    // Scroll UP (negative delta) -> Increase Volume
                    // Scroll DOWN (positive delta) -> Decrease Volume
                    const delta = e.deltaY > 0 ? -5 : 5;
                    setVolume((prev) => {
                        const newVol = Math.max(0, Math.min(100, prev + delta));
                        if (videoRef.current) {
                            videoRef.current.volume = newVol / 100;
                            setIsMuted(newVol === 0);
                        }
                        triggerVolumeOSD();
                        return newVol;
                    });
                }}
            >
                {/* Video Element */}
                <video
                    ref={videoRef}
                    src={isHls ? undefined : streamUrl}
                    className="w-full h-full"
                    style={{
                        filter: autoEnhance
                            ? `brightness(${videoFilters.brightness * 1.05}%) contrast(${videoFilters.contrast * 1.1}%) saturate(${videoFilters.saturation * 1.15}%)`
                            : `brightness(${videoFilters.brightness}%) contrast(${videoFilters.contrast}%) saturate(${videoFilters.saturation}%)`
                    }}
                    onTimeUpdate={(e) => {
                        setCurrentTime(e.currentTarget.currentTime);
                    }}
                    onLoadedMetadata={(e) => {
                        const dbDuration = activeMedia?.duration || 0;
                        if (isHls && dbDuration > 0) {
                            setDuration(dbDuration);
                        } else {
                            setDuration(e.currentTarget.duration);
                        }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    crossOrigin="anonymous"
                >
                    {subtitles.map((sub: any, idx: number) => (
                        <track
                            key={`${sub.lang}-${idx}`}
                            kind="subtitles"
                            src={apiClient.getSubtitleUrl(sub.url)}
                            srcLang={sub.lang}
                            label={sub.label}
                        />
                    ))}
                    {selectedEmbeddedSub !== 'off' && embeddedSubtitleTracks[parseInt(selectedEmbeddedSub)] && (
                        <track
                            key={`embedded-${selectedEmbeddedSub}`}
                            kind="subtitles"
                            src={`${apiClient.getStreamUrl(mediaId).replace('/api/stream/', '/api/media/')}/subtitles/embedded/${selectedEmbeddedSub}`}
                            srcLang={embeddedSubtitleTracks[parseInt(selectedEmbeddedSub)].language || 'und'}
                            label={embeddedSubtitleTracks[parseInt(selectedEmbeddedSub)].label || 'Embedded'}
                            default
                        />
                    )}
                </video>

                {/* Touch Gesture Zones Overlay (Invisible) */}
                <div className={`absolute inset-0 z-10 flex ${showControls ? 'cursor-pointer' : 'cursor-none'}`}>
                    {/* Left Zone - Double Tap to Rewind */}
                    <div
                        className="w-[30%] h-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            clickCountRef.current += 1;
                            if (clickCountRef.current === 1) {
                                clickTimerRef.current = setTimeout(() => {
                                    handlePlayPause();
                                    clickCountRef.current = 0;
                                }, 300);
                            } else if (clickCountRef.current === 2) {
                                if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                                handleSkip(-10); // Skip backward 10s
                                clickCountRef.current = 0;
                            }
                        }}
                    />

                    {/* Center Zone - Double Tap for Fullscreen */}
                    <div
                        className="flex-1 h-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            clickCountRef.current += 1;
                            if (clickCountRef.current === 1) {
                                clickTimerRef.current = setTimeout(() => {
                                    handlePlayPause();
                                    clickCountRef.current = 0;
                                }, 300);
                            } else if (clickCountRef.current === 2) {
                                if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                                handleFullscreen();
                                clickCountRef.current = 0;
                            }
                        }}
                    />

                    {/* Right Zone - Double Tap to Skip Forward */}
                    <div
                        className="w-[30%] h-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            clickCountRef.current += 1;
                            if (clickCountRef.current === 1) {
                                clickTimerRef.current = setTimeout(() => {
                                    handlePlayPause();
                                    clickCountRef.current = 0;
                                }, 300);
                            } else if (clickCountRef.current === 2) {
                                if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                                handleSkip(10); // Skip forward 10s
                                clickCountRef.current = 0;
                            }
                        }}
                    />
                </div>

                {/* Seek Animation overlay - YouTube Style (Subtle) */}
                {seekAnimation.side && (
                    <div
                        className={`absolute inset-y-0 w-[15%] flex items-center justify-center z-40 bg-white/10 backdrop-blur-md transition-all duration-300 ${seekAnimation.side === 'left' ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full'
                            }`}
                        key={seekAnimation.id} // Force re-render on new click
                    >
                        <div className="flex flex-col items-center gap-1 animate-in zoom-in duration-200">
                            <div className="flex">
                                {seekAnimation.side === 'left' ? (
                                    <>
                                        <RotateCcw className="w-8 h-8 text-white animate-spin-reverse" style={{ animationDuration: '0.4s' }} />
                                    </>
                                ) : (
                                    <>
                                        <RotateCw className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '0.4s' }} />
                                    </>
                                )}
                            </div>
                            <span className="text-white font-bold text-sm drop-shadow-md">
                                {seekAnimation.side === 'left' ? '10 ثوانٍ للخلف' : '10 ثوانٍ للأمام'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Custom Volume OSD */}
                <div
                    dir="ltr"
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-300 ${showVolumeOSD ? 'opacity-90 scale-100' : 'opacity-0 scale-90'
                        }`}
                >
                    <div className="bg-black/60 backdrop-blur-md p-6 rounded-2xl flex flex-col items-center gap-4 min-w-[160px]">
                        {isMuted || volume === 0 ? (
                            <VolumeX className="w-12 h-12 text-white/70" />
                        ) : (
                            <Volume2 className="w-12 h-12 text-white" />
                        )}
                        <div className="flex flex-col items-center gap-1 w-full">
                            <span className="text-2xl font-bold text-white">{isMuted ? 0 : volume}%</span>
                            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-100"
                                    style={{ width: `${isMuted ? 0 : volume}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Controls Overlay - Now handles clicks */}
                <div
                    className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50 transition-opacity z-20 ${showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        }`}
                    onClick={(e) => {
                        // Only trigger if clicking the overlay itself, not a button/slider
                        if (e.target !== e.currentTarget) return;

                        clickCountRef.current += 1;
                        if (clickCountRef.current === 1) {
                            clickTimerRef.current = setTimeout(() => {
                                handlePlayPause();
                                clickCountRef.current = 0;
                            }, 300);
                        } else if (clickCountRef.current === 2) {
                            if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
                            handleFullscreen();
                            clickCountRef.current = 0;
                        }
                    }}
                >
                    {/* Top Bar - RTL: Back button on RIGHT side */}
                    <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between pointer-events-auto">
                        <h1
                            className="text-xl font-bold text-white flex-1 text-right pr-12 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => navigate(`/details/${media?.series_id || mediaId}`)}
                        >
                            {isEpisode && media?.season_number != null && media?.episode_number != null
                                ? `${series?.title || (media.title && !/^S\d+(E\d+)?$/i.test(media.title) ? media.title : 'الحلقة')} - S${String(media.season_number).padStart(2, '0')}E${String(media.episode_number).padStart(2, '0')}${media.episode_title && media.episode_title !== series?.title && media.episode_title !== media.title ? ` - ${media.episode_title}` : ''}`
                                : media?.title
                            }
                        </h1>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-white hover:bg-white/20 absolute right-6"
                            onClick={() => navigate(-1)}
                        >
                            <ArrowRight className="w-6 h-6" />
                        </Button>
                    </div>

                    {/* Center Play Button (when paused) - pointer-events-none on container to let clicks pass through */}
                    {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-20 h-20 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayPause();
                                }}
                            >
                                <Play className="w-10 h-10 text-white fill-white" />
                            </Button>
                        </div>
                    )}

                    {/* Unified Settings Panel */}
                    <PlayerSettingsPanel
                        activeTab={activeSettingsTab}
                        onClose={() => setActiveSettingsTab(null)}
                        setActiveTab={setActiveSettingsTab}
                        
                        subtitleSettings={subtitleSettings}
                        setSubtitleSettings={setSubtitleSettings}
                        customSubtitleProfiles={customSubtitleProfiles}
                        newProfileName={newProfileName}
                        setNewProfileName={setNewProfileName}
                        saveCustomProfile={saveCustomProfile}
                        deleteCustomProfile={deleteCustomProfile}
                        shiftSubtitles={shiftSubtitles}
                        subtitleOffset={subtitleOffset}
                        
                        handleSearchSubtitles={handleSearchSubtitles}
                        isSearchingSubtitles={isSearchingSubtitles}
                        mediaId={mediaId}
                        openSubtitlesResults={openSubtitlesResults}
                        handleDownloadSubtitle={handleDownloadSubtitle}
                        downloadingSubId={downloadingSubId}
                        
                        videoFilters={videoFilters}
                        setVideoFilters={setVideoFilters}
                        autoEnhance={autoEnhance}
                        setAutoEnhance={setAutoEnhance}
                        
                        audioTracks={audioTracks}
                        selectedAudioTrack={selectedAudioTrack}
                        handleAudioTrackChange={handleAudioTrackChange}
                        onRemoveAudioTrack={handleRemoveAudioTrackClick}
                        onKeepOnlyAudioTrack={handleKeepOnlyAudioTrackClick}
                        isModifyingAudio={isModifyingAudio}
                        embeddedSubtitleTracks={embeddedSubtitleTracks}
                        selectedEmbeddedSub={selectedEmbeddedSub}
                        handleEmbeddedSubChange={handleEmbeddedSubChange}
                        playbackRate={playbackRate}
                        handlePlaybackRateChange={handlePlaybackRateChange}
                    />


                    {/* Skip Intro Button — Primary/Blue Theme */}
                    {media?.intro_start != null && media?.intro_end != null &&
                        currentTime >= media.intro_start && currentTime < media.intro_end && (
                            <div className="absolute bottom-32 left-8 z-50 animate-in fade-in slide-in-from-left-8 duration-700">
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (videoRef.current) {
                                            videoRef.current.currentTime = media.intro_end;
                                            toast.success('تم تخطي المقدمة ✨');
                                        }
                                    }}
                                    className="relative bg-primary/20 hover:bg-primary/40 text-white backdrop-blur-xl border border-primary/40 gap-3 pl-4 pr-6 h-14 rounded-full shadow-[0_0_30px_rgba(59,130,246,0.4)] group transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-primary/30 to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                    <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
                                    
                                    <div className="relative z-10 w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center group-hover:bg-primary/60 transition-all duration-300">
                                        <SkipForward className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                    <div className="relative z-10 flex flex-col items-start">
                                        <span className="font-bold text-base tracking-wide leading-tight">
                                            تخطي المقدمة
                                        </span>
                                        <span className="text-xs text-blue-200/70 font-mono">
                                            {Math.ceil(media.intro_end - currentTime)}s متبقية
                                        </span>
                                    </div>
                                </Button>
                            </div>
                        )}

                    {/* Skip Outro Button — Amber/Warm Theme */}
                    {media?.outro_start != null && media?.outro_end != null &&
                        currentTime >= media.outro_start && currentTime < media.outro_end && (
                            <div className="absolute bottom-32 left-8 z-50 animate-in fade-in slide-in-from-left-8 duration-700">
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (nextEpisode) {
                                            navigate(`/player/${nextEpisode.id}`);
                                            toast.success('جاري تشغيل الحلقة التالية ▶️');
                                        } else if (videoRef.current) {
                                            videoRef.current.currentTime = media.outro_end;
                                            toast.success('تم تخطي الخاتمة ✨');
                                        }
                                    }}
                                    className="relative bg-amber-500/20 hover:bg-amber-500/40 text-white backdrop-blur-xl border border-amber-500/40 gap-3 pl-4 pr-6 h-14 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.4)] group transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/30 to-yellow-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                    <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
                                    
                                    <div className="relative z-10 w-8 h-8 rounded-full bg-amber-500/30 flex items-center justify-center group-hover:bg-amber-500/60 transition-all duration-300">
                                        <SkipForward className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                    <div className="relative z-10 flex flex-col items-start">
                                        <span className="font-bold text-base tracking-wide leading-tight">
                                            {nextEpisode ? 'الحلقة التالية' : 'تخطي الخاتمة'}
                                        </span>
                                        <span className="text-xs text-amber-200/70 font-mono">
                                            {Math.ceil(media.outro_end - currentTime)}s متبقية
                                        </span>
                                    </div>
                                </Button>
                            </div>
                        )}

                    {/* Auto-Next Episode Overlay */}
                    {!hideNextEpisode && nextEpisode && (
                        ((media?.outro_start != null && currentTime >= media?.outro_start) || 
                        (duration > 60 && duration - currentTime <= 25))
                    ) && (
                        <div className="absolute bottom-32 right-8 z-50 bg-black/80 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl flex flex-col gap-3 min-w-[280px] animate-in slide-in-from-right-8 duration-500 pointer-events-auto">
                            <h4 className="text-white font-bold text-lg">الحلقة التالية: {nextEpisode.title || 'التالية'}</h4>
                            <div className="flex items-center gap-3">
                                <div className="text-4xl font-mono font-bold text-primary">
                                    {Math.max(0, Math.ceil(duration - currentTime))}
                                </div>
                                <div className="text-white/70 text-sm">ثانية للتشغيل التلقائي</div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/player/${nextEpisode.id}`);
                                    }}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-white"
                                >
                                    تشغيل الآن
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setHideNextEpisode(true);
                                    }}
                                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                                >
                                    إلغاء
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Bottom Controls */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 space-y-4 pointer-events-auto">
                        {/* Progress Bar with Hover Detection */}
                        <div
                            onMouseMove={handleTimelineHover}
                            onMouseLeave={handleTimelineLeave}
                            className="relative w-full py-4 group cursor-pointer flex items-center"
                        >
                            {/* Timeline Hover Preview Tooltip */}
                            {hoverTime !== null && hoverPosition && (
                                <div
                                    className="absolute bottom-full mb-4 pointer-events-none z-50 flex flex-col items-center transition-all duration-75 ease-out origin-bottom"
                                    style={{
                                        left: `clamp(120px, ${(hoverTime / (duration || 1)) * 100}%, calc(100% - 120px))`,
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    {/* Thumbnail Image */}
                                    <div className="w-48 md:w-64 aspect-video rounded-xl overflow-hidden shadow-2xl mb-2 flex-none bg-black/80 backdrop-blur-md border border-white/20 relative">
                                        {/* Skeleton loading background */}
                                        <div className="absolute inset-0 bg-white/5 animate-pulse" />
                                        
                                        {currentHoverThumbnail && (
                                            <img
                                                src={apiClient.getImageUrl(currentHoverThumbnail.url)}
                                                alt="Preview"
                                                className="absolute inset-0 w-full h-full object-cover z-10 transition-opacity duration-300"
                                                onLoad={(e) => {
                                                    (e.target as HTMLImageElement).style.opacity = '1';
                                                }}
                                                style={{ opacity: 0 }}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.opacity = '0';
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Time Code */}
                                    <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white text-sm font-bold shadow-lg whitespace-nowrap">
                                        {formatTime(hoverTime)}
                                    </div>
                                </div>
                            )}

                            {/* Custom Timeline with Intro/Outro Colored Segments */}
                            <div className="relative w-full">
                                {/* Intro Segment Overlay (Blue) */}
                                {media?.intro_start != null && media?.intro_end != null && duration > 0 && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full z-[1] pointer-events-none bg-gradient-to-r from-blue-500/60 via-primary/70 to-cyan-500/60"
                                        style={{
                                            left: `${(media.intro_start / duration) * 100}%`,
                                            width: `${((media.intro_end - media.intro_start) / duration) * 100}%`,
                                        }}
                                    >
                                        <div className="absolute inset-0 rounded-full animate-pulse opacity-30 bg-primary" />
                                    </div>
                                )}
                                {/* Outro Segment Overlay (Amber) */}
                                {media?.outro_start != null && media?.outro_end != null && duration > 0 && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full z-[1] pointer-events-none bg-gradient-to-r from-amber-500/60 via-orange-500/70 to-yellow-500/60"
                                        style={{
                                            left: `${(media.outro_start / duration) * 100}%`,
                                            width: `${((media.outro_end - media.outro_start) / duration) * 100}%`,
                                        }}
                                    >
                                        <div className="absolute inset-0 rounded-full animate-pulse opacity-30 bg-amber-500" />
                                    </div>
                                )}
                                <Slider
                                    value={[currentTime]}
                                    max={duration || 100}
                                    step={0.1}
                                    onValueChange={handleSeek}
                                    className="w-full relative z-[2]"
                                />
                            </div>
                        </div>

                        {/* Control Buttons - RTL Layout */}
                        <div className="flex items-center justify-between">
                            {/* RIGHT Controls (were left) - Volume, Time, Playback */}
                            <div className="flex items-center gap-4">
                                {/* Fullscreen */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-white hover:bg-white/20 transition-all hover:scale-110 active:scale-95"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleFullscreen();
                                    }}
                                >
                                    <Maximize className="w-5 h-5" />
                                </Button>

                                {/* Subtitle Settings Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`transition-all ${activeSettingsTab === 'subtitles' ? 'text-primary bg-primary/20' : 'text-white hover:bg-white/20'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveSettingsTab(activeSettingsTab === 'subtitles' ? null : 'subtitles');
                                    }}
                                    title="إعدادات الترجمة"
                                >
                                    <Settings className="w-5 h-5" />
                                </Button>

                                {/* Video Filters Button */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`transition-all ${activeSettingsTab === 'video' ? 'text-primary bg-primary/20' : 'text-white hover:bg-white/20'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveSettingsTab(activeSettingsTab === 'video' ? null : 'video');
                                    }}
                                    title="فلاتر الفيديو"
                                >
                                    <SlidersHorizontal className="w-5 h-5" />
                                </Button>

                                {/* Player Settings (Audio Track + Embedded Subs) */}
                                {(audioTracks.length > 1 || embeddedSubtitleTracks.length > 0) && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`transition-all relative ${activeSettingsTab === 'player' ? 'text-primary bg-primary/20' : 'text-white hover:bg-white/20'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveSettingsTab(activeSettingsTab === 'player' ? null : 'player');
                                        }}
                                        title="إعدادات المشغل"
                                    >
                                        <AudioLines className="w-5 h-5" />
                                        {(audioTracks.length > 1 || embeddedSubtitleTracks.length > 0) && (
                                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-500 rounded-full" />
                                        )}
                                    </Button>
                                )}


                                {/* Quality Selector (HLS) */}
                                {hlsLevels.length > 0 && (
                                    <Select
                                        value={currentQuality.toString()}
                                        onValueChange={(v) => {
                                            const idx = parseInt(v);
                                            setCurrentQuality(idx);
                                            if (hlsRef.current) hlsRef.current.currentLevel = idx;
                                        }}
                                    >
                                        <SelectTrigger className="w-24 bg-white/10 text-white border-white/20">
                                            <SelectValue placeholder="Auto" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="-1">Auto</SelectItem>
                                            {hlsLevels.map((level: any, index: number) => (
                                                <SelectItem key={index} value={index.toString()}>
                                                    {level.height}p
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {/* Subtitles */}
                                {subtitles.length > 0 && (
                                    <Select value={selectedSubtitle} onValueChange={handleSubtitleChange}>
                                        <SelectTrigger className="w-auto min-w-[8rem] bg-white/10 text-white border-white/20">
                                            <SelectValue placeholder="CC" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="off">بدون ترجمة</SelectItem>
                                            {subtitles.map((sub: any, idx: number) => (
                                                <div key={`${sub.lang}-${idx}`} className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-white/10 rounded cursor-pointer group">
                                                    <SelectItem value={sub.url} className="flex-1 border-none focus:bg-transparent pr-8">
                                                        {sub.label}
                                                    </SelectItem>

                                                    {isDeletingSubtitle === sub.url ? (
                                                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin shrink-0 ml-1"></div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => handleDeleteSubtitle(sub.url, e)}
                                                            className="text-white/30 hover:text-red-500 p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1 z-10"
                                                            title="حذف هذه الترجمة"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {/* Merge Subtitle Button */}
                                {subtitles.length > 0 && selectedSubtitle !== 'off' && (
                                    mergeStatus === 'completed' && mergeDownloadUrl ? (
                                        <a
                                            href={mergeDownloadUrl}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 transition-all text-sm font-medium"
                                            title={`تحميل الفيديو المدمج ${mergeFileSize ? `(${(mergeFileSize / 1024 / 1024).toFixed(0)} MB)` : ''}`}
                                        >
                                            <Download className="w-4 h-4" />
                                            تحميل المدمج
                                        </a>
                                    ) : mergeStatus === 'processing' ? (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            جاري الدمج {mergeProgress}%
                                        </div>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5 text-sm"
                                            onClick={() => {
                                                // Get the path of the currently selected subtitle
                                                const selectedSub = subtitles.find((s: any) => s.url === selectedSubtitle);
                                                if (selectedSub?.path) {
                                                    handleMergeSubtitle(selectedSub.path);
                                                } else if (selectedSub?.url) {
                                                    // For uploaded subtitles, extract path from URL
                                                    const urlParams = new URL(selectedSub.url, window.location.origin).searchParams;
                                                    const path = urlParams.get('path');
                                                    if (path) {
                                                        handleMergeSubtitle(path);
                                                    } else {
                                                        toast.error('لا يمكن تحديد مسار الترجمة للدمج');
                                                    }
                                                }
                                            }}
                                            title="دمج الترجمة المختارة مع الفيديو للتحميل"
                                        >
                                            <Merge className="w-4 h-4" />
                                            دمج وتحميل
                                        </Button>
                                    )
                                )}
                            </div>

                            {/* LEFT Controls (were right) - Time, Volume, Play, Episode Nav */}
                            <div className="flex items-center gap-4">
                                <span className="text-white text-sm">
                                    {formatTime(duration)} / {formatTime(currentTime)}
                                </span>

                                <div className="flex items-center gap-2">
                                    <Slider
                                        value={[volume]}
                                        max={100}
                                        step={1}
                                        onValueChange={handleVolumeChange}
                                        className="w-24"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white hover:bg-white/20"
                                        onClick={handleMuteToggle}
                                    >
                                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                    </Button>
                                </div>

                                {/* Episode Navigation (for series) */}
                                {nextEpisode && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white hover:bg-white/20"
                                        onClick={() => navigate(`/player/${nextEpisode.id}`)}
                                        title="الحلقة التالية"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </Button>
                                )}

                                {/* Skip +5s */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-white hover:bg-white/20"
                                    onClick={() => handleSkip(5)}
                                    title="تقديم 5 ثواني"
                                >
                                    <RotateCw className="w-5 h-5" />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-white hover:bg-white/20"
                                    onClick={handlePlayPause}
                                >
                                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-white" />}
                                </Button>

                                {/* Skip -5s */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-white hover:bg-white/20"
                                    onClick={() => handleSkip(-5)}
                                    title="رجوع 5 ثواني"
                                >
                                    <RotateCcw className="w-5 h-5" />
                                </Button>

                                {previousEpisode && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white hover:bg-white/20"
                                        onClick={() => navigate(`/player/${previousEpisode.id}`)}
                                        title="الحلقة السابقة"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </Button>
                                )}
                            </div>


                        </div>
                    </div>
                </div>
            </div>

            {/* AI Recommendations - YouTube-style Swipe Up Panel */}
            {recommendations.length > 0 && (
                <>
                    {/* Swipe Up Arrow Button - Always visible at bottom */}
                    <div
                        className={`fixed bottom-0 left-0 right-0 z-[60] flex justify-center transition-all duration-300 pointer-events-none ${showRecommendations ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
                    >
                        <button
                            onClick={() => setShowRecommendations(true)}
                            className="group flex flex-col items-center gap-1 py-3 px-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent hover:from-purple-900/50 transition-all duration-300 pointer-events-auto"
                        >
                            {/* Arrow Up Icon */}
                            <svg
                                className="w-8 h-8 text-white/70 group-hover:text-purple-400 transform group-hover:-translate-y-1 transition-all animate-bounce"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            <span className="text-xs text-white/60 group-hover:text-purple-300 font-medium tracking-wide">
                                {recommendations.length} توصيات
                            </span>
                        </button>
                    </div>

                    {/* Sliding Recommendations Panel */}
                    <div
                        className={`fixed inset-0 z-50 transition-all duration-500 ease-out ${showRecommendations ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setShowRecommendations(false)}
                        />

                        {/* Panel Content */}
                        <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-gradient-to-t from-zinc-900 via-zinc-900/98 to-zinc-900/90 rounded-t-3xl overflow-hidden">
                            {/* Handle Bar - Swipe Down to Close */}
                            <div
                                className="sticky top-0 z-10 flex flex-col items-center py-4 cursor-pointer bg-zinc-900/95 backdrop-blur"
                                onClick={() => setShowRecommendations(false)}
                            >
                                <div className="w-12 h-1.5 bg-zinc-600 rounded-full hover:bg-purple-400 transition-colors" />
                                <span className="text-xs text-zinc-500 mt-2">اسحب للأسفل للإغلاق</span>
                            </div>

                            {/* Header */}
                            <div className="px-6 pb-4">
                                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                    <span className="text-purple-400">✨</span>
                                    <span>شاهد المزيد</span>
                                    <span className="text-[10px] font-normal text-zinc-500 px-2 py-0.5 bg-zinc-800 rounded-full">AI</span>
                                </h2>
                            </div>

                            {/* Recommendations Grid - YouTube Style (No borders) */}
                            <div className="px-4 pb-8 overflow-y-auto max-h-[65vh]">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {[...recommendations].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)).map((rec) => (
                                        <div
                                            key={rec.tmdb_id}
                                            className="group relative cursor-pointer"
                                            onClick={() => {
                                                if (rec.in_library && rec.library_id) {
                                                    setShowRecommendations(false);
                                                    navigate(`/details/${rec.library_id}`);
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                } else {
                                                    const type = rec.type === 'series' ? 'tv' : rec.type;
                                                    window.open(`https://www.themoviedb.org/${type}/${rec.tmdb_id}`, '_blank');
                                                }
                                            }}
                                        >
                                            {/* Thumbnail - Simplified Style: Sharp corners, 1px white border, transparent bg */}
                                            <div className="relative aspect-video bg-transparent border border-white/20 overflow-hidden">
                                                {rec.poster_url || rec.backdrop_url ? (
                                                    <img
                                                        src={rec.backdrop_url || rec.poster_url}
                                                        alt={rec.title}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                )}

                                                {/* Duration Badge - Bottom Right */}
                                                {rec.runtime && (
                                                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded-sm">
                                                        {Math.floor(rec.runtime / 60)}:{(rec.runtime % 60).toString().padStart(2, '0')}
                                                    </div>
                                                )}

                                                {/* In Library Badge - Top Left (BIGGER) */}
                                                {rec.in_library && (
                                                    <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-sm uppercase tracking-wide shadow-md">
                                                        متاح
                                                    </div>
                                                )}

                                                {/* Match Percentage Badge - Top Right */}
                                                {rec.vote_average > 0 && (
                                                    <div className="absolute top-2 right-2 bg-red-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm backdrop-blur-sm">
                                                        {Math.round(rec.vote_average * 10)}% تطابق
                                                    </div>
                                                )}

                                                {/* Hover Overlay with Play Button */}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                    <div className="opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all">
                                                        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                                            <svg className="w-7 h-7 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M8 5v14l11-7z" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Title and Meta */}
                                            <div className="mt-2 px-1">
                                                <h3 className="text-white text-sm font-medium line-clamp-2 group-hover:text-purple-300 transition-colors">
                                                    {rec.title}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1 text-zinc-500 text-xs">
                                                    <span>{rec.year}</span>
                                                    {rec.vote_average && (
                                                        <span className="flex items-center gap-0.5 text-yellow-500">
                                                            ★ {rec.vote_average.toFixed(1)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
            {/* Audio Removal Confirmation Modal */}
            {audioModal?.isOpen && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-auto"
                    onClick={() => !isModifyingAudio && setAudioModal(null)}
                >
                    <div 
                        className="bg-slate-900/90 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-right rtl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                {audioModal.mode === 'keep' ? (
                                    <>
                                        <Star className="w-5 h-5 text-blue-400" /> الاحتفاظ بصوت واحد كافتراضي
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-5 h-5 text-red-400" /> حذف مسار صوتي من الملف
                                    </>
                                )}
                            </h3>
                            <button 
                                disabled={isModifyingAudio}
                                onClick={() => setAudioModal(null)}
                                className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <p className="text-white/80 text-sm leading-relaxed">
                                {audioModal.mode === 'keep' ? (
                                    <>
                                        هل أنت تأكد من الاحتفاظ بمسار الصوت <strong className="text-blue-300">{audioModal.trackLabel}</strong> فقط وحذف باقي المسارات الصوتية نهائياً من ملف الفيديو؟
                                    </>
                                ) : (
                                    <>
                                        هل أنت تأكد من حذف مسار الصوت <strong className="text-red-300">{audioModal.trackLabel}</strong> نهائياً من ملف الفيديو؟
                                    </>
                                )}
                            </p>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-start gap-2">
                                <Wand2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                                <span>
                                    تتم العملية باستخدام تقنية <strong>FFmpeg Stream Copy (بدون إعادة تشفير)</strong>، مما يعني أنها سريعة جداً وتحافظ على جودة الفيديو 100% بدون أي تراجع.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button
                                variant="ghost"
                                disabled={isModifyingAudio}
                                onClick={() => setAudioModal(null)}
                                className="text-white/70 hover:text-white"
                            >
                                إلغاء
                            </Button>
                            <Button
                                disabled={isModifyingAudio}
                                onClick={handleConfirmAudioAction}
                                className={audioModal.mode === 'keep' 
                                    ? "bg-blue-600 hover:bg-blue-700 text-white gap-2" 
                                    : "bg-red-600 hover:bg-red-700 text-white gap-2"
                                }
                            >
                                {isModifyingAudio ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> جاري تعديل ملف الفيديو...
                                    </>
                                ) : audioModal.mode === 'keep' ? (
                                    'نعم، احتفظ بهذا الصوت واجعله افتراضي'
                                ) : (
                                    'نعم، احذف المسار الصوتي'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Player;


