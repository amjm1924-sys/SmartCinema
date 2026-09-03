/**
 * useSound - Premium UI Spatial Sounds
 * Generates elegant micro-sounds via Web Audio API (no external files needed).
 * Inspired by PS5 and Apple TV+ audio feedback design.
 */

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
    if (!audioCtx) {

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
};

// Listen for first user interaction to unlock the Web Audio API on browsers
let hasUnlocked = false;
const unlockAudio = () => {
    if (hasUnlocked) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    hasUnlocked = true;
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
};

if (typeof document !== 'undefined') {
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
}

const createTone = (
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    fadeOut = true
) => {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Low-pass filter for warmth
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, ctx.currentTime);

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);

        if (fadeOut) {
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        } else {
            gainNode.gain.setValueAtTime(volume, ctx.currentTime + duration);
        }

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration + 0.01);
    } catch (e) {
        // Fail silently - audio is optional
    }
};

export const useSound = () => {
    const isEnabled = () => {
        // Respect user's media preferences for reduced motion
        return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };

    /**
     * Soft hover tick — like PS5 UI navigation
     * Very subtle, high-pitched, very quiet
     */
    const playHover = () => {
        if (!isEnabled()) return;
        createTone(880, 0.08, 0.005, 'sine');
    };

    /**
     * Play button click — a satisfying, richer click
     * Slightly lower frequency, a bit more presence
     */
    const playClick = () => {
        if (!isEnabled()) return;
        createTone(440, 0.1, 0.07, 'sine');
        setTimeout(() => createTone(660, 0.08, 0.04, 'sine'), 30);
    };

    /**
     * Toast / Success sound — soft ascending chime
     * Used for confirmations like "Added to Favorites"
     */
    const playSuccess = () => {
        if (!isEnabled()) return;
        createTone(523, 0.15, 0.06, 'sine');
        setTimeout(() => createTone(659, 0.15, 0.05, 'sine'), 100);
        setTimeout(() => createTone(784, 0.2, 0.04, 'sine'), 200);
    };

    /**
     * Navigation select — card focus
     */
    const playSelect = () => {
        if (!isEnabled()) return;
        createTone(392, 0.12, 0.05, 'sine');
    };

    return { playHover, playClick, playSuccess, playSelect };
};

export default useSound;


