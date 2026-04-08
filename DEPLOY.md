# Deploy Guide — Restaurant AI Widget

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | Clave de API de OpenAI |
| `PORT` | No | `3001` | Puerto del servidor |
| `DB_PATH` | No | `~/chat.db` | Ruta al archivo SQLite |
| `NODE_ENV` | No | `development` | Entorno de ejecución |

---

## Opción 1 — Local (sin Docker)

```bash
cp .env.example .env
# Editar .env y agregar OPENAI_API_KEY

npm install
OPENAI_API_KEY=sk-... node proxy.js
```

Abrir en el navegador:
- Admin:     http://localhost:3001/admin.html
- Dashboard: http://localhost:3001/dashboard.html?businessId=xxx
- Config:    http://localhost:3001/config.html?businessId=xxx

---

## Opción 2 — Docker Compose (VPS / DigitalOcean Droplet)

```bash
cp .env.example .env
# Editar .env y agregar OPENAI_API_KEY

docker compose up --build -d
```

La base de datos se guarda en el volumen Docker `db_data` (persiste entre reinicios y deploys).

Para ver logs:
```bash
docker compose logs -f
```

Para actualizar a una nueva versión:
```bash
git pull
docker compose up --build -d
```

---

## Opción 3 — Railway

1. Crear proyecto nuevo en [railway.app](https://railway.app)
2. Conectar el repositorio de GitHub
3. En **Settings → Variables** agregar:
   ```
   OPENAI_API_KEY=sk-...
   DB_PATH=/data/chat.db
   PORT=3001
   ```
4. En **Settings → Volumes** agregar un volumen montado en `/data`
5. Railway detecta el `Dockerfile` automáticamente y hace deploy.

> **Nota:** sin el volumen persistente, la base de datos se resetea en cada deploy.

---

## Opción 4 — Render

1. Crear un nuevo **Web Service** en [render.com](https://render.com)
2. Conectar el repositorio de GitHub
3. Render detecta el `Dockerfile` automáticamente
4. En **Environment** agregar:
   ```
   OPENAI_API_KEY=sk-...
   PORT=3001
   ```
5. En **Disks** agregar un disco persistente montado en `/data` con `DB_PATH=/data/chat.db`

> Free tier de Render no incluye discos persistentes — la BD se pierde en cada deploy. Usar el plan Starter ($7/mes) o superior.

---

## Opción 5 — DigitalOcean App Platform

1. Crear una nueva **App** en [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Conectar el repositorio de GitHub → seleccionar **Dockerfile**
3. En **Environment Variables** agregar:
   ```
   OPENAI_API_KEY=sk-...
   DB_PATH=/data/chat.db
   PORT=3001
   ```
4. Agregar un **Storage → Persistent Storage** montado en `/data`
5. Deploy.

---

## Dominio y HTTPS

Todos los servicios arriba proveen HTTPS automático con subdominio propio.

Para dominio personalizado (ej. `api.tupizzeria.com`):
1. Agregar el dominio en el panel del proveedor
2. Crear un registro DNS `CNAME` apuntando al dominio del proveedor
3. El widget se inicializa apuntando a ese dominio:

```html
<script>
  window.ChatWidgetConfig = {
    businessId: 'mi-pizzeria',
    proxyUrl: 'https://api.tupizzeria.com'
  };
</script>
<script src="https://api.tupizzeria.com/widget.js"></script>
```

---

## Estructura de archivos

```
.
├── proxy.js          # Servidor Node.js (API + archivos estáticos)
├── widget.js         # Chat widget (sirve como /widget.js)
├── dashboard.html    # Panel de pedidos por negocio
├── config.html       # Configuración por negocio
├── admin.html        # Panel maestro SaaS (todos los negocios)
├── demo.html         # Demo de ejemplo
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .dockerignore
└── package.json
```

## Health check

El servidor expone `GET /health` que devuelve `{"status":"ok","ts":...}`.
Docker Compose y los proveedores de cloud lo usan para verificar que el servicio está vivo.
