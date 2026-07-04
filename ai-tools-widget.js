/* ============================================================
   AI TOOLS WIDGET v1 — the only PUBLIC file in the ai_tools system.
   Host on GitHub Pages (public repo); everything meaningful stays
   server-side. Lesson stub (Systeme.io or anywhere):

     <div id="ai-tool"
          data-bot-id="rbf"
          data-engine="https://script.google.com/macros/s/DEPLOYMENT/exec"
          data-key="APP_KEY"></div>
     <script src="https://dfonvielle.github.io/ai-tools-widget/ai-tools-widget.js"></script>

   ai-tools-widget.js is an unversioned ALIAS of the newest build (the
   deploy script maintains it) so embedded lessons pick up new widget
   versions automatically. Versioned files (…v1.js) stay published for
   pinning a lesson to an old version on purpose.

   GLOBAL STYLING — widget-defaults.json, fetched at boot from the same
   folder this script was served from, holds the styling every embed
   inherits (text_size, header_size, gap, corner, height). Edit that one
   file + redeploy → every embedded widget updates. If the fetch fails
   (file:// test page, missing file), built-ins apply.

   Optional attributes — each one OVERRIDES the defaults file for that
   embed only:
     data-draft="1"       talk to the bot's draft channel (testing)
     data-height="620"    desktop card height in px
     data-title="..."     override the header title
     data-corner="left"   mobile launcher corner: left (default) or right
                          (left because Systeme.io's own course icon owns
                          the lower-right)
     data-text-size="15"  message text size in px (default 15)
     data-header-size="18"  ## heading size in px (default 18; ### and
                          #### scale down from it)
     data-gap="10"        height in px of the >> spacing gaps (default 10)

   BEHAVIOR (ChatNode UX parity per plan.md + chatnode_embed_reference.md)
     Desktop  → chat card rendered inline in the container. No minimize.
     Mobile   → full-screen popup, auto-opened on load, minimizable to a
                floating launcher bubble.

   SYSTEME.IO EMBEDDING — lesson HTML blocks run in a SAME-ORIGIN iframe,
   and Systeme.io swaps lessons SPA-style (no page reload). So on mobile:
     - the overlay + launcher are injected into window.parent.document,
       otherwise "full screen" would mean the tiny lesson iframe;
     - anything injected into the parent outlives this iframe → every boot
       first removes leftover [data-agt-owned] elements (cleanup-on-load),
       and a watchdog <script> injected into the parent polls the URL and
       removes the widget the moment the student navigates away.
   When the parent is cross-origin (or there is no iframe) everything
   falls back to the widget's own document — test.html keeps working.

   Sessions (state + history) live in THIS browser's localStorage and
   round-trip to the engine each turn. Nothing is stored server-side.
   ============================================================ */
(function () {
  'use strict';

  var LS_PREFIX = 'ai_tools.v1.';
  var MAX_TURNS_SENT = 12;
  var OWNED_ATTR = 'data-agt-owned';   // tags everything we inject into the parent

  // Where THIS script was loaded from — widget-defaults.json is fetched
  // from the same folder. Must be captured now, at script-evaluation time:
  // document.currentScript is null later inside callbacks.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  /* ----------------------------------------------------------
   * BOOT
   * ---------------------------------------------------------- */
  function boot() {
    var el = document.getElementById('ai-tool') || document.querySelector('[data-bot-id]');
    if (!el) { return; }
    loadDefaults(function (defs) { bootWith(el, defs); });
  }

  // Global styling every embed inherits (see header). Never blocks boot:
  // any failure — no http(s) source (file:// test pages), missing file,
  // slow host past 1.5s — falls back to built-ins. Calls back exactly once.
  function loadDefaults(cb) {
    var base = SCRIPT_SRC.split('?')[0];
    if (base.indexOf('http') !== 0 || typeof fetch !== 'function') { cb({}); return; }
    var url = base.slice(0, base.lastIndexOf('/') + 1) + 'widget-defaults.json';
    var done = false;
    var finish = function (defs) {
      if (!done) { done = true; cb(defs && typeof defs === 'object' ? defs : {}); }
    };
    setTimeout(function () { finish({}); }, 1500);
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(finish, function () { finish({}); });
  }

  function bootWith(el, defs) {
    // Per value: the embed's data- attribute wins, then widget-defaults.json,
    // then the built-in. 0 / missing means "not set" at every level.
    var cfg = {
      botId: el.getAttribute('data-bot-id') || '',
      engine: el.getAttribute('data-engine') || (window.AI_TOOLS_CONFIG && window.AI_TOOLS_CONFIG.engine) || '',
      key: el.getAttribute('data-key') || (window.AI_TOOLS_CONFIG && window.AI_TOOLS_CONFIG.key) || '',
      draft: el.getAttribute('data-draft') === '1',
      title: el.getAttribute('data-title') || '',
      height: parseInt(el.getAttribute('data-height') || '0', 10) || parseInt(defs.height, 10) || 620,
      corner: String(el.getAttribute('data-corner') || defs.corner || 'left').toLowerCase() === 'right' ? 'right' : 'left',
      textSize: parseInt(el.getAttribute('data-text-size') || '0', 10) || parseInt(defs.text_size, 10) || 0,
      headerSize: parseInt(el.getAttribute('data-header-size') || '0', 10) || parseInt(defs.header_size, 10) || 0,
      gap: parseInt(el.getAttribute('data-gap') || '0', 10) || parseInt(defs.gap, 10) || 0
    };
    if (!cfg.botId || !cfg.engine || !cfg.key) {
      el.innerHTML = '<div style="padding:12px;color:#b00;font:14px sans-serif">'
        + 'AI tool not configured (needs data-bot-id, data-engine, data-key).</div>';
      return;
    }

    // Same-origin parent access (Systeme.io lesson iframe). Cross-origin
    // parents throw on .document — that means we stay in our own document.
    var parentWin = null, parentDoc = null;
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        parentWin = window.parent;
        parentDoc = window.parent.document;
      }
    } catch (e) {}

    // Cleanup-on-load: kill whatever a PREVIOUS lesson's embed left in the
    // parent (Systeme.io swaps lessons without a real page reload).
    cleanupParent(parentWin, parentDoc);

    // Mobile = the DEVICE is narrow. Measure the parent window when we can:
    // the lesson iframe can be narrower than the screen (a 740px desktop
    // lesson column must NOT get the mobile popup).
    var width = window.innerWidth;
    try { if (parentWin) { width = parentWin.innerWidth; } } catch (e) {}
    var env = {
      mobile: width <= 768,
      inParent: false,
      hostWin: window,
      hostDoc: document
    };
    if (env.mobile && parentDoc) {
      env.inParent = true;
      env.hostWin = parentWin;
      env.hostDoc = parentDoc;
    }

    injectStyles(document, false);
    if (env.inParent) { injectStyles(env.hostDoc, true); }
    new Widget(el, cfg, env);
  }

  function cleanupParent(parentWin, parentDoc) {
    if (!parentDoc) { return; }
    try {
      if (parentWin.__agtWatchdogId) {
        parentWin.clearInterval(parentWin.__agtWatchdogId);
        parentWin.__agtWatchdogId = 0;
      }
      var owned = parentDoc.querySelectorAll('[' + OWNED_ATTR + ']');
      for (var i = 0; i < owned.length; i++) {
        try { owned[i].parentNode && owned[i].parentNode.removeChild(owned[i]); } catch (e) {}
      }
      parentDoc.body.style.overflow = '';
    } catch (e) {}
  }

  /* ----------------------------------------------------------
   * WIDGET
   * ---------------------------------------------------------- */
  function Widget(container, cfg, env) {
    this.cfg = cfg;
    this.env = env;
    this.container = container;
    this.lsKey = LS_PREFIX + cfg.botId + (cfg.draft ? '.draft' : '');
    this.session = this.loadSession();
    this.mobile = env.mobile;
    this.pending = false;
    this.buildUi();
    if (env.inParent) { this.armWatchdog(); }
    this.restoreOrGreet();
  }

  Widget.prototype.loadSession = function () {
    try {
      var raw = localStorage.getItem(this.lsKey);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.session_id) { return s; }
      }
    } catch (e) {}
    return { session_id: uuid(), screen: null, state: {}, messages: [], meta: null };
  };

  Widget.prototype.saveSession = function () {
    try { localStorage.setItem(this.lsKey, JSON.stringify(this.session)); } catch (e) {}
  };

  Widget.prototype.resetSession = function () {
    try { localStorage.removeItem(this.lsKey); } catch (e) {}
    var meta = this.session.meta;   // keep the cached greeting
    this.session = { session_id: uuid(), screen: null, state: {}, messages: [], meta: meta };
    this.listEl.innerHTML = '';
    this.greet();
  };

  /* ----------------------------------------------------------
   * UI
   * ---------------------------------------------------------- */
  Widget.prototype.buildUi = function () {
    var self = this;

    this.panel = div('agt-panel');
    if (this.mobile) { this.panel.className += ' agt-mobile'; }
    else { this.panel.style.height = this.cfg.height + 'px'; }

    // Size knobs (data-text-size / data-header-size / data-gap) become CSS
    // variables on the panel so they cascade to every bubble.
    if (this.cfg.textSize) { this.panel.style.setProperty('--agt-fs', this.cfg.textSize + 'px'); }
    if (this.cfg.headerSize) {
      this.panel.style.setProperty('--agt-h2', this.cfg.headerSize + 'px');
      this.panel.style.setProperty('--agt-h3', (this.cfg.headerSize - 2) + 'px');
      this.panel.style.setProperty('--agt-h4', (this.cfg.headerSize - 3) + 'px');
    }
    if (this.cfg.gap) { this.panel.style.setProperty('--agt-gap', this.cfg.gap + 'px'); }

    // Header
    var header = div('agt-header');
    var title = div('agt-title');
    // Priority: data-title on the embed > the bot's name (front-matter,
    // via botMeta) > placeholder until botMeta arrives.
    title.textContent = this.cfg.title
      || (this.session.meta && this.session.meta.name) || 'AI Coach';
    this.titleEl = title;
    header.appendChild(title);
    if (this.cfg.draft) {
      var badge = div('agt-badge');
      badge.textContent = 'DRAFT';
      header.appendChild(badge);
    }
    var reset = document.createElement('button');
    reset.className = 'agt-hbtn';
    reset.type = 'button';
    reset.title = 'Start over';
    reset.innerHTML = '&#8634;';
    reset.onclick = function () {
      if (window.confirm('Start this tool over from the beginning? Your current session will be cleared.')) {
        self.resetSession();
      }
    };
    header.appendChild(reset);
    if (this.mobile) {
      var min = document.createElement('button');
      min.className = 'agt-hbtn';
      min.type = 'button';
      min.title = 'Minimize';
      min.innerHTML = '&#8211;';
      min.onclick = function () { self.setOpen(false); };
      header.appendChild(min);
    }
    this.panel.appendChild(header);

    // Message list
    this.listEl = div('agt-list');
    this.panel.appendChild(this.listEl);

    // Composer
    var composer = div('agt-composer');
    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'agt-input';
    this.inputEl.rows = 1;
    this.inputEl.placeholder = 'Type your message…';
    this.inputEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey && !self.mobile) {
        ev.preventDefault();
        self.send();
      }
    });
    this.inputEl.addEventListener('input', function () {
      self.inputEl.style.height = 'auto';
      self.inputEl.style.height = Math.min(self.inputEl.scrollHeight, 120) + 'px';
    });
    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'agt-send';
    this.sendBtn.type = 'button';
    this.sendBtn.innerHTML = '&#10148;';
    this.sendBtn.onclick = function () { self.send(); };
    composer.appendChild(this.inputEl);
    composer.appendChild(this.sendBtn);
    this.panel.appendChild(composer);

    if (this.mobile) {
      // Full-screen overlay + floating launcher, in the PARENT document when
      // we're inside a same-origin lesson iframe (otherwise our own).
      // Everything appended there is tagged for cleanup-on-load + watchdog.
      var hostDoc = this.env.hostDoc;

      this.overlay = div('agt-overlay');
      this.overlay.setAttribute(OWNED_ATTR, '1');
      this.overlay.appendChild(this.panel);
      hostDoc.body.appendChild(this.overlay);

      this.launcher = document.createElement('button');
      this.launcher.className = 'agt-launcher agt-launcher-' + this.cfg.corner;
      this.launcher.type = 'button';
      this.launcher.setAttribute('aria-label', 'Open AI coach');
      this.launcher.setAttribute(OWNED_ATTR, '1');
      this.launcher.innerHTML = launcherSvg();
      this.launcher.onclick = function () { self.setOpen(true); };
      hostDoc.body.appendChild(this.launcher);

      // Stays visible in the lesson block while the popup is minimized
      // (Dave's "hint text" pattern from the ChatNode setup).
      var note = div('agt-inline-note');
      note.textContent = 'Your AI coach is open — if you close it, tap the chat bubble to bring it back.';
      this.container.appendChild(note);

      this.setOpen(true);   // auto-open the moment the lesson loads
    } else {
      this.container.appendChild(this.panel);
    }
  };

  Widget.prototype.setOpen = function (open) {
    if (!this.mobile) { return; }
    this.overlay.style.display = open ? 'flex' : 'none';
    this.launcher.style.display = open ? 'none' : 'flex';
    try { this.env.hostDoc.body.style.overflow = open ? 'hidden' : ''; } catch (e) {}
    if (open) { this.scrollToEnd(); }
  };

  /* ----------------------------------------------------------
   * URL WATCHDOG — lives in the PARENT window, so it survives this
   * iframe's death when Systeme.io swaps lessons. On any URL change it
   * removes every tagged element, then stops itself.
   * ---------------------------------------------------------- */
  Widget.prototype.armWatchdog = function () {
    try {
      var hostDoc = this.env.hostDoc;
      var watchdog = hostDoc.createElement('script');
      watchdog.id = 'agt-watchdog';
      watchdog.setAttribute(OWNED_ATTR, '1');
      watchdog.textContent = '(function(){'
        + 'var last=window.location.href;'
        + 'window.__agtWatchdogId=setInterval(function(){'
        +   'if(window.location.href===last)return;'
        +   'clearInterval(window.__agtWatchdogId);window.__agtWatchdogId=0;'
        +   'var owned=document.querySelectorAll("[' + OWNED_ATTR + ']");'
        +   'for(var i=0;i<owned.length;i++){try{owned[i].parentNode&&owned[i].parentNode.removeChild(owned[i]);}catch(e){}}'
        +   'document.body.style.overflow="";'
        + '},750);'
        + '})();';
      hostDoc.body.appendChild(watchdog);
    } catch (e) {}
  };

  /* ----------------------------------------------------------
   * MESSAGES
   * ---------------------------------------------------------- */
  Widget.prototype.restoreOrGreet = function () {
    if (this.session.messages.length) {
      for (var i = 0; i < this.session.messages.length; i++) {
        this.renderBubble(this.session.messages[i]);
      }
      this.scrollToEnd();
    } else {
      this.greet();
    }
  };

  Widget.prototype.greet = function () {
    var self = this;
    if (this.session.meta && this.session.meta.greeting) {
      this.pushBot(this.session.meta.greeting);
      return;
    }
    this.callEngine({ action: 'botMeta' }, function (resp) {
      if (resp && resp.ok) {
        self.session.meta = { name: resp.name, greeting: resp.greeting };
        self.session.screen = self.session.screen || resp.start_screen;
        self.saveSession();
        if (!self.cfg.title && resp.name) { self.titleEl.textContent = resp.name; }
        self.pushBot(resp.greeting || 'Hello!');
      } else {
        self.systemNote((resp && resp.error) || 'This tool could not load. Please refresh the page.');
      }
    });
  };

  Widget.prototype.pushBot = function (text) {
    var m = { role: 'bot', text: text };
    this.session.messages.push(m);
    this.saveSession();
    this.renderBubble(m);
    this.scrollToEnd();
  };

  Widget.prototype.pushUser = function (text) {
    var m = { role: 'user', text: text };
    this.session.messages.push(m);
    this.saveSession();
    this.renderBubble(m);
    this.scrollToEnd();
  };

  Widget.prototype.renderBubble = function (m) {
    var row = div('agt-row ' + (m.role === 'user' ? 'agt-row-user' : 'agt-row-bot'));
    var b = div('agt-bubble ' + (m.role === 'user' ? 'agt-user' : 'agt-bot'));
    b.innerHTML = mdToHtml(m.text);
    row.appendChild(b);
    this.listEl.appendChild(row);
  };

  Widget.prototype.systemNote = function (text) {
    var n = div('agt-note');
    n.textContent = text;
    this.listEl.appendChild(n);
    this.scrollToEnd();
  };

  Widget.prototype.scrollToEnd = function () {
    var el = this.listEl;
    window.setTimeout(function () { el.scrollTop = el.scrollHeight; }, 30);
  };

  /* ----------------------------------------------------------
   * SEND / ENGINE
   * ---------------------------------------------------------- */
  Widget.prototype.send = function () {
    var self = this;
    if (this.pending) { return; }
    var text = String(this.inputEl.value || '').trim();
    if (!text) { return; }
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.pushUser(text);
    this.setPending(true);

    // History EXCLUDES the message being sent (it rides in user_message).
    var history = this.session.messages.slice(0, -1).slice(-MAX_TURNS_SENT);

    this.callEngine({
      action: 'chat',
      session_id: this.session.session_id,
      screen: this.session.screen,
      state: this.session.state,
      messages: history,
      user_message: text
    }, function (resp) {
      self.setPending(false);
      if (!resp || !resp.ok) {
        self.systemNote((resp && resp.error) || 'I could not reach the AI just now. Please try again in a moment.');
        return;
      }
      if (resp.state) { self.session.state = resp.state; }
      if (resp.screen) { self.session.screen = resp.screen; }
      self.pushBot(resp.message || '…');
    });
  };

  Widget.prototype.setPending = function (on) {
    this.pending = on;
    this.sendBtn.disabled = on;
    this.inputEl.disabled = on;
    if (on) {
      this.typingEl = div('agt-row agt-row-bot');
      var b = div('agt-bubble agt-bot agt-typing');
      b.innerHTML = '<span></span><span></span><span></span>';
      this.typingEl.appendChild(b);
      this.listEl.appendChild(this.typingEl);
      this.scrollToEnd();
    } else if (this.typingEl) {
      this.typingEl.parentNode && this.typingEl.parentNode.removeChild(this.typingEl);
      this.typingEl = null;
      this.inputEl.focus();
    }
  };

  Widget.prototype.callEngine = function (payload, cb) {
    payload.app_key = this.cfg.key;
    payload.bot_id = this.cfg.botId;
    if (this.cfg.draft) { payload.draft = true; }
    var engine = this.cfg.engine;
    var body = JSON.stringify(payload);
    var attempt = 0;

    // GAS answers POSTs through a redirect that intermittently drops the
    // request: the echo host 404s, or the POST gets replayed as a GET and
    // doGet's ping ({service:'ai_tools'}) comes back instead of our action.
    // Both are transient — retry up to 2 times before giving up. Real
    // engine answers (including ok:false errors) pass through untouched.
    function bounced(resp) {
      return !resp || (resp.ok === true && resp.service === 'ai_tools');
    }
    function go() {
      attempt++;
      // text/plain keeps this a CORS "simple request" (no preflight),
      // the same transport the freedom-tracker loader has proven.
      fetch(engine, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body
      }).then(function (r) { return r.json(); })
        .then(function (resp) {
          if (bounced(resp) && attempt < 3) { window.setTimeout(go, 900 * attempt); return; }
          cb(bounced(resp) ? null : resp);
        })
        .catch(function () {
          if (attempt < 3) { window.setTimeout(go, 900 * attempt); return; }
          cb(null);
        });
    }
    go();
  };

  /* ----------------------------------------------------------
   * MARKDOWN-LITE RENDERER
   * Handles the style layer's output: ## / ### / #### headings,
   * `>>`-only lines as vertical spacing, - lists, ✓ lines, **bold**,
   * *italic*. Everything is HTML-escaped first.
   * ---------------------------------------------------------- */
  function mdToHtml(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (t === '>>') {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<div class="agt-gap"></div>');
        continue;
      }
      if (!t) { if (inList) { out.push('</ul>'); inList = false; } continue; }
      var esc = escapeHtml(t);
      esc = esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
               .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      if (/^#### /.test(t)) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<h4>' + esc.replace(/^#### /, '') + '</h4>');
      } else if (/^### /.test(t)) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<h3>' + esc.replace(/^### /, '') + '</h3>');
      } else if (/^## /.test(t)) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<h2>' + esc.replace(/^## /, '') + '</h2>');
      } else if (/^- /.test(t)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + esc.replace(/^- /, '') + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<p>' + esc + '</p>');
      }
    }
    if (inList) { out.push('</ul>'); }
    return out.join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
  }

  /* ----------------------------------------------------------
   * HELPERS + STYLES
   * ---------------------------------------------------------- */
  function div(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function launcherSvg() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">'
      + '<path d="M12 3C7 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6L5 21l4.2-1.7c.9.2 1.8.4 2.8.4 5 0 9-3.6 9-8s-4-8.7-9-8.7z" fill="#fff"/></svg>';
  }

  function injectStyles(doc, tagOwned) {
    if (doc.getElementById('agt-styles')) { return; }
    var css = ''
      + ':root{--agt-accent:#2f6df6;--agt-bg:#111418;--agt-panel:#1a1f26;--agt-bot:#242b34;'
      + '--agt-user:#2f6df6;--agt-text:#e8ecf1;--agt-muted:#9aa4b0;}'
      + '.agt-panel{display:flex;flex-direction:column;width:100%;background:var(--agt-panel);'
      + 'border-radius:14px;overflow:hidden;'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
      + 'font-size:var(--agt-fs,15px);line-height:1.5;font-weight:400;text-align:left;'
      + 'color:var(--agt-text);box-shadow:0 6px 24px rgba(0,0,0,.25);}'
      /* Host pages (Systeme.io etc.) style bare h2/p/li tags globally; every
         element we render must therefore pin color/alignment/size itself,
         or headings turn host-colored (invisible on our dark bubbles) and
         text picks up the host's centering. */
      + '.agt-bubble h2,.agt-bubble h3,.agt-bubble h4,.agt-bubble p,.agt-bubble li,'
      + '.agt-bubble ul,.agt-bubble strong,.agt-bubble em{color:inherit;text-align:left;'
      + 'letter-spacing:normal;text-transform:none;font-family:inherit;}'
      + '.agt-bubble p,.agt-bubble li{font-size:inherit;line-height:inherit;}'
      + '.agt-header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--agt-bg);}'
      + '.agt-title{flex:1;font-weight:600;}'
      + '.agt-badge{background:#e6a700;color:#111;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px;}'
      + '.agt-hbtn{background:none;border:none;color:var(--agt-muted);font-size:18px;cursor:pointer;'
      + 'padding:2px 8px;border-radius:6px;}.agt-hbtn:hover{background:rgba(255,255,255,.08);color:#fff;}'
      + '.agt-list{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;}'
      + '.agt-row{display:flex;}.agt-row-user{justify-content:flex-end;}.agt-row-bot{justify-content:flex-start;}'
      + '.agt-bubble{max-width:86%;padding:10px 14px;border-radius:14px;word-wrap:break-word;}'
      + '.agt-bot{background:var(--agt-bot);border-bottom-left-radius:4px;}'
      + '.agt-user{background:var(--agt-user);color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap;}'
      + '.agt-bubble p{margin:0;}.agt-bubble .agt-gap{height:var(--agt-gap,10px);}'
      + '.agt-bubble h2{font-size:var(--agt-h2,18px);margin:6px 0 4px;font-weight:700;line-height:1.3;}'
      + '.agt-bubble h3{font-size:var(--agt-h3,16px);margin:6px 0 4px;font-weight:700;line-height:1.3;}'
      + '.agt-bubble h4{font-size:var(--agt-h4,15px);margin:5px 0 3px;font-weight:600;line-height:1.3;}'
      + '.agt-bubble ul{margin:2px 0;padding-left:20px;list-style:disc;}.agt-bubble li{margin:3px 0;}'
      + '.agt-note{align-self:center;font-size:12.5px;color:var(--agt-muted);background:rgba(255,255,255,.05);'
      + 'padding:6px 12px;border-radius:10px;max-width:90%;text-align:center;}'
      + '.agt-composer{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;background:var(--agt-bg);}'
      + '.agt-input{flex:1;resize:none;border:1px solid #333c46;background:#20262e;color:var(--agt-text);'
      + 'border-radius:10px;padding:10px 12px;font:inherit;outline:none;max-height:120px;}'
      + '.agt-input:focus{border-color:var(--agt-accent);}'
      + '.agt-send{width:42px;height:42px;border:none;border-radius:10px;background:var(--agt-accent);'
      + 'color:#fff;font-size:17px;cursor:pointer;flex:none;}.agt-send:disabled{opacity:.5;cursor:default;}'
      + '.agt-typing span{display:inline-block;width:7px;height:7px;margin:0 2px;background:var(--agt-muted);'
      + 'border-radius:50%;animation:agtBlink 1.2s infinite;}'
      + '.agt-typing span:nth-child(2){animation-delay:.2s;}.agt-typing span:nth-child(3){animation-delay:.4s;}'
      + '@keyframes agtBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}'
      + '.agt-overlay{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.4);display:flex;}'
      + '.agt-overlay .agt-panel.agt-mobile{width:100%;height:100%;border-radius:0;}'
      + '.agt-launcher{position:fixed;bottom:16px;z-index:999998;width:56px;height:56px;'
      + 'border-radius:50%;border:none;background:var(--agt-accent);display:flex;align-items:center;'
      + 'justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);}'
      + '.agt-launcher-left{left:16px;}.agt-launcher-right{right:16px;}'
      + '.agt-inline-note{font:13px/1.4 sans-serif;color:#777;padding:10px;text-align:left;}';
    var style = doc.createElement('style');
    style.id = 'agt-styles';
    if (tagOwned) { style.setAttribute(OWNED_ATTR, '1'); }
    style.textContent = css;
    doc.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
