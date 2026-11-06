# Plan de ejecución: Productos y ventas

**Proyecto:** TriniRepuesto  
**Fecha:** 6 de noviembre de 2026  
**Propósito:** convertir la lista de cambios solicitada en tareas ordenadas, verificables y con sus dependencias visibles.

## 1. Resultado esperado

1. Los perfiles de vendedor dejan de ver y abrir el módulo Marketplace. Los perfiles de cliente conservan el Marketplace.
2. El módulo del vendedor aparece como **Productos y ventas**.
3. La página se divide en dos subsecciones: **Productos** y **Ventas**. Productos conserva la gestión existente; Ventas queda como una página inicial vacía o informativa para desarrollarla después.
4. El formulario de producto deja de pedir **Código interno** y **Compatible con**.
5. Los productos nuevos se publican directamente al guardarlos, sujetos a que tengan stock.
6. Los importes visibles en el sistema se expresan en bolivianos como **Bs**.

## 2. Situación actual revisada

- El menú global agrega Marketplace sin distinguir el rol. La opción de vendedor se llama **Inventario**.
- `App.tsx` también puede renderizar Marketplace cuando la pestaña activa es `marketplace`; esa ruta necesita una protección por rol además de ocultar el botón.
- La gestión de productos vive en `MyPartsView.tsx`. En el formulario se cargan SKU, compatibilidad y estado de publicación; la información del SKU se guarda en `part_inventory` y la compatibilidad en `parts`.
- La búsqueda de Marketplace para clientes usa `compatible_motorcycles`. Eliminar el campo del formulario afecta la clasificación automática de los productos nuevos.
- La interfaz muestra importes en `MyPartsView.tsx`, `Overview.tsx`, `MarketplaceView.tsx` y `ChatModal.tsx`.
- La página de productos ya puede cambiar el estado de publicaciones desde las tarjetas; se puede conservar ese control para retirar o volver a publicar productos después de crearlos.

## 3. Decisiones que deben respetarse durante la implementación

### 3.1 Compatibilidad con motocicletas

Al quitar **Compatible con** del registro, los productos nuevos ya no tendrán ese dato. El filtro por moto del Marketplace de clientes depende de dicho dato.

**Recomendación para esta entrega:** retirar el campo del formulario y conservar la columna y los valores existentes en Supabase. El filtro seguirá funcionando para productos que ya tengan compatibilidad registrada; los nuevos no aparecerán como coincidencia específica hasta que se defina otro método de compatibilidad. No borrar la columna ni los valores históricos en esta etapa.

Si se requiere que los productos nuevos también sean compatibles con el filtro por moto, ese trabajo debe añadirse al alcance con un catálogo o relación de compatibilidades que no dependa de un campo libre en el formulario.

### 3.2 Publicación directa

Para productos nuevos, establecer `status = active` y guardar/publicar en una sola acción. Mantener la publicación condicionada a stock mayor que cero. Al editar un producto existente, conservar su estado actual; publicar o retirar después mediante el control de la tarjeta.

### 3.3 Moneda

Cambiar el formato mostrado a bolivianos sin convertir los valores almacenados. Antes de desplegar, confirmar que los importes actuales ya representan bolivianos; cambiar la etiqueta de moneda no convierte dólares a bolivianos.

**Resultado de la revisión (6 de noviembre de 2026): pendiente de confirmación.** En las migraciones de esta aplicación, `parts.price` y `part_inventory.purchase_cost` son columnas `numeric(10,2)` sin campo de moneda ni una unidad documentada. La interfaz actual las presenta con `$`, pero eso no demuestra en qué moneda se introdujeron los datos. El campo `proveedor.moneda` con valor predeterminado `USD` que aparece en `supabase/inventario_multisede_supabase.sql` corresponde a la tabla de proveedores de ese esquema separado y no determina la moneda de estos dos campos.

**Para confirmar:** comparar un producto y su costo guardados con el importe real que el vendedor reconoce en Bs. Hasta hacer esa comprobación, no cambiar el símbolo visible ni convertir valores.

### 3.4 Página Ventas

Crear solo navegación y estado vacío de la subsección. No añadir tablas, migraciones ni operaciones de venta en esta entrega, porque su contenido se desarrollará después.

## 4. Ejecución paso a paso

### Fase 0 — Preparación y línea base

1. Revisar el estado actual de Git y conservar cualquier cambio de trabajo existente.
2. Revisar el menú en `DashboardLayout.tsx`, la selección de página en `App.tsx`, el formulario y las tarjetas en `MyPartsView.tsx`, las búsquedas de Marketplace y los formatos monetarios.
3. Confirmar con datos de prueba los roles `client` y `seller`, y registrar qué pantallas ve cada uno antes del cambio.
4. Confirmar que los valores existentes de `parts.price` y `part_inventory.purchase_cost` se interpretan como Bs.
5. Registrar la decisión de compatibilidad descrita en 3.1 antes de cambiar el formulario.

**Salida:** alcance confirmado y valores de referencia para comparar el resultado.

### Fase 1 — Ocultar Marketplace al vendedor

1. En `DashboardLayout.tsx`, agregar la opción Marketplace al menú solo cuando `profile.role === 'client'`.
2. Cambiar el texto del elemento vendedor de **Inventario** a **Productos y ventas**.
3. En `App.tsx`, proteger `case 'marketplace'`: renderizar Marketplace solo para clientes.
4. Definir el destino de respaldo si un vendedor llega a la pestaña `marketplace` por un estado antiguo: abrir `my-parts` o `overview`; usar el mismo destino en todos los casos.
5. Revisar que el menú móvil y el menú lateral usen la misma lista de opciones y que ninguno muestre Marketplace al vendedor.
6. Buscar botones y enlaces secundarios que puedan dirigir a un vendedor a Marketplace; retirar o redirigir solo los de vendedor.

**Criterios de aceptación:**
- Cliente: Marketplace sigue visible y accesible.
- Vendedor: Marketplace no aparece en escritorio ni en móvil.
- Si la pestaña activa del vendedor fuera Marketplace, se muestra el destino de respaldo en lugar del catálogo.

### Fase 2 — Renombrar el módulo y dividirlo en subsecciones

1. En la navegación, mostrar **Productos y ventas** para el vendedor.
2. En `MyPartsView.tsx` o en un contenedor dedicado, crear una navegación secundaria con **Productos** y **Ventas**.
3. Mover o conservar toda la interfaz existente de registro, listado, búsqueda, filtros y stock bajo **Productos**.
4. Hacer que **Productos** sea la subsección inicial al abrir el módulo.
5. Crear en **Ventas** una vista inicial con título, explicación breve de que esta sección se habilitará posteriormente y un estado vacío coherente con el diseño actual.
6. No mostrar datos ficticios ni botones de registrar ventas mientras no exista la lógica.
7. Asegurar que ambas subsecciones funcionen en tamaños de pantalla pequeños y que se distingan del menú principal.

**Criterios de aceptación:**
- El menú y encabezado identifican el módulo como **Productos y ventas**.
- Productos conserva las operaciones que ya funcionaban.
- Ventas abre una página vacía informativa y no realiza consultas ni escrituras a tablas inexistentes.

### Fase 3 — Quitar Código interno y Compatible con del registro

1. Retirar los dos controles del formulario de alta y edición de productos.
2. Eliminar `sku` y `compatible_motorcycles` del estado local del formulario, sus inicializadores y la preparación de datos para editar.
3. Eliminar el envío y validación de SKU en el `upsert` de `part_inventory`; mantener intactos `purchase_cost` y `minimum_stock`.
4. No incluir `compatible_motorcycles` en el `UPDATE` de un producto existente para no sobrescribir los valores históricos con una cadena vacía.
5. En altas nuevas, dejar que Supabase aplique el valor por defecto de la columna de compatibilidad. Confirmar que la tabla tiene un `DEFAULT` y una restricción compatible; si no, preparar una migración pequeña y reversible antes del despliegue.
6. Retirar SKU y compatibilidad de las tarjetas, filtros y textos del módulo del vendedor si ya no existe manera de administrarlos desde la interfaz.
7. Mantener las columnas existentes en la base de datos durante esta entrega; no eliminar ni limpiar datos históricos.
8. Revisar en `MarketplaceView.tsx` el comportamiento del filtro por motocicleta según la decisión de compatibilidad de la sección 3.1.

**Criterios de aceptación:**
- El formulario de alta y edición ya no muestra esos dos parámetros.
- Crear o editar un producto no produce errores por omitirlos.
- Editar productos antiguos no borra accidentalmente su compatibilidad guardada.
- La búsqueda y los filtros restantes del módulo siguen funcionando.

### Fase 4 — Publicar directamente

1. Cambiar el estado inicial de productos nuevos a `active`.
2. Retirar el selector **Visibilidad** y el texto asociado del formulario.
3. Al crear un producto, guardar `status: 'active'` en el payload.
4. Mantener la validación que exige al menos una unidad de stock para publicar; mostrar el error junto al formulario.
5. Cambiar el botón de alta a **Publicar producto** o **Guardar y publicar** de forma consistente.
6. Al editar un producto, cargar y conservar su estado actual, aunque el campo de visibilidad ya no se muestre.
7. Mantener los controles de tarjeta para retirar una publicación, volver a publicarla si tiene stock y marcar como vendido según las opciones actuales.
8. Confirmar que los productos activos y con stock aparecen en Marketplace para clientes.

**Criterios de aceptación:**
- Un producto nuevo con stock se publica inmediatamente al guardarlo.
- Un producto sin stock no se publica y recibe un mensaje claro.
- Editar un producto retirado no lo vuelve a publicar de manera accidental.
- El vendedor conserva una forma de retirar una publicación existente.

### Fase 5 — Mostrar todos los importes en Bs

1. Crear o reutilizar una función única de formato monetario para evitar símbolos escritos manualmente.
2. Usar formato `es-BO` y moneda `BOB`, comprobando que la salida visible sea legible como **Bs 120,00** (o el formato local equivalente aprobado).
3. Aplicar el formato a precio de venta, costo de compra, costo total del inventario y métricas.
4. Aplicarlo también al precio en Marketplace, detalles del producto, inicio/resumen y tarjeta del producto en ChatModal.
5. Cambiar las etiquetas del formulario a **Precio de venta (Bs)** y **Costo de compra (Bs)**.
6. Retirar iconos `DollarSign` que se interpreten como moneda dólar; usar el texto **Bs** en su lugar.
7. Mantener ordenamientos numéricos por precio basados en el valor, no en el texto formateado.
8. Comprobar valores cero, enteros, decimales y números altos para evitar formatos inconsistentes.

**Criterios de aceptación:**
- No quedan precios ni costos mostrados con `$` o icono de dólar en las pantallas del producto.
- Los mismos valores numéricos se conservan antes y después del cambio; no se hace conversión automática.
- Ordenar por precio sigue produciendo el orden correcto.

### Fase 6 — Revisión final y despliegue

1. Ejecutar revisión estática y compilación de producción.
2. Revisar manualmente el rol cliente en móvil y escritorio: Marketplace visible, búsqueda y contacto operativos.
3. Revisar manualmente el rol vendedor en móvil y escritorio: sin Marketplace; Productos y ventas visible; Productos operativo; Ventas muestra su estado inicial.
4. Probar alta con stock y sin stock, edición de producto publicado y retirado, búsqueda/filtros y carga de fotografía.
5. Verificar productos existentes con SKU y compatibilidad: deben seguir guardados y editar el producto no debe borrar compatibilidad heredada.
6. Revisar importes en Bs en todas las pantallas enumeradas y comprobar el ordenamiento.
7. Aplicar únicamente una migración si la comprobación de `DEFAULT` revela que las altas nuevas no pueden omitir compatibilidad.
8. Publicar el cambio después de que el build pase y revisar el despliegue.

## 5. Archivos y componentes probables

- `src/components/DashboardLayout.tsx`: visibilidad de navegación por rol y etiqueta **Productos y ventas**.
- `src/App.tsx`: protección de la vista Marketplace por rol.
- `src/components/MyPartsView.tsx`: subsecciones Productos/Ventas, campos del formulario, estado de publicación y presentación del inventario.
- `src/components/MarketplaceView.tsx`: precios en Bs y efecto de retirar el campo de compatibilidad.
- `src/components/Overview.tsx`: precios en Bs del resumen.
- `src/components/ChatModal.tsx`: precio en Bs del producto asociado a la conversación.
- `src/lib/` (posible archivo `currency.ts`): función común de formato monetario.
- `src/types/index.ts` y migraciones: solo revisar; no eliminar columnas históricas sin una decisión y migración separada.

## 6. Fuera del alcance de esta entrega

- Registrar una venta, descontar stock por venta, emitir recibo o manejar devoluciones.
- Crear tablas, políticas RLS o reportes para ventas.
- Convertir importes almacenados de USD a BOB.
- Eliminar físicamente columnas o valores antiguos de SKU y compatibilidad.
- Añadir una base normalizada de compatibilidad de motos y repuestos.

## 7. Riesgos y cómo controlarlos

| Riesgo | Control previsto |
|---|---|
| Vendedor aún entra a Marketplace mediante estado anterior | Proteger el renderizado en `App.tsx`, además de ocultar el menú. |
| Productos nuevos dejan de coincidir con el filtro por moto | Conservar los datos existentes y decidir si el filtro queda limitado a registros históricos o se reemplaza por compatibilidad estructurada. |
| Al quitar el selector, editar publica de nuevo un producto retirado | Preservar el `status` actual en edición y probar ambos estados. |
| Publicación directa de producto sin stock | Mantener validación y mensaje visible. |
| Mostrar `Bs` sin cambiar una moneda almacenada en dólares | Confirmar qué representan los datos actuales antes de desplegar; formatear no convierte valores. |
| Quitar columnas afecta datos existentes o integraciones | No borrar columnas de Supabase en esta entrega; el cambio es de interfaz y payload. |

## 8. Registro de pantallas antes del cambio

**Revisión:** 6 de noviembre de 2026. Se recorrieron las condiciones actuales de rol en `DashboardLayout.tsx`, `App.tsx` y `Overview.tsx`, usando los siguientes perfiles ficticios para documentar el comportamiento esperado:

- **Fixture cliente:** `id = test-client-001`, `role = client`, una motocicleta Honda XR 150 modelo 2022 y acceso a dos productos activos de ejemplo.
- **Fixture vendedor:** `id = test-seller-001`, `role = seller`, negocio “Repuestos Prueba”, un producto activo con stock 4, otro inactivo y ninguna motocicleta registrada.

| Pantalla u opción | Cliente (`client`) | Vendedor (`seller`) | Evidencia en el comportamiento actual |
|---|---|---|---|
| Resumen | Visible; muestra bloque de motocicletas y botón para registrarlas si no tiene motos. | Visible; muestra métricas de productos y bloque de repuestos recientes. | `Overview.tsx` condiciona los bloques por `profile.role`. |
| Mis motos | Visible en menú; abre `MotorcyclesView`. | No aparece en menú; si se fuerza la pestaña, vuelve al Resumen. | `DashboardLayout.tsx` arma el menú por rol y `App.tsx` protege la vista. |
| Marketplace | Visible en menú; abre el catálogo para clientes. | También visible en menú y abre el mismo catálogo. | El menú agrega Marketplace sin condición; `App.tsx` renderiza la ruta sin comprobar rol. |
| Inventario | No aparece en menú; si se fuerza la pestaña, vuelve al Resumen. | Visible; abre `MyPartsView` con Productos/inventario. | `DashboardLayout.tsx` muestra el elemento solo al vendedor; `App.tsx` protege la ruta. |
| Mensajes | Visible. | Visible. | Se agrega a la navegación para cualquier perfil autenticado. |
| Mi perfil | Visible. | Visible. | Se agrega a la navegación para cualquier perfil autenticado. |
| Ventas | No existe como subsección. | No existe como subsección. | `MyPartsView.tsx` es una vista única actualmente. |

### Resultado de la comprobación

La simulación confirma que el vendedor actualmente sí puede abrir Marketplace; ocultar solo la opción del menú no bastará, también habrá que proteger `case 'marketplace'` en `App.tsx`. El cliente conserva el Marketplace y sus motos; el vendedor ve el área de inventario y sus propios productos en Resumen.

En el Marketplace, la consulta busca productos activos con stock de forma general, sin filtrar por `user_id`; por tanto, el fixture de vendedor vería productos activos del catálogo, incluidos potencialmente los propios. Este es el comportamiento previo a corregir.

**Alcance de esta comprobación:** simulación de navegación por rol y revisión de ramas del código con fixtures ficticios. No se crearon cuentas de autenticación ni registros en Supabase; por eso no verifica credenciales, políticas RLS, contenido real de cuentas ni permisos desplegados.

