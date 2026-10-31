import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Wrench, Store, User, Mail, Lock, Phone, ArrowRight, Bike, IdCard, MapPin, Eye, EyeOff } from 'lucide-react';
import type { UserRole } from '@/types';
import LocationPicker from './LocationPicker';
import AuthBackdrop from './AuthBackdrop';
import LoadingAnimation from './LoadingAnimation';
import trinidadAerial from '@/img/Trinidad_Bolivia_2.jpg';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [carnet, setCarnet] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storeLatitude, setStoreLatitude] = useState<number | null>(null);
  const [storeLongitude, setStoreLongitude] = useState<number | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessDetails, setBusinessDetails] = useState('');
  const [role, setRole] = useState<UserRole>('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            email,
            full_name: fullName,
            role,
            phone: phone || null,
            carnet: carnet || null,
            store_location: storeLocation || null,
            store_latitude: role === 'seller' ? storeLatitude : null,
            store_longitude: role === 'seller' ? storeLongitude : null,
            business_name: role === 'seller' ? businessName.trim() : null,
            business_details: role === 'seller' ? businessDetails.trim() || null : null,
          });
          if (profileError) throw profileError;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ocurrió un error';
      if (msg.includes('profiles_role_check')) {
        setError('Tu base de datos todavía no acepta el perfil Cliente. Aplica primero la migración 20261031000000_convert_profiles_to_clients.sql en Supabase.');
      } else if (msg.includes('Invalid login credentials')) {
        setError('Credenciales inválidas. Verifica tu correo y contraseña.');
      } else if (msg.includes('For security purposes, you can only request this after')) {
        const seconds = msg.match(/\d+/)?.[0] || 'unos';
        setError(`Por seguridad, debes esperar ${seconds} segundos antes de volver a intentarlo.`);
      } else if (msg.includes('User already registered')) {
        setError('Este correo electrónico ya está registrado. Intenta iniciar sesión.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh min-h-screen w-full overflow-x-hidden bg-slate-950 flex flex-col lg:flex-row">
      {/* Left panel — branding */}
      <section className="auth-brand-panel relative isolate flex min-h-[320px] w-full flex-col items-center justify-center overflow-hidden p-6 sm:p-8 lg:min-h-screen lg:w-1/2 lg:p-16">
        <AuthBackdrop />
        <div className="relative z-10 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/90 rounded-2xl mb-6 shadow-2xl shadow-orange-500/30 ring-1 ring-white/20 backdrop-blur-sm">
            <Bike className="w-11 h-11 text-white" strokeWidth={2.2} />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-orange-200/90">Desde Trinidad, Bolivia</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">TriniRepuesto</h1>
          <p className="text-slate-200 text-lg mb-8 drop-shadow">
            Mantenimiento y repuestos para motocicletas en un solo lugar
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="bg-slate-950/50 backdrop-blur-xl rounded-xl p-4 border border-white/15 shadow-xl">
              <Wrench className="w-8 h-8 text-orange-400 mb-2" />
              <p className="text-white text-sm font-medium">Gestiona el mantenimiento de tus motos</p>
            </div>
            <div className="bg-slate-950/50 backdrop-blur-xl rounded-xl p-4 border border-white/15 shadow-xl">
              <Store className="w-8 h-8 text-cyan-400 mb-2" />
              <p className="text-white text-sm font-medium">Compra y vende repuestos</p>
            </div>
          </div>
          <div className="auth-city-card mt-5" aria-label="Trinidad, Beni, Bolivia">
            <img src={trinidadAerial} alt="Vista aérea de Trinidad, Bolivia" loading="lazy" />
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold text-white">Trinidad, Beni</p>
              <p className="mt-0.5 text-xs text-slate-300">Una comunidad sobre ruedas</p>
            </div>
            <MapPin className="ml-auto h-5 w-5 shrink-0 text-orange-300" aria-hidden="true" />
          </div>
          <p className="mt-7 text-xs text-slate-400">
            Desarrollado por{' '}
            <span className="font-semibold text-slate-200">Software Developers Associations</span>
          </p>
        </div>
      </section>

      {/* Right panel — form */}
      <section className="auth-form-panel relative isolate flex w-full items-center justify-center overflow-y-auto p-4 sm:p-8 lg:w-1/2 lg:p-12">
        <AuthBackdrop />
        <div className="relative z-10 my-3 w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/75 p-4 shadow-2xl shadow-slate-950/50 backdrop-blur-2xl sm:my-6 sm:rounded-3xl sm:p-8">
          <div className="mb-7">
          <h2 className="text-2xl font-bold text-white mb-1">
            {mode === 'signin' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {mode === 'signin'
              ? 'Inicia sesión para acceder a tu panel'
              : 'Elige tu rol y empieza a usar TriniRepuesto'}
          </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="label">Nombre completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      className="input pl-10"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Tu nombre"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="label">Teléfono (opcional)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        className="input pl-10"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+57 300 000 0000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Número de carnet</label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        className="input pl-10"
                        type="text"
                        value={carnet}
                        onChange={(e) => setCarnet(e.target.value)}
                        placeholder="12345678"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">¿Cómo vas a usar TriniRepuesto?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { val: 'client', label: 'Cliente', icon: User },
                      { val: 'seller', label: 'Vender', icon: Store },
                    ] as const).map(({ val, label, icon: Icon }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRole(val)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                          role === val
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

                {role === 'seller' && (
                  <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm font-semibold text-slate-200">Datos del negocio</p>
                    <div>
                      <label className="label">Nombre del negocio</label>
                      <input className="input" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Repuestos Central" />
                    </div>
                    <div>
                      <label className="label">Descripción del negocio (opcional)</label>
                      <textarea className="input min-h-[70px] resize-none" value={businessDetails} onChange={(e) => setBusinessDetails(e.target.value)} placeholder="Especialidad, marcas y servicios..." />
                    </div>
                    <div>
                      <LocationPicker
                        address={storeLocation}
                        latitude={storeLatitude}
                        longitude={storeLongitude}
                        onAddressChange={setStoreLocation}
                        onCoordinatesChange={(latitude, longitude) => {
                          setStoreLatitude(latitude);
                          setStoreLongitude(longitude);
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="label">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  className="input pl-10"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  className="input pl-10 pr-11"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full min-h-11">
              {loading ? (
                <LoadingAnimation
                  compact
                  label={mode === 'signin' ? 'Iniciando sesión…' : 'Creando cuenta…'}
                />
              ) : (
                <>
                  {mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            {mode === 'signin' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
              }}
              className="text-orange-400 font-semibold hover:text-orange-300 transition"
            >
              {mode === 'signin' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
