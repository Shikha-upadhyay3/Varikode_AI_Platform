(function () {
  var script = document.currentScript;
  var botKey = script.getAttribute("data-bot-key");
  var API = script.getAttribute("data-api");
  var titleAttr = script.getAttribute("data-title");
  var colorAttr = script.getAttribute("data-color");
  if (!botKey || !API) { console.error("Chatbot: data-bot-key and data-api are required"); return; }

  var STORE = "chatbot_" + botKey;
  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) {}
  if (!state.visitorId) state.visitorId = crypto.randomUUID();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
  save();

  // LOADING: pehle config. Published nahi / domain allowed nahi => widget dikhao hi mat
  async function loadConfig() {
    try {
      var res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: botKey, action: "config" }),
      });
      if (res.status === 403 || res.status === 404) return null;
      if (res.ok) return await res.json();
    } catch (e) {}
    return {};
  }

  loadConfig().then(function (cfg) {
    if (cfg === null) { console.warn("Chatbot: not published, or this website is not allowed."); return; }
    mount(cfg);
  });

  function mount(cfg) {
    var title = titleAttr || cfg.name || "Chat with us";
    var color = colorAttr || (/^#[0-9a-f]{6}$/i.test(cfg.theme || "") ? cfg.theme : "#1e90ff");
    var welcome = cfg.welcomeMessage || "Hi! How can I help you today?";

        var host = document.createElement("div");
    host.style.setProperty("all", "initial", "important");
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:0;background:' + color + ';color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:2147483647}' +
      '.box{position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;z-index:2147483647}' +
      '.box.open{display:flex}' +
      '.head{background:' + color + ';color:#fff;padding:12px 16px;font-weight:600}' +
      '.msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}' +
      '.m{max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
      '.u{align-self:flex-end;background:' + color + ';color:#fff}' +
      '.a{align-self:flex-start;background:#e2e8f0;color:#0f172a}' +
      '.e{align-self:stretch;max-width:100%;background:#fee2e2;color:#991b1b;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.e button{border:1px solid #991b1b;background:#fff;color:#991b1b;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px}' +
      '.dot{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#64748b;animation:b 1.2s infinite}' +
      '.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes b{0%,80%,100%{opacity:.2}40%{opacity:1}}' +
      '.row{display:flex;border-top:1px solid #e2e8f0}' +
      'input{flex:1;border:0;padding:12px;font-size:14px;outline:none}' +
      'button.send{border:0;background:transparent;color:' + color + ';font-weight:600;padding:0 16px;cursor:pointer}' +
      'button.send:disabled{opacity:.4;cursor:default}' +
      '</style>' +
      '<button class="btn" aria-label="Open chat">💬</button>' +
      '<div class="box" role="dialog" aria-label="Chat"><div class="head"></div><div class="msgs" aria-live="polite"></div>' +
      '<div class="row"><input placeholder="Type a message..." maxlength="2000" aria-label="Message"/><button class="send">Send</button></div></div>';

    var btn = root.querySelector(".btn");
    var box = root.querySelector(".box");
    var msgs = root.querySelector(".msgs");
    var input = root.querySelector("input");
    var sendBtn = root.querySelector(".send");
    root.querySelector(".head").textContent = title;

    function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
    function add(text, cls) {
      var d = document.createElement("div");
      d.className = "m " + cls;
      d.textContent = text; // textContent: XSS se safe
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
    btn.onclick = function () {
      box.classList.toggle("open");
      if (box.classList.contains("open")) input.focus();
    };

    var busy = false;
    async function send(text, isRetry) {
      if (!text || busy) return;
      busy = true; sendBtn.disabled = true;
      if (!isRetry) add(text, "u");

      var bot = add("", "a");
      bot.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      var got = false;
      var finished = false;

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
          if (res.status === 404 && state.conversationId) { state.conversationId = undefined; save(); }
          throw new Error((data && data.error && data.error.message) || "Something went wrong.");
        }

        // STREAMING: SSE events
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split("\n\n");
          buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var line = parts[i].trim();
            if (line.indexOf("data:") !== 0) continue;
            var evt;
            try { evt = JSON.parse(line.slice(5)); } catch (e) { continue; }
            if (evt.type === "delta") {
              if (!got) { bot.textContent = ""; got = true; }
              bot.textContent += evt.text;
              scrollDown();
            } else if (evt.type === "done") {
              state.conversationId = evt.conversationId; save();
              finished = true;
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            }
          }
        }
        if (!finished) throw new Error("The connection was interrupted. Please try again.");
      } catch (e) {
        bot.remove(); // adhoora jawab hata do (server ne save bhi nahi kiya)
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