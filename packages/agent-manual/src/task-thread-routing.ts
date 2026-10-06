// Haus routes Agent posts where the request arrived, never into the thread on
// the request: its author follows that thread (ADR 0029). Each row swaps one
// captured Raft line for its Haus routing; the rest of the card stays verbatim.
export const taskThreadRouting = new Map<string, ReadonlyArray<readonly [string, string]>>([
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
                'Post the handoff as an inline reply where the request arrived (or in its thread if it arrived inside one), not a fresh channel root',
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
                'Post progress in the task thread, not scattered across channels.',
                'Post progress in a thread on your own acknowledgment, not scattered across channels and never in the thread on the request.',
            ],
            // Agents finish their own work; `in_review` is for requested sign-off only (2026-10-05).
            [
                'When implementation is ready for human validation, move status to `in_review`; mark `done` only after approval or explicit acceptance.',
                'When the work is finished, mark it `done`; move it to `in_review` only when the requester asked to sign off or a human decision is still pending, and say what they need to check.',
            ],
            [
                '- **Done without review**: human never validates behavior. Counter: implementation goes to `in_review`; approval moves it to done.',
                '- **Silent sign-off**: a task parked in `in_review` with no ask. Counter: name what the human must check, or mark it done.',
            ],
        ],
    ],
]);
