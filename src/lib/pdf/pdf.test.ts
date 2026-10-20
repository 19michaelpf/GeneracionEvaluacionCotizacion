import { describe, expect, it } from 'vitest';
import type { DatosPdf } from './CotizacionPdf';
import { generarPdf } from './generar';
import { resolverTextos, sumarDias, textosPorDefecto } from './textos';

const textos = textosPorDefecto({ cliente: 'Agroindustrias del Pacífico S.A.C.', validezDias: 15, fechaVencimiento: '2026-11-03' });

const datos: DatosPdf = {
  empresa: { razon_social: 'Soluciones Industriales del Norte S.A.C.', ruc: '20123456789', direccion: 'Trujillo', telefono: null, email: null },
  numero: 'COT-2026-0001',
  version: 1,
  fechaEmision: '2026-10-19',
  validezDias: 15,
  fechaVencimiento: '2026-11-03',
  cliente: { razon_social: 'Agroindustrias del Pacífico S.A.C.', ruc: '20601234567', contacto: 'Carlos Ramírez', email: null, telefono: '044-201234', direccion: '' },
  asesor: { nombre: 'Asesor A', email: 'asesor@sin.pe' },
  solicitud: 'Equipamiento de estación de bombeo – válvulas y motor',
  items: [
    { orden: 1, descripcion: 'Válvula de bola 2" acero inoxidable', unidad: 'UND', cantidad: 3, precio_unitario: 385, descuento_pct: 5, importe: 1097.25 },
    { orden: 2, descripcion: 'Motor eléctrico trifásico 3 HP', unidad: 'UND', cantidad: 1.5, precio_unitario: 1450, descuento_pct: 10, importe: 1957.5 },
  ],
  totales: { subtotal: 3330, descuento_total: 336.35, descuento_global_pct: 2, base_imponible: 2993.65, igv_pct: 18, igv: 538.86, total: 3532.51 },
  textos,
};

describe('generarPdf', () => {
  it('genera un PDF válido', async () => {
    const pdf = await generarPdf(datos);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('genera varias páginas con muchos ítems', async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ ...datos.items[0], orden: i + 1 }));
    const pdf = await generarPdf({ ...datos, items });
    const texto = new TextDecoder('latin1').decode(pdf);
    expect((texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('textos del PDF', () => {
  it('suma días sin desfase de zona horaria, incluso cruzando meses y años', () => {
    expect(sumarDias('2026-10-19', 15)).toBe('2026-11-03');
    expect(sumarDias('2026-12-20', 15)).toBe('2027-01-04');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('usa la plantilla si los textos guardados no son válidos', () => {
    expect(resolverTextos(null, textos)).toBe(textos);
    expect(resolverTextos({ presentacion: 'x', condiciones: [], cierre: 'y' }, textos)).toBe(textos);
    const propios = { presentacion: 'Hola', condiciones: ['Pago a 30 días'], cierre: 'Saludos' };
    expect(resolverTextos(propios, textos)).toEqual(propios);
  });

  it('la plantilla incluye validez y fecha de vencimiento', () => {
    expect(textos.condiciones.join(' ')).toContain('15 días calendario (hasta el 03/11/2026)');
  });
});
