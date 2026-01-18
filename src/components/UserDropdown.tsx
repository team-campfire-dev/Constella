"use client"

import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { UserCircleIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import { signOut } from 'next-auth/react'
import { Link } from '@/i18n/navigation'
import UserAvatar from './UserAvatar'
import { useTranslations } from 'next-intl'

function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

export default function UserDropdown({ user }: { user: { name?: string | null, email?: string | null, image?: string | null } }) {
    const t = useTranslations('Navbar')

    return (
        <Menu as="div" className="relative ml-3">
            <div>
                <Menu.Button className="relative flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                    <span className="absolute -inset-1.5" />
                    <span className="sr-only">Open user menu</span>
                    <UserAvatar name={user.name} image={user.image} />
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
                <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm text-gray-500">{t('signedInAs')}</p>
                        <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
                    </div>
                    <Menu.Item>
                        {({ active }) => (
                            <Link
                                href="/profile"
                                className={classNames(active ? 'bg-gray-100' : '', 'flex items-center px-4 py-2 text-sm text-gray-700')}
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
                                className={classNames(active ? 'bg-gray-100' : '', 'flex w-full items-center px-4 py-2 text-sm text-gray-700')}
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
