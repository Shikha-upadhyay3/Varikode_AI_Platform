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
  var subtitleAttr = script.getAttribute("data-subtitle");   // e.g. "Your AI Guide & Support"
  var statusAttr = script.getAttribute("data-status");       // e.g. "Online • Happy to help!"
  var quickAttr = script.getAttribute("data-quick-replies"); // e.g. "Shopify|WordPress|SEO"
  var voiceLangAttr = script.getAttribute("data-voice-lang"); // optional, e.g. "hi-IN" (default: visitor's browser language)
  if (colorAttr && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorAttr)) colorAttr = null;
  if (!botKey || !API) {
    console.error("Chatbot: data-bot-key and data-api are required");
    return;
  }

  // ---------------------------------------------------------------------------
  // COLOR HELPERS
  // ---------------------------------------------------------------------------
  var THEMES = { ocean: "#1e90ff", slate: "#475569", mint: "#14b8a6", violet: "#7c3aed" };

  function resolveColor(t) {
    if (t && Object.prototype.hasOwnProperty.call(THEMES, t)) return THEMES[t];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t || "")) return t;
    return "#1e90ff";
  }

  function expandHex(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    return h;
  }

  function lum(hex) {
    var h = expandHex(hex);
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // Light color par dark text, dark color par white text
  function textOn(hex) { return lum(hex) > 160 ? "#0f172a" : "#fff"; }

  // amt < 0 : darker (towards black), amt > 0 : lighter (towards white)
  function adjust(hex, amt) {
    var h = expandHex(hex);
    var out = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16);
      v = amt < 0 ? Math.round(v * (1 + amt)) : Math.round(v + (255 - v) * amt);
      return ("0" + v.toString(16)).slice(-2);
    });
    return "#" + out.join("");
  }

  function rgba(hex, a) {
    var h = expandHex(hex);
    return "rgba(" + parseInt(h.substr(0, 2), 16) + "," + parseInt(h.substr(2, 2), 16) + "," + parseInt(h.substr(4, 2), 16) + "," + a + ")";
  }

  function parseQuick(s) {
    return (s || "").split("|").map(function (x) { return x.trim(); })
      .filter(Boolean).slice(0, 6).map(function (x) { return x.slice(0, 40); });
  }

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
  // ICONS (inline SVG, static strings only)
  // ---------------------------------------------------------------------------
  var SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5-5.6.9-9.6 4.9-10.5 10.5-.9-5.6-4.9-9.6-10.5-10.5C7.1 11.1 11.1 7.1 12 1.5z"/></svg>';
  var ICON_USER = SVG_OPEN + '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  var ICON_SEND = SVG_OPEN + '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
  var ICON_ARROW = SVG_OPEN + '<path d="M7 17 17 7M8 7h9v9"/></svg>';
  var P = {
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    like: '<path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1 6.5A2 2 0 0 1 17.5 20H7"/>',
    spk: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
    re: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    reset: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    clip: '<path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5-6.5a3 3 0 0 0-6-6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5-6.5"/>',
    wave: '<path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2"/>'
  };
  function ico(k) { return SVG_OPEN + P[k] + "</svg>"; }

  // ---------------------------------------------------------------------------
  // 4. BUILD THE WIDGET
  // ---------------------------------------------------------------------------
  function mount(cfg) {
    var title = titleAttr || cfg.name || "Chat with us";
    var subtitle = subtitleAttr || "Your AI Guide & Support";
    var statusText = statusAttr || "Online \u2022 Happy to help!";

    // Everything below is derived from the ONE brand color chosen in the dashboard
    var color = colorAttr || resolveColor(cfg.theme);
    var fg = textOn(color);
    var accent = lum(color) < 110 ? adjust(color, 0.5) : color; // readable on dark surfaces
    var grad = "linear-gradient(135deg," + adjust(color, 0.1) + "," + color + " 55%," + adjust(color, -0.14) + ")";
    var glow = rgba(accent, 0.45);

    var welcome = cfg.welcomeMessage || "Hi! How can I help you today?";
    var logoUrl = typeof cfg.logoUrl === "string" && /^https:\/\//i.test(cfg.logoUrl) ? cfg.logoUrl : "";
    var askLead = cfg.collectLeads === true && !state.leadDone;

    var quick = parseQuick(quickAttr);
    if (!quick.length && Array.isArray(cfg.quickReplies)) {
      quick = cfg.quickReplies
        .filter(function (x) { return typeof x === "string" && x.trim(); })
        .slice(0, 6)
        .map(function (x) { return x.trim().slice(0, 40); });
    }

    // Shown to visitors when the website owner has used up the monthly AI replies.
    // The visitor cannot fix this, so it is a plain notice with no Retry button.
    var CREDITS_TEXT = "This assistant has reached its message limit for now. Please contact the website owner.";

    // Shadow DOM keeps the host website's CSS from affecting the widget (and vice versa)
    var host = document.createElement("div");
    host.style.setProperty("all", "initial", "important");
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    var css =
      ':host{all:initial}' +
      '*{box-sizing:border-box}' +
      'button{font-family:inherit}' +
      '.ib{width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#d8d3e6;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:0 0 auto;transition:background .2s}' +
      '.ib:hover{background:rgba(255,255,255,.12)}' +
      '.ib svg{width:20px;height:20px}' +
      '.ib:focus-visible,.chip:focus-visible,.btn:focus-visible,.vm:focus-visible,button.send:focus-visible,.go:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}' +

      /* launcher button (gradient ring + logo) */
      '.btn{position:fixed;bottom:20px;right:20px;width:64px;height:64px;border-radius:50%;border:0;padding:3px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:' + grad + ';color:' + accent + ';cursor:pointer;box-shadow:0 8px 28px ' + glow + ';z-index:2147483647;transition:transform .15s}' +
      '.btn::before{content:"";position:absolute;inset:3px;border-radius:50%;background:#0b0b10}' +
      '.btn:hover{transform:scale(1.07)}' +
      '.btn svg{position:relative;width:30px;height:30px}' +
      '.btn img{position:relative;width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}' +
      '.btn.alert::after{content:"";position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:#ef4444;border:2px solid #0b0b10}' +

      /* chat window */
      '.box{position:fixed;bottom:96px;right:20px;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 116px);background:radial-gradient(ellipse 120% 38% at 30% -4%,' + glow + ',transparent 72%),#08080c;color:#f1f0f7;border:1px solid #2a2a36;border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 50px ' + rgba(accent, 0.18) + ';display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;z-index:2147483647}' +
      '.box.open{display:flex;animation:pop .22s ease}' +
      '@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}' +

      /* header */
      '.head{color:#fff;padding:16px 14px 10px 16px;display:flex;align-items:center;gap:12px;flex:0 0 auto}' +
      '.hav{position:relative;width:44px;height:44px;flex:0 0 auto}' +
      '.hav .av{width:44px;height:44px;border:1px solid #33333f}' +
      '.hav .on{position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:#34d399;border:2px solid #0b0b10}' +
      '.ht{min-width:0;flex:1}' +
      '.tt{font-weight:600;font-size:16px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.st{font-size:12px;color:#c9c4d6;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +

      /* avatars */
      '.av{width:28px;height:28px;border-radius:50%;background:#0f0f16;color:' + accent + ';display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;box-shadow:0 1px 6px rgba(0,0,0,.4)}' +
      '.av img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.av svg{width:58%;height:58%}' +
      '.av.us{background:#23232d;color:#b9b4cc;box-shadow:none}' +

      /* messages */
      '.msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:14px}' +
      '.msgs::-webkit-scrollbar{width:5px}.msgs::-webkit-scrollbar-thumb{background:#3a3a48;border-radius:5px}' +
      '.r{display:flex;align-items:flex-end;gap:8px}' +
      '.r.u{flex-direction:row-reverse}' +
      '.col{display:flex;flex-direction:column;gap:3px;max-width:80%;min-width:0}' +
      '.r.u .col{align-items:flex-end}' +
      '.ts{font-size:10.5px;color:#6f6f86;padding:0 4px}' +
      '.m{padding:11px 15px;font-size:14px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}' +
      '.m a{color:inherit;text-decoration:underline;word-break:break-all}' +
      '.m.u{background:' + grad + ';color:' + fg + ';border-radius:20px 20px 5px 20px;box-shadow:0 6px 20px ' + rgba(accent, 0.3) + '}' +
      '.m.a{background:#1f1f27;color:#f1f0f7;border:1px solid #2c2c38;border-radius:20px 20px 20px 5px}' +
      '.m.a a{color:' + accent + '}' +
      '.m.agent{border-left:3px solid ' + accent + '}' +
      '.m.notice{background:rgba(251,191,36,.12);color:#fcd34d;border:1px solid rgba(252,211,77,.35)}' +
      '.m.e{align-self:stretch;background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(252,165,165,.3);font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-radius:14px}' +
      '.m.e button{border:1px solid #fca5a5;background:transparent;color:#fca5a5;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px}' +
      '.dot{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#8d8aa0;animation:b 1.2s infinite}' +
      '.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes b{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}' +

      /* message actions */
      '.act{display:flex;gap:2px;margin-top:2px}' +
      '.ab{width:28px;height:28px}.ab svg{width:16px;height:16px}' +
      '.ab.on{color:' + accent + '}' +
      '.ab.rg{margin-left:auto}' +

      /* quick reply cards */
      '.chips{display:none;gap:10px;overflow-x:auto;padding:6px 14px 12px;flex:0 0 auto;scrollbar-width:none}' +
      '.chips::-webkit-scrollbar{display:none}' +
      '.chips.show{display:flex}' +
      '.chip{flex:0 0 auto;width:122px;min-height:88px;border:1px solid #3a3a48;background:transparent;color:#f1f0f7;border-radius:20px;padding:12px;font-size:13px;font-weight:600;line-height:1.25;text-align:left;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;transition:border-color .2s,box-shadow .2s,transform .15s}' +
      '.chip:hover{border-color:' + accent + ';box-shadow:0 0 18px ' + rgba(accent, 0.3) + ';transform:translateY(-2px)}' +
      '.chip svg{width:18px;height:18px;align-self:flex-end}' +

      /* input row */
      '.inp{display:flex;align-items:center;gap:4px;margin:0 14px 10px;padding:5px 6px 5px 6px;border:1px solid #3a3a48;border-radius:30px;background:#0d0d13;flex:0 0 auto;transition:border-color .2s}' +
      '.inp:focus-within{border-color:' + accent + '}' +
      '.inp input{flex:1;min-width:0;border:0;background:transparent;padding:8px 0;font-size:14px;outline:none;font-family:inherit;color:#fff}' +
      '.inp input::placeholder{color:#8d8aa0}' +
      'button.send{display:none;width:38px;height:38px;border-radius:50%;border:0;background:' + grad + ';color:' + fg + ';align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto;padding:0;box-shadow:0 4px 12px ' + rgba(accent, 0.4) + '}' +
      'button.send svg{width:18px;height:18px}' +
      'button.send:disabled{opacity:.45;cursor:default}' +
      '.inp.has button.send{display:flex}' +
      '.inp.has .mic:not(.live),.inp.has .wv{display:none}' +
      '.mic.live{color:' + accent + ';background:' + rgba(accent, 0.18) + '}' +
      '.pend{display:none;align-items:center;gap:6px;margin:0 14px 8px;padding:4px 6px 4px 12px;border:1px solid #3a3a48;border-radius:14px;background:#0d0d13;font-size:12.5px;color:#f1f0f7;flex:0 0 auto}' +
      '.pend.show{display:flex}' +
      '.pend span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pend .ib{width:26px;height:26px}.pend .ib svg{width:15px;height:15px}' +
      '.foot{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11.5px;color:#8d8aa0;padding:0 0 12px;flex:0 0 auto}' +
      '.foot i{width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block}' +

      /* lead form */
      '.lead{display:none;flex:1;flex-direction:column;gap:10px;padding:18px;overflow-y:auto}' +
      '.box.leadmode .lead{display:flex}' +
      '.box.leadmode .msgs,.box.leadmode .chips,.box.leadmode .pend,.box.leadmode .inp,.box.leadmode .foot{display:none}' +
      '.lead h3{margin:0;font-size:17px;color:#fff}' +
      '.lead p{margin:0;font-size:12.5px;color:#a9a4bb;line-height:1.5}' +
      '.lead label{font-size:12px;color:#cbd5e1;display:flex;flex-direction:column;gap:4px}' +
      '.lead input{border:1px solid #3a3a48;border-radius:12px;padding:11px 13px;font-size:14px;outline:none;background:#0d0d13;color:#fff;font-family:inherit}' +
      '.lead input:focus{border-color:' + accent + '}' +
      '.lead .err{color:#fca5a5;font-size:12px;min-height:16px}' +
      '.lead .go{border:0;border-radius:12px;padding:12px;background:' + grad + ';color:' + fg + ';font-weight:600;font-size:14px;cursor:pointer}' +
      '.lead .go:disabled{opacity:.6;cursor:default}' +

      /* voice mode */
      '.vo{display:none;position:absolute;inset:0;z-index:5;flex-direction:column;align-items:center;background:radial-gradient(ellipse 100% 45% at 50% 0%,' + rgba(accent, 0.35) + ',transparent 70%),#050508}' +
      '.vo.open{display:flex;animation:pop .22s ease}' +
      '.vtt{margin-top:24px;font-weight:600;font-size:15px;color:#fff}' +
      '.orb{margin-top:18px;width:230px;height:230px}' +
      '.vt{margin:16px 24px 0;text-align:center;font-size:18px;font-weight:600;line-height:1.35;color:#fff;max-height:150px;overflow-y:auto}' +
      '.vs{margin-top:8px;font-size:12.5px;color:#a9a4bb;min-height:16px}' +
      '.vb{margin-top:auto;padding-bottom:28px;display:flex;align-items:center;gap:34px}' +
      '.vb .ib{width:44px;height:44px}' +
      '.vm{width:68px;height:68px;border-radius:50%;border:0;background:' + grad + ';color:' + fg + ';display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 30px ' + glow + '}' +
      '.vm svg{width:28px;height:28px}' +
      '.vm.live{animation:pl 1.4s infinite}' +
      '@keyframes pl{50%{box-shadow:0 0 0 14px ' + rgba(accent, 0.15) + ',0 0 40px ' + glow + '}}' +

      '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}' +
      /* phones */
      '@media (max-width:480px){.box{left:12px;right:12px;width:auto;max-width:none;bottom:92px;height:calc(100vh - 112px);max-height:none}.btn{right:14px;bottom:14px}}';

    root.innerHTML =
      '<style>' + css + '</style>' +
      '<button class="btn" aria-label="Open chat"></button>' +
      '<div class="box" role="dialog" aria-label="Chat">' +
        '<div class="head">' +
          '<div class="hav"><i class="on"></i></div>' +
          '<div class="ht"><div class="tt"></div><div class="st"></div></div>' +
          '<button class="nw ib" aria-label="New chat" title="New chat"></button>' +
          '<button class="x ib" aria-label="Close chat"></button>' +
        '</div>' +
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
        '<div class="chips"></div>' +
        '<div class="pend"></div>' +
        '<div class="inp"><button class="at ib" aria-label="Attach a text file" title="Attach a text file (.txt, .md, .csv, .json)"></button><input class="mi" placeholder="Send message..." maxlength="2000" aria-label="Message"/><button class="mic ib" aria-label="Speak to type" title="Speak to type"></button><button class="wv ib" aria-label="Voice conversation" title="Voice conversation"></button><button class="send" aria-label="Send"></button><input class="fi" type="file" hidden accept=".txt,.md,.csv,.json,.log,text/plain,text/csv,application/json"/></div>' +
        '<div class="foot"><i></i><span class="sx"></span></div>' +
        '<div class="vo">' +
          '<div class="vtt"></div>' +
          '<canvas class="orb" width="460" height="460"></canvas>' +
          '<div class="vt"></div><div class="vs" aria-live="polite"></div>' +
          '<div class="vb">' +
            '<button class="vr ib" aria-label="Clear"></button>' +
            '<button class="vm" aria-label="Start or stop listening"></button>' +
            '<button class="vx ib" aria-label="Close voice mode"></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var btn = root.querySelector(".btn");
    var box = root.querySelector(".box");
    var msgs = root.querySelector(".msgs");
    var chipsEl = root.querySelector(".chips");
    var inp = root.querySelector(".inp");
    var input = root.querySelector(".mi");
    var sendBtn = root.querySelector(".send");
    var micBtn = root.querySelector(".mic");
    var atBtn = root.querySelector(".at");
    var wvBtn = root.querySelector(".wv");
    var pend = root.querySelector(".pend");
    var fileIn = root.querySelector(".fi");
    var nwBtn = root.querySelector(".nw");
    var closeBtn = root.querySelector(".x");
    var ln = root.querySelector(".ln");
    var le = root.querySelector(".le");
    var lp = root.querySelector(".lp");
    var lerr = root.querySelector(".err");
    var goBtn = root.querySelector(".go");
    var vo = root.querySelector(".vo");
    var vt = root.querySelector(".vt");
    var vs = root.querySelector(".vs");
    var vm = root.querySelector(".vm");
    var orb = root.querySelector(".orb");

    // Static texts (textContent is XSS-safe)
    root.querySelector(".tt").textContent = title;
    root.querySelector(".st").textContent = subtitle;
    root.querySelector(".sx").textContent = statusText;
    root.querySelector(".vtt").textContent = title;
    sendBtn.innerHTML = ICON_SEND;
    btn.innerHTML = ICON_STAR;
    micBtn.innerHTML = ico("mic");
    atBtn.innerHTML = ico("clip");
    wvBtn.innerHTML = ico("wave");
    nwBtn.innerHTML = ico("plus");
    closeBtn.innerHTML = ico("x");
    vm.innerHTML = ico("mic");
    root.querySelector(".vr").innerHTML = ico("reset");
    root.querySelector(".vx").innerHTML = ico("x");

    // ---------------------------------------------------------------------
    // Avatars: bot logo if available, otherwise a default sparkle icon
    // ---------------------------------------------------------------------
    function botAvatar() {
      var d = document.createElement("div");
      d.className = "av";
      if (logoUrl) {
        var i = new Image();
        i.alt = "";
        i.onerror = function () { d.textContent = ""; d.innerHTML = ICON_STAR; };
        i.src = logoUrl;
        d.appendChild(i);
      } else {
        d.innerHTML = ICON_STAR;
      }
      return d;
    }
    function userAvatar() {
      var d = document.createElement("div");
      d.className = "av us";
      d.innerHTML = ICON_USER;
      return d;
    }

    root.querySelector(".hav").insertBefore(botAvatar(), root.querySelector(".hav .on"));

    // Logo on the chat button.
    // If the image fails to load, we keep the default icon.
    if (logoUrl) {
      var bi = new Image();
      bi.alt = "";
      bi.onload = function () { btn.textContent = ""; btn.appendChild(bi); };
      bi.src = logoUrl;
    }

    closeBtn.onclick = function () { try { if (dictating) dict.stop(); } catch (e) {} closeVoice(); box.classList.remove("open"); };

    // ---------------------------------------------------------------------
    // Messages
    // ---------------------------------------------------------------------
    var URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
    function renderText(el, text) {
      el.textContent = "";
      var last = 0, m;
      URL_RE.lastIndex = 0;
      while ((m = URL_RE.exec(text)) !== null) {
        var url = m[0].replace(/[.,;:!?]+$/, "");
        if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = url;
        el.appendChild(a);
        last = m.index + url.length;
        URL_RE.lastIndex = last;
      }
      if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
    }

    function fmtTime(d) {
      try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
      catch (e) { return ""; }
    }
    function toDate(v) {
      if (!v) return null;
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }

    function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

    // cls: "u" (visitor), "a" (assistant), "a agent" (team member), "a notice"
    // when: undefined = now, null = no timestamp, Date = that time
    // Returns the bubble element (the text lives inside it).
    function add(text, cls, when) {
      var isUser = cls.split(" ")[0] === "u";
      var row = document.createElement("div");
      row.className = "r " + (isUser ? "u" : "a");
      row.appendChild(isUser ? userAvatar() : botAvatar());

      var col = document.createElement("div");
      col.className = "col";

      var bubble = document.createElement("div");
      bubble.className = "m " + cls;
      renderText(bubble, text); // safe: only text nodes and http(s) links
      col.appendChild(bubble);

      var stamp = when === undefined ? new Date() : when;
      if (stamp) {
        var t = document.createElement("span");
        t.className = "ts";
        t.textContent = fmtTime(stamp);
        col.appendChild(t);
      }

      row.appendChild(col);
      msgs.appendChild(row);
      scrollDown();
      return bubble;
    }
    function rowOf(bubble) { return bubble.parentNode.parentNode; }

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

    // ---------------------------------------------------------------------
    // Message actions: copy, like, read aloud, regenerate
    // ---------------------------------------------------------------------
    var synth = window.speechSynthesis || null;
    var voiceLang = voiceLangAttr || navigator.language || "en-US";
    var lastUserText = "";
    var lastRegen = null;

    function speak(text, done) {
      if (!synth) { if (done) done(); return; }
      try {
        synth.cancel();
        var u = new SpeechSynthesisUtterance(String(text).replace(/https?:\/\/\S+/g, ""));
        u.lang = voiceLang;
        u.onstart = function () { speaking = true; if (voiceOpen) vStatus("Speaking..."); };
        u.onend = u.onerror = function () { speaking = false; if (done) done(); };
        synth.speak(u);
      } catch (e) { if (done) done(); }
    }

    function addActions(bubble, withRegen) {
      var col = bubble.parentNode;
      var ts = col.querySelector(".ts");
      var bar = document.createElement("div");
      bar.className = "act";
      function mk(k, label, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ab ib";
        b.setAttribute("aria-label", label);
        b.title = label;
        b.innerHTML = ico(k);
        b.onclick = function () { fn(b); };
        bar.appendChild(b);
        return b;
      }
      mk("copy", "Copy", function (b) {
        try { navigator.clipboard.writeText(bubble.textContent); } catch (e) {}
        b.classList.add("on");
        setTimeout(function () { b.classList.remove("on"); }, 1200);
      });
      mk("like", "Good answer", function (b) { b.classList.toggle("on"); });
      if (synth) mk("spk", "Read aloud", function () {
        if (synth.speaking) synth.cancel(); else speak(bubble.textContent);
      });
      if (withRegen) {
        if (lastRegen) lastRegen.remove();
        lastRegen = mk("re", "Regenerate", function () {
          if (busy || !lastUserText) return;
          rowOf(bubble).remove();
          send(lastUserText, true);
        });
        lastRegen.classList.add("rg");
      }
      if (ts) col.insertBefore(bar, ts); else col.appendChild(bar);
    }

    add(welcome, "a");

    // If the monthly AI replies are already used up, tell the visitor right away.
    // The input stays enabled on purpose: a conversation handled by a human team
    // member still works, because the server saves those messages without calling the AI.
    if (cfg.creditsExhausted === true) add(CREDITS_TEXT, "a notice");

    // ---------------------------------------------------------------------
    // Quick reply cards (only before the first message)
    // ---------------------------------------------------------------------
    function hideChips() { chipsEl.classList.remove("show"); }
    if (quick.length) {
      quick.forEach(function (q) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip";
        var label = document.createElement("span");
        label.textContent = q;
        var arrow = document.createElement("span");
        arrow.style.alignSelf = "flex-end";
        arrow.innerHTML = ICON_ARROW;
        b.appendChild(label);
        b.appendChild(arrow);
        b.onclick = function () { send(q, false); };
        chipsEl.appendChild(b);
      });
      chipsEl.classList.add("show");
    }

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
      hideChips();
      list.forEach(function (m) {
        seen[m.id] = true;
        var b = add(m.role === "user" ? displayFor(m.content) : m.content, m.role === "user" ? "u" : m.agent ? "a agent" : "a", toDate(m.created_at || m.createdAt));
        if (m.role !== "user" && !m.agent) addActions(b, false);
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
          add(m.content, "a agent", toDate(m.created_at || m.createdAt) || new Date());
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
        scrollDown();
        if (box.classList.contains("leadmode")) ln.focus(); else input.focus();
      } else {
        closeVoice();
      }
    };

    // New chat: next message starts a fresh conversation on the server
    nwBtn.onclick = function () {
      if (busy) return;
      if (synth) synth.cancel();
      state.conversationId = undefined; save();
      seen = {}; lastRegen = null; lastUserText = "";
      msgs.innerHTML = "";
      add(welcome, "a");
      if (cfg.creditsExhausted === true) add(CREDITS_TEXT, "a notice");
      if (quick.length) chipsEl.classList.add("show");
    };

    // -------------------------------------------------------------------------
    // 6. SENDING MESSAGES (STREAMING RESPONSE)
    // -------------------------------------------------------------------------
    // Resolves with the final answer text (used by voice mode to read it aloud).
    var busy = false;
    async function send(text, isRetry, shown) {
      if (!text || busy) return "";
      busy = true; sendBtn.disabled = true;
      lastUserText = text;
      hideChips();
      if (!isRetry) add(shown || text, "u");

      var bot = add("", "a");
      bot.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      var got = false;
      var acc = "";
      var finished = false;
      var handoff = false;

      // Handles one SSE event ("data: {...}")
      function handle(part) {
        var line = part.trim();
        if (line.indexOf("data:") !== 0) return;
        var evt;
        try { evt = JSON.parse(line.slice(5)); } catch (e) { return; }
        if (evt.type === "delta") {
          got = true;
          acc += evt.text;
          renderText(bot, acc);
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

          // Monthly AI replies are used up: show a plain notice, no red box and no Retry
          if (data && data.error && data.error.code === "CREDITS_EXHAUSTED") {
            bot.className = "m a notice";
            bot.textContent = data.error.message || CREDITS_TEXT;
            scrollDown();
            busy = false; sendBtn.disabled = false; if (!voiceOpen) input.focus();
            return "";
          }

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
        if (handoff && !got) rowOf(bot).remove();
        if (!finished) throw new Error("The connection was interrupted. Please try again.");
        if (got) addActions(bot, true);
      } catch (e) {
        acc = "";
        rowOf(bot).remove(); // remove the partial answer (the server did not save it either)
        var msg = e instanceof TypeError ? "Network error. Check your connection and try again." : e.message;
        showError(msg, text);
      }

      busy = false; sendBtn.disabled = false; if (!voiceOpen) input.focus();
      return acc;
    }

    // ---- File attach (text files): the content is sent to the assistant together with the question ----
    var MAX_FILE_CHARS = 6000;
    var attached = null; // { name, text }
    function refreshHas() { inp.classList.toggle("has", !!input.value.trim() || !!attached); }
    function clearAttached() { attached = null; pend.textContent = ""; pend.classList.remove("show"); refreshHas(); }
    function showPend(cut) {
      pend.textContent = "";
      var sp = document.createElement("span");
      sp.textContent = "\uD83D\uDCCE " + attached.name + (cut ? " (first " + MAX_FILE_CHARS + " characters used)" : "");
      var x = document.createElement("button");
      x.type = "button"; x.className = "ib"; x.setAttribute("aria-label", "Remove file"); x.innerHTML = ico("x");
      x.onclick = clearAttached;
      pend.appendChild(sp); pend.appendChild(x);
      pend.classList.add("show");
      refreshHas();
    }
    atBtn.onclick = function () { fileIn.click(); };
    fileIn.onchange = function () {
      var f = fileIn.files && fileIn.files[0];
      fileIn.value = "";
      if (!f) return;
      if (!/\.(txt|md|csv|json|log)$/i.test(f.name)) { add("Only text files (.txt, .md, .csv, .json, .log) are supported right now.", "a notice"); return; }
      if (f.size > 1048576) { add("That file is too large. Please upload a file under 1 MB.", "a notice"); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var t = String(fr.result || "");
        attached = { name: f.name.slice(0, 80), text: t.slice(0, MAX_FILE_CHARS) };
        showPend(t.length > MAX_FILE_CHARS);
        input.focus();
      };
      fr.onerror = function () { add("Could not read that file. Please try another one.", "a notice"); };
      fr.readAsText(f);
    };
    // Earlier conversations: show "file name + question" instead of the whole file content
    function displayFor(c) {
      var f = /^\[Attached file: (.{1,80}?)\]\n[\s\S]*?\n\[End of file\]\n\n([\s\S]*)$/.exec(String(c));
      return f ? "\uD83D\uDCCE " + f[1] + "\n" + f[2] : c;
    }

    function submit() {
      var text = input.value.trim();
      if (!text && !attached) return;
      var full = text, shown = text;
      if (attached) {
        full = "[Attached file: " + attached.name + "]\n" + attached.text + "\n[End of file]\n\n" + (text || "Please read this file and help me with it.");
        shown = "\uD83D\uDCCE " + attached.name + (text ? "\n" + text : "");
        attached = null; pend.textContent = ""; pend.classList.remove("show");
      }
      input.value = "";
      refreshHas();
      send(full, false, shown);
    }
    sendBtn.onclick = submit;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input.addEventListener("input", refreshHas);

    // -------------------------------------------------------------------------
    // 7. VOICE MODE (browser speech recognition + speech synthesis)
    // -------------------------------------------------------------------------
    // Works in Chrome/Edge/Safari over HTTPS (or localhost). The mic button is
    // hidden in browsers that do not support speech recognition.
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = null, listening = false, speaking = false, voiceOpen = false;
    if (!SR) { micBtn.style.display = "none"; wvBtn.style.display = "none"; }

    function vStatus(t) {
      vs.textContent = t || "";
      vm.classList.toggle("live", listening);
    }

    function listen() {
      if (!SR) return;
      if (listening) { try { rec.stop(); } catch (e) {} return; }
      if (synth) synth.cancel();
      speaking = false;
      rec = new SR();
      rec.lang = voiceLang;
      rec.interimResults = true;
      rec.continuous = false;
      var finalText = "";
      rec.onstart = function () { listening = true; vt.textContent = ""; vStatus("Listening..."); };
      rec.onresult = function (e) {
        var s = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          s += e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText = s;
        }
        vt.textContent = s;
      };
      rec.onerror = function (e) {
        listening = false;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          vt.textContent = "Microphone access is blocked. Allow it in your browser settings.";
        }
        vStatus("");
      };
      rec.onend = function () {
        listening = false; vStatus("");
        var q = finalText.trim();
        if (q && voiceOpen) handleVoice(q);
      };
      try { rec.start(); } catch (e) {}
    }

    async function handleVoice(q) {
      vt.textContent = q;
      vStatus("Thinking...");
      var reply = await send(q, false);
      if (!voiceOpen) return;
      if (reply) {
        vt.textContent = reply;
        speak(reply, function () { if (voiceOpen) { vStatus(""); listen(); } });
      } else {
        vStatus("");
      }
    }

    function openVoice() {
      try { if (dictating) dict.stop(); } catch (e) {}
      voiceOpen = true;
      vo.classList.add("open");
      vt.textContent = "Tap the mic and start speaking";
      orbLoop();
      listen();
    }
    function closeVoice() {
      if (!voiceOpen) return;
      voiceOpen = false;
      vo.classList.remove("open");
      try { if (rec) rec.abort(); } catch (e) {}
      if (synth) synth.cancel();
      listening = false; speaking = false;
    }
    // Speak-to-type: the words appear in the message box, the visitor can edit and press send
    var dict = null, dictating = false;
    function dictate() {
      if (!SR) return;
      if (dictating) { try { dict.stop(); } catch (e) {} return; }
      dict = new SR();
      dict.lang = voiceLang;
      dict.interimResults = true;
      dict.continuous = true;
      var base = input.value;
      if (base && !/\s$/.test(base)) base += " ";
      var fin = "";
      dict.onstart = function () { dictating = true; micBtn.classList.add("live"); };
      dict.onresult = function (e) {
        var interim = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += tr; else interim += tr;
        }
        input.value = (base + fin + interim).slice(0, 2000);
        refreshHas();
      };
      dict.onerror = function (e) {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") add("Microphone access is blocked. Allow it in your browser settings.", "a notice");
      };
      dict.onend = function () { dictating = false; micBtn.classList.remove("live"); input.focus(); };
      try { dict.start(); } catch (e) {}
    }
    micBtn.onclick = dictate;
    wvBtn.onclick = openVoice;
    vm.onclick = listen;
    root.querySelector(".vx").onclick = closeVoice;
    root.querySelector(".vr").onclick = function () {
      try { if (rec) rec.abort(); } catch (e) {}
      if (synth) synth.cancel();
      listening = false; speaking = false; vStatus("");
      vt.textContent = "Tap the mic and start speaking";
    };

    // Particle orb drawn in the brand color
    var shades = [-0.35, -0.15, 0, 0.2, 0.4, 0.6].map(function (a) { return adjust(accent, a); });
    var cx = orb.getContext("2d"), PTS = [], N = 900, t0 = 0, amp = 0.1;
    for (var n = 0; n < N; n++) {
      var py = 1 - 2 * (n + 0.5) / N, pr = Math.sqrt(1 - py * py), th = n * 2.39996;
      PTS.push([Math.cos(th) * pr, py, Math.sin(th) * pr]);
    }
    function orbLoop() {
      if (!voiceOpen) return;
      t0 += 0.012;
      amp += ((listening ? 0.38 : speaking ? 0.3 : 0.1) - amp) * 0.06;
      cx.clearRect(0, 0, 460, 460);
      var cs = Math.cos(t0 * 0.6), sn = Math.sin(t0 * 0.6);
      for (var i = 0; i < N; i++) {
        var p = PTS[i];
        var k = 1 + amp * Math.sin(p[0] * 3 + t0 * 2) * Math.cos(p[1] * 3 + t0 * 1.5) + 0.1 * Math.sin(p[2] * 4 + t0);
        var x = p[0] * k, y = p[1] * k, z = p[2] * k;
        var xr = x * cs + z * sn, zr = -x * sn + z * cs;
        var idx = Math.max(0, Math.min(5, Math.floor(((zr + 1) * 0.35 + (y + 1) * 0.15) * 6)));
        cx.globalAlpha = 0.35 + (zr + 1) * 0.32;
        cx.fillStyle = shades[idx];
        cx.beginPath();
        cx.arc(230 + xr * 150, 230 + y * 150, 1.4 + (zr + 1) * 1.3, 0, 6.3);
        cx.fill();
      }
      cx.globalAlpha = 1;
      requestAnimationFrame(orbLoop);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !box.classList.contains("open")) return;
      if (voiceOpen) closeVoice(); else box.classList.remove("open");
    });
  }
})();