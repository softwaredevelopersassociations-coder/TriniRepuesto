import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Boxes, Check, Coins, Filter, Loader2, Minus, Package, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PART_CATEGORIES } from '@/lib/constants';
import { formatCurrency } from '@/lib/currency';
import type { Part, PartCategory } from '@/types';

type CartLine = {
  product: SaleProduct;
  quantity: string;
  attention?: string;
};

type SaleProduct = Pick<Part, 'id' | 'title' | 'description' | 'compatible_motorcycles' | 'category' | 'brand' | 'stock' | 'image_url' | 'price'> & {
  sku?: string | null;
};

type SaleHistoryItem = {
  part_id: string | null;
  product_title: string;
  quantity: number;
  unit_price: number | null;
};

type SaleHistoryEntry = {
  id: string;
  created_at: string;
  items: SaleHistoryItem[];
};

type ProductSalesTotal = {
  aggregation_key: string;
  product_title: string;
  quantity_sold: number;
  total_amount: number;
  has_unknown_price: boolean;
};

function localDateKey(dateTime: string) {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function fetchAvailableProducts(sellerId: string): Promise<{ products: SaleProduct[]; error: string | null; stockLoaded: boolean }> {
  const [partsResult, inventoryResult] = await Promise.all([
    supabase
      .from('parts')
      .select('id,title,description,compatible_motorcycles,category,brand,stock,image_url,price')
      .eq('user_id', sellerId)
      .gt('stock', 0)
      .neq('status', 'sold')
      .order('title', { ascending: true }),
    supabase
      .from('part_inventory')
      .select('part_id,sku')
      .eq('user_id', sellerId),
  ]);

  if (partsResult.error) {
    return {
      products: [],
      error: 'No se pudieron cargar los productos disponibles. ' + partsResult.error.message,
      stockLoaded: false,
    };
  }

  const inventoryByPart = new Map((inventoryResult.data || []).map((entry) => [entry.part_id, entry]));
  const products = ((partsResult.data as SaleProduct[]) || []).map((product) => ({
    ...product,
    sku: inventoryByPart.get(product.id)?.sku ?? null,
  }));
  const error = inventoryResult.error
    ? inventoryResult.error.code === '42P01'
      ? 'Falta la tabla privada de inventario. Aplica la migración 20261031010000_add_inventory_fields.sql.'
      : inventoryResult.error.message
    : null;

  return { products, error, stockLoaded: true };
}

export default function SalesView({
  onSaleRegistered,
  onShowProducts,
}: {
  onSaleRegistered: () => Promise<void>;
  onShowProducts: () => void;
}) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PartCategory | 'all'>('all');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [saving, setSaving] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleSuccess, setSaleSuccess] = useState<string | null>(null);
  const [salesHistory, setSalesHistory] = useState<SaleHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const submissionLock = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableProducts = async () => {
      if (!profile?.id) {
        setProducts([]);
        setCart({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      if (cancelled) return;
      const result = await fetchAvailableProducts(profile.id);
      if (cancelled) return;
      setProducts(result.products);
      setError(result.error);
      setLoading(false);
    };

    void loadAvailableProducts();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    const loadSalesHistory = async () => {
      if (!profile?.id) {
        setSalesHistory([]);
        setHistoryError(null);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const { data: sales, error: salesQueryError } = await supabase
          .from('sales')
          .select('id,created_at')
          .eq('seller_id', profile.id)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (salesQueryError) throw new Error(salesQueryError.message);

        if (!sales?.length) {
          setSalesHistory([]);
          return;
        }

        const saleIds = sales.map((sale) => sale.id);
        const { data: items, error: itemsQueryError } = await supabase
          .from('sale_items')
          .select('sale_id,part_id,product_title,quantity,unit_price')
          .in('sale_id', saleIds);

        if (cancelled) return;
        if (itemsQueryError) throw new Error(itemsQueryError.message);

        const itemsBySale = new Map<string, SaleHistoryItem[]>();
        (items || []).forEach((item) => {
          const saleItems = itemsBySale.get(item.sale_id) || [];
          const saleItem = {
            part_id: item.part_id,
            product_title: item.product_title,
            quantity: item.quantity,
            unit_price: item.unit_price === null ? null : Number(item.unit_price),
          };
          saleItems.push(saleItem);
          itemsBySale.set(item.sale_id, saleItems);
        });

        const chronologicalSales = [...sales].sort((first, second) =>
          new Date(first.created_at).getTime() - new Date(second.created_at).getTime(),
        );
        setSalesHistory(chronologicalSales.map((sale) => ({
          id: sale.id,
          created_at: sale.created_at,
          items: itemsBySale.get(sale.id) || [],
        })));
      } catch (loadError) {
        if (cancelled) return;
        setSalesHistory([]);
        setHistoryError(loadError instanceof Error
          ? loadError.message
          : 'Ocurrió un error inesperado al cargar el historial.');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    void loadSalesHistory();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, reloadKey]);

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [
      product.sku || '',
      product.title,
      product.description,
      product.brand || '',
      product.compatible_motorcycles || '',
    ].some((value) => value.toLocaleLowerCase().includes(query));
    return matchesSearch && (categoryFilter === 'all' || product.category === categoryFilter);
  });

  const filteredSalesHistory = salesHistory.flatMap((sale) => {
    const saleDate = localDateKey(sale.created_at);
    if ((historyDateFrom && saleDate < historyDateFrom) || (historyDateTo && saleDate > historyDateTo)) return [];

    const query = historySearch.trim().toLocaleLowerCase();
    const matchingItems = sale.items.filter((item) =>
      !query || item.product_title.toLocaleLowerCase().includes(query),
    );
    return matchingItems.length > 0 ? [{ ...sale, items: matchingItems }] : [];
  });

  const filteredTotalsByProduct = new Map<string, ProductSalesTotal>();
  filteredSalesHistory.forEach((sale) => {
    sale.items.forEach((item) => {
      const titleKey = item.product_title.trim().toLocaleLowerCase();
      const aggregationKey = item.part_id ? `part:${item.part_id}` : `deleted:${titleKey}`;
      const previousTotal = filteredTotalsByProduct.get(aggregationKey);
      filteredTotalsByProduct.set(aggregationKey, {
        aggregation_key: aggregationKey,
        product_title: previousTotal?.product_title ?? item.product_title,
        quantity_sold: (previousTotal?.quantity_sold ?? 0) + item.quantity,
        total_amount: (previousTotal?.total_amount ?? 0) + (item.unit_price ?? 0) * item.quantity,
        has_unknown_price: (previousTotal?.has_unknown_price ?? false) || item.unit_price === null,
      });
    });
  });
  const filteredProductSalesTotals = [...filteredTotalsByProduct.values()].sort((first, second) =>
    first.product_title.localeCompare(second.product_title, 'es'),
  );

  const allTimeTotalsByProduct = new Map<string, ProductSalesTotal>();
  salesHistory.forEach((sale) => {
    sale.items.forEach((item) => {
      const titleKey = item.product_title.trim().toLocaleLowerCase();
      const aggregationKey = item.part_id ? `part:${item.part_id}` : `deleted:${titleKey}`;
      const previousTotal = allTimeTotalsByProduct.get(aggregationKey);
      allTimeTotalsByProduct.set(aggregationKey, {
        aggregation_key: aggregationKey,
        product_title: previousTotal?.product_title ?? item.product_title,
        quantity_sold: (previousTotal?.quantity_sold ?? 0) + item.quantity,
        total_amount: (previousTotal?.total_amount ?? 0) + (item.unit_price ?? 0) * item.quantity,
        has_unknown_price: (previousTotal?.has_unknown_price ?? false) || item.unit_price === null,
      });
    });
  });
  const salesTotalsByPartId = new Map(
    [...allTimeTotalsByProduct.values()]
      .filter((total) => total.aggregation_key.startsWith('part:'))
      .map((total) => [total.aggregation_key.slice('part:'.length), total]),
  );
  const totalAvailableUnits = products.reduce((total, product) => total + product.stock, 0);
  const totalSoldUnits = salesHistory.reduce(
    (total, sale) => total + sale.items.reduce((saleTotal, item) => saleTotal + item.quantity, 0),
    0,
  );
  const totalSalesAmount = salesHistory.reduce(
    (total, sale) => total + sale.items.reduce(
      (saleTotal, item) => saleTotal + (item.unit_price ?? 0) * item.quantity,
      0,
    ),
    0,
  );
  const hasSalesWithoutPrice = salesHistory.some((sale) => sale.items.some((item) => item.unit_price === null));

  const addToCart = (product: SaleProduct) => {
    setSaleError(null);
    setSaleSuccess(null);
    setCart((current) => current[product.id]
      ? current
      : { ...current, [product.id]: { product, quantity: '1' } });
  };

  const changeCartQuantity = (productId: string, quantity: string) => {
    setSaleError(null);
    setSaleSuccess(null);
    setCart((current) => {
      const line = current[productId];
      if (!line) return current;
      return { ...current, [productId]: { ...line, quantity, attention: undefined } };
    });
  };

  const adjustCartQuantity = (product: SaleProduct, adjustment: number) => {
    const currentQuantity = Number(cart[product.id]?.quantity);
    const startingQuantity = Number.isInteger(currentQuantity) && currentQuantity > 0 ? currentQuantity : 1;
    const nextQuantity = Math.min(product.stock, Math.max(1, startingQuantity + adjustment));
    changeCartQuantity(product.id, String(nextQuantity));
  };

  const cartProducts = Object.entries(cart).map(([productId, line]) => ({
    product: products.find((entry) => entry.id === productId)
      ?? (line.attention?.startsWith('No se pudo verificar el stock actual')
        ? line.product
        : { ...line.product, stock: 0 }),
    quantity: line.quantity,
    attention: line.attention,
  }));
  const cartIsValid = cartProducts.length > 0 && cartProducts.every(({ product, quantity, attention }) => {
    const numericQuantity = Number(quantity);
    return !attention && Number.isInteger(numericQuantity) && numericQuantity > 0 && numericQuantity <= product.stock;
  });

  const handleRegisterSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionLock.current || !profile?.id) return;

    if (!cartIsValid) {
      setSaleError('Revisa las cantidades: deben ser enteras y no superar el stock disponible.');
      return;
    }

    submissionLock.current = true;
    setSaving(true);
    setSaleError(null);
    setSaleSuccess(null);

    const submittedItems = cartProducts.map((line) => ({
      product: line.product,
      quantity: line.quantity,
    }));

    const markCartAttention = (availableProducts: SaleProduct[] | null) => {
      const diagnostics = submittedItems.map(({ product, quantity }) => {
        const currentProduct = availableProducts?.find((entry) => entry.id === product.id);
        const requestedQuantity = Number(quantity);
        let attention: string;
        if (availableProducts === null) {
          attention = 'No se pudo verificar el stock actual. Vuelve a intentarlo.';
        } else if (!currentProduct) {
          attention = 'El producto ya no está disponible. Stock actual: 0.';
        } else if (currentProduct.stock < requestedQuantity) {
          attention = `Stock actual: ${currentProduct.stock}; cantidad solicitada: ${requestedQuantity}.`;
        } else {
          attention = 'El registro fue rechazado. Verifica este producto e inténtalo de nuevo.';
        }
        return { product, attention, currentProduct, quantityIssue: !currentProduct || currentProduct.stock < requestedQuantity };
      });
      const specificIssues = diagnostics.filter((diagnostic) => diagnostic.quantityIssue);
      const diagnosticsToShow = specificIssues.length > 0 ? specificIssues : diagnostics;

      setCart((current) => {
        const next = { ...current };
        diagnosticsToShow.forEach(({ product, attention, currentProduct }) => {
          const line = next[product.id];
          if (!line) return;

          next[product.id] = {
            ...line,
            product: currentProduct ?? (availableProducts
              ? { ...line.product, stock: 0 }
              : line.product),
            attention,
          };
        });
        return next;
      });
    };

    try {
      const { error: rpcError } = await supabase.rpc('register_sale', {
        p_items: submittedItems.map(({ product, quantity }) => ({
          part_id: product.id,
          quantity: Number(quantity),
        })),
      });

      if (rpcError) {
        try {
          const freshProducts = await fetchAvailableProducts(profile.id);
          setProducts(freshProducts.products);
          setError(freshProducts.error);
          markCartAttention(freshProducts.stockLoaded ? freshProducts.products : null);
        } catch {
          markCartAttention(null);
        }
        setSaleError(`No se registró la venta. Revisa las líneas marcadas. ${rpcError.message}`);
        return;
      }

      setCart({});
      setSaleSuccess('Venta registrada correctamente.');
      setReloadKey((current) => current + 1);
      try {
        await onSaleRegistered();
      } catch {
        setSaleError('La venta se registró, pero no se pudo actualizar la lista de productos.');
      }
    } catch (registerError) {
      markCartAttention(null);
      setSaleError(registerError instanceof Error
        ? `No se pudo confirmar el registro. Revisa las líneas marcadas. ${registerError.message}`
        : 'No se pudo confirmar el registro. Revisa las líneas marcadas e inténtalo de nuevo.');
      setReloadKey((current) => current + 1);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="sales-section-title">
      <div className="mb-5">
        <h2 id="sales-section-title" className="text-lg font-semibold text-white">Ventas</h2>
        <p className="mt-1 text-sm text-slate-400">Registra las cantidades vendidas y consulta tus totales por producto.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SalesMetric icon={Boxes} label="Productos disponibles" value={String(products.length)} />
            <SalesMetric icon={Package} label="Unidades disponibles" value={String(totalAvailableUnits)} />
            <SalesMetric icon={ShoppingCart} label="Unidades vendidas" value={historyLoading || historyError ? '—' : String(totalSoldUnits)} />
            <SalesMetric icon={Coins} label="Total vendido" value={historyLoading || historyError ? '—' : formatCurrency(totalSalesAmount)} />
          </div>
          {!historyLoading && !historyError && hasSalesWithoutPrice && (
            <p className="-mt-3 mb-5 text-xs text-slate-500">El total suma los precios guardados. Las ventas anteriores sin precio aparecen como “No registrado”.</p>
          )}

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.75fr)]">
            <div>
              {products.length === 0 ? (
                <div className="card flex min-h-64 flex-col items-center justify-center p-6 text-center sm:p-8">
                  <Boxes className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                  <h3 className="mb-2 font-semibold text-white">No hay productos disponibles para vender</h3>
                  <p className="mb-5 max-w-sm text-sm text-slate-400">Agrega unidades desde Productos y aparecerán aquí para registrar sus ventas.</p>
                  <button type="button" onClick={onShowProducts} className="btn-secondary justify-center">
                    <Package className="h-4 w-4" />
                    Ir a Productos
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        className="input pl-10"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por código, nombre, marca o modelo..."
                        aria-label="Buscar productos disponibles"
                      />
                    </div>
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <select
                        className="input pl-10"
                        value={categoryFilter}
                        onChange={(event) => setCategoryFilter(event.target.value as PartCategory | 'all')}
                        aria-label="Filtrar por categoría"
                      >
                        <option value="all">Todas las categorías</option>
                        {Object.entries(PART_CATEGORIES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="mb-4 text-xs text-slate-500">{filteredProducts.length} de {products.length} productos disponibles</p>

                  {filteredProducts.length === 0 ? (
                    <div className="card p-10 text-center">
                      <p className="text-sm text-slate-400">No hay productos que coincidan con la búsqueda y la categoría.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                      {filteredProducts.map((product) => {
                        const inCart = Object.prototype.hasOwnProperty.call(cart, product.id);
                        return (
                          <article key={product.id} className="card group overflow-hidden transition hover:border-slate-700">
                            <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.title} className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-10 w-10 text-slate-600" />
                              )}
                              <span className="badge absolute left-2 top-2 bg-cyan-500/10 text-cyan-300">{PART_CATEGORIES[product.category]}</span>
                            </div>
                            <div className="p-4">
                              <h3 className="truncate font-semibold text-white">{product.title}</h3>
                              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                                <span className="text-slate-400">Precio</span>
                                <span className="font-semibold text-green-400">{formatCurrency(product.price)}</span>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-400">Stock disponible</span>
                                <span className="font-medium text-white">{product.stock}</span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-400">Unidades vendidas</span>
                                <span className="font-medium text-green-400">
                                  {historyLoading || historyError ? '—' : salesTotalsByPartId.get(product.id)?.quantity_sold ?? 0}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                                <span className="text-slate-400">Total vendido</span>
                                <span className="font-medium text-green-400">
                                  {productSalesTotalLabel(salesTotalsByPartId.get(product.id), historyLoading, historyError)}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => addToCart(product)}
                                disabled={inCart || saving}
                                className="btn-secondary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                                {inCart ? 'En el carrito' : 'Agregar al carrito'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <aside aria-labelledby="sales-cart-title" className="card p-4 xl:sticky xl:top-4 xl:p-5">
              <div className="mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-orange-400" />
                <h3 id="sales-cart-title" className="text-base font-semibold text-white">Carrito de venta</h3>
              </div>

              {saleError && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{saleError}</p>}
              {saleSuccess && <p role="status" className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">{saleSuccess}</p>}

              <form onSubmit={handleRegisterSale}>
                {cartProducts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
                    Agrega productos para preparar la venta.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {cartProducts.map(({ product, quantity, attention }) => {
                      const numericQuantity = Number(quantity);
                      const quantityWithinStock = Number.isInteger(numericQuantity)
                        && numericQuantity > 0
                        && numericQuantity <= product.stock;
                      const validQuantity = quantityWithinStock && !attention;
                      const lineError = attention || (!quantityWithinStock
                        ? `Ingresa una cantidad entera entre 1 y ${product.stock}.`
                        : null);
                      const quantityInputId = `sale-quantity-${product.id}`;

                      return (
                        <li key={product.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-white">{product.title}</p>
                              <p className="mt-1 text-xs text-slate-400">Stock disponible: {product.stock}</p>
                              <p className="mt-1 text-xs text-slate-400">Precio: <span className="text-slate-200">{formatCurrency(product.price)}</span></p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSaleError(null);
                                setSaleSuccess(null);
                                setCart((current) => {
                                  const next = { ...current };
                                  delete next[product.id];
                                  return next;
                                });
                              }}
                              disabled={saving}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Quitar ${product.title} del carrito`}
                              title="Quitar del carrito"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <label htmlFor={quantityInputId} className="text-sm text-slate-400">Cantidad</label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => adjustCartQuantity(product, -1)}
                                disabled={saving || numericQuantity <= 1}
                                className="rounded-md border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Disminuir cantidad de ${product.title}`}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                id={quantityInputId}
                                className={`input w-20 px-2 text-center ${validQuantity ? '' : 'border-red-500 focus:border-red-500'}`}
                                type="number"
                                min="1"
                                max={product.stock}
                                step="1"
                                value={quantity}
                                onChange={(event) => changeCartQuantity(product.id, event.target.value)}
                                disabled={saving}
                                aria-invalid={!validQuantity}
                                aria-describedby={lineError ? `${quantityInputId}-error` : undefined}
                              />
                              <button
                                type="button"
                                onClick={() => adjustCartQuantity(product, 1)}
                                disabled={saving || numericQuantity >= product.stock}
                                className="rounded-md border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Aumentar cantidad de ${product.title}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
                            <span className="text-slate-400">Subtotal</span>
                            <span className="font-semibold text-green-400">
                              {formatCurrency(product.price * (Number.isInteger(numericQuantity) && numericQuantity > 0 ? numericQuantity : 0))}
                            </span>
                          </div>
                          {lineError && (
                            <p id={`${quantityInputId}-error`} role="alert" className="mt-2 text-xs text-red-400">
                              {lineError}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {cartProducts.length > 0 && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4">
                    <span className="font-semibold text-white">Total de la venta</span>
                    <span className="text-lg font-bold text-green-400">
                      {formatCurrency(cartProducts.reduce((total, line) => {
                        const quantity = Number(line.quantity);
                        return total + line.product.price * (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
                      }, 0))}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !cartIsValid}
                  className="btn-primary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  aria-busy={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {saving ? 'Registrando venta...' : 'Registrar venta'}
                </button>
              </form>
            </aside>
          </div>

          <section aria-labelledby="sales-history-title" className="mt-8">
            <h3 id="sales-history-title" className="mb-4 text-lg font-semibold text-white">Historial de ventas</h3>
            {historyError && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">No se pudo cargar el historial. {historyError}</p>}
            {!historyLoading && !historyError && salesHistory.length > 0 && (
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)_minmax(10rem,0.45fr)]">
                <div>
                  <label htmlFor="sales-history-search" className="label">Buscar producto</label>
                  <input
                    id="sales-history-search"
                    className="input"
                    type="search"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Nombre del producto"
                  />
                </div>
                <div>
                  <label htmlFor="sales-history-from" className="label">Desde</label>
                  <input
                    id="sales-history-from"
                    className="input"
                    type="date"
                    value={historyDateFrom}
                    onChange={(event) => setHistoryDateFrom(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="sales-history-to" className="label">Hasta</label>
                  <input
                    id="sales-history-to"
                    className="input"
                    type="date"
                    value={historyDateTo}
                    onChange={(event) => setHistoryDateTo(event.target.value)}
                  />
                </div>
              </div>
            )}
            {!historyLoading && !historyError && filteredProductSalesTotals.length > 0 && (
              <section aria-labelledby="product-sales-totals-title" className="mb-6">
                <h4 id="product-sales-totals-title" className="mb-3 text-sm font-semibold text-slate-300">
                  {historyDateFrom || historyDateTo
                    ? 'Total vendido en el periodo'
                    : historySearch.trim()
                      ? 'Total vendido en los resultados'
                      : 'Total vendido por producto'}
                </h4>
                <div className="card divide-y divide-slate-800 px-4">
                  {filteredProductSalesTotals.map((total) => (
                    <div key={total.aggregation_key} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0 truncate text-slate-300">{total.product_title}</span>
                      <span className="shrink-0 text-right">
                        <span className="block text-slate-300">{total.quantity_sold} unidades</span>
                        <span className="block text-xs font-medium text-green-400">
                          {total.has_unknown_price
                            ? total.total_amount > 0
                              ? `Parcial: ${formatCurrency(total.total_amount)}`
                              : 'Precio no registrado'
                            : formatCurrency(total.total_amount)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {historyLoading ? (
              <div role="status" className="flex items-center gap-2 py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                Cargando historial...
              </div>
            ) : historyError ? null : salesHistory.length === 0 ? (
              <div role="status" className="card p-6 text-center text-sm text-slate-500">Todavía no hay registros de ventas.</div>
            ) : filteredSalesHistory.length === 0 ? (
              <div className="card p-6 text-center text-sm text-slate-500">No hay ventas que coincidan con la búsqueda y las fechas.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {filteredSalesHistory.map((sale) => (
                  <article key={sale.id} className="card p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <time dateTime={sale.created_at} className="text-xs text-slate-500">
                        {new Date(sale.created_at).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}
                      </time>
                      <span className="shrink-0 text-right text-sm font-semibold text-green-400">{saleTotalLabel(sale.items)}</span>
                    </div>
                    <ul className="space-y-2">
                      {sale.items.map((item, index) => (
                        <li key={`${sale.id}-${index}`} className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate text-slate-300">{item.product_title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.quantity} × {item.unit_price === null ? 'Precio no registrado' : formatCurrency(item.unit_price)}
                            </p>
                          </div>
                          <span className="shrink-0 text-slate-200">
                            {item.unit_price === null ? '—' : formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function SalesMetric({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-orange-400" />
        <span className="truncate text-xs text-slate-400">{label}</span>
      </div>
      <p className="truncate text-lg font-bold text-white sm:text-xl">{value}</p>
    </div>
  );
}

function saleTotalLabel(items: SaleHistoryItem[]) {
  const pricedItems = items.filter((item) => item.unit_price !== null);
  if (pricedItems.length === 0) return 'Total no disponible';

  const total = pricedItems.reduce((amount, item) => amount + (item.unit_price ?? 0) * item.quantity, 0);
  return pricedItems.length < items.length
    ? `Total parcial: ${formatCurrency(total)}`
    : `Total: ${formatCurrency(total)}`;
}

function productSalesTotalLabel(total: ProductSalesTotal | undefined, loading: boolean, error: string | null) {
  if (loading || error) return '—';
  if (!total) return formatCurrency(0);
  if (total.has_unknown_price) {
    return total.total_amount > 0 ? `Parcial: ${formatCurrency(total.total_amount)}` : 'Precio no registrado';
  }
  return formatCurrency(total.total_amount);
}
