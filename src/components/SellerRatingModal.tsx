import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { SellerRating } from '@/types';
import { Star, X, Send } from 'lucide-react';

type Props = {
  sellerId: string;
  sellerName: string;
  partId: string;
  partTitle: string;
  existing?: SellerRating | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function SellerRatingModal({ sellerId, sellerName, partId, partTitle, existing, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!profile || rating === 0) return;
    setSaving(true);
    setError('');
    try {
      if (existing) {
        const { error: err } = await supabase
          .from('seller_ratings')
          .update({ rating, comment: comment || null })
          .eq('id', existing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('seller_ratings')
          .insert({ seller_id: sellerId, buyer_id: profile.id, part_id: partId, rating, comment: comment || null });
        if (err) throw err;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar la calificación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Calificar vendedor</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-400 mb-1">Vendedor: <span className="text-slate-200 font-medium">{sellerName}</span></p>
        <p className="text-xs text-slate-500 mb-5">Repuesto: {partTitle}</p>

        {/* Stars */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  star <= (hovered || rating) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'
                }`}
              />
            </button>
          ))}
          {rating > 0 && (
            <span className="text-sm text-slate-400 ml-1">
              {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][rating]}
            </span>
          )}
        </div>

        {/* Comment */}
        <textarea
          className="input resize-none mb-4"
          rows={3}
          placeholder="Comentario opcional (máx. 500 caracteres)..."
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
        />

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={rating === 0 || saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
            {existing ? 'Actualizar' : 'Enviar calificación'}
          </button>
        </div>
      </div>
    </div>
  );
}
