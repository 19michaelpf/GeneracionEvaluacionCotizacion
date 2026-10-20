import { notFound } from 'next/navigation';
import { requerirPerfil, ROLES_COTIZAN } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Cliente } from '@/lib/types';
import { ClienteForm } from '../ClienteForm';

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPerfil(ROLES_COTIZAN);
  const { id } = await params;

  const supabase = await createClient();
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle<Cliente>();
  if (!cliente) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar cliente</h1>
      <ClienteForm cliente={cliente} />
    </div>
  );
}
