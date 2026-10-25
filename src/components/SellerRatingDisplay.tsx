import { Star } from 'lucide-react';

type Props = {
  avgRating: number;
  totalRatings: number;
  size?: 'sm' | 'md';
};

export default function SellerRatingDisplay({ avgRating, totalRatings, size = 'sm' }: Props) {
  if (totalRatings === 0) {
    return (
      <span className="text-xs text-slate-500">Sin calificaciones</span>
    );
  }

  const starSize = size === 'sm' ? 12 : 16;
  const rounded = Math.round(avgRating * 10) / 10;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          style={{ width: starSize, height: starSize }}
          className={star <= Math.round(avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}
        />
      ))}
      <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'} text-slate-400 ml-0.5`}>
        {rounded} ({totalRatings})
      </span>
    </div>
  );
}
