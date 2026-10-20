-- =============================================================
-- 0003 · Permisos y políticas RLS por rol
--   asesor   : sus propias cotizaciones; registra clientes
--   finanzas : lee todas las cotizaciones; gestiona catálogo y tarifas
--   admin    : acceso total; gestiona usuarios y parámetros
-- Las cotizaciones, ítems, aprobaciones y eventos NO se escriben
-- directamente: solo mediante funciones RPC (security definer).
-- =============================================================

-- Funciones internas: nadie las ejecuta directamente, salvo el rol (se usa dentro de las políticas)
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.rol_actual() to authenticated;
grant execute on function private.hoy_lima() to authenticated;  -- usada por la vista productos_vigentes

-- ---------- Privilegios de tabla (mínimos) ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.correlativos from authenticated;

grant update (igv_pct, umbral_descuento_pct, validez_dias_default) on public.parametros to authenticated;
grant update (nombre, rol, activo) on public.profiles to authenticated;
grant insert (ruc, razon_social, contacto, email, telefono, direccion),
      update (ruc, razon_social, contacto, email, telefono, direccion),
      delete on public.clientes to authenticated;
grant insert (codigo, nombre, descripcion, unidad, activo),
      update (codigo, nombre, descripcion, unidad, activo) on public.productos to authenticated;
grant insert (producto_id, precio, vigente_desde, vigente_hasta),
      update (vigente_hasta) on public.tarifas to authenticated;

-- ---------- RLS ----------
alter table public.parametros         enable row level security;
alter table public.profiles           enable row level security;
alter table public.clientes           enable row level security;
alter table public.productos          enable row level security;
alter table public.tarifas            enable row level security;
alter table public.correlativos       enable row level security;
alter table public.cotizaciones       enable row level security;
alter table public.cotizacion_items   enable row level security;
alter table public.aprobaciones       enable row level security;
alter table public.cotizacion_eventos enable row level security;

-- parametros
create policy parametros_select on public.parametros
  for select to authenticated using (true);
create policy parametros_update on public.parametros
  for update to authenticated
  using ((select private.rol_actual()) = 'admin')
  with check ((select private.rol_actual()) = 'admin');

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.rol_actual()) in ('finanzas', 'admin'));
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select private.rol_actual()) = 'admin')
  with check ((select private.rol_actual()) = 'admin');

-- clientes
create policy clientes_select on public.clientes
  for select to authenticated using ((select private.rol_actual()) is not null);
create policy clientes_insert on public.clientes
  for insert to authenticated
  with check ((select private.rol_actual()) in ('asesor', 'admin'));
create policy clientes_update on public.clientes
  for update to authenticated
  using ((select private.rol_actual()) in ('asesor', 'admin'))
  with check ((select private.rol_actual()) in ('asesor', 'admin'));
create policy clientes_delete on public.clientes
  for delete to authenticated
  using ((select private.rol_actual()) = 'admin');

-- productos
create policy productos_select on public.productos
  for select to authenticated using ((select private.rol_actual()) is not null);
create policy productos_insert on public.productos
  for insert to authenticated
  with check ((select private.rol_actual()) in ('finanzas', 'admin'));
create policy productos_update on public.productos
  for update to authenticated
  using ((select private.rol_actual()) in ('finanzas', 'admin'))
  with check ((select private.rol_actual()) in ('finanzas', 'admin'));

-- tarifas
create policy tarifas_select on public.tarifas
  for select to authenticated using ((select private.rol_actual()) is not null);
create policy tarifas_insert on public.tarifas
  for insert to authenticated
  with check ((select private.rol_actual()) in ('finanzas', 'admin'));
create policy tarifas_update on public.tarifas
  for update to authenticated
  using ((select private.rol_actual()) in ('finanzas', 'admin'))
  with check ((select private.rol_actual()) in ('finanzas', 'admin'));

-- correlativos: sin políticas (solo funciones internas)

-- cotizaciones: el asesor ve las suyas; finanzas y admin ven todas
create policy cotizaciones_select on public.cotizaciones
  for select to authenticated
  using (
    (select private.rol_actual()) is not null
    and (asesor_id = (select auth.uid()) or (select private.rol_actual()) in ('finanzas', 'admin'))
  );

-- tablas hijas: visibles si la cotización es visible (aplica la RLS de cotizaciones)
create policy cotizacion_items_select on public.cotizacion_items
  for select to authenticated
  using (exists (select 1 from public.cotizaciones c where c.id = cotizacion_id));
create policy aprobaciones_select on public.aprobaciones
  for select to authenticated
  using (exists (select 1 from public.cotizaciones c where c.id = cotizacion_id));
create policy cotizacion_eventos_select on public.cotizacion_eventos
  for select to authenticated
  using (exists (select 1 from public.cotizaciones c where c.id = cotizacion_id));
