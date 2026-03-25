'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Sparkles, ArrowRight, Compass, Users, Map as MapIcon, Terminal, Globe, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

// Star particle animation similar to the login/register page
const STAR_DATA = Array.from({ length: 80 }, (_, i) => {
    const phi = 1.618033988749895;
    const seed = (i * phi) % 1;
    const seed2 = ((i + 17) * phi) % 1;
    const seed3 = ((i + 37) * phi) % 1;
    const seed4 = ((i + 53) * phi) % 1;
    const seed5 = ((i + 71) * phi) % 1;
    return {
        id: i,
        left: `${seed * 100}%`,
        top: `${seed2 * 100}%`,
        size: seed3 * 2.5 + 1,
        duration: `${seed4 * 4 + 3}s`,
        delay: `${seed5 * 5}s`,
    };
});

function StarField() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {STAR_DATA.map((star) => (
                <div
                    key={star.id}
                    className="star-particle"
                    style={{
                        left: star.left,
                        top: star.top,
                        width: `${star.size}px`,
                        height: `${star.size}px`,
                        '--duration': star.duration,
                        '--delay': star.delay,
                    } as React.CSSProperties}
                />
            ))}
        </div>
    );
}

export default function LandingPage() {
    const t = useTranslations('Landing');
    const [typingStep, setTypingStep] = useState(0);

    // Simple typing animation sequence for the demo
    useEffect(() => {
        const sequence = async () => {
            while (true) {
                setTypingStep(0); // Reset
                await new Promise(r => setTimeout(r, 1000));
                setTypingStep(1); // Show user typing
                await new Promise(r => setTimeout(r, 2000));
                setTypingStep(2); // Show AI loading
                await new Promise(r => setTimeout(r, 1500));
                setTypingStep(3); // Show AI response & Main Node
                await new Promise(r => setTimeout(r, 1500));
                setTypingStep(4); // Show child node 1 (Spooky action)
                await new Promise(r => setTimeout(r, 800));
                setTypingStep(5); // Show child node 2 (Einstein)
                await new Promise(r => setTimeout(r, 6000));
            }
        };
        sequence();
    }, []);

    return (
        <div className="min-h-screen bg-[#0B0C15] text-white relative overflow-hidden flex flex-col items-center justify-center pt-16">
            <StarField />
            
            {/* Ambient Ambient Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-700/10 rounded-full blur-[150px] pointer-events-none" />
            
            <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center text-center">
                
                {/* Hero Section */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/20 text-cyan-300 text-sm font-medium mb-8" style={{ animation: 'float 6s ease-in-out infinite' }}>
                    <Sparkles className="w-4 h-4" />
                    <span>{t('heroBadge')}</span>
                </div>
                
                <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-br from-white via-white to-gray-500 bg-clip-text text-transparent">
                    {t('heroTitle')}
                </h1>
                
                <p className="max-w-2xl text-lg sm:text-xl text-gray-400 mb-10 leading-relaxed">
                    {t('heroSubtitle')}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <Link
                        href="/register"
                        className="group flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-[#0B0C15]"
                    >
                        {t('ctaPrimary')}
                        <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link
                        href="/login"
                        className="flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl text-gray-300 bg-white/[0.03] border border-white/[0.1] hover:bg-white/[0.08] hover:text-white transition-all duration-300 focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[#0B0C15]"
                    >
                        {t('ctaSecondary')}
                    </Link>
                </div>

                {/* Interactive Demo Section */}
                <div className="mt-24 w-full max-w-4xl mx-auto">
                    <div className="mb-12 text-center">
                        <h2 className="text-3xl font-bold text-white mb-4">{t('demoTitle')}</h2>
                        <p className="text-gray-400">{t('demoSubtitle')}</p>
                    </div>

                    <div className="relative rounded-2xl border border-white/[0.1] bg-[#11121C]/80 backdrop-blur-xl overflow-hidden shadow-2xl">
                        {/* Fake Browser/App Header */}
                        <div className="h-12 border-b border-white/[0.05] bg-white/[0.02] flex items-center px-4 gap-4">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <div className="flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-widest border-l border-white/[0.1] pl-4">
                                <span className="flex items-center gap-1.5 text-cyan-400"><Terminal className="w-3.5 h-3.5" /> Console</span>
                                <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Star Map</span>
                            </div>
                        </div>

                        {/* Demo Content Area */}
                        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[320px]">
                            {/* Left: Chat Console */}
                            <div className="p-6 border-r border-white/[0.05] flex flex-col justify-end space-y-6 bg-gradient-to-b from-transparent to-[#0B0C15]/50">
                                
                                {/* User Message */}
                                <div className={`flex items-start gap-3 transition-all duration-500 transform ${typingStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
                                        <div className="w-4 h-4 rounded-full bg-blue-400" />
                                    </div>
                                    <div className="bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-blue-100 shadow-inner">
                                        {t('demoChatUser')}
                                    </div>
                                </div>

                                {/* AI Loading / Response */}
                                <div className={`flex items-start gap-3 transition-all duration-500 transform ${typingStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                                        <Sparkles className="w-4 h-4 text-cyan-400" />
                                    </div>
                                    
                                    {typingStep === 2 ? (
                                        <div className="bg-[#1C1E2D] border border-white/[0.05] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    ) : typingStep >= 3 ? (
                                        <div className="bg-[#1C1E2D] border border-white/[0.05] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-300 leading-relaxed shadow-inner">
                                            <p>
                                                {t('demoChatAI').split('[[').map((part, i) => {
                                                    if (i === 0) return part;
                                                    const [keyword, rest] = part.split(']]');
                                                    return (
                                                        <span key={i}>
                                                            <span className="text-cyan-400 font-medium bg-cyan-400/10 px-1 rounded">[[{keyword}]]</span>
                                                            {rest}
                                                        </span>
                                                    );
                                                })}
                                            </p>
                                            <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-2 text-xs text-cyan-400">
                                                <Sparkles className="w-3 h-3" />
                                                <span>{t('demoChatContext')}</span>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                
                                {/* Input Box Mock */}
                                <div className="h-10 mt-4 bg-[#0B0C15] border border-white/[0.1] rounded-lg flex items-center px-3 text-gray-600 text-sm">
                                    <ChevronRight className="w-4 h-4 mr-2" />
                                    <div className="w-[2px] h-4 bg-cyan-500 animate-pulse" />
                                </div>
                            </div>

                            {/* Right: Star Map Mock */}
                            <div className="relative p-6 bg-[#0B0C15] overflow-hidden flex items-center justify-center">
                                {/* Map Grid Lines */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
                                
                                {/* Existing Nodes */}
                                <div className="absolute top-[30%] left-[30%] w-3 h-3 bg-gray-500 rounded-full shadow-[0_0_10px_rgba(156,163,175,0.5)]" />
                                <div className="absolute top-[60%] left-[20%] w-4 h-4 bg-gray-400 rounded-full shadow-[0_0_15px_rgba(156,163,175,0.5)]" />
                                
                                {/* Connection Lines */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                                    <line x1="30%" y1="30%" x2="20%" y2="60%" stroke="white" strokeWidth="1" />
                                    
                                    {/* Main connection */}
                                    <line className={`transition-all duration-1000 ${typingStep >= 3 ? 'opacity-100' : 'opacity-0'}`} x1="30%" y1="30%" x2="60%" y2="50%" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 4" />
                                    
                                    {/* Child connections */}
                                    <line className={`transition-all duration-1000 ${typingStep >= 4 ? 'opacity-100' : 'opacity-0'}`} x1="60%" y1="50%" x2="75%" y2="25%" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 2" />
                                    <line className={`transition-all duration-1000 ${typingStep >= 5 ? 'opacity-100' : 'opacity-0'}`} x1="60%" y1="50%" x2="80%" y2="70%" stroke="#a78bfa" strokeWidth="1" strokeDasharray="2 2" />
                                </svg>
                                
                                {/* Main Node Animation */}
                                <div className={`absolute top-[50%] left-[60%] -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 transform ${typingStep >= 3 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                    <div className="relative flex items-center justify-center">
                                        <div className="absolute w-16 h-16 bg-cyan-500/20 rounded-full animate-ping" />
                                        <div className="absolute w-8 h-8 bg-cyan-400/40 rounded-full animate-pulse" />
                                        <div className="w-5 h-5 bg-cyan-400 rounded-full shadow-[0_0_20px_rgba(34,211,238,0.8)] z-10" />
                                        <div className="absolute top-8 whitespace-nowrap px-2 py-1 bg-[#1C1E2D]/90 border border-cyan-500/30 text-cyan-300 text-[10px] rounded backdrop-blur-sm font-medium z-20 shadow-lg">
                                            {t('demoChatUser').includes('양자') ? '양자 얽힘' : 'Quantum Entanglement'}
                                        </div>
                                    </div>
                                </div>

                                {/* Child Node 1 */}
                                <div className={`absolute top-[25%] left-[75%] -translate-x-1/2 -translate-y-1/2 transition-all duration-700 transform ${typingStep >= 4 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                    <div className="relative flex items-center justify-center">
                                        <div className="w-3 h-3 bg-purple-400 rounded-full shadow-[0_0_15px_rgba(167,139,250,0.6)] z-10" />
                                        <div className="absolute top-5 whitespace-nowrap px-1.5 py-0.5 bg-[#1C1E2D]/80 border border-purple-500/20 text-purple-300 text-[9px] rounded backdrop-blur-sm z-20">
                                            {t('demoChatUser').includes('양자') ? '유령 같은 원격 작용' : 'Spooky Action'}
                                        </div>
                                    </div>
                                </div>

                                {/* Child Node 2 */}
                                <div className={`absolute top-[70%] left-[80%] -translate-x-1/2 -translate-y-1/2 transition-all duration-700 transform ${typingStep >= 5 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
                                    <div className="relative flex items-center justify-center">
                                        <div className="w-3 h-3 bg-purple-400 rounded-full shadow-[0_0_15px_rgba(167,139,250,0.6)] z-10" />
                                        <div className="absolute top-5 whitespace-nowrap px-1.5 py-0.5 bg-[#1C1E2D]/80 border border-purple-500/20 text-purple-300 text-[9px] rounded backdrop-blur-sm z-20">
                                            {t('demoChatUser').includes('양자') ? '알베르트 아인슈타인' : 'Albert Einstein'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Features Section */}
                <div className="mt-32 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white/[0.02] border border-white/[0.05] p-8 rounded-2xl backdrop-blur-sm hover:bg-white/[0.04] transition-colors text-left flex flex-col items-start">
                            <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-6 border border-cyan-500/20">
                                <Compass className="w-6 h-6 text-cyan-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('feature1Title').replace('🔭 ', '')}</h3>
                            <p className="text-gray-400 leading-relaxed">
                                {t('feature1Desc')}
                            </p>
                        </div>
                        
                        <div className="bg-white/[0.02] border border-white/[0.05] p-8 rounded-2xl backdrop-blur-sm hover:bg-white/[0.04] transition-colors text-left flex flex-col items-start md:-translate-y-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20">
                                <MapIcon className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('feature2Title').replace('✨ ', '')}</h3>
                            <p className="text-gray-400 leading-relaxed">
                                {t('feature2Desc')}
                            </p>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.05] p-8 rounded-2xl backdrop-blur-sm hover:bg-white/[0.04] transition-colors text-left flex flex-col items-start">
                            <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20">
                                <Users className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{t('feature3Title').replace('👥 ', '')}</h3>
                            <p className="text-gray-400 leading-relaxed">
                                {t('feature3Desc')}
                            </p>
                        </div>
                    </div>
                </div>

            </main>
            
            {/* Footer */}
            <footer className="w-full text-center py-8 border-t border-white/[0.05] mt-auto">
                <p className="text-gray-600 text-sm">© 2026 Constella Exploration Project.</p>
            </footer>
        </div>
    );
}
