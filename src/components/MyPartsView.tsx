import { useEffect, useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { uploadFile } from '@/lib/storage';
import type { Part, PartCategory, PartCondition, PartStatus } from '@/types';
import { PART_CATEGORIES, PART_CONDITIONS } from '@/lib/constants';
import { Store, Plus, Trash2, X, Loader2, Pencil, Package, DollarSign, Upload, ImageIcon, Search, Filter } from 'lucide-react';

export default function MyPartsView() {
  const { profile } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Part | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PartCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PartStatus | 'all'>('all');

  const emptyForm = {
    title: '',
    description: '',
    compatible_motorcycles: '',
    category: 'engine' as PartCategory,
    brand: '',
    condition: 'new' as PartCondition,
    price: '',
    stock: '1',
    image_url: '',
    status: 'active' as PartStatus,
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('parts')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setParts((data as Part[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const openAdd = () => {
    setEditing(null);
    setError(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (p: Part) => {
    setEditing(p);
    setError(null);
    setForm({
      title: p.title,
      description: p.description,
      compatible_motorcycles: p.compatible_motorcycles || '',
      category: p.category,
      brand: p.brand || '',
      condition: p.condition,
      price: String(p.price),
      stock: String(p.stock),
      image_url: p.image_url || '',
      status: p.status,
    });
    setShowForm(true);
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files || e.target.files.length === 0) return;
    setUploadingPhoto(true);
    setError(null);
    const url = await uploadFile('product-photos', profile.id, e.target.files[0]);
    if (url) setForm((prev) => ({ ...prev, image_url: url }));
    else setError('No se pudo subir la foto del repuesto. Vuelve a intentarlo.');
    setUploadingPhoto(false);
    e.target.value = '';
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!Number.isFinite(price) || price < 0) {
      setError('Ingresa un precio válido, igual o mayor que cero.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError('El stock debe ser un número entero igual o mayor que cero.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      user_id: profile.id,
      title: form.title.trim(),
      description: form.description.trim(),
      compatible_motorcycles: form.compatible_motorcycles.trim(),
      category: form.category,
      brand: form.brand || null,
      condition: form.condition,
      price,
      stock,
      image_url: form.image_url || null,
      status: form.status,
    };

    const result = editing
      ? await supabase.from('parts').update(payload).eq('id', editing.id)
      : await supabase.from('parts').insert(payload);
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
    if (!confirm('¿Eliminar este repuesto?')) return;
    await supabase.from('parts').delete().eq('id', id);
    load();
  };

  const statusBadge = (status: PartStatus) => {
    const map: Record<PartStatus, string> = {
      active: 'bg-green-500/10 text-green-400',
      sold: 'bg-slate-700 text-slate-400',
      inactive: 'bg-yellow-500/10 text-yellow-400',
    };
    const labels: Record<PartStatus, string> = { active: 'Activo', sold: 'Vendido', inactive: 'Inactivo' };
    return <span className={`badge ${map[status]}`}>{labels[status]}</span>;
  };

  const filteredParts = parts.filter((part) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [part.title, part.description, part.brand || '', part.compatible_motorcycles || '']
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesSearch && (categoryFilter === 'all' || part.category === categoryFilter) && (statusFilter === 'all' || part.status === statusFilter);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mis repuestos</h1>
          <p className="text-slate-400 text-sm">Gestiona tus publicaciones en el marketplace</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" />
          Publicar repuesto
        </button>
      </div>

      {parts.length === 0 ? (
        <div className="card p-12 text-center">
          <Store className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">No has publicado repuestos</p>
          <button onClick={openAdd} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Publicar mi primer repuesto
          </button>
        </div>
      ) : (
        <>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, marca o modelo..." />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <select className="input pl-10" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as PartCategory | 'all')}>
              <option value="all">Todas las categorías</option>
              {Object.entries(PART_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <select className="input" aria-label="Filtrar por estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PartStatus | 'all')}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="sold">Vendidos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
        {filteredParts.length === 0 ? (
          <div className="card p-10 text-center"><p className="text-sm text-slate-400">No hay repuestos que coincidan con la búsqueda y los filtros.</p></div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredParts.map((p) => (
            <div key={p.id} className="card overflow-hidden hover:border-slate-700 transition group">
              <div className="h-36 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-10 h-10 text-slate-600" />
                )}
                <div className="absolute top-2 left-2">{statusBadge(p.status)}</div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <button onClick={() => openEdit(p)} className="p-1.5 bg-slate-900/80 rounded-lg text-slate-300 hover:text-cyan-400 backdrop-blur">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(p.id)} className="p-1.5 bg-slate-900/80 rounded-lg text-slate-300 hover:text-red-400 backdrop-blur">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <span className="badge bg-cyan-500/10 text-cyan-400 mb-2">{PART_CATEGORIES[p.category]}</span>
                <h3 className="font-semibold text-white truncate">{p.title}</h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-green-400 flex items-center gap-0.5">
                    <DollarSign className="w-4 h-4" />
                    {p.price.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">Stock: {p.stock}</span>
                </div>
                {p.compatible_motorcycles && <p className="mt-2 truncate text-xs text-slate-500">Compatible: {p.compatible_motorcycles}</p>}
              </div>
            </div>
          ))}
        </div>
        )}
        </>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="card p-6 w-full max-w-md animate-fade-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editing ? 'Editar repuesto' : 'Publicar repuesto'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
            <form onSubmit={save} className="space-y-4">
              {/* Photo upload */}
              <div>
                <label className="label">Foto del producto</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {form.image_url ? (
                      <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="btn-secondary cursor-pointer">
                      {uploadingPhoto ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {form.image_url ? 'Cambiar foto' : 'Subir foto'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      />
                    </label>
                    {form.image_url && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, image_url: '' })}
                        className="btn-ghost ml-2 text-xs"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Título</label>
                <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Llanta delantera Pirelli" />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input min-h-[70px] resize-none" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Estado, compatibilidad, detalles..." />
              </div>
              <div>
                <label className="label">Compatible con (opcional)</label>
                <input className="input" value={form.compatible_motorcycles} onChange={(e) => setForm({ ...form, compatible_motorcycles: e.target.value })} placeholder="Honda CBR 600, Yamaha FZ 150" />
                <p className="mt-1 text-xs text-slate-500">Indica marca y modelo para que los motociclistas puedan filtrar repuestos compatibles.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Categoría</label>
                  <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PartCategory })}>
                    {Object.entries(PART_CATEGORIES).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Marca (opcional)</label>
                  <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Pirelli" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Condición</label>
                  <select className="input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as PartCondition })}>
                    {Object.entries(PART_CONDITIONS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PartStatus })}>
                    <option value="active">Activo</option>
                    <option value="sold">Vendido</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Precio ($)</label>
                  <input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="label">Stock</label>
                  <input className="input" type="number" min="0" step="1" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="1" />
                </div>
              </div>
              <button type="submit" disabled={saving || uploadingPhoto} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Guardar cambios' : 'Publicar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
