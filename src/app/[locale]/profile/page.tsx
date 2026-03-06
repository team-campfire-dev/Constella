import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, Link } from "@/i18n/navigation"
import UserAvatar from "@/components/UserAvatar"
import { getTranslations } from "next-intl/server"
import DashboardLayout from "@/components/DashboardLayout"
import prisma from "@/lib/prisma"

export default async function ProfilePage() {
    const session = await getServerSession(authOptions)
    const t = await getTranslations('Profile')

    if (!session?.user) {
        redirect({ href: "/login", locale: "ko" });
        return null;
    }

    // Fetch bio from DB (not available in session)
    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { bio: true }
    });

    return (
        <DashboardLayout>
            <div className="p-6 max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-xl font-bold text-cyan-400 uppercase tracking-widest font-mono">
                        {t('title')}
                    </h1>
                    <Link
                        href="/profile/edit"
                        className="px-4 py-2 rounded text-sm font-mono uppercase tracking-wider bg-cyan-900/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-800/50 hover:border-cyan-400/50 transition-all"
                    >
                        {t('editProfile')}
                    </Link>
                </div>

                {/* Profile Card */}
                <div className="bg-slate-900/50 border border-cyan-500/10 rounded-lg overflow-hidden">
                    {/* Avatar + Name */}
                    <div className="p-6 flex items-center gap-5 border-b border-cyan-500/10">
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-500/30 overflow-hidden">
                            <UserAvatar name={session.user.name ?? ''} image={session.user.image} size="lg" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-cyan-200">{session.user.name ?? '-'}</h2>
                            <p className="text-sm text-cyan-700 font-mono">{session.user.email}</p>
                        </div>
                    </div>

                    {/* Info Rows */}
                    <div className="divide-y divide-cyan-500/10">
                        <div className="px-6 py-4 flex">
                            <dt className="w-1/3 text-sm font-mono text-cyan-600 uppercase tracking-wider">{t('fullName')}</dt>
                            <dd className="w-2/3 text-sm text-cyan-200">{session.user.name ?? '-'}</dd>
                        </div>
                        <div className="px-6 py-4 flex">
                            <dt className="w-1/3 text-sm font-mono text-cyan-600 uppercase tracking-wider">{t('email')}</dt>
                            <dd className="w-2/3 text-sm text-cyan-200">{session.user.email}</dd>
                        </div>
                        <div className="px-6 py-4 flex">
                            <dt className="w-1/3 text-sm font-mono text-cyan-600 uppercase tracking-wider">{t('bio')}</dt>
                            <dd className="w-2/3 text-sm text-cyan-200">
                                {dbUser?.bio || <span className="text-cyan-800 italic">{t('noBio')}</span>}
                            </dd>
                        </div>
                    </div>
                </div>

                {/* Public Profile Link */}
                <div className="mt-6 text-center">
                    <Link
                        href={`/explorer/${session.user.id}`}
                        className="text-sm text-cyan-500 hover:text-cyan-300 font-mono transition-colors"
                    >
                        {t('viewPublicProfile')} →
                    </Link>
                </div>
            </div>
        </DashboardLayout>
    )
}
