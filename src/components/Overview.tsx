import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/currency';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/lib/constants';
import type { Motorcycle, Part } from '@/types';
import { AlertCircle, Bike, Store } from 'lucide-react';

export default function Overview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { profile } = useAuth();
  const [motos, setMotos] = useState<Motorcycle[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const userId = profile.id;
    (async () => {
      const tasks: (() => Promise<void>)[] = [];

      if (profile.role === 'client') {
        tasks.push(async () => {
          const { data } = await supabase
            .from('motorcycles')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          setMotos((data as Motorcycle[]) || []);
        });
      }

      if (profile.role === 'seller') {
        tasks.push(async () => {
          const { data } = await supabase
            .from('parts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          setParts((data as Part[]) || []);
        });
      }

      await Promise.all(tasks.map((task) => task()));
      setLoading(false);
    })();
  }, [profile]);

  if (!profile) return null;

  const showClient = profile.role === 'client';
  const showSeller = profile.role === 'seller';
  const activeParts = parts.filter((part) => part.status === 'active' && part.stock > 0).length;
  const stats: { label: string; value: string; icon: typeof Bike; color: string }[] = [];

  if (showClient) {
    stats.push({ label: 'Mis motocicletas', value: String(motos.length), icon: Bike, color: 'text-orange-400' });
  }
  if (showSeller) {
    stats.push(
      { label: 'Repuestos publicados', value: String(parts.length), icon: Store, color: 'text-purple-400' },
      { label: 'Repuestos activos', value: String(activeParts), icon: AlertCircle, color: 'text-yellow-400' },
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 break-words text-xl font-bold text-white sm:text-2xl">
            Hola, {profile.full_name.split(' ')[0]}
          </h1>
          <p className="text-slate-400">
            Rol: <span className="font-medium text-orange-400">{ROLE_LABELS[profile.role]}</span>
          </p>
        </div>
        {showClient && motos.length === 0 && (
          <button onClick={() => onNavigate('motorcycles')} className="btn-primary shrink-0">
            <Bike className="h-4 w-4" /> Registrar mi primera moto
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="card p-4 transition hover:border-slate-700 sm:p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <Icon className={`h-7 w-7 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {showClient && (
              <section className="card min-w-0 p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Bike className="h-5 w-5 text-orange-400" />
                    <h2 className="text-lg font-semibold text-white">Mis motocicletas</h2>
                  </div>
                  <button
                    onClick={() => onNavigate('motorcycles')}
                    className="shrink-0 text-xs font-medium text-orange-400 hover:text-orange-300"
                  >
                    Ver todas
                  </button>
                </div>
                {motos.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="mb-4 text-sm text-slate-500">Registra tus motos para encontrar repuestos compatibles.</p>
                    <button onClick={() => onNavigate('motorcycles')} className="btn-primary mx-auto">
                      <Bike className="h-4 w-4" /> Registrar moto
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {motos.slice(0, 4).map((motorcycle) => (
                      <div key={motorcycle.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/50 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {motorcycle.brand} {motorcycle.model}
                          </p>
                          <p className="text-xs text-slate-500">{motorcycle.year}</p>
                        </div>
                        <span className="shrink-0 text-sm text-slate-400">
                          {motorcycle.mileage.toLocaleString()} km
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showSeller && (
              <section className="card min-w-0 p-4 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-cyan-400" />
                    <h2 className="text-lg font-semibold text-white">Mis repuestos recientes</h2>
                  </div>
                  <button
                    onClick={() => onNavigate('my-parts')}
                    className="shrink-0 text-xs font-medium text-orange-400 hover:text-orange-300"
                  >
                    Ver todos
                  </button>
                </div>
                {parts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">Aún no has publicado repuestos</p>
                ) : (
                  <div className="space-y-3">
                    {parts.slice(0, 4).map((part) => (
                      <div key={part.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/50 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">{part.title}</p>
                          <p className="text-xs text-slate-500">
                            {part.condition === 'new' ? 'Nuevo' : part.condition === 'used' ? 'Usado' : 'Reacondicionado'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-green-400">
                          {formatCurrency(part.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
