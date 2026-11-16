import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import {
    type AgentApiRequest,
    type AgentApiRequester,
    AgentApiTransportError,
    createAgentApiClient,
} from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import {
    assigneeLabel,
    claimRefusal,
    claimResultSchema,
    claimRowSchema,
    formatClaimList,
    formatClaimResults,
    formatClaimsCreated,
} from './agent-claim-format.ts';

// Family 5 — Claims (D8). A claim is a message with claim metadata; claiming
// is the concurrency lock. `claim create` posts a fresh message and publishes
// it as a claim in one step.

export interface ClaimDeps {
    client: AgentApiRequester;
    mintNonce(): string;
    readStdin(): Promise<string>;
    signal?: AbortSignal;
    stdinIsTty(): boolean;
    write(text: string): void;
}

const claimListResponseSchema = z.object({
    claims: z.array(claimRowSchema),
    omitted: z.number().int().nonnegative(),
});
const claimCreateResponseSchema = z.object({ claims: z.array(claimRowSchema) });
const claimClaimResponseSchema = z.object({ results: z.array(claimResultSchema).min(1) });
export const claimSingleResponseSchema = z.object({ claim: claimRowSchema });

export async function runClaimList(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const params = new URLSearchParams();
    const target = args.values['--target'];
    const status = args.values['--status'];
    if (target) {
        params.set('target', target);
    }
    if (status) {
        params.set('status', status);
    }
    if (args.flags['--mine']) {
        params.set('mine', 'true');
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await deps.client.request(
        `/api/agent/claims${query}`,
        claimListResponseSchema,
        withClaimSignal(deps, { method: 'GET' })
    );
    deps.write(formatClaimList(response.claims, response.omitted));
    return 0;
}

export async function runClaimCreate(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(args, 'haus claim create --target "#channel"');
    const titles = args.valueLists?.['--title'] ?? [];
    let content: string | undefined;
    if (titles.length === 0) {
        if (deps.stdinIsTty()) {
            throw new AgentCliError(
                'MISSING_CONTENT',
                'Claim create needs --title flags or a heredoc body on stdin.',
                {
                    nextAction:
                        'haus claim create --target "#channel" <<\'HAUSMSG\'\n<claim body>\nHAUSMSG',
                }
            );
        }
        content = (await deps.readStdin()).trim();
        if (!content) {
            throw new AgentCliError('MISSING_CONTENT', 'Claim body from stdin was empty.');
        }
    }
    // One nonce per invocation: an unanswered request may already have created
    // the claims, so it is retried once on that nonce and the Server replays them.
    // An answered refusal is the Server's decision and is never repeated.
    const input = withClaimSignal(deps, {
        body: {
            assignee: args.values['--assignee'],
            content,
            nonce: deps.mintNonce(),
            target,
            titles: titles.length > 0 ? titles : undefined,
        },
        method: 'POST',
    });
    const create = () =>
        deps.client.request('/api/agent/claims/create', claimCreateResponseSchema, input);
    const response = await create().catch((cause: unknown) => {
        if (!(cause instanceof AgentApiTransportError) || deps.signal?.aborted) {
            throw cause;
        }
        return create();
    });
    deps.write(formatClaimsCreated(response.claims, target));
    return 0;
}

export async function runClaim(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(args, 'haus claim --target "#channel" --number 1');
    const numbers = (args.valueLists?.['--number'] ?? []).map((value) => parseClaimNumber(value));
    const messageId = args.values['--message-id'];
    if (numbers.length === 0 && !messageId) {
        throw new AgentCliError('INVALID_ARG', 'Pass --number (repeatable) or --message-id.', {
            nextAction: 'haus claim --target <target> --number <n>',
        });
    }
    const response = await deps.client.request(
        '/api/agent/claims/claim',
        claimClaimResponseSchema,
        withClaimSignal(deps, {
            body: {
                messageId,
                numbers: numbers.length > 0 ? numbers : undefined,
                target,
            },
            method: 'POST',
        })
    );
    deps.write(formatClaimResults(response.results, target));
    const refusal = claimRefusal(response.results);
    if (refusal) {
        throw refusal;
    }
    return 0;
}

export async function runClaimRelease(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(args, 'haus claim release --target "#channel" --number 1');
    const response = await deps.client.request(
        '/api/agent/claims/release',
        claimSingleResponseSchema,
        withClaimSignal(deps, {
            body: { number: singleNumber(args), target },
            method: 'POST',
        })
    );
    deps.write(
        `Released claim #${response.claim.number} [${response.claim.status}]. It is unassigned and claimable again.\n`
    );
    return 0;
}

export async function runClaimUpdate(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(
        args,
        'haus claim update --target "#channel" --number 1 --status done'
    );
    const status = args.values['--status'];
    if (!status) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --status todo|in_progress|in_review|done|closed.'
        );
    }
    const response = await deps.client.request(
        '/api/agent/claims/update',
        claimSingleResponseSchema,
        withClaimSignal(deps, {
            body: { number: singleNumber(args), status, target },
            method: 'POST',
        })
    );
    const claim = response.claim;
    deps.write(
        `Claim #${claim.number} is now [${claim.status}]${claim.assignee ? ` (assignee ${assigneeLabel(claim.assignee)})` : ''}.\n`
    );
    return 0;
}

export function requireTarget(args: ParsedArgs, nextAction: string): string {
    const target = args.values['--target'];
    if (!target) {
        throw new AgentCliError('INVALID_ARG', 'Provide --target with a channel or DM target.', {
            nextAction,
        });
    }
    return target;
}

export function singleNumber(args: ParsedArgs): number {
    const numbers = args.valueLists?.['--number'] ?? [];
    if (numbers.length !== 1) {
        throw new AgentCliError('INVALID_ARG', 'Provide exactly one --number.');
    }
    return parseClaimNumber(numbers[0] ?? '');
}

function parseClaimNumber(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new AgentCliError('INVALID_ARG', `Invalid claim number "${value}".`);
    }
    return parsed;
}

export function withClaimSignal(deps: ClaimDeps, input: AgentApiRequest): AgentApiRequest {
    return deps.signal ? { ...input, signal: deps.signal } : input;
}

export function defaultClaimDeps(): ClaimDeps {
    return {
        client: createAgentApiClient(),
        mintNonce: () => `claim-${randomUUID()}`,
        readStdin: readAgentStdin,
        stdinIsTty: () => process.stdin.isTTY === true,
        write: (text) => process.stdout.write(text),
    };
}
