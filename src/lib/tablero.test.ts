import { describe, expect, it } from 'vitest';
import { diasParaVencer, resumenTablero, type FilaTablero } from './tablero';

const fila = (estado: FilaTablero['estado'], total: number, fecha_emision = '2026-10-10', validez_dias = 15): FilaTablero => ({
  id: `${estado}-${total}`,
  numero: 'COT',
  estado,
  total,
  fecha_emision,
  validez_dias,
  enviada_en: null,
  cliente: 'X',
});

describe('diasParaVencer', () => {
  it('cuenta días hasta el vencimiento', () => {
    expect(diasParaVencer('2026-10-10', 15, '2026-10-19')).toBe(6);
    expect(diasParaVencer('2026-10-10', 15, '2026-10-25')).toBe(0);
    expect(diasParaVencer('2026-10-10', 15, '2026-10-27')).toBe(-2);
  });
});

describe('resumenTablero', () => {
  it('agrupa cantidades y montos por estado sin errores de redondeo', () => {
    const r = resumenTablero([fila('enviada', 0.1), fila('enviada', 0.2), fila('aceptada', 1000)], '2026-10-19');
    expect(r.porEstado.enviada).toEqual({ cantidad: 2, monto: 0.3 });
    expect(r.montoEnNegociacion).toBe(0.3);
    expect(r.montoAceptado).toBe(1000);
    expect(r.total).toBe(3);
  });

  it('calcula la tasa de cierre sobre cotizaciones con resultado', () => {
    const r = resumenTablero(
      [fila('aceptada', 1), fila('aceptada', 1), fila('rechazada_cliente', 1), fila('vencida', 1), fila('enviada', 1), fila('borrador', 1)],
      '2026-10-19',
    );
    expect(r.tasaCierrePct).toBe(50);
  });

  it('sin resultados la tasa es null', () => {
    expect(resumenTablero([fila('enviada', 1)], '2026-10-19').tasaCierrePct).toBeNull();
  });

  it('lista las enviadas próximas a vencer, la más urgente primero', () => {
    const r = resumenTablero(
      [
        fila('enviada', 1, '2026-10-10', 15), // vence en 6 días: no alerta
        fila('enviada', 2, '2026-10-05', 15), // 1 día
        fila('enviada', 3, '2026-10-04', 15), // 0 días
        fila('validada', 4, '2026-10-04', 15), // no enviada: no alerta
      ],
      '2026-10-19',
    );
    expect(r.porVencer.map((f) => [f.total, f.dias])).toEqual([[3, 0], [2, 1]]);
  });
});
