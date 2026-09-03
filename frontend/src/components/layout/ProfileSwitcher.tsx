import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Users, LogOut, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRef } from 'react';

// Stable cache-bust token per page load — prevents 50+ GET requests/second
// that occurred when Date.now() was called inline inside JSX render
const AVATAR_SESSION_TOKEN = Date.now();

const ProfileAvatar = ({ profile, avatarVersion = 0, size = 'md' }: { profile: any, avatarVersion?: number, size?: 'sm' | 'md' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
  };
  const cls = sizeClasses[size];
  
  const initials = profile.name
    ?.split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2) || '?';

  const hasAvatar = profile.avatar_url && profile.avatar_url.length > 0;

  return (
    <div className="relative">
      {hasAvatar ? (
        <img
          src={`${apiClient.getAvatarUrl(profile.id)}?t=${AVATAR_SESSION_TOKEN}_${avatarVersion}`}
          alt={profile.name}
          className={`${cls} rounded-full object-cover shadow-md`}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div
        className={`${cls} rounded-full flex items-center justify-center text-white font-bold shadow-md ${hasAvatar ? 'hidden' : ''}`}
        style={{ backgroundColor: profile.avatar_color || '#6366f1' }}
      >
        {initials}
      </div>
    </div>
  );
};

const ProfileSwitcher = () => {
  const navigate = useNavigate();
  
  const { data: currentProfile } = useQuery({
    queryKey: ['currentProfile'],
    queryFn: () => apiClient.getCurrentProfile(),
    staleTime: 30000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => apiClient.getProfiles(),
    staleTime: 60000,
  });

  if (!currentProfile) return null;

  const handleSelectProfile = (id: number) => {
    apiClient.setProfileId(id);
    // Reload happens automatically in api.ts setProfileId
  };

  const handleResetProfile = () => {
    apiClient.setProfileId(null);
    // Reload happens automatically in api.ts setProfileId
  };

  const isManualOverride = apiClient.getProfileId() !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-accent transition-colors outline-none ring-0">
          <ProfileAvatar profile={currentProfile} size="md" />
          <span className="hidden lg:block text-sm font-medium max-w-[80px] truncate">
            {currentProfile.name}
          </span>
          {isManualOverride && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{currentProfile.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {isManualOverride ? 'تم التحديد يدوياً' : `معتمد على IP: ${currentProfile.current_ip || 'غير معروف'}`}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Profile List */}
        <div className="max-h-48 overflow-y-auto">
          {profiles.map((profile: any) => (
            <DropdownMenuItem
              key={profile.id}
              className={`flex items-center gap-2 cursor-pointer ${currentProfile.id === profile.id ? 'bg-accent' : ''}`}
              onClick={() => handleSelectProfile(profile.id)}
            >
              <ProfileAvatar profile={profile} size="sm" />
              <div className="flex flex-col">
                <span className="font-medium">{profile.name}</span>
                {profile.id === 1 && <span className="text-[10px] text-muted-foreground">الافتراضي</span>}
              </div>
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator />
        
        {isManualOverride && (
          <DropdownMenuItem onClick={handleResetProfile} className="cursor-pointer text-amber-500 focus:text-amber-500">
            <LogOut className="mr-2 h-4 w-4" />
            <span>العودة للبروفايل التلقائي</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={() => navigate('/profiles')} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>إدارة البروفايلات</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProfileSwitcher;
