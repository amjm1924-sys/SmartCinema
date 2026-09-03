import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Sparkles, RotateCcw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { MediaChatCard } from '@/components/media/MediaChatCard';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    media_cards?: Array<{
        title: string;
        year: string;
        poster_url: string | null;
        tmdb_id: number;
        media_type: string;
        local_id: number | null;
        tmdb_url: string;
    }>;
    timestamp: Date;
}

interface AiChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

function TypingIndicator() {
    return (
        <div className="flex items-end gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/30">
                <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center h-4">
                    {[0, 1, 2].map(i => (
                        <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-purple-400"
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
    const isUser = msg.role === 'user';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex items-end gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
        >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${isUser
                ? 'bg-gradient-to-br from-pink-500 to-orange-500 shadow-pink-500/30'
                : 'bg-gradient-to-br from-purple-500 to-blue-600 shadow-purple-500/30'
                }`}>
                {isUser ? (
                    <span className="text-xs font-bold text-white">أنت</span>
                ) : (
                    <Bot className="w-4 h-4 text-white" />
                )}
            </div>

            {/* Bubble + Cards */}
            <div className={`flex flex-col gap-3 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isUser
                    ? 'bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-br-sm shadow-lg shadow-purple-500/20'
                    : 'bg-white/8 border border-white/10 text-white/90 rounded-bl-sm backdrop-blur-sm'
                    }`}>
                    {msg.content}
                </div>

                {/* Media cards row */}
                {!isUser && msg.media_cards && msg.media_cards.length > 0 && (
                    <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
                        <div className="flex gap-3" style={{ width: 'max-content' }}>
                            {msg.media_cards.map((card, i) => (
                                <MediaChatCard key={card.tmdb_id} {...card} index={i} />
                            ))}
                        </div>
                    </div>
                )}

                <span className="text-xs text-white/25 px-1">
                    {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
        </motion.div>
    );
}

const WELCOME_MSG: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: `🎬 أهلاً! أنا CineMind، مساعد السينما الخاص بك.

يمكنك سؤالي عن أي فيلم أو مسلسل، طلب توصيات، أو البحث عن أفضل أعمال ممثل أو مخرج. كيف يمكنني مساعدتك اليوم؟`,
    media_cards: [],
    timestamp: new Date(),
};

export function AiChatPanel({ isOpen, onClose }: AiChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
    }, []);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
            scrollToBottom(false);
        }
    }, [isOpen, scrollToBottom]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    const handleScroll = () => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        setShowScrollBtn(!isNearBottom);
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        // Build history for context (exclude welcome msg, exclude media cards)
        const history = messages
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.content }));

        try {
            const response = await apiClient.sendChatMessage(userMsg.content, history);
            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.text,
                media_cards: response.media_cards || [],
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMsg]);
             
        } catch (err: any) {
            const errMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `⚠️ خطأ: ${err?.message || 'تعذر التواصل مع الذكاء الاصطناعي. تأكد من أن Ollama شغال.'}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const clearHistory = () => {
        setMessages([{ ...WELCOME_MSG, timestamp: new Date() }]);
    };

    const suggestions = [
        'اقترح أفلام رعب 2023',
        'ما أفضل مسلسلات الأكشن؟',
        'أفلام مشابهة لـ Interstellar',
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col"
                        style={{
                            background: 'linear-gradient(135deg, rgba(15,12,30,0.97) 0%, rgba(20,15,40,0.97) 100%)',
                            borderLeft: '1px solid rgba(255,255,255,0.08)',
                            backdropFilter: 'blur(20px)',
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/40">
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                    <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0f0c1e] animate-pulse" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white tracking-wide">CineMind</h2>
                                    <p className="text-xs text-white/40">مساعد السينما الذكي</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-white/70 hover:bg-white/8 rounded-lg"
                                    onClick={clearHistory}
                                    title="مسح المحادثة"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white/40 hover:text-white/70 hover:bg-white/8 rounded-lg"
                                    onClick={onClose}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Messages area */}
                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin scrollbar-thumb-white/10"
                            onScroll={handleScroll}
                        >
                            {messages.map(msg => (
                                <MessageBubble key={msg.id} msg={msg} />
                            ))}
                            {isLoading && <TypingIndicator />}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Scroll to bottom button */}
                        <AnimatePresence>
                            {showScrollBtn && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    onClick={() => scrollToBottom()}
                                    className="absolute bottom-24 right-4 w-8 h-8 rounded-full bg-purple-600 shadow-lg flex items-center justify-center hover:bg-purple-500 transition-colors z-10"
                                >
                                    <ChevronDown className="w-4 h-4 text-white" />
                                </motion.button>
                            )}
                        </AnimatePresence>

                        {/* Quick suggestions (only if first message) */}
                        {messages.length === 1 && (
                            <div className="px-4 pb-3 flex gap-2 flex-wrap flex-shrink-0">
                                {suggestions.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => { setInput(s); inputRef.current?.focus(); }}
                                        className="text-xs px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/12 hover:border-white/20 transition-all duration-200"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input area */}
                        <div className="px-4 pb-4 pt-2 border-t border-white/8 flex-shrink-0">
                            <div className="flex items-end gap-2 bg-white/6 border border-white/12 rounded-2xl px-4 py-3 focus-within:border-purple-500/50 focus-within:bg-white/8 transition-all duration-200">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="اسألني عن أي فيلم أو مسلسل..."
                                    dir="auto"
                                    rows={1}
                                    disabled={isLoading}
                                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 resize-none outline-none leading-relaxed max-h-32 overflow-y-auto disabled:opacity-50"
                                    style={{ scrollbarWidth: 'none' }}
                                    onInput={(e) => {
                                        const el = e.target as HTMLTextAreaElement;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                                    }}
                                />
                                <Button
                                    size="icon"
                                    disabled={!input.trim() || isLoading}
                                    onClick={sendMessage}
                                    className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 text-white shadow-lg shadow-purple-500/30 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                            <p className="text-xs text-white/20 text-center mt-2">
                                Enter للإرسال · Shift+Enter لسطر جديد
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


