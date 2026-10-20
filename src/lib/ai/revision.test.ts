import { describe, expect, it } from 'vitest';
import { detectarCifras } from './revision';

describe('detectarCifras', () => {
  it('no marca textos sin cifras', () => {
    expect(
      detectarCifras([{ campo: 'Presentación', texto: 'Señores ACME S.A.C.: presentamos nuestra propuesta de válvulas de 2".' }]),
    ).toEqual([]);
  });

  it.each([
    ['monto en soles', 'El precio total es S/ 1,200.'],
    ['dólares', 'Equivale a 300 dólares.'],
    ['porcentaje', 'Incluye un 10 % adicional.'],
    ['por ciento', 'Aplicamos diez por ciento.'],
    ['descuento', 'Ofrecemos un descuento especial.'],
    ['cifras', 'Entrega en 15 días.'],
  ])('marca %s', (_caso, texto) => {
    const r = detectarCifras([{ campo: 'Cierre', texto }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^Cierre:/);
  });

  it('devuelve una advertencia por fragmento', () => {
    const r = detectarCifras([
      { campo: 'A', texto: 'sin cifras' },
      { campo: 'B', texto: 'S/ 10' },
      { campo: 'C', texto: '20 %' },
    ]);
    expect(r.map((x) => x.split(':')[0])).toEqual(['B', 'C']);
  });
});
