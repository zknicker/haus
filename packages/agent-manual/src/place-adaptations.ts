// Haus has two kinds of place: Channels and DMs for conversation, and Tasks for work. There are
// no Threads (ADR 0053): a side conversation stays inline, and work that outlasts a reply goes in
// a Task. Each row swaps one captured Raft phrase that names a thread as a place for the Haus
// place it means; the rest of the card stays verbatim. The left side quotes the captured source.
export const placeAdaptations = new Map<string, ReadonlyArray<readonly [string, string]>>([
    [
        'recipes/decision/when-to-ask-human',
        [['park it visibly (thread + task state)', 'park it visibly (inline reply + task state)']],
    ],
    [
        'recipes/pattern/coordinator-synthesis',
        [
            ['parallel threads with separate owners', 'parallel lanes with separate owners'],
            ['root asks, active threads,', 'root asks, open Tasks,'],
            [
                'Route decisions to the right thread and owner.',
                'Route decisions to the right conversation and owner.',
            ],
            ['without opening every thread?', 'without opening every conversation?'],
            ['live task/thread handles', 'live task/message handles'],
            ['freshest thread dominates the brief', 'freshest conversation dominates the brief'],
        ],
    ],
    [
        'recipes/pattern/discuss-then-assign',
        [
            ['a quick thread first:', 'a quick inline exchange first:'],
            ['renegotiate additions in-thread.', 'renegotiate additions in the conversation.'],
        ],
    ],
    [
        'recipes/pattern/evidence-handoff',
        [
            ['Branch, commit, thread, attachment', 'Branch, commit, message, attachment'],
            ['handles: task/thread,', 'handles: task/message,'],
            ['**Handoff outside the thread**', '**Handoff outside the conversation**'],
        ],
    ],
    [
        'recipes/technique/attachment-comments',
        [
            ['a thread reply is enough.', 'an inline reply is enough.'],
            ['the thread becomes noisy.', 'the conversation becomes noisy.'],
        ],
    ],
    [
        'recipes/technique/group-chat-debug',
        [['park it visibly (thread + task state)', 'park it visibly (inline reply + task state)']],
    ],
    [
        'recipes/technique/reminder-cron',
        [
            ['relevant message or thread.', 'relevant message or Task.'],
            ['task message or active thread,', 'task message or its Task,'],
            [
                'anchor to the message/thread that defines',
                'anchor to the message or Task that defines',
            ],
        ],
    ],
    [
        'recipes/technique/task-claim-lock',
        [['preserving the thread history.', 'preserving the conversation history.']],
    ],
    [
        'recipes/technique/video-review',
        [['Track as a checklist in the thread.', 'Track as a checklist in the conversation.']],
    ],
]);
