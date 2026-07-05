// 進化システム定義
// 8段階：0=タマゴ 1=ヒナ 2〜7=各ルート

// 経験値しきい値（2ヶ月で最終想定）
const EXP_THRESHOLDS = [0, 80, 240, 520, 920, 1440, 1920, 2400, 2960, 3600];

// ルート別 8段階（index 0-7）
const EVO_STAGES = {
  bungo: [ // 漢字
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'📖',n:'ほんずき'},{e:'✍️',n:'かきて'},
    {e:'📚',n:'よみびと'},{e:'🎴',n:'うたよみ'},{e:'🏯',n:'ぶんごう'},{e:'👘',n:'だいぶんごう'},{e:'🎓',n:'ぶんかじん'},{e:'📜',n:'でんせつのぶんごう'}
  ],
  hakase: [ // 算数
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'🔢',n:'かずすき'},{e:'📐',n:'けいさんし'},
    {e:'🔬',n:'けんきゅうしゃ'},{e:'⚗️',n:'はかせ'},{e:'🧙',n:'だいはかせ'},{e:'🌌',n:'てんさい'},{e:'🛰️',n:'かがくしゃ'},{e:'🏆',n:'ノーベルはかせ'}
  ],
  tabibito: [ // 英語
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'🎒',n:'たびのこ'},{e:'🧭',n:'たびびと'},
    {e:'✈️',n:'ぼうけんか'},{e:'🚢',n:'こうかいし'},{e:'🌍',n:'せかいじん'},{e:'👑',n:'せかいおう'},{e:'🚀',n:'うちゅうひこうし'},{e:'🌠',n:'ぎんがのおう'}
  ],
  tanken: [ // 社会
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'🗺️',n:'ちずすき'},{e:'🔦',n:'たんけんしゃ'},
    {e:'⛺',n:'ぼうけんか'},{e:'🏔️',n:'たんけんたい'},{e:'🗿',n:'だいたんけんか'},{e:'🌏',n:'だいぼうけんおう'},{e:'🏛️',n:'れきしはかせ'},{e:'🗿',n:'でんせつのたんけんか'}
  ],
  madoshi: [ // ローマ字
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'🔤',n:'もじすき'},{e:'📜',n:'みならい'},
    {e:'🪄',n:'まほうつかい'},{e:'🔮',n:'まどうし'},{e:'🧙‍♂️',n:'だいまどうし'},{e:'⭐',n:'けんじゃ'},{e:'🌙',n:'だいけんじゃ'},{e:'✨',n:'でんせつのまどうし'}
  ],
  yuusha: [ // バランス型
    {e:'🥚',n:'タマゴ'},{e:'🐣',n:'ヒナ'},{e:'🗡️',n:'みならい'},{e:'⚔️',n:'けんし'},
    {e:'🦸',n:'ゆうしゃ'},{e:'🛡️',n:'えいゆう'},{e:'🐉',n:'りゅうおう'},{e:'👑',n:'でんせつ'},{e:'🐲',n:'しんりゅう'},{e:'🌟',n:'かみのゆうしゃ'}
  ],
};

const ROUTE_NAMES = {
  bungo:'ぶんごう', hakase:'はかせ', tabibito:'せかいおう',
  tanken:'たんけんか', madoshi:'まどうし', yuusha:'ゆうしゃ'
};

// 現在の経験値から段階を計算
function calcStage(exp){
  let stage = 0;
  for(let i = 0; i < EXP_THRESHOLDS.length; i++){
    if(exp >= EXP_THRESHOLDS[i]) stage = i;
  }
  return stage;
}

// 科目ポイント比率からルートを決定（stage2到達時に確定）
function decideRoute(ptsByType){
  const t = ptsByType || {};
  const entries = [
    ['bungo', t.kanji||0],
    ['hakase', t.math||0],
    ['tabibito', t.english||0],
    ['tanken', t.social||0],
    ['madoshi', t.romaji||0],
  ];
  entries.sort((a,b)=>b[1]-a[1]);
  // 最多科目が全体の40%以上ならそのルート、そうでなければ勇者（バランス）
  const total = entries.reduce((s,e)=>s+e[1],0) || 1;
  if(entries[0][1] / total >= 0.4) return entries[0][0];
  return 'yuusha';
}

// 次の段階までの経験値情報
function nextStageInfo(exp){
  const stage = calcStage(exp);
  if(stage >= 9) return { isMax:true, current:exp, need:0, pct:100 };
  const cur = EXP_THRESHOLDS[stage];
  const next = EXP_THRESHOLDS[stage+1];
  const pct = Math.round((exp - cur) / (next - cur) * 100);
  return { isMax:false, current:exp-cur, need:next-cur, pct:Math.min(100,Math.max(0,pct)), nextExp:next };
}
