import Link from 'next/link';
import { requerirPerfil, ROLES_CATALOGO } from '@/lib/auth';
import { formatoMoneda } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { ProductoVigente } from '@/lib/types';

export default async function ProductosPage() {
  const perfil = await requerirPerfil();
  const puedeEditar = ROLES_CATALOGO.includes(perfil.rol);

  const supabase = await createClient();
  const { data: productos, error } = await supabase
    .from('productos_vigentes')
    .select('*')
    .order('codigo')
    .overrideTypes<ProductoVigente[], { merge: false }>();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Productos y tarifas</h1>
        {puedeEditar && <Link href="/productos/nuevo" className="btn btn-primary ml-auto">Nuevo producto</Link>}
      </div>
      {error && <p className="text-sm text-rose-600">No se pudo cargar el catálogo.</p>}
      <div className="card overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            <tr><th>Código</th><th>Producto</th><th>Unidad</th><th className="text-right">Precio vigente</th><th>Estado</th><th /></tr>
          </thead>
          <tbody>
            {productos?.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'text-slate-400'}>
                <td className="font-mono">{p.codigo}</td>
                <td>
                  {p.nombre}
                  {p.descripcion && <div className="text-xs text-slate-500">{p.descripcion}</div>}
                </td>
                <td>{p.unidad}</td>
                <td className="text-right">
                  {p.precio_vigente != null ? formatoMoneda(p.precio_vigente) : <span className="text-amber-700">Sin precio</span>}
                </td>
                <td>{p.activo ? 'Activo' : 'Inactivo'}</td>
                <td className="text-right">
                  {puedeEditar && <Link href={`/productos/${p.id}`} className="text-blue-700 hover:underline">Editar</Link>}
                </td>
              </tr>
            ))}
            {productos?.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-500">No hay productos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
