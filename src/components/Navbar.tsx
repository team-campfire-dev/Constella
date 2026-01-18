import { Link } from '@/i18n/navigation' // We need to create this first or standard next-intl link?
// Standard next-intl doesn't export Link from main pkg directly in recent versions without config?
// Actually simpler to use: import Link from 'next/link' but it won't handle locale prefix?
// Let's use generic implementation first or confirm if we need a navigation wrapper.
// next-intl 3.0 recommends defining navigation wrapper.

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import UserDropdown from './UserDropdown'
import { getTranslations } from 'next-intl/server'

export default async function Navbar() {
    const session = await getServerSession(authOptions)
    const t = await getTranslations('Navbar')

    return (
        <nav className="bg-white shadow">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 justify-between">
                    <div className="flex">
                        <div className="flex flex-shrink-0 items-center">
                            <Link href="/" className="text-xl font-bold text-gray-900">
                                {t('title')}
                            </Link>
                        </div>
                    </div>
                    <div className="hidden sm:ml-6 sm:flex sm:items-center">
                        {session?.user ? (
                            <UserDropdown user={session.user} />
                        ) : (
                            <Link
                                href="/login"
                                className="text-sm font-medium text-gray-700 hover:text-gray-900"
                            >
                                {t('signIn')}
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    )
}
