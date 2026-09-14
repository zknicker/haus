import { createRouter } from '../trpc.ts';
import { checkComputerUpdateProcedure } from './check-update.ts';
import { listComputersProcedure } from './list.ts';
import { computerLoginRouter } from './login/router.ts';
import { refreshComputerInventoryProcedure } from './refresh-inventory.ts';
import { removeComputerProcedure } from './remove.ts';
import { startComputerUpdateProcedure } from './start-update.ts';
import { computerSystemLogProcedure } from './system-log.ts';
import { validateComputerProcedure } from './validate.ts';

export const computerRouter = createRouter({
    checkUpdate: checkComputerUpdateProcedure,
    list: listComputersProcedure,
    login: computerLoginRouter,
    remove: removeComputerProcedure,
    refreshInventory: refreshComputerInventoryProcedure,
    systemLog: computerSystemLogProcedure,
    update: startComputerUpdateProcedure,
    validate: validateComputerProcedure,
});
