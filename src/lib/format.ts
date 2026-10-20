import type { EstadoCotizacion } from '@/lib/types';

const moneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const numero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

export const formatoMoneda = (v: number | string) => moneda.format(Number(v));
export const formatoNumero = (v: number | string) => numero.format(Number(v));
export const formatoPct = (v: number | string) => `${numero.format(Number(v))} %`;

export function formatoFecha(v: string) {
  // Fechas 'AAAA-MM-DD' sin zona horaria: evitar el desfase al convertir a Date
  const [a, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function formatoFechaHora(v: string) {
  return new Date(v).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
}

export const ETIQUETA_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobada: 'Aprobada',
  generada: 'Generada',
  validada: 'Validada',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada_cliente: 'Rechazada por cliente',
  vencida: 'Vencida',
};

export const COLOR_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: 'bg-slate-100 text-slate-700',
  pendiente_aprobacion: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  generada: 'bg-sky-100 text-sky-800',
  validada: 'bg-indigo-100 text-indigo-800',
  enviada: 'bg-violet-100 text-violet-800',
  aceptada: 'bg-green-100 text-green-800',
  rechazada_cliente: 'bg-rose-100 text-rose-800',
  vencida: 'bg-zinc-200 text-zinc-700',
};
