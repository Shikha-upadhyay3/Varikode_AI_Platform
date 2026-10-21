(function () {
  var script = document.currentScript;
  var botKey = script.getAttribute("data-bot-key");
  var API = script.getAttribute("data-api");
  var title = script.getAttribute("data-title") || "Chat with us";
  if (!botKey || !API) { console.error("Chatbot: data-bot-key and data-api are required"); return; }

  var STORE = "chatbot_" + botKey;
  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) {}
  if (!state.visitorId) state.visitorId = crypto.randomUUID();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }
  save();

  var host = document.createElement("div");
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" }); // website ki CSS widget ko kharab nahi karegi

  root.innerHTML =
    '<style>' +
    '.btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#1e90ff,#14b8a6);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:2147483647}' +
    '.box{position:fixed;bottom:90px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;z-index:2147483647}' +
    '.box.open{display:flex}' +
    '.head{background:linear-gradient(135deg,#1e90ff,#14b8a6);color:#fff;padding:12px 16px;font-weight:600}' +
    '.msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}' +
    '.m{max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
    '.u{align-self:flex-end;background:#1e90ff;color:#fff}' +
    '.a{align-self:flex-start;background:#e2e8f0;color:#0f172a}' +
    '.e{align-self:center;background:#fee2e2;color:#991b1b;font-size:13px}' +
    '.row{display:flex;border-top:1px solid #e2e8f0}' +
    'input{flex:1;border:0;padding:12px;font-size:14px;outline:none}' +
    'button.send{border:0;background:transparent;color:#1e90ff;font-weight:600;padding:0 16px;cursor:pointer}' +
    '</style>' +
    '<button class="btn" aria-label="Open chat">💬</button>' +
    '<div class="box"><div class="head"></div><div class="msgs"></div>' +
    '<div class="row"><input placeholder="Type a message..." maxlength="2000"/><button class="send">Send</button></div></div>';

  var btn = root.querySelector(".btn");
  var box = root.querySelector(".box");
  var msgs = root.querySelector(".msgs");
  var input = root.querySelector("input");
  var sendBtn = root.querySelector(".send");
  root.querySelector(".head").textContent = title;

  function add(text, cls) {
    var d = document.createElement("div");
    d.className = "m " + cls;
    d.textContent = text; // textContent: XSS se safe
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  add("Hi! How can I help you today?", "a");
  btn.onclick = function () {
    box.classList.toggle("open");
    if (box.classList.contains("open")) input.focus();
  };

  var busy = false;
  async function send() {
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true; input.value = ""; sendBtn.disabled = true;
    add(text, "u");
    var typing = add("...", "a");
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
      var data = await res.json();
      typing.remove();
      if (!res.ok) {
        if (res.status === 404) { state.conversationId = undefined; save(); }
        add((data.error && data.error.message) || "Something went wrong.", "e");
      } else {
        state.conversationId = data.conversationId; save();
        add(data.reply, "a");
      }
    } catch (e) {
      typing.remove();
      add("Network error. Please try again.", "e");
    }
    busy = false; sendBtn.disabled = false; input.focus();
  }
  sendBtn.onclick = send;
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
})();