import { unlink } from 'node:fs/promises';
import type { PatchCommand } from '@haus/api';
import { filesystemFailure, writeFileAtomically } from '../files.ts';
import { type OperationContext, stoppedOutcome, textResult } from '../operation.ts';
import { resolveMachinePath } from '../paths.ts';
import { parsePatch } from './parser.ts';
import { PatchParseError } from './patch-errors.ts';
import { errorCode, type PlannedFile, planPatch } from './patch-plan.ts';

const writePhaseRunsToTheEnd = new AbortController().signal;

export async function applyPatch(command: PatchCommand, context: OperationContext) {
    let hunks: ReturnType<typeof parsePatch>['hunks'];
    try {
        ({ hunks } = parsePatch(command.input));
    } catch (error) {
        if (error instanceof PatchParseError) {
            return textResult('failed', error.message);
        }
        throw error;
    }
    if (hunks.length === 0) {
        return textResult('failed', 'No files were modified.');
    }
    const cwd = resolveMachinePath(command.cwd ?? context.cwd, context);
    let plan: Awaited<ReturnType<typeof planPatch>>;
    try {
        plan = await planPatch(hunks, { cwd, env: context.env });
    } catch (error) {
        return filesystemFailure(error, 'Could not apply the patch. Nothing was written.');
    }
    if (plan.refusal !== undefined) {
        return textResult('failed', plan.refusal);
    }
    const stopped = stoppedOutcome(context.signal);
    if (stopped) {
        return textResult(stopped, 'Stopped before applying the patch. Nothing was written.');
    }
    const changes = [...plan.files].filter(([, file]) => file.content !== null || file.existed);
    for (const [index, [path, file]] of changes.entries()) {
        try {
            await commit(path, file);
        } catch (error) {
            const code = errorCode(error);
            if (!code) {
                throw error;
            }
            return partialFailure(
                `Could not ${file.content === null ? 'delete' : 'write'} ${path}. Error code: ${code}.`,
                changes.slice(0, index).map(([changed]) => changed),
                changes.slice(index).map(([unchanged]) => unchanged)
            );
        }
    }
    const { added, deleted, modified } = plan.summary;
    return textResult(
        'completed',
        [
            'Success. Updated the following files:',
            ...added.map((path) => `A ${path}`),
            ...modified.map((path) => `M ${path}`),
            ...deleted.map((path) => `D ${path}`),
        ].join('\n')
    );
}

async function commit(path: string, file: PlannedFile) {
    if (file.content === null) {
        await unlink(path);
        return;
    }
    await writeFileAtomically(path, file.content, writePhaseRunsToTheEnd, file.mode);
}

function partialFailure(reason: string, changed: string[], unchanged: string[]) {
    if (changed.length === 0) {
        return textResult('failed', `${reason}\nNothing was written.`);
    }
    return textResult(
        'completed',
        [
            `The patch was only partly applied. ${reason}`,
            'Changed:',
            ...changed,
            'Not changed:',
            ...unchanged,
        ].join('\n'),
        { exitCode: 1, truncated: false }
    );
}
