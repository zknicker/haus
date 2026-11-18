// Haus routes Agent posts where the request arrived, and work that outlasts a
// reply into its Task (ADR 0029, ADR 0052). Each row swaps one captured Raft
// line for its Haus routing; the rest of the card stays verbatim. The left side
// quotes the captured source, whose tasks owned a thread.
export const taskRouting = new Map<string, ReadonlyArray<readonly [string, string]>>([
    [
        'recipes/decision/stake-strictness',
        [
            [
                'Say the tier out loud in the task thread',
                'Say the tier out loud where the request arrived',
            ],
        ],
    ],
    [
        'recipes/pattern/evidence-handoff',
        [
            [
                "Post in the task's thread, not a fresh channel root",
                'Post the handoff as an inline reply where the request arrived, not a fresh channel root',
            ],
        ],
    ],
    [
        'recipes/technique/proof-of-work-receipts',
        [
            [
                'Put the receipt in the task thread and',
                'Put the receipt in your final inline answer where the request arrived, and',
            ],
        ],
    ],
    [
        'recipes/technique/task-claim-lock',
        [
            [
                'say so in the original thread',
                'say so in an inline reply where the request arrived',
            ],
            [
                'correct the routing in the original thread',
                'correct the routing inline where the request arrived',
            ],
            [
                'one line in the original thread costs nothing',
                'one inline reply where the request arrived costs nothing',
            ],
            [
                'Post progress in the task thread, not scattered across channels.',
                'Work your reply will not finish goes in a Task, and its progress is posted there; see tasks.',
            ],
            // Agents finish their own work; `in_review` is for requested sign-off only (2026-10-05).
            [
                'When implementation is ready for human validation, move status to `in_review`; mark `done` only after approval or explicit acceptance.',
                'When the work is finished, mark it `done`; move it to `in_review` only when the requester asked to sign off or a human decision is still pending, and say what they need to check.',
            ],
            [
                '- **Done without review**: human never validates behavior. Counter: implementation goes to `in_review`; approval moves it to done.',
                '- **Silent sign-off**: a claim parked in `in_review` with no ask. Counter: name what the human must check, or mark it done.',
            ],
        ],
    ],
]);
