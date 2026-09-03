import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Settings,
  Subtitles,
  X,
  Wand2,
  AudioLines
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import Hls from 'hls.js';

interface Subtitle {
  language: string;
  languageCode: string;
  filePath: string;
}

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  title?: string;
  subtitles?: Subtitle[];
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  startTime?: number;
  className?: string;
  introStart?: number;
  introEnd?: number;
  outroStart?: number;
  nextMediaId?: number;
  nextMediaTitle?: string;
  onNextEpisode?: () => void;
  mediaId?: number;
}

const VideoPlayer = ({
  src,
  poster,
  title,
  subtitles = [],
  onProgress,
  onEnded,
  startTime = 0,
  className,
  introStart,
  introEnd,
  outroStart,
  nextMediaId,
  nextMediaTitle,
  onNextEpisode,
  mediaId,
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string | null>(null);
  const [buffered, setBuffered] = useState(0);

  const [ambientGlowEnabled, setAmbientGlowEnabled] = useState(() => localStorage.getItem('ambientGlow') === 'true');
  const ambientVideoRef = useRef<HTMLVideoElement>(null);
  const [hideNextEpisode, setHideNextEpisode] = useState(false);
  const [showXRay, setShowXRay] = useState(true);

  // Fetch X-Ray Data
  const { data: xrayData } = useQuery({
      queryKey: ['xray', mediaId],
      queryFn: () => mediaId ? apiClient.getMediaXRay(mediaId) : Promise.resolve(null),
      enabled: !!mediaId,
      refetchOnWindowFocus: false,
  });

  useEffect(() => {
    localStorage.setItem('ambientGlow', ambientGlowEnabled.toString());
  }, [ambientGlowEnabled]);

  // Sync ambient video
  useEffect(() => {
    const video = videoRef.current;
    const ambient = ambientVideoRef.current;
    if (!video || !ambient || !ambientGlowEnabled) return;

    const handlePlay = () => ambient.play().catch(() => {});
    const handlePause = () => ambient.pause();
    const handleSeek = () => { ambient.currentTime = video.currentTime; };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeek);
    video.addEventListener('seeking', handleSeek);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeek);
      video.removeEventListener('seeking', handleSeek);
    };
  }, [ambientGlowEnabled, src]);

  // Format time (seconds to MM:SS or HH:MM:SS)
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  // Handle mute
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    if (videoRef.current) {
      const newVolume = value[0];
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);

  // Handle seek
  const handleSeek = useCallback((value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  }, []);

  // Handle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(videoRef.current.duration, videoRef.current.currentTime + seconds)
      );
    }
  }, []);

  // Handle playback rate
  const handlePlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  // Mouse movement tracking for sensitivity
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  // Show controls on mouse move with sensitivity check
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const currentX = e.clientX;
    const currentY = e.clientY;

    if (!showControls) {
      // If controls are hidden, check if moved enough
      if (lastMousePos.current) {
        const deltaX = Math.abs(currentX - lastMousePos.current.x);
        const deltaY = Math.abs(currentY - lastMousePos.current.y);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance === 0) return; // Ignore synthetic events with 0 movement
        if (distance < 15) return; // Ignore micro-jitter only
      }
    } else {
      // If controls ARE visible, we still want to ignore 0-movement jitter
      // to prevent resetting the hide timer unnecessarily
      if (lastMousePos.current) {
        const deltaX = Math.abs(currentX - lastMousePos.current.x);
        const deltaY = Math.abs(currentY - lastMousePos.current.y);
        if (deltaX === 0 && deltaY === 0) return;
      }
    }

    // Update position and show controls
    lastMousePos.current = { x: currentX, y: currentY };
    setShowControls(true);

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
        // CRITICAL: Reset position so next move is calculated from scratch? 
        // No, we want to calculate from LAST VISIBLE position to CURRENT position.
        // So we KEEP lastMousePos as is.
        // But wait, if we keep it, and move 10px, distance < 200, we return.
        // Then we move another 10px. Distance from LAST VISIBLE is 20px. Correct.
        // So we DO NOT reset lastMousePos.
        // But the user says it's not working.
        // Maybe the 'distance' calc needs to be more robust?
        // Let's ensure lastMousePos is set on FIRST interaction if null.
      }, 3000);
    }
  }, [isPlaying, showControls]);

  // HLS.js initialization for .m3u8 streams
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;

    if (src.includes('.m3u8') && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startTime > 0) video.currentTime = startTime;
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data);
          hls?.destroy();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = src;
    }
    // For non-HLS sources, the video src is set directly via the src attribute

    return () => {
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };
  }, [src, startTime]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onProgress?.(video.currentTime, video.duration);
    };
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (startTime > 0) {
        video.currentTime = startTime;
      }
    };
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onProgress, onEnded, startTime]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Cleanup hide controls timer on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skip, handleVolumeChange, volume, toggleMute, toggleFullscreen]);

  const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Demo mode - show placeholder if no src
  const isDemoMode = !src;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-black aspect-video rounded-lg overflow-hidden group',
        !showControls && isPlaying && 'cursor-none',
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Ambient Video Glow */}
      {ambientGlowEnabled && !isDemoMode && src && (
        <video
          ref={ambientVideoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-cover filter blur-3xl opacity-60 scale-125 pointer-events-none -z-10 transition-opacity duration-700"
          muted
          playsInline
          aria-hidden="true"
        />
      )}

      {/* Video Element */}
      {isDemoMode ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-background z-0">
          <div className="text-center p-8">
            <Play className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-bold mb-2">وضع العرض التوضيحي</h3>
            <p className="text-muted-foreground text-sm">
              اربط الـ Backend لتشغيل الفيديو الحقيقي
            </p>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-full object-contain z-0"
          onClick={togglePlay}
          autoPlay
          playsInline
        />
      )}

      {/* Skip Intro Button */}
      {introStart != null && introEnd != null && introStart > 0 && currentTime >= introStart && currentTime < introEnd && (
        <div className="absolute bottom-28 right-8 z-40">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current) {
                videoRef.current.currentTime = introEnd;
              }
            }}
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 py-2 flex items-center gap-2 shadow-lg"
          >
            <SkipForward className="w-5 h-5" />
            تخطي المقدمة
          </Button>
        </div>
      )}

      {/* Auto-Next Episode Overlay */}
      {!hideNextEpisode && onNextEpisode && (
        ((outroStart != null && currentTime >= outroStart) || 
        (duration > 60 && duration - currentTime <= 25))
      ) && (
        <div className="absolute bottom-28 right-8 z-40 bg-black/80 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl flex flex-col gap-3 min-w-[280px] animate-in slide-in-from-right-8 duration-500">
          <h4 className="text-white font-bold text-lg">الحلقة التالية: {nextMediaTitle || 'التالية'}</h4>
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
                onNextEpisode();
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

      {/* Auto Trigger Next Episode when Countdown Hits 0 */}
      {useEffect(() => {
        if (!hideNextEpisode && onNextEpisode && duration > 0 && duration - currentTime <= 0.5) {
          onNextEpisode();
        }
      }, [currentTime, duration, hideNextEpisode, onNextEpisode])}

      {/* X-Ray Panel (Shows when paused) */}
      {!isPlaying && showXRay && xrayData && (xrayData.cast?.length > 0 || xrayData.soundtrack?.length > 0) && (
        <div className="absolute top-20 left-8 z-40 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl max-w-[600px] animate-in fade-in slide-in-from-top-4 pointer-events-auto overflow-hidden">
            <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" />
                X-Ray | طاقم العمل والمشهد 🎬
            </h3>
            {xrayData.cast?.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                    {xrayData.cast.map((actor) => (
                        <div key={actor.person_id} className="flex-none w-24 flex flex-col items-center gap-2">
                            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 border border-white/20">
                                {actor.profile_path ? (
                                    <img src={apiClient.getImageUrl(actor.profile_path)} alt={actor.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/50 text-xl font-bold">
                                        {actor.name.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div className="text-center w-full">
                                <div className="text-white text-xs font-bold truncate">{actor.name}</div>
                                <div className="text-white/60 text-[10px] truncate">{actor.character_name}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {xrayData.soundtrack?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-primary" />
                    <span className="text-white/80 text-sm">موسيقى المشهد متوفرة</span>
                </div>
            )}
        </div>
      )}

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40"
          >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
              <h3 className="text-lg font-bold truncate">{title || 'بدون عنوان'}</h3>
              <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Center Play Button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="w-20 h-20 rounded-full bg-primary/20 hover:bg-primary/30"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="w-10 h-10" />
                ) : (
                  <Play className="w-10 h-10 ml-1" />
                )}
              </Button>
            </div>

            {/* Skip Buttons */}
            <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
              <Button
                variant="ghost"
                size="icon"
                className="w-12 h-12 pointer-events-auto"
                onClick={() => skip(-10)}
              >
                <SkipBack className="w-6 h-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-12 h-12 pointer-events-auto"
                onClick={() => skip(10)}
              >
                <SkipForward className="w-6 h-6" />
              </Button>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
              {/* Progress Bar */}
              <div ref={progressRef} className="relative group/progress">
                <div className="h-1 bg-muted-foreground/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-muted-foreground/50 absolute"
                    style={{ width: `${(buffered / duration) * 100}%` }}
                  />
                  <Slider
                    value={[currentTime]}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="absolute inset-0"
                  />
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Play/Pause */}
                  <Button variant="ghost" size="icon" onClick={togglePlay}>
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </Button>

                  {/* Volume */}
                  <div className="flex items-center gap-2 group/volume">
                    <Button variant="ghost" size="icon" onClick={toggleMute}>
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-5 h-5" />
                      ) : (
                        <Volume2 className="w-5 h-5" />
                      )}
                    </Button>
                    <div className="w-0 group-hover/volume:w-20 overflow-hidden transition-all">
                      <Slider
                        value={[isMuted ? 0 : volume]}
                        max={1}
                        step={0.01}
                        onValueChange={handleVolumeChange}
                      />
                    </div>
                  </div>

                  {/* Time */}
                  <span className="text-sm tabular-nums">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                  <div className="flex items-center gap-2">
                  {/* X-Ray Toggle */}
                  <Button
                      variant="ghost"
                      size="icon"
                      className={`transition-all ${showXRay ? 'text-primary bg-primary/20' : 'text-white hover:bg-white/20'}`}
                      onClick={(e) => {
                          e.stopPropagation();
                          setShowXRay(!showXRay);
                      }}
                      title="تفعيل/إيقاف X-Ray"
                  >
                      <Wand2 className="w-5 h-5" />
                  </Button>

                  {/* Subtitles */}
                  {subtitles.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Subtitles className="w-5 h-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel>الترجمة</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSelectedSubtitle(null)}>
                          بدون ترجمة
                        </DropdownMenuItem>
                        {subtitles.map((sub) => (
                          <DropdownMenuItem
                            key={sub.languageCode}
                            onClick={() => setSelectedSubtitle(sub.languageCode)}
                          >
                            {sub.language}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {/* Settings */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Settings className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>سرعة التشغيل</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {playbackRates.map((rate) => (
                        <DropdownMenuItem
                          key={rate}
                          onClick={() => handlePlaybackRate(rate)}
                          className={playbackRate === rate ? 'bg-accent' : ''}
                        >
                          {rate}x
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.preventDefault();
                          setAmbientGlowEnabled(!ambientGlowEnabled);
                        }}
                      >
                        {ambientGlowEnabled ? 'إيقاف الإضاءة التفاعلية' : 'تفعيل الإضاءة التفاعلية (Ambient Glow)'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Fullscreen */}
                  <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                    {isFullscreen ? (
                      <Minimize className="w-5 h-5" />
                    ) : (
                      <Maximize className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoPlayer;
