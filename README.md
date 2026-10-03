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
