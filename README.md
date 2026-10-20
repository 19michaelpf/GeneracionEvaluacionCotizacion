# Cotizaciones — Soluciones Industriales del Norte S.A.C.

Aplicativo web para generar y evaluar cotizaciones comerciales.
Stack: **Next.js 15 (App Router) + TypeScript + Tailwind**, con **Supabase** (Postgres, Auth y Storage) y **Claude** (Anthropic) para redactar los textos.

## Estado por etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Login, clientes, catálogo/tarifas, formulario de cotización y cálculo automático | ✅ |
| 2 | Aprobación de Finanzas para descuentos > 15 % | ✅ |
| 3 | PDF en Storage privado + validación del asesor | ✅ |
| 4 | Redacción asistida por IA (Claude), automática al generar el PDF | ✅ |
| 5 | Registro de envío, respuesta del cliente, seguimiento, vencimiento y tablero | ✅ |

Fuera de la v1: envío real por correo/WhatsApp y firma digital.

## Puesta en marcha

1. Cree un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecute en orden todos los archivos de `supabase/migrations/` (`0001_…` a `0007_…`) y luego `supabase/seed.sql` (datos de ejemplo).
3. Opcional: ejecute `supabase/tests/rls_checks.sql`. Debe terminar con `OK: todas las verificaciones pasaron` y no deja datos.
4. En **Authentication > Users** cree los usuarios. Todos nacen con rol `asesor`; para asignar otros roles:
   ```sql
   update public.profiles set rol = 'finanzas' where email = 'finanzas@empresa.pe';
   update public.profiles set rol = 'admin'    where email = 'admin@empresa.pe';
   ```
5. Copie `.env.example` como `.env.local` y complete:
   - URL y anon key de Supabase (**Project Settings > API**).
   - `SUPABASE_SERVICE_ROLE_KEY`: solo se usa en el servidor para subir los PDF. Nunca debe llevar el prefijo `NEXT_PUBLIC_`.
   - `ANTHROPIC_API_KEY` (opcional): sin ella la app funciona igual y usa la plantilla estándar de textos.
6. (Opcional) Complete los datos de la empresa para el encabezado del PDF:
   ```sql
   update public.parametros set empresa_ruc = '20XXXXXXXXX', empresa_direccion = '...', empresa_telefono = '...', empresa_email = '...';
   ```
7. (Opcional) Si habilita la extensión `pg_cron`, programe el vencimiento diario:
   ```sql
   select cron.schedule('vencer-cotizaciones', '5 5 * * *', 'select public.actualizar_vencimientos()');
   ```
   Sin `pg_cron`, el vencimiento se aplica igual cada vez que alguien abre el listado, el detalle o el tablero.
8. `npm install` y `npm run dev` → http://localhost:3000

## Roles

| Rol | Puede |
|---|---|
| asesor | Crear y gestionar **sus** cotizaciones (edición solo en borrador), generar PDF, validar, registrar envío, respuesta y seguimiento, registrar clientes |
| finanzas | Ver todas las cotizaciones, **aprobar o rechazar descuentos** (bandeja `/aprobaciones`), gestionar productos y tarifas |
| admin | Lo mismo que un asesor sobre cualquier cotización, además de gestionar catálogo, parámetros (IGV, umbral) y roles. No aprueba descuentos |

## Ciclo de vida

```
borrador ──(desc. > 15 %)──▶ pendiente_aprobacion ──Finanzas aprueba──▶ aprobada
   │                               └──Finanzas rechaza──▶ borrador          │
   └──(desc. ≤ 15 %)────────────────────────────────────────────────────────┤
                                                                            ▼
                                       generada ──validar──▶ validada ──envío──▶ enviada ──▶ aceptada | rechazada_cliente
                     (generada, validada o enviada) ──fin de la validez──▶ vencida
   reabrir (asesor): pendiente, aprobada, generada, validada, enviada o vencida ──▶ borrador
```

### Aprobación de descuentos
- Solo se puede solicitar si el descuento efectivo supera el umbral.
- Mientras está pendiente o aprobada, los ítems no se pueden modificar: lo aprobado es exactamente lo que se cotiza.
- Reabrir anula la aprobación vigente. Cada paso queda registrado con usuario, fecha y comentario.

### PDF y validación
- El PDF se genera en el servidor con `@react-pdf/renderer`. **Todas las cifras salen de la BD.**
- Se guarda en el bucket **privado** `cotizaciones-pdf` como `{cotizacion_id}/v{n}.pdf`. Cada regeneración crea una versión nueva y las anteriores se conservan.
- Los usuarios **no pueden escribir** en el bucket. Solo el servidor sube archivos, y `registrar_pdf` comprueba rol, estado, versión y que el archivo exista.
- La descarga pasa por `/cotizaciones/{id}/pdf`, que verifica permisos con la sesión del usuario y redirige a una URL firmada de 60 segundos.
- La fecha de emisión es la de generación del PDF; la validez cuenta desde ese día.
- El asesor revisa el PDF y lo **valida**. Si se cambian los textos después de generarlo, el PDF queda desactualizado y debe regenerarse antes de validar.

### Redacción con IA (Claude)
- **Automática:** al generar el PDF por primera vez, si no hay textos guardados, Claude redacta la presentación, de 0 a 3 condiciones adicionales y el cierre. El asesor también puede pedir una nueva redacción o editar los textos a mano.
- **La IA no recibe precios, descuentos ni totales,** y se le indica no escribir cifras, plazos ni garantías. Las condiciones obligatorias (moneda/IGV y validez) las agrega siempre el sistema.
- Si el texto redactado contiene montos, porcentajes, la palabra «descuento» o cifras, se muestra una **advertencia** para que el asesor lo revise antes de validar.
- Si la IA falla o no está configurada, se usa la plantilla estándar y el PDF se genera igual.
- Se usa el modelo `claude-opus-5-5` (configurable con `ANTHROPIC_MODEL`), con salida estructurada validada con zod y fallback del lado del servidor ante rechazos del modelo.

### Envío y seguimiento
- El asesor envía el PDF validado por su medio habitual y **registra** el envío: medio, destinatario y nota.
- Registra la respuesta del cliente: aceptada, o rechazada con motivo obligatorio. También puede añadir notas de seguimiento.
- Las ofertas generadas, validadas o enviadas cuya validez terminó pasan a **vencida** automáticamente (`actualizar_vencimientos`, idempotente).
- **Tablero** (`/tablero`): cantidad y monto por estado, monto en negociación, monto aceptado, tasa de cierre y enviadas por vencer (3 días o menos).

## Reglas de negocio y seguridad

- **Los precios los fija la base de datos** a partir de la tarifa vigente. El navegador nunca envía precios.
- **Los totales se calculan en la BD** (`private.recalcular_cotizacion`). `src/lib/calc/cotizacion.ts` replica el cálculo solo para la vista previa, con aritmética entera y el mismo redondeo.
- Fórmula: importe de línea = cantidad × precio − descuento de línea; el descuento global se aplica sobre la suma neta; IGV 18 % sobre la base imponible.
- **Aprobación:** se requiere si el descuento combinado de cualquier línea, `100 − (100 − d)(100 − g)/100`, supera el umbral (15 %). Exactamente 15 % no la requiere.
- Las cotizaciones solo cambian mediante funciones RPC (`guardar_cotizacion`, `solicitar_aprobacion`, `resolver_aprobacion`, `registrar_pdf`, `validar_cotizacion`, `guardar_textos`, `registrar_envio`, `registrar_respuesta`, `reabrir_cotizacion`…), que validan rol, propiedad, estado y datos. El usuario `authenticated` no tiene permisos de escritura directa sobre esas tablas.
- RLS habilitada en todas las tablas. Cada acción queda registrada en `cotizacion_eventos`.
- Parámetros comerciales (IGV, umbral, validez por defecto, datos de la empresa) en la tabla `parametros`.
- Claves privadas (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) solo en el servidor; los módulos que las usan importan `server-only`.

## Scripts

```bash
npm run dev        # desarrollo
npm test           # pruebas unitarias (cálculo, validaciones, estados, PDF, IA simulada, tablero)
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run build      # build de producción
```

## Estructura

```
supabase/migrations/   esquema, lógica, RLS, aprobaciones, PDF, textos IA, envío
supabase/seed.sql      datos de ejemplo
supabase/tests/        pruebas de permisos, reglas y flujo completo en SQL
src/middleware.ts      sesión y protección de rutas
src/lib/               supabase, auth, cálculo, estados, validación (zod), PDF, IA, tablero
src/app/(app)/         tablero, cotizaciones, aprobaciones, clientes, productos
src/app/login/         inicio de sesión
```
