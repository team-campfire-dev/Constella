import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "@/i18n/navigation"
import { getTranslations } from "next-intl/server"
import DashboardLayout from '@/components/DashboardLayout';
import StarGraph from '@/components/StarGraph';

export default async function Home() {
  const session = await getServerSession(authOptions)
  const t = await getTranslations('StarMap')

  if (!session) {
    redirect({ href: "/login", locale: "ko" });
  }

  return (
    <DashboardLayout>
      <div className="p-6 h-full flex flex-col">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-100">{t('cardTitle')}</h1>
        </div>
        <div className="flex-1 min-h-0">
          <StarGraph />
        </div>
      </div>
    </DashboardLayout>
  )
}
