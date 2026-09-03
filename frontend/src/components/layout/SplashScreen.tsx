import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film } from 'lucide-react';

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
    const [phase, setPhase] = useState<'logo' | 'expand' | 'exit'>('logo');

    useEffect(() => {
        // Phase 1: Show logo (1.2s)
        const t1 = setTimeout(() => setPhase('expand'), 1200);
        // Phase 2: Expand & fade out (0.8s)
        const t2 = setTimeout(() => setPhase('exit'), 2000);
        // Phase 3: Complete
        const t3 = setTimeout(() => onFinish(), 2600);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [onFinish]);

    return (
        <AnimatePresence>
            {phase !== 'exit' ? null : null}
            <motion.div
                className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
                initial={{ opacity: 1 }}
                animate={phase === 'exit' ? { opacity: 0, scale: 1.1 } : { opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                style={{ pointerEvents: phase === 'exit' ? 'none' : 'auto' }}
            >
                {/* Animated Background */}
                <div className="absolute inset-0 bg-[hsl(240,10%,4%)]">
                    {/* Gradient Orbs */}
                    <motion.div
                        className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, hsla(217,91%,60%,0.15) 0%, transparent 70%)',
                            transform: 'translate(-50%, -50%)',
                        }}
                        animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.5, 0.8, 0.5],
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                        className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full"
                        style={{
                            background: 'radial-gradient(circle, hsla(280,80%,50%,0.1) 0%, transparent 70%)',
                        }}
                        animate={{
                            scale: [1.2, 1, 1.2],
                            opacity: [0.3, 0.6, 0.3],
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                </div>

                {/* Logo Container */}
                <div className="relative flex flex-col items-center gap-6">
                    {/* Icon */}
                    <motion.div
                        className="relative"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                    >
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary via-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_60px_rgba(59,130,246,0.4)]">
                            <Film className="w-10 h-10 text-white" />
                        </div>
                        {/* Glow ring */}
                        <motion.div
                            className="absolute -inset-3 rounded-3xl border border-primary/30"
                            animate={{ opacity: [0, 0.6, 0], scale: [0.9, 1.1, 0.9] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        className="text-4xl md:text-5xl font-black tracking-tight text-white"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
                    >
                        Smart
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-400 to-purple-500">
                            Cinema
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        className="text-white/40 text-sm tracking-widest uppercase"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7, duration: 0.5 }}
                    >
                        Your Personal Theater
                    </motion.p>

                    {/* Loading Bar */}
                    <motion.div
                        className="w-48 h-1 rounded-full bg-white/10 overflow-hidden mt-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                    >
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-primary via-blue-400 to-purple-500"
                            initial={{ width: '0%' }}
                            animate={{ width: '100%' }}
                            transition={{ delay: 0.6, duration: 1.6, ease: 'easeInOut' }}
                        />
                    </motion.div>
                </div>

                {/* Particle dots */}
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-primary/40 rounded-full"
                        style={{
                            top: `${20 + Math.random() * 60}%`,
                            left: `${10 + Math.random() * 80}%`,
                        }}
                        animate={{
                            y: [0, -30, 0],
                            opacity: [0, 0.8, 0],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 2,
                            repeat: Infinity,
                            delay: Math.random() * 1.5,
                            ease: 'easeInOut',
                        }}
                    />
                ))}
            </motion.div>
        </AnimatePresence>
    );
};

export default SplashScreen;
