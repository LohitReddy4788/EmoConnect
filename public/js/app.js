/* ═══════════════════════════════════════════════════════
   EmoConnect — Application
   ═══════════════════════════════════════════════════════ */

const App = (() => {

  /* ── State ─────────────────────────────────────────── */
  const state = {
    sessionId:  null,
    mood:       { key: 'neutral', label: 'Just thinking' },
    streaming:  false,
    chatActive: false,
    sessions:   [],
  };

  /* ── Crisis keywords ─────────────────────────────────── */
  const CRISIS_KWS = [
    'suicide','kill myself','end my life','want to die',"don't want to live",
    'self harm','self-harm','hurt myself','cutting myself','not worth living',
    'better off dead','end it all','no reason to live','take my life',
    'overdose','end everything','disappear forever',
  ];

  /* ── Mood opening messages (no emojis) ─────────────── */
  const OPENERS = {
    sad:      'I can see you\'re feeling sad right now, and I want you to know that\'s completely okay. You don\'t have to hold it together or explain yourself here.\n\nWhat\'s been weighing on you?',
    anxious:  'Anxiety has a way of making everything feel louder and more urgent than it really is. The fact that you\'re here and reaching out is a good sign.\n\nWhat\'s been running through your mind?',
    angry:    'Anger is telling you something important — it almost always has something real underneath it. This is a safe place to say what\'s actually going on.\n\nWhat happened?',
    confused: 'Feeling confused can be genuinely disorienting — like trying to think clearly through fog. There\'s no rush to figure anything out right now.\n\nWhat\'s been going on?',
    happy:    'It\'s good to hear you\'re carrying some happiness today. That matters, and I\'d love to hear about it.\n\nWhat\'s brought that feeling on?',
    stressed: 'When everything piles up at once, it can feel like there\'s no room to breathe. You\'ve done the right thing by stepping away and talking about it.\n\nWhat\'s feeling heaviest right now?',
    neutral:  'Sometimes we don\'t even know exactly what we need — just a place to think things through out loud. That\'s exactly what this is for.\n\nWhat\'s on your mind today?',
  };

  /* ── DOM helpers ──────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const el = {
    sidebar:      () => $('sidebar'),
    sbOverlay:    () => $('sb-overlay'),
    sbList:       () => $('sb-list'),
    sbEmpty:      () => $('sb-empty'),
    moodTag:      () => $('mood-tag'),
    moodPills:    () => document.querySelectorAll('.mood-pill'),
    welcomeView:  () => $('welcome-view'),
    chatView:     () => $('chat-view'),
    messages:     () => $('messages'),
    messagesWrap: () => $('messages-wrap'),
    userInput:    () => $('user-input'),
    sendBtn:      () => $('send-btn'),
    micBtn:       () => $('mic-btn'),
    voiceStatus:  () => $('voice-status'),
    charCount:    () => $('char-count'),
    chipsRow:     () => $('chips-row'),
    scrollBtn:    () => $('scroll-btn'),
    crisisOverlay:() => $('crisis-overlay'),
    toast:        () => $('toast'),
  };

  /* ══════════════════════════════════════════════════════
     VOICE INPUT
  ══════════════════════════════════════════════════════ */
  const Voice = (() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous      = false;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    rec.maxAlternatives = 1;

    let active    = false;
    let baseText  = '';
    let finalText = '';
    let sendTimer = null;

    rec.onstart = () => {
      active = true;
      baseText  = el.userInput().value.trim();
      finalText = '';
      clearTimeout(sendTimer);
      el.micBtn().classList.add('listening');
      el.voiceStatus().classList.remove('hidden');
      el.userInput().placeholder = 'Listening…';
    };

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk + ' ';
        else interim = chunk;
      }
      const full = [baseText, (finalText + interim).trim()].filter(Boolean).join(' ');
      el.userInput().value = full;
      autoResize(el.userInput());
    };

    rec.onend = () => {
      active = false;
      el.micBtn().classList.remove('listening');
      el.voiceStatus().classList.add('hidden');
      el.userInput().placeholder = 'Share what\'s on your mind…';
      el.userInput().value = el.userInput().value.trim();

      const text = el.userInput().value;
      if (text && !state.streaming) {
        // Auto-send after 700ms so user can see the transcribed text
        sendTimer = setTimeout(() => {
          if (!state.streaming && el.userInput().value.trim()) {
            send();
          }
        }, 700);
      } else {
        el.userInput().focus();
      }
    };

    rec.onerror = (e) => {
      const msgs = {
        'not-allowed':   'Microphone access was denied. Please allow mic access in your browser settings.',
        'no-speech':     'No speech was detected. Please try again.',
        'network':       'Network error during speech recognition.',
        'audio-capture': 'No microphone found on this device.',
      };
      showToast(msgs[e.error] || 'Voice input error. Please try again.');
      active = false;
      el.micBtn().classList.remove('listening');
      el.voiceStatus().classList.add('hidden');
      el.userInput().placeholder = 'Share what\'s on your mind…';
    };

    return {
      toggle() {
        if (active) { try { rec.stop(); } catch(_){} return; }
        try { rec.start(); } catch(_) { showToast('Could not start voice input. Check mic permissions.'); }
      },
    };
  })();

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */
  async function init() {
    // Hide mic if unsupported
    if (!Voice && el.micBtn()) el.micBtn().style.display = 'none';

    // Textarea auto-resize + char count
    el.userInput().addEventListener('input', () => {
      autoResize(el.userInput());
      const len = el.userInput().value.length;
      const cc  = el.charCount();
      cc.textContent = len > 1500 ? `${len} / 4000` : '';
      cc.style.color = len > 3000 ? 'var(--red)' : 'var(--t3)';
    });

    // Enter = send, Shift+Enter = newline
    el.userInput().addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!state.streaming) send();
      }
    });

    // Scroll-to-bottom button
    el.messagesWrap().addEventListener('scroll', () => {
      const w    = el.messagesWrap();
      const dist = w.scrollHeight - w.scrollTop - w.clientHeight;
      el.scrollBtn().classList.toggle('visible', dist > 100);
    });

    await newSession();
  }

  /* ══════════════════════════════════════════════════════
     MOOD
  ══════════════════════════════════════════════════════ */
  function selectMood(btn) {
    el.moodPills().forEach(p => p.classList.remove('selected'));
    btn.classList.add('selected');
    state.mood = { key: btn.dataset.mood, label: btn.dataset.label };
    el.moodTag().textContent = btn.dataset.label;

    if (state.sessionId) {
      fetch(`/api/session/${state.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: state.mood.key }),
      }).catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════════════
     SESSION MANAGEMENT
  ══════════════════════════════════════════════════════ */
  async function newSession() {
    try {
      const res  = await fetch('/api/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mood: state.mood.key }),
      });
      const data = await res.json();
      state.sessionId  = data.sessionId;
      state.chatActive = false;

      el.messages().innerHTML = '';
      showChips(true);
      showView('welcome');

      appendBotMessage(OPENERS[state.mood.key] || OPENERS.neutral);
      await refreshSidebar(data.sessionId);
    } catch (err) {
      console.error('Session error:', err);
      showToast('Could not start a session. Is the server running?');
    }
  }

  async function loadSession(id) {
    try {
      const res  = await fetch(`/api/session/${id}`);
      if (!res.ok) return;
      const data = await res.json();

      state.sessionId = id;
      state.mood = { key: data.mood, label: capitalize(data.mood) };
      el.moodTag().textContent = capitalize(data.mood);

      el.messages().innerHTML = '';

      for (const msg of data.history) {
        if (msg.role === 'user') appendUserMessage(msg.content, false);
        else appendBotMessage(msg.content, false);
      }

      const hasUserMsg = data.history.some(m => m.role === 'user');
      state.chatActive = hasUserMsg;

      if (hasUserMsg) {
        showView('chat'); showChips(false);
      } else {
        showView('welcome'); showChips(true);
        appendBotMessage(OPENERS[data.mood] || OPENERS.neutral);
      }

      scrollToBottom(false);
      closeSidebar();
      markActive(id);
    } catch (err) {
      console.error('Load session error:', err);
    }
  }

  async function refreshSidebar(activeId) {
    try {
      const res  = await fetch('/api/sessions');
      state.sessions = await res.json();

      const list = el.sbList();
      list.innerHTML = '';

      if (state.sessions.length === 0) {
        list.innerHTML = '<p class="sb-empty">No conversations yet</p>';
        return;
      }

      state.sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = `sb-item${s.id === (activeId || state.sessionId) ? ' active' : ''}`;
        item.dataset.id = s.id;
        item.innerHTML = `
          <div class="sb-item-dot"></div>
          <div class="sb-item-text">
            <span class="sb-item-title">${esc(s.title)}</span>
            <span class="sb-item-time">${timeAgo(s.createdAt)}</span>
          </div>
          <button class="sb-delete-btn" title="Delete conversation" aria-label="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        `;
        item.addEventListener('click', (e) => {
          if (e.target.closest('.sb-delete-btn')) return;
          loadSession(s.id);
        });
        item.querySelector('.sb-delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSession(s.id);
        });
        list.appendChild(item);
      });
    } catch (err) {
      console.error('Sidebar error:', err);
    }
  }

  async function deleteSession(id) {
    try {
      await fetch(`/api/session/${id}`, { method: 'DELETE' });
      if (id === state.sessionId) await newSession();
      else await refreshSidebar();
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  function markActive(id) {
    document.querySelectorAll('.sb-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  /* ══════════════════════════════════════════════════════
     SEND MESSAGE
  ══════════════════════════════════════════════════════ */
  async function send() {
    const text = el.userInput().value.trim();
    if (!text || state.streaming || !state.sessionId) return;

    if (detectCrisis(text)) showCrisis();

    if (!state.chatActive) {
      state.chatActive = true;
      showView('chat');
      showChips(false);
    }

    appendUserMessage(text, true);
    el.userInput().value = '';
    el.userInput().style.height = 'auto';
    el.charCount().textContent = '';

    setStreaming(true);
    showTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, sessionId: state.sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      showTyping(false);

      const group  = createBotGroup();
      const bubble = group.querySelector('.msg-bubble');
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      bubble.appendChild(cursor);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buf      = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              cursor.remove();
              bubble.innerHTML = `<p style="color:var(--red)">${esc(parsed.error)}</p>`;
              break;
            }
            if (parsed.text) {
              fullText += parsed.text;
              bubble.innerHTML = esc(fullText).replace(/\n/g, '<br>');
              bubble.appendChild(cursor);
              scrollToBottom(false);
            }
          } catch (_) { /* skip */ }
        }
      }

      cursor.remove();
      if (!fullText) {
        bubble.innerHTML = `<p style="color:var(--red)">No response received. Please check your API key in the .env file and restart the server.</p>`;
      } else {
        bubble.innerHTML = md(fullText);
      }
      finalizeBotGroup(group, fullText);
      scrollToBottom(true);
      await refreshSidebar();

    } catch (err) {
      showTyping(false);
      appendBotMessage(
        err.message.includes('API key') || err.message.includes('401')
          ? 'There is an issue with the API key. Please check your .env file and restart the server.'
          : 'Something went wrong on my end. Could you try again?'
      );
      console.error(err);
    } finally {
      setStreaming(false);
      el.userInput().focus();
    }
  }

  /* ══════════════════════════════════════════════════════
     DOM BUILDERS
  ══════════════════════════════════════════════════════ */
  function appendBotMessage(text, animate = true) {
    const group  = createBotGroup(animate);
    const bubble = group.querySelector('.msg-bubble');
    bubble.innerHTML = md(text);
    finalizeBotGroup(group, text);
    scrollToBottom(false);
    return group;
  }

  function appendUserMessage(text, animate = true) {
    const group = document.createElement('div');
    group.className = 'msg-group user';
    if (!animate) group.style.animation = 'none';
    group.innerHTML = `
      <div class="msg-row">
        <div class="msg-bubble">${esc(text).replace(/\n/g,'<br>')}</div>
      </div>
      <div class="msg-meta">
        <span class="msg-time">${fmtTime(new Date())}</span>
        <button class="msg-copy" data-text="${esc(text)}" onclick="App.copyMsg(this)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          Copy
        </button>
      </div>
    `;
    el.messages().appendChild(group);
    scrollToBottom(false);
  }

  function createBotGroup(animate = true) {
    const group = document.createElement('div');
    group.className = 'msg-group bot';
    if (!animate) group.style.animation = 'none';
    group.innerHTML = `
      <div class="msg-row">
        <div class="msg-avatar"><img src="/assets/logo.svg" alt="EmoConnect" /></div>
        <div class="msg-body"><div class="msg-bubble"></div></div>
      </div>
      <div class="msg-meta" style="display:none">
        <span class="msg-time">${fmtTime(new Date())}</span>
        <button class="msg-copy" onclick="App.copyMsg(this)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          Copy
        </button>
      </div>
    `;
    el.messages().appendChild(group);
    return group;
  }

  function finalizeBotGroup(group, rawText) {
    const meta = group.querySelector('.msg-meta');
    meta.style.display = '';
    const btn = meta.querySelector('.msg-copy');
    btn.dataset.text = rawText;
  }

  function showTyping(visible) {
    document.querySelectorAll('.msg-typing-group').forEach(n => n.remove());
    if (!visible) return;
    const group = document.createElement('div');
    group.className = 'msg-group bot msg-typing-group';
    group.style.animation = 'none';
    group.innerHTML = `
      <div class="msg-row">
        <div class="msg-avatar"><img src="/assets/logo.svg" alt="EmoConnect" /></div>
        <div class="msg-body">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
    el.messages().appendChild(group);
    scrollToBottom(false);
  }

  /* ══════════════════════════════════════════════════════
     VIEWS
  ══════════════════════════════════════════════════════ */
  function showView(name) {
    el.welcomeView().classList.toggle('active', name === 'welcome');
    el.chatView().classList.toggle('active',    name === 'chat');
  }

  function showChips(v) { el.chipsRow().classList.toggle('hidden', !v); }

  /* ══════════════════════════════════════════════════════
     SCROLL
  ══════════════════════════════════════════════════════ */
  function scrollToBottom(smooth) {
    const w = el.messagesWrap();
    w.scrollTo({ top: w.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  /* ══════════════════════════════════════════════════════
     SIDEBAR
  ══════════════════════════════════════════════════════ */
  function toggleSidebar() {
    const open = el.sidebar().classList.toggle('open');
    el.sbOverlay().classList.toggle('hidden', !open);
  }

  function closeSidebar() {
    el.sidebar().classList.remove('open');
    el.sbOverlay().classList.add('hidden');
  }

  /* ══════════════════════════════════════════════════════
     STARTERS
  ══════════════════════════════════════════════════════ */
  function useStarter(text) {
    el.userInput().value = text;
    autoResize(el.userInput());
    el.userInput().focus();
    if (!state.streaming) send();
  }

  /* ══════════════════════════════════════════════════════
     COPY
  ══════════════════════════════════════════════════════ */
  function copyMsg(btn) {
    const text = btn.dataset.text || '';
    navigator.clipboard.writeText(text).then(() => {
      const prev = btn.innerHTML;
      btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied';
      setTimeout(() => btn.innerHTML = prev, 2000);
    }).catch(() => showToast('Copy failed — try manually.'));
  }

  /* ══════════════════════════════════════════════════════
     CRISIS
  ══════════════════════════════════════════════════════ */
  function detectCrisis(text) {
    const l = text.toLowerCase();
    return CRISIS_KWS.some(kw => l.includes(kw));
  }

  function showCrisis()  { el.crisisOverlay().classList.remove('hidden'); }
  function closeCrisis() {
    el.crisisOverlay().classList.add('hidden');
    el.userInput().focus();
  }

  /* ══════════════════════════════════════════════════════
     VOICE
  ══════════════════════════════════════════════════════ */
  function toggleVoice() {
    if (!Voice) {
      showToast('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    if (state.streaming) return;
    Voice.toggle();
  }

  /* ══════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════ */
  function showToast(msg, ms = 3000) {
    const t = el.toast();
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  /* ══════════════════════════════════════════════════════
     INPUT HELPERS
  ══════════════════════════════════════════════════════ */
  function setStreaming(on) {
    state.streaming = on;
    el.sendBtn().disabled = on;
    el.userInput().disabled = on;
    if (!on) el.userInput().removeAttribute('disabled');
  }

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }

  /* ══════════════════════════════════════════════════════
     MARKDOWN PARSER
  ══════════════════════════════════════════════════════ */
  function md(text) {
    if (!text) return '';

    let t = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

    const lines = t.split('\n');
    const out   = [];
    let inUL = false, inOL = false;

    for (const line of lines) {
      const ul = line.match(/^[\*\-]\s+(.+)/);
      const ol = line.match(/^\d+\.\s+(.+)/);
      if (ul) {
        if (!inUL) { if (inOL) { out.push('</ol>'); inOL=false; } out.push('<ul>'); inUL=true; }
        out.push(`<li>${ul[1]}</li>`);
      } else if (ol) {
        if (!inOL) { if (inUL) { out.push('</ul>'); inUL=false; } out.push('<ol>'); inOL=true; }
        out.push(`<li>${ol[1]}</li>`);
      } else {
        if (inUL) { out.push('</ul>'); inUL=false; }
        if (inOL) { out.push('</ol>'); inOL=false; }
        out.push(line);
      }
    }
    if (inUL) out.push('</ul>');
    if (inOL) out.push('</ol>');

    return out.join('\n').split(/\n{2,}/).map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<[uo]l/.test(block)) return block;
      return `<p>${block.replace(/\n/g,'<br>')}</p>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtTime(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', init);

  /* ── Public API ────────────────────────────────────── */
  return {
    send, newSession, loadSession,
    selectMood, useStarter,
    toggleSidebar, closeSidebar,
    scrollToBottom: (s = true) => scrollToBottom(s),
    showCrisis, closeCrisis,
    copyMsg, toggleVoice,
  };

})();
