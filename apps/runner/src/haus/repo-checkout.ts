import { readRepoCheckout, UsageError } from '@haus/agent-cli';
import { type InvocationOperation, invocationOperationSchema } from '@haus/api';
import type { InvocationClient } from '../invocations/invocation-client.ts';
import { invocationToolOutcome } from '../invocations/invocation-client.ts';

type RepoCheckoutOperation = Extract<InvocationOperation, { kind: 'repo-checkout' }>;

export type RepoCheckoutCall =
    | { readonly kind: 'help' }
    | { readonly kind: 'invoke'; readonly operation: RepoCheckoutOperation }
    | { readonly kind: 'refused'; readonly text: string };

export function repoCheckoutCall(rest: readonly string[]) {
    const args = readCheckoutArgs(rest);
    if (args instanceof UsageError) {
        return usage(args.message);
    }
    if (args.help) {
        return { kind: 'help' } satisfies RepoCheckoutCall;
    }
    const parsed = invocationOperationSchema.safeParse({
        kind: 'repo-checkout',
        ref: args.ref,
        repository: args.repository,
    });
    if (!parsed.success || parsed.data.kind !== 'repo-checkout') {
        return usage(
            parsed.error?.issues[0]?.path[0] === 'ref'
                ? 'The ref must be 1 to 200 characters.'
                : `Invalid repository "${args.repository}". A repo reads as owner/name.`
        );
    }
    return { kind: 'invoke', operation: parsed.data } satisfies RepoCheckoutCall;
}

export async function runRepoCheckout(
    operation: RepoCheckoutOperation,
    input: { invocations: InvocationClient; signal: AbortSignal; toolCallId: string }
) {
    const answer = await input.invocations.invoke(input.toolCallId, operation, {
        signal: input.signal,
    });
    return invocationToolOutcome(answer);
}

function readCheckoutArgs(rest: readonly string[]) {
    try {
        return readRepoCheckout(rest);
    } catch (error) {
        if (error instanceof UsageError) {
            return error;
        }
        throw error;
    }
}

function usage(message: string) {
    return {
        kind: 'refused',
        text: [
            `Error: ${message}`,
            'Code: INVALID_ARG',
            'Next action: Run `haus repo checkout <owner/name> [--ref <ref>]`; `haus repo list` shows the repos with a folder on each Computer.',
        ].join('\n'),
    } satisfies RepoCheckoutCall;
}
