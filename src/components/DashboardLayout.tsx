'use client'

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Globe, FileText, Terminal } from 'lucide-react';
import clsx from 'clsx';


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const t = useTranslations('StarMap.menu');
    const pathname = usePathname();

    const navigation = [
        { name: t('shipLog'), href: '#', icon: FileText },
        { name: t('starMap'), href: '/', icon: Globe },
        { name: t('commsConsole'), href: '#', icon: Terminal },
    ];

    return (
        <div className="min-h-screen bg-[#0B0C15] text-white">

            <div className="flex h-[calc(100vh-64px)]">
                {/* Sidebar */}
                <div className="w-64 bg-[#11121C] border-r border-gray-800 hidden md:block">
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
                <div className="flex-1 overflow-auto bg-[#0B0C15]">
                    {children}
                </div>
            </div>
        </div>
    );
}
