import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "@/i18n/navigation"
import SignOutButton from "@/components/SignOutButton"
import { getTranslations } from "next-intl/server"

export default async function Home() {
  const session = await getServerSession(authOptions)
  const t = await getTranslations('Home')

  if (!session) {
    redirect({ href: "/login", locale: "ko" });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <div>
          <h1 className="text-2xl font-bold">{t('welcome')}, {session.user?.email}</h1>
          <p>{t('description')}</p>
        </div>
        <SignOutButton />
      </div>
    </main>
  )
}
