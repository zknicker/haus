import { realpath } from 'node:fs/promises';
import type { DaemonRuntime } from '../../daemon-runtime.ts';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer, HostToolSession } from '../../host-tools/mcp-server.ts';
import { type GrokCredential, resolveGrokCredential } from './grok-auth.ts';
import { openGrokAcpSession } from './grok-handshake.ts';
import {
    grokHome,
    grokLaunchAllowsAutoApproval,
    grokLaunchEnv,
    grokLaunchFingerprint,
    grokSessionMeta,
    prepareGrokHome,
} from './grok-launch.ts';
import { grokRequestHandler } from './grok-permissions.ts';
import { type GrokProcess, type GrokWireFrame, spawnGrokProcess } from './grok-process.ts';
import { createWorkspacePaths, type WorkspacePaths } from './workspace-paths.ts';

/** Everything one Grok launch is bound to. */
export interface GrokLaunchFacts {
    readonly args: readonly string[];
    readonly command: readonly [string, ...string[]];
    readonly env: Readonly<Record<string, string>>;
    readonly fetch?: typeof fetch;
    readonly homeDir: string;
    readonly hostGrokHomeDir?: string;
    readonly hostHomeDir?: string;
    readonly hostToolServer: HostToolServer;
    readonly instructions: string;
    readonly modelId: string;
    readonly runtime: DaemonRuntime;
    readonly tools: HostToolSet;
    readonly wireTap?: (frame: GrokWireFrame) => void;
    readonly workspaceDir: string;
}

/** A running Grok process with its open ACP session. */
export interface GrokLive {
    readonly credential: GrokCredential;
    readonly fingerprint: string;
    readonly hostServerName: string;
    readonly hostTools: HostToolSession;
    readonly isResume: boolean;
    modelId: string;
    readonly paths: WorkspacePaths;
    readonly process: GrokProcess;
    readonly sessionId: string;
    /** The session tells the request handler whether a turn is running. */
    turnRunning: boolean;
}

export function launchFingerprint(facts: GrokLaunchFacts): string {
    return grokLaunchFingerprint({
        args: facts.args,
        command: facts.command,
        cwd: facts.workspaceDir,
        env: facts.env,
        homeDir: facts.homeDir,
        instructions: facts.instructions,
    });
}

/** Spawns Grok and opens (or loads) its session; any failure leaves nothing running. */
export async function launchGrokLive(
    facts: GrokLaunchFacts,
    resumeSessionId: string | undefined,
    signal?: AbortSignal
): Promise<GrokLive> {
    signal?.throwIfAborted();
    await prepareGrokHome(facts);
    const childEnv = grokLaunchEnv({ credentialEnv: {}, env: facts.env, homeDir: facts.homeDir });
    const credential = await resolveGrokCredential({
        env: childEnv,
        fetch: facts.fetch,
        grokHome: grokHome(facts.homeDir),
    });
    signal?.throwIfAborted();
    const hostTools = facts.hostToolServer.openSession(facts.tools);
    const child = spawnGrokProcess({
        args: facts.args,
        command: facts.command,
        cwd: facts.workspaceDir,
        env: credential.kind === 'subscription' ? { ...childEnv, ...credential.env } : childEnv,
        runtime: facts.runtime,
        wireTap: facts.wireTap,
    });
    let sessionId: string | undefined;
    const live = { turnRunning: false };
    child.connection.setRequestHandler(
        grokRequestHandler({
            autoApprove: grokLaunchAllowsAutoApproval(facts.args, grokSessionMeta()),
            isTurnRunning: () => live.turnRunning,
            sessionId: () => sessionId,
        })
    );
    // The catch below awaits this same (memoized) termination and reports its failure.
    const onAbort = () => {
        child.terminate().catch(() => undefined);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const opened = await openGrokAcpSession({
            connection: child.connection,
            credential,
            cwd: facts.workspaceDir,
            hostTools: hostTools.mcp,
            modelId: facts.modelId,
            resumeSessionId,
            signal,
        });
        sessionId = opened.sessionId;
        return Object.assign(live, {
            credential,
            fingerprint: launchFingerprint(facts),
            hostServerName: hostTools.mcp.name,
            hostTools,
            isResume: opened.isResume,
            modelId: facts.modelId,
            paths: createWorkspacePaths([facts.workspaceDir, await realpath(facts.workspaceDir)]),
            process: child,
            sessionId: opened.sessionId,
        });
    } catch (error) {
        await closeGrokLive({ hostTools, process: child });
        throw signal?.aborted ? signal.reason : error;
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}

/** Ends the process and revokes its host-tool session. */
export async function closeGrokLive(live: Pick<GrokLive, 'hostTools' | 'process'>): Promise<void> {
    live.hostTools.close();
    await live.process.terminate();
}
