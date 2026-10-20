import { existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeDriver } from '../driver.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import type { WarmProcess, WarmSlot } from '../warm-pool.ts';
import { selectModel } from './grok-handshake.ts';
import { grokLaunchArgs } from './grok-launch.ts';
import {
    closeGrokLive,
    type GrokLaunchFacts,
    type GrokLive,
    GrokWarmProcess,
    launchFingerprint,
    launchGrokLive,
} from './grok-live.ts';
import type { GrokWireFrame } from './grok-process.ts';
import { grokResumeSessionId } from './grok-resume.ts';
import { GrokSession } from './grok-session.ts';

/** One Grok Build turn's launch facts (the executor's turn input plus driver options). */
export interface GrokDriverOptions {
    /** argv prefix that runs Grok; defaults to the operator's installed `grok`. */
    readonly command?: readonly [string, ...string[]];
    /** The runtime process's launch env (Haus CLI, PATH, runner token). */
    readonly env: Record<string, string>;
    readonly fetch?: typeof fetch;
    readonly homeDir: string;
    readonly hostGrokHomeDir?: string;
    readonly hostHomeDir?: string;
    /** The Computer's host-tool MCP server; each process gets its own scope. */
    readonly hostToolServer: Pick<HostToolServer, 'openSession'>;
    /** The composed Agent instructions, installed as `$GROK_HOME/AGENTS.md`. */
    readonly instructions: string;
    readonly modelId: string;
    /** Ties every process to Computer shutdown. */
    readonly processes?: RuntimeProcessRegistry;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly tools: HostToolSet;
    /** Where the session parks its process between turns. */
    readonly warm: WarmSlot;
    /** Fixture capture only: observes every ACP line in both directions. */
    readonly wireTap?: (frame: GrokWireFrame) => void;
    readonly workspaceDir: string;
}

/**
 * The Grok Build runtime driver: `grok agent stdio` spoken to directly over ACP, one long-lived
 * process per Agent session (specs/runtime-drivers.md).
 */
export function createGrokDriver(options: GrokDriverOptions): RuntimeDriver {
    const facts: GrokLaunchFacts = {
        args: grokLaunchArgs(options.reasoningEffort),
        command: options.command ?? resolveGrokCommand(options),
        env: options.env,
        fetch: options.fetch,
        homeDir: options.homeDir,
        hostGrokHomeDir: options.hostGrokHomeDir,
        hostHomeDir: options.hostHomeDir,
        hostToolServer: options.hostToolServer,
        instructions: options.instructions,
        modelId: options.modelId,
        processes: options.processes,
        tools: options.tools,
        wireTap: options.wireTap,
        workspaceDir: options.workspaceDir,
    };
    const { key, pool } = options.warm;
    const relaunch = async (previous: GrokLive) => {
        await closeGrokLive(previous);
        return await launchGrokLive(facts, previous.sessionId);
    };
    const park = (live: GrokLive) =>
        pool.park(
            key,
            {
                launchKey: live.fingerprint,
                nativeSessionId: live.sessionId,
                runtimeId: 'grok-build',
            },
            new GrokWarmProcess(live)
        );
    return {
        // Grok installs nothing before a session: instructions are written on every launch.
        bootstrapFingerprint: () => Promise.resolve(null),
        openSession: async ({ resumeFrom, signal }) => {
            const resumeId = grokResumeSessionId(resumeFrom);
            const warm = resumeId
                ? await pool.claim(
                      key,
                      {
                          launchKey: launchFingerprint(facts),
                          nativeSessionId: resumeId,
                          runtimeId: 'grok-build',
                      },
                      isGrokWarm
                  )
                : undefined;
            if (!resumeId) {
                await pool.evict(key);
            }
            if (warm) {
                const live = warm.live;
                live.hostTools.replaceTools(facts.tools);
                if (live.modelId !== facts.modelId) {
                    await selectModel(live.process.connection, {
                        modelId: facts.modelId,
                        sessionId: live.sessionId,
                    }).catch(async (error: unknown) => {
                        await closeGrokLive(live);
                        throw error;
                    });
                    live.modelId = facts.modelId;
                }
                return new GrokSession(live, { isResume: true, park, relaunch });
            }
            const live = await launchGrokLive(facts, resumeId, signal);
            return new GrokSession(live, { isResume: live.isResume, park, relaunch });
        },
        refreshBootstrap: () => Promise.resolve(),
        runtimeId: 'grok-build',
    };
}

function isGrokWarm(process: WarmProcess): process is GrokWarmProcess {
    return process instanceof GrokWarmProcess;
}

/** The operator's installed `grok`: on the launch PATH, else Grok's own install location. */
function resolveGrokCommand(options: GrokDriverOptions): [string] {
    const onPath = Bun.which('grok', { PATH: options.env.PATH ?? process.env.PATH ?? '' });
    if (onPath) {
        return [onPath];
    }
    const hostHome = options.hostHomeDir ?? process.env.HAUS_COMPUTER_HOST_HOME ?? os.homedir();
    const installed = join(hostHome, '.grok', 'bin', 'grok');
    return [existsSync(installed) ? installed : 'grok'];
}
