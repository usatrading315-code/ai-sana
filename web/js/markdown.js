(function (S) {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeUrl(url) {
    try {
      const parsed = new URL(url, 'https://example.invalid');
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {
      /* reject */
    }
    return '';
  }

  function renderWidgets(text) {
    const widgets = [];
    const source = String(text || '').replace(/```(quiz|flashcards|timetable)\s*\n([\s\S]*?)```/g, (match, kind, json) => {
      try {
        const data = JSON.parse(json.trim());
        if (!Array.isArray(data) || !data.length) return match;
        widgets.push({ kind, data });
        return '';
      } catch {
        return match;
      }
    });
    return { source, widgets };
  }

  function widgetHtml(widgets) {
    return widgets
      .map((widget) => {
        if (widget.kind === 'flashcards') return flashcards(widget.data);
        if (widget.kind === 'quiz') return quiz(widget.data);
        if (widget.kind === 'timetable') return timetable(widget.data);
        return '';
      })
      .join('');
  }

  function flashcards(cards) {
    const items = cards.slice(0, 12).map((card, index) => {
      const front = escapeHtml(card.front || card.q || '');
      const back = escapeHtml(card.back || card.a || '');
      return `<button type="button" class="flash" data-action="flip" aria-label="Flashcard ${index + 1}. Tap to flip.">
        <span class="flash-inner">
          <span class="flash-face">${front}</span>
          <span class="flash-face back">${back}</span>
        </span>
      </button>`;
    });
    return `<div class="widget"><p class="widget-label">Flashcards</p><div class="flash-row">${items.join('')}</div></div>`;
  }

  function quiz(items) {
    const blocks = items.slice(0, 8).map((item, qIndex) => {
      const options = Array.isArray(item.options) ? item.options.slice(0, 6) : [];
      const answer = Number.isInteger(item.answer) ? item.answer : 0;
      const buttons = options
        .map(
          (option, index) =>
            `<button type="button" class="quiz-opt" data-action="quiz" data-index="${index}">${escapeHtml(option)}</button>`
        )
        .join('');
      return `<div class="quiz" data-answer="${answer}">
        <p class="quiz-q">${qIndex + 1}. ${escapeHtml(item.question || '')}</p>
        <div class="quiz-opts">${buttons}</div>
        <p class="quiz-explain" hidden>${escapeHtml(item.explain || '')}</p>
      </div>`;
    });
    return `<div class="widget"><p class="widget-label">Quiz</p>${blocks.join('')}</div>`;
  }

  function timetable(rows) {
    const items = rows.slice(0, 16).map((row) => {
      return `<li><time>${escapeHtml(row.time || '')}</time><span>${escapeHtml(row.task || row.title || '')}</span></li>`;
    });
    return `<div class="widget"><p class="widget-label">Timetable</p><ol class="timetable">${items.join('')}</ol></div>`;
  }

  function renderMarkdown(raw) {
    const extracted = [];
    let text = String(raw || '').replace(/\r\n/g, '\n');
    const fenceCount = (text.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) text += '\n```';
    text = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CODE${extracted.length}@@`;
      extracted.push(
        `<pre class="code"><div class="code-bar"><span>${escapeHtml(lang || 'code')}</span><button type="button" data-action="copy-code">Copy</button></div><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`
      );
      return token;
    });
    text = escapeHtml(text);
    text = text.replace(/@@CODE(\d+)@@/g, (_, index) => extracted[Number(index)] || '');
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => `<div class="formula">${formula.trim()}</div>`);
    text = text.replace(/(^|[^$])\$([^$\n]+)\$(?!\$)/g, (_, lead, formula) => `${lead}<span class="formula inline">${formula.trim()}</span>`);
    text = text.replace(/`([^`]+)`/g, (_, code) => `<code class="inline">${code}</code>`);
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = safeUrl(href);
      if (!url) return label;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^\*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    const lines = text.split('\n');
    const html = [];
    let list = null;
    const closeList = () => {
      if (list) {
        html.push(list === 'ol' ? '</ol>' : '</ul>');
        list = null;
      }
    };
    for (const line of lines) {
      if (!line.trim()) {
        closeList();
        continue;
      }
      if (line.includes('<pre class="code">') || line.includes('<div class="formula">')) {
        closeList();
        html.push(line);
        continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level + 2}>${heading[2]}</h${level + 2}>`);
        continue;
      }
      const ul = /^[-*]\s+(.+)$/.exec(line);
      const ol = /^\d+\.\s+(.+)$/.exec(line);
      if (ul || ol) {
        const kind = ul ? 'ul' : 'ol';
        if (list !== kind) {
          closeList();
          list = kind;
          html.push(kind === 'ol' ? '<ol>' : '<ul>');
        }
        html.push(`<li>${(ul || ol)[1]}</li>`);
        continue;
      }
      closeList();
      html.push(`<p>${line}</p>`);
    }
    closeList();
    return html.join('');
  }

  function renderRich(text) {
    const { source, widgets } = renderWidgets(text);
    return `${renderMarkdown(source)}${widgetHtml(widgets)}`;
  }

  S.markdown = { renderRich, escapeHtml };
})(window.Sana = window.Sana || {});
