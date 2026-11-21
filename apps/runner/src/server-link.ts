import type { Provider } from '@earendil-works/pi-ai';
import {
    type ModelSignInProvider,
    type RunnerDownFrame,
    type RunnerInventoryFrame,
    type RunnerStartFrame,
    type RunnerUpFrame,
    runnerDownFrameSchema,
    runnerSocketPath,
} from '@haus/api';
import type { RunnerConfig } from './config.ts';
import type { DispatchLedger } from './dispatch/ledger.ts';
import { type InvocationClock, systemInvocationClock } from './invocations/invocation-clock.ts';
import type { JournalUploads } from './journal/journal-uploads.ts';
import { runnerModelCatalog } from './model-catalog.ts';
import type { ConnectionBook } from './model-connections/connection-book.ts';
import { createSignIns } from './pi/pi-sign-ins.ts';
import type { AgentReset, RunnerLink, TurnHost } from './run-context.ts';
import { createRunTools, type RunToolset } from './tools/run-tools.ts';
import { harnessIds } from './turn/runtime-driver.ts';
import { openTurnTrace } from './turn/turn-trace.ts';

const backoffMs = [500, 1000, 2000, 5000, 10_000, 30_000];
const queuedFramesMax = 1000;
const telemetryBacklogMax = 1024 * 1024;

export function openServerLink(input: {
    book: ConnectionBook;
    config: Pick<RunnerConfig, 'runnerToken' | 'serverUrl'>;
    invocationClock?: InvocationClock;
    journal?: JournalUploads;
    ledger: DispatchLedger;
    log?: (line: string) => void;
    reconnectDelaysMs?: readonly number[];
    signInProvider?: (provider: ModelSignInProvider) => Provider;
    turnHost: TurnHost;
}) {
    const log = input.log ?? ((line: string) => process.stderr.write(`${line}\n`));
    const delays = input.reconnectDelaysMs ?? backoffMs;
    const runs = new Map<string, RunToolset>();
    const queued: RunnerUpFrame[] = [];
    let socket: WebSocket | null = null;
    let accepted = false;
    let attempt = 0;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let markReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
        markReady = resolve;
    });

    const link: RunnerLink = {
        send(frame) {
            const telemetry = frame.type === 'runner-turn-span';
            if (socket && accepted && !(telemetry && socket.bufferedAmount > telemetryBacklogMax)) {
                socket.send(JSON.stringify(frame));
            } else if (telemetry) {
                return;
            } else if (queued.length < queuedFramesMax) {
                queued.push(frame);
            } else {
                log(`Runner link dropped a ${frame.type} frame while disconnected.`);
            }
        },
    };
    const signIns = createSignIns({
        link,
        ...(input.signInProvider ? { provider: input.signInProvider } : {}),
    });

    const resetAgent = (agentId: string, reset: AgentReset) =>
        void input.turnHost.resetAgent(agentId, reset).catch(report('reset'));

    const handle = (frame: RunnerDownFrame) => {
        switch (frame.type) {
            case 'runner-hello-accepted':
                return;
            case 'runner-start':
                return startRun(frame);
            case 'notice':
                return void input.turnHost.notice(frame).catch(report('notice'));
            case 'stop':
                runs.get(frame.runId)?.cancelOpen();
                return void input.turnHost.stop(frame.agentId, frame.runId).catch(report('stop'));
            case 'invocation-result':
                if (!runs.get(frame.runId)?.receive(frame)) {
                    log(
                        `Runner ignored a result for a dispatch it is not waiting on (${frame.runId}).`
                    );
                }
                return;
            case 'agent-restart':
                return resetAgent(frame.agentId, { scope: 'restart' });
            case 'agent-reset':
                return resetAgent(frame.agentId, {
                    scope: frame.kind,
                    sessionGeneration: frame.sessionGeneration,
                });
            case 'agent-retire':
                return resetAgent(frame.agentId, { scope: 'retire' });
            case 'agent-execution-journal-ack':
                return input.journal?.acknowledge(frame);
            case 'runner-runtime-settings':
                return input.turnHost.runtimeSettings(frame);
            case 'runner-model-connections':
                return void input.book.replace(frame.connections);
            case 'runner-connection-credential-ack':
                return void input.book.acknowledge(frame, link);
            case 'runner-sign-in-start':
                return signIns.start(frame);
            case 'runner-sign-in-cancel':
                return signIns.cancel(frame);
            default:
                return frame satisfies never;
        }
    };

    const startRun = ({
        modelConnectionId,
        reasoningEffort,
        runCredential,
        serverId,
        sessionResetKind,
        start,
    }: RunnerStartFrame) => {
        if (runs.has(start.runId)) {
            link.send({ agentId: start.agentId, runId: start.runId, type: 'ack' });
            return;
        }
        const trace = openTurnTrace(start.traceContext);
        const authority = {
            agentId: start.agentId,
            runCredential,
            runId: start.runId,
            serverUrl: input.config.serverUrl,
            traceparent: trace.traceparent,
        };
        const toolset = createRunTools({
            authority,
            invocationClock: input.invocationClock ?? systemInvocationClock,
            ledger: input.ledger,
            link,
        });
        runs.set(start.runId, toolset);
        const tools = {
            ...toolset.tools,
            settle: async () => {
                runs.delete(start.runId);
                return await toolset.tools.settle();
            },
        };
        void input.turnHost
            .start({
                authority,
                modelConnectionId,
                reasoningEffort: reasoningEffort ?? 'default',
                serverId,
                sessionResetKind,
                start,
                tools,
                trace,
            })
            .catch(report('start'));
    };

    const report = (what: string) => (error: unknown) =>
        log(
            `Runner turn host ${what} failed: ${error instanceof Error ? error.message : String(error)}`
        );

    const connect = () => {
        retry = null;
        const url = `${input.config.serverUrl.replace(/^http/u, 'ws')}${runnerSocketPath}`;
        const current = new WebSocket(url);
        socket = current;
        current.addEventListener('open', () => {
            current.send(JSON.stringify({ token: input.config.runnerToken, type: 'runner-hello' }));
        });
        current.addEventListener('message', (event) => {
            const parsed = runnerDownFrameSchema.safeParse(parseJson(String(event.data)));
            if (!parsed.success) {
                log('Runner link ignored a frame that does not match the runner protocol.');
                return;
            }
            if (!accepted) {
                if (parsed.data.type !== 'runner-hello-accepted') {
                    log(`Runner link ignored ${parsed.data.type} before the Server accepted it.`);
                    return;
                }
                accepted = true;
                attempt = 0;
                current.send(JSON.stringify(inventory));
                for (const frame of queued.splice(0)) {
                    current.send(JSON.stringify(frame));
                }
                input.journal?.connected((frame) => {
                    if (socket !== current || !accepted) {
                        return false;
                    }
                    current.send(JSON.stringify(frame));
                    return true;
                });
                void input.book.resend(link);
                markReady();
                return;
            }
            handle(parsed.data);
        });
        current.addEventListener('close', () => {
            if (socket !== current) {
                return;
            }
            socket = null;
            accepted = false;
            input.journal?.disconnected();
            if (!closed) {
                const delay = delays[Math.min(attempt, delays.length - 1)] ?? 30_000;
                attempt += 1;
                retry = setTimeout(connect, delay);
            }
        });
    };

    connect();
    return {
        close() {
            closed = true;
            if (retry) {
                clearTimeout(retry);
            }
            socket?.close();
        },
        link,
        ready,
    };
}

const inventory: RunnerInventoryFrame = {
    harnesses: [...harnessIds],
    runtimes: runnerModelCatalog(),
    type: 'runner-inventory',
};

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}
