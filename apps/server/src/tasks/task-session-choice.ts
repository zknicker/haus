import { and, eq } from 'drizzle-orm';
import { resolveInvocationTarget } from '../agent-invocations/invocation-target.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, projectsTable } from '../postgres/schema.ts';
import type { AgentModelCatalog } from '../server-agents/agent-model-catalog.ts';
import { TaskInvariantError } from './task-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface TaskSessionChoice {
    computerId: string;
    modelId: string;
    runtimeId: string;
}

/** The Captain fields crew falls back to, Capy's "Crew runs on". */
export interface CrewDefaults {
    crewComputerId: string | null;
    crewModel: string | null;
    desiredModelId: string | null;
    desiredRuntimeId: string | null;
}

/**
 * A Task's Machine and model, fixed at start: the explicit pick, else the Captain's crew
 * Machine and crew model, else the Project's default Machine and the Captain's own model.
 */
export async function chooseTaskSession(
    db: Reader,
    catalog: AgentModelCatalog,
    input: {
        captain: CrewDefaults | null;
        machine?: { computerId: string } | { name: string };
        model?: string;
        projectId: string;
        serverId: string;
    }
) {
    const computerId = await chooseMachine(db, input);
    const modelId = input.model ?? input.captain?.crewModel ?? input.captain?.desiredModelId;
    if (!modelId) {
        throw new TaskInvariantError('Name the model the Task runs.');
    }
    const choice: TaskSessionChoice = {
        computerId,
        modelId,
        runtimeId: chooseRuntime(catalog, modelId, input.captain),
    };
    return choice;
}

async function chooseMachine(
    db: Reader,
    input: {
        captain: CrewDefaults | null;
        machine?: { computerId: string } | { name: string };
        projectId: string;
        serverId: string;
    }
) {
    if (input.machine && 'name' in input.machine) {
        const target = await resolveInvocationTarget(db, {
            home: null,
            requested: input.machine.name,
            serverId: input.serverId,
        });
        if (target.kind === 'not-found' || target.computerId === null) {
            throw new TaskInvariantError(
                `No Machine on this Server is named "${input.machine.name}". Run \`haus computer list\` for their names.`
            );
        }
        return target.computerId;
    }
    const picked =
        input.machine?.computerId ??
        input.captain?.crewComputerId ??
        (await readProjectMachine(db, input));
    if (!picked) {
        throw new TaskInvariantError(
            'This Project has no default Machine, so name the Machine the Task runs on.'
        );
    }
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(and(eq(computersTable.serverId, input.serverId), eq(computersTable.id, picked)))
        .limit(1);
    if (!computer) {
        throw new TaskInvariantError('That Machine is not attached to this Server.');
    }
    return computer.id;
}

async function readProjectMachine(db: Reader, input: { projectId: string; serverId: string }) {
    const [project] = await db
        .select({ computerId: projectsTable.defaultWorkerComputerId })
        .from(projectsTable)
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(projectsTable.chatId, input.projectId)
            )
        )
        .limit(1);
    return project?.computerId ?? null;
}

function chooseRuntime(catalog: AgentModelCatalog, modelId: string, captain: CrewDefaults | null) {
    const runtimes = catalog.kind === 'runner' ? (catalog.runtimes() ?? []) : [];
    const offered = runtimes.find((runtime) =>
        runtime.models.some((model) => model.id === modelId)
    );
    if (offered) {
        return offered.id;
    }
    if (captain?.desiredModelId === modelId && captain.desiredRuntimeId) {
        return captain.desiredRuntimeId;
    }
    throw new TaskInvariantError(
        `Haus does not offer the model "${modelId}" right now. Pick a model the runner lists.`
    );
}
