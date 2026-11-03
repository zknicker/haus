import type { AdventLineRun } from '@haus/api';

/** The innkeeper's line, its `strong` runs (the numbers and names) set bold in the foreground ink. */
export function AdventLine({ runs }: { runs: readonly AdventLineRun[] }) {
    return runs.map((run, index) =>
        run.strong ? (
            // Runs never reorder; their position is their identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's runs are fixed text
            <strong className="font-semibold text-foreground" key={index}>
                {run.text}
            </strong>
        ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's runs are fixed text
            <span key={index}>{run.text}</span>
        )
    );
}

/** What a door shows when the ledger cannot be read: no stats are invented. */
export const adventFallbackLine = "The ledger's stuck in the snow. Try again in a bit.";
