"use client"
import { signOut } from "next-auth/react"
import { useTranslations } from "next-intl"

export default function SignOutButton() {
    const t = useTranslations('Navbar')
    return (
        <button
            onClick={() => signOut()}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
            {t('signOut')}
        </button>
    )
}
