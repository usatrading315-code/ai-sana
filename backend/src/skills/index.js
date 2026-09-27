import { defaultRouter } from './router.js';
import {
  timeDateSkill,
  calculationSkill,
  remindersTasksSkill,
  phoneActionsSkill,
  studySuperSkill,
  codingSkill,
} from './builtins.js';

// Register core default skills
defaultRouter.register(timeDateSkill);
defaultRouter.register(calculationSkill);
defaultRouter.register(remindersTasksSkill);
defaultRouter.register(phoneActionsSkill);
defaultRouter.register(studySuperSkill);
defaultRouter.register(codingSkill);

export { defaultRouter, SKILL_CATEGORIES } from './router.js';
