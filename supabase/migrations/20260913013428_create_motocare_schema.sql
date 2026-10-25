/*
# MotoCare — esquema dual: mantenimiento + repuestos

## Resumen
Crea las tablas para un sistema de doble propósito:
1. **Mantenimiento de motocicletas** — usuarios (rol "mecánico/mantenedor") registran motocicletas, historial de mantenimiento y recordatorios.
2. **Marketplace de repuestos** — usuarios (rol "vendedor") publican repuestos; cualquier usuario puede verlos.

El sistema asigna el dashboard según el rol elegido al registrarse.

## Tablas nuevas

### profiles
- `id` (uuid, PK, referencia a auth.users)
- `email` (text)
- `full_name` (text)
- `role` (text: 'mechanic' | 'seller' | 'both')
- `phone` (text, opcional)
- `created_at` (timestamptz)

### motorcycles
- `id` (uuid, PK)
- `user_id` (uuid, FK a auth.users)
- `brand` (text)
- `model` (text)
- `year` (int)
- `plate` (text, opcional)
- `mileage` (int, opcional)
- `created_at` (timestamptz)

### maintenance_records
- `id` (uuid, PK)
- `motorcycle_id` (uuid, FK a motorcycles)
- `user_id` (uuid, FK a auth.users)
- `type` (text: 'oil_change', 'chain_adjustment', 'tire_change', 'brake_service', 'general', 'other')
- `description` (text)
- `cost` (numeric, opcional)
- `mileage_at_service` (int, opcional)
- `service_date` (date)
- `next_service_mileage` (int, opcional)
- `next_service_date` (date, opcional)
- `created_at` (timestamptz)

### parts
- `id` (uuid, PK)
- `user_id` (uuid, FK a auth.users)
- `title` (text)
- `description` (text)
- `category` (text: 'engine', 'transmission', 'brakes', 'suspension', 'electrical', 'body', 'accessories', 'other')
- `brand` (text, opcional)
- `condition` (text: 'new', 'used', 'refurbished')
- `price` (numeric)
- `stock` (int, default 1)
- `image_url` (text, opcional)
- `status` (text: 'active', 'sold', 'inactive')
- `created_at` (timestamptz)

## Seguridad (RLS)
- Todas las tablas con RLS habilitado.
- `profiles`: cada usuario ve/edita solo su perfil.
- `motorcycles`: cada usuario ve/edita solo sus motocicletas.
- `maintenance_records`: cada usuario ve/edita solo los registros de sus motocicletas.
- `parts`: SELECT público para authenticated (marketplace), INSERT/UPDATE/DELETE solo para el dueño.

## Notas
- `user_id` tiene DEFAULT auth.uid() para que los inserts del frontend funcionen sin pasar user_id.
- Políticas separadas por verbo CRUD (SELECT, INSERT, UPDATE, DELETE).
*/

-- ===== profiles =====
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'mechanic' CHECK (role IN ('mechanic', 'seller', 'both')),
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ===== motorcycles =====
CREATE TABLE IF NOT EXISTS motorcycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  year int NOT NULL,
  plate text,
  mileage int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE motorcycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_motorcycles" ON motorcycles;
CREATE POLICY "select_own_motorcycles" ON motorcycles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_motorcycles" ON motorcycles;
CREATE POLICY "insert_own_motorcycles" ON motorcycles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_motorcycles" ON motorcycles;
CREATE POLICY "update_own_motorcycles" ON motorcycles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_motorcycles" ON motorcycles;
CREATE POLICY "delete_own_motorcycles" ON motorcycles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== maintenance_records =====
CREATE TABLE IF NOT EXISTS maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorcycle_id uuid NOT NULL REFERENCES motorcycles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general' CHECK (type IN ('oil_change', 'chain_adjustment', 'tire_change', 'brake_service', 'general', 'other')),
  description text NOT NULL,
  cost numeric(10,2),
  mileage_at_service int,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  next_service_mileage int,
  next_service_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_maintenance" ON maintenance_records;
CREATE POLICY "select_own_maintenance" ON maintenance_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_maintenance" ON maintenance_records;
CREATE POLICY "insert_own_maintenance" ON maintenance_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_maintenance" ON maintenance_records;
CREATE POLICY "update_own_maintenance" ON maintenance_records FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_maintenance" ON maintenance_records;
CREATE POLICY "delete_own_maintenance" ON maintenance_records FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== parts =====
CREATE TABLE IF NOT EXISTS parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('engine', 'transmission', 'brakes', 'suspension', 'electrical', 'body', 'accessories', 'other')),
  brand text,
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
  price numeric(10,2) NOT NULL,
  stock int NOT NULL DEFAULT 1,
  image_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'inactive')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;

-- Marketplace: todos los usuarios autenticados pueden ver repuestos activos
DROP POLICY IF EXISTS "select_all_parts" ON parts;
CREATE POLICY "select_all_parts" ON parts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_parts" ON parts;
CREATE POLICY "insert_own_parts" ON parts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_parts" ON parts;
CREATE POLICY "update_own_parts" ON parts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_parts" ON parts;
CREATE POLICY "delete_own_parts" ON parts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_motorcycles_user_id ON motorcycles(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_motorcycle_id ON maintenance_records(motorcycle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_user_id ON maintenance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_parts_user_id ON parts(user_id);
CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_status ON parts(status);
