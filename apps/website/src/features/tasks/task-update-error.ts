import { toast } from '@heroui/react';

/** A rail control has no row to report on, so a refusal, a stale version included, lands here. */
export function showTaskUpdateError(error: { message: string }) {
    toast.danger('Task update failed', { description: error.message });
}
