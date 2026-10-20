import { describe, expect, it } from 'vitest';
import { clienteSchema, cotizacionSchema, erroresPorCampo } from './schemas';

const uuid = '3f8a3c3e-6f0a-4c5e-9a1b-2b6c7d8e9f01';

describe('clienteSchema', () => {
  it('acepta un cliente válido y normaliza vacíos a null', () => {
    const r = clienteSchema.parse({ ruc: '20601234567', razon_social: ' ACME S.A.C. ', email: '', contacto: '' });
    expect(r).toMatchObject({ ruc: '20601234567', razon_social: 'ACME S.A.C.', email: null, contacto: null });
  });

  it('rechaza RUC inválido y correo mal formado', () => {
    const r = clienteSchema.safeParse({ ruc: '123', razon_social: 'X S.A.', email: 'no-es-correo' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = erroresPorCampo(r.error);
      expect(e.ruc).toMatch(/11 dígitos/);
      expect(e.email).toMatch(/Correo/);
    }
  });
});

describe('cotizacionSchema', () => {
  const valida = {
    id: null,
    cliente_id: uuid,
    solicitud: 'Cotizar bombas para planta',
    validez_dias: 15,
    descuento_global_pct: 0,
    items: [{ producto_id: uuid, cantidad: 2, descuento_pct: 5 }],
  };

  it('acepta una cotización válida', () => {
    expect(cotizacionSchema.safeParse(valida).success).toBe(true);
  });

  it('rechaza cantidades no positivas, más de 2 decimales y descuentos fuera de rango', () => {
    const r = cotizacionSchema.safeParse({
      ...valida,
      descuento_global_pct: 100.5,
      items: [
        { producto_id: uuid, cantidad: 0, descuento_pct: 0 },
        { producto_id: uuid, cantidad: 1.234, descuento_pct: -1 },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = erroresPorCampo(r.error);
      expect(Object.keys(e)).toEqual(
        expect.arrayContaining(['descuento_global_pct', 'items.0.cantidad', 'items.1.cantidad', 'items.1.descuento_pct']),
      );
    }
  });

  it('exige al menos un ítem', () => {
    const r = cotizacionSchema.safeParse({ ...valida, items: [] });
    expect(r.success).toBe(false);
  });

  it('ignora un precio enviado por el cliente', () => {
    const r = cotizacionSchema.parse({ ...valida, items: [{ ...valida.items[0], precio_unitario: 0.01 }] });
    expect(r.items[0]).not.toHaveProperty('precio_unitario');
  });
});
