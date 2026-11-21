import type { ClaudeSystemMessage } from './claude-messages.ts';

export class ClaudeBackgroundTasks {
    private live = new Set<string>();

    get running() {
        return this.live.size > 0;
    }

    apply(message: ClaudeSystemMessage) {
        if (message.subtype !== 'background_tasks_changed' || !message.tasks) {
            return;
        }
        this.live = new Set(
            message.tasks.filter((task) => task.ambient !== true).map((task) => task.task_id)
        );
    }

    clear() {
        this.live = new Set();
    }
}
