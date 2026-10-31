-- Sustituye el rol de mantenedor por cliente y conserva el rol de vendedor.
-- Las cuentas que usaban ambos módulos pasan a vendedor, manteniendo sus datos
-- de negocio y sus publicaciones existentes.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE public.profiles
SET
  role = CASE
    WHEN role = 'mechanic' THEN 'client'
    WHEN role = 'both' THEN 'seller'
    ELSE role
  END;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'client';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('client', 'seller'));
