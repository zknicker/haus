import type { Agent, AgentDreamSummary } from '@haus/api';
import { Button, Separator } from '@heroui/react';
import * as React from 'react';
import { useAgentDreams } from '../../../hooks/members/use-agent-dreams.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { DreamRow } from './dream-row.tsx';
import { DreamSheet } from './dream-sheet.tsx';
import { ProfileListSection } from './profile-list-section.tsx';

const recentDreamLimit = 4;

/**
 * Each night's private memory pass, as a list on the profile. The hub shows the
 * last few nights with a way into the Dreams section; the section shows every
 * one the Server keeps. Open to every member: a dream is a record of what the
 * Agent now remembers. The hub shows no Dreams section until there is a dream,
 * and nothing while the read is pending.
 */
export function AgentDreams({
    agent,
    onSeeAll,
    server,
}: {
    agent: Agent;
    /** Present on the hub, which shows only the latest nights. */
    onSeeAll?: () => void;
    server: ServerDetail;
}) {
    const dreams = useAgentDreams(server.id, agent.id);
    const [openRunId, setOpenRunId] = React.useState<string | null>(null);
    const all = dreams.data?.dreams ?? [];
    if (!dreams.data || (onSeeAll && all.length === 0)) {
        return null;
    }
    const shown = onSeeAll ? all.slice(0, recentDreamLimit) : all;

    return (
        <>
            <ProfileListSection
                action={
                    onSeeAll ? (
                        <Button onPress={onSeeAll} size="sm" variant="secondary">
                            See all
                        </Button>
                    ) : undefined
                }
                count={onSeeAll ? undefined : all.length}
                title="Dreams"
            >
                {shown.length === 0 ? (
                    <ProfileListSection.Empty>
                        {agent.displayName} hasn't dreamed yet.
                    </ProfileListSection.Empty>
                ) : (
                    <DreamRows dreams={shown} onOpen={setOpenRunId} />
                )}
            </ProfileListSection>
            <DreamSheet
                agentId={agent.id}
                onOpenChange={(isOpen) => !isOpen && setOpenRunId(null)}
                runId={openRunId}
                serverId={server.id}
            />
        </>
    );
}

function DreamRows({
    dreams,
    onOpen,
}: {
    dreams: readonly AgentDreamSummary[];
    onOpen: (runId: string) => void;
}) {
    return dreams.map((dream, index) => (
        <React.Fragment key={dream.runId}>
            {index > 0 ? <Separator /> : null}
            <DreamRow dream={dream} onOpen={() => onOpen(dream.runId)} />
        </React.Fragment>
    ));
}
