import { useServerContext } from '../server-context.ts';
import { ClaimAssignee } from './claim-assignee.tsx';
import { ClaimMetadata } from './claim-metadata.tsx';
import type { ClaimItem } from './claim-model.ts';

/**
 * A Board card's controls. People hand work to an Agent here; they never
 * take a claim themselves (ADR 0037).
 */
export function ClaimActions({ claim }: { claim: ClaimItem }) {
    const { server } = useServerContext();
    return (
        <div className="relative z-20 flex flex-wrap items-center gap-2">
            <ClaimMetadata claim={claim} />
            <ClaimAssignee claim={claim} serverId={server.id} />
        </div>
    );
}
