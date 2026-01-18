'use server'

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function updateProfile(formData: FormData) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
        throw new Error("Not authenticated")
    }

    const name = formData.get("name") as string

    // Simple validation
    if (!name || name.trim().length === 0) {
        // In a real app, you might return state with errors
        throw new Error("Name is required")
    }

    await prisma.user.update({
        where: { email: session.user.email },
        data: { name },
    })

    revalidatePath("/profile")
    revalidatePath("/") // Update navbar avatar/name potentially
    redirect("/profile")
}
