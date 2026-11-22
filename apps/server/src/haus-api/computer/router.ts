import { createRouter } from '../trpc.ts';
import { checkComputerUpdateProcedure } from './check-update.ts';
import { desktopActivityProcedure } from './desktop-activity.ts';
import { listComputersProcedure } from './list.ts';
import { computerLoginRouter } from './login/router.ts';
import { onDesktopActivityProcedure } from './on-desktop-activity.ts';
import { onComputerUpdatedProcedure } from './on-updated.ts';
import { refreshComputerInventoryProcedure } from './refresh-inventory.ts';
import { removeComputerProcedure } from './remove.ts';
import { setComputerUseAgentsProcedure } from './set-computer-use-agents.ts';
import { setComputerUseProcedure } from './set-computer-use.ts';
import { setComputerWorkersProcedure } from './set-workers.ts';
import { computerSkillFileProcedure } from './skill-file.ts';
import { startComputerUpdateProcedure } from './start-update.ts';
import { computerStewardsProcedure } from './stewards.ts';
import { stopDesktopInputProcedure } from './stop-desktop-input.ts';
import { computerSystemLogProcedure } from './system-log.ts';
import { validateComputerProcedure } from './validate.ts';

export const computerRouter = createRouter({
    checkUpdate: checkComputerUpdateProcedure,
    desktopActivity: desktopActivityProcedure,
    list: listComputersProcedure,
    login: computerLoginRouter,
    onDesktopActivity: onDesktopActivityProcedure,
    onUpdated: onComputerUpdatedProcedure,
    remove: removeComputerProcedure,
    refreshInventory: refreshComputerInventoryProcedure,
    setComputerUse: setComputerUseProcedure,
    setComputerUseAgents: setComputerUseAgentsProcedure,
    setWorkers: setComputerWorkersProcedure,
    skillFile: computerSkillFileProcedure,
    stewards: computerStewardsProcedure,
    stopDesktopInput: stopDesktopInputProcedure,
    systemLog: computerSystemLogProcedure,
    update: startComputerUpdateProcedure,
    validate: validateComputerProcedure,
});
