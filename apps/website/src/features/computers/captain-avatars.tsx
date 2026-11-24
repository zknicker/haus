import { Avatar, AvatarGroup, Tooltip } from '@heroui/react';
import { getEntityInitials } from '../../components/ui/entity-avatar.tsx';
import type { AccessCaptain } from './agent-access-model.ts';

export function CaptainAvatars({ captains }: { captains: readonly AccessCaptain[] }) {
    return (
        <AvatarGroup aria-label="Captains with access" max={4} role="group" size="sm">
            {captains.map((captain) => (
                <Tooltip delay={0} key={`${captain.id}:${captain.avatarUrl ?? ''}`}>
                    <Tooltip.Trigger<'span'>
                        aria-label={captain.displayName}
                        render={({ color: _color, ...props }) => <Avatar {...props} size="sm" />}
                        role="img"
                    >
                        {captain.avatarUrl ? (
                            <Avatar.Image
                                alt={`${captain.displayName} avatar`}
                                src={captain.avatarUrl}
                            />
                        ) : null}
                        <Avatar.Fallback>{getEntityInitials(captain.displayName)}</Avatar.Fallback>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{captain.displayName}</Tooltip.Content>
                </Tooltip>
            ))}
        </AvatarGroup>
    );
}
