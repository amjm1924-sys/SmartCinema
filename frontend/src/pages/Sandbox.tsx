import { useState } from 'react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdaptivePoster } from '@/components/sandbox/AdaptivePoster';
import { Play, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MOCK_MOVIES = [
    {
        id: "m1",
        title: "Dune: Part Two",
        poster: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2JGjjc9CW.jpg",
        backdrop: "https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
        year: 2024
    },
    {
        id: "m2",
        title: "Oppenheimer",
        poster: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
        backdrop: "https://image.tmdb.org/t/p/original/fm6KqXn30CbIVNOITvr1DEFEP0V.jpg",
        year: 2023
    },
    {
        id: "m3",
        title: "Spider-Man: Across the Spider-Verse",
        poster: "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg",
        backdrop: "https://image.tmdb.org/t/p/original/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg",
        year: 2023
    }
];

export default function Sandbox() {
    const navigate = useNavigate();
    const [activeExperiment, setActiveExperiment] = useState<'hub' | 'adaptive-poster'>('hub');

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <Header />

            <main className="container mx-auto px-4 py-8 mt-20 max-w-6xl">

                {/* Sandbox Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-black bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
                            🧪 UI / UX Sandbox
                        </h1>
                        <p className="text-muted-foreground mt-2 text-lg border-l-4 border-primary/50 pl-3">
                            Isolated environment for testing advanced front-end concepts and fluid animations safely.
                        </p>
                    </div>

                    {activeExperiment !== 'hub' && (
                        <Button
                            variant="outline"
                            onClick={() => setActiveExperiment('hub')}
                            className="gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Hub
                        </Button>
                    )}
                </div>

                {/* Experiment Hub List */}
                {activeExperiment === 'hub' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                        {/* Adaptive Poster Card */}
                        <Card className="border-primary/20 bg-card hover:bg-card/80 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 cursor-pointer group"
                            onClick={() => setActiveExperiment('adaptive-poster')}>
                            <CardHeader>
                                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl">🎨</span>
                                </div>
                                <CardTitle>Adaptive Posters</CardTitle>
                                <CardDescription>
                                    Movie cards that automatically extract the dominant colors from the image to generate a beautiful matching drop-shadow glow.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full gap-2" variant="secondary">
                                    <Play className="w-4 h-4" /> Run Demo
                                </Button>
                            </CardContent>
                        </Card>

                        {/* More experiments can be added here in the future */}
                        <Card className="border-border opacity-50 border-dashed">
                            <CardHeader>
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <span className="text-2xl">🚀</span>
                                </div>
                                <CardTitle>Cinematic Hero</CardTitle>
                                <CardDescription>
                                    3D Mouse-parallax effect for the homepage featured movie header. (Coming soon)
                                </CardDescription>
                            </CardHeader>
                        </Card>

                    </div>
                )}

                {/* Adaptive Poster Experiment Area */}
                {activeExperiment === 'adaptive-poster' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-black/40 rounded-3xl p-8 border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 border-b border-white/10 pb-4">
                                Adaptive Glow "Thief" Components
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
                                {MOCK_MOVIES.map(movie => (
                                    <AdaptivePoster
                                        key={movie.id}
                                        title={movie.title}
                                        posterUrl={movie.poster}
                                        year={movie.year}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
