export default function UserAvatar({ name, image }: { name?: string | null, image?: string | null }) {
    const initials = name
        ? name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
        : '??'

    return (
        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border border-gray-300">
            {image ? (
                <img
                    src={image}
                    alt={name ?? 'User Avatar'}
                    className="h-full w-full object-cover"
                />
            ) : (
                <span className="text-sm font-medium text-gray-600">{initials}</span>
            )}
        </div>
    )
}
