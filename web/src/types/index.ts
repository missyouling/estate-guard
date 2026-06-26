export interface User {
  id: number;
  username?: string;
  role: 'admin' | 'owner';
  name: string;
  phone?: string;
  id_card?: string;
  email?: string;
  room_number?: string;
  avatar_url?: string | null;
  status: string;
  register_method: string;
  created_at: string;
}

export interface Media {
  id: number;
  record_no: number;
  user_id: number;
  category_id?: number;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  original_name: string;
  url: string;
  thumbnail_url?: string;
  size_bytes: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  watermark_applied: boolean;
  file_hash?: string;
  compressed: boolean;
  status: string;
  remark?: string;
  uploaded_at: string;
  user_name?: string;
  category_name?: string;
}

export interface Media {
  id: number;
  record_no: number;
  user_id: number;
  category_id?: number;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  original_name: string;
  url: string;
  thumbnail_url?: string;
  size_bytes: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  watermark_applied: boolean;
  file_hash?: string;
  compressed: boolean;
  status: string;
  remark?: string;
  uploaded_at: string;
  user_name?: string;
  category_name?: string;
}

export interface Category {
  id: number;
  name: string;
  code?: string;
  icon?: string;
  parent_id?: number;
  sort_order: number;
  description?: string;
  children?: Category[];
}

export interface WhitelistEntry {
  id: number;
  name: string;
  id_card: string;
  phone: string;
  room: string;
  email?: string;
  property_info?: string;
  property_count?: number;
  remark?: string;
  status?: string;
  ip_address?: string;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Approval {
  id: number;
  name: string;
  id_card: string;
  phone: string;
  email?: string;
  room_number: string;
  property_deed_url: string;
  status: 'pending' | 'approved' | 'rejected';
  apply_type: 'register' | 'change';
  mismatch_fields?: string;
  verify_code?: string;
  notify_method: string;
  apply_reason?: string;
  reviewed_by?: number;
  reviewed_name?: string;
  reviewed_at?: string;
  remark?: string;
  reject_reason_preset?: string;
  created_at: string;
}

export interface ChangeLog {
  id: number;
  target_type: string;
  target_id: number;
  field: string;
  old_value?: string;
  new_value?: string;
  operator_id?: number;
  operator_name?: string;
  created_at: string;
}

export interface PropertyFile {
  id: number;
  owner_id: number;
  filename: string;
  original_name: string;
  url: string;
  remark?: string;
  uploaded_by?: number;
  created_at: string;
}

export interface SystemConfig {
  key: string;
  value: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface NotificationType {
  system: number;
  approval: number;
  share: number;
  security: number;
  total_unread: number;
}

export interface NotificationLog {
  id: number;
  notification_id?: number;
  user_id?: number;
  channel: string;
  status: string;
  error_message?: string;
  created_at: string;
}

export interface NotificationPrefs {
  email_enabled: boolean;
  sms_enabled: boolean;
}

export interface ChannelConfigStatus {
  email: { configured: boolean; label: string };
  sms: { configured: boolean; label: string };
  all_configured: boolean;
}

export interface LoginLog {
  id: number;
  user_id: number;
  ip: string;
  device: string;
  created_at: string;
}

export interface UserProperty {
  id: number;
  name: string;
  id_card: string;
  phone: string;
  room: string;
  email?: string;
  property_info?: string;
  status?: string;
  property_count?: number;
  owner_count?: number;
  approval_status?: string;
  rejection_reason?: string;
  approval_created_at?: string;
}

export interface PropertyDocument {
  id: number;
  owner_id: number;
  filename: string;
  original_name: string;
  url: string;
  remark?: string;
  uploaded_by?: number;
  created_at: string;
}

export interface UserProfile {
  id: number;
  username?: string;
  role: string;
  name: string;
  phone: string;
  id_card: string;
  email?: string;
  room_number?: string;
  community_name?: string;
  properties?: { room: string; status: string }[];
  status: string;
  register_method: string;
  avatar_url?: string | null;
  created_at: string;
  id_card_raw?: string;
  whitelist_ids?: number[];
  bound_owner?: { id: number; room: string; name: string } | null;
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}
