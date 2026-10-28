import trinidadMain from '@/img/Trinidad_Bolivia_1.webp';

export default function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <img className="auth-backdrop__photo" src={trinidadMain} alt="" fetchPriority="high" />
      <div className="auth-backdrop__shade" />
      <div className="auth-backdrop__glow" />
    </div>
  );
}
