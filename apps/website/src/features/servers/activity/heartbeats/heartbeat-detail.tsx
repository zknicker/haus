import { Button, Card, Chip } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../../components/ui/icon.tsx';
import { opensPlace } from '../../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useListedChat } from '../../../../hooks/servers/use-chats.ts';
import { formatShortTime } from '../../../../lib/format.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { DreamSheet } from '../../../members/agent-profile/dream-sheet.tsx';
import { chatPlace } from '../../../shell/tab-identity.ts';
import { serverChatRoute } from '../../server-routes.ts';
import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { readGlyphKind, readMarkMeta, readOutcomeChip } from './heartbeat-marks-model.ts';
import {
    outcomeLabels,
    readDetailFacts,
    readKindLabel,
    type SelectedMark,
} from './heartbeats-model.ts';

/**
 * The selected mark as a card under the lanes: its glyph badge at the left, and
 * beside it who and how it ended (with the way to the dream and the trace) over
 * a meta line of time, duration and tokens; the report or the dream's summary
 * at a readable measure, never truncated; and a row of what became of it.
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
            className="border-separator border-b px-(--trace-pad) py-3 text-sm"
        >
            <Card>
                <Card.Content className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5">
                    <HeartbeatGlyph
                        isFailed={mark.outcome === 'failed'}
                        kind={readGlyphKind(mark)}
                        size={40}
                    />
                    <div className="grid min-w-0 gap-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="truncate font-semibold">{name}</span>
                                <Chip
                                    className={chip.isDream ? 'chip--dream' : undefined}
                                    color={chip.color}
                                    size="sm"
                                    variant="soft"
                                >
                                    {outcomeLabels[mark.outcome]}
                                </Chip>
                                <span className="text-muted text-xs tabular-nums">
                                    {[readKindLabel(mark), ...readMarkMeta(mark)].join(' · ')}
                                </span>
                            </div>
                            <span className="flex shrink-0 items-center gap-1">
                                {mark.kind === 'nightly' && mark.dream && mark.runId ? (
                                    <Button
                                        onPress={() => setDreamOpen(true)}
                                        size="sm"
                                        variant="tertiary"
                                    >
                                        Open dream
                                        <Icon
                                            aria-hidden="true"
                                            icon={ArrowUpRight01Icon}
                                            size={16}
                                        />
                                    </Button>
                                ) : null}
                                {mark.runId ? (
                                    <Button
                                        onPress={() => mark.runId && onOpenTrace(mark.runId)}
                                        size="sm"
                                        variant="tertiary"
                                    >
                                        Open trace
                                        <Icon
                                            aria-hidden="true"
                                            icon={ArrowUpRight01Icon}
                                            size={16}
                                        />
                                    </Button>
                                ) : null}
                            </span>
                        </div>
                        <DetailBody mark={mark} />
                        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                            {readDetailFacts(mark, place).map((fact) => (
                                <div className="flex min-w-0 items-center gap-1.5" key={fact.label}>
                                    <dt className="text-muted">{fact.label}</dt>
                                    <dd className="flex min-w-0 items-center gap-1 font-medium tabular-nums">
                                        {fact.value}
                                        {fact.label === 'Outcome' && chatId && chat ? (
                                            <Button
                                                onPress={() =>
                                                    navigate(serverChatRoute(serverSlug, chatId))
                                                }
                                                size="sm"
                                                variant="tertiary"
                                                {...opensPlace}
                                            >
                                                Open chat
                                            </Button>
                                        ) : null}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </Card.Content>
            </Card>
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
    return text ? (
        <p className="max-w-[70ch] whitespace-pre-wrap text-[13.5px] leading-relaxed">{text}</p>
    ) : null;
}
