/**
 * proxy.js — Servidor proxy multicliente para ChatWidget
 *
 * Base de datos: ~/chat.db  (SQLite via better-sqlite3)
 * Tablas: negocios, conversaciones, mensajes, pedidos
 *
 * Variables de entorno:
 *   OPENAI_API_KEY  (requerida) — clave de API de OpenAI
 *   PORT            (opcional, default 3001)
 *   DB_PATH         (opcional, default ~/chat.db ; en Docker usa /data/chat.db)
 *   NODE_ENV        (opcional, default development)
 *
 * Uso local:
 *   OPENAI_API_KEY=sk-... node proxy.js
 *
 * Uso con Docker:
 *   docker compose up --build
 */

'use strict';

const http     = require('http');
const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const PORT           = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DB_PATH        = process.env.DB_PATH || path.join(require('os').homedir(), 'chat.db');

if (!OPENAI_API_KEY) {
  console.error('Error: falta la variable de entorno OPENAI_API_KEY');
  process.exit(1);
}

// ── Base de datos ─────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema multicliente ───────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS negocios (
    business_id    TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL DEFAULT 'Mi Negocio',
    descripcion    TEXT NOT NULL DEFAULT '',
    menu           TEXT NOT NULL DEFAULT '[]',
    horarios       TEXT NOT NULL DEFAULT '',
    direccion      TEXT NOT NULL DEFAULT '',
    telefono       TEXT NOT NULL DEFAULT '',
    email_contacto TEXT NOT NULL DEFAULT '',
    whatsapp       TEXT NOT NULL DEFAULT '',
    welcome_msg    TEXT NOT NULL DEFAULT '¡Hola! ¿En qué puedo ayudarte?',
    bot_nombre     TEXT NOT NULL DEFAULT 'Asistente',
    bot_avatar     TEXT NOT NULL DEFAULT '🤖',
    color_widget   TEXT NOT NULL DEFAULT '#6366f1',
    activo         INTEGER NOT NULL DEFAULT 1,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversaciones (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id    TEXT NOT NULL DEFAULT 'default',
    session_id     TEXT NOT NULL UNIQUE,
    creada_en      TEXT NOT NULL DEFAULT (datetime('now')),
    actualizada_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id TEXT NOT NULL DEFAULT 'default',
    session_id  TEXT NOT NULL REFERENCES conversaciones(session_id) ON DELETE CASCADE,
    rol         TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
    contenido   TEXT NOT NULL,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id TEXT NOT NULL DEFAULT 'default',
    session_id  TEXT NOT NULL REFERENCES conversaciones(session_id) ON DELETE CASCADE,
    detalles    TEXT NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
    creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conv_business   ON conversaciones(business_id);
  CREATE INDEX IF NOT EXISTS idx_conv_session    ON conversaciones(session_id);
  CREATE INDEX IF NOT EXISTS idx_msg_session     ON mensajes(session_id);
  CREATE INDEX IF NOT EXISTS idx_msg_business    ON mensajes(business_id);
  CREATE INDEX IF NOT EXISTS idx_pedidos_session ON pedidos(session_id);
  CREATE INDEX IF NOT EXISTS idx_pedidos_business ON pedidos(business_id);
`);

// ── Migración desde schema monocliente anterior ───────────────────────────────

(function migrate() {
  // Helpers
  function cols(table) {
    return db.prepare('PRAGMA table_info(' + table + ')').all().map(function (c) { return c.name; });
  }
  function hasTable(name) {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  }

  // 1. mensajes.texto → mensajes.contenido
  //    (primer schema no tenía esa columna con ese nombre)
  if (hasTable('mensajes')) {
    var mc = cols('mensajes');
    if (mc.includes('texto') && !mc.includes('contenido')) {
      // SQLite >= 3.25 soporta RENAME COLUMN; si falla, reconstruimos la tabla
      try {
        db.exec('ALTER TABLE mensajes RENAME COLUMN texto TO contenido');
        console.log('[Migración] mensajes.texto → mensajes.contenido (RENAME COLUMN)');
      } catch (_) {
        db.exec(`
          BEGIN;
          CREATE TABLE mensajes_v2 (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id TEXT NOT NULL DEFAULT 'default',
            session_id  TEXT NOT NULL,
            rol         TEXT NOT NULL CHECK (rol IN ('user','assistant')),
            contenido   TEXT NOT NULL,
            creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO mensajes_v2 (id, session_id, rol, contenido, creado_en)
            SELECT id, session_id, rol, texto, creado_en FROM mensajes;
          DROP TABLE mensajes;
          ALTER TABLE mensajes_v2 RENAME TO mensajes;
          COMMIT;
        `);
        console.log('[Migración] mensajes reconstruida (texto → contenido)');
      }
    }
  }

  // 2. Agregar business_id a tablas existentes (idempotente)
  [
    ['conversaciones', "business_id TEXT NOT NULL DEFAULT 'default'"],
    ['mensajes',       "business_id TEXT NOT NULL DEFAULT 'default'"],
    ['pedidos',        "business_id TEXT NOT NULL DEFAULT 'default'"]
  ].forEach(function (pair) {
    if (!hasTable(pair[0])) return;
    try { db.exec('ALTER TABLE ' + pair[0] + ' ADD COLUMN ' + pair[1]); }
    catch (e) { if (!e.message.includes('duplicate column name')) throw e; }
  });

  // 3. Migrar negocio_config (singleton viejo) → negocios
  if (hasTable('negocio_config')) {
    try {
      var old = db.prepare('SELECT * FROM negocio_config LIMIT 1').get();
      if (old) {
        db.prepare(`
          INSERT OR IGNORE INTO negocios
            (business_id, nombre, descripcion, menu, horarios, direccion, telefono,
             email_contacto, whatsapp, welcome_msg, bot_nombre, bot_avatar, color_widget)
          VALUES ('default',?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          old.nombre, old.descripcion, old.menu, old.horarios, old.direccion,
          old.telefono, old.email_contacto || '', old.whatsapp || '',
          old.welcome_msg, old.bot_nombre, old.bot_avatar, old.color_widget
        );
        console.log('[Migración] negocio_config → negocios (business_id: default)');
      }
    } catch (e) { console.warn('[Migración]', e.message); }
  }

  // 4. Asegurar que 'default' exista para datos huérfanos
  db.prepare("INSERT OR IGNORE INTO negocios (business_id, nombre) VALUES ('default','Negocio por defecto')").run();
})();

console.log('SQLite conectado:', DB_PATH);

// ── Statements preparados ─────────────────────────────────────────────────────

const stmts = {

  // Negocios (admin)
  getAllNegocios: db.prepare(`
    SELECT
      n.business_id, n.nombre, n.bot_avatar, n.color_widget,
      n.activo, n.creado_en, n.actualizado_en,
      COUNT(DISTINCT c.session_id)                                         AS total_conversaciones,
      COUNT(p.id)                                                           AS total_pedidos,
      SUM(CASE WHEN date(p.creado_en) = date('now') THEN 1 ELSE 0 END)    AS pedidos_hoy,
      MAX(p.creado_en)                                                      AS ultimo_pedido_en
    FROM negocios n
    LEFT JOIN conversaciones c ON c.business_id = n.business_id
    LEFT JOIN pedidos        p ON p.business_id = n.business_id
    GROUP BY n.business_id
    ORDER BY n.creado_en DESC
  `),
  getNegocio: db.prepare(`SELECT * FROM negocios WHERE business_id = ?`),
  createNegocio: db.prepare(`
    INSERT INTO negocios (business_id, nombre) VALUES (?, ?)
  `),
  deleteNegocio: db.prepare(`DELETE FROM negocios WHERE business_id = ?`),

  // Config
  upsertConfig: db.prepare(`
    INSERT INTO negocios
      (business_id, nombre, descripcion, menu, horarios, direccion, telefono,
       email_contacto, whatsapp, welcome_msg, bot_nombre, bot_avatar,
       color_widget, actualizado_en)
    VALUES
      (@business_id, @nombre, @descripcion, @menu, @horarios, @direccion, @telefono,
       @email_contacto, @whatsapp, @welcome_msg, @bot_nombre, @bot_avatar,
       @color_widget, datetime('now'))
    ON CONFLICT (business_id) DO UPDATE SET
      nombre         = @nombre,
      descripcion    = @descripcion,
      menu           = @menu,
      horarios       = @horarios,
      direccion      = @direccion,
      telefono       = @telefono,
      email_contacto = @email_contacto,
      whatsapp       = @whatsapp,
      welcome_msg    = @welcome_msg,
      bot_nombre     = @bot_nombre,
      bot_avatar     = @bot_avatar,
      color_widget   = @color_widget,
      actualizado_en = datetime('now')
  `),

  // Chat
  upsertSession: db.prepare(`
    INSERT INTO conversaciones (business_id, session_id)
    VALUES (@business_id, @session_id)
    ON CONFLICT (session_id) DO NOTHING
  `),
  touchSession: db.prepare(`
    UPDATE conversaciones SET actualizada_en = datetime('now')
    WHERE session_id = @session_id
  `),
  insertMessage: db.prepare(`
    INSERT INTO mensajes (business_id, session_id, rol, contenido)
    VALUES (@business_id, @session_id, @rol, @contenido)
  `),
  insertPedido: db.prepare(`
    INSERT INTO pedidos (business_id, session_id, detalles)
    VALUES (@business_id, @session_id, @detalles)
  `),

  // Dashboard — pedidos filtrados por negocio
  getPedidosByBusiness: db.prepare(`
    SELECT id, session_id, detalles, estado, creado_en
    FROM pedidos
    WHERE business_id = ?
    ORDER BY
      CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END,
      creado_en DESC
  `),
  updatePedidoEstado: db.prepare(`
    UPDATE pedidos SET estado = @estado
    WHERE id = @id AND business_id = @business_id
  `),

  // Dashboard — conversaciones filtradas por negocio
  getConversacionesByBusiness: db.prepare(`
    SELECT
      c.session_id, c.creada_en, c.actualizada_en,
      COUNT(m.id)                                              AS total_mensajes,
      SUM(CASE WHEN m.rol = 'user' THEN 1 ELSE 0 END)         AS mensajes_usuario,
      (SELECT COUNT(*) FROM pedidos p
       WHERE p.session_id = c.session_id)                      AS total_pedidos,
      (SELECT lm.contenido FROM mensajes lm
       WHERE lm.session_id = c.session_id
       ORDER BY lm.creado_en DESC LIMIT 1)                     AS ultimo_contenido
    FROM conversaciones c
    LEFT JOIN mensajes m ON m.session_id = c.session_id
    WHERE c.business_id = ?
    GROUP BY c.session_id
    ORDER BY c.actualizada_en DESC
  `),
  getMensajesBySession: db.prepare(`
    SELECT id, rol, contenido, creado_en
    FROM mensajes
    WHERE session_id = ?
    ORDER BY creado_en ASC
  `)
};

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, status, body) {
  var payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end',  function ()  { resolve(Buffer.concat(chunks).toString()); });
    req.on('error', reject);
  });
}

function parseUrl(req) {
  var parsed = new URL(req.url, 'http://localhost');
  return {
    path:       parsed.pathname,
    businessId: parsed.searchParams.get('businessId') || null
  };
}

// ── Persistencia — chat ───────────────────────────────────────────────────────

function ensureSession(businessId, sessionId) {
  try { stmts.upsertSession.run({ business_id: businessId, session_id: sessionId }); }
  catch (e) { console.error('[DB] ensureSession:', e.message); }
}

function saveMessage(businessId, sessionId, rol, contenido) {
  try {
    stmts.insertMessage.run({ business_id: businessId, session_id: sessionId, rol, contenido });
    stmts.touchSession.run({ session_id: sessionId });
  } catch (e) { console.error('[DB] saveMessage:', e.message); }
}

function savePedidoIfDetected(businessId, sessionId, parsed) {
  if (!parsed || !parsed.pedido) return;
  try {
    stmts.insertPedido.run({
      business_id: businessId,
      session_id:  sessionId,
      detalles:    JSON.stringify(parsed.pedido)
    });
    console.log('[DB] Pedido creado — negocio:', businessId, 'sesión:', sessionId);
  } catch (e) { console.error('[DB] savePedido:', e.message); }
}

// ── System prompt desde config ────────────────────────────────────────────────

function buildSystemPromptFromConfig(cfg) {
  var menu = [];
  try { menu = JSON.parse(cfg.menu || '[]'); } catch (_) {}

  var menuText = menu.length
    ? menu.map(function (it) {
        var line = '- ' + it.nombre;
        if (it.precio)      line += ': '   + it.precio;
        if (it.descripcion) line += ' — ' + it.descripcion;
        return line;
      }).join('\n')
    : '';

  return (
    'Eres ' + cfg.bot_nombre + ', el asistente virtual de ' + cfg.nombre + '.\n\n' +
    'DESCRIPCIÓN DEL NEGOCIO:\n' + (cfg.descripcion || 'Negocio local.') + '\n\n' +
    (menuText      ? 'MENÚ DISPONIBLE:\n' + menuText + '\n\n' : '') +
    (cfg.horarios  ? 'HORARIOS: '   + cfg.horarios  + '\n' : '') +
    (cfg.direccion ? 'DIRECCIÓN: '  + cfg.direccion + '\n' : '') +
    (cfg.telefono  ? 'TELÉFONO: '   + cfg.telefono  + '\n\n' : '\n') +
    'PERSONALIDAD:\n' +
    '- Adaptate al tono del usuario\n' +
    '- Sé empático, servicial y conciso (máximo 3-4 oraciones)\n' +
    '- Solo respondé sobre lo que está en el contexto del negocio\n' +
    '- Nunca inventes precios ni datos que no estén en el contexto\n\n' +
    'DETECCIÓN DE CONTACTO HUMANO — pon humanContact:true si el usuario pide hablar con una persona.\n\n' +
    'FORMATO — responde SIEMPRE con este JSON exacto:\n' +
    '{"text":"tu respuesta","humanContact":false}\n' +
    'PROHIBIDO: markdown, texto fuera del JSON, comentarios.\n\n' +
    'DETECCIÓN DE PEDIDOS — cuando el usuario confirme un pedido, agregá el campo "pedido":\n' +
    '{"text":"¡Anotado!","humanContact":false,"pedido":{"items":[{"nombre":"...","cantidad":1,"precio":"$..."}],"total":"$...","notas":""}}\n' +
    'Si no hay pedido confirmado, omitir el campo "pedido".'
  );
}

function injectSystemPrompt(messages, cfg) {
  var result = messages.slice();
  var prompt = buildSystemPromptFromConfig(cfg);
  var idx    = result.findIndex(function (m) { return m.role === 'system'; });
  if (idx !== -1) {
    result[idx] = { role: 'system', content: prompt };
  } else {
    result.unshift({ role: 'system', content: prompt });
  }
  return result;
}

// ── Proxy a OpenAI ────────────────────────────────────────────────────────────

function forwardToOpenAI(messages, businessId, sessionId, res) {
  var payload = JSON.stringify({
    model:           'gpt-4o-mini',
    messages:        messages,
    response_format: { type: 'json_object' },
    max_tokens:      500,
    temperature:     0.7
  });

  var options = {
    hostname: 'api.openai.com',
    path:     '/v1/chat/completions',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  'Bearer ' + OPENAI_API_KEY,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  var proxyReq = https.request(options, function (proxyRes) {
    var chunks = [];
    proxyRes.on('data', function (c) { chunks.push(c); });
    proxyRes.on('end', function () {
      var raw = Buffer.concat(chunks).toString();
      res.writeHead(proxyRes.statusCode, {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(raw);

      if (proxyRes.statusCode === 200 && sessionId) {
        try {
          var content = JSON.parse(raw).choices[0].message.content;
          var parsed  = JSON.parse(content);
          saveMessage(businessId, sessionId, 'assistant', content);
          savePedidoIfDetected(businessId, sessionId, parsed);
        } catch (_) {}
      }
    });
  });

  proxyReq.on('error', function () { sendJSON(res, 502, { error: 'upstream_error' }); });
  proxyReq.write(payload);
  proxyReq.end();
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /negocios
function handleGetNegocios(res) {
  try {
    sendJSON(res, 200, stmts.getAllNegocios.all());
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// POST /negocios
function handleCreateNegocio(res, raw) {
  var body;
  try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var bid = String(body.business_id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  if (!bid || bid.length < 3 || bid.length > 50) {
    return sendJSON(res, 400, { error: 'business_id debe tener entre 3 y 50 caracteres (letras, números, guiones)' });
  }
  var nombre = String(body.nombre || 'Mi Negocio').slice(0, 100);
  try {
    stmts.createNegocio.run(bid, nombre);
    sendJSON(res, 201, { ok: true, business_id: bid, nombre: nombre });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return sendJSON(res, 409, { error: 'El business_id ya existe' });
    sendJSON(res, 500, { error: e.message });
  }
}

// DELETE /negocios/:businessId
function handleDeleteNegocio(businessId, res) {
  try {
    var info = stmts.deleteNegocio.run(businessId);
    if (info.changes === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /widget-config?businessId=xxx  (config visual para el widget)
function handleGetWidgetConfig(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var cfg = stmts.getNegocio.get(businessId);
  if (!cfg) return sendJSON(res, 404, { error: 'negocio no encontrado' });
  sendJSON(res, 200, {
    botName:        cfg.bot_nombre,
    botAvatar:      cfg.bot_avatar,
    primaryColor:   cfg.color_widget,
    welcomeMessage: cfg.welcome_msg
  });
}

// GET /config?businessId=xxx
function handleGetConfig(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var row = stmts.getNegocio.get(businessId);
  if (!row) return sendJSON(res, 404, { error: 'negocio no encontrado' });
  var cfg = Object.assign({}, row);
  try { cfg.menu = JSON.parse(row.menu); } catch (_) { cfg.menu = []; }
  sendJSON(res, 200, cfg);
}

// PUT /config?businessId=xxx
function handlePutConfig(businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body;
  try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  try {
    stmts.upsertConfig.run({
      business_id:    businessId,
      nombre:         String(body.nombre         || 'Mi Negocio').slice(0, 100),
      descripcion:    String(body.descripcion    || '').slice(0, 5000),
      menu:           JSON.stringify(Array.isArray(body.menu) ? body.menu : []),
      horarios:       String(body.horarios       || '').slice(0, 200),
      direccion:      String(body.direccion      || '').slice(0, 200),
      telefono:       String(body.telefono       || '').slice(0, 50),
      email_contacto: String(body.email_contacto || '').slice(0, 100),
      whatsapp:       String(body.whatsapp       || '').slice(0, 50),
      welcome_msg:    String(body.welcome_msg    || '¡Hola! ¿En qué puedo ayudarte?').slice(0, 300),
      bot_nombre:     String(body.bot_nombre     || 'Asistente').slice(0, 50),
      bot_avatar:     String(body.bot_avatar     || '🤖').slice(0, 10),
      color_widget:   /^#[0-9a-fA-F]{6}$/.test(body.color_widget) ? body.color_widget : '#6366f1'
    });
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /pedidos?businessId=xxx
function handleGetPedidos(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var rows = stmts.getPedidosByBusiness.all(businessId).map(function (r) {
      var det; try { det = JSON.parse(r.detalles); } catch (_) { det = {}; }
      return { id: r.id, session_id: r.session_id, detalles: det, estado: r.estado, creado_en: r.creado_en };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// PATCH /pedidos/:id?businessId=xxx
function handlePatchPedido(id, businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  if (!['pendiente','confirmado','cancelado'].includes(body.estado)) {
    return sendJSON(res, 400, { error: 'estado_invalido' });
  }
  try {
    var info = stmts.updatePedidoEstado.run({ id: id, business_id: businessId, estado: body.estado });
    if (info.changes === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true, id: id, estado: body.estado });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /conversaciones?businessId=xxx
function handleGetConversaciones(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var rows = stmts.getConversacionesByBusiness.all(businessId).map(function (r) {
      var ultimoTexto = r.ultimo_contenido || '';
      try { var p = JSON.parse(r.ultimo_contenido); if (p && p.text) ultimoTexto = p.text; } catch (_) {}
      return {
        session_id: r.session_id, creada_en: r.creada_en, actualizada_en: r.actualizada_en,
        total_mensajes: r.total_mensajes, mensajes_usuario: r.mensajes_usuario,
        total_pedidos: r.total_pedidos, ultimo_mensaje: ultimoTexto
      };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /conversaciones/:sessionId?businessId=xxx
function handleGetMensajes(sessionId, res) {
  try {
    var rows = stmts.getMensajesBySession.all(sessionId).map(function (r) {
      var texto = r.contenido;
      try { var p = JSON.parse(r.contenido); if (p && p.text) texto = p.text; } catch (_) {}
      return { id: r.id, rol: r.rol, texto: texto, creado_en: r.creado_en };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// ── Static file server ────────────────────────────────────────────────────────

var STATIC_FILES = {
  '/app':          { file: 'app.html',       mime: 'text/html' },
  '/app.html':     { file: 'app.html',       mime: 'text/html' },
  '/admin.html':   { file: 'admin.html',     mime: 'text/html' },
  '/dashboard.html':{ file: 'dashboard.html',mime: 'text/html' },
  '/config.html':  { file: 'config.html',    mime: 'text/html' },
  '/demo.html':    { file: 'demo.html',      mime: 'text/html' },
  '/widget.js':    { file: 'widget.js',      mime: 'application/javascript' }
};

function serveStatic(res, entry) {
  var fullPath = path.join(__dirname, entry.file);
  fs.readFile(fullPath, function (err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': entry.mime + '; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
  setCORSHeaders(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  var u   = parseUrl(req);
  var bid = u.businessId;

  // Static files
  if (req.method === 'GET' && STATIC_FILES[u.path]) {
    return serveStatic(res, STATIC_FILES[u.path]);
  }

  // GET /health  (Docker/load-balancer health check)
  if (req.method === 'GET' && u.path === '/health') {
    sendJSON(res, 200, { status: 'ok', ts: Date.now() });
    return;
  }

  // GET /negocios
  if (req.method === 'GET' && u.path === '/negocios') return handleGetNegocios(res);

  // POST /negocios
  if (req.method === 'POST' && u.path === '/negocios') {
    return readBody(req).then(function (r) { handleCreateNegocio(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // DELETE /negocios/:businessId
  var negMatch = u.path.match(/^\/negocios\/([^/]+)$/);
  if (req.method === 'DELETE' && negMatch) return handleDeleteNegocio(negMatch[1], res);

  // GET /widget-config?businessId=xxx
  if (req.method === 'GET' && u.path === '/widget-config') return handleGetWidgetConfig(bid, res);

  // GET /config?businessId=xxx
  if (req.method === 'GET' && u.path === '/config') return handleGetConfig(bid, res);

  // PUT /config?businessId=xxx
  if (req.method === 'PUT' && u.path === '/config') {
    return readBody(req).then(function (r) { handlePutConfig(bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // POST /chat  (businessId viene en el body)
  if (req.method === 'POST' && u.path === '/chat') {
    return readBody(req).then(function (raw) {
      var body; try { body = JSON.parse(raw); } catch (_) {
        return sendJSON(res, 400, { error: 'invalid_json' });
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return sendJSON(res, 400, { error: 'messages_required' });
      }
      var businessId = body.businessId || 'default';
      var sessionId  = body.sessionId  || null;

      var cfg = stmts.getNegocio.get(businessId);
      var messages = cfg
        ? injectSystemPrompt(body.messages, cfg)
        : body.messages;

      if (sessionId) {
        ensureSession(businessId, sessionId);
        for (var i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            saveMessage(businessId, sessionId, 'user', messages[i].content);
            break;
          }
        }
      }

      forwardToOpenAI(messages, businessId, sessionId, res);
    }).catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /pedidos?businessId=xxx
  if (req.method === 'GET' && u.path === '/pedidos') return handleGetPedidos(bid, res);

  // PATCH /pedidos/:id?businessId=xxx
  var pedMatch = u.path.match(/^\/pedidos\/(\d+)$/);
  if (req.method === 'PATCH' && pedMatch) {
    var pedId = parseInt(pedMatch[1], 10);
    return readBody(req).then(function (r) { handlePatchPedido(pedId, bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /conversaciones?businessId=xxx
  if (req.method === 'GET' && u.path === '/conversaciones') return handleGetConversaciones(bid, res);

  // GET /conversaciones/:sessionId?businessId=xxx
  var convMatch = u.path.match(/^\/conversaciones\/([^/]+)$/);
  if (req.method === 'GET' && convMatch) return handleGetMensajes(decodeURIComponent(convMatch[1]), res);

  res.writeHead(404); res.end();
});

server.listen(PORT, function () {
  console.log('Proxy corriendo en  http://localhost:' + PORT);
  console.log('App (cliente):      http://localhost:' + PORT + '/app?businessId=<id>');
  console.log('Admin (SaaS):       http://localhost:' + PORT + '/admin.html');
  console.log('Base de datos:     ', DB_PATH);
});
