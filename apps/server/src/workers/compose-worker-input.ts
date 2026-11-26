import { type WorkerTurnInput, artifactTextMaxBytes } from '@haus/api';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { liveArtifactAtPath } from '../artifacts/path.ts';
import { type ArtifactStorage, requireArtifactStorage } from '../artifacts/storage.ts';
import { artifactTextFromBytes } from '../artifacts/text.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, artifactRevisionsTable, serverMembershipsTable } from '../postgres/schema.ts';
import { workerInstructions } from './worker-instructions.ts';

interface DriveFile {
    path: string;
    revisionId: string;
    text: string;
}

const inlinedFileMaxLength = 48_000;

export async function composeWorkerInput(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    input: {
        agentHandle: string;
        delivered: string | null;
        inputs: readonly WorkerTurnInput[];
        isHausProject: boolean;
        place: 'cloud' | 'computer';
        serverId: string;
        projectKey: string;
        taskShortId: string;
    }
) {
    const firstTurn = input.inputs[0]?.kind === 'brief';
    const read = (path: string) => readDriveFile(tx, storage, input.serverId, path);
    const workerMd = await read(`agents/${input.agentHandle}/WORKER.md`);
    const rules = firstTurn
        ? [
              await read('haus/AGENTS.md'),
              input.isHausProject ? null : await read(`projects/${input.projectKey}/AGENTS.md`),
              workerMd,
          ]
        : [workerMd && workerMd.revisionId !== input.delivered ? workerMd : null];
    const inlined = rules.filter((file): file is DriveFile => file !== null);
    const handles = await readAuthorHandles(tx, input.serverId, input.inputs);
    const sections = input.inputs.map((turnInput) => {
        const handle = handles.get(turnInput.author.id);
        const author = handle ? `@${handle}` : 'a teammate';
        const label = turnInput.kind === 'brief' ? 'Brief' : 'Follow-up';
        return `## ${label} from ${author}\n\n${turnInput.text}`;
    });
    const text = [
        workerInstructions({
            agentHandle: input.agentHandle,
            place: input.place,
            taskShortId: input.taskShortId,
        }),
        ...inlined.map(inlineFile),
        ...sections,
    ].join('\n\n');
    return {
        input: text,
        workerMdRevisionId: inlined.includes(workerMd as DriveFile)
            ? (workerMd?.revisionId ?? null)
            : null,
    };
}

function inlineFile(file: DriveFile) {
    const text =
        file.text.length > inlinedFileMaxLength
            ? `${file.text.slice(0, inlinedFileMaxLength)}\n\n(Cut here. Read the whole file at ${file.path}.)`
            : file.text;
    return `## ${file.path} (revision ${file.revisionId})\n\n${text}`;
}

async function readDriveFile(
    tx: HausDatabase,
    storage: ArtifactStorage | null,
    serverId: string,
    path: string
) {
    const artifact = await liveArtifactAtPath(tx, serverId, path);
    if (!artifact?.currentRevisionId) {
        return null;
    }
    const [revision] = await tx
        .select({ objectKey: artifactRevisionsTable.objectKey })
        .from(artifactRevisionsTable)
        .where(
            and(
                eq(artifactRevisionsTable.serverId, serverId),
                eq(artifactRevisionsTable.id, artifact.currentRevisionId)
            )
        )
        .limit(1);
    if (!revision) {
        return null;
    }
    const bytes = await requireArtifactStorage(storage).read(
        revision.objectKey,
        artifactTextMaxBytes + 1
    );
    const decoded = artifactTextFromBytes(bytes);
    return decoded.status === 'text'
        ? ({
              path: artifact.path,
              revisionId: artifact.currentRevisionId,
              text: decoded.text,
          } satisfies DriveFile)
        : null;
}

async function readAuthorHandles(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    inputs: readonly WorkerTurnInput[]
) {
    const agentIds = authorIds(inputs, 'agent');
    const userIds = authorIds(inputs, 'user');
    const agents =
        agentIds.length > 0
            ? await db
                  .select({ handle: agentsTable.handle, id: agentsTable.id })
                  .from(agentsTable)
                  .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds)))
            : [];
    const users =
        userIds.length > 0
            ? await db
                  .select({
                      handle: serverMembershipsTable.handle,
                      id: serverMembershipsTable.userId,
                  })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          inArray(serverMembershipsTable.userId, userIds),
                          isNotNull(serverMembershipsTable.handle)
                      )
                  )
            : [];
    return new Map([...agents, ...users].map(({ handle, id }) => [id, handle]));
}

function authorIds(inputs: readonly WorkerTurnInput[], kind: 'agent' | 'user') {
    return [
        ...new Set(
            inputs
                .filter((turnInput) => turnInput.author.kind === kind)
                .map(({ author }) => author.id)
        ),
    ];
}
