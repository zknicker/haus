import { Chip } from '@heroui/react';
import { Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/** A library row's or tile's quiet sign that the file has a public link. */
export function PublicLinkMark() {
    return (
        <span aria-label="Public link" className="flex shrink-0 text-muted" role="img">
            <Icon icon={Globe02Icon} size={14} />
        </span>
    );
}

/** The viewer header's statement that the file has a public link. */
export function PublicLinkChip() {
    return (
        <Chip size="sm" variant="soft">
            <Icon icon={Globe02Icon} size={12} />
            <Chip.Label>Public link</Chip.Label>
        </Chip>
    );
}
