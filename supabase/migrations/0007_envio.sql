-- =============================================================
-- 0007 · Envío y seguimiento
--   validada ──registrar envío──▶ enviada ──respuesta──▶ aceptada | rechazada_cliente
--   generada | validada | enviada ──(vence la oferta)──▶ vencida
--   enviada | vencida ──reabrir──▶ borrador (para emitir una nueva versión)
-- El envío real (correo/WhatsApp) queda fuera de la v1: aquí se registra.
-- =============================================================

-- ---------- Registrar envío ----------
create or replace function public.registrar_envio(
  p_cotizacion_id uuid,
  p_medio         text,
  p_destinatario  text,
  p_nota          text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if p_medio is null or p_medio not in ('email', 'whatsapp', 'presencial', 'otro') then
    raise exception 'Medio de envío inválido';
  end if;
  if p_destinatario is null or length(trim(p_destinatario)) not between 3 and 200 then
    raise exception 'Indique el destinatario del envío';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede registrar el envío' using errcode = '42501';
  end if;
  if v_cot.estado <> 'validada' then
    raise exception 'Solo se envían cotizaciones validadas (estado actual: %)', v_cot.estado;
  end if;
  if v_cot.fecha_emision + v_cot.validez_dias < private.hoy_lima() then
    raise exception 'La oferta ya venció: reabra la cotización y genere una nueva versión';
  end if;

  update public.cotizaciones set
    estado             = 'enviada',
    envio_medio        = p_medio,
    envio_destinatario = trim(p_destinatario),
    enviada_en         = now()
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'enviada', null, null,
    jsonb_build_object('medio', p_medio, 'destinatario', trim(p_destinatario),
                       'version', v_cot.pdf_version, 'comentario', nullif(trim(p_nota), '')));
end $$;

-- ---------- Respuesta del cliente ----------
create or replace function public.registrar_respuesta(p_cotizacion_id uuid, p_aceptada boolean, p_comentario text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
  v_com text := nullif(trim(p_comentario), '');
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if p_aceptada is null then
    raise exception 'Indique si el cliente aceptó o rechazó';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede registrar la respuesta' using errcode = '42501';
  end if;
  if v_cot.estado <> 'enviada' then
    raise exception 'Solo se registra la respuesta de cotizaciones enviadas (estado actual: %)', v_cot.estado;
  end if;
  if not p_aceptada and v_com is null then
    raise exception 'Indique el motivo del rechazo del cliente';
  end if;

  update public.cotizaciones
  set estado = case when p_aceptada then 'aceptada' else 'rechazada_cliente' end::public.estado_cotizacion
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id,
    case when p_aceptada then 'respuesta_aceptada' else 'respuesta_rechazada' end,
    null, null, jsonb_build_object('comentario', v_com));
end $$;

-- ---------- Notas de seguimiento ----------
create or replace function public.registrar_seguimiento(p_cotizacion_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if p_nota is null or length(trim(p_nota)) not between 1 and 1000 then
    raise exception 'Escriba la nota de seguimiento (máximo 1000 caracteres)';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización registra su seguimiento' using errcode = '42501';
  end if;
  if v_cot.estado not in ('enviada', 'aceptada', 'rechazada_cliente', 'vencida') then
    raise exception 'El seguimiento se registra después del envío';
  end if;

  perform private.registrar_evento(v_cot.id, 'seguimiento', null, null, jsonb_build_object('comentario', trim(p_nota)));
end $$;

-- ---------- Vencimiento de ofertas ----------
-- Idempotente. Se ejecuta al consultar las cotizaciones (y puede programarse con pg_cron).
create or replace function public.actualizar_vencimientos()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if (select auth.uid()) is not null and private.rol_actual() is null then
    raise exception 'Usuario inactivo' using errcode = '42501';
  end if;

  with vencidas as (
    update public.cotizaciones
    set estado = 'vencida'
    where estado in ('generada', 'validada', 'enviada')
      and fecha_emision + validez_dias < private.hoy_lima()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from vencidas;

  -- El trigger de auditoría registra el cambio de estado; se agrega el motivo
  insert into public.cotizacion_eventos (cotizacion_id, usuario_id, accion, detalle)
  select id, null, 'vencimiento_automatico', jsonb_build_object('automatico', true)
  from unnest(v_ids) as id;

  return coalesce(array_length(v_ids, 1), 0);
end $$;

-- ---------- Reabrir: también desde enviada o vencida ----------
create or replace function public.reabrir_cotizacion(p_cotizacion_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
  v_anuladas int;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede reabrirla' using errcode = '42501';
  end if;
  if v_cot.estado not in ('pendiente_aprobacion', 'aprobada', 'generada', 'validada', 'enviada', 'vencida') then
    raise exception 'No se puede reabrir una cotización en estado %', v_cot.estado;
  end if;

  update public.aprobaciones set estado = 'anulada', resuelto_en = coalesce(resuelto_en, now())
  where cotizacion_id = v_cot.id and estado in ('pendiente', 'aprobada');
  get diagnostics v_anuladas = row_count;

  update public.cotizaciones set
    estado = 'borrador',
    validada_por = null, validada_en = null,
    envio_medio = null, envio_destinatario = null, enviada_en = null
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'reabierta', null, null,
    jsonb_build_object('motivo', nullif(trim(p_motivo), ''), 'aprobaciones_anuladas', v_anuladas,
                       'desde', v_cot.estado));
end $$;

revoke execute on function public.registrar_envio(uuid, text, text, text)     from public, anon;
revoke execute on function public.registrar_respuesta(uuid, boolean, text)    from public, anon;
revoke execute on function public.registrar_seguimiento(uuid, text)           from public, anon;
revoke execute on function public.actualizar_vencimientos()                   from public, anon;
grant  execute on function public.registrar_envio(uuid, text, text, text)     to authenticated;
grant  execute on function public.registrar_respuesta(uuid, boolean, text)    to authenticated;
grant  execute on function public.registrar_seguimiento(uuid, text)           to authenticated;
grant  execute on function public.actualizar_vencimientos()                   to authenticated;

-- Programación diaria opcional (si la extensión pg_cron está habilitada en el proyecto):
--   select cron.schedule('vencer-cotizaciones', '5 5 * * *', 'select public.actualizar_vencimientos()');
