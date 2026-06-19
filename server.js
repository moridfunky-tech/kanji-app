require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KV_URL   = process.env.KV_REST_API_URL || process.env.KV_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL + '/get/' + encodeURIComponent(key), {
      headers: { Authorization: 'Bearer ' + KV_TOKEN }
    });
    const data = await res.json();
    if (!data.result) return null;
    // 多重エンコード対応：文字列の場合は繰り返しパース
    var val = data.result;
    while (typeof val === 'string') {
      try { val = JSON.parse(val); } catch(e) { break; }
    }
    return (val && typeof val === 'object') ? val : null;
  } catch(e) {
    console.error('kvGet error:', e.message);
    return null;
  }
}

async function kvSet(key, value) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(KV_URL + '/set/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  } catch(e) {
    console.error('kvSet error:', e.message);
  }
}

app.post('/api/grade', async (req, res) => {
  const { imageData, answer } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
        { type: 'text', text: '\u753b\u50cf\u306b\u624b\u66f8\u304d\u306e\u6f22\u5b57\u304c\u66f8\u304b\u308c\u3066\u3044\u307e\u3059\u3002\u6b63\u89e3\u306f\u300c' + answer + '\u300d\u3067\u3059\u3002\u591a\u5c11\u96d1\u3067\u3082\u300c' + answer + '\u300d\u3068\u5224\u65ad\u3067\u304d\u308b\u5b57\u304c\u66f8\u304b\u308c\u3066\u3044\u308c\u3070\u300c\u6b63\u89e3\u300d\u3001\u7a7a\u767d\u30fb\u660e\u3089\u304b\u306b\u9055\u3046\u5b57\u306e\u5834\u5408\u306e\u307f\u300c\u4e0d\u6b63\u89e3\u300d\u3068\u4e00\u8a00\u3060\u3051\u7b54\u3048\u3066\u304f\u3060\u3055\u3044\u3002' }
      ]}]
    });
    const text = response.content[0].text.trim();
    const correct = text.includes('\u6b63\u89e3') && !text.includes('\u4e0d\u6b63\u89e3');
    res.json({ correct, text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const { score, results, date, week } = req.body;
  const wrongMap = {};
  results.forEach(function(item) {
    if (!item.correct) wrongMap[item.answer] = (wrongMap[item.answer] || 0) + 1;
  });
  const weakKanji = Object.entries(wrongMap).sort(function(a,b){return b[1]-a[1]}).slice(0,5).map(function(e){return e[0]+'('+e[1]+'\u56de)'}).join('\u3001');
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }});
  const resultRows = results.map(function(r,i){return (i+1)+'. '+r.question+' \u2192 '+r.answer+' : '+(r.correct?'\u2b55':'\u274c')}).join('\n');
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER, to: process.env.GMAIL_USER,
      subject: '\u3010\u6f22\u5b57\u30c6\u30b9\u30c8\u3011'+date+' '+week+' \u7d50\u679c\uff1a'+score+'/15\u70b9',
      text: '\u65e5\u4ed8: '+date+'\n\u9031: '+week+'\n\u5f97\u70b9: '+score+'/15\u70b9\n\n'+resultRows+'\n\n\u82e6\u624b\u306a\u6f22\u5b57: '+(weakKanji||'\u306a\u3057')
    });
    res.json({ success: true, weakKanji: weakKanji });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pet/:owner', async (req, res) => {
  try {
    var data = await kvGet('pet_' + req.params.owner);
    // kvGetが文字列を返す場合の二重パース対応
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e2) {} }
    res.json(data || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pet/:owner/addpoints', async (req, res) => {
  try {
    const pt = Number(req.body.pt) || 0;
    const type = req.body.type || 'kanji';
    const label = req.body.label || '';
    var data = await kvGet('pet_' + req.params.owner);
    if (!data || typeof data !== 'object') data = {
      pts:0, totalPts:0, hunger:80, happy:70, exp:0, stage:0, route:'',
      ptsByType:{kanji:0,math:0,english:0,romaji:0,social:0},
      items:{apple:0,cake:0,magic:0,toy:0},
      history:[], lastUpdate: Date.now()
    };
    data.pts      = (data.pts      || 0) + pt;
    data.totalPts = (data.totalPts || 0) + pt;
    data.exp      = (data.exp      || 0) + Math.floor(pt * 0.3);
    data.ptsByType = data.ptsByType || {kanji:0,math:0,english:0,romaji:0,social:0};
    if (data.ptsByType[type] !== undefined) data.ptsByType[type] += pt;
    data.history = data.history || [];
    data.history.push({ label: label, pt: pt, time: Date.now() });
    if (data.history.length > 50) data.history = data.history.slice(-50);
    data.lastUpdate = Date.now();
    await kvSet('pet_' + req.params.owner, data);
    res.json({ success: true, data: data });
  } catch (e) {
    console.error('addpoints error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pet/:owner', async (req, res) => {
  try {
    await kvSet('pet_' + req.params.owner, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mistakes/:owner', async (req, res) => {
  try {
    var data = await kvGet('mistakes_' + req.params.owner);
    if (!Array.isArray(data)) data = [];
    res.json(data);
  } catch (e) {
    console.error('mistakes GET error:', e.message);
    res.json([]);
  }
});

app.post('/api/mistakes/:owner', async (req, res) => {
  try {
    const mistakes = Array.isArray(req.body.mistakes) ? req.body.mistakes : [];
    var existing = await kvGet('mistakes_' + req.params.owner);
    if (!Array.isArray(existing)) existing = [];
    const merged = existing.slice();
    mistakes.forEach(function(m) {
      if (!m || !m.k) return;
      const found = merged.find(function(e){ return e.k === m.k; });
      if (found) { found.cnt = (found.cnt || 1) + (m.cnt || 1); found.y = m.y; }
      else merged.push({ k: m.k, y: m.y, cnt: m.cnt || 1 });
    });
    merged.sort(function(a,b){ return (b.cnt||1) - (a.cnt||1); });
    await kvSet('mistakes_' + req.params.owner, merged.slice(0, 50));
    res.json({ success: true });
  } catch (e) {
    console.error('mistakes POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/week/:owner', async (req, res) => {
  try {
    const BASE_DATE = new Date('2026-04-06');
    const now = new Date();
    const diffDays = Math.floor((now - BASE_DATE) / (1000 * 60 * 60 * 24));
    const autoWeek = Math.min(Math.max(1, Math.floor(diffDays / 7) + 1), 4);
    res.json({ currentWeek: autoWeek, baseDate: '2026-04-06' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// なんでもしつもん（子供向けチャット）
// ゆるい記憶つき なんでもしつもん
app.post('/api/ask/:owner', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    const question = (req.body.question || '').slice(0, 500);
    if (!question.trim()) { res.json({ answer: '\u3057\u3064\u3082\u3093\u3092\u3044\u308c\u3066\u306d\uff01' }); return; }

    // KVから会話履歴を読み込み（24時間でリセット）
    var stored = await kvGet('ask_' + owner);
    var history = [];
    const DAY = 24 * 60 * 60 * 1000;
    if (stored && stored.updated && (Date.now() - stored.updated) < DAY && Array.isArray(stored.history)) {
      history = stored.history.slice(-20); // 直近10往復（20メッセージ）
    }

    const systemPrompt = [
      'あなたは小学生の子供向けの、やさしい先生「きつね先生」です。',
      '小学校3年生〜5年生の子供が読んでわかるように、ひらがなを多めに、やさしい言葉で答えてください。',
      '回答は短く、2〜3文程度にしてください。絵文字を1〜2個つかって親しみやすくしてください。',
      '難しい漢字をつかうときは、その漢字のあとに（かっこ）でよみがなをつけてください。例：植物（しょくぶつ）',
      '前の会話の流れがあれば、それを覚えていて自然につなげて答えてください。',
      '',
      '【重要な安全ルール】',
      '次のような質問には、具体的に答えず「それは おうちのひとに きいてみてね😊」とだけ返してください：',
      '- 暴力、武器、危険なこと、ケガや死に関すること',
      '- 性的なこと、大人向けの話題、恋愛の踏み込んだ話',
      '- 犯罪、違法なこと、危険な遊びややり方',
      '- 薬、お酒、たばこ、ギャンブルに関すること',
      '- だれかを傷つけたり、いじめたりする方法',
      'これらに少しでも当てはまりそうな場合は、絶対に具体的な内容を答えず、おうちのひとに聞くよう促してください。',
      '',
      '【個人情報の取り扱い】',
      '子供の住所、電話番号、学校名、友達の名前などの個人情報は、こちらから聞かないでください。',
      'もし子供が個人情報を話しても、それには触れず、話題をやさしく勉強や興味のあることに戻してください。',
      '',
      '勉強、言葉の意味、自然、科学、生き物、歴史、地理など、健全な学びの質問には楽しく答えてください。'
    ].join('\n');

    const messages = [];
    history.forEach(function(h) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: String(h.content || '').slice(0, 500) });
      }
    });
    messages.push({ role: 'user', content: question });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages
    });
    const answer = response.content[0].text.trim();

    // 会話履歴をKVに保存（直近10往復）
    var newHistory = history.concat([
      { role: 'user', content: question },
      { role: 'assistant', content: answer }
    ]).slice(-20);
    await kvSet('ask_' + owner, { history: newHistory, updated: Date.now() });

    res.json({ answer: answer });
  } catch (e) {
    console.error('ask error:', e.message);
    res.status(500).json({ error: e.message, answer: 'ごめんね、いまうまくこたえられないみたい😢 もういちどきいてね。' });
  }
});

// 会話履歴のクリア
app.post('/api/ask/:owner/clear', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    await kvSet('ask_' + owner, { history: [], updated: Date.now() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// たびクイズ 周回データ
app.get('/api/journey/:owner', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    const data = await kvGet('journey_' + owner);
    res.json(data || { laps: 0, bestTime: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/journey/:owner', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    var data = await kvGet('journey_' + owner) || { laps: 0, bestTime: null };
    data.laps = (data.laps || 0) + 1;
    const t = Number(req.body.time);
    if (t && (!data.bestTime || t < data.bestTime)) data.bestTime = t;
    data.lastUpdate = Date.now();
    await kvSet('journey_' + owner, data);
    res.json({ success: true, data: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// レポート用：2人分のデータをまとめて返す
app.get('/api/report', async (req, res) => {
  try {
    const result = {};
    for (const owner of ['kanka', 'hanano']) {
      var pet = await kvGet('pet_' + owner);
      if (typeof pet === 'string') { try { pet = JSON.parse(pet); } catch(e){} }
      if (!pet || typeof pet !== 'object') pet = null;
      var mistakes = await kvGet('mistakes_' + owner);
      if (!Array.isArray(mistakes)) mistakes = [];
      var journey = await kvGet('journey_' + owner) || { laps: 0, bestTime: null };
      var activity = await kvGet('activity_' + owner);
      if (!activity || typeof activity !== 'object') activity = {};
      result[owner] = {
        pts: pet ? (pet.totalPts || pet.pts || 0) : 0,
        ptsByType: pet ? (pet.ptsByType || {}) : {},
        exp: pet ? (pet.exp || 0) : 0,
        stage: pet ? (pet.stage || 0) : 0,
        history: pet ? (pet.history || []) : [],
        mistakes: mistakes.slice(0, 10),
        laps: journey.laps || 0,
        activity: activity
      };
    }
    res.json(result);
  } catch (e) {
    console.error('report error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 学習実施記録（日付ごとに練習・テストをやったか）
// activity_{owner} = { "2026-06-19": {drill:true, test:true}, ... }
app.post('/api/activity/:owner', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    const kind = req.body.kind; // 'drill' or 'test'
    if (kind !== 'drill' && kind !== 'test') { res.status(400).json({ error: 'bad kind' }); return; }
    // 日本時間の日付
    const now = new Date(Date.now() + 9*60*60*1000);
    const dateKey = now.toISOString().slice(0,10);
    var data = await kvGet('activity_' + owner);
    if (!data || typeof data !== 'object') data = {};
    if (!data[dateKey]) data[dateKey] = {};
    data[dateKey][kind] = true;
    // 古い記録は60日分だけ保持
    const keys = Object.keys(data).sort();
    if (keys.length > 60) {
      keys.slice(0, keys.length - 60).forEach(function(k){ delete data[k]; });
    }
    await kvSet('activity_' + owner, data);
    res.json({ success: true });
  } catch (e) {
    console.error('activity error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity/:owner', async (req, res) => {
  try {
    const owner = req.params.owner === 'hanano' ? 'hanano' : 'kanka';
    var data = await kvGet('activity_' + owner);
    if (!data || typeof data !== 'object') data = {};
    res.json(data);
  } catch (e) {
    res.json({});
  }
});

// LINE通知（友だち全員にbroadcast）
const LINE_TOKEN = process.env.LINE_TOKEN;

async function lineBroadcast(messages) {
  if (!LINE_TOKEN) { console.log('LINE_TOKEN未設定'); return false; }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LINE_TOKEN
      },
      body: JSON.stringify({ messages: messages })
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('LINE error:', res.status, t);
      return false;
    }
    return true;
  } catch (e) {
    console.error('LINE broadcast error:', e.message);
    return false;
  }
}

// 漢字テスト結果をLINEに送る
app.post('/api/line/test-result', async (req, res) => {
  try {
    const owner = req.body.owner === 'hanano' ? 'hanano' : 'kanka';
    const childName = owner === 'kanka' ? 'カンカン' : '羽梛';
    const score = Number(req.body.score) || 0;
    const total = Number(req.body.total) || 15;
    const imageUrl = req.body.imageUrl; // 公開URL（任意）

    const now = new Date(Date.now() + 9*60*60*1000);
    const dateStr = (now.getUTCMonth()+1) + '月' + now.getUTCDate() + '日';

    let text = '📚 ' + childName + ' の漢字テスト結果\n'
      + '📅 ' + dateStr + '\n'
      + '✏️ ' + score + ' / ' + total + ' 点\n\n'
      + '※AI採点なので、答案を確認してね';

    const messages = [{ type: 'text', text: text }];
    if (imageUrl && /^https:\/\//.test(imageUrl)) {
      messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
    }

    const ok = await lineBroadcast(messages);
    res.json({ success: ok });
  } catch (e) {
    console.error('line test-result error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// LINE送信テスト用
app.get('/api/line/test', async (req, res) => {
  const ok = await lineBroadcast([{ type:'text', text:'森脇ファミリー学習からのテスト送信です📚 とどいたかな？' }]);
  res.json({ success: ok });
});

// 画像を一時保存してURLを返す（base64 jpeg を受け取る）
app.post('/api/image/save', async (req, res) => {
  try {
    const imageData = req.body.imageData; // base64（data:除く）
    if (!imageData) { res.status(400).json({ error: 'no image' }); return; }
    // KV上限対策（base64で約1.3MB以内に）
    if (imageData.length > 1300000) { res.status(413).json({ error: 'image too large' }); return; }
    // ランダムID
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await kvSet('img_' + id, { data: imageData, created: Date.now() });
    const base = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;
    res.json({ id: id, url: base + '/api/image/' + id });
  } catch (e) {
    console.error('image save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 画像を配信（LINEがアクセスする）
app.get('/api/image/:id', async (req, res) => {
  try {
    const rec = await kvGet('img_' + req.params.id);
    if (!rec || !rec.data) { res.status(404).send('not found'); return; }
    const buf = Buffer.from(rec.data, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) {
    res.status(500).send('error');
  }
});

app.listen(3000, function(){ console.log('server running'); });
