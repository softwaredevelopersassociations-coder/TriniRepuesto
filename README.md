# TriniRepuesto

Aplicación web para clientes que registran sus motocicletas y llevan su historial de mantenimiento, además de vendedores que publican repuestos. Incluye marketplace, mensajería y gestión de productos.

Los perfiles disponibles son **Cliente** (motos y mantenimiento) y **Vender** (publicaciones y gestión de repuestos). Ambos pueden usar el marketplace y los mensajes.

## Requisitos

- Node.js y npm
- Un proyecto de Supabase
- Una clave de Google Maps JavaScript API (opcional; se usa para mostrar el mapa de Google en el perfil)

## Instalación y ejecución

```bash
npm install
```

Crea un archivo `.env` en la raíz del proyecto con estas variables:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON
VITE_GOOGLE_MAPS_API_KEY=TU_CLAVE_DE_GOOGLE_MAPS
```

La clave de Google Maps es opcional. Sin ella, la aplicación conserva la ubicación guardada y puede mostrar el enlace para abrirla en Google Maps, pero no carga el mapa incrustado.

Inicia la aplicación en desarrollo:

```bash
npm run dev
```

Para generar la versión de producción:

```bash
npm run build
```

## Base de datos

Las migraciones SQL se encuentran en `supabase/migrations/`. Aplícalas en orden en el proyecto Supabase antes de usar la aplicación. No publiques las credenciales del archivo `.env`.
