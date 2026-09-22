/**
 * LifeOS 同行者 — 云端同步层
 * ======================================================================
 * 唯一同步出口：所有云端读写通过 syncAdapter 方法
 * localStorage 永远是唯一真相源，云端只是镜像
 * 以后迁微信小程序只换 syncAdapter，业务代码不动
 * ======================================================================
 */

var CLOUD_ENV_ID = 'lifeos-d6gw15bth1d615af5';

// Storage keys（lifeos_ 前缀，统一管理）
var STORAGE_UID           = 'lifeos_uid';
var STORAGE_PARTNER       = 'lifeos_partner';
var STORAGE_SHARE_SETTINGS = 'lifeos_share_settings';
var STORAGE_SYNC_QUEUE    = 'lifeos_sync_queue';

// 暗号词库 — 四字中文词组
var CODE_PHRASES = [
  '山河故人', '风月同天', '星辰大海', '云路光影', '光影流年',
  '山高水长', '风起云涌', '月明星稀', '心远地偏', '春暖花开',
  '秋水长天', '冬雪夏雨', '星河璀璨', '松竹梅兰', '泉溪岭峰',
  '舟帆鸟鱼', '朝暮远近', '花草木石', '雨雪霜露', '梦心春秋',
  '海阔天空', '行云流水', '静水流深', '细水长流', '岁月静好',
  '一路同行', '风雨同舟', '并肩前行', '彼此照亮', '各自攀登'
];

// ---- 本地 JSON 辅助（cloud.js 自带，不依赖 app.js）----
function _lsLoad(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return fallback;
}
function _lsSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
}

// ======================================================================
// syncAdapter — 唯一云端同步接口
// ======================================================================
var syncAdapter = {
  _app: null,
  _db: null,
  _auth: null,
  _uid: null,
  _ready: false,
  _pollTimer: null,

  /**
   * 初始化 CloudBase + 静默匿名登录
   * 界面不出现登录概念，uid 存 localStorage
   */
  init: function() {
    var self = this;
    if (typeof cloudbase === 'undefined') {
      console.warn('[LifeOS] CloudBase SDK 未加载，同行者功能不可用（本地功能不受影响）');
      return Promise.resolve(false);
    }
    try {
      self._app = cloudbase.init({ env: CLOUD_ENV_ID });
      self._auth = self._app.auth({ persistence: 'local' });
      self._db = self._app.database();
    } catch (e) {
      console.warn('[LifeOS] CloudBase 初始化异常:', e);
      return Promise.resolve(false);
    }

    return self._auth.getLoginState().then(function(state) {
      if (state && state.uid) {
        self._uid = state.uid;
        localStorage.setItem(STORAGE_UID, self._uid);
        self._ready = true;
        self._processQueue();
        return true;
      }
      // 匿名登录
      return self._auth.signInAnonymously().then(function(res) {
        var uid = null;
        if (res) {
          uid = res.uid || (res.user && res.user.uid) || null;
        }
        if (!uid) {
          return self._auth.getLoginState().then(function(s2) {
            if (s2 && s2.uid) uid = s2.uid;
            return self._finishInit(uid);
          });
        }
        return self._finishInit(uid);
      });
    }).catch(function(e) {
      console.warn('[LifeOS] 匿名登录失败，离线模式:', e);
      return false;
    });
  },

  _finishInit: function(uid) {
    if (uid) {
      this._uid = uid;
      localStorage.setItem(STORAGE_UID, uid);
      this._ready = true;
      this._processQueue();
      return true;
    }
    return false;
  },

  getUid: function() {
    if (this._uid) return this._uid;
    return localStorage.getItem(STORAGE_UID) || null;
  },

  isReady: function() {
    return this._ready;
  },

  // ==================================================================
  // 同步队列 — 离线优先
  // ==================================================================

  /**
   * 入队（失败时调用）
   */
  _enqueue: function(type, payload) {
    var queue = _lsLoad(STORAGE_SYNC_QUEUE, []);
    queue.push({ type: type, payload: payload, attempts: 0, ts: Date.now() });
    _lsSave(STORAGE_SYNC_QUEUE, queue);
    // 通知 UI 更新待同步指示器
    if (window._lifeosSyncQueueChanged) window._lifeosSyncQueueChanged();
  },

  /**
   * 处理待同步队列
   */
  _processQueue: function() {
    var self = this;
    if (!self._ready || !navigator.onLine) return;
    var queue = _lsLoad(STORAGE_SYNC_QUEUE, []);
    if (queue.length === 0) return;

    var remaining = [];
    var chain = Promise.resolve();

    queue.forEach(function(item) {
      chain = chain.then(function() {
        return self._executeQueueItem(item).then(function(success) {
          if (!success) {
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts < 5) remaining.push(item);
          }
        }).catch(function() {
          item.attempts = (item.attempts || 0) + 1;
          if (item.attempts < 5) remaining.push(item);
        });
      });
    });

    chain.then(function() {
      _lsSave(STORAGE_SYNC_QUEUE, remaining);
      if (window._lifeosSyncQueueChanged) window._lifeosSyncQueueChanged();
    });
  },

  _executeQueueItem: function(item) {
    var self = this;
    if (item.type === 'pushProgress') {
      var shareData = item.payload.data;
      return self._db.collection('shares')
        .where({ uid: self._uid })
        .get()
        .then(function(res) {
          if (res.data && res.data.length > 0) {
            return self._db.collection('shares').doc(res.data[0]._id).update(shareData);
          } else {
            shareData.uid = self._uid;
            return self._db.collection('shares').add(shareData);
          }
        })
        .then(function() { return true; });
    }
    return Promise.resolve(true);
  },

  /**
   * 查询某目标是否有待同步记录
   */
  hasPendingForGoal: function(goalId) {
    var queue = _lsLoad(STORAGE_SYNC_QUEUE, []);
    return queue.some(function(item) {
      return item.type === 'pushProgress' &&
             item.payload &&
             item.payload.goalId === goalId;
    });
  },

  hasAnyPending: function() {
    var queue = _lsLoad(STORAGE_SYNC_QUEUE, []);
    return queue.length > 0;
  },

  // ==================================================================
  // 暗号房间
  // ==================================================================

  /**
   * 创建暗号房间
   * @returns {Promise<{code: string, roomId: string}>}
   */
  createRoom: function(myName) {
    var self = this;
    var code = CODE_PHRASES[Math.floor(Math.random() * CODE_PHRASES.length)];
    var now = Date.now();

    return self._db.collection('rooms').add({
      code: code,
      creatorUid: self._uid,
      creatorName: myName || '匿名',
      partnerUid: null,
      partnerName: null,
      status: 'waiting',
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000
    }).then(function(res) {
      return { code: code, roomId: res._id || res.id };
    });
  },

  /**
   * 加入暗号房间
   * @returns {Promise<{roomId, partnerUid, partnerName}>}
   */
  joinRoom: function(code, myName) {
    var self = this;
    return self._db.collection('rooms')
      .where({ code: code, status: 'waiting' })
      .get()
      .then(function(res) {
        if (!res.data || res.data.length === 0) {
          throw new Error('暗号不存在或已被使用');
        }
        var room = res.data[0];
        if (Date.now() > room.expiresAt) {
          // 过期，删除
          self._db.collection('rooms').doc(room._id).remove().catch(function() {});
          throw new Error('暗号已过期（超过24小时）');
        }
        if (room.creatorUid === self._uid) {
          throw new Error('这是你自己创建的暗号，等对方加入就好');
        }
        return self._db.collection('rooms').doc(room._id).update({
          partnerUid: self._uid,
          partnerName: myName || '匿名',
          status: 'matched'
        }).then(function() {
          return {
            roomId: room._id,
            partnerUid: room.creatorUid,
            partnerName: room.creatorName || '匿名'
          };
        });
      });
  },

  /**
   * 轮询房间状态（创建者等待对方加入）
   */
  pollRoomStatus: function(roomId) {
    var self = this;
    return self._db.collection('rooms').doc(roomId).get().then(function(res) {
      if (res.data && res.data.length > 0) {
        var room = res.data[0];
        if (room.status === 'matched' && room.partnerUid) {
          return {
            matched: true,
            partnerUid: room.creatorUid === self._uid ? room.partnerUid : room.creatorUid,
            partnerName: room.creatorUid === self._uid ? room.partnerName : room.creatorName
          };
        }
        if (room.status === 'ended') {
          return { matched: false, ended: true };
        }
      }
      return { matched: false };
    });
  },

  // ==================================================================
  // 共享数据推送 / 拉取
  // ==================================================================

  /**
   * 推送自己的共享数据到云端
   * 离线或失败时入队，联网自动补传
   * @param {Object} shareData - 共享数据
   * @param {string} goalId - 触发同步的目标ID（用于待同步指示器）
   */
  pushProgress: function(shareData, goalId) {
    var self = this;
    if (!self._ready) {
      self._enqueue('pushProgress', { data: shareData, goalId: goalId });
      return Promise.resolve(false);
    }
    return self._db.collection('shares')
      .where({ uid: self._uid })
      .get()
      .then(function(res) {
        if (res.data && res.data.length > 0) {
          return self._db.collection('shares').doc(res.data[0]._id).update(shareData);
        } else {
          shareData.uid = self._uid;
          return self._db.collection('shares').add(shareData);
        }
      })
      .then(function() { return true; })
      .catch(function(e) {
        console.warn('[LifeOS] 推送失败，加入待同步队列:', e);
        self._enqueue('pushProgress', { data: shareData, goalId: goalId });
        return false;
      });
  },

  /**
   * 拉取对方的共享数据
   */
  fetchPartner: function() {
    var self = this;
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid || !self._ready) return Promise.resolve(null);

    return self._db.collection('shares')
      .where({ uid: partner.uid })
      .get()
      .then(function(res) {
        if (res.data && res.data.length > 0) return res.data[0];
        return null;
      })
      .catch(function(e) {
        console.warn('[LifeOS] 拉取对方数据失败:', e);
        return null;
      });
  },

  // ==================================================================
  // 打气消息
  // ==================================================================

  /**
   * 发送打气消息
   */
  sendCheer: function(message) {
    var self = this;
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid || !self._ready) return Promise.resolve(false);

    return self._db.collection('cheers').add({
      fromUid: self._uid,
      toUid: partner.uid,
      message: message,
      createdAt: Date.now(),
      read: false
    }).then(function() { return true; })
      .catch(function(e) {
        console.warn('[LifeOS] 发送打气失败:', e);
        return false;
      });
  },

  /**
   * 拉取发给自己的打气消息
   */
  fetchCheers: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    return self._db.collection('cheers')
      .where({ toUid: self._uid })
      .get()
      .then(function(res) {
        // 手动排序（兼容不支持 orderBy 的情况）
        var list = res.data || [];
        list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        return list.slice(0, 10);
      })
      .catch(function(e) {
        console.warn('[LifeOS] 拉取打气失败:', e);
        return [];
      });
  },

  /**
   * 标记打气消息已读
   */
  markCheersRead: function(cheerIds) {
    var self = this;
    if (!self._ready || !cheerIds || cheerIds.length === 0) return Promise.resolve();
    var promises = cheerIds.map(function(id) {
      return self._db.collection('cheers').doc(id).update({ read: true }).catch(function() {});
    });
    return Promise.all(promises);
  },

  // ==================================================================
  // 结束同行
  // ==================================================================

  endRoom: function() {
    var self = this;
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner) return Promise.resolve(true);

    var roomId = partner.roomId;
    var partnerUid = partner.uid;

    var tasks = [];
    if (self._ready) {
      // 更新房间状态
      tasks.push(
        self._db.collection('rooms').doc(roomId).update({ status: 'ended' }).catch(function() {})
      );
      // 删除自己的共享文档
      tasks.push(
        self._db.collection('shares').where({ uid: self._uid }).get().then(function(res) {
          if (res.data && res.data.length > 0) {
            return self._db.collection('shares').doc(res.data[0]._id).remove().catch(function() {});
          }
        }).catch(function() {})
      );
      // 通知对方
      tasks.push(
        self._db.collection('cheers').add({
          fromUid: self._uid,
          toUid: partnerUid,
          message: '__ENDED__',
          createdAt: Date.now(),
          read: false
        }).catch(function() {})
      );
    }

    return Promise.all(tasks).then(function() {
      localStorage.removeItem(STORAGE_PARTNER);
      localStorage.removeItem(STORAGE_SHARE_SETTINGS);
      return true;
    });
  },

  // ==================================================================
  // 共同目标 — 共享水池
  // ==================================================================

  /**
   * 创建共同目标（邀请）
   * A 创建后写入云端，B 打开同行者页看到邀请卡
   */
  createSharedGoal: function(data) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid) return Promise.resolve(false);

    return self._db.collection('shared_goals').add({
      creatorUid: self._uid,
      creatorName: data.creatorName || '匿名',
      partnerUid: partner.uid,
      partnerName: partner.name || 'TA',
      name: data.name,
      type: data.type,          // 'cumulative' | 'habit'
      target: data.target,
      unit: data.unit || '个',
      why: data.why || '',
      weeklyTarget: data.weeklyTarget || null,
      status: 'pending',        // pending → active → completed/ended
      creatorContribution: 0,
      partnerContribution: 0,
      creatorCheckinDates: [],
      partnerCheckinDates: [],
      completedAt: null,
      createdAt: Date.now()
    }).then(function(res) {
      return res._id || res.id;
    });
  },

  /**
   * 拉取共同目标邀请（发给自己的、状态为 pending 的）
   */
  fetchSharedGoalInvites: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    return self._db.collection('shared_goals')
      .where({ partnerUid: self._uid, status: 'pending' })
      .get()
      .then(function(res) {
        return res.data || [];
      })
      .catch(function() { return []; });
  },

  /**
   * 拉取活跃的共同目标
   */
  fetchActiveSharedGoals: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid) return Promise.resolve([]);

    return self._db.collection('shared_goals')
      .where({
        status: self._db.command.in(['active', 'completed'])
      })
      .get()
      .then(function(res) {
        var all = res.data || [];
        // 过滤出自己参与的
        return all.filter(function(r) {
          return r.creatorUid === self._uid || r.partnerUid === self._uid;
        });
      })
      .catch(function() { return []; });
  },

  /**
   * 接受共同目标邀请
   */
  acceptSharedGoal: function(sharedGoalId) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    return self._db.collection('shared_goals').doc(sharedGoalId).update({
      status: 'active'
    }).then(function() { return true; })
      .catch(function() { return false; });
  },

  /**
   * 拒绝共同目标邀请
   */
  rejectSharedGoal: function(sharedGoalId) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    return self._db.collection('shared_goals').doc(sharedGoalId).update({
      status: 'rejected'
    }).then(function() { return true; })
      .catch(function() { return false; });
  },

  /**
   * 推送自己的贡献增量到共同目标
   */
  pushSharedProgress: function(sharedGoalId, increment, checkinDate) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    if (!self._uid) return Promise.resolve(false);

    return self._db.collection('shared_goals').doc(sharedGoalId).get().then(function(res) {
      if (!res.data || res.data.length === 0) return false;
      var doc = res.data[0];
      var update = {};

      if (doc.creatorUid === self._uid) {
        update.creatorContribution = (doc.creatorContribution || 0) + increment;
        var dates1 = (doc.creatorCheckinDates || []).slice();
        if (dates1.indexOf(checkinDate) === -1) dates1.push(checkinDate);
        update.creatorCheckinDates = dates1;
      } else if (doc.partnerUid === self._uid) {
        update.partnerContribution = (doc.partnerContribution || 0) + increment;
        var dates2 = (doc.partnerCheckinDates || []).slice();
        if (dates2.indexOf(checkinDate) === -1) dates2.push(checkinDate);
        update.partnerCheckinDates = dates2;
      } else {
        return false;
      }

      // 检查是否完成
      var total = (update.creatorContribution !== undefined ? update.creatorContribution : doc.creatorContribution || 0) +
                   (update.partnerContribution !== undefined ? update.partnerContribution : doc.partnerContribution || 0);
      if (total >= doc.target && doc.status === 'active') {
        update.status = 'completed';
        update.completedAt = Date.now();
      }

      return self._db.collection('shared_goals').doc(sharedGoalId).update(update).then(function() { return true; });
    }).catch(function() { return false; });
  },

  /**
   * 结束同行时：将活跃的共同目标标记为 ended
   */
  endSharedGoals: function() {
    var self = this;
    if (!self._ready) return Promise.resolve();
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid) return Promise.resolve();

    return self._db.collection('shared_goals')
      .where({ status: self._db.command.in(['pending', 'active']) })
      .get()
      .then(function(res) {
        var all = res.data || [];
        var mine = all.filter(function(r) {
          return r.creatorUid === self._uid || r.partnerUid === self._uid;
        });
        var promises = mine.map(function(r) {
          return self._db.collection('shared_goals').doc(r._id).update({ status: 'ended' }).catch(function() {});
        });
        return Promise.all(promises);
      })
      .catch(function() {});
  },

  // ==================================================================
  // 裁判模式 — 待认证打卡
  // ==================================================================

  /**
   * 推送待认证打卡给裁判
   */
  pushPendingCheckin: function(data) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    var partner = _lsLoad(STORAGE_PARTNER, null);
    if (!partner || !partner.uid) return Promise.resolve(false);

    return self._db.collection('pending_checkins').add({
      fromUid: self._uid,
      fromName: data.fromName || '匿名',
      toUid: partner.uid,         // 裁判的 uid
      goalId: data.goalId,
      goalName: data.goalName,
      amount: data.amount,
      date: data.date,
      note: data.note || '',
      tag: data.tag || '',
      status: 'pending',          // pending → approved / rejected / auto_approved
      reason: '',                 // 驳回理由
      createdAt: Date.now(),
      resolvedAt: null
    }).then(function(res) {
      return res._id || res.id;
    });
  },

  /**
   * 拉取需要自己认证的待处理打卡
   */
  fetchPendingCheckins: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    return self._db.collection('pending_checkins')
      .where({ toUid: self._uid, status: 'pending' })
      .get()
      .then(function(res) {
        var list = res.data || [];
        list.sort(function(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
        return list;
      })
      .catch(function() { return []; });
  },

  /**
   * 拉取自己被驳回的打卡（可申诉重新提交）
   */
  fetchRejectedCheckins: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    return self._db.collection('pending_checkins')
      .where({ fromUid: self._uid, status: 'rejected' })
      .get()
      .then(function(res) {
        return res.data || [];
      })
      .catch(function() { return []; });
  },

  /**
   * 拉取自己已认证的打卡（含自动认证）
   */
  fetchApprovedCheckins: function() {
    var self = this;
    if (!self._ready) return Promise.resolve([]);
    return self._db.collection('pending_checkins')
      .where({
        fromUid: self._uid,
        status: self._db.command.in(['approved', 'auto_approved'])
      })
      .get()
      .then(function(res) {
        return res.data || [];
      })
      .catch(function() { return []; });
  },

  /**
   * 认证打卡
   */
  approveCheckin: function(checkinId) {
    var self = this;
    if (!self._ready) return Promise.resolve(false);
    return self._db.collection('pending_checkins').doc(checkinId).update({
      status: 'approved',
      resolvedAt: Date.now()
    }).then(function() { return true; })
      .catch(function() { return false; });
  },

  /**
   * 驳回打卡（必须填理由）
   */
  rejectCheckin: function(checkinId, reason) {
    var self = this;
    if (!self._ready || !reason || !reason.trim()) return Promise.resolve(false);
    return self._db.collection('pending_checkins').doc(checkinId).update({
      status: 'rejected',
      reason: reason.trim(),
      resolvedAt: Date.now()
    }).then(function() { return true; })
      .catch(function() { return false; });
  },

  /**
   * 自动认证超时打卡（48小时未处理）
   */
  autoApproveExpired: function() {
    var self = this;
    if (!self._ready) return Promise.resolve(0);
    var cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return self._db.collection('pending_checkins')
      .where({ toUid: self._uid, status: 'pending' })
      .get()
      .then(function(res) {
        var list = res.data || [];
        var expired = list.filter(function(c) { return (c.createdAt || 0) < cutoff; });
        var promises = expired.map(function(c) {
          return self._db.collection('pending_checkins').doc(c._id).update({
            status: 'auto_approved',
            resolvedAt: Date.now()
          }).catch(function() {});
        });
        return Promise.all(promises).then(function() { return expired.length; });
      })
      .catch(function() { return 0; });
  },

  /**
   * 清理已处理的认证记录（认证/驳回后被拉取过即可删）
   */
  clearProcessedCheckins: function() {
    var self = this;
    if (!self._ready) return Promise.resolve();
    return self._db.collection('pending_checkins')
      .where({
        fromUid: self._uid,
        status: self._db.command.in(['approved', 'auto_approved'])
      })
      .get()
      .then(function(res) {
        var list = res.data || [];
        var promises = list.map(function(c) {
          return self._db.collection('pending_checkins').doc(c._id).remove().catch(function() {});
        });
        return Promise.all(promises);
      })
      .catch(function() {});
  },

  // ==================================================================
  // 清理过期房间
  // ==================================================================
  cleanExpiredRooms: function() {
    var self = this;
    if (!self._ready) return;
    var now = Date.now();
    self._db.collection('rooms')
      .where({ status: 'waiting' })
      .get()
      .then(function(res) {
        if (!res.data) return;
        res.data.forEach(function(room) {
          if (now > room.expiresAt) {
            self._db.collection('rooms').doc(room._id).remove().catch(function() {});
          }
        });
      })
      .catch(function() {});
  }
};

// ======================================================================
// 网络状态监听 — 联网自动补传
// ======================================================================
window.addEventListener('online', function() {
  console.log('[LifeOS] 网络恢复，开始补传同步队列');
  syncAdapter._processQueue();
});

// 暴露到全局
window.syncAdapter = syncAdapter;
window.CLOUD_CONST = {
  STORAGE_UID: STORAGE_UID,
  STORAGE_PARTNER: STORAGE_PARTNER,
  STORAGE_SHARE_SETTINGS: STORAGE_SHARE_SETTINGS,
  STORAGE_SYNC_QUEUE: STORAGE_SYNC_QUEUE
};
