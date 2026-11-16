import type { SubCommand } from '../subcommand.ts';
import {
    type ClaimDeps,
    runClaim,
    runClaimCreate,
    runClaimList,
    runClaimRelease,
    runClaimUpdate,
} from './agent-claim-actions.ts';
import { runClaimAssign, runClaimUnassign } from './agent-claim-assign.ts';

const statusFlag = {
    description: 'New status: todo|in_progress|in_review|done|closed',
    name: '--status',
    valueName: '<status>',
};
const targetFlag = {
    description: "Channel or DM target, e.g. '#general' or 'dm:@zach'",
    name: '--target',
    valueName: '<target>',
};
const expectedRevisionFlag = {
    description: 'Apply only if the claim is still at this revision (rev= in claim list)',
    name: '--expected-revision',
    valueName: '<n>',
};
const numberFlag = {
    description: 'Claim number (repeatable on claim)',
    name: '--number',
    valueName: '<n>',
};

/**
 * The bare group (`haus claim --target … --number N`) is the claim itself; the
 * other verbs manage claims already made.
 */
export function createClaimSubcommands(resolveDeps: () => ClaimDeps): SubCommand[] {
    return [
        {
            bare: true,
            examples: [
                'haus claim --target "#general" --number 1 --number 2',
                'haus claim --target "#general" --message-id 1a2b3c4d',
            ],
            flags: [
                targetFlag,
                numberFlag,
                {
                    description: 'Claim a regular message: converts it to a claim you own',
                    name: '--message-id',
                    valueName: '<id>',
                },
            ],
            name: 'claim',
            notes: [
                'Prints one row per requested claim: claimed, already yours, or refused with the reason. Exits non-zero only when nothing was granted.',
                'Regular turns only; a heartbeat run uses haus lead claim.',
            ],
            positionals: [],
            run: (args) => runClaim(args, resolveDeps()),
            summary: 'Claim messages before working — the claim is the concurrency lock',
            usage: 'haus claim --target <target> (--number <n>... | --message-id <id>)',
        },
        {
            examples: [
                'haus claim list',
                'haus claim list --mine',
                'haus claim list --target "#general" --status all',
            ],
            flags: [
                targetFlag,
                {
                    description: 'Filter: all|todo|in_progress|in_review|done|closed',
                    name: '--status',
                    valueName: '<status>',
                },
                { description: 'Only claims held by or assigned to you', name: '--mine' },
            ],
            name: 'list',
            notes: [
                'Lists unfinished claims (todo, in_progress, in_review) unless --status says otherwise, newest activity first, at most 50 rows.',
            ],
            positionals: [],
            run: (args) => runClaimList(args, resolveDeps()),
            summary: 'List claim-messages across your chats or one target',
            usage: 'haus claim list [--target <target>] [--mine] [--status all|todo|in_progress|in_review|done|closed]',
        },
        {
            examples: [
                'haus claim create --target "#general" <<\'HAUSMSG\'\nInvestigate the failing nightly export.\nHAUSMSG',
                'haus claim create --target "#general" --title "Phase 1: audit" --title "Phase 2: fix"',
            ],
            flags: [
                targetFlag,
                {
                    description: 'Claim body per claim (repeatable); otherwise the body is stdin',
                    name: '--title',
                    valueName: '<text>',
                },
                {
                    description:
                        'Assign to an Agent in the target; assigning yourself claims immediately',
                    name: '--assignee',
                    valueName: '<@handle>',
                },
            ],
            name: 'create',
            positionals: [],
            run: (args) => runClaimCreate(args, resolveDeps()),
            summary: 'Post a new message and publish it as a claim',
            usage: 'haus claim create --target <target> [--title <text>]... [--assignee @agent]',
        },
        {
            examples: ['haus claim release --target "#general" --number 1'],
            flags: [targetFlag, numberFlag],
            name: 'release',
            positionals: [],
            run: (args) => runClaimRelease(args, resolveDeps()),
            summary: 'Release a claim you hold',
            usage: 'haus claim release --target <target> --number <n>',
        },
        {
            examples: [
                'haus claim assign --target "#general" --number 1 --assignee @kit',
                'haus claim assign --target "#general" --number 1 --assignee @scout --expected-revision 3',
            ],
            flags: [
                targetFlag,
                numberFlag,
                {
                    description: 'Agent member of the target to hand the claim to',
                    name: '--assignee',
                    valueName: '<@agent>',
                },
                expectedRevisionFlag,
            ],
            name: 'assign',
            notes: [
                'Moves the owner only; status is unchanged and the assignee claims to start. Works on a claim someone else holds.',
                'Only Agents hold claims. To hand work to a human, @mention them in an inline reply where the request arrived.',
            ],
            positionals: [],
            run: (args) => runClaimAssign(args, resolveDeps()),
            summary: 'Hand a claim to an Agent member of its chat',
            usage: 'haus claim assign --target <target> --number <n> --assignee @agent [--expected-revision <n>]',
        },
        {
            examples: ['haus claim unassign --target "#general" --number 1'],
            flags: [targetFlag, numberFlag, expectedRevisionFlag],
            name: 'unassign',
            positionals: [],
            run: (args) => runClaimUnassign(args, resolveDeps()),
            summary: "Clear a claim's assignee without changing its status",
            usage: 'haus claim unassign --target <target> --number <n> [--expected-revision <n>]',
        },
        {
            examples: ['haus claim update --target "#general" --number 1 --status done'],
            flags: [targetFlag, numberFlag, statusFlag],
            name: 'update',
            positionals: [],
            run: (args) => runClaimUpdate(args, resolveDeps()),
            summary:
                'Move a claim through todo → in_progress → done (in_review only for a requested sign-off; closed is reversible)',
            usage: 'haus claim update --target <target> --number <n> --status <status>',
        },
    ];
}
