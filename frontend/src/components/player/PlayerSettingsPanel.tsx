import React from 'react';
import { X, Wand2, AudioLines, Volume2, Languages, Settings as SettingsIcon, Trash2, Star, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SubtitleSettings {
    fontSize: number;
    color: string;
    textOpacity: number;
    backgroundColor: string;
    backgroundOpacity: number;
    positionY: number;
    fontFamily: string;
}

export const defaultSubtitleSettings: SubtitleSettings = {
    fontSize: 24,
    color: '#ffffff',
    textOpacity: 100,
    backgroundColor: '#000000',
    backgroundOpacity: 75,
    positionY: 10,
    fontFamily: 'Arial'
};

export const videoFilterPresets = [
    { name: 'افتراضي', values: { brightness: 100, contrast: 100, saturation: 100 } },
    { name: 'سينمائي', values: { brightness: 90, contrast: 110, saturation: 90 } },
    { name: 'بارد', values: { brightness: 95, contrast: 105, saturation: 80 } },
    { name: 'دافئ', values: { brightness: 105, contrast: 95, saturation: 110 } },
    { name: 'تباين عالي', values: { brightness: 100, contrast: 125, saturation: 105 } }
];

export type SettingsTab = 'subtitles' | 'video' | 'player' | null;

export interface PlayerSettingsPanelProps {
    activeTab: SettingsTab;
    onClose: () => void;
    setActiveTab: (tab: SettingsTab) => void;

    // Subtitle Props
    subtitleSettings: SubtitleSettings;
    setSubtitleSettings: React.Dispatch<React.SetStateAction<SubtitleSettings>>;
    customSubtitleProfiles: Record<string, SubtitleSettings>;
    newProfileName: string;
    setNewProfileName: (s: string) => void;
    saveCustomProfile: () => void;
    deleteCustomProfile: (name: string) => void;
    shiftSubtitles: (amount: number) => void;
    subtitleOffset: number;
    handleSearchSubtitles: () => void;
    isSearchingSubtitles: boolean;
    mediaId?: number;
    openSubtitlesResults: any[];
    handleDownloadSubtitle: (sub: any) => void;
    downloadingSubId: string | null;

    // Video Filter Props
    videoFilters: { brightness: number; contrast: number; saturation: number };
    setVideoFilters: (f: any) => void;
    autoEnhance: boolean;
    setAutoEnhance: (b: boolean) => void;

    // Player Settings Props
    audioTracks: any[];
    selectedAudioTrack: number;
    handleAudioTrackChange: (idx: string) => void;
    embeddedSubtitleTracks: any[];
    selectedEmbeddedSub: string;
    handleEmbeddedSubChange: (idx: string) => void;
    playbackRate: number;
    handlePlaybackRateChange: (rate: string) => void;

    // Audio Track Stripping Actions
    onRemoveAudioTrack?: (audioIdx: number, trackLabel: string) => void;
    onKeepOnlyAudioTrack?: (audioIdx: number, trackLabel: string) => void;
    isModifyingAudio?: boolean;
}

export function PlayerSettingsPanel({
    activeTab, onClose, setActiveTab,
    // Subtitles
    subtitleSettings, setSubtitleSettings, customSubtitleProfiles,
    newProfileName, setNewProfileName, saveCustomProfile, deleteCustomProfile,
    shiftSubtitles, subtitleOffset,
    handleSearchSubtitles, isSearchingSubtitles, mediaId, openSubtitlesResults,
    handleDownloadSubtitle, downloadingSubId,
    // Video
    videoFilters, setVideoFilters, autoEnhance, setAutoEnhance,
    // Audio & Embedded
    audioTracks, selectedAudioTrack, handleAudioTrackChange,
    embeddedSubtitleTracks, selectedEmbeddedSub, handleEmbeddedSubChange,
    playbackRate, handlePlaybackRateChange,
    onRemoveAudioTrack, onKeepOnlyAudioTrack, isModifyingAudio
}: PlayerSettingsPanelProps) {

    if (!activeTab) return null;

    return (
        <div 
            className="absolute inset-y-0 right-0 z-50 pointer-events-auto flex animate-in slide-in-from-right-8 fade-in duration-500 ease-out" 
            onClick={(e) => e.stopPropagation()}
        >
            {/* Tabs Sidebar */}
            <div className="h-full bg-black/40 backdrop-blur-[40px] border-l border-white/10 w-16 flex flex-col items-center py-6 gap-6 shadow-[-10px_0_40px_rgba(0,0,0,0.5)] z-10 relative">
                <button 
                    onClick={() => setActiveTab('subtitles')}
                    className={`relative p-3 rounded-xl transition-all duration-300 ${activeTab === 'subtitles' ? 'bg-gradient-to-tr from-primary/80 to-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] ring-1 ring-white/20 scale-105' : 'text-white/50 hover:bg-white/10 hover:text-white hover:scale-105'}`}
                    title="إعدادات الترجمة"
                >
                    <Languages className="w-6 h-6" />
                </button>
                <button 
                    onClick={() => setActiveTab('video')}
                    className={`relative p-3 rounded-xl transition-all duration-300 ${activeTab === 'video' ? 'bg-gradient-to-tr from-primary/80 to-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] ring-1 ring-white/20 scale-105' : 'text-white/50 hover:bg-white/10 hover:text-white hover:scale-105'}`}
                    title="فلاتر الفيديو"
                >
                    <Wand2 className="w-6 h-6" />
                </button>
                <button 
                    onClick={() => setActiveTab('player')}
                    className={`relative p-3 rounded-xl transition-all duration-300 ${activeTab === 'player' ? 'bg-gradient-to-tr from-primary/80 to-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] ring-1 ring-white/20 scale-105' : 'text-white/50 hover:bg-white/10 hover:text-white hover:scale-105'}`}
                    title="إعدادات المشغل"
                >
                    <AudioLines className="w-6 h-6" />
                </button>
                
                <div className="mt-auto">
                    <button 
                        onClick={onClose}
                        className="p-3 rounded-xl text-white/50 hover:bg-red-500/20 hover:text-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:scale-105 transition-all duration-300"
                        title="إغلاق"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="h-full bg-black/30 backdrop-blur-[50px] p-6 shadow-[inset_1px_0_0_rgba(255,255,255,0.05),_0_0_50px_rgba(0,0,0,0.8)] w-80 overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2 drop-shadow-md">
                        {activeTab === 'subtitles' && <><Languages className="w-5 h-5 text-primary" /> إعدادات الترجمة</>}
                        {activeTab === 'video' && <><Wand2 className="w-5 h-5 text-primary" /> فلاتر الفيديو</>}
                        {activeTab === 'player' && <><AudioLines className="w-5 h-5 text-purple-400" /> إعدادات المشغل</>}
                    </h3>
                </div>

                {/* --- SUBTITLES TAB --- */}
                {activeTab === 'subtitles' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Subtitle Profiles */}
                        <div>
                            <label className="text-white/80 text-sm mb-2 block font-semibold flex items-center gap-2">
                                <Wand2 className="w-4 h-4 text-primary" />
                                قوالب ذكية (البروفايلات)
                            </label>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <Button
                                    variant="outline" size="sm"
                                    className="bg-[#E50914]/10 border-[#E50914]/50 hover:bg-[#E50914]/20 hover:shadow-[0_0_15px_rgba(229,9,20,0.3)] text-white justify-start text-xs transition-all backdrop-blur-sm rounded-lg"
                                    onClick={() => setSubtitleSettings({
                                        ...subtitleSettings, fontSize: 24, color: '#ffffff', backgroundColor: '#000000',
                                        backgroundOpacity: 0, fontFamily: 'Arial', positionY: 10, textOpacity: 100
                                    })}
                                >🎬 ستايل Netflix</Button>
                                <Button
                                    variant="outline" size="sm"
                                    className="bg-yellow-500/10 border-yellow-500/50 hover:bg-yellow-500/20 hover:shadow-[0_0_15px_rgba(234,179,8,0.3)] text-white justify-start text-xs transition-all backdrop-blur-sm rounded-lg"
                                    onClick={() => setSubtitleSettings({
                                        ...subtitleSettings, fontSize: 26, color: '#ffff00', backgroundColor: '#000000',
                                        backgroundOpacity: 60, fontFamily: 'Tahoma', positionY: 8, textOpacity: 100
                                    })}
                                >🍿 ستايل السينما</Button>
                                <Button
                                    variant="outline" size="sm"
                                    className="bg-white/5 border-white/20 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white justify-start text-xs transition-all backdrop-blur-sm rounded-lg"
                                    onClick={() => setSubtitleSettings({
                                        ...subtitleSettings, fontSize: 22, color: '#ffffff', backgroundColor: '#000000',
                                        backgroundOpacity: 100, fontFamily: 'Arial', positionY: 12, textOpacity: 100
                                    })}
                                >📺 ستايل كلاسيك</Button>
                                <Button
                                    variant="outline" size="sm"
                                    className="bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] text-white justify-start text-xs transition-all backdrop-blur-sm rounded-lg"
                                    onClick={() => setSubtitleSettings(defaultSubtitleSettings)}
                                >⚙️ الافتراضي</Button>
                            </div>

                            {/* Custom User Profiles */}
                            <div className="mt-4 pt-4 border-t border-white/20">
                                <label className="text-white/80 text-sm mb-2 block font-semibold">قوالبي الخاصة</label>
                                <div className="flex gap-2 mb-3">
                                    <input
                                        type="text" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)}
                                        placeholder="اسم البروفايل الجديد..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all backdrop-blur-sm"
                                    />
                                    <Button size="sm" onClick={saveCustomProfile} className="shrink-0 bg-primary/90 hover:bg-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]">حفظ</Button>
                                </div>
                                {customSubtitleProfiles.length > 0 ? (
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                        {customSubtitleProfiles.map((profile, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/5 border border-white/10 p-2 rounded-lg backdrop-blur-sm hover:bg-white/10 hover:shadow-md transition-all duration-300">
                                                <button
                                                    className="flex-1 text-right text-sm text-white font-medium focus:outline-none truncate"
                                                    onClick={() => setSubtitleSettings(profile.settings)}
                                                >{profile.name}</button>
                                                <button onClick={() => deleteCustomProfile(idx)} className="text-white/50 hover:text-red-500 p-1 shrink-0 transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-center text-white/40 py-3 bg-white/5 border border-dashed border-white/20 rounded-lg backdrop-blur-sm">
                                        لا توجد قوالب محفوظة، قم بضبط إعداداتك ثم احفظها.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Font Size & Position */}
                        <div className="space-y-4 pt-4 border-t border-white/20">
                            <div>
                                <label className="text-white/80 text-sm mb-2 block">حجم الخط: {subtitleSettings.fontSize}px</label>
                                <Slider
                                    value={[subtitleSettings.fontSize]} min={16} max={100} step={1}
                                    onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, fontSize: v[0] })}
                                />
                            </div>
                            <div>
                                <label className="text-white/80 text-sm mb-2 block">موضع الترجمة: {subtitleSettings.positionY}%</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-white/50 text-xs">أسفل</span>
                                    <Slider
                                        value={[subtitleSettings.positionY]} min={0} max={100} step={1}
                                        onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, positionY: v[0] })}
                                    />
                                    <span className="text-white/50 text-xs">أعلى</span>
                                </div>
                            </div>
                        </div>

                        {/* Colors */}
                        <div className="space-y-4 pt-4 border-t border-white/20">
                            <div>
                                <label className="text-white/80 text-sm mb-2 block">لون النص</label>
                                <div className="flex gap-2 flex-wrap mb-3">
                                    {['#ffffff', '#ffff00', '#00ff00', '#00ffff', '#ff6600', '#ff0000', '#ff00ff'].map(c => (
                                        <button
                                            key={c}
                                            className={`w-8 h-8 rounded-full border-2 transition-all ${subtitleSettings.color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/50'}`}
                                            style={{ backgroundColor: c }}
                                            onClick={() => setSubtitleSettings({ ...subtitleSettings, color: c })}
                                        />
                                    ))}
                                    <input
                                        type="color" value={subtitleSettings.color}
                                        onChange={(e) => setSubtitleSettings({ ...subtitleSettings, color: e.target.value })}
                                        className="w-8 h-8 rounded cursor-pointer border-0"
                                    />
                                </div>
                                <label className="text-white/80 text-xs mb-2 block">شفافية النص: {subtitleSettings.textOpacity}%</label>
                                <Slider
                                    value={[subtitleSettings.textOpacity]} min={0} max={100} step={5}
                                    onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, textOpacity: v[0] })}
                                />
                            </div>
                            <div>
                                <label className="text-white/80 text-sm mb-2 block">لون الخلفية</label>
                                <div className="flex gap-2 mb-3">
                                    {['#000000', '#1a1a1a', '#333333', '#0a0a0a'].map(c => (
                                        <button
                                            key={c}
                                            className={`w-8 h-8 rounded border-2 ${subtitleSettings.backgroundColor === c ? 'border-white' : 'border-white/30'}`}
                                            style={{ backgroundColor: c }}
                                            onClick={() => setSubtitleSettings({ ...subtitleSettings, backgroundColor: c })}
                                        />
                                    ))}
                                </div>
                                <label className="text-white/80 text-sm mb-2 block">شفافية الخلفية: {subtitleSettings.backgroundOpacity}%</label>
                                <Slider
                                    value={[subtitleSettings.backgroundOpacity]} min={0} max={100} step={5}
                                    onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, backgroundOpacity: v[0] })}
                                />
                            </div>
                        </div>

                        {/* Font & Sync */}
                        <div className="space-y-4 pt-4 border-t border-white/20">
                            <div>
                                <label className="text-white/80 text-sm mb-2 block">نوع الخط</label>
                                <Select value={subtitleSettings.fontFamily} onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, fontFamily: v })}>
                                    <SelectTrigger className="bg-white/10 text-white border-white/20">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Arial">Arial</SelectItem>
                                        <SelectItem value="Tahoma">Tahoma</SelectItem>
                                        <SelectItem value="Verdana">Verdana</SelectItem>
                                        <SelectItem value="Georgia">Georgia</SelectItem>
                                        <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-white/80 text-sm mb-2 block font-semibold">مزامنة الترجمة</label>
                                <div className="flex items-center justify-between bg-white/5 border border-white/10 p-2 rounded-lg backdrop-blur-sm">
                                    <Button variant="ghost" size="sm" onClick={() => shiftSubtitles(-0.5)} className="text-white hover:bg-white/20">-0.5s</Button>
                                    <span className="text-white font-mono">{subtitleOffset > 0 ? '+' : ''}{subtitleOffset}s</span>
                                    <Button variant="ghost" size="sm" onClick={() => shiftSubtitles(0.5)} className="text-white hover:bg-white/20">+0.5s</Button>
                                </div>
                            </div>
                        </div>

                        {/* Live Preview */}
                        <div className="mt-4 p-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 shadow-inner">
                            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2 text-center">معاينة مباشرة</div>
                            <div
                                className="text-center py-2 px-4 rounded transition-all duration-300"
                                style={{
                                    fontSize: `${subtitleSettings.fontSize * 0.6}px`,
                                    color: `rgba(${parseInt(subtitleSettings.color.slice(1, 3), 16)}, ${parseInt(subtitleSettings.color.slice(3, 5), 16)}, ${parseInt(subtitleSettings.color.slice(5, 7), 16)}, ${subtitleSettings.textOpacity / 100})`,
                                    backgroundColor: `${subtitleSettings.backgroundColor}${Math.round(subtitleSettings.backgroundOpacity * 2.55).toString(16).padStart(2, '0')}`,
                                    fontFamily: subtitleSettings.fontFamily
                                }}
                            >
                                معاينة الترجمة الذكية
                            </div>
                        </div>

                        {/* OpenSubtitles */}
                        <div className="mt-4 pt-4 border-t border-white/20">
                            <label className="text-white/80 text-sm mb-2 block font-semibold">🌐 تحميل ترجمات</label>
                            <Button
                                variant="outline" className="w-full text-white border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] mb-2"
                                onClick={handleSearchSubtitles} disabled={isSearchingSubtitles || !mediaId}
                            >
                                {isSearchingSubtitles ? 'جاري البحث...' : 'بحث OpenSubtitles'}
                            </Button>
                            {openSubtitlesResults.length > 0 && (
                                <div className="max-h-60 overflow-y-auto space-y-2 mt-2 pr-1 custom-scrollbar">
                                    {openSubtitlesResults.slice(0, 15).map((sub: any) => (
                                        <div key={sub.file_id} className="bg-white/5 rounded-lg p-3 text-left backdrop-blur-sm border border-transparent transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-lg">
                                            <div className="flex justify-between items-start gap-3 mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-white text-sm font-medium break-words leading-tight" title={sub.filename}>{sub.release || sub.filename}</div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                                                        {sub.language === 'ar' ? '🇪🇬 Arabic' : sub.language === 'en' ? '🇺🇸 English' : sub.language?.toUpperCase()}
                                                    </span>
                                                    <span className="text-xs text-white/40">{sub.downloads} ⬇️</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-white/50">
                                                <div className="flex gap-2">
                                                    {sub.hearing_impaired && <span title="Hearing Impaired">👂</span>}
                                                    {sub.fps && <span>FPS: {sub.fps}</span>}
                                                    <span>★ {sub.rating}</span>
                                                </div>
                                                <Button
                                                    size="sm" variant="secondary" className="h-7 px-3 text-xs bg-white/10 hover:bg-green-500/20 hover:text-green-400 transition-all duration-300 hover:shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                                                    onClick={() => handleDownloadSubtitle(sub.file_id, sub.language)} disabled={downloadingSubId === sub.file_id}
                                                >
                                                    {downloadingSubId === sub.file_id ? 'جاري التحميل...' : 'تحميل الآن'}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Button variant="outline" className="w-full mt-2 text-white border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]" onClick={() => setSubtitleSettings(defaultSubtitleSettings)}>إعادة الضبط</Button>
                    </div>
                )}

                {/* --- VIDEO TAB --- */}
                {activeTab === 'video' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
                            <div className="flex flex-col">
                                <span className="text-white text-sm font-bold">التحسين التلقائي</span>
                                <span className="text-white/40 text-[10px]">ضبط ذكي للألوان والتباين</span>
                            </div>
                            <button
                                onClick={() => setAutoEnhance(!autoEnhance)}
                                className={`w-12 h-6 rounded-full transition-all duration-300 relative ${autoEnhance ? 'bg-primary' : 'bg-white/20'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${autoEnhance ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div>
                            <label className="text-white/80 text-sm font-semibold mb-3 block">الأنماط الجاهزة</label>
                            <div className="grid grid-cols-2 gap-2">
                                {videoFilterPresets.map((preset) => (
                                    <Button
                                        key={preset.name} variant="outline" size="sm"
                                        onClick={() => setVideoFilters(preset.values)}
                                        className="border-white/20 hover:bg-white/10 text-xs px-2 h-8"
                                    >{preset.name}</Button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/20 space-y-4">
                            <label className="text-white/80 text-sm font-semibold flex justify-between">
                                <span>إعدادات يدوية</span>
                                <button onClick={() => setVideoFilters({ brightness: 100, contrast: 100, saturation: 100 })} className="text-xs text-primary hover:underline">إعادة ضبط</button>
                            </label>
                            <div>
                                <div className="flex justify-between text-xs text-white/50 mb-1"><span>السطوع</span><span>{videoFilters.brightness}%</span></div>
                                <Slider value={[videoFilters.brightness]} min={50} max={150} step={5} onValueChange={(v) => setVideoFilters(prev => ({ ...prev, brightness: v[0] }))} />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/50 mb-1"><span>التباين</span><span>{videoFilters.contrast}%</span></div>
                                <Slider value={[videoFilters.contrast]} min={50} max={150} step={5} onValueChange={(v) => setVideoFilters(prev => ({ ...prev, contrast: v[0] }))} />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/50 mb-1"><span>التشبع</span><span>{videoFilters.saturation}%</span></div>
                                <Slider value={[videoFilters.saturation]} min={0} max={200} step={5} onValueChange={(v) => setVideoFilters(prev => ({ ...prev, saturation: v[0] }))} />
                            </div>
                        </div>
                    </div>
                )}

                {/* --- PLAYER TAB --- */}
                {activeTab === 'player' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Audio Tracks */}
                        {audioTracks.length > 0 && (
                            <div>
                                <label className="text-white/80 text-sm font-semibold mb-3 flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <Volume2 className="w-4 h-4 text-blue-400" /> مسارات الصوت ({audioTracks.length})
                                    </span>
                                </label>
                                <div className="space-y-2">
                                    {audioTracks.map((track, idx) => (
                                        <div key={track.index || idx} className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => handleAudioTrackChange(String(idx))}
                                                className={`flex-1 text-right px-3 py-2.5 rounded-lg border transition-all duration-200 text-sm flex items-center justify-between gap-2 ${
                                                    selectedAudioTrack === idx ? 'bg-blue-500/20 border-blue-500/50 text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    {selectedAudioTrack === idx && <div className="w-2 h-2 bg-blue-400 rounded-full shrink-0 animate-pulse" />}
                                                    <span className="truncate">{track.label}</span>
                                                </div>
                                                {track.is_default && <span className="text-[10px] text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded shrink-0">افتراضي</span>}
                                            </button>

                                            {audioTracks.length > 1 && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {onKeepOnlyAudioTrack && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onKeepOnlyAudioTrack(idx, track.label);
                                                            }}
                                                            disabled={isModifyingAudio}
                                                            title="الاحتفاظ بهذا الصوت فقط كافتراضي وحذف باقي الأصوات من الملف"
                                                            className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/30 hover:border-blue-500/40 text-blue-400 transition-all duration-200 disabled:opacity-50"
                                                        >
                                                            <Star className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {onRemoveAudioTrack && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onRemoveAudioTrack(idx, track.label);
                                                            }}
                                                            disabled={isModifyingAudio}
                                                            title="حذف هذا المسار الصوتي نهائياً من ملف الفيديو"
                                                            className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/30 hover:border-red-500/40 text-red-400 transition-all duration-200 disabled:opacity-50"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {audioTracks.length > 0 && embeddedSubtitleTracks.length > 0 && <div className="border-t border-white/10" />}

                        {/* Embedded Subtitle Tracks */}
                        {embeddedSubtitleTracks.length > 0 && (
                            <div>
                                <label className="text-white/80 text-sm font-semibold mb-3 block flex items-center gap-2">
                                    <Languages className="w-4 h-4 text-green-400" /> ترجمات مدمجة ({embeddedSubtitleTracks.length})
                                </label>
                                <div className="space-y-1.5">
                                    <button
                                        onClick={() => handleEmbeddedSubChange('off')}
                                        className={`w-full text-right px-3 py-2.5 rounded-lg border transition-all duration-200 text-sm flex items-center gap-2 ${
                                            selectedEmbeddedSub === 'off' ? 'bg-red-500/20 border-red-500/50 text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {selectedEmbeddedSub === 'off' && <div className="w-2 h-2 bg-red-400 rounded-full shrink-0" />} بدون ترجمة مدمجة
                                    </button>
                                    {embeddedSubtitleTracks.map((track, idx) => (
                                        <button
                                            key={track.index} onClick={() => handleEmbeddedSubChange(String(idx))}
                                            className={`w-full text-right px-3 py-2.5 rounded-lg border transition-all duration-200 text-sm flex items-center justify-between gap-2 ${
                                                selectedEmbeddedSub === String(idx) ? 'bg-green-500/20 border-green-500/50 text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {selectedEmbeddedSub === String(idx) && <div className="w-2 h-2 bg-green-400 rounded-full shrink-0 animate-pulse" />}
                                                <span className="truncate">{track.label}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {track.is_default && <span className="text-[10px] text-green-300 bg-green-500/20 px-1.5 py-0.5 rounded">افتراضي</span>}
                                                {track.is_forced && <span className="text-[10px] text-yellow-300 bg-yellow-500/20 px-1.5 py-0.5 rounded">إجباري</span>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="border-t border-white/10 pt-4">
                            <label className="text-white/80 text-sm font-semibold mb-3 block flex items-center gap-2">
                                <SettingsIcon className="w-4 h-4 text-orange-400" /> سرعة التشغيل
                            </label>
                            <div className="grid grid-cols-4 gap-1.5">
                                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((rate) => (
                                    <button
                                        key={rate} onClick={() => handlePlaybackRateChange(rate.toString())}
                                        className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                            playbackRate === rate ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {rate}x
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
