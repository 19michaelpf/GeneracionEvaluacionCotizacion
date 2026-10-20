import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { ClienteForm } from '../ClienteForm';

export default async function NuevoClientePage() {
  await requerirPerfil(ROLES_COTIZAN);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo cliente</h1>
      <ClienteForm />
    </div>
  );
}
