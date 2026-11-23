import type { DispatchKey, InvocationOperation, InvocationResultFrame } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { recordGateRefusal } from '../agent-invocations/invocation-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    computersTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../postgres/schema.ts';
import { readComputerRepoFolders, readRepoFolder } from './repo-folder-read.ts';

type AnswerKey = DispatchKey & { agentId: string };

export async function gateRepoCheckout(
    db: HausDatabase,
    input: {
        appOrigin: string;
        computerId: string | null;
        invocationId: string;
        key: AnswerKey;
        operation: InvocationOperation;
        serverId: string;
    }
) {
    const { operation } = input;
    if (operation.kind !== 'repo-checkout' || input.computerId === null) {
        return { kind: 'forward' as const, operation };
    }
    const scope = { computerId: input.computerId, serverId: input.serverId };
    const folder = await readRepoFolder(db, { ...scope, repository: operation.repository });
    if (folder) {
        return {
            kind: 'forward' as const,
            operation: {
                folder: folder.path,
                kind: operation.kind,
                ref: operation.ref,
                repository: operation.repository,
            } satisfies InvocationOperation,
        };
    }
    const text = await noFolderText(db, { ...input, ...scope, repository: operation.repository });
    const outcome = await recordGateRefusal(db, input.invocationId);
    return outcome
        ? { answer: refusalFrame(input, outcome, text), kind: 'refused' as const }
        : { answer: null, kind: 'refused' as const };
}

export async function noFolderText(
    db: HausDatabase,
    input: { appOrigin: string; computerId: string; repository: string; serverId: string }
) {
    const [computer] = await db
        .select({
            displayName: usersTable.displayName,
            handle: serverMembershipsTable.handle,
            inventory: computersTable.reportedInventory,
            slug: serversTable.slug,
        })
        .from(computersTable)
        .innerJoin(serversTable, eq(serversTable.id, computersTable.serverId))
        .leftJoin(usersTable, eq(usersTable.id, computersTable.attachedByUserId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, computersTable.serverId),
                eq(serverMembershipsTable.userId, computersTable.attachedByUserId)
            )
        )
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    const device = computer?.inventory?.name?.trim() || 'this Device';
    const folders = (await readComputerRepoFolders(db, input)).map(
        (folder) => `${folder.repository} (${folder.path})`
    );
    const attacher = computer?.handle
        ? `@${computer.handle}`
        : (computer?.displayName ?? 'the person who attached it');
    const link = computer
        ? ` (${new URL(`/s/${computer.slug}/settings/computers/${input.computerId}`, input.appOrigin).toString()})`
        : '';
    const listed =
        folders.length > 0
            ? `${device}'s repo folders: ${folders.join(', ')}.`
            : `${device} has no repo folders yet.`;
    return `${device} has no folder for ${input.repository}, so \`haus repo checkout\` can't make a worktree there. ${listed} Ask ${attacher}, who attached ${device}, to add one in Settings → Devices → ${device} → Repositories${link}, or with \`haus-computer repo add <path>\` on that machine. Then try again.`;
}

function refusalFrame(
    input: { invocationId: string; key: AnswerKey },
    outcome: 'failed' | 'offline',
    text: string
) {
    const answer: InvocationResultFrame = {
        agentId: input.key.agentId,
        invocationId: input.invocationId,
        outcome,
        output: { kind: 'text', text },
        runId: input.key.runId,
        seq: input.key.seq,
        toolCallId: input.key.toolCallId,
        truncated: false,
        type: 'invocation-result',
    };
    return answer;
}
