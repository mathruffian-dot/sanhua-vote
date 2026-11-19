// 「今天，你是哪朵花？」題庫、畫風、提示詞
// 每題三個做法，各對應一朵花；選項上不寫花，揭曉才翻出來。三個做法都有好處，也都有要留意的地方（沒有標準答案）。
// 改了題目或畫風文字，要跑 tools/make_fonts.py 重裁字型。

const GAME_FLOWER = {
  ju:    { name: '菊',   long: '菊花', who: '陶淵明', tag: '隱逸者', color: 'var(--ju)',    hex: '#b0802a', mean: '守住自己的步調' },
  mudan: { name: '牡丹', long: '牡丹', who: '唐以來的世人', tag: '富貴者', color: 'var(--mudan)', hex: '#a3343f', mean: '熱情，讓大家開心' },
  lian:  { name: '蓮',   long: '蓮花', who: '周敦頤', tag: '君子者', color: 'var(--lian)',  hex: '#3b7a6b', mean: '在人群裡守住原則' },
};

const SCENES = [
  { id: 's01', title: '班群吵翻了',
    scene: '班級 LINE 群組為了園遊會要賣什麼，已經吵了兩天。有人開始酸人，還貼貼圖嘲諷別人的提議。',
    opts: [
      { f: 'ju',    text: '關掉通知，等大家冷靜了再看', good: '不被情緒帶著走', care: '吵架的人沒有人勸', q: '菊，花之隱逸者也' },
      { f: 'mudan', text: '丟一張好笑的梗圖，讓氣氛輕鬆一點', good: '大家笑了，火就小了', care: '問題沒解決，明天可能再吵', q: '牡丹之愛，宜乎眾矣' },
      { f: 'lian',  text: '傳一句「先別吵，明天下課當面投票好嗎？」', good: '把吵架拉回解決問題', care: '可能被回一句「你誰啊」', q: '出淤泥而不染' },
    ],
    talk: '什麼時候，先離開吵架的群組能幫助自己？什麼時候，需要有人出來說話？' },

  { id: 's02', title: '只有三個讚',
    scene: '你花了半小時拍的晚霞發上限動。一小時過去了，只有 3 個人按讚。',
    opts: [
      { f: 'mudan', text: '換一張更好看的，重新發一次', good: '願意經營，讓更多人看見', care: '心情容易跟著讚數上上下下', q: '自李唐來，世人甚愛牡丹' },
      { f: 'lian',  text: '不刪也不改，去好好回那 3 個朋友', good: '珍惜真心在乎你的人', care: '還是會失落，要自己消化', q: '香遠益清' },
      { f: 'ju',    text: '關掉按讚數，照片是拍給自己開心的', good: '不讓數字決定心情', care: '也可能錯過朋友的回應', q: '菊，花之隱逸者也' },
    ],
    talk: '讚數說明了什麼？又沒有說明什麼？' },

  { id: 's03', title: '全班推你當班長',
    scene: '選幹部時，好幾個人起鬨：「選他！選他！」你被提名當班長。',
    opts: [
      { f: 'lian',  text: '答應，但先說好：我會公平，不會只照顧好朋友', good: '扛起責任，也先立好規矩', care: '公平有時會讓好朋友不開心', q: '中通外直' },
      { f: 'ju',    text: '婉拒：「謝謝大家，但這不是我想做的事」', good: '清楚知道自己要什麼', care: '大家可能覺得你不合群', q: '晉陶淵明獨愛菊' },
      { f: 'mudan', text: '答應，要把班上活動辦得熱熱鬧鬧', good: '帶動氣氛，班上更團結', care: '太在意熱不熱鬧，可能忽略安靜的人', q: '牡丹，花之富貴者也' },
    ],
    talk: '「被大家推上去」跟「自己想做」，有什麼不一樣？' },

  { id: 's04', title: '園遊會賣什麼',
    scene: '園遊會你們班要擺攤，大家把「賣什麼」交給你決定。',
    opts: [
      { f: 'mudan', text: '賣最近最紅的飲料，排隊的人一定最多', good: '大家喜歡，班費賺得多', care: '容易跟別班撞，最後只能比便宜', q: '牡丹之愛，宜乎眾矣' },
      { f: 'lian',  text: '賣大家喜歡的，但用料實在、不偷工減料', good: '好吃又安心，口碑留得住', care: '成本高、比較累，賺得少一點', q: '濯清漣而不妖' },
      { f: 'ju',    text: '做自己真心喜歡的手作，賣多賣少無所謂', good: '做得開心，作品有自己的味道', care: '可能沒什麼人買，班上會有意見', q: '菊，花之隱逸者也' },
    ],
    talk: '「大家都喜歡」跟「我真心喜歡」衝突的時候，你怎麼選？' },

  { id: 's05', title: '下課十分鐘',
    scene: '小說只剩最後兩章，正精彩。好朋友在教室門口喊你：「走啦！打球缺一個！」',
    opts: [
      { f: 'ju',    text: '揮揮手：「你們去，我要把它看完」', good: '照自己的步調，做想做的事', care: '朋友可能覺得被拒絕', q: '晉陶淵明獨愛菊' },
      { f: 'mudan', text: '書一闔就衝出去，跟朋友在一起最開心', good: '重視朋友，大家玩得更盡興', care: '自己想做的事常常一直往後排', q: '自李唐來，世人甚愛牡丹' },
      { f: 'lian',  text: '去打，但先說好：「我打一場就回來看」', good: '顧到朋友，也顧到自己', care: '說好的界線要守得住', q: '不蔓不枝' },
    ],
    talk: '拒絕朋友的時候，怎麼說比較不傷人？' },

  { id: 's06', title: '叫 AI 寫一寫就好',
    scene: '分組報告明天要交。老師說過：可以用 AI 找資料、想點子，但內容要自己查證、寫清楚怎麼用。組員卻在群組說：「叫 AI 寫一寫就好啦，老師又不會發現。」',
    opts: [
      { f: 'lian',  text: '回他：「AI 可以幫忙查資料，但內容用自己的話寫，我先寫一段」', good: '會用工具，也守住原則', care: '要多做很多，可能被覺得難搞', q: '出淤泥而不染' },
      { f: 'ju',    text: '不爭了，自己負責的那一段自己好好寫', good: '至少自己問心無愧', care: '別人用 AI 交差的部分，分數還是一起扛', q: '菊，花之隱逸者也' },
      { f: 'mudan', text: '先讓 AI 生一份草稿，大家再一起改得漂漂亮亮', good: '效率高，成果好看', care: '容易變成只會改字，自己沒真的想過', q: '牡丹，花之富貴者也' },
    ],
    talk: '「讓 AI 幫忙」跟「讓 AI 代替你」，界線在哪裡？' },

  { id: 's07', title: '大家都在玩',
    scene: '最近全班都在玩一款新手遊，下課聊的全是它。你其實沒什麼興趣。',
    opts: [
      { f: 'mudan', text: '下載來玩玩看，聊天才跟得上', good: '有共同話題，打進大家的圈子', care: '花了時間，卻不一定是自己喜歡的', q: '牡丹之愛，宜乎眾矣' },
      { f: 'ju',    text: '不勉強，繼續做自己喜歡的事', good: '知道自己是誰', care: '可能有一陣子插不上話', q: '陶後鮮有聞' },
      { f: 'lian',  text: '不跟著玩，但會問同學：「這遊戲哪裡好玩？」', good: '不勉強自己，也不把人推開', care: '要真心想聽，不能只是客套', q: '可遠觀而不可褻玩焉' },
    ],
    talk: '跟大家不一樣，就一定是「不合群」嗎？' },

  { id: 's08', title: '被做成梗圖',
    scene: '有人把同班同學一張沒經過他同意、他自己不喜歡的照片做成梗圖發上 IG，底下一堆人留「哈哈哈」。',
    opts: [
      { f: 'ju',    text: '不按讚、不留言，直接滑過去', good: '至少不跟著起鬨', care: '被笑的同學不知道有人站在他那邊', q: '菊，花之隱逸者也' },
      { f: 'mudan', text: '留言說那位同學平常的優點，帶大家改成鼓勵他', good: '用你的人氣把風向轉正', care: '需要勇氣，也可能被一起開玩笑', q: '牡丹，花之富貴者也' },
      { f: 'lian',  text: '私訊發文的人：「他看到可能會難過，要不要刪掉？」', good: '直接處理，又不讓對方丟臉', care: '對方可能覺得你多管閒事', q: '出淤泥而不染' },
    ],
    talk: '如果被做成梗圖的是你，你最希望別人怎麼做？' },

  { id: 's09', title: '新來的同學',
    scene: '班上來了一位轉學生。午餐時間，他一個人坐在角落吃飯。',
    opts: [
      { f: 'mudan', text: '拉他來我們這桌，介紹給大家認識', good: '熱情，讓他一下子有朋友', care: '他可能還不習慣一次面對這麼多人', q: '自李唐來，世人甚愛牡丹' },
      { f: 'lian',  text: '走過去問：「要不要一起吃？不想也沒關係。」', good: '主動，也尊重他的選擇', care: '他說不要時，你要真的不介意', q: '亭亭淨植' },
      { f: 'ju',    text: '不去打擾，也許他想安靜一下', good: '尊重別人的空間', care: '他可能其實在等有人開口', q: '菊，花之隱逸者也' },
    ],
    talk: '怎麼分辨一個人是「想安靜」，還是「希望有人陪」？' },

  { id: 's10', title: '段考前一晚',
    scene: '明天要段考。好朋友傳訊息來：「上線！打兩場就好，五分鐘後開。」',
    opts: [
      { f: 'ju',    text: '關掉手機，照自己的計畫讀書', good: '專心，對自己負責', care: '朋友可能以為你不理他', q: '晉陶淵明獨愛菊' },
      { f: 'lian',  text: '回他：「考完一起打！現在一起讀社會？」', good: '顧到朋友，也守住自己的事', care: '他可能覺得你掃興', q: '中通外直' },
      { f: 'mudan', text: '打兩場就好，朋友比較重要', good: '珍惜朋友，也放鬆一下', care: '「兩場」常常變成十場', q: '牡丹之愛，宜乎眾矣' },
    ],
    talk: '你說的「就一下下」，守得住嗎？你怎麼知道？' },
];
const SCENE = Object.fromEntries(SCENES.map(s => [s.id, s]));
const LETTERS = ['A', 'B', 'C'];

// ---------- 花束提示詞 ----------
const STYLES = [
  { id: 'gongbi',    name: '宋代工筆', zh: '宋代工筆花鳥畫，細線勾勒、淡彩暈染，絹本質感，大量留白', en: 'Song dynasty gongbi bird-and-flower painting, fine ink outlines, soft mineral colour washes on silk, generous empty space' },
  { id: 'shuimo',    name: '水墨寫意', zh: '水墨寫意畫，濃淡墨色加少許淡彩，筆觸奔放，大量留白', en: 'Chinese ink-wash freehand painting, expressive brushstrokes, light colour accents, lots of empty space' },
  { id: 'watercolor',name: '透明水彩', zh: '透明水彩畫，顏色清透、水痕自然暈開，白色水彩紙', en: 'loose transparent watercolour painting, soft blooms and bleeds, white watercolour paper' },
  { id: 'oil',       name: '古典油畫', zh: '古典靜物油畫，深色背景、柔和側光、厚實筆觸', en: 'classical still-life oil painting, dark background, soft side light, rich impasto brushwork' },
  { id: 'pencil',    name: '色鉛筆',   zh: '色鉛筆手繪，細細的筆觸、紙張紋理看得見，溫柔的顏色', en: 'coloured pencil drawing, delicate visible strokes, paper texture, gentle colours' },
  { id: 'anime',     name: '日系動畫', zh: '日系動畫背景美術風格，乾淨線條、明亮清新的顏色、柔和光暈', en: 'Japanese anime background art style, clean lines, bright fresh colours, soft glow' },
  { id: 'papercut',  name: '剪紙',     zh: '中國傳統剪紙藝術，紅色與金色的多層剪紙，鏤空花紋', en: 'traditional Chinese paper-cut art, layered red and gold paper, intricate cut-out patterns' },
  { id: 'embroidery',name: '刺繡',     zh: '精緻的絲線刺繡，綢緞底布，看得到一針一線的光澤', en: 'fine silk embroidery on satin, visible glossy stitches' },
  { id: 'qinghua',   name: '青花瓷',   zh: '青花瓷彩繪風格，白底藍色鈷料線條，像畫在瓷盤上', en: 'blue-and-white porcelain painting style, cobalt blue lines on white glaze, like a painted porcelain plate' },
  { id: 'woodblock', name: '木刻版畫', zh: '木刻版畫，黑色粗線條、平塗色塊、看得到木紋', en: 'woodblock print, bold black carved lines, flat colour areas, visible wood grain' },
  { id: 'glass',     name: '彩繪玻璃', zh: '教堂彩繪玻璃風格，黑色鉛條分隔的透光彩色玻璃', en: 'stained glass window style, glowing coloured glass pieces separated by dark lead lines' },
  { id: 'clay',      name: '3D 黏土',  zh: '可愛的 3D 黏土模型，圓潤的造型、柔和的攝影棚燈光', en: 'cute 3D clay model, rounded shapes, soft studio lighting' },
  { id: 'pixel',     name: '像素藝術', zh: '復古遊戲像素藝術，清楚的方塊像素、鮮明配色', en: 'retro video game pixel art, crisp square pixels, vivid palette' },
  { id: 'picture',   name: '童書繪本', zh: '溫暖的童書繪本插畫，蠟筆與水彩混合，筆觸可愛', en: 'warm children\'s picture-book illustration, crayon and watercolour mix, charming strokes' },
  { id: 'pressed',   name: '押花標本', zh: '押花標本，乾燥壓平的真花貼在米色紙上，旁邊有細細的手寫標籤線（不寫字）', en: 'pressed flower herbarium, dried flattened real flowers mounted on cream paper, with thin blank label lines' },
  { id: 'neon',      name: '未來霓虹', zh: '未來感霓虹燈風格，深藍夜色背景、發光的線條與粉紫光暈', en: 'futuristic neon style, deep blue night background, glowing outlines with pink and violet light' },
];
const WRAPS = [
  { id: 'paper',  name: '牛皮紙花束', zh: '用牛皮紙包起來、繫細麻繩的手綁花束', en: 'a hand-tied bouquet wrapped in kraft paper with a thin twine bow' },
  { id: 'celadon',name: '青瓷花瓶',   zh: '插在一只淡綠色青瓷花瓶裡的花', en: 'flowers arranged in a pale green celadon vase' },
  { id: 'basket', name: '竹編花籃',   zh: '放在竹編花籃裡的一籃花', en: 'a basket of flowers in a woven bamboo basket' },
  { id: 'glass',  name: '玻璃瓶',     zh: '插在透明玻璃瓶裡、看得到花莖和水的花', en: 'flowers in a clear glass bottle with stems visible in the water' },
];

const FLOWER_ZH = { lian: '粉白色蓮花', ju: '黃白色菊花', mudan: '紅色牡丹' };
const FLOWER_EN = { lian: ['pink-white lotus flower', 'pink-white lotus flowers'], ju: ['yellow-white chrysanthemum', 'yellow-white chrysanthemums'], mudan: ['red peony', 'red peonies'] };
const NUM_EN = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// 點綴：猜中全班多數一半以上＝滿天星，不到一半＝尤加利葉；最多的那朵花再配一樣。說明只講事實，不替學生貼人格標籤（Astra 審核 2026-11-20）
const FILLER_GUESS = {
  hi: { zh: '滿天星', en: "baby's breath", mean: '滿天星：這一局常猜中全班的選擇' },
  lo: { zh: '尤加利葉', en: 'eucalyptus leaves', mean: '尤加利葉：這一局較少猜中全班的選擇' },
};
const FILLER_TOP = {
  lian:  { zh: '幾枝細竹葉', en: 'a few slender bamboo leaves', mean: '竹葉：配蓮花的綠' },
  ju:    { zh: '幾支麥穗', en: 'a few ears of wheat', mean: '麥穗：配菊花的秋天' },
  mudan: { zh: '幾朵粉色小玫瑰', en: 'a few small pink roses', mean: '小玫瑰：配牡丹的熱鬧' },
};

// counts: {ju, mudan, lian}；guessRate: 0–1
function bouquet(counts, guessRate, styleId, wrapId) {
  // 一題都沒答：三種花各一朵，讓學生還是能做花束
  if (!((counts.lian || 0) + (counts.ju || 0) + (counts.mudan || 0))) counts = { lian: 1, ju: 1, mudan: 1 };
  const order = ['lian', 'ju', 'mudan'].filter(f => counts[f] > 0).sort((a, b) => counts[b] - counts[a]);
  const top = order[0] || 'lian';
  const g = guessRate >= 0.5 ? FILLER_GUESS.hi : FILLER_GUESS.lo;
  const t = FILLER_TOP[top];
  const style = STYLES.find(s => s.id === styleId) || STYLES[0];
  const wrap = WRAPS.find(w => w.id === wrapId) || WRAPS[0];
  const zhParts = order.map(f => `${counts[f]} 朵${FLOWER_ZH[f]}${f === 'lian' && counts[f] >= 2 ? '（其中一朵帶綠色蓮蓬）' : ''}`);
  const enParts = order.map(f => `${NUM_EN[counts[f]] || counts[f]} ${FLOWER_EN[f][counts[f] > 1 ? 1 : 0]}`);
  const tops = topFlowers(counts);
  const tied = tops.length > 1;
  const zh = `${wrap.zh}。花材比例：${zhParts.join('、')}，${tied ? tops.map(f => GAME_FLOWER[f].long).join('和') + '一樣多、份量相當' : GAME_FLOWER[top].long + '最多、最顯眼'}。`
    + `點綴${g.zh}和${t.zh}。${style.zh}。畫面中只有花，不要有文字、不要有人物。`;
  const en = `${cap(wrap.en)}. Flowers in this exact proportion: ${enParts.join(', ')}; ${tied ? 'the ' + tops.map(f => FLOWER_EN[f][1]).join(' and ') + ' are evenly balanced' : 'the ' + FLOWER_EN[top][1] + ' are the most prominent'}. `
    + `Accents: ${g.en} and ${t.en}. Style: ${style.en}. Only flowers, no text, no people.`;
  return { zh, en, fillers: [g.mean, t.mean], top };
}
const cap = s => s[0].toUpperCase() + s.slice(1);
// 最多的花（可能同分好幾朵），照 蓮、菊、牡丹 排
function topFlowers(counts) {
  const m = Math.max(counts.lian || 0, counts.ju || 0, counts.mudan || 0);
  return m ? ['lian', 'ju', 'mudan'].filter(f => counts[f] === m) : [];
}
const topNames = (counts, long = true) => topFlowers(counts).map(f => long ? GAME_FLOWER[f].long : GAME_FLOWER[f].name).join('和');
