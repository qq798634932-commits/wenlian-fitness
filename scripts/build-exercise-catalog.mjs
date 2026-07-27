import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const bodyPartZh = {
  "upper arms": "上臂",
  "upper legs": "大腿",
  back: "背部",
  waist: "腰腹",
  chest: "胸部",
  shoulders: "肩部",
  "lower legs": "小腿",
  "lower arms": "前臂",
  cardio: "有氧",
  neck: "颈部",
};

const equipmentZh = {
  "body weight": "自重",
  dumbbell: "哑铃",
  cable: "绳索器械",
  barbell: "杠铃",
  "leverage machine": "杠杆式器械",
  band: "弹力带",
  "smith machine": "史密斯机",
  kettlebell: "壶铃",
  weighted: "负重",
  "stability ball": "瑞士球",
  "ez barbell": "EZ 曲杆",
  assisted: "辅助器械",
  "sled machine": "雪橇机",
  "medicine ball": "药球",
  rope: "训练绳",
  roller: "滚轴",
  "resistance band": "阻力带",
  "bosu ball": "BOSU 球",
  "olympic barbell": "奥运杠铃",
  "wheel roller": "健腹轮",
  "upper body ergometer": "上肢功率计",
  "skierg machine": "SkiErg 滑雪机",
  hammer: "大锤",
  "stationary bike": "动感单车",
  tire: "轮胎",
  "trap bar": "六角杠铃",
  "elliptical machine": "椭圆机",
  "stepmill machine": "登阶机",
};

const targetZh = {
  abs: "腹肌",
  pectorals: "胸肌",
  biceps: "肱二头肌",
  glutes: "臀肌",
  delts: "三角肌",
  triceps: "肱三头肌",
  "upper back": "上背",
  lats: "背阔肌",
  calves: "小腿肌群",
  quads: "股四头肌",
  forearms: "前臂肌群",
  "cardiovascular system": "心肺系统",
  hamstrings: "腿后侧肌群",
  spine: "脊柱周围肌群",
  traps: "斜方肌",
  adductors: "内收肌群",
  "serratus anterior": "前锯肌",
  abductors: "外展肌群",
  "levator scapulae": "肩胛提肌",
};

const sourcePath = new URL("../../exercises-dataset/data/exercises.json", import.meta.url);
const outputDirectory = new URL("../public/data/", import.meta.url);
const gifDirectory = new URL("../public/gifs/", import.meta.url);
const exercises = JSON.parse(await readFile(sourcePath, "utf8"));
const publishedGifs = new Set(await readdir(gifDirectory));

const compact = exercises.map((exercise) => {
  const gifName = basename(exercise.gif_url);
  return {
    id: String(exercise.id),
    name: exercise.name,
    bodyPart: bodyPartZh[exercise.body_part] ?? exercise.body_part,
    bodyPartEn: exercise.body_part,
    equipment: equipmentZh[exercise.equipment] ?? exercise.equipment,
    equipmentEn: exercise.equipment,
    target: targetZh[exercise.target] ?? exercise.target,
    targetEn: exercise.target,
    muscleGroup: exercise.muscle_group,
    secondaryMuscles: exercise.secondary_muscles ?? [],
    instruction: exercise.instructions?.zh ?? "",
    steps: exercise.instruction_steps?.zh ?? [],
    demo: publishedGifs.has(gifName) ? `gifs/${gifName}` : null,
    attribution: exercise.attribution,
  };
});

if (compact.length !== 1324) throw new Error(`动作数量异常：${compact.length}`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(fileURLToPath(outputDirectory), "exercises.zh.json"), JSON.stringify(compact));
console.log(`已生成 ${compact.length} 个动作。`);
