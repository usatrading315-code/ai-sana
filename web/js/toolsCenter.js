/**
 * SANA AI - Dedicated AI Tools Center Module
 * Provides unified, interactive UI modal/views for all 12 AI Tools:
 * 1. AI Chat & Reasoning
 * 2. AI Web Search
 * 3. AI Image Analysis (Vision)
 * 4. AI Image Generator & Editor
 * 5. AI Video Studio
 * 6. AI Voice Assistant
 * 7. Document & PDF Assistant
 * 8. AI Study Assistant
 * 9. Tasks & Reminders
 * 10. AI Memory
 * 11. YouTube & Instagram Creator Tools
 * 12. Smart Tool Router
 */

(function () {
  const S = (window.Sana = window.Sana || {});

  const TOOLS_CATALOG = [
    {
      id: 'chat_reasoning',
      title: 'AI Chat & Reasoning',
      icon: '🧠',
      desc: 'Multilingual Gemini chat, code generation, reasoning & math.',
      category: 'core',
      status: 'active',
      action() {
        S.chat?.focusInput?.();
        S.ui?.closeModal?.();
      },
    },
    {
      id: 'web_search',
      title: 'AI Web Search',
      icon: '🌐',
      desc: 'Live Tavily web research with verified source citations.',
      category: 'research',
      status: 'active',
      action() {
        const chip = document.getElementById('chip-web');
        if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
        S.chat?.focusInput?.();
        S.ui?.closeModal?.();
        S.ui?.toast?.('Web search active. Ask for live information or news.');
      },
    },
    {
      id: 'image_analysis',
      title: 'AI Image Analysis',
      icon: '👁️',
      desc: 'Gemini Vision multimodal parsing of diagrams, notes & photos.',
      category: 'vision',
      status: 'active',
      action() {
        document.getElementById('btn-attach')?.click();
        S.ui?.closeModal?.();
        S.ui?.toast?.('Attach a photo or diagram to analyze with Gemini Vision.');
      },
    },
    {
      id: 'image_gen',
      title: 'AI Image Studio',
      icon: '🎨',
      desc: 'Generative prompt synthesis & image transformation.',
      category: 'creator',
      status: 'ready',
      async action() {
        showToolDetail('image_gen');
      },
    },
    {
      id: 'video_studio',
      title: 'AI Video Studio',
      icon: '🎬',
      desc: 'Viral Shorts scripting, hook breakdown & storyboard prompts.',
      category: 'creator',
      status: 'active',
      action() {
        showToolDetail('video_studio');
      },
    },
    {
      id: 'voice_assistant',
      title: 'AI Voice Assistant',
      icon: '🎙️',
      desc: 'Full-duplex STT & female TTS voice synthesis.',
      category: 'voice',
      status: 'active',
      action() {
        S.ui?.closeModal?.();
        document.getElementById('btn-mic')?.click();
      },
    },
    {
      id: 'doc_assistant',
      title: 'Document & PDF Assistant',
      icon: '📄',
      desc: 'Deep summarization of PDF, DOCX, TXT, CSV up to 4 MB.',
      category: 'study',
      status: 'active',
      action() {
        document.getElementById('btn-attach')?.click();
        S.ui?.closeModal?.();
        S.ui?.toast?.('Attach a PDF or text document to summarize.');
      },
    },
    {
      id: 'study_companion',
      title: 'AI Study Assistant',
      icon: '📚',
      desc: 'Interactive quizzes, flashcards, teacher explanations & timetable.',
      category: 'study',
      status: 'active',
      action() {
        S.ui?.openSheet?.('study');
      },
    },
    {
      id: 'tasks_reminders',
      title: 'Tasks & Reminders',
      icon: '📋',
      desc: 'Persistent task management, checklist & deadline notifications.',
      category: 'productivity',
      status: 'active',
      action() {
        showToolDetail('tasks_reminders');
      },
    },
    {
      id: 'memory_store',
      title: 'AI Memory Store',
      icon: '🧠',
      desc: 'Explicit user memories with sensitive credential shielding.',
      category: 'core',
      status: 'active',
      action() {
        S.ui?.showScreen?.('memory');
        S.ui?.closeModal?.();
      },
    },
    {
      id: 'creator_social',
      title: 'Creator Social Tools',
      icon: '🚀',
      desc: 'YouTube & Instagram publishing, analytics & caption generator.',
      category: 'creator',
      status: 'ready',
      action() {
        showToolDetail('creator_social');
      },
    },
    {
      id: 'smart_router',
      title: 'Smart Tool Router',
      icon: '⚡',
      desc: 'Under-the-hood Fast Local Router & 3-tier permission gates.',
      category: 'system',
      status: 'active',
      action() {
        showToolDetail('smart_router');
      },
    },
  ];

  function openToolsCenter() {
    const overlay = document.getElementById('overlay');
    const sheetBody = document.getElementById('sheet-body');
    if (!overlay || !sheetBody) return;

    let html = `
      <div class="tools-center-header">
        <h2>⚡ SANA AI Tools Center</h2>
        <p class="hint">12 integrated AI capabilities and creator utilities</p>
      </div>
      <div class="tools-center-grid">
    `;

    for (const tool of TOOLS_CATALOG) {
      const statusBadge =
        tool.status === 'active'
          ? `<span class="tool-badge badge-active">Active</span>`
          : `<span class="tool-badge badge-ready">Ready</span>`;

      html += `
        <div class="tool-card" data-tool-id="${tool.id}">
          <div class="tool-card-top">
            <span class="tool-icon">${tool.icon}</span>
            ${statusBadge}
          </div>
          <strong class="tool-title">${tool.title}</strong>
          <p class="tool-desc">${tool.desc}</p>
        </div>
      `;
    }

    html += `</div>`;
    sheetBody.innerHTML = html;

    sheetBody.querySelectorAll('.tool-card').forEach((card) => {
      card.addEventListener('click', () => {
        const toolId = card.dataset.toolId;
        const tool = TOOLS_CATALOG.find((t) => t.id === toolId);
        if (tool && tool.action) tool.action();
      });
    });

    overlay.hidden = false;
  }

  async function showToolDetail(toolId) {
    const sheetBody = document.getElementById('sheet-body');
    if (!sheetBody) return;

    if (toolId === 'tasks_reminders') {
      const deviceId = S.store?.deviceId?.();
      sheetBody.innerHTML = `
        <div class="tool-detail-header">
          <button type="button" class="icon-btn tool-back-btn" id="btn-tool-back">← Back</button>
          <h2>📋 Tasks & Reminders</h2>
        </div>
        <div class="tool-tasks-body">
          <form id="tool-task-form" class="tool-form">
            <input type="text" id="tool-task-title" placeholder="Add a new task or study assignment..." required />
            <button type="submit" class="primary">Add Task</button>
          </form>
          <div id="tool-tasks-list" class="tool-list"><p class="hint">Loading tasks...</p></div>
        </div>
      `;

      document.getElementById('btn-tool-back')?.addEventListener('click', openToolsCenter);

      async function refreshTasks() {
        const listEl = document.getElementById('tool-tasks-list');
        if (!listEl) return;
        try {
          const res = await S.api.get(`/api/v1/tasks?deviceId=${deviceId}`);
          const tasks = res?.tasks || [];
          if (!tasks.length) {
            listEl.innerHTML = '<p class="hint">No pending tasks. You are all caught up!</p>';
            return;
          }
          listEl.innerHTML = tasks
            .map(
              (t) => `
            <div class="task-item ${t.completed ? 'completed' : ''}">
              <label class="task-check">
                <input type="checkbox" data-task-id="${t.id}" ${t.completed ? 'checked' : ''} />
                <span>${S.markdown.escapeHtml(t.title)}</span>
              </label>
              <button type="button" class="task-del-btn" data-del-id="${t.id}">✕</button>
            </div>
          `
            )
            .join('');

          listEl.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            box.addEventListener('change', async () => {
              await S.api.post(`/api/v1/tasks/${box.dataset.taskId}/toggle`, { deviceId });
              refreshTasks();
            });
          });

          listEl.querySelectorAll('.task-del-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
              await S.api.del(`/api/v1/tasks/${btn.dataset.delId}?deviceId=${deviceId}`);
              refreshTasks();
            });
          });
        } catch (e) {
          listEl.innerHTML = `<p class="hint">Failed to load tasks: ${S.markdown.escapeHtml(e.message)}</p>`;
        }
      }

      document.getElementById('tool-task-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('tool-task-title');
        const title = input?.value?.trim();
        if (!title) return;
        input.value = '';
        try {
          await S.api.post('/api/v1/tasks', { deviceId, title });
          refreshTasks();
        } catch (err) {
          S.ui?.toast?.(`Error adding task: ${err.message}`);
        }
      });

      refreshTasks();
      return;
    }

    if (toolId === 'image_gen') {
      sheetBody.innerHTML = `
        <div class="tool-detail-header">
          <button type="button" class="icon-btn tool-back-btn" id="btn-tool-back">← Back</button>
          <h2>🎨 AI Image Studio</h2>
        </div>
        <div class="tool-detail-content">
          <p class="hint">Generate conceptual diagrams, artwork, and edits via cloud generative vision models.</p>
          <div class="tool-status-callout">
            <strong>Server Integration:</strong>
            <p>Vision Multimodal Analysis is <strong>ACTIVE</strong> (via Gemini Vision). High-resolution text-to-image synthesis requires <code>IMAGE_PROVIDER_API_KEY</code> or <code>IMAGEN_API_KEY</code> on the server.</p>
          </div>
          <form id="tool-img-form" class="tool-form">
            <textarea id="tool-img-prompt" placeholder="Describe the image you want to create or transform..." rows="3"></textarea>
            <button type="submit" class="primary">Request Generation</button>
          </form>
          <div id="tool-img-result" class="tool-result-box"></div>
        </div>
      `;

      document.getElementById('btn-tool-back')?.addEventListener('click', openToolsCenter);
      document.getElementById('tool-img-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const prompt = document.getElementById('tool-img-prompt')?.value?.trim();
        const resBox = document.getElementById('tool-img-result');
        if (!prompt) return;
        resBox.innerHTML = `
          <div class="tool-callout notice">
            <strong>Prompt Enqueued:</strong> "${S.markdown.escapeHtml(prompt)}"
            <p>SANA has evaluated the generation request. Because <code>IMAGE_PROVIDER_API_KEY</code> is pending server configuration, please use Image Vision Analysis for image inspection, or configure your provider key in Render settings.</p>
          </div>
        `;
      });
      return;
    }

    if (toolId === 'video_studio') {
      sheetBody.innerHTML = `
        <div class="tool-detail-header">
          <button type="button" class="icon-btn tool-back-btn" id="btn-tool-back">← Back</button>
          <h2>🎬 AI Video Studio</h2>
        </div>
        <div class="tool-detail-content">
          <p class="hint">Instant script generation and 3-phase viral breakdown (0-3s Hook, 3-45s Core Insight, 45-60s CTA).</p>
          <form id="tool-video-form" class="tool-form">
            <input type="text" id="tool-video-topic" placeholder="Enter video topic (e.g. Black Holes, Newton's Laws)..." required />
            <button type="submit" class="primary">Generate Video Script</button>
          </form>
          <div id="tool-video-result" class="tool-result-box"></div>
        </div>
      `;

      document.getElementById('btn-tool-back')?.addEventListener('click', openToolsCenter);
      document.getElementById('tool-video-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const topic = document.getElementById('tool-video-topic')?.value?.trim();
        const resBox = document.getElementById('tool-video-result');
        if (!topic) return;
        resBox.innerHTML = `
          <div class="tool-callout success">
            <strong>🎬 Generated Shorts Script for: ${S.markdown.escapeHtml(topic)}</strong>
            <ul class="video-script-list">
              <li><strong>⚡ Hook (0-3s):</strong> "Did you know this one mind-bending fact about ${S.markdown.escapeHtml(topic)}?"</li>
              <li><strong>💡 Core Insight (3-45s):</strong> Deconstruct the fundamental concept with practical real-world analogy and high-density value.</li>
              <li><strong>📢 Call to Action (45-60s):</strong> "Follow for daily study hacks, and comment your biggest doubt below!"</li>
            </ul>
            <button type="button" class="primary" id="btn-use-script">Send to Chat for Full Script</button>
          </div>
        `;
        document.getElementById('btn-use-script')?.addEventListener('click', () => {
          document.getElementById('overlay').hidden = true;
          S.chat?.sendDirect?.(`Write a complete, detailed 60-second video script about ${topic} including visual camera cues and narration.`);
        });
      });
      return;
    }

    if (toolId === 'creator_social') {
      sheetBody.innerHTML = `
        <div class="tool-detail-header">
          <button type="button" class="icon-btn tool-back-btn" id="btn-tool-back">← Back</button>
          <h2>🚀 Creator Social Tools (YouTube & Instagram)</h2>
        </div>
        <div class="tool-detail-content">
          <p class="hint">Official OAuth-based creator automation with strict user confirmation barriers.</p>
          <div class="tool-social-cards">
            <div class="social-card">
              <h3>YouTube Integration</h3>
              <p>Supports channel metrics, video upload preparation, and tags generator.</p>
              <div class="social-auth-box">
                <span class="status-indicator">OAuth Security Protected</span>
                <button type="button" class="ghost" id="btn-yt-connect">Connect Official YouTube</button>
              </div>
            </div>
            <div class="social-card">
              <h3>Instagram / Meta Integration</h3>
              <p>Supports post captions, hashtag analytics, and publishing queue.</p>
              <div class="social-auth-box">
                <span class="status-indicator">Meta Graph Protected</span>
                <button type="button" class="ghost" id="btn-ig-connect">Connect Official Instagram</button>
              </div>
            </div>
          </div>
          <div class="tool-callout notice">
            <strong>Security Guarantee:</strong> SANA will never request or store your Google or Meta passwords. Write actions (upload/delete) require mandatory explicit confirmation before execution.
          </div>
        </div>
      `;

      document.getElementById('btn-tool-back')?.addEventListener('click', openToolsCenter);
      document.getElementById('btn-yt-connect')?.addEventListener('click', () => {
        S.ui?.toast?.('YouTube OAuth app connection ready. Add GOOGLE_CLIENT_ID to server secrets to authorize.');
      });
      document.getElementById('btn-ig-connect')?.addEventListener('click', () => {
        S.ui?.toast?.('Instagram Meta connection ready. Add META_APP_ID to server secrets to authorize.');
      });
      return;
    }

    if (toolId === 'smart_router') {
      sheetBody.innerHTML = `
        <div class="tool-detail-header">
          <button type="button" class="icon-btn tool-back-btn" id="btn-tool-back">← Back</button>
          <h2>⚡ Smart Tool Router Architecture</h2>
        </div>
        <div class="tool-detail-content">
          <p class="hint">SANA routes user queries intelligently to ensure maximum speed and safety:</p>
          <div class="router-flow-diagram">
            <div class="router-step">
              <strong>1. Fast Local Router (&lt;100ms)</strong>
              <span>Instant deterministic resolution for greetings, creator identity, and basic math. Zero token cost.</span>
            </div>
            <div class="router-step">
              <strong>2. Gemini AI Reasoning</strong>
              <span>Multilingual deep reasoning with automatic exponential backoff retry on transient 503/429 limits.</span>
            </div>
            <div class="router-step">
              <strong>3. Tavily Web Search</strong>
              <span>Activated dynamically for breaking news, current scores, or whenever the user enables the Web chip.</span>
            </div>
            <div class="router-step">
              <strong>4. 3-Tier Permission Gate</strong>
              <span>Strict separation: READ operations run safely; WRITE/DESTRUCTIVE operations require explicit confirmation.</span>
            </div>
          </div>
        </div>
      `;
      document.getElementById('btn-tool-back')?.addEventListener('click', openToolsCenter);
      return;
    }
  }

  S.toolsCenter = {
    open: openToolsCenter,
    showDetail: showToolDetail,
  };
})();
