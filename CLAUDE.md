# Ranking de Tenis GEI

Web para el ranking interno de tenis (escalera por desafíos, singles, ~70 jugadores). Spec completa en `docs/SPEC.md`; reglamento original en `docs/reglas.txt`.

## Cómo trabajar
- Se trabaja **por fases** (0 a 6, la 7 solo si se pide). Al cerrar cada fase: resumen, cómo probarlo, decisiones y pendientes, y esperar confirmación del usuario.
- Commits pequeños y descriptivos dentro de cada fase.
- Ante ambigüedad en la spec, preguntar antes de decidir.

## Stack
- `backend/`: ASP.NET Core (.NET 10, C#), EF Core + Npgsql, migraciones code-first. Proyectos: `Api`, `Domain` (lógica pura, sin dependencias), `Infrastructure`, tests en `tests/`.
- `frontend/`: React + TypeScript + Vite, React Router, TanStack Query, Tailwind, Vitest.
- PostgreSQL: Docker en local (`docker-compose.yml`), Neon en producción.

## Convenciones
- Código, clases, tablas y endpoints en **inglés**. Interfaz de usuario en **español rioplatense (es-AR)**.
- Zona horaria del club: `America/Argentina/Buenos_Aires`. Fechas en UI: `dd/mm/aaaa`. En base: `timestamptz` UTC.
- Secretos (cadena de conexión, credenciales admin, secreto JWT) solo por variables de entorno; nunca en el código. Ver `.env.example`.
- El ranking **no es estado editable**: se deriva de eventos con `RankingEngine.Replay(events)` (dominio puro). Alta/edición/anulación de partido + recálculo van en una sola transacción.
- Los jugadores nunca se borran físicamente (baja lógica). Las fotos no van en la base, solo la ruta.
- Las migraciones se aplican con comando explícito, no al iniciar la app.

## Comandos
```
docker compose up -d                                  # PostgreSQL
dotnet run --project backend/src/GeiRanking.Api       # API (Swagger en /swagger)
npm run dev --prefix frontend                         # Frontend (http://localhost:5173)

dotnet ef database update --project backend/src/GeiRanking.Infrastructure --startup-project backend/src/GeiRanking.Api   # migraciones
dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking   # regenera ranking desde los eventos
dotnet run --project backend/src/GeiRanking.Api -- migrate           # aplica migraciones (comando explícito; también en la imagen Docker)
docker compose -f docker-compose.prod.yml up -d --build              # stack de producción local (necesita DB_PASSWORD y JWT_SECRET)
./ops/backup/backup.sh  |  .\ops\backup\backup.ps1        # backup de la base (guía completa: docs/DEPLOY.md)
dotnet test backend                                   # tests backend (Api.Tests usa el PostgreSQL de docker compose)
npm test --prefix frontend                            # tests frontend (Vitest)
```
