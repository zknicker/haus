import {
    type CloudAgentObservation,
    type CloudAgentProvider,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentInputTable } from '../postgres/schema.ts';

/** A generic transport receipt cannot settle or hide a native question still awaiting consumption. */
export async function preserveCloudAgentInput(
    db: HausDatabase,
    provider: CloudAgentProvider,
    observation: CloudAgentObservation
): Promise<CloudAgentObservation | null> {
    if (provider !== 'claude') {
        return observation;
    }
    const [pending] = await db
        .select({ id: cloudAgentInputTable.id })
        .from(cloudAgentInputTable)
        .where(
            and(
                eq(cloudAgentInputTable.runId, observation.runId),
                inArray(cloudAgentInputTable.state, ['pending', 'answered'])
            )
        )
        .limit(1);
    if (!pending) {
        return observation;
    }
    if (observation.status === 'completed') {
        return null;
    }
    if (isTerminalCloudAgentStatus(observation.status)) {
        await db
            .update(cloudAgentInputTable)
            .set({ state: 'cancelled' })
            .where(
                and(
                    eq(cloudAgentInputTable.runId, observation.runId),
                    inArray(cloudAgentInputTable.state, ['pending', 'answered'])
                )
            );
        return observation;
    }
    return { ...observation, status: 'pending_input' };
}
