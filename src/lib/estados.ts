import type { Cotizacion, Perfil } from '@/lib/types';

export interface AccionesCotizacion {
  editar: boolean;
  solicitarAprobacion: boolean;
  resolverAprobacion: boolean;
  reabrir: boolean;
  generarPdf: boolean;
  validar: boolean;
  editarTextos: boolean;
  registrarEnvio: boolean;
  registrarRespuesta: boolean;
  registrarSeguimiento: boolean;
}

/**
 * Acciones que la UI ofrece según rol, propiedad y estado.
 * Refleja las reglas de las funciones RPC (0002/0004–0007), que son las que realmente las hacen cumplir.
 */
export function accionesDisponibles(
  cot: Pick<Cotizacion, 'estado' | 'asesor_id' | 'requiere_aprobacion'> & { pdf_desactualizado?: boolean },
  perfil: Pick<Perfil, 'id' | 'rol'>,
): AccionesCotizacion {
  const esResponsable = cot.asesor_id === perfil.id || perfil.rol === 'admin';
  const e = cot.estado;
  return {
    editar: esResponsable && e === 'borrador',
    solicitarAprobacion: esResponsable && e === 'borrador' && cot.requiere_aprobacion,
    resolverAprobacion: perfil.rol === 'finanzas' && e === 'pendiente_aprobacion',
    reabrir: esResponsable && ['pendiente_aprobacion', 'aprobada', 'generada', 'validada', 'enviada', 'vencida'].includes(e),
    generarPdf: esResponsable && ((e === 'borrador' && !cot.requiere_aprobacion) || e === 'aprobada' || e === 'generada'),
    validar: esResponsable && e === 'generada' && !cot.pdf_desactualizado,
    editarTextos: esResponsable && (e === 'borrador' || e === 'aprobada' || e === 'generada'),
    registrarEnvio: esResponsable && e === 'validada',
    registrarRespuesta: esResponsable && e === 'enviada',
    registrarSeguimiento: esResponsable && ['enviada', 'aceptada', 'rechazada_cliente', 'vencida'].includes(e),
  };
}
