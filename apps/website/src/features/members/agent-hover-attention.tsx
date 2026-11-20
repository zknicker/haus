import type { Agent, AgentWakePause, ModelConnection } from '@haus/api';
import { Alert } from '@heroui/react';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { computerLabel } from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import { type AgentConnectionIssue, agentConnectionIssue } from './agent-model-connection-model.ts';
import { wakePauseBannerDescription } from './agent-wake-pause-model.ts';

type Computer = HausOutputs['computer']['list'][number];

/**
 * What the hover card warns about. A runtime sign-in issue, then a refused or
 * missing model connection, outrank a wake pause, matching the profile,
 * because each names the concrete fix.
 */
export type AgentHoverAttentionState =
    | { kind: 'runtime-issue'; computer: Computer; runtimeId: string }
    | { kind: 'connection-issue'; issue: AgentConnectionIssue }
    | { kind: 'wake-pause'; wakePause: AgentWakePause }
    | null;

export function agentHoverAttention(
    agent: Agent,
    computer: Computer | null,
    connections: readonly ModelConnection[] | undefined
): AgentHoverAttentionState {
    const issue = agentRuntimeIssue(agent, computer?.reportedInventory ?? null);
    if (computer && issue) {
        return { computer, kind: 'runtime-issue', runtimeId: issue.runtimeId };
    }
    const connectionIssue = connections ? agentConnectionIssue(agent, connections) : null;
    if (connectionIssue) {
        return { issue: connectionIssue, kind: 'connection-issue' };
    }
    return agent.wakePause ? { kind: 'wake-pause', wakePause: agent.wakePause } : null;
}

export function AgentAttentionLine({
    agent,
    attention,
}: {
    agent: Agent;
    attention: AgentHoverAttentionState;
}) {
    if (attention?.kind === 'runtime-issue') {
        return (
            <AgentRuntimeIssueLine
                agent={agent}
                computer={attention.computer}
                runtimeId={attention.runtimeId}
            />
        );
    }
    if (attention?.kind === 'connection-issue') {
        const { providerName } = attention.issue;
        return (
            <p className="text-warning text-xs">
                {attention.issue.kind === 'failed'
                    ? `${providerName} connection failed. Reconnect in Settings → Models.`
                    : `No ${providerName} connection. Connect one in Settings → Models.`}
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
