import { reminderSemantics } from './reminder-semantics.ts';

// Named Haus adaptations to the pinned Manual source; keep captures verbatim.
export const manualBehaviorAdaptations = new Map<string, ReadonlyArray<readonly [string, string]>>([
    [
        'recipes/pattern/recurring-recovery',
        [
            ...(reminderSemantics.get('recipes/pattern/recurring-recovery') ?? []),
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
                'Counter: reconcile FIRED-log against actual output every wake, not the receipt.',
                'Counter: reconcile FIRED-log against the agreed outcome every wake, not the receipt; quiet checks need execution evidence, required deliverables need their actual output.',
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
