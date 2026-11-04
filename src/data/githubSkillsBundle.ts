import type { NovelSkill } from '../types';

/**
 * Legacy preset skill IDs from v1/v2 that must be completely purged from IndexedDB
 * and existing book settings per user instruction.
 */
export const LEGACY_DEPRECATED_SKILL_IDS: string[] = [
  'skill-anti-repetition',
  'skill-no-ai-style',
  'skill-no-negative-progressive',
  'skill-sensory-imagery',
  'skill-natural-dialogue',
  'skill-outline-tension',
  'skill-intimacy-tension',
];

/**
 * 6 Authentic Open-Source GitHub Engineering Skills implanted for Moying Studio:
 * 1. 大纲 skill: novel-creator-skill (leenbj/novel-creator-skill)
 * 2. 人设 skill: character-designer (zenstory-ai/oh-story-claudecode)
 * 3. 正文 skill: story-long-write (zenstory-ai/oh-story-claudecode)
 * 4. 记忆 skill: webnovel-write (lingfengqaq/webnovel-writer)
 * 5. 去味 skill: story-deslop (zenstory-ai/oh-story-claudecode + 腾讯朱雀过审协议)
 * 6. 审核 skill: story-review (zenstory-ai/oh-story-claudecode + 朱雀AIGC对抗审查)
 */
export const GITHUB_IMPLANTED_SKILLS: NovelSkill[] = [
  {
    id: 'skill-pkg-novel-creator-skill',
    slug: 'novel-creator-skill',
    name: '大纲架构 · novel-creator-skill',
    version: '1.2.0',
    description:
      '【GitHub: leenbj/novel-creator-skill】百万字长篇四层滚动拆纲、大纲锚点进度配额、反向刹车（Anti-Resolution）与改纲级联一致性技能。',
    promptInstruction: `【novel-creator-skill · 四层拆纲与长篇防崩铁律】
1. 四层逐级锚定（严禁跳层失控）：
   - L1 总纲：必须锁死核心读者契约（卖点承诺）、战力/社会顶层天花板与【最终结局锚点】，主线+感情/副线+悬疑暗线互为因果；
   - L2 分卷纲：每卷设定明确的【阶段核心目标】、【入卷起点状态 → 出卷终点状态反差】及 1/4、中点、3/4、卷末大高潮落点；
   - L3 剧情单元纲：每单元（4~12章）必须紧扣所属分卷目标不跑偏，相邻单元必须更换破局手段，收束时以未解代价或新线索引出下一单元；
   - L4 单章细纲：必须拆清【主角本章目标】、【核心阻力/反制】、【实质推进增量】与【章末悬念钩子】。
2. 单章推进配额红线（严禁剧情加速透支）：
   - 每章至多触发以下重大突破中的 1 项：A.主线核心矛盾实质破局 / B.核心人物关系决定性升级 / C.核心底牌秘密完整揭露。严禁一章打包写完三五章跨度！
3. 反向刹车（Anti-Resolution）：
   - 解决一个局部危机的同时，必须暴露出更深一层的代价、隐患或外部窥视，严禁在非终局章节写出“岁月静好、圆满落幕”的收尾腔。
4. 全要素强关联约束：
   - 任何剧情节点涉及的角色状态、关键道具流转（持有/消耗/易主）、伏笔埋设与回收必须保持严格因果闭环。`,
    ruleTier: 'contract',
    category: 'structure',
    scopes: ['outline', 'reroll'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '单章重大配额上限', medianTarget: '≤ 1项/章', note: '防长篇中期失速写崩' },
      { metric: '单元破局重复率', medianTarget: '0% 相邻雷同', note: '相邻剧情单元须切换破局机制' },
      { metric: '分卷起止状态反差', medianTarget: '身份/实力/关系≥2维跃迁', note: '锚定阶段获得感' },
    ],
    references: [
      {
        id: 'ref-ncs-anchor-quota',
        path: 'references/outline-anchor-quota-spec.md',
        title: '大纲锚点与进度配额规范',
        sizeBytes: 1420,
        routingTask: '大纲规划、细纲拆解与重掷走向控制',
        keywords: ['大纲', '细纲', '分卷', '单元', '节奏', '走向'],
        alwaysLoad: true,
        content: `## 大纲锚点与反向刹车契约 (novel-creator-skill)
1. **远粗近细滚动规划**：总纲锁死最终结局与核心母题；分卷纲定阶段目标；当前卷拆解为 4~12 章一组的「剧情单元纲」；仅对近期单元展开「单章细纲」，杜绝一次性硬排数百章流水账。
2. **松紧档位交错**：快档爆发章（打脸/反转/掉马，占卷内约15-20%）结束后，下一章必须安排中档推进或慢档余波（结算收益、暗流试探、关系升温），严禁连续3章高烈度轰炸导致读者审美疲劳。
3. **合理性五问核验**：每个剧情单元立项前必查——为什么是这个目标？为什么是现在爆发？为什么此前未被别人解决？主角凭什么不可替代地介入？世界规则与代价如何约束？`,
      },
      {
        id: 'ref-ncs-story-graph',
        path: 'references/story-graph-schema.md',
        title: '全设定知识图谱与改纲级联规范',
        sizeBytes: 1280,
        routingTask: '角色、关键道具、伏笔与剧情节点关联核验',
        keywords: ['伏笔', '道具', '信物', '关联', '设定', '校准', '核对'],
        alwaysLoad: false,
        content: `## 故事实体关联图谱 (Story Graph Schema)
- **节点强绑定**：所有「关键道具」必须明确当前持有者与使用限制；「伏笔」必须绑定埋设章、关联角色/道具及计划回收的剧情单元。
- **改纲级联更新**：当上游总纲或分卷目标调整时，必须向下游逐层核查剧情单元是否跑偏、单章阻力与钩子是否失效、道具持有链是否断裂。`,
      },
    ],
    rawSkillMd: `---
name: novel-creator-skill
display_name: "大纲架构 · novel-creator-skill"
version: 1.2.0
description: "百万字长篇四层滚动拆纲、大纲锚点进度配额、反向刹车与改纲级联一致性技能（源自 GitHub: leenbj/novel-creator-skill）"
category: structure
scopes: [outline, reroll]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# novel-creator-skill（长篇四层拆纲与图谱一致性技能）
遵循总纲定终局、分卷定阶段目标、剧情单元锁卷目标防跑偏、单章细纲明晰「主角目标+核心阻力+实质推进+章末钩子」的四层架构，严守单章推进配额与反向刹车铁律。`,
  },

  {
    id: 'skill-pkg-character-designer',
    slug: 'character-designer',
    name: '人设与台词 · character-designer',
    version: '1.1.0',
    description:
      '【GitHub: zenstory-ai/oh-story-claudecode】角色欲望动机链、反差人设、遮名可辨的差异化台词声线、潜台词博弈与角色知情权隔离技能。',
    promptInstruction: `【character-designer · 角色塑造与差异化声线契约】
1. 遮名可辨的语言指纹（严禁全员同质化腔调）：
   - 每个出场角色必须拥有独立的句长习惯、称呼方式、口癖与情绪失控反应（如上位者惜字如金习惯反问、市井人物多用具体俗语短句、克制者越愤怒越平淡简短）。遮住名字必须能一眼分辨说话人！
2. 潜台词与议程驱动对白：
   - 杜绝角色用舞台朗诵腔或心理分析长句直接把意图说透；对话必须服务于各自当下的隐秘诉求（试探、施压、转移视线、口是心非），多用动作停顿、答非所问或半截话承载张力。
3. 严守角色认知边界（反上帝视角红线）：
   - 角色只能根据自己亲眼所见、亲耳所闻或合理推理做出反应；幕后黑手暗中布置的阴谋或主角未在场的事件，主角严禁未卜先知脱口而出！
4. 配角功能性与反派智商在线：
   - 每个配角出场必须具备明确叙事功能与独立利益算盘，禁止全员沦为机械喊“震惊/不可能”的背景板；反派行动必须符合自身生存逻辑与动机链。`,
    ruleTier: 'contract',
    category: 'structure',
    scopes: ['outline', 'chapter', 'polish'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '台词遮名辨识度', medianTarget: '100% 区分核心角色', note: '句长、用词语域与潜台词分层' },
      { metric: '上帝视角穿帮率', medianTarget: '0 次越界', note: '严格隔离读者全知与角色限知' },
    ],
    references: [
      {
        id: 'ref-cd-dialogue',
        path: 'references/dialogue-mastery.md',
        title: '人物语言差异化与权力博弈对话',
        sizeBytes: 1560,
        routingTask: '撰写人物对手戏、试探交锋与日常对话',
        keywords: ['对话', '台词', '交锋', '谈判', '试探', '争执', '开口'],
        alwaysLoad: true,
        content: `## 人物语言差异化与潜台词准则 (character-designer)
1. **去掉多余对话标签**：普通对话直接用“说”或直接以动作承接裸对白，严禁密集堆砌“沉声道、冷笑道、淡淡道、带着一丝不易察觉的嘲讽说道”。
2. **权力高低决定话语形态**：高位者不解释、少用修饰词、直接定调或轻描淡写换话题；处于守势或心虚者才会急于找补、重复解释或拔高音量。
3. **生活化毛边**：真人在高压或日常说话会有停顿、改口、省略主语、顺手拿东西的错位动作，切忌写出工整如辩论稿的书面排比台词。`,
      },
      {
        id: 'ref-cd-basics',
        path: 'references/character-basics.md',
        title: '角色动机链、反差人设与关系张力',
        sizeBytes: 1320,
        routingTask: '立项建人设、新重要配角登场与反派塑造',
        keywords: ['人设', '主角', '配角', '反派', '动机', '性格', '关系'],
        alwaysLoad: false,
        content: `## 角色三维立体建模法则
- **外显标签 vs 内核底色反差**：表面越温和守礼，触碰逆鳞时越果决狠辣；表面越散漫爱财，大是大非处越有不肯退让的私心底线。
- **欲望→阻碍→执念行为**：人物的一切行动必须能从其核心匮乏与当下处境推导出来，拒绝为了推进大纲强行给角色降智。`,
      },
    ],
    rawSkillMd: `---
name: character-designer
display_name: "人设与台词 · character-designer"
version: 1.1.0
description: "角色设计与对话创作专家：负责角色档案、语言风格声线、动机链、潜台词博弈与知情边界隔离（源自 GitHub: zenstory-ai/oh-story-claudecode）"
category: structure
scopes: [outline, chapter, polish]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# character-designer（角色设计与对话声线专家）
确保遮住角色名仍能听出是谁在说话；严守角色认知边界杜绝上帝视角；赋予反派与重要配角真实利益动机链。`,
  },

  {
    id: 'skill-pkg-story-long-write',
    slug: 'story-long-write',
    name: '正文执笔 · story-long-write',
    version: '2.0.0',
    description:
      '【GitHub: zenstory-ai/oh-story-claudecode】长篇网文场景镜头叙事、五感具象锚点、句长突发度（Burstiness）控制与商业追读张力成文技能。',
    promptInstruction: `【story-long-write · 长篇场景成文与人类呼吸感铁律】
1. 摄像机贴身演进（Show, Don't Summarize）：
   - 严禁以提纲扩写腔概括剧情（如“两人经过一番激烈的交谈，最终达成了共识”）。必须落进具体的时空现场：交代器物材质、冷暖光线、环境杂音与人物具体肢体交互。
2. 句长参差与突发度设计（源头破除大模型匀速感，适配朱雀过审）：
   - 刻意拉开句长方差！在紧迫交锋或情绪顿挫处果断使用 2~6 字极短句、独词段；在氛围铺陈与动作连贯处使用自然顺承的散句，打破每句 20~30 字的工整机械节拍。
   - 允许合理的单句独立成段作为镜头切分，禁止每段都写成整齐划一的 3~4 行豆腐块。
3. 注入真实生活质感与感官毛边：
   - 写入与纯功能推进不完全绑定但极具现场感的细微真实触感（如茶垢边缘的涩味、潮湿衣领贴在后颈的凉意、旧木椅挪动时的吱呀声），彻底洗脱悬浮塑料感。
4. 严格执行本章细纲边界与章末断章拉力：
   - 紧扣本章【主角目标 → 遭遇具体阻力 → 博弈变招 → 结尾悬念钩子】推进，严禁提前泄底下一章内容，章末必须停在具体事件悬置、异常异动或关键一句台词落点上（严禁在章末写预告总结词！）。`,
    ruleTier: 'contract',
    category: 'style',
    scopes: ['chapter'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '句长标准差 (Burstiness)', medianTarget: 'σ ≥ 12.5 字', note: '长短句自然错落，高困惑度人类语感' },
      { metric: '单行镜头断段占比', medianTarget: '12% ~ 28%', note: '避免工整四行豆腐块段落' },
      { metric: '抽象情绪贴标签率', medianTarget: '0 处直白总结', note: '以器物交互与生理细节折射心理' },
    ],
    references: [
      {
        id: 'ref-slw-writing-craft',
        path: 'references/writing-craft.md',
        title: '长篇镜头叙事与感官落笔技法',
        sizeBytes: 1680,
        routingTask: '章节正文场景展开、动作衔接与心理外化',
        keywords: ['正文', '场景', '细节', '描写', '情绪', '氛围'],
        alwaysLoad: true,
        content: `## 长篇场景成文核心技法 (story-long-write)
1. **动作带出环境，不写孤立风景段**：不要先写一段200字静态天气环境再让人物出场；让风雪灌进领口、算盘珠子拨得噼啪响直接跟着人物动作发生。
2. **情绪外化三优先**：优先写「反常停顿/失手动作」（如倒茶溢出来却没察觉）> 其次写「视线落点转移」> 最后才写克制的内心一闪念，绝不写“他心中五味杂陈/涌起一股莫名的悲伤”。
3. **转场无缝桥接**：场景或时间切换时，用具体的物理诱因或上一场的尾音承接，严禁生硬写“与此同时”、“另一边”、“时间一晃来到了第二天”。`,
      },
      {
        id: 'ref-slw-combat-face',
        path: 'references/style-combat-face.md',
        title: '冲突交锋、爽点兑现与旁观视角烘托',
        sizeBytes: 1410,
        routingTask: '战斗对决、智斗博弈、打脸逆转或高潮对手戏',
        keywords: ['战斗', '出手', '杀', '对决', '打脸', '震惊', '底牌', '反转', '高潮'],
        alwaysLoad: false,
        content: `## 交锋与爽点兑现笔法
- **先抑足压迫感，再写破局细节**：阻力越具体、代价越真实，破局越爽；用环境破坏、对手反应错位与待遇前倨后恭来确认主角实力，绝不让主角自吹自擂。
- **动作链因果清晰**：招式或计谋交锋必须写清「起手诱饵 → 信息差误判 → 致命落点」，拒绝堆砌空洞光效形容词与监控式“抬手、转身、挥剑”清单。`,
      },
    ],
    rawSkillMd: `---
name: story-long-write
display_name: "正文执笔 · story-long-write"
version: 2.0.0
description: "长篇网文场景镜头叙事、五感具象锚点、句长突发度控制与追读张力成文技能（源自 GitHub: zenstory-ai/oh-story-claudecode）"
category: style
scopes: [chapter]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# story-long-write（长篇网文正文成文引擎）
以摄像机贴身感官叙事与高突发度长短句错落成文，严守章纲边界与章末自然事件钩子。`,
  },

  {
    id: 'skill-pkg-webnovel-write',
    slug: 'webnovel-write',
    name: '长线记忆 · webnovel-write',
    version: '1.4.0',
    description:
      '【GitHub: lingfengqaq/webnovel-writer】运行态长线记忆账本、主角与配角状态连续性、关键道具持有链与草蛇灰线伏笔回写协议。',
    promptInstruction: `【webnovel-write · 长篇运行态记忆与跨章连续性铁律】
1. 写前状态刚性核对（State Contract）：
   - 落笔前必须对齐上一章末尾的【停笔时空坐标（昼夜/地点/在场人物）】、【主角伤势/实力/情绪残留状态】与【当前随身持有关键道具清单】。严禁发生空间瞬移、伤势凭空痊愈或凭空掏出已遗失/损毁的道具！
2. 关键道具与能力冷却守恒：
   - 凡动用登记在册的关键道具、信物或金手指，必须严格遵守其作用规则、使用代价与当前持有者归属；若本章发生道具易主、消耗或损毁，必须写明清晰物理过程。
3. 草蛇灰线伏笔管理：
   - 对处于「已埋设 / 发酵推进中」的长线伏笔，仅在自然契机下做侧面映衬或草蛇灰线呼应；未到计划回收单元/章节时，严禁提前泄底揭穿终极谜底！
4. 反车轱辘话记忆去重：
   - 前文已交代清楚的世界观背景、人物过往恩怨或外貌定语，后续章节严禁再次大段复述科普，须直接以前置共识化入当下行动。`,
    ruleTier: 'contract',
    category: 'rule',
    scopes: ['chapter', 'reroll'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '跨章时空/伤势断层', medianTarget: '0 处吃书', note: '严丝合缝衔接上章停笔现场' },
      { metric: '道具持有链准确率', medianTarget: '100% 守恒', note: '禁止调用已损毁或他人持有道具' },
    ],
    references: [
      {
        id: 'ref-wnw-dataflow',
        path: 'references/system-data-flow.md',
        title: '章节硬性契约与状态机追踪协议',
        sizeBytes: 1490,
        routingTask: '跨章节记忆承接、多线轮转与状态一致性校验',
        keywords: ['记忆', '承接', '状态', '道具', '伤势', '突破', '线索'],
        alwaysLoad: true,
        content: `## 运行态记忆账本协议 (webnovel-write)
1. **三线轮转防单调 (Strand Tracker)**：长篇连载中兼顾 Quest（主线破局任务）、Fire（人物关系/情感拉扯）、Constellation（世界暗线/群像伏笔）的有机轮转，避免连续十章只有枯燥打怪或只有封闭室内聊天。
2. **首次登场 vs 再次登场纪律**：已建档角色再次出场时，直接抓其标志性动作或当下状态切入，禁止每次出场都重抄一遍五官身高履历。`,
      },
      {
        id: 'ref-wnw-foreshadow',
        path: 'references/foreshadowing-protocol.md',
        title: '草蛇灰线伏笔三阶段（埋设·发酵·回收）',
        sizeBytes: 1180,
        routingTask: '埋设新伏笔、中期暗线发酵与高潮回收',
        keywords: ['伏笔', '暗线', '真相', '秘密', '信物', '预言', '异常'],
        alwaysLoad: false,
        content: `## 伏笔工程学规范
- **埋设要“顺手自然”**：把关键线索藏在看似合理的日常器物或冲突副产物里，切忌敲锣打鼓写“他不知道这枚戒指日后会改变他的命运”。
- **长期伏笔必有中期回响**：跨度超过20章的伏笔，中间必须安排至少1次微小的侧面发酵，防止回收时显得像临时编造的机械降神。`,
      },
    ],
    rawSkillMd: `---
name: webnovel-write
display_name: "长线记忆 · webnovel-write"
version: 1.4.0
description: "运行态长线记忆账本、角色状态连续性、关键道具持有链与草蛇灰线伏笔协议（源自 GitHub: lingfengqaq/webnovel-writer）"
category: rule
scopes: [chapter, reroll]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# webnovel-write（长篇网文记忆与状态连续性引擎）
强制写前对齐时空坐标、角色状态与道具持有链，杜绝长篇吃书、道具穿帮与前文设定复读。`,
  },

  {
    id: 'skill-pkg-story-deslop',
    slug: 'story-deslop',
    name: '朱雀去味 · story-deslop',
    version: '2.1.0',
    description:
      '【GitHub: zenstory-ai/oh-story-claudecode + 腾讯朱雀过审强化】精准猎杀22类AI套路句式、高频套词与机械排比，重构困惑度与句法呼吸以稳定通过朱雀检测。',
    promptInstruction: `【story-deslop · 深度去AI味与腾讯朱雀过审硬性红线】
1. 绝对阻断的 7 类高危 AI 句法结构（0容忍，出现即违规）：
   - 严禁【否定纠正对比句】：“不是A，而是B”、“并非…而是…”、“没有X，没有Y，只是Z”、“不仅没有…反而…”；请删掉否定铺垫，直接写具体动作或真实状态！
   - 严禁【音量反差套路句】：“声音不大/不高，却带着不容置疑的力量/穿透力”、“语气平淡得像在说今天吃什么”。
   - 严禁【破折号解释成瘾】：单章破折号“——”严格控制在 ≤ 2 处，禁止用破折号强行拔高情绪或做总结解释。
   - 严禁【章尾预告/升华总结体】：章末绝不允许出现“没人知道…”、“属于他的风暴/反击才刚刚开始”、“命运的齿轮悄然转动”、“这一夜注定无眠”、“空气中弥漫着山雨欲来的气息”。
2. 腾讯朱雀检测高频 AI 黑名单词汇清零：
   - 严禁堆砌：瞳孔微缩/骤缩/地震、嘴角勾起一抹（弧度/冷笑/苦笑）、眼中闪过一丝（不易察觉的…）、指节泛白、深吸一口气、空气仿佛凝固、生人勿近的气息、莫名的情绪、取而代之的是、映入眼帘、不由自主、与此同时、事实上、显而易见、某种意义上。
   - 严禁【电报体微动作复读】：限制连续使用“了下 / 了一下”（如扯了下嘴角、顿了一下、挑了下眉），杜绝监控摄像头式的“抬手、转身、拿起、放下”无温度动作清单。
3. 过朱雀检测的人类语感替代法：
   - 打破平滑预测链（提升文本困惑度 Perplexity）：不用最顺滑的成语和万能套话，改用贴合人物身份的具体动词、生活化口语词、偶发的不对称短句与具象物象留白。`,
    ruleTier: 'contract',
    category: 'style',
    scopes: ['chapter', 'polish'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '朱雀模拟 AIGC 风险率', medianTarget: '< 20%（人类安全区）', note: '困惑度与句长方差达标' },
      { metric: '“不是…而是”否定翻转句', medianTarget: '0 处/章', note: 'AI 第一号句式指纹清零' },
      { metric: '破折号“——”密度', medianTarget: '≤ 0.6 处/千字', note: '杜绝翻译腔与总结腔破折号' },
      { metric: '套式生理反应词', medianTarget: '0 处成片堆叠', note: '清零瞳孔微缩/嘴角勾起一抹/闪过一丝' },
    ],
    references: [
      {
        id: 'ref-sd-banned-words',
        path: 'references/banned-words.md',
        title: 'AI 高频禁用词与套式反应黑名单',
        sizeBytes: 1850,
        routingTask: '正文执笔与段落去味精修全量排雷',
        keywords: ['精修', '去味', '润色', '朱雀', '修改', '正文'],
        alwaysLoad: true,
        content: `## 重点清剿的 AI 套词与机械模板 (story-deslop × 朱雀过审库)
- **弱化装饰废词**：一丝、一抹、些许、几分、微不可察、几不可闻、淡淡的、缓缓地（删去后句子反而更干脆有力）。
- **塑料五官零件体操**：瞳孔微缩、瞳孔地震、嘴角勾起一抹冷笑/弧度、眉峰微蹙、指节捏得泛白、喉结上下滚动、眼底闪过一丝精光/暗芒、敛去眼底情绪。
- **公文与论文过渡词**：与此同时、不仅如此、换言之、不难看出、事实上、这意味着、某种程度上、总而言之、取而代之的是。
- **廉价模板比喻**：如潮水般涌来、宛如一柄利剑、仿佛置身冰窖、像被无形的大手攥住心脏、眼里淬了毒。`,
      },
      {
        id: 'ref-sd-gates',
        path: 'references/deslop-gates.md',
        title: '朱雀过审句法熵增重构门禁',
        sizeBytes: 1360,
        routingTask: '降低AIGC检测率、消除机器工整感',
        keywords: ['检测', '过审', '朱雀', '句式', '排比', '工整'],
        alwaysLoad: true,
        content: `## 破除大模型统计指纹的三把手术刀
1. **砍掉对称排比与三连平行句**：AI 极爱写“A是…，B是…，C是…”或“既不…也不…”。一律拆成一长一短的不对称自然句，或直接删剩最有分量的一句。
2. **删掉段尾解释尾巴**：写完人物动作或台词就停笔！不要在后面补一句“显然，他已经猜到了对方的来意”或“这句话无异于平地惊雷”，把留白还给读者。
3. **口语真气替代书面连接词**：把“由于/因此/然而/尽管如此”换成自然的语气停顿、动作顺承，或用“偏偏、可、倒好、说白了、那又怎样”等活人语感衔接。`,
      },
    ],
    rawSkillMd: `---
name: story-deslop
display_name: "朱雀去味 · story-deslop"
version: 2.1.0
description: "猎杀22类AI套路句式与高频套词，重构文本困惑度与长短句突发度以稳定通过腾讯朱雀AIGC检测（源自 GitHub: zenstory-ai/oh-story-claudecode）"
category: style
scopes: [chapter, polish]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# story-deslop（深度去AI味与朱雀过审门禁）
零容忍清剿“不是…而是…”、音量反差腔、套式五官反应词与章尾预告体，重塑高方差真实人类文学语感。`,
  },

  {
    id: 'skill-pkg-story-review',
    slug: 'story-review',
    name: '对抗审核 · story-review',
    version: '1.3.0',
    description:
      '【GitHub: zenstory-ai/oh-story-claudecode】多视角对抗式审查（「审查是找问题，不是夸奖」），涵盖四层大纲对齐、知情权逻辑、道具伏笔核验与朱雀AIGC过审体检。',
    promptInstruction: `【story-review · 多视角对抗式审稿与自我纠偏铁律】
1. 核心审计准则：「审查是找漏洞与违和感，绝不是替初稿找借口圆场」。
2. 四维交叉对抗核验：
   - [架构视角 story-architect]：本章/本单元是否围绕分卷阶段目标推进？主角目标、实质阻力、章末钩子三要素是否齐全？是否存在原地水字数或过快透支后续大纲？
   - [人物视角 character-designer]：角色行为决策是否符合动机链？遮住名字台词是否串味？是否存在角色提前知晓未见情报的「上帝视角穿帮」？
   - [事实一致性 consistency-checker]：时间昼夜、空间位移、伤势体力、关键道具持有状态、前序伏笔细节是否与前文及设定台账 100% 吻合？
   - [朱雀过审视角 zhuque-detector]：是否存在 AI 套话残留、工整排比句、段尾解释腔或句长过于均匀导致的 AIGC 高危段落？
3. 最小无损修复原则：
   - 发现逻辑漏洞或 AI 腔时，直接定位具体原句并给出不破坏核心剧情走向的落地改法。`,
    ruleTier: 'contract',
    category: 'rule',
    scopes: ['outline', 'chapter', 'polish'],
    triggerMode: 'always',
    priority: 'high',
    enabled: true,
    isPreset: true,
    packageType: 'zip-package',
    qualityTargets: [
      { metric: '逻辑与知情权穿帮', medianTarget: '0 处遗漏', note: '严查跨场瞬移与未卜先知' },
      { metric: '四层大纲对齐度', medianTarget: '100% 紧扣卷/单元锚点', note: '杜绝中期支线跑偏' },
    ],
    references: [
      {
        id: 'ref-sr-logic',
        path: 'references/story-logic.md',
        title: '叙事因果链、时空衔接与信息差审查清单',
        sizeBytes: 1440,
        routingTask: '审查大纲连贯性与章节内在因果逻辑',
        keywords: ['审查', '审核', '逻辑', '漏洞', '核对', '纠错', '合理'],
        alwaysLoad: true,
        content: `## 故事成立条件与因果链核查 (story-review)
1. **动机与代价对等**：人物做出重大冒险决策，必须有足够紧迫的利益驱动或退无可退的外部逼迫。
2. **信息传递必有物理媒介**：A 角色得知 B 角色的秘密，必须经过窃听、信物破译、目击者转述或破绽推演，严禁跳过媒介直接让 A 在台词里点破。
3. **时空与资源闭环**：长途移动需要时间成本；重伤未愈不能下一场戏满血爆发；消耗型底牌用掉后必须从持有栏扣除。`,
      },
      {
        id: 'ref-sr-zhuque',
        path: 'references/zhuque-audit-rubric.md',
        title: '腾讯朱雀大模型检测过审判定准则',
        sizeBytes: 1290,
        routingTask: 'AIGC痕迹判别与人工质感验收',
        keywords: ['朱雀', 'AI味', '过审', '精修', '润色'],
        alwaysLoad: false,
        content: `## 朱雀大模型文本检测核心判据与反制验收
- **高危特征1（低困惑度平滑链）**：连续三句使用高频成语与标准因果关联词（因为…所以…然而…），一眼能猜出下半句。
- **高危特征2（等长子句韵律）**：全段逗号切分出的子句全部集中在 10~16 字之间，像节拍器一样机械。
- **验收标准**：改后文本必须具备长短错落的呼吸感、具体可触的生活器物锚点、不替读者做总结的冷峻留白，且零命中高危 AI 套词表。`,
      },
    ],
    rawSkillMd: `---
name: story-review
display_name: "对抗审核 · story-review"
version: 1.3.0
description: "多视角对抗式审查（架构节奏+人设知情权+道具伏笔一致性+朱雀AIGC过审检测）（源自 GitHub: zenstory-ai/oh-story-claudecode）"
category: rule
scopes: [outline, chapter, polish]
triggerMode: always
priority: high
ruleTier: contract
enabled: true
---

# story-review（四维对抗式小说审查与朱雀过审验收）
审查是找问题，不是验证正确性。同步核查结构跑偏、OOC与上帝视角、道具伏笔断链及朱雀AIGC统计指纹。`,
  },
];
