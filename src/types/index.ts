export type UserRole = 'mechanic' | 'seller' | 'both';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  carnet: string | null;
  store_location: string | null;
  store_latitude: number | null;
  store_longitude: number | null;
  business_name: string | null;
  business_details: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type Motorcycle = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  year: number;
  plate: string | null;
  mileage: number;
  image_url: string | null;
  created_at: string;
};

export type MaintenanceType =
  | 'oil_change'
  | 'chain_adjustment'
  | 'tire_change'
  | 'brake_service'
  | 'general'
  | 'other';

export type MaintenanceRecord = {
  id: string;
  motorcycle_id: string;
  user_id: string;
  type: MaintenanceType;
  description: string;
  cost: number | null;
  mileage_at_service: number | null;
  service_date: string;
  next_service_mileage: number | null;
  next_service_date: string | null;
  created_at: string;
};

export type PartCategory =
  | 'engine'
  | 'transmission'
  | 'brakes'
  | 'suspension'
  | 'electrical'
  | 'body'
  | 'accessories'
  | 'other';

export type PartCondition = 'new' | 'used' | 'refurbished';
export type PartStatus = 'active' | 'sold' | 'inactive';

export type Part = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  compatible_motorcycles: string;
  category: PartCategory;
  brand: string | null;
  condition: PartCondition;
  price: number;
  stock: number;
  image_url: string | null;
  status: PartStatus;
  created_at: string;
  // Joined from profiles (optional, available in marketplace queries)
  seller?: {
    full_name: string;
    avatar_url: string | null;
    store_location: string | null;
    store_latitude: number | null;
    store_longitude: number | null;
    business_name: string | null;
    business_details: string | null;
  };
};

export type Conversation = {
  id: string;
  part_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  last_message_at: string;
  // Joined
  part?: Pick<Part, 'id' | 'title' | 'image_url' | 'price'>;
  other_user?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
  unread_count?: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type SellerRating = {
  id: string;
  seller_id: string;
  buyer_id: string;
  part_id: string;
  rating: number; // 1-5
  comment: string | null;
  created_at: string;
  // Joined
  buyer?: {
    full_name: string;
    avatar_url: string | null;
  };
};

export type SellerStats = {
  seller_id: string;
  avg_rating: number;
  total_ratings: number;
};
