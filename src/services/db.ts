import { Book, ApiConfig, InspirationRecord, UiSettings, HistoryItem, NovelSkill, DEFAULT_PRESET_SKILLS, DramaProject, DramaCandidatePlan } from '../types';

const DB_NAME = 'aiNovelistDB';
const DB_VERSION = 4;

export const STORE_NAMES = {
  BOOKS: 'books',
  CONFIGS: 'configs',
  PERSONA_HISTORY: 'personaHistory',
  OUTLINE_HISTORY: 'outlineHistory',
  UI_SETTINGS: 'uiSettings',
  STYLE_HISTORY: 'styleHistory',
  XP_PREFERENCES: 'xpPreferences',
  XP_PREFERENCES_HISTORY: 'xpPreferencesHistory',
  INSPIRATION_RECORDS: 'inspirationRecords',
  NOVEL_SKILLS: 'novelSkills',
  DRAMA_PROJECTS: 'dramaProjects',
  DRAMA_CANDIDATES: 'dramaCandidates',
} as const;

let dbInstance: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      Object.values(STORE_NAMES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          if (
            ([
              STORE_NAMES.PERSONA_HISTORY,
              STORE_NAMES.OUTLINE_HISTORY,
              STORE_NAMES.STYLE_HISTORY,
              STORE_NAMES.XP_PREFERENCES_HISTORY,
            ] as string[]).includes(storeName)
          ) {
            db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
          } else {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      });
    };

    request.onsuccess = (event: any) => {
      dbInstance = event.target.result;
      resolve(dbInstance!);
    };

    request.onerror = (event: any) => {
      console.error('IndexedDB Error:', event.target.errorCode);
      reject('Error opening IndexedDB');
    };
  });
}

async function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    callback(store, resolve, reject);
  });
}

export async function dbPut(storeName: string, data: any): Promise<any> {
  return transact(storeName, 'readwrite', (store, resolve) => {
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function dbGet<T = any>(storeName: string, key: string | number): Promise<T | null> {
  return transact<T | null>(storeName, 'readonly', (store, resolve) => {
    const request = store.get(key);
    request.onsuccess = (event: any) => resolve(event.target.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function dbGetAll<T = any>(storeName: string): Promise<T[]> {
  return transact<T[]>(storeName, 'readonly', (store, resolve) => {
    const request = store.getAll();
    request.onsuccess = (event: any) => resolve(event.target.result || []);
    request.onerror = () => resolve([]);
  });
}

export async function dbDelete(storeName: string, key: string | number): Promise<void> {
  return transact<void>(storeName, 'readwrite', (store, resolve) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
  });
}

export async function dbClear(storeName: string): Promise<void> {
  return transact<void>(storeName, 'readwrite', (store, resolve) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
  });
}

export const BUILTIN_CONFIG_ID = 'builtin-gemini-line';

export const DEFAULT_BUILTIN_CONFIG: ApiConfig = {
  id: BUILTIN_CONFIG_ID,
  name: 'Gemini 官方内置线路',
  baseUrl: '/api/ai',
  apiKey: 'BUILTIN_KEY',
  provider: 'built-in-gemini',
  modelsCache: [
    { id: 'gemini-3.6-flash', name: '[⚡默认] Gemini 3.6 Flash' },
    { id: 'gemini-3.1-pro-preview', name: '[🧠强推] Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash-lite', name: '[🚀极速] Gemini 3.1 Flash Lite' },
  ],
};

export async function seedInitialDataIfEmpty() {
  const existingBooks = await dbGetAll<Book>(STORE_NAMES.BOOKS);
  const existingConfigsWrapper = await dbGet<{ id: string; data: ApiConfig[] }>(STORE_NAMES.CONFIGS, 'all');

  let configs = existingConfigsWrapper?.data || [];

  if (!configs.some((c) => c.id === BUILTIN_CONFIG_ID)) {
    configs.unshift(DEFAULT_BUILTIN_CONFIG);
    await dbPut(STORE_NAMES.CONFIGS, { id: 'all', data: configs });
  }

  const existingUiSettings = await dbGet<UiSettings>(STORE_NAMES.UI_SETTINGS, 'current');
  if (!existingUiSettings) {
    const defaultUi: UiSettings = {
      theme: 'ink',
      mode: 'light',
      chapterFontSize: '1.08rem',
      studioBrandName: '墨映工坊',
      activeTrack: 'novel',
      writerApiCfgId: BUILTIN_CONFIG_ID,
      writerApiModel: 'gemini-3.6-flash',
      rerollApiCfgId: BUILTIN_CONFIG_ID,
      rerollApiModel: 'gemini-3.6-flash',
      inspirationApiCfgId: BUILTIN_CONFIG_ID,
      inspirationApiModel: 'gemini-3.6-flash',
    };
    await dbPut(STORE_NAMES.UI_SETTINGS, { id: 'current', ...defaultUi });
  }

  if (existingBooks.length === 0) {
    const now = Date.now();
    const demoBook1: Book = {
      id: 'demo-book-1',
      title: '魔尊的见习药仙',
      createdAt: now - 86400000 * 3,
      lastModifiedAt: now - 3600000,
      archivedChapters: [],
      summaries: [
        {
          id: 'sum-1',
          createdAt: now - 86400000,
          startChapter: 1,
          endChapter: 2,
          chapterRange: '1 - 2',
          title: '第1-2章总结',
          content: '一、故事进展：小药仙顾星辰在暴风雪深山发现重伤坠落的魔尊辰渊（幼年受创态），将其悉心照料。二、感情线：辰渊体会到世间唯一的纯粹善意，萌生极强保护欲。',
        },
      ],
      settings: {
        genre: '仙侠 / 耽美纯爱',
        style: '爱情甜宠 霸道强势 治愈救赎',
        chapterWords: 2500,
        pov: '第三人称',
        tense: '现在时',
        temperature: 0.8,
        contextMemory: 3,
        aiPersona: '你是一位精通仙侠纯爱与奇幻动作的小说家，文字画面感强，注重细腻的情感互动与场景氛围打造。',
        characters: '- 顾星辰：仙族见习药仙，性格温柔坚韧，身怀纯净灵力与古药天赋。\n- 辰渊：魔界至高魔尊，实力毁天灭地，行事霸道冷酷，唯独对顾星辰展现深情脆弱。',
        world: '架空古代，仙魔妖三界并立。仙界秩序严苛，魔界弱肉强食，人界灵气稀薄乃交汇避风港。',
        outline: '第一幕：山中独居小药仙在白雪深处拾到重伤的小男孩（魔尊变小体）。\n第二幕：悉心包扎疗伤，魔尊体会异样平静与占有欲。\n第三幕：仙界察觉异象围捕，魔尊强行破封恢复本尊，惊天营救！',
        styleReference: null,
      },
      chapters: [
        {
          id: 'ch-1',
          index: 1,
          title: '第一章：山中独居小药仙，白雪深处拾“稚童”',
          text: `人界采药山深处，常年笼罩着终年不散的薄雾。

顾星辰系紧了腰间的药囊，踏着未融的积雪走在陡峭的山径上。他不过是仙界最普通不过的一名见习药仙，体质孱弱，灵力低微，被派驻到这偏远的山林中照料灵草药圃。

“今日的露水倒是采够了……”顾星辰擦了擦额前细密的汗珠，轻声自语。

突然，前方幽深的林谷间传来一声惊天动地的轰鸣！漆黑如墨的狂暴魔气将半边天空染成惨烈深黑，狂风刮得漫山松柏猎猎作响。顾星辰被这股恐怖的威压震得气血翻涌，连退数步。

片刻后，风暴渐渐平息。

顾星辰忍着心中的惊恐，顺着断裂的树木寻去，竟在黑石乱堆中发现了一个浑身是血的缩影——那竟是个看起来不过七八岁的孩童，衣袍破烂，伤口狰狞得令人心惊肉跳，周身还残存着令人窒息的血腥杀意。

“天哪……竟伤得如此重……”

顾星辰心地纯善，看着孩子惨白如纸的小脸，终究没能忍住怜悯之心。他脱下温热的外袍裹住孩子，将这“非同寻常”的伤者背回了自己的草庐。`,
          meta: '模型: gemini-3.6-flash | 耗时: 1280ms | 字数: 432',
          allSuggestions: [
            {
              timestamp: now - 86400000 * 2,
              suggestions: [
                '【方向1】小屋初遇：孩童醒来冷漠不语，顾星辰温柔包扎换药，魔尊被其纯粹吸引。',
                '【方向2】仙界探子：仙界追寻魔气异动来到山脚，顾星辰隐藏小男孩躲过搜查。',
                '【方向3】异能初显：小男孩无意间展现出瞬间御动魔植的异能，让顾星辰心生疑虑。',
                '【方向4】旧伤复发：深夜孩子体热高烧，顾星辰不惜以自身灵力配药相救。',
              ],
            },
          ],
        },
        {
          id: 'ch-2',
          index: 2,
          title: '第二章：小屋初遇，魔尊的沉默与药仙的柔情',
          text: `草庐内幽香袅袅，药炉里正咕嘟咕嘟冒着热气。

顾星辰端着刚熬好的汤药来到榻前，小心翼翼地为小男孩擦拭脸上的血污。榻上的孩子不知何时已睁开了双眼，那双漆黑的眼眸如同没有尽头的深渊，冷冽、警惕而冰凉，与稚嫩的面庞形成极致反差。

“你醒了？”顾星辰柔声笑道，眼神清澈，“别怕，这里很安全，我是山上的药仙。你身上的伤口我已经用凝血草敷过了。”

小男孩没有说话，只是死死盯着顾星辰搭在他肩上的手，周身紧绷得宛如拉满的弓弦。他便是令三界闻风丧胆的魔尊辰渊，因战神偷袭重伤导致功体倒退回幼体，本以为坠入人界必死无疑，却没想到会被一个仙族蝼蚁救下。

顾星辰吹了擦汤药，舀起一勺送到他唇边：“有些苦，但对伤口大有好处，喝一口好不好？”

辰渊冷眼看着面爽温润的草药汤，本能想挥手打翻，可触及顾星辰眼中毫无杂质的关切与期待时，指尖微微一颤，鬼使神差地低头将汤药咽了下去。

草药的苦涩在舌尖蔓延，可草庐中的暖意，却沿着经脉缓缓渗入了魔尊万年冰封的心深处。`,
          meta: '模型: gemini-3.6-flash | 耗时: 1420ms | 字数: 485',
          userNextPlotInput: '下一章仙界追兵逼近山谷，顾星辰冒死守护小男孩，魔尊首次展露护短本能。',
          allSuggestions: [
            {
              timestamp: now - 3600000,
              suggestions: [
                '【建议1】山谷危机：仙界巡逻队发现魔气残痕，搜查草庐，顾星辰急中生智掩护。',
                '【建议2】占有欲萌芽：邻山药童拜访顾星辰，辰渊冷眼相待，对靠近顾星辰的人产生排斥。',
                '【建议3】功力恢复：深夜辰渊盘膝调息，引得周围植被疯长，被顾星辰意外撞见。',
                '【建议4】山中采药：顾星辰带辰渊入山辨识灵草，两人度过一段温馨美好的午后时光。',
              ],
            },
          ],
        },
      ],
    };

    const demoBook2: Book = {
      id: 'demo-book-2',
      title: '深渊之光',
      createdAt: now - 86400000 * 5,
      lastModifiedAt: now - 86400000 * 4,
      archivedChapters: [],
      summaries: [],
      settings: {
        genre: '赛博朋克 / 科幻悬疑',
        style: '反乌托邦 黑暗强强 爽快反转',
        chapterWords: 2000,
        pov: '第三人称',
        tense: '过去时',
        temperature: 0.8,
        contextMemory: 3,
        aiPersona: '你是一位精通赛博朋克与科幻悬疑的酷炫小说家。',
        characters: '- 陆宵：霓虹城顶级黑客与机械义体医生。\n- 零号：从底穹实验室逃脱的终极AI人形兵器。',
        world: '2099年霓虹城，高天财阀掌控记忆芯片，底穹贫民窟永不见天日。',
        outline: '陆宵捡到了失忆的零号，发现其脑内芯片藏着倾覆财阀统治的终极密钥。',
        styleReference: null,
      },
      chapters: [
        {
          id: 'ch-2-1',
          index: 1,
          title: '第一章：雨夜里的机械惊魂',
          text: `霓虹城的酸雨砸在铁皮屋顶上，发出刺耳的噪音。

陆宵戴着单眼护目镜，正用激光镊子焊接一枚旧型记忆芯片。工坊后门突然传来一声沉重的撞击，随后是金属重物倒地的不刺响声。

陆宵拔出腰间的电磁手枪，推门走入巷道。积水中躺着一名身穿高阶骨骼战甲的年轻人，后颈处暴露的接口正喷践出湛蓝色的电火花……`,
          meta: '模型: gemini-3.6-flash | 耗时: 1100ms | 字数: 165',
        },
      ],
    };

    await dbPut(STORE_NAMES.BOOKS, demoBook1);
    await dbPut(STORE_NAMES.BOOKS, demoBook2);

    // Seed sample inspiration records
    const sampleInspiration: InspirationRecord = {
      id: 'insp-demo-1',
      createdAt: now - 86400000 * 2,
      title: '赛博破晓：终极械心',
      genre: '赛博朋克 / 悬疑',
      style: '黑暗、反乌托邦、快节奏',
      world: '高天财阀垄断意识上传，贫民窟居民靠二手义体苟活。',
      characters: '- 顾离：黑客义体医生；- 零号：被财阀追杀的禁忌机械体。',
      outline: '讲述黑客顾离意外解开零号核心防线，两人携手颠覆财阀垄断的故事。',
      rawContent: '### 大纲标题：赛博破晓\n**书名：** 赛博破晓\n**题材：：** 赛博朋克+悬疑',
      linkedNovels: [{ novelId: demoBook2.id, novelTitle: demoBook2.title }],
    };
    await dbPut(STORE_NAMES.INSPIRATION_RECORDS, sampleInspiration);
  }

  // Seed demo commercial AI Comic-Drama project if empty
  const existingDramas = await dbGetAll<DramaProject>(STORE_NAMES.DRAMA_PROJECTS);
  if (existingDramas.length === 0) {
    const now = Date.now();
    const demoDrama: DramaProject = {
      id: 'demo-drama-1',
      title: '零下七十度：我的百亿安全屋寸步不让',
      createdAt: now - 86400000 * 2,
      lastModifiedAt: now - 1800000,
      trackId: 'track-rules-apocalypse',
      trackName: '末世囤货 / 规则怪谈',
      channel: '全民脑洞',
      visualStyle: '暗黑赛博霓虹',
      aspectRatio: '9:16 竖屏短剧',
      totalPlannedEpisodes: 40,
      paywallEpisodeIndex: 10,
      logline: '极寒血月降临前72小时，重生归来的沈寂清空百亿资产打造钛合金恒温堡垒，隔着防弹玻璃吃着红油火锅，冷眼看前世背叛他的邻居们在暴风雪中破防求饶。',
      targetAudience: '18-35岁短视频受众，热衷强视觉反差、极寒生存爽感与智商在线不圣母剧情',
      golden3SecHook: '【第1秒】零下72℃冻死惨状瞳孔特写骤然倒流 → 【第2秒】手机屏幕弹出距离血月冰封倒计时72:00:00 → 【第3秒】男主抓起桌上一摞房产证直接砸向典当行柜台：“全折现，今天之内！”',
      synopsis: '第一阶段（1-9集免费留存）：男主沈寂重生回末世前三天，闪电套现百亿改造顶层军工级安全屋、搬空三座冷链仓储。极寒降临当日，绿茶前女友与势利物业上门道德绑架索要物资，被电网与防爆门精准反制。\n第二阶段（10-12集付费卡点）：血月异变升级，第一条《小区夜间生存规则》浮现在所有幸存者窗户上，门外响起模仿熟人求救的诡异敲门声。\n第三阶段（13-40集高潮）：规则怪谈与极寒怪物双重进化，沈寂解锁安全屋地下机甲能源核心，建立末世唯一秩序交易站。',
      characterAssets: [
        {
          id: 'char-shenji',
          name: '沈寂',
          roleTag: '核心男主',
          ageAndArchetype: '26岁 · 重生清醒狠人 · 顶级安全屋主理人',
          appearanceZh: '黑发利落微分碎盖，眼神冷冽如刀，鼻梁高挺，常穿黑色高领战术冲锋衣或室内深灰羊绒衫，左腕戴一块战术倒计时机械表。',
          visualPromptEn: '26yo handsome Chinese man, sharp cold dark eyes, neat black layered short hair, wearing sleek black tactical turtleneck jacket, matte silver countdown watch on left wrist, anime semi-realistic cel-shaded lighting, 9:16 vertical framing',
          voicePersona: '低沉冷静青年音，语速干脆利落，面对道德绑架时带三分漫不经心的嘲弄',
          signatureTrait: '每次拒绝反派时轻敲防弹玻璃，室内热气腾腾与室外风雪形成极致冷暖同框',
        },
        {
          id: 'char-linwan',
          name: '林薇薇',
          roleTag: '势利前女友（前期反派）',
          ageAndArchetype: '24岁 · 精致利己绿茶',
          appearanceZh: '栗色大波浪卷发，妆容精致（后期冻得嘴唇发紫、睫毛结霜），身穿白色名媛貂皮大衣，戴珍珠耳环。',
          visualPromptEn: '24yo young woman, chestnut wavy long hair, wearing luxury white faux-fur coat, frost on eyelashes in blizzard, desperate expression, high contrast comic drama style',
          voicePersona: '前期娇纵理所当然，后期嘶哑崩溃哭腔',
          signatureTrait: '习惯性站在道德制高点指责别人自私',
        },
      ],
      sceneAnchors: [
        {
          id: 'scene-bunker',
          sceneName: '28层钛合金恒温安全屋客厅',
          lightingAndMood: '室内暖橙色壁炉光与红油火锅蒸汽，窗外幽蓝暴风雪与血色圆月强烈对撞',
          visualPromptZh: '三层加厚军工防弹落地窗，窗内暖光壁炉、沸腾九宫格火锅与整面物资货架，窗外零下七十度幽蓝冰封城市与血月',
          visualPromptEn: 'Luxury armored penthouse bunker interior, warm orange fireplace glow, steaming hotpot on table, triple-layered bulletproof panoramic window showing frozen apocalyptic city under blood moon outside, extreme warm-cold color contrast',
        },
      ],
      episodePlan: [
        { episodeIndex: 1, title: '血月倒计时72小时', beatSummary: '前世惨死闪回，当场折现百亿资产订购军工级安全屋改造与万吨物资。', hookType: '免费强留存' },
        { episodeIndex: 2, title: '搬空三座万吨冷库', beatSummary: '林薇薇嘲笑沈寂疯了当冤大头，沈寂反手拉黑并完成堡垒合拢，暴雪提前降临！', hookType: '小高潮爽点' },
        { episodeIndex: 10, title: '血月规则：半夜别开门', beatSummary: '整栋楼断水断电，业主群全员破防围攻28楼，窗外突然浮现血字规则，门外传来诡异挠门声！', hookType: '核心付费卡点' },
      ],
      episodes: [
        {
          id: 'ep-demo-1',
          index: 1,
          title: '第1集：重生末世前72小时，百亿折现囤爆安全屋',
          isPaywallHook: false,
          targetDurationSec: 95,
          coreConflictSummary: '前世被女友与邻居害死冻成冰雕的沈寂重生回末世前三天，果断套现百亿启动军工堡垒改造，前女友上门羞辱反被当众断绝关系。',
          opening3SecHook: '冰封废墟中沈寂结满白霜的瞳孔猛然收缩，鲜红倒计时【71:59:59】瞬间炸裂占满竖屏！',
          endingCliffhanger: '三百辆重型冷链卡车深夜集结郊外仓库，天边突然划过第一道诡异的暗红极光——极寒比前世提前了整整12小时！',
          nextEpisodeHooks: [
            '【第2集爽点推进】暴雪提前封城！林薇薇带着富二代新欢被困高速路冻得瑟瑟发抖，而沈寂刚刚锁死最后一道钛合金防爆门煮上和牛火锅。',
            '【第2集冲突升级】势利眼物业经理带保安强行要求征用沈寂囤积的发电机，沈寂一键启动门外高压电弧防御网教做人。',
            '【第2集悬念钩子】监控画面里，一楼大堂的温度计直接跌破零下五十度，玻璃门外走过一道身高三米的诡异黑影。',
          ],
          meta: '赛道引擎: 末世囤货/规则怪谈 | 格式: 标准短剧 △ 三角场次本 | 已拆解 6 镜 | 预计时长: 95秒',
          updatedAt: now - 1800000,
          scriptFormat: 'triangle_standard',
          rawScriptText: `**1-1 闪回 -- 冰封废墟 -- 夜 -- 外景**
出场人物：沈寂

△ 狂风暴雪呼啸，头顶悬挂一轮妖异血月。
△ 沈寂满脸白霜倒在雪地里，瞳孔骤然紧缩。
沈寂（OS）：极寒降临第十天，我用最后半块压缩饼干救活的人，亲手把我推下了零下七十度的冰渊！
【音效】：玻璃碎裂时光倒流巨响

**1-2 顶层公寓客厅 -- 日 -- 内景**
出场人物：沈寂

△ 沈寂猛地从沙发惊醒，大口喘气。
△ 他低头抓紧左腕机械表——表盘显示【10月14日 08:00】。
沈寂：（眼神骤冷，嘴角勾起冷笑）十月十四号……距离全球血月冰封，还有整整七十二小时！

**1-3 投行贵宾室 -- 日 -- 内景**
出场人物：沈寂、银行经理

△ 沈寂将一整箱股权书与不动产证重重推过黑曜石桌面。
△ 银行经理推了推眼镜，满脸震惊。
沈寂：（不容置疑）名下所有集团股份折价七成，三个小时内，我要看到八十亿现金到账。

**1-4 顶层公寓门前 -- 日 -- 内景**
出场人物：沈寂、林薇薇

△ 施工队正在门框焊接三层军工钛合金防爆门，电焊火花四溅。
△ 林薇薇抱胸站在门外，翻了个白眼，伸手索要银行卡。
林薇薇：（娇纵嘲讽）沈寂你疯了吧？把婚房焊成铁棺材！赶紧把副卡给我，今晚我要去周少的游艇派对！
△ 沈寂冷漠避开她的手，直接抬手按下墙上红色液压闭门键。
【音效】：“砰——！”三十厘米厚防爆门重重合拢
沈寂：（冰冷轻嗤）好好享受你最后三天的常温空气吧。从现在起，别再来敲我的门。

**1-5 郊外万吨冷链物流园 -- 夜 -- 外景**
出场人物：沈寂

△ 三百辆重型冷链卡车车灯如长龙，彻夜往仓库卸货。
△ 沈寂站在高台抬头望天——漆黑云层突然撕裂出一道暗红极光！
【音效】：腕表高频刺耳警报声
沈寂（OS）：（震惊紧迫）血色极光怎么提前出现了？！这一世的极寒异变，竟然比前世提前了整整十二个小时！`,
          shots: [
            {
              id: 'shot-1',
              shotNumber: 1,
              durationSec: 4,
              shotSizeAndCamera: '极特写 → 急速拉远 + 碎裂转场',
              charactersInShot: '沈寂',
              visualDescription: '9:16竖屏暗黑赛博厚涂风，零下七十度冰封城市废墟，26岁黑发微分碎盖青年沈寂倒在暴风雪中，眉骨结满白霜，漆黑冷冽瞳孔倒映天际妖异血月，画面骤然出现裂纹时光倒流',
              imagePromptEn: 'Extreme close-up of 26yo handsome Chinese man Shen Ji frozen in blizzard, frost on eyebrows, cold sharp eyes reflecting giant blood moon, shattering glass time-rewind effect, dark cyber anime style, 9:16',
              actionAndExpression: '瞳孔剧烈震颤后瞬间定格碎裂',
              dialogueSpeaker: '沈寂 (OS)',
              dialogueVoiceStyle: '低沉森冷，恨意克制',
              dialogueText: '极寒降临第十天，我省下最后半块压缩饼干救活的人，亲手把我推下了零下七十度的冰渊。',
              sfxAndBgm: '呼啸风雪声 + 心电图拉直长鸣 + 低音炮重击转场',
            },
            {
              id: 'shot-2',
              shotNumber: 2,
              durationSec: 5,
              shotSizeAndCamera: '手腕特写 → 摇镜至面部近景',
              charactersInShot: '沈寂',
              visualDescription: '阳光刺眼的现代顶层大平层客厅，沈寂身穿深灰羊绒衫猛然坐起，左腕银色战术机械表清晰显示日期，眼神瞬间蜕变为上位者的杀伐果断',
              imagePromptEn: 'Close-up of matte silver tactical watch on left wrist, tilting up to 26yo Chinese man Shen Ji waking up sharply in modern penthouse, cold decisive gaze, crisp cel-shaded lighting, 9:16',
              actionAndExpression: '猛然抓紧手腕看清日期，嘴角勾起一抹冰冷弧度',
              dialogueSpeaker: '沈寂',
              dialogueVoiceStyle: '短促果断',
              dialogueText: '十月十四号……距离全球血月冰封，还有整整七十二小时！',
              sfxAndBgm: '秒针重音滴答卡点 + 悬疑电子鼓点渐起',
            },
            {
              id: 'shot-3',
              shotNumber: 3,
              durationSec: 6,
              shotSizeAndCamera: '俯拍中景 + 推镜特写',
              charactersInShot: '沈寂',
              visualDescription: '顶级投行贵宾室内，沈寂身穿黑色高领战术风衣，将整整一箱股权转让书与不动产证重重推过黑曜石桌面，对面西装经理满脸震惊失色',
              imagePromptEn: 'Medium shot in luxury VIP bank room, Shen Ji in black tactical turtleneck coat sliding a metal briefcase of property deeds across obsidian table, shocked bank manager, dramatic rim light, 9:16',
              actionAndExpression: '单手按住金属箱推向对面，目光毫无波澜',
              dialogueSpeaker: '沈寂',
              dialogueVoiceStyle: '不容置疑的命令口吻',
              dialogueText: '名下所有集团股份折价七成，三个小时内，我要看到八十亿现金到账。',
              sfxAndBgm: '金属手提箱砸桌闷响 + 纸张散落声',
            },
            {
              id: 'shot-4',
              shotNumber: 4,
              durationSec: 6,
              shotSizeAndCamera: '双人中近景（正反打对峙）',
              charactersInShot: '沈寂、林薇薇',
              visualDescription: '公寓门前，栗色大波浪卷发、身穿白色名媛皮草的林薇薇双手抱胸高傲指责，门内沈寂身后是正在焊接三层钛合金防爆门的火花四溅施工队',
              imagePromptEn: 'Two-shot at penthouse doorway, 24yo woman Lin Weiwei with chestnut wavy hair in white fur coat looking arrogant, Shen Ji standing coldly in front of sparks from welding titanium blast doors, 9:16',
              actionAndExpression: '林薇薇翻白眼伸手索要银行卡，沈寂冷淡侧身避开',
              dialogueSpeaker: '林薇薇',
              dialogueVoiceStyle: '娇纵尖锐嘲讽',
              dialogueText: '沈寂你疯了吧？把婚房焊成铁棺材！赶紧把副卡给我，今晚我要去参加周少的游艇派对！',
              sfxAndBgm: '背景电焊滋滋火花声 + 滑稽骤停音效',
            },
            {
              id: 'shot-5',
              shotNumber: 5,
              durationSec: 5,
              shotSizeAndCamera: '面部特写 + 关门遮挡转场',
              charactersInShot: '沈寂、林薇薇',
              visualDescription: '沈寂眼神漠然如看死人，抬手按下墙上红色液压闭门键，厚达三十厘米的军工钛合金防爆门轰然合拢，将林薇薇错愕扭曲的脸彻底隔绝在外',
              imagePromptEn: 'Close-up of Shen Ji pressing red hydraulic switch with icy smirk, massive 30cm thick titanium blast door slamming shut towards camera, cutting off arrogant woman outside, 9:16',
              actionAndExpression: '指尖干脆按下开关，连半个眼神都没多给',
              dialogueSpeaker: '沈寂',
              dialogueVoiceStyle: '冰冷轻嗤',
              dialogueText: '游艇派对？好好享受你最后三天的常温空气吧。从现在起，别再来敲我的门。',
              sfxAndBgm: '沉重液压机械合拢巨响“砰——！”',
            },
            {
              id: 'shot-6',
              shotNumber: 6,
              durationSec: 6,
              shotSizeAndCamera: '大远景航拍仰视（集末悬念卡点）',
              charactersInShot: '沈寂（背影）',
              visualDescription: '深夜郊外巨型万吨冷链物流园，三百辆重卡车灯如长龙彻夜卸货，沈寂站在高台背影挺拔，抬头望向夜空——原本漆黑的云层深处突然撕裂出一抹诡异妖艳的暗红极光',
              imagePromptEn: 'Epic wide vertical shot at night, hundreds of heavy trucks unloading supplies at mega warehouse, silhouette of Shen Ji looking up at dark sky tearing open with eerie crimson blood aurora, dramatic cliffhanger, 9:16',
              actionAndExpression: '手腕机械表突然发出刺耳蜂鸣警报，沈寂瞳孔微缩',
              dialogueSpeaker: '沈寂 (OS)',
              dialogueVoiceStyle: '紧迫低沉悬念感',
              dialogueText: '等等……血色极光怎么提前出现了？！这一世的极寒异变，竟然比前世提前了整整十二个小时！',
              sfxAndBgm: '战术手表高频蜂鸣警报 + 诡异低频雷鸣悬念骤停',
            },
          ],
        },
      ],
    };
    await dbPut(STORE_NAMES.DRAMA_PROJECTS, demoDrama);
  } else {
    const legacyDemo = existingDramas.find((d) => d.id === 'demo-drama-1');
    const ep1 = legacyDemo?.episodes?.find((e) => e.id === 'ep-demo-1');
    if (legacyDemo && ep1 && ep1.rawScriptText.includes('[镜号 01')) {
      ep1.scriptFormat = 'triangle_standard';
      ep1.rawScriptText = `**1-1 闪回 -- 冰封废墟 -- 夜 -- 外景**
出场人物：沈寂

△ 狂风暴雪呼啸，头顶悬挂一轮妖异血月。
△ 沈寂满脸白霜倒在雪地里，瞳孔骤然紧缩。
沈寂（OS）：极寒降临第十天，我用最后半块压缩饼干救活的人，亲手把我推下了零下七十度的冰渊！
【音效】：玻璃碎裂时光倒流巨响

**1-2 顶层公寓客厅 -- 日 -- 内景**
出场人物：沈寂

△ 沈寂猛地从沙发惊醒，大口喘气。
△ 他低头抓紧左腕机械表——表盘显示【10月14日 08:00】。
沈寂：（眼神骤冷，嘴角勾起冷笑）十月十四号……距离全球血月冰封，还有整整七十二小时！

**1-3 投行贵宾室 -- 日 -- 内景**
出场人物：沈寂、银行经理

△ 沈寂将一整箱股权书与不动产证重重推过黑曜石桌面。
△ 银行经理推了推眼镜，满脸震惊。
沈寂：（不容置疑）名下所有集团股份折价七成，三个小时内，我要看到八十亿现金到账。

**1-4 顶层公寓门前 -- 日 -- 内景**
出场人物：沈寂、林薇薇

△ 施工队正在门框焊接三层军工钛合金防爆门，电焊火花四溅。
△ 林薇薇抱胸站在门外，翻了个白眼，伸手索要银行卡。
林薇薇：（娇纵嘲讽）沈寂你疯了吧？把婚房焊成铁棺材！赶紧把副卡给我，今晚我要去周少的游艇派对！
△ 沈寂冷漠避开她的手，直接抬手按下墙上红色液压闭门键。
【音效】：“砰——！”三十厘米厚防爆门重重合拢
沈寂：（冰冷轻嗤）好好享受你最后三天的常温空气吧。从现在起，别再来敲我的门。

**1-5 郊外万吨冷链物流园 -- 夜 -- 外景**
出场人物：沈寂

△ 三百辆重型冷链卡车车灯如长龙，彻夜往仓库卸货。
△ 沈寂站在高台抬头望天——漆黑云层突然撕裂出一道暗红极光！
【音效】：腕表高频刺耳警报声
沈寂（OS）：（震惊紧迫）血色极光怎么提前出现了？！这一世的极寒异变，竟然比前世提前了整整十二个小时！`;
      await dbPut(STORE_NAMES.DRAMA_PROJECTS, legacyDemo);
    }
  }

  // Seed or upgrade default preset skills non-destructively
  await getGlobalSkills();
}

export async function getGlobalSkills(): Promise<NovelSkill[]> {
  const list = await dbGetAll<NovelSkill>(STORE_NAMES.NOVEL_SKILLS);
  if (!list || list.length === 0) {
    for (const s of DEFAULT_PRESET_SKILLS) {
      await dbPut(STORE_NAMES.NOVEL_SKILLS, s);
    }
    return DEFAULT_PRESET_SKILLS;
  }

  const presetMap = new Map(DEFAULT_PRESET_SKILLS.map((p) => [p.id, p]));
  const existingIds = new Set(list.map((s) => s.id));
  const upgradedList: NovelSkill[] = [];

  for (const item of list) {
    const presetRef = presetMap.get(item.id);
    if (presetRef && (!item.scopes || !item.triggerMode)) {
      const upgraded: NovelSkill = {
        ...presetRef,
        ...item,
        scopes: item.scopes && item.scopes.length > 0 ? item.scopes : presetRef.scopes,
        triggerMode: item.triggerMode || presetRef.triggerMode || 'always',
        keywords: item.keywords || presetRef.keywords || [],
        priority: item.priority || presetRef.priority || 'normal',
      };
      await dbPut(STORE_NAMES.NOVEL_SKILLS, upgraded);
      upgradedList.push(upgraded);
    } else if (!item.scopes || item.scopes.length === 0) {
      const upgraded: NovelSkill = {
        ...item,
        scopes: ['chapter', 'polish'],
        triggerMode: item.triggerMode || 'always',
        priority: item.priority || 'normal',
      };
      await dbPut(STORE_NAMES.NOVEL_SKILLS, upgraded);
      upgradedList.push(upgraded);
    } else {
      upgradedList.push(item);
    }
  }

  // Inject newly added presets if user hasn't explicitly initialized them yet (one-time migration)
  const migratedFlag = localStorage.getItem('moyun_skills_v2_migrated');
  if (!migratedFlag) {
    for (const preset of DEFAULT_PRESET_SKILLS) {
      if (!existingIds.has(preset.id)) {
        await dbPut(STORE_NAMES.NOVEL_SKILLS, preset);
        upgradedList.push(preset);
      }
    }
    localStorage.setItem('moyun_skills_v2_migrated', '1');
  }

  return upgradedList;
}

export async function saveGlobalSkill(skill: NovelSkill): Promise<void> {
  await dbPut(STORE_NAMES.NOVEL_SKILLS, skill);
}

export async function deleteGlobalSkill(skillId: string): Promise<void> {
  await dbDelete(STORE_NAMES.NOVEL_SKILLS, skillId);
}

export async function resetGlobalSkills(): Promise<NovelSkill[]> {
  await dbClear(STORE_NAMES.NOVEL_SKILLS);
  for (const s of DEFAULT_PRESET_SKILLS) {
    await dbPut(STORE_NAMES.NOVEL_SKILLS, s);
  }
  localStorage.setItem('moyun_skills_v2_migrated', '1');
  return DEFAULT_PRESET_SKILLS;
}

export async function getDramaCandidates(): Promise<DramaCandidatePlan[]> {
  const all = await dbGetAll<DramaCandidatePlan>(STORE_NAMES.DRAMA_CANDIDATES);
  return (all || []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveDramaCandidatesBatch(
  candidates: DramaCandidatePlan[]
): Promise<DramaCandidatePlan[]> {
  if (!candidates || candidates.length === 0) {
    return getDramaCandidates();
  }
  const existing = await dbGetAll<DramaCandidatePlan>(STORE_NAMES.DRAMA_CANDIDATES);
  const existingFingerprints = new Set(
    existing.map((c) => `${c.title.trim()}::${c.logline.trim().slice(0, 40)}`)
  );

  for (const item of candidates) {
    const fp = `${item.title.trim()}::${item.logline.trim().slice(0, 40)}`;
    if (!existingFingerprints.has(fp)) {
      await dbPut(STORE_NAMES.DRAMA_CANDIDATES, item);
      existingFingerprints.add(fp);
    }
  }
  return getDramaCandidates();
}

export async function updateDramaCandidate(candidate: DramaCandidatePlan): Promise<void> {
  await dbPut(STORE_NAMES.DRAMA_CANDIDATES, candidate);
}

export async function deleteDramaCandidate(id: string): Promise<void> {
  await dbDelete(STORE_NAMES.DRAMA_CANDIDATES, id);
}


