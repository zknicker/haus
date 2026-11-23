import { writeSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { bashRunner } from './bash.ts';
import { createBrowserRunner } from './browser.ts';
import { createDesktopRunner } from './desktop.ts';
import { editRunner } from './editor.ts';
import { fileReadRunner, fileWriteRunner, viewImageRunner } from './files.ts';
import { createInvocationHandler } from './handler.ts';
import type { OperationRunners } from './operation.ts';
import { inlinePayloads } from './operation.ts';
import { createRepoCheckoutRunner } from './repo-checkout.ts';

export function invocationRunners(agentsRoot: string) {
    return {
        bash: bashRunner,
        browser: createBrowserRunner({ browserRoot: join(agentsRoot, '..', 'browser') }),
        desktop: createDesktopRunner({ toolsRoot: join(agentsRoot, '..', 'tools') }),
        edit: editRunner,
        'file-read': fileReadRunner,
        'file-write': fileWriteRunner,
        'repo-checkout': createRepoCheckoutRunner(agentsRoot),
        'view-image': viewImageRunner,
    } satisfies OperationRunners;
}

export function handlerInput(agentsRoot: string, frames: unknown[]) {
    return {
        agentsRoot,
        payloadsFor: () => inlinePayloads,
        runners: invocationRunners(agentsRoot),
        send: (frame: unknown) => {
            frames.push(frame);
            return true;
        },
    };
}

if (import.meta.main) {
    const agentsRoot = process.argv[2];
    if (!agentsRoot) {
        throw new Error('Usage: bun handler-host.test-support.ts <agentsRoot>');
    }
    const handler = await createInvocationHandler({
        ...handlerInput(agentsRoot, []),
        send: (frame) => {
            writeSync(1, `${JSON.stringify(frame)}\n`);
            return true;
        },
    });
    for await (const line of createInterface({ input: process.stdin })) {
        const message: unknown = JSON.parse(line);
        if (message === 'connected') {
            await handler.connected();
        } else {
            handler.receive(message);
        }
    }
    await handler.settled();
}
