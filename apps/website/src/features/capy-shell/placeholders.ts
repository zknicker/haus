export type ProgramPr = 'J2' | 'J3' | 'W2';

export type Sourced<T> =
    | { readonly source: 'live'; readonly value: T }
    | { readonly replacedBy: ProgramPr; readonly source: 'placeholder'; readonly value: T };

export function live<T>(value: T) {
    return { source: 'live', value } satisfies Sourced<T> as Sourced<T>;
}

export function placeholder<T>(value: T, replacedBy: ProgramPr) {
    return { replacedBy, source: 'placeholder', value } satisfies Sourced<T> as Sourced<T>;
}

export interface TaskWorkers {
    count: number;
    places: readonly string[];
}

const previewPlaces = ['mini', 'cursor', 'cloud'] as const;

export function previewTaskWorkers(taskId: string) {
    const seed = [...taskId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const count = seed % 3;
    const places = Array.from(
        { length: count },
        (_, index) => previewPlaces[(seed + index) % previewPlaces.length]
    );
    return placeholder<TaskWorkers>({ count, places }, 'W2');
}
