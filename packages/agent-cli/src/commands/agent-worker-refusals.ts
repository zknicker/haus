import type { WorkerRefusalCode } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';

const placesStep = 'Run haus worker places --task <KEY-n> to see where Workers can run';

const nextActions: Partial<Record<WorkerRefusalCode, string>> = {
    WORKER_MODEL_UNAVAILABLE:
        'Start again with --model set to one the message lists, or leave --model out.',
    WORKER_OPTION_CLOUD:
        'Drop --runtime and --model for a cloud place; its model is the Server’s cloud model setting.',
    WORKER_PLACE_AMBIGUOUS: `${placesStep}, then start again with --on computer:<id>.`,
    WORKER_PLACE_OFF: `${placesStep}, then pick another place or ask a person to turn on Workers can run here for that Computer.`,
    WORKER_PLACE_REQUIRED: `${placesStep}, then start again with --on <place>.`,
    WORKER_PLACE_UNAVAILABLE: `${placesStep}, then pick a ready place.`,
    WORKER_RUNTIME_UNAVAILABLE: `${placesStep}, then pick a ready --runtime there or leave it out.`,
};

export function withRefusalStep(error: unknown) {
    if (!(error instanceof AgentCliError) || error.options.nextAction) {
        return error;
    }
    const nextAction = nextActions[error.code as WorkerRefusalCode];
    return nextAction
        ? new AgentCliError(error.code, error.message, { ...error.options, nextAction })
        : error;
}
