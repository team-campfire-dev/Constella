'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function NotFound() {
    const t = useTranslations('NotFound')

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0C15] px-4 text-center">
            <h1 className="text-6xl font-black text-white sm:text-9xl">404</h1>
            <p className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-4xl">
                {t('title')}
            </p>
            <p className="mt-6 text-base leading-7 text-gray-400">
                {t('description')}
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                    href="/"
                    className="rounded-md bg-cyan-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 transition-colors"
                >
                    {t('backHome')}
                </Link>
            </div>
        </div>
    )
}
