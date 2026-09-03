
import { Link, useNavigate } from 'react-router-dom';


import { Search, Menu, X, Film, Tv, Clock, Heart, Home, Settings as SettingsIcon, Shield, Layers, BarChart3, ListVideo, Users, Image as ImageIcon, Sparkles, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';

// Lazy load heavy components
const AiChatPanel = lazy(() => import('@/components/media/AiChatPanel').then(module => ({ default: module.AiChatPanel })));
const ProfileSwitcher = lazy(() => import('@/components/layout/ProfileSwitcher'));
import { enableTVNavigation, disableTVNavigation, initTVNavigation } from '@/lib/tvNavigation';

const Header = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiMode, setIsAiMode] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [tvMode, setTvMode] = useState(localStorage.getItem('tvMode') === 'true');
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest: number) => {
    const previous = scrollY.getPrevious() ?? 0;
    // Hide header when scrolling down past 50px, show when scrolling up
    if (latest > previous && latest > 50) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    queryKey: ['search', debouncedSearchQuery],
    queryFn: () => apiClient.getAllMedia({ search: debouncedSearchQuery, limit: 5 }),
    enabled: debouncedSearchQuery.trim().length > 0,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    initTVNavigation();
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTvMode = () => {
    if (tvMode) {
      disableTVNavigation();
      setTvMode(false);
    } else {
      enableTVNavigation();
      setTvMode(true);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}${isAiMode ? '&ai=true' : ''}`);
      setIsSearchOpen(false);
      setShowDropdown(false);
      setSearchQuery('');
    }
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Film, label: 'Movies', path: '/movies' },
    { icon: Tv, label: 'Series', path: '/series' },
    { icon: Calendar, label: 'تقويم الإصدارات', path: '/calendar' },
    { icon: Users, label: 'Actors', path: '/actors' },
    { icon: Layers, label: 'Collections', path: '/collections' },
    { icon: Clock, label: 'History', path: '/history' },
    { icon: Heart, label: 'Favorites', path: '/favorites' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: SettingsIcon, label: 'Settings', path: '/settings' },
    { icon: Shield, label: 'Admin', path: '/admin' },
  ];

  return (
    <>
      <motion.header
        variants={{
          visible: { y: 0 },
          hidden: { y: "-100%" },
        }}
        animate={hidden ? "hidden" : "visible"}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="fixed top-0 left-0 right-0 z-50 glass-header"
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Film className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold hidden sm:block">SmartCinema</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path}>
                  <Button variant="ghost" className="gap-2">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
            </nav>

            {/* Search & Mobile Menu */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <AnimatePresence>
                {isSearchOpen ? (
                  <div className="relative" ref={dropdownRef}>
                    <motion.form
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleSearch}
                      className="flex items-center"
                    >
                      <div className="relative flex items-center">
                        <Input
                          type="text"
                          placeholder={isAiMode ? "اسأل الذكاء الاصطناعي... ✨" : "بحث..."}
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowDropdown(true);
                          }}
                          onFocus={() => setShowDropdown(true)}
                          className={`w-48 md:w-64 pr-10 transition-all duration-300 ${isAiMode ? 'border-purple-500 ring-purple-500/20' : ''}`}
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`absolute left-0 transition-colors ${isAiMode ? 'text-purple-500 hover:text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
                          onClick={() => setIsAiMode(!isAiMode)}
                          title={isAiMode ? "إيقاف البحث الذكي" : "تشغيل البحث بالذكاء الاصطناعي ✨"}
                        >
                          <Sparkles className={`w-4 h-4 ${isAiMode ? 'animate-pulse' : ''}`} />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setIsSearchOpen(false);
                          setShowDropdown(false);
                        }}
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </motion.form>

                    {/* Search Dropdown */}
                    <AnimatePresence>
                      {showDropdown && searchQuery.trim().length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-12 left-0 w-[300px] bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
                        >
                          {isSearchLoading ? (
                            <div className="p-4 text-center text-sm text-muted-foreground animate-pulse">جاري البحث...</div>
                          ) : searchResults?.data && searchResults.data.length > 0 ? (
                            <>
                              {searchResults.data.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer transition-colors"
                                  onClick={() => {
                                    navigate(`/details/${item.id}`);
                                    setIsSearchOpen(false);
                                    setShowDropdown(false);
                                    setSearchQuery('');
                                  }}
                                >
                                  {item.poster_url ? (
                                    <img
                                      src={item.poster_url}
                                      alt={item.title}
                                      className="w-10 h-14 object-cover rounded shadow-sm"
                                    />
                                  ) : (
                                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="flex flex-col flex-1 overflow-hidden">
                                    <span className="text-sm font-medium truncate">{item.title}</span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                                      {item.year || 'N/A'} • {item.type === 'movie' ? 'فيلم' : 'مسلسل'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={handleSearch}
                                className="w-full p-3 text-sm text-center text-primary hover:bg-accent border-t transition-colors font-medium"
                              >
                                عرض كل النتائج
                              </button>
                            </>
                          ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">لم يتم العثور على نتائج.</div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <Search className="w-5 h-5" />
                  </Button>
                )}
              </AnimatePresence>

              {/* Profile Switcher */}
              <Suspense fallback={<div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />}>
                <ProfileSwitcher />
              </Suspense>

              {/* TV Mode Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTvMode}
                className={`transition-colors hidden md:flex ${tvMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title={tvMode ? "إيقاف نمط التلفزيون" : "تفعيل نمط التلفزيون الذكي 📺"}
              >
                <Tv className={`w-5 h-5 ${tvMode ? 'scale-110 drop-shadow-md' : ''}`} />
              </Button>

              {/* AI Chat Button */}
              <motion.button
                onClick={() => setIsChatOpen(true)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600/80 to-blue-700/80 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:border-purple-400/60 transition-shadow duration-300"
                title="CineMind AI Chat"
              >
                <Sparkles className="w-4 h-4 text-white" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-black/30 animate-pulse" />
              </motion.button>

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden overflow-hidden pb-4"
              >
                <div className="flex flex-col gap-1 glass-card rounded-lg p-2 mt-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Button variant="ghost" className="w-full justify-start gap-2">
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Button>
                    </Link>
                  ))}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
      </motion.header>
      {/* AI Chat Panel */}
      <Suspense fallback={null}>
        <AiChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </Suspense>
    </>
  );
};

export default Header;
