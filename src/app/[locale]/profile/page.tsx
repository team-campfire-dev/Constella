import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, Link } from "@/i18n/navigation"
import UserAvatar from "@/components/UserAvatar"
import { getTranslations } from "next-intl/server"

export default async function ProfilePage() {
    const session = await getServerSession(authOptions)
    const t = await getTranslations('Profile')

    if (!session?.user) {
        redirect({ href: "/login", locale: "ko" });
        return null;
    }

    return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="overflow-hidden bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-semibold leading-6 text-gray-900">{t('title')}</h3>
                        <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('description')}</p>
                    </div>
                    <Link
                        href="/profile/edit"
                        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        {t('editProfile')}
                    </Link>
                </div>
                <div className="border-t border-gray-200">
                    <dl>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">{t('avatar')}</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                                <UserAvatar name={session.user.name ?? ''} image={session.user.image} />
                            </dd>
                        </div>
                        <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">{t('fullName')}</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">{session.user.name ?? '-'}</dd>
                        </div>
                        <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">{t('email')}</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">{session.user.email}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    )
}
