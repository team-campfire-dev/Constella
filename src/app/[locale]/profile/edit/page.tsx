import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "@/i18n/navigation"
import ProfileEditForm from "@/components/ProfileEditForm"
import { getTranslations } from "next-intl/server"
import DashboardLayout from "@/components/DashboardLayout"
import prisma from "@/lib/prisma"

export default async function EditProfilePage() {
    const session = await getServerSession(authOptions)
    const t = await getTranslations('ProfileEdit')

    if (!session?.user) {
        redirect({ href: "/login", locale: "ko" });
        return null;
    }

    // Fetch bio from DB (not in session)
    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { bio: true }
    });

    return (
        <DashboardLayout>
            <div className="p-6 max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-xl font-bold text-cyan-400 uppercase tracking-widest font-mono">
                        {t('title')}
                    </h1>
                    <p className="mt-2 text-sm text-cyan-700">
                        {t('description')}
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-slate-900/50 border border-cyan-500/10 rounded-lg p-6">
                    <ProfileEditForm user={{ name: session.user.name, email: session.user.email, bio: dbUser?.bio }} />
                </div>
            </div>
        </DashboardLayout>
    )
}
