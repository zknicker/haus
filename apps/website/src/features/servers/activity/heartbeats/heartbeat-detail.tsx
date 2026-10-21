import { Button, Chip } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../components/ui/icon.tsx';
import { opensPlace } from '../../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';
import { formatShortTime } from '../../../../lib/format.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { DreamSheet } from '../../../members/agent-profile/dream-sheet.tsx';
import { chatPlace } from '../../../shell/tab-identity.ts';
import { serverChatRoute } from '../../server-routes.ts';
import { readMarkMeta, readOutcomeChip } from './heartbeat-marks-model.ts';
import {
    outcomeLabels,
    readDetailFacts,
    readKindLabel,
    type SelectedMark,
} from './heartbeats-model.ts';

/**
 * The selected mark, flat under the lanes on the log's own idiom, in three
 * tiers: who and how it ended (with the way to the dream and the trace) over a
 * meta row of time, duration and tokens; the report or the dream's summary at
 * a readable measure; and a label/value list of what became of it. Never a
 * card: the report is prose, so it runs its full measure instead of truncating.
 */
export function HeartbeatDetail({
    agent,
    onOpenTrace,
    selected,
    serverId,
    serverSlug,
}: {
    agent: ActivityLogAgent | undefined;
    onOpenTrace: (runId: string) => void;
    selected: SelectedMark;
    serverId: string;
    serverSlug: string;
}) {
    const { mark } = selected;
    const navigate = useNavigate();
    const [isDreamOpen, setDreamOpen] = React.useState(false);
    const chatId = mark.report?.postedChatId ?? null;
    const chat = useListedChat(serverId, chatId ?? '', chatId !== null);
    const place = chat ? chatPlace(chat) : null;
    const name = agent?.displayName ?? 'Agent';
    const chip = readOutcomeChip(mark);

    return (
        <section
            aria-label={`${name}, ${formatShortTime(mark.at)} ${readKindLabel(mark)}`}
            className="grid gap-4 border-separator border-b px-(--trace-pad) py-4 text-sm"
        >
            <div className="grid gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    <EntityAvatar name={name} size={20} src={agent?.avatarUrl} />
                    <span className="truncate font-medium">{name}</span>
                    <Chip
                        className={chip.isDream ? 'chip--dream' : undefined}
                        color={chip.color}
                        size="sm"
                        variant="soft"
                    >
                        {outcomeLabels[mark.outcome]}
                    </Chip>
                    <span className="text-muted text-xs">{readKindLabel(mark)}</span>
                    <span className="ms-auto flex shrink-0 items-center gap-1">
                        {mark.kind === 'nightly' && mark.dream && mark.runId ? (
                            <Button onPress={() => setDreamOpen(true)} size="sm" variant="tertiary">
                                Open dream
                                <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                            </Button>
                        ) : null}
                        {mark.runId ? (
                            <Button
                                onPress={() => mark.runId && onOpenTrace(mark.runId)}
                                size="sm"
                                variant="tertiary"
                            >
                                Open trace
                                <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                            </Button>
                        ) : null}
                    </span>
                </div>
                <p className="text-muted text-xs tabular-nums">{readMarkMeta(mark).join(' · ')}</p>
            </div>
            <DetailBody mark={mark} />
            <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-1.5">
                {readDetailFacts(mark, place).map((fact) => (
                    <React.Fragment key={fact.label}>
                        <dt className="text-muted">{fact.label}</dt>
                        <dd className="flex min-w-0 items-center gap-1 tabular-nums">
                            {fact.value}
                            {fact.label === 'Outcome' && chatId && chat ? (
                                <Button
                                    onPress={() => navigate(serverChatRoute(serverSlug, chatId))}
                                    size="sm"
                                    variant="tertiary"
                                    {...opensPlace}
                                >
                                    Open chat
                                </Button>
                            ) : null}
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
            {mark.kind === 'nightly' && mark.runId ? (
                <DreamSheet
                    agentId={selected.agentId}
                    onOpenChange={setDreamOpen}
                    runId={isDreamOpen ? mark.runId : null}
                    serverId={serverId}
                />
            ) : null}
        </section>
    );
}

function DetailBody({ mark }: { mark: SelectedMark['mark'] }) {
    const text = mark.dream ? mark.dream.summaryLine : (mark.report?.text ?? null);
    return text ? <p className="max-w-prose whitespace-pre-wrap leading-relaxed">{text}</p> : null;
}
