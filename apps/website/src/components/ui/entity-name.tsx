import { cn } from '../../lib/utils.ts';
import { EntityAvatar } from './entity-avatar.tsx';

/**
 * A named identity rendered inline: the mark plus the name. Agents and people
 * read the same here by design, so anywhere the product names one of them —
 * a claim's assignee or creator, a picker row — it looks like the same thing.
 */
export function EntityName({
    avatarUrl,
    className,
    name,
    size = 20,
}: {
    avatarUrl?: string | null;
    className?: string;
    name: string;
    size?: number;
}) {
    return (
        <span className={cn('flex min-w-0 items-center gap-2', className)}>
            <EntityAvatar className="shrink-0" name={name} size={size} src={avatarUrl ?? null} />
            <span className="min-w-0 truncate">{name}</span>
        </span>
    );
}
