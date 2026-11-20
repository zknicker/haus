import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import type { EditorCommand } from '@haus/api';
import { applyPatch } from './codex/apply-patch.ts';
import { viewPath } from './editor-view.ts';
import {
    existingFile,
    filesystemFailure,
    stoppedBeforeWrite,
    writeFileAtomically,
} from './files.ts';
import { type OperationContext, type OperationRunner, textResult } from './operation.ts';
import { resolveMachinePath } from './paths.ts';
import { applyEditsToFileText, normalizeToLF, splitBom } from './pi/edit-diff.ts';

type Command<Name extends EditorCommand['command']> = Extract<EditorCommand, { command: Name }>;

export const editRunner: OperationRunner<'edit'> = (operation, context) => {
    const { edit } = operation;
    switch (edit.command) {
        case 'view':
            return viewPath(edit, context);
        case 'create':
            return createFile(edit, context);
        case 'str_replace':
            return replaceText(edit, context);
        case 'insert':
            return insertText(edit, context);
        case 'apply_patch':
            return applyPatch(edit, context);
    }
};

async function createFile(command: Command<'create'>, context: OperationContext) {
    const absolutePath = resolveMachinePath(command.path, context);
    try {
        const existed = (await existingFile(absolutePath)) !== null;
        const stopped = await writeFileAtomically(absolutePath, command.file_text, context.signal);
        if (stopped) {
            return stoppedBeforeWrite(stopped, command.path);
        }
        return textResult(
            'completed',
            existed
                ? `File overwritten at: ${command.path}`
                : `File created successfully at: ${command.path}`
        );
    } catch (error) {
        return filesystemFailure(error, `Could not write file: ${command.path}.`);
    }
}

function replaceText(command: Command<'str_replace'>, context: OperationContext) {
    return rewriteFile(command.path, context, (content) => {
        try {
            return {
                content: applyEditsToFileText(
                    content,
                    [{ newText: command.new_str, oldText: command.old_str }],
                    command.path
                ),
                text: `Successfully replaced 1 block(s) in ${command.path}.`,
            };
        } catch (error) {
            return { refusal: error instanceof Error ? error.message : String(error) };
        }
    });
}

function insertText(command: Command<'insert'>, context: OperationContext) {
    return rewriteFile(command.path, context, (rawContent) => {
        const { bom, text } = splitBom(rawContent);
        const lines = text.match(/[^\n]*\n|[^\n]+/gu) ?? [];
        if (command.insert_line > lines.length) {
            return {
                refusal: `Invalid insert_line ${command.insert_line}: ${command.path} has ${lines.length} lines. Use a line from 0 to ${lines.length}.`,
            };
        }
        const ending = text.includes('\r\n') && !/(?:^|[^\r])\n/u.test(text) ? '\r\n' : '\n';
        const before = lines.slice(0, command.insert_line).join('');
        const after = lines.slice(command.insert_line).join('');
        const body = normalizeToLF(command.new_str).replace(/\n$/u, '');
        const separator = before.length > 0 && !before.endsWith('\n') ? ending : '';
        const terminator = after.length > 0 || text.endsWith('\n') ? ending : '';
        const inserted = body.replaceAll('\n', ending);
        return {
            content: `${bom}${before}${separator}${inserted}${terminator}${after}`,
            text: `Inserted ${body.split('\n').length} line(s) after line ${command.insert_line} in ${command.path}.`,
        };
    });
}

async function rewriteFile(
    path: string,
    context: OperationContext,
    rewrite: (content: string) => { content: string; text: string } | { refusal: string }
) {
    const absolutePath = resolveMachinePath(path, context);
    try {
        await access(absolutePath, constants.R_OK | constants.W_OK);
        const change = rewrite(await readFile(absolutePath, 'utf-8'));
        if ('refusal' in change) {
            return textResult('failed', change.refusal);
        }
        const stopped = await writeFileAtomically(absolutePath, change.content, context.signal);
        if (stopped) {
            return stoppedBeforeWrite(stopped, path);
        }
        return textResult('completed', change.text);
    } catch (error) {
        return filesystemFailure(error, `Could not edit file: ${path}.`);
    }
}
