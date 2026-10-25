import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { MAINTENANCE_TYPES, ROLE_LABELS } from '@/lib/constants';
import type { Motorcycle, MaintenanceRecord, Part } from '@/types';
import { Bike, Wrench, Store, AlertCircle, TrendingUp, Calendar } from 'lucide-react';

export default function Overview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { profile } = useAuth();
  const [motos, setMotos] = useState<Motorcycle[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const userId = profile.id;
    (async () => {
      const showMechanic = profile.role === 'mechanic' || profile.role === 'both';
      const showSeller = profile.role === 'seller' || profile.role === 'both';

      const tasks: (() => Promise<void>)[] = [];

      if (showMechanic) {
        tasks.push(async () => {
          const { data } = await supabase.from('motorcycles').select('*').eq('user_id', userId).order('created_at', { ascending: false });
          setMotos((data as Motorcycle[]) || []);
        });
        tasks.push(async () => {
          const { data } = await supabase.from('maintenance_records').select('*').eq('user_id', userId).order('service_date', { ascending: false });
          setRecords((data as MaintenanceRecord[]) || []);
        });
      }

      if (showSeller) {
        tasks.push(async () => {
          const { data } = await supabase.from('parts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
          setParts((data as Part[]) || []);
        });
      }

      await Promise.all(tasks.map((t) => t()));
      setLoading(false);
    })();
  }, [profile]);

  if (!profile) return null;

  const showMechanic = profile.role === 'mechanic' || profile.role === 'both';
  const showSeller = profile.role === 'seller' || profile.role === 'both';

  const totalMaintenanceCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
  const activeParts = parts.filter((p) => p.status === 'active' && p.stock > 0).length;
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soonDate = new Date(todayDate);
  soonDate.setDate(soonDate.getDate() + 30);
  const mostRecentByService = new Map<string, MaintenanceRecord>();
  records.forEach((record) => {
    const key = `${record.motorcycle_id}:${record.type}`;
    const existing = mostRecentByService.get(key);
    if (!existing || record.service_date > existing.service_date) mostRecentByService.set(key, record);
  });
  const serviceSuggestions = [...mostRecentByService.values()].flatMap((record) => {
    const motorcycle = motos.find((m) => m.id === record.motorcycle_id);
    const date = record.next_service_date ? new Date(`${record.next_service_date}T00:00:00`) : null;
    const remainingKm = record.next_service_mileage != null && motorcycle
      ? record.next_service_mileage - motorcycle.mileage
      : null;
    const overdue = Boolean((date && date <= todayDate) || (remainingKm != null && remainingKm <= 0));
    const dueSoon = Boolean(
      (date && date > todayDate && date <= soonDate) ||
      (remainingKm != null && remainingKm > 0 && remainingKm <= 500),
    );
    return overdue || dueSoon ? [{ record, motorcycle, overdue, remainingKm }] : [];
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue));

  const stats: { label: string; value: string; icon: typeof Bike; color: string }[] = [];

  if (showMechanic) {
    stats.push(
      { label: 'Mis motocicletas', value: String(motos.length), icon: Bike, color: 'text-orange-400' },
      { label: 'Registros de mantenimiento', value: String(records.length), icon: Wrench, color: 'text-cyan-400' },
      { label: 'Gasto total en mantenimiento', value: `$${totalMaintenanceCost.toLocaleString()}`, icon: TrendingUp, color: 'text-green-400' },
    );
  }
  if (showSeller) {
    stats.push({ label: 'Repuestos publicados', value: String(parts.length), icon: Store, color: 'text-purple-400' });
    stats.push({ label: 'Repuestos activos', value: String(activeParts), icon: AlertCircle, color: 'text-yellow-400' });
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Hola, {profile.full_name.split(' ')[0]}</h1>
        <p className="text-slate-400">
          Rol: <span className="text-orange-400 font-medium">{ROLE_LABELS[profile.role]}</span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="card p-5 hover:border-slate-700 transition">
                  <div className="flex items-start justify-between mb-3">
                    <Icon className={`w-7 h-7 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-slate-400 mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Maintenance suggestions based on user-entered next service targets */}
            {showMechanic && (
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <h2 className="text-lg font-semibold text-white">Sugerencias de mantenimiento</h2>
                </div>
                {serviceSuggestions.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No hay servicios próximos. Al registrar un mantenimiento, indica la fecha o kilometraje para la siguiente revisión.</p>
                ) : (
                  <div className="space-y-3">
                    {serviceSuggestions.slice(0, 5).map(({ record, motorcycle, overdue, remainingKm }) => (
                        <div key={record.id} className="flex items-center justify-between gap-3 bg-slate-800/50 rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium text-slate-200">{MAINTENANCE_TYPES[record.type].label}</p>
                            <p className="text-xs text-slate-500">{motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'Moto'} · {record.description}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
                              {record.next_service_date && <span>Fecha: {new Date(`${record.next_service_date}T00:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}</span>}
                              {record.next_service_mileage != null && <span>{remainingKm != null && remainingKm > 0 ? `En ${remainingKm.toLocaleString()} km` : `Km objetivo: ${record.next_service_mileage.toLocaleString()}`}</span>}
                            </div>
                          </div>
                          <span className={`badge shrink-0 ${overdue ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400'}`}>
                            {overdue ? 'Revisión pendiente' : 'Próxima revisión'}
                          </span>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent parts */}
            {showSeller && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Store className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-lg font-semibold text-white">Mis repuestos recientes</h2>
                  </div>
                  <button
                    onClick={() => onNavigate('my-parts')}
                    className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                  >
                    Ver todos
                  </button>
                </div>
                {parts.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">Aún no has publicado repuestos</p>
                ) : (
                  <div className="space-y-3">
                    {parts.slice(0, 4).map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-slate-200">{p.title}</p>
                          <p className="text-xs text-slate-500">{p.condition === 'new' ? 'Nuevo' : p.condition === 'used' ? 'Usado' : 'Reacondicionado'}</p>
                        </div>
                        <span className="text-sm font-semibold text-green-400">${p.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent maintenance */}
            {showMechanic && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-lg font-semibold text-white">Mantenimientos recientes</h2>
                  </div>
                  <button
                    onClick={() => onNavigate('maintenance')}
                    className="text-xs text-orange-400 hover:text-orange-300 font-medium"
                  >
                    Ver todos
                  </button>
                </div>
                {records.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">No hay registros de mantenimiento</p>
                ) : (
                  <div className="space-y-3">
                    {records.slice(0, 4).map((r) => {
                      const moto = motos.find((m) => m.id === r.motorcycle_id);
                      return (
                        <div key={r.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium text-slate-200">{r.description}</p>
                            <p className="text-xs text-slate-500">
                              {moto ? `${moto.brand} ${moto.model}` : ''} ·{' '}
                              {new Date(r.service_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          {r.cost != null && (
                            <span className="text-sm font-semibold text-green-400">${r.cost.toLocaleString()}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
