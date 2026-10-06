import * as React from 'react';

/** The Agent whose workspace a trace's files live in. */
export interface TurnTraceWorkspace {
    readonly agentId: string;
    readonly serverId: string;
}

/**
 * What every row of one trace shares: the turn's time axis, so each waterfall
 * bar sits on the same scale at any depth, and the workspace an image step
 * previews from. Null workspace (no Agent identity) degrades previews to names.
 */
export interface TurnTraceScope {
    readonly axisMs: number;
    readonly workspace: TurnTraceWorkspace | null;
}

const TurnTraceScopeContext = React.createContext<TurnTraceScope>({
    axisMs: 0,
    workspace: null,
});

export function TurnTraceScopeProvider({
    children,
    scope,
}: {
    children: React.ReactNode;
    scope: TurnTraceScope;
}) {
    return <TurnTraceScopeContext value={scope}>{children}</TurnTraceScopeContext>;
}

export function useTurnTraceScope(): TurnTraceScope {
    return React.use(TurnTraceScopeContext);
}
