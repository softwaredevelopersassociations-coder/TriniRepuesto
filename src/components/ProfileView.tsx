import { useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { uploadFile } from '@/lib/storage';
import { ROLE_LABELS } from '@/lib/constants';
import { googleMapsUrl } from '@/lib/googleMaps';
import type { UserRole } from '@/types';
import { User, Mail, Phone, IdCard, MapPin, Camera, Loader2, Save, X, Bike, Wrench, Store, MapPinned } from 'lucide-react';
import LocationPicker from './LocationPicker';
import StoreMapPreview from './StoreMapPreview';

export default function ProfileView() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    carnet: '',
    store_location: '',
    store_latitude: null as number | null,
    store_longitude: null as number | null,
    business_name: '',
    business_details: '',
    role: 'mechanic' as UserRole,
  });

  if (!profile) return null;

  const openEdit = () => {
    setForm({
      full_name: profile.full_name,
      phone: profile.phone || '',
      carnet: profile.carnet || '',
      store_location: profile.store_location || '',
      store_latitude: profile.store_latitude ?? null,
      store_longitude: profile.store_longitude ?? null,
      business_name: profile.business_name || '',
      business_details: profile.business_details || '',
      role: profile.role,
    });
    setEditing(true);
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploadingAvatar(true);
    setError(null);
    const url = await uploadFile('avatars', profile.id, e.target.files[0]);
    if (url) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (updateError) {
        setError('Error al guardar la foto');
      } else {
        await refreshProfile();
      }
    } else {
      setError('Error al subir la foto');
    }
    setUploadingAvatar(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        carnet: form.carnet || null,
        store_location: form.store_location || null,
        store_latitude: form.store_latitude,
        store_longitude: form.store_longitude,
        business_name: form.role === 'seller' || form.role === 'both' ? form.business_name.trim() || null : null,
        business_details: form.role === 'seller' || form.role === 'both' ? form.business_details.trim() || null : null,
        role: form.role,
      })
      .eq('id', profile.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  const roleIcon = profile.role === 'mechanic' ? Wrench : profile.role === 'seller' ? Store : Bike;

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-white mb-1">Mi perfil</h1>
      <p className="text-slate-400 text-sm mb-6">Información personal y configuración de cuenta</p>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* Profile card */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <div className="w-28 h-28 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-slate-400">
                  {profile.full_name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <label className="absolute bottom-1 right-1 w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-orange-600 transition shadow-lg border-2 border-slate-900">
              {uploadingAvatar ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
            </label>
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-white">{profile.full_name}</h2>
            <p className="text-sm text-slate-400 mb-3">{profile.email}</p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <span className="badge bg-orange-500/10 text-orange-400 flex items-center gap-1">
                {(() => {
                  const Icon = roleIcon;
                  return <Icon className="w-3 h-3" />;
                })()}
                {ROLE_LABELS[profile.role]}
              </span>
              {profile.carnet && (
                <span className="badge bg-slate-800 text-slate-300 flex items-center gap-1">
                  <IdCard className="w-3 h-3" />
                  Carnet: {profile.carnet}
                </span>
              )}
              {profile.store_location && (
                <span className="badge bg-cyan-500/10 text-cyan-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {profile.store_location}
                </span>
              )}
              {profile.business_name && (
                <span className="badge bg-purple-500/10 text-purple-300 flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  {profile.business_name}
                </span>
              )}
            </div>
          </div>

          <button onClick={openEdit} className="btn-secondary shrink-0">
            Editar perfil
          </button>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-slate-500" />
            <span className="label mb-0">Correo</span>
          </div>
          <p className="text-sm text-slate-200">{profile.email}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="w-4 h-4 text-slate-500" />
            <span className="label mb-0">Teléfono</span>
          </div>
          <p className="text-sm text-slate-200">{profile.phone || 'No registrado'}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <IdCard className="w-4 h-4 text-slate-500" />
            <span className="label mb-0">Carnet</span>
          </div>
          <p className="text-sm text-slate-200">{profile.carnet || 'No registrado'}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <MapPinned className="w-4 h-4 text-slate-500" />
            <span className="label mb-0">Ubicación de tienda</span>
          </div>
          <p className="text-sm text-slate-200">
            {profile.store_location || (profile.store_latitude != null && profile.store_longitude != null ? 'Pin guardado en el mapa' : 'No registrada')}
          </p>
          {profile.store_latitude != null && profile.store_longitude != null && (
            <a
              href={googleMapsUrl(profile.store_latitude, profile.store_longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
            >
              <MapPin className="h-3 w-3" /> Abrir en Google Maps
            </a>
          )}
        </div>
        <StoreMapPreview
          address={profile.store_location}
          latitude={profile.store_latitude}
          longitude={profile.store_longitude}
        />
        {(profile.role === 'seller' || profile.role === 'both') && (
          <>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-4 h-4 text-slate-500" />
                <span className="label mb-0">Nombre del negocio</span>
              </div>
              <p className="text-sm text-slate-200">{profile.business_name || 'No registrado'}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-4 h-4 text-slate-500" />
                <span className="label mb-0">Información del negocio</span>
              </div>
              <p className="text-sm text-slate-200">{profile.business_details || 'No registrada'}</p>
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <button onClick={signOut} className="btn-danger">
          Cerrar sesión
        </button>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditing(false)}>
          <div className="card p-6 w-full max-w-md animate-fade-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Editar perfil</h2>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label">Nombre completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input className="input pl-10" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input className="input pl-10" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+57 300 000 0000" />
                </div>
              </div>
              <div>
                <label className="label">Número de carnet</label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input className="input pl-10" value={form.carnet} onChange={(e) => setForm({ ...form, carnet: e.target.value })} placeholder="12345678" />
                </div>
              </div>
              <div>
                <LocationPicker
                  address={form.store_location}
                  latitude={form.store_latitude}
                  longitude={form.store_longitude}
                  onAddressChange={(store_location) => setForm((current) => ({ ...current, store_location }))}
                  onCoordinatesChange={(store_latitude, store_longitude) => setForm((current) => ({ ...current, store_latitude, store_longitude }))}
                />
              </div>
              <div>
                <label className="label">Rol</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: 'mechanic', label: 'Mantenimiento', icon: Wrench },
                    { val: 'seller', label: 'Vender', icon: Store },
                    { val: 'both', label: 'Ambos', icon: Bike },
                  ] as const).map(({ val, label, icon: Icon }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm({ ...form, role: val })}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                        form.role === val
                          ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                          : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {(form.role === 'seller' || form.role === 'both') && (
                <>
                  <div>
                    <label className="label">Nombre del negocio</label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input className="input pl-10" required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Repuestos Central" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Información del negocio</label>
                    <textarea className="input min-h-[70px] resize-none" value={form.business_details} onChange={(e) => setForm({ ...form, business_details: e.target.value })} placeholder="Especialidad, marcas y servicios..." />
                  </div>
                </>
              )}
              <button type="submit" disabled={saving} className="btn-primary w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar cambios
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
