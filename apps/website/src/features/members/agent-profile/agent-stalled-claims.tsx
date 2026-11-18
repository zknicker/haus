import type { Agent } from '@haus/api';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useClaimRelease } from '../../../hooks/servers/use-claim-release.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { selectStalledClaims } from '../../servers/claims/stalled-claims.ts';
import { serverChatMessageRoute } from '../../servers/server-routes.ts';
import { ProfileListSection } from './profile-list-section.tsx';

/**
 * Claims this Agent took and did not finish: no run is coming back for them, so
 * a person decides what happens next. Claims have no page of their own (ADR
 * 0051); this is the one place their loose ends surface. Quiet unless there
 * are any, and each row opens its Chat at the claimed Message.
 */
export function AgentStalledClaims({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const claimRelease = useClaimRelease();
    const claims = useClaims(server.id).data?.claims;
    const stalled = React.useMemo(
        () =>
            selectStalledClaims(
                (claims ?? [])
                    .filter((item) => item.claim.assigneeAgentId === agent.id)
                    .map((item) => ({ ...item.claim, item }))
            ),
        [agent.id, claims]
    );
    if (stalled.length === 0) {
        return null;
    }

    return (
        <ProfileListSection count={stalled.length} title="Stopped before finishing">
            {stalled.map(({ item }, index) => (
                <React.Fragment key={item.message.id}>
                    {index > 0 ? <Separator /> : null}
                    {/* The row opens the Message; its menu sits beside it, never inside the button. */}
                    <div className="flex min-w-0 items-center gap-1">
                        <ItemCard<'button'>
                            className="relative min-w-0 flex-1 cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            onClick={() =>
                                navigate(
                                    serverChatMessageRoute(
                                        server.slug,
                                        item.claim.chatId,
                                        item.message.id
                                    )
                                )
                            }
                            render={(props) => <button type="button" {...props} />}
                        >
                            <PressableFeedback.Highlight />
                            <ItemCard.Content>
                                <ItemCard.Title>
                                    {messagePreviewLine(item.message.content)}
                                </ItemCard.Title>
                                <ItemCard.Description>
                                    {item.chatKind === 'channel'
                                        ? `#${item.chatName ?? 'channel'}`
                                        : 'DM'}
                                    {' · '}
                                    <RelativeTime value={item.claim.updatedAt} />
                                </ItemCard.Description>
                            </ItemCard.Content>
                        </ItemCard>
                        <StalledClaimMenu
                            onRelease={() =>
                                claimRelease.release({
                                    messageId: item.message.id,
                                    serverId: server.id,
                                    version: item.claim.version,
                                })
                            }
                            pending={claimRelease.isPending}
                        />
                    </div>
                </React.Fragment>
            ))}
        </ProfileListSection>
    );
}

/** A stalled claim's one action: release it, so another Agent or a person can take the Message. */
function StalledClaimMenu({ onRelease, pending }: { onRelease: () => void; pending: boolean }) {
    return (
        <Dropdown>
            <Button
                aria-label="Claim actions"
                isIconOnly
                isPending={pending}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={(key) => key === 'release' && onRelease()}>
                    <Dropdown.Item id="release" isDisabled={pending} textValue="Release claim">
                        <Label>Release claim</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
