import type { Agent } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';

/**
 * How the Agent signs its work in Linear today, beside how it will with its
 * own app: the "via Haus" attribution gives way to an @handle people can
 * assign and mention. Shown only at the top of setup, where it teaches.
 */
export function LinearIdentityPreview({ agent }: { agent: Agent }) {
    return (
        <figure
            aria-label={`${agent.displayName} posts via Haus today, and as @${agent.handle} with its own app`}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"
        >
            <Attribution agent={agent} line="via Haus" />
            <Icon aria-hidden="true" className="text-muted" icon={ArrowRight01Icon} size={16} />
            <Attribution agent={agent} line={`@${agent.handle}`} />
        </figure>
    );
}

function Attribution({ agent, line }: { agent: Agent; line: string }) {
    return (
        <ItemCard aria-hidden="true" className="item-card--attribution" variant="secondary">
            {/* 36px, so the tight two-line pair (~30px) sits inside the mark
                with a few pixels to spare instead of meeting its edges. */}
            <EntityAvatar name={agent.displayName} size={36} src={agent.avatarUrl} />
            <ItemCard.Content>
                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                <ItemCard.Description>{line}</ItemCard.Description>
            </ItemCard.Content>
        </ItemCard>
    );
}
