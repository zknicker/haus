import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useOpenAsks } from '../../../hooks/servers/use-open-asks.ts';
import { useTasks } from '../../../hooks/servers/use-tasks.ts';
import { useServerContext } from '../server-context.ts';
import { tasksRoute } from '../server-routes.ts';
import { toTaskItem } from '../tasks/task-model.ts';
import { InboxSection, InboxSectionPending } from './inbox-section.tsx';
import { useInboxView } from './inbox-view.ts';
import { toNeedsYouAsks } from './needs-you-asks.ts';
import { NeedsYouList } from './needs-you-list.tsx';
import { type NeedsYouRow, needsYouRowTarget, toNeedsYouRows } from './needs-you-rows.ts';
import { selectStalledClaims } from './stalled-claims.ts';

/**
 * Work waiting on this human: open Asks addressed to them, then claims an
 * Agent took and stopped short of finishing. Two records, one list — see
 * `needs-you-rows.ts` for why they share a row rather than a card.
 *
 * A failed Server onboarding is deliberately not here. The Cove gate in
 * `features/onboarding/cove-onboarding-route.tsx` holds every owner on the
 * setup screen until onboarding completes, so the only person who could reach
 * an Inbox row about it is a member who cannot act on it.
 *
 * Tasks are not here. A task is the Agent's own ledger, and the Tasks page
 * already leads with its "Needs your review" group; an Ask is the record that
 * addresses a person, so duplicating review rows here only made the section
 * long enough that the Asks stopped being the point.
 *
 * The stalled claims read the same default lens the Board does: a claim whose
 * run settled unfinished is stamped tracked by then, so widening past the
 * background tier would only fetch rows this section discards.
 */
export function InboxNeedsYou() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const { openAsk } = useInboxView();
    const asks = useOpenAsks(server.id);
    const tasks = useTasks(server.id);
    const humans = useHumanDirectory(server.id);
    const agents = useAgents(server.id);
    const agentById = React.useMemo(
        () => new Map((agents.data ?? []).map((agent) => [agent.id, agent])),
        [agents.data]
    );
    const rows = React.useMemo(() => {
        const taskItems = (tasks.data?.tasks ?? []).map((item) =>
            toTaskItem(item, humans, agents.data ?? [])
        );
        return toNeedsYouRows(
            toNeedsYouAsks(asks.data ?? [], humans, agents.data ?? []),
            selectStalledClaims(taskItems)
        );
    }, [agents.data, asks.data, humans, tasks.data]);
    // The deep link comes off the row's payload, never off `row.id`: that id is
    // namespaced by kind to keep the list keys distinct, and the Message it
    // points at lives on the Ask or the claim.
    const openRow = (row: NeedsYouRow) => {
        if (row.kind === 'ask') {
            openAsk(needsYouRowTarget(row));
            return;
        }
        navigate(`${tasksRoute(server.slug)}?task=${encodeURIComponent(needsYouRowTarget(row))}`);
    };
    // Both reads are the same claim — that nothing needs you — so the section
    // stays neutral until both have settled rather than emptying, then filling.
    const settled = Boolean(asks.data && tasks.data);

    return (
        <InboxSection title="Needs you">
            {settled ? (
                <NeedsYouList agentById={agentById} onOpenRow={openRow} rows={rows} />
            ) : (
                <InboxSectionPending label="Loading what needs you" />
            )}
        </InboxSection>
    );
}
