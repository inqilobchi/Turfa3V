require('dotenv').config();
const axios = require('axios');
const Fastify = require('fastify');
const fastify = Fastify({ logger: true });
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const User = require('./models/User');
const adminPanel= require('./admin'); 
const REQUIRED_CHANNELS = (process.env.REQUIRED_CHANNELS || '').split(',').map(ch => ch.trim()).filter(Boolean);
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
const apiKey = process.env.API_KEY;
const tempReferrers = new Map(); 
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, {webHook : true});

const WEBHOOK_PATH = `/webhook/${token}`;
const FULL_WEBHOOK_URL = `${process.env.PUBLIC_URL}${WEBHOOK_PATH}`;
const orderState = {};
const payState = {};
// Webhook endpoint
fastify.post(WEBHOOK_PATH, (req, reply) => {
  try {
    bot.processUpdate(req.body);  // Telegram update-larni botga uzatish juda muhim
    console.log('Update processed:', req.body);
    reply.code(200).send();       // Telegram API uchun 200 OK javob qaytarish kerak
  } catch (error) {
    console.error('Error processing update:', error);
    reply.sendStatus(500);
  }
});

// Health check endpoint
fastify.get('/healthz', (req, reply) => {
  reply.send({ status: 'ok' });
});

// Serverni ishga tushirish va webhook o‘rnatish
fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, async (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  fastify.log.info(`Server listening at ${address}`);

  try {
const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, null, {
  params: { url: FULL_WEBHOOK_URL }
});

    if (response.data.ok) {
      fastify.log.info('Webhook successfully set:', response.data);
    } else {
      fastify.log.error('Failed to set webhook:', response.data);
    }
  } catch (error) {
    fastify.log.error('Error setting webhook:', error.message);
  }
});
bot.getMe().then((botInfo) => {
  bot.me = botInfo;
  console.log(`🤖 Bot ishga tushdi: @${bot.me.username}`);
}).catch((err) => {
  console.error("Bot ma'lumotini olishda xatolik:", err.message);
});
adminPanel(bot)
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDBga ulandi');
}).catch(err => {
  console.error('MongoDB ulanishda xatolik:', err);
  process.exit(1);
});
// Obuna tekshiruvchi
async function isUserSubscribed(userId) {
  if (!REQUIRED_CHANNELS.length) return true; 

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const res = await bot.getChatMember(channel, userId);
      if (!['member', 'creator', 'administrator'].includes(res.status)) {
        return false; 
      }
    } catch (err) {
      console.error(`Obuna tekshirishda xatolik [${channel}]:`, err.message);
      return false;
    }
  }

  return true;
}
async function getSubscriptionMessage() {
  const buttons = [];

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const chat = await bot.getChat(channel);
      const title = chat.title || channel;
      const channelLink = `https://t.me/${channel.replace('@', '')}`;
      buttons.push([{ text: `${title}`, url: channelLink }]);
    } catch (err) {
      console.error(`Kanal nomini olishda xatolik: ${channel}`, err.message);
      // fallback
      buttons.push([{ text: `${channel}`, url: `https://t.me/${channel.replace('@', '')}` }]);
    }
  } 
  const SUPPORT_BOT_LINK = 'https://t.me/TurfaSeenBot?start=user19';
  const SUPPORT_BOT_TITILE = 'Turfa Seen | Rasmiy🤖';
  buttons.push([{ text: `${SUPPORT_BOT_TITILE}`, url: SUPPORT_BOT_LINK }]);  
  buttons.push([{ text: '✅ Obuna bo‘ldim', callback_data: 'check_subscription' }]);

  return {
    text: `<b>❗ Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:</b>`,
    options: {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  };
}


async function showNumberPage(chatId, messageId, userId, userSelections) {
  const selections = userSelections.get(userId);
  if (!selections) {
    console.error('❌ userSelections topilmadi');
    return;
  }

  const { allNumbers, receiveNumbers, currentPage, pageSize, totalPages } = selections;
  const startIdx = currentPage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, allNumbers.length);
  const pageNumbers = allNumbers.slice(startIdx, endIdx);

  if (pageNumbers.length === 0) {
    return bot.editMessageText('❌ Bu sahifada raqamlar yo\'q.', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  // Ikki ustunli keyboard yaratish (har qatorda 2 ta raqam)
  const buttons = [];
  for (let i = 0; i < pageNumbers.length; i += 2) {  // Har ikkitasini bir qatorga
    const row = [];
    
    // Birinchi raqam (chap ustun)
const item1 = pageNumbers[i];
let siteLabel1 = '';
if (item1.site.includes('onlinesim.io')) {
  siteLabel1 = '🪐';
} else if (item1.site === receiveSite) {
  siteLabel1 = '🎁';
} else if (item1.site === sevenSimSite) {
  siteLabel1 = '✨';
}
row.push({ 
  text: `${item1.phone}${siteLabel1}`, 
  callback_data: `select_number_${item1.site.includes('onlinesim.io') ? 'onlinesim' : item1.site === receiveSite ? 'receive' : '7sim'}_${startIdx + i}`
});

if (i + 1 < pageNumbers.length) {
  const item2 = pageNumbers[i + 1];
  let siteLabel2 = '';
  if (item2.site.includes('onlinesim.io')) {
    siteLabel2 = '🪐';
  } else if (item2.site === receiveSite) {
    siteLabel2 = '🎁';
  } else if (item2.site === sevenSimSite) {
    siteLabel2 = '✨';
  }
  row.push({ 
    text: `${item2.phone}${siteLabel2}`, 
    callback_data: `select_number_${item2.site.includes('onlinesim.io') ? 'onlinesim' : item2.site === receiveSite ? 'receive' : '7sim'}_${startIdx + i + 1}` 
  });
} else {
      row.push({ text: '—', callback_data: null });  // Bo'sh joy
    }

    buttons.push(row);
  }

  // Pagination tugmalari
  const paginationRow = [];
  if (currentPage > 0) {
    paginationRow.push({ text: '⬅️ Oldingi', callback_data: 'prev_page' });
  }
  paginationRow.push({ text: '🛎 Orqaga', callback_data: 'back_to_main' });
  if (currentPage < totalPages - 1 && allNumbers.length > pageSize) {
    paginationRow.push({ text: '➡️ Keyingi', callback_data: 'next_page' });
  }

  if (paginationRow.length > 1 || (paginationRow.length === 1 && paginationRow[0].callback_data !== 'back_to_main')) {
    buttons.push(paginationRow);
  } else {
    buttons.push([{ text: '🛎 Orqaga', callback_data: 'back_to_main' }]);
  }

  // Matn: Sahifa ma'lumoti
  let siteInfo;
  if (currentPage === 0) {
    siteInfo = `📱 Raqamni tanlang (Sahifa ${currentPage + 1}/${totalPages}):`;
  } else {
    siteInfo = `📱 Raqamni tanlang (Sahifa ${currentPage + 1}/${totalPages}):`;
  }

  return bot.editMessageText(siteInfo, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons.filter(row => row.some(btn => btn.callback_data !== null)) }  
  });
}

const receiveSite = 'https://receive-sms-online.info';
const sevenSimSite = 'https://temp-sms.org';
const onlineSimSites = [
     'https://sms24.me',
     'https://sms24.me/en/countries/de',
     'https://sms24.me/en/countries/kr',
     'https://sms24.me/en/countries/kr/2',
     'https://sms24.me/en/countries/kr/3',
     'https://sms24.me/en/countries/kr/4',
     'https://sms24.me/en/countries/uz',
     'https://sms24.me/en/countries/usa',
     'https://sms24.me/en/countries/us/2',
     'https://sms24.me/en/countries/us/3',
     'https://sms24.me/en/countries/jp',
     'https://sms24.me/en/countries/pt',
     'https://sms24.me/en/countries/ar',
     'https://sms24.me/en/countries/cn',
     'https://sms24.me/en/countries/at',
     'https://sms24.me/en/countries/bg',
     'https://sms24.me/en/countries/hk',
     'https://sms24.me/en/countries/in',
     'https://sms24.me/en/countries/id',
     'https://sms24.me/en/countries/my',
     'https://sms24.me/en/countries/mx',
     'https://sms24.me/en/countries/nl',
     'https://sms24.me/en/countries/ng',
     'https://sms24.me/en/countries/vn',
     'https://sms24.me/en/countries/br',
     'https://sms24.me/en/countries/hr',
     'https://sms24.me/en/countries/ph'
];
const PHONE_RE = /(\+?\d[\d\-\s()]{6,}\d)/g;
const timeoutOptions = { timeout: 15000 };

async function fetchHtml(url) {
  try {
  const res = await fetch(url, { 
    ...timeoutOptions, 
    redirect: 'follow',
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.google.com/',  
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }  
  });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    // console.log(`✅ ${url} dan HTML yuklandi (uzunlik: ${html.length})`);
    return html;
  } catch (err) {
    console.error('fetchHtml error', url, err && err.message);
    throw err;
  }
}
function parseMessagesGeneric(html) {
  const $ = cheerio.load(html);
  const messages = [];
  $('#messages > div.message').each((i, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text) messages.push({ text });
  });
  return messages;
}
function filterPhone(phone, site) {
  if (site === sevenSimSite && phone.startsWith('+46')) {
    console.log(`🚫 +46 raqam filtrlandi: ${phone}`);
    return false;  
  }
  return true;
}

async function scrapeSite(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results = [];

    console.log(`🔍 Receive saytda 'a' elementlar soni: ${$('a').length}`);

    $('a').each((i, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const matches = text.match(PHONE_RE);
      if (!matches) return;

      let href = $el.attr('href');
      if (href && !href.startsWith('http')) {
        href = new URL(href, url).toString();
      }

      for (const m of matches) {
        const phone = m.replace(/[^\d+]/g, '');
        if (filterPhone(phone, url)) {
          results.push({ site: url, phone, href });
          // console.log(`📱 Receive raqam topildi: ${phone} (href: ${href})`);
        }
      }
    });

    const seen = new Map();
    const unique = [];
    for (const r of results) {
      if (!seen.has(r.phone)) {
        seen.set(r.phone, true);
        unique.push(r);
      }
    }
    console.log(`✅ Receive dan unique raqamlar: ${unique.length}`);
    return unique.slice(0, 64);  // Faqat 4 ta (birinchi sahifa uchun)
  } catch (err) {
    console.error('scrapeSite failed', url, err && err.message);
    return [];
  }
}

async function scrapeSevenSim(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);  // Bu yerda \ yo'q
    const results = [];

    const selectors = ['a.number', 'a[href^="/number/"]', '.number-item a', 'td a[href*="/number/"]'];

    let totalElements = 0;
    selectors.forEach(sel => {
      const elements = $(sel);
      totalElements += elements.length;
    });

    $('a[href^="/number/"]').each((i, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!text) return;

      let phone = text.match(PHONE_RE);
      if (!phone) {
        const href = $el.attr('href');
        if (href && href.includes('/number/')) {
          phone = href.match(/\/number\/(\+?\d[\d\s\-\$\$]+)/); 
          if (phone) {
            phone = phone[1].replace(/[^\d+]/g, '');
          }
        }
      } else {
        phone = phone[0].replace(/[^\d+]/g, '');
      }

      if (!phone || !phone.match(PHONE_RE)) return;

      let href = $el.attr('href');
      if (href && !href.startsWith('http')) {
        href = new URL(href, url).toString();
      }

      if (filterPhone(phone, url)) {
        results.push({ site: url, phone, href });
      }
    });

    if (results.length === 0) {
      console.log('⚠️ Asosiy selector ishlamadi, barcha <a> larni tekshirish...');
      $('a').each((i, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (!text) return;
        const matches = text.match(PHONE_RE);
        if (!matches) return;

        let href = $el.attr('href');
        if (href && !href.startsWith('http')) {
          href = new URL(href, url).toString();
        }

        for (const m of matches) {
          const phone = m.replace(/[^\d+]/g, '');
          if (filterPhone(phone, url)) {
            results.push({ site: url, phone, href });
          }
        }
      });
    }

    const seen = new Map();
    const unique = [];
    for (const r of results) {
      if (!seen.has(r.phone)) {
        seen.set(r.phone, true);
        unique.push(r);
      }
    }
    return unique.slice(0, 40);
  } catch (err) {
    console.error('scrapeSevenSim failed', url, err && err.message);
    return [];
  }
}
async function scrapeOnlineSim(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results = [];
    // Onlinesim.io uchun selectorlarni taxmin qilish (raqamlar <a> teglarida bo'lishi mumkin)
    $('a').each((i, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!text) return;
      const matches = text.match(PHONE_RE);
      if (!matches) return;
      let href = $el.attr('href');
      if (href && !href.startsWith('http')) {
        href = new URL(href, url).toString();
      }
      for (const m of matches) {
        const phone = m.replace(/[^\d+]/g, '');
        if (filterPhone(phone, url)) {
          results.push({ site: url, phone, href });
        }
      }
    });
    const seen = new Map();
    const unique = [];
    for (const r of results) {
      if (!seen.has(r.phone)) {
        seen.set(r.phone, true);
        unique.push(r);
      }
    }
    console.log(`✅ ${url} dan unique raqamlar: ${unique.length}`);
    return unique.slice(0, 20);  // Chegaralash
  } catch (err) {
    console.error('scrapeOnlineSim failed', url, err && err.message);
    return [];
  }}
async function fetchMessagesForItem(item) {
  if (!item.href) return { ok: false, error: 'HREF yo‘q' };
  try {
    const html = await fetchHtml(item.href);
    const msgs = parseMessagesGeneric(html);
    if (msgs.length) {
      return { ok: true, url: item.href, messages: msgs.slice(0, 10) };
    }
    return { ok: false, error: 'Xabarlar topilmadi' };
  } catch (err) {
    return { ok: false, error: err.message || 'Xatolik' };
  }
}

async function getUser(userId) {
  return User.findOne({ userId }).exec();
}

async function addUser(userId, referrerId = null) {
  let exists = await getUser(userId);
  if (exists) return exists;

  const userDoc = new User({
    userId,
    referals: [],
    referalCount: 0,
    referrer: null
  });

if (referrerId && referrerId !== userId) {
  const referrer = await getUser(referrerId);

  if (referrer) {
    userDoc.referrer = referrerId;
    await User.updateOne(
      { userId: referrerId },
      { $addToSet: { referals: userId }, $inc: { referalCount: 1 } }
    );
  } else {
    // Agar referrer bazada yo'q bo‘lsa, uni yaratamiz
    await addUser(referrerId);
    await User.updateOne(
      { userId: referrerId },
      { $addToSet: { referals: userId }, $inc: { referalCount: 1 } }
    );
  }

  userDoc.referrer = referrerId;

  // Referal haqida xabar
  bot.sendMessage(referrerId, `<b>🎉 Sizga yangi referal qo'shildi!</b>\n<a href='tg://user?id=${userId}'>👤Ro'yxatdan o'tdi : ${userId}</a> `, {parse_mode : 'HTML'});
}

  await userDoc.save();
  return userDoc;
}

async function decrementReferals(userId, count = 5) {
  const user = await getUser(userId);
  if (!user || user.referalCount < count) return false;

  const newReferals = user.referals.slice(count);
  await User.updateOne(
    { userId },
    { $set: { referals: newReferals }, $inc: { referalCount: -count } }
  );
  return true;
}
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Raqam olish 🛎', callback_data: 'get_number' }],
        [{text: `🌹 Sovg'a olish 🧸`, callback_data : 'get_gift'}],
        [{ text: '👥 Referal tizimi 🔖', callback_data: 'ref_system' }],
      ]
    }
  };
}

async function referalMenu(userId) {
  const user = await getUser(userId);
  const referalCount = user?.referalCount || 0;
  const refLink = `https://t.me/${bot.me.username}?start=${userId}`;

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `Referallar soni: ${referalCount}`, callback_data: 'ref_count' }],
        [{ text: '📝 Referal havola', callback_data: 'ref_link' }],
        [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }],
      ]
    },
    text: `👥 Sizning referallar soningiz: ${referalCount}\n🔗 Havolangiz:\n<code>${refLink}</code>\nUstiga bosilsa nusxa olinadi👆🏻`
  };
}
const userSelections = new Map();
const gifts = {
  '15stars_heart' : {title : '💝', price : 25},
  '15stars_bear': {title : '🧸', price : 25},
  '25stars_rose' : {title : '🌹', price : 35},
  '25stars_gift' : {title : '🎁', price : 35}
}
const menu = [
  [{ text: "🛍 Buyurtma berish" }, { text: "📱 Raqam olish" }],
  [{ text: "👤 Hisobim" }, { text: "💎 Pul kiritish" }],
  [{ text: "📚 Bot haqida" }, { text: "🔖 Buyurtmalar" }]
];
bot.onText(/\/start(?: (\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name;
  const referrerId = match ? parseInt(match[1], 10) : null;
  if (referrerId) {
    tempReferrers.set(userId, referrerId);
  }
  
  if (!(await isUserSubscribed(userId))) {
    const sub = await getSubscriptionMessage();
    return bot.sendMessage(chatId, sub.text, sub.options);
  }
  
  await addUser(userId, referrerId);
    await bot.sendPhoto(chatId,
    "https://t4.ftcdn.net/jpg/15/52/60/81/360_F_1552608155_ceYNML9jnarcDTVU40HxbJ7ywRsB9dRm.jpg",
    {
      caption: `<b>Assalomu alaykum <a href="tg://user?id=${chatId}">${name}</a>!</b>\n\nBotimiz orqali tekinga raqam, sovg'a va ko'rish, reaksiya olishingiz mumkin ✅\n\n<blockquote><b>📍 Hamkor: @TurfaSeenBot</b></blockquote>`,
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: menu,  
        resize_keyboard: true
      }
    }
  );
});

bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const msg = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const messageId = callbackQuery.message.message_id;
  // 🔒 Obuna tekshirish
if (data === 'check_subscription') {
  if (await isUserSubscribed(userId)) {
    const referrerId = tempReferrers.get(userId) || null;
    await addUser(userId, referrerId);
    tempReferrers.delete(userId);
    return bot.sendMessage(chatId, '✅ Obuna tasdiqlandi!', menu());
  } else {
    const sub = await getSubscriptionMessage();
    return bot.sendMessage(chatId, sub.text, sub.options);
  }
}


  if (data === 'back_to_main') {
    await bot.answerCallbackQuery(callbackQuery.id);
    return bot.editMessageText('Asosiy menyu', {
      chat_id: chatId,
      message_id: msg.message_id,
      ...mainMenu()
    });
  }

  if (data === 'ref_system') {
    const menu = await referalMenu(userId);
    await bot.answerCallbackQuery(callbackQuery.id);
    return bot.editMessageText(menu.text, {
      chat_id: chatId,
      message_id: msg.message_id,
      reply_markup: menu.reply_markup,
      parse_mode: 'HTML'
    });
  }

  if (data === 'ref_count') {
    const user = await getUser(userId);
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: `Sizda ${user?.referalCount || 0} ta referal bor.`
    });
  }

  if (data === 'ref_link') {
    const refLink = `https://t.me/${bot.me.username}?start=${userId}`;
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: `Sizning referal havolangiz: ${refLink}`,
      show_alert: true
    });
  }
if (data === 'get_number') {
  const user = await getUser(userId);
  if (!user) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Iltimos /start buyrug‘ini yuboring.'
    });
  }

  if (user.referalCount < 6) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '🚫 Raqam olish uchun kamida 6 ta referalingiz bo‘lishi kerak.',
      show_alert: true
    });
  }

  await bot.answerCallbackQuery(callbackQuery.id, {
    text: '⏳ Raqamlar olinmoqda, iltimos kuting...'
  });

  // Ikkala saytdan parallel ravishda raqam olish
let receiveNumbers = await scrapeSite(receiveSite).catch(err => { console.error('Receive scraping error:', err.message); return []; });
let sevenSimNumbers = await scrapeSevenSim(sevenSimSite).catch(err => { console.error('7Sim scraping error:', err.message); return []; });
let onlineSimNumbers = await Promise.all(onlineSimSites.map(site => scrapeOnlineSim(site).catch(err => { console.error(`FreeSMS ${site} scraping error:`, err.message); return []; })));

  // Barcha raqamlarni birlashtirish va unique qilish
  const allNumbers = [...receiveNumbers, ...sevenSimNumbers, ...onlineSimNumbers.flat()].filter(item => item);  
  const seen = new Map();
  const uniqueAll = allNumbers.filter(item => {
    if (!seen.has(item.phone)) {
      seen.set(item.phone, true);
      return true;
    }
    return false;
  });

  if (uniqueAll.length === 0) {
    return bot.editMessageText('❌ Hech qanday raqam topilmadi.', {
      chat_id: chatId,
      message_id: msg.message_id
    });
  }

  console.log(`📊 Jami unique raqamlar: ${uniqueAll.length} (receive: ${receiveNumbers.length}, 7sim: ${sevenSimNumbers.length})`);

  // Pagination sozlamalari
  const pageSize = 8;  // Har sahifada 8 ta (10 tadan kam)
  const totalPages = Math.ceil(uniqueAll.length / pageSize);
  
  // receiveNumbers va sevenSimNumbers ni ham saqlash (faqat birinchi sahifa uchun)
  userSelections.set(userId, { 
    allNumbers: uniqueAll, 
    receiveNumbers,  // Qo'shildi
    sevenSimNumbers,  // Qo'shildi
    currentPage: 0, 
    pageSize, 
    totalPages 
  });

  // Birinchi sahifani ko'rsatish
  return showNumberPage(chatId, msg.message_id, userId, userSelections);
}
if (data === 'next_page') {
  const selections = userSelections.get(userId);
  if (!selections || selections.currentPage >= selections.totalPages - 1) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Oxirgi sahifa.' });
  }
  selections.currentPage++;
  userSelections.set(userId, selections);
  return showNumberPage(chatId, msg.message_id, userId, userSelections);
}
if (data === 'prev_page') {
  const selections = userSelections.get(userId);
  if (!selections || selections.currentPage <= 0) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Birinchi sahifa.' });
  }
  selections.currentPage--;
  userSelections.set(userId, selections);
  return showNumberPage(chatId, msg.message_id, userId, userSelections);
}
if (data === 'get_gift') {
  const user = await getUser(userId);
  if (!user) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Iltimos /start buyrug‘ini yuboring.'
    });
  }

  // Sovg'alar menyusini yaratish
  const giftButtons = Object.entries(gifts).map(([key, gift]) => {
    return [{ text: gift.title, callback_data: `gift_${key}` }];
  });
  giftButtons.push([{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]);
  await bot.answerCallbackQuery(callbackQuery.id);
  return bot.editMessageText("⤵️ Sovg'alardan birini tanlang:", {
    chat_id: chatId,
    message_id: msg.message_id,
    reply_markup: { inline_keyboard: giftButtons }
  });
}
if (data.startsWith('gift_')) {
  const giftKey = data.slice(5);
  const gift = gifts[giftKey];

  if (!gift) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Bunday sovg‘a topilmadi.'
    });
  }

  const user = await getUser(userId);
  if (!user) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Iltimos /start buyrug‘ini yuboring.'
    });
  }

  if (user.referalCount < gift.price) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: `🚫 Bu sovg‘ani olish uchun kamida ${gift.price} ta referal kerak.`,
      show_alert: true
    });
  }

  return bot.editMessageText(
    `<b>✨ Siz ${gift.title} sovg‘asini tanladingiz.</b>\n<i>❗️Ushbu sovg‘ani olish uchun ${gift.price} ta referalingiz kamaytiriladi.\n\nSizga tashlab berilishi biroz vaqt olishi mumkin.</i>\n\n<b>Tasdiqlaysizmi?</b>`,
    {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Tasdiqlayman', callback_data: `confirm_gift_${giftKey}` }],
          [{ text: '⬅️ Orqaga', callback_data: 'get_gift' }]
        ]
      }
    }
  );
}

if (data.startsWith('confirm_gift_')) {
  const giftKey = data.slice('confirm_gift_'.length);
  const gift = gifts[giftKey];

  if (!gift) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Sovg‘a topilmadi.'
    });
  }

  const user = await getUser(userId);
  if (!user || user.referalCount < gift.price) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Yetarli referal yo‘q.',
      show_alert: true
    });
  }

  const success = await decrementReferals(userId, gift.price);
  if (!success) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Referal kamaytirishda xatolik.',
      show_alert: true
    });
  }

  // 🟢 Foydalanuvchiga xabar
  await bot.editMessageText(
    `<b>🎉 Tabriklaymiz! Siz ${gift.title}sovg‘asini oldingiz!</b> \n<u>Referallaringizdan ${gift.price} tasi olib tashlandi.</u>\n\n <b><i>Sabrli bo'ling admin faol bo'lgach sizga buyurtmangizni yetkazib beradi.🌝</i></b>`,
    {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Asosiy menyuga', callback_data: 'back_to_main' }]
        ]
      }
    }
  );

  // 👤 Foydalanuvchi ma'lumotlari
  const fullName = `${callbackQuery.from.first_name || ''} ${callbackQuery.from.last_name || ''}`.trim();
  const username = callbackQuery.from.username ? `@${callbackQuery.from.username}` : 'yo‘q';

  const userInfoText = `
🎁 <b>Sovg‘a buyurtma qilindi</b>

🎉 Sovg‘a: <b>${gift.title}</b>
💸 Narxi: <b>${gift.price} referal</b>

🆔 ID: <code>${userId}</code>
👤 Ism: <a href="tg://user?id=${userId}"><b>${fullName}</b></a>
🔗 Username: ${username}
`.trim();

  // 👨‍💻 Adminlarga yuborish
  for (const adminId of ADMIN_IDS) {
    bot.sendMessage(adminId, userInfoText, { parse_mode: 'HTML' });
  }
}

if (data.startsWith('select_number_')) {
  let idx, siteType;
  if (data.startsWith('select_number_receive_')) {
    siteType = 'receive';
    idx = parseInt(data.split('_').pop(), 10);
  } else if (data.startsWith('select_number_7sim_')) {
    siteType = '7sim';
    idx = parseInt(data.split('_').pop(), 10);
  } else if (data.startsWith('select_number_onlinesim_')) {
    siteType = 'onlinesim';
    idx = parseInt(data.split('_').pop(), 10);
  } else {
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Noto\'g\'ri tanlov.' });
  }

  const selections = userSelections.get(userId);
  if (!selections) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Raqamlar topilmadi.' });
  }

  const selected = selections.allNumbers[idx];  
  if (!selected) {
    return bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Tanlangan raqam topilmadi (indeks: ' + idx + ').' });  
  }

  userSelections.set(`${userId}_selected`, { ...selected, site: selected.site });
  const siteName = selected.site === receiveSite ? '' : '';
  await bot.answerCallbackQuery(callbackQuery.id);
  return bot.editMessageText(
    `<b>📞 Siz <code>${selected.phone}</code> raqamini tanladingiz.</b>
<blockquote>
<b><i>
❗️ Ushbu raqamni ishlatish uchun 6 ta referalingiz kamaytiriladi.

⚠️ Diqqat! Bu raqam ommaviy tarzda foydalaniladi. Quyidagi holatlar bo‘lishi mumkin:

- 🕐 Raqam ilgari boshqa foydalanuvchilar tomonidan ishlatilgan bo‘lishi mumkin.  
- 🔐 Ba’zi servislar ikki bosqichli himoya (2FA) yoki parol bilan himoyalangan bo‘lishi mumkin.  
- 📩 Kod yuborilishi kafolatlanmaydi — bu servisga, raqamga va vaqtga bog‘liq.  
- ⌛ Kod kechikishi yoki umuman kelmasligi ehtimoli bor.  
- ❌ Barcha xizmatlar bu raqamlarni qabul qilavermasligi mumkin.

📌 Ushbu raqamni tanlab, siz yuqoridagi holatlarni tushunganingizni va roziligingizni bildirgan bo‘lasiz.
</i></b>
</blockquote>
<b>Davom etishni xohlaysizmi?</b>`,
    {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Roziman', callback_data: 'confirm_number' }],
          [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
        ]
      }
    }
  );
}

 if (data === 'confirm_number') {
  const selected = userSelections.get(`${userId}_selected`);
  if (!selected) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Raqam topilmadi.'
    });
  }
  const decremented = await decrementReferals(userId, 6);  // <-- 5 dan 10 ga o'zgartirdim
  if (!decremented) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '🚫 Yetarli referal yo‘q.'  // <-- Bu yerda ham 10 ta tekshiruvi bor (decrementReferals ichida)
    });
  }
  await bot.answerCallbackQuery(callbackQuery.id);
  return bot.editMessageText(
    `<b>📞 Siz tanlagan raqam: <code>${selected.phone}</code></b>\n<i>👉 Endi “SMS olish” tugmasini bosing.</i>\n\n<u>10 daqiqa ichida xabar kelmasa sizga xabar beramiz..</u>`,
    {
      chat_id: chatId,
      message_id: msg.message_id,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 SMS olish', callback_data: 'get_sms_now' }],
          [{ text: '⬅️ Orqaga', callback_data: 'back_to_main' }]
        ]
      }
    }
  );
}

if (data === 'get_sms_now') {
  const selected = userSelections.get(`${userId}_selected`);
  if (!selected) {
    return bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ SMS olish uchun raqam tanlanmagan.'
    });
  }

  await bot.answerCallbackQuery(callbackQuery.id, {
    text: '📩 SMS kelishini kuting..'
  });

  const startTime = Date.now();
  const waitTime = 10 * 60 * 1000; 
  const checkInterval = 15 * 1000; 

  async function pollMessages() {
    const result = await fetchMessagesForItem(selected);
    if (result.ok && result.messages.length > 0) {
      // SMS topildi, xabarni yuborish
      let messageText = `📨 Oxirgi ${result.messages.length} ta SMS:\n\n`;
      for (const m of result.messages) {
        messageText += `- ${m.text}\n\n`;
      }
      try {
        await bot.editMessageText(messageText, {
          chat_id: chatId,
          message_id: msg.message_id
        });
      } catch (e) {
        console.error('Xabarni yangilashda xatolik:', e.message);
      }
      return; // Tugatish
    } else {
      // Agar vaqt tugagan bo‘lsa, xabar kelmadi deb yuborish
      if (Date.now() - startTime > waitTime) {
        try {
          await bot.editMessageText('❌ Hech qanday xabar kelmadi.', {
            chat_id: chatId,
            message_id: msg.message_id
          });
        } catch (e) {
          console.error('Xabarni yangilashda xatolik:', e.message);
        }
        return;
      }
      // Aks holda yana 15 sekunddan keyin tekshirish
      setTimeout(pollMessages, checkInterval);
    }
  }

  // Pollingni boshlash
  pollMessages();
}

if (data === "order_view") {
    await bot.editMessageText(`👁 Ko'rishlar buyurtmasi uchun son kiriting:\n\nminimal : 50\nmaksimal : 250`, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    orderState[chatId] = { type: "order_view" };
  }

  if (data === "order_reaction") {
    await bot.editMessageText(`🔥 Oddiy reaksiya buyurtmasi uchun son kiriting:\n\nminimal : 10\nmaksimal : 15`, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    orderState[chatId] = { type: "order_reaction" };
  }
  if (data === "order_premium_reaction") {
    await bot.editMessageText(`🐳 Premium reaksiya buyurtmasi uchun son kiriting:\n\nminimal : 10\nmaksimal : 15`, {
      chat_id: chatId,
      message_id: callbackQuery.message.message_id
    });
    orderState[chatId] = { type: "order_premium_reaction" };
  }
    if (data === 'click_pay') {
    payState[callbackQuery.from.id] = { step: 'amount' };
    return bot.sendMessage(callbackQuery.from.id, `<b>💳 Karta raqam : 9860 1201 6718 6416</b>\n💰 Iltimos, kiritmoqchi bo'lgan pulni miqdorini kiriting\n<b>(min: 5000, max: 50000):</b>`, {parse_mode : 'HTML'});
  }

  if (data.startsWith('pay_accept_') || data.startsWith('pay_cancel_')) {
    const parts = data.split('_');
    const action = parts[1]; 
    const userId = parseInt(parts[2]);
    const amount = parseInt(parts[3]);

    if (action === 'accept') {
      const user = await User.findOne({ userId });
      if (user) {
        user.balance += amount;
        await user.save();
        await bot.sendMessage(userId, `✅ Sizning hisobingizga ${amount} so'm qo'shildi!`);
        await bot.editMessageCaption(`💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi: ${user.name} (ID: ${user.userId})\n✅ Tasdiqlandi`, {
          chat_id: chatId,
          message_id: messageId
        });
      }
    } else if (action === 'cancel') {
      await bot.sendMessage(userId, `❌ To'lov bekor qilindi.`);
      await bot.editMessageCaption(`💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi ID: ${userId}\n❌ Bekor qilindi`, {
        chat_id: chatId,
        message_id: messageId
      });
    }

    await bot.answerCallbackQuery(callbackQuery.id);
  }


if (data === "order_subscriber") {
  await bot.editMessageText(`⚡️Tez boshlash. Tezlik kuniga 20k gacha.

🌏Taxminiy vaqt: 1 soat 5 minut\n👥 Obunachi buyurtmasi uchun son kiriting:\n\n<b>⬇️ minimal : 1000</b>\n<b>⬆️ maksimal : 10000</b>\n<b>Narx: 5000 so'm</b>\n\n <i>❗️ Diqqat! Havola yuborayotganda e'tiborli bo'ling va yuborgan havolangizga kirib ko'ring! Agarda noto'g'ri yoki yaroqsiz havola yuborib buyurtma bersangiz buyurtmangiz bajarilmasligi va buyurtma puli qaytarilmasligi mumkin! (Shaxsiy yoki yopiq havolalarni yubormang!)</i>`, {
    parse_mode : 'HTML',
    chat_id: chatId,
    message_id: msg.message_id
  });
  orderState[chatId] = { type: "order_subscriber" };
}

  return bot.answerCallbackQuery(callbackQuery.id, {
    text: '⚠️ Nomaʼlum buyruq.'
  });
});


// Bu qismni ikkinchi kodning bot.on('message') handleriga qo'shing yoki o'rnating
bot.on('message', async (msg) => {
  const chatId = msg.from.id;
  const name = msg.from.first_name;
  const text = msg.text;

  // /start handler (o'zgartirilgan)
  if (text === "/start") {
    try {
      let user = await User.findOne({ userId: chatId });
      if (!user) {
        user = new User({ userId: chatId, name, balance: 0, referals: [], referalCount: 0, referrer: null });
        await user.save();
      }
    } catch (err) {
      console.error(err);
    }

    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }
  }

  // "📱 Raqam olish" tugmasi uchun yangi handler
  if (text === "📱 Raqam olish") {
    // Inline menyu yuborish (birinchi kodning mainMenu funksiyasidan)
    await bot.sendMessage(chatId, `🐳`, mainMenu());
  }

  // Qolgan handlerlar (ikkinchi kodning mavjud handlerlarini saqlang)
  if (text === "👤 Hisobim") {
    const user = await User.findOne({ userId: chatId });
    if (!user) return bot.sendMessage(chatId, "❌ Sizning profilingiz topilmadi. /start ni bosing.");

    await bot.sendMessage(chatId, `
👤 <b>Sizning profilingiz</b>
━━━━━━━━━━━━━━
🪪 ID: <code>${user.userId}</code>
🎈 Ism: ${user.name}
💰 Balans: <b>${user.balance.toFixed(2)} so'm</b>
━━━━━━━━━━━━━━
    `, { parse_mode: "HTML" });
  }

  if (text === "📚 Bot haqida") {
    await bot.sendMessage(chatId, `<b>Bugungi raqamli davrda ijtimoiy tarmoqlarda faol bo‘lish – har qanday biznes va shaxsiy brend uchun muhim omil hisoblanadi. Sizning sahifangiz yoki profilingiz qancha ko‘p ko‘rilsa, brendingiz shunchalik ko‘proq e’tibor va ishonch qozonadi. Biz sizga bu jarayonni oson va samarali qiladigan professional yechimni taklif qilamiz.

Bizning platformamiz yordamida:

Profilingiz va sahifalaringiz tez va organik tarzda rivojlanadi.

Postlaringiz ko‘proq auditoriya tomonidan ko‘riladi, like va izohlar soni oshadi.

Kuzatuvchilar va mijozlar bazangiz barqaror o‘sadi.

Kontentingiz to‘g‘ri strategiya asosida targ‘ib qilinadi, bu esa sizning onlayn imidjingizni mustahkamlaydi.

Ijtimoiy tarmoqlarda muvaffaqiyatli bo‘lish – endi faqat sizning qo‘lingizda. Platformamiz sizga vaqtni tejash va natijani tezroq ko‘rish imkonini beradi. Har bir post, har bir story va har bir reklama kampaniyasi sizga maksimal e’tibor olib keladi.

Bugun ro‘yxatdan o‘ting va onlayn mavjudligingizni yangi, ilg‘or darajaga olib chiqing. Sizning brendingizga ko‘proq kuzatuvchilar, ko‘proq imkoniyatlar va ko‘proq muvaffaqiyatlar kerakmi? Biz bilan bu endi mumkin!</b>`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🐾 Dasturchi", url: "https://t.me/inqiIob" }],
          [{ text: "🌿 Hamkorimiz", url: "https://t.me/TurfaSeenBot?start=user19" }]
        ]
      }
    });
  }

  if (text === "💎 Pul kiritish") {
    await bot.sendMessage(chatId, `<b>To'lov turini tanlang:</b>`,{
      parse_mode : 'HTML',
      reply_markup : { 
        inline_keyboard : [
          [{text : "📍CLICK", callback_data : "click_pay"}]
        ]
      }
    });
  }

  // PayState va OrderState handlerlarini saqlang (ikkinchi kodning qolgan qismlari)
  if (payState[chatId]?.step === 'amount') {
    const amount = parseInt(text);
    if (isNaN(amount) || amount < 5000 || amount > 50000) {
      return bot.sendMessage(chatId, "❌ Iltimos, 5000 - 50000 so'm orasida miqdor kiriting.");
    }
    payState[chatId].amount = amount;
    payState[chatId].step = 'photo';
    return bot.sendMessage(chatId, `<b>📸 Endi, to'lov chekining suratini yuboring (faqat rasm)🧾</b>\n\n<i>🚫 Soxta chek yuborsangiz botdan bloklanasiz !🤖</i>`, {parse_mode : 'HTML'});
  }

  if (payState[chatId]?.step === 'photo' && msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id; 
    const amount = payState[chatId].amount;

    await bot.sendMessage(chatId, `✅ To'lov so'rovingiz qabul qilindi. Admin tekshiradi.`);
    for (const adminId of ADMIN_IDS) {
    await bot.sendPhoto(adminId, fileId, {
      caption: `💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi: ${name} (ID: ${chatId})`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `pay_accept_${chatId}_${amount}` },
            { text: "❌ Bekor qilish", callback_data: `pay_cancel_${chatId}_${amount}` }
          ]
        ]
      }
    });
  }
    delete payState[chatId];
  } else if (payState[chatId]?.step === 'photo' && !msg.photo) {
    return bot.sendMessage(chatId, "❌ Iltimos, faqat rasm yuboring.");
  }

  if (text === "🔖 Buyurtmalar") {
    orderState[chatId] = { type: "check_status" };
    return bot.sendMessage(chatId, "🆔 Buyurtma ID raqamini yuboring:");
  }

  if (orderState[chatId]?.type === "check_status") {
    const orderId = text.trim();
    if (!/^\d+$/.test(orderId)) return bot.sendMessage(chatId, "❌ Faqat raqam kiriting.");

    const as = await bot.sendMessage(chatId, "⏳ Tekshirilmoqda...");
    setTimeout(()=> {
      bot.deleteMessage(chatId, as.message_id).catch(()=> {})
    }, 2000)
    try {
      const response = await axios.post("https://seensms.uz/api/v1", null, {
        params: { key: apiKey, action: "status", order: orderId }
      });

      const data = response.data;
      if (data.status) {
        let holatUz;
        switch (data.status.toLowerCase()) {
          case "pending":
            holatUz = "⏳ Kutmoqda";
            break;
          case "in progress":
            holatUz = "🚀 Jarayonda";
            break;
          case "completed":
            holatUz = "✅ Bajarildi";
            break;
          case "canceled":
            holatUz = "❌ Bekor qilindi";
            break;
          default:
            holatUz = data.status; 
        }

        const textMsg = `
📦 <b>Buyurtma ma'lumotlari</b>
━━━━━━━━━━━━━━
🆔 ID: <code>${orderId}</code>
🚀 Holat: ${holatUz}
━━━━━━━━━━━━━━
`;
        await bot.sendMessage(chatId, textMsg, { parse_mode: "HTML" });
      } else {
        await bot.sendMessage(chatId, `❌ Xatolik yuz berdi`);
      }
    } catch (e) {
      await bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
    }
    delete orderState[chatId];
  }

  // Order handlerlarini saqlang
  if (orderState[chatId]?.type === "order_view") {
    const amount = parseInt(text);
    if (isNaN(amount)) {
      return bot.sendMessage(chatId, "❌ Iltimos faqat son kiriting. Masalan: 50");
    }
    if (amount < 50 || amount > 250) {
      return bot.sendMessage(chatId, "⚠️ Ko'rishlar buyurtmasi\n\nminimal : 50\nmaksimal : 250");
    }

    orderState[chatId] = { type: "view_link", amount };
    return bot.sendMessage(chatId, "🔗 Havolani yuboring:");
  }

  if (orderState[chatId]?.type === "view_link") {
    const link = text.trim();
    const amount = orderState[chatId].amount;
     const as = await bot.sendMessage(chatId, "⏳ Buyurtma yuborilmoqda...");
    setTimeout(() => {
      bot.deleteMessage(chatId, as.message_id).catch(()=> {})
    }, 2000)
    try {
      const response = await axios.post("https://seensms.uz/api/v1", null, {
        params: {
          key: apiKey,
          action: "add",
          service: 371, 
          link,
          quantity: amount
        }
      });

      if (response.data.order) {
        await bot.sendMessage(chatId, `✅ Buyurtma yuborildi!\n🆔 ID: <code>${response.data.order}</code>\n📦 Ko'rishlar: ${amount} ta\n🔗 Havola: ${link}`, { parse_mode: "HTML" });
      } else {
        await bot.sendMessage(chatId, `❌ Xatolik: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
    }
    delete orderState[chatId];
  }

  if (orderState[chatId]?.type === "order_reaction") {
    const amount = parseInt(text);
    if (isNaN(amount)) return bot.sendMessage(chatId, "❌ Faqat son kiriting.");
    if (amount < 10 || amount > 15) return bot.sendMessage(chatId, "⚠️ Oddiy reaksiya \n\nminimal : 10\nmaksimal : 15");

    orderState[chatId] = { type: "reaction_link", amount };
    return bot.sendMessage(chatId, "🔗 Havolani yuboring:");
  }

  if (orderState[chatId]?.type === "order_premium_reaction") {
    const amount = parseInt(text);
    if (isNaN(amount)) return bot.sendMessage(chatId, "❌ Faqat son kiriting.");
    if (amount < 10 || amount > 15) return bot.sendMessage(chatId, "⚠️ Premium reaksiya \n\nminimal : 10\nmaksimal : 15");

    orderState[chatId] = { type: "premium_reaction_link", amount };
    return bot.sendMessage(chatId, "🔗 Havolani yuboring:");
  }

  if (orderState[chatId]?.type === "reaction_link") {
    const link = text.trim();
    const amount = orderState[chatId].amount;
    const as = await bot.sendMessage(chatId, "⏳ Buyurtma yuborilmoqda...");
    setTimeout(() => {
      bot.deleteMessage(chatId, as.message_id).catch(()=> {})
    }, 2000)
    try {
      const response = await axios.post("https://seensms.uz/api/v1", null, {
        params: {
          key: apiKey,
          action: "add",
          service: 436,  
          link,
          quantity: amount
        }
      });

      if (response.data.order) {
        await bot.sendMessage(chatId, `✅ Buyurtma yuborildi!\n🆔 ID: <code>${response.data.order}</code>\n📦 Oddiy reaksiya: ${amount} ta\n🔗 Havola: ${link}`, { parse_mode: "HTML" });
      } else {
        await bot.sendMessage(chatId, `❌ Xatolik: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
    }
    delete orderState[chatId];
  }

  if (orderState[chatId]?.type === "premium_reaction_link") {
    const link = text.trim();
    const amount = orderState[chatId].amount;
    const as = await bot.sendMessage(chatId, "⏳ Buyurtma yuborilmoqda...");
    setTimeout(() => {
      bot.deleteMessage(chatId, as.message_id).catch(()=> {})
    }, 2000)
    try {
      const response = await axios.post("https://seensms.uz/api/v1", null, {
        params: {
          key: apiKey,
          action: "add",
          service: 106,  
          link,
          quantity: amount
        }
      });

      if (response.data.order) {
        await bot.sendMessage(chatId, `✅ Buyurtma yuborildi!\n🆔 ID: <code>${response.data.order}</code>\n📦 Premium reaksiya: ${amount} ta\n🔗 Havola: ${link}`, { parse_mode: "HTML" });
      } else {
        await bot.sendMessage(chatId, `❌ Xatolik: ${JSON.stringify(response.data)}`);
      }
    } catch (err) {
      console.error(err);
      await bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
    }
    delete orderState[chatId];
  }
  if (orderState[chatId]?.type === "order_subscriber") {
  const amount = parseInt(text);
  if (isNaN(amount)) return bot.sendMessage(chatId, "❌ Faqat son kiriting.");
  if (amount < 1000 || amount > 10000) return bot.sendMessage(chatId, "⚠️ Obunachi buyurtmasi \n\nminimal : 1000\nmaksimal : 10000");

  const user = await User.findOne({ userId: chatId });
  const cost = 5000;  // Narx
  if (!user || user.balance < cost) return bot.sendMessage(chatId, `❌ Yetarli balans yo'q.`);

  orderState[chatId] = { type: "subscriber_link", amount };
  return bot.sendMessage(chatId, "🔗 Havolani yuboring:");
}

if (orderState[chatId]?.type === "subscriber_link") {
  const link = text.trim();
  const amount = orderState[chatId].amount;
  const cost = 5000;

  const user = await User.findOne({ userId: chatId });
  if (user.balance < cost) return bot.sendMessage(chatId, `❌ Yetarli balans yo'q.`);

  const as = await bot.sendMessage(chatId, "⏳ Buyurtma yuborilmoqda...");
  setTimeout(() => {
    bot.deleteMessage(chatId, as.message_id).catch(()=> {})
  }, 2000);

  try {
    const response = await axios.post("https://seensms.uz/api/v1", null, {
      params: {
        key: apiKey,
        action: "add",
        service: 484,  // ID
        link,
        quantity: amount
      }
    });

    if (response.data.order) {
      // Balansdan ayirish
      user.balance -= cost;
      await user.save();

      await bot.sendMessage(chatId, `✅ Buyurtma yuborildi!\n🆔 ID: <code>${response.data.order}</code>\n👥 Obunachi: ${amount} ta\n🔗 Havola: ${link}\n💰 Balansdan ${cost} so'm ayirildi.`, { parse_mode: "HTML" });
    } else {
      await bot.sendMessage(chatId, `❌ Xatolik: ${JSON.stringify(response.data)}`);
    }
  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
  }
  delete orderState[chatId];
}

  if (text === "🛍 Buyurtma berish") {
    await bot.sendMessage(chatId, "Buyurtma turini tanlang 👇", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👁 Ko'rishlar", callback_data: "order_view" },
          ],
          [
            { text: "🔥 Oddiy Reaksiya", callback_data: "order_reaction" }
          ],
          [
            { text: "🐳 Premium Reaksiya", callback_data: "order_premium_reaction" }
          ],
          [
            { text: "👥 Obunachi", callback_data: "order_subscriber" }  
          ]
        ]
      }
    });
  }
});
