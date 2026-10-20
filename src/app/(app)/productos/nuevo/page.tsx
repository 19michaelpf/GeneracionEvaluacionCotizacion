import { requerirPerfil, ROLES_CATALOGO } from '@/lib/auth';
import { ProductoForm } from '../ProductoForm';

export default async function NuevoProductoPage() {
  await requerirPerfil(ROLES_CATALOGO);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo producto</h1>
      <ProductoForm />
    </div>
  );
}
