import { expect, test } from 'bun:test';
import { readFrameEvent } from './frame-events.ts';
import { isAllowedPreviewRequest } from './host-page.ts';

const context = { bodyLineOffset: 40, frame: 'frame-1', page: 'page-1' };

test('the first iframe under the host page is the visual frame', () => {
    const attached = {
        method: 'Target.attachedToTarget',
        params: { sessionId: 'frame-1', targetInfo: { type: 'iframe' }, waitingForDebugger: true },
        sessionId: 'page-1',
    };
    expect(readFrameEvent(attached, { ...context, frame: null })).toEqual({
        kind: 'frame-attached',
        sessionId: 'frame-1',
    });
    expect(readFrameEvent(attached, context)).toEqual({
        kind: 'other-attached',
        sessionId: 'frame-1',
    });
});

test('frame exceptions report the line inside the fence body', () => {
    const event = {
        method: 'Runtime.exceptionThrown',
        params: {
            exceptionDetails: {
                exception: { description: 'Error: boom\n    at about:srcdoc:43', type: 'object' },
                lineNumber: 42,
                text: 'Uncaught',
            },
        },
        sessionId: 'frame-1',
    };
    expect(readFrameEvent(event, context)).toEqual({
        kind: 'exception',
        text: 'Error: boom (fence line 3)',
    });
});

test('console errors and CSP issues come only from the visual frame', () => {
    const consoleError = {
        method: 'Runtime.consoleAPICalled',
        params: {
            args: [
                { type: 'string', value: 'bad' },
                { type: 'number', value: 2 },
            ],
            type: 'error',
        },
    };
    expect(readFrameEvent({ ...consoleError, sessionId: 'frame-1' }, context)).toEqual({
        kind: 'console-error',
        text: 'bad 2',
    });
    expect(readFrameEvent({ ...consoleError, sessionId: 'page-1' }, context)).toEqual({
        kind: 'ignored',
    });
    const cspIssue = {
        method: 'Audits.issueAdded',
        params: {
            issue: {
                code: 'ContentSecurityPolicyIssue',
                details: {
                    contentSecurityPolicyIssueDetails: {
                        blockedURL: 'https://example.com/x.png',
                        violatedDirective: 'img-src',
                    },
                },
            },
        },
        sessionId: 'frame-1',
    };
    expect(readFrameEvent(cspIssue, context)).toEqual({
        kind: 'csp-violation',
        text: 'img-src blocked https://example.com/x.png',
    });
});

test('only data:, blob:, and the pinned map files may load', () => {
    expect(isAllowedPreviewRequest('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedPreviewRequest('blob:null/1234')).toBe(true);
    expect(isAllowedPreviewRequest('https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js')).toBe(
        true
    );
    expect(isAllowedPreviewRequest('https://cdn.jsdelivr.net/npm/d3@7.9.1/dist/d3.min.js')).toBe(
        false
    );
    expect(isAllowedPreviewRequest('https://example.com/track')).toBe(false);
});
