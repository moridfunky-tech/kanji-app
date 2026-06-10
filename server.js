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

app.post('/api/grade', async (req, res) => {
  const { imageData, answer } = req.body;
  console.log('採点リクエスト: 正解=', answer, '画像サイズ=', imageData?.length);
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
{ type: 'text', text: `画像に手書きの漢字が書かれています。正解は「${answer}」です。多少雑でも「${answer}」と判断できる字が書かれていれば「正解」、空白・明らかに違う字の場合のみ「不正解」と一言だけ答えてください。` }
      ]}]
    });
    const text = response.content[0].text.trim();
    console.log('APIレスポンス:', text);
    const correct = text.includes('正解') && !text.includes('不正解');
    res.json({ correct, text });
  } catch (e) {
    console.error('APIエラー:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
      text: `カンカンの漢字テスト結果！\n\n日付: ${date}\n週: ${week}\n得点: ${score}/15点\n\n${resultRows}\n\n苦手な漢字: ${weakKanji||'なし'}`
    });
    console.log('メール送信成功');
    res.json({ success: true, weakKanji });
  } catch (e) {
    console.error('メールエラー:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('サーバー起動中: http://localhost:3000'));