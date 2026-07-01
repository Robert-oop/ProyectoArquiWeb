[README.md](https://github.com/user-attachments/files/29575247/README.md)
# StockAI SmartFlow — Sistema de Gestión de Bodega con IA

Sistema WMS (Warehouse Management System) para empresas con productos perecederos. Combina el algoritmo FEFO (First Expired, First Out) con visión artificial para identificación de productos, alertas automáticas de stock y notificaciones por correo electrónico.

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Vanilla JS (ES6 Modules) + Vite 5 + Nginx |
| Backend | Node.js 20 + Express 4 + Sequelize 6 |
| Base de datos | PostgreSQL 15 |
| Caché / Rate limiting | Redis 7 |
| Servicio IA | Python 3.11 + FastAPI + OpenCV |
| Orquestación | Docker + Docker Compose |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución
- Puertos disponibles: `3000`, `5432`, `6379`, `8080`, `9000`

---

## Ejecución local

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd stockai-smartflow
```

### 2. Configurar variables de entorno del backend

```bash
cp backend/.env.example backend/.env
```

Editar `backend/.env` y completar las variables SMTP para habilitar notificaciones por correo (opcional para desarrollo):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_contraseña_de_aplicacion
SMTP_FROM="StockAI SmartFlow <tu_correo@gmail.com>"
```

### 3. Levantar todos los servicios

```bash
docker compose up -d
```

El sistema inicia en el orden correcto automáticamente:
1. PostgreSQL y Redis (bases de datos)
2. Backend Node.js (espera a que la BD esté lista, ejecuta migraciones)
3. AI Service Python (carga modelos de visión)
4. Frontend Nginx (sirve la aplicación compilada)

### 4. Verificar que todo esté corriendo

```bash
docker compose ps
```

Todos los servicios deben mostrar estado `healthy` o `running`.

### 5. Acceder al sistema

| Servicio | URL |
|---|---|
| Aplicación web | http://localhost:8080 |
| API REST | http://localhost:3000/api/v1 |
| Health check | http://localhost:3000/health |
| AI Service | http://localhost:9000/health |

---

## Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | admin@stockai.cl | `Admin2025!` |
| Manager | jefe@stockai.cl | `Manager2025!` |
| Operador | repositor@stockai.cl | `Operator2025!` |

---

## API REST — Endpoints principales

Base URL: `http://localhost:3000/api/v1`

Todos los endpoints (excepto `/auth/login` y `/health`) requieren header:
```
Authorization: Bearer <access_token>
```

### Autenticación

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/auth/login` | Iniciar sesión | Público |
| `POST` | `/auth/refresh` | Renovar token | Público |
| `POST` | `/auth/logout` | Cerrar sesión | Autenticado |

### Productos

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/products` | Listar con stock real y estado FEFO | Todos |
| `POST` | `/products` | Crear producto | Admin/Manager |
| `GET` | `/products/:id` | Detalle de producto | Todos |
| `PUT` | `/products/:id` | Actualizar producto | Admin/Manager |
| `DELETE` | `/products/:id` | Desactivar producto (soft delete) | Admin/Manager |
| `GET` | `/products/generate-sku` | Generar SKU único | Todos |
| `GET` | `/products/:id/batches` | Lotes FEFO del producto | Todos |
| `POST` | `/products/:id/batches` | Registrar nuevo lote | Admin/Manager |
| `GET` | `/products/:id/threshold` | Umbral de stock crítico | Todos |
| `PUT` | `/products/:id/threshold` | Actualizar umbral | Admin/Manager |

### Lotes (Batches)

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/batches/expiring` | Lotes próximos a vencer (FEFO) | Todos |
| `PATCH` | `/batches/:id/consume` | Consumir unidades de un lote | Admin/Manager |
| `PATCH` | `/batches/:id/void` | Dar de baja por merma | Admin/Manager |

### Alertas

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/alerts` | Listar alertas activas/resueltas | Todos |
| `GET` | `/alerts/:id` | Detalle de alerta | Todos |
| `PATCH` | `/alerts/:id/resolve` | Marcar alerta como resuelta | Admin/Manager |
| `POST` | `/alerts/run-stock-check` | Verificar stock manualmente | Autenticado |

### Stock

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/stock/critical` | Productos bajo umbral crítico | Todos |

### Inteligencia Artificial

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/ai/identify` | Identificar producto por imagen | Autenticado |

### Usuarios

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/users` | Listar usuarios | Admin |
| `POST` | `/users` | Crear usuario | Admin |
| `PUT` | `/users/:id` | Actualizar usuario | Admin |
| `PATCH` | `/users/:id/toggle` | Activar/desactivar usuario | Admin |

### Auditoría

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/audit` | Log de auditoría paginado | Admin/Manager |

---

## Estructura del proyecto

```
stockai-smartflow/
├── backend/                  # API Node.js + Express
│   ├── src/
│   │   ├── config/           # DB, logger, constantes
│   │   ├── controllers/      # Handlers HTTP
│   │   ├── jobs/             # Cron jobs automáticos
│   │   ├── middleware/       # Auth, errores, rate limit
│   │   ├── models/           # Modelos Sequelize
│   │   ├── routes/           # Definición de rutas REST
│   │   └── services/         # Lógica de negocio (FEFO, alertas, email)
│   ├── .env                  # Variables de entorno (no en git)
│   ├── .env.example          # Plantilla de variables
│   └── server.js             # Punto de entrada
│
├── frontend/                 # SPA Vanilla JS + Vite
│   ├── src/
│   │   ├── api/              # Clientes HTTP por módulo
│   │   ├── components/       # Componentes reutilizables
│   │   ├── pages/            # Módulos de cada pantalla
│   │   └── styles/           # CSS global
│   └── index.html
│
├── ai-service/               # Microservicio Python + FastAPI
│   ├── src/
│   │   ├── identifier.py     # Pipeline de identificación (8 pasos)
│   │   ├── reference_db.py   # Base de imágenes de referencia (ORB)
│   │   ├── ocr_pipeline.py   # Reconocimiento óptico de caracteres
│   │   └── vision_math.py    # Histograma HSV, calibración, NCC
│   └── reference_images/     # Imágenes de referencia por producto
│
├── database/
│   ├── migrations/           # Schema versionado (Sequelize CLI)
│   └── seeders/              # Datos de prueba iniciales
│
└── docker-compose.yml        # Orquestación local completa
```

---

## Jobs automáticos

El sistema ejecuta tareas en segundo plano sin intervención del usuario:

| Job | Horario | Función |
|---|---|---|
| `fefo-checker` | Cada hora | Detecta lotes con fecha de alerta vencida |
| `stock-checker` | 08:00, 12:00, 18:00 | Verifica stock contra umbrales mínimos |
| `daily-summary` | 07:00 | Resumen diario del estado de bodega |

Al arrancar el servidor se ejecuta una verificación de stock inmediata.

---

## Detener el sistema

```bash
docker compose down
```

Para eliminar también los datos persistentes (base de datos):

```bash
docker compose down -v
```

---

## Reconstruir el frontend tras cambios

```bash
docker compose build --no-cache frontend && docker compose up -d frontend
```
