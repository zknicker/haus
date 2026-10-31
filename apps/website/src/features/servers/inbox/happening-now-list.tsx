import { ItemCard } from '@heroui-pro/react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { CloudAgentKeycap } from '../../cloud-agents/cloud-agent-provider-mark.tsx';
import { CloudAgentStatusDisc } from '../../cloud-agents/cloud-agent-status-disc.tsx';
import { AgentAvatar } from '../../members/agent-avatar.tsx';
import type { HappeningNowRow } from './happening-now-rows.ts';
import { InboxRailMark, InboxRailRow, inboxMarkSize } from './inbox-rail-row.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';

/**
 * What is moving right now, as one list: the Cloud Agent work a delegation
 * left running, then the Agents currently in a turn. Both rows state elapsed
 * time, which is what separates working from stuck.
 *
 * It lives in the rail, or in the strip's popover, so each row stacks its
 * title over its subline. A work row's subline leads with its status — the
 * fact that changes while the row sits there — so when the column truncates,
 * the Chat and Agent it came from give way first; the status disc holds the
 * trailing edge.
 */
export function HappeningNowList({
    listId,
    onOpenRow,
    rows,
}: {
    /** Scopes layout animation, so the rail and the popover never pair rows. */
    listId: string;
    onOpenRow: (row: HappeningNowRow) => void;
    rows: readonly HappeningNowRow[];
}) {
    return (
        <InboxRowList
            emptyLabel="Nothing running."
            listId={listId}
            renderRow={(row) =>
                row.kind === 'work' ? (
                    <InboxRailRow label={row.work.title} onOpen={() => onOpenRow(row)}>
                        <InboxRailMark>
                            <span
                                className="flex items-center justify-center"
                                style={{ height: inboxMarkSize, width: inboxMarkSize }}
                            >
                                <CloudAgentKeycap
                                    provider={row.work.provider}
                                    size={inboxMarkSize}
                                />
                            </span>
                        </InboxRailMark>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.work.title}</ItemCard.Title>
                            <ItemCard.Description>
                                {`${row.work.statusText} · ${row.work.chatLabel} · ${row.work.agentName}`}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <CloudAgentStatusDisc state={row.work.state} />
                        </ItemCard.Action>
                    </InboxRailRow>
                ) : (
                    // Named for the turn, not the Agent alone: the Agents list
                    // beside it already has a row that is the Agent.
                    <InboxRailRow
                        label={`${row.agent.name}: ${row.agent.step}`}
                        onOpen={() => onOpenRow(row)}
                    >
                        <InboxRailMark>
                            {row.agent.agent ? (
                                <AgentAvatar agent={row.agent.agent} size={inboxMarkSize} />
                            ) : (
                                <EntityAvatar name={row.agent.name} size={inboxMarkSize} />
                            )}
                        </InboxRailMark>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.agent.name}</ItemCard.Title>
                            <ItemCard.Description>{row.agent.label}</ItemCard.Description>
                        </ItemCard.Content>
                    </InboxRailRow>
                )
            }
            rows={rows}
        />
    );
}
