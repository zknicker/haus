import { hausTrpc } from '../../lib/haus-server.tsx';

/** `task.onCreated` owns list membership; the caller gets the Task in the result. */
export function useCreateTask() {
    return hausTrpc.task.create.useMutation();
}
