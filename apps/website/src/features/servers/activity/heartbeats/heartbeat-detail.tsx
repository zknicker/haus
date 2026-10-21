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
import { formatTurnDuration } from '../../../members/agent-profile/agent-turn-row-model.ts';
import { DreamSheet } from '../../../members/agent-profile/dream-sheet.tsx';
import { chatPlace } from '../../../shell/tab-identity.ts';
import { serverChatRoute } from '../../server-routes.ts';
import {
    formatDreamDelta,
    formatTokens,
    outcomeChipColor,
    outcomeLabels,
    readKindLabel,
    readMarkFate,
    type SelectedMark,
} from './heartbeats-model.ts';

/**
 * The selected mark, flat under the lanes on the log's own idiom: who, how it
 * ended, when and what it cost, the report (or the dream's summary), what became
 * of it, and the way to the run's trace. Never a card: the report is prose, so
 * it runs the full measure instead of truncating in a row.
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
    const meta = [
        `${formatShortTime(mark.at)} ${readKindLabel(mark)}`,
        mark.durationMs === null ? null : formatTurnDuration(mark.durationMs),
        formatTokens(mark.tokens) === null ? null : `${formatTokens(mark.tokens)} tokens`,
    ].filter(Boolean);

    return (
        <section
            aria-label={`${name}, ${formatShortTime(mark.at)} ${readKindLabel(mark)}`}
            className="grid gap-1.5 border-separator border-b px-(--trace-pad) py-2.5 text-sm"
        >
            <div className="flex min-w-0 items-center gap-2">
                <EntityAvatar name={name} size={16} src={agent?.avatarUrl} />
                <span className="truncate font-semibold">{name}</span>
                <Chip color={outcomeChipColor(mark.outcome)} size="sm" variant="soft">
                    {outcomeLabels[mark.outcome]}
                </Chip>
                <span className="min-w-0 truncate text-muted tabular-nums">{meta.join(' · ')}</span>
                <span className="ms-auto flex shrink-0 items-center gap-1">
                    {mark.kind === 'nightly' && mark.dream && mark.runId ? (
                        <Button onPress={() => setDreamOpen(true)} size="sm" variant="ghost">
                            Open dream
                            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                        </Button>
                    ) : null}
                    {mark.runId ? (
                        <Button
                            onPress={() => mark.runId && onOpenTrace(mark.runId)}
                            size="sm"
                            variant="ghost"
                        >
                            Open trace
                            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                        </Button>
                    ) : null}
                </span>
            </div>
            <DetailBody mark={mark} />
            <p className="flex items-center gap-1 text-muted">
                {readMarkFate(mark, place)}
                {chatId && chat ? (
                    <Button
                        onPress={() => navigate(serverChatRoute(serverSlug, chatId))}
                        size="sm"
                        variant="ghost"
                        {...opensPlace}
                    >
                        Open chat
                    </Button>
                ) : null}
            </p>
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
    if (mark.dream) {
        return (
            <div className="grid gap-0.5">
                {mark.dream.summaryLine ? <p>{mark.dream.summaryLine}</p> : null}
                <p className="text-muted tabular-nums">
                    {formatDreamDelta(mark.dream)}
                    {mark.dream.followUps > 0
                        ? ` · ${mark.dream.followUps} ${mark.dream.followUps === 1 ? 'follow-up' : 'follow-ups'}`
                        : null}
                </p>
            </div>
        );
    }
    return mark.report ? <p className="whitespace-pre-wrap">{mark.report.text}</p> : null;
}
