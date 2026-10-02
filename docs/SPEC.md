# Ranking de Tenis GEI — Especificación para desarrollo

Sos el desarrollador de una aplicación web para administrar el ranking interno de tenis del club GEI. Este documento es la especificación completa. Trabajá **por fases**, en el orden indicado. Al terminar cada fase, detenete, resumí qué hiciste, explicá cómo probarlo y esperá mi confirmación antes de seguir. Si algo de la especificación es ambiguo o creés que hay una mejor alternativa, preguntá antes de decidir por tu cuenta.

---

## 1. Contexto

El club lleva hoy el ranking en un Excel y lo comunica por un grupo de WhatsApp. Queremos una web donde:

- Cualquier persona (sin login) pueda ver el ranking, el perfil de cada jugador y los partidos jugados.
- Un administrador (con login) pueda cargar resultados, agregar jugadores y editar sus datos.

El ranking es **único** (sin categorías) y solo de **singles**. Hay unos 70 jugadores.

## 2. Stack técnico

- **Frontend:** React + TypeScript con Vite. React Router para navegación, TanStack Query para datos del servidor, Tailwind CSS para estilos.
- **Backend:** ASP.NET Core Web API en .NET (última versión LTS), C#.
- **Base de datos:** PostgreSQL (relacional), accedida con Entity Framework Core (proveedor Npgsql) y migraciones code-first. En desarrollo corre en Docker; en producción se usará el plan gratuito de **Neon** (PostgreSQL serverless). Ver sección 2.1.
- **Imágenes:** ImageSharp para redimensionar fotos subidas.
- **Tests:** xUnit en backend (obligatorio para el motor de ranking), Vitest en frontend donde aporte valor.
- **Entorno local:** `docker-compose` con PostgreSQL. El backend y el frontend deben poder correrse con un solo comando cada uno.

### 2.1 Base de datos: PostgreSQL

Se eligió una base **relacional** porque los datos lo son por naturaleza: cada partido referencia a dos jugadores, el ranking se reconstruye recorriendo eventos en orden y las estadísticas son conteos y cruces entre partidos y jugadores. No usar bases NoSQL.

Requisitos:
- Integridad referencial con claves foráneas (un partido no puede apuntar a un jugador inexistente). Los jugadores nunca se borran físicamente, solo se marcan inactivos.
- Restricciones a nivel de base donde tenga sentido: desafiante distinto de desafiado, ganador igual a uno de los dos jugadores, posiciones únicas en el snapshot del ranking.
- Índices para las consultas frecuentes: partidos por jugador, partidos por fecha, eventos por orden de aplicación.
- Los sets del partido pueden guardarse en una tabla hija (`MatchSet`) o en una columna `jsonb`; elegí la opción y justificala brevemente.
- La carga de un resultado, su edición o anulación y el recálculo del ranking deben ejecutarse en **una sola transacción**: o se aplica todo o nada.
- Las fotos **no** se guardan en la base; solo la ruta o URL del archivo.
- Fechas almacenadas como `timestamptz` (UTC) y convertidas a la zona horaria del club al mostrarse.
- La cadena de conexión se toma de una variable de entorno, de modo que pasar de Docker local a Neon solo implique cambiar ese valor. Tener en cuenta que Neon requiere SSL y que su base "se duerme" cuando no hay uso, por lo que la primera consulta puede demorar unos segundos: configurar reintentos de conexión (`EnableRetryOnFailure`) y timeouts razonables.
- Las migraciones se aplican con un comando explícito documentado en el README, no automáticamente al iniciar la app en producción.

Estructura de repositorio sugerida (monorepo):

```
/backend   → solución .NET (Api, Domain, Infrastructure, Tests)
/frontend  → app React
/docs      → este documento y notas de decisiones
docker-compose.yml
README.md
```

Convenciones:

- Código, nombres de clases, tablas y endpoints en **inglés**. Toda la interfaz de usuario en **español rioplatense** (es-AR).
- Zona horaria del club: `America/Argentina/Buenos_Aires`. Fechas mostradas como `dd/mm/aaaa`.
- Configuración sensible (cadena de conexión, credenciales del admin, secreto JWT) por variables de entorno, nunca en el código.

## 3. Reglas del ranking (sistema de escalera por desafíos)

El ranking es una lista ordenada de posiciones (1, 2, 3…). **No hay puntos.**

**Desafíos**
- Un jugador solo puede desafiar a alguien que esté entre 1 y 5 puestos por encima suyo. Ejemplo: el #20 puede desafiar del #15 al #19.
- No se puede desafiar hacia abajo.
- El desafiado tiene 7 días para jugar el partido.

**Movimiento de posiciones**
- **Gana el desafiante:** intercambia su posición con el desafiado. Ej.: #20 le gana a #17 → el desafiante pasa a #17 y el desafiado a #20.
- **Gana el desafiado:** sube 1 puesto, intercambiando con el jugador que está justo encima suyo. Ej.: el #17 defiende → pasa a #16 y el #16 baja a #17. Si el desafiado es el #1, no hay movimiento.

**Formato del partido**
- Al mejor de 3 sets, games con ventaja.
- Sets válidos para el ganador del set: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5, 7-6. El tanteo del tie-break de un 7-6 es opcional.
- Si hay tercer set, es **Super Tie-Break a 10 puntos** con diferencia de 2 (10-8, 11-9, 12-10…).
- El ganador del partido se calcula automáticamente a partir del score.

**Reglas por defecto para casos no contemplados en el reglamento** (deben quedar fáciles de cambiar):
- **W.O.:** victoria del rival sin score; mueve el ranking igual que un partido jugado.
- **Abandono:** se carga el score parcial, el admin indica el ganador, y mueve el ranking como un partido normal.
- **Validación del rango de 5 puestos:** se evalúa con las posiciones vigentes al momento del partido (según la fecha del partido en la secuencia de eventos).
- **Desafíos vencidos (7 días):** no se aplica nada automático; el admin decide y, si corresponde, carga un W.O.
- **Jugador nuevo:** entra en la última posición, salvo que el admin elija una posición específica.
- **Baja de un jugador:** sale del ranking, todos los que estaban debajo suben un puesto y su historial se conserva.
- **Sin restricciones** de desafíos simultáneos, revancha ni penalización por inactividad.

## 4. Diseño del motor de ranking (crítico)

El ranking **no se guarda como estado editable**: se **deriva** de una secuencia ordenada de eventos. Esto es necesario porque editar o anular un partido viejo obliga a recalcular todo lo posterior.

Tipos de evento:
1. `InitialRanking` — orden de arranque (lo crea el script de carga inicial, sección 7).
2. `MatchPlayed` — partido válido (desafiante, desafiado, ganador).
3. `PlayerAdded` — alta de jugador al final o en una posición dada.
4. `PlayerRemoved` — baja de jugador.
5. `ManualAdjustment` — el admin mueve a un jugador a otra posición.

Requisitos del motor:
- Implementarlo en la capa de dominio como **lógica pura, sin dependencias de base de datos**, con una función del estilo `RankingEngine.Replay(events) → RankingState`.
- Orden de los eventos: por fecha del evento y, a igual fecha, por orden de creación.
- Partidos anulados se excluyen del replay.
- Si al editar o anular un partido algún partido posterior queda fuera del rango de 5 puestos, **no bloquear**: marcarlo con una advertencia visible para el admin.
- Para rendimiento, se puede guardar una tabla de snapshot del ranking vigente y un historial de posiciones por evento, pero siempre regenerables desde los eventos.
- **Tests unitarios exhaustivos**: victoria del desafiante, defensa exitosa, defensa del #1, desafío fuera de rango, W.O., altas y bajas en el medio, edición y anulación de un partido viejo con recálculo correcto, y validación de todos los scores válidos e inválidos.

## 5. Modelo de datos

**Player:** id, nombre completo, apodo (opcional), foto (opcional), mano hábil (diestro/zurdo, opcional), revés (una mano/dos manos, opcional), fecha de ingreso, activo/inactivo.

**Match:** id, fecha, desafiante, desafiado, sets (lista de pares de games, más tie-break opcional), tipo de finalización (normal / W.O. / abandono), ganador, observaciones, estado (válido / anulado), posiciones antes y después de ambos jugadores, texto de "movimiento aplicado", fecha de creación y de última modificación.

**RankingEvent** y **RankingHistory** según la sección 4.

**AdminUser:** usuario y hash de contraseña.

## 6. Estadísticas (mismo formato que el Excel de referencia)

Para cada jugador:
- **Pos.** — posición actual.
- **PJ / PG / PP** — partidos jugados, ganados y perdidos (todos los roles).
- **Desafíos ganados / perdidos** — solo partidos jugados como **desafiante**.
- **Defensas ganadas / perdidas** — derivadas: PG − Desafíos ganados y PP − Desafíos perdidos. Se muestran en el perfil, no en la tabla principal.
- **Pos. anterior** — posición antes de su último cambio de posición.
- **Movimiento** — diferencia entre posición anterior y actual (ej. ▲3, ▼1, —).
- En el perfil, además: mejor posición histórica, % de victorias y racha actual.

## 7. Excel actual (solo referencia) y carga inicial

El Excel que usa hoy el club **no se importa ni se usa para cargar datos**. Sirve únicamente como referencia del formato que los socios ya conocen, para replicarlo en la web:

- Columnas de la tabla de ranking: `Pos.`, `Jugador`, `PJ`, `PG`, `PP`, `Desafíos ganados`, `Desafíos perdidos`, `Pos. anterior`, `Movimiento`.
- Columnas del listado de resultados: `Fecha`, `Desafiante`, `Desafiado`, `Ganador`, `Resultado`, `Movimiento aplicado`, `Observaciones`. El `Resultado` se muestra como texto (ej. `6-4 3-6 10-7`).

### Carga inicial de jugadores (script de base de datos)

Los jugadores iniciales se cargan con un **script SQL de seed** versionado en el repositorio (por ejemplo `/backend/db/seed/001_initial_players.sql`), que debe:

- Insertar los 69 jugadores con su fecha de ingreso, activos y sin foto.
- Crear el evento `InitialRanking` con el orden exacto de la lista de abajo (la posición 1 es el primero).
- Ser **idempotente**: si se corre dos veces no duplica jugadores ni eventos.
- Ejecutarse en una transacción.
- Estar documentado en el README (cómo correrlo en local y en Neon).

Ranking inicial (nombres ya normalizados):

1. Fran Vazquez
2. Gastón Quintana
3. Julian Benmergui
4. Juan Vazquez
5. Pablo Castillo
6. Gaston Carpanelli
7. Pablo Carpanelli
8. Fede Soda
9. Lucas Landro
10. Emiliano Rodriguez
11. Nicolás Szlapo
12. Daniel Murdoch
13. Daniel Bernascone
14. Hernan del Pozo
15. Óscar González
16. Daniel Dallinge
17. Julio Hernandez
18. Matias Avalos
19. Rodrigo Pacheco
20. Alejandro Albarracin
21. Gustavo San Martín
22. Luciano Dou
23. Fernando Varela
24. Raul Báez
25. Eugenio Arenes
26. Daniel Tonietti
27. Emilio Fontana
28. Ariel Dubedout
29. Matias Casadei
30. Cristian Nitty
31. Fede Herrera
32. Sebastian Viseich
33. Guillermo Valerio
34. Martin Reyes
35. Agustin Reyes
36. Mariano Herman
37. Lautaro Landin
38. Nicolas Niveyro
39. Marcos Tineo
40. Martin Gomez
41. Pablo Tanous
42. Sebastian Custeau
43. Valentin Medina
44. Guillermo Crespo
45. Pablo Castells
46. Juan Benegas
47. Diego Di Nucci
48. Carlitos Perez
49. Alfredo Kina
50. Jorge Garrido
51. Tacio Battilana
52. Martin Benson
53. Martin Pintos
54. Simon Moran
55. Francisco Cata
56. Luis Infante
57. Benicio Dorsa
58. Fabricio Landaluce
59. Bruno Elia
60. Pablo Esteban
61. Gaston Beraldo
62. Alan Lubris
63. Marcelo Perez
64. Marcelo Naccarato
65. Bruno Macri
66. Flavio Arnoldo
67. Juan Manuel Arizaga
68. Diego Caggero
69. Nestor Sassano

## 8. Funcionalidades

### Parte pública (sin login)
- **Ranking:** tabla con las columnas de la sección 6, foto o avatar de cada jugador, indicador de movimiento en color (verde sube, rojo baja) y buscador por nombre. Debe verse bien en el celular, que es donde la va a mirar la mayoría.
- **Perfil del jugador:** foto o avatar, datos personales, estadísticas, a quiénes puede desafiar hoy (sus 5 de arriba), historial de partidos indicando rol (desafiante/desafiado), score y cambio de posición que produjo, y gráfico de evolución de su posición en el tiempo.
- **Partidos:** listado de los últimos resultados, con filtro por jugador y por rango de fechas.

### Avatar
Si el jugador no tiene foto, mostrar un avatar generado **de forma determinística** a partir de su id (siempre el mismo para el mismo jugador). Generarlo localmente en el frontend (por ejemplo con la librería DiceBear), sin depender de un servicio externo.

### Parte de administración (con login)
- **Login / logout** con JWT. Un único rol de administrador; el primer admin se crea con un seed a partir de variables de entorno.
- **Jugadores:** alta (al final o en una posición elegida), edición de datos, subida y eliminación de foto (redimensionada a un tamaño razonable, ej. 400 px, guardada detrás de una interfaz de almacenamiento para poder cambiar de disco local a un servicio de archivos más adelante), baja lógica.
- **Carga de resultado:** elegir desafiante y desafiado (validar rango de 5 puestos y mostrar las posiciones actuales), fecha, tipo de finalización, score set por set con validación en vivo, observaciones. Antes de confirmar, mostrar una vista previa del movimiento que se va a aplicar.
- **Gestión de partidos:** listar, editar y anular, con recálculo automático y advertencias si algún partido posterior queda fuera de rango.
- **Ajuste manual de posición** de un jugador, con motivo obligatorio.

## 9. Fases de desarrollo

### Fase 0 — Estructura del proyecto
Monorepo, solución .NET con sus proyectos, app React con Vite, `docker-compose` con PostgreSQL, conexión con EF Core funcionando, CORS configurado, README con instrucciones para correr todo localmente.
**Listo cuando:** levanto la base, el backend y el frontend, y el frontend muestra la respuesta de un endpoint de prueba.

### Fase 1 — Dominio y motor de ranking
Entidades de dominio, validación de scores y motor de ranking basado en eventos (sección 4), con todos los tests unitarios.
**Listo cuando:** todos los tests pasan y cubren los casos listados en la sección 4.

### Fase 2 — Persistencia y API pública
Modelo de EF Core, migraciones, servicio que persiste eventos y regenera el ranking, endpoints públicos: ranking, perfil de jugador (con estadísticas e historial de posiciones) y listado de partidos con filtros. Script SQL de carga inicial con los 69 jugadores reales (sección 7) y, por separado, un seed opcional de partidos de prueba solo para desarrollo, que nunca se ejecute en producción.
**Listo cuando:** puedo consultar el ranking y los perfiles vía Swagger con datos de prueba.

### Fase 3 — Frontend público
Páginas de ranking, perfil y partidos, avatar determinístico, diseño responsive pensado primero para celular, estados de carga y error.
**Listo cuando:** puedo navegar toda la parte pública con los datos de prueba, desde el celular y desde la compu.

### Fase 4 — Autenticación y API de administración
Login con JWT, seed del admin, endpoints protegidos para jugadores (incluida la foto), partidos (crear, editar, anular, vista previa de movimiento) y ajuste manual.
**Listo cuando:** puedo hacer todas las operaciones de admin vía Swagger, y los endpoints protegidos rechazan pedidos sin token.

### Fase 5 — Frontend de administración
Pantallas de login, gestión de jugadores, carga de resultado con validación en vivo y vista previa del movimiento, gestión de partidos con advertencias y ajuste manual.
**Listo cuando:** con los jugadores reales del script de carga inicial, puedo cargar varios partidos y ver el ranking público actualizado correctamente.

### Fase 6 — Pulido y despliegue
Revisión de accesibilidad y responsive, manejo de errores, logs, Dockerfiles de producción para backend y frontend, y una guía de despliegue que incluya: creación de la base en Neon y aplicación de migraciones, una propuesta de hosting gratuito o de bajo costo para el backend .NET, el frontend y el almacenamiento de fotos, y una forma simple de hacer backups periódicos de la base (por ejemplo, un `pg_dump` programado).
**Listo cuando:** existe una guía paso a paso que me permite publicar la app.

### Fase 7 (opcional, posterior) — Gestión de desafíos
Registrar desafíos pendientes (desafiante, desafiado, fecha), mostrarlos en una sección pública con cuenta regresiva de los 7 días, marcar vencidos y convertir un desafío en partido al cargar el resultado. Solo arrancar esta fase si te lo pido explícitamente.

## 10. Cómo trabajar

- Antes de empezar la Fase 0, leé todo este documento y proponé en pocas líneas la estructura de carpetas y cualquier ajuste que recomiendes.
- Guardá este documento en `/docs/SPEC.md` y creá un `CLAUDE.md` en la raíz con las convenciones del proyecto y cómo correr los tests.
- Hacé commits pequeños y descriptivos dentro de cada fase.
- Al cerrar cada fase: resumen de lo hecho, cómo probarlo, decisiones tomadas y pendientes. Después, esperá mi confirmación.
