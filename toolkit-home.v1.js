/* ============================================================
   TOOLKIT HOME v1 — the One Door page for the SYBR Toolkit.

   One page, one question. The student answers in their own words,
   the Toolkit Guide bot (tk_door) picks exactly ONE tool, and this
   page mounts that tool right below with the student's words as its
   first message. The launch protocols ride along silently and become
   a single "Next" card after each tool. No server-side storage of
   anything: page state lives in THIS browser's localStorage.

   Lesson stub (generate with: node tools/toolkit-snippet.js [--draft]):

     <div id="toolkit-home"
          data-engine="https://script.google.com/macros/s/DEPLOYMENT/exec"
          data-key="APP_KEY"></div>
     <script src="https://dfonvielle.github.io/ai-tools-widget/ai-tools-widget.js"></script>
     <script src="https://dfonvielle.github.io/ai-tools-widget/toolkit-home.js"></script>

   Optional attributes:
     data-draft="1"           talk to draft-channel bots (testing)
     data-freedom-url="URL"   where the Freedom program card points; without
                              it the card renders warm text and no link
     data-title="..."         page heading override

   THE DOOR CONTRACT (mirrors bots/tk_door.md — keep in sync):
     the router's chat responses carry state.door =
       { tool: "<bot_id|freedom_program>", why: "...", next: ["<bot_id>", ...] }
     No door key = the reply is conversation (the one clarifying
     question); an unknown tool id is treated the same way, so a model
     hiccup can never strand the student (surfaces never show plumbing).

   Design doctrine: mission_control/DRUNK_GRANDPA_STRATEGY.md — rule 12
   (one door open at a time), rule 15 (consent lives in the button),
   rule 17 (authored copy wears human punctuation), rule 18 (color =
   meaning: indigo do, teal talk, gold payoff, gray optional).
   ============================================================ */
(function () {
  'use strict';

  var VERSION = 'toolkit-home.v1';
  var LS_PREFIX = 'tk_home.v1';
  var MAX_TURNS_SENT = 12;

  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  /* ----------------------------------------------------------
   * COPY: — every student-facing string, in one place, so Dave can
   * reword the page without reading code. Rule 17: no em dashes and
   * no semicolons anywhere in these strings.
   * ---------------------------------------------------------- */
  var COPY = {
    title: 'Your Toolkit',
    question: 'What do you want to make easier, more enjoyable, or feel better about?',
    hint: 'Say it the way you would say it to a friend.',
    examples: 'For example: "I dread doing my taxes" or "I can\'t stop worrying about my health" or "Nothing feels fun lately".',
    askButton: 'Find my tool',
    thinking: 'Picking the right tool for you…',
    replyPlaceholder: 'Type your answer…',
    openTool: 'Open {tool} →',
    startOver: 'Start over with a fresh question',
    mountedHeading: '{tool}',
    doneLink: 'I’m done with this for now',
    nextLead: 'When you’re ready, the usual next step is {tool}.',
    nextButton: 'Open {tool} →',
    somethingElse: 'Something else on my mind',
    goodForToday: 'I’m good for today',
    resumeLead: 'Welcome back. You were working with the {tool}.',
    resumeButton: 'Continue where you left off →',
    winsHeading: 'What you’ve worked through',
    freedomButton: 'Open the Freedom program →',
    errorNote: 'I could not reach the AI just now. Please try again in a moment.',
    doneNote: 'Nice work. It’s saved in your list below.'
  };

  // The mountable roster. bots-meta.json refreshes the display names at
  // boot when reachable; these baked names are the offline fallback.
  var ROSTER = {
    ef_nbef: 'No-Brainer Emotional Baggage Drop',
    ef_efasap: 'Emotional Freedom: Change How You Feel ASAP',
    ef_happyenjoy: 'Happiness & Enjoyment Booster',
    bh_fearanxiety: 'Fear & Anxiety Reliever',
    mf_nbmf: 'No-Brainer Mental Freedom',
    mf_tfasap: 'Thinking Freedom From Unwanted Thoughts',
    ag_procrasresist: 'Free Yourself From Procrastination or Resistance',
    ag_feelgoodgtd: 'Feel Good Getting Things Done',
    ah_nbah: 'No-Brainer Habits',
    ah_feelgoodah: 'Feel-Good Automatic Habits'
  };
  var FREEDOM_ID = 'freedom_program';
  var FREEDOM_NAME = 'Freedom program';
  var ROUTER_BOT = 'tk_door';

  /* ----------------------------------------------------------
   * BOOT
   * ---------------------------------------------------------- */
  function boot() {
    var el = document.getElementById('toolkit-home');
    if (!el) { return; }
    var cfg = {
      engine: el.getAttribute('data-engine') || '',
      key: el.getAttribute('data-key') || '',
      draft: el.getAttribute('data-draft') === '1',
      freedomUrl: el.getAttribute('data-freedom-url') || '',
      title: el.getAttribute('data-title') || COPY.title
    };
    if (!cfg.engine || !cfg.key) {
      el.innerHTML = '<div style="padding:12px;color:#b00;font:14px sans-serif">'
        + 'Toolkit not configured (needs data-engine and data-key).</div>';
      return;
    }
    injectStyles();
    new Door(el, cfg);
  }

  function Door(container, cfg) {
    this.container = container;
    this.cfg = cfg;
    this.lsKey = LS_PREFIX + (cfg.draft ? '.draft' : '');
    this.s = this.load();
    this.names = {};
    this.pending = false;
    this.mountedEl = null;
    var self = this;
    fetchNames(function (meta) {
      var id;
      for (id in ROSTER) {
        self.names[id] = (meta[id] && meta[id].name) || ROSTER[id];
      }
      self.render();
    });
  }

  /* ----------------------------------------------------------
   * STATE — one localStorage blob.
   *   phase: ask | talk | ready | mounted | next
   *   door:  the router conversation {session_id, screen, state, messages}
   *   rec:   {tool, why, next[]} once recommended
   *   queue: bot ids still ahead in the protocol
   *   mount: {bot, key} the active tool mount (resume target)
   *   nfirst: whether the active mount already got its first message
   *   counters: per-bot session rotation counters
   *   wins: [{bot, name, date}]
   * ---------------------------------------------------------- */
  Door.prototype.load = function () {
    try {
      var raw = localStorage.getItem(this.lsKey);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.v === 1) { return s; }
      }
    } catch (e) {}
    return { v: 1, phase: 'ask', door: this.freshDoor(), rec: null, queue: [],
             mount: null, counters: {}, wins: [] };
  };

  Door.prototype.save = function () {
    try { localStorage.setItem(this.lsKey, JSON.stringify(this.s)); } catch (e) {}
  };

  Door.prototype.freshDoor = function () {
    return { session_id: uuid(), screen: null, state: {}, messages: [] };
  };

  Door.prototype.resetDoor = function () {
    this.s.door = this.freshDoor();
    this.s.rec = null;
    this.s.queue = [];
    this.s.phase = 'ask';
    this.save();
  };

  Door.prototype.toolName = function (id) {
    if (id === FREEDOM_ID) { return FREEDOM_NAME; }
    return this.names[id] || ROSTER[id] || id;
  };

  /* ----------------------------------------------------------
   * RENDER — one function, one phase visible (doctrine rule 12).
   * ---------------------------------------------------------- */
  Door.prototype.render = function () {
    var self = this;
    if (this.mountedEl) { this.unmountTool(); }
    this.container.innerHTML = '';

    var root = div('tkh');
    var head = div('tkh-head');
    head.textContent = this.cfg.title;
    root.appendChild(head);
    if (this.cfg.draft) {
      var badge = div('tkh-badge');
      badge.textContent = 'DRAFT';
      head.appendChild(badge);
    }

    var phase = this.s.phase;
    if (phase === 'mounted' && !this.s.mount) { phase = 'ask'; }

    if (phase === 'mounted') { this.renderResume(root); }
    else if (phase === 'ready' && this.s.rec) { this.renderReady(root); }
    else if (phase === 'next') { this.renderNext(root); }
    else if (phase === 'talk') { this.renderTalk(root); }
    else { this.renderAsk(root); }

    this.renderWins(root);
    this.container.appendChild(root);
    return root;
  };

  // ASK — the one question and one input.
  Door.prototype.renderAsk = function (root) {
    var self = this;
    var card = div('tkh-card');
    var q = div('tkh-q');
    q.textContent = COPY.question;
    card.appendChild(q);
    var hint = div('tkh-hint');
    hint.textContent = COPY.hint;
    card.appendChild(hint);

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'tkh-input';
    this.inputEl.rows = 2;
    this.inputEl.placeholder = COPY.replyPlaceholder;
    card.appendChild(this.inputEl);

    this.goBtn = document.createElement('button');
    this.goBtn.className = 'tkh-btn tkh-do';
    this.goBtn.type = 'button';
    this.goBtn.textContent = COPY.askButton;
    this.goBtn.onclick = function () { self.submit(); };
    card.appendChild(this.goBtn);

    var ex = div('tkh-muted');
    ex.textContent = COPY.examples;
    card.appendChild(ex);
    root.appendChild(card);
    this.armEnter();
  };

  // TALK — the router said something that is not yet a recommendation.
  Door.prototype.renderTalk = function (root) {
    var self = this;
    var card = div('tkh-card');
    var msgs = this.s.door.messages;
    var last = null;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'bot') { last = msgs[i]; break; }
    }
    if (last) {
      var bubble = div('tkh-talk');
      bubble.innerHTML = mdLite(last.text);
      card.appendChild(bubble);
    }
    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'tkh-input';
    this.inputEl.rows = 2;
    this.inputEl.placeholder = COPY.replyPlaceholder;
    card.appendChild(this.inputEl);
    this.goBtn = document.createElement('button');
    this.goBtn.className = 'tkh-btn tkh-do';
    this.goBtn.type = 'button';
    this.goBtn.textContent = COPY.askButton;
    this.goBtn.onclick = function () { self.submit(); };
    card.appendChild(this.goBtn);
    this.quietLink(card, COPY.startOver, function () { self.resetDoor(); self.render(); });
    root.appendChild(card);
    this.armEnter();
  };

  // READY — one card, one primary action (doctrine rules 12 + 15).
  Door.prototype.renderReady = function (root) {
    var self = this;
    var rec = this.s.rec;
    var card = div('tkh-card');
    var msgs = this.s.door.messages;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'bot') {
        var bubble = div('tkh-talk');
        bubble.innerHTML = mdLite(msgs[i].text);
        card.appendChild(bubble);
        break;
      }
    }
    if (rec.tool === FREEDOM_ID) {
      if (this.cfg.freedomUrl) {
        var a = document.createElement('a');
        a.className = 'tkh-btn tkh-do';
        a.href = this.cfg.freedomUrl;
        a.textContent = COPY.freedomButton;
        card.appendChild(a);
      }
    } else {
      var btn = document.createElement('button');
      btn.className = 'tkh-btn tkh-do';
      btn.type = 'button';
      btn.textContent = COPY.openTool.replace('{tool}', this.toolName(rec.tool));
      btn.onclick = function () { self.mountTool(rec.tool, true); };
      card.appendChild(btn);
    }
    this.quietLink(card, COPY.startOver, function () { self.resetDoor(); self.render(); });
    root.appendChild(card);
  };

  // MOUNTED (fresh mount happens in mountTool; this renders the RESUME
  // card seen on a reload with an active mount).
  Door.prototype.renderResume = function (root) {
    var self = this;
    var mount = this.s.mount;
    var card = div('tkh-card');
    var lead = div('tkh-q');
    lead.textContent = COPY.resumeLead.replace('{tool}', this.toolName(mount.bot));
    card.appendChild(lead);
    var btn = document.createElement('button');
    btn.className = 'tkh-btn tkh-do';
    btn.type = 'button';
    btn.textContent = COPY.resumeButton;
    btn.onclick = function () { self.mountTool(mount.bot, false); };
    card.appendChild(btn);
    this.quietLink(card, COPY.somethingElse, function () { self.resetDoor(); self.render(); });
    root.appendChild(card);
  };

  // NEXT — the protocol's single next step, or back to the door.
  Door.prototype.renderNext = function (root) {
    var self = this;
    var card = div('tkh-card');
    var note = div('tkh-gold-note');
    note.textContent = COPY.doneNote;
    card.appendChild(note);
    var nextBot = null;
    while (this.s.queue.length && !nextBot) {
      var candidate = this.s.queue[0];
      if (ROSTER[candidate]) { nextBot = candidate; }
      else { this.s.queue.shift(); }
    }
    if (nextBot) {
      var lead = div('tkh-q');
      lead.textContent = COPY.nextLead.replace('{tool}', this.toolName(nextBot));
      card.appendChild(lead);
      var btn = document.createElement('button');
      btn.className = 'tkh-btn tkh-do';
      btn.type = 'button';
      btn.textContent = COPY.nextButton.replace('{tool}', this.toolName(nextBot));
      btn.onclick = function () {
        self.s.queue.shift();
        self.save();
        self.mountTool(nextBot, true);
      };
      card.appendChild(btn);
      this.quietLink(card, COPY.somethingElse, function () { self.resetDoor(); self.render(); });
      this.quietLink(card, COPY.goodForToday, function () { self.resetDoor(); self.render(); });
      root.appendChild(card);
    } else {
      root.appendChild(card);
      this.s.phase = 'ask';
      this.save();
      this.renderAsk(root);
    }
  };

  // WINS — the stacked payoff list (gold), rendered under every phase.
  Door.prototype.renderWins = function (root) {
    if (!this.s.wins.length) { return; }
    var wrap = div('tkh-wins');
    var h = div('tkh-wins-h');
    h.textContent = COPY.winsHeading;
    wrap.appendChild(h);
    for (var i = this.s.wins.length - 1; i >= 0; i--) {
      var w = this.s.wins[i];
      var row = div('tkh-win');
      var chip = document.createElement('span');
      chip.className = 'tkh-win-chip';
      chip.textContent = w.date;
      row.appendChild(chip);
      row.appendChild(document.createTextNode(' ' + (w.name || this.toolName(w.bot))));
      wrap.appendChild(row);
    }
    root.appendChild(wrap);
  };

  Door.prototype.quietLink = function (parent, label, onTap) {
    var a = document.createElement('button');
    a.className = 'tkh-quiet';
    a.type = 'button';
    a.textContent = label;
    a.onclick = onTap;
    parent.appendChild(a);
  };

  Door.prototype.armEnter = function () {
    var self = this;
    if (!this.inputEl) { return; }
    this.inputEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        self.submit();
      }
    });
  };

  /* ----------------------------------------------------------
   * THE DOOR CONVERSATION
   * ---------------------------------------------------------- */
  Door.prototype.submit = function () {
    var self = this;
    if (this.pending || !this.inputEl) { return; }
    var text = String(this.inputEl.value || '').trim();
    if (!text) { return; }
    this.pending = true;
    this.inputEl.disabled = true;
    if (this.goBtn) {
      this.goBtn.disabled = true;
      this.goBtn.textContent = COPY.thinking;
    }
    this.s.door.messages.push({ role: 'user', text: text });
    this.save();

    var history = this.s.door.messages.slice(0, -1).slice(-MAX_TURNS_SENT);
    this.callEngine({
      action: 'chat',
      session_id: this.s.door.session_id,
      screen: this.s.door.screen,
      state: this.s.door.state,
      messages: history,
      user_message: text
    }, function (resp) {
      self.pending = false;
      if (!resp || !resp.ok) {
        self.s.door.messages.pop();
        self.save();
        self.render();
        // Their words come back with them (never lose drafted work).
        if (self.inputEl) { self.inputEl.value = text; }
        self.note((resp && resp.error) || COPY.errorNote);
        return;
      }
      var message = resp.message || '';
      if (resp.state) { self.s.door.state = resp.state; }
      if (resp.screen) { self.s.door.screen = resp.screen; }
      if (message) { self.s.door.messages.push({ role: 'bot', text: message }); }

      // rate_limited and distress responses carry no recommendation and
      // arrive with their own message: both render as conversation.
      var door = (!resp.rate_limited && !resp.distress) ? doorOf(resp.state) : null;
      if (door) {
        self.s.rec = door;
        self.s.queue = (door.next || []).filter(function (id) { return !!ROSTER[id]; });
        self.s.phase = 'ready';
      } else {
        self.s.phase = 'talk';
      }
      self.save();
      self.render();
    });
  };

  // The door contract, defensively read. Unknown ids = no recommendation
  // (the reply renders as conversation and the student just keeps talking).
  function doorOf(state) {
    if (!state || typeof state !== 'object') { return null; }
    var d = state.door;
    if (!d || typeof d !== 'object') { return null; }
    var tool = String(d.tool || '');
    if (tool !== FREEDOM_ID && !ROSTER[tool]) { return null; }
    var next = [];
    if (Object.prototype.toString.call(d.next) === '[object Array]') {
      for (var i = 0; i < d.next.length && next.length < 3; i++) {
        var id = String(d.next[i] || '');
        if (ROSTER[id] && id !== tool) { next.push(id); }
      }
    }
    return { tool: tool, why: String(d.why || ''), next: next };
  }

  /* ----------------------------------------------------------
   * MOUNTING A TOOL — the handoff (student's own words ride along).
   * ---------------------------------------------------------- */
  Door.prototype.mountTool = function (bot, fresh) {
    var self = this;
    this.unmountTool();
    if (fresh) {
      var n = (this.s.counters[bot] || 0) + 1;
      this.s.counters[bot] = n;
      this.s.mount = { bot: bot, key: 'tk-' + bot + '-' + n };
    }
    this.s.phase = 'mounted';
    this.save();
    this.container.innerHTML = '';
    var wrap = div('tkh');
    var head = div('tkh-head');
    head.textContent = this.cfg.title;
    wrap.appendChild(head);

    var lead = div('tkh-mount-h');
    lead.textContent = COPY.mountedHeading.replace('{tool}', this.toolName(bot));
    wrap.appendChild(lead);

    // The student's own words, verbatim, as the tool's first message.
    // Only a FRESH mount injects; a resumed session never re-sends
    // (the widget enforces that too, belt and braces).
    var firstId = '';
    if (fresh) {
      var words = [];
      var msgs = this.s.door.messages;
      for (var i = 0; i < msgs.length; i++) {
        if (msgs[i].role === 'user') { words.push(msgs[i].text); }
      }
      if (words.length) {
        firstId = 'tk-first-' + this.s.mount.key;
        var carrier = document.createElement('script');
        carrier.type = 'text/markdown';
        carrier.id = firstId;
        carrier.textContent = words.join('\n');
        wrap.appendChild(carrier);
      }
    }

    var mountEl = div('tkh-tool');
    mountEl.setAttribute('data-bot-id', bot);
    mountEl.setAttribute('data-engine', this.cfg.engine);
    mountEl.setAttribute('data-key', this.cfg.key);
    mountEl.setAttribute('data-session-key', this.s.mount.key);
    mountEl.setAttribute('data-height', '560');
    if (this.cfg.draft) { mountEl.setAttribute('data-draft', '1'); }
    if (firstId) { mountEl.setAttribute('data-first-message-from', firstId); }
    wrap.appendChild(mountEl);

    var done = document.createElement('button');
    done.className = 'tkh-quiet';
    done.type = 'button';
    done.textContent = COPY.doneLink;
    done.onclick = function () { self.finishTool(); };
    wrap.appendChild(done);

    this.renderWins(wrap);
    this.container.appendChild(wrap);
    this.mountedEl = mountEl;

    whenWidgetReady(function (ok) {
      if (ok) { window.AgtWidget.mount(mountEl); }
      else { self.note(COPY.errorNote); }
    });
  };

  Door.prototype.unmountTool = function () {
    if (this.mountedEl && window.AgtWidget && window.AgtWidget.unmount) {
      try { window.AgtWidget.unmount(this.mountedEl); } catch (e) {}
    }
    this.mountedEl = null;
  };

  Door.prototype.finishTool = function () {
    var mount = this.s.mount;
    this.unmountTool();
    if (mount) {
      this.s.wins.push({ bot: mount.bot, name: this.toolName(mount.bot), date: dateChip() });
    }
    this.s.mount = null;
    this.s.phase = 'next';
    this.save();
    this.render();
  };

  Door.prototype.note = function (text) {
    var n = div('tkh-note');
    n.textContent = text;
    this.container.appendChild(n);
  };

  /* ----------------------------------------------------------
   * ENGINE TRANSPORT — same bounce-and-retry contract as the widget
   * (GAS intermittently replays a POST as GET and answers with doGet's
   * ping; both cases are transient, retry up to 2 times).
   * ---------------------------------------------------------- */
  Door.prototype.callEngine = function (payload, cb) {
    payload.app_key = this.cfg.key;
    payload.bot_id = ROUTER_BOT;
    if (this.cfg.draft) { payload.draft = true; }
    var engine = this.cfg.engine;
    var body = JSON.stringify(payload);
    var attempt = 0;
    function bounced(resp) {
      return !resp || (resp.ok === true && resp.service === 'ai_tools');
    }
    function go() {
      attempt++;
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
   * SMALL HELPERS
   * ---------------------------------------------------------- */
  // bots-meta.json from the folder this script was served from (same
  // pattern + timeout as the widget). file:// or a slow host = fallback.
  function fetchNames(cb) {
    var base = SCRIPT_SRC.split('?')[0];
    if (base.indexOf('http') !== 0 || typeof fetch !== 'function') { cb({}); return; }
    var done = false;
    setTimeout(function () { if (!done) { done = true; cb({}); } }, 1500);
    fetch(base.slice(0, base.lastIndexOf('/') + 1) + 'bots-meta.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (v) { if (!done) { done = true; cb((v && typeof v === 'object') ? v : {}); } },
            function () { if (!done) { done = true; cb({}); } });
  }

  function whenWidgetReady(cb) {
    if (window.AgtWidget && window.AgtWidget.mount) { cb(true); return; }
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      if (window.AgtWidget && window.AgtWidget.mount) {
        window.clearInterval(timer);
        cb(true);
      } else if (tries > 20) {
        window.clearInterval(timer);
        cb(false);
      }
    }, 250);
  }

  // Talk bubbles reuse the widget's markdown dialect at the strength the
  // router actually emits: bold, italic, >> gaps, plain lines. Escaped first.
  function mdLite(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t) { continue; }
      if (t === '>>') { out.push('<div class="tkh-gap"></div>'); continue; }
      var esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                 .replace(/"/g, '&quot;')
                 .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                 .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      out.push('<p>' + esc + '</p>');
    }
    return out.join('');
  }

  function dateChip() {
    var d = new Date();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function div(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  /* ----------------------------------------------------------
   * STYLES — light card so the mounted tool (dark) reads as its own
   * surface. Rule 18 hues: indigo do, teal talk, gold payoff, gray
   * optional. Never reassign a meaning.
   * ---------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('tkh-styles')) { return; }
    var css = ''
      + '.tkh{max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'
      + '"Segoe UI",Roboto,sans-serif;color:#1d2733;text-align:left;line-height:1.5;}'
      + '.tkh-head{font-size:22px;font-weight:700;margin:4px 0 12px;display:flex;align-items:center;gap:8px;}'
      + '.tkh-badge{background:#e6a700;color:#111;font-size:11px;font-weight:700;padding:2px 7px;border-radius:9px;}'
      + '.tkh-card{background:#fff;border:1px solid #e3e9f2;border-radius:14px;padding:18px;'
      + 'box-shadow:0 2px 10px rgba(29,39,51,.06);margin-bottom:14px;}'
      + '.tkh-q{font-size:18px;font-weight:600;margin-bottom:6px;}'
      + '.tkh-hint{color:#5b6a7c;margin-bottom:10px;}'
      + '.tkh-muted{color:#8a97a6;font-size:13.5px;margin-top:10px;}'
      + '.tkh-input{width:100%;box-sizing:border-box;border:1px solid #ccd6e4;border-radius:10px;'
      + 'padding:11px 12px;font:inherit;color:inherit;outline:none;resize:vertical;min-height:56px;'
      + 'background:#fbfcfe;}'
      + '.tkh-input:focus{border-color:#4f46e5;}'
      + '.tkh-btn{display:inline-block;margin-top:10px;border:none;border-radius:10px;'
      + 'padding:12px 18px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;}'
      + '.tkh-do{background:#4f46e5;color:#fff;}'
      + '.tkh-do:disabled{opacity:.6;cursor:default;}'
      + '.tkh-talk{background:#f0faf8;border-left:3px solid #0f766e;border-radius:10px;'
      + 'padding:12px 14px;margin-bottom:10px;color:#173d38;}'
      + '.tkh-talk p{margin:0 0 6px;}.tkh-talk p:last-child{margin-bottom:0;}'
      + '.tkh-gap{height:8px;}'
      + '.tkh-quiet{display:block;background:none;border:none;color:#7a8797;font:inherit;'
      + 'font-size:13.5px;cursor:pointer;padding:8px 0 0;text-align:left;text-decoration:underline;}'
      + '.tkh-mount-h{font-size:16px;font-weight:600;margin:2px 0 8px;}'
      + '.tkh-tool{margin:0 0 4px;}'
      + '.tkh-wins{margin-top:16px;border-top:1px solid #eef2f7;padding-top:12px;}'
      + '.tkh-wins-h{font-size:14px;font-weight:700;color:#8a6d00;margin-bottom:8px;}'
      + '.tkh-win{margin:5px 0;color:#4a5665;font-size:14px;}'
      + '.tkh-win-chip{display:inline-block;background:#fff7e0;color:#8a6d00;border:1px solid #e8d49a;'
      + 'border-radius:8px;font-size:12px;padding:1px 7px;margin-right:6px;}'
      + '.tkh-gold-note{background:#fffdf5;border:1px solid #e8d49a;color:#8a6d00;border-radius:10px;'
      + 'padding:10px 12px;margin-bottom:10px;font-size:14px;}'
      + '.tkh-note{margin:10px auto;max-width:720px;color:#7a8797;font-size:13px;text-align:center;'
      + 'background:#f4f7fb;border-radius:10px;padding:8px 12px;font-family:-apple-system,sans-serif;}';
    var style = document.createElement('style');
    style.id = 'tkh-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.ToolkitHome = {
    version: VERSION,
    reset: function () {
      try {
        localStorage.removeItem(LS_PREFIX);
        localStorage.removeItem(LS_PREFIX + '.draft');
      } catch (e) {}
      window.location.reload();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
