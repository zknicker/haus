import * as React from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useClaims } from '../../../hooks/servers/use-claims.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useServerContext } from '../server-context.ts';
import { type ClaimItem, filterClaims, toClaimItem } from './claim-model.ts';
import { ClaimState } from './claim-state.tsx';
import { useClaimView } from './claim-view.ts';
import { ClaimBoard, ClaimList } from './claim-views.tsx';

export function ClaimContent({ onOpenClaim }: { onOpenClaim: (claim: ClaimItem) => void }) {
    const { server } = useServerContext();
    const agents = useAgents(server.id);
    const humans = useHumanDirectory(server.id);
    const { filters, layout } = useClaimView();
    const { assignee, background, chatId, labelId, priority, status, view } = filters;
    // The Board and List read the narrow lens; the background tier joins it
    // only when the reader asks for it in the topbar.
    const claimsQuery = useClaims(server.id, chatId ?? undefined, {
        includeBackground: background,
    });
    const claims = React.useMemo(
        () =>
            claimsQuery.data?.claims.map((item) => toClaimItem(item, humans, agents.data ?? [])) ??
            [],
        [agents.data, humans, claimsQuery.data]
    );
    const filtered = React.useMemo(
        () => filterClaims(claims, { assignee, labelId, priority, status, view }),
        [assignee, labelId, priority, status, claims, view]
    );
    // The chat filter narrows the query itself, so a filtered-out chat comes
    // back with no claims at all. Without this the page would claim the Server
    // has no claims when it only has none matching. Every other filter runs
    // over `claims` in memory, so an empty `claims` means there is genuinely
    // nothing to filter — including under the default `active` lens, which is
    // the page's own standing view rather than something the reader set.
    const isFiltered = chatId !== null;

    if (claimsQuery.error) {
        return (
            <ClaimState
                description={claimsQuery.error.message}
                title="Tasks unavailable"
                tone="error"
            />
        );
    }
    if (!claimsQuery.data) {
        return (
            <div aria-busy="true" className="min-h-0 flex-1">
                <span className="sr-only">Loading tasks</span>
            </div>
        );
    }
    if (claims.length === 0 && !isFiltered) {
        return (
            <ClaimState
                description="Create a task from a new message. Its Thread becomes the work surface."
                title="No tasks yet"
            />
        );
    }
    if (filtered.length === 0) {
        return (
            <ClaimState description="Drop a filter to see more tasks." title="No matching tasks" />
        );
    }
    if (layout === 'board') {
        return <ClaimBoard claims={filtered} onOpenClaim={onOpenClaim} />;
    }
    return <ClaimList claims={filtered} onOpenClaim={onOpenClaim} />;
}
