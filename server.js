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

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Upstash Redis REST API ヘルパー
async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}

// 採点API
app.post('/api/grade', async (req, res) => {
  const { imageData, answer, prompt } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
        { type: 'text', text: prompt || `画像に手書きの漢字が書かれています。正解は「${answer}」です。「${answer}」として読める字が書かれている場合のみ「正解」、空白・全く違う字・判読不能な場合は「不正解」と一言だけ答えてください。` }
      ]}]
    });
    const text = response.content[0].text.trim();
    const correct = text.includes('正解') && !text.includes('不正解');
    res.json({ correct, text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// メール送信API
app.post('/api/submit', async (req, res) => {
  const { score, results, date, week } = req.body;
  const wrongMap = {};
  results.forEach(item => {
    if (!item.correct) wrongMap[item.answer] = (wrongMap[item.answer] || 0) + 1;
  });
  const weakKanji = Object.entries(wrongMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v}回)`).join('、');
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }});
  const resultRows = results.map((r,i)=>`${i+1}. ${r.question} → ${r.answer} : ${r.correct?'⭕':'❌'}`).join('\n');
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER, to: process.env.GMAIL_USER,
      subject: `【漢字テスト】${date} ${week} 結果：${score}/15点`,
      text: `漢字テスト結果！\n\n日付: ${date}\n週: ${week}\n得点: ${score}/15点\n\n${resultRows}\n\n苦手な漢字: ${weakKanji||'なし'}`
    });
    res.json({ success: true, weakKanji });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== KV API =====

// ポイント取得
app.get('/api/pet/:owner', async (req, res) => {
  try {
    const data = await kvGet(`pet_${req.params.owner}`);
    res.json(data || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ポイント保存
app.post('/api/pet/:owner', async (req, res) => {
  try {
    await kvSet(`pet_${req.params.owner}`, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ポイント追加
app.post('/api/pet/:owner/addpoints', async (req, res) => {
  try {
    const { pt, type, label } = req.body;
    let data = await kvGet(`pet_${req.params.owner}`) || {
      pts: 0, totalPts: 0, exp: 0, stage: 0, route: '',
      hunger: 80, happy: 70,
      ptsByType: { kanji: 0, math: 0, english: 0, romaji: 0 },
      items: { apple: 0, cake: 0, magic: 0, toy: 0 },
      history: [], lastUpdate: Date.now()
    };
    data.pts = (data.pts || 0) + pt;
    data.totalPts = (data.totalPts || 0) + pt;
    data.exp = (data.exp || 0) + Math.floor(pt * 0.3);
    if (data.ptsByType && data.ptsByType[type] !== undefined) data.ptsByType[type] += pt;
    data.history = data.history || [];
    data.history.push({ label, pt, time: Date.now() });
    if (data.history.length > 50) data.history = data.history.slice(-50);
    data.lastUpdate = Date.now();
    await kvSet(`pet_${req.params.owner}`, data);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 間違い漢字取得
app.get('/api/mistakes/:owner', async (req, res) => {
  try {
    const data = await kvGet(`mistakes_${req.params.owner}`);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 間違い漢字保存
app.post('/api/mistakes/:owner', async (req, res) => {
  try {
    const { mistakes } = req.body;
    await kvSet(`mistakes_${req.params.owner}`, mistakes);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 週情報取得
app.get('/api/week/:owner', async (req, res) => {
  try {
    const data = await kvGet(`week_${req.params.owner}`);
    res.json(data || { currentWeek: 1, baseDate: '2026-04-06' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 週情報保存
app.post('/api/week/:owner', async (req, res) => {
  try {
    await kvSet(`week_${req.params.owner}`, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('サーバー起動中: http://localhost:3000'));
