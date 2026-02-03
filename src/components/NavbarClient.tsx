'use client'

import { Link } from '@/i18n/navigation'
import { User } from "next-auth"
import UserDropdown from './UserDropdown'
import { useState, useEffect } from 'react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslations } from 'next-intl'

interface NavbarClientProps {
    user?: User
}

export default function NavbarClient({ user }: NavbarClientProps) {
    const t = useTranslations('Navbar')
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0B0C15]/80 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
            }`}>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 justify-between items-center">
                    <div className="flex items-center">
                        <Link href="/" className="text-xl font-bold text-white tracking-wider hover:text-cyan-400 transition-colors">
                            {t('title')}
                        </Link>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
                        {user ? (
                            <UserDropdown user={user} />
                        ) : (
                            <Link
                                href="/login"
                                className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                            >
                                {t('signIn')}
                            </Link>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center sm:hidden">
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            <span className="sr-only">{t('menuOpen')}</span>
                            {mobileMenuOpen ? (
                                <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                            ) : (
                                <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="sm:hidden bg-[#0B0C15]/95 backdrop-blur-xl border-b border-white/10">
                    <div className="space-y-1 px-2 pb-3 pt-2">
                        {user ? (
                            <>
                                <div className="px-3 py-2 text-base font-medium text-white">
                                    {t('signedInAs')} {user.name || user.email}
                                </div>
                                <Link
                                    href="/profile"
                                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-white/10 hover:text-white"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {t('yourProfile')}
                                </Link>
                                <div className="border-t border-gray-700 my-2"></div>
                                {/* UserDropdown usually handles signout, but in mobile we might need a direct button or reuse logic. 
                                    For now simplified. Ideal would be to expose SignOut functionality or replicate it. 
                                    Since UserDropdown is a client component too, we could hide it and use direct links here if needed, 
                                    but standard UserDropdown might not fit in mobile menu easily depending on implementation.
                                    Let's rely on Profile page for signout or add a signout here later if UserDropdown doesn't suffice.
                                */}
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-white/10 hover:text-white"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                {t('signIn')}
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </nav>
    )
}
