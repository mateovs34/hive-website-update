# AI Chatbot SaaS — ChatWidget

> **En producción** → [chatbot-saas-production-0dae.up.railway.app/landing](https://chatbot-saas-production-0dae.up.railway.app/landing)

---

## ¿Qué es?

ChatWidget es una plataforma SaaS que permite a negocios locales desplegar un asistente de IA en minutos. El bot atiende clientes, responde preguntas, toma pedidos y reserva turnos — de forma autónoma, las 24 horas — tanto en su sitio web como por WhatsApp e Instagram DMs. Cada negocio tiene su propio dashboard para configurar el bot, gestionar pedidos en tiempo real, administrar su inventario y ver analytics de ventas.

---

## Features

### Canales
- 🌐 **Widget web embebible** — una línea de código en cualquier sitio
- 💬 **WhatsApp** — bot de atención al cliente vía Twilio
- 📸 **Instagram DMs** — integración con Meta Graph API
- 🎙️ **Notas de voz** — transcripción automática con OpenAI Whisper en WhatsApp e Instagram

### Gestión de negocio
- 📦 **Pedidos en tiempo real** — estados: pendiente → confirmado → en preparación → en camino → entregado
- 🔔 **Notificaciones automáticas** — WhatsApp al cliente en cada cambio de estado
- 📅 **Sistema de turnos** — disponibilidad por día y franja horaria, reserva desde el bot o el widget
- 🗃️ **Inventario** — alta de productos, movimientos de stock, alertas de stock mínimo
- 📊 **Analytics** — pedidos por hora, facturación diaria/semanal/mensual, ticket promedio, productos más vendidos, hora pico
- 💬 **Conversaciones** — historial completo de chats por sesión

### Bot con IA
- 🤖 **GPT-4o-mini** para respuestas conversacionales naturales
- 📋 **Menú inteligente** — el bot conoce precios, categorías y disponibilidad
- 🗓️ **Reserva de turnos** — el bot verifica disponibilidad y confirma turnos en la conversación
- 📦 **Detección de pedidos** — extrae ítems y totales del chat y los registra automáticamente
- 👤 **Bot dueño** — el propietario consulta métricas del negocio directamente por WhatsApp/Instagram

### Plataforma
- 🔒 **Autenticación JWT** — cada negocio accede solo a sus propios datos
- 📧 **Reset de contraseña** por email
- 🧩 **Módulos activables** — cada negocio activa solo lo que usa (pedidos, turnos, inventario)
- 📱 **Responsive** — dashboard optimizado para móvil y desktop
- 🐳 **Containerizado** — deploy en Railway con Docker, base de datos PostgreSQL gestionada

---

## Stack técnico

| Área | Tecnología |
|---|---|
| Backend | Node.js |
| Base de datos | PostgreSQL |
| IA | OpenAI GPT-4o-mini + Whisper |
| WhatsApp | Twilio |
| Instagram | Meta Graph API |
| Auth | JWT + bcryptjs |
| Email | Resend |
| Deploy | Railway + Docker |
| Gráficos | Chart.js |

---

## Demo en vivo

[chatbot-saas-production-0dae.up.railway.app/landing](https://chatbot-saas-production-0dae.up.railway.app/landing)

---

## Screenshots

> *Las imágenes se agregarán a continuación*

**Landing page**
<!-- screenshot: landing.png -->

**Dashboard — Pedidos en tiempo real**
<!-- screenshot: dashboard-pedidos.png -->

**Configuración del bot**
<!-- screenshot: config-bot.png -->

**Analytics de ventas**
<!-- screenshot: analytics.png -->

**Chat widget en acción**
<!-- screenshot: widget-demo.png -->

**Sistema de turnos**
<!-- screenshot: turnos.png -->

**Inventario**
<!-- screenshot: inventario.png -->
