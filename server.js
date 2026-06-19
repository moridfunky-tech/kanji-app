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
      ptsByType:{kanji:0,math:0,english:0,romaji:0},
      items:{apple:0,cake:0,magic:0,toy:0},
      history:[], lastUpdate: Date.now()
    };
    data.pts      = (data.pts      || 0) + pt;
    data.totalPts = (data.totalPts || 0) + pt;
    data.exp      = (data.exp      || 0) + Math.floor(pt * 0.3);
    data.ptsByType = data.ptsByType || {kanji:0,math:0,english:0,romaji:0};
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
    const data = await kvGet('mistakes_' + req.params.owner);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mistakes/:owner', async (req, res) => {
  try {
    const mistakes = req.body.mistakes || [];
    const existing = await kvGet('mistakes_' + req.params.owner) || [];
    const merged = existing.slice();
    mistakes.forEach(function(m) {
      const found = merged.find(function(e){ return e.k === m.k; });
      if (found) { found.cnt = (found.cnt || 1) + (m.cnt || 1); found.y = m.y; }
      else merged.push({ k: m.k, y: m.y, cnt: m.cnt || 1 });
    });
    merged.sort(function(a,b){ return (b.cnt||1) - (a.cnt||1); });
    await kvSet('mistakes_' + req.params.owner, merged.slice(0, 50));
    res.json({ success: true });
  } catch (e) {
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
app.post('/api/ask', async (req, res) => {
  try {
    const question = (req.body.question || '').slice(0, 500);
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-6) : [];
    if (!question.trim()) { res.json({ answer: '\u3057\u3064\u3082\u3093\u3092\u3044\u308c\u3066\u306d\uff01' }); return; }

    const systemPrompt = [
      'あなたは小学生の子供向けの、やさしい先生「きつね先生」です。',
      '小学校3年生〜5年生の子供が読んでわかるように、ひらがなを多めに、やさしい言葉で答えてください。',
      '回答は短く、2〜3文程度にしてください。絵文字を1〜2個つかって親しみやすくしてください。',
      '難しい漢字をつかうときは、その漢字のあとに（かっこ）でよみがなをつけてください。例：植物（しょくぶつ）',
      '',
      '【重要な安全ルール】',
      '次のような質問には、具体的に答えず「それは おうちのひとに きいてみてね😊」とだけ返してください：',
      '- 暴力、武器、危険なこと、ケガや死に関すること',
      '- 性的なこと、大人向けの話題、恋愛の踏み込んだ話',
      '- 犯罪、違法なこと、危険な遊びややり方',
      '- 個人情報（住所、電話番号、パスワードなど）をきく質問',
      '- 薬、お酒、たばこ、ギャンブルに関すること',
      '- だれかを傷つけたり、いじめたりする方法',
      'これらに少しでも当てはまりそうな場合は、絶対に具体的な内容を答えず、おうちのひとに聞くよう促してください。',
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
    res.json({ answer: answer });
  } catch (e) {
    console.error('ask error:', e.message);
    res.status(500).json({ error: e.message, answer: 'ごめんね、いまうまくこたえられないみたい😢 もういちどきいてね。' });
  }
});

app.listen(3000, function(){ console.log('server running'); });
