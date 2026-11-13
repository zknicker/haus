import { boardMutationResultSchema, boardSetColumnsInputSchema } from '@haus/api';
import { setBoardColumns } from '../../boards/board-set-columns.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { boardProcedure } from './procedure.ts';

export const setBoardColumnsProcedure = boardProcedure
    .input(boardSetColumnsInputSchema)
    .output(boardMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await setBoardColumns(ctx.hausDb, memberTaskActor(ctx.member), input);
        publishRealtime(result.events);
        return { board: result.board };
    });
