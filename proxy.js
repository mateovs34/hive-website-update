/**
 * proxy.js — Servidor proxy multicliente para ChatWidget
 *
 * Base de datos: PostgreSQL via DATABASE_URL
 * Tablas: negocios, conversaciones, mensajes, pedidos
 *
 * Variables de entorno:
 *   OPENAI_API_KEY  (requerida) — clave de API de OpenAI
 *   DATABASE_URL    (requerida) — connection string de PostgreSQL
 *   PORT            (opcional, default 3001)
 *   NODE_ENV        (opcional, default development)
 *
 * Uso local:
 *   OPENAI_API_KEY=sk-... DATABASE_URL=postgres://... node proxy.js
 */

'use strict';

const http     = require('http');
const https    = require('https');
const fs       = require('fs');
const path     = require('path');
const { Pool } = require('pg');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const PORT           = process.env.PORT           || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL   = process.env.DATABASE_URL;
const SECRET_KEY           = process.env.SECRET_KEY           || 'changeme-in-production';
const ADMIN_PASSWORD       = process.env.ADMIN_PASSWORD       || null;
const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID   || null;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN    || null;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

if (!OPENAI_API_KEY) {
  console.error('Error: falta la variable de entorno OPENAI_API_KEY');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Error: falta la variable de entorno DATABASE_URL');
  process.exit(1);
}
if (SECRET_KEY === 'changeme-in-production') {
  console.warn('[Auth] ADVERTENCIA: usando SECRET_KEY por defecto. Configurá SECRET_KEY en producción.');
}

// ── Twilio ────────────────────────────────────────────────────────────────────

var twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('[Twilio] Cliente inicializado correctamente');
  } catch (e) {
    console.warn('[Twilio] No se pudo inicializar:', e.message);
  }
}
console.log('[Twilio] cliente:', twilioClient ? 'OK' : 'NULL - variables faltantes');
console.log('[Twilio] ACCOUNT_SID presente:', !!process.env.TWILIO_ACCOUNT_SID);
console.log('[Twilio] AUTH_TOKEN presente:', !!process.env.TWILIO_AUTH_TOKEN);
var _t = process.env.TWILIO_AUTH_TOKEN || '';
console.log('[Twilio] AUTH_TOKEN preview:', _t ? _t.slice(0, 4) + '…' + _t.slice(-4) : '(vacío)');

// ── Base de datos ─────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: DATABASE_URL });

// ── Schema ────────────────────────────────────────────────────────────────────

async function initSchema() {
  await pool.query(`
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
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversaciones (
      id             SERIAL PRIMARY KEY,
      business_id    TEXT NOT NULL DEFAULT 'default',
      session_id     TEXT NOT NULL UNIQUE,
      creada_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mensajes (
      id          SERIAL PRIMARY KEY,
      business_id TEXT NOT NULL DEFAULT 'default',
      session_id  TEXT NOT NULL REFERENCES conversaciones(session_id) ON DELETE CASCADE,
      rol         TEXT NOT NULL CHECK (rol IN ('user', 'assistant')),
      contenido   TEXT NOT NULL,
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id          SERIAL PRIMARY KEY,
      business_id TEXT NOT NULL DEFAULT 'default',
      session_id  TEXT NOT NULL REFERENCES conversaciones(session_id) ON DELETE CASCADE,
      detalles    TEXT NOT NULL,
      estado      TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_conv_business    ON conversaciones(business_id);
    CREATE INDEX IF NOT EXISTS idx_conv_session     ON conversaciones(session_id);
    CREATE INDEX IF NOT EXISTS idx_msg_session      ON mensajes(session_id);
    CREATE INDEX IF NOT EXISTS idx_msg_business     ON mensajes(business_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_session  ON pedidos(session_id);
    CREATE INDEX IF NOT EXISTS idx_pedidos_business ON pedidos(business_id);
  `);

  // Agregar password_hash si la tabla ya existía sin esa columna
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS password_hash TEXT`);

  // Ampliar estados de pedido (migración no destructiva)
  await pool.query(`ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check`);
  await pool.query(`
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('pendiente','confirmado','en_preparacion','en_camino','entregado','cancelado'))
  `);

  // Tablas de turnos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS disponibilidad (
      id               SERIAL PRIMARY KEY,
      business_id      TEXT NOT NULL REFERENCES negocios(business_id) ON DELETE CASCADE,
      dia_semana       INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      hora_inicio      TEXT NOT NULL DEFAULT '09:00',
      hora_fin         TEXT NOT NULL DEFAULT '18:00',
      duracion_minutos INTEGER NOT NULL DEFAULT 30,
      activo           BOOLEAN NOT NULL DEFAULT true,
      UNIQUE(business_id, dia_semana)
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id               SERIAL PRIMARY KEY,
      business_id      TEXT NOT NULL REFERENCES negocios(business_id) ON DELETE CASCADE,
      fecha            DATE NOT NULL,
      hora             TEXT NOT NULL,
      duracion_minutos INTEGER NOT NULL DEFAULT 30,
      nombre_cliente   TEXT NOT NULL DEFAULT '',
      telefono_cliente TEXT NOT NULL DEFAULT '',
      servicio         TEXT NOT NULL DEFAULT 'Consulta',
      estado           TEXT NOT NULL DEFAULT 'reservado'
                       CHECK (estado IN ('reservado','cancelado','completado')),
      session_id       TEXT,
      creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Columnas de turnos en negocios (migraciones no destructivas)
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS turnos_activos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS turno_servicio TEXT NOT NULL DEFAULT 'Consulta'`);

  // Asegurar que 'default' exista para datos huérfanos
  await pool.query(`
    INSERT INTO negocios (business_id, nombre)
    VALUES ('default', 'Negocio por defecto')
    ON CONFLICT (business_id) DO NOTHING
  `);

  console.log('PostgreSQL conectado y schema listo');
}

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

// ── Rate limiting ─────────────────────────────────────────────────────────────
//
//  chatLimitIp  : Map<ip,  { count, resetAt }>   — 20 req/hora por IP
//  chatLimitBid : Map<bid, { count, resetAt }>   — 100 req/hora por businessId
//  loginFails   : Map<ip,  { count, resetAt }>   — 5 intentos fallidos / 15 min

var chatLimitIp  = new Map();
var chatLimitBid = new Map();
var loginFails   = new Map();

var CHAT_IP_MAX   = 20;
var CHAT_BID_MAX  = 100;
var CHAT_WINDOW   = 60 * 60 * 1000;       // 1 hora en ms
var LOGIN_MAX     = 5;
var LOGIN_WINDOW  = 15 * 60 * 1000;       // 15 minutos en ms

// Limpieza automática cada hora
setInterval(function () {
  var now = Date.now();
  chatLimitIp.forEach(function (v, k)  { if (v.resetAt <= now) chatLimitIp.delete(k);  });
  chatLimitBid.forEach(function (v, k) { if (v.resetAt <= now) chatLimitBid.delete(k); });
  loginFails.forEach(function (v, k)   { if (v.resetAt <= now) loginFails.delete(k);   });
}, CHAT_WINDOW);

function checkChatLimit(ip, businessId) {
  var now = Date.now();

  // Por IP
  var ipEntry = chatLimitIp.get(ip);
  if (!ipEntry || ipEntry.resetAt <= now) {
    ipEntry = { count: 0, resetAt: now + CHAT_WINDOW };
    chatLimitIp.set(ip, ipEntry);
  }
  if (ipEntry.count >= CHAT_IP_MAX) return false;

  // Por businessId
  var bidEntry = chatLimitBid.get(businessId);
  if (!bidEntry || bidEntry.resetAt <= now) {
    bidEntry = { count: 0, resetAt: now + CHAT_WINDOW };
    chatLimitBid.set(businessId, bidEntry);
  }
  if (bidEntry.count >= CHAT_BID_MAX) return false;

  // Ambos dentro del límite: incrementar
  ipEntry.count++;
  bidEntry.count++;
  return true;
}

function recordLoginFail(ip) {
  var now = Date.now();
  var entry = loginFails.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW };
    loginFails.set(ip, entry);
  }
  entry.count++;
}

function clearLoginFails(ip) {
  loginFails.delete(ip);
}

function isLoginBlocked(ip) {
  var now   = Date.now();
  var entry = loginFails.get(ip);
  return !!(entry && entry.resetAt > now && entry.count >= LOGIN_MAX);
}

function getClientIp(req) {
  var fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '').trim();
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function verifyToken(req) {
  var header = req.headers['authorization'] || '';
  var token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;
  try { return jwt.verify(token, SECRET_KEY); }
  catch (_) { return null; }
}

function isAdmin(req) {
  var p = verifyToken(req);
  return !!(p && p.role === 'admin');
}

function isBusiness(req, businessId) {
  var p = verifyToken(req);
  if (!p) return false;
  return p.role === 'admin' || p.businessId === businessId;
}

function sendUnauthorized(res) {
  sendJSON(res, 401, { error: 'unauthorized' });
}

// ── Persistencia — chat ───────────────────────────────────────────────────────

async function ensureSession(businessId, sessionId) {
  try {
    await pool.query(
      `INSERT INTO conversaciones (business_id, session_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO NOTHING`,
      [businessId, sessionId]
    );
  } catch (e) { console.error('[DB] ensureSession:', e.message); }
}

async function saveMessage(businessId, sessionId, rol, contenido) {
  try {
    await pool.query(
      `INSERT INTO mensajes (business_id, session_id, rol, contenido)
       VALUES ($1, $2, $3, $4)`,
      [businessId, sessionId, rol, contenido]
    );
    await pool.query(
      `UPDATE conversaciones SET actualizada_en = NOW() WHERE session_id = $1`,
      [sessionId]
    );
  } catch (e) { console.error('[DB] saveMessage:', e.message); }
}

async function sendWhatsAppNotification(negocio, pedido) {
  console.log('[WhatsApp] intentando enviar a:', negocio.whatsapp);
  if (!twilioClient || !negocio.whatsapp) return;

  var items = Array.isArray(pedido.items) ? pedido.items : [];
  var itemsText = items.length
    ? items.map(function (it) {
        var line = '  • ';
        if (it.cantidad) line += 'x' + it.cantidad + ' ';
        line += (it.nombre || it.name || '?');
        if (it.precio) line += ' — ' + it.precio;
        return line;
      }).join('\n')
    : '  (sin detalle)';

  var hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  var body =
    '🔔 Nuevo pedido en ' + negocio.nombre + '\n' +
    '📋 ' + itemsText + '\n' +
    '💰 Total: ' + (pedido.total || '—') + '\n' +
    '🕐 ' + hora;

  var to = negocio.whatsapp.startsWith('whatsapp:')
    ? negocio.whatsapp
    : 'whatsapp:' + negocio.whatsapp;

  try {
    await twilioClient.messages.create({ from: TWILIO_WHATSAPP_FROM, to: to, body: body });
    console.log('[Twilio] WhatsApp enviado a', negocio.whatsapp, '— negocio:', negocio.business_id);
  } catch (e) {
    console.error('[Twilio] Error al enviar WhatsApp:', e.message);
  }
}

async function savePedidoIfDetected(businessId, sessionId, parsed) {
  if (!parsed || !parsed.pedido) return;
  try {
    await pool.query(
      `INSERT INTO pedidos (business_id, session_id, detalles)
       VALUES ($1, $2, $3)`,
      [businessId, sessionId, JSON.stringify(parsed.pedido)]
    );
    console.log('[DB] Pedido creado — negocio:', businessId, 'sesión:', sessionId);

    // Notificación WhatsApp (fire-and-forget, no interrumpe el flujo)
    pool.query(`SELECT nombre, whatsapp FROM negocios WHERE business_id = $1`, [businessId])
      .then(function (r) {
        var negocio = r.rows[0] || {};
        console.log('[WhatsApp] twilioClient activo:', !!twilioClient, 'whatsapp negocio:', negocio.whatsapp);
      })
      .catch(function () {});
    if (twilioClient) {
      pool.query(`SELECT nombre, whatsapp FROM negocios WHERE business_id = $1`, [businessId])
        .then(function (r) {
          if (r.rows.length && r.rows[0].whatsapp) {
            sendWhatsAppNotification(r.rows[0], parsed.pedido);
          }
        })
        .catch(function (e) { console.error('[Twilio] Error al obtener negocio:', e.message); });
    }
  } catch (e) { console.error('[DB] savePedido:', e.message); }
}

// ── Helpers de turnos ─────────────────────────────────────────────────────────

function generateSlots(horaInicio, horaFin, duracion) {
  var parts0 = horaInicio.split(':');
  var parts1 = horaFin.split(':');
  var start = parseInt(parts0[0], 10) * 60 + parseInt(parts0[1] || '0', 10);
  var end   = parseInt(parts1[0], 10) * 60 + parseInt(parts1[1] || '0', 10);
  var slots = [];
  for (var t = start; t + duracion <= end; t += duracion) {
    var hh = String(Math.floor(t / 60)).padStart(2, '0');
    var mm = String(t % 60).padStart(2, '0');
    slots.push(hh + ':' + mm);
  }
  return slots;
}

async function getTurnosContextForPrompt(businessId) {
  var lines = [];
  var today = new Date();
  for (var d = 0; d < 4; d++) {
    var fecha = new Date(today);
    fecha.setDate(today.getDate() + d);
    var dia = fecha.getDay();
    var fechaStr = fecha.toISOString().slice(0, 10);
    var dispRes = await pool.query(
      `SELECT * FROM disponibilidad WHERE business_id = $1 AND dia_semana = $2 AND activo = true`,
      [businessId, dia]
    );
    if (dispRes.rows.length === 0) continue;
    var disp = dispRes.rows[0];
    var all = generateSlots(disp.hora_inicio, disp.hora_fin, disp.duracion_minutos);
    var bookedRes = await pool.query(
      `SELECT hora FROM turnos WHERE business_id = $1 AND fecha = $2 AND estado = 'reservado'`,
      [businessId, fechaStr]
    );
    var bookedSet = new Set(bookedRes.rows.map(function (r) { return r.hora; }));
    var available = all.filter(function (s) { return !bookedSet.has(s); });
    if (available.length > 0) {
      lines.push(fechaStr + ': ' + available.join(', '));
    }
  }
  return lines.length
    ? 'TURNOS DISPONIBLES (próximos días):\n' + lines.join('\n')
    : 'TURNOS: No hay disponibilidad en los próximos días.';
}

async function saveTurnoIfDetected(businessId, sessionId, parsed) {
  if (!parsed || !parsed.turno) return;
  var t = parsed.turno;
  if (!t.fecha || !t.hora) return;
  try {
    await pool.query(`
      INSERT INTO turnos (business_id, fecha, hora, duracion_minutos, nombre_cliente, telefono_cliente, servicio, session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      businessId,
      t.fecha,
      t.hora,
      parseInt(t.duracion_minutos, 10) || 30,
      String(t.nombre_cliente   || '').slice(0, 100),
      String(t.telefono_cliente || '').slice(0, 50),
      String(t.servicio         || 'Consulta').slice(0, 100),
      sessionId || null
    ]);
    console.log('[DB] Turno creado — negocio:', businessId, 'fecha:', t.fecha, 'hora:', t.hora);
  } catch (e) { console.error('[DB] saveTurno:', e.message); }
}

// ── System prompt desde config ────────────────────────────────────────────────

function buildSystemPromptFromConfig(cfg, turnoContext) {
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

  var turnoInstructions = '';
  if (cfg.turnos_activos) {
    var servicio = cfg.turno_servicio || 'Consulta';
    turnoInstructions =
      'RESERVA DE TURNO — si el cliente quiere reservar un turno, seguí estos pasos:\n' +
      '1. Mostrá los horarios disponibles listados arriba.\n' +
      '2. Pedí nombre completo y teléfono de contacto.\n' +
      '3. Confirmá fecha y hora elegida.\n' +
      '4. Solo cuando el cliente confirme, incluí el campo "turno" en tu respuesta:\n' +
      '{"text":"¡Turno reservado!","humanContact":false,"turno":{"fecha":"YYYY-MM-DD","hora":"HH:MM","nombre_cliente":"...","telefono_cliente":"...","servicio":"' + servicio + '","duracion_minutos":30}}\n' +
      'Si no se está reservando un turno, omitir el campo "turno".\n\n';
  }

  return (
    'Eres ' + cfg.bot_nombre + ', el asistente virtual de ' + cfg.nombre + '.\n\n' +
    'DESCRIPCIÓN DEL NEGOCIO:\n' + (cfg.descripcion || 'Negocio local.') + '\n\n' +
    (menuText      ? 'MENÚ DISPONIBLE:\n' + menuText + '\n\n' : '') +
    (cfg.horarios  ? 'HORARIOS: '   + cfg.horarios  + '\n' : '') +
    (cfg.direccion ? 'DIRECCIÓN: '  + cfg.direccion + '\n' : '') +
    (cfg.telefono  ? 'TELÉFONO: '   + cfg.telefono  + '\n\n' : '\n') +
    (turnoContext  ? turnoContext + '\n\n' : '') +
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
    'Si no hay pedido confirmado, omitir el campo "pedido".\n\n' +
    turnoInstructions
  );
}

// System prompt para el bot de WhatsApp — flujo conversacional de pedido
function buildWhatsAppCustomerPrompt(cfg) {
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
    'Eres ' + cfg.bot_nombre + ', el asistente de pedidos de ' + cfg.nombre + ' por WhatsApp.\n\n' +
    'DESCRIPCIÓN DEL NEGOCIO:\n' + (cfg.descripcion || 'Negocio local.') + '\n\n' +
    (menuText      ? 'MENÚ DISPONIBLE:\n' + menuText + '\n\n' : '') +
    (cfg.horarios  ? 'HORARIOS: '   + cfg.horarios  + '\n'    : '') +
    (cfg.direccion ? 'DIRECCIÓN: '  + cfg.direccion + '\n'    : '') +
    (cfg.telefono  ? 'TELÉFONO: '   + cfg.telefono  + '\n\n'  : '\n') +
    'PERSONALIDAD:\n' +
    '- Tono amigable y conversacional, como si chateara con un amigo\n' +
    '- Respuestas cortas (1-3 oraciones máximo)\n' +
    '- Nunca inventes precios, sabores ni datos que no estén en el menú\n' +
    '- Solo respondé sobre el negocio y los pedidos\n\n' +
    'FLUJO DE PEDIDO — seguí SIEMPRE este orden antes de confirmar:\n' +
    '1. Si el cliente menciona un producto con variantes/sabores en el menú, preguntá cuál variante quiere.\n' +
    '2. Preguntá la cantidad (si no la dijo).\n' +
    '3. Preguntá si quiere extras o agregados disponibles en el menú.\n' +
    '4. Preguntá si quiere agregar algo más (otra comida, bebida, postre, etc.).\n' +
    '5. Solo cuando el cliente diga explícitamente que no quiere nada más o que quiere confirmar, resumí el pedido y pedile confirmación final.\n' +
    '6. Registrá el pedido únicamente DESPUÉS de que el cliente confirme explícitamente (por ejemplo: "sí", "confirmado", "eso es todo", "adelante").\n\n' +
    'REGLAS ESTRICTAS:\n' +
    '- NUNCA asumas detalles que el cliente no confirmó.\n' +
    '- NUNCA registres el pedido si el cliente solo mencionó un producto sin confirmar.\n' +
    '- NUNCA saltes pasos del flujo aunque el cliente parezca apurado.\n\n' +
    'DETECCIÓN DE CONTACTO HUMANO — pon humanContact:true si el usuario pide hablar con una persona.\n\n' +
    'FORMATO — responde SIEMPRE con este JSON exacto:\n' +
    '{"text":"tu respuesta","humanContact":false}\n' +
    'PROHIBIDO: markdown, texto fuera del JSON, comentarios.\n\n' +
    'REGISTRO DE PEDIDO — solo cuando el cliente confirmó explícitamente, agregá el campo "pedido":\n' +
    '{"text":"¡Pedido registrado! ...","humanContact":false,"pedido":{"items":[{"nombre":"...","cantidad":1,"precio":"$..."}],"total":"$...","notas":""}}\n' +
    'Si el pedido NO fue confirmado explícitamente por el cliente, NUNCA incluyas el campo "pedido".\n\n' +
    'AGRUPACIÓN DE ITEMS — cuando un producto lleva extras, salsas o agregados, registrarlo como UN SOLO item combinado:\n' +
    '  CORRECTO:   {"nombre":"Ravioles con salsa 4 quesos","cantidad":1,"precio":"$1000"}\n' +
    '  INCORRECTO: {"nombre":"Ravioles","cantidad":1,"precio":"$500"} + {"nombre":"Salsa 4 quesos","cantidad":1,"precio":"$500"}\n' +
    'El precio del item agrupado es la suma de producto + extras. Solo crear items separados para productos independientes entre sí (ej: una pasta y una bebida van en items distintos).'
  );
}

function injectSystemPrompt(messages, cfg, turnoContext) {
  var result = messages.slice();
  var prompt = buildSystemPromptFromConfig(cfg, turnoContext);
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
          saveMessage(businessId, sessionId, 'assistant', content).catch(function () {});
          savePedidoIfDetected(businessId, sessionId, parsed).catch(function () {});
          saveTurnoIfDetected(businessId, sessionId, parsed).catch(function () {});
        } catch (_) {}
      }
    });
  });

  proxyReq.on('error', function () { sendJSON(res, 502, { error: 'upstream_error' }); });
  proxyReq.write(payload);
  proxyReq.end();
}

// ── callOpenAI (async, retorna el contenido como string) ─────────────────────

function callOpenAI(messages, jsonMode) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      model:           'gpt-4o-mini',
      messages:        messages,
      max_tokens:      500,
      temperature:     0.7,
      response_format: jsonMode ? { type: 'json_object' } : undefined
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
        try {
          var data    = JSON.parse(Buffer.concat(chunks).toString());
          var content = data.choices[0].message.content;
          resolve(content);
        } catch (e) { reject(e); }
      });
    });
    proxyReq.on('error', reject);
    proxyReq.write(payload);
    proxyReq.end();
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /negocios
async function handleGetNegocios(res) {
  try {
    var result = await pool.query(`
      SELECT
        n.business_id, n.nombre, n.bot_avatar, n.color_widget,
        n.activo, n.creado_en, n.actualizado_en,
        COUNT(DISTINCT c.session_id)                                           AS total_conversaciones,
        COUNT(p.id)                                                             AS total_pedidos,
        SUM(CASE WHEN p.creado_en::date = CURRENT_DATE THEN 1 ELSE 0 END)     AS pedidos_hoy,
        MAX(p.creado_en)                                                        AS ultimo_pedido_en
      FROM negocios n
      LEFT JOIN conversaciones c ON c.business_id = n.business_id
      LEFT JOIN pedidos        p ON p.business_id = n.business_id
      GROUP BY n.business_id, n.nombre, n.bot_avatar, n.color_widget,
               n.activo, n.creado_en, n.actualizado_en
      ORDER BY n.creado_en DESC
    `);
    sendJSON(res, 200, result.rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// POST /negocios
async function handleCreateNegocio(res, raw) {
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
    await pool.query(
      `INSERT INTO negocios (business_id, nombre) VALUES ($1, $2)`,
      [bid, nombre]
    );
    sendJSON(res, 201, { ok: true, business_id: bid, nombre: nombre });
  } catch (e) {
    if (e.code === '23505') return sendJSON(res, 409, { error: 'El business_id ya existe' });
    sendJSON(res, 500, { error: e.message });
  }
}

// DELETE /negocios/:businessId
async function handleDeleteNegocio(businessId, res) {
  try {
    var result = await pool.query(
      `DELETE FROM negocios WHERE business_id = $1`,
      [businessId]
    );
    if (result.rowCount === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /widget-config?businessId=xxx
async function handleGetWidgetConfig(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(`SELECT * FROM negocios WHERE business_id = $1`, [businessId]);
    if (result.rows.length === 0) return sendJSON(res, 404, { error: 'negocio no encontrado' });
    var cfg = result.rows[0];
    sendJSON(res, 200, {
      botName:        cfg.bot_nombre,
      botAvatar:      cfg.bot_avatar,
      primaryColor:   cfg.color_widget,
      welcomeMessage: cfg.welcome_msg
    });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /config?businessId=xxx
async function handleGetConfig(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(`SELECT * FROM negocios WHERE business_id = $1`, [businessId]);
    if (result.rows.length === 0) return sendJSON(res, 404, { error: 'negocio no encontrado' });
    var row = result.rows[0];
    var cfg = Object.assign({}, row);
    try { cfg.menu = JSON.parse(row.menu); } catch (_) { cfg.menu = []; }
    sendJSON(res, 200, cfg);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// PUT /config?businessId=xxx
async function handlePutConfig(businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body;
  try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  try {
    await pool.query(`
      INSERT INTO negocios
        (business_id, nombre, descripcion, menu, horarios, direccion, telefono,
         email_contacto, whatsapp, welcome_msg, bot_nombre, bot_avatar,
         color_widget, turnos_activos, turno_servicio, actualizado_en)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (business_id) DO UPDATE SET
        nombre         = EXCLUDED.nombre,
        descripcion    = EXCLUDED.descripcion,
        menu           = EXCLUDED.menu,
        horarios       = EXCLUDED.horarios,
        direccion      = EXCLUDED.direccion,
        telefono       = EXCLUDED.telefono,
        email_contacto = EXCLUDED.email_contacto,
        whatsapp       = EXCLUDED.whatsapp,
        welcome_msg    = EXCLUDED.welcome_msg,
        bot_nombre     = EXCLUDED.bot_nombre,
        bot_avatar     = EXCLUDED.bot_avatar,
        color_widget   = EXCLUDED.color_widget,
        turnos_activos = EXCLUDED.turnos_activos,
        turno_servicio = EXCLUDED.turno_servicio,
        actualizado_en = NOW()
    `, [
      businessId,
      String(body.nombre         || 'Mi Negocio').slice(0, 100),
      String(body.descripcion    || '').slice(0, 5000),
      JSON.stringify(Array.isArray(body.menu) ? body.menu : []),
      String(body.horarios       || '').slice(0, 200),
      String(body.direccion      || '').slice(0, 200),
      String(body.telefono       || '').slice(0, 50),
      String(body.email_contacto || '').slice(0, 100),
      String(body.whatsapp       || '').slice(0, 50),
      String(body.welcome_msg    || '¡Hola! ¿En qué puedo ayudarte?').slice(0, 300),
      String(body.bot_nombre     || 'Asistente').slice(0, 50),
      String(body.bot_avatar     || '🤖').slice(0, 10),
      /^#[0-9a-fA-F]{6}$/.test(body.color_widget) ? body.color_widget : '#6366f1',
      body.turnos_activos ? 1 : 0,
      String(body.turno_servicio || 'Consulta').slice(0, 100)
    ]);
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /pedidos?businessId=xxx
async function handleGetPedidos(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(`
      SELECT id, session_id, detalles, estado, creado_en
      FROM pedidos
      WHERE business_id = $1
      ORDER BY
        CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END,
        creado_en DESC
    `, [businessId]);
    var rows = result.rows.map(function (r) {
      var det; try { det = JSON.parse(r.detalles); } catch (_) { det = {}; }
      return { id: r.id, session_id: r.session_id, detalles: det, estado: r.estado, creado_en: r.creado_en };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

var ESTADOS_VALIDOS = ['pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];

var WA_MENSAJES_ESTADO = {
  confirmado:     '✅ Tu pedido fue confirmado. ¡Ya lo estamos preparando!',
  en_preparacion: '👨‍🍳 Tu pedido está en preparación.',
  en_camino:      '🛵 Tu pedido está en camino. ¡Ya llega!',
  entregado:      '📦 Tu pedido fue entregado. ¡Gracias por tu compra!',
  cancelado:      '❌ Tu pedido fue cancelado. Disculpá los inconvenientes.'
};

// PATCH /pedidos/:id?businessId=xxx
async function handlePatchPedido(id, businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  if (!ESTADOS_VALIDOS.includes(body.estado)) {
    return sendJSON(res, 400, { error: 'estado_invalido' });
  }
  try {
    var result = await pool.query(
      `UPDATE pedidos SET estado = $1 WHERE id = $2 AND business_id = $3 RETURNING session_id`,
      [body.estado, id, businessId]
    );
    if (result.rowCount === 0) return sendJSON(res, 404, { error: 'not_found' });

    // Notificación WhatsApp al cliente si el pedido vino por WhatsApp (session_id "wa_...")
    var sessionId = result.rows[0].session_id;
    var msgCliente = WA_MENSAJES_ESTADO[body.estado];
    if (twilioClient && msgCliente && sessionId && sessionId.startsWith('wa_')) {
      var numero = sessionId.replace(/^wa_/, '');
      var to = 'whatsapp:+' + numero;
      twilioClient.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to:   to,
        body: msgCliente
      }).catch(function (e) {
        console.error('[Twilio] Error notificando cliente:', e.message);
      });
    }

    sendJSON(res, 200, { ok: true, id: id, estado: body.estado });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// ── Handlers de disponibilidad y turnos ──────────────────────────────────────

// GET /disponibilidad?businessId=xxx
async function handleGetDisponibilidad(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(
      `SELECT id, dia_semana, hora_inicio, hora_fin, duracion_minutos, activo
       FROM disponibilidad WHERE business_id = $1 ORDER BY dia_semana`,
      [businessId]
    );
    sendJSON(res, 200, result.rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// PUT /disponibilidad?businessId=xxx  — body: array de {dia_semana, hora_inicio, hora_fin, duracion_minutos, activo}
async function handlePutDisponibilidad(businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  if (!Array.isArray(body)) return sendJSON(res, 400, { error: 'se esperaba un array' });
  try {
    for (var i = 0; i < body.length; i++) {
      var d = body[i];
      if (d.dia_semana == null) continue;
      await pool.query(`
        INSERT INTO disponibilidad (business_id, dia_semana, hora_inicio, hora_fin, duracion_minutos, activo)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (business_id, dia_semana) DO UPDATE SET
          hora_inicio      = EXCLUDED.hora_inicio,
          hora_fin         = EXCLUDED.hora_fin,
          duracion_minutos = EXCLUDED.duracion_minutos,
          activo           = EXCLUDED.activo
      `, [
        businessId,
        parseInt(d.dia_semana, 10),
        String(d.hora_inicio      || '09:00').slice(0, 5),
        String(d.hora_fin         || '18:00').slice(0, 5),
        parseInt(d.duracion_minutos, 10) || 30,
        d.activo ? true : false
      ]);
    }
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /turnos?businessId=xxx&fecha=YYYY-MM-DD
async function handleGetTurnos(businessId, res, query) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var where = `WHERE business_id = $1`;
    var params = [businessId];
    if (query.fecha) {
      params.push(query.fecha);
      where += ` AND fecha = $` + params.length;
    }
    var result = await pool.query(
      `SELECT id, fecha, hora, duracion_minutos, nombre_cliente, telefono_cliente, servicio, estado, session_id, creado_en
       FROM turnos ${where} ORDER BY fecha, hora`,
      params
    );
    sendJSON(res, 200, result.rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /turnos/disponibles?businessId=xxx&fecha=YYYY-MM-DD  (público)
async function handleGetTurnosDisponibles(businessId, res, query) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var fecha = query.fecha || new Date().toISOString().slice(0, 10);
  try {
    var fechaObj = new Date(fecha + 'T00:00:00Z');
    var dia = fechaObj.getUTCDay();
    var dispRes = await pool.query(
      `SELECT * FROM disponibilidad WHERE business_id = $1 AND dia_semana = $2 AND activo = true`,
      [businessId, dia]
    );
    if (dispRes.rows.length === 0) return sendJSON(res, 200, []);
    var disp = dispRes.rows[0];
    var all = generateSlots(disp.hora_inicio, disp.hora_fin, disp.duracion_minutos);
    var bookedRes = await pool.query(
      `SELECT hora FROM turnos WHERE business_id = $1 AND fecha = $2 AND estado = 'reservado'`,
      [businessId, fecha]
    );
    var bookedSet = new Set(bookedRes.rows.map(function (r) { return r.hora; }));
    var available = all.filter(function (s) { return !bookedSet.has(s); });
    sendJSON(res, 200, available);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// POST /turnos?businessId=xxx  (público — puede venir del widget/bot)
async function handlePostTurno(businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  if (!body.fecha || !body.hora) return sendJSON(res, 400, { error: 'fecha y hora requeridos' });
  try {
    // Verificar que el slot esté disponible
    var existing = await pool.query(
      `SELECT id FROM turnos WHERE business_id = $1 AND fecha = $2 AND hora = $3 AND estado = 'reservado'`,
      [businessId, body.fecha, body.hora]
    );
    if (existing.rows.length > 0) return sendJSON(res, 409, { error: 'horario_ocupado' });

    var result = await pool.query(`
      INSERT INTO turnos (business_id, fecha, hora, duracion_minutos, nombre_cliente, telefono_cliente, servicio, session_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [
      businessId,
      body.fecha,
      body.hora,
      parseInt(body.duracion_minutos, 10) || 30,
      String(body.nombre_cliente   || '').slice(0, 100),
      String(body.telefono_cliente || '').slice(0, 50),
      String(body.servicio         || 'Consulta').slice(0, 100),
      body.session_id || null
    ]);
    sendJSON(res, 201, { ok: true, id: result.rows[0].id });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// PATCH /turnos/:id?businessId=xxx
async function handlePatchTurno(id, businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var estadosValidos = ['reservado', 'cancelado', 'completado'];
  if (!estadosValidos.includes(body.estado)) return sendJSON(res, 400, { error: 'estado_invalido' });
  try {
    var result = await pool.query(
      `UPDATE turnos SET estado = $1 WHERE id = $2 AND business_id = $3 RETURNING id`,
      [body.estado, id, businessId]
    );
    if (result.rowCount === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true, id: id, estado: body.estado });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /conversaciones?businessId=xxx
async function handleGetConversaciones(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(`
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
      WHERE c.business_id = $1
      GROUP BY c.session_id, c.creada_en, c.actualizada_en
      ORDER BY c.actualizada_en DESC
    `, [businessId]);
    var rows = result.rows.map(function (r) {
      var ultimoTexto = r.ultimo_contenido || '';
      try { var p = JSON.parse(r.ultimo_contenido); if (p && p.text) ultimoTexto = p.text; } catch (_) {}
      return {
        session_id:      r.session_id,
        creada_en:       r.creada_en,
        actualizada_en:  r.actualizada_en,
        total_mensajes:  r.total_mensajes,
        mensajes_usuario: r.mensajes_usuario,
        total_pedidos:   r.total_pedidos,
        ultimo_mensaje:  ultimoTexto
      };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /conversaciones/:sessionId
async function handleGetMensajes(sessionId, res) {
  try {
    var result = await pool.query(`
      SELECT id, rol, contenido, creado_en
      FROM mensajes
      WHERE session_id = $1
      ORDER BY creado_en ASC
    `, [sessionId]);
    var rows = result.rows.map(function (r) {
      var texto = r.contenido;
      try { var p = JSON.parse(r.contenido); if (p && p.text) texto = p.text; } catch (_) {}
      return { id: r.id, rol: r.rol, texto: texto, creado_en: r.creado_en };
    });
    sendJSON(res, 200, rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

// POST /auth/register
async function handleRegister(res, raw) {
  var body;
  try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var bid    = String(body.businessId || body.business_id || '').toLowerCase()
                 .replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  var nombre = String(body.nombre || 'Mi Negocio').slice(0, 100);
  var pass   = String(body.password || '');
  if (!bid || bid.length < 3 || bid.length > 50) {
    return sendJSON(res, 400, { error: 'businessId inválido (3-50 caracteres: letras, números, guiones)' });
  }
  if (pass.length < 6) {
    return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  try {
    var hash  = await bcrypt.hash(pass, 10);
    await pool.query(
      `INSERT INTO negocios (business_id, nombre, password_hash) VALUES ($1, $2, $3)`,
      [bid, nombre, hash]
    );
    var token = jwt.sign({ businessId: bid, role: 'business' }, SECRET_KEY, { expiresIn: '7d' });
    sendJSON(res, 201, { ok: true, token: token, businessId: bid, nombre: nombre });
  } catch (e) {
    if (e.code === '23505') return sendJSON(res, 409, { error: 'El business_id ya existe' });
    sendJSON(res, 500, { error: e.message });
  }
}

// POST /auth/login
async function handleLogin(res, raw, ip) {
  var body;
  try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var pass = String(body.password || '');

  // Admin login (sin businessId)
  if (!body.businessId) {
    if (!ADMIN_PASSWORD) return sendJSON(res, 403, { error: 'Admin no configurado (falta ADMIN_PASSWORD)' });
    if (pass !== ADMIN_PASSWORD) {
      if (ip) recordLoginFail(ip);
      return sendJSON(res, 401, { error: 'Contraseña incorrecta' });
    }
    if (ip) clearLoginFails(ip);
    var tok = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '24h' });
    return sendJSON(res, 200, { ok: true, token: tok, role: 'admin' });
  }

  // Business login
  var bid = String(body.businessId).toLowerCase().trim();
  try {
    var result = await pool.query(
      `SELECT business_id, nombre, password_hash FROM negocios WHERE business_id = $1`,
      [bid]
    );
    if (result.rows.length === 0) {
      if (ip) recordLoginFail(ip);
      return sendJSON(res, 401, { error: 'Credenciales inválidas' });
    }
    var row = result.rows[0];
    if (!row.password_hash) {
      if (ip) recordLoginFail(ip);
      return sendJSON(res, 401, { error: 'Este negocio no tiene contraseña configurada' });
    }
    var valid = await bcrypt.compare(pass, row.password_hash);
    if (!valid) {
      if (ip) recordLoginFail(ip);
      return sendJSON(res, 401, { error: 'Credenciales inválidas' });
    }
    if (ip) clearLoginFails(ip);
    var token = jwt.sign({ businessId: bid, role: 'business' }, SECRET_KEY, { expiresIn: '7d' });
    sendJSON(res, 200, { ok: true, token: token, businessId: bid, nombre: row.nombre });
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
}

// GET /auth/verify
function handleVerify(req, res) {
  var payload = verifyToken(req);
  if (!payload) return sendJSON(res, 401, { error: 'Token inválido o expirado' });
  sendJSON(res, 200, {
    valid:      true,
    businessId: payload.businessId || null,
    role:       payload.role || 'business'
  });
}

// ── WhatsApp webhook ──────────────────────────────────────────────────────────

async function handleWhatsAppWebhook(req, res) {
  var raw    = await readBody(req);
  var params = new URLSearchParams(raw);
  var from   = params.get('From') || '';   // whatsapp:+549...
  var body   = params.get('Body') || '';

  function twimlReply(text) {
    var safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    var xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + safe + '</Message></Response>';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(xml);
  }

  if (!from || !body.trim()) {
    return twimlReply('Mensaje no válido.');
  }

  var senderPhone = from.replace(/^whatsapp:/i, '').trim();
  var u           = parseUrl(req);
  var businessId  = u.businessId || 'default';

  var negResult = await pool.query(
    `SELECT * FROM negocios WHERE business_id = $1`,
    [businessId]
  );
  if (negResult.rows.length === 0) {
    return twimlReply('Negocio no encontrado.');
  }

  var negocio    = negResult.rows[0];
  var ownerPhone = (negocio.whatsapp || '').replace(/^whatsapp:/i, '').trim();
  var isOwner    = ownerPhone && ownerPhone === senderPhone;

  // ── Flujo dueño: contexto completo + GPT ──────────────────────────────────
  if (isOwner) {
    try {
      // Consultas en paralelo para minimizar latencia
      var results = await Promise.all([
        // Métricas de conteo
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE creado_en::date = CURRENT_DATE)        AS pedidos_hoy,
            COUNT(*) FILTER (WHERE estado = 'pendiente')                  AS pendientes,
            COUNT(*) FILTER (WHERE estado = 'confirmado')                 AS confirmados,
            COUNT(*) FILTER (WHERE estado = 'cancelado')                  AS cancelados,
            COUNT(*) FILTER (WHERE creado_en >= NOW() - INTERVAL '1 hour') AS ultima_hora,
            COUNT(*)                                                       AS total_historico
          FROM pedidos WHERE business_id = $1
        `, [businessId]),

        // Últimos 10 pedidos con detalle completo
        pool.query(`
          SELECT detalles, estado, creado_en
          FROM pedidos
          WHERE business_id = $1
          ORDER BY creado_en DESC LIMIT 10
        `, [businessId])
      ]);

      var counts  = results[0].rows[0];
      var ultRows = results[1].rows;

      // Parsear detalles de cada pedido
      var ultimos = ultRows.map(function (r) {
        var d; try { d = JSON.parse(r.detalles); } catch (_) { d = {}; }
        return { detalles: d, estado: r.estado, creado_en: r.creado_en };
      });

      // Calcular facturación desde los campos "total" del JSON de detalles
      function parseMonto(str) {
        if (!str) return 0;
        var n = parseFloat(String(str).replace(/[^0-9.,]/g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      }

      var ahora        = new Date();
      var inicioHoy    = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      var hace1hora    = new Date(ahora.getTime() - 60 * 60 * 1000);

      // Facturación solo de pedidos confirmados
      var facturadoHoy = 0;
      var facturadoTotal = 0;
      var facturadoUltimaHora = 0;
      var pedidosHoyArr = [];

      // Para poder responder "qué se vendió más", contar items
      var itemConteo = {};

      ultimos.forEach(function (p) {
        var monto = parseMonto(p.detalles.total);
        var fecha = new Date(p.creado_en);
        if (p.estado === 'confirmado') {
          facturadoTotal += monto;
          if (fecha >= inicioHoy) {
            facturadoHoy += monto;
            pedidosHoyArr.push(p);
          }
          if (fecha >= hace1hora) facturadoUltimaHora += monto;
        }
        // Conteo de items (todos los estados para responder "qué se pidió más")
        if (Array.isArray(p.detalles.items)) {
          p.detalles.items.forEach(function (it) {
            var nombre = it.nombre || it.name || '?';
            itemConteo[nombre] = (itemConteo[nombre] || 0) + (parseInt(it.cantidad) || 1);
          });
        }
      });

      var ticketPromedio = (parseInt(counts.confirmados) > 0)
        ? (facturadoTotal / parseInt(counts.confirmados)).toFixed(2)
        : 0;

      // Top 5 productos más pedidos
      var topItems = Object.entries(itemConteo)
        .sort(function (a, b) { return b[1] - a[1]; })
        .slice(0, 5)
        .map(function (e) { return '  • ' + e[0] + ': ' + e[1] + ' unid.'; })
        .join('\n') || '  (sin datos)';

      // Detalle de los últimos 10 pedidos
      var ultimosText = ultimos.length
        ? ultimos.map(function (p) {
            var items = Array.isArray(p.detalles.items)
              ? p.detalles.items.map(function (i) {
                  return (i.cantidad ? 'x' + i.cantidad + ' ' : '') + (i.nombre || i.name || '?');
                }).join(', ')
              : '?';
            var total = p.detalles.total || '—';
            var hora  = new Date(p.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            var fecha = new Date(p.creado_en).toLocaleDateString('es-AR');
            return '  • [' + p.estado + '] ' + items + ' | Total: ' + total + ' | ' + fecha + ' ' + hora;
          }).join('\n')
        : '  (sin pedidos aún)';

      // Menú completo
      var menu = [];
      try { menu = JSON.parse(negocio.menu || '[]'); } catch (_) {}
      var menuText = menu.length
        ? menu.map(function (it) {
            var line = '  • ' + it.nombre;
            if (it.precio)      line += ' (' + it.precio + ')';
            if (it.descripcion) line += ' — ' + it.descripcion;
            if (it.categoria)   line += ' [' + it.categoria + ']';
            return line;
          }).join('\n')
        : '  (sin menú configurado)';

      var systemPrompt =
        'Eres el asistente de negocio de ' + negocio.nombre + '. ' +
        'El dueño te consulta por WhatsApp. ' +
        'Respondé en texto plano (sin markdown, sin asteriscos), de forma directa y concisa. ' +
        'Usá los datos reales provistos para responder cualquier consulta de ventas, productos o configuración.\n\n' +

        '══ CONFIGURACIÓN DEL NEGOCIO ══\n' +
        'Nombre: ' + negocio.nombre + '\n' +
        (negocio.descripcion ? 'Descripción: ' + negocio.descripcion + '\n' : '') +
        (negocio.horarios    ? 'Horarios: '    + negocio.horarios    + '\n' : '') +
        (negocio.direccion   ? 'Dirección: '   + negocio.direccion   + '\n' : '') +
        (negocio.telefono    ? 'Teléfono: '    + negocio.telefono    + '\n' : '') +
        '\n' +

        '══ MÉTRICAS DE HOY ══\n' +
        'Pedidos hoy: '          + counts.pedidos_hoy  + '\n' +
        'Pendientes: '           + counts.pendientes   + '\n' +
        'Confirmados: '          + counts.confirmados  + '\n' +
        'Cancelados: '           + counts.cancelados   + '\n' +
        'Última hora: '          + counts.ultima_hora  + ' pedidos\n' +
        'Facturado hoy (conf.): $' + facturadoHoy.toFixed(2) + '\n' +
        'Facturado última hora: $' + facturadoUltimaHora.toFixed(2) + '\n' +
        '\n' +

        '══ HISTÓRICO TOTAL ══\n' +
        'Total pedidos: '        + counts.total_historico + '\n' +
        'Total facturado (conf.): $' + facturadoTotal.toFixed(2) + '\n' +
        'Ticket promedio: $'     + ticketPromedio + '\n' +
        '\n' +

        '══ PRODUCTOS MÁS PEDIDOS (histórico) ══\n' +
        topItems + '\n\n' +

        '══ MENÚ COMPLETO ══\n' +
        menuText + '\n\n' +

        '══ ÚLTIMOS 10 PEDIDOS ══\n' +
        ultimosText;

      var ownerMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: body.trim()  }
      ];

      var reply = await callOpenAI(ownerMessages, false);
      return twimlReply(reply.trim());
    } catch (e) {
      console.error('[Webhook] Error flujo dueño:', e.message);
      return twimlReply('Error al consultar los datos. Intentá de nuevo.');
    }
  }

  // ── Flujo cliente: chatbot normal ───────────────────────────────────────────
  try {
    var sessionId = 'wa_' + senderPhone.replace(/[^0-9]/g, '');

    await ensureSession(businessId, sessionId);

    // Historial reciente (últimos 10 mensajes, en orden cronológico)
    var histResult = await pool.query(`
      SELECT rol, contenido FROM mensajes
      WHERE session_id = $1
      ORDER BY creado_en DESC LIMIT 10
    `, [sessionId]);
    var history = histResult.rows.reverse().map(function (r) {
      return { role: r.rol, content: r.contenido };
    });

    // Guardar mensaje del usuario
    await saveMessage(businessId, sessionId, 'user', body.trim());

    // Construir mensajes para GPT con system prompt conversacional de WhatsApp
    var waPrompt = buildWhatsAppCustomerPrompt(negocio);
    var chatMessages = [{ role: 'system', content: waPrompt }]
      .concat(history)
      .concat([{ role: 'user', content: body.trim() }]);

    var replyContent = await callOpenAI(chatMessages, true);

    var parsed;
    try { parsed = JSON.parse(replyContent); } catch (_) { parsed = { text: replyContent }; }
    var replyText = (parsed && parsed.text) ? parsed.text : replyContent;

    // Guardar respuesta y detectar pedido (fire-and-forget)
    saveMessage(businessId, sessionId, 'assistant', replyContent).catch(function () {});
    savePedidoIfDetected(businessId, sessionId, parsed).catch(function () {});

    return twimlReply(replyText);
  } catch (e) {
    console.error('[Webhook] Error flujo cliente:', e.message);
    return twimlReply('Lo siento, hubo un error. Intentá de nuevo en un momento.');
  }
}

// ── Static file server ────────────────────────────────────────────────────────

var STATIC_FILES = {
  '/app':           { file: 'app.html',        mime: 'text/html' },
  '/app.html':      { file: 'app.html',        mime: 'text/html' },
  '/admin.html':    { file: 'admin.html',      mime: 'text/html' },
  '/dashboard.html':{ file: 'dashboard.html',  mime: 'text/html' },
  '/config.html':   { file: 'config.html',     mime: 'text/html' },
  '/demo.html':     { file: 'demo.html',       mime: 'text/html' },
  '/widget.js':     { file: 'widget.js',       mime: 'application/javascript' },
  '/tour.html':     { file: 'tour.html',       mime: 'text/html' },
  '/tour':          { file: 'tour.html',       mime: 'text/html' }
};

function serveStatic(res, entry) {
  var fullPath = path.join(__dirname, entry.file);
  fs.readFile(fullPath, function (err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type':  entry.mime + '; charset=utf-8',
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

  // ── Auth endpoints (públicos) ─────────────────────────────────────────────

  if (req.method === 'POST' && u.path === '/auth/register') {
    return readBody(req).then(function (r) { return handleRegister(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  if (req.method === 'POST' && u.path === '/auth/login') {
    var loginIp = getClientIp(req);
    if (isLoginBlocked(loginIp)) {
      return sendJSON(res, 429, { error: 'Demasiados intentos, esperá 15 minutos' });
    }
    return readBody(req).then(function (r) { return handleLogin(res, r, loginIp); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  if (req.method === 'GET' && u.path === '/auth/verify') {
    return handleVerify(req, res);
  }

  // ── Admin endpoints (requieren rol admin) ─────────────────────────────────

  // GET /negocios
  if (req.method === 'GET' && u.path === '/negocios') {
    if (!isAdmin(req)) return sendUnauthorized(res);
    return handleGetNegocios(res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /negocios
  if (req.method === 'POST' && u.path === '/negocios') {
    if (!isAdmin(req)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handleCreateNegocio(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // DELETE /negocios/:businessId
  var negMatch = u.path.match(/^\/negocios\/([^/]+)$/);
  if (req.method === 'DELETE' && negMatch) {
    if (!isAdmin(req)) return sendUnauthorized(res);
    return handleDeleteNegocio(negMatch[1], res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // ── Endpoints públicos del widget ─────────────────────────────────────────

  // GET /widget-config?businessId=xxx  (público — lo usa el widget)
  if (req.method === 'GET' && u.path === '/widget-config') {
    return handleGetWidgetConfig(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /chat  (público — lo usa el widget)
  if (req.method === 'POST' && u.path === '/chat') {
    return readBody(req).then(async function (raw) {
      var chatIp = getClientIp(req);
      var body; try { body = JSON.parse(raw); } catch (_) {
        return sendJSON(res, 400, { error: 'invalid_json' });
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return sendJSON(res, 400, { error: 'messages_required' });
      }
      var businessId = body.businessId || 'default';
      var sessionId  = body.sessionId  || null;

      if (!checkChatLimit(chatIp, businessId)) {
        return sendJSON(res, 429, { error: 'Límite de mensajes alcanzado, intentá en unos minutos' });
      }

      var cfgResult = await pool.query(`SELECT * FROM negocios WHERE business_id = $1`, [businessId]);
      var cfg       = cfgResult.rows[0] || null;
      var turnoCtx  = null;
      if (cfg && cfg.turnos_activos) {
        try { turnoCtx = await getTurnosContextForPrompt(businessId); } catch (_) {}
      }
      var messages  = cfg ? injectSystemPrompt(body.messages, cfg, turnoCtx) : body.messages;

      if (sessionId) {
        await ensureSession(businessId, sessionId);
        for (var i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            await saveMessage(businessId, sessionId, 'user', messages[i].content);
            break;
          }
        }
      }

      forwardToOpenAI(messages, businessId, sessionId, res);
    }).catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // ── Endpoints de negocio (requieren JWT del propietario) ──────────────────

  // GET /config?businessId=xxx
  if (req.method === 'GET' && u.path === '/config') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetConfig(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // PUT /config?businessId=xxx
  if (req.method === 'PUT' && u.path === '/config') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handlePutConfig(bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /pedidos?businessId=xxx
  if (req.method === 'GET' && u.path === '/pedidos') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetPedidos(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // PATCH /pedidos/:id?businessId=xxx
  var pedMatch = u.path.match(/^\/pedidos\/(\d+)$/);
  if (req.method === 'PATCH' && pedMatch) {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    var pedId = parseInt(pedMatch[1], 10);
    return readBody(req).then(function (r) { return handlePatchPedido(pedId, bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /conversaciones?businessId=xxx
  if (req.method === 'GET' && u.path === '/conversaciones') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetConversaciones(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // GET /conversaciones/:sessionId
  var convMatch = u.path.match(/^\/conversaciones\/([^/]+)$/);
  if (req.method === 'GET' && convMatch) {
    if (!verifyToken(req)) return sendUnauthorized(res);
    return handleGetMensajes(decodeURIComponent(convMatch[1]), res)
      .catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // ── Endpoints de turnos ───────────────────────────────────────────────────

  // GET /disponibilidad?businessId=xxx
  if (req.method === 'GET' && u.path === '/disponibilidad') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetDisponibilidad(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // PUT /disponibilidad?businessId=xxx
  if (req.method === 'PUT' && u.path === '/disponibilidad') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handlePutDisponibilidad(bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /turnos/disponibles?businessId=xxx&fecha=YYYY-MM-DD  (público)
  if (req.method === 'GET' && u.path === '/turnos/disponibles') {
    return handleGetTurnosDisponibles(bid, res, u.query).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // GET /turnos?businessId=xxx
  if (req.method === 'GET' && u.path === '/turnos') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetTurnos(bid, res, u.query).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /turnos?businessId=xxx  (público — widget/bot)
  if (req.method === 'POST' && u.path === '/turnos') {
    return readBody(req).then(function (r) { return handlePostTurno(bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // PATCH /turnos/:id?businessId=xxx
  var turnoMatch = u.path.match(/^\/turnos\/(\d+)$/);
  if (req.method === 'PATCH' && turnoMatch) {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    var turnoId = parseInt(turnoMatch[1], 10);
    return readBody(req).then(function (r) { return handlePatchTurno(turnoId, bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // ── Twilio webhook (público — validado por Twilio) ────────────────────────

  // POST /whatsapp/webhook?businessId=xxx
  if (req.method === 'POST' && u.path === '/whatsapp/webhook') {
    return handleWhatsAppWebhook(req, res).catch(function (e) {
      console.error('[Webhook] Error inesperado:', e.message);
      var xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error interno. Intentá más tarde.</Message></Response>';
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(xml);
    });
  }

  res.writeHead(404); res.end();
});

// ── Arranque ──────────────────────────────────────────────────────────────────

initSchema().then(function () {
  server.listen(PORT, function () {
    console.log('Proxy corriendo en  http://localhost:' + PORT);
    console.log('App (cliente):      http://localhost:' + PORT + '/app?businessId=<id>');
    console.log('Admin (SaaS):       http://localhost:' + PORT + '/admin.html');
  });
}).catch(function (e) {
  console.error('Error al inicializar la base de datos:', e.message);
  process.exit(1);
});
