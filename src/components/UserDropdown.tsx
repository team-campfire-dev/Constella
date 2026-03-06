"use client"

import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { UserCircleIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import { signOut } from 'next-auth/react'
import { Link } from '@/i18n/navigation'
import UserAvatar from './UserAvatar'
import { useTranslations } from 'next-intl'

export default function UserDropdown({ user }: { user: { name?: string | null, email?: string | null, image?: string | null } }) {
    const t = useTranslations('Navbar')

    return (
        <Menu as="div" className="relative ml-3">
            <div>
                <Menu.Button className="relative flex w-8 h-8 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 border border-cyan-500/30">
                    <span className="absolute -inset-1.5" />
                    <span className="sr-only">Open user menu</span>
                    <UserAvatar name={user.name} image={user.image} size="sm" />
                </Menu.Button>
            </div>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-slate-900 border border-cyan-500/20 py-1 shadow-lg shadow-black/40 focus:outline-none">
                    <div className="px-4 py-3 border-b border-cyan-500/10">
                        <p className="text-xs text-cyan-700 font-mono">{t('signedInAs')}</p>
                        <p className="truncate text-sm font-medium text-cyan-300">{user.email}</p>
                    </div>
                    <Menu.Item>
                        {({ active }) => (
                            <Link
                                href="/profile"
                                className={`${active ? 'bg-cyan-900/30' : ''} flex items-center px-4 py-2 text-sm text-cyan-300`}
                            >
                                <UserCircleIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                                {t('yourProfile')}
                            </Link>
                        )}
                    </Menu.Item>
                    <Menu.Item>
                        {({ active }) => (
                            <button
                                onClick={() => signOut()}
                                className={`${active ? 'bg-cyan-900/30' : ''} flex w-full items-center px-4 py-2 text-sm text-cyan-300`}
                            >
                                <ArrowRightStartOnRectangleIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                                {t('signOut')}
                            </button>
                        )}
                    </Menu.Item>
                </Menu.Items>
            </Transition>
        </Menu>
    )
}
