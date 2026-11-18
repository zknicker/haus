import type { ServerMember, ServerMemberDirectory } from '@haus/api/membership';
import { Button, Chip, Separator } from '@heroui/react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { humanDisplayName } from './human-identity.ts';
import { type ServerMemberRowAction, serverMemberRowActions } from './server-member-actions.ts';
import { settingsHumanRoute } from './server-routes.ts';

/**
 * The humans on one Server. Rows render from the directory the Server returned,
 * including the viewer's own role, so an affordance can never disagree with the
 * Server that judges it.
 */
export function ServerMemberList({
    directory,
    onChoose,
    serverSlug,
}: {
    directory: ServerMemberDirectory;
    onChoose(member: ServerMember, action: ServerMemberRowAction): void;
    serverSlug: string;
}) {
    return (
        <>
            {directory.members.map((member, index) => (
                <React.Fragment key={member.userId}>
                    {index > 0 ? <Separator /> : null}
                    <div
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                        data-member-id={member.userId}
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <EntityAvatar name={humanDisplayName(member)} size="sm" />
                            {/* Only the name opens the profile: the row's own
                                controls are destructive, so the whole row must
                                not be a click target. */}
                            <Link
                                className="text-foreground focus-visible:ring-focus min-w-0 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                                to={settingsHumanRoute(serverSlug, member.userId)}
                            >
                                {humanDisplayName(member)}
                            </Link>
                            <Chip size="sm" variant="secondary">
                                <Chip.Label className="capitalize">{member.role}</Chip.Label>
                            </Chip>
                            {member.userId === directory.viewerUserId ? (
                                <span className="text-muted text-sm">you</span>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            {serverMemberRowActions(directory, member).map((action) => (
                                // A disabled button receives no pointer events, so a
                                // Tooltip on it would never open. The reason the
                                // Server refuses the action hangs off the wrapper.
                                <span key={action.kind} title={action.disabledReason ?? undefined}>
                                    <Button
                                        isDisabled={action.disabledReason !== null}
                                        onPress={() => onChoose(member, action)}
                                        size="sm"
                                        variant={actionVariant(action)}
                                    >
                                        {action.label}
                                    </Button>
                                </span>
                            ))}
                        </div>
                    </div>
                </React.Fragment>
            ))}
        </>
    );
}

/** Departures read as destructive; Owner-level changes read as deliberate. */
function actionVariant(action: ServerMemberRowAction) {
    if (action.kind === 'leave' || action.kind === 'remove') {
        return 'danger-soft' as const;
    }

    return action.requiresSlug ? ('outline' as const) : ('ghost' as const);
}
