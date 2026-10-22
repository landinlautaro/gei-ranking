# Fase 7b — Los jugadores desafían desde la web

Estado: **definida, sin implementar**. Se construye sobre la Fase 7a (el admin registra desafíos y la web los muestra), que ya está hecha y usa la misma tabla `challenges` y las mismas reglas.

## 1. Objetivo
Que cada jugador pueda, desde la web y sin pasar por el coordinador:
- **crear su desafío** (siempre como desafiante), y
- **marcar "coordinado"** con el día y la hora acordados (cualquiera de los dos jugadores del desafío).

Todo lo demás sigue siendo del admin: cancelar, cambiar el plazo, cargar resultados, anular partidos.

## 2. Decisiones tomadas
| Tema | Decisión |
| --- | --- |
| Identificación | **Código personal** por jugador (no link, no usuario/contraseña). |
| Qué puede hacer el jugador | Crear su desafío y marcar "coordinado". **No** puede cancelar ni cargar resultados. |
| Alcance | Etapa aparte de la 7a, sobre esa base. |
| Reglas para el jugador | Las advertencias que en el admin se confirman pasan a **bloqueos**. El admin sigue pudiendo forzarlas desde su panel. |
| Aceptación | No hay "aceptar": según el reglamento, el desafío queda aceptado al comunicarlo. |
| Aviso al desafiado | La web no manda mensajes. Al crear el desafío se ofrece **compartir en WhatsApp** (link `wa.me`) y **copiar** el texto. |

## 3. El código personal

### Formato
- 6 caracteres de un alfabeto sin ambiguos: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin `0`, `O`, `1`, `I`, `L`). Se muestra como `K7M-4PX`. Hay unos 887 millones de combinaciones.
- Se escribe sin distinguir mayúsculas, y el guion y los espacios son opcionales. Se normaliza antes de verificar (`k7m 4px` → `K7M4PX`).
- Se genera con `RandomNumberGenerator`.
- Es **personal**: el login pide **jugador + código**. Un código suelto no identifica a nadie, así que no se puede probar un código contra los 70 jugadores a la vez.

### Almacenamiento
Tabla nueva `player_access_codes` (1 a 1 con `players`):

| Columna | Para qué |
| --- | --- |
| `player_id` | Clave, FK a `players`. |
| `code_hash` | Hash del código con `PasswordHasher` (PBKDF2), el mismo que usa `AdminUser`. **El código en claro nunca se guarda.** |
| `issued_at` | Cuándo se generó. |
| `last_used_at` | Último ingreso correcto. |
| `failed_attempts`, `locked_until` | Bloqueo por intentos fallidos. |
| `token_version` | Revocación de sesiones. |

**Regenerar** un código pone un hash nuevo y hace `token_version++`: todas las sesiones anteriores de ese jugador dejan de valer.

### Cómo lo reparte el admin
- **Jugadores → editar → "Generar código"**: muestra el código **una sola vez** y un botón "Copiar mensaje":
  > Hola Fulano 👋 Tu código para el Ranking GEI es *K7M-4PX*. Entrá a `<sitio>/ingresar`, elegite y escribilo. No lo compartas.

  Se lo manda por WhatsApp privado. Si lo pierde, se genera otro.
- **Pantalla "Códigos"** para el lanzamiento inicial, con los ~69 jugadores: estado (sin código / generado y sin usar / en uso con su último ingreso) y, por fila, "Generar" y "Copiar mensaje".
- Una vez generado, el código **no se puede volver a ver**. Solo se regenera.

## 4. Cómo entra el jugador
1. Va a `/ingresar` (desde el menú o desde un botón "Desafiar" si todavía no entró).
2. Se busca en la lista. Si ya tenía "Soy yo" elegido, aparece preseleccionado.
3. Escribe el código.
4. `POST /api/player-auth/login { playerId, code }` devuelve un **JWT de rol `Player`** con claims `sub=playerId`, `ver=token_version` y `name`, válido **180 días**.
5. Se guarda en `localStorage` en un store propio, separado del token de admin (`authStore.ts`), y se fija "Soy yo" en ese jugador.

Mientras haya sesión, "Soy yo" no se puede cambiar a otro jugador: hay que salir. Se agrega **"Salir de este dispositivo"** en la tarjeta de "Soy yo" (`MeCard`).

## 5. Seguridad
- **Rate limit por IP:** se reutiliza `LoginRateLimit` de `AuthSetup.cs`.
- **Bloqueo por jugador:** 5 errores seguidos → ese jugador queda bloqueado 15 minutos. Un login correcto resetea el contador. Un troll podría bloquear a alguien adrede, pero solo por 15 minutos.
- **Errores iguales y en el mismo tiempo:** "código incorrecto", "jugador sin código" y "jugador inactivo" responden lo mismo y tardan lo mismo (patrón `DummyHash` de `AuthEndpoints`), para que no se pueda averiguar quién tiene código.
- **Revocación inmediata:** en `JwtBearerEvents.OnTokenValidated`, para tokens `Player`, se verifica que `ver` coincida con `token_version` y que el jugador siga activo. Consulta mínima, solo en endpoints de jugador; se puede cachear unos segundos.
- **Separación de roles:** `AdminPolicy` ya exige `RequireRole(Admin)`, así que un token de jugador **no** entra a `/api/admin/*` (se agrega un test que lo verifique). Nueva `PlayerPolicy` con `RequireRole(Player)`.
- **Auditoría:**
  - `challenges.created_by_player_id` (nulo si lo creó el admin) y `challenges.scheduled_by_player_id`.
  - Logs en `GeiRanking.Audit` para login, fallos, bloqueos y regeneración.
- **Carreras:** dos desafíos simultáneos al mismo jugador podrían saltear "1 por semana". La creación corre en una transacción con `pg_advisory_xact_lock`, así se crean de a uno.

## 6. API para el jugador
Todo bajo `PlayerPolicy`:

| Endpoint | Qué hace |
| --- | --- |
| `POST /api/player-auth/login` | Jugador + código → JWT de rol `Player`. |
| `GET /api/me` | Su jugador, su posición y sus desafíos abiertos. |
| `POST /api/me/challenges { challengedId }` | Crea un desafío. Siempre es el desafiante y la fecha es "ahora". |
| `PUT /api/me/challenges/{id}/schedule { scheduledAt \| null }` | Cualquiera de los dos carga o borra el día y la hora acordados; el estado pasa a `Scheduled` (o vuelve a `Pending`). |

Endpoints de admin nuevos: generar/regenerar código (`POST /api/admin/players/{id}/access-code`) y listar el estado de los códigos.

### Bloqueos al crear (422, un código por regla)
| Código | Cuándo |
| --- | --- |
| `OutOfRange` | El desafiado no está entre 1 y 5 puestos por encima. |
| `OutsideChallengeWindow` | Es jueves a domingo (se desafía de lunes a miércoles). |
| `AlreadyChallengedThisWeek` | Alguno de los dos ya tiene un desafío no cancelado esa semana. |
| `PlayerNotRanked` | El desafiado está inactivo o fuera del ranking. |

### Reglas al coordinar
- Solo si el jugador es parte del desafío (si no, 403).
- Solo en desafíos abiertos.
- La fecha no puede ser posterior al plazo; si hace falta más tiempo, el plazo lo extiende el admin.

## 7. Interfaz del jugador
- **Botón "Desafiar"** en el ranking y en el perfil de un rival desafiable (usa `challengeRelation`), visible solo si es su ventana y no tiene desafío esa semana. Si no puede, se ve el motivo en gris ("Ya tenés un desafío esta semana").
- **Confirmación:** "Vas a desafiar a #17 Mengano. Vence el dom 26/10. El desafío queda aceptado al comunicarlo en el grupo."
- **Después de crear:** "Compartir en WhatsApp" (`https://wa.me/?text=…` con `challengeMessage()`) y "Copiar".
- **Su desafío abierto** aparece en su perfil y en la página Desafíos, con el botón **"Coordinar fecha"**.
- Se mantiene el control visual de la 7a: quien ya tiene un desafío abierto se ve en gris en las listas de rivales.

## 8. Tests a escribir
**Api.Tests**
- Login correcto e incorrecto.
- Bloqueo a los 5 fallos y reset al acertar.
- Mismo error (y tiempo) para jugador sin código o inactivo.
- Regenerar invalida el token viejo (401); desactivar al jugador también.
- Token de jugador rechazado en `/api/admin/*` (403).
- Cada bloqueo de regla al crear.
- "1 por semana" con dos requests concurrentes.
- Coordinar solo si sos parte del desafío (403 si no).

**Frontend**
- Normalización del código.
- Flujo de `/ingresar` con API simulada.
- "Desafiar" visible u oculto según la regla.
- Compartir/copiar tras crear.

**Recorrido manual:** generar un código en el admin, entrar desde otro navegador, desafiar, compartir, coordinar, regenerar el código y comprobar que la sesión vieja se cae.

## 9. Pendientes por confirmar antes de implementar
1. **Duración de la sesión:** 180 días propuestos. ¿Alcanza o preferís más/menos?
2. **Bloqueo por intentos:** 5 fallos / 15 minutos propuestos.
3. **Quién ve el código generado:** solo el admin, una vez. ¿Hace falta que el jugador pueda pedir uno nuevo solo (por ejemplo, vía el coordinador por WhatsApp, como hoy)?
4. **Cantidad de desafíos por semana:** hoy se bloquea si alguno de los dos ya tiene uno. ¿Se mantiene así para el jugador?
5. **Jugador desactivado:** se invalida su sesión al instante (propuesto). Si el admin lo reactiva, ¿mantiene su código o se regenera?
6. **Notificaciones:** no hay. El aviso al desafiado es por WhatsApp, manual. ¿Se quiere algo más en el futuro?

## 10. Plan de commits sugerido
1. Dominio y persistencia: `player_access_codes`, columnas de auditoría en `challenges`, migración.
2. Generación y verificación del código, con tests.
3. Login de jugador, JWT de rol `Player`, `PlayerPolicy`, bloqueo y revocación.
4. Endpoints `/api/me` (crear desafío con bloqueos, coordinar).
5. Admin: generar código y pantalla "Códigos".
6. Frontend: `/ingresar`, store de sesión de jugador y "Salir de este dispositivo".
7. Frontend: botón "Desafiar", confirmación, compartir y "Coordinar fecha".
8. Docs (README y `SPEC.md`) y cierre de fase.
