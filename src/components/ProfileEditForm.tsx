'use client'

import { updateProfile } from "@/app/[locale]/profile/edit/actions"
// We can use useFormStatus for loading state if we extract the button or use experimental hooks,
// but for simplicity we'll just use the action directly or a wrapper.
// To use useFormStatus, the button must be in a separate component or we use the hook in a child.
// Let's keep it simple for now.
import { useTranslations } from "next-intl"

function SubmitButton() {
    // Note: useFormStatus is available in react-dom (React Canary/Next.js)
    // but importing it might require checking version compatibility or just using standard form behavior.
    // Next.js 14+ supports it. We are on Next.js 16.

    // import { useFormStatus } from 'react-dom'
    // const { pending } = useFormStatus()
    const t = useTranslations('ProfileEdit')

    return (
        <button
            type="submit"
            className="inline-flex justify-center rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
            {t('save')}
        </button>
    )
}

export default function ProfileEditForm({ user }: { user: { name?: string | null, email?: string | null } }) {
    const t = useTranslations('ProfileEdit')

    return (
        <form action={updateProfile} className="space-y-6">
            <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
                    {t('emailLabel')}
                </label>
                <div className="mt-2">
                    <input
                        id="email"
                        name="email"
                        type="email"
                        disabled
                        defaultValue={user.email ?? ''}
                        className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-gray-100 cursor-not-allowed"
                    />
                </div>
                <p className="mt-2 text-sm text-gray-500">{t('emailHelp')}</p>
            </div>

            <div>
                <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                    {t('nameLabel')}
                </label>
                <div className="mt-2">
                    <input
                        id="name"
                        name="name"
                        type="text"
                        defaultValue={user.name ?? ''}
                        className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                </div>
            </div>

            <div className="bg-gray-50 px-4 py-3 text-right sm:px-6 -mx-4 -mb-5 sm:-mx-6 sm:-mb-6 mt-6 rounded-b-md">
                <SubmitButton />
            </div>
        </form>
    )
}
