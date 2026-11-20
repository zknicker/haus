import type { RuntimeResumeState } from '../../resume-state.ts';

/** One scripted step of a fixture capture; replay tests drive the same steps. */
export type CaptureStep =
    | { readonly kind: 'open'; readonly resumeFrom?: RuntimeResumeState }
    | { readonly kind: 'stop' }
    | {
          readonly kind: 'turn';
          readonly on?:
              | { readonly action: 'abort'; readonly event: 'tool-call' | 'tool-result' }
              | {
                    readonly action: 'steer';
                    readonly event: 'tool-call' | 'tool-result';
                    readonly text: string;
                };
          readonly prompt: string;
      };

export interface CaptureScenario {
    /** Runs with no linked Codex login, as a machine that never logged in would. */
    readonly loggedOut?: boolean;
    readonly model?: string;
    readonly name: string;
    readonly steps: readonly CaptureStep[];
}

const open: CaptureStep = { kind: 'open' };

export const captureScenarios: readonly CaptureScenario[] = [
    {
        name: 'text-turn',
        steps: [open, { kind: 'turn', prompt: 'Reply with exactly OK. Do not use tools.' }],
    },
    {
        name: 'shell-turn',
        steps: [
            open,
            {
                kind: 'turn',
                prompt: 'Run the shell command `echo hello-haus` and then `cat notes-missing.txt || true`. Then reply with exactly DONE.',
            },
        ],
    },
    {
        name: 'host-tool-turn',
        steps: [
            open,
            {
                kind: 'turn',
                prompt: 'Call the haus_probe tool once, then reply with exactly the code it returned and nothing else.',
            },
        ],
    },
    {
        name: 'file-edit-turn',
        steps: [
            open,
            {
                kind: 'turn',
                prompt: 'Use your apply_patch tool to create notes.txt containing the word hi and todo.txt containing the word later. Then reply with exactly DONE.',
            },
        ],
    },
    {
        name: 'steer-turn',
        steps: [
            open,
            {
                kind: 'turn',
                on: {
                    action: 'steer',
                    event: 'tool-call',
                    text: 'Change the final reply to exactly INTERJECTED and nothing else.',
                },
                prompt: 'Run the shell command `sleep 5`. After it finishes, reply with exactly ORIGINAL and nothing else.',
            },
        ],
    },
    {
        name: 'steer-after-tool-turn',
        steps: [
            open,
            {
                kind: 'turn',
                on: {
                    action: 'steer',
                    event: 'tool-result',
                    text: 'Also say the word STEERED at the end of your reply.',
                },
                prompt: 'Run the shell command `echo one`, then run `sleep 3`, then reply with exactly FIN.',
            },
        ],
    },
    {
        name: 'interrupt-turn',
        steps: [
            open,
            {
                kind: 'turn',
                on: { action: 'abort', event: 'tool-call' },
                prompt: 'Run the shell command `sleep 30`, then reply with exactly DONE.',
            },
            { kind: 'turn', prompt: 'Reply with exactly AFTER. Do not use tools.' },
        ],
    },
    {
        name: 'resume-turn',
        steps: [
            open,
            {
                kind: 'turn',
                prompt: 'Remember this exact code for my next message: HARBOR_7429. Reply only SAVED. Do not use tools.',
            },
            { kind: 'stop' },
            {
                kind: 'turn',
                prompt: 'What was the exact code? Reply with only the code. Do not use tools.',
            },
        ],
    },
    {
        name: 'missing-rollout',
        steps: [
            {
                kind: 'open',
                resumeFrom: {
                    runtime: 'codex',
                    threadId: '01a00000-0000-7000-8000-000000000000',
                    version: 1,
                },
            },
        ],
    },
    {
        model: 'gpt-haus-missing-model',
        name: 'unknown-model-turn',
        steps: [open, { kind: 'turn', prompt: 'Reply with exactly OK.' }],
    },
    {
        name: 'image-generation-turn',
        steps: [
            open,
            {
                kind: 'turn',
                prompt: 'Use your native image generation tool to make a small flat red circle on white. Then reply with exactly DONE.',
            },
        ],
    },
    {
        loggedOut: true,
        name: 'logged-out-turn',
        steps: [open, { kind: 'turn', prompt: 'Reply with exactly OK.' }],
    },
];
