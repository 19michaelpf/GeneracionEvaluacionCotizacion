import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cliente, Cotizacion, CotizacionItem } from '@/lib/types';
import type { DatosPdf } from './CotizacionPdf';
import { resolverTextos, sumarDias, textosPorDefecto } from './textos';

type CotizacionPdfRow = Cotizacion & {
  textos_ia: unknown;
  pdf_version: number;
  clientes: Cliente;
  profiles: { nombre: string; email: string | null };
};

interface ParametrosEmpresa {
  empresa_razon_social: string;
  empresa_ruc: string | null;
  empresa_direccion: string | null;
  empresa_telefono: string | null;
  empresa_email: string | null;
}

export const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/**
 * Reúne los datos del PDF con la sesión del usuario (RLS). Todas las cifras vienen
 * de la BD; solo los textos libres pueden venir de textos_ia (validados).
 */
export async function cargarDatosPdf(supabase: SupabaseClient, cotizacionId: string) {
  const [{ data: cot }, { data: items }, { data: emp }] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*, clientes(*), profiles!cotizaciones_asesor_id_fkey(nombre, email)')
      .eq('id', cotizacionId)
      .maybeSingle<CotizacionPdfRow>(),
    supabase.from('cotizacion_items').select('*').eq('cotizacion_id', cotizacionId).order('orden')
      .overrideTypes<CotizacionItem[], { merge: false }>(),
    supabase
      .from('parametros')
      .select('empresa_razon_social, empresa_ruc, empresa_direccion, empresa_telefono, empresa_email')
      .single<ParametrosEmpresa>(),
  ]);
  if (!cot || !items || !emp) return null;

  const fechaEmision = hoyLima(); // registrar_pdf fija la misma fecha en la BD
  const fechaVencimiento = sumarDias(fechaEmision, cot.validez_dias);
  const textos = resolverTextos(
    cot.textos_ia,
    textosPorDefecto({ cliente: cot.clientes.razon_social, validezDias: cot.validez_dias, fechaVencimiento }),
  );

  const datos: DatosPdf = {
    empresa: {
      razon_social: emp.empresa_razon_social,
      ruc: emp.empresa_ruc,
      direccion: emp.empresa_direccion,
      telefono: emp.empresa_telefono,
      email: emp.empresa_email,
    },
    numero: cot.numero,
    version: cot.pdf_version + 1,
    fechaEmision,
    validezDias: cot.validez_dias,
    fechaVencimiento,
    cliente: cot.clientes,
    asesor: { nombre: cot.profiles.nombre, email: cot.profiles.email },
    solicitud: cot.solicitud,
    items: items.map((i) => ({
      orden: i.orden,
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario),
      descuento_pct: Number(i.descuento_pct),
      importe: Number(i.importe),
    })),
    totales: {
      subtotal: Number(cot.subtotal),
      descuento_total: Number(cot.descuento_total),
      descuento_global_pct: Number(cot.descuento_global_pct),
      base_imponible: Number(cot.base_imponible),
      igv_pct: Number(cot.igv_pct),
      igv: Number(cot.igv),
      total: Number(cot.total),
    },
    textos,
  };
  return { cot, datos };
}
