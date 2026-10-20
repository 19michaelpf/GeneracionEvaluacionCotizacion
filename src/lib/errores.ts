import type { PostgrestError } from '@supabase/supabase-js';

/** Traduce errores de PostgREST/Postgres a mensajes para el usuario sin exponer detalles internos. */
export function mensajeErrorBD(error: PostgrestError): string {
  switch (error.code) {
    case '23505':
      return 'Ya existe un registro con ese valor (código o RUC duplicado).';
    case '23503':
      return 'El registro está relacionado con otros datos y no se puede eliminar o referenciar.';
    case '42501':
      return error.message.startsWith('permission denied') || error.message.includes('row-level security')
        ? 'No tiene permisos para realizar esta acción.'
        : error.message;
    case 'P0001': // raise exception de las funciones de negocio: mensajes ya redactados en español
      return error.message;
    default:
      console.error('Error de base de datos', error);
      return 'No se pudo completar la operación. Intente nuevamente.';
  }
}
