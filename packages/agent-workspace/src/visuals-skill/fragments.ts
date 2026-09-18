// The skill's copy-ready fragments, one file each, bundled as text so seeding
// needs no filesystem walk at runtime. Add a file here and in the owning
// module's index table; `visuals-fragments.test.ts` lints whatever lands.
/// <reference path="./markdown.d.ts" />

import areaMd from './fragments/area.md' with { type: 'text' };
import artifactPageMd from './fragments/artifact-page.md' with { type: 'text' };
import calculatorMd from './fragments/calculator.md' with { type: 'text' };
import comparisonCardsMd from './fragments/comparison-cards.md' with { type: 'text' };
import divergingBarMd from './fragments/diverging-bar.md' with { type: 'text' };
import donutMd from './fragments/donut.md' with { type: 'text' };
import dumbbellMd from './fragments/dumbbell.md' with { type: 'text' };
import emphasisBarMd from './fragments/emphasis-bar.md' with { type: 'text' };
import groupedBarMd from './fragments/grouped-bar.md' with { type: 'text' };
import heatMapMd from './fragments/heat-map.md' with { type: 'text' };
import hierarchyMd from './fragments/hierarchy.md' with { type: 'text' };
import kpiRowMd from './fragments/kpi-row.md' with { type: 'text' };
import mapUsStatesMd from './fragments/map-us-states.md' with { type: 'text' };
import mapWorldCountriesMd from './fragments/map-world-countries.md' with { type: 'text' };
import meterMd from './fragments/meter.md' with { type: 'text' };
import multiLineMd from './fragments/multi-line.md' with { type: 'text' };
import pipelineMd from './fragments/pipeline.md' with { type: 'text' };
import rankedHorizontalBarMd from './fragments/ranked-horizontal-bar.md' with { type: 'text' };
import recordCardMd from './fragments/record-card.md' with { type: 'text' };
import scatterBubbleMd from './fragments/scatter-bubble.md' with { type: 'text' };
import sequenceMd from './fragments/sequence.md' with { type: 'text' };
import sparklineMd from './fragments/sparkline.md' with { type: 'text' };
import stackedBarMd from './fragments/stacked-bar.md' with { type: 'text' };
import stateMachineMd from './fragments/state-machine.md' with { type: 'text' };
import statusListMd from './fragments/status-list.md' with { type: 'text' };
import tableMd from './fragments/table.md' with { type: 'text' };
import tileWithSparklineMd from './fragments/tile-with-sparkline.md' with { type: 'text' };
import timelineMd from './fragments/timeline.md' with { type: 'text' };
import trendLineMd from './fragments/trend-line.md' with { type: 'text' };

/** Fragment file name → its markdown, seeded under `references/fragments/`. */
export const visualsSkillFragmentFiles: Record<string, string> = {
    'area.md': areaMd,
    'artifact-page.md': artifactPageMd,
    'calculator.md': calculatorMd,
    'comparison-cards.md': comparisonCardsMd,
    'diverging-bar.md': divergingBarMd,
    'donut.md': donutMd,
    'dumbbell.md': dumbbellMd,
    'emphasis-bar.md': emphasisBarMd,
    'grouped-bar.md': groupedBarMd,
    'heat-map.md': heatMapMd,
    'hierarchy.md': hierarchyMd,
    'kpi-row.md': kpiRowMd,
    'map-us-states.md': mapUsStatesMd,
    'map-world-countries.md': mapWorldCountriesMd,
    'meter.md': meterMd,
    'multi-line.md': multiLineMd,
    'pipeline.md': pipelineMd,
    'ranked-horizontal-bar.md': rankedHorizontalBarMd,
    'record-card.md': recordCardMd,
    'scatter-bubble.md': scatterBubbleMd,
    'sequence.md': sequenceMd,
    'sparkline.md': sparklineMd,
    'stacked-bar.md': stackedBarMd,
    'state-machine.md': stateMachineMd,
    'status-list.md': statusListMd,
    'table.md': tableMd,
    'tile-with-sparkline.md': tileWithSparklineMd,
    'timeline.md': timelineMd,
    'trend-line.md': trendLineMd,
};
