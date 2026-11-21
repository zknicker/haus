import type { Agent, AgentWakePause, ModelConnectionsRead } from '@haus/api';
import { Alert } from '@heroui/react';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { computerLabel } from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import {
    type AgentConnectionIssue,
    agentConnectionIssue,
    connectionIssueFix,
    connectionIssueTitle,
} from './agent-model-connection-model.ts';
import { wakePauseBannerDescription } from './agent-wake-pause-model.ts';

type Computer = HausOutputs['computer']['list'][number];

/**
 * What the hover card warns about: a banner for a wake pause and one line for
 * the concrete fix. A runtime sign-in issue takes both, matching the profile;
 * a refused or missing model connection, which only an Agent on the runner
 * has, sits under the wake pause banner instead of hiding it.
 */
export type AgentHoverAttentionLine =
    | { kind: 'runtime-issue'; computer: Computer; runtimeId: string }
    | { kind: 'connection-issue'; issue: AgentConnectionIssue }
    | null;

export interface AgentHoverAttention {
    banner: AgentWakePause | null;
    line: AgentHoverAttentionLine;
}

export function agentHoverAttention(
    agent: Agent,
    computer: Computer | null,
    connections: Pick<ModelConnectionsRead, 'connections'> | undefined
) {
    const issue = agentRuntimeIssue(agent, computer?.reportedInventory ?? null);
    if (computer && issue) {
        return {
            banner: null,
            line: { computer, kind: 'runtime-issue', runtimeId: issue.runtimeId },
        } satisfies AgentHoverAttention;
    }
    const connectionIssue = connections ? agentConnectionIssue(agent, connections) : null;
    return {
        banner: agent.wakePause,
        line: connectionIssue ? { issue: connectionIssue, kind: 'connection-issue' } : null,
    } satisfies AgentHoverAttention;
}

export function AgentAttentionLine({
    agent,
    line,
}: {
    agent: Agent;
    line: AgentHoverAttentionLine;
}) {
    if (line?.kind === 'runtime-issue') {
        return (
            <AgentRuntimeIssueLine
                agent={agent}
                computer={line.computer}
                runtimeId={line.runtimeId}
            />
        );
    }
    if (line?.kind === 'connection-issue') {
        return (
            <p className="text-warning text-xs">
                {`${connectionIssueTitle(line.issue)}. ${connectionIssueFix[line.issue.kind]}.`}
            </p>
        );
    }
    return null;
}

export function AgentRuntimeIssueLine({
    agent,
    computer,
    runtimeId,
}: {
    agent: Agent;
    computer: Computer;
    runtimeId: string;
}) {
    return (
        <p className="text-warning text-xs">
            {runtimeIssueLabel(runtimeId)}. Sign in on {computerLabel(computer)} to let{' '}
            {agent.displayName} continue.
        </p>
    );
}

/** The edge-to-edge banner for an Agent whose automatic wakes are paused. */
export function AgentWakePauseBanner({ wakePause }: { wakePause: AgentWakePause }) {
    return (
        <Alert className="haus-hover-card__banner" status="danger">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Paused after repeated failures</Alert.Title>
                <Alert.Description>
                    {wakePauseBannerDescription(wakePause.nextProbeAt)}
                </Alert.Description>
            </Alert.Content>
        </Alert>
    );
}
