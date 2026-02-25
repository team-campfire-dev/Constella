import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

import NavbarClient from './NavbarClient'

export default async function Navbar() {
    const session = await getServerSession(authOptions)

    return <NavbarClient user={session?.user} />
}
