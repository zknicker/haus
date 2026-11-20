import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import type { Provider } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import { cleanups, live, startedRun } from '../runner-test-server.ts';
import { openFileCredentialStore } from './pi-credentials.ts';
import { createPiHarness } from './pi-driver.ts';
import { agentDir, collect, launch } from './pi-faux-run.ts';
import { piAuthContext } from './pi-models.ts';
import type { WebSearchProvider } from './pi-web-search.ts';

export interface StandInRequest {
    readonly body: Record<string, unknown>;
    readonly path: string;
}

type Answer = (request: StandInRequest) => Response;

export function providerStandIn(answers: readonly Answer[]) {
    const requests: StandInRequest[] = [];
    const server = Bun.serve({
        async fetch(request) {
            if (request.method !== 'POST') {
                return new Response('no websocket here', { status: 404 });
            }
            const bytes = new Uint8Array(await request.arrayBuffer());
            const json =
                request.headers.get('content-encoding') === 'zstd'
                    ? zstdDecompressSync(bytes)
                    : bytes;
            const seen = {
                body: JSON.parse(new TextDecoder().decode(json)) as Record<string, unknown>,
                path: new URL(request.url).pathname,
            };
            requests.push(seen);
            const answer = answers[requests.length - 1];
            return answer ? answer(seen) : new Response('no more answers', { status: 500 });
        },
        port: 0,
    });
    cleanups.push(() => server.stop(true));
    return { origin: `http://127.0.0.1:${server.port}`, requests };
}

export async function standInModels(origin: string) {
    const directory = await mkdtemp(join(tmpdir(), 'haus-pi-logins-'));
    cleanups.push(() => rm(directory, { force: true, recursive: true }));
    const credentials = openFileCredentialStore(directory);
    await credentials.modify('openai-codex', async () => ({
        access: fakeChatGptToken,
        accountId: 'acct_1',
        expires: Date.now() + 3_600_000,
        refresh: 'refresh-1',
        type: 'oauth',
    }));
    const models = createModels({
        authContext: piAuthContext({
            geminiApiKey: 'gemini-key',
            openrouterApiKey: 'openrouter-key',
            xaiApiKey: 'xai-key',
        }),
        credentials,
    });
    models.setProvider(rebased(openaiCodexProvider(), `${origin}/chatgpt`));
    models.setProvider(rebased(xaiProvider(), `${origin}/xai/v1`));
    models.setProvider(rebased(googleProvider(), `${origin}/google`));
    models.setProvider(
        rebased(openrouterProvider(), (upstream) => `${origin}/openrouter${upstream.pathname}`)
    );
    return models;
}

export async function searchTurn(input: {
    answers: readonly Answer[];
    modelId: string;
    webSearch: readonly WebSearchProvider[];
}) {
    const standIn = providerStandIn(input.answers);
    const harness = createPiHarness({
        log: () => undefined,
        maxWarm: 1,
        models: await standInModels(standIn.origin),
        webSearch: input.webSearch,
    });
    cleanups.push(() => harness.close());
    const { run } = await startedRun();
    const session = await harness
        .factory(launch(await agentDir(), run.tools, input.modelId))
        .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
    const turn = await session.startTurn({ prompt: 'When does Haus ship?', signal: live() });
    return { events: await collect(turn.events), requests: standIn.requests };
}

export function toolsOf(body: Record<string, unknown>) {
    const tools: { function?: { name?: string }; name?: string; type?: string }[] = Array.isArray(
        body.tools
    )
        ? body.tools
        : [];
    return tools.map((tool) =>
        tool.type === undefined || tool.type === 'function'
            ? `function ${tool.name ?? tool.function?.name}`
            : tool.type
    );
}

export function completionsStream(chunks: readonly Record<string, unknown>[]) {
    const body = [...chunks.map((chunk) => JSON.stringify(chunk)), '[DONE]']
        .map((data) => `data: ${data}\n\n`)
        .join('');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

export function responsesStream(events: readonly Record<string, unknown>[]) {
    const body = events
        .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
        .join('');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

export function responsesAnswer(input: {
    citations?: readonly { title: string; url: string }[];
    searches?: readonly { action?: Record<string, unknown>; id: string; query?: string }[];
    text: string;
}) {
    const searches = (input.searches ?? []).map((search) => ({
        action: search.action ?? { query: search.query, type: 'search' },
        id: search.id,
        status: 'completed',
        type: 'web_search_call',
    }));
    const message = {
        content: [
            {
                annotations: (input.citations ?? []).map((citation) => ({
                    end_index: 1,
                    start_index: 0,
                    title: citation.title,
                    type: 'url_citation',
                    url: citation.url,
                })),
                text: input.text,
                type: 'output_text',
            },
        ],
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        type: 'message',
    };
    const at = searches.length;
    return responsesStream([
        { response: { id: 'resp_1', status: 'in_progress' }, type: 'response.created' },
        ...searches.flatMap((item, index) => [
            {
                item: { ...item, status: 'in_progress' },
                output_index: index,
                type: 'response.output_item.added',
            },
            { item, output_index: index, type: 'response.output_item.done' },
        ]),
        {
            item: { ...message, content: [], status: 'in_progress' },
            output_index: at,
            type: 'response.output_item.added',
        },
        { delta: input.text, output_index: at, type: 'response.output_text.delta' },
        { item: message, output_index: at, type: 'response.output_item.done' },
        {
            response: {
                id: 'resp_1',
                output: [...searches, message],
                status: 'completed',
                usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            },
            type: 'response.completed',
        },
    ]);
}

export function geminiStream(chunks: readonly Record<string, unknown>[]) {
    const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

export function geminiParts(parts: readonly Record<string, unknown>[], extra = {}) {
    return {
        candidates: [{ content: { parts, role: 'model' }, finishReason: 'STOP', ...extra }],
        usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 10, totalTokenCount: 15 },
    };
}

function rebased(provider: Provider, baseUrl: string | ((upstream: URL) => string)) {
    const models = () =>
        provider.getModels().map((model) => ({
            ...model,
            baseUrl: typeof baseUrl === 'string' ? baseUrl : baseUrl(new URL(model.baseUrl)),
        }));
    const moved: Provider = { ...provider, getAllModels: models, getModels: models };
    return moved;
}

const fakeChatGptToken = [
    btoa(JSON.stringify({ alg: 'none' })),
    btoa(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_1' } })),
    'signature',
].join('.');
