import { useEffect, useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { uploadFile } from '@/lib/storage';
import type { Part, PartCategory, PartCondition, PartStatus } from '@/types';
import { PART_CATEGORIES, PART_CONDITIONS } from '@/lib/constants';
import { Store, Plus, Trash2, X, Loader2, Pencil, Package, DollarSign, Upload, ImageIcon, Search, Filter, Boxes, Eye, EyeOff, TriangleAlert } from 'lucide-react';

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
    sku: '',
    title: '',
    description: '',
    compatible_motorcycles: '',
    category: 'engine' as PartCategory,
    brand: '',
    condition: 'new' as PartCondition,
    purchase_cost: '0',
    price: '',
    stock: '1',
    minimum_stock: '0',
    image_url: '',
    status: 'inactive' as PartStatus,
  };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    if (!profile) return;
    const [partsResult, inventoryResult] = await Promise.all([
      supabase.from('parts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('part_inventory').select('part_id,sku,purchase_cost,minimum_stock').eq('user_id', profile.id),
    ]);
    if (inventoryResult.error) {
      setError(inventoryResult.error.code === '42P01'
        ? 'Falta la tabla privada de inventario. Aplica la migración 20261031010000_add_inventory_fields.sql.'
        : inventoryResult.error.message);
    }
    const inventoryByPart = new Map((inventoryResult.data || []).map((entry) => [entry.part_id, entry]));
    setParts(((partsResult.data as Part[]) || []).map((part) => {
      const inventory = inventoryByPart.get(part.id);
      return {
        ...part,
        sku: inventory?.sku ?? null,
        purchase_cost: inventory?.purchase_cost ?? 0,
        minimum_stock: inventory?.minimum_stock ?? 0,
      };
    }));
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
      sku: p.sku || '',
      title: p.title,
      description: p.description,
      compatible_motorcycles: p.compatible_motorcycles || '',
      category: p.category,
      brand: p.brand || '',
      condition: p.condition,
      purchase_cost: String(p.purchase_cost || 0),
      price: String(p.price),
      stock: String(p.stock),
      minimum_stock: String(p.minimum_stock || 0),
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
    const purchaseCost = Number(form.purchase_cost);
    const stock = Number(form.stock);
    const minimumStock = Number(form.minimum_stock);
    if (!Number.isFinite(price) || price < 0) {
      setError('Ingresa un precio válido, igual o mayor que cero.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError('El stock debe ser un número entero igual o mayor que cero.');
      return;
    }
    if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
      setError('Ingresa un costo de compra válido, igual o mayor que cero.');
      return;
    }
    if (!Number.isInteger(minimumStock) || minimumStock < 0) {
      setError('El stock mínimo debe ser un número entero igual o mayor que cero.');
      return;
    }
    if (form.status === 'active' && stock < 1) {
      setError('Para publicar el producto, agrega al menos una unidad en stock.');
      return;
    }
    setSaving(true);
    setError(null);

    const partPayload = {
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

    let partId = editing?.id;
    let partError: string | null = null;
    if (editing) {
      const { error: updateError } = await supabase.from('parts').update(partPayload).eq('id', editing.id).eq('user_id', profile.id);
      partError = updateError?.message ?? null;
    } else {
      const { data: insertedPart, error: insertError } = await supabase.from('parts').insert(partPayload).select('id').single();
      partError = insertError?.message ?? null;
      partId = insertedPart?.id;
    }
    if (partError || !partId) {
      setError(partError || 'No se pudo guardar el producto.');
      setSaving(false);
      return;
    }

    const { error: inventoryError } = await supabase.from('part_inventory').upsert({
      part_id: partId,
      user_id: profile.id,
      sku: form.sku.trim() || null,
      purchase_cost: purchaseCost,
      minimum_stock: minimumStock,
    }, { onConflict: 'part_id' });
    if (inventoryError) {
      if (!editing) await supabase.from('parts').delete().eq('id', partId).eq('user_id', profile.id);
      const inventoryErrorMessage = inventoryError.code === '23505'
        ? 'Ese código SKU ya está en uso en tu inventario.'
        : inventoryError.message;
      setError(editing
        ? `El producto se actualizó, pero no sus datos internos de inventario: ${inventoryErrorMessage}`
        : `No se pudo guardar el producto en inventario: ${inventoryErrorMessage}`);
      load();
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowForm(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este repuesto?')) return;
    const { error: deleteError } = await supabase.from('parts').delete().eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  };

  const updateStatus = async (part: Part, status: PartStatus) => {
    if (!profile) return;
    if (status === 'active' && part.stock < 1) {
      setError('Agrega al menos una unidad antes de publicar el repuesto.');
      return;
    }
    const { error: statusError } = await supabase
      .from('parts')
      .update({ status })
      .eq('id', part.id)
      .eq('user_id', profile.id);
    if (statusError) setError(statusError.message);
    else load();
  };

  const statusBadge = (status: PartStatus) => {
    const map: Record<PartStatus, string> = {
      active: 'bg-green-500/10 text-green-400',
      sold: 'bg-slate-700 text-slate-400',
      inactive: 'bg-yellow-500/10 text-yellow-400',
    };
    const labels: Record<PartStatus, string> = { active: 'Publicado', sold: 'Vendido', inactive: 'En inventario' };
    return <span className={`badge ${map[status]}`}>{labels[status]}</span>;
  };

  const filteredParts = parts.filter((part) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [part.sku || '', part.title, part.description, part.brand || '', part.compatible_motorcycles || '']
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesSearch && (categoryFilter === 'all' || part.category === categoryFilter) && (statusFilter === 'all' || part.status === statusFilter);
  });

  const totalUnits = parts.reduce((total, part) => total + part.stock, 0);
  const lowStockCount = parts.filter((part) => part.status !== 'sold' && part.stock <= (part.minimum_stock ?? 0)).length;
  const inventoryCost = parts.reduce((total, part) => total + part.stock * (part.purchase_cost ?? 0), 0);
  const publishedCount = parts.filter((part) => part.status === 'active').length;

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
          <h1 className="text-2xl font-bold text-white mb-1">Mi inventario</h1>
          <p className="text-slate-400 text-sm">Controla existencias, costos y precios; publica cada repuesto cuando esté listo.</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" />
          Agregar producto
        </button>
      </div>

      {error && !showForm && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InventoryMetric icon={Boxes} label="Productos" value={String(parts.length)} />
        <InventoryMetric icon={Package} label="Unidades disponibles" value={String(totalUnits)} />
        <InventoryMetric icon={TriangleAlert} label="En nivel mínimo" value={String(lowStockCount)} warning={lowStockCount > 0} />
        <InventoryMetric icon={DollarSign} label="Costo del inventario" value={`$${inventoryCost.toLocaleString()}`} />
      </div>

      {parts.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <Store className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">Tu inventario está vacío</p>
          <button onClick={openAdd} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" />
            Agregar el primer producto
          </button>
        </div>
      ) : (
        <>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, nombre, marca o modelo..." />
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
            <option value="active">Publicados</option>
            <option value="sold">Vendidos</option>
            <option value="inactive">En inventario</option>
          </select>
        </div>
        <p className="mb-4 text-xs text-slate-500">{filteredParts.length} de {parts.length} productos · {publishedCount} publicados en el marketplace</p>
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
                <div className="absolute top-2 right-2 flex gap-1 transition">
                  {p.status !== 'active' && p.status !== 'sold' && (
                    <button onClick={() => updateStatus(p, 'active')} disabled={p.stock < 1} title="Publicar en marketplace" aria-label={`Publicar ${p.title}`} className="rounded-lg bg-slate-900/80 p-1.5 text-slate-300 backdrop-blur hover:text-green-400 disabled:opacity-40">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {p.status === 'active' && (
                    <button onClick={() => updateStatus(p, 'inactive')} title="Retirar del marketplace" aria-label={`Retirar ${p.title} del marketplace`} className="rounded-lg bg-slate-900/80 p-1.5 text-slate-300 backdrop-blur hover:text-yellow-400">
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => openEdit(p)} title="Editar producto" aria-label={`Editar ${p.title}`} className="p-1.5 bg-slate-900/80 rounded-lg text-slate-300 hover:text-cyan-400 backdrop-blur">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(p.id)} title="Eliminar producto" aria-label={`Eliminar ${p.title}`} className="p-1.5 bg-slate-900/80 rounded-lg text-slate-300 hover:text-red-400 backdrop-blur">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <span className="badge bg-cyan-500/10 text-cyan-400 mb-2">{PART_CATEGORIES[p.category]}</span>
                <h3 className="font-semibold text-white truncate">{p.title}</h3>
                {p.sku && <p className="mt-1 text-xs text-slate-500">Código: {p.sku}</p>}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-green-400 flex items-center gap-0.5">
                    <DollarSign className="w-4 h-4" />
                    {p.price.toLocaleString()}
                  </span>
                  <span className={`text-xs ${p.stock <= (p.minimum_stock ?? 0) && p.status !== 'sold' ? 'font-semibold text-amber-400' : 'text-slate-500'}`}>Stock: {p.stock} / mínimo {p.minimum_stock ?? 0}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Costo: ${(p.purchase_cost ?? 0).toLocaleString()} · Total: ${(p.stock * (p.purchase_cost ?? 0)).toLocaleString()}</p>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <div className="card my-auto max-h-[90dvh] w-full max-w-md animate-fade-in overflow-y-auto p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">{editing ? 'Editar producto' : 'Agregar al inventario'}</h2>
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
                <label className="label">Código interno / SKU (opcional)</label>
                <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="REP-0001" />
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Condición</label>
                  <select className="input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as PartCondition })}>
                    {Object.entries(PART_CONDITIONS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Visibilidad</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PartStatus })}>
                    <option value="inactive">Guardar solo en inventario</option>
                    <option value="active">Publicar en marketplace</option>
                    <option value="sold">Vendido</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Los productos guardados solo en inventario no aparecen en el marketplace.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Precio de venta ($)</label>
                  <input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="label">Costo de compra ($)</label>
                  <input className="input" type="number" min="0" step="0.01" required value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <label className="label">Unidades en stock</label>
                  <input className="input" type="number" min="0" step="1" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="1" />
                </div>
                <div>
                  <label className="label">Avisar con stock mínimo</label>
                  <input className="input" type="number" min="0" step="1" required value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} placeholder="0" />
                </div>
              </div>
              <button type="submit" disabled={saving || uploadingPhoto} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Guardar cambios' : form.status === 'active' ? 'Guardar y publicar' : 'Guardar en inventario'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryMetric({ icon: Icon, label, value, warning = false }: { icon: typeof Boxes; label: string; value: string; warning?: boolean }) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${warning ? 'text-amber-400' : 'text-orange-400'}`} />
        <span className="truncate text-xs text-slate-400">{label}</span>
      </div>
      <p className={`truncate text-lg font-bold sm:text-xl ${warning ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}
