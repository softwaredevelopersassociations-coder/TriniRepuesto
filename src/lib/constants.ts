import type { PartCategory, PartCondition, UserRole } from '@/types';

export const PART_CATEGORIES: Record<PartCategory, string> = {
  engine: 'Motor',
  transmission: 'Transmisión',
  brakes: 'Frenos',
  suspension: 'Suspensión',
  electrical: 'Eléctrico',
  body: 'Carrocería',
  accessories: 'Accesorios',
  other: 'Otro',
};

export const PART_CONDITIONS: Record<PartCondition, string> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Cliente',
  seller: 'Vendedor de repuestos',
};
