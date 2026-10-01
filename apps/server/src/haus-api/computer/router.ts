import { createRouter } from '../trpc.ts';
import { checkComputerPresenceProcedure } from './check-presence.ts';
import { checkComputerUpdateProcedure } from './check-update.ts';
import { listComputersProcedure } from './list.ts';
import { computerLoginRouter } from './login/router.ts';
import { refreshComputerInventoryProcedure } from './refresh-inventory.ts';
import { removeComputerProcedure } from './remove.ts';
import { computerSkillFileProcedure } from './skill-file.ts';
import { startComputerUpdateProcedure } from './start-update.ts';
import { computerSystemLogProcedure } from './system-log.ts';
import { validateComputerProcedure } from './validate.ts';

export const computerRouter = createRouter({
    checkPresence: checkComputerPresenceProcedure,
    checkUpdate: checkComputerUpdateProcedure,
    list: listComputersProcedure,
    login: computerLoginRouter,
    remove: removeComputerProcedure,
    refreshInventory: refreshComputerInventoryProcedure,
    skillFile: computerSkillFileProcedure,
    systemLog: computerSystemLogProcedure,
    update: startComputerUpdateProcedure,
    validate: validateComputerProcedure,
});
