import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Models } from '@earendil-works/pi-ai';
import {
    createRegistry,
    defineExtension,
    Harness,
    type HarnessSettings,
    LiveDoc,
    ROOT_CONVERSATION_ID,
    type Report,
} from '@earendil-works/pi-durable';
import { RuntimeResumeRejectedError } from '../turn/resume-rejected.ts';
import type { RuntimeSession, SteerResult } from '../turn/runtime-driver.ts';
import type { PiToolFamily } from './pi-models.ts';
import { hausSection } from './pi-prompt.ts';
import { openPiStorage } from './pi-storage.ts';
import { PiToolBinding, piTools } from './pi-tools.ts';
import { PiTurn } from './pi-turn.ts';

const context = BACKGROUND_CONTEXT;

export const piSettings = {
    progress: { partialIntervalMs: 50 },
} as const satisfies HarnessSettings;

export type PiSessionHandle = Awaited<ReturnType<typeof openPiSessionHandle>>;

export async function openPiSessionHandle(input: {
    agentDir: string;
    family: PiToolFamily;
    launchKey: string;
    log: (line: string) => void;
    models: Models;
    nativeSessionId: string;
    resume: boolean;
}) {
    const storage = await openPiStorage(input.agentDir, {
        nativeSessionId: input.nativeSessionId,
        resume: input.resume,
    });
    const binding = new PiToolBinding();
    const prompt = { instructions: '' };
    const registry = createRegistry();
    registry.install(
        defineExtension({
            name: 'haus',
            sections: [hausSection(() => prompt.instructions)],
            tools: piTools(input.family, binding),
        })
    );
    const harness = await Harness.open(
        storage,
        {
            identity: { attribution: null },
            models: input.models,
            onReport: (report) => input.log(reportLine(input.nativeSessionId, report)),
            registry,
            settings: piSettings,
        },
        context
    );
    let alive = true;
    harness.closed.then(() => {
        alive = false;
    });
    let closing: Promise<void> | null = null;
    const close = () => {
        closing ??= harness.close(context);
        return closing;
    };
    try {
        if (input.resume && !(await harness.conversation(ROOT_CONVERSATION_ID, context))) {
            throw new RuntimeResumeRejectedError(
                'pi-durable',
                'invalid-state',
                `The Pi session store ${input.nativeSessionId} has no conversation.`
            );
        }
        const root = await harness.root(context);
        if ((await harness.snapshot(LiveDoc, root.id, context))?.run) {
            await root.abort(context);
        }
        return {
            get alive() {
                return alive && closing === null;
            },
            binding,
            close,
            harness,
            launchKey: input.launchKey,
            prompt,
            root,
            sessionId: input.nativeSessionId,
        };
    } catch (error) {
        await close();
        throw error;
    }
}

export function piSession(deps: {
    handle: PiSessionHandle;
    isResume: boolean;
    newId: () => string;
    park(handle: PiSessionHandle): void;
}) {
    const { handle } = deps;
    let turn: PiTurn | null = null;
    let released = false;
    const idle = async () => {
        await turn?.settle();
        turn = null;
    };
    const release = () => {
        released = true;
        handle.binding.bind(null);
    };
    const session: RuntimeSession = {
        async destroy() {
            release();
            await handle.close();
        },
        async detach() {
            await idle();
            release();
            if (handle.alive) {
                deps.park(handle);
            }
            return handle.sessionId;
        },
        isResume: deps.isResume,
        sessionId: handle.sessionId,
        async startTurn({ prompt, signal }) {
            if (released) {
                throw new Error('The Pi session is parked.');
            }
            if (turn && !turn.isSettled) {
                throw new Error('A Pi turn is already running.');
            }
            const next = await PiTurn.start(
                {
                    harness: handle.harness,
                    invocations: handle.binding.invocations,
                    newId: deps.newId,
                    root: handle.root,
                    signal,
                },
                prompt
            );
            turn = next;
            return {
                events: next.events,
                settle: () => next.settle(),
                unconsumedSteers: () => next.unconsumedSteers(),
            };
        },
        steer(text) {
            if (!turn || turn.isSettled) {
                const idleResult: SteerResult = { delivered: false, reason: 'idle' };
                return Promise.resolve(idleResult);
            }
            return turn.steer(text);
        },
        async stop() {
            await idle();
            release();
            await handle.close();
            return handle.sessionId;
        },
    };
    return session;
}

function reportLine(sessionId: string, report: Report) {
    const error = report.error instanceof Error ? report.error.message : String(report.error);
    return `Pi session ${sessionId} reported ${report.kind}: ${error}`;
}
