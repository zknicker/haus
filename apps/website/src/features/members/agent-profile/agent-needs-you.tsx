import type { Agent } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import { BubbleChatQuestionIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useClaimRelease } from '../../../hooks/servers/use-claim-release.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { selectStalledClaims } from '../../servers/claims/stalled-claims.ts';
import { serverChatMessageRoute } from '../../servers/server-routes.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import { CaptainListGroup, CaptainListRow, CaptainListRows } from './captain-list.tsx';

export function AgentNeedsYou({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const now = useRelativeNow(60_000);
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
        <CaptainListGroup count={stalled.length} title="Needs you">
            <CaptainListRows
                label="Needs you"
                onAction={(id) => {
                    const claim = stalled.find(({ item }) => item.message.id === id);
                    if (claim) {
                        navigate(serverChatMessageRoute(server.slug, claim.item.claim.chatId, id));
                    }
                }}
            >
                {stalled.map(({ item }) => (
                    <CaptainListRow
                        age={taskAge({ createdAt: item.claim.updatedAt }, now)}
                        glyph={
                            <span className="text-danger flex" title="No reply">
                                <Icon aria-hidden="true" icon={BubbleChatQuestionIcon} size={14} />
                            </span>
                        }
                        id={item.message.id}
                        key={item.message.id}
                        menu={
                            <ClaimMenu
                                onRelease={() =>
                                    claimRelease.release({
                                        messageId: item.message.id,
                                        serverId: server.id,
                                        version: item.claim.version,
                                    })
                                }
                                pending={claimRelease.isPending}
                            />
                        }
                        place={
                            item.chatKind === 'channel' ? `#${item.chatName ?? 'channel'}` : 'DM'
                        }
                        status="No reply"
                        textValue={messagePreviewLine(item.message.content)}
                        title={messagePreviewLine(item.message.content)}
                    />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}

function ClaimMenu({ onRelease, pending }: { onRelease: () => void; pending: boolean }) {
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
