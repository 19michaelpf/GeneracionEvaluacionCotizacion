-- =============================================================
-- 0006 · Textos del PDF (redactados con IA o editados por el asesor)
--   * Solo se guardan textos libres: presentación, condiciones y cierre.
--     Las cifras del PDF siempre salen de las tablas.
--   * Editables mientras la cotización no esté validada.
--   * Si ya había PDF generado, queda marcado como desactualizado.
-- =============================================================

create or replace function public.guardar_textos(p_cotizacion_id uuid, p_textos jsonb, p_origen text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := private.rol_actual();
  v_cot public.cotizaciones%rowtype;
  v_cond jsonb;
  v_n int;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if p_origen is null or p_origen not in ('ia', 'manual') then
    raise exception 'Origen de textos inválido';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede modificar sus textos' using errcode = '42501';
  end if;
  if v_cot.estado not in ('borrador', 'aprobada', 'generada') then
    raise exception 'No se pueden modificar los textos en estado %', v_cot.estado;
  end if;

  -- Estructura mínima (la aplicación valida además con zod)
  if p_textos is null or jsonb_typeof(p_textos) <> 'object'
     or jsonb_typeof(p_textos -> 'presentacion') is distinct from 'string'
     or jsonb_typeof(p_textos -> 'cierre') is distinct from 'string'
     or jsonb_typeof(p_textos -> 'condiciones') is distinct from 'array' then
    raise exception 'Formato de textos inválido';
  end if;
  v_cond := p_textos -> 'condiciones';
  v_n := jsonb_array_length(v_cond);
  if v_n not between 1 and 12 then
    raise exception 'Debe haber entre 1 y 12 condiciones comerciales';
  end if;
  if length(p_textos ->> 'presentacion') not between 1 and 1500
     or length(p_textos ->> 'cierre') not between 1 and 800
     or exists (select 1 from jsonb_array_elements(v_cond) c
                where jsonb_typeof(c) <> 'string' or length(c #>> '{}') not between 1 and 400) then
    raise exception 'Algún texto está vacío o es demasiado largo';
  end if;

  update public.cotizaciones set
    textos_ia = jsonb_build_object(
      'presentacion', p_textos -> 'presentacion',
      'condiciones',  v_cond,
      'cierre',       p_textos -> 'cierre',
      'advertencias', coalesce(p_textos -> 'advertencias', '[]'::jsonb),
      'modelo',       p_textos -> 'modelo',
      'origen',       p_origen,
      'actualizado_en', now()
    ),
    pdf_desactualizado = (v_cot.estado = 'generada') or v_cot.pdf_desactualizado
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'textos_actualizados', null, null,
    jsonb_build_object('origen', p_origen,
                       'advertencias', jsonb_array_length(coalesce(p_textos -> 'advertencias', '[]'::jsonb))));
end $$;

revoke execute on function public.guardar_textos(uuid, jsonb, text) from public, anon;
grant  execute on function public.guardar_textos(uuid, jsonb, text) to authenticated;
