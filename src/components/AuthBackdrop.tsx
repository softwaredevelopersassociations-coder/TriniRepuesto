import trinidadMain from '@/img/Trinidad_Bolivia_1.webp';
import trinidadAerial from '@/img/Trinidad_Bolivia_2.jpg';

export default function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <img
        className="auth-backdrop__photo auth-backdrop__photo--main"
        src={trinidadMain}
        alt=""
        fetchPriority="high"
      />
      <img
        className="auth-backdrop__photo auth-backdrop__photo--aerial"
        src={trinidadAerial}
        alt=""
        loading="lazy"
      />
      <div className="auth-backdrop__shade" />
      <div className="auth-backdrop__glow" />
    </div>
  );
}
