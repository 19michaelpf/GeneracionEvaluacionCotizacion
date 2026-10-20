import { COLOR_ESTADO, ETIQUETA_ESTADO } from '@/lib/format';
import type { EstadoCotizacion } from '@/lib/types';

export function EstadoBadge({ estado }: { estado: EstadoCotizacion }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
