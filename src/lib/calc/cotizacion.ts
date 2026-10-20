// Cálculo de cotizaciones para la vista previa en la UI.
// La fuente de verdad es private.recalcular_cotizacion (supabase/migrations/0002_logic.sql);
// este módulo replica exactamente sus reglas de redondeo usando enteros (céntimos y
// centésimas de porcentaje) para evitar errores de punto flotante.

export interface LineaInput {
  cantidad: number;
  precioUnitario: number;
  descuentoPct: number;
}

export interface CotizacionInput {
  lineas: LineaInput[];
  descuentoGlobalPct: number;
  igvPct: number;
  umbralDescuentoPct: number;
}

export interface LineaResultado {
  importeBruto: number;
  descuentoMonto: number;
  importe: number;
  /** Descuento combinado de la línea (línea + global), en %. */
  descuentoEfectivoPct: number;
}

export interface CotizacionResultado {
  lineas: LineaResultado[];
  subtotal: number;
  descuentoTotal: number;
  baseImponible: number;
  igv: number;
  total: number;
  descuentoPctMax: number;
  requiereAprobacion: boolean;
}

/** Convierte un valor con hasta 2 decimales a un entero en centésimas. */
function aCentesimas(valor: number): bigint {
  return BigInt(Math.round(valor * 100));
}

/** División entera redondeando la mitad hacia arriba (valores no negativos, como round() de Postgres). */
function dividirRedondeando(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

function aMonto(centimos: bigint): number {
  return Number(centimos) / 100;
}

export function calcularCotizacion(input: CotizacionInput): CotizacionResultado {
  const g = aCentesimas(input.descuentoGlobalPct);
  const umbral = aCentesimas(input.umbralDescuentoPct);

  let subtotal = 0n;
  let descuentoLineas = 0n;
  let neto = 0n;
  // Descuento combinado expresado en millonésimas de punto porcentual: 1e8 - (1e4 - d)(1e4 - g)
  let maxCombinado = 0n;

  const lineas = input.lineas.map((linea) => {
    const cantidad = aCentesimas(linea.cantidad);
    const precio = aCentesimas(linea.precioUnitario);
    const d = aCentesimas(linea.descuentoPct);

    const bruto = dividirRedondeando(cantidad * precio, 100n);
    const descuento = dividirRedondeando(bruto * d, 10000n);
    const combinado = 100_000_000n - (10_000n - d) * (10_000n - g);

    subtotal += bruto;
    descuentoLineas += descuento;
    neto += bruto - descuento;
    if (combinado > maxCombinado) maxCombinado = combinado;

    return {
      importeBruto: aMonto(bruto),
      descuentoMonto: aMonto(descuento),
      importe: aMonto(bruto - descuento),
      descuentoEfectivoPct: Number(combinado) / 1_000_000,
    };
  });

  const descuentoTotal = descuentoLineas + dividirRedondeando(neto * g, 10000n);
  const base = subtotal - descuentoTotal;
  const igv = dividirRedondeando(base * aCentesimas(input.igvPct), 10000n);

  return {
    lineas,
    subtotal: aMonto(subtotal),
    descuentoTotal: aMonto(descuentoTotal),
    baseImponible: aMonto(base),
    igv: aMonto(igv),
    total: aMonto(base + igv),
    descuentoPctMax: Number(maxCombinado) / 1_000_000,
    requiereAprobacion: maxCombinado > umbral * 10_000n,
  };
}
