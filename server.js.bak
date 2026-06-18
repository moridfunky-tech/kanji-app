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

const KV_URL = process.env.KV_REST_API_URL || process.env.KV_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Upstash Redis REST API 繝倥Ν繝代・
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

// 謗｡轤ｹAPI
app.post('/api/grade', async (req, res) => {
  const { imageData, answer, prompt } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
        { type: 'text', text: prompt || `逕ｻ蜒上↓謇区嶌縺阪・貍｢蟄励′譖ｸ縺九ｌ縺ｦ縺・∪縺吶よｭ｣隗｣縺ｯ縲・{answer}縲阪〒縺吶ゅ・{answer}縲阪→縺励※隱ｭ繧√ｋ蟄励′譖ｸ縺九ｌ縺ｦ縺・ｋ蝣ｴ蜷医・縺ｿ縲梧ｭ｣隗｣縲阪∫ｩｺ逋ｽ繝ｻ蜈ｨ縺城＆縺・ｭ励・蛻､隱ｭ荳崎・縺ｪ蝣ｴ蜷医・縲御ｸ肴ｭ｣隗｣縲阪→荳險縺縺醍ｭ斐∴縺ｦ縺上□縺輔＞縲Ａ }
      ]}]
    });
    const text = response.content[0].text.trim();
    const correct = text.includes('豁｣隗｣') && !text.includes('荳肴ｭ｣隗｣');
    res.json({ correct, text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 繝｡繝ｼ繝ｫ騾∽ｿ｡API
app.post('/api/submit', async (req, res) => {
  const { score, results, date, week } = req.body;
  const wrongMap = {};
  results.forEach(item => {
    if (!item.correct) wrongMap[item.answer] = (wrongMap[item.answer] || 0) + 1;
  });
  const weakKanji = Object.entries(wrongMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v}蝗・`).join('縲・);
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }});
  const resultRows = results.map((r,i)=>`${i+1}. ${r.question} 竊・${r.answer} : ${r.correct?'箝・:'笶・}`).join('\n');
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER, to: process.env.GMAIL_USER,
      subject: `縲先ｼ｢蟄励ユ繧ｹ繝医・{date} ${week} 邨先棡・・{score}/15轤ｹ`,
      text: `貍｢蟄励ユ繧ｹ繝育ｵ先棡・―n\n譌･莉・ ${date}\n騾ｱ: ${week}\n蠕礼せ: ${score}/15轤ｹ\n\n${resultRows}\n\n闍ｦ謇九↑貍｢蟄・ ${weakKanji||'縺ｪ縺・}`
    });
    res.json({ success: true, weakKanji });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== KV API =====

// 繝昴う繝ｳ繝亥叙蠕・app.get('/api/pet/:owner', async (req, res) => {
  try {
    const data = await kvGet(`pet_${req.params.owner}`);
    res.json(data || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 繝昴う繝ｳ繝井ｿ晏ｭ・app.post('/api/pet/:owner', async (req, res) => {
  try {
    await kvSet(`pet_${req.params.owner}`, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 繝昴う繝ｳ繝郁ｿｽ蜉
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

// 髢馴＆縺・ｼ｢蟄怜叙蠕・app.get('/api/mistakes/:owner', async (req, res) => {
  try {
    const data = await kvGet(`mistakes_${req.params.owner}`);
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 髢馴＆縺・ｼ｢蟄嶺ｿ晏ｭ・app.post('/api/mistakes/:owner', async (req, res) => {
  try {
    const { mistakes } = req.body;
    await kvSet(`mistakes_${req.params.owner}`, mistakes);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 騾ｱ諠・ｱ蜿門ｾ・app.get('/api/week/:owner', async (req, res) => {
  try {
    const data = await kvGet(`week_${req.params.owner}`);
    res.json(data || { currentWeek: 1, baseDate: '2026-04-06' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 騾ｱ諠・ｱ菫晏ｭ・app.post('/api/week/:owner', async (req, res) => {
  try {
    await kvSet(`week_${req.params.owner}`, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('繧ｵ繝ｼ繝舌・襍ｷ蜍穂ｸｭ: http://localhost:3000'));
