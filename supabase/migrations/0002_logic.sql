-- =============================================================
-- 0002 · Lógica de negocio en la BD
--   * El precio unitario se toma SIEMPRE de la tarifa vigente.
--   * Los totales se recalculan en la BD (fuente de verdad).
--   * Las cotizaciones solo se escriben mediante funciones RPC
--     que validan rol, propiedad y estado.
-- =============================================================

-- ---------- Utilidades ----------
create or replace function private.hoy_lima()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Lima')::date $$;

create or replace function private.rol_actual()
returns public.rol_usuario
language sql stable security definer set search_path = ''
as $$
  select rol from public.profiles where id = (select auth.uid()) and activo
$$;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clientes_updated_at     before update on public.clientes     for each row execute function private.set_updated_at();
create trigger productos_updated_at    before update on public.productos    for each row execute function private.set_updated_at();
create trigger cotizaciones_updated_at before update on public.cotizaciones for each row execute function private.set_updated_at();
create trigger parametros_updated_at   before update on public.parametros   for each row execute function private.set_updated_at();

-- ---------- Perfil automático al registrarse ----------
-- El rol NUNCA se toma de los metadatos del usuario: siempre nace como 'asesor'.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Usuario'),
    new.email
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Correlativo COT-AAAA-0001 ----------
create or replace function private.siguiente_numero()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_anio int := extract(year from private.hoy_lima());
  v_n    int;
begin
  insert into public.correlativos (anio, ultimo) values (v_anio, 1)
  on conflict (anio) do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_n;
  return format('COT-%s-%s', v_anio, lpad(v_n::text, 4, '0'));
end $$;

-- ---------- Precio vigente ----------
create or replace function private.precio_vigente(p_producto_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $$
  select t.precio
  from public.tarifas t
  where t.producto_id = p_producto_id
    and t.vigente_desde <= private.hoy_lima()
    and (t.vigente_hasta is null or t.vigente_hasta >= private.hoy_lima())
  order by t.vigente_desde desc, t.created_at desc
  limit 1
$$;

-- Catálogo con precio vigente (respeta la RLS de productos y tarifas)
create view public.productos_vigentes with (security_invoker = true) as
select p.*, t.precio as precio_vigente
from public.productos p
left join lateral (
  select t.precio
  from public.tarifas t
  where t.producto_id = p.id
    and t.vigente_desde <= private.hoy_lima()
    and (t.vigente_hasta is null or t.vigente_hasta >= private.hoy_lima())
  order by t.vigente_desde desc, t.created_at desc
  limit 1
) t on true;

-- ---------- Auditoría ----------
create or replace function private.registrar_evento(
  p_cotizacion_id uuid,
  p_accion text,
  p_estado_anterior public.estado_cotizacion default null,
  p_estado_nuevo public.estado_cotizacion default null,
  p_detalle jsonb default null
) returns void language sql security definer set search_path = ''
as $$
  insert into public.cotizacion_eventos (cotizacion_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle)
  values (p_cotizacion_id, (select auth.uid()), p_accion, p_estado_anterior, p_estado_nuevo, p_detalle)
$$;

create or replace function private.auditar_estado()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.registrar_evento(new.id, 'cambio_estado', old.estado, new.estado, null);
  return new;
end $$;

create trigger cotizaciones_auditar_estado
  after update of estado on public.cotizaciones
  for each row when (old.estado is distinct from new.estado)
  execute function private.auditar_estado();

-- ---------- Cálculo de totales (fuente de verdad) ----------
-- Debe coincidir con src/lib/calc/cotizacion.ts:
--   línea:  bruto = round(cant * precio, 2); desc = round(bruto * d% , 2); importe = bruto - desc
--   global: desc_global = round(sum(importe) * g%, 2)
--   base = subtotal - (sum(desc) + desc_global); igv = round(base * igv%, 2); total = base + igv
--   descuento combinado por línea = 100 - (100 - d)(100 - g)/100 ; requiere aprobación si el mayor > umbral
create or replace function private.recalcular_cotizacion(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_g         numeric;
  v_igv_pct   numeric;
  v_umbral    numeric;
  v_sub       numeric;
  v_desc_lin  numeric;
  v_neto      numeric;
  v_max       numeric;
  v_desc_tot  numeric;
  v_base      numeric;
  v_igv       numeric;
begin
  select descuento_global_pct, igv_pct into v_g, v_igv_pct
  from public.cotizaciones where id = p_id for update;
  if not found then
    return;
  end if;

  select umbral_descuento_pct into v_umbral from public.parametros;

  select coalesce(sum(importe_bruto), 0),
         coalesce(sum(descuento_monto), 0),
         coalesce(sum(importe), 0),
         coalesce(max(100 - (100 - descuento_pct) * (100 - v_g) / 100), 0)
    into v_sub, v_desc_lin, v_neto, v_max
  from public.cotizacion_items
  where cotizacion_id = p_id;

  v_desc_tot := v_desc_lin + round(v_neto * v_g / 100, 2);
  v_base     := v_sub - v_desc_tot;
  v_igv      := round(v_base * v_igv_pct / 100, 2);

  update public.cotizaciones set
    subtotal               = v_sub,
    descuento_total        = v_desc_tot,
    base_imponible         = v_base,
    igv                    = v_igv,
    total                  = v_base + v_igv,
    descuento_pct_efectivo = case when v_sub > 0 then round(v_desc_tot * 100 / v_sub, 4) else 0 end,
    descuento_pct_max      = v_max,
    requiere_aprobacion    = v_max > v_umbral
  where id = p_id;
end $$;

-- ---------- RPC: crear / actualizar una cotización en borrador ----------
-- p_items: [{ "producto_id": uuid, "cantidad": number, "descuento_pct": number }, ...]
create or replace function public.guardar_cotizacion(
  p_id                   uuid,
  p_cliente_id           uuid,
  p_solicitud            text,
  p_validez_dias         int,
  p_descuento_global_pct numeric,
  p_items                jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_rol      public.rol_usuario := private.rol_actual();
  v_cot      public.cotizaciones%rowtype;
  v_id       uuid;
  v_item     jsonb;
  v_orden    int;
  v_prod     public.productos%rowtype;
  v_cant     numeric;
  v_desc     numeric;
  v_precio   numeric;
  v_bruto    numeric;
  v_dmonto   numeric;
  v_igv_pct  numeric;
begin
  if v_uid is null or v_rol is null then
    raise exception 'Usuario no autenticado o inactivo' using errcode = '42501';
  end if;
  if v_rol not in ('asesor', 'admin') then
    raise exception 'Solo asesores o administradores pueden registrar cotizaciones' using errcode = '42501';
  end if;

  -- Validaciones de cabecera
  if p_cliente_id is null or not exists (select 1 from public.clientes where id = p_cliente_id) then
    raise exception 'El cliente no existe';
  end if;
  if p_solicitud is null or length(trim(p_solicitud)) = 0 then
    raise exception 'Describa la solicitud del cliente';
  end if;
  if p_validez_dias is null or p_validez_dias not between 1 and 90 then
    raise exception 'La validez debe estar entre 1 y 90 días';
  end if;
  if p_descuento_global_pct is null or p_descuento_global_pct not between 0 and 100
     or p_descuento_global_pct <> round(p_descuento_global_pct, 2) then
    raise exception 'Descuento global inválido (0 a 100, máximo 2 decimales)';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los ítems deben enviarse como una lista';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'La cotización debe tener entre 1 y 100 ítems';
  end if;

  select igv_pct into v_igv_pct from public.parametros;

  if p_id is null then
    insert into public.cotizaciones (numero, cliente_id, asesor_id, solicitud, validez_dias, descuento_global_pct, igv_pct)
    values (private.siguiente_numero(), p_cliente_id, v_uid, trim(p_solicitud), p_validez_dias, p_descuento_global_pct, v_igv_pct)
    returning id into v_id;
  else
    select * into v_cot from public.cotizaciones where id = p_id for update;
    if not found then
      raise exception 'La cotización no existe';
    end if;
    if v_cot.asesor_id <> v_uid and v_rol <> 'admin' then
      raise exception 'No puede modificar cotizaciones de otro asesor' using errcode = '42501';
    end if;
    if v_cot.estado <> 'borrador' then
      raise exception 'Solo se pueden modificar cotizaciones en borrador (estado actual: %)', v_cot.estado;
    end if;

    update public.cotizaciones set
      cliente_id           = p_cliente_id,
      solicitud            = trim(p_solicitud),
      validez_dias         = p_validez_dias,
      descuento_global_pct = p_descuento_global_pct,
      igv_pct              = v_igv_pct
    where id = p_id;

    delete from public.cotizacion_items where cotizacion_id = p_id;
    v_id := p_id;
  end if;

  -- Ítems: el precio se toma de la tarifa vigente, nunca del cliente
  for v_item, v_orden in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    begin
      v_cant := (v_item ->> 'cantidad')::numeric;
      v_desc := coalesce((v_item ->> 'descuento_pct')::numeric, 0);
      select * into v_prod from public.productos where id = (v_item ->> 'producto_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Ítem %: datos con formato inválido', v_orden;
    end;

    if v_prod.id is null then
      raise exception 'Ítem %: el producto no existe', v_orden;
    end if;
    if not v_prod.activo then
      raise exception 'Ítem %: el producto % está inactivo', v_orden, v_prod.codigo;
    end if;
    if v_cant is null or v_cant <= 0 or v_cant > 1000000 or v_cant <> round(v_cant, 2) then
      raise exception 'Ítem %: cantidad inválida (mayor a 0, máximo 2 decimales)', v_orden;
    end if;
    if v_desc not between 0 and 100 or v_desc <> round(v_desc, 2) then
      raise exception 'Ítem %: descuento inválido (0 a 100, máximo 2 decimales)', v_orden;
    end if;

    v_precio := private.precio_vigente(v_prod.id);
    if v_precio is null then
      raise exception 'Ítem %: el producto % no tiene tarifa vigente', v_orden, v_prod.codigo;
    end if;

    v_bruto  := round(v_cant * v_precio, 2);
    v_dmonto := round(v_bruto * v_desc / 100, 2);

    insert into public.cotizacion_items (
      cotizacion_id, orden, producto_id, descripcion, unidad, cantidad,
      precio_unitario, descuento_pct, importe_bruto, descuento_monto, importe
    ) values (
      v_id, v_orden, v_prod.id, v_prod.nombre, v_prod.unidad, v_cant,
      v_precio, v_desc, v_bruto, v_dmonto, v_bruto - v_dmonto
    );

    v_prod := null;
  end loop;

  perform private.recalcular_cotizacion(v_id);

  select * into v_cot from public.cotizaciones where id = v_id;
  perform private.registrar_evento(
    v_id,
    case when p_id is null then 'creada' else 'modificada' end,
    null, null,
    jsonb_build_object(
      'items', jsonb_array_length(p_items),
      'total', v_cot.total,
      'descuento_pct_max', v_cot.descuento_pct_max,
      'requiere_aprobacion', v_cot.requiere_aprobacion
    )
  );

  return v_id;
end $$;

revoke execute on function public.guardar_cotizacion(uuid, uuid, text, int, numeric, jsonb) from public, anon;
grant execute on function public.guardar_cotizacion(uuid, uuid, text, int, numeric, jsonb) to authenticated;
