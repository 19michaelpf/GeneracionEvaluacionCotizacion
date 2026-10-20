import { describe, expect, it } from 'vitest';
import { calcularCotizacion, type CotizacionInput } from './cotizacion';

const base: Omit<CotizacionInput, 'lineas' | 'descuentoGlobalPct'> = {
  igvPct: 18,
  umbralDescuentoPct: 15,
};

describe('calcularCotizacion', () => {
  it('calcula subtotales, descuentos, IGV y total (mismo caso que supabase/tests/rls_checks.sql)', () => {
    const r = calcularCotizacion({
      ...base,
      descuentoGlobalPct: 2,
      lineas: [
        { cantidad: 3, precioUnitario: 385, descuentoPct: 5 },
        { cantidad: 1.5, precioUnitario: 1450, descuentoPct: 10 },
      ],
    });
    expect(r.lineas[0]).toMatchObject({ importeBruto: 1155, descuentoMonto: 57.75, importe: 1097.25 });
    expect(r.lineas[1]).toMatchObject({ importeBruto: 2175, descuentoMonto: 217.5, importe: 1957.5 });
    expect(r.subtotal).toBe(3330);
    expect(r.descuentoTotal).toBe(336.35); // 275.25 + round(3054.75 × 2 %) = 61.10
    expect(r.baseImponible).toBe(2993.65);
    expect(r.igv).toBe(538.86); // 538.857 → 538.86
    expect(r.total).toBe(3532.51);
    expect(r.descuentoPctMax).toBe(11.8);
    expect(r.requiereAprobacion).toBe(false);
  });

  it('redondea la mitad hacia arriba como Postgres', () => {
    // 0.5 × 0.01 = 0.005 → 0.01
    const r = calcularCotizacion({ ...base, igvPct: 0, descuentoGlobalPct: 0, lineas: [{ cantidad: 0.5, precioUnitario: 0.01, descuentoPct: 0 }] });
    expect(r.subtotal).toBe(0.01);
  });

  it('evita errores de punto flotante', () => {
    // 0.1 + 0.2 en flotante no es 0.3
    const r = calcularCotizacion({
      ...base,
      igvPct: 0,
      descuentoGlobalPct: 0,
      lineas: [
        { cantidad: 1, precioUnitario: 0.1, descuentoPct: 0 },
        { cantidad: 1, precioUnitario: 0.2, descuentoPct: 0 },
      ],
    });
    expect(r.total).toBe(0.3);
  });

  it('15 % exacto no requiere aprobación', () => {
    const r = calcularCotizacion({ ...base, descuentoGlobalPct: 0, lineas: [{ cantidad: 1, precioUnitario: 850, descuentoPct: 15 }] });
    expect(r.descuentoPctMax).toBe(15);
    expect(r.requiereAprobacion).toBe(false);
  });

  it('15.01 % requiere aprobación', () => {
    const r = calcularCotizacion({ ...base, descuentoGlobalPct: 0, lineas: [{ cantidad: 1, precioUnitario: 850, descuentoPct: 15.01 }] });
    expect(r.requiereAprobacion).toBe(true);
  });

  it('combina descuento de línea y global: 10 % + 6 % = 15.4 %', () => {
    const r = calcularCotizacion({ ...base, descuentoGlobalPct: 6, lineas: [{ cantidad: 1, precioUnitario: 850, descuentoPct: 10 }] });
    expect(r.descuentoPctMax).toBe(15.4);
    expect(r.requiereAprobacion).toBe(true);
  });

  it('solo un descuento global del 15 % no requiere aprobación', () => {
    const r = calcularCotizacion({ ...base, descuentoGlobalPct: 15, lineas: [{ cantidad: 2, precioUnitario: 100, descuentoPct: 0 }] });
    expect(r.requiereAprobacion).toBe(false);
    expect(r.descuentoTotal).toBe(30);
  });

  it('devuelve ceros sin líneas', () => {
    const r = calcularCotizacion({ ...base, descuentoGlobalPct: 50, lineas: [] });
    expect(r).toMatchObject({ subtotal: 0, total: 0, descuentoPctMax: 0, requiereAprobacion: false });
  });
});
