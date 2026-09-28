/**
 * Fast Local Response Router
 * Handles deterministic, unambiguous user requests locally in <5ms without
 * calling upstream Gemini or consuming API quota.
 *
 * Covers:
 * 1. Greetings (hi, hello, namaste, good morning, etc.)
 * 2. Status inquiries (how are you, kaise ho)
 * 3. Identity and creator (who are you, what is your name, tum kaun ho, tumhe kisne banaya)
 * 4. Safe simple arithmetic (2+2, 10*5, 100-25, etc.)
 * 5. Current time/date queries
 */

export function resolveFastLocalResponse(message, { language = 'auto', assistantName = 'Sana' } = {}) {
  const text = String(message || '').trim();
  if (!text) return null;

  const lower = text.toLowerCase().replace(/[?!.,;]+$/, '').trim();

  // 1. Identity & Creator Queries
  if (
    /^(who are you|what is your name|tum kaun ho|aap kaun hai|sana kaun hai|tumhe kisne banaya|who created you|who made you|tumhe kisne banaya hai|who is your creator|who is your developer)$/i.test(
      lower
    ) ||
    /^(तुम कौन हो|तुम्हें किसने बनाया|तुम्हारा नाम क्या है|साना कौन है)$/.test(text)
  ) {
    if (/[\u0900-\u097F]/.test(text)) {
      return {
        text: `मैं ${assistantName} हूँ — एक पर्सनल एआई असिस्टेंट और दोस्त। मुझे राव अभिषेक राव ने बनाया है, और मैं उनकी पर्सनल असिस्टेंट और दोस्त हूँ। उनके पिता का नाम श्री दीपक कुमार है।`,
        type: 'identity',
      };
    }
    if (/\b(tum|kaun|kisne|banaya|aap|kya|naam)\b/i.test(lower)) {
      return {
        text: `Main ${assistantName} hoon — ek personal AI assistant aur friend. Mujhe Rao Abhishek Rao ne banaya hai, aur main unki personal assistant aur friend hoon. Unke pita ka naam Mr. Deepak Kumar hai.`,
        type: 'identity',
      };
    }
    return {
      text: `I am ${assistantName} — a personal AI assistant and friend. I was created by Rao Abhishek Rao, and I am his personal assistant and friend. His father's name is Mr. Deepak Kumar.`,
      type: 'identity',
    };
  }

  // 2. Greetings
  if (
    /^(hi|hello|hey|namaste|pranam|namaskar|hello sana|hi sana|hey sana|sana)$/i.test(lower) ||
    /^(नमस्ते|प्रणाम|नमस्कार|हैलो|हाय)$/.test(text)
  ) {
    if (/[\u0900-\u097F]/.test(text) || lower === 'namaste' || lower === 'namaskar') {
      return {
        text: `नमस्ते! 🙏 मैं ${assistantName} हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?`,
        type: 'greeting',
      };
    }
    if (/\b(sana|hi|hello|hey)\b/i.test(lower)) {
      return {
        text: `Hello! I'm ${assistantName}. How can I help you with your studies, coding, or planning today?`,
        type: 'greeting',
      };
    }
  }

  // Good morning / afternoon / evening / night
  if (/^(good morning|good afternoon|good evening|good night|shubh prabhat|shubh ratri)$/i.test(lower)) {
    if (/morning|prabhat/i.test(lower)) {
      return {
        text: `Good morning! ☀️ Wishing you a productive and great day ahead. What are we working on today?`,
        type: 'greeting',
      };
    }
    if (/night|ratri/i.test(lower)) {
      return {
        text: `Good night! 🌙 Rest well. Feel free to leave any tasks or notes here for tomorrow!`,
        type: 'greeting',
      };
    }
    return {
      text: `Hello! Hope you're having a wonderful day. How can I assist you right now?`,
      type: 'greeting',
    };
  }

  // 3. Status Inquiries
  if (
    /^(how are you|how are you doing|how are you sana|kaise ho|kaisi ho|aap kaise ho|sab kaisa hai)$/i.test(
      lower
    ) ||
    /^(कैसी हो|कैसे हो|आप कैसे हैं)$/.test(text)
  ) {
    if (/\b(kaise|kaisi|aap|sab)\b/i.test(lower) || /[\u0900-\u097F]/.test(text)) {
      return {
        text: `Main bilkul theek hoon, shukriya! Aap bataiye, aaj padhai ya kisi project par kaam karna hai?`,
        type: 'status',
      };
    }
    return {
      text: `I'm doing great, thank you for asking! Ready to help you with study topics, coding, or anything else you need.`,
      type: 'status',
    };
  }

  // 4. Safe, unambiguous simple arithmetic expressions
  // e.g. "2+2", "2 + 2", "10*5", "100 - 25", "50 / 2", "What is 2+2?", "Calculate 15 * 8"
  const mathMatch = lower.match(
    /^(?:what is|calculate|solve|kitna hota hai|hisaab)?\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/x×÷])\s*(-?\d+(?:\.\d+)?)\s*(?:\?|=)?$/i
  );
  if (mathMatch) {
    const num1 = parseFloat(mathMatch[1]);
    let op = mathMatch[2];
    const num2 = parseFloat(mathMatch[3]);

    if (!isNaN(num1) && !isNaN(num2)) {
      if (op === 'x' || op === '×') op = '*';
      if (op === '÷') op = '/';

      let ans;
      let symbol = op;
      if (op === '+') ans = num1 + num2;
      else if (op === '-') ans = num1 - num2;
      else if (op === '*') {
        ans = num1 * num2;
        symbol = '\\times';
      } else if (op === '/') {
        if (num2 === 0) {
          return {
            text: 'Division by zero is undefined.',
            type: 'calculation',
          };
        }
        ans = num1 / num2;
        symbol = '\\div';
      }

      // Round floating point inaccuracies (e.g. 0.1 + 0.2 = 0.30000000000000004)
      const cleanAns = Math.round(ans * 1000000) / 1000000;
      return {
        text: `$$${num1} ${symbol} ${num2} = ${cleanAns}$$\n\n**Answer:** ${cleanAns}`,
        type: 'calculation',
      };
    }
  }

  // 5. Current time/date queries (exact local determination)
  if (
    /^(what time is it|current time|what is the time|kya time hua hai|kya samay hai|what is today's date|today's date|what date is today|aaj kya date hai|aaj kaun sa din hai|what day is today)$/i.test(
      lower
    ) ||
    /^(समय क्या है|आज क्या तारीख है|आज कौन सा दिन है)$/.test(text)
  ) {
    const now = new Date();
    const istFull = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(now);

    return {
      text: `Current time (IST): **${istFull}**`,
      type: 'time_date',
    };
  }

  // Not a deterministic fast route -> delegate to AI / Search pipeline
  return null;
}
