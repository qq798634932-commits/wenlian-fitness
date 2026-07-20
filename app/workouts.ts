export type Exercise = {
  id: string;
  name: string;
  body: string;
  sets: number;
  reps: string;
  gif?: string;
  tip: string;
  isTimed?: boolean;
};

export type Workout = {
  id: string;
  shortName: string;
  title: string;
  focus: string;
  schedule: string;
  duration: string;
  optional?: boolean;
  exercises: Exercise[];
};

export const workouts: Workout[] = [
  {
    id: "day-1",
    shortName: "第 1 天",
    title: "深蹲重点",
    focus: "股四头肌、臀、胸、上背",
    schedule: "建议周一",
    duration: "50-65 分钟",
    exercises: [
      {
        id: "0043",
        name: "杠铃全蹲",
        body: "大腿、臀",
        sets: 3,
        reps: "5-8 次",
        gif: "gifs/0043-qXTaZnJ.gif",
        tip: "膝盖与脚尖方向一致，躯干保持稳定。",
      },
      {
        id: "0025",
        name: "杠铃卧推",
        body: "胸、肱三头肌",
        sets: 3,
        reps: "6-10 次",
        gif: "gifs/0025-EIeI8Vf.gif",
        tip: "肩胛后缩下沉，双脚稳定踩地。",
      },
      {
        id: "0861",
        name: "绳索坐姿划船",
        body: "上背、肱二头肌",
        sets: 3,
        reps: "8-12 次",
        gif: "gifs/0861-fUBheHs.gif",
        tip: "先收肩胛，再把手柄拉向腹部。",
      },
      {
        id: "0334",
        name: "哑铃侧平举",
        body: "肩中束",
        sets: 2,
        reps: "12-15 次",
        gif: "gifs/0334-DsgkuIt.gif",
        tip: "用肩带动手臂，避免耸肩和借力。",
      },
      {
        id: "0175",
        name: "绳索跪姿卷腹",
        body: "核心",
        sets: 2,
        reps: "10-15 次",
        gif: "gifs/0175-WW95auq.gif",
        tip: "让胸骨靠近骨盆，不要只低头。",
      },
      {
        id: "1372",
        name: "杠铃站姿提踵",
        body: "小腿",
        sets: 2,
        reps: "12-20 次",
        gif: "gifs/1372-8ozhUIZ.gif",
        tip: "顶端停顿，下降到脚跟充分伸展。",
      },
    ],
  },
  {
    id: "day-2",
    shortName: "第 2 天",
    title: "髋铰链重点",
    focus: "臀、腿后侧、背、肩",
    schedule: "建议周三",
    duration: "50-65 分钟",
    exercises: [
      {
        id: "0085",
        name: "杠铃罗马尼亚硬拉",
        body: "臀、腿后侧",
        sets: 3,
        reps: "6-10 次",
        gif: "gifs/0085-wQ2c4XD.gif",
        tip: "髋部向后推，杠铃始终贴近腿部。",
      },
      {
        id: "2330",
        name: "绳索高位下拉",
        body: "背阔肌、肱二头肌",
        sets: 3,
        reps: "8-12 次",
        gif: "gifs/2330-LEprlgG.gif",
        tip: "胸口微抬，把肘向身体两侧下压。",
      },
      {
        id: "0405",
        name: "哑铃坐姿推举",
        body: "肩、肱三头肌",
        sets: 3,
        reps: "8-12 次",
        gif: "gifs/0405-znQUdHY.gif",
        tip: "收紧核心，避免腰部过度反弓。",
      },
      {
        id: "0381",
        name: "哑铃后撤弓步",
        body: "大腿、臀",
        sets: 2,
        reps: "每侧 8-12 次",
        gif: "gifs/0381-SSsBDwB.gif",
        tip: "后撤距离适中，前脚全脚掌发力。",
      },
      {
        id: "0031",
        name: "杠铃弯举",
        body: "肱二头肌",
        sets: 2,
        reps: "10-15 次",
        gif: "gifs/0031-25GPyDY.gif",
        tip: "肘部固定，避免身体前后摆动。",
      },
      {
        id: "0241",
        name: "V 把绳索下压",
        body: "肱三头肌",
        sets: 2,
        reps: "10-15 次",
        gif: "gifs/0241-gAwDzB3.gif",
        tip: "大臂贴近身体，底端完全伸直手肘。",
      },
    ],
  },
  {
    id: "day-3",
    shortName: "第 3 天",
    title: "综合容量",
    focus: "大腿、胸、背、腿后侧",
    schedule: "建议周五",
    duration: "55-70 分钟",
    exercises: [
      {
        id: "0739",
        name: "45° 腿举",
        body: "大腿、臀",
        sets: 3,
        reps: "10-15 次",
        gif: "gifs/0739-10Z2DXU.gif",
        tip: "腰背贴住靠垫，膝盖不要内扣。",
      },
      {
        id: "0314",
        name: "上斜哑铃卧推",
        body: "胸、肱三头肌",
        sets: 3,
        reps: "8-12 次",
        gif: "gifs/0314-ns0SIbU.gif",
        tip: "凳面角度保持较低，控制哑铃下降。",
      },
      {
        id: "0180",
        name: "绳索低位坐姿划船",
        body: "上背、肱二头肌",
        sets: 3,
        reps: "8-12 次",
        gif: "gifs/0180-hvV79Si.gif",
        tip: "保持胸口稳定，不要用腰部后仰借力。",
      },
      {
        id: "0586",
        name: "俯卧腿弯举",
        body: "腿后侧",
        sets: 3,
        reps: "10-15 次",
        gif: "gifs/0586-17lJ1kr.gif",
        tip: "髋部贴紧垫面，动作全程保持控制。",
      },
      {
        id: "0380",
        name: "哑铃后束侧平举",
        body: "肩后束、上背",
        sets: 2,
        reps: "12-15 次",
        gif: "gifs/0380-v1qBec9.gif",
        tip: "俯身后固定躯干，让肩后束主动发力。",
      },
      {
        id: "1391",
        name: "腿举机提踵",
        body: "小腿",
        sets: 2,
        reps: "12-20 次",
        gif: "gifs/1391-ykHcWme.gif",
        tip: "只移动脚踝，膝盖保持稳定。",
      },
      {
        id: "0630",
        name: "登山者",
        body: "心肺、核心",
        sets: 3,
        reps: "20-40 秒",
        gif: "gifs/0630-RJgzwny.gif",
        tip: "肩膀位于手腕上方，骨盆不要上下晃动。",
        isTimed: true,
      },
    ],
  },
  {
    id: "day-4",
    shortName: "可选第 4 天",
    title: "恢复与核心",
    focus: "轻心肺、核心、活动度",
    schedule: "周末或任意恢复日",
    duration: "30-40 分钟",
    optional: true,
    exercises: [
      {
        id: "cardio",
        name: "低强度有氧",
        body: "心肺恢复",
        sets: 1,
        reps: "20-30 分钟",
        tip: "选择单车、椭圆机或坡度走，保持能正常说话的强度。",
        isTimed: true,
      },
      {
        id: "0276",
        name: "死虫式",
        body: "核心",
        sets: 3,
        reps: "每侧 8-12 次",
        gif: "gifs/0276-iny3m5y.gif",
        tip: "下背贴地，四肢缓慢伸展。",
      },
      {
        id: "0872",
        name: "反向卷腹",
        body: "核心",
        sets: 3,
        reps: "10-15 次",
        gif: "gifs/0872-nCU1Ekp.gif",
        tip: "用腹部卷起骨盆，不要甩腿。",
      },
      {
        id: "1685",
        name: "深蹲向上伸展",
        body: "全身活动度",
        sets: 2,
        reps: "10-12 次",
        gif: "gifs/1685-QChZi3x.gif",
        tip: "保持动作流畅，以打开髋部和肩部为主。",
      },
      {
        id: "3699",
        name: "肩部交替触碰",
        body: "核心、肩",
        sets: 3,
        reps: "每侧 10-16 次",
        gif: "gifs/3699-yRpV5TC.gif",
        tip: "双脚稍分开，尽量减少骨盆旋转。",
      },
    ],
  },
];
