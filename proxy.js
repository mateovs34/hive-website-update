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
const crypto   = require('crypto');
const { Pool } = require('pg');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { Resend }  = require('resend');
const FormData    = require('form-data');

var pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (_) {
  console.warn('[PDF] pdf-parse no instalado — importación de PDF no disponible');
}

const PORT           = process.env.PORT           || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATABASE_URL   = process.env.DATABASE_URL;
const SECRET_KEY           = process.env.SECRET_KEY           || 'changeme-in-production';
const ADMIN_PASSWORD       = process.env.ADMIN_PASSWORD       || null;
const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID   || null;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN    || null;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const RESEND_API_KEY           = process.env.RESEND_API_KEY           || null;
const INSTAGRAM_VERIFY_TOKEN   = process.env.INSTAGRAM_VERIFY_TOKEN   || null;
const INSTAGRAM_ACCESS_TOKEN   = process.env.INSTAGRAM_ACCESS_TOKEN   || null;
const MP_ACCESS_TOKEN      = process.env.MP_ACCESS_TOKEN      || null;
const APP_URL              = process.env.APP_URL || 'https://chatbot-saas-production-0dae.up.railway.app';

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
if (!RESEND_API_KEY) console.warn('[Resend] RESEND_API_KEY no configurada — los emails de reset no se enviarán');

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

  // Tablas de inventario
  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id             SERIAL PRIMARY KEY,
      business_id    TEXT NOT NULL REFERENCES negocios(business_id) ON DELETE CASCADE,
      nombre         TEXT NOT NULL,
      descripcion    TEXT NOT NULL DEFAULT '',
      precio_venta   NUMERIC(12,2) NOT NULL DEFAULT 0,
      precio_costo   NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock_actual   INTEGER NOT NULL DEFAULT 0,
      stock_minimo   INTEGER NOT NULL DEFAULT 0,
      categoria      TEXT NOT NULL DEFAULT 'General',
      activo         BOOLEAN NOT NULL DEFAULT true,
      creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS movimientos_stock (
      id          SERIAL PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES negocios(business_id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
      cantidad    INTEGER NOT NULL,
      motivo      TEXT NOT NULL DEFAULT '',
      session_id  TEXT,
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Memoria de clientes WhatsApp
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes_wpp (
      id               SERIAL PRIMARY KEY,
      business_id      TEXT NOT NULL REFERENCES negocios(business_id) ON DELETE CASCADE,
      telefono         TEXT NOT NULL,
      nombre           TEXT NOT NULL DEFAULT '',
      total_pedidos    INTEGER NOT NULL DEFAULT 0,
      ultimo_pedido_en TIMESTAMPTZ,
      preferencias     TEXT NOT NULL DEFAULT '{}',
      creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(business_id, telefono)
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_wpp ON clientes_wpp(business_id);
  `);

  // Columnas de turnos en negocios (migraciones no destructivas)
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS turnos_activos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS turno_servicio TEXT NOT NULL DEFAULT 'Consulta'`);

  // Columnas de reset de contraseña y email de cuenta
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS email TEXT`);

  // Módulos activos por negocio
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS modulos_activos TEXT NOT NULL DEFAULT '["pedidos"]'`);

  // Instagram DM integration
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS instagram_access_token TEXT`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS instagram_sender_id TEXT`);
  await pool.query(`ALTER TABLE negocios ADD COLUMN IF NOT EXISTS mp_access_token TEXT`);

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

function readBodyBuffer(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end',  function ()  { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function extractFileFromMultipart(body, contentType) {
  var m = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!m) throw new Error('No boundary in Content-Type');
  var boundary      = m[1] || m[2];
  var firstBoundary = Buffer.from('--' + boundary + '\r\n');
  var nextBoundary  = Buffer.from('\r\n--' + boundary);
  var crlfcrlf      = Buffer.from('\r\n\r\n');

  var pos = body.indexOf(firstBoundary);
  if (pos === -1) throw new Error('Boundary not found in body');
  pos += firstBoundary.length;

  while (pos < body.length) {
    var hEnd = body.indexOf(crlfcrlf, pos);
    if (hEnd === -1) break;
    var headers   = body.slice(pos, hEnd).toString('latin1');
    var dataStart = hEnd + 4;
    var nextSep   = body.indexOf(nextBoundary, dataStart);
    var dataEnd   = nextSep !== -1 ? nextSep : body.length;

    if (/filename=/i.test(headers)) {
      return body.slice(dataStart, dataEnd);
    }
    if (nextSep === -1) break;
    pos = nextSep + nextBoundary.length;
    if (body[pos] === 45 && body[pos + 1] === 45) break; // "--" = closing boundary
    if (body[pos] === 13) pos++;
    if (body[pos] === 10) pos++;
  }
  throw new Error('No file found in multipart data');
}

function parseUrl(req) {
  var parsed = new URL(req.url, 'http://localhost');
  var query  = {};
  parsed.searchParams.forEach(function (v, k) { query[k] = v; });
  return {
    path:       parsed.pathname,
    businessId: parsed.searchParams.get('businessId') || null,
    query:      query
  };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
//
//  chatLimitIp  : Map<ip,  { count, resetAt }>   — 20 req/hora por IP
//  chatLimitBid : Map<bid, { count, resetAt }>   — 100 req/hora por businessId
//  loginFails   : Map<ip,  { count, resetAt }>   — 10 intentos fallidos / 3 min

var chatLimitIp  = new Map();
var chatLimitBid = new Map();
var loginFails   = new Map();

var CHAT_IP_MAX   = 20;
var CHAT_BID_MAX  = 100;
var CHAT_WINDOW   = 60 * 60 * 1000;       // 1 hora en ms
var LOGIN_MAX     = 10;
var LOGIN_WINDOW  = 3 * 60 * 1000;        // 3 minutos en ms

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

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

// ── Pedido: guardar y devolver ID ────────────────────────────────────────────

async function savePedidoAndGetId(businessId, sessionId, pedido) {
  try {
    var result = await pool.query(
      `INSERT INTO pedidos (business_id, session_id, detalles) VALUES ($1, $2, $3) RETURNING id`,
      [businessId, sessionId, JSON.stringify(pedido)]
    );
    var pedidoId = result.rows[0].id;
    console.log('[DB] Pedido creado — negocio:', businessId, 'sesión:', sessionId, 'id:', pedidoId);
    if (twilioClient) {
      pool.query(`SELECT nombre, whatsapp FROM negocios WHERE business_id = $1`, [businessId])
        .then(function (r) { if (r.rows.length && r.rows[0].whatsapp) sendWhatsAppNotification(r.rows[0], pedido); })
        .catch(function () {});
    }
    return pedidoId;
  } catch (e) { console.error('[DB] savePedidoAndGetId:', e.message); return null; }
}

// ── Pedido activo para cambio/cancelación ─────────────────────────────────────

async function getUltimoPedidoActivo(businessId, sessionId) {
  try {
    var r = await pool.query(`
      SELECT id, detalles, estado
      FROM pedidos
      WHERE business_id = $1 AND session_id = $2
        AND estado NOT IN ('cancelado', 'entregado')
      ORDER BY creado_en DESC LIMIT 1
    `, [businessId, sessionId]);
    if (!r.rows.length) return null;
    var row = r.rows[0];
    var det; try { det = JSON.parse(row.detalles); } catch (_) { det = {}; }
    return { id: row.id, detalles: det, estado: row.estado };
  } catch (e) { return null; }
}

// ── Mercado Pago ──────────────────────────────────────────────────────────────

function crearPagoMP(accessToken, pedidoId, pedido, businessId) {
  return new Promise(function (resolve, reject) {
    var items = (pedido.items || []).map(function (it) {
      var precio = parseFloat(String(it.precio || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 1;
      return {
        title:      String(it.nombre || 'Item').slice(0, 100),
        quantity:   parseInt(it.cantidad) || 1,
        unit_price: precio,
        currency_id: 'ARS'
      };
    });
    if (!items.length) items = [{ title: 'Pedido', quantity: 1, unit_price: 1, currency_id: 'ARS' }];
    var payload = JSON.stringify({
      items:              items,
      external_reference: String(pedidoId),
      back_urls:          { success: APP_URL, failure: APP_URL, pending: APP_URL },
      auto_return:        'approved',
      notification_url:   APP_URL + '/mp-webhook?businessId=' + encodeURIComponent(businessId)
    });
    var options = {
      hostname: 'api.mercadopago.com',
      path:     '/checkout/preferences',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  'Bearer ' + accessToken,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    var req2 = https.request(options, function (r2) {
      var chunks = [];
      r2.on('data', function (c) { chunks.push(c); });
      r2.on('end', function () {
        try { var d = JSON.parse(Buffer.concat(chunks).toString()); resolve(d.init_point || null); }
        catch (e) { reject(e); }
      });
    });
    req2.on('error', reject);
    req2.write(payload);
    req2.end();
  });
}

async function handleCrearPago(req, res, businessId) {
  if (!isBusiness(req, businessId)) return sendUnauthorized(res);
  try {
    var raw  = await readBody(req);
    var body; try { body = JSON.parse(raw); } catch (_) { return sendJSON(res, 400, { error: 'invalid_json' }); }
    var negRes = await pool.query(`SELECT mp_access_token FROM negocios WHERE business_id = $1`, [businessId]);
    if (!negRes.rows.length) return sendJSON(res, 404, { error: 'negocio no encontrado' });
    var token = negRes.rows[0].mp_access_token || MP_ACCESS_TOKEN;
    if (!token) return sendJSON(res, 400, { error: 'Mercado Pago no configurado para este negocio' });
    var pedidoFake = { items: [{ nombre: String(body.descripcion || 'Pedido'), cantidad: 1, precio: String(body.monto || '0') }] };
    var link = await crearPagoMP(token, body.pedidoId || 'manual', pedidoFake, businessId);
    sendJSON(res, 200, { link: link });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

async function handleMpWebhook(req, res) {
  res.writeHead(200); res.end('OK');
  try {
    var u   = parseUrl(req);
    var raw = await readBody(req);
    var paymentId = u.query.id || u.query['data.id'] || '';
    if (!paymentId && raw) {
      try { var notif = JSON.parse(raw); if (notif.data && notif.data.id) paymentId = String(notif.data.id); } catch (_) {}
    }
    if (!paymentId) return;
    var businessId = u.businessId || 'default';
    var negRes = await pool.query(`SELECT mp_access_token FROM negocios WHERE business_id = $1`, [businessId]);
    var mpToken = (negRes.rows[0] && negRes.rows[0].mp_access_token) || MP_ACCESS_TOKEN;
    if (!mpToken) return;
    var paymentData = await new Promise(function (resolve, reject) {
      var opts = {
        hostname: 'api.mercadopago.com',
        path:     '/v1/payments/' + encodeURIComponent(paymentId),
        method:   'GET',
        headers:  { 'Authorization': 'Bearer ' + mpToken }
      };
      var r2 = https.request(opts, function (mpRes) {
        var chunks = [];
        mpRes.on('data', function (c) { chunks.push(c); });
        mpRes.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
      });
      r2.on('error', reject); r2.end();
    });
    if (paymentData.status !== 'approved') return;
    var pedidoId = parseInt(paymentData.external_reference);
    if (!pedidoId) return;
    await pool.query(
      `UPDATE pedidos SET estado = 'confirmado' WHERE id = $1 AND business_id = $2 AND estado = 'pendiente'`,
      [pedidoId, businessId]
    );
    console.log('[MercadoPago] Pago aprobado — pedidoId:', pedidoId, 'businessId:', businessId);
  } catch (e) { console.error('[MercadoPago] Error webhook:', e.message); }
}

// ── Imprimir pedidos del día ──────────────────────────────────────────────────

async function handlePedidosImprimir(req, res, businessId, query) {
  // Accept token from query string (needed when opening in a new browser tab)
  var authorized = isBusiness(req, businessId);
  if (!authorized && query._token) {
    try {
      var p = jwt.verify(query._token, SECRET_KEY);
      authorized = !!(p && (p.role === 'admin' || p.businessId === businessId));
    } catch (_) {}
  }
  if (!authorized) return sendUnauthorized(res);
  var fecha = query.fecha || new Date().toISOString().slice(0, 10);
  try {
    var results = await Promise.all([
      pool.query(`SELECT nombre, bot_avatar, color_widget FROM negocios WHERE business_id = $1`, [businessId]),
      pool.query(`
        SELECT id, session_id, detalles, estado, creado_en
        FROM pedidos WHERE business_id = $1 AND creado_en::date = $2::date
        ORDER BY creado_en ASC
      `, [businessId, fecha])
    ]);
    var negocio = results[0].rows[0] || { nombre: businessId, bot_avatar: '🤖', color_widget: '#6366f1' };
    var pedidos = results[1].rows.map(function (r) {
      var det; try { det = JSON.parse(r.detalles); } catch (_) { det = {}; }
      return { id: r.id, detalles: det, estado: r.estado, creado_en: r.creado_en };
    });
    var ESTADO_LABEL = {
      pendiente: 'Pendiente', confirmado: 'Confirmado', en_preparacion: 'En preparación',
      en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado'
    };
    var totalConf = pedidos.filter(function (p) { return p.estado === 'confirmado' || p.estado === 'entregado'; }).length;
    var totalMonto = pedidos.reduce(function (acc, p) {
      if (p.estado === 'cancelado') return acc;
      return acc + (parseFloat(String(p.detalles.total || '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0);
    }, 0);
    var color = escHtml(negocio.color_widget || '#6366f1');
    var pedidosHtml = pedidos.length ? pedidos.map(function (p) {
      var items = Array.isArray(p.detalles.items)
        ? p.detalles.items.map(function (it) {
            return '<li>' + escHtml((it.cantidad ? 'x' + it.cantidad + ' ' : '') + (it.nombre || it.name || '?')) +
                   (it.precio ? ' &mdash; ' + escHtml(String(it.precio)) : '') + '</li>';
          }).join('')
        : '<li>(sin detalle)</li>';
      var hora = new Date(p.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return '<div class="pedido' + (p.estado === 'cancelado' ? ' cancelado' : '') + '">' +
        '<div class="pedido-header">' +
          '<span class="pedido-num">#' + p.id + '</span>' +
          '<span class="pedido-hora">' + hora + '</span>' +
          '<span class="pedido-estado ' + escHtml(p.estado) + '">' + escHtml(ESTADO_LABEL[p.estado] || p.estado) + '</span>' +
        '</div>' +
        '<ul class="pedido-items">' + items + '</ul>' +
        '<div class="pedido-footer">' +
          '<span class="pedido-total">Total: ' + escHtml(String(p.detalles.total || '—')) + '</span>' +
          (p.detalles.notas ? '<span class="pedido-notas">Nota: ' + escHtml(String(p.detalles.notas)) + '</span>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty">No hay pedidos para este día.</div>';

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
      '<title>Pedidos ' + escHtml(fecha) + ' — ' + escHtml(negocio.nombre) + '</title>' +
      '<style>' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;background:#f8fafc;color:#1e293b}' +
      '.container{max-width:800px;margin:0 auto;padding:24px}' +
      '.header{display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}' +
      '.logo{width:52px;height:52px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;background:' + color + '22;border:2px solid ' + color + '44}' +
      '.header-info h1{font-size:20px;font-weight:700}.header-info p{font-size:13px;color:#64748b}' +
      '.summary{display:flex;gap:16px;margin-bottom:20px}' +
      '.sum-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 18px;flex:1}' +
      '.sum-card strong{display:block;font-size:22px;font-weight:700}.sum-card span{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}' +
      '.pedido{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:10px;page-break-inside:avoid}' +
      '.pedido.cancelado{opacity:.5}' +
      '.pedido-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}' +
      '.pedido-num{font-weight:700;font-size:15px}.pedido-hora{font-size:12px;color:#64748b;margin-left:auto}' +
      '.pedido-estado{font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;border:1px solid}' +
      '.pedido-estado.pendiente{background:#fef9c3;color:#854d0e;border-color:#fde047}' +
      '.pedido-estado.confirmado{background:#dcfce7;color:#166534;border-color:#4ade80}' +
      '.pedido-estado.en_preparacion{background:#dbeafe;color:#1e40af;border-color:#60a5fa}' +
      '.pedido-estado.en_camino{background:#ede9fe;color:#5b21b6;border-color:#a78bfa}' +
      '.pedido-estado.entregado{background:#d1fae5;color:#065f46;border-color:#34d399}' +
      '.pedido-estado.cancelado{background:#fee2e2;color:#991b1b;border-color:#f87171}' +
      '.pedido-items{list-style:none;padding:0;margin-bottom:8px}' +
      '.pedido-items li{padding:3px 0;border-bottom:1px dotted #f1f5f9}.pedido-items li:last-child{border-bottom:none}' +
      '.pedido-footer{display:flex;justify-content:space-between;font-size:13px;color:#64748b}' +
      '.pedido-total{font-weight:600;color:#1e293b}' +
      '.empty{text-align:center;padding:40px;color:#64748b}' +
      '.print-btn{position:fixed;bottom:24px;right:24px;background:' + color + ';color:#fff;border:none;border-radius:12px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2)}' +
      '@media print{body{background:#fff}.print-btn{display:none}.container{padding:0;max-width:100%}}' +
      '</style></head><body>' +
      '<div class="container">' +
      '<div class="header"><div class="logo">' + escHtml(negocio.bot_avatar || '🤖') + '</div>' +
      '<div class="header-info"><h1>' + escHtml(negocio.nombre) + '</h1>' +
      '<p>Pedidos del día ' + escHtml(fecha) + ' &middot; ' + pedidos.length + ' pedido' + (pedidos.length !== 1 ? 's' : '') + '</p></div></div>' +
      '<div class="summary">' +
      '<div class="sum-card"><strong>' + pedidos.length + '</strong><span>Total pedidos</span></div>' +
      '<div class="sum-card"><strong>' + totalConf + '</strong><span>Confirmados</span></div>' +
      '<div class="sum-card"><strong>$' + totalMonto.toFixed(2) + '</strong><span>Facturado</span></div>' +
      '</div>' + pedidosHtml + '</div>' +
      '<button class="print-btn" onclick="window.print()">🖨️ Imprimir</button>' +
      '</body></html>';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// ── Memoria de clientes WhatsApp ──────────────────────────────────────────────

async function getOrCreateClienteWpp(businessId, telefono) {
  try {
    await pool.query(
      `INSERT INTO clientes_wpp (business_id, telefono)
       VALUES ($1, $2)
       ON CONFLICT (business_id, telefono) DO NOTHING`,
      [businessId, telefono]
    );
    var r = await pool.query(
      `SELECT * FROM clientes_wpp WHERE business_id = $1 AND telefono = $2`,
      [businessId, telefono]
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error('[ClienteWpp] getOrCreate:', e.message);
    return null;
  }
}

async function updateClienteNombre(businessId, telefono, nombre) {
  try {
    await pool.query(
      `UPDATE clientes_wpp SET nombre = $3 WHERE business_id = $1 AND telefono = $2`,
      [businessId, telefono, nombre.trim()]
    );
    console.log('[ClienteWpp] nombre guardado:', nombre, 'para', telefono);
  } catch (e) { console.error('[ClienteWpp] updateNombre:', e.message); }
}

async function updateClientePedido(businessId, telefono, pedido) {
  try {
    var r = await pool.query(
      `SELECT preferencias FROM clientes_wpp WHERE business_id = $1 AND telefono = $2`,
      [businessId, telefono]
    );
    if (!r.rows.length) return;
    var prefs = {};
    try { prefs = JSON.parse(r.rows[0].preferencias || '{}'); } catch (_) {}
    var historial = prefs.historial || [];
    historial.unshift({
      items: pedido.items || [],
      total: pedido.total || '',
      fecha: new Date().toISOString()
    });
    if (historial.length > 10) historial = historial.slice(0, 10);
    prefs.historial = historial;
    await pool.query(
      `UPDATE clientes_wpp
       SET total_pedidos    = total_pedidos + 1,
           ultimo_pedido_en = NOW(),
           preferencias     = $3
       WHERE business_id = $1 AND telefono = $2`,
      [businessId, telefono, JSON.stringify(prefs)]
    );
  } catch (e) { console.error('[ClienteWpp] updatePedido:', e.message); }
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
      var fechaLabel = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      lines.push(fechaLabel + ' (' + fechaStr + '): ' + available.join(', '));
    }
  }
  return lines.length
    ? 'TURNOS DISPONIBLES (próximos días):\n' + lines.join('\n')
    : 'TURNOS: No hay disponibilidad en los próximos días.';
}

async function saveTurnoIfDetected(businessId, sessionId, parsed) {
  console.log('[Turno] parsed.turno:', JSON.stringify(parsed && parsed.turno));
  console.log('[Turno] businessId:', businessId, 'sessionId:', sessionId);
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

// ── Helpers de inventario ─────────────────────────────────────────────────────

async function getInventarioContextForPrompt(businessId) {
  var result = await pool.query(
    `SELECT id, nombre, precio_venta, stock_actual FROM productos
     WHERE business_id = $1 AND activo = true ORDER BY nombre`,
    [businessId]
  );
  if (result.rows.length === 0) return null;
  var lines = result.rows.map(function (p) {
    var stockLabel = p.stock_actual > 0 ? 'stock: ' + p.stock_actual : 'SIN STOCK';
    return '- ' + p.nombre + ' ($' + Number(p.precio_venta).toFixed(2) + ') [' + stockLabel + '] (id:' + p.id + ')';
  });
  return 'INVENTARIO DISPONIBLE:\n' + lines.join('\n');
}

async function saveVentaIfDetected(businessId, sessionId, parsed) {
  if (!parsed || !parsed.venta) return;
  var v = parsed.venta;
  if (!v.producto_id || !v.cantidad) return;
  try {
    var cantidad = parseInt(v.cantidad, 10) || 1;
    await pool.query(`
      INSERT INTO movimientos_stock (business_id, producto_id, tipo, cantidad, motivo, session_id)
      VALUES ($1, $2, 'salida', $3, 'Venta por chat', $4)
    `, [businessId, v.producto_id, cantidad, sessionId || null]);
    await pool.query(
      `UPDATE productos SET stock_actual = GREATEST(0, stock_actual - $1), actualizado_en = NOW()
       WHERE id = $2 AND business_id = $3`,
      [cantidad, v.producto_id, businessId]
    );
    console.log('[DB] Venta registrada — producto:', v.producto_id, 'cantidad:', cantidad);
  } catch (e) { console.error('[DB] saveVenta:', e.message); }
}

// ── System prompt desde config ────────────────────────────────────────────────

function buildSystemPromptFromConfig(cfg, turnoContext, inventarioContext) {
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

  var ventaInstructions = inventarioContext
    ? 'REGISTRO DE VENTA — cuando el cliente confirme la compra de un producto del inventario, incluí el campo "venta":\n' +
      '{"text":"¡Vendido!","humanContact":false,"venta":{"producto_id":123,"cantidad":1,"precio":9.99}}\n' +
      'Usá el id del producto que aparece entre paréntesis en el inventario. Si no hay venta confirmada, omitir el campo "venta".\n\n'
    : '';

  return (
    'Eres ' + cfg.bot_nombre + ', el asistente virtual de ' + cfg.nombre + '.\n\n' +
    'DESCRIPCIÓN DEL NEGOCIO:\n' + (cfg.descripcion || 'Negocio local.') + '\n\n' +
    (menuText           ? 'MENÚ DISPONIBLE:\n' + menuText + '\n\n' : '') +
    (inventarioContext  ? inventarioContext + '\n\n' : '') +
    (cfg.horarios  ? 'HORARIOS: '   + cfg.horarios  + '\n' : '') +
    (cfg.direccion ? 'DIRECCIÓN: '  + cfg.direccion + '\n' : '') +
    (cfg.telefono  ? 'TELÉFONO: '   + cfg.telefono  + '\n\n' : '\n') +
    (turnoContext  ? turnoContext + '\n\n' : '') +
    'PERSONALIDAD:\n' +
    '- Adaptate al tono del usuario\n' +
    '- Sé empático, servicial y conciso (máximo 3-4 oraciones)\n' +
    '- Solo respondé sobre lo que está en el contexto del negocio\n' +
    '- Nunca inventes precios ni datos que no estén en el contexto\n' +
    '- Si te preguntan disponibilidad de un producto, consultá el inventario\n\n' +
    'DETECCIÓN DE CONTACTO HUMANO — pon humanContact:true si el usuario pide hablar con una persona.\n\n' +
    'FORMATO — responde SIEMPRE con este JSON exacto:\n' +
    '{"text":"tu respuesta","humanContact":false}\n' +
    'PROHIBIDO: markdown, texto fuera del JSON, comentarios.\n\n' +
    'DETECCIÓN DE PEDIDOS — cuando el usuario confirme un pedido, agregá el campo "pedido":\n' +
    '{"text":"¡Anotado!","humanContact":false,"pedido":{"items":[{"nombre":"...","cantidad":1,"precio":"$..."}],"total":"$...","notas":""}}\n' +
    'Si no hay pedido confirmado, omitir el campo "pedido".\n\n' +
    ventaInstructions +
    turnoInstructions
  );
}

// System prompt para el bot de WhatsApp — flujo conversacional de pedido
function buildWhatsAppCustomerPrompt(cfg, cliente, pedidoActivo) {
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

  // Contexto de cliente habitual
  var clienteContext = '';
  if (cliente && !cliente.nombre) {
    clienteContext =
      'CLIENTE NUEVO — si es el primer mensaje del cliente, presentate brevemente y preguntá: "¡Hola! ¿Cómo te llamo?" ' +
      'Cuando el cliente responda con su nombre, incluí el campo "clienteNombre" en tu respuesta JSON.\n\n';
  } else if (cliente && cliente.nombre) {
    var prefs = {};
    try { prefs = JSON.parse(cliente.preferencias || '{}'); } catch (_) {}
    var historial = prefs.historial || [];
    var histText = historial.slice(0, 3).map(function (h, i) {
      var items = (h.items || []).map(function (it) {
        return (it.cantidad ? 'x' + it.cantidad + ' ' : '') + (it.nombre || it.name || '?');
      }).join(', ');
      var fecha = h.fecha ? new Date(h.fecha).toLocaleDateString('es-AR') : '—';
      return (i + 1) + '. ' + items + ' (' + fecha + ')';
    }).join('; ');
    clienteContext =
      'CLIENTE HABITUAL: ' + cliente.nombre + ', ha pedido ' + cliente.total_pedidos + ' veces.' +
      (histText ? ' Sus pedidos anteriores: ' + histText + '.' : '') +
      ' Podés ofrecerle repetir su último pedido.\n' +
      'Al saludar usá su nombre: "¡Hola ' + cliente.nombre + '!"\n' +
      'Si el cliente dice "sí", "lo mismo", "igual" o "lo de siempre", confirmá el último pedido directamente sin volver a preguntar todo.\n\n';
  }

  // Contexto de pedido activo (para cambio/cancelación)
  var pedidoContext = '';
  if (pedidoActivo) {
    var pedItems = (pedidoActivo.detalles.items || []).map(function (it) {
      return (it.cantidad ? 'x' + it.cantidad + ' ' : '') + (it.nombre || it.name || '?');
    }).join(', ');
    var estadosAvanzados = ['en_preparacion', 'en_camino', 'entregado'];
    if (estadosAvanzados.indexOf(pedidoActivo.estado) !== -1) {
      pedidoContext =
        'PEDIDO ACTIVO #' + pedidoActivo.id + ': [' + pedItems + '] | Total: ' + (pedidoActivo.detalles.total || '?') + ' | Estado: ' + pedidoActivo.estado + '\n' +
        'Este pedido ya está en preparación/camino y NO puede cancelarse ni modificarse. Avisá al cliente amablemente.\n\n';
    } else {
      pedidoContext =
        'PEDIDO ACTIVO #' + pedidoActivo.id + ': [' + pedItems + '] | Total: ' + (pedidoActivo.detalles.total || '?') + ' | Estado: ' + pedidoActivo.estado + '\n' +
        'Si el cliente quiere CANCELAR su pedido → incluí "cancelarPedido":' + pedidoActivo.id + ' en el JSON.\n' +
        'Si el cliente quiere MODIFICAR → cancelá el anterior e iniciá nuevo pedido, incluí "modificarPedido":' + pedidoActivo.id + ' en el JSON y empezá el flujo desde cero.\n\n';
    }
  }

  return (
    'Eres ' + cfg.bot_nombre + ', el asistente de pedidos de ' + cfg.nombre + ' por WhatsApp.\n\n' +
    'DESCRIPCIÓN DEL NEGOCIO:\n' + (cfg.descripcion || 'Negocio local.') + '\n\n' +
    clienteContext +
    pedidoContext +
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
    'CAPTURA DE NOMBRE — cuando el cliente diga su nombre (respuesta a "¿cómo te llamo?"), incluí el campo "clienteNombre":\n' +
    '{"text":"¡Hola Juan! ¿En qué te ayudo?","humanContact":false,"clienteNombre":"Juan"}\n' +
    'Solo incluir "clienteNombre" la primera vez que el cliente diga su nombre.\n\n' +
    'REGISTRO DE PEDIDO — solo cuando el cliente confirmó explícitamente, agregá el campo "pedido":\n' +
    '{"text":"¡Pedido registrado! ...","humanContact":false,"pedido":{"items":[{"nombre":"...","cantidad":1,"precio":"$..."}],"total":"$...","notas":""}}\n' +
    'Si el pedido NO fue confirmado explícitamente por el cliente, NUNCA incluyas el campo "pedido".\n\n' +
    'AGRUPACIÓN DE ITEMS — cuando un producto lleva extras, salsas o agregados, registrarlo como UN SOLO item combinado:\n' +
    '  CORRECTO:   {"nombre":"Ravioles con salsa 4 quesos","cantidad":1,"precio":"$1000"}\n' +
    '  INCORRECTO: {"nombre":"Ravioles","cantidad":1,"precio":"$500"} + {"nombre":"Salsa 4 quesos","cantidad":1,"precio":"$500"}\n' +
    'El precio del item agrupado es la suma de producto + extras. Solo crear items separados para productos independientes entre sí (ej: una pasta y una bebida van en items distintos).'
  );
}

function injectSystemPrompt(messages, cfg, turnoContext, inventarioContext) {
  var result = messages.slice();
  var prompt = buildSystemPromptFromConfig(cfg, turnoContext, inventarioContext);
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
          saveVentaIfDetected(businessId, sessionId, parsed).catch(function () {});
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

// PUT /admin/reset-password  (solo admin)
async function handleAdminResetPassword(res, raw) {
  var body; try { body = JSON.parse(raw); } catch (_) { return sendJSON(res, 400, { error: 'invalid_json' }); }
  var businessId  = String(body.businessId  || '').trim();
  var newPassword = String(body.newPassword || '').trim();
  if (!businessId)           return sendJSON(res, 400, { error: 'businessId requerido' });
  if (newPassword.length < 6) return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    var hash = await bcrypt.hash(newPassword, 10);
    var r = await pool.query(
      `UPDATE negocios SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE business_id = $2`,
      [hash, businessId]
    );
    if (r.rowCount === 0) return sendJSON(res, 404, { error: 'Negocio no encontrado' });
    sendJSON(res, 200, { ok: true });
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
    var modulosArr = Array.isArray(body.modulos_activos) ? body.modulos_activos : null;
    var modulosJson = modulosArr ? JSON.stringify(modulosArr) : null;
    var igToken     = body.instagram_access_token !== undefined ? (String(body.instagram_access_token || '').slice(0, 500) || null) : undefined;
    var igSender    = body.instagram_sender_id    !== undefined ? (String(body.instagram_sender_id    || '').slice(0, 100) || null) : undefined;
    var mpToken     = body.mp_access_token        !== undefined ? (String(body.mp_access_token        || '').slice(0, 500) || null) : undefined;
    await pool.query(`
      INSERT INTO negocios
        (business_id, nombre, descripcion, menu, horarios, direccion, telefono,
         email_contacto, whatsapp, welcome_msg, bot_nombre, bot_avatar,
         color_widget, turnos_activos, turno_servicio, modulos_activos,
         instagram_access_token, instagram_sender_id, mp_access_token, actualizado_en)
      VALUES
        ($1, $2, $3, COALESCE($4, '[]'), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, '["pedidos"]'),
         $17, $18, $19, NOW())
      ON CONFLICT (business_id) DO UPDATE SET
        nombre                 = EXCLUDED.nombre,
        descripcion            = EXCLUDED.descripcion,
        menu                   = CASE WHEN $4  IS NOT NULL THEN EXCLUDED.menu            ELSE negocios.menu            END,
        horarios               = EXCLUDED.horarios,
        direccion              = EXCLUDED.direccion,
        telefono               = EXCLUDED.telefono,
        email_contacto         = EXCLUDED.email_contacto,
        whatsapp               = EXCLUDED.whatsapp,
        welcome_msg            = EXCLUDED.welcome_msg,
        bot_nombre             = EXCLUDED.bot_nombre,
        bot_avatar             = EXCLUDED.bot_avatar,
        color_widget           = EXCLUDED.color_widget,
        turnos_activos         = EXCLUDED.turnos_activos,
        turno_servicio         = EXCLUDED.turno_servicio,
        modulos_activos        = CASE WHEN $16 IS NOT NULL THEN EXCLUDED.modulos_activos        ELSE negocios.modulos_activos        END,
        instagram_access_token = CASE WHEN $17 IS NOT NULL THEN EXCLUDED.instagram_access_token ELSE negocios.instagram_access_token END,
        instagram_sender_id    = CASE WHEN $18 IS NOT NULL THEN EXCLUDED.instagram_sender_id    ELSE negocios.instagram_sender_id    END,
        mp_access_token        = CASE WHEN $19 IS NOT NULL THEN EXCLUDED.mp_access_token        ELSE negocios.mp_access_token        END,
        actualizado_en         = NOW()
    `, [
      businessId,
      String(body.nombre         || 'Mi Negocio').slice(0, 100),
      String(body.descripcion    || '').slice(0, 5000),
      body.menu !== undefined ? JSON.stringify(Array.isArray(body.menu) ? body.menu : []) : null,
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
      String(body.turno_servicio || 'Consulta').slice(0, 100),
      modulosJson,
      igToken  !== undefined ? igToken  : null,
      igSender !== undefined ? igSender : null,
      mpToken  !== undefined ? mpToken  : null
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

// ── Handlers de inventario ────────────────────────────────────────────────────

// GET /productos?businessId=xxx
async function handleGetProductos(businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(
      `SELECT id, nombre, descripcion, precio_venta, precio_costo, stock_actual, stock_minimo, categoria, activo, creado_en, actualizado_en
       FROM productos WHERE business_id = $1 AND activo = true ORDER BY categoria, nombre`,
      [businessId]
    );
    sendJSON(res, 200, result.rows);
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// POST /productos?businessId=xxx
async function handlePostProducto(businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  if (!body.nombre) return sendJSON(res, 400, { error: 'nombre requerido' });
  try {
    var result = await pool.query(`
      INSERT INTO productos (business_id, nombre, descripcion, precio_venta, precio_costo, stock_actual, stock_minimo, categoria)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [
      businessId,
      String(body.nombre).slice(0, 150),
      String(body.descripcion || '').slice(0, 500),
      parseFloat(body.precio_venta) || 0,
      parseFloat(body.precio_costo) || 0,
      parseInt(body.stock_actual,  10) || 0,
      parseInt(body.stock_minimo,  10) || 0,
      String(body.categoria || 'General').slice(0, 100)
    ]);
    var id = result.rows[0].id;
    // Si hay stock inicial, registrar movimiento de entrada
    if ((parseInt(body.stock_actual, 10) || 0) > 0) {
      await pool.query(
        `INSERT INTO movimientos_stock (business_id, producto_id, tipo, cantidad, motivo)
         VALUES ($1, $2, 'entrada', $3, 'Stock inicial')`,
        [businessId, id, parseInt(body.stock_actual, 10)]
      );
    }
    sendJSON(res, 201, { ok: true, id: id });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// PUT /productos/:id?businessId=xxx
async function handlePutProducto(id, businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  try {
    var result = await pool.query(`
      UPDATE productos SET
        nombre        = COALESCE($1, nombre),
        descripcion   = COALESCE($2, descripcion),
        precio_venta  = COALESCE($3, precio_venta),
        precio_costo  = COALESCE($4, precio_costo),
        stock_minimo  = COALESCE($5, stock_minimo),
        categoria     = COALESCE($6, categoria),
        actualizado_en = NOW()
      WHERE id = $7 AND business_id = $8 RETURNING id
    `, [
      body.nombre      != null ? String(body.nombre).slice(0, 150)      : null,
      body.descripcion != null ? String(body.descripcion).slice(0, 500) : null,
      body.precio_venta != null ? parseFloat(body.precio_venta) : null,
      body.precio_costo != null ? parseFloat(body.precio_costo) : null,
      body.stock_minimo != null ? parseInt(body.stock_minimo, 10) : null,
      body.categoria    != null ? String(body.categoria).slice(0, 100) : null,
      id, businessId
    ]);
    if (result.rowCount === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// DELETE /productos/:id?businessId=xxx  (soft delete)
async function handleDeleteProducto(id, businessId, res) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(
      `UPDATE productos SET activo = false, actualizado_en = NOW() WHERE id = $1 AND business_id = $2 RETURNING id`,
      [id, businessId]
    );
    if (result.rowCount === 0) return sendJSON(res, 404, { error: 'not_found' });
    sendJSON(res, 200, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// POST /productos/:id/movimiento?businessId=xxx
async function handlePostMovimiento(productoId, businessId, res, raw) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var tiposValidos = ['entrada', 'salida', 'ajuste'];
  if (!tiposValidos.includes(body.tipo)) return sendJSON(res, 400, { error: 'tipo inválido' });
  var cantidad = parseInt(body.cantidad, 10);
  if (!cantidad || cantidad <= 0) return sendJSON(res, 400, { error: 'cantidad debe ser > 0' });
  try {
    // Verificar que el producto pertenece al negocio
    var check = await pool.query(`SELECT id, stock_actual FROM productos WHERE id = $1 AND business_id = $2 AND activo = true`, [productoId, businessId]);
    if (check.rows.length === 0) return sendJSON(res, 404, { error: 'producto no encontrado' });

    await pool.query(
      `INSERT INTO movimientos_stock (business_id, producto_id, tipo, cantidad, motivo, session_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [businessId, productoId, body.tipo, cantidad, String(body.motivo || '').slice(0, 200), body.session_id || null]
    );

    // Actualizar stock_actual según tipo
    var delta = body.tipo === 'entrada' ? cantidad : body.tipo === 'salida' ? -cantidad : 0;
    if (body.tipo === 'ajuste') {
      await pool.query(
        `UPDATE productos SET stock_actual = $1, actualizado_en = NOW() WHERE id = $2 AND business_id = $3`,
        [cantidad, productoId, businessId]
      );
    } else {
      await pool.query(
        `UPDATE productos SET stock_actual = GREATEST(0, stock_actual + $1), actualizado_en = NOW() WHERE id = $2 AND business_id = $3`,
        [delta, productoId, businessId]
      );
    }
    sendJSON(res, 201, { ok: true });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// GET /productos/movimientos?businessId=xxx
async function handleGetMovimientos(businessId, res, query) {
  if (!businessId) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var params = [businessId];
    var where  = 'WHERE m.business_id = $1';
    if (query.producto_id) {
      params.push(query.producto_id);
      where += ' AND m.producto_id = $' + params.length;
    }
    if (query.tipo) {
      params.push(query.tipo);
      where += ' AND m.tipo = $' + params.length;
    }
    var result = await pool.query(`
      SELECT m.id, m.producto_id, p.nombre, m.tipo, m.cantidad, m.motivo, m.session_id, m.creado_en
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
      ${where}
      ORDER BY m.creado_en DESC
      LIMIT 200
    `, params);
    sendJSON(res, 200, result.rows);
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
    console.log('[Turnos] GET fecha:', query.fecha || '(todos)', 'resultados:', result.rows.length);
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
    console.log('[POST /turnos] Turno creado — negocio:', businessId, 'fecha:', body.fecha, 'hora:', body.hora, 'id:', result.rows[0].id);
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
  var email  = String(body.email || '').toLowerCase().trim().slice(0, 200);
  if (!bid || bid.length < 3 || bid.length > 50) {
    return sendJSON(res, 400, { error: 'businessId inválido (3-50 caracteres: letras, números, guiones)' });
  }
  if (pass.length < 6) {
    return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (!email || !email.includes('@')) {
    return sendJSON(res, 400, { error: 'Email inválido' });
  }
  try {
    var hash  = await bcrypt.hash(pass, 10);
    await pool.query(
      `INSERT INTO negocios (business_id, nombre, password_hash, email) VALUES ($1, $2, $3, $4)`,
      [bid, nombre, hash, email]
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
async function handleVerify(req, res) {
  var payload = verifyToken(req);
  if (!payload) return sendJSON(res, 401, { error: 'Token inválido o expirado' });
  var nombre = null;
  if (payload.businessId) {
    try {
      var r = await pool.query('SELECT nombre FROM negocios WHERE business_id = $1', [payload.businessId]);
      nombre = r.rows[0] ? r.rows[0].nombre : null;
    } catch (_) {}
  }
  sendJSON(res, 200, {
    valid:      true,
    businessId: payload.businessId || null,
    role:       payload.role || 'business',
    nombre:     nombre
  });
}

// POST /auth/forgot-password
async function handleForgotPassword(res, raw) {
  console.log('[Resend] client inicializado:', !!resendClient);
  console.log('[Resend] API key presente:', !!process.env.RESEND_API_KEY);
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var bid = String(body.businessId || '').toLowerCase().trim();
  if (!bid) return sendJSON(res, 400, { error: 'businessId requerido' });
  try {
    var result = await pool.query(
      `SELECT business_id, nombre, email FROM negocios WHERE business_id = $1`,
      [bid]
    );
    if (result.rows.length === 0) {
      // Respuesta genérica — no revelar si el negocio existe
      return sendJSON(res, 200, { ok: true, message: 'Si el negocio existe, te enviaremos un email.' });
    }
    var row = result.rows[0];
    if (!row.email) {
      return sendJSON(res, 400, { error: 'Este negocio no tiene email registrado. Contactá al soporte.' });
    }

    var token  = crypto.randomBytes(32).toString('hex');
    var expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await pool.query(
      `UPDATE negocios SET reset_token = $1, reset_token_expiry = $2 WHERE business_id = $3`,
      [token, expiry, bid]
    );
    console.log('[Reset] token generado para', bid, '— email:', row.email);

    if (!resendClient) {
      console.warn('[Reset] Resend no configurado, token no enviado por email:', token);
      return sendJSON(res, 200, { ok: true, message: 'Te enviaremos un email con instrucciones.' });
    }

    var resetLink = APP_URL + '/app?reset=' + token;
    try {
      var resendResult = await resendClient.emails.send({
        from:    'onboarding@resend.dev',
        to:      row.email,
        subject: 'Resetear contraseña de tu ChatWidget',
        html: [
          '<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0d1117;color:#e2e8f0;border-radius:12px">',
          '  <h2 style="color:#6366f1;margin-top:0">💬 ChatWidget</h2>',
          '  <p>Hola <strong>' + (row.nombre || bid) + '</strong>,</p>',
          '  <p>Recibimos una solicitud para resetear la contraseña de tu cuenta <code>' + bid + '</code>.</p>',
          '  <p>Hacé click en el botón para crear una nueva contraseña. El link expira en <strong>1 hora</strong>.</p>',
          '  <a href="' + resetLink + '" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Resetear contraseña</a>',
          '  <p style="color:#64748b;font-size:13px">Si no solicitaste este reset, ignorá este email. Tu contraseña no cambiará.</p>',
          '  <p style="color:#64748b;font-size:12px">O copiá este link:<br><code style="word-break:break-all">' + resetLink + '</code></p>',
          '</div>'
        ].join('\n')
      });
      console.log('[Resend] resultado completo:', JSON.stringify(resendResult));
    } catch (resendError) {
      console.log('[Resend] error:', JSON.stringify(resendError));
      return sendJSON(res, 500, { error: 'Error al enviar el email: ' + (resendError.message || JSON.stringify(resendError)) });
    }

    console.log('[Reset] email enviado a', row.email);
    sendJSON(res, 200, { ok: true, message: 'Te enviamos un email con instrucciones para resetear tu contraseña.' });
  } catch (e) {
    console.error('[Reset] Error:', e.message);
    sendJSON(res, 500, { error: e.message });
  }
}

// POST /auth/reset-password
async function handleResetPassword(res, raw) {
  var body; try { body = JSON.parse(raw); } catch (_) {
    return sendJSON(res, 400, { error: 'invalid_json' });
  }
  var token    = String(body.token       || '').trim();
  var newPass  = String(body.newPassword || '');
  if (!token)           return sendJSON(res, 400, { error: 'token requerido' });
  if (newPass.length < 6) return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    var result = await pool.query(
      `SELECT business_id FROM negocios WHERE reset_token = $1 AND reset_token_expiry > NOW()`,
      [token]
    );
    if (result.rows.length === 0) {
      return sendJSON(res, 400, { error: 'Token inválido o expirado' });
    }
    var bid  = result.rows[0].business_id;
    var hash = await bcrypt.hash(newPass, 10);
    await pool.query(
      `UPDATE negocios SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE business_id = $2`,
      [hash, bid]
    );
    console.log('[Reset] contraseña actualizada para', bid);
    sendJSON(res, 200, { ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (e) { sendJSON(res, 500, { error: e.message }); }
}

// ── Whisper: descarga y transcripción de notas de voz ────────────────────────

// Descarga genérica con auth header opcional — usada por Twilio e Instagram
function downloadAudioWithOpts(url, authHeader) {
  return new Promise(function (resolve, reject) {
    var urlObj  = new URL(url);
    var headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    var options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'GET',
      headers:  headers
    };
    var request = https.request(options, function (response) {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadAudioWithOpts(response.headers.location, authHeader).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error('Media download HTTP ' + response.statusCode));
      }
      var chunks = [];
      response.on('data', function (c) { chunks.push(c); });
      response.on('end',  function ()  { resolve({ buffer: Buffer.concat(chunks), contentType: response.headers['content-type'] || 'audio/ogg' }); });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });
}

function downloadAudioFromTwilio(mediaUrl) {
  var auth = 'Basic ' + Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
  return downloadAudioWithOpts(mediaUrl, auth);
}

async function transcribeAudio(mediaUrl, mediaContentType, downloadFn) {
  downloadFn = downloadFn || downloadAudioFromTwilio;
  console.log('[Whisper] descargando audio:', mediaUrl);
  var { buffer, contentType } = await downloadFn(mediaUrl);
  console.log('[Whisper] audio descargado, tamaño:', buffer.length, 'bytes, tipo:', contentType);

  // Determinar extensión según content-type para que Whisper lo acepte
  var ext = 'ogg';
  if (mediaContentType) {
    if (mediaContentType.includes('mp4') || mediaContentType.includes('mpeg')) ext = 'mp4';
    else if (mediaContentType.includes('webm'))  ext = 'webm';
    else if (mediaContentType.includes('mp3'))   ext = 'mp3';
    else if (mediaContentType.includes('wav'))   ext = 'wav';
    else if (mediaContentType.includes('m4a'))   ext = 'm4a';
  }

  var form = new FormData();
  form.append('file', buffer, { filename: 'voice.' + ext, contentType: mediaContentType || 'audio/ogg' });
  form.append('model', 'whisper-1');
  form.append('language', 'es');

  return new Promise(function (resolve, reject) {
    var formHeaders = form.getHeaders();
    var body        = form.getBuffer();
    var options     = {
      hostname: 'api.openai.com',
      path:     '/v1/audio/transcriptions',
      method:   'POST',
      headers:  Object.assign({}, formHeaders, {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Length': body.length
      })
    };
    var request = https.request(options, function (response) {
      var chunks = [];
      response.on('data', function (c) { chunks.push(c); });
      response.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        try {
          var parsed = JSON.parse(raw);
          if (parsed.text) {
            console.log('[Whisper] transcripción:', parsed.text);
            resolve(parsed.text.trim());
          } else {
            reject(new Error('Whisper sin texto: ' + raw));
          }
        } catch (e) {
          reject(new Error('Whisper respuesta inválida: ' + raw));
        }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

// ── Instagram DMs ─────────────────────────────────────────────────────────────

function sendInstagramMessage(recipientId, text, accessToken) {
  return new Promise(function (resolve, reject) {
    var payload = JSON.stringify({
      recipient: { id: recipientId },
      message:   { text: text }
    });
    var options = {
      hostname: 'graph.facebook.com',
      path:     '/v18.0/me/messages?access_token=' + encodeURIComponent(accessToken),
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    var request = https.request(options, function (response) {
      var chunks = [];
      response.on('data', function (c) { chunks.push(c); });
      response.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        try {
          var parsed = JSON.parse(raw);
          if (parsed.error) {
            console.error('[Instagram] API error:', parsed.error.message);
            return reject(new Error(parsed.error.message));
          }
          resolve(parsed);
        } catch (_) {
          resolve(raw);
        }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function handleInstagramWebhook(req, res) {
  var u = parseUrl(req);

  // ── Verificación de webhook (GET) ────────────────────────────────────────
  if (req.method === 'GET') {
    var mode      = u.query['hub.mode']         || '';
    var token     = u.query['hub.verify_token'] || '';
    var challenge = u.query['hub.challenge']    || '';
    if (mode === 'subscribe' && INSTAGRAM_VERIFY_TOKEN && token === INSTAGRAM_VERIFY_TOKEN) {
      console.log('[Instagram] Webhook verificado OK');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(challenge);
    }
    console.warn('[Instagram] Verificación fallida — token incorrecto o INSTAGRAM_VERIFY_TOKEN no configurado');
    res.writeHead(403); return res.end('Forbidden');
  }

  // ── Evento entrante (POST) ────────────────────────────────────────────────
  var raw;
  try { raw = await readBody(req); } catch (_) {
    res.writeHead(200); return res.end('OK');
  }
  res.writeHead(200); res.end('OK');   // Meta requiere 200 inmediato

  var data;
  try { data = JSON.parse(raw); } catch (_) { return; }

  // Iterar sobre las entradas
  var entries = Array.isArray(data.entry) ? data.entry : [];
  for (var i = 0; i < entries.length; i++) {
    var messaging = Array.isArray(entries[i].messaging) ? entries[i].messaging : [];
    for (var j = 0; j < messaging.length; j++) {
      var event = messaging[j];
      var senderId = event.sender && event.sender.id;
      if (!event.message || !senderId) continue;

      var msgText  = event.message.text || '';
      var attachments = event.message.attachments || [];

      // Buscar negocio por instagram_sender_id
      var negResult = await pool.query(
        `SELECT * FROM negocios WHERE instagram_sender_id = $1 AND activo = 1`,
        [senderId]
      ).catch(function () { return { rows: [] }; });

      // Si no encontramos por sender, usar instagram_access_token global como fallback
      var negocio = negResult.rows[0] || null;
      if (!negocio) {
        // Intentar con page/business ID (entries[i].id es el page ID)
        var pageId = entries[i].id || '';
        if (pageId) {
          var negResult2 = await pool.query(
            `SELECT * FROM negocios WHERE instagram_sender_id = $1 AND activo = 1`,
            [pageId]
          ).catch(function () { return { rows: [] }; });
          negocio = negResult2.rows[0] || null;
        }
        if (!negocio) {
          console.warn('[Instagram] No se encontró negocio para sender:', senderId);
          continue;
        }
      }

      var accessToken = negocio.instagram_access_token || INSTAGRAM_ACCESS_TOKEN;
      if (!accessToken) {
        console.warn('[Instagram] Sin access_token para negocio:', negocio.business_id);
        continue;
      }

      var businessId = negocio.business_id;

      // ── Audio attachment: transcribir con Whisper ─────────────────────────
      if (!msgText.trim() && attachments.length > 0) {
        var audioAtt = attachments.find(function (a) {
          return a.type === 'audio';
        });
        if (audioAtt && audioAtt.payload && audioAtt.payload.url) {
          try {
            msgText = await transcribeAudio(
              audioAtt.payload.url,
              'audio/mp4',
              function (url) { return downloadAudioWithOpts(url, null); }
            );
          } catch (e) {
            console.error('[Instagram][Whisper] error:', e.message);
            await sendInstagramMessage(senderId,
              'Lo siento, no pude entender el audio. ¿Podés escribirme el mensaje?',
              accessToken
            ).catch(function () {});
            continue;
          }
        }
      }

      if (!msgText.trim()) continue;

      // Detectar si es el dueño (instagram_sender_id configurado como sender del dueño)
      // El dueño se identifica porque su ID coincide con el instagram_sender_id configurado
      // Pero eso es el page ID — el owner es quien configuró ownerIgId por separado.
      // Usamos la convención: negocio.instagram_sender_id es el sender ID del DUEÑO.
      var isOwner = negocio.instagram_sender_id && negocio.instagram_sender_id === senderId;

      // ── Flujo dueño ────────────────────────────────────────────────────────
      if (isOwner) {
        try {
          var results = await Promise.all([
            pool.query(`
              SELECT
                COUNT(*) FILTER (WHERE creado_en::date = CURRENT_DATE)         AS pedidos_hoy,
                COUNT(*) FILTER (WHERE estado = 'pendiente')                   AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'confirmado')                  AS confirmados,
                COUNT(*) FILTER (WHERE estado = 'cancelado')                   AS cancelados,
                COUNT(*) FILTER (WHERE creado_en >= NOW() - INTERVAL '1 hour') AS ultima_hora,
                COUNT(*)                                                        AS total_historico
              FROM pedidos WHERE business_id = $1
            `, [businessId]),
            pool.query(`
              SELECT detalles, estado, creado_en FROM pedidos
              WHERE business_id = $1 ORDER BY creado_en DESC LIMIT 200
            `, [businessId]),
            pool.query(`
              SELECT TO_CHAR(DATE_TRUNC('week', creado_en), 'YYYY-MM-DD') AS semana_inicio,
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE estado IN ('confirmado','entregado')) AS confirmados
              FROM pedidos WHERE business_id = $1 AND creado_en >= NOW() - INTERVAL '28 days'
              GROUP BY DATE_TRUNC('week', creado_en) ORDER BY DATE_TRUNC('week', creado_en) DESC
            `, [businessId]),
            pool.query(`
              SELECT TO_CHAR(DATE_TRUNC('month', creado_en), 'YYYY-MM') AS mes,
                     COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE estado IN ('confirmado','entregado')) AS confirmados
              FROM pedidos WHERE business_id = $1 AND creado_en >= NOW() - INTERVAL '3 months'
              GROUP BY DATE_TRUNC('month', creado_en) ORDER BY DATE_TRUNC('month', creado_en) DESC
            `, [businessId]),
            pool.query(`
              SELECT EXTRACT(DOW FROM creado_en)::int AS dia, COUNT(*) AS total
              FROM pedidos WHERE business_id = $1 GROUP BY dia ORDER BY total DESC
            `, [businessId]),
            pool.query(`
              SELECT EXTRACT(HOUR FROM creado_en)::int AS hora, COUNT(*) AS total
              FROM pedidos WHERE business_id = $1 GROUP BY hora ORDER BY total DESC LIMIT 5
            `, [businessId])
          ]);

          var counts  = results[0].rows[0];
          var ultRows = results[1].rows;
          var semanas = results[2].rows;
          var meses   = results[3].rows;
          var porDia  = results[4].rows;
          var porHora = results[5].rows;

          var ultimos = ultRows.map(function (r) {
            var d; try { d = JSON.parse(r.detalles); } catch (_) { d = {}; }
            return { detalles: d, estado: r.estado, creado_en: r.creado_en };
          });

          function parseMonto(str) {
            if (!str) return 0;
            var n = parseFloat(String(str).replace(/[^0-9.,]/g, '').replace(',', '.'));
            return isNaN(n) ? 0 : n;
          }

          var ahora     = new Date();
          var inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
          var hace1hora = new Date(ahora.getTime() - 60 * 60 * 1000);
          var facturadoHoy = 0, facturadoTotal = 0, facturadoUltimaHora = 0;
          var facturadoPorSemana = {}, facturadoPorMes = {}, itemConteo = {};

          ultimos.forEach(function (p) {
            var monto = parseMonto(p.detalles.total);
            var fecha = new Date(p.creado_en);
            var confirmado = p.estado === 'confirmado' || p.estado === 'entregado';
            if (confirmado) {
              facturadoTotal += monto;
              if (fecha >= inicioHoy)  facturadoHoy        += monto;
              if (fecha >= hace1hora)  facturadoUltimaHora += monto;
              var diaSemana = fecha.getDay();
              var diffLunes = (diaSemana === 0 ? -6 : 1 - diaSemana);
              var lunes  = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + diffLunes);
              var clvSem = lunes.toISOString().slice(0, 10);
              facturadoPorSemana[clvSem] = (facturadoPorSemana[clvSem] || 0) + monto;
              var clvMes = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
              facturadoPorMes[clvMes] = (facturadoPorMes[clvMes] || 0) + monto;
            }
            if (Array.isArray(p.detalles.items)) {
              p.detalles.items.forEach(function (it) {
                var nombre = it.nombre || it.name || '?';
                itemConteo[nombre] = (itemConteo[nombre] || 0) + (parseInt(it.cantidad) || 1);
              });
            }
          });

          var ticketPromedio = parseInt(counts.confirmados) > 0
            ? (facturadoTotal / parseInt(counts.confirmados)).toFixed(2) : 0;
          var topItems = Object.entries(itemConteo).sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 5).map(function (e) { return '  • ' + e[0] + ': ' + e[1] + ' unid.'; }).join('\n') || '  (sin datos)';
          var DIAS_NOMBRE = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
          var semanasText = semanas.length ? semanas.map(function (s) {
            var fact = facturadoPorSemana[s.semana_inicio] || 0;
            return '  • Semana ' + s.semana_inicio + ': ' + s.total + ' pedidos (' + s.confirmados + ' conf.) | $' + fact.toFixed(2);
          }).join('\n') : '  (sin datos)';
          var mesesText = meses.length ? meses.map(function (m) {
            var fact = facturadoPorMes[m.mes] || 0;
            return '  • ' + m.mes + ': ' + m.total + ' pedidos (' + m.confirmados + ' conf.) | $' + fact.toFixed(2);
          }).join('\n') : '  (sin datos)';
          var diasText = porDia.length ? porDia.map(function (d) {
            return '  • ' + (DIAS_NOMBRE[d.dia] || 'Día ' + d.dia) + ': ' + d.total + ' pedidos';
          }).join('\n') : '  (sin datos)';
          var horasText = porHora.length ? porHora.map(function (h) {
            return '  • ' + String(h.hora).padStart(2, '0') + ':00 hs: ' + h.total + ' pedidos';
          }).join('\n') : '  (sin datos)';
          var menu = []; try { menu = JSON.parse(negocio.menu || '[]'); } catch (_) {}
          var menuText = menu.length ? menu.map(function (it) {
            var line = '  • ' + it.nombre;
            if (it.precio)      line += ' (' + it.precio + ')';
            if (it.descripcion) line += ' — ' + it.descripcion;
            return line;
          }).join('\n') : '  (sin menú configurado)';
          var ultimosText = ultimos.slice(0, 10).length
            ? ultimos.slice(0, 10).map(function (p) {
                var items = Array.isArray(p.detalles.items)
                  ? p.detalles.items.map(function (i) { return (i.cantidad ? 'x' + i.cantidad + ' ' : '') + (i.nombre || i.name || '?'); }).join(', ')
                  : '?';
                var hora  = new Date(p.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                var fecha = new Date(p.creado_en).toLocaleDateString('es-AR');
                return '  • [' + p.estado + '] ' + items + ' | Total: ' + (p.detalles.total || '—') + ' | ' + fecha + ' ' + hora;
              }).join('\n')
            : '  (sin pedidos aún)';

          var systemPrompt =
            'Eres el asistente de negocio de ' + negocio.nombre + '. ' +
            'El dueño te consulta por Instagram DM. ' +
            'Respondé en texto plano (sin markdown, sin asteriscos), de forma directa y concisa.\n\n' +
            '══ MÉTRICAS DE HOY ══\n' +
            'Pedidos hoy: ' + counts.pedidos_hoy + ' | Pendientes: ' + counts.pendientes +
            ' | Confirmados: ' + counts.confirmados + ' | Cancelados: ' + counts.cancelados + '\n' +
            'Última hora: ' + counts.ultima_hora + ' pedidos | Facturado hoy: $' + facturadoHoy.toFixed(2) + '\n\n' +
            '══ HISTÓRICO TOTAL ══\n' +
            'Total pedidos: ' + counts.total_historico + ' | Facturado: $' + facturadoTotal.toFixed(2) +
            ' | Ticket promedio: $' + ticketPromedio + '\n\n' +
            '══ VENTAS POR SEMANA (últimas 4) ══\n' + semanasText + '\n\n' +
            '══ VENTAS POR MES (últimos 3) ══\n' + mesesText + '\n\n' +
            '══ DÍA DE LA SEMANA ══\n' + diasText + '\n\n' +
            '══ HORA PICO (top 5) ══\n' + horasText + '\n\n' +
            '══ PRODUCTOS MÁS PEDIDOS ══\n' + topItems + '\n\n' +
            '══ MENÚ ══\n' + menuText + '\n\n' +
            '══ ÚLTIMOS 10 PEDIDOS ══\n' + ultimosText;

          var reply = await callOpenAI([
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: msgText.trim() }
          ], false);
          await sendInstagramMessage(senderId, reply.trim(), accessToken).catch(function (e) {
            console.error('[Instagram] Error enviando reply dueño:', e.message);
          });
        } catch (e) {
          console.error('[Instagram] Error flujo dueño:', e.message);
          await sendInstagramMessage(senderId, 'Error al consultar los datos. Intentá de nuevo.', accessToken).catch(function () {});
        }
        continue;
      }

      // ── Flujo cliente ─────────────────────────────────────────────────────
      try {
        var igSessionId = 'ig_' + senderId;
        await ensureSession(businessId, igSessionId);

        var histResult = await pool.query(`
          SELECT rol, contenido FROM mensajes
          WHERE session_id = $1 ORDER BY creado_en DESC LIMIT 10
        `, [igSessionId]);
        var history = histResult.rows.reverse().map(function (r) {
          return { role: r.rol, content: r.contenido };
        });

        await saveMessage(businessId, igSessionId, 'user', msgText.trim());

        var waPrompt = buildWhatsAppCustomerPrompt(negocio);
        var chatMessages = [{ role: 'system', content: waPrompt }]
          .concat(history)
          .concat([{ role: 'user', content: msgText.trim() }]);

        var replyContent = await callOpenAI(chatMessages, true);

        var parsed;
        try { parsed = JSON.parse(replyContent); } catch (_) { parsed = { text: replyContent }; }
        var replyText = (parsed && parsed.text) ? parsed.text : replyContent;

        saveMessage(businessId, igSessionId, 'assistant', replyContent).catch(function () {});
        savePedidoIfDetected(businessId, igSessionId, parsed).catch(function () {});

        await sendInstagramMessage(senderId, replyText, accessToken).catch(function (e) {
          console.error('[Instagram] Error enviando reply cliente:', e.message);
        });
      } catch (e) {
        console.error('[Instagram] Error flujo cliente:', e.message);
        await sendInstagramMessage(senderId, 'Lo siento, hubo un error. Intentá de nuevo en un momento.', accessToken).catch(function () {});
      }
    }
  }
}

// ── WhatsApp webhook ──────────────────────────────────────────────────────────

async function handleWhatsAppWebhook(req, res) {
  var raw              = await readBody(req);
  var params           = new URLSearchParams(raw);
  var from             = params.get('From') || '';   // whatsapp:+549...
  var body             = params.get('Body') || '';
  var mediaUrl         = params.get('MediaUrl0') || '';
  var mediaContentType = params.get('MediaContentType0') || '';

  function twimlReply(text) {
    var safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    var xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + safe + '</Message></Response>';
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(xml);
  }

  // ── Nota de voz: transcribir con Whisper antes de continuar ──────────────
  var isAudio = mediaUrl && mediaContentType.startsWith('audio/');
  if (isAudio) {
    console.log('[Whisper] nota de voz detectada, tipo:', mediaContentType);
    try {
      body = await transcribeAudio(mediaUrl, mediaContentType);
    } catch (e) {
      console.error('[Whisper] error al transcribir:', e.message);
      return twimlReply('Lo siento, no pude entender la nota de voz. ¿Podés escribirme el mensaje?');
    }
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
        // [0] Métricas de conteo
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE creado_en::date = CURRENT_DATE)         AS pedidos_hoy,
            COUNT(*) FILTER (WHERE estado = 'pendiente')                   AS pendientes,
            COUNT(*) FILTER (WHERE estado = 'confirmado')                  AS confirmados,
            COUNT(*) FILTER (WHERE estado = 'cancelado')                   AS cancelados,
            COUNT(*) FILTER (WHERE creado_en >= NOW() - INTERVAL '1 hour') AS ultima_hora,
            COUNT(*)                                                        AS total_historico
          FROM pedidos WHERE business_id = $1
        `, [businessId]),

        // [1] Últimos 200 pedidos para análisis JS completo
        pool.query(`
          SELECT detalles, estado, creado_en
          FROM pedidos
          WHERE business_id = $1
          ORDER BY creado_en DESC LIMIT 200
        `, [businessId]),

        // [2] Ventas por semana (últimas 4 semanas)
        pool.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('week', creado_en), 'YYYY-MM-DD') AS semana_inicio,
            COUNT(*)                                               AS total,
            COUNT(*) FILTER (WHERE estado IN ('confirmado','entregado')) AS confirmados
          FROM pedidos
          WHERE business_id = $1
            AND creado_en >= NOW() - INTERVAL '28 days'
          GROUP BY DATE_TRUNC('week', creado_en)
          ORDER BY DATE_TRUNC('week', creado_en) DESC
        `, [businessId]),

        // [3] Ventas por mes (últimos 3 meses)
        pool.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', creado_en), 'YYYY-MM') AS mes,
            COUNT(*)                                             AS total,
            COUNT(*) FILTER (WHERE estado IN ('confirmado','entregado')) AS confirmados
          FROM pedidos
          WHERE business_id = $1
            AND creado_en >= NOW() - INTERVAL '3 months'
          GROUP BY DATE_TRUNC('month', creado_en)
          ORDER BY DATE_TRUNC('month', creado_en) DESC
        `, [businessId]),

        // [4] Pedidos por día de la semana (histórico)
        pool.query(`
          SELECT
            EXTRACT(DOW FROM creado_en)::int AS dia,
            COUNT(*)                          AS total
          FROM pedidos
          WHERE business_id = $1
          GROUP BY dia
          ORDER BY total DESC
        `, [businessId]),

        // [5] Hora pico (top 5)
        pool.query(`
          SELECT
            EXTRACT(HOUR FROM creado_en)::int AS hora,
            COUNT(*)                           AS total
          FROM pedidos
          WHERE business_id = $1
          GROUP BY hora
          ORDER BY total DESC
          LIMIT 5
        `, [businessId])
      ]);

      var counts   = results[0].rows[0];
      var ultRows  = results[1].rows;
      var semanas  = results[2].rows;
      var meses    = results[3].rows;
      var porDia   = results[4].rows;
      var porHora  = results[5].rows;

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

      var ahora     = new Date();
      var inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      var hace1hora = new Date(ahora.getTime() - 60 * 60 * 1000);

      // Facturación por período (JS, usando los 200 registros extendidos)
      var facturadoHoy         = 0;
      var facturadoTotal       = 0;
      var facturadoUltimaHora  = 0;
      var facturadoPorSemana   = {};   // clave: "YYYY-Www"
      var facturadoPorMes      = {};   // clave: "YYYY-MM"
      var itemConteo           = {};

      ultimos.forEach(function (p) {
        var monto = parseMonto(p.detalles.total);
        var fecha = new Date(p.creado_en);
        var confirmado = p.estado === 'confirmado' || p.estado === 'entregado';

        if (confirmado) {
          facturadoTotal += monto;
          if (fecha >= inicioHoy)  { facturadoHoy        += monto; }
          if (fecha >= hace1hora)  { facturadoUltimaHora += monto; }

          // Agrupar por semana ISO (lunes) — clave YYYY-MM-DD del lunes de esa semana
          var diaSemana = fecha.getDay();                         // 0=Dom
          var diffLunes = (diaSemana === 0 ? -6 : 1 - diaSemana);
          var lunes     = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + diffLunes);
          var clvSem    = lunes.toISOString().slice(0, 10);
          facturadoPorSemana[clvSem] = (facturadoPorSemana[clvSem] || 0) + monto;

          // Agrupar por mes
          var clvMes = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
          facturadoPorMes[clvMes] = (facturadoPorMes[clvMes] || 0) + monto;
        }

        // Conteo de items (todos los estados)
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

      // Top 5 productos más pedidos (histórico de 200)
      var topItems = Object.entries(itemConteo)
        .sort(function (a, b) { return b[1] - a[1]; })
        .slice(0, 5)
        .map(function (e) { return '  • ' + e[0] + ': ' + e[1] + ' unid.'; })
        .join('\n') || '  (sin datos)';

      // Detalle de los últimos 10 pedidos
      var ultimosText = ultimos.slice(0, 10).length
        ? ultimos.slice(0, 10).map(function (p) {
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

      // Ventas por semana (texto)
      var DIAS_NOMBRE = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

      var semanasText = semanas.length
        ? semanas.map(function (s) {
            var fact = facturadoPorSemana[s.semana_inicio] || 0;
            return '  • Semana ' + s.semana_inicio + ': ' + s.total + ' pedidos (' + s.confirmados + ' conf.) | Facturado: $' + fact.toFixed(2);
          }).join('\n')
        : '  (sin datos de últimas 4 semanas)';

      // Ventas por mes (texto)
      var mesesText = meses.length
        ? meses.map(function (m) {
            var fact = facturadoPorMes[m.mes] || 0;
            return '  • ' + m.mes + ': ' + m.total + ' pedidos (' + m.confirmados + ' conf.) | Facturado: $' + fact.toFixed(2);
          }).join('\n')
        : '  (sin datos de últimos 3 meses)';

      // Día de la semana con más pedidos
      var diasText = porDia.length
        ? porDia.map(function (d) {
            return '  • ' + (DIAS_NOMBRE[d.dia] || 'Día ' + d.dia) + ': ' + d.total + ' pedidos';
          }).join('\n')
        : '  (sin datos)';

      // Hora pico
      var horasText = porHora.length
        ? porHora.map(function (h) {
            return '  • ' + String(h.hora).padStart(2, '0') + ':00 hs: ' + h.total + ' pedidos';
          }).join('\n')
        : '  (sin datos)';

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
        'Pedidos hoy: '            + counts.pedidos_hoy  + '\n' +
        'Pendientes: '             + counts.pendientes   + '\n' +
        'Confirmados: '            + counts.confirmados  + '\n' +
        'Cancelados: '             + counts.cancelados   + '\n' +
        'Última hora: '            + counts.ultima_hora  + ' pedidos\n' +
        'Facturado hoy (conf.): $' + facturadoHoy.toFixed(2) + '\n' +
        'Facturado última hora: $' + facturadoUltimaHora.toFixed(2) + '\n' +
        '\n' +

        '══ HISTÓRICO TOTAL ══\n' +
        'Total pedidos: '              + counts.total_historico + '\n' +
        'Total facturado (conf.): $'   + facturadoTotal.toFixed(2) + '\n' +
        'Ticket promedio: $'           + ticketPromedio + '\n' +
        '\n' +

        '══ VENTAS POR SEMANA (últimas 4) ══\n' +
        semanasText + '\n\n' +

        '══ VENTAS POR MES (últimos 3) ══\n' +
        mesesText + '\n\n' +

        '══ DÍA DE LA SEMANA (histórico, de mayor a menor) ══\n' +
        diasText + '\n\n' +

        '══ HORA PICO (top 5) ══\n' +
        horasText + '\n\n' +

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

  // ── Flujo cliente: chatbot con memoria y pedido activo ─────────────────────
  try {
    var sessionId = 'wa_' + senderPhone.replace(/[^0-9]/g, '');

    // Cargar/crear registro de cliente y pedido activo en paralelo
    var [cliente, pedidoActivo] = await Promise.all([
      getOrCreateClienteWpp(businessId, senderPhone),
      getUltimoPedidoActivo(businessId, sessionId)
    ]);

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

    // Construir mensajes para GPT con contexto completo
    var waPrompt = buildWhatsAppCustomerPrompt(negocio, cliente, pedidoActivo);
    var chatMessages = [{ role: 'system', content: waPrompt }]
      .concat(history)
      .concat([{ role: 'user', content: body.trim() }]);

    var replyContent = await callOpenAI(chatMessages, true);

    var parsed;
    try { parsed = JSON.parse(replyContent); } catch (_) { parsed = { text: replyContent }; }
    var replyText = (parsed && parsed.text) ? parsed.text : replyContent;

    // Guardar nombre si el bot lo capturó por primera vez
    if (parsed && parsed.clienteNombre && cliente && !cliente.nombre) {
      updateClienteNombre(businessId, senderPhone, parsed.clienteNombre).catch(function () {});
    }

    // Cancelar pedido activo si el bot lo indicó
    var pedidoIdCancelar = parsed && (parsed.cancelarPedido || parsed.modificarPedido);
    if (pedidoIdCancelar) {
      pool.query(
        `UPDATE pedidos SET estado = 'cancelado' WHERE id = $1 AND business_id = $2`,
        [parseInt(pedidoIdCancelar), businessId]
      ).catch(function () {});
    }

    // Guardar respuesta (fire-and-forget)
    saveMessage(businessId, sessionId, 'assistant', replyContent).catch(function () {});

    // Nuevo pedido confirmado
    if (parsed && parsed.pedido) {
      var pedidoId = await savePedidoAndGetId(businessId, sessionId, parsed.pedido);
      updateClientePedido(businessId, senderPhone, parsed.pedido).catch(function () {});

      // Mercado Pago: agregar link de pago si el negocio lo tiene configurado
      var mpToken = negocio.mp_access_token || MP_ACCESS_TOKEN;
      if (pedidoId && mpToken) {
        try {
          var mpLink = await crearPagoMP(mpToken, pedidoId, parsed.pedido, businessId);
          if (mpLink) replyText += '\n\n💳 Para confirmar tu pedido, pagá aquí: ' + mpLink;
        } catch (mpErr) { console.error('[MercadoPago] Error al crear preferencia:', mpErr.message); }
      }
    }

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
  '/tour':          { file: 'tour.html',       mime: 'text/html' },
  '/landing.html':  { file: 'landing.html',    mime: 'text/html' },
  '/landing':       { file: 'landing.html',    mime: 'text/html' },
  '/delcar-demo.html': { file: 'delcar-demo.html', mime: 'text/html' },
  '/delcar':           { file: 'delcar-demo.html', mime: 'text/html' }
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

  if (req.method === 'POST' && u.path === '/auth/forgot-password') {
    return readBody(req).then(function (r) { return handleForgotPassword(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  if (req.method === 'POST' && u.path === '/auth/reset-password') {
    return readBody(req).then(function (r) { return handleResetPassword(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
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
      var turnoCtx    = null;
      var inventCtx   = null;
      if (cfg && cfg.turnos_activos) {
        try { turnoCtx = await getTurnosContextForPrompt(businessId); } catch (_) {}
      }
      try { inventCtx = await getInventarioContextForPrompt(businessId); } catch (_) {}
      var messages  = cfg ? injectSystemPrompt(body.messages, cfg, turnoCtx, inventCtx) : body.messages;

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

  // ── Endpoints de inventario ───────────────────────────────────────────────

  // GET /productos/movimientos?businessId=xxx  (antes de /productos/:id para evitar conflicto)
  if (req.method === 'GET' && u.path === '/productos/movimientos') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetMovimientos(bid, res, u.query).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // GET /productos?businessId=xxx
  if (req.method === 'GET' && u.path === '/productos') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleGetProductos(bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /productos?businessId=xxx
  if (req.method === 'POST' && u.path === '/productos') {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handlePostProducto(bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  var prodMatch  = u.path.match(/^\/productos\/(\d+)$/);
  var moviMatch  = u.path.match(/^\/productos\/(\d+)\/movimiento$/);

  // POST /productos/:id/movimiento?businessId=xxx
  if (req.method === 'POST' && moviMatch) {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handlePostMovimiento(parseInt(moviMatch[1], 10), bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // PUT /productos/:id?businessId=xxx
  if (req.method === 'PUT' && prodMatch) {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handlePutProducto(parseInt(prodMatch[1], 10), bid, res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // DELETE /productos/:id?businessId=xxx
  if (req.method === 'DELETE' && prodMatch) {
    if (!isBusiness(req, bid)) return sendUnauthorized(res);
    return handleDeleteProducto(parseInt(prodMatch[1], 10), bid, res).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
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

  // ── Instagram webhook (público — validado por Meta) ──────────────────────

  // GET /instagram/webhook  (verificación Meta)
  if (req.method === 'GET' && u.path === '/instagram/webhook') {
    return handleInstagramWebhook(req, res).catch(function (e) {
      console.error('[Instagram] Error verificación:', e.message);
      res.writeHead(500); res.end();
    });
  }

  // POST /instagram/webhook  (eventos entrantes)
  if (req.method === 'POST' && u.path === '/instagram/webhook') {
    return handleInstagramWebhook(req, res).catch(function (e) {
      console.error('[Instagram] Error inesperado:', e.message);
      res.writeHead(200); res.end('OK');
    });
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

  // PUT /admin/reset-password  (solo admin)
  if (req.method === 'PUT' && u.path === '/admin/reset-password') {
    if (!isAdmin(req)) return sendUnauthorized(res);
    return readBody(req).then(function (r) { return handleAdminResetPassword(res, r); })
      .catch(function () { sendJSON(res, 500, { error: 'read_error' }); });
  }

  // GET /pedidos/imprimir?businessId=xxx&fecha=YYYY-MM-DD
  if (req.method === 'GET' && u.path === '/pedidos/imprimir') {
    return handlePedidosImprimir(req, res, bid, u.query).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /crear-pago?businessId=xxx
  if (req.method === 'POST' && u.path === '/crear-pago') {
    return handleCrearPago(req, res, bid).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  // POST /mp-webhook?businessId=xxx  (Mercado Pago IPN)
  if (req.method === 'POST' && u.path === '/mp-webhook') {
    return handleMpWebhook(req, res).catch(function (e) { console.error('[MP] webhook error:', e.message); });
  }

  // POST /upload-pdf?businessId=xxx
  if (req.method === 'POST' && u.path === '/upload-pdf') {
    return handleUploadPdf(req, res, bid).catch(function (e) { sendJSON(res, 500, { error: e.message }); });
  }

  res.writeHead(404); res.end();
});

// ── Upload PDF para importar menú ─────────────────────────────────────────────

async function handleUploadPdf(req, res, businessId) {
  if (!isBusiness(req, businessId)) return sendUnauthorized(res);
  if (!pdfParse) return sendJSON(res, 501, { error: 'pdf-parse no instalado en el servidor' });

  try {
    var bodyBuf = await readBodyBuffer(req);
    var ct      = req.headers['content-type'] || '';
    var fileData;
    try {
      fileData = extractFileFromMultipart(bodyBuf, ct);
    } catch (e) {
      return sendJSON(res, 400, { error: 'No se pudo extraer el PDF: ' + e.message });
    }

    var pdfData = await pdfParse(fileData);
    var text    = (pdfData.text || '').trim();
    if (text.length < 10) {
      return sendJSON(res, 422, { error: 'El PDF no contiene texto legible (puede ser una imagen escaneada)' });
    }

    var truncated = text.slice(0, 8000);

    var gptReply = await callOpenAI([
      {
        role: 'system',
        content:
          'Extraé todos los productos, precios y categorías del siguiente texto de un menú o listado de productos. ' +
          'Devolvé ÚNICAMENTE un JSON array con este formato exacto: ' +
          '[{"nombre":"...","precio":"...","categoria":"...","descripcion":"..."}]. ' +
          'Si no hay precio usá "". Si no hay categoría usá "General". ' +
          'Sin markdown, sin explicaciones, solo el JSON array.'
      },
      { role: 'user', content: truncated }
    ], false);

    var items;
    try {
      var cleaned = gptReply.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      items = JSON.parse(cleaned);
      if (!Array.isArray(items)) throw new Error('not an array');
    } catch (_) {
      return sendJSON(res, 422, { error: 'No se pudo parsear la respuesta', raw: gptReply.slice(0, 500) });
    }

    console.log('[PDF] Extraídos', items.length, 'productos del PDF — negocio:', businessId);
    sendJSON(res, 200, { items: items });
  } catch (e) {
    console.error('[PDF] Error:', e.message);
    sendJSON(res, 500, { error: 'Error al procesar el PDF: ' + e.message });
  }
}

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
