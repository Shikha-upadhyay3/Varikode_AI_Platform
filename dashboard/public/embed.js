(function () {
  // ---------------------------------------------------------------------------
  // 1. FIND OUR OWN <script> TAG
  // ---------------------------------------------------------------------------
  // document.currentScript is NULL when the script is loaded with "defer",
  // injected dynamically, or re-loaded by platforms like Shopify.
  // So we use it first, and fall back to searching the DOM for the tag
  // that has a data-bot-key attribute.
  var script = document.currentScript;
  if (!script || !script.getAttribute("data-bot-key")) {
    var candidates = document.querySelectorAll('script[src*="embed.js"][data-bot-key]');
    script = candidates[candidates.length - 1];
  }
  if (!script) {
    console.error("Chatbot: embed script tag with data-bot-key was not found");
    return;
  }

  var botKey = script.getAttribute("data-bot-key");
  var API = script.getAttribute("data-api");
  var titleAttr = script.getAttribute("data-title");
  var colorAttr = script.getAttribute("data-color");
  if (colorAttr && !/^#[0-9a-f]{3,8}$/i.test(colorAttr)) colorAttr = null;
  if (!botKey || !API) {
    console.error("Chatbot: data-bot-key and data-api are required");
    return;
  }

  var THEMES = { ocean: "#1e90ff", slate: "#475569", mint: "#14b8a6", violet: "#7c3aed" };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  // ---------------------------------------------------------------------------
  // 2. LOCAL STATE (visitor id, conversation id, lead status)
  // ---------------------------------------------------------------------------
  // localStorage can be blocked (sandboxed iframes, privacy modes), so every
  // access is wrapped in try/catch and the widget still works in memory.
  var STORE = "chatbot_" + botKey;
  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) {}
  if (!state.visitorId) state.visitorId = uuid();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
  save();

  // ---------------------------------------------------------------------------
  // 3. LOAD CONFIG FIRST
  // ---------------------------------------------------------------------------
  // If the bot is not published or this website is not allowed, the server
  // answers 403/404 and we do not show the widget at all.
  async function loadConfig() {
    try {
      var res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: botKey, action: "config" }),
      });
      if (res.status === 403 || res.status === 404) {
        console.warn("Chatbot: hidden (config returned " + res.status + ")");
        return null;
      }
      if (res.ok) return await res.json();
    } catch (e) {}
    return {};
  }

  // Wait until document.body exists before mounting the widget
  function whenBodyReady(fn) {
    if (document.body) { fn(); return; }
    document.addEventListener("DOMContentLoaded", fn);
  }

  loadConfig().then(function (cfg) {
    if (cfg === null) {
      console.warn("Chatbot: not published, or this website is not allowed.");
      return;
    }
    whenBodyReady(function () { mount(cfg); });
  });

  // ---------------------------------------------------------------------------
  // 4. BUILD THE WIDGET
  // ---------------------------------------------------------------------------
  function mount(cfg) {
    var title = titleAttr || cfg.name || "Chat with us";
    var color = colorAttr || THEMES[cfg.theme] || (/^#[0-9a-f]{6}$/i.test(cfg.theme || "") ? cfg.theme : "#1e90ff");
    var welcome = cfg.welcomeMessage || "Hi! How can I help you today?";
    var logoUrl = typeof cfg.logoUrl === "string" && /^https:\/\//i.test(cfg.logoUrl) ? cfg.logoUrl : "";
    var askLead = cfg.collectLeads === true && !state.leadDone;

    // Shadow DOM keeps the host website's CSS from affecting the widget (and vice versa)
    var host = document.createElement("div");
    host.style.setProperty("all", "initial", "important");
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:0;padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:' + color + ';color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:2147483647}' +
      '.btn img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.box{position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;z-index:2147483647}' +
      '.box.open{display:flex}' +
      '.head{background:' + color + ';color:#fff;padding:12px 16px;font-weight:600;display:flex;align-items:center;gap:10px}' +
      '.head img{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#fff;flex:0 0 auto}' +
      '.msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}' +
      '.m{max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
      '.u{align-self:flex-end;background:' + color + ';color:#fff}' +
      '.a{align-self:flex-start;background:#e2e8f0;color:#0f172a}' +
      '.agent{border-left:3px solid ' + color + '}' +
      '.btn.alert::after{content:"";position:absolute;top:6px;right:6px;width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff}' +
      '.e{align-self:stretch;max-width:100%;background:#fee2e2;color:#991b1b;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.e button{border:1px solid #991b1b;background:#fff;color:#991b1b;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}' +
      '.dot{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#64748b;animation:b 1.2s infinite}' +
      '.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes b{0%,80%,100%{opacity:.2}40%{opacity:1}}' +
      '.row{display:flex;border-top:1px solid #e2e8f0}' +
      '.row input{flex:1;border:0;padding:12px;font-size:14px;outline:none}' +
      'button.send{border:0;background:transparent;color:' + color + ';font-weight:600;padding:0 16px;cursor:pointer}' +
      'button.send:disabled{opacity:.4;cursor:default}' +
      '.lead{display:none;flex:1;flex-direction:column;gap:10px;padding:16px;overflow-y:auto;background:#f8fafc}' +
      '.box.leadmode .lead{display:flex}' +
      '.box.leadmode .msgs,.box.leadmode .row{display:none}' +
      '.lead h3{margin:0;font-size:15px;color:#0f172a}' +
      '.lead p{margin:0;font-size:12px;color:#475569;line-height:1.5}' +
      '.lead label{font-size:12px;color:#334155;display:flex;flex-direction:column;gap:4px}' +
      '.lead input{border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-size:14px;outline:none;background:#fff;color:#0f172a}' +
      '.lead input:focus{border-color:' + color + '}' +
      '.lead .err{color:#b91c1c;font-size:12px;min-height:16px}' +
      '.lead .go{border:0;border-radius:8px;padding:10px;background:' + color + ';color:#fff;font-weight:600;font-size:14px;cursor:pointer}' +
      '.lead .go:disabled{opacity:.6;cursor:default}' +
      '</style>' +
      '<button class="btn" aria-label="Open chat">💬</button>' +
      '<div class="box" role="dialog" aria-label="Chat">' +
        '<div class="head"></div>' +
        '<div class="lead">' +
          '<h3>Before we start</h3>' +
          '<p>Please share your name and email so the team can follow up with you. Phone number is optional.</p>' +
          '<label>Name *<input class="ln" maxlength="80" autocomplete="name"/></label>' +
          '<label>Email *<input class="le" type="email" maxlength="254" autocomplete="email"/></label>' +
          '<label>Phone (optional)<input class="lp" type="tel" maxlength="20" autocomplete="tel"/></label>' +
          '<div class="err" role="alert"></div>' +
          '<button class="go">Start chat</button>' +
        '</div>' +
        '<div class="msgs" aria-live="polite"></div>' +
        '<div class="row"><input class="mi" placeholder="Type a message..." maxlength="2000" aria-label="Message"/><button class="send">Send</button></div>' +
      '</div>';

    var btn = root.querySelector(".btn");
    var box = root.querySelector(".box");
    var head = root.querySelector(".head");
    var msgs = root.querySelector(".msgs");
    var input = root.querySelector(".mi");
    var sendBtn = root.querySelector(".send");
    var ln = root.querySelector(".ln");
    var le = root.querySelector(".le");
    var lp = root.querySelector(".lp");
    var lerr = root.querySelector(".err");
    var goBtn = root.querySelector(".go");

    // Logo on the chat button and in the header.
    // If the image fails to load, we keep the default icon / title only.
    if (logoUrl) {
      var bi = new Image();
      bi.alt = "";
      bi.onload = function () { btn.textContent = ""; btn.appendChild(bi); };
      bi.src = logoUrl;

      var hi = new Image();
      hi.alt = "";
      hi.onload = function () { head.insertBefore(hi, head.firstChild); };
      hi.src = logoUrl;
    }
    var ttl = document.createElement("span");
    ttl.textContent = title; // textContent is XSS-safe
    head.appendChild(ttl);

    function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
    function add(text, cls) {
      var d = document.createElement("div");
      d.className = "m " + cls;
      d.textContent = text; // textContent is XSS-safe
      msgs.appendChild(d);
      scrollDown();
      return d;
    }
    function showError(message, retryText) {
      var d = document.createElement("div");
      d.className = "m e";
      var span = document.createElement("span");
      span.textContent = message;
      var b = document.createElement("button");
      b.textContent = "Retry";
      b.onclick = function () { d.remove(); send(retryText, true); };
      d.appendChild(span);
      d.appendChild(b);
      msgs.appendChild(d);
      scrollDown();
    }

    add(welcome, "a");

    // -------------------------------------------------------------------------
    // HISTORY + TEAM REPLIES
    // -------------------------------------------------------------------------
    // "seen" holds the ids of messages that were already handled, so nothing is
    // shown twice. Messages typed in this widget are not rendered from the
    // server list; only replies sent by the team from the dashboard are.
    var seen = {};

    async function fetchMessages() {
      if (!state.conversationId) return null;
      try {
        var res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: botKey,
            action: "messages",
            visitorId: state.visitorId,
            conversationId: state.conversationId,
          }),
        });
        if (res.status === 404) { state.conversationId = undefined; save(); return null; }
        if (!res.ok) return null;
        var data = await res.json();
        return data.messages || [];
      } catch (e) {
        return null;
      }
    }

    // On page load: show the earlier conversation of this visitor
    async function restoreHistory() {
      var list = await fetchMessages();
      if (!list || !list.length) return;
      list.forEach(function (m) {
        seen[m.id] = true;
        add(m.content, m.role === "user" ? "u" : m.agent ? "a agent" : "a");
      });
    }

    // Every few seconds: look for new replies from the team
    async function pollTeamReplies() {
      if (busy || document.hidden || !state.conversationId) return;
      var list = await fetchMessages();
      if (!list) return;
      list.forEach(function (m) {
        if (seen[m.id]) return;
        seen[m.id] = true;
        if (m.agent) {
          add(m.content, "a agent");
          if (!box.classList.contains("open")) btn.classList.add("alert");
        }
      });
    }

    restoreHistory();
    setInterval(pollTeamReplies, 4000);

    // -------------------------------------------------------------------------
    // 5. VISITOR DETAILS (LEAD FORM)
    // -------------------------------------------------------------------------
    // Name and email are required, phone is optional.
    // Shown once, before the chat starts.
    if (askLead) box.classList.add("leadmode");

    function finishLead() {
      state.leadDone = true; save();
      box.classList.remove("leadmode");
      input.focus();
    }

    async function submitLead() {
      var name = ln.value.trim();
      var email = le.value.trim();
      var phone = lp.value.trim();

      if (!name) { lerr.textContent = "Please enter your name."; ln.focus(); return; }
      if (!email) { lerr.textContent = "Please enter your email address."; le.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        lerr.textContent = "Please enter a valid email address.";
        le.focus();
        return;
      }
      if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) {
        lerr.textContent = "Please enter a valid phone number.";
        lp.focus();
        return;
      }
      lerr.textContent = "";

      goBtn.disabled = true;
      try {
        var res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: botKey,
            action: "lead",
            visitorId: state.visitorId,
            lead: { name: name, email: email, phone: phone },
          }),
        });
        if (!res.ok) {
          var data = await res.json().catch(function () { return null; });
          lerr.textContent = (data && data.error && data.error.message) || "Could not save your details. Please try again.";
          goBtn.disabled = false;
          return;
        }
      } catch (e) {
        lerr.textContent = "Network error. Check your connection and try again.";
        goBtn.disabled = false;
        return;
      }
      goBtn.disabled = false;
      finishLead();
    }

    goBtn.onclick = submitLead;
    [ln, le, lp].forEach(function (el) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") submitLead(); });
    });

    btn.onclick = function () {
      box.classList.toggle("open");
      btn.classList.remove("alert");
      if (box.classList.contains("open")) {
        if (box.classList.contains("leadmode")) ln.focus(); else input.focus();
      }
    };

    // -------------------------------------------------------------------------
    // 6. SENDING MESSAGES (STREAMING RESPONSE)
    // -------------------------------------------------------------------------
    var busy = false;
    async function send(text, isRetry) {
      if (!text || busy) return;
      busy = true; sendBtn.disabled = true;
      if (!isRetry) add(text, "u");

      var bot = add("", "a");
      bot.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      var got = false;
      var finished = false;
      var handoff = false;

      // Handles one SSE event ("data: {...}")
      function handle(part) {
        var line = part.trim();
        if (line.indexOf("data:") !== 0) return;
        var evt;
        try { evt = JSON.parse(line.slice(5)); } catch (e) { return; }
        if (evt.type === "delta") {
          if (!got) { bot.textContent = ""; got = true; }
          bot.textContent += evt.text;
          scrollDown();
        } else if (evt.type === "done") {
          state.conversationId = evt.conversationId; save();
          if (evt.handoff) handoff = true;
          finished = true;
        } else if (evt.type === "error") {
          throw new Error(evt.message);
        }
      }

      try {
        var res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: botKey,
            visitorId: state.visitorId,
            conversationId: state.conversationId,
            message: text,
          }),
        });

        if (!res.ok) {
          var data = await res.json().catch(function () { return null; });
          // Conversation no longer exists on the server: start a fresh one next time
          if (res.status === 404 && state.conversationId) { state.conversationId = undefined; save(); }
          throw new Error((data && data.error && data.error.message) || "Something went wrong.");
        }

        // Read the SSE stream chunk by chunk
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split("\n\n");
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) handle(parts[i]);
        }
        if (buf.trim()) handle(buf); 
        if (handoff && !got) bot.remove(); 
        if (!finished) throw new Error("The connection was interrupted. Please try again.");
      } catch (e) {
        bot.remove(); // remove the partial answer (the server did not save it either)
        var msg = e instanceof TypeError ? "Network error. Check your connection and try again." : e.message;
        showError(msg, text);
      }

      busy = false; sendBtn.disabled = false; input.focus();
    }

    function submit() {
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      send(text, false);
    }
    sendBtn.onclick = submit;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }
})();