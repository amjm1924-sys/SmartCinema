import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import SplashScreen from '@/components/layout/SplashScreen';

// Lazy load pages
const Index = lazy(() => import('./pages/Index'));
const Details = lazy(() => import('./pages/Details'));
const Player = lazy(() => import('./pages/Player'));
const Movies = lazy(() => import('./pages/Movies'));
const Series = lazy(() => import('./pages/Series'));
const Collections = lazy(() => import('./pages/Collections'));
const Settings = lazy(() => import('./pages/Settings'));

const History = lazy(() => import('./pages/History'));
const Favorites = lazy(() => import('./pages/Favorites'));
const LiveTV = lazy(() => import('./pages/LiveTV'));
const Admin = lazy(() => import('./pages/Admin'));
const Analytics = lazy(() => import('./pages/Analytics'));
const CastPage = lazy(() => import('./pages/CastPage'));
const ActorsPage = lazy(() => import('./pages/ActorsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const TmdbDetails = lazy(() => import('./pages/TmdbDetails'));
const SearchResults = lazy(() => import('./pages/Search'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Sandbox = lazy(() => import('./pages/Sandbox'));
const ProfilesManager = lazy(() => import('./pages/ProfilesManager'));

// Loading Fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <Loader2 className="w-10 h-10 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import { ThemeProvider } from '@/components/theme-provider';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';

const App = () => {
  // Show splash only once per session
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('smartcinema_splash_shown');
  });

  const handleSplashFinish = useCallback(() => {
    sessionStorage.setItem('smartcinema_splash_shown', '1');
    setShowSplash(false);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="default" storageKey="app-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
          <ErrorBoundary>
            <BrowserRouter>
              <CommandPalette />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                <Route path="/movies" element={<Movies />} />
                <Route path="/series" element={<Series />} />
                <Route path="/collections" element={<Collections />} />
                <Route path="/history" element={<History />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/livetv" element={<LiveTV />} />
                <Route path="/details/:id" element={<Details />} />
                <Route path="/player/:id" element={<Player />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/cast/:personId" element={<CastPage />} />
                <Route path="/actors" element={<ActorsPage />} />
                <Route path="/explore/:mediaType/:tmdbId" element={<TmdbDetails />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="/sandbox" element={<Sandbox />} />
                <Route path="/profiles" element={<ProfilesManager />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;

