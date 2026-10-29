import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Motorcycle, MaintenanceRecord, MaintenanceType } from '@/types';
import { MAINTENANCE_TYPES } from '@/lib/constants';
import { Wrench, Plus, Trash2, X, Loader2, Calendar, DollarSign, Gauge } from 'lucide-react';

export default function MaintenanceView() {
  const { profile } = useAuth();
  const [motos, setMotos] = useState<Motorcycle[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterMoto, setFilterMoto] = useState<string>('all');

  const [form, setForm] = useState({
    motorcycle_id: '',
    type: 'oil_change' as MaintenanceType,
    description: '',
    cost: '',
    mileage_at_service: '',
    service_date: new Date().toISOString().slice(0, 10),
    next_service_mileage: '',
    next_service_date: '',
  });

  const load = async () => {
    if (!profile) return;
    const [{ data: motoData }, { data: recData }] = await Promise.all([
      supabase.from('motorcycles').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('maintenance_records').select('*').eq('user_id', profile.id).order('service_date', { ascending: false }),
    ]);
    setMotos((motoData as Motorcycle[]) || []);
    setRecords((recData as MaintenanceRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const openForm = () => {
    setError(null);
    setForm({
      motorcycle_id: motos[0]?.id || '',
      type: 'oil_change',
      description: '',
      cost: '',
      mileage_at_service: '',
      service_date: new Date().toISOString().slice(0, 10),
      next_service_mileage: '',
      next_service_date: '',
    });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form.motorcycle_id) return;
    const mileageAtService = form.mileage_at_service ? Number(form.mileage_at_service) : null;
    const cost = form.cost ? Number(form.cost) : null;
    const nextServiceMileage = form.next_service_mileage ? Number(form.next_service_mileage) : null;
    if ((mileageAtService != null && (!Number.isInteger(mileageAtService) || mileageAtService < 0)) ||
      (nextServiceMileage != null && (!Number.isInteger(nextServiceMileage) || nextServiceMileage < 0)) ||
      (cost != null && (!Number.isFinite(cost) || cost < 0))) {
      setError('Revisa que el costo y los kilometrajes sean valores válidos.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('maintenance_records').insert({
      user_id: profile.id,
      motorcycle_id: form.motorcycle_id,
      type: form.type,
      description: form.description.trim(),
      cost,
      mileage_at_service: mileageAtService,
      service_date: form.service_date,
      next_service_mileage: nextServiceMileage,
      next_service_date: form.next_service_date || null,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    const motorcycle = motos.find((m) => m.id === form.motorcycle_id);
    if (motorcycle && mileageAtService != null && mileageAtService > motorcycle.mileage) {
      const { error: mileageError } = await supabase.from('motorcycles').update({ mileage: mileageAtService }).eq('id', motorcycle.id);
      if (mileageError) setError(`El mantenimiento se guardó, pero no se pudo actualizar el kilometraje de la moto: ${mileageError.message}`);
    }

    setSaving(false);
    setShowForm(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este registro de mantenimiento?')) return;
    await supabase.from('maintenance_records').delete().eq('id', id);
    load();
  };

  const motoName = (id: string) => {
    const m = motos.find((x) => x.id === id);
    return m ? `${m.brand} ${m.model}` : 'Moto eliminada';
  };

  const filtered = filterMoto === 'all' ? records : records.filter((r) => r.motorcycle_id === filterMoto);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mantenimiento</h1>
          <p className="text-slate-400 text-sm">Historial de servicios de tus motos</p>
        </div>
        <button onClick={openForm} disabled={motos.length === 0} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nuevo registro
        </button>
      </div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      {motos.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Primero registra una motocicleta para agregar mantenimiento</p>
        </div>
      ) : (
        <>
          {/* Filter */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterMoto('all')}
              className={`badge px-3 py-1.5 whitespace-nowrap transition ${
                filterMoto === 'all' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas
            </button>
            {motos.map((m) => (
              <button
                key={m.id}
                onClick={() => setFilterMoto(m.id)}
                className={`badge px-3 py-1.5 whitespace-nowrap transition ${
                  filterMoto === m.id ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.brand} {m.model}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No hay registros de mantenimiento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => {
                const motorcycle = motos.find((m) => m.id === r.motorcycle_id);
                const mileageDue = r.next_service_mileage != null && motorcycle && motorcycle.mileage >= r.next_service_mileage;
                return (
                <div key={r.id} className="card group p-4 transition hover:border-slate-700 sm:p-5">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="badge bg-orange-500/10 text-orange-400">
                          {MAINTENANCE_TYPES[r.type].label}
                        </span>
                        <span className="text-xs text-slate-500">{motoName(r.motorcycle_id)}</span>
                      </div>
                      <p className="text-sm text-slate-200 mb-3">{r.description}</p>
                      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(r.service_date).toLocaleDateString('es-CO')}
                        </span>
                        {r.mileage_at_service != null && (
                          <span className="flex items-center gap-1">
                            <Gauge className="w-3.5 h-3.5" />
                            {r.mileage_at_service.toLocaleString()} km
                          </span>
                        )}
                        {r.cost != null && (
                          <span className="flex items-center gap-1 text-green-400">
                            <DollarSign className="w-3.5 h-3.5" />
                            {r.cost.toLocaleString()}
                          </span>
                        )}
                        {r.next_service_date && (
                          <span className={`flex items-center gap-1 ${new Date(`${r.next_service_date}T00:00:00`) <= new Date() ? 'text-red-400' : 'text-cyan-400'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            Próximo: {new Date(`${r.next_service_date}T00:00:00`).toLocaleDateString('es-BO')}
                          </span>
                        )}
                        {r.next_service_mileage != null && (
                          <span className={`flex items-center gap-1 ${mileageDue ? 'text-red-400' : 'text-cyan-400'}`}>
                            <Gauge className="w-3.5 h-3.5" />
                            Próximo: {r.next_service_mileage.toLocaleString()} km{mileageDue ? ' · pendiente' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(r.id)}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <div className="card my-auto max-h-[90dvh] w-full max-w-md animate-fade-in overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Nuevo mantenimiento</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label">Motocicleta</label>
                <select className="input" required value={form.motorcycle_id} onChange={(e) => setForm({ ...form, motorcycle_id: e.target.value })}>
                  {motos.map((m) => (
                    <option key={m.id} value={m.id}>{m.brand} {m.model} ({m.year})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tipo de servicio</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MaintenanceType })}>
                  {Object.entries(MAINTENANCE_TYPES).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input min-h-[80px] resize-none" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalle del servicio realizado..." />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Costo ($)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="label">Km en el servicio</label>
                  <input className="input" type="number" min="0" value={form.mileage_at_service} onChange={(e) => setForm({ ...form, mileage_at_service: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="label">Fecha del servicio</label>
                <input className="input" type="date" required value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Próx. servicio (km)</label>
                  <input className="input" type="number" min="0" value={form.next_service_mileage} onChange={(e) => setForm({ ...form, next_service_mileage: e.target.value })} placeholder="Opcional" />
                </div>
                <div>
                  <label className="label">Próx. servicio (fecha)</label>
                  <input className="input" type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar registro'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
