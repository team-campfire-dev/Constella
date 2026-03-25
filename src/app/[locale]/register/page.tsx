"use client"

import { signIn } from "next-auth/react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail, Lock, Sparkles, User } from "lucide-react"
import { Link } from "@/i18n/navigation"

// Pre-generated star data (module-level to avoid React Compiler purity issues)
const STAR_DATA = Array.from({ length: 60 }, (_, i) => {
    // Deterministic pseudo-random using golden ratio
    const phi = 1.618033988749895
    const seed = (i * phi) % 1
    const seed2 = ((i + 17) * phi) % 1
    const seed3 = ((i + 37) * phi) % 1
    const seed4 = ((i + 53) * phi) % 1
    const seed5 = ((i + 71) * phi) % 1
    return {
        id: i,
        left: `${seed * 100}%`,
        top: `${seed2 * 100}%`,
        size: seed3 * 2 + 1,
        duration: `${seed4 * 3 + 2}s`,
        delay: `${seed5 * 5}s`,
    }
})

function StarField() {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {STAR_DATA.map((star) => (
                <div
                    key={star.id}
                    className="star-particle"
                    style={{
                        left: star.left,
                        top: star.top,
                        width: `${star.size}px`,
                        height: `${star.size}px`,
                        '--duration': star.duration,
                        '--delay': star.delay,
                    } as React.CSSProperties}
                />
            ))}
        </div>
    )
}

export default function RegisterPage() {
    const t = useTranslations('Register')
    const tLogin = useTranslations('Login')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')
        setSuccessMessage('')
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Registration failed');
            }

            setSuccessMessage(t('registerSuccess'))
            
            // Auto login after successful registration
            const loginResult = await signIn("credentials", {
                username: email,
                password,
                redirect: false,
            })

            if (loginResult?.ok) {
                router.push('/')
                router.refresh()
            } else {
                router.push('/login')
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('registerFailed'))
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleSignIn = async () => {
        setIsGoogleLoading(true)
        try {
            await signIn("google", { callbackUrl: "/" })
        } finally {
            setIsGoogleLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0C15] relative overflow-hidden">
            {/* Star particle background */}
            <StarField />

            {/* Ambient glow effects */}
            <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Register card */}
            <div
                className="relative z-10 w-full max-w-md mx-4 p-8 sm:p-10 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-2xl"
                style={{ animation: 'pulse-glow 4s ease-in-out infinite' }}
            >
                {/* Branding */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400/20 to-blue-600/20 border border-cyan-400/30 flex items-center justify-center mb-4" style={{ animation: 'float 6s ease-in-out infinite' }}>
                        <Sparkles className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-wider text-center">
                        {t('title')}
                    </h1>
                    <p className="mt-1.5 text-sm text-gray-400 tracking-wide text-center">
                        {t('subtitle')}
                    </p>
                </div>

                {/* Error / Success message */}
                {error && (
                    <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}
                {successMessage && (
                    <div className="mb-6 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm text-center flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {successMessage}
                    </div>
                )}

                {/* Register form */}
                <form className="space-y-5" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1.5 tracking-wide uppercase">
                            {t('name')}
                        </label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                id="name"
                                name="name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white/[0.05] border border-white/[0.1] rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300"
                                placeholder="Captain Constella"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-xs font-medium text-gray-400 mb-1.5 tracking-wide uppercase">
                            {t('email')}
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white/[0.05] border border-white/[0.1] rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300"
                                placeholder="explorer@constella.space"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1.5 tracking-wide uppercase">
                            {t('password')}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white/[0.05] border border-white/[0.1] rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all duration-300"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || isGoogleLoading || !!successMessage}
                        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-[#0B0C15] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 flex items-center justify-center"
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('register')}
                    </button>
                </form>

                {/* Divider */}
                <div className="relative my-7">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/[0.08]" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="px-3 bg-[#0B0C15]/80 text-gray-500 uppercase tracking-wider">
                            {t('orContinueWith')}
                        </span>
                    </div>
                </div>

                {/* Google Sign In */}
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading || isGoogleLoading || !!successMessage}
                    className="w-full py-3 px-4 rounded-xl text-sm font-medium text-gray-300 bg-white/[0.03] border border-white/[0.1] hover:bg-white/[0.08] hover:border-white/[0.2] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[#0B0C15] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-3"
                >
                    {isGoogleLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                    )}
                    {tLogin('signInGoogle')}
                </button>
                
                {/* Login Link */}
                <p className="mt-6 text-center text-sm text-gray-400">
                    {t('hasAccount')}{' '}
                    <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                        {t('loginLink')}
                    </Link>
                </p>
            </div>

            {/* Footer subtle text */}
            <p className="relative z-10 mt-8 text-xs text-gray-600">
                © 2026 Constella
            </p>
        </div>
    )
}
