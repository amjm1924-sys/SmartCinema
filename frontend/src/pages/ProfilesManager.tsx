import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Plus, Trash2, Wifi, X, UserPlus, Palette, Check, MonitorSmartphone, Camera, ImageOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '@/components/layout/Header';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// Stable cache-bust token per page load — prevents avatar re-fetch on every render
const AVATAR_SESSION_TOKEN = Date.now();

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6d28d9', '#475569', '#0f172a',
];

// Avatar component with image support
const ProfileAvatar = ({
  profile,
  size = 'md',
  onClick,
  editable = false,
  onUpload,
  onRemoveAvatar,
}: {
  profile: any;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  editable?: boolean;
  onUpload?: (file: File) => void;
  onRemoveAvatar?: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-20 h-20 text-2xl',
  };
  const cls = sizeClasses[size];

  const initials = profile.name
    ?.split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2) || '?';

  const hasAvatar = profile.avatar_url && profile.avatar_url.length > 0 && !imgError;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      onUpload(file);
    }
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="relative group/avatar inline-block">
      {hasAvatar ? (
        <img
          src={`${apiClient.getAvatarUrl(profile.id)}?t=${AVATAR_SESSION_TOKEN}_${avatarVersion ?? 0}`}
          alt={profile.name}
          className={`${cls} rounded-full object-cover shadow-lg cursor-pointer hover:scale-110 transition-transform`}
          onClick={onClick}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`${cls} rounded-full flex items-center justify-center text-white font-bold shadow-lg cursor-pointer hover:scale-110 transition-transform`}
          style={{ backgroundColor: profile.avatar_color || '#6366f1' }}
          onClick={onClick}
        >
          {initials}
        </div>
      )}
      {editable && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="p-1 text-white hover:text-primary transition-colors"
              title="رفع صورة"
            >
              <Camera className="w-4 h-4" />
            </button>
            {hasAvatar && onRemoveAvatar && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveAvatar(); }}
                className="p-1 text-white hover:text-destructive transition-colors"
                title="حذف الصورة"
              >
                <ImageOff className="w-4 h-4" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ProfilesManager = () => {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showIpDialog, setShowIpDialog] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newIp, setNewIp] = useState('');
  const [newAudioLang, setNewAudioLang] = useState('auto');
  const [newSubLang, setNewSubLang] = useState('off');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editAudioLang, setEditAudioLang] = useState('auto');
  const [editSubLang, setEditSubLang] = useState('off');

  // Fetch profiles
  const { data: profiles = [], isLoading } = useQuery<any[]>({
    queryKey: ['profiles'],
    queryFn: () => apiClient.getProfiles(),
  });

  // Fetch current profile
  const { data: currentProfile } = useQuery({
    queryKey: ['currentProfile'],
    queryFn: () => apiClient.getCurrentProfile(),
  });

  // Create profile
  const createMutation = useMutation({
    mutationFn: ({ name, avatar_color, default_audio_lang, default_sub_lang }: { name: string; avatar_color: string; default_audio_lang: string; default_sub_lang: string }) =>
      apiClient.createProfile(name, avatar_color, default_audio_lang, default_sub_lang),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setShowCreateDialog(false);
      setNewName('');
      setNewColor('#6366f1');
      setNewAudioLang('auto');
      setNewSubLang('off');
      toast.success('تم إنشاء البروفايل بنجاح');
    },
  });

  // Update profile
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.updateProfile(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      setEditingId(null);
      toast.success('تم تحديث البروفايل');
    },
  });

  // Delete profile
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      toast.success('تم حذف البروفايل');
    },
  });

  // Upload avatar
  const uploadAvatarMutation = useMutation({
    mutationFn: ({ profileId, file }: { profileId: number; file: File }) =>
      apiClient.uploadAvatar(profileId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      toast.success('تم رفع الصورة بنجاح');
    },
    onError: () => {
      toast.error('فشل رفع الصورة');
    },
  });

  // Delete avatar
  const deleteAvatarMutation = useMutation({
    mutationFn: (profileId: number) => apiClient.deleteAvatar(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      toast.success('تم حذف الصورة');
    },
  });

  // Assign IP
  const assignIpMutation = useMutation({
    mutationFn: ({ profileId, ip }: { profileId: number; ip: string }) =>
      apiClient.assignIpToProfile(profileId, ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      setNewIp('');
      toast.success('تم ربط عنوان IP');
    },
  });

  // Remove IP
  const removeIpMutation = useMutation({
    mutationFn: ({ profileId, ip }: { profileId: number; ip: string }) =>
      apiClient.removeIpFromProfile(profileId, ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      toast.success('تم إزالة عنوان IP');
    },
  });

  // Assign current device IP
  const assignCurrentMutation = useMutation({
    mutationFn: (profileId: number) => apiClient.assignCurrentIp(profileId),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['currentProfile'] });
      toast.success(`تم ربط الجهاز الحالي (${data.ip})`);
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 mt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">البروفايلات</h1>
            <p className="text-muted-foreground">
              كل بروفايل ليه سجل مشاهدات ومفضلة مستقلين
            </p>
            {currentProfile && (
              <p className="text-sm mt-1">
                <span className="text-muted-foreground">الجهاز الحالي: </span>
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{currentProfile.current_ip}</code>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium" style={{ color: currentProfile.avatar_color }}>
                  {currentProfile.name}
                </span>
              </p>
            )}
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            بروفايل جديد
          </Button>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary" />
          </div>
        ) : (
          /* Profiles Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {profiles.map((profile: any, index: number) => (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative group"
                >
                  <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                    {/* Profile Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {editingId === profile.id ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <ProfileAvatar
                                profile={{ ...profile, avatar_color: editColor }}
                                size="md"
                                editable
                                onUpload={(file) => uploadAvatarMutation.mutate({ profileId: profile.id, file })}
                                onRemoveAvatar={() => deleteAvatarMutation.mutate(profile.id)}
                              />
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-40"
                                autoFocus
                              />
                            </div>
                            {/* Color picker */}
                            <div className="flex flex-wrap gap-1.5">
                              {AVATAR_COLORS.map((color) => (
                                <button
                                  key={color}
                                  onClick={() => setEditColor(color)}
                                  className="w-5 h-5 rounded-full transition-transform hover:scale-125 ring-offset-2 ring-offset-background"
                                  style={{
                                    backgroundColor: color,
                                    boxShadow: editColor === color ? `0 0 0 2px ${color}` : 'none',
                                  }}
                                />
                              ))}
                            </div>
                            <div className="flex flex-col gap-2 w-full mt-2">
                              <Select value={editAudioLang} onValueChange={setEditAudioLang}>
                                <SelectTrigger className="w-full text-xs">
                                  <SelectValue placeholder="لغة الصوت المفضلة" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">الصوت الأصلي (Auto)</SelectItem>
                                  <SelectItem value="ara">العربية (Arabic)</SelectItem>
                                  <SelectItem value="eng">الإنجليزية (English)</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select value={editSubLang} onValueChange={setEditSubLang}>
                                <SelectTrigger className="w-full text-xs">
                                  <SelectValue placeholder="لغة الترجمة المفضلة" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="off">إيقاف (Off)</SelectItem>
                                  <SelectItem value="ara">العربية (Arabic)</SelectItem>
                                  <SelectItem value="eng">الإنجليزية (English)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => updateMutation.mutate({
                                  id: profile.id,
                                  data: { name: editName, avatar_color: editColor, default_audio_lang: editAudioLang, default_sub_lang: editSubLang },
                                })}
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <ProfileAvatar
                              profile={profile}
                              size="md"
                              editable
                              onClick={() => {
                                setEditingId(profile.id);
                                setEditName(profile.name);
                                setEditColor(profile.avatar_color || '#6366f1');
                                setEditAudioLang(profile.default_audio_lang || 'auto');
                                setEditSubLang(profile.default_sub_lang || 'off');
                              }}
                              onUpload={(file) => uploadAvatarMutation.mutate({ profileId: profile.id, file })}
                              onRemoveAvatar={() => deleteAvatarMutation.mutate(profile.id)}
                            />
                            <div>
                              <h3
                                className="text-lg font-bold cursor-pointer hover:text-primary transition-colors"
                                onClick={() => {
                                  setEditingId(profile.id);
                                  setEditName(profile.name);
                                  setEditColor(profile.avatar_color || '#6366f1');
                                  setEditAudioLang(profile.default_audio_lang || 'auto');
                                  setEditSubLang(profile.default_sub_lang || 'off');
                                }}
                              >
                                {profile.name}
                                {profile.id === 1 && (
                                  <span className="text-xs text-muted-foreground font-normal mr-2">(افتراضي)</span>
                                )}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {profile.ips?.length || 0} جهاز مرتبط
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Delete Button (not for default profile) */}
                      {profile.id !== 1 && editingId !== profile.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`هل تريد حذف بروفايل "${profile.name}"؟`)) {
                              deleteMutation.mutate(profile.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {/* Assigned IPs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                          <Wifi className="w-3.5 h-3.5" />
                          الأجهزة المرتبطة
                        </h4>
                      </div>

                      {profile.ips && profile.ips.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.ips.map((ip: string) => (
                            <div
                              key={ip}
                              className="flex items-center gap-1.5 bg-muted/60 border border-border/50 rounded-lg px-3 py-1.5 text-sm group/ip"
                            >
                              <MonitorSmartphone className="w-3.5 h-3.5 text-muted-foreground" />
                              <code className="text-xs">{ip}</code>
                              {currentProfile?.current_ip === ip && (
                                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" title="هذا الجهاز" />
                              )}
                              <button
                                onClick={() => removeIpMutation.mutate({ profileId: profile.id, ip })}
                                className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover/ip:opacity-100"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 italic">
                          {profile.id === 1
                            ? 'جميع الأجهزة الغير مرتبطة تستخدم هذا البروفايل'
                            : 'لا توجد أجهزة مرتبطة'}
                        </p>
                      )}

                      {/* Add IP / Assign Current Device buttons */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => setShowIpDialog(profile.id)}
                        >
                          <Plus className="w-3 h-3" />
                          إضافة IP
                        </Button>
                        {profile.id !== 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => assignCurrentMutation.mutate(profile.id)}
                          >
                            <MonitorSmartphone className="w-3 h-3" />
                            ربط هذا الجهاز
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Create Profile Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إنشاء بروفايل جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Preview */}
              <div className="flex justify-center">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl transition-colors duration-300"
                  style={{ backgroundColor: newColor }}
                >
                  {newName ? newName.split(' ').map(w => w[0]).join('').slice(0, 2) : '?'}
                </div>
              </div>

              {/* Name */}
              <Input
                placeholder="اسم البروفايل (مثال: مصطفى)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-center text-lg"
                autoFocus
              />

              {/* Color Grid */}
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Palette className="w-3.5 h-3.5" />
                  لون الأفاتار
                </label>
                <div className="flex flex-wrap gap-2 justify-center">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className="w-8 h-8 rounded-full transition-all duration-200 hover:scale-125"
                      style={{
                        backgroundColor: color,
                        boxShadow: newColor === color ? `0 0 0 3px var(--background), 0 0 0 5px ${color}` : 'none',
                        transform: newColor === color ? 'scale(1.2)' : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 mt-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">لغة الصوت المفضلة</label>
                  <Select value={newAudioLang} onValueChange={setNewAudioLang}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر لغة الصوت" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">الصوت الأصلي (Auto)</SelectItem>
                      <SelectItem value="ara">العربية (Arabic)</SelectItem>
                      <SelectItem value="eng">الإنجليزية (English)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">لغة الترجمة المفضلة</label>
                  <Select value={newSubLang} onValueChange={setNewSubLang}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر لغة الترجمة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">إيقاف (Off)</SelectItem>
                      <SelectItem value="ara">العربية (Arabic)</SelectItem>
                      <SelectItem value="eng">الإنجليزية (English)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-4">
                يمكنك رفع صورة شخصية بعد إنشاء البروفايل
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
              <Button
                onClick={() => createMutation.mutate({ name: newName, avatar_color: newColor, default_audio_lang: newAudioLang, default_sub_lang: newSubLang })}
                disabled={!newName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add IP Dialog */}
        <Dialog open={showIpDialog !== null} onOpenChange={() => setShowIpDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>إضافة عنوان IP</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Input
                placeholder="مثال: 192.168.1.7"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                dir="ltr"
                className="text-center font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center">
                أدخل عنوان IP الخاص بالجهاز اللي عايز تربطه بالبروفايل
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setShowIpDialog(null); setNewIp(''); }}>
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (showIpDialog && newIp.trim()) {
                    assignIpMutation.mutate({ profileId: showIpDialog, ip: newIp.trim() });
                    setShowIpDialog(null);
                  }
                }}
                disabled={!newIp.trim()}
              >
                ربط
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ProfilesManager;
