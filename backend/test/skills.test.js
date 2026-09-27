import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRouter, SKILL_CATEGORIES } from '../src/skills/index.js';

test('skill router registers categories and recognizes intents', async () => {
  assert.ok(SKILL_CATEGORIES.includes('calculation'));
  assert.ok(SKILL_CATEGORIES.includes('time_date'));
  assert.ok(SKILL_CATEGORIES.includes('reminders_tasks'));
  assert.ok(SKILL_CATEGORIES.includes('phone_actions'));

  // Test Calculation routing
  const calcRoute = await defaultRouter.route({ message: 'What is 45 * 12?' });
  assert.equal(calcRoute.skillId, 'calculation');

  // Test Time/Date routing
  const timeRoute = await defaultRouter.route({ message: 'What time is it right now?' });
  assert.equal(timeRoute.skillId, 'time_date');

  // Test Reminders routing
  const reminderRoute = await defaultRouter.route({ message: 'Remind me to submit homework at 5pm' });
  assert.equal(reminderRoute.skillId, 'reminders_tasks');

  // Test Phone action routing
  const phoneRoute = await defaultRouter.route({ message: 'Open settings on my phone' });
  assert.equal(phoneRoute.skillId, 'phone_actions');

  // Test Execution of Time/Date Skill
  const timeSkill = defaultRouter.get('time_date');
  const res = await timeSkill.execute({ message: 'time' });
  assert.ok(res.ist);
  assert.match(res.promptContext, /IST:/);
});
