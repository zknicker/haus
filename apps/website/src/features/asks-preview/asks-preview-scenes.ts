export const asksPreviewBasePath = '/prototype/asks';

export const asksPreviewScenes = [
    {
        description:
            'A Worker asks three questions; its composer becomes the stepper, then Review. Send posts the answers as your follow-up.',
        id: 'worker-question',
        title: 'Worker question',
    },
    {
        description: 'The four Review looks side by side, one question still unanswered.',
        id: 'review-looks',
        title: 'Review looks',
    },
] as const;

export type AsksPreviewSceneId = (typeof asksPreviewScenes)[number]['id'];

export function asksScenePath(sceneId: AsksPreviewSceneId) {
    return `${asksPreviewBasePath}/${sceneId}`;
}

export function findAsksScene(sceneId: string) {
    return asksPreviewScenes.find((candidate) => candidate.id === sceneId) ?? null;
}
