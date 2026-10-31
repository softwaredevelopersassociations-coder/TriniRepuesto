import type { MaintenanceType, PartCategory, PartCondition, UserRole } from '@/types';

export const MAINTENANCE_TYPES: Record<MaintenanceType, { label: string; icon: string }> = {
  oil_change: { label: 'Cambio de aceite', icon: 'oil' },
  chain_adjustment: { label: 'Ajuste de cadena', icon: 'chain' },
  tire_change: { label: 'Cambio de llantas', icon: 'tire' },
  brake_service: { label: 'Servicio de frenos', icon: 'brake' },
  general: { label: 'Mantenimiento general', icon: 'general' },
  other: { label: 'Otro', icon: 'other' },
};

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
