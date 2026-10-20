import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { CotizacionForm } from '../CotizacionForm';
import { cargarDatosFormulario } from '../datos';

export default async function NuevaCotizacionPage() {
  await requerirPerfil(ROLES_COTIZAN);
  const datos = await cargarDatosFormulario();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nueva cotización</h1>
      <CotizacionForm {...datos} />
    </div>
  );
}
