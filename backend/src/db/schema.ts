import { sqliteTable, text, integer, real, unique, index } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique(),
  role: text('role').notNull().default('owner'),
  name: text('name').notNull(),
  id_card: text('id_card').unique(),
  phone: text('phone').unique(),
  email: text('email'),
  room_number: text('room_number'),
  password_hash: text('password_hash').notNull(),
  status: text('status').notNull().default('active'),
  register_method: text('register_method').notNull(),
  property_deed_url: text('property_deed_url'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now','localtime'))`),
  last_active_at: text('last_active_at'),
});

export const whitelist = sqliteTable('whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  id_card: text('id_card').notNull(),
  phone: text('phone').notNull(),
  room: text('room').notNull(),
  email: text('email'),
  property_info: text('property_info'),
  remark: text('remark'),
  status: text('status').notNull().default('pending'),
  ip_address: text('ip_address'),
  created_by: integer('created_by').references(() => users.id),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
  updated_at: text('updated_at'),
  updated_by: integer('updated_by').references(() => users.id),
}, (t) => ({
  unq: unique().on(t.name, t.id_card, t.phone),
  idxRoom: index('idx_whitelist_room').on(t.room),
}));

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  record_no: integer('record_no').notNull(),
  user_id: integer('user_id').notNull().references(() => users.id),
  category_id: integer('category_id').references(() => categories.id),
  type: text('type').notNull(),
  filename: text('filename').notNull(),
  original_name: text('original_name').notNull(),
  url: text('url').notNull(),
  thumbnail_url: text('thumbnail_url'),
  size_bytes: integer('size_bytes').notNull(),
  mime_type: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  duration: integer('duration'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  address: text('address'),
  watermark_applied: integer('watermark_applied').notNull().default(0),
  compressed: integer('compressed').notNull().default(0),
  status: text('status').notNull().default('active'),
  file_hash: text('file_hash'),
  remark: text('remark'),
  uploaded_at: text('uploaded_at').notNull().default(sql`(datetime('now','localtime'))`),
}, (t) => ({
  idxUserId: index('idx_media_user_id').on(t.user_id),
  idxCategoryId: index('idx_media_category_id').on(t.category_id),
  idxType: index('idx_media_type').on(t.type),
  idxRecordNo: index('idx_media_record_no').on(t.record_no),
  idxUploadedAt: index('idx_media_uploaded_at').on(t.uploaded_at),
}));

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  code: text('code'),
  icon: text('icon'),
  parent_id: integer('parent_id'),
  sort_order: integer('sort_order').notNull().default(0),
  description: text('description'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const configs = sqliteTable('configs', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_by: integer('updated_by').references(() => users.id),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const approvals = sqliteTable('approvals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  id_card: text('id_card').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  room_number: text('room_number').notNull(),
  property_deed_url: text('property_deed_url').notNull(),
  status: text('status').notNull().default('pending'),
  apply_type: text('apply_type').notNull().default('register'),
  mismatch_fields: text('mismatch_fields'),
  verify_code: text('verify_code'),
  code_expires_at: text('code_expires_at'),
  notify_method: text('notify_method').default('email'),
  apply_reason: text('apply_reason'),
  reviewed_by: integer('reviewed_by').references(() => users.id),
  reviewed_name: text('reviewed_name'),
  reviewed_at: text('reviewed_at'),
  remark: text('remark'),
  reject_reason_preset: text('reject_reason_preset'),
  activation_token: text('activation_token'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
}, (t) => ({
  idxStatus: index('idx_approvals_status').on(t.status),
}));

export const shares = sqliteTable('shares', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull().unique(),
  user_id: integer('user_id').references(() => users.id),
  media_ids: text('media_ids').notNull(),
  password: text('password'),
  password_hash: text('password_hash'),
  visit_count: integer('visit_count').notNull().default(0),
  download_count: integer('download_count').notNull().default(0),
  allow_download: integer('allow_download').notNull().default(0),
  max_access_count: integer('max_access_count'),
  force_watermark: integer('force_watermark').notNull().default(1),
  remark: text('remark'),
  password_attempts: integer('password_attempts').notNull().default(0),
  locked_until: text('locked_until'),
  last_access_at: text('last_access_at'),
  status: text('status').notNull().default('active'),
  ip_address: text('ip_address'),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const shareAccessLogs = sqliteTable('share_access_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  share_id: integer('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  ip: text('ip'),
  action: text('action').notNull().default('view'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  target_type: text('target_type'),
  target_id: integer('target_id'),
  detail: text('detail'),
  ip: text('ip'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const announcements = sqliteTable('announcements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  created_by: integer('created_by').references(() => users.id),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.id),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  type: text('type').notNull().default('info'),
  is_read: integer('is_read').notNull().default(0),
  link: text('link'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const notificationSendLogs = sqliteTable('notification_send_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  notification_id: integer('notification_id'),
  user_id: integer('user_id'),
  channel: text('channel').notNull().default('system'),
  status: text('status').notNull().default('pending'),
  error_message: text('error_message'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const userNotificationPrefs = sqliteTable('user_notification_prefs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().unique(),
  email_enabled: integer('email_enabled').notNull().default(0),
  sms_enabled: integer('sms_enabled').notNull().default(0),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const changeLogs = sqliteTable('change_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  target_type: text('target_type').notNull(),
  target_id: integer('target_id').notNull(),
  field: text('field').notNull(),
  old_value: text('old_value'),
  new_value: text('new_value'),
  operator_id: integer('operator_id').references(() => users.id),
  operator_name: text('operator_name'),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const loginLogs = sqliteTable('login_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  ip: text('ip'),
  device: text('device').notNull().default(''),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const propertyFiles = sqliteTable('property_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  owner_id: integer('owner_id').notNull().references(() => whitelist.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  original_name: text('original_name').notNull(),
  url: text('url').notNull(),
  remark: text('remark'),
  uploaded_by: integer('uploaded_by').references(() => users.id),
  created_at: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
});

export const usersRelations = relations(users, ({ many }) => ({
  media: many(media),
  auditLogs: many(auditLogs),
  approvals: many(approvals, { relationName: 'reviewedApprovals' }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  user: one(users, { fields: [media.user_id], references: [users.id] }),
  category: one(categories, { fields: [media.category_id], references: [categories.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parent_id], references: [categories.id] }),
  children: many(categories),
}));
