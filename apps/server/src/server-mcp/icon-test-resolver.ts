import { afterAll } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { makeMcpIconResolver } from './icons.ts';

export { iconRequestInit, type McpIconFetch, siteFaviconUrl } from './icons.ts';
export { summarizeInstructions } from './instructions-summary.ts';

const runtime = makeTestRuntime();

afterAll(async () => {
    await runtime.dispose();
});

export const resolveMcpIcon = makeMcpIconResolver(runtime);
