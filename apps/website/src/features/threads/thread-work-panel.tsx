import type { CloudAgentRun, CloudAgentWork, CloudAgentWorkLink } from '@haus/api';
import { Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useNavigate } from 'react-router-dom';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useCloudAgentWorkLinks } from '../../hooks/servers/use-cloud-agent-work.ts';
import { useOpenThread } from '../../hooks/threads/use-open-thread.ts';
import { threadPageRoute } from '../../hooks/threads/use-thread-opener.ts';
import { formatRelativeTime } from '../../lib/format.ts';
import { CloudAgentWorkCard } from '../cloud-agents/cloud-agent-work-card.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute } from '../servers/server-routes.ts';

const checkLabels = {
    failing: 'Checks failing',
    none: 'No checks',
    passing: 'Checks passing',
    pending: 'Checks running',
    unknown: 'Checks unknown',
} as const;

const reviewLabels = {
    approved: 'Approved',
    'changes-requested': 'Changes requested',
    none: 'No review',
    unknown: 'Review unknown',
} as const;

/** Everything about this Thread's jobs, in start order, on the page beside its transcript. */
export function ThreadWorkPanel({
    anchorMessageId,
    works,
}: {
    anchorMessageId: string;
    works: readonly CloudAgentWork[];
}) {
    return (
        <aside
            aria-label="Work"
            className="flex w-[22rem] shrink-0 flex-col gap-6 overflow-y-auto border-separator border-s p-4"
        >
            {works.map((work) => (
                <section className="flex flex-col gap-2" data-work-id={work.id} key={work.id}>
                    <CloudAgentWorkCard work={work} />
                    <PullRequestFacts work={work} />
                    <Runs runs={work.runs} />
                </section>
            ))}
            <LinkedFrom anchorMessageId={anchorMessageId} works={works} />
        </aside>
    );
}

function PullRequestFacts({ work }: { work: CloudAgentWork }) {
    const reading = work.pullRequest;
    if (!reading) {
        return null;
    }
    return (
        <div className="flex flex-col gap-0.5 text-muted text-sm">
            {reading.title ? <span className="text-foreground">{reading.title}</span> : null}
            <span>
                {checkLabels[reading.checks]} · {reviewLabels[reading.review]}
            </span>
            {reading.source === 'computer' ? (
                <span>Last read {formatRelativeTime(reading.observedAt)}</span>
            ) : null}
        </div>
    );
}

function Runs({ runs }: { runs: readonly CloudAgentRun[] }) {
    if (runs.length < 2) {
        return null;
    }
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Runs</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {runs.map((run) => (
                <ItemCard key={run.runId} variant="transparent">
                    <ItemCard.Content>
                        <ItemCard.Title>{runLine(run)}</ItemCard.Title>
                        {run.summary ? (
                            <ItemCard.Description>{run.summary}</ItemCard.Description>
                        ) : null}
                    </ItemCard.Content>
                </ItemCard>
            ))}
        </ItemCardGroup>
    );
}

function runLine(run: CloudAgentRun) {
    const status = run.status.charAt(0).toUpperCase() + run.status.slice(1);
    if (!(run.startedAt && run.terminalAt)) {
        return status;
    }
    const minutes = (Date.parse(run.terminalAt) - Date.parse(run.startedAt)) / 60_000;
    return `${status} · ${minutes < 1 ? 'under a minute' : `${Math.round(minutes)}m`}`;
}

function LinkedFrom({
    anchorMessageId,
    works,
}: {
    anchorMessageId: string;
    works: readonly CloudAgentWork[];
}) {
    const { server } = useServerContext();
    const links = useCloudAgentWorkLinks(
        server.id,
        works.map((work) => work.id)
    );
    const chats = useChats(server.id).data ?? [];
    const desktopOpen = useOpenThread();
    const navigate = useNavigate();
    const entries = uniqueConversations(links, anchorMessageId);
    if (entries.length === 0) {
        return null;
    }
    const open = (link: CloudAgentWorkLink) => {
        if (!link.anchorMessageId) {
            navigate(serverChatRoute(server.slug, link.chatId));
        } else if (desktopOpen) {
            desktopOpen(link.chatId, link.anchorMessageId);
        } else {
            navigate(threadPageRoute(server.slug, link.chatId, link.anchorMessageId));
        }
    };
    return (
        <div className="flex flex-col items-start gap-1">
            <span className="font-medium text-sm">Linked from</span>
            {entries.map((link) => {
                const chat = chats.find((candidate) => candidate.id === link.chatId);
                const name = chat?.kind === 'channel' ? `#${chat.name ?? 'channel'}` : 'DM';
                return (
                    <Button
                        key={`${link.chatId}:${link.anchorMessageId ?? ''}`}
                        onPress={() => open(link)}
                        size="sm"
                        variant="ghost"
                    >
                        {link.anchorMessageId ? `Thread in ${name}` : name}
                    </Button>
                );
            })}
        </div>
    );
}

/** One entry per conversation across the jobs, leaving out the Thread being read. */
function uniqueConversations(links: readonly CloudAgentWorkLink[], anchorMessageId: string) {
    const seen = new Map<string, CloudAgentWorkLink>();
    for (const link of links) {
        if (link.anchorMessageId !== anchorMessageId) {
            seen.set(`${link.chatId}\0${link.anchorMessageId ?? ''}`, link);
        }
    }
    return [...seen.values()];
}
