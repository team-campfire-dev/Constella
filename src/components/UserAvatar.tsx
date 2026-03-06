export default function UserAvatar({ name, image, size = 'md' }: { name?: string | null, image?: string | null, size?: 'sm' | 'md' | 'lg' | 'xl' }) {
    const initials = name
        ? name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
        : '??'

    const textSize = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-lg',
        xl: 'text-2xl',
    }[size]

    return (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-900/60 to-slate-800 flex items-center justify-center overflow-hidden">
            {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={image}
                    alt={name || 'User Avatar'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                />
            ) : (
                <span className={`${textSize} font-bold text-cyan-400 font-mono`}>{initials}</span>
            )}
        </div>
    )
}
