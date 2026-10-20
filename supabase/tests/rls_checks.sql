-- =============================================================
-- Pruebas de cálculo, reglas y permisos (RLS).
-- Ejecutar en Supabase > SQL Editor DESPUÉS de migraciones + seed.
-- Todo corre dentro de una transacción que se revierte al final:
-- no deja datos. Si una verificación falla, se lanza un error.
-- =============================================================
begin;

-- ---------- Preparación (como postgres) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'asesor.a@test.pe',  '{"nombre":"Asesor A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'asesor.b@test.pe',  '{"nombre":"Asesor B"}'),
  ('00000000-0000-0000-0000-00000000000f', 'finanzas@test.pe',  '{"nombre":"Finanzas"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.pe',     '{"nombre":"Admin"}');
update public.profiles set rol = 'finanzas' where id = '00000000-0000-0000-0000-00000000000f';
update public.profiles set rol = 'admin'    where id = '00000000-0000-0000-0000-0000000000ad';

do $$
begin
  assert (select rol from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'asesor',
    'El perfil nuevo debe nacer con rol asesor';
  assert exists (select 1 from public.productos where codigo = 'VAL-BOL-2'), 'Ejecute seed.sql antes de las pruebas';
end $$;

-- ---------- Asesor A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_id  uuid;
  v_c   public.cotizaciones%rowtype;
  v_ok  boolean;
begin
  -- 1. Cálculo de totales (mismo caso que src/lib/calc/cotizacion.test.ts)
  v_id := public.guardar_cotizacion(
    null,
    (select id from public.clientes where ruc = '20601234567'),
    'Equipamiento de estación de bombeo',
    15,
    2,
    jsonb_build_array(
      jsonb_build_object('producto_id', (select id from public.productos where codigo = 'VAL-BOL-2'), 'cantidad', 3,   'descuento_pct', 5,  'precio_unitario', 1),
      jsonb_build_object('producto_id', (select id from public.productos where codigo = 'MOT-3HP'),   'cantidad', 1.5, 'descuento_pct', 10)
    )
  );
  select * into v_c from public.cotizaciones where id = v_id;
  assert v_c.numero ~ '^COT-[0-9]{4}-[0-9]{4}$', 'Formato de número incorrecto: ' || v_c.numero;
  assert v_c.subtotal = 3330.00,        'subtotal ' || v_c.subtotal;
  assert v_c.descuento_total = 336.35,  'descuento_total ' || v_c.descuento_total;
  assert v_c.base_imponible = 2993.65,  'base ' || v_c.base_imponible;
  assert v_c.igv = 538.86,              'igv ' || v_c.igv;
  assert v_c.total = 3532.51,           'total ' || v_c.total;
  assert v_c.descuento_pct_max = 11.8,  'descuento max ' || v_c.descuento_pct_max;
  assert not v_c.requiere_aprobacion,   'No debería requerir aprobación';
  assert v_c.estado = 'borrador';
  -- El precio enviado por el cliente se ignora: se usa la tarifa
  assert (select precio_unitario from public.cotizacion_items where cotizacion_id = v_id and orden = 1) = 385.00,
    'El precio debe venir de la tarifa';
  assert exists (select 1 from public.cotizacion_eventos where cotizacion_id = v_id and accion = 'creada'),
    'Debe registrarse el evento de creación';
  perform set_config('test.cot_a', v_id::text, true);

  -- 2. Umbral de aprobación: 15 % no requiere, 15.01 % sí, combinado 10 % + 6 % = 15.4 % sí
  v_id := public.guardar_cotizacion(null, (select id from public.clientes where ruc = '20601234567'), 'Umbral', 15, 0,
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1, 'descuento_pct', 15)));
  assert not (select requiere_aprobacion from public.cotizaciones where id = v_id), '15 % no debe requerir aprobación';

  perform public.guardar_cotizacion(v_id, (select id from public.clientes where ruc = '20601234567'), 'Umbral', 15, 0,
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1, 'descuento_pct', 15.01)));
  assert (select requiere_aprobacion from public.cotizaciones where id = v_id), '15.01 % debe requerir aprobación';

  perform public.guardar_cotizacion(v_id, (select id from public.clientes where ruc = '20601234567'), 'Umbral', 15, 6,
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1, 'descuento_pct', 10)));
  assert (select requiere_aprobacion from public.cotizaciones where id = v_id), '10 % + 6 % global (15.4 %) debe requerir aprobación';
  assert (select count(*) from public.cotizacion_items where cotizacion_id = v_id) = 1, 'Al editar se reemplazan los ítems';
  perform set_config('test.cot_b', v_id::text, true);  -- requiere aprobación (se usa en la sección de aprobaciones)

  -- 3. Escrituras directas bloqueadas
  v_ok := false;
  begin
    update public.cotizaciones set total = 1 where id = v_id;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe poder modificar totales directamente';

  v_ok := false;
  begin
    update public.cotizaciones set estado = 'aprobada' where id = v_id;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe poder cambiar el estado directamente';

  v_ok := false;
  begin
    insert into public.cotizacion_items (cotizacion_id, producto_id, descripcion, unidad, cantidad, precio_unitario, importe_bruto, descuento_monto, importe)
    values (v_id, (select id from public.productos where codigo = 'SRV-MANT'), 'x', 'UND', 1, 0.01, 0.01, 0, 0.01);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe poder insertar ítems con precio propio';

  -- 4. Validaciones de la RPC
  v_ok := false;
  begin
    perform public.guardar_cotizacion(null, (select id from public.clientes where ruc = '20601234567'), 'x', 15, 0,
      jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', -2)));
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar cantidades negativas';

  v_ok := false;
  begin
    perform public.guardar_cotizacion(null, (select id from public.clientes where ruc = '20601234567'), 'x', 15, 0, '[]'::jsonb);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar cotizaciones sin ítems';

  -- 5. Catálogo y roles
  v_ok := false;
  begin
    insert into public.productos (codigo, nombre) values ('HACK', 'No permitido');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe registrar productos';

  assert (select precio_vigente from public.productos_vigentes where codigo = 'MOT-3HP') = 1450.00,
    'La vista debe mostrar el precio vigente';

  update public.profiles set rol = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
  assert (select rol from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'asesor',
    'El asesor no debe poder cambiar su propio rol';

  v_ok := false;
  begin
    perform 1 from public.correlativos;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe leer la tabla de correlativos';
end $$;

-- ---------- Asesor B: no ve ni modifica cotizaciones ajenas ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare
  v_ok boolean := false;
begin
  assert (select count(*) from public.cotizaciones) = 0, 'El asesor B no debe ver cotizaciones del asesor A';
  assert (select count(*) from public.cotizacion_items) = 0, 'El asesor B no debe ver ítems ajenos';
  assert (select count(*) from public.cotizacion_eventos) = 0, 'El asesor B no debe ver eventos ajenos';
  begin
    perform public.guardar_cotizacion(current_setting('test.cot_a')::uuid,
      (select id from public.clientes where ruc = '20601234567'), 'Intento', 15, 0,
      jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1)));
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor B no debe modificar la cotización del asesor A';
end $$;

-- ---------- Finanzas ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);

do $$
declare
  v_ok boolean := false;
begin
  assert (select count(*) from public.cotizaciones) >= 2, 'Finanzas debe ver todas las cotizaciones';
  begin
    perform public.guardar_cotizacion(null, (select id from public.clientes where ruc = '20601234567'), 'x', 15, 0,
      jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1)));
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'Finanzas no registra cotizaciones';

  insert into public.productos (codigo, nombre) values ('TEST-FIN', 'Producto de prueba');
  insert into public.tarifas (producto_id, precio) values ((select id from public.productos where codigo = 'TEST-FIN'), 10);

  v_ok := false;
  begin
    update public.parametros set umbral_descuento_pct = 50;
    v_ok := (select umbral_descuento_pct from public.parametros) = 15;
  end;
  assert v_ok, 'Finanzas no debe cambiar parámetros';
end $$;

-- ---------- Admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);

do $$
begin
  update public.parametros set validez_dias_default = 20;
  assert (select validez_dias_default from public.parametros) = 20, 'Admin debe poder cambiar parámetros';
end $$;

-- ---------- Flujo de aprobación (0004) ----------
-- Asesor A solicita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_ok  boolean;
  v_cot uuid := current_setting('test.cot_b')::uuid;
begin
  v_ok := false;
  begin
    perform public.solicitar_aprobacion(current_setting('test.cot_a')::uuid);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se debe solicitar aprobación si el descuento no supera el umbral';

  perform set_config('test.apr_1', public.solicitar_aprobacion(v_cot, 'Cliente estratégico')::text, true);
  assert (select estado from public.cotizaciones where id = v_cot) = 'pendiente_aprobacion', 'Debe quedar pendiente de aprobación';
  assert (select descuento_pct from public.aprobaciones where id = current_setting('test.apr_1')::uuid) = 15.4,
    'La solicitud debe registrar el descuento';

  v_ok := false;
  begin
    perform public.solicitar_aprobacion(v_cot);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se debe duplicar la solicitud';

  v_ok := false;
  begin
    perform public.guardar_cotizacion(v_cot, (select id from public.clientes where ruc = '20601234567'), 'Cambio', 15, 0,
      jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1, 'descuento_pct', 50)));
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se deben modificar ítems mientras espera aprobación';

  v_ok := false;
  begin
    perform public.resolver_aprobacion(current_setting('test.apr_1')::uuid, true, null);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe aprobar su propio descuento';

  v_ok := false;
  begin
    update public.aprobaciones set estado = 'aprobada' where id = current_setting('test.apr_1')::uuid;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor no debe modificar aprobaciones directamente';
end $$;

-- Asesor B no puede intervenir
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.reabrir_cotizacion(current_setting('test.cot_b')::uuid);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor B no debe reabrir cotizaciones ajenas';
  assert (select count(*) from public.aprobaciones) = 0, 'El asesor B no debe ver aprobaciones ajenas';
end $$;

-- Finanzas resuelve
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);

do $$
declare
  v_ok  boolean := false;
  v_apr uuid := current_setting('test.apr_1')::uuid;
  v_cot uuid := current_setting('test.cot_b')::uuid;
begin
  assert (select count(*) from public.aprobaciones where estado = 'pendiente') >= 1, 'Finanzas debe ver las solicitudes pendientes';

  begin
    perform public.resolver_aprobacion(v_apr, false, '  ');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'El rechazo debe exigir un motivo';

  perform public.resolver_aprobacion(v_apr, true, 'Aprobado por volumen');
  assert (select estado from public.cotizaciones where id = v_cot) = 'aprobada', 'La cotización debe quedar aprobada';
  assert (select resuelto_por from public.aprobaciones where id = v_apr) = '00000000-0000-0000-0000-00000000000f',
    'Debe registrarse quién aprobó';
  assert exists (select 1 from public.cotizacion_eventos where cotizacion_id = v_cot and accion = 'descuento_aprobado'),
    'Debe registrarse el evento de aprobación';

  v_ok := false;
  begin
    perform public.resolver_aprobacion(v_apr, false, 'Cambio de opinión');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Una aprobación resuelta no se puede volver a resolver';
end $$;

-- Asesor A reabre (anula la aprobación), vuelve a solicitar y Finanzas rechaza
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_cot uuid := current_setting('test.cot_b')::uuid;
begin
  perform public.reabrir_cotizacion(v_cot, 'Cliente pidió otro producto');
  assert (select estado from public.cotizaciones where id = v_cot) = 'borrador', 'Debe volver a borrador';
  assert (select estado from public.aprobaciones where id = current_setting('test.apr_1')::uuid) = 'anulada',
    'Reabrir debe anular la aprobación';
  perform set_config('test.apr_2', public.solicitar_aprobacion(v_cot)::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);

do $$
begin
  perform public.resolver_aprobacion(current_setting('test.apr_2')::uuid, false, 'Margen insuficiente');
  assert (select estado from public.cotizaciones where id = current_setting('test.cot_b')::uuid) = 'borrador',
    'El rechazo devuelve la cotización a borrador';
  assert (select comentario_resolucion from public.aprobaciones where id = current_setting('test.apr_2')::uuid) = 'Margen insuficiente';
end $$;

-- ---------- PDF y validación (0005) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.registrar_pdf(current_setting('test.cot_a')::uuid, 1);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se debe registrar un PDF que no existe en Storage';

  v_ok := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('cotizaciones-pdf', current_setting('test.cot_a') || '/v1.pdf');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El usuario no debe subir archivos al bucket directamente';
end $$;

-- El servidor (service role) sube el archivo
reset role;
insert into storage.objects (bucket_id, name) values
  ('cotizaciones-pdf', current_setting('test.cot_a') || '/v1.pdf'),
  ('cotizaciones-pdf', current_setting('test.cot_b') || '/v1.pdf');
set local role authenticated;

do $$
declare
  v_ok  boolean := false;
  v_cot uuid := current_setting('test.cot_a')::uuid;
begin
  begin
    perform public.registrar_pdf(v_cot, 7);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar una versión fuera de secuencia';

  v_ok := false;
  begin
    perform public.registrar_pdf(current_setting('test.cot_b')::uuid, 1);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Sin aprobación no se genera el PDF de una cotización con descuento alto';

  perform public.registrar_pdf(v_cot, 1);
  assert (select estado from public.cotizaciones where id = v_cot) = 'generada', 'Debe quedar generada';
  assert (select pdf_path from public.cotizaciones where id = v_cot) = v_cot || '/v1.pdf';
  assert (select count(*) from storage.objects where name = v_cot || '/v1.pdf') = 1, 'El asesor debe poder leer su PDF';

  v_ok := false;
  begin
    perform public.guardar_cotizacion(v_cot, (select id from public.clientes where ruc = '20601234567'), 'x', 15, 0,
      jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 1)));
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Una cotización generada no se edita sin reabrir';

  perform public.validar_cotizacion(v_cot);
  assert (select estado from public.cotizaciones where id = v_cot) = 'validada', 'Debe quedar validada';
  assert (select validada_por from public.cotizaciones where id = v_cot) = '00000000-0000-0000-0000-00000000000a';

  v_ok := false;
  begin
    perform public.validar_cotizacion(v_cot);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se valida dos veces';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare
  v_ok boolean := false;
begin
  assert (select count(*) from storage.objects where bucket_id = 'cotizaciones-pdf') = 0, 'El asesor B no debe ver PDFs ajenos';
  begin
    perform public.reabrir_cotizacion(current_setting('test.cot_a')::uuid);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor B no debe reabrir la cotización validada de otro';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from storage.objects
          where bucket_id = 'cotizaciones-pdf'
            and name in (current_setting('test.cot_a') || '/v1.pdf', current_setting('test.cot_b') || '/v1.pdf')) = 2,
    'Finanzas debe ver todos los PDFs';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_cot uuid := current_setting('test.cot_a')::uuid;
begin
  perform public.reabrir_cotizacion(v_cot, 'Corregir dirección');
  assert (select estado from public.cotizaciones where id = v_cot) = 'borrador', 'Reabrir desde validada vuelve a borrador';
  assert (select validada_por from public.cotizaciones where id = v_cot) is null, 'Reabrir limpia la validación';
end $$;

-- ---------- Textos del PDF (0006) ----------
-- cot_a está en borrador (fue reabierta) con pdf_version = 1
do $$
declare
  v_ok    boolean;
  v_cot   uuid := current_setting('test.cot_a')::uuid;
  v_texto jsonb := '{"presentacion":"Estimados","condiciones":["Precios en soles"],"cierre":"Saludos"}';
begin
  perform public.guardar_textos(v_cot, v_texto, 'manual');
  assert (select textos_ia ->> 'origen' from public.cotizaciones where id = v_cot) = 'manual', 'Debe guardar el origen';
  assert not (select pdf_desactualizado from public.cotizaciones where id = v_cot), 'En borrador no marca el PDF como desactualizado';

  v_ok := false;
  begin
    perform public.guardar_textos(v_cot, '{"presentacion":"x","cierre":"y"}', 'manual');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar textos sin condiciones';

  v_ok := false;
  begin
    perform public.guardar_textos(v_cot, jsonb_set(v_texto, '{condiciones}', (select jsonb_agg('c'::text) from generate_series(1, 13))), 'manual');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar más de 12 condiciones';

  v_ok := false;
  begin
    perform public.guardar_textos(v_cot, v_texto, 'otro');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar un origen desconocido';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.guardar_textos(current_setting('test.cot_a')::uuid,
      '{"presentacion":"x","condiciones":["c"],"cierre":"y"}', 'manual');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor B no debe modificar textos ajenos';
end $$;

-- PDF v2 generado → cambiar textos lo deja desactualizado → no se valida hasta regenerar (v3)
reset role;
insert into storage.objects (bucket_id, name) values
  ('cotizaciones-pdf', current_setting('test.cot_a') || '/v2.pdf'),
  ('cotizaciones-pdf', current_setting('test.cot_a') || '/v3.pdf');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  v_ok  boolean := false;
  v_cot uuid := current_setting('test.cot_a')::uuid;
begin
  perform public.registrar_pdf(v_cot, 2);
  perform public.guardar_textos(v_cot, '{"presentacion":"Nuevo","condiciones":["c"],"cierre":"y"}', 'ia');
  assert (select pdf_desactualizado from public.cotizaciones where id = v_cot), 'Cambiar textos tras generar debe desactualizar el PDF';

  begin
    perform public.validar_cotizacion(v_cot);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se valida con el PDF desactualizado';

  perform public.registrar_pdf(v_cot, 3);
  assert not (select pdf_desactualizado from public.cotizaciones where id = v_cot), 'Regenerar limpia la marca';
  perform public.validar_cotizacion(v_cot);

  v_ok := false;
  begin
    perform public.guardar_textos(v_cot, '{"presentacion":"x","condiciones":["c"],"cierre":"y"}', 'manual');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Una cotización validada no cambia sus textos';
end $$;

-- ---------- Envío y seguimiento (0007) ----------
-- cot_a está validada (PDF v3)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare
  v_ok boolean := false;
begin
  begin
    perform public.registrar_envio(current_setting('test.cot_a')::uuid, 'email', 'compras@cliente.pe');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'El asesor B no debe registrar envíos ajenos';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare
  v_ok  boolean := false;
  v_cot uuid := current_setting('test.cot_a')::uuid;
begin
  begin
    perform public.registrar_envio(v_cot, 'fax', 'compras@cliente.pe');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'Debe rechazar un medio desconocido';

  v_ok := false;
  begin
    perform public.registrar_seguimiento(v_cot, 'Llamar mañana');
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'El seguimiento se registra después del envío';

  perform public.registrar_envio(v_cot, 'email', 'compras@agropacifico.pe', 'Enviado con copia a gerencia');
  assert (select estado from public.cotizaciones where id = v_cot) = 'enviada', 'Debe quedar enviada';
  assert (select envio_destinatario from public.cotizaciones where id = v_cot) = 'compras@agropacifico.pe';

  v_ok := false;
  begin
    perform public.registrar_respuesta(v_cot, false, null);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'El rechazo del cliente exige motivo';

  perform public.registrar_seguimiento(v_cot, 'Cliente revisará la propuesta el lunes');
  assert exists (select 1 from public.cotizacion_eventos where cotizacion_id = v_cot and accion = 'seguimiento');
end $$;

-- Vencimiento: se simula que la oferta se emitió hace 30 días
reset role;
update public.cotizaciones set fecha_emision = fecha_emision - 30 where id = current_setting('test.cot_a')::uuid;
set local role authenticated;

do $$
declare
  v_ok  boolean := false;
  v_cot uuid := current_setting('test.cot_a')::uuid;
begin
  assert public.actualizar_vencimientos() >= 1, 'Debe vencer al menos una cotización';
  assert (select estado from public.cotizaciones where id = v_cot) = 'vencida', 'La oferta vencida pasa a vencida';
  assert exists (select 1 from public.cotizacion_eventos where cotizacion_id = v_cot and accion = 'vencimiento_automatico');
  perform public.actualizar_vencimientos(); -- idempotente: repetir no falla ni duplica cambios
  assert (select count(*) from public.cotizacion_eventos where cotizacion_id = v_cot and accion = 'vencimiento_automatico') = 1,
    'El vencimiento no se registra dos veces';

  begin
    perform public.registrar_respuesta(v_cot, true);
  exception when raise_exception then v_ok := true;
  end;
  assert v_ok, 'No se registra respuesta de una oferta vencida';

  perform public.reabrir_cotizacion(v_cot, 'Actualizar oferta');
  assert (select estado from public.cotizaciones where id = v_cot) = 'borrador', 'Una oferta vencida se puede reabrir';
  assert (select enviada_en from public.cotizaciones where id = v_cot) is null, 'Reabrir limpia los datos del envío';
end $$;

-- Flujo completo: crear → PDF → validar → enviar → aceptar
do $$
begin
  perform set_config('test.cot_c', public.guardar_cotizacion(null,
    (select id from public.clientes where ruc = '20509876543'), 'Mantenimiento de bombas', 10, 0,
    jsonb_build_array(jsonb_build_object('producto_id', (select id from public.productos where codigo = 'SRV-MANT'), 'cantidad', 2)))::text, true);
end $$;

reset role;
insert into storage.objects (bucket_id, name) values ('cotizaciones-pdf', current_setting('test.cot_c') || '/v1.pdf');
set local role authenticated;

do $$
declare
  v_cot uuid := current_setting('test.cot_c')::uuid;
begin
  perform public.registrar_pdf(v_cot, 1);
  perform public.validar_cotizacion(v_cot);
  perform public.registrar_envio(v_cot, 'whatsapp', '+51 987 654 321');
  perform public.registrar_respuesta(v_cot, true, 'Orden de compra recibida');
  assert (select estado from public.cotizaciones where id = v_cot) = 'aceptada', 'Debe quedar aceptada';
  assert (select count(*) from public.cotizacion_eventos where cotizacion_id = v_cot and accion = 'cambio_estado') = 4,
    'Cada transición debe quedar auditada';

  -- Una cotización aceptada es definitiva
  begin
    perform public.reabrir_cotizacion(v_cot);
    assert false, 'Una cotización aceptada no se reabre';
  exception when raise_exception then null;
  end;
end $$;

-- ---------- Anónimo ----------
reset role;
set local role anon;
do $$
declare
  v_ok boolean := false;
begin
  begin
    perform 1 from public.clientes;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'Un usuario anónimo no debe leer clientes';
end $$;

reset role;
select 'OK: todas las verificaciones pasaron' as resultado;
rollback;
