import { rm } from 'node:fs/promises';
import { agentPathSegment } from '@haus/api';
import type { AgentReset } from '../run-context.ts';
import { sessionAuthority } from './session-authority.ts';

export function agentSessions(input: {
    agentDir: (agentId: string) => string;
    dataDir: string;
    release: (agentId: string) => unknown;
}) {
    const sessions = sessionAuthority(input.dataDir);
    const announced = new Map<string, number>();
    const retired = new Set<string>();

    const discard = async (agentId: string, kind: 'full' | 'session') => {
        await input.release(agentId);
        if (kind === 'full') {
            await rm(input.agentDir(agentId), { force: true, recursive: true });
        }
    };

    return {
        announce(agentId: string, reset: AgentReset) {
            agentPathSegment(agentId);
            if (reset.scope === 'retire') {
                retired.add(agentId);
            }
            if (reset.scope === 'full' || reset.scope === 'session') {
                const generation = Math.max(reset.sessionGeneration, announced.get(agentId) ?? 0);
                announced.set(agentId, generation);
            }
        },
        async apply(agentId: string, reset: AgentReset) {
            if (reset.scope === 'restart') {
                await input.release(agentId);
                return;
            }
            if (reset.scope === 'retire') {
                await discard(agentId, 'full');
                await sessions.forget(agentId);
                return;
            }
            if (reset.sessionGeneration <= ((await sessions.applied(agentId)) ?? 0)) {
                return;
            }
            await discard(agentId, reset.scope);
            await sessions.advance(agentId, reset.sessionGeneration);
        },
        async enter(run: {
            sessionResetKind: 'full' | 'session';
            start: { agentId: string; sessionGeneration: number };
        }) {
            const { agentId, sessionGeneration } = run.start;
            if (retired.has(agentId) || sessionGeneration < (announced.get(agentId) ?? 0)) {
                return false;
            }
            const applied = await sessions.applied(agentId);
            if (applied !== null && sessionGeneration <= applied) {
                return sessionGeneration === applied;
            }
            if (applied !== null) {
                await discard(agentId, run.sessionResetKind);
            }
            await sessions.advance(agentId, sessionGeneration);
            return true;
        },
        supersedes(reset: AgentReset, generation: number) {
            return (
                reset.scope === 'retire' ||
                reset.scope === 'restart' ||
                ((reset.scope === 'full' || reset.scope === 'session') &&
                    generation < reset.sessionGeneration)
            );
        },
    };
}
