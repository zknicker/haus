import { agentBoardColumnsInputSchema, agentBoardCreateInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { createBoard } from '../boards/board-create.ts';
import { listBoards } from '../boards/board-read.ts';
import { setBoardColumns } from '../boards/board-set-columns.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { agentActor, readAgentBoards, requireBoardByKey } from './task-refs.ts';
import { agentTaskRead, agentTaskWrite, withImplicitVersion } from './task-route-shell.ts';
import { toAgentBoard } from './task-view.ts';

/** The boards surface behind `haus board`. */
export function registerAgentBoardRoutes(app: FastifyInstance, db: HausDatabase) {
    agentTaskRead(
        app,
        db,
        { path: '/api/agent/boards', query: z.object({}) },
        async ({ agentId, serverId }) => ({
            boards: (
                await listBoards(db, agentActor({ agentId }), { includeArchived: false, serverId })
            ).map(toAgentBoard),
        })
    );

    agentTaskWrite(
        app,
        db,
        { body: agentBoardCreateInputSchema, path: '/api/agent/boards/create' },
        async (runner, input) => {
            const { board, event } = await createBoard(db, agentActor(runner), {
                ...input,
                serverId: runner.serverId,
            });
            publishRealtime(event);
            return { board: toAgentBoard(board) };
        }
    );

    agentTaskWrite(
        app,
        db,
        { body: agentBoardColumnsInputSchema, path: '/api/agent/boards/columns' },
        async (runner, input) => {
            const current = async () =>
                requireBoardByKey(await readAgentBoards(db, runner), input.board);
            const boardId = (await current()).id;
            const { board, events } = await withImplicitVersion(
                input.expectedVersion,
                async () => (await current()).version,
                (expectedVersion) =>
                    setBoardColumns(db, agentActor(runner), {
                        boardId,
                        columns: input.columns,
                        expectedVersion,
                        ...(input.moveTasks ? { moveTasks: input.moveTasks } : {}),
                        serverId: runner.serverId,
                    })
            );
            publishRealtime(events);
            return { board: toAgentBoard(board) };
        }
    );
}
