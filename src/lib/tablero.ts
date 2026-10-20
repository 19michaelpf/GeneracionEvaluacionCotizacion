import { sumarDias } from '@/lib/pdf/textos';
import type { EstadoCotizacion } from '@/lib/types';

export interface FilaTablero {
  id: string;
  numero: string;
  estado: EstadoCotizacion;
  total: number;
  fecha_emision: string;
  validez_dias: number;
  enviada_en: string | null;
  cliente: string;
}

export const ESTADOS_ORDEN: EstadoCotizacion[] = [
  'borrador', 'pendiente_aprobacion', 'aprobada', 'generada', 'validada', 'enviada', 'aceptada', 'rechazada_cliente', 'vencida',
];

/** Días que faltan para el vencimiento de la oferta (negativo si ya venció). */
export function diasParaVencer(fechaEmision: string, validezDias: number, hoy: string): number {
  const vence = Date.parse(sumarDias(fechaEmision, validezDias));
  return Math.round((vence - Date.parse(hoy.slice(0, 10))) / 86_400_000);
}

export function resumenTablero(filas: FilaTablero[], hoy: string, diasAlerta = 3) {
  const porEstado = Object.fromEntries(ESTADOS_ORDEN.map((e) => [e, { cantidad: 0, monto: 0 }])) as Record<
    EstadoCotizacion,
    { cantidad: number; monto: number }
  >;
  for (const f of filas) {
    porEstado[f.estado].cantidad += 1;
    porEstado[f.estado].monto = Math.round((porEstado[f.estado].monto + Number(f.total)) * 100) / 100;
  }

  const aceptadas = porEstado.aceptada.cantidad;
  const cerradas = aceptadas + porEstado.rechazada_cliente.cantidad + porEstado.vencida.cantidad;

  // Enviadas pendientes de respuesta, ordenadas por vencimiento más próximo
  const porVencer = filas
    .filter((f) => f.estado === 'enviada')
    .map((f) => ({ ...f, dias: diasParaVencer(f.fecha_emision, f.validez_dias, hoy) }))
    .filter((f) => f.dias <= diasAlerta)
    .sort((a, b) => a.dias - b.dias);

  return {
    porEstado,
    total: filas.length,
    // Tasa de cierre: aceptadas sobre cotizaciones con resultado (aceptadas, rechazadas o vencidas)
    tasaCierrePct: cerradas > 0 ? Math.round((aceptadas / cerradas) * 1000) / 10 : null,
    montoEnNegociacion: porEstado.enviada.monto,
    montoAceptado: porEstado.aceptada.monto,
    porVencer,
  };
}
