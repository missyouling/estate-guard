import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import bcrypt from 'bcrypt';
import { encrypt } from '../services/crypto';
import { getEmailTemplateDefaults, getSmsTemplateDefaults } from '../services/templateRenderer';

export async function runSeed(dbPath?: string) {
  const DB_PATH = dbPath || process.env.DB_PATH || './data/db.sqlite';

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  console.log('[Seed] Checking existing data...');

  const existingAdmin = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existingAdmin) {
    console.log('[Seed] Admin user already exists, skipping');
  } else {
    const passwordHash = await bcrypt.hash('admin123', 12);
    const encryptedPhone = encrypt('13800000000');
    sqlite.prepare(`INSERT INTO users (username, role, name, phone, password_hash, status, register_method)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'admin', 'admin', '系统管理员', encryptedPhone, passwordHash, 'active', 'whitelist'
    );
    console.log('[Seed] Admin user created: admin / admin123');
  }

  const catCount = sqlite.prepare('SELECT COUNT(*) as cnt FROM categories').get() as any;
  if (catCount.cnt > 0) {
    console.log(`[Seed] Categories already exist (${catCount.cnt} rows), skipping`);
  } else {
    const defaultCategories = [
      { name: '环境卫生', code: 'ENV',     icon: 'trash-2',      parent_id: null, sort_order: 1, description: '小区环境卫生相关问题，如垃圾清理、楼道保洁、公共区域清洁等' },
      { name: '公共设施', code: 'FAC',     icon: 'wrench',       parent_id: null, sort_order: 2, description: '公共设施设备维修维护，如电梯、门禁、照明、水泵等' },
      { name: '安全隐患', code: 'SAFE',    icon: 'shield-alert', parent_id: null, sort_order: 3, description: '消防安全、治安隐患、设施安全等可能造成人身财产损失的问题' },
      { name: '绿化养护', code: 'GREEN',   icon: 'tree-pine',    parent_id: null, sort_order: 4, description: '小区绿化植被养护、修剪、补种等相关问题' },
      { name: '停车管理', code: 'PARK',    icon: 'car',          parent_id: null, sort_order: 5, description: '车辆停放秩序、车位管理、违规停车等问题' },
      { name: '噪音扰民', code: 'NOISE',   icon: 'volume-2',     parent_id: null, sort_order: 6, description: '装修噪音、生活噪音、商业噪音等扰民问题' },
      { name: '违建问题', code: 'ILLEGAL', icon: 'building',     parent_id: null, sort_order: 7, description: '违章搭建、私改房屋结构、占用公共空间等问题' },
      { name: '其他',     code: 'OTHER',   icon: 'ellipsis',     parent_id: null, sort_order: 99, description: '不属于以上分类的其他物业服务相关问题' },
    ];

    const insert = sqlite.prepare(
      'INSERT INTO categories (name, code, icon, parent_id, sort_order, description) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const cat of defaultCategories) {
      insert.run(cat.name, cat.code, cat.icon, cat.parent_id, cat.sort_order, cat.description);
    }
    console.log(`[Seed] ${defaultCategories.length} categories created`);
  }

  const defaultConfigs: Record<string, string> = {
    upload_max_image_size_mb:       '20',
    upload_max_video_size_mb:       '200',
    upload_max_audio_size_mb:       '50',
    upload_max_count_per_batch:     '9',
    image_compress_max_width:       '1920',
    image_compress_quality:         '80',
    watermark_show_bg:              'true',
    watermark_text_color:           '#FFFFFF',
    watermark_font_weight:          'normal',
    video_transcode_max_width:      '1920',
    video_transcode_bitrate:        '2000k',
    watermark_template:             'NO.{record_no}\n{room} {user}\n{datetime}\n{location}\n{remark}',
    watermark_position:             'southwest',
    watermark_font_size:            '0',
    watermark_opacity:              '0.8',
    watermark_auto_apply:           'true',
    watermark_date_format:          'YYYY-MM-DD HH:mm:ss',
    watermark_record_prefix:        'NO.',
    watermark_record_digits:        '0',
    watermark_record_suffix:        '',
    smtp_host:                      'smtp.qq.com',
    smtp_port:                      '465',
    smtp_user:                      '',
    smtp_pass:                      '',
    mail_from:                      '',
    verify_code_expire_minutes:     '30',
    storage_backend:                'local',
    s3_endpoint:                    '',
    s3_bucket:                      '',
    s3_access_key:                  '',
    s3_secret_key:                  '',
    s3_region:                      'auto',
    node_image_api_url:             'https://api.nodeimage.com',
    node_image_api_key:             '',
    allowed_image_types:            '["jpg","jpeg","png","gif","webp","bmp"]',
    allowed_video_types:            '["mp4","mov","avi","mkv","webm"]',
    allowed_audio_types:            '["mp3","wav","m4a","ogg","aac"]',
    allowed_document_types:         '["jpg","jpeg","png","pdf"]',
    geocode_provider:               'amap',
    geocode_api_key:                '',
    sms_provider:                   '',
    sms_access_key:                 '',
    sms_secret_key:                 '',
    sms_sign_name:                  '',
    sms_template_code:              '',
    site_url:                       'http://localhost:11111',
    ...getEmailTemplateDefaults(),
    ...getSmsTemplateDefaults(),
  };

  const configCount = sqlite.prepare('SELECT COUNT(*) as cnt FROM configs').get() as any;
  if (configCount.cnt > 0) {
    console.log(`[Seed] Configs already exist (${configCount.cnt} rows), skipping`);
  } else {
    const upsert = sqlite.prepare(
      'INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)'
    );
    for (const [key, value] of Object.entries(defaultConfigs)) {
      upsert.run(key, value);
    }
    console.log(`[Seed] ${Object.keys(defaultConfigs).length} configs created`);
  }

  sqlite.close();
  console.log('[Seed] Done.');
}

export function syncEnvConfigs(dbPath?: string) {
  const DB_PATH = dbPath || process.env.DB_PATH || './data/db.sqlite';
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('foreign_keys = ON');

  const map: Record<string, string> = {
    smtp_host: process.env.SMTP_HOST || '',
    smtp_port: process.env.SMTP_PORT || '465',
    smtp_user: process.env.SMTP_USER || '',
    smtp_pass: process.env.SMTP_PASS || '',
    mail_from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    verify_code_expire_minutes: process.env.VERIFY_CODE_EXPIRE_MINUTES || '30',
    site_url: process.env.APP_URL || 'http://localhost:11111',
  };

  // UPSERT: only override existing row if current value is empty
  const upsert = sqlite.prepare(
    `INSERT INTO configs (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value
     WHERE configs.value = '' OR configs.value IS NULL`
  );
  for (const [key, value] of Object.entries(map)) {
    if (value) {
      const existing = sqlite.prepare('SELECT value FROM configs WHERE key = ?').get(key) as any;
      if (!existing) {
        sqlite.prepare('INSERT INTO configs (key, value) VALUES (?, ?)').run(key, value);
        console.log(`[Env] Config ${key} initialized from .env`);
      } else if (!existing.value) {
        upsert.run(key, value);
        console.log(`[Env] Config ${key} updated from .env (was empty)`);
      }
    }
  }
  sqlite.close();
  console.log('[Env] Config sync done');
}

export async function seedTestData(dbPath?: string) {
  const DB_PATH = dbPath || process.env.DB_PATH || './data/db.sqlite';
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('foreign_keys = ON');

  const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('test_user1') as any;
  if (existing) {
    console.log('[TestSeed] Test data already exists, skipping');
    sqlite.close();
    return;
  }

  console.log('[TestSeed] Generating test data...');

  const passwordHash = await bcrypt.hash('123456', 12);

  const buildings = ['1', '2', '3', '5', '8'];
  const rooms = ['101', '201', '301', '402', '502', '601', '702', '803', '901', '1002', '1101', '1203', '1501', '1802', '2001'];
  const names = ['张伟', '李娜', '王磊', '刘芳', '陈静', '赵明', '孙丽', '周强', '吴敏', '黄勇',
                  '徐娟', '胡涛', '林琳', '郑刚', '何秀', '郭亮', '马红', '罗平', '梁峰', '宋洁'];
  const userIds: number[] = [];

  for (let i = 0; i < 20; i++) {
    const building = buildings[i % buildings.length];
    const room = rooms[i];
    const roomNumber = `${building}-${room}`;
    const encryptedPhone = encrypt(`138${String(10000000 + i * 137).slice(0, 8)}`);
    const encryptedIdCard = encrypt(`1101011990${String(101 + i * 31).slice(0, 4)}${String(1000 + i * 73).slice(0, 4)}`);

    const result = sqlite.prepare(
      `INSERT INTO users (username, role, name, id_card, phone, room_number, password_hash, status, register_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(`test_user${i + 1}`, 'owner', names[i], encryptedIdCard, encryptedPhone,
          roomNumber, passwordHash, 'active', 'whitelist');
    userIds.push(Number(result.lastInsertRowid));
  }

  console.log(`[TestSeed] Created ${userIds.length} users`);

  const catRows = sqlite.prepare('SELECT id FROM categories').all() as any[];
  const categoryIds = catRows.map(r => r.id);
  const types = ['image', 'image', 'image', 'image', 'image', 'video', 'audio', 'document'];
  const imageUrls = Array.from({ length: 10 }, (_, i) => `/files/images/test_sample_${i + 1}.jpg`);
  const videoUrls = ['/files/videos/test_sample_1.mp4', '/files/videos/test_sample_2.mp4'];
  const addresses = [
    '1栋楼下垃圾桶溢出', '2栋电梯故障', '3栋楼道堆放杂物', '5栋外墙脱落',
    '8栋门口车辆乱停', '1栋草坪枯死', '2栋消防通道堵塞', '3栋夜间施工噪音',
    '5栋电梯按钮损坏', '8栋门禁失灵', '1栋水管破裂', '2栋路面塌陷',
    '3栋化粪池满溢', '5栋路灯不亮', '8栋绿化带被破坏',
  ];

    const insert = sqlite.prepare(
      `INSERT INTO media (record_no, user_id, category_id, type, filename, original_name, url, thumbnail_url, size_bytes, width, height, address, watermark_applied, compressed, status, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let recordNo = 1001;
    for (let day = 13; day >= 0; day--) {
      const count = 1 + Math.floor(Math.random() * 4);
      for (let j = 0; j < count; j++) {
        const userId = userIds[Math.floor(Math.random() * userIds.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const catId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
        const addr = addresses[Math.floor(Math.random() * addresses.length)];
        const rn = recordNo++;
        const uploadDate = new Date(Date.now() - day * 86400000).toISOString().replace('T', ' ').slice(0, 19);

      if (type === 'image') {
        const url = imageUrls[Math.floor(Math.random() * imageUrls.length)];
        const w = 800 + Math.floor(Math.random() * 3200);
        const h = 600 + Math.floor(Math.random() * 1800);
        const sz = 50000 + Math.floor(Math.random() * 300000);
        insert.run(rn, userId, catId, type, `IMG_${rn}.jpg`, `IMG_${rn}.jpg`,
          url, url, sz, w, h, addr, 1, 1, 'active', uploadDate);
      } else if (type === 'video') {
        const url = videoUrls[Math.floor(Math.random() * videoUrls.length)];
        insert.run(rn, userId, catId, type, `VID_${rn}.mp4`, `VID_${rn}.mp4`,
          url, null, 5000000 + Math.floor(Math.random() * 50000000), 1920, 1080, addr, 0, 0, 'active', uploadDate);
      } else {
        insert.run(rn, userId, catId, type, `file_${rn}`, `file_${rn}`,
          `/files/documents/test_${rn}.pdf`, null, 100000 + Math.floor(Math.random() * 2000000), 0, 0, addr, 0, 0, 'active', uploadDate);
      }
    }
  }

  console.log(`[TestSeed] Created ${recordNo - 1001} media records`);
  sqlite.close();
  console.log('[TestSeed] Done.');
}

const isMain = process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));
if (isMain) {
  const testMode = process.argv.includes('--test-data');
  (testMode ? seedTestData() : runSeed()).catch((err) => {
    console.error('[Seed] Error:', err);
    process.exit(1);
  });
}
