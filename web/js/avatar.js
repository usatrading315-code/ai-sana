/**
 * SANA Expressive Realistic Avatar Controller
 * Manages full-body avatar rendering, natural breathing/blinking cycles,
 * outfit selection (Saree / Elegant Suit), and responsive visual states:
 * - idle
 * - listening
 * - thinking
 * - speaking
 * - success
 * - error
 * - greeting
 */

(function (S) {
  'use strict';

  const OUTFITS = {
    saree: {
      name: 'Royal Silk Saree',
      src: 'avatar/outfits/saree_standing_opt.webp',
      accent: 'linear-gradient(135deg, rgba(230, 81, 0, 0.2), rgba(255, 179, 0, 0.15))',
    },
    suit: {
      name: 'Executive Indian Suit',
      src: 'avatar/outfits/suit_standing_opt.webp',
      accent: 'linear-gradient(135deg, rgba(0, 137, 123, 0.2), rgba(0, 188, 212, 0.15))',
    },
  };

  const STATES = {
    idle: {
      label: 'Ready',
      statusMsg: 'At your service',
      glowColor: 'rgba(62, 224, 194, 0.3)',
      badgeClass: 'state-idle',
    },
    listening: {
      label: 'Listening...',
      statusMsg: 'I am listening to you...',
      glowColor: 'rgba(62, 224, 194, 0.85)',
      badgeClass: 'state-listening',
    },
    thinking: {
      label: 'Thinking...',
      statusMsg: 'Formulating response...',
      glowColor: 'rgba(255, 183, 77, 0.85)',
      badgeClass: 'state-thinking',
    },
    speaking: {
      label: 'Speaking...',
      statusMsg: 'Speaking response...',
      glowColor: 'rgba(129, 199, 132, 0.9)',
      badgeClass: 'state-speaking',
    },
    success: {
      label: 'Completed',
      statusMsg: 'Done!',
      glowColor: 'rgba(76, 175, 80, 0.85)',
      badgeClass: 'state-success',
    },
    error: {
      label: 'Attention',
      statusMsg: 'Encountered an issue',
      glowColor: 'rgba(239, 83, 80, 0.85)',
      badgeClass: 'state-error',
    },
    greeting: {
      label: 'Namaste 🙏',
      statusMsg: 'Welcome back! How can I assist you?',
      glowColor: 'rgba(255, 167, 38, 0.85)',
      badgeClass: 'state-greeting',
    },
  };

  let currentState = 'idle';
  let currentOutfit = 'saree';
  let avatarContainer = null;
  let statusBadge = null;
  let statusText = null;
  let avatarImg = null;
  let pulseGlow = null;
  let successTimer = null;
  let greetingTimer = null;

  function init() {
    avatarContainer = document.getElementById('sana-avatar-stage');
    if (!avatarContainer) return;

    statusBadge = document.getElementById('avatar-status-badge');
    statusText = document.getElementById('avatar-status-sub');
    avatarImg = document.getElementById('avatar-character-img');
    pulseGlow = document.getElementById('avatar-halo-glow');

    // Load saved outfit
    const saved = localStorage.getItem('sana_avatar_outfit');
    if (saved && OUTFITS[saved]) {
      currentOutfit = saved;
    }
    applyOutfit(currentOutfit, false);

    // Initial greeting gesture on startup
    setState('greeting');
    greetingTimer = setTimeout(() => {
      if (currentState === 'greeting') setState('idle');
    }, 4500);

    // Bind outfit toggle buttons if present
    document.querySelectorAll('[data-outfit-choice]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const outfit = e.currentTarget.dataset.outfitChoice;
        if (OUTFITS[outfit]) setOutfit(outfit);
      });
    });

    // Listen to document visibility to pause heavy CSS animation when backgrounded
    document.addEventListener('visibilitychange', () => {
      if (avatarContainer) {
        if (document.hidden) {
          avatarContainer.classList.add('paused-animations');
        } else {
          avatarContainer.classList.remove('paused-animations');
        }
      }
    });
  }

  function applyOutfit(key, animate = true) {
    if (!OUTFITS[key] || !avatarImg) return;
    currentOutfit = key;
    localStorage.setItem('sana_avatar_outfit', key);

    if (animate) {
      avatarImg.classList.add('fading');
      setTimeout(() => {
        avatarImg.src = OUTFITS[key].src;
        avatarImg.onload = () => avatarImg.classList.remove('fading');
      }, 200);
    } else {
      avatarImg.src = OUTFITS[key].src;
    }

    // Update outfit badge / buttons
    document.querySelectorAll('[data-outfit-choice]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.outfitChoice === key);
    });
  }

  function setOutfit(key) {
    applyOutfit(key, true);
  }

  function setState(state, customMessage) {
    if (!STATES[state]) state = 'idle';
    currentState = state;

    clearTimeout(successTimer);
    if (state !== 'greeting') clearTimeout(greetingTimer);

    if (avatarContainer) {
      // Clean up previous state classes
      Object.keys(STATES).forEach((s) => avatarContainer.classList.remove(`avatar-${s}`));
      avatarContainer.classList.add(`avatar-${state}`);
    }

    if (statusBadge) {
      statusBadge.textContent = STATES[state].label;
      Object.keys(STATES).forEach((s) => statusBadge.classList.remove(STATES[s].badgeClass));
      statusBadge.classList.add(STATES[state].badgeClass);
    }

    if (statusText) {
      statusText.textContent = customMessage || STATES[state].statusMsg;
    }

    if (pulseGlow) {
      pulseGlow.style.background = `radial-gradient(circle, ${STATES[state].glowColor} 0%, rgba(0,0,0,0) 70%)`;
    }

    // Auto-revert success state to idle after 3.2s
    if (state === 'success') {
      successTimer = setTimeout(() => {
        if (currentState === 'success') setState('idle');
      }, 3200);
    }
  }

  function getState() {
    return currentState;
  }

  function getOutfit() {
    return currentOutfit;
  }

  S.avatar = {
    init,
    setState,
    getState,
    setOutfit,
    getOutfit,
    outfits: OUTFITS,
  };
})(window.Sana = window.Sana || {});
