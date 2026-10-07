import * as z from 'zod';
import type { CdpEvent } from './cdp.ts';

export type FrameEvent =
    | { kind: 'console-error'; text: string }
    | { kind: 'csp-violation'; text: string }
    | { kind: 'exception'; text: string }
    | { kind: 'frame-attached'; sessionId: string }
    | { kind: 'ignored' }
    | { kind: 'other-attached'; sessionId: string };

const attachedSchema = z.object({
    sessionId: z.string(),
    targetInfo: z.object({ type: z.string() }),
    waitingForDebugger: z.boolean().optional(),
});
const remoteObjectSchema = z.object({
    description: z.string().optional(),
    type: z.string(),
    value: z.unknown().optional(),
});
const consoleSchema = z.object({ args: z.array(remoteObjectSchema), type: z.string() });
const exceptionSchema = z.object({
    exceptionDetails: z.object({
        exception: remoteObjectSchema.optional(),
        lineNumber: z.number().optional(),
        text: z.string(),
    }),
});

const cspIssueSchema = z.object({
    issue: z.object({
        code: z.literal('ContentSecurityPolicyIssue'),
        details: z.object({
            contentSecurityPolicyIssueDetails: z.object({
                blockedURL: z.string().optional(),
                violatedDirective: z.string(),
            }),
        }),
    }),
});

export interface FrameEventContext {
    /** Lines the frame's own head adds before the fence body. */
    bodyLineOffset: number;
    /** The visual frame's session once it attached. */
    frame: string | null;
    /** The host page's session. */
    page: string;
}

const maxTextLength = 300;

/**
 * Classify one CDP event for a render: the visual's own frame attaching under
 * the host page, and the frame's console errors and uncaught exceptions.
 */
export function readFrameEvent(event: CdpEvent, context: FrameEventContext): FrameEvent {
    if (event.method === 'Target.attachedToTarget' && event.sessionId === context.page) {
        return readAttached(event.params, context);
    }
    if (context.frame === null || event.sessionId !== context.frame) {
        return ignored;
    }
    switch (event.method) {
        case 'Audits.issueAdded':
            return readCspIssue(event.params);
        case 'Runtime.consoleAPICalled':
            return readConsoleCall(event.params);
        case 'Runtime.exceptionThrown':
            return readException(event.params, context.bodyLineOffset);
        default:
            return ignored;
    }
}

const ignored: FrameEvent = { kind: 'ignored' };

// The first iframe under the host page is the visual; anything else the
// visual starts (a worker, a popup) is released and left alone.
function readAttached(params: unknown, context: FrameEventContext): FrameEvent {
    const attached = attachedSchema.safeParse(params);
    if (!attached.success) {
        return ignored;
    }
    return attached.data.targetInfo.type === 'iframe' && context.frame === null
        ? { kind: 'frame-attached', sessionId: attached.data.sessionId }
        : { kind: 'other-attached', sessionId: attached.data.sessionId };
}

function readCspIssue(params: unknown): FrameEvent {
    const issue = cspIssueSchema.safeParse(params);
    if (!issue.success) {
        return ignored;
    }
    const { blockedURL, violatedDirective } =
        issue.data.issue.details.contentSecurityPolicyIssueDetails;
    return {
        kind: 'csp-violation',
        text: trim(`${violatedDirective} blocked ${blockedURL ?? 'inline content'}`),
    };
}

function readConsoleCall(params: unknown): FrameEvent {
    const call = consoleSchema.safeParse(params);
    if (!call.success || (call.data.type !== 'error' && call.data.type !== 'assert')) {
        return ignored;
    }
    return { kind: 'console-error', text: trim(call.data.args.map(describe).join(' ')) };
}

function readException(params: unknown, bodyLineOffset: number): FrameEvent {
    const thrown = exceptionSchema.safeParse(params);
    if (!thrown.success) {
        return ignored;
    }
    const { exception, lineNumber, text } = thrown.data.exceptionDetails;
    const detail = exception?.description?.split('\n')[0] ?? text;
    // Chrome counts from 0 across the whole frame document; a line inside the
    // fence body reads as that body's own line number.
    const bodyLine = lineNumber === undefined ? 0 : lineNumber - bodyLineOffset + 1;
    const line = bodyLine > 0 ? ` (fence line ${bodyLine})` : '';
    return { kind: 'exception', text: trim(`${detail}${line}`) };
}

function describe(arg: z.output<typeof remoteObjectSchema>): string {
    if (arg.value !== undefined) {
        return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
    }
    return arg.description ?? arg.type;
}

function trim(text: string): string {
    const clean = text.replace(/\s+/gu, ' ').trim();
    return clean.length > maxTextLength ? `${clean.slice(0, maxTextLength - 1)}…` : clean;
}
