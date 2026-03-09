'use client'

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Globe, FileText, Terminal, Rss, Trophy, MessageSquare, Rocket } from 'lucide-react';
import clsx from 'clsx';


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('StarMap.menu');
    const pathname = usePathname();

    const navigation = [
        { name: t('shipLog'), href: '/ship-log', icon: FileText },
        { name: t('starMap'), href: '/', icon: Globe },
        { name: t('commsConsole'), href: '/console', icon: Terminal },
        { name: t('feed'), href: '/feed', icon: Rss },
        { name: t('dm'), href: '/dm', icon: MessageSquare },
        { name: t('expeditions'), href: '/expeditions', icon: Rocket },
        { name: t('leaderboard'), href: '/leaderboard', icon: Trophy },
    ];

    return (
        <div className="h-screen bg-[#0B0C15] text-white pt-16 overflow-hidden">

            <div className="flex h-full">
                {/* Sidebar (Desktop) */}
                <div className="w-64 bg-[#11121C] border-r border-gray-800 hidden md:block overflow-y-auto">
                    <nav className="mt-5 px-2 space-y-1">
                        {navigation.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={clsx(
                                        isActive
                                            ? 'bg-[#1C1E2D] text-[#38BDF8] border-l-4 border-[#38BDF8]'
                                            : 'text-gray-400 hover:bg-[#1C1E2D] hover:text-white',
                                        'group flex items-center px-2 py-3 text-sm font-medium rounded-r-md transition-colors'
                                    )}
                                >
                                    <item.icon
                                        className={clsx(
                                            isActive ? 'text-[#38BDF8]' : 'text-gray-400 group-hover:text-white',
                                            'mr-3 flex-shrink-0 h-5 w-5'
                                        )}
                                        aria-hidden="true"
                                    />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-auto bg-[#0B0C15] relative pb-16 md:pb-0">
                    {children}
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#11121C]/95 backdrop-blur-md border-t border-gray-800 md:hidden">
                <nav className="flex items-center justify-around px-1 py-1.5">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={clsx(
                                    'flex flex-col items-center gap-0.5 px-1 py-1 rounded-md min-w-0 flex-1 transition-colors',
                                    isActive
                                        ? 'text-[#38BDF8]'
                                        : 'text-gray-500 active:text-gray-300'
                                )}
                            >
                                <item.icon
                                    className={clsx(
                                        'h-5 w-5 flex-shrink-0',
                                        isActive ? 'text-[#38BDF8]' : 'text-gray-500'
                                    )}
                                    aria-hidden="true"
                                />
                                <span className={clsx(
                                    'text-[9px] leading-tight truncate max-w-full',
                                    isActive ? 'font-bold' : 'font-medium'
                                )}>
                                    {item.name}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
