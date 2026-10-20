-- =============================================================
-- Datos de ejemplo (ejecutar después de las migraciones)
-- Los usuarios se crean en Supabase > Authentication > Users.
-- Luego asigne roles, por ejemplo:
--   update public.profiles set rol = 'admin'    where email = 'admin@empresa.pe';
--   update public.profiles set rol = 'finanzas' where email = 'finanzas@empresa.pe';
-- =============================================================

insert into public.productos (codigo, nombre, descripcion, unidad) values
  ('VAL-BOL-2',  'Válvula de bola 2" acero inoxidable',  'Válvula de bola paso completo, AISI 316, 1000 WOG', 'UND'),
  ('MOT-3HP',    'Motor eléctrico trifásico 3 HP',        'Motor 220/440 V, 1750 RPM, IE3',                   'UND'),
  ('BOM-CEN-5',  'Bomba centrífuga 5 HP',                 'Bomba para agua limpia, impulsor de bronce',       'UND'),
  ('TUB-AC-4',   'Tubería de acero al carbono 4" SCH40',  'Tramo de 6 m, ASTM A53',                           'TRAMO'),
  ('SRV-MANT',   'Servicio de mantenimiento preventivo',  'Mantenimiento preventivo de equipos de bombeo',    'SERV'),
  ('TAB-ELE-01', 'Tablero eléctrico de control',          'Tablero con arrancador y protecciones',            'UND')
on conflict (codigo) do nothing;

insert into public.tarifas (producto_id, precio, vigente_desde)
select p.id, v.precio, date '2026-01-01'
from (values
  ('VAL-BOL-2',   385.00),
  ('MOT-3HP',    1450.00),
  ('BOM-CEN-5',  3290.00),
  ('TUB-AC-4',    612.50),
  ('SRV-MANT',    850.00),
  ('TAB-ELE-01', 4780.00)
) as v(codigo, precio)
join public.productos p on p.codigo = v.codigo
where not exists (select 1 from public.tarifas t where t.producto_id = p.id);

insert into public.clientes (ruc, razon_social, contacto, email, telefono, direccion) values
  ('20601234567', 'Agroindustrias del Pacífico S.A.C.', 'Carlos Ramírez', 'compras@agropacifico.pe', '044-201234', 'Av. Industrial 450, Trujillo'),
  ('20509876543', 'Minera Los Andes S.A.',               'Lucía Torres',   'logistica@mlandes.pe',    '076-345678', 'Jr. Las Minas 120, Cajamarca')
on conflict (ruc) do nothing;
