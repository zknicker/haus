import { createRouter } from '../trpc.ts';
import { checkComputerUpdateProcedure } from './check-update.ts';
import { listComputersProcedure } from './list.ts';
import { computerLoginRouter } from './login/router.ts';
import { onComputerUpdatedProcedure } from './on-updated.ts';
import { refreshComputerInventoryProcedure } from './refresh-inventory.ts';
import { removeComputerProcedure } from './remove.ts';
import { setComputerUseProcedure } from './set-computer-use.ts';
import { setComputerWorkersProcedure } from './set-workers.ts';
import { computerSkillFileProcedure } from './skill-file.ts';
import { startComputerUpdateProcedure } from './start-update.ts';
import { computerSystemLogProcedure } from './system-log.ts';
import { validateComputerProcedure } from './validate.ts';

export const computerRouter = createRouter({
    checkUpdate: checkComputerUpdateProcedure,
    list: listComputersProcedure,
    login: computerLoginRouter,
    onUpdated: onComputerUpdatedProcedure,
    remove: removeComputerProcedure,
    refreshInventory: refreshComputerInventoryProcedure,
    setComputerUse: setComputerUseProcedure,
    setWorkers: setComputerWorkersProcedure,
    skillFile: computerSkillFileProcedure,
    systemLog: computerSystemLogProcedure,
    update: startComputerUpdateProcedure,
    validate: validateComputerProcedure,
});
