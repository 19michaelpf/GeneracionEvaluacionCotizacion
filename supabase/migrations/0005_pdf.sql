-- =============================================================
-- 0005 · PDF en Storage privado y validación del asesor
--   (borrador sin aprobación requerida | aprobada | generada)
--        ──generar PDF──▶ generada ──validar──▶ validada
--   * Solo el servidor sube PDFs (service role): los usuarios no tienen
--     permisos de escritura en el bucket, así nadie puede reemplazar un
--     PDF por uno alterado.
--   * La lectura se autoriza con la misma visibilidad que la cotización.
-- =============================================================

-- ---------- Datos de la empresa para el encabezado del PDF ----------
alter table public.parametros
  add column empresa_razon_social text not null default 'Soluciones Industriales del Norte S.A.C.',
  add column empresa_ruc          text,
  add column empresa_direccion    text,
  add column empresa_telefono     text,
  add column empresa_email        text;

grant update (empresa_razon_social, empresa_ruc, empresa_direccion, empresa_telefono, empresa_email)
  on public.parametros to authenticated;  -- la política parametros_update limita a admin

-- Se marca cuando cambian los textos después de generar el PDF: obliga a regenerarlo antes de validar
alter table public.cotizaciones add column pdf_desactualizado boolean not null default false;

-- ---------- Bucket privado ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones-pdf', 'cotizaciones-pdf', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: {cotizacion_id}/v{n}.pdf. Lectura si la cotización es visible para el usuario (RLS de cotizaciones).
create policy cotizaciones_pdf_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cotizaciones-pdf'
    and exists (
      select 1 from public.cotizaciones c
      where c.id::text = (storage.foldername(name))[1]
    )
  );
-- Sin políticas de insert/update/delete: solo el service role (servidor) escribe en el bucket.

-- ---------- Registrar un PDF generado ----------
create or replace function public.registrar_pdf(p_cotizacion_id uuid, p_version int)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_rol  public.rol_usuario := private.rol_actual();
  v_cot  public.cotizaciones%rowtype;
  v_path text;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede generar el PDF' using errcode = '42501';
  end if;
  if v_cot.estado = 'borrador' and v_cot.requiere_aprobacion then
    raise exception 'El descuento requiere aprobación de Finanzas antes de generar el PDF';
  end if;
  if v_cot.estado not in ('borrador', 'aprobada', 'generada') then
    raise exception 'No se puede generar el PDF en estado %', v_cot.estado;
  end if;
  if p_version is distinct from v_cot.pdf_version + 1 then
    raise exception 'La cotización cambió mientras se generaba el PDF. Intente nuevamente.';
  end if;

  v_path := format('%s/v%s.pdf', v_cot.id, p_version);
  if not exists (select 1 from storage.objects where bucket_id = 'cotizaciones-pdf' and name = v_path) then
    raise exception 'No se encontró el archivo PDF generado';
  end if;

  -- La fecha de emisión es la del documento: la validez cuenta desde aquí
  update public.cotizaciones set
    pdf_path      = v_path,
    pdf_version   = p_version,
    fecha_emision = private.hoy_lima(),
    estado        = 'generada',
    pdf_desactualizado = false,
    validada_por = null,
    validada_en  = null
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'pdf_generado', null, null,
    jsonb_build_object('version', p_version, 'total', v_cot.total));
  return v_path;
end $$;

-- ---------- Validación del asesor ----------
create or replace function public.validar_cotizacion(p_cotizacion_id uuid)
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

  select * into v_cot from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
    raise exception 'Solo el asesor de la cotización puede validarla' using errcode = '42501';
  end if;
  if v_cot.estado <> 'generada' or v_cot.pdf_path is null then
    raise exception 'Solo se puede validar una cotización con PDF generado (estado actual: %)', v_cot.estado;
  end if;
  if v_cot.pdf_desactualizado then
    raise exception 'Los textos cambiaron después de generar el PDF: regenérelo antes de validar';
  end if;

  update public.cotizaciones set estado = 'validada', validada_por = v_uid, validada_en = now()
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'validada', null, null,
    jsonb_build_object('version', v_cot.pdf_version));
end $$;

-- ---------- Reabrir: también desde generada o validada ----------
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
  if v_cot.estado not in ('pendiente_aprobacion', 'aprobada', 'generada', 'validada') then
    raise exception 'No se puede reabrir una cotización en estado %', v_cot.estado;
  end if;

  update public.aprobaciones set estado = 'anulada', resuelto_en = coalesce(resuelto_en, now())
  where cotizacion_id = v_cot.id and estado in ('pendiente', 'aprobada');
  get diagnostics v_anuladas = row_count;

  update public.cotizaciones set estado = 'borrador', validada_por = null, validada_en = null
  where id = v_cot.id;

  perform private.registrar_evento(v_cot.id, 'reabierta', null, null,
    jsonb_build_object('motivo', nullif(trim(p_motivo), ''), 'aprobaciones_anuladas', v_anuladas));
end $$;

revoke execute on function public.registrar_pdf(uuid, int)      from public, anon;
revoke execute on function public.validar_cotizacion(uuid)      from public, anon;
grant  execute on function public.registrar_pdf(uuid, int)      to authenticated;
grant  execute on function public.validar_cotizacion(uuid)      to authenticated;
