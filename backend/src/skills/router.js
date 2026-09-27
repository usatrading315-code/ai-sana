/**
 * Modular Skill Architecture for Sana AI
 * Provides an extensible registry for intent detection, tool execution, and prompt enhancement.
 */

export const SKILL_CATEGORIES = [
  'conversation',
  'explanation',
  'calculation',
  'writing',
  'planning',
  'brainstorming',
  'coding',
  'troubleshooting',
  'study',
  'web_search',
  'weather',
  'time_date',
  'memory',
  'files',
  'images_vision',
  'reminders_tasks',
  'phone_actions',
];

export class SkillRouter {
  constructor() {
    this.skills = new Map();
  }

  register(skill) {
    if (!skill.id || typeof skill.execute !== 'function') {
      throw new Error(`Invalid skill registration: ${skill?.id || 'missing id'}`);
    }
    this.skills.set(skill.id, skill);
  }

  get(id) {
    return this.skills.get(id);
  }

  list() {
    return Array.from(this.skills.values());
  }

  /**
   * Identifies user intent and routes to the appropriate skill
   */
  async route({ message, attachments, mode, studyTask, workTask, context }) {
    const text = String(message || '').trim();
    const hasImages = Boolean(attachments?.some((a) => a.mime?.startsWith('image/')));
    const hasFiles = Boolean(attachments?.some((a) => !a.mime?.startsWith('image/')));

    // 1. Files & Vision skills
    if (hasImages) {
      return { skillId: 'images_vision', confidence: 0.95 };
    }
    if (hasFiles) {
      return { skillId: 'files', confidence: 0.95 };
    }

    // 2. Explicit Mode routing
    if (mode === 'study') {
      return { skillId: 'study', task: studyTask || 'explain', confidence: 0.9 };
    }
    if (mode === 'work') {
      if (workTask === 'code' || workTask === 'debug') {
        return { skillId: 'coding', task: workTask, confidence: 0.9 };
      }
      if (workTask === 'plan') {
        return { skillId: 'planning', confidence: 0.9 };
      }
      if (workTask === 'write') {
        return { skillId: 'writing', confidence: 0.9 };
      }
      if (workTask === 'ideas') {
        return { skillId: 'brainstorming', confidence: 0.9 };
      }
      return { skillId: 'troubleshooting', confidence: 0.8 };
    }

    // 3. Fast Intent Detection via Heuristics & Regex
    // Time & Date
    if (/\b(what time is it|current time|today's date|date today|current date|aaj kya date hai|kya samay hai|aaj ka din|what day is today)\b/i.test(text)) {
      return { skillId: 'time_date', confidence: 0.9 };
    }

    // Weather
    if (/\b(weather in|mosam|mausam|temperature in|aaj barish hogi|barish|weather today)\b/i.test(text)) {
      return { skillId: 'weather', confidence: 0.9 };
    }

    // Calculation / Arithmetic
    if (/^(what is|calculate|solve|hisaab|kitna hoga)?\s*[\d\s\+\-\*\/\^\(\)\.\,\%]+(?:\s*=|\s*\?)?$/i.test(text) ||
        /\b(plus|minus|multiplied by|divided by|square root of|calculate|percentage of|\d+\s*%\s*of\s*\d+)\b/i.test(text)) {
      return { skillId: 'calculation', confidence: 0.85 };
    }

    // Reminders & Tasks & To-dos
    if (/\b(remind me to|set a reminder|todo list|to-do|reminder lagao|yaad dilana|task add karo|create a task)\b/i.test(text)) {
      return { skillId: 'reminders_tasks', confidence: 0.9 };
    }

    // Phone Actions (open app, settings, timer, clipboard)
    if (/\b(open app|open settings|settings kholo|open youtube|open camera|share this|copy to clipboard|timer lagao|set timer)\b/i.test(text)) {
      return { skillId: 'phone_actions', confidence: 0.9 };
    }

    // Coding & Troubleshooting
    if (/\b(function|def |class |import |console\.log|const |var |npm |pip |python|javascript|typescript|c\+\+|java |sql |syntax error|stack trace|debug|bug|exception)\b/i.test(text)) {
      return { skillId: 'coding', confidence: 0.8 };
    }

    // Study & Learning
    if (/\b(samjhao|explain|syllabus|formula|chapter|meaning of|kya hota hai|kya hai|quiz|flashcards|revision)\b/i.test(text)) {
      return { skillId: 'study', task: 'explain', confidence: 0.8 };
    }

    // Web Search
    if (/\b(latest|current|news|today|price|score|scores|search online|live updates)\b/i.test(text)) {
      return { skillId: 'web_search', confidence: 0.85 };
    }

    // General Conversation / Brainstorming
    return { skillId: 'conversation', confidence: 0.7 };
  }
}

export const defaultRouter = new SkillRouter();
