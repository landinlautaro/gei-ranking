# Ranking de Tenis GEI

Ranking interno de tenis del club GEI (escalera por desafíos). Especificación completa en [`docs/SPEC.md`](docs/SPEC.md).

```
backend/    Solución .NET 10 (Api, Domain, Infrastructure, tests)
frontend/   React + TypeScript + Vite
docs/       Especificación y reglamento original
docker-compose.yml   PostgreSQL para desarrollo
```

## Requisitos
- [.NET SDK 10](https://dotnet.microsoft.com/download)
- [Node.js 22+](https://nodejs.org/)
- Docker Desktop (para PostgreSQL local)

## Correr todo en local

```bash
# 1. Base de datos (PostgreSQL 17 en localhost:5433)
docker compose up -d

# 2. Backend (http://localhost:5172, Swagger en /swagger)
dotnet run --project backend/src/GeiRanking.Api

# 3. Frontend (http://localhost:5173)
cd frontend
npm install        # solo la primera vez
npm run dev
```

El frontend llama a `/api/...` y Vite reenvía esos pedidos al backend (`vite.config.ts`), así que en desarrollo no hace falta CORS.

Para ver datos: cargar los seeds (ver [Base de datos](#base-de-datos)). Páginas públicas: `/` (ranking con buscador), `/players/:id` (perfil) y `/matches` (partidos con filtros por jugador y fechas, guardados en la URL).

### Configuración
En desarrollo, `backend/src/GeiRanking.Api/appsettings.Development.json` ya apunta al PostgreSQL de Docker (credenciales descartables de desarrollo). Cualquier valor se puede pisar con variables de entorno (ver [`.env.example`](.env.example)):

| Variable | Descripción |
| --- | --- |
| `ConnectionStrings__Default` | Cadena de conexión a PostgreSQL. Para Neon usar `SSL Mode=Require`. |
| `Cors__AllowedOrigins` | Orígenes permitidos, separados por coma. |
| `Jwt__Secret` | Secreto para firmar los tokens del admin (32+ caracteres). **Obligatorio fuera de desarrollo**: sin él la API no arranca. En desarrollo, si falta, se genera uno al azar por arranque. |
| `Admin__Username` / `Admin__Password` | Primer administrador, solo para el comando `seed-admin` (contraseña de 10+ caracteres). |
| `Storage__PhotosPath` | Carpeta de las fotos de jugadores (por defecto `backend/src/GeiRanking.Api/uploads/photos`). |

Fuera de desarrollo la cadena de conexión es obligatoria y no hay valores por defecto.

## Tests
```bash
dotnet test backend            # xUnit
npm test --prefix frontend     # Vitest
```
Los tests de `GeiRanking.Api.Tests` usan PostgreSQL real: crean una base temporal (`gei_test_<guid>`) en el servidor de `docker compose` y la borran al terminar, así que la base local tiene que estar levantada. Para usar otro servidor, definir `TEST_POSTGRES_ADMIN` (cadena de conexión con permiso para crear bases).

## Base de datos

### Migraciones
Se aplican con un comando explícito; nunca al iniciar la app. Desde la raíz del repo, con `ConnectionStrings__Default` definida (o `ASPNETCORE_ENVIRONMENT=Development` para usar la base de Docker):

```bash
# aplicar migraciones pendientes
dotnet ef database update --project backend/src/GeiRanking.Infrastructure --startup-project backend/src/GeiRanking.Api

# crear una migración nueva tras cambiar el modelo
dotnet ef migrations add NombreDescriptivo --project backend/src/GeiRanking.Infrastructure --startup-project backend/src/GeiRanking.Api --output-dir Migrations
```
Requiere la herramienta: `dotnet tool install --global dotnet-ef`. Para ver el SQL sin aplicarlo: `dotnet ef migrations script ...` (útil para revisarlo antes de correrlo en Neon).

### Carga inicial de jugadores
`backend/db/seed/001_initial_players.sql` inserta los 69 jugadores y el evento `InitialRanking` con el orden de la spec. Es idempotente (si ya existe el evento, no hace nada) y corre en una transacción. Se ejecuta con `psql`:

```bash
# Local (PostgreSQL de docker compose; no hace falta tener psql instalado)
docker exec -i gei-ranking-db psql -v ON_ERROR_STOP=1 -U gei -d gei_ranking < backend/db/seed/001_initial_players.sql

# Neon (usar la cadena de conexión de Neon, con SSL)
psql "postgresql://usuario:clave@<endpoint>.neon.tech/<base>?sslmode=require" -v ON_ERROR_STOP=1 -f backend/db/seed/001_initial_players.sql
```
La fecha de ingreso y del evento inicial es el `01/01/2026` (medianoche en hora del club) (variable `initial_at` al principio del script); todo partido real debe tener fecha posterior.

### Partidos de prueba (solo desarrollo)
`backend/db/seed/dev/900_dev_sample_matches.sql` carga 11 partidos de ejemplo (incluye un W.O., un abandono y un partido anulado) para tener datos en la API. **Nunca correrlo en producción**: el script se niega a ejecutarse si la base no se llama `gei_ranking`. Después de cargarlo hay que regenerar el ranking:

```bash
docker exec -i gei-ranking-db psql -v ON_ERROR_STOP=1 -U gei -d gei_ranking < backend/db/seed/dev/900_dev_sample_matches.sql
dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking
```

### Regenerar el ranking
El ranking, el historial de posiciones y los campos derivados de cada partido (posiciones antes/después, movimiento, advertencia) salen de reproducir los eventos. Para regenerarlos a mano (por ejemplo después de cargar datos por SQL):

```bash
dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking
```

## API pública (Fase 2)
Sin login. Documentación interactiva en `/swagger` (solo en desarrollo).

| Endpoint | Descripción |
| --- | --- |
| `GET /api/ranking` | Ranking actual: posición, jugador, PJ/PG/PP, desafíos ganados/perdidos, posición anterior y movimiento. |
| `GET /api/players` | Jugadores ordenados por nombre (`?includeInactive=true` incluye bajas). |
| `GET /api/players/{id}` | Perfil: datos, estadísticas (incluye defensas, % de victorias, racha, mejor posición), a quiénes puede desafiar y evolución de posición. |
| `GET /api/matches` | Partidos válidos, del más nuevo al más viejo. Filtros: `playerId`, `from`, `to` (`yyyy-MM-dd`, inclusivos, en hora del club), `page`, `pageSize` (máx. 100). |

## API de administración (Fase 4)
Todo lo de `/api/admin/*` exige un JWT de administrador; sin token (o con uno vencido o inválido) responde 401. Los errores de negocio vuelven como `application/problem+json` con un `code` estable (y `errors` por campo, con códigos) que la interfaz traduce.

### Crear el primer administrador
```bash
# PowerShell
$env:Admin__Username = "admin"; $env:Admin__Password = "una-clave-larga-de-verdad"
dotnet run --project backend/src/GeiRanking.Api -- seed-admin
```
Guarda solo el hash de la contraseña. Es idempotente: si el usuario ya existe no lo toca. En producción, definir además `Jwt__Secret` (por ejemplo `openssl rand -base64 48`).

### Probarlo desde Swagger
1. `dotnet run --project backend/src/GeiRanking.Api` y abrir `http://localhost:5172/swagger`.
2. `POST /api/auth/login` con usuario y contraseña; copiar el `token`.
3. Botón **Authorize** → pegar el token (solo el token, sin "Bearer").
4. Los endpoints con candado ya quedan habilitados. Cerrar sesión es descartar el token (el cliente lo borra; no hay estado en el servidor).

El login tiene límite de intentos (10 por minuto por IP, configurable con `RateLimit__LoginPermitPerMinute`). Detrás de un proxy inverso hay que configurar `ForwardedHeaders` para que se vea la IP real del cliente.

| Endpoint | Qué hace |
| --- | --- |
| `POST /api/auth/login` | Devuelve el JWT (vale 8 horas por defecto). |
| `GET /api/admin/me` | Usuario logueado; sirve para chequear que el token sigue vigente. |
| `GET/POST /api/admin/players`, `GET/PUT /api/admin/players/{id}` | Listar, alta (al final o en `position`) y edición de datos. |
| `POST /api/admin/players/{id}/deactivate` · `/reactivate` | Baja lógica (sale del ranking, los de abajo suben, se conserva el historial) y reingreso. |
| `PUT/DELETE /api/admin/players/{id}/photo` | Subir (JPEG/PNG/WebP, máx. 5 MB; se recorta a 400×400 y se guarda como JPEG) o quitar la foto. Se sirve en `/photos/...`. |
| `POST /api/admin/matches/preview` | Valida el resultado y muestra el movimiento que aplicaría, sin guardar. `?editingMatchId=` al editar. |
| `POST /api/admin/matches` | Guarda el resultado y recalcula el ranking en **una sola transacción**. Un desafío fuera de rango (más de 5 puestos, o hacia abajo) devuelve 409 `OutOfRangeConfirmationRequired` hasta reenviar con `allowOutOfRange: true`. |
| `PUT /api/admin/matches/{id}` · `POST /api/admin/matches/{id}/void` | Editar y anular, con recálculo. Los partidos posteriores que queden fuera de rango no se bloquean: se marcan (`warning`) y la respuesta trae `newlyWarnedMatchIds`. |
| `GET /api/admin/matches` | Todos los partidos, también anulados. Filtros: `playerId`, `from`, `to`, `status`, `withWarnings`. |
| `POST /api/admin/ranking/adjustments` | Mueve a un jugador a otra posición. El motivo es obligatorio. |

Las fotos viven detrás de `IPhotoStorage` (hoy `LocalPhotoStorage`, en disco): para pasar a un servicio de archivos alcanza con otra implementación.

## Administración en la web (Fase 5)
Entrar a `http://localhost:5173/admin` (hay un enlace "Administración" al pie del sitio público). Hace falta haber creado el administrador con `seed-admin` (ver más arriba). La sesión se guarda en el navegador (`localStorage`) hasta que vence el token (8 horas) o se toca **Salir**; si la API rechaza el token, se cierra sola y avisa.

| Pantalla | Qué permite |
| --- | --- |
| **Cargar resultado** (`/admin/results/new`) | Elegir desafiante y desafiado (con su posición actual y el rango permitido), fecha, cómo terminó (jugado, W.O., abandono), score set por set y observaciones. La validación es en vivo: los sets inválidos se marcan al escribir, el tie-break y el Super Tie-Break aparecen solo cuando corresponden, y la **vista previa** (que consulta a la API sin guardar) muestra el ganador, el movimiento exacto y si algún partido posterior quedaría fuera de rango. Un desafío fuera de rango se guarda solo después de confirmarlo. |
| **Partidos** (`/admin/matches`) | Listado con filtros (jugador, estado, fechas, solo con advertencias; quedan en la URL), edición y anulación con confirmación. Los partidos que quedan fuera de rango tras un cambio se marcan, no se bloquean. |
| **Jugadores** (`/admin/players`) | Alta (al final o en una posición), edición de datos, foto (JPEG/PNG/WebP hasta 5 MB), baja lógica y reingreso. |
| **Ajustes** (`/admin/adjustments`) | Mover a un jugador a otra posición con motivo obligatorio. |

La fecha de un partido se guarda al mediodía en hora del club (UTC-3 fijo, sin horario de verano). Al editar un partido sin cambiar la fecha se conserva la hora original. Los mensajes de error de la API se traducen en `frontend/src/lib/errors.ts` a partir de sus códigos estables.

En desarrollo Vite reenvía `/api` y `/photos` a la API. Los tests de la interfaz (`npm test --prefix frontend`) usan una API simulada; además se verificó el recorrido completo contra la API real con un navegador (login, carga con vista previa, anulación, fuera de rango, edición, foto, baja, ajuste y sesión vencida).
