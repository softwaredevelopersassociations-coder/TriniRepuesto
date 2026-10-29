import { useEffect, useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { uploadFile } from '@/lib/storage';
import type { Motorcycle } from '@/types';
import { Bike, Plus, Trash2, X, Loader2, Pencil, Upload, Image as ImageIcon, Globe2 } from 'lucide-react';

export default function MotorcyclesView() {
  const { profile } = useAuth();
  const [motos, setMotos] = useState<Motorcycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Motorcycle | null>(null);
  const [form, setForm] = useState({ brand: '', model: '', year: '', plate: '', mileage: '', image_url: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('motorcycles')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setMotos((data as Motorcycle[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const openAdd = () => {
    setEditing(null);
    setError(null);
    setForm({ brand: '', model: '', year: String(new Date().getFullYear()), plate: '', mileage: '', image_url: '' });
    setShowForm(true);
  };

  const openEdit = (m: Motorcycle) => {
    setEditing(m);
    setError(null);
    setForm({ brand: m.brand, model: m.model, year: String(m.year), plate: m.plate || '', mileage: String(m.mileage || 0), image_url: m.image_url || '' });
    setShowForm(true);
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!profile || !file) return;
    setUploadingPhoto(true);
    setError(null);
    const url = await uploadFile('motorcycle-photos', profile.id, file);
    if (url) setForm((previous) => ({ ...previous, image_url: url }));
    else setError('No se pudo subir la foto. Verifica el almacenamiento y vuelve a intentarlo.');
    setUploadingPhoto(false);
    e.target.value = '';
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const year = Number(form.year);
    const mileage = Number(form.mileage || 0);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) {
      setError('Ingresa un año válido para la motocicleta.');
      return;
    }
    if (!Number.isFinite(mileage) || mileage < 0) {
      setError('El kilometraje debe ser cero o mayor.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      user_id: profile.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      year,
      plate: form.plate || null,
      mileage,
      image_url: form.image_url || null,
    };

    const result = editing
      ? await supabase.from('motorcycles').update(payload).eq('id', editing.id)
      : await supabase.from('motorcycles').insert(payload);
    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowForm(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta motocicleta y todos sus registros de mantenimiento?')) return;
    await supabase.from('motorcycles').delete().eq('id', id);
    load();
  };

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
          <h1 className="text-2xl font-bold text-white mb-1">Mis motocicletas</h1>
          <p className="text-slate-400 text-sm">Registra y gestiona tus motos</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" />
          Agregar moto
        </button>
      </div>

      {motos.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <Bike className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">No tienes motocicletas registradas</p>
          <button onClick={openAdd} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Agregar mi primera moto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {motos.map((m) => (
            <div key={m.id} className="card p-5 hover:border-slate-700 transition group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-orange-500/10 rounded-lg flex items-center justify-center overflow-hidden">
                  {m.image_url ? <img src={m.image_url} alt={`${m.brand} ${m.model}`} className="w-full h-full object-cover" /> : <Bike className="w-6 h-6 text-orange-400" />}
                </div>
                <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${m.brand} ${m.model} ${m.year} motocicleta modelo repuestos compatibles`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Buscar ${m.brand} ${m.model} y sus repuestos en Internet`}
                    title="Buscar modelo y repuestos en Internet"
                    className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-800 rounded-lg transition"
                  >
                    <Globe2 className="w-4 h-4" />
                  </a>
                  <button onClick={() => openEdit(m)} className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(m.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-bold text-white">{m.brand} {m.model}</h3>
              <p className="text-sm text-slate-400 mb-3">{m.year}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:gap-4">
                {m.plate && <span className="badge bg-slate-800 text-slate-300">{m.plate}</span>}
                <span>{m.mileage.toLocaleString()} km</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <div className="card my-auto max-h-[90dvh] w-full max-w-md animate-fade-in overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editing ? 'Editar moto' : 'Nueva motocicleta'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label">Foto de la motocicleta (opcional)</label>
                <div className="flex items-center gap-3">
                  <div className="h-20 w-24 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 flex items-center justify-center">
                    {form.image_url ? <img src={form.image_url} alt="Vista previa de la motocicleta" className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7 text-slate-600" />}
                  </div>
                  <label className="btn-secondary cursor-pointer">
                    {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {form.image_url ? 'Cambiar foto' : 'Subir foto'}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                  </label>
                  {form.image_url && <button type="button" className="btn-ghost text-xs" onClick={() => setForm({ ...form, image_url: '' })}>Quitar</button>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Marca</label>
                  <input className="input" required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Honda" />
                </div>
                <div>
                  <label className="label">Modelo</label>
                  <input className="input" required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="CBR 600" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Año</label>
                  <input className="input" type="number" min="1900" max={new Date().getFullYear() + 1} required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                </div>
                <div>
                  <label className="label">Placa (opcional)</label>
                  <input className="input" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} placeholder="ABC-123" />
                </div>
              </div>
              <div>
                <label className="label">Kilometraje</label>
                <input className="input" type="number" min="0" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} placeholder="0" />
              </div>
              <button type="submit" disabled={saving || uploadingPhoto} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Guardar cambios' : 'Agregar moto'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
