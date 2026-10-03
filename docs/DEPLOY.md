# Guía de despliegue

Cómo publicar el Ranking GEI en internet, paso a paso, con costos bajos (o nulos). Está pensada para hacerla una sola vez y volver a ella cuando haya que actualizar, restaurar un backup o cambiar algo.

Los comandos son de **PowerShell** (Windows). Donde no se pueda usar tal cual en otro shell, se aclara.

---

## 0. Qué se publica y dónde

```
   Celular / compu
        │  https
        ▼
 ┌────────────────────┐        https         ┌─────────────────────┐        SSL        ┌──────────────────┐
 │ Cloudflare Pages   │ ───────────────────► │ Fly.io (contenedor) │ ────────────────► │ Neon (PostgreSQL)│
 │ el sitio (estático)│   /api  y  /photos   │ API .NET + fotos    │                   │ la base de datos │
 └────────────────────┘                      │ (volumen de 1 GB)   │                   └──────────────────┘
                                             └─────────────────────┘
```

| Pieza | Dónde | Por qué |
| --- | --- | --- |
| Base de datos | **Neon** (plan gratuito) | PostgreSQL serverless; se "duerme" sin uso y la API ya reintenta la conexión. |
| API + fotos | **Fly.io** | Corre la imagen Docker del backend; tiene volúmenes persistentes para las fotos y región en São Paulo. |
| Sitio web | **Cloudflare Pages** | Archivos estáticos con CDN, gratis y sin límite de tráfico razonable para un club. |

Si preferís **un solo servidor** (un VPS) con todo junto, mirá la [Alternativa B](#11-alternativa-b-un-solo-servidor-con-docker-compose).

### Costos orientativos

Los precios cambian: verificalos en las páginas oficiales antes de contratar. Valores aproximados a la fecha de escritura:

| Servicio | Costo aproximado |
| --- | --- |
| Neon, plan Free | US$ 0 (límites de almacenamiento y horas de cómputo; sobra para ~70 jugadores) |
| Cloudflare Pages, plan Free | US$ 0 |
| Fly.io, 1 máquina compartida de 512 MB + volumen de 1 GB | del orden de US$ 3 a 5 por mes (menos si la máquina se apaga cuando nadie la usa) |
| **Total** | **unos US$ 3 a 5 por mes** |

---

## 1. Antes de empezar

Cuentas (todas con plan gratuito para empezar): [Neon](https://neon.tech), [Fly.io](https://fly.io) (pide tarjeta) y [Cloudflare](https://dash.cloudflare.com/sign-up).

Herramientas en tu compu:

| Herramienta | Para qué | Instalación |
| --- | --- | --- |
| Docker Desktop | construir la imagen y correr los comandos de migración, carga inicial y backups | <https://www.docker.com/products/docker-desktop/> |
| `flyctl` | desplegar la API | `winget install Fly-io.flyctl` (después `fly auth login`) |
| Node.js 22 | construir el sitio y subirlo a Cloudflare | <https://nodejs.org> |

Todo el código ya está en este repositorio; no hace falta instalar .NET ni PostgreSQL para publicar.

---

## 2. Los secretos

Nunca van en el código ni en el repositorio. Vas a necesitar:

| Secreto | Qué es | Dónde se usa |
| --- | --- | --- |
| Cadena de conexión de Neon | usuario y clave de la base | la API (`ConnectionStrings__Default`) y los comandos de preparación |
| `Jwt__Secret` | firma las sesiones del administrador (32+ caracteres al azar) | la API |
| Usuario y clave del admin | cómo entrás a `/admin` | solo el comando `seed-admin` (se guarda el hash, nunca la clave) |

Generar el secreto JWT:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Guardá los tres en un gestor de contraseñas. **Si cambiás `Jwt__Secret`, todas las sesiones abiertas se cierran** (no pasa nada más).

---

## 3. Paso 1 — Crear la base en Neon

1. En Neon: **Create project**. Nombre `gei-ranking`, región **AWS São Paulo (`sa-east-1`)** (la más cercana) y la versión de PostgreSQL por defecto (17).
2. En el panel del proyecto: **Connect**. Desactivá la opción **Connection pooling** (te queda un host *sin* `-pooler` en el nombre) y copiá los datos. Esa es la conexión **directa**; usá esa: el tráfico del club es mínimo y evita las limitaciones del pooler.
3. Armá la cadena en formato de la API (`Clave=valor;`), con los datos de Neon:

   ```text
   Host=ep-xxxx-xxxx.sa-east-1.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=LA_CLAVE;SSL Mode=Require
   ```

   Neon exige SSL, por eso `SSL Mode=Require`. La API ya está configurada con reintentos y tiempos de espera para cuando la base "se duerme": **la primera consulta después de un rato sin uso puede tardar unos segundos**, es normal.

4. Guardala en una variable para los pasos siguientes (solo vale para esa ventana de PowerShell):

   ```powershell
   $env:NEON = "Host=ep-xxxx.sa-east-1.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=LA_CLAVE;SSL Mode=Require"
   ```

   Y la misma conexión en formato URL, que usan `psql` y los backups:

   ```powershell
   $env:NEON_URL = "postgresql://neondb_owner:LA_CLAVE@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require"
   ```

---

## 4. Paso 2 — Preparar la base: tablas, jugadores y administrador

Estos tres comandos se corren **desde tu compu**, una sola vez. Usan la misma imagen Docker que va a correr en producción.

Desde la raíz del repositorio:

```powershell
# 1. Construir la imagen de la API
docker build -t gei-api ./backend

# 2. Crear las tablas (aplica las migraciones). Es seguro repetirlo: si ya está al día, no hace nada.
docker run --rm -e "ConnectionStrings__Default=$env:NEON" gei-api migrate
#    Salida esperada: "Applied 2 migration(s): ..."

# 3. Cargar los 69 jugadores y el ranking inicial. Es idempotente: si ya está cargado, no duplica nada.
docker run --rm -v "${PWD}/backend/db/seed:/seed:ro" postgres:17 psql "$env:NEON_URL" -v ON_ERROR_STOP=1 -f /seed/001_initial_players.sql

# 4. Crear el administrador (elegí una clave larga; no la reutilices de otro lado)
docker run --rm -e "ConnectionStrings__Default=$env:NEON" -e "Admin__Username=admin" -e "Admin__Password=ELEGI_UNA_CLAVE_LARGA" gei-api seed-admin
#    Salida esperada: "Admin user created."
```

Notas:

- El paso 3 **no es** el seed de desarrollo. Los partidos de ejemplo (`backend/db/seed/dev/`) **nunca** se cargan en producción; ese script, además, se niega a correr si la base no se llama `gei_ranking`.
- La fecha del ranking inicial es el `01/01/2026`. Si el club arrancó en otra fecha, editá `initial_at` al principio de `001_initial_players.sql` **antes** de correrlo: todo partido real tiene que ser posterior.
- Si ya cargaste jugadores de prueba en esa base, empezá de cero: en Neon podés borrar la base y crearla de nuevo.

---

## 5. Paso 3 — Publicar la API en Fly.io

Desde la carpeta `backend`:

```powershell
cd backend

# 1. Crear la app. Si el nombre "gei-ranking-api" está tomado, elegí otro y cambialo en fly.toml (línea "app").
fly launch --no-deploy --copy-config --name gei-ranking-api --region gru

# 2. Volumen persistente para las fotos (1 GB sobra: son unos 100 KB por jugador)
fly volumes create gei_photos --size 1 --region gru

# 3. Secretos (se guardan cifrados en Fly, no en el repositorio)
fly secrets set "ConnectionStrings__Default=$env:NEON"
fly secrets set "Jwt__Secret=EL_SECRETO_GENERADO_EN_EL_PASO_2"
fly secrets set "Cors__AllowedOrigins=https://gei-ranking.pages.dev"     # la dirección del sitio; se ajusta en el Paso 4

# 4. Desplegar (construye la imagen en Fly con el Dockerfile)
fly deploy
```

Verificá que esté viva:

```powershell
curl https://gei-ranking-api.fly.dev/api/health
# {"status":"ok","database":"ok", ...}
fly logs          # una línea JSON por evento
```

`fly.toml` ya trae: el health check (`/api/health`), HTTPS forzado, la región de São Paulo, el volumen montado en `/data` y `ASPNETCORE_FORWARDEDHEADERS_ENABLED` (para que el límite de intentos de login use la IP real del visitante y no la del proxy de Fly).

**Sobre el costo y la velocidad:** con `min_machines_running = 0` la máquina se apaga cuando nadie entra y se enciende con la próxima visita (unos segundos de demora, más los de la base si también se durmió). Para un sitio siempre ágil poné `min_machines_running = 1` en `fly.toml` y volvé a desplegar; cuesta un poco más.

---

## 6. Paso 4 — Publicar el sitio en Cloudflare Pages

El sitio es un conjunto de archivos estáticos. Hay que construirlo diciéndole **dónde está la API**:

```powershell
cd ..\frontend
npm ci
$env:VITE_API_BASE_URL = "https://gei-ranking-api.fly.dev"
npm run build
```

Subirlo:

```powershell
npx wrangler login
npx wrangler pages deploy dist --project-name gei-ranking
```

La primera vez pregunta si crea el proyecto (aceptá, rama de producción `main`). Al terminar te muestra la dirección, algo como `https://gei-ranking.pages.dev`.

Ya vienen listos en `frontend/public`: `_redirects` (para que `/players/12` o `/admin` funcionen al recargar la página) y `_headers` (cabeceras de seguridad y caché de los archivos con hash).

**Último ajuste:** la API solo acepta pedidos del sitio autorizado. Poné la dirección real de Pages (varias separadas por coma, sin barra final):

```powershell
cd ..\backend
fly secrets set "Cors__AllowedOrigins=https://gei-ranking.pages.dev"
```

> **Variante con repositorio en GitHub:** si subís el código a un repositorio *privado* podés conectarlo en Cloudflare Pages (Workers & Pages → Create → Pages → Connect to Git) con: carpeta raíz `frontend`, comando `npm ci && npm run build`, salida `dist`, y las variables `VITE_API_BASE_URL` y `NODE_VERSION=22`. Cada `git push` publica solo.

---

## 7. Paso 5 — Probar que todo anda

1. Abrí la dirección de Pages desde el **celular**: se ve el ranking con los 69 jugadores.
2. Entrá a un perfil y a **Partidos**: cargan (sin datos de partidos todavía, es lo esperado).
3. Abrí `/admin`, ingresá con el usuario y la clave del paso 4.
4. Cargá un resultado de prueba (la vista previa muestra el movimiento), mirá el ranking público y **anulá** el partido de prueba.
5. Entrá a un jugador, subí una foto y fijate que se vea en el ranking.
6. En la consola del navegador (F12 → Network) no tiene que haber errores rojos de CORS.

Si algo falla, mirá [Problemas comunes](#13-problemas-comunes).

---

## 8. Dominio propio (opcional)

- **Sitio:** en Cloudflare Pages → tu proyecto → *Custom domains* → agregá `ranking.tuclub.com.ar` y seguí las instrucciones (el HTTPS es automático).
- **API:** `fly certs add api.tuclub.com.ar` y creá el registro DNS que te indica.
- Después actualizá: el build del sitio (`VITE_API_BASE_URL=https://api.tuclub.com.ar` y volver a subirlo) y el secreto `Cors__AllowedOrigins` con el dominio nuevo.

---

## 9. Operación diaria

### Ver qué pasó (logs)

La API escribe **una línea JSON por evento** con fecha UTC, nivel y mensaje:

```powershell
fly logs                                       # en vivo
fly logs | Select-String 'Failed admin login'  # intentos de ingreso fallidos
fly logs | Select-String 'GeiRanking.Audit'    # lo que hizo el administrador
```

Queda registrado: cada pedido (`HTTP POST /api/admin/matches -> 201 in 45 ms`), los ingresos del admin (los fallidos con el usuario escrito, nunca la clave), la carga/edición/anulación de partidos, los cambios de jugadores y fotos, y los ajustes manuales con su motivo. Cada línea de una acción de admin incluye `"Admin":"nombre"`.

### Actualizar la aplicación

1. Probá los cambios en tu compu (`dotnet test backend` y `npm test --prefix frontend`).
2. Si la versión nueva trae **migraciones**, aplicalas **antes** de desplegar (con la imagen nueva): `docker build -t gei-api ./backend` y `docker run --rm -e "ConnectionStrings__Default=$env:NEON" gei-api migrate`. Hacé un [backup](#10-backups-y-restauración) justo antes.
3. API: `cd backend; fly deploy`. Sitio: repetí el build y `wrangler pages deploy` del Paso 4.
4. Revisá `fly logs` unos minutos.

Volver atrás: `fly releases` y `fly deploy --image <imagen anterior>` para la API; en Cloudflare Pages, *Deployments → Rollback*. Las migraciones no se deshacen solas: por eso el backup previo.

### Cambiar la clave del administrador

El comando `seed-admin` no pisa un usuario existente. Para cambiarla: borrá el usuario y volvé a crearlo.

```powershell
docker run --rm postgres:17 psql "$env:NEON_URL" -c "delete from admin_users where username = 'admin'"
docker run --rm -e "ConnectionStrings__Default=$env:NEON" -e "Admin__Username=admin" -e "Admin__Password=LA_NUEVA_CLAVE" gei-api seed-admin
```

### Rotar el secreto de sesión

`fly secrets set "Jwt__Secret=OTRO_VALOR"`: la API se reinicia y el admin tiene que volver a ingresar.

### Regenerar el ranking

El ranking se calcula a partir de los eventos; si alguna vez hiciste cambios directos en la base: `docker run --rm -e "ConnectionStrings__Default=$env:NEON" gei-api rebuild-ranking`.

---

## 10. Backups y restauración

Neon guarda un historial corto de la base (restauración a un momento anterior) en el plan gratuito, pero **no confíes solo en eso**: tené copias propias.

### Hacer un backup a mano

Necesita Docker Desktop y la variable `NEON_URL` del Paso 1:

```powershell
$env:DATABASE_URL = $env:NEON_URL
.\ops\backup\backup.ps1            # deja gei-ranking-AAAAMMDD-HHMMSSZ.dump en la carpeta backups\
```

El script hace `pg_dump` en formato comprimido, **comprueba que el archivo se pueda leer**, lo guarda recién cuando está completo y borra los de más de 30 días (`-KeepDays` para cambiarlo). Un backup fallido no pisa uno bueno. En Linux/macOS: `./ops/backup/backup.sh`.

### Programarlo (que se haga solo)

**Opción 1 — en tu compu (Programador de tareas de Windows):** todos los días a las 03:00, con la compu encendida:

```powershell
setx DATABASE_URL "postgresql://neondb_owner:LA_CLAVE@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require"
schtasks /Create /SC DAILY /ST 03:00 /TN "GEI Ranking backup" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\gei-ranking\ops\backup\backup.ps1"
```

**Opción 2 — en GitHub (sin depender de tu compu):** si el código está en un repositorio **privado**, el workflow `.github/workflows/backup.yml` hace el backup todos los días a las 04:00 de Buenos Aires y lo guarda 30 días como *artifact*. Solo hay que crear el secreto `DATABASE_URL` (Settings → Secrets and variables → Actions) con la URL de Neon. Se puede probar a mano desde la pestaña *Actions → Database backup → Run workflow*. No lo uses en un repositorio público: el archivo contiene los nombres de los jugadores.

### Restaurar (y comprobar que el backup sirve)

Antes de necesitarlo, **probá una restauración** en una base descartable; es lo único que prueba que el backup sirve:

```powershell
# Git Bash / Linux / macOS (usa un contenedor temporal y lo borra al terminar)
./ops/backup/verify-restore.sh backups/gei-ranking-20261003-101500Z.dump
# Muestra la cantidad de jugadores, partidos y eventos restaurados.
```

Restauración real (**reemplaza** el contenido de la base de destino): primero creá una base vacía en Neon (o usá una rama nueva), y después:

```powershell
docker run --rm -v "${PWD}/backups:/backups:ro" postgres:17 pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$env:NEON_URL" /backups/gei-ranking-20261003-101500Z.dump
```

Después del restore, apuntá la API a esa base (`fly secrets set "ConnectionStrings__Default=..."`) y corré `rebuild-ranking` por las dudas.

### Las fotos

Las fotos están en el volumen de Fly (`/data/photos`), no en la base. Fly toma instantáneas diarias del volumen (verificá cuántos días las conserva). Para tener una copia propia:

```powershell
cd backend
fly ssh console -C "tar czf /tmp/fotos.tgz -C /data photos"
fly ssh sftp get /tmp/fotos.tgz fotos-backup.tgz
```

Si se pierden las fotos, el sitio sigue funcionando: se muestra el avatar generado y se vuelven a subir desde `/admin`.

---

## 11. Alternativa B: un solo servidor con Docker Compose

Para un VPS (por ejemplo uno de ~€4/mes) con Docker. Levanta PostgreSQL, la API y el sitio (nginx) juntos; el navegador ve **un solo origen**, así que no hay CORS ni `VITE_API_BASE_URL`.

```bash
git clone <el repositorio> && cd gei-ranking
export DB_PASSWORD="$(openssl rand -base64 24)"
export JWT_SECRET="$(openssl rand -base64 48)"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm api migrate
cat backend/db/seed/001_initial_players.sql | docker compose -f docker-compose.prod.yml exec -T db psql -v ON_ERROR_STOP=1 -U gei -d gei_ranking
ADMIN_USERNAME=admin ADMIN_PASSWORD='UNA_CLAVE_LARGA' docker compose -f docker-compose.prod.yml run --rm api seed-admin
```

Guardá `DB_PASSWORD` y `JWT_SECRET` (los comandos siguientes los necesitan de nuevo; se puede dejar un archivo `.env` junto al compose, que ya está ignorado por git). El sitio queda en `http://servidor:8081` (`WEB_PORT` cambia el puerto).

**HTTPS:** el compose sirve HTTP. Poné delante un proxy con certificado automático; lo más simple es [Caddy](https://caddyserver.com): un `Caddyfile` con `ranking.tuclub.com.ar { reverse_proxy web:8080 }` y un servicio `caddy` en el mismo compose (esta parte no está probada). Con HTTPS adelante, agregá `Cors__AllowedOrigins: https://ranking.tuclub.com.ar` en el servicio `api`.

Backups de esta variante: `DOCKER_NETWORK=gei-ranking-prod_default DATABASE_URL="postgresql://gei:$DB_PASSWORD@db:5432/gei_ranking" ./ops/backup/backup.sh` (y las fotos están en el volumen `gei-ranking-prod_photos`).

Esta es exactamente la variante que se probó de punta a punta antes de escribir la guía (ver el [último apartado](#14-qué-se-probó-y-qué-no)).

---

## 12. Hosting: opciones y almacenamiento de fotos

Alternativas razonables a lo propuesto, para decidir con información (precios aproximados, verificalos):

| Opción | Ventajas | Desventajas |
| --- | --- | --- |
| **Fly.io + Neon + Cloudflare Pages** (la de esta guía) | Barata, región en São Paulo, volumen para las fotos, la imagen Docker se despliega tal cual | Pide tarjeta; unos US$ 3-5/mes; la máquina fría tarda unos segundos |
| **VPS con Docker Compose** (Hetzner, DigitalOcean, etc.) | Un solo lugar, previsible, todo junto (incluida la base) | Tenés que mantener el servidor (actualizaciones, backups, HTTPS) |
| **Render** (plan gratuito) | Fácil | El servicio gratuito se duerme y **no tiene disco persistente**: las fotos se perderían (habría que sumar almacenamiento externo) |
| **Azure App Service F1** | Gratis | Poco cómputo por día; ajustes extra para Docker y almacenamiento |

**Fotos.** Hoy se guardan en un disco (volumen) detrás de la interfaz `IPhotoStorage`. Es lo más simple y alcanza de sobra (menos de 10 MB para todo el club). Si algún día se quiere un hosting sin disco persistente, o fotos con CDN, el cambio es escribir otra implementación de `IPhotoStorage` (por ejemplo para Cloudflare R2, almacenamiento compatible con S3 con 10 GB gratis) sin tocar el resto de la aplicación.

**Licencia de ImageSharp.** Las fotos se procesan con SixLabors ImageSharp, que usa la *Six Labors Split License*: gratuita para proyectos de código abierto, personas y organizaciones chicas, con licencia comercial paga para empresas grandes. Un club entra, pero **leé los términos vigentes** en <https://sixlabors.com/pricing/>. Se usa la versión 3.1.x a propósito: la 4.x exige cargar una clave de licencia para compilar en Release.

---

## 13. Problemas comunes

| Síntoma | Causa probable y solución |
| --- | --- |
| El sitio carga pero el ranking dice "No se pudo conectar con el servidor" | La API está apagada (esperá unos segundos y reintentá), o `VITE_API_BASE_URL` apunta mal: reconstruí y volvé a subir el sitio. |
| En la consola del navegador: error de **CORS** | `Cors__AllowedOrigins` no coincide **exactamente** con la dirección del sitio (con `https://`, sin barra al final). `fly secrets set "Cors__AllowedOrigins=..."`. |
| Al recargar `/players/5` o `/admin` aparece "Not found" | Falta `_redirects` en el sitio publicado: tiene que estar en `frontend/public` y haberse incluido en el build. |
| La primera visita tarda 5-10 segundos | Máquina de Fly apagada y/o base de Neon dormida. Es esperado; con `min_machines_running = 1` se acorta. |
| El admin no puede entrar: "Usuario o contraseña incorrectos" | Se creó el admin en otra base, o la clave tiene un typo. Repetí el cambio de clave de la sección 9. |
| "Demasiados intentos" al ingresar | El límite es de 10 intentos por minuto por IP. Esperá un minuto. |
| El admin se desloguea solo | Pasaron 8 horas, o se cambió `Jwt__Secret`. Volvé a ingresar. |
| No se pueden subir fotos | Falta el volumen o no está montado en `/data` (`fly volumes list`), o el build de Fly no usó `APP_USER=0` (el volumen es de `root`). Revisá `fly logs`. |
| La API no arranca: "Missing or too short JWT secret" | Falta `Jwt__Secret` o tiene menos de 32 caracteres. |
| La API no arranca: "Missing connection string" | Falta `ConnectionStrings__Default`. |
| `migrate` falla con error de SSL o autenticación | La cadena de Neon está mal armada: revisá `Host`, `Username`, `Password` y `SSL Mode=Require`, y que sea la conexión *directa* (sin `-pooler`). |

---

## 14. Qué se probó y qué no

Para que sepas hasta dónde llega la verificación:

**Probado de punta a punta (en esta máquina, con Docker):**
- La construcción de ambas imágenes en modo Release y su ejecución como usuario sin privilegios.
- Todo el flujo de la [Alternativa B](#11-alternativa-b-un-solo-servidor-con-docker-compose): `migrate`, la carga inicial (idempotente), `seed-admin`, y el sitio y la API detrás de nginx.
- Un recorrido completo con un navegador real contra esas imágenes: login, carga de resultado con vista previa, anulación, desafío fuera de rango, edición, alta de jugador, subida y borrado de foto, baja, ajuste manual y sesión vencida (34 comprobaciones).
- Las fotos sobreviven al reinicio del contenedor (volumen), y un archivo de más de 6 MB se rechaza en el proxy.
- Los backups (`backup.sh` y `backup.ps1`): el archivo se restaura en una base limpia con los mismos números que la base original; un fallo no deja archivos a medias; los viejos se borran.
- Los mismos comandos `migrate`, `psql` y `seed-admin` de esta guía contra una base PostgreSQL.
- Accesibilidad y diseño adaptable: 0 problemas en una auditoría automática (axe, WCAG 2.2 AA) de 20 pantallas a 4 anchos (320 a 1280 px) y sin desborde horizontal.

**No se pudo probar** (requiere cuentas reales): el despliegue en **Neon, Fly.io y Cloudflare Pages**, ni el workflow de GitHub Actions. Los comandos y `fly.toml` están escritos según la documentación de cada servicio; si alguno falla por un cambio de la plataforma, el mensaje de error suele indicar el ajuste (por ejemplo `fly config validate`).
