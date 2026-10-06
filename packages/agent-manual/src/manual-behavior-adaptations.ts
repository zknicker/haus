import { reminderSemantics } from './reminder-semantics.ts';

// Named Haus adaptations to the pinned Manual source; keep captures verbatim.
export const manualBehaviorAdaptations = new Map<string, ReadonlyArray<readonly [string, string]>>([
    [
        'recipes/pattern/recurring-recovery',
        [
            ...(reminderSemantics.get('recipes/pattern/recurring-recovery') ?? []),
            [
                'Counter: staged cancellation on observed first delivery.',
                'Counter: staged cancellation on observed first completion (the required deliverable, or the quiet-check execution evidence and checkpoint).',
            ],
            [
                "For each recent FIRED timestamp, check the real surface for the matching output (the posted brief, the sweep message, the uploaded artifact) — not the reminder's own receipt.",
                "For each recent FIRED timestamp, check the real surface for the agreed outcome (the posted brief, the sweep evidence, the uploaded artifact) — not the reminder's own receipt. A quiet check may correctly post nothing: reconcile its actual execution evidence and saved checkpoint instead of treating silence as a missed run.",
            ],
            [
                "If a fire has no corresponding output, you found a silent drop. Reconstruct that window's work and post it, labeled as a backfill for the missed period.",
                'If a required outcome is missing, or a quiet check has no execution evidence, reconcile that window once. For a required deliverable, reconstruct and post it as a labeled backfill; for a quiet review, check the state and checkpoint without an all-clear post.',
            ],
            [
                '**A did-it-actually-land check.** On every wake, reconcile the reminder\'s FIRED log against the real output surface. "Fired" ≠ "ran." If the post/artifact isn\'t there, backfill the missed window before moving on.',
                '**A did-it-actually-land check.** On every wake, reconcile the reminder\'s FIRED log against the agreed outcome. "Fired" ≠ "ran." If a required post/artifact is missing, backfill the missed window before moving on; for an agreed quiet check, verify actual execution evidence and the saved checkpoint without requiring a post.',
            ],
            [
                "cut over on **observed delivery**, never on \"I've got it\": the old owner's backstop reminder is cancelled only after the new owner's first real run lands",
                "cut over on **observed completion**, never on \"I've got it\": the old owner's backstop reminder is cancelled only after the new owner's first real run is evidenced, including its required deliverable or quiet-check checkpoint",
            ],
            [
                '- **Fire-without-run**: a reminder firing into a restarting/idle agent advances `next` and reads as delivered; the run is silently lost. Counter: reconcile FIRED-log against actual output every wake, not the receipt.',
                '- **Fire-without-run**: a reminder fires and advances `next`, but its wake may be held while the Agent is stopped, offline, paused or failing. A fire is not evidence of execution. On resume, several held fires from one reminder may arrive together: reconcile them once against the agreed outcome, run the current check once, and backfill missed windows only for required deliverables, labeled as backfill. For quiet checks, save execution evidence and a checkpoint without an all-clear post; do not recreate or duplicate the schedule merely because delivery was held.',
            ],
        ],
    ],
    [
        'recipes/archetype/patrol',
        [
            [
                'dedicated agent, or at minimum a dedicated recurring reminder with a posted receipt each run.',
                'dedicated agent, or at minimum a dedicated recurring reminder with recorded completion evidence each run. For an agreed quiet watch, preserve the last raised evidence and stay silent for unchanged gaps or all-clear checks.',
            ],
        ],
    ],
]);
