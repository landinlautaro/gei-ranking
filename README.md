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

El frontend llama a `/api/...` y Vite reenvía esos pedidos al backend (`vite.config.ts`), así que en desarrollo no hace falta CORS. La home muestra el resultado de `GET /api/health`.

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

## Migraciones
Se aplican con un comando explícito; nunca al iniciar la app. El modelo de datos llega en la Fase 2, donde se documentan el comando de migración y la carga inicial de jugadores (`backend/db/seed/`), tanto en local como en Neon.
