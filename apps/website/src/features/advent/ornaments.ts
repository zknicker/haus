import { type AdventFact, adventFacts } from '@haus/api';
import baubleSource from './assets/ornament-bauble.png';
import baublePurpleSource from './assets/ornament-bauble-purple.png';
import baubleSnowflakeSource from './assets/ornament-bauble-snowflake.png';
import baubleStripedSource from './assets/ornament-bauble-striped.png';
import bellSource from './assets/ornament-bell.png';
import bowSource from './assets/ornament-bow.png';
import candyCaneSource from './assets/ornament-candy-cane.png';
import drumSource from './assets/ornament-drum.png';
import gingerbreadSource from './assets/ornament-gingerbread.png';
import gingerbreadHouseSource from './assets/ornament-gingerbread-house.png';
import icicleSource from './assets/ornament-icicle.png';
import lanternSource from './assets/ornament-lantern.png';
import mittenSource from './assets/ornament-mitten.png';
import peppermintSource from './assets/ornament-peppermint.png';
import pineconeSource from './assets/ornament-pinecone.png';
import presentGreenSource from './assets/ornament-present-green.png';
import presentRedSource from './assets/ornament-present-red.png';
import puddingSource from './assets/ornament-pudding.png';
import snowflakeSource from './assets/ornament-snowflake.png';
import snowmanSource from './assets/ornament-snowman.png';
import starSource from './assets/ornament-star.png';
import stockingSource from './assets/ornament-stocking.png';
import treeSource from './assets/ornament-tree.png';
import wreathSource from './assets/ornament-wreath.png';

/** One painted ornament (Codex image gen), split from the advent sheet at 192px. */
export type Ornament = keyof typeof ornamentArt;

export const ornamentArt = {
    bauble: baubleSource,
    'bauble-purple': baublePurpleSource,
    'bauble-snowflake': baubleSnowflakeSource,
    'bauble-striped': baubleStripedSource,
    bell: bellSource,
    bow: bowSource,
    'candy-cane': candyCaneSource,
    drum: drumSource,
    gingerbread: gingerbreadSource,
    'gingerbread-house': gingerbreadHouseSource,
    icicle: icicleSource,
    lantern: lanternSource,
    mitten: mittenSource,
    peppermint: peppermintSource,
    pinecone: pineconeSource,
    'present-green': presentGreenSource,
    'present-red': presentRedSource,
    pudding: puddingSource,
    snowflake: snowflakeSource,
    snowman: snowmanSource,
    star: starSource,
    stocking: stockingSource,
    tree: treeSource,
    wreath: wreathSource,
} as const satisfies Record<string, string>;

/**
 * Each fact's ornament, picked so the art says something about the fact:
 * the loud channel is a drum, the busiest hour a bell, files a present,
 * tokens a lantern burning its oil, the recap the star on top. Every
 * ornament is used once.
 */
export const factOrnament: Readonly<Record<AdventFact, Ornament>> = {
    'messages-sent': 'stocking', // stuffed full
    'loudest-channel': 'drum',
    'busiest-hour': 'bell', // the clock's chime
    'full-house': 'gingerbread-house',
    'early-bird': 'icicle', // frost at dawn
    'agents-at-table': 'gingerbread', // the little crew
    'most-thanked-agent': 'bow', // a thank-you, tied up
    'files-shared': 'present-green',
    'night-owl': 'bauble-purple', // midnight
    'closest-dm': 'mitten', // a pair
    'longest-thread': 'candy-cane', // the long one
    'tokens-used': 'lantern', // burning through the oil
    'quickest-reply': 'peppermint', // a quick spin
    'busiest-day': 'pudding', // the feast day
    'tasks-closed': 'present-red', // wrapped up
    'new-channels': 'tree', // something planted
    'quiet-month': 'snowflake', // a quiet snowfall
    'threads-resolved': 'wreath', // a loop closed
    'favorite-reaction': 'snowman', // a face
    'hardest-worker': 'bauble', // the centrepiece
    'in-demand': 'bauble-striped', // everyone's eye on it
    'longest-streak': 'pinecone', // one scale after another
    'weekends-off': 'bauble-snowflake', // a snow day
    recap: 'star', // the top of the tree
};

/** The ornament behind a door: door N reveals the Nth fact. */
export function dayOrnament(day: number): Ornament {
    const fact = adventFacts[day - 1];
    return fact ? factOrnament[fact] : 'star';
}
