-- =============================================================
-- 0001 · Esquema base: tipos, tablas e índices
-- Soluciones Industriales del Norte S.A.C. — Cotizaciones
-- =============================================================

-- Funciones internas (no expuestas por la API de Supabase)
create schema if not exists private;
revoke all on schema private from public;
alter default privileges in schema private revoke execute on functions from public;

-- ---------- Tipos ----------
create type public.rol_usuario as enum ('asesor', 'finanzas', 'admin');

create type public.estado_cotizacion as enum (
  'borrador',
  'pendiente_aprobacion',
  'aprobada',
  'generada',
  'validada',
  'enviada',
  'aceptada',
  'rechazada_cliente',
  'vencida'
);

create type public.estado_aprobacion as enum ('pendiente', 'aprobada', 'rechazada', 'anulada');

-- ---------- Parámetros comerciales (fila única) ----------
create table public.parametros (
  id                   boolean primary key default true check (id),
  igv_pct              numeric(5,2) not null default 18    check (igv_pct between 0 and 100),
  umbral_descuento_pct numeric(5,2) not null default 15    check (umbral_descuento_pct between 0 and 100),
  moneda               text         not null default 'PEN',
  validez_dias_default int          not null default 15    check (validez_dias_default between 1 and 90),
  updated_at           timestamptz  not null default now()
);
insert into public.parametros default values;

-- ---------- Usuarios ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  email      text,
  rol        public.rol_usuario not null default 'asesor',
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Clientes ----------
create table public.clientes (
  id           uuid primary key default gen_random_uuid(),
  ruc          text not null unique check (ruc ~ '^[0-9]{11}$'),
  razon_social text not null check (length(trim(razon_social)) > 0),
  contacto     text,
  email        text,
  telefono     text,
  direccion    text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Catálogo ----------
create table public.productos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique check (length(trim(codigo)) > 0),
  nombre      text not null check (length(trim(nombre)) > 0),
  descripcion text,
  unidad      text not null default 'UND',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Historial de precios: el precio vigente es la tarifa más reciente con vigente_desde <= hoy.
create table public.tarifas (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos (id) on delete cascade,
  precio        numeric(12,2) not null check (precio > 0),
  vigente_desde date not null default ((now() at time zone 'America/Lima')::date),
  vigente_hasta date,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index tarifas_producto_idx on public.tarifas (producto_id, vigente_desde desc, created_at desc);

-- ---------- Cotizaciones ----------
create table public.correlativos (
  anio   int primary key,
  ultimo int not null default 0
);

create table public.cotizaciones (
  id                     uuid primary key default gen_random_uuid(),
  numero                 text not null unique,
  cliente_id             uuid not null references public.clientes (id) on delete restrict,
  asesor_id              uuid not null references public.profiles (id),
  solicitud              text not null check (length(trim(solicitud)) > 0),
  moneda                 text not null default 'PEN',
  fecha_emision          date not null default ((now() at time zone 'America/Lima')::date),
  validez_dias           int  not null default 15 check (validez_dias between 1 and 90),
  descuento_global_pct   numeric(5,2)  not null default 0 check (descuento_global_pct between 0 and 100),
  igv_pct                numeric(5,2)  not null,
  -- Importes calculados en la BD (private.recalcular_cotizacion)
  subtotal               numeric(14,2) not null default 0,
  descuento_total        numeric(14,2) not null default 0,
  base_imponible         numeric(14,2) not null default 0,
  igv                    numeric(14,2) not null default 0,
  total                  numeric(14,2) not null default 0,
  descuento_pct_efectivo numeric(7,4)  not null default 0,  -- descuento_total / subtotal
  descuento_pct_max      numeric       not null default 0,  -- mayor descuento combinado de una línea
  requiere_aprobacion    boolean       not null default false,
  estado                 public.estado_cotizacion not null default 'borrador',
  -- Etapas posteriores
  textos_ia              jsonb,
  pdf_path               text,
  pdf_version            int not null default 0,
  validada_por           uuid references public.profiles (id),
  validada_en            timestamptz,
  envio_medio            text,
  envio_destinatario     text,
  enviada_en             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index cotizaciones_asesor_idx on public.cotizaciones (asesor_id, created_at desc);
create index cotizaciones_estado_idx on public.cotizaciones (estado);
create index cotizaciones_cliente_idx on public.cotizaciones (cliente_id);

create table public.cotizacion_items (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid not null references public.cotizaciones (id) on delete cascade,
  orden           int  not null default 0,
  producto_id     uuid not null references public.productos (id) on delete restrict,
  descripcion     text not null,                -- copia del producto al cotizar
  unidad          text not null,
  cantidad        numeric(12,2) not null check (cantidad > 0 and cantidad <= 1000000),
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),  -- tomado de la tarifa vigente
  descuento_pct   numeric(5,2)  not null default 0 check (descuento_pct between 0 and 100),
  importe_bruto   numeric(14,2) not null,
  descuento_monto numeric(14,2) not null,
  importe         numeric(14,2) not null
);
create index cotizacion_items_cot_idx on public.cotizacion_items (cotizacion_id, orden);

-- ---------- Aprobaciones de Finanzas ----------
create table public.aprobaciones (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  descuento_pct  numeric not null,
  total          numeric(14,2) not null,
  estado         public.estado_aprobacion not null default 'pendiente',
  solicitado_por uuid not null references public.profiles (id),
  solicitado_en  timestamptz not null default now(),
  resuelto_por   uuid references public.profiles (id),
  resuelto_en    timestamptz,
  comentario     text
);
create unique index aprobaciones_una_pendiente
  on public.aprobaciones (cotizacion_id) where estado = 'pendiente';

-- ---------- Auditoría ----------
create table public.cotizacion_eventos (
  id              bigint generated always as identity primary key,
  cotizacion_id   uuid not null references public.cotizaciones (id) on delete cascade,
  usuario_id      uuid references public.profiles (id),
  accion          text not null,
  estado_anterior public.estado_cotizacion,
  estado_nuevo    public.estado_cotizacion,
  detalle         jsonb,
  created_at      timestamptz not null default now()
);
create index cotizacion_eventos_cot_idx on public.cotizacion_eventos (cotizacion_id, created_at);
