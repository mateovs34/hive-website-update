/**
 * ChatWidget — Widget de chat con IA embebible
 * Uso: <script src="widget.js"></script>
 * Requiere: window.ChatWidgetConfig (ver demo.html)
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // SECCIÓN 1 — CONFIGURACIÓN
  // ─────────────────────────────────────────────

  function readConfig() {
    var cfg = window.ChatWidgetConfig;
    if (!cfg) throw new Error('[ChatWidget] window.ChatWidgetConfig no encontrado');
    return {
      botName:        cfg.botName        || 'Asistente',
      botAvatar:      cfg.botAvatar      || '🤖',
      primaryColor:   cfg.primaryColor   || '#4F46E5',
      businessContext:cfg.businessContext|| '',
      welcomeMessage: cfg.welcomeMessage || '¡Hola! ¿En qué puedo ayudarte?',
      humanContact:   cfg.humanContact   || null,
      proxyUrl:       cfg.proxyUrl       || 'http://localhost:3001/chat',
      businessId:     cfg.businessId     || 'default'
    };
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 2 — ESTADO
  // ─────────────────────────────────────────────

  // Genera un ID de sesión único y lo persiste en sessionStorage
  function getSessionId(businessId) {
    var key = 'cw_session_' + (businessId || 'default');
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  var state = {
    isOpen: false,
    isLoading: false,
    messages: [],          // formato OpenAI: [{role, content}]
    humanContactShown: false,
    config: null,
    sessionId: getSessionId((window.ChatWidgetConfig || {}).businessId || 'default')
  };

  var refs = {};            // referencias a elementos del shadow DOM

  // ─────────────────────────────────────────────
  // SECCIÓN 3 — SYSTEM PROMPT
  // ─────────────────────────────────────────────

  function buildSystemPrompt(config) {
    return (
      'Eres ' + config.botName + ', el asistente virtual de este negocio.\n\n' +
      'CONTEXTO DEL NEGOCIO:\n' + config.businessContext + '\n\n' +
      'PERSONALIDAD Y TONO:\n' +
      '- Adaptate al tono del usuario: si es informal, respondé informal; si es formal, formal\n' +
      '- Sé empático, servicial y conciso (máximo 3-4 oraciones salvo necesidad mayor)\n' +
      '- Tolerá errores de tipeo, abreviaciones y preguntas vagas — entendé la intención real\n' +
      '- Usá emojis con moderación si el usuario los usa\n\n' +
      'LÍMITES DE CONOCIMIENTO:\n' +
      '- Solo respondé sobre lo que está en el contexto del negocio\n' +
      '- Si no sabés algo, decilo honestamente sin inventar datos\n' +
      '- Nunca inventes precios, horarios ni información que no esté en el contexto\n' +
      '- Cuando no puedas ayudar, ofrecé la opción de contacto humano\n\n' +
      'DETECCIÓN DE INTENCIÓN DE CONTACTO HUMANO — poné humanContact: true si:\n' +
      '- El usuario pide hablar con una persona, humano, agente, supervisor o asesor\n' +
      '- Tiene una queja, urgencia o reclamo que requiere intervención humana\n' +
      '- Expresa frustración severa ("esto es un desastre", "no me están ayudando", etc.)\n' +
      '- La consulta está fuera de tu conocimiento y requiere gestión humana\n' +
      '- Frases típicas (con variaciones y errores): "quiero hablar con alguien", "pasame con\n' +
      '  una persona", "necesito ayuda real", "hablar con un humano", "hay alguien ahí",\n' +
      '  "agente por favor", "no quiero hablar con un bot", equivalentes en cualquier idioma\n\n' +
      'FORMATO DE RESPUESTA — CRÍTICO:\n' +
      'Respondé SIEMPRE y ÚNICAMENTE con este JSON exacto, sin nada más:\n' +
      '{"text": "tu respuesta aquí", "humanContact": false}\n\n' +
      'Si detectás intención de contacto humano:\n' +
      '{"text": "mensaje empático de transición", "humanContact": true}\n\n' +
      'PROHIBIDO: markdown code blocks, texto fuera del JSON, comentarios.'
    );
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 4 — INTEGRACIÓN OPENAI
  // ─────────────────────────────────────────────

  var HUMAN_FALLBACK_REGEX = /\b(hablar|habla|pasame|pasa|conecta|quiero|necesito).{0,25}(persona|humano|alguien|agente|supervisor|asesor)\b/i;

  function parseResponse(rawContent) {
    try {
      return JSON.parse(rawContent);
    } catch (_e) {
      return {
        text: rawContent,
        humanContact: HUMAN_FALLBACK_REGEX.test(rawContent)
      };
    }
  }

  async function callOpenAI(messages) {
    var systemPrompt = buildSystemPrompt(state.config);
    var payload = {
      messages:   [{ role: 'system', content: systemPrompt }].concat(messages),
      sessionId:  state.sessionId,
      businessId: state.config.businessId
    };

    var response;
    try {
      response = await fetch(state.config.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_e) {
      throw { type: 'network' };
    }

    if (!response.ok) {
      if (response.status === 401) throw { type: 'auth' };
      if (response.status === 429) throw { type: 'ratelimit' };
      throw { type: 'server', status: response.status };
    }

    var data = await response.json();
    var content = data.choices[0].message.content;

    // Guardar el mensaje del assistant en el historial
    state.messages.push({ role: 'assistant', content: content });

    return parseResponse(content);
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 5 — CSS DINÁMICO
  // ─────────────────────────────────────────────

  function darkenColor(hex, percent) {
    var clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean[0]+clean[0]+clean[1]+clean[1]+clean[2]+clean[2];
    }
    var num = parseInt(clean, 16);
    var amt = Math.round(255 * percent / 100);
    var r = Math.max(0, (num >> 16) - amt);
    var g = Math.max(0, ((num >> 8) & 0xff) - amt);
    var b = Math.max(0, (num & 0xff) - amt);
    return '#' + [r, g, b].map(function(x){ return x.toString(16).padStart(2,'0'); }).join('');
  }

  function buildCSS(config) {
    var p  = config.primaryColor;
    var pd = darkenColor(p, 12);
    return [
      ':host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',

      /* ── Launcher ── */
      '.cw-launcher {',
      '  position: fixed; bottom: 24px; right: 24px;',
      '  width: 60px; height: 60px;',
      '  background: ' + p + ';',
      '  border-radius: 50%; border: none; cursor: pointer;',
      '  box-shadow: 0 4px 20px rgba(0,0,0,0.25);',
      '  z-index: 999999;',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 26px;',
      '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
      '}',
      '.cw-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.32); }',
      '.cw-launcher--open { transform: rotate(45deg) scale(1.05); }',
      '.cw-launcher--open:hover { transform: rotate(45deg) scale(1.1); }',
      '.cw-launcher-icon { line-height: 1; user-select: none; }',

      /* ── Ventana ── */
      '.cw-window {',
      '  position: fixed; bottom: 96px; right: 24px;',
      '  width: 380px; height: 560px;',
      '  background: #ffffff;',
      '  border-radius: 20px;',
      '  box-shadow: 0 8px 40px rgba(0,0,0,0.18);',
      '  display: flex; flex-direction: column;',
      '  overflow: hidden;',
      '  z-index: 999998;',
      '  opacity: 0; pointer-events: none;',
      '  transform: translateY(16px) scale(0.97);',
      '  transition: opacity 0.25s ease, transform 0.25s ease;',
      '}',
      '.cw-window--open { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }',

      /* ── Header ── */
      '.cw-header {',
      '  background: ' + p + ';',
      '  color: white; padding: 14px 16px;',
      '  display: flex; align-items: center; gap: 11px; flex-shrink: 0;',
      '}',
      '.cw-header-avatar {',
      '  width: 40px; height: 40px; border-radius: 50%;',
      '  background: rgba(255,255,255,0.2);',
      '  display: flex; align-items: center; justify-content: center;',
      '  font-size: 20px; flex-shrink: 0; overflow: hidden;',
      '}',
      '.cw-header-avatar img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }',
      '.cw-header-info { flex: 1; min-width: 0; }',
      '.cw-header-info h3 { margin: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.cw-header-status { font-size: 11px; opacity: 0.88; display: flex; align-items: center; gap: 5px; margin-top: 2px; }',
      '.cw-status-dot { width: 7px; height: 7px; background: #4ade80; border-radius: 50%; flex-shrink: 0; }',
      '.cw-close-btn { background: none; border: none; color: white; font-size: 22px; cursor: pointer; padding: 2px 4px; opacity: 0.75; transition: opacity 0.15s; line-height: 1; }',
      '.cw-close-btn:hover { opacity: 1; }',

      /* ── Mensajes ── */
      '.cw-messages {',
      '  flex: 1; overflow-y: auto; padding: 16px;',
      '  display: flex; flex-direction: column; gap: 10px;',
      '  scroll-behavior: smooth;',
      '}',
      '.cw-messages::-webkit-scrollbar { width: 4px; }',
      '.cw-messages::-webkit-scrollbar-track { background: transparent; }',
      '.cw-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }',

      /* Burbujas */
      '.cw-message {',
      '  max-width: 82%; padding: 10px 14px;',
      '  border-radius: 18px; font-size: 14px; line-height: 1.55;',
      '  word-wrap: break-word; animation: cw-fadein 0.2s ease;',
      '}',
      '.cw-message--bot { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; align-self: flex-start; }',
      '.cw-message--user { background: ' + p + '; color: white; border-bottom-right-radius: 4px; align-self: flex-end; }',
      '.cw-message--error { background: #fee2e2; color: #991b1b; border-bottom-left-radius: 4px; align-self: flex-start; font-size: 13px; }',

      /* Typing indicator */
      '.cw-typing {',
      '  display: flex; align-items: center; gap: 5px; padding: 12px 14px;',
      '  background: #f1f5f9; border-radius: 18px; border-bottom-left-radius: 4px;',
      '  align-self: flex-start; width: fit-content; animation: cw-fadein 0.2s ease;',
      '}',
      '.cw-typing-dot { width: 7px; height: 7px; background: #94a3b8; border-radius: 50%; animation: cw-bounce 1.2s infinite; }',
      '.cw-typing-dot:nth-child(2) { animation-delay: 0.2s; }',
      '.cw-typing-dot:nth-child(3) { animation-delay: 0.4s; }',

      /* Contact card */
      '.cw-contact-card {',
      '  background: #f8fafc; border: 1.5px solid ' + p + ';',
      '  border-radius: 14px; padding: 14px 15px;',
      '  align-self: flex-start; max-width: 92%;',
      '  animation: cw-fadein 0.3s ease;',
      '}',
      '.cw-contact-card-title { font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 10px 0; }',
      '.cw-contact-btn {',
      '  display: flex; align-items: center; gap: 8px; padding: 9px 14px;',
      '  border-radius: 10px; border: none; cursor: pointer;',
      '  font-size: 13px; font-weight: 500; text-decoration: none;',
      '  width: 100%; margin-bottom: 6px; transition: opacity 0.15s;',
      '  box-sizing: border-box;',
      '}',
      '.cw-contact-btn:last-child { margin-bottom: 0; }',
      '.cw-contact-btn:hover { opacity: 0.85; }',
      '.cw-contact-btn--email { background: #e2e8f0; color: #1e293b; }',
      '.cw-contact-btn--whatsapp { background: #25D366; color: white; }',

      /* Input area */
      '.cw-input-area {',
      '  padding: 11px 13px; border-top: 1px solid #f1f5f9;',
      '  display: flex; align-items: flex-end; gap: 8px;',
      '  flex-shrink: 0; background: white;',
      '}',
      '.cw-input {',
      '  flex: 1; border: 1.5px solid #e2e8f0; border-radius: 12px;',
      '  padding: 9px 13px; font-size: 14px; font-family: inherit;',
      '  resize: none; outline: none; max-height: 120px; overflow-y: auto;',
      '  line-height: 1.4; color: #1e293b; transition: border-color 0.15s;',
      '  background: white;',
      '}',
      '.cw-input:focus { border-color: ' + p + '; }',
      '.cw-input::placeholder { color: #94a3b8; }',
      '.cw-input:disabled { background: #f8fafc; cursor: not-allowed; }',
      '.cw-send-btn {',
      '  width: 40px; height: 40px; border-radius: 12px;',
      '  background: ' + p + '; border: none; cursor: pointer;',
      '  display: flex; align-items: center; justify-content: center;',
      '  flex-shrink: 0; transition: background 0.15s, transform 0.1s;',
      '}',
      '.cw-send-btn:hover { background: ' + pd + '; }',
      '.cw-send-btn:active { transform: scale(0.93); }',
      '.cw-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
      '.cw-send-btn svg { width: 18px; height: 18px; fill: white; }',

      /* Animaciones */
      '@keyframes cw-bounce {',
      '  0%, 60%, 100% { transform: translateY(0); }',
      '  30% { transform: translateY(-5px); }',
      '}',
      '@keyframes cw-fadein {',
      '  from { opacity: 0; transform: translateY(6px); }',
      '  to   { opacity: 1; transform: translateY(0); }',
      '}',

      /* Móvil */
      '@media (max-width: 480px) {',
      '  .cw-window { width: 100vw; height: 100dvh; bottom: 0; right: 0; border-radius: 0; }',
      '  .cw-launcher { bottom: 16px; right: 16px; }',
      '}'
    ].join('\n');
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 6 — CONSTRUCCIÓN DEL DOM
  // ─────────────────────────────────────────────

  function buildAvatarHTML(botAvatar) {
    // Si parece una URL, usamos <img>
    if (botAvatar && (botAvatar.startsWith('http') || botAvatar.startsWith('/'))) {
      return '<img src="' + escapeAttr(botAvatar) + '" alt="avatar">';
    }
    return '<span>' + botAvatar + '</span>';
  }

  function buildContactCardHTML(humanContact) {
    if (!humanContact) return '';
    var html = '<div class="cw-contact-card">';
    html += '<p class="cw-contact-card-title">👤 Contactá a nuestro equipo</p>';
    if (humanContact.email) {
      html += '<a class="cw-contact-btn cw-contact-btn--email" href="mailto:' +
        escapeAttr(humanContact.email) + '" target="_blank">' +
        '<span>✉</span> <span>' + escapeHTML(humanContact.email) + '</span></a>';
    }
    if (humanContact.whatsapp) {
      var phone = humanContact.whatsapp.replace(/[^0-9]/g, '');
      var waLink = 'https://wa.me/' + phone + '?text=Hola%2C%20necesito%20ayuda';
      html += '<a class="cw-contact-btn cw-contact-btn--whatsapp" href="' +
        escapeAttr(waLink) + '" target="_blank">' +
        '<span>💬</span> <span>WhatsApp</span></a>';
    }
    html += '</div>';
    return html;
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 7 — SANITIZACIÓN Y FORMATO
  // ─────────────────────────────────────────────

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeAndFormat(text) {
    var escaped = escapeHTML(text);
    // Markdown mínimo: **bold**, *italic*, saltos de línea
    return escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,     '<em>$1</em>')
      .replace(/\n/g,            '<br>');
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 8 — RENDERIZADORES UI
  // ─────────────────────────────────────────────

  function appendMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'cw-message cw-message--' + role;
    el.innerHTML = sanitizeAndFormat(text);
    refs.messages.appendChild(el);
    refs.messages.scrollTop = refs.messages.scrollHeight;

    // Guardar en historial solo mensajes reales (no mensajes de error de UI)
    if (role === 'user') {
      state.messages.push({ role: 'user', content: text });
    }
    // Los mensajes del bot ya se pushean en callOpenAI (el JSON raw)
    // Para el welcome message y errores, no los pusheamos al historial
  }

  function showTypingIndicator() {
    hideTypingIndicator();
    var el = document.createElement('div');
    el.className = 'cw-typing';
    el.id = 'cw-typing-indicator';
    el.innerHTML = '<div class="cw-typing-dot"></div><div class="cw-typing-dot"></div><div class="cw-typing-dot"></div>';
    refs.messages.appendChild(el);
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  function hideTypingIndicator() {
    var el = refs.shadow.getElementById('cw-typing-indicator');
    if (el) el.remove();
  }

  function showHumanContactCard() {
    if (state.humanContactShown || !state.config.humanContact) return;
    state.humanContactShown = true;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = buildContactCardHTML(state.config.humanContact);
    var card = wrapper.firstChild;
    if (card) {
      refs.messages.appendChild(card);
      refs.messages.scrollTop = refs.messages.scrollHeight;
    }
  }

  function showErrorMessage(errType) {
    var messages = {
      auth:      '⚠ API key inválida. Revisá la configuración del widget.',
      ratelimit: '⏳ Demasiadas consultas. Esperá unos segundos e intentá de nuevo.',
      network:   '📶 Sin conexión o el proxy no está corriendo. Verificá que <code>node proxy.js</code> esté activo en la terminal.',
      server:    '⚠ El servicio está temporalmente no disponible. Intentá en unos minutos.'
    };
    var text = messages[errType] || messages.server;
    var el = document.createElement('div');
    el.className = 'cw-message cw-message--error';
    el.textContent = text;
    refs.messages.appendChild(el);
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 9 — MANEJADORES DE EVENTOS
  // ─────────────────────────────────────────────

  async function handleUserSend(text) {
    text = text.trim();
    if (!text || state.isLoading) return;

    // Limpiar input y resetear altura
    refs.input.value = '';
    refs.input.style.height = 'auto';

    // Renderizar mensaje del usuario
    appendMessage('user', text);

    // Iniciar estado de carga
    state.isLoading = true;
    refs.input.disabled = true;
    refs.sendBtn.disabled = true;
    showTypingIndicator();

    try {
      var result = await callOpenAI(state.messages);
      hideTypingIndicator();

      if (result.humanContact && !state.humanContactShown) {
        appendBotResponse(result.text);
        showHumanContactCard();
      } else {
        appendBotResponse(result.text);
      }
    } catch (err) {
      hideTypingIndicator();
      showErrorMessage(err.type || 'server');
    } finally {
      state.isLoading = false;
      refs.input.disabled = false;
      refs.sendBtn.disabled = false;
      refs.input.focus();
    }
  }

  // appendBotResponse: renderiza el texto de la respuesta del bot
  // (el push al historial ya lo hizo callOpenAI con el JSON raw)
  function appendBotResponse(text) {
    var el = document.createElement('div');
    el.className = 'cw-message cw-message--bot';
    el.innerHTML = sanitizeAndFormat(text);
    refs.messages.appendChild(el);
    refs.messages.scrollTop = refs.messages.scrollHeight;
  }

  function handleToggle() {
    state.isOpen = !state.isOpen;
    if (state.isOpen) {
      refs.window.classList.add('cw-window--open');
      refs.launcher.classList.add('cw-launcher--open');
      refs.input.focus();
    } else {
      refs.window.classList.remove('cw-window--open');
      refs.launcher.classList.remove('cw-launcher--open');
    }
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 10 — MONTAJE DEL WIDGET
  // ─────────────────────────────────────────────

  function mount(config) {
    // 1. Crear host y shadow DOM
    var host = document.createElement('div');
    host.id = 'chat-widget-host';
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });
    refs.shadow = shadow;

    // 2. Inyectar estilos
    var styleEl = document.createElement('style');
    styleEl.textContent = buildCSS(config);
    shadow.appendChild(styleEl);

    // 3. Botón launcher
    var launcher = document.createElement('button');
    launcher.className = 'cw-launcher';
    launcher.setAttribute('aria-label', 'Abrir chat');
    launcher.innerHTML = '<span class="cw-launcher-icon">' + config.botAvatar + '</span>';
    shadow.appendChild(launcher);
    refs.launcher = launcher;

    // 4. Ventana de chat
    var win = document.createElement('div');
    win.className = 'cw-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat con ' + config.botName);
    win.innerHTML = buildWindowHTML(config);
    shadow.appendChild(win);
    refs.window = win;

    // 5. Referencias internas
    refs.messages  = shadow.querySelector('.cw-messages');
    refs.input     = shadow.querySelector('.cw-input');
    refs.sendBtn   = shadow.querySelector('.cw-send-btn');
    refs.closeBtn  = shadow.querySelector('.cw-close-btn');

    // 6. Eventos
    launcher.addEventListener('click', handleToggle);
    refs.closeBtn.addEventListener('click', handleToggle);

    refs.sendBtn.addEventListener('click', function () {
      handleUserSend(refs.input.value);
    });

    refs.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserSend(refs.input.value);
      }
    });

    refs.input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // 7. Mensaje de bienvenida (no va al historial de OpenAI)
    appendWelcomeMessage(config.welcomeMessage);
  }

  function buildWindowHTML(config) {
    return (
      '<div class="cw-header">' +
        '<div class="cw-header-avatar">' + buildAvatarHTML(config.botAvatar) + '</div>' +
        '<div class="cw-header-info">' +
          '<h3>' + escapeHTML(config.botName) + '</h3>' +
          '<div class="cw-header-status"><span class="cw-status-dot"></span><span>En línea</span></div>' +
        '</div>' +
        '<button class="cw-close-btn" aria-label="Cerrar chat">✕</button>' +
      '</div>' +
      '<div class="cw-messages" role="log" aria-live="polite"></div>' +
      '<div class="cw-input-area">' +
        '<textarea class="cw-input" placeholder="Escribí tu mensaje..." rows="1" aria-label="Mensaje"></textarea>' +
        '<button class="cw-send-btn" aria-label="Enviar">' +
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>' +
          '</svg>' +
        '</button>' +
      '</div>'
    );
  }

  function appendWelcomeMessage(text) {
    var el = document.createElement('div');
    el.className = 'cw-message cw-message--bot';
    el.innerHTML = sanitizeAndFormat(text);
    refs.messages.appendChild(el);
  }

  // ─────────────────────────────────────────────
  // SECCIÓN 11 — INICIALIZACIÓN
  // ─────────────────────────────────────────────

  function init() {
    try {
      var config = readConfig();
      state.config = config;

      // Advertencia de seguridad
      console.warn(
        '%c[ChatWidget] ⚠ ADVERTENCIA DE SEGURIDAD',
        'color: #dc2626; font-weight: bold; font-size: 13px',
        '\nLa API key de OpenAI está expuesta en el cliente (visible en DevTools).',
        '\nPara producción, implementá un backend proxy que maneje las llamadas a OpenAI.',
        '\nMás info: https://platform.openai.com/docs/guides/production-best-practices'
      );

      mount(config);
    } catch (e) {
      console.error(e.message);
    }
  }

  // Bootstrap: esperar al DOM si todavía no cargó
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
