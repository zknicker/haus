import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    type ClaimDeps,
    claimSingleResponseSchema,
    requireTarget,
    singleNumber,
    withClaimSignal,
} from './agent-claim-actions.ts';
import { assigneeLabel } from './agent-claim-format.ts';

// `assign` moves which Agent a claim belongs to and never its status: handing
// work to someone does not announce they started. The bare `claim` stays the
// "I'm starting" verb. The inverse is its own verb, like claim/release. Humans
// are never assignees (ADR 0037); they are handed work by @mention in the thread.

const HUMAN_HANDOFF =
    'Only Agent members of the chat hold claims. To hand work to a human, @mention them in an inline reply where the request arrived with what you need from them.';

export async function runClaimAssign(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(
        args,
        'haus claim assign --target "#channel" --number 1 --assignee @agent'
    );
    const assignee = args.values['--assignee']?.trim();
    if (!assignee) {
        throw new AgentCliError('INVALID_ARG', 'Provide --assignee @agent.', {
            nextAction: 'To clear the assignee: haus claim unassign --target <target> --number <n>',
        });
    }
    const response = await deps.client
        .request(
            '/api/agent/claims/assign',
            claimSingleResponseSchema,
            withClaimSignal(deps, {
                body: {
                    assignee: assignee.startsWith('@') ? assignee : `@${assignee}`,
                    expectedRevision: expectedRevision(args),
                    number: singleNumber(args),
                    target,
                },
                method: 'POST',
            })
        )
        .catch((cause: unknown) => {
            throw withHumanHandoff(cause);
        });
    const claim = response.claim;
    deps.write(
        `Assigned claim #${claim.number} to ${assigneeLabel(claim.assignee)} [${claim.status}, rev=${claim.version}]. Status is unchanged; the assignee claims it to start.\n`
    );
    return 0;
}

export async function runClaimUnassign(args: ParsedArgs, deps: ClaimDeps): Promise<number> {
    const target = requireTarget(args, 'haus claim unassign --target "#channel" --number 1');
    const response = await deps.client.request(
        '/api/agent/claims/unassign',
        claimSingleResponseSchema,
        withClaimSignal(deps, {
            body: { expectedRevision: expectedRevision(args), number: singleNumber(args), target },
            method: 'POST',
        })
    );
    const claim = response.claim;
    deps.write(
        `Claim #${claim.number} is now unassigned [${claim.status}, rev=${claim.version}].\n`
    );
    return 0;
}

/**
 * The Server refuses a human handle with the same not-assignable refusal as a
 * missing or out-of-Chat one, so the CLI names the human path beside it.
 */
function withHumanHandoff(cause: unknown): unknown {
    if (
        cause instanceof AgentCliError &&
        !cause.options.nextAction &&
        cause.message.includes('is not assignable')
    ) {
        return new AgentCliError(cause.code, cause.message, {
            ...cause.options,
            nextAction: HUMAN_HANDOFF,
        });
    }
    return cause;
}

function expectedRevision(args: ParsedArgs): number | undefined {
    const raw = args.values['--expected-revision'];
    if (raw === undefined) {
        return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--expected-revision must be a non-negative integer; got "${raw}".`
        );
    }
    return parsed;
}
