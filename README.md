# ChatWidget — AI Chatbot SaaS

SaaS de chatbot con IA para negocios locales. Atiende clientes, toma pedidos, gestiona turnos e inventario — por web, WhatsApp e Instagram.

**Demo:** [chatbot-saas-production-0dae.up.railway.app/landing](https://chatbot-saas-production-0dae.up.railway.app/landing)

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js (HTTP nativo, sin framework) |
| Base de datos | PostgreSQL (`pg` Pool) |
| IA | OpenAI GPT-4o-mini · Whisper (transcripción de voz) |
| Mensajería | Twilio (WhatsApp) · Instagram Graph API v18.0 |
| Auth | JWT (`jsonwebtoken`) · bcryptjs |
| Email | Resend |
| Deploy | Railway · Docker |
| Frontend | HTML/CSS/JS vanilla · Chart.js |

---

## Features

### Chatbot multicanal
- **Widget embebible** — snippet de una línea para cualquier web
- **WhatsApp** — bot de atención al cliente + bot interno para el dueño con métricas en tiempo real
- **Instagram DMs** — mismo flujo que WhatsApp, integración con Graph API
- **Notas de voz** — transcripción automática con OpenAI Whisper (WhatsApp e Instagram)

### Dashboard para el negocio
- Pedidos en tiempo real con estados (pendiente → confirmado → en camino → entregado)
- Notificaciones WhatsApp automáticas al cliente por cambio de estado
- Conversaciones y mensajes históricos por sesión
- Analytics con gráficos: pedidos por hora, estado, evolución temporal (Chart.js)

### Sistema de turnos
- Disponibilidad configurable por día y franja horaria
- Reserva de turnos desde el bot o el widget
- Vista de calendario para el dueño

### Módulo de inventario
- Alta, edición y baja de productos con precio de costo/venta
- Movimientos de stock (entrada, salida, ajuste)
- Control de stock mínimo con alertas
- Analytics de inventario: valor del stock, rotación, productos críticos

### Configuración por negocio
- Nombre, descripción, horarios, dirección, teléfono, email, WhatsApp
- Menú con items (nombre, precio, categoría, descripción, emoji) — importable desde CSV/Excel
- Personalización del widget (nombre del bot, avatar, color, mensaje de bienvenida)
- Módulos activables por tipo de negocio (pedidos, turnos, inventario)
- Integración Instagram (access token + sender ID del dueño)

### Autenticación y seguridad
- Registro y login con JWT
- Reset de contraseña por email (Resend)
- Rate limiting por IP en el endpoint de chat
- Variables de entorno para todos los secretos

---

## Variables de entorno

```env
# Requeridas
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://...
SECRET_KEY=...

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Instagram
INSTAGRAM_VERIFY_TOKEN=...
INSTAGRAM_ACCESS_TOKEN=...

# Email
RESEND_API_KEY=...

# App
APP_URL=https://tu-app.railway.app
PORT=8080
```

---

## Deploy

### Railway (recomendado)

1. Crear proyecto en [railway.app](https://railway.app) y conectar este repo
2. Agregar un plugin de PostgreSQL
3. Configurar las variables de entorno
4. Railway detecta el `Dockerfile` y hace el build automáticamente

### Local

```bash
npm install
OPENAI_API_KEY=sk-... DATABASE_URL=postgres://... node proxy.js
```

### Docker

```bash
docker build -t chatbot-saas .
docker run -p 8080:8080 \
  -e OPENAI_API_KEY=sk-... \
  -e DATABASE_URL=postgres://... \
  chatbot-saas
```

---

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/landing` | Landing page pública |
| `GET` | `/app?businessId=` | Dashboard del negocio |
| `POST` | `/chat` | Chat del widget (público) |
| `GET/PUT` | `/config` | Configuración del negocio (JWT) |
| `GET/POST` | `/pedidos` | Gestión de pedidos (JWT) |
| `GET` | `/conversaciones` | Historial de chats (JWT) |
| `GET/PUT` | `/disponibilidad` | Config de turnos (JWT) |
| `GET/POST` | `/turnos` | Reserva de turnos |
| `GET/POST/PUT/DELETE` | `/productos` | Inventario (JWT) |
| `POST` | `/whatsapp/webhook` | Webhook Twilio |
| `GET/POST` | `/instagram/webhook` | Webhook Meta/Instagram |
| `POST` | `/auth/register` | Registro |
| `POST` | `/auth/login` | Login |
| `POST` | `/auth/forgot-password` | Reset de contraseña |

---

## Estructura

```
proxy.js          — Servidor principal (HTTP, rutas, lógica de negocio)
app.html          — Dashboard del negocio (Config, Pedidos, Turnos, Inventario, Analytics)
dashboard.html    — Vista de pedidos en tiempo real
widget.js         — Widget embebible (script de una línea)
landing.html      — Landing page pública
admin.html        — Panel de administración SaaS
demo.html         — Demo interactivo
tour.html         — Tour guiado del producto
Dockerfile        — Imagen de producción
```
