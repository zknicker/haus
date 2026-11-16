import type { Agent } from '@haus/api';
import { Separator } from '@heroui/react';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { selectStalledClaims } from '../../servers/claims/stalled-claims.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { ProfileListSection } from './profile-list-section.tsx';

/**
 * Claims this Agent took and did not finish: no run is coming back for them, so
 * a person decides what happens next. Claims have no page of their own (ADR
 * 0051); this is the one place their loose ends surface. Quiet unless there
 * are any, and each row opens the claim's Thread.
 */
export function AgentStalledClaims({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
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
                    <ItemCard<'button'>
                        className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        onClick={() =>
                            navigate(
                                `${serverChatRoute(server.slug, item.claim.chatId)}?claim=${encodeURIComponent(item.message.id)}`
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
                </React.Fragment>
            ))}
        </ProfileListSection>
    );
}
