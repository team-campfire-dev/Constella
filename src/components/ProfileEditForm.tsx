'use client'

import { updateProfile } from "@/app/[locale]/profile/edit/actions"
import { useTranslations } from "next-intl"
import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

function SubmitButton() {
    const { pending } = useFormStatus()
    const t = useTranslations('ProfileEdit')

    return (
        <button
            type="submit"
            disabled={pending}
            aria-disabled={pending}
            className="inline-flex justify-center items-center rounded px-4 py-2 text-sm font-mono uppercase tracking-wider bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-800/60 hover:border-cyan-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('save')}
        </button>
    )
}

export default function ProfileEditForm({ user }: { user: { name?: string | null, email?: string | null, bio?: string | null } }) {
    const t = useTranslations('ProfileEdit')

    return (
        <form action={updateProfile} className="space-y-6">
            <div>
                <label htmlFor="email" className="block text-sm font-mono text-cyan-500 uppercase tracking-wider mb-2">
                    {t('emailLabel')}
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    disabled
                    defaultValue={user.email ?? ''}
                    className="block w-full rounded-md py-2 px-3 bg-black/40 border border-cyan-900/30 text-cyan-300 text-sm font-mono cursor-not-allowed opacity-60 focus:outline-none"
                />
                <p className="mt-2 text-xs text-cyan-800">{t('emailHelp')}</p>
            </div>

            <div>
                <label htmlFor="name" className="block text-sm font-mono text-cyan-500 uppercase tracking-wider mb-2">
                    {t('nameLabel')}
                </label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    defaultValue={user.name ?? ''}
                    className="block w-full rounded-md py-2 px-3 bg-black/30 border border-cyan-500/20 text-cyan-200 text-sm focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-colors"
                />
            </div>

            <div>
                <label htmlFor="bio" className="block text-sm font-mono text-cyan-500 uppercase tracking-wider mb-2">
                    {t('bioLabel')}
                </label>
                <textarea
                    id="bio"
                    name="bio"
                    rows={3}
                    defaultValue={user.bio ?? ''}
                    className="block w-full rounded-md py-2 px-3 bg-black/30 border border-cyan-500/20 text-cyan-200 text-sm focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-colors resize-none"
                />
                <p className="mt-2 text-xs text-cyan-800">{t('bioHelp')}</p>
            </div>

            <div className="pt-4 border-t border-cyan-500/10 flex justify-end">
                <SubmitButton />
            </div>
        </form>
    )
}
