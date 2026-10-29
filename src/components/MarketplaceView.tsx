import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Motorcycle, Part, PartCategory, SellerRating, SellerStats } from '@/types';
import { PART_CATEGORIES, PART_CONDITIONS } from '@/lib/constants';
import { googleMapsUrl } from '@/lib/googleMaps';
import {
  Bike,
  Store,
  Search,
  X,
  Package,
  DollarSign,
  Tag,
  Filter,
  MessageSquare,
  Star,
  ArrowUpDown,
  MapPin,
  CheckCircle,
} from 'lucide-react';
import ChatModal from './ChatModal';
import SellerRatingModal from './SellerRatingModal';
import SellerRatingDisplay from './SellerRatingDisplay';

type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'rating';

function normalizeCompatibility(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function partMatchesMotorcycle(compatibility: string, motorcycle: Motorcycle) {
  const normalizedModel = normalizeCompatibility(`${motorcycle.brand} ${motorcycle.model}`);
  if (!normalizedModel) return false;
  return compatibility.split(/[,;\n]/).some((entry) => {
    if (!normalizeCompatibility(entry).includes(normalizedModel)) return false;
    const yearRange = entry.match(/\b((?:19|20)\d{2})\s*[-–]\s*((?:19|20)\d{2})\b/);
    if (yearRange) {
      const firstYear = Number(yearRange[1]);
      const lastYear = Number(yearRange[2]);
      return motorcycle.year >= Math.min(firstYear, lastYear) && motorcycle.year <= Math.max(firstYear, lastYear);
    }
    const explicitYears = entry.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || [];
    return explicitYears.length === 0 || explicitYears.includes(motorcycle.year);
  });
}

export default function MarketplaceView() {
  const { profile } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [myMotorcycles, setMyMotorcycles] = useState<Motorcycle[]>([]);
  const [compatibleWith, setCompatibleWith] = useState('all');
  const [sellerStats, setSellerStats] = useState<Record<string, SellerStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [motorcycleSearch, setMotorcycleSearch] = useState('');
  const [catFilter, setCatFilter] = useState<PartCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selected, setSelected] = useState<Part | null>(null);

  // Chat & Rating Modals
  const [activeChat, setActiveChat] = useState<{
    conversationId: string;
    part: Pick<Part, 'id' | 'title' | 'image_url' | 'price'>;
    otherUser: { id: string; full_name: string; avatar_url: string | null };
  } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [partRatings, setPartRatings] = useState<SellerRating[]>([]);
  const [userRatingForPart, setUserRatingForPart] = useState<SellerRating | null>(null);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const load = async () => {
    setLoading(true);
    const partsQuery = supabase.from('parts').select('*').eq('status', 'active').gt('stock', 0).order('created_at', { ascending: false });
    const motorcyclesQuery = profile
      ? supabase.from('motorcycles').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
      : Promise.resolve({ data: null });
    const [{ data: partsData }, { data: motorcycleData }] = await Promise.all([partsQuery, motorcyclesQuery]);

    const rawParts = (partsData as Part[]) || [];
    setMyMotorcycles((motorcycleData as Motorcycle[] | null) || []);

    if (rawParts.length > 0) {
      const sellerIds = [...new Set(rawParts.map((p) => p.user_id))];

      const [{ data: profilesData }, { data: ratingsData }] = await Promise.all([
        supabase.from('profiles').select('id,full_name,avatar_url,store_location,store_latitude,store_longitude,business_name,business_details').in('id', sellerIds),
        supabase.from('seller_ratings').select('seller_id,rating').in('seller_id', sellerIds),
      ]);

      const profMap: Record<string, any> = {};
      (profilesData || []).forEach((pr: any) => {
        profMap[pr.id] = pr;
      });

      const statsMap: Record<string, SellerStats> = {};
      sellerIds.forEach((sid) => {
        const matching = (ratingsData || []).filter((r: any) => r.seller_id === sid);
        const count = matching.length;
        const sum = matching.reduce((acc: number, cur: any) => acc + cur.rating, 0);
        statsMap[sid] = {
          seller_id: sid,
          avg_rating: count > 0 ? sum / count : 0,
          total_ratings: count,
        };
      });

      setSellerStats(statsMap);

      const enrichedParts: Part[] = rawParts.map((p) => ({
        ...p,
        seller: profMap[p.user_id]
          ? {
              full_name: profMap[p.user_id].full_name,
              avatar_url: profMap[p.user_id].avatar_url,
              store_location: profMap[p.user_id].store_location,
              store_latitude: profMap[p.user_id].store_latitude,
              store_longitude: profMap[p.user_id].store_longitude,
              business_name: profMap[p.user_id].business_name,
              business_details: profMap[p.user_id].business_details,
            }
          : undefined,
      }));

      setParts(enrichedParts);
    } else {
      setParts([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Load reviews when a part is selected
  useEffect(() => {
    if (!selected) {
      setPartRatings([]);
      setUserRatingForPart(null);
      return;
    }

    const loadRatingsForSelected = async () => {
      setLoadingRatings(true);
      const { data: rData } = await supabase
        .from('seller_ratings')
        .select('*')
        .eq('part_id', selected.id)
        .order('created_at', { ascending: false });

      const ratingsList = (rData as SellerRating[]) || [];

      if (ratingsList.length > 0) {
        const buyerIds = [...new Set(ratingsList.map((r) => r.buyer_id))];
        const { data: buyersData } = await supabase
          .from('profiles')
          .select('id,full_name,avatar_url')
          .in('id', buyerIds);

        const bMap: Record<string, any> = {};
        (buyersData || []).forEach((b: any) => {
          bMap[b.id] = b;
        });

        const enrichedRatings = ratingsList.map((r) => ({
          ...r,
          buyer: bMap[r.buyer_id] || { full_name: 'Usuario', avatar_url: null },
        }));

        setPartRatings(enrichedRatings);

        if (profile) {
          const mine = enrichedRatings.find((r) => r.buyer_id === profile.id);
          setUserRatingForPart(mine || null);
        }
      } else {
        setPartRatings([]);
        setUserRatingForPart(null);
      }
      setLoadingRatings(false);
    };

    loadRatingsForSelected();
  }, [selected, profile]);

  const handleContactSeller = async (part: Part) => {
    if (!profile) return;
    setStartingChat(true);
    try {
      const { data: existingConvs } = await supabase
        .from('conversations')
        .select('*')
        .eq('part_id', part.id)
        .eq('buyer_id', profile.id)
        .eq('seller_id', part.user_id)
        .maybeSingle();

      let convId = existingConvs?.id;

      if (!convId) {
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            part_id: part.id,
            buyer_id: profile.id,
            seller_id: part.user_id,
          })
          .select()
          .single();

        if (error) throw error;
        convId = newConv.id;
      }

      setActiveChat({
        conversationId: convId,
        part: {
          id: part.id,
          title: part.title,
          image_url: part.image_url,
          price: part.price,
        },
        otherUser: {
          id: part.user_id,
          full_name: part.seller?.business_name || part.seller?.full_name || 'Vendedor',
          avatar_url: part.seller?.avatar_url || null,
        },
      });
    } catch (err: any) {
      console.error('Error starting conversation:', err);
      alert('Error al iniciar la conversación: ' + (err.message || 'Error desconocido'));
    } finally {
      setStartingChat(false);
    }
  };

  const selectedMotorcycle = myMotorcycles.find((motorcycle) => motorcycle.id === compatibleWith) || null;
  const matchingMotorcycles = myMotorcycles.filter((motorcycle) =>
    `${motorcycle.brand} ${motorcycle.model} ${motorcycle.year}`.toLowerCase().includes(motorcycleSearch.trim().toLowerCase())
  );

  const filtered = parts
    .filter((p) => {
      const compatibility = p.compatible_motorcycles || '';
      const matchSearch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        compatibility.toLowerCase().includes(search.toLowerCase()) ||
        (p.brand || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.seller?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.seller?.business_name || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'all' || p.category === catFilter;
      const matchMoto = !selectedMotorcycle || partMatchesMotorcycle(compatibility, selectedMotorcycle);
      return matchSearch && matchCat && matchMoto;
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'rating') {
        const ratingA = sellerStats[a.user_id]?.avg_rating || 0;
        const ratingB = sellerStats[b.user_id]?.avg_rating || 0;
        return ratingB - ratingA;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const categories = Object.keys(PART_CATEGORIES) as PartCategory[];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Marketplace de repuestos</h1>
          <p className="text-slate-400 text-sm">Explora, compra y comunícate con vendedores calificados</p>
        </div>
      </div>

      {/* Search + Filters + Sort */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Buscar repuestos, marcas, modelos o negocios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="input w-full bg-slate-900 py-2 text-xs text-slate-200 sm:w-auto sm:min-w-[10rem]"
            >
              <option value="recent">Más recientes</option>
              <option value="price_asc">Menor precio</option>
              <option value="price_desc">Mayor precio</option>
              <option value="rating">Mejor calificados</option>
            </select>
          </div>
        </div>

        {myMotorcycles.length > 0 ? (
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4" aria-label="Buscar repuestos por motocicleta">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-200">Busca con la moto de tu cliente</p>
                <p className="text-xs text-slate-500">Elige una moto registrada para filtrar repuestos compatibles y ver su foto.</p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  className="input py-2 pl-9"
                  value={motorcycleSearch}
                  onChange={(event) => setMotorcycleSearch(event.target.value)}
                  placeholder="Buscar marca, modelo o año..."
                  aria-label="Buscar una moto registrada"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCompatibleWith('all')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${compatibleWith === 'all' ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                <Bike className="h-8 w-8 rounded-md bg-slate-800 p-1.5" />
                Todas las motos
              </button>
              {matchingMotorcycles.map((motorcycle) => (
                <button
                  key={motorcycle.id}
                  type="button"
                  onClick={() => setCompatibleWith(motorcycle.id)}
                  className={`flex max-w-full items-center gap-2 rounded-lg border p-2 text-left transition ${compatibleWith === motorcycle.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-700 hover:border-slate-500'}`}
                  aria-pressed={compatibleWith === motorcycle.id}
                >
                  <div className="h-10 w-12 shrink-0 overflow-hidden rounded-md bg-slate-800 flex items-center justify-center">
                    {motorcycle.image_url
                      ? <img src={motorcycle.image_url} alt={`Foto de ${motorcycle.brand} ${motorcycle.model}`} className="h-full w-full object-cover" />
                      : <Bike className="h-5 w-5 text-slate-500" />}
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-slate-200">{motorcycle.brand} {motorcycle.model}</span>
                    <span className="block text-[11px] text-slate-500">{motorcycle.year}</span>
                  </span>
                </button>
              ))}
              {matchingMotorcycles.length === 0 && (
                <p className="py-2 text-xs text-slate-500">No hay motos registradas que coincidan con la búsqueda.</p>
              )}
            </div>

            {selectedMotorcycle && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-800 flex items-center justify-center">
                  {selectedMotorcycle.image_url
                    ? <img src={selectedMotorcycle.image_url} alt={`Foto seleccionada: ${selectedMotorcycle.brand} ${selectedMotorcycle.model}`} className="h-full w-full object-cover" />
                    : <Bike className="h-7 w-7 text-cyan-400" />}
                </div>
                <div>
                  <p className="text-xs text-cyan-300">Filtrando por la moto seleccionada</p>
                  <p className="font-semibold text-white">{selectedMotorcycle.brand} {selectedMotorcycle.model} ({selectedMotorcycle.year})</p>
                  {!selectedMotorcycle.image_url && <p className="text-xs text-slate-500">Puedes añadir su foto en “Mis motos”.</p>}
                </div>
              </div>
            )}
          </section>
        ) : (
          <p className="text-xs text-slate-500">Registra la moto del cliente en “Mis motos” para buscar repuestos compatibles y mostrar su foto aquí.</p>
        )}

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <button
            type="button"
            onClick={() => setCatFilter('all')}
            className={`badge px-3 py-1.5 whitespace-nowrap transition ${
              catFilter === 'all'
                ? 'bg-orange-500 text-white font-medium'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({parts.length})
          </button>
          {categories.map((cat) => {
            const count = parts.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={`badge px-3 py-1.5 whitespace-nowrap transition ${
                  catFilter === cat
                    ? 'bg-orange-500 text-white font-medium'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {PART_CATEGORIES[cat]} {count > 0 && <span className="opacity-70 text-[10px] ml-1">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <Store className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">No se encontraron repuestos</p>
          <p className="text-slate-500 text-xs mt-1">Prueba cambiando los filtros o la búsqueda</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const stats = sellerStats[p.user_id] || { avg_rating: 0, total_ratings: 0 };
            return (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="card overflow-hidden hover:border-slate-700 transition cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="h-44 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <Package className="w-12 h-12 text-slate-600 group-hover:scale-110 transition" />
                    )}
                    <span className="absolute top-2 right-2 badge bg-slate-900/90 text-slate-200 backdrop-blur text-xs">
                      {PART_CONDITIONS[p.condition]}
                    </span>
                  </div>

                  <div className="p-4 pb-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="badge bg-cyan-500/10 text-cyan-400 text-xs">
                        {PART_CATEGORIES[p.category]}
                      </span>
                      {p.brand && <span className="text-xs text-slate-400 font-medium">{p.brand}</span>}
                    </div>

                    <h3 className="font-semibold text-white mb-1 truncate text-base">{p.title}</h3>
                    <p className="text-xs text-slate-400 mb-3 line-clamp-2">{p.description}</p>
                    {p.compatible_motorcycles && <p className="mb-2 text-xs text-cyan-300/80 line-clamp-1">Compatible: {p.compatible_motorcycles}</p>}
                  </div>
                </div>

                <div className="p-4 pt-0">
                  {/* Seller info with rating */}
                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-200 overflow-hidden shrink-0">
                        {p.seller?.avatar_url ? (
                          <img src={p.seller.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (p.seller?.full_name || 'V').charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-xs text-slate-300 truncate font-medium">
                        {p.seller?.business_name || p.seller?.full_name || 'Vendedor'}
                      </span>
                    </div>

                    <SellerRatingDisplay avgRating={stats.avg_rating} totalRatings={stats.total_ratings} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-green-400">${p.price.toLocaleString()}</span>
                    <span className="text-xs text-slate-500">Stock: {p.stock}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-2 py-3 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="card my-auto max-h-[90dvh] w-full max-w-xl animate-fade-in overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 sm:h-60">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.title} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-16 h-16 text-slate-600" />
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-3 right-3 p-2 bg-slate-900/80 rounded-lg text-slate-300 hover:text-white backdrop-blur"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="badge bg-cyan-500/10 text-cyan-400">{PART_CATEGORIES[selected.category]}</span>
                <span className="badge bg-slate-800 text-slate-300">{PART_CONDITIONS[selected.condition]}</span>
                {selected.brand && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Tag className="w-3 h-3" /> {selected.brand}
                  </span>
                )}
              </div>

              <h2 className="mb-2 break-words text-xl font-bold text-white sm:text-2xl">{selected.title}</h2>
              <p className="mb-5 whitespace-pre-wrap break-words text-sm text-slate-300">{selected.description}</p>
              {selected.compatible_motorcycles && (
                <div className="mb-5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <p className="text-xs font-semibold text-cyan-300">Modelos compatibles</p>
                  <p className="mt-1 text-sm text-slate-300">{selected.compatible_motorcycles}</p>
                </div>
              )}

              {/* Vendedor Box */}
              <div className="mb-5 rounded-xl border border-slate-700/60 bg-slate-800/60 p-3 sm:p-4">
                <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-200 overflow-hidden shrink-0">
                      {selected.seller?.avatar_url ? (
                        <img src={selected.seller.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (selected.seller?.full_name || 'V').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-white">{selected.seller?.business_name || selected.seller?.full_name || 'Vendedor'}</p>
                      {selected.seller?.business_name && <p className="text-xs text-slate-400">{selected.seller.full_name}</p>}
                      {selected.seller?.store_location && (
                        <p className="mt-0.5 flex items-start gap-1 break-words text-xs text-slate-400">
                          <MapPin className="w-3 h-3 text-slate-500" /> {selected.seller.store_location}
                        </p>
                      )}
                      {selected.seller?.store_latitude != null && selected.seller?.store_longitude != null && (
                        <a
                          href={googleMapsUrl(selected.seller.store_latitude, selected.seller.store_longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          <MapPin className="h-3 w-3" /> Ver ubicación en Google Maps
                        </a>
                      )}
                      {selected.seller?.business_details && <p className="mt-2 max-w-md break-words text-xs text-slate-400">{selected.seller.business_details}</p>}
                    </div>
                  </div>

                  <SellerRatingDisplay
                    avgRating={sellerStats[selected.user_id]?.avg_rating || 0}
                    totalRatings={sellerStats[selected.user_id]?.total_ratings || 0}
                    size="md"
                  />
                </div>
              </div>

              {/* Reseñas / Calificaciones */}
              <div className="mb-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> Reseñas de este repuesto (
                    {partRatings.length})
                  </h3>

                  {profile && profile.id !== selected.user_id && (
                    <button
                      type="button"
                      onClick={() => setShowRatingModal(true)}
                      className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-semibold"
                    >
                      {userRatingForPart ? 'Editar mi calificación' : 'Calificar vendedor'}
                    </button>
                  )}
                </div>

                {loadingRatings ? (
                  <div className="py-4 text-center">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : partRatings.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-900/40 p-3 rounded-lg text-center">
                    Aún no hay calificaciones para este repuesto. ¡Sé el primero en calificar al vendedor!
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    {partRatings.map((r) => (
                      <div key={r.id} className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-200">
                              {r.buyer?.full_name || 'Comprador'}
                            </span>
                            {r.buyer_id === profile?.id && (
                              <span className="badge bg-orange-500/10 text-orange-400 text-[10px] py-0">Tú</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((st) => (
                              <Star
                                key={st}
                                className={`w-3 h-3 ${
                                  st <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        {r.comment && <p className="text-xs text-slate-400 mt-1">{r.comment}</p>}
                        <span className="text-[10px] text-slate-600 block mt-1">
                          {new Date(r.created_at).toLocaleDateString('es', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Price & Action */}
              <div className="flex flex-col gap-4 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-400 flex items-center gap-1">
                    <DollarSign className="w-5 h-5" />
                    {selected.price.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Stock disponible: {selected.stock} unidad(es)</p>
                </div>

                {profile?.id !== selected.user_id ? (
                  <button
                    type="button"
                    onClick={() => handleContactSeller(selected)}
                    disabled={startingChat}
                    className="btn-primary w-full sm:w-auto"
                  >
                    {startingChat ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <MessageSquare className="w-4 h-4" />
                    )}
                    Contactar vendedor
                  </button>
                ) : (
                  <span className="badge bg-orange-500/10 text-orange-400 flex items-center gap-1.5 py-1.5 px-3">
                    <CheckCircle className="w-4 h-4" /> Tu publicación
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat modal */}
      {activeChat && (
        <ChatModal
          conversationId={activeChat.conversationId}
          part={activeChat.part}
          otherUser={activeChat.otherUser}
          onClose={() => setActiveChat(null)}
        />
      )}

      {/* Rating modal */}
      {showRatingModal && selected && (
        <SellerRatingModal
          sellerId={selected.user_id}
          sellerName={selected.seller?.business_name || selected.seller?.full_name || 'Vendedor'}
          partId={selected.id}
          partTitle={selected.title}
          existing={userRatingForPart}
          onClose={() => setShowRatingModal(false)}
          onSaved={() => {
            load();
            if (selected) {
              setSelected({ ...selected });
            }
          }}
        />
      )}
    </div>
  );
}
