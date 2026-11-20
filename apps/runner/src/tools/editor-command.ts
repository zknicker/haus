import { editorCommandSchema } from '@haus/api';
import * as z from 'zod';
import type { EditToolInput, ToolOutcome } from '../run-context.ts';

const commandFields = {
    create: ['file_text'],
    insert: ['insert_line', 'new_str'],
    str_replace: ['old_str', 'new_str'],
    view: ['view_range'],
} as const satisfies Record<EditToolInput['command'], readonly (keyof EditToolInput)[]>;

export function editorCommandOf(input: EditToolInput) {
    const fields = commandFields[input.command].flatMap((field) =>
        input[field] === undefined ? [] : [[field, input[field]] as const]
    );
    const parsed = editorCommandSchema.safeParse({
        command: input.command,
        path: input.path,
        ...Object.fromEntries(fields),
    });
    if (parsed.success) {
        return { command: parsed.data, kind: 'command' as const };
    }
    return { kind: 'refused' as const, outcome: refusedInput(input.command, parsed.error) };
}

export function refusedInput(name: string, error: z.ZodError) {
    return {
        content: [
            {
                text: `The ${name} input is invalid. Nothing ran.\n${z.prettifyError(error)}`,
                type: 'text',
            },
        ],
        isError: true,
    } satisfies ToolOutcome;
}
