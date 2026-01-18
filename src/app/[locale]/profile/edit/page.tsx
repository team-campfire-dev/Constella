import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "@/i18n/navigation"
import ProfileEditForm from "@/components/ProfileEditForm"
import { getTranslations } from "next-intl/server"

export default async function EditProfilePage() {
    const session = await getServerSession(authOptions)
    const t = await getTranslations('ProfileEdit')

    if (!session?.user) {
        redirect({ href: "/login", locale: "ko" });
        return null; // Ensure function returns here
    }

    return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="md:grid md:grid-cols-3 md:gap-6">
                <div className="md:col-span-1">
                    <div className="px-4 sm:px-0">
                        <h3 className="text-base font-semibold leading-6 text-gray-900">{t('title')}</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {t('description')}
                        </p>
                    </div>
                </div>
                <div className="mt-5 md:col-span-2 md:mt-0">
                    <div className="shadow sm:overflow-hidden sm:rounded-md">
                        <div className="border-t border-gray-200 bg-white px-4 py-5 sm:p-6">
                            <ProfileEditForm user={{ name: session.user.name, email: session.user.email }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
