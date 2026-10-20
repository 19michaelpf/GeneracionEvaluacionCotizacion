-- =============================================================
-- 0004 · Aprobación de descuentos por Finanzas
--   borrador ──solicitar──▶ pendiente_aprobacion ──aprobar──▶ aprobada
--                                   │                          │
--                                   └──rechazar──▶ borrador ◀──reabrir (asesor)
-- Mientras no esté en borrador, los ítems no se pueden modificar
-- (guardar_cotizacion lo impide), por lo que lo aprobado es exactamente
-- lo que se cotiza. Reabrir anula la aprobación vigente.
-- =============================================================

-- El comentario del asesor (comentario) y el de Finanzas se guardan por separado
alter table public.aprobaciones add column comentario_resolucion text;

-- El asesor debe ver quién resolvió su solicitud: los perfiles son visibles para todo el personal activo
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.rol_actual()) is not null);

-- ---------- Asesor: solicitar aprobación ----------
create or replace function public.solicitar_aprobacion(p_cotizacion_id uuid, p_comentario text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
  v_com text := nullif(trim(p_comentario), '');
  v_id  uuid;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede solicitar la aprobación' using errcode = '42501';
  end if;
  if v_cot.estado <> 'borrador' then
    raise exception 'Solo se puede solicitar aprobación desde borrador (estado actual: %)', v_cot.estado;
  end if;
  if not v_cot.requiere_aprobacion then
    raise exception 'El descuento no supera el umbral: la cotización no requiere aprobación';
  end if;

  insert into public.aprobaciones (cotizacion_id, descuento_pct, total, solicitado_por, comentario)
  values (v_cot.id, v_cot.descuento_pct_max, v_cot.total, v_uid, v_com)
  returning id into v_id;

  update public.cotizaciones set estado = 'pendiente_aprobacion' where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'aprobacion_solicitada', null, null,
    jsonb_build_object('aprobacion_id', v_id, 'descuento_pct', v_cot.descuento_pct_max,
                       'total', v_cot.total, 'comentario', v_com));
  return v_id;
end $$;

-- ---------- Finanzas: aprobar o rechazar ----------
create or replace function public.resolver_aprobacion(p_aprobacion_id uuid, p_aprobar boolean, p_comentario text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_apr public.aprobaciones%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_com text := nullif(trim(p_comentario), '');
begin
  if v_uid is null or private.rol_actual() is distinct from 'finanzas' then
    raise exception 'Solo Finanzas puede aprobar o rechazar descuentos' using errcode = '42501';
  end if;
  if p_aprobar is null then
    raise exception 'Indique si aprueba o rechaza';
  end if;

  select * into v_apr from public.aprobaciones where id = p_aprobacion_id for update;
  if not found then
    raise exception 'La solicitud de aprobación no existe';
  end if;
  if v_apr.estado <> 'pendiente' then
    raise exception 'La solicitud ya fue resuelta (estado: %)', v_apr.estado;
  end if;

  select * into v_cot from public.cotizaciones where id = v_apr.cotizacion_id for update;
  if v_cot.estado <> 'pendiente_aprobacion' then
    raise exception 'La cotización no está pendiente de aprobación (estado actual: %)', v_cot.estado;
  end if;
  if not p_aprobar and v_com is null then
    raise exception 'Indique el motivo del rechazo';
  end if;

  update public.aprobaciones set
    estado          = case when p_aprobar then 'aprobada' else 'rechazada' end::public.estado_aprobacion,
    resuelto_por    = v_uid,
    resuelto_en     = now(),
    comentario_resolucion = v_com
  where id = v_apr.id;

  update public.cotizaciones
  set estado = case when p_aprobar then 'aprobada' else 'borrador' end::public.estado_cotizacion
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id,
    case when p_aprobar then 'descuento_aprobado' else 'descuento_rechazado' end,
    null, null,
    jsonb_build_object('aprobacion_id', v_apr.id, 'descuento_pct', v_apr.descuento_pct, 'comentario', v_com));
end $$;

-- ---------- Asesor: reabrir para editar ----------
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
  if v_cot.estado not in ('pendiente_aprobacion', 'aprobada') then
    raise exception 'No se puede reabrir una cotización en estado %', v_cot.estado;
  end if;

  update public.aprobaciones set estado = 'anulada', resuelto_en = coalesce(resuelto_en, now())
  where cotizacion_id = v_cot.id and estado in ('pendiente', 'aprobada');
  get diagnostics v_anuladas = row_count;

  update public.cotizaciones set estado = 'borrador' where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'reabierta', null, null,
    jsonb_build_object('motivo', nullif(trim(p_motivo), ''), 'aprobaciones_anuladas', v_anuladas));
end $$;

revoke execute on function public.solicitar_aprobacion(uuid, text)         from public, anon;
revoke execute on function public.resolver_aprobacion(uuid, boolean, text) from public, anon;
revoke execute on function public.reabrir_cotizacion(uuid, text)           from public, anon;
grant  execute on function public.solicitar_aprobacion(uuid, text)         to authenticated;
grant  execute on function public.resolver_aprobacion(uuid, boolean, text) to authenticated;
grant  execute on function public.reabrir_cotizacion(uuid, text)           to authenticated;
