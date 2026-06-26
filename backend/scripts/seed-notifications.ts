import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || './data/db.sqlite';
const sqlite = new Database(DB_PATH);
sqlite.pragma('foreign_keys = ON');

const now = Date.now();
const beijingOffset = 8 * 60 * 60 * 1000;
function beijingTime(d: Date) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// Helper: days ago from now
function daysAgo(days: number, hours = 0, minutes = 0) {
  return beijingTime(new Date(now - days * 86400000 - hours * 3600000 - minutes * 60000));
}

const insertNotif = sqlite.prepare(
  `INSERT INTO notifications (user_id, title, content, type, is_read, link, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// Clear existing test notifications (keep only real ones)
sqlite.prepare('DELETE FROM notifications').run();
console.log('Cleared existing notifications');

// ===== SYSTEM notifications =====
const systemData = [
  {
    title: '欢迎加入物业服务监督系统',
    content: '尊敬的用户，欢迎您加入物业服务监督系统！您可以使用本系统提交物业问题、查看处理进度、参与小区管理。如有任何疑问，请联系物业服务中心或使用"意见反馈"功能与我们沟通。',
    days: 7, hours: 9,
  },
  {
    title: '系统维护通知',
    content: '尊敬的用户，物业系统将于2026年6月25日凌晨2:00-5:00进行系统维护升级。维护期间可能无法正常访问系统，给您带来的不便敬请谅解。维护完成后，系统将恢复正常运行。',
    days: 3, hours: 14,
  },
  {
    title: '版本更新公告 v2.3.0',
    content: '尊敬的业主/住户：为了给您提供更优质的物业服务体验，我们已于6月20日完成了系统版本升级（v2.3.0）。本次更新内容如下：\n\n1. 新增消息通知中心，实时接收系统消息、审核结果、安全提醒\n2. 消息列表支持折叠/展开全文查看，操作更便捷\n3. 通知分类标签优化，不同类型消息一目了然\n4. 修复了部分已知问题，提升了系统稳定性\n\n如您在体验过程中有任何建议或发现问题，欢迎通过"意见反馈"功能向我们反馈。感谢您对物业服务监督系统的大力支持！',
    days: 1, hours: 10,
  },
  {
    title: '业主大会投票通知',
    content: '各位业主：小区2026年度第一次业主大会将于7月15日上午9:00在小区活动中心召开。本次大会将讨论以下事项：\n\n1. 审议2025年度物业工作报告及财务决算\n2. 表决2026年度物业费调整方案\n3. 选举新一届业主委员会\n4. 讨论小区停车管理优化方案\n\n请各位业主准时参加，如无法到场请提前做好授权委托。详情可咨询业主委员会或物业服务中心。',
    days: 0, hours: 8,
  },
];

systemData.forEach((d, i) => {
  insertNotif.run(1, d.title, d.content, 'system', i === 0 ? 1 : 0, '', daysAgo(d.days, d.hours));
  // Also send to some test users
  if (i < 2) {
    insertNotif.run(2, d.title, d.content, 'system', 0, '', daysAgo(d.days, d.hours));
    insertNotif.run(3, d.title, d.content, 'system', 0, '', daysAgo(d.days, d.hours));
  }
});

// ===== APPROVAL notifications =====
const approvalData = [
  {
    title: '房产变更申请已通过 ✅',
    content: '您好！您于6月15日提交的房产变更申请（房号：8-1002）已通过审核。变更后的房产信息已同步更新至系统。如有疑问请联系物业服务中心。',
    days: 2, hours: 15, read: false,
  },
  {
    title: '产权过户申请已批准',
    content: '尊敬的黄勇先生/女士：您提交的8栋1002室产权过户申请已顺利完成审批。新的产权登记信息已录入系统，自2026年6月20日起生效。请您前往物业服务中心领取新的产权证明文件。如有疑问请联系物业。',
    days: 4, hours: 11, read: false,
  },
  {
    title: '房产变更申请被驳回 ❌',
    content: '尊敬的用户，您于6月10日提交的房产变更申请（房号：3-1501）经审核未通过。原因：提交的证明材料不完整，缺少房产证复印件。请补充完整材料后重新提交申请。',
    days: 5, hours: 9, read: true,
  },
  {
    title: '新住户信息审核提醒',
    content: '8栋1002室新的住户信息已提交审核，请管理员在系统中核对相关信息并完成审批。住户姓名：李华，身份证号：************1234，联系电话：138****5678。如信息无误请尽快完成审核。',
    days: 1, hours: 14, read: false,
  },
];

approvalData.forEach(d => {
  insertNotif.run(1, d.title, d.content, 'approval', d.read ? 1 : 0, '', daysAgo(d.days, d.hours));
  if (d.days === 5) {
    insertNotif.run(14, d.title, d.content, 'approval', 1, '', daysAgo(d.days, d.hours));
  }
  if (d.days === 2) {
    insertNotif.run(11, d.title, d.content, 'approval', 0, '', daysAgo(d.days, d.hours));
  }
});

// ===== SHARE notifications =====
const shareData = [
  {
    title: '您有一条新的分享记录',
    content: '系统已为您生成第2026060001号问题记录的分享链接，您可以复制链接发送给相关人员查看。分享内容：8栋消防通道堵塞问题处理记录。',
    days: 3, hours: 16, read: false,
  },
  {
    title: '分享文件已生成',
    content: '您的问题记录分享已成功生成，分享编号：SH20260618002。该分享包含3张现场图片和1段处理过程视频，有效期至2026年7月18日。您可以在"我的分享"中查看和管理所有分享记录。',
    days: 1, hours: 11, read: true,
  },
  {
    title: '批量分享任务完成',
    content: '批量分享任务已完成！本次共分享了5条问题记录给相关业主和物业人员。分享清单：\n1. 1栋楼下垃圾桶溢出（已处理）\n2. 2栋电梯故障（维修中）\n3. 3栋楼道堆放杂物（已清理）\n4. 5栋外墙脱落（已报修）\n5. 8栋门口车辆乱停（已处理）\n\n每条记录的分享链接已生成，可在对应记录详情中查看。',
    days: 0, hours: 9, read: false,
  },
];

shareData.forEach(d => {
  insertNotif.run(1, d.title, d.content, 'share', d.read ? 1 : 0, '', daysAgo(d.days, d.hours));
  if (d.days === 3) {
    insertNotif.run(4, d.title, d.content, 'share', 0, '', daysAgo(d.days, d.hours));
  }
});

// ===== SECURITY notifications =====
const securityData = [
  {
    title: '账户密码已变更',
    content: '您的账户密码已于2026年6月22日 15:30:28 完成变更。如非本人操作，请立即联系管理员或通过物业服务中心进行账户安全处理。',
    days: 1, hours: 8, read: false,
  },
  {
    title: '账户状态变更通知',
    content: '您的账户状态已被管理员变更为"正常"。如有疑问请联系物业服务中心或系统管理员。',
    days: 2, hours: 10, read: true,
  },
  {
    title: '管理员重置了您的密码',
    content: '系统管理员已于2026年6月15日 09:00:00 重置了您的账户密码。重置后的临时密码已通过您注册时绑定的手机号发送，请及时登录并修改密码。如有任何疑问，请联系物业服务中心。',
    days: 8, hours: 9, read: true,
  },
  {
    title: '安全提醒：新设备登录',
    content: '您的账户于2026年6月23日 08:45:12 在IP地址 192.168.1.100 使用Chrome浏览器（Windows 11）登录。如非本人操作，请立即修改密码并联系管理员。',
    days: 0, hours: 0, read: false,
  },
];

securityData.forEach(d => {
  insertNotif.run(1, d.title, d.content, 'security', d.read ? 1 : 0, '', daysAgo(d.days, d.hours));
  if (d.days === 1) {
    insertNotif.run(7, d.title, d.content, 'security', 0, '', daysAgo(d.days, d.hours));
  }
  if (d.days === 8) {
    insertNotif.run(5, d.title, d.content, 'security', 1, '', daysAgo(d.days, d.hours));
  }
});

// ===== INFO notifications =====
const infoData = [
  {
    title: '小区停水通知',
    content: '尊敬的业主/住户：因市政供水管道维修，小区将于6月24日（周三）8:00-18:00 暂停供水。请您提前做好储水准备，关闭家中水龙头，以免恢复供水时造成损失。如有疑问请拨打物业电话。',
    days: 0, hours: 7, read: false,
  },
  {
    title: '物业费缴纳提醒',
    content: '您好！您2026年第二季度的物业费账单已生成，缴费截止日期为2026年6月30日。您可通过以下方式缴费：\n1. 微信/支付宝扫码支付（推荐）\n2. 银行转账：开户行XX银行XX支行，账号 6222 0200 xxxx xxxx\n3. 前往物业服务中心现场缴纳\n\n逾期将按日加收万分之五的滞纳金，请及时缴纳。',
    days: 1, hours: 10, read: false,
  },
  {
    title: '垃圾分类宣传活动',
    content: '尊敬的业主：为了进一步推动小区垃圾分类工作，物业服务中心将于6月25日（周四）上午9:30-11:30在小区中心广场举办"垃圾分类从我做起"主题宣传活动。活动现场将有小礼品赠送，欢迎广大业主积极参与！',
    days: 2, hours: 9, read: true,
  },
];

infoData.forEach(d => {
  insertNotif.run(1, d.title, d.content, 'info', d.read ? 1 : 0, '', daysAgo(d.days, d.hours));
  if (d.days === 2) {
    insertNotif.run(8, d.title, d.content, 'info', 1, '', daysAgo(d.days, d.hours));
  }
});

// ===== FEEDBACK notifications =====
// User feedback to admin
const feedbacks = [
  { user_id: 2, content: '2栋电梯昨天开始就一直在抖动，坐起来很害怕，麻烦尽快安排维修检查。', days: 5, hours: 14 },
  { user_id: 4, content: '5栋楼下垃圾桶已经三天没有人来清理了，现在臭味很大，尤其是天气热的时候根本无法开窗。请物业尽快安排清理。', days: 3, hours: 10 },
  { user_id: 7, content: '1栋601门口走廊灯坏了快一周了，晚上回家特别不方便，老人小孩容易摔倒，请尽快维修。', days: 2, hours: 20 },
  { user_id: 11, content: '8栋地下车库入口的减速带坏了，螺丝都露出来了，已经有好几辆车被扎破轮胎了，安全隐患很大！', days: 1, hours: 9 },
  { user_id: 14, content: '3栋1501楼上每天晚上11点以后还在跳绳和拍球，噪音严重影响休息。已经沟通过几次但没什么效果，希望物业能介入协调解决。', days: 0, hours: 22 },
];

const insertFeedback = sqlite.prepare(
  `INSERT INTO notifications (user_id, title, content, type, is_read, created_at)
   VALUES (?, ?, ?, 'feedback', ?, ?)`
);

feedbacks.forEach(f => {
  // User's own feedback message (marked as read for user)
  insertFeedback.run(f.user_id, '系统反馈', `[uid=${f.user_id}]${f.content}`, 1, daysAgo(f.days, f.hours));
  // Admin sees feedback as unread
  insertFeedback.run(1, `系统反馈: ${['张伟','李娜','王磊','刘芳','陈静','赵明','孙丽','周强','吴敏','黄勇','徐娟','胡涛','林琳','郑刚','何秀','郭亮','马红','罗平','梁峰','宋洁'][f.user_id - 2]}`, `[uid=${f.user_id}]${f.content}`, 0, daysAgo(f.days, f.hours));
});

// Admin reply to user 2 (张伟)
const replyContent = '【管理员回复 2026-06-20 10:30】您好，我们已经安排维修人员对2栋电梯进行了全面检查，发现是导轨滑块磨损导致的问题。目前已更换了新的滑块，电梯运行已恢复正常。给您带来的不便深表歉意，感谢您的反馈！';
insertFeedback.run(2, '管理员回复', replyContent, 0, daysAgo(4, 10, 30));
insertFeedback.run(1, '管理员回复', `[uid=2]${replyContent}`, 1, daysAgo(4, 10, 30));

// Admin reply to user 4 (刘芳)
const replyContent2 = '【管理员回复 2026-06-22 08:15】您好，关于5栋楼下垃圾未清理的问题，我们已经联系保洁公司加强该区域的清运频次。目前垃圾已全部清理完毕，并且我们将5栋的垃圾清运时间从原来的隔天一次调整为每天一次，确保不再出现类似情况。感谢您的监督！';
insertFeedback.run(4, '管理员回复', replyContent2, 0, daysAgo(2, 8, 15));
insertFeedback.run(1, '管理员回复', `[uid=4]${replyContent2}`, 1, daysAgo(2, 8, 15));

console.log('Test notifications created successfully!');

// Print summary
const counts = sqlite.prepare(`
  SELECT type, COUNT(*) as cnt, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
  FROM notifications GROUP BY type ORDER BY type
`).all() as any[];
console.log('\n=== Notification Summary ===');
counts.forEach((r: any) => console.log(`  ${r.type}: ${r.cnt} total, ${r.unread} unread`));

const total = sqlite.prepare('SELECT COUNT(*) as cnt FROM notifications').get() as any;
console.log(`\nTotal: ${total.cnt} notifications`);

sqlite.close();
