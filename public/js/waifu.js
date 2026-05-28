function GM_addStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
function GM_getValue(key, defaultValue) {
  const v = localStorage.getItem(key);
  if (v === null) return defaultValue;
  try {
    return JSON.parse(v);
  } catch (e) {
    return v;
  }
}
function GM_setValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function GM_xmlhttpRequest(opt) {
  const { method = 'GET', url, headers = {}, data, onload, onerror } = opt;
  fetch(url, { method, headers, body: data })
    .then(async (res) => {
      const text = await res.text();
      if (onload) onload({ responseText: text, status: res.status, statusText: res.statusText });
    })
    .catch((err) => {
      if (onerror) onerror(err);
    });
}

/*

    く__,.ヘヽ.　　　　/　,ー､ 〉
    　　　　　＼ ', !-─‐-i　/　/´
    　　　 　 ／｀ｰ'　　　 L/／｀ヽ､
    　　 　 /　 ／,　 /|　 ,　 ,　　　 ',
    　　　ｲ 　/ /-‐/　ｉ　L_ ﾊ ヽ!　 i
    　　　 ﾚ ﾍ 7ｲ｀ﾄ　 ﾚ'ｧ-ﾄ､!ハ|　 |
    　　　　 !,/7 '0'　　 ´0iソ| 　 |
    　　　　 |.从"　　_　　 ,,,, / |./ 　 |
    　　　　 ﾚ'| i＞.､,,__　_,.イ / 　.i 　|
    　　　　　 ﾚ'| | / k_７_/ﾚ'ヽ,　ﾊ.　|
    　　　　　　 | |/i 〈|/　 i　,.ﾍ |　i　|
    　　　　　　.|/ /　ｉ： 　 ﾍ!　　＼　|
    　　　 　 　 kヽ>､ﾊ 　 _,.ﾍ､ 　 /､!
    　　　　　　 !'〈//｀Ｔ´', ＼ ｀'7'ｰr'
    　　　　　　 ﾚ'ヽL__|___i,___,ンﾚ|ノ
    　　　　　 　　　ﾄ-,/　|___./
    　　　　　 　　　'ｰ'　　!_,.
    */

(function () {
  'use strict';

  // ========== 默认配置 ==========
  const DEFAULT_CONFIG = {
    enabled: true,
    loadDelay: 1000,
    showLoadingTip: true,
    // 用户昵称
    nickname: '宝宝',

    // 看板娘设置（跨网站同步）
    waifu: {
      modelId: 1,
      modelTexturesId: 53,
      dockSide: 'right', // 'left' 或 'right'，记住停靠位置
      localModels: [{ id: 1, name: 'koharu', modelUrl: '/live2d/koharu/koharu.model.json' }],
      modelIndex: 0,
    },

    // 待办提醒设置
    todos: {
      enabled: true,
      list: [],
    },

    customMessages: {
      welcome: {
        morning: [
          '早上好呀{nickname}！新的一天开始了~<i class="el-icon-sunrise-1"></i>',
          '早安{nickname}！今天也要加油哦！<i class="el-icon-sunrise-1"></i>',
          '美好的早晨，{nickname}要吃早餐哦~<i class="el-icon-sunrise-1"></i>',
        ],
        noon: [
          '{nickname}中午好！该吃午饭啦~<i class="el-icon-knife-fork"></i>',
          '午餐时间到{nickname}！<i class="el-icon-knife-fork"></i>',
          '{nickname}中午了，休息一下吧~<i class="el-icon-knife-fork"></i>',
        ],
        afternoon: [
          '{nickname}下午好！工作累了吗？<i class="el-icon-milk-tea"></i>',
          '午后时光，{nickname}要不要休息一下？<i class="el-icon-milk-tea"></i>',
          '{nickname}下午茶时间到~<i class="el-icon-milk-tea"></i>',
        ],
        evening: [
          '{nickname}晚上好！今天过得怎么样？<i class="el-icon-table-lamp"></i>',
          '夜深了{nickname}，早点休息哦~<i class="el-icon-table-lamp"></i>',
          '晚安{nickname}，做个好梦~<i class="el-icon-table-lamp"></i>',
        ],
        night: [
          '{nickname}这么晚还不睡吗？<i class="el-icon-moon"></i>',
          '{nickname}熬夜对身体不好哦~<i class="el-icon-moon"></i>',
          '夜猫子{nickname}，该睡觉啦！<i class="el-icon-moon"></i>',
        ],
      },
      idle: [
        '{nickname}在干嘛呢？',
        '{nickname}无聊了吗？',
        '{nickname}要不要聊聊天？',
        '{nickname}陪我玩会儿吧~',
      ],
      click: [
        '不要戳我啦{nickname}！',
        '讨厌~{nickname}',
        '{nickname}再戳我就生气了！',
        '呜...好痒...{nickname}',
        '{nickname}你想干嘛？',
        '你看到我的小熊了吗？{nickname}',
        '再戳我可要报警了！',
        '110吗，这里有个变态一直在摸我(ó﹏ò｡)',
      ],
      sentiment: {
        positive: [
          '这篇笔记感觉很积极，继续保持好心情吧，{nickname}~',
          '{nickname}的笔记情绪很好，看起来今天你状态不错！',
          '写得真棒，{nickname}，这篇笔记充满正能量。',
        ],
        neutral: [
          '这篇笔记感觉比较平稳，适合好好整理思路。',
          '最近笔记情绪很稳，{nickname}可以继续保持记录节奏。',
          '平静地写笔记也很不错，{nickname}。',
        ],
        negative: [
          '这篇笔记的情绪有点沉重，写出来会让人轻松一些。',
          '{nickname}如果心情不好，可以慢慢写，笔记会陪着你。',
          '我感觉这篇笔记有点难过，照顾好自己，别太累了。',
        ],
      },
      sentimentOnSave: {
        positive: [
          '已保存笔记《{title}》，能感觉到你今天很开心。',
          '你刚刚写的这篇笔记很正面，{nickname}为你点赞！',
          '保存成功！这篇笔记让人觉得很阳光。',
        ],
        neutral: [
          '笔记《{title}》已保存，情绪很平稳，继续保持记录好习惯。',
          '已保存平静的笔记，{nickname}感觉你很专注。',
          '保存成功！这篇笔记给人一种沉稳的感觉。',
        ],
        negative: [
          '笔记《{title}》已保存，写出来会轻松一些，{nickname}要好好照顾自己。',
          '已保存这篇情绪稍重的笔记，{nickname}如果需要可以多记录几次。',
          '保存成功，我会陪着你，别让自己太压抑。',
        ],
      },
    },

    healthReminders: {
      enabled: true,
      workingHours: { start: 9, end: 23 },
      water: {
        enabled: true,
        interval: 30,
        messages: [
          '{nickname}该喝水啦！<i class="el-icon-water-cup"></i>',
          '{nickname}记得补充水分哦~<i class="el-icon-hot-water"></i>',
          '{nickname}喝口水休息一下吧！<i class="el-icon-water-cup"></i>',
          '水是生命之源~{nickname}<i class="el-icon-hot-water"></i>',
        ],
      },
      rest: {
        enabled: true,
        interval: 60,
        messages: [
          '{nickname}休息一下眼睛吧！<i class="el-icon-view"></i>',
          '{nickname}站起来活动活动~<i class="el-icon-video-play"></i>',
          '{nickname}工作一小时了，该休息啦！<i class="el-icon-video-play"></i>',
          '眺望远方，放松眼睛~{nickname}<i class="el-icon-view"></i>',
        ],
      },
      posture: {
        enabled: true,
        interval: 45,
        messages: [
          '{nickname}注意坐姿哦！<i class="el-icon-user"></i>',
          '{nickname}腰背挺直，保持好姿势~<i class="el-icon-user"></i>',
          '{nickname}久坐伤身，站起来走走吧~<i class="el-icon-video-play"></i>',
        ],
      },
      sleep: {
        enabled: true,
        time: 23,
        messages: [
          '{nickname}已经很晚了，该睡觉了！<i class="el-icon-moon"></i>',
          '{nickname}熬夜对身体不好哦~<i class="el-icon-moon"></i>',
          '{nickname}早点休息，明天才有精神~<i class="el-icon-table-lamp"></i>',
        ],
      },
    },
  };

  let config = Object.assign({}, DEFAULT_CONFIG, GM_getValue('live2d_config', {}));
  let reminderSystem = null;

  // 消息优先级系统
  let messageSystem = {
    isImportantMessageShowing: false,

    // 显示重要消息（一言、天气等）
    showImportant: function (text, timeout) {
      this.isImportantMessageShowing = true;
      if (typeof showMessage === 'function') {
        showMessage(text, timeout, true);
      }
      // 消息显示完毕后解除锁定
      setTimeout(() => {
        this.isImportantMessageShowing = false;
      }, timeout || 5000);
    },

    // 显示普通消息（鼠标悬停等）
    showNormal: function (text, timeout) {
      // 如果有重要消息正在显示，忽略普通消息
      if (this.isImportantMessageShowing) {
        return;
      }
      if (typeof showMessage === 'function') {
        showMessage(text, timeout);
      }
    },
  };

  function saveConfig() {
    GM_setValue('live2d_config', config);
    console.log('[Live2D] 配置已保存');
  }

  function shouldLoad() {
    return config.enabled;
  }

  if (!shouldLoad()) {
    console.log('[Live2D] 已禁用');
    return;
  }

  // 防止在 iframe 中运行
  if (window.self !== window.top) {
    console.log('[Live2D] 检测到 iframe 环境，跳过加载');
    return;
  }

  console.log('[Live2D] 看板娘增强版开始加载...');

  // 已移除左下角菜单按钮，改为仅保留右下角看板娘工具栏中的设置入口
  // GM_registerMenuCommand('⚙ 看板娘设置', showConfigPanel);

  // ========== 样式 ==========
  GM_addStyle(`
        /* 看板娘基础样式 */
        .waifu {
            position: fixed;
            bottom: 0;
            right: 0;
            z-index: 999999 !important;
            font-size: 0;
            transform: translateY(3px);
            transform-origin: bottom right;
            opacity: 0;
            transition: opacity 0.5s ease-in-out, transform 0.3s ease-in-out;
        }
        .waifu.loaded { opacity: 1; }
        .waifu:hover { transform: translateY(0); }

        .waifu-tips {
            opacity: 0;
            margin: -50px 20px;
            padding: 8px 14px;
            border: 1px solid rgb(211, 211, 211);
            border-radius: 12px;
            background-color: rgb(255, 255, 255);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            position: absolute;
            min-width: 80px !important;
            max-width: 250px !important;
            width: fit-content !important;
            height: auto !important;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
            color: rgb(0, 0, 0);
            transition: opacity 0.3s ease-in-out, transform 0.3s;
            word-wrap: break-word;
            white-space: normal;
            display: inline-block;
            text-align: center;
        }

        /* 对话框小三角箭头 - 相对于看板娘固定位置 */
        .waifu-tips::before {
            content: "";
            position: absolute;
            width: 16px;
            height: 16px;
            bottom: -8px;
            right: 30px;
            transform: rotate(45deg);
            background-color: rgb(255, 255, 255);
            border-right: 1px solid rgb(211, 211, 211);
            border-bottom: 1px solid rgb(211, 211, 211);
        }

        /* 显示动画 */
        .waifu-tips.active {
            opacity: 1;
            transform: translateY(-5px);
        }

        .waifu #live2d { position: relative; }

        /* 加载动画 */
        .waifu-loading {
            position: absolute;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }
        .waifu-loading svg {
            width: 60px;
            height: 60px;
        }
        .waifu-loading svg polyline {
            fill: none;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .waifu-loading svg polyline#back {
            fill: none;
            stroke: #ff4d5033;
        }
        .waifu-loading svg polyline#front {
            fill: none;
            stroke: #ff4d4f;
            stroke-dasharray: 48, 144;
            stroke-dashoffset: 192;
            animation: dash_682 1.4s linear infinite;
        }
        @keyframes dash_682 {
            72.5% { opacity: 0; }
            to { stroke-dashoffset: 0; }
        }
        .waifu-loading-text {
            font-size: 12px;
            color: #ff4d4f;
            font-weight: bold;
            text-shadow: 0 0 5px rgba(255, 77, 79, 0.5);
        }

        @keyframes shake {
            2% { transform: translate(0.5px, -1.5px) rotate(-0.5deg); }
            4% { transform: translate(0.5px, 1.5px) rotate(1.5deg); }
            50% { transform: translate(-1.5px, 1.5px) rotate(0.5deg); }
            0%, 100% { transform: translate(0, 0) rotate(0); }
        }

        /* 本地图标样式 */

        /* 配置面板样式 - 苹果风格简约设计 */
    `);
  // ========== 健康提醒系统 ==========
  class HealthReminderSystem {
    constructor() {
      this.timers = {};
      this.startTime = Date.now();
      this.lastReminders = {};
    }

    init() {
      if (!config.healthReminders.enabled) {
        console.log('[Live2D] 健康提醒已禁用');
        return;
      }

      console.log('[Live2D] 健康提醒系统启动');

      if (config.healthReminders.water.enabled) {
        this.startReminder('water', config.healthReminders.water.interval);
      }

      if (config.healthReminders.rest.enabled) {
        this.startReminder('rest', config.healthReminders.rest.interval);
      }

      if (config.healthReminders.posture.enabled) {
        this.startReminder('posture', config.healthReminders.posture.interval);
      }

      if (config.healthReminders.sleep.enabled) {
        this.checkSleepTime();
        this.timers.sleep = setInterval(() => this.checkSleepTime(), 60000);
      }
    }

    startReminder(type, intervalMinutes) {
      const intervalMs = intervalMinutes * 60 * 1000;

      this.timers[type] = setInterval(() => {
        if (this.shouldShowReminder()) {
          this.showReminder(type);
        }
      }, intervalMs);

      console.log(`[Live2D] ${type} 提醒已启动，间隔 ${intervalMinutes} 分钟`);
    }

    shouldShowReminder() {
      const now = new Date();
      const hour = now.getHours();
      const { start, end } = config.healthReminders.workingHours;
      return hour >= start && hour < end;
    }

    showReminder(type) {
      let messages;
      switch (type) {
        case 'water':
          messages = config.healthReminders.water.messages;
          break;
        case 'rest':
          messages = config.healthReminders.rest.messages;
          break;
        case 'posture':
          messages = config.healthReminders.posture.messages;
          break;
        default:
          return;
      }

      const message = messages[Math.floor(Math.random() * messages.length)];
      this.displayMessage(message);
    }

    checkSleepTime() {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      if (hour === config.healthReminders.sleep.time && minute === 0) {
        const today = now.toDateString();
        if (this.lastReminders.sleep !== today) {
          const messages = config.healthReminders.sleep.messages;
          const message = messages[Math.floor(Math.random() * messages.length)];
          this.displayMessage(message);
          this.lastReminders.sleep = today;
        }
      }
    }

    displayMessage(text) {
      const nickname = config.nickname || '宝宝';
      const message = text.replace(/\{nickname\}/g, nickname);
      if (typeof showMessage === 'function') {
        showMessage(message, 5000, true);
      } else {
        console.log('[Live2D] 提醒:', message);
      }
    }

    stop() {
      Object.keys(this.timers).forEach((key) => {
        clearInterval(this.timers[key]);
      });
      this.timers = {};
      console.log('[Live2D] 健康提醒系统已停止');
    }
  }

  // ========== 自定义消息 ==========
  function showCustomWelcome() {
    const now = new Date();
    const hour = now.getHours();
    const nickname = config.nickname || '宝宝';
    let messages;

    if (hour >= 5 && hour < 11) {
      messages = config.customMessages.welcome.morning.map((msg) =>
        msg.replace(/\{nickname\}/g, nickname),
      );
    } else if (hour >= 11 && hour < 13) {
      messages = config.customMessages.welcome.noon.map((msg) =>
        msg.replace(/\{nickname\}/g, nickname),
      );
    } else if (hour >= 13 && hour < 18) {
      messages = config.customMessages.welcome.afternoon.map((msg) =>
        msg.replace(/\{nickname\}/g, nickname),
      );
    } else if (hour >= 18 && hour < 22) {
      messages = config.customMessages.welcome.evening.map((msg) =>
        msg.replace(/\{nickname\}/g, nickname),
      );
    } else {
      messages = config.customMessages.welcome.night.map((msg) =>
        msg.replace(/\{nickname\}/g, nickname),
      );
    }

    const message = messages[Math.floor(Math.random() * messages.length)];

    setTimeout(() => {
      if (typeof showMessage === 'function') {
        showMessage(message, 6000, true);
      }
    }, 3000);
  }

  let currentNoteSentiment = null;

  function getNoteSentiment() {
    return currentNoteSentiment;
  }

  function getSentimentCategory(sentiment) {
    if (!sentiment) return null;
    const positiveThreshold = 0.25;
    const negativeThreshold = -0.25;
    if (sentiment.comparative >= positiveThreshold || sentiment.score > 2) {
      return 'positive';
    }
    if (sentiment.comparative <= negativeThreshold || sentiment.score < -2) {
      return 'negative';
    }
    return 'neutral';
  }

  function getSentimentMessages(category, group = 'sentiment') {
    if (!config.customMessages[group]) return [];
    return config.customMessages[group][category] || [];
  }

  function getSentimentTip(sentiment, group = 'sentiment') {
    if (!sentiment) return null;
    const category = getSentimentCategory(sentiment);
    if (!category) return null;
    const messages = getSentimentMessages(category, group);
    if (!messages.length) return null;
    const nickname = config.nickname || '宝宝';
    let message = messages[Math.floor(Math.random() * messages.length)];
    return message
      .replace(/\{nickname\}/g, nickname)
      .replace(/\{title\}/g, sentiment.title || '')
      .replace(/\{score\}/g, sentiment.score)
      .replace(/\{comparative\}/g, sentiment.comparative.toFixed(2));
  }

  function showSentimentTip() {
    const sentiment = getNoteSentiment();
    const message = getSentimentTip(sentiment, 'sentiment');
    if (!message || typeof showMessage !== 'function') return;
    showMessage(message, 5000);
  }

  function showSavedSentimentTip(detail) {
    const sentiment = detail || getNoteSentiment();
    const message =
      getSentimentTip(sentiment, 'sentimentOnSave') || getSentimentTip(sentiment, 'sentiment');
    if (!message || typeof showMessage !== 'function') return;
    showMessage(message, 6000, true);
  }

  function onNoteSentimentUpdate(event) {
    if (!event?.detail) return;
    currentNoteSentiment = event.detail;
    showSentimentTip();
  }

  function onNoteSaved(event) {
    if (!event?.detail) return;
    currentNoteSentiment = event.detail;
    showSavedSentimentTip(event.detail);
  }

  function setupCustomMessages() {
    $(document).on('click', '.waifu #live2d', function () {
      const nickname = config.nickname || '宝宝';
      const messages = config.customMessages.click;
      let message = messages[Math.floor(Math.random() * messages.length)];
      message = message.replace(/\{nickname\}/g, nickname);
      if (typeof showMessage === 'function') {
        showMessage(message, 3000, true);
      }
    });

    let idleTimer;
    $(document).on('mousemove keydown', function () {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (Math.random() < 0.3) {
          const nickname = config.nickname || '宝宝';
          const sentimentMessage = getSentimentTip();
          if (sentimentMessage && Math.random() < 0.5) {
            if (typeof showMessage === 'function') {
              showMessage(sentimentMessage, 4000);
            }
            return;
          }
          const messages = config.customMessages.idle;
          let message = messages[Math.floor(Math.random() * messages.length)];
          message = message.replace(/\{nickname\}/g, nickname);
          if (typeof showMessage === 'function') {
            showMessage(message, 4000);
          }
        }
      }, 60000);
    });

    window.addEventListener('qcnote:sentiment-update', onNoteSentimentUpdate);
    window.addEventListener('qcnote:note-saved', onNoteSaved);

    // 缩小看板娘的触发区域，排除工具栏
    setTimeout(() => {
      // 移除原有的看板娘 mouseover 事件
      $(document).off('mouseover', '.waifu #live2d');

      // 只在 canvas 上添加 mouseover 事件，并检查鼠标位置
      $(document).on('mouseover', '.waifu #live2d', function (e) {
        const canvas = this;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        // 如果鼠标在右侧 60px 区域（工具栏区域），不触发
        if (mouseX > rect.width - 60) {
          return;
        }

        // 只有在没有重要消息时才显示
        if (!messageSystem.isImportantMessageShowing) {
          const texts = ['干嘛呢你，快把手拿开', '鼠…鼠标放错地方了！'];
          const text = texts[Math.floor(Math.random() * texts.length)];
          if (typeof showMessage === 'function') {
            showMessage(text, 3000);
          }
        }
      });
    }, 1000);
  }

  // ========== 拖拽停靠功能（修复版） ==========
  function initDragDocking() {
    setTimeout(() => {
      const $waifu = $('.waifu');
      const $tool = $('.waifu-tool');
      if (!$waifu.length) return;
      let isDragging = false;
      let startX = 0;
      let startWaifuLeft = 0;

      // 监听鼠标按下（开始拖拽）
      $waifu.on('mousedown', function (e) {
        const rect = this.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        // 排除工具栏区域（右侧60px），仅本体可拖拽
        if (mouseX > rect.width - 60) return;

        isDragging = true;
        startX = e.clientX;

        // 获取看板娘当前的实际位置
        const rect2 = this.getBoundingClientRect();
        startWaifuLeft = rect2.left;

        // 拖拽开始时立即切换到left定位，强制清除right定位
        $waifu[0].style.setProperty('right', 'auto', 'important');
        $waifu[0].style.setProperty('left', startWaifuLeft + 'px', 'important');
        $waifu[0].style.setProperty('transition', 'none', 'important');

        console.log('开始拖拽，初始位置:', startWaifuLeft);
        e.preventDefault();
      });

      // 监听鼠标移动（拖拽过程，实时更新位置）
      $(document).on('mousemove', function (e) {
        if (!isDragging) return;
        const moveX = e.clientX - startX;
        let newLeft = startWaifuLeft + moveX;
        const currentPageWidth = $(window).width();
        const currentWaifuWidth = $waifu.outerWidth();
        newLeft = Math.max(0, Math.min(newLeft, currentPageWidth - currentWaifuWidth));
        $waifu[0].style.setProperty('left', newLeft + 'px', 'important');
        $waifu[0].style.setProperty('right', 'auto', 'important');
      });

      // 监听鼠标松开（结束拖拽，执行平滑停靠动画）
      $(document).on('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;

        const currentLeft = parseFloat($waifu.css('left'));
        const currentPageWidth = $(window).width();
        const currentWaifuWidth = $waifu.outerWidth();

        console.log(
          '拖拽结束，当前位置:',
          currentLeft,
          '页面宽度:',
          currentPageWidth,
          '看板娘宽度:',
          currentWaifuWidth,
        );

        if (currentLeft + currentWaifuWidth / 2 < currentPageWidth / 2) {
          // 停靠左侧 - 使用平滑动画
          console.log('判定停靠到左边，目标位置: 0');

          const startLeft = currentLeft;
          const targetLeft = 0;
          const duration = 1000;
          const startTime = performance.now();

          function animateToLeft(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const newLeft = startLeft + (targetLeft - startLeft) * easeProgress;

            // 强制设置位置
            $waifu[0].style.setProperty('left', newLeft + 'px', 'important');
            $waifu[0].style.setProperty('right', 'auto', 'important');

            if (progress < 1) {
              requestAnimationFrame(animateToLeft);
            } else {
              // 动画完成，最终确保位置正确
              $waifu[0].style.setProperty('left', '0px', 'important');
              $waifu[0].style.setProperty('right', 'auto', 'important');
              console.log('左侧停靠完成，最终位置:', $waifu.css('left'));
            }
          }

          requestAnimationFrame(animateToLeft);
          $tool.addClass('left-side').css({ left: '10px', right: 'auto' });

          // 保存停靠位置到配置
          config.waifu.dockSide = 'left';
          saveConfig();
        } else {
          // 停靠右侧 - 使用平滑动画
          console.log('判定停靠到右边');

          const startLeft = currentLeft;
          const targetLeft = currentPageWidth - currentWaifuWidth;
          const duration = 1000;
          const startTime = performance.now();

          function animateToRight(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const newLeft = startLeft + (targetLeft - startLeft) * easeProgress;

            // 强制设置位置
            $waifu[0].style.setProperty('left', newLeft + 'px', 'important');
            $waifu[0].style.setProperty('right', 'auto', 'important');

            if (progress < 1) {
              requestAnimationFrame(animateToRight);
            } else {
              // 动画完成后，改用right定位
              $waifu[0].style.setProperty('left', 'auto', 'important');
              $waifu[0].style.setProperty('right', '0px', 'important');
              console.log('右侧停靠完成，最终位置:', $waifu.css('right'));
            }
          }

          requestAnimationFrame(animateToRight);
          $tool.removeClass('left-side').css({ right: '10px', left: 'auto' });

          // 保存停靠位置到配置
          config.waifu.dockSide = 'right';
          saveConfig();
        }
      });

      // 鼠标离开页面时强制结束拖拽，避免卡死
      $(document).on('mouseleave', function () {
        if (isDragging) {
          isDragging = false;
        }
      });
    }, 2000);
  }

  // ========== 初始化 ==========
  function init() {
    console.log('[Live2D] 开始初始化...');

    // 加载动画 SVG
    const loadingSvg = config.showLoadingTip
      ? `
            <div class="waifu-loading">
                <svg viewBox="0 0 44 44">
                    <polyline id="back" points="1 6 4 6 6 11 10 11 12 6 15 6 18 6 20 11 24 11 27 6 30 6 33 6 35 11 39 11 41 6 44 6"></polyline>
                    <polyline id="front" points="1 6 4 6 6 11 10 11 12 6 15 6 18 6 20 11 24 11 27 6 30 6 33 6 35 11 39 11 41 6 44 6"></polyline>
                </svg>
                <div class="waifu-loading-text">加载中...</div>
            </div>
        `
      : '';

    const waifuHtml = `
            <div class="waifu">
                ${loadingSvg}
                <div class="waifu-tips"></div>
                <canvas id="live2d" class="live2d" width="280" height="250"></canvas>
            </div>
        `;

    // 检查是否已经存在看板娘，避免重复创建
    if ($('.waifu').length > 0) {
      console.log('[Live2D] 看板娘已存在，跳过创建');
      return;
    }

    $('body').append(waifuHtml);
    const $waifu = $('.waifu');
    const $waifuLoading = $waifu.find('.waifu-loading');
    const $waifuTips = $waifu.find('.waifu-tips');

    if (typeof initModel !== 'function') {
      console.error('[Live2D] initModel 函数未定义');
      $waifuLoading.html('<div style="color:#ff4d4f;font-size:12px;">加载失败</div>');
      return;
    }

    if (typeof live2d_settings === 'undefined') {
      console.error('[Live2D] live2d_settings 未定义');
      $waifuLoading.html('<div style="color:#ff4d4f;font-size:12px;">加载失败</div>');
      return;
    }

    console.log('[Live2D] 配置参数...');

    // 将配置同步到localStorage，确保Live2D库能读取到正确的模型
    localStorage.setItem('modelId', config.waifu.modelId);
    localStorage.setItem('modelTexturesId', config.waifu.modelTexturesId);
    console.log('[Live2D] 模型同步:', config.waifu.modelId, '-', config.waifu.modelTexturesId);

    live2d_settings['modelId'] = config.waifu.modelId;
    live2d_settings['modelTexturesId'] = config.waifu.modelTexturesId;
    live2d_settings['waifuEdgeSide'] = config.waifu.dockSide === 'left' ? 'left:0' : 'right:0';
    live2d_settings['waifuDraggable'] = 'unlimited'; // 启用拖拽，支持移动设备触摸操作
    live2d_settings['waifuDraggableRevert'] = true;
    live2d_settings['modelStorage'] = true;
    live2d_settings['modelAPI'] = '/live2d/';
    live2d_settings['localModelUrl'] =
      (config.waifu.localModels &&
        config.waifu.localModels[config.waifu.modelIndex] &&
        config.waifu.localModels[config.waifu.modelIndex].modelUrl) ||
      '/live2d/koharu/koharu.model.json';
    live2d_settings['showWelcomeMessage'] = false;
    live2d_settings['showHitokoto'] = false;
    live2d_settings['showCopyMessage'] = false;
    live2d_settings['showToolMenu'] = false;
    live2d_settings['waifuMinWidth'] = '400px'; // 降低最小宽度阈值，支持移动设备显示

    console.log('[Live2D] 调用本地 initModel...');
    // 本地模型和文本数据，彻底不依赖第三方 API
    const localTips = {
      waifu: {
        model_message: { 1: ['欢迎回来，{nickname}！'] },
        load_rand_textures: ['换装成功！', '暂时没有更多本地衣服~'],
        console_open_msg: ['模型已就绪！'],
        hitokoto_api_message: {
          'lwl12.com': ['[引用]', ' - ', ''],
          'fghrsh.net': ['[引用]', ' - ', ''],
          'jinrishici.com': ['[引用]', ' - ', ''],
          'hitokoto.cn': ['[引用]', ' - ', ''],
        },
      },
      mouseover: [],
      click: [],
      seasons: [],
    };
    initModel(localTips);

    // 强制覆盖对话框样式，使其自动调整大小
    setTimeout(() => {
      $waifuTips.css({
        width: 'fit-content',
        height: 'auto',
        'min-width': '80px',
        'max-width': '250px',
      });
    }, 100);

    setTimeout(() => {
      $waifuLoading.fadeOut(300, function () {
        $(this).remove();
      });
      $waifu.addClass('loaded');
      console.log('[Live2D] 看板娘加载完成！');

      // 根据配置设置初始停靠位置
      setTimeout(() => {
        const $tool = $('.waifu-tool');
        if (config.waifu.dockSide === 'left') {
          // 设置到左边
          $waifu[0].style.setProperty('left', '0px', 'important');
          $waifu[0].style.setProperty('right', 'auto', 'important');
          $tool.addClass('left-side').css({ left: '10px', right: 'auto' });
          console.log('[Live2D] 初始位置设置为左侧');
        } else {
          // 设置到右边（默认）
          $waifu[0].style.setProperty('left', 'auto', 'important');
          $waifu[0].style.setProperty('right', '0px', 'important');
          $tool.removeClass('left-side').css({ right: '10px', left: 'auto' });
          console.log('[Live2D] 初始位置设置为右侧');
        }
      }, 500);

      showCustomWelcome();
      setupCustomMessages();
      showSentimentTip();

      reminderSystem = new HealthReminderSystem();
      reminderSystem.init();

      // 初始化拖拽停靠功能
      initDragDocking();
    }, 2000);
  }

  setTimeout(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }, config.loadDelay);

  console.log('[Live2D] 脚本加载完成，等待初始化...');
})();
