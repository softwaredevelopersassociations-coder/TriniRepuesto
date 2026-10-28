import { Bike } from 'lucide-react';

type Props = {
  label: string;
  compact?: boolean;
};

export default function LoadingAnimation({ label, compact = false }: Props) {
  return (
    <div
      className={`auth-loader${compact ? ' auth-loader--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="auth-loader__scene" aria-hidden="true">
        <span className="auth-loader__orbit" />
        <Bike className="auth-loader__bike" strokeWidth={1.8} />
        <span className="auth-loader__spark" />
        <span className="auth-loader__road">
          <span />
        </span>
      </div>
      <span className="auth-loader__label">{label}</span>
    </div>
  );
}
