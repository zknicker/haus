import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { AgentReasoningEffort } from '@haus/api';
import { defaultThinkingLevel } from '../model-catalog.ts';
import type {
    OpenSessionOptions,
    RuntimeDriverFactory,
    RuntimeLaunch,
} from '../turn/runtime-driver.ts';
import { WarmPool, warmIdleMs } from '../turn/warm-pool.ts';
import { piCompactionPolicy, piHarnessContext } from './pi-context.ts';
import {
    type PiConnectionModels,
    PiModelUnavailableError,
    type PiToolFamily,
    piModelRef,
    piToolFamily,
} from './pi-models.ts';
import { hausSectionKey } from './pi-prompt.ts';
import { openPiSessionHandle, type PiSessionHandle, piSession, piSettings } from './pi-session.ts';
import { PiToolBinding, piTools } from './pi-tools.ts';
import {
    groundedSearch,
    type WebSearchRoute,
    webSearchOn,
    webSearchRoute,
} from './pi-web-search.ts';

const expiryIntervalMs = 60_000;

export function createPiHarness(options: {
    log: (line: string) => void;
    maxWarm: number;
    models: (launch: RuntimeLaunch) => PiConnectionModels;
}) {
    const pool = new WarmPool<PiSessionHandle>({ idleMs: warmIdleMs, maxWarm: options.maxWarm });
    const closeAll = async (handles: readonly PiSessionHandle[]) => {
        await Promise.all(
            handles.map((handle) =>
                handle.close().catch((error: unknown) => {
                    options.log(
                        `Runner could not close Pi session ${handle.sessionId}: ${String(error)}`
                    );
                })
            )
        );
    };
    const expiry = setInterval(() => closeAll(pool.expire(Date.now())), expiryIntervalMs);
    expiry.unref();

    const connect = async (
        launch: RuntimeLaunch,
        opened: PiConnectionModels,
        toolset: PiToolset,
        resumeFrom: string | undefined
    ) => {
        const launchKey = piLaunchKey(await piBootstrapFingerprint(toolset), launch);
        if (resumeFrom) {
            const claim = pool.claim(
                launch.agentId,
                { launchKey, nativeSessionId: resumeFrom },
                Date.now()
            );
            closeAll(claim.closing);
            if (claim.process?.alive) {
                return claim.process;
            }
        } else {
            closeAll(pool.take(launch.agentId));
        }
        return await openPiSessionHandle({
            agentDir: launch.agentDir,
            family: toolset.family,
            launchKey,
            log: options.log,
            models: opened.models,
            nativeSessionId: resumeFrom ?? crypto.randomUUID(),
            resume: resumeFrom !== undefined,
            search: toolset.search,
        });
    };

    const driver = (launch: RuntimeLaunch) => {
        const opened = options.models(launch);
        const toolset: PiToolset = {
            family: piToolFamily(launch.modelId),
            search: webSearchRoute(webSearchOn(launch.connection, opened.providerId)),
        };
        return {
            bootstrapFingerprint: () => piBootstrapFingerprint(toolset),
            harness: 'pi-durable' as const,
            instructionsOnResume: 'current' as const,
            async openSession({ resumeFrom, signal }: OpenSessionOptions) {
                signal?.throwIfAborted();
                const ref = piModelRef(opened, launch.modelId);
                const model = ref && opened.models.getModel(ref.provider, ref.modelId);
                if (!(ref && model)) {
                    throw new PiModelUnavailableError(launch.modelId, opened.providerId);
                }
                const handle = await connect(launch, opened, toolset, resumeFrom);
                handle.prompt.instructions = launch.instructions;
                handle.binding.bind(
                    launch.tools,
                    toolset.search === 'grounded' ? groundedSearch(opened.models, model) : null
                );
                await handle.root.configure(
                    { model: ref, thinkingLevel: thinkingLevelOf(launch.reasoningEffort, model) },
                    BACKGROUND_CONTEXT
                );
                const agent = await handle.root.agent(BACKGROUND_CONTEXT);
                return piSession({
                    context: piHarnessContext({
                        model,
                        policy: piCompactionPolicy(piSettings, ref, agent.compaction),
                        tools: piTools(toolset.family, toolset.search, new PiToolBinding()),
                    }),
                    handle,
                    isResume: resumeFrom !== undefined,
                    newId: () => crypto.randomUUID(),
                    park: (parked) =>
                        closeAll(
                            pool.park(
                                launch.agentId,
                                {
                                    launchKey: parked.launchKey,
                                    nativeSessionId: parked.sessionId,
                                },
                                parked,
                                Date.now(),
                                launch.policy?.warmIdleMs
                            )
                        ),
                });
            },
        };
    };
    const factory: RuntimeDriverFactory = driver;

    return {
        close() {
            clearInterval(expiry);
            return closeAll(pool.drain());
        },
        release(agentId: string) {
            return closeAll(pool.take(agentId));
        },
        driver,
        factory,
        get warm() {
            return pool.size;
        },
    };
}

export async function piBootstrapFingerprint(toolset: PiToolset) {
    packageVersion ??= readPiDurableVersion();
    const tools = piTools(toolset.family, toolset.search, new PiToolBinding()).map((tool) => [
        tool.name,
        tool.description,
        tool.parameters,
        tool.outputLimits,
        tool.replay,
    ]);
    return createHash('sha256')
        .update(
            JSON.stringify([
                await packageVersion,
                tools,
                toolset.search,
                { section: hausSectionKey, tag: false },
                piSettings,
            ])
        )
        .digest('hex');
}

function piLaunchKey(bootstrapFingerprint: string, launch: RuntimeLaunch) {
    return createHash('sha256')
        .update(JSON.stringify([bootstrapFingerprint, launch.modelId, launch.connection.id]))
        .digest('hex');
}

interface PiToolset {
    readonly family: PiToolFamily;
    readonly search: WebSearchRoute;
}

function thinkingLevelOf(effort: AgentReasoningEffort, model: Model<Api>) {
    return effort === 'default' ? defaultThinkingLevel(model) : effort;
}

let packageVersion: Promise<string> | null = null;

async function readPiDurableVersion() {
    const entry = fileURLToPath(import.meta.resolve('@earendil-works/pi-durable'));
    const manifest = JSON.parse(
        await readFile(join(dirname(entry), '..', 'package.json'), 'utf8')
    ) as { name: string; version: string };
    if (manifest.name !== '@earendil-works/pi-durable') {
        throw new Error(`Expected the pi-durable manifest beside ${entry}.`);
    }
    return manifest.version;
}
