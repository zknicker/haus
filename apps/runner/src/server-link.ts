import {
    type RunnerDownFrame,
    type RunnerStartFrame,
    type RunnerUpFrame,
    runnerDownFrameSchema,
    runnerSocketPath,
} from '@haus/api';
import type { RunnerConfig } from './config.ts';
import type { DispatchLedger } from './dispatch/ledger.ts';
import { type InvocationClock, systemInvocationClock } from './invocations/invocation-clock.ts';
import { runnerInventory } from './logins.ts';
import type { RunnerLink, TurnHost } from './run-context.ts';
import { createRunTools, type RunToolset } from './tools/run-tools.ts';

const backoffMs = [500, 1000, 2000, 5000, 10_000, 30_000];
const queuedFramesMax = 1000;

export function openServerLink(input: {
    config: Pick<RunnerConfig, 'claudeSetupToken' | 'runnerToken' | 'serverUrl'>;
    invocationClock?: InvocationClock;
    ledger: DispatchLedger;
    log?: (line: string) => void;
    reconnectDelaysMs?: readonly number[];
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
            if (socket && accepted) {
                socket.send(JSON.stringify(frame));
            } else if (queued.length < queuedFramesMax) {
                queued.push(frame);
            } else {
                log(`Runner link dropped a ${frame.type} frame while disconnected.`);
            }
        },
    };

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
            case 'agent-execution-journal-ack':
                return;
            default:
                return frame satisfies never;
        }
    };

    const startRun = ({ reasoningEffort, runCredential, start }: RunnerStartFrame) => {
        if (runs.has(start.runId)) {
            link.send({ agentId: start.agentId, runId: start.runId, type: 'ack' });
            return;
        }
        const authority = {
            agentId: start.agentId,
            runCredential,
            runId: start.runId,
            serverUrl: input.config.serverUrl,
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
            .start({ authority, reasoningEffort: reasoningEffort ?? 'default', start, tools })
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
                current.send(JSON.stringify(runnerInventory(input.config)));
                for (const frame of queued.splice(0)) {
                    current.send(JSON.stringify(frame));
                }
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

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}
