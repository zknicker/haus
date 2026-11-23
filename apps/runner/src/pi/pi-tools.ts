import type { Context } from '@earendil-works/chord/context';
import { defineTool, type ToolRegistration } from '@earendil-works/pi-durable';
import { arr, int, obj, oneOf, opt, str, tuple } from '@earendil-works/pi-schema';
import { runnerToolDescriptions } from '@haus/agent-prompt';
import type { InvocationOutcome } from '@haus/api';
import type { RunTools, ToolOutcome } from '../run-context.ts';
import { computerTargetBounds, computerTargetDescription } from '../tools/computer-target.ts';
import { webFetch } from '../web/web-fetch.ts';
import { type SearchBackend, webSearch } from '../web/web-search.ts';
import type { PiToolFamily } from './pi-models.ts';
import type { WebSearchRoute } from './pi-web-search.ts';

type RunnerToolName = keyof typeof runnerToolDescriptions;

const familyTools = {
    gpt: ['shell', 'apply_patch', 'view_image', 'execute'],
    'text-editor': ['bash', 'str_replace_based_edit_tool', 'execute'],
} as const satisfies Record<PiToolFamily, readonly RunnerToolName[]>;

export function piToolNames(family: PiToolFamily, search: WebSearchRoute) {
    const names: readonly RunnerToolName[] = [
        ...familyTools[family],
        'web_fetch',
        ...(search === 'hosted' ? [] : ['web_search' as const]),
    ];
    return names;
}

export class PiToolBinding {
    readonly invocations = new Map<string, InvocationOutcome>();
    search: SearchBackend | null = null;
    tools: RunTools | null = null;

    bind(tools: RunTools | null, search: SearchBackend | null) {
        this.tools = tools;
        this.search = search;
        this.invocations.clear();
    }

    async run(
        callId: string,
        context: Context,
        call: (tools: RunTools, signal: AbortSignal) => Promise<ToolOutcome>
    ) {
        const tools = this.tools;
        if (!tools) {
            return {
                isError: true,
                output: [
                    { text: 'No Haus run is active for this tool call.', type: 'text' as const },
                ],
            };
        }
        const outcome = await call(tools, context.abortSignal ?? new AbortController().signal);
        if (outcome.invocation) {
            this.invocations.set(callId, outcome.invocation);
        }
        return {
            isError: outcome.isError,
            output: outcome.content.map((part) =>
                part.type === 'text'
                    ? { text: part.text, type: 'text' as const }
                    : { data: part.data, mimeType: part.mimeType, type: 'image' as const }
            ),
        };
    }
}

export function piTools(family: PiToolFamily, search: WebSearchRoute, binding: PiToolBinding) {
    const all = {
        apply_patch: defineTool({
            ...shared('apply_patch'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.applyPatch(api.callId, args, signal)
                ),
            parameters: obj({ computer: computerField(), input: str({ minLength: 1 }) }),
        }),
        bash: defineTool({
            ...shared('bash'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.bash(api.callId, args, signal)
                ),
            parameters: obj({
                command: str({ minLength: 1 }),
                computer: computerField(),
                description: opt(str()),
                timeout: opt(int({ maximum: 600_000, minimum: 1 })),
            }),
        }),
        execute: defineTool({
            ...shared('execute'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.execute(api.callId, args, signal)
                ),
            parameters: obj({ code: str({ minLength: 1 }) }),
        }),
        shell: defineTool({
            ...shared('shell'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.shell(api.callId, args, signal)
                ),
            parameters: obj({
                command: arr(str(), { minItems: 1 }),
                computer: computerField(),
                timeout_ms: opt(int({ maximum: 600_000, minimum: 1 })),
                workdir: opt(str({ minLength: 1 })),
            }),
        }),
        str_replace_based_edit_tool: defineTool({
            ...shared('str_replace_based_edit_tool'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.edit(api.callId, args, signal)
                ),
            parameters: obj({
                command: oneOf(['view', 'create', 'str_replace', 'insert']),
                computer: computerField(),
                file_text: opt(str()),
                insert_line: opt(int({ minimum: 0 })),
                new_str: opt(str()),
                old_str: opt(str()),
                path: str({ minLength: 1 }),
                view_range: opt(tuple([int(), int()])),
            }),
        }),
        view_image: defineTool({
            ...shared('view_image'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (tools, signal) =>
                    tools.viewImage(api.callId, args, signal)
                ),
            parameters: obj({ computer: computerField(), path: str({ minLength: 1 }) }),
        }),
        web_fetch: defineTool({
            ...shared('web_fetch'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (_tools, signal) =>
                    webFetch({ signal, url: args.url })
                ),
            parameters: obj({ url: str({ minLength: 1 }) }),
        }),
        web_search: defineTool({
            ...shared('web_search'),
            execute: (args, api, context) =>
                binding.run(api.callId, context, (_tools, signal) =>
                    webSearch({
                        backend: binding.search,
                        count: args.count,
                        query: args.query,
                        signal,
                    })
                ),
            parameters: obj({
                count: opt(int({ maximum: 20, minimum: 1 })),
                query: str({ minLength: 1 }),
            }),
        }),
    } satisfies Record<RunnerToolName, ToolRegistration>;
    return piToolNames(family, search).map((name) => {
        const tool: ToolRegistration = all[name];
        return tool;
    });
}

function computerField() {
    return opt(str({ ...computerTargetBounds, description: computerTargetDescription }));
}

function shared(name: RunnerToolName) {
    return {
        description: runnerToolDescriptions[name],
        name,
        outputLimits: { maxBytes: 64 * 1024, maxLines: 2200, retain: 'tail' },
        replay: 'unsafe',
    } as const;
}
