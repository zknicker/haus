import { type Agent, openIssueStates } from '@haus/api';
import { Button, Dropdown, Label } from '@heroui/react';
import {
    AlertCircleIcon,
    BubbleChatQuestionIcon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useIssueList } from '../../../hooks/issues/use-issue-list.ts';
import { useClaimRelease } from '../../../hooks/servers/use-claim-release.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { selectStalledClaims } from '../../servers/claims/stalled-claims.ts';
import { serverChatMessageRoute } from '../../servers/server-routes.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import {
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
    useCaptainListCollapse,
} from '../captain-list.tsx';
import { issuesWaitingOnPeople } from './captain-model.ts';

export function CaptainNeedsYou({
    agent,
    onOpenIssue,
    server,
}: {
    agent: Agent;
    onOpenIssue: (issueId: string) => void;
    server: ServerDetail;
}) {
    const navigate = useNavigate();
    const now = useRelativeNow(60_000);
    const humans = useHumanDirectory(server.id);
    const claimRelease = useClaimRelease();
    const claims = useClaims(server.id).data?.claims;
    const filed = useIssueList(server.id, {
        creator: { agentId: agent.id, kind: 'captain' },
        states: [...openIssueStates],
    }).data;
    const issues = React.useMemo(() => issuesWaitingOnPeople(filed ?? []), [filed]);
    const stalled = React.useMemo(
        () =>
            selectStalledClaims(
                (claims ?? [])
                    .filter((item) => item.claim.assigneeAgentId === agent.id)
                    .map((item) => ({ ...item.claim, item }))
            ),
        [agent.id, claims]
    );
    const collapse = useCaptainListCollapse();
    const count = issues.length + stalled.length;
    if (count === 0) {
        return null;
    }

    return (
        <CaptainListGroup collapse={collapse} count={count} title="Needs you">
            <CaptainListRows
                label="Needs you"
                onAction={(id) => {
                    if (issues.some((issue) => issue.id === id)) {
                        onOpenIssue(id);
                        return;
                    }
                    const claim = stalled.find(({ item }) => item.message.id === id);
                    if (claim) {
                        navigate(serverChatMessageRoute(server.slug, claim.item.claim.chatId, id));
                    }
                }}
            >
                {issues.map((issue) => (
                    <CaptainListRow
                        age={taskAge({ createdAt: issue.updatedAt }, now)}
                        glyph={
                            <span className="text-danger flex" title="Waiting on a person">
                                <Icon aria-hidden="true" icon={AlertCircleIcon} size={14} />
                            </span>
                        }
                        id={issue.id}
                        key={issue.id}
                        lead={issue.code}
                        note={
                            issue.assignee?.kind === 'user' ? (
                                <span className="captain-list__person">
                                    <EntityAvatar
                                        name={humans.name(issue.assignee.userId)}
                                        size={16}
                                        src={humans.avatarUrl(issue.assignee.userId)}
                                    />
                                    {humans.name(issue.assignee.userId)}
                                </span>
                            ) : null
                        }
                        textValue={`${issue.code} ${issue.title}`}
                        title={issue.title}
                    />
                ))}
                {stalled.map(({ item }) => (
                    <CaptainListRow
                        age={taskAge({ createdAt: item.claim.updatedAt }, now)}
                        glyph={
                            <span className="text-warning flex" title="No reply">
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
                        note={item.chatKind === 'channel' ? `#${item.chatName ?? 'channel'}` : 'DM'}
                        textValue={messagePreviewLine(item.message.content)}
                        title={`Dropped “${messagePreviewLine(item.message.content)}”`}
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
