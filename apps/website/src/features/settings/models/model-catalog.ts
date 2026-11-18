import type { ComputerInventory } from '@haus/api';
import { type ComputerPresentation, computerLabel } from '../../computers/presentation.ts';
import { modelFeatureLabels } from '../../members/model-features.ts';

export interface ModelsComputer extends ComputerPresentation {
    reportedInventory: ComputerInventory | null;
}

export interface ModelCatalogItem {
    computerCount: number;
    features: string[];
    id: string;
    label: string;
    runtimes: string[];
}

export function buildModelCatalog(computers: ModelsComputer[]) {
    const models = new Map<
        string,
        {
            computers: Set<string>;
            features: Set<string>;
            id: string;
            label: string;
            runtimes: Set<string>;
        }
    >();

    for (const computer of computers) {
        for (const runtime of computer.reportedInventory?.runtimes ?? []) {
            for (const model of runtime.models) {
                const item = models.get(model.id) ?? {
                    computers: new Set<string>(),
                    features: new Set<string>(),
                    id: model.id,
                    label: model.label,
                    runtimes: new Set<string>(),
                };
                item.computers.add(computer.id);
                item.runtimes.add(runtime.label);
                for (const feature of modelFeatureLabels(runtime.id, model.features)) {
                    item.features.add(feature);
                }
                models.set(model.id, item);
            }
        }
    }

    return [...models.values()]
        .map((model) => ({
            computerCount: model.computers.size,
            features: [...model.features],
            id: model.id,
            label: model.label,
            runtimes: [...model.runtimes].sort(),
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildRuntimeAccess(computers: ModelsComputer[]) {
    return computers.flatMap((computer) =>
        (computer.reportedInventory?.runtimes ?? []).map((runtime) => ({
            computer: computerLabel(computer),
            computerId: computer.id,
            runtime,
        }))
    );
}
