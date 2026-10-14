import type { CloudAgentObservation, CloudAgentProvider, CloudAgentStatus } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable } from '../postgres/schema.ts';
import { CloudAgentInputError } from './cloud-agent-input-store.ts';

export async function prepareClaudeObservation(
    db: HausDatabase,
    current: {
        id: string;
        provider: CloudAgentProvider;
        providerAgentId: string | null;
        providerUrl: string | null;
        providerRunId: string | null;
        status: CloudAgentStatus;
    },
    observation: CloudAgentObservation
) {
    if (current.provider !== 'claude') {
        return { observation, receiptChanged: false };
    }
    const receiptChanged = await mergeClaudeLaunchReceipt(db, current, observation);
    return {
        receiptChanged,
        observation:
            current.providerRunId && observation.status === 'queued'
                ? { ...observation, status: current.status }
                : observation,
    };
}

/** The CLI's address receipt may arrive after the native hook has already settled execution. */
export async function mergeClaudeLaunchReceipt(
    db: HausDatabase,
    current: {
        id: string;
        providerAgentId: string | null;
        providerUrl: string | null;
    },
    observation: CloudAgentObservation
): Promise<boolean> {
    if (!observation.providerAgentId) {
        return false;
    }
    if (!/^session_[A-Za-z0-9]+$/u.test(observation.providerAgentId)) {
        throw new CloudAgentInputError(
            'A Claude launch receipt must carry its hosted session identity.'
        );
    }
    const expectedUrl = `https://claude.ai/code/${observation.providerAgentId}`;
    if (observation.providerUrl && observation.providerUrl !== expectedUrl) {
        throw new CloudAgentInputError(
            'The Claude page does not match its hosted session identity.'
        );
    }
    if (current.providerAgentId && current.providerAgentId !== observation.providerAgentId) {
        throw new CloudAgentInputError(
            'This work already belongs to another hosted Claude session.'
        );
    }
    if (
        current.providerUrl &&
        observation.providerUrl &&
        current.providerUrl !== observation.providerUrl
    ) {
        throw new CloudAgentInputError('The hosted Claude page changed.');
    }
    const providerAgentId = current.providerAgentId ?? observation.providerAgentId;
    const providerUrl = current.providerUrl ?? observation.providerUrl ?? null;
    if (providerAgentId === current.providerAgentId && providerUrl === current.providerUrl) {
        return false;
    }
    await db
        .update(cloudAgentWorkTable)
        .set({ providerAgentId, providerUrl })
        .where(eq(cloudAgentWorkTable.id, current.id));
    return true;
}
