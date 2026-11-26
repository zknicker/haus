import { invocationOutcomeNotices } from '@haus/api';
import type * as z from 'zod';
import { finishedRecord, type Ledger } from './ledger.ts';

export async function recoverLedger(ledger: Ledger) {
    const records = await ledger.list();
    const finishedAt = new Date().toISOString();
    await Promise.all(
        records.flatMap((record) =>
            record.state === 'accepted'
                ? [
                      ledger.write(
                          finishedRecord(
                              record,
                              {
                                  invocationId: record.invocationId,
                                  outcome: 'unknown',
                                  output: { kind: 'text', text: invocationOutcomeNotices.unknown },
                                  truncated: false,
                                  type: 'invoke-result',
                              },
                              finishedAt
                          )
                      ),
                  ]
                : []
        )
    );
    return new Map(records.map((record) => [record.invocationId, record.agentId]));
}

export function withParsed<Command>(
    schema: z.ZodType<Command>,
    frame: Record<string, unknown>,
    handle: (command: Command) => void
) {
    const parsed = schema.safeParse(frame);
    if (parsed.success) {
        handle(parsed.data);
    } else {
        console.error(`Ignored a malformed ${String(frame.type)} frame.`, parsed.error.message);
    }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
