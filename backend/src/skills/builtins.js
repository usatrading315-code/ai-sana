/**
 * Built-in skills with automated execution & context enrichment
 */

export const timeDateSkill = {
  id: 'time_date',
  description: 'Provides exact local and global date/time information.',
  async execute({ message }) {
    const now = new Date();
    const istOptions = { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' };
    const ist = new Intl.DateTimeFormat('en-IN', istOptions).format(now);
    const utc = now.toUTCString();
    return {
      skill: 'time_date',
      ist,
      utc,
      promptContext: `Current system time: IST: ${ist} (UTC: ${utc}). State the time/date clearly and concisely based on this exact timestamp.`,
    };
  },
};

export const calculationSkill = {
  id: 'calculation',
  description: 'Handles arithmetic, mathematical reasoning, and expressions.',
  async execute({ message }) {
    return {
      skill: 'calculation',
      promptContext: 'Solve the arithmetic or mathematical calculation step-by-step. Put key formulas and final answers clearly on separate lines using $$...$$.',
    };
  },
};

export const remindersTasksSkill = {
  id: 'reminders_tasks',
  description: 'Organizes to-dos, tasks, and reminder formatting for the user with persistent store integration.',
  async execute({ message, deviceId, taskStore, reminderStore }) {
    let extra = '';
    const text = String(message || '').trim();

    // Auto-create task if pattern matches "add task: <title>" or "task: <title>"
    const addTaskMatch = text.match(/(?:add task|task|todo|to-do)[:\s]+(.+)/i);
    if (addTaskMatch && taskStore && deviceId) {
      try {
        const created = taskStore.add(deviceId, { title: addTaskMatch[1] });
        extra += `\n[System Info: Successfully saved task "${created.title}" with ID ${created.id}]`;
      } catch {
        /* ignore */
      }
    }

    // Auto-create reminder if pattern matches "remind me to <title>"
    const remindMatch = text.match(/remind me to\s+(.+?)(?:\s+at|\s+in|$)/i);
    if (remindMatch && reminderStore && deviceId) {
      try {
        const created = reminderStore.add(deviceId, { text: remindMatch[1] });
        extra += `\n[System Info: Successfully scheduled reminder for "${created.text}"]`;
      } catch {
        /* ignore */
      }
    }

    if (taskStore && deviceId) {
      const pending = taskStore.list(deviceId, 'pending');
      if (pending.length) {
        extra += `\n[User's Pending Tasks: ${pending.map((t) => t.title).join(', ')}]`;
      }
    }

    return {
      skill: 'reminders_tasks',
      promptContext: `Format the tasks or reminders clearly with checkboxes or bullet points. Explicitly inform the user that their task/reminder has been recorded.${extra}`,
    };
  },
};

export const phoneActionsSkill = {
  id: 'phone_actions',
  description: 'Guides Android and device actions safely.',
  async execute({ message }) {
    return {
      skill: 'phone_actions',
      promptContext: 'For phone actions (like opening settings, sharing, copying, alarms), Sana supports native Share, App Details Settings, and Photo/File picker via the Android bridge. If the user asks for unsupported actions (like toggling hardware switches or silent background dialing), explain that Android security permissions require manual user action.',
    };
  },
};

export const studySuperSkill = {
  id: 'study',
  description: 'Provides structured study assistance, quizzes, flashcards, and conceptual explanations.',
  async execute({ message }) {
    return {
      skill: 'study',
      promptContext: 'Act as a master study tutor. Structure responses with: 1. Core Concept, 2. Step-by-step breakdown, 3. Key formulas/definitions, and 4. A quick 1-question check for understanding.',
    };
  },
};

export const codingSkill = {
  id: 'coding',
  description: 'Provides high-quality code generation, debugging, refactoring, and test writing.',
  async execute({ message }) {
    return {
      skill: 'coding',
      promptContext: 'Act as an expert software engineer. Provide robust, clean, typed (where applicable) code. Highlight edge cases, explain complex logic, and specify how to run the code.',
    };
  },
};
