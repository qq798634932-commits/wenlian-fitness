"use client";

import {
  ArrowRight,
  Barbell,
  BookOpen,
  CheckCircle,
  Info,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  PencilSimple,
  Target,
  UserCircle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  calculateBmi,
  DailyCheckIn,
  goalLabels,
  levelLabels,
  PersonalizedWorkout,
  targetLabels,
  TrainingGoal,
  TrainingLevel,
  TrainingProfile,
  TrainingTarget,
} from "./training-planner";
import { Workout } from "./workouts";

type CatalogExercise = {
  id: string;
  name: string;
  bodyPart: string;
  bodyPartEn: string;
  equipment: string;
  equipmentEn: string;
  target: string;
  targetEn: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  instruction: string;
  steps: string[];
  demo: string | null;
  attribution: string;
};

const bodyPartFilters = ["全部", "胸部", "背部", "肩部", "上臂", "大腿", "腰腹", "有氧"];

function ProfileSheet({
  profile,
  onClose,
  onSave,
}: {
  profile: TrainingProfile | null;
  onClose: () => void;
  onSave: (profile: TrainingProfile) => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [age, setAge] = useState(String(profile?.age ?? ""));
  const [height, setHeight] = useState(String(profile?.heightCm ?? ""));
  const [weight, setWeight] = useState(String(profile?.weightKg ?? ""));
  const [level, setLevel] = useState<TrainingLevel>(profile?.level ?? "beginner");
  const [goal, setGoal] = useState<TrainingGoal>(profile?.goal ?? "general");
  const [weeklyDays, setWeeklyDays] = useState<3 | 4>(profile?.weeklyDays ?? 3);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAge = Number(age);
    const nextHeight = Number(height);
    const nextWeight = Number(weight);
    if (nextAge < 16 || nextAge > 90 || nextHeight < 120 || nextHeight > 230 || nextWeight < 30 || nextWeight > 300) {
      setError("请检查年龄、身高和体重是否填写正确。");
      return;
    }
    onSave({
      name: name.trim() || "训练者",
      age: nextAge,
      heightCm: nextHeight,
      weightKg: nextWeight,
      level,
      goal,
      weeklyDays,
    });
    onClose();
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="install-sheet profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="icon-button profile-close" type="button" aria-label="关闭个人档案" onClick={onClose}><X size={22} /></button>
        <h2 id="profile-title">个人训练档案</h2>
        <p>这些数据只保存在当前设备，用于调整训练量，不会上传。</p>
        <form className="profile-form" onSubmit={submit}>
          <label className="profile-wide"><span>称呼</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 小天" /></label>
          <label><span>年龄</span><input type="number" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} placeholder="30" required /></label>
          <label><span>身高 cm</span><input type="number" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="175" required /></label>
          <label><span>体重 kg</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="70" required /></label>
          <label><span>每周训练</span><select value={weeklyDays} onChange={(event) => setWeeklyDays(Number(event.target.value) as 3 | 4)}><option value="3">3 天</option><option value="4">4 天</option></select></label>
          <label className="profile-wide"><span>训练经验</span><select value={level} onChange={(event) => setLevel(event.target.value as TrainingLevel)}>{Object.entries(levelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="profile-wide"><span>当前目标</span><select value={goal} onChange={(event) => setGoal(event.target.value as TrainingGoal)}>{Object.entries(goalLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {error && <div className="planner-inline-error profile-wide" role="alert"><Warning size={17} />{error}</div>}
          <button className="primary-button profile-wide" type="submit">保存个人档案</button>
        </form>
      </section>
    </div>
  );
}

function ExerciseLibrary() {
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("全部");
  const [visibleCount, setVisibleCount] = useState(24);
  const [selected, setSelected] = useState<CatalogExercise | null>(null);

  useEffect(() => {
    fetch("data/exercises.zh.json")
      .then((response) => {
        if (!response.ok) throw new Error("load");
        return response.json();
      })
      .then((data: CatalogExercise[]) => setCatalog(data))
      .catch(() => setError("动作库载入失败，请联网刷新后重试。"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((exercise) => {
      if (bodyPart !== "全部" && exercise.bodyPart !== bodyPart) return false;
      if (!normalized) return true;
      return [exercise.name, exercise.bodyPart, exercise.equipment, exercise.target, exercise.instruction]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [bodyPart, catalog, query]);

  function changeQuery(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setVisibleCount(24);
  }

  return (
    <section className="exercise-library" aria-labelledby="exercise-library-title">
      <div className="library-intro">
        <div><span>完整动作库</span><h2 id="exercise-library-title">1324 个动作</h2><p>包含中文步骤、训练部位、器械和目标肌群。</p></div>
        <BookOpen size={34} weight="duotone" />
      </div>
      <label className="catalog-search"><MagnifyingGlass size={19} /><span className="sr-only">搜索动作</span><input value={query} onChange={changeQuery} placeholder="搜索英文动作名、器械或肌群" /></label>
      <div className="catalog-filters" aria-label="按部位筛选">
        {bodyPartFilters.map((item) => <button type="button" className={bodyPart === item ? "active" : ""} aria-pressed={bodyPart === item} onClick={() => { setBodyPart(item); setVisibleCount(24); }} key={item}>{item}</button>)}
      </div>
      {loading ? (
        <div className="catalog-loading" role="status"><span /><span /><span /><p>正在载入动作库</p></div>
      ) : error ? (
        <div className="catalog-message" role="alert"><Warning size={28} /><p>{error}</p></div>
      ) : filtered.length === 0 ? (
        <div className="catalog-message"><MagnifyingGlass size={28} /><p>没有找到匹配动作，试试部位或器械名称。</p></div>
      ) : (
        <>
          <div className="catalog-result-count">找到 {filtered.length} 个动作</div>
          <div className="catalog-grid">
            {filtered.slice(0, visibleCount).map((exercise) => (
              <button className="catalog-card" type="button" onClick={() => setSelected(exercise)} key={exercise.id}>
                {exercise.demo ? <img src={exercise.demo} alt="" width={90} height={90} loading="lazy" /> : <div className="catalog-placeholder"><Barbell size={23} weight="duotone" /></div>}
                <span><small>{exercise.bodyPart} / {exercise.target}</small><strong>{exercise.name}</strong><em>{exercise.equipment}</em></span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
          {visibleCount < filtered.length && <button className="catalog-more" type="button" onClick={() => setVisibleCount((count) => count + 24)}>继续加载</button>}
        </>
      )}
      <p className="catalog-license"><Info size={15} />动作数据为 MIT；演示媒体归 Gym Visual 所有，应用仅展示当前已发布的动作演示。</p>

      {selected && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <article className="install-sheet exercise-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="exercise-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <button className="icon-button profile-close" type="button" aria-label="关闭动作详情" onClick={() => setSelected(null)}><X size={22} /></button>
            {selected.demo ? <img src={selected.demo} alt={`${selected.name} 动作演示`} width={180} height={180} /> : <div className="detail-placeholder"><Barbell size={38} weight="duotone" /><span>文字动作说明</span></div>}
            <span>{selected.bodyPart} / {selected.target}</span>
            <h2 id="exercise-detail-title">{selected.name}</h2>
            <div className="exercise-facts"><span>器械<strong>{selected.equipment}</strong></span><span>主要肌群<strong>{selected.target}</strong></span></div>
            <ol>{selected.steps.map((step, index) => <li key={`${selected.id}-${index}`}><strong>{index + 1}</strong><span>{step}</span></li>)}</ol>
            {selected.demo && <a href="https://gymvisual.com/" target="_blank" rel="noreferrer">© Gym visual</a>}
          </article>
        </div>
      )}
    </section>
  );
}

export default function PersonalPlanner({
  profile,
  checkIns,
  workout,
  onSaveProfile,
  onGenerate,
  onStart,
}: {
  profile: TrainingProfile | null;
  checkIns: DailyCheckIn[];
  workout: PersonalizedWorkout | null;
  onSaveProfile: (profile: TrainingProfile) => void;
  onGenerate: (checkIn: DailyCheckIn) => void;
  onStart: (workout: Workout) => void;
}) {
  const [view, setView] = useState<"planner" | "library">("planner");
  const [profileOpen, setProfileOpen] = useState(false);
  const [target, setTarget] = useState<TrainingTarget>("chest");
  const [duration, setDuration] = useState<30 | 45 | 60 | 75>(45);
  const [weight, setWeight] = useState(String(profile?.weightKg ?? ""));
  const [sleep, setSleep] = useState("7");
  const [energy, setEnergy] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [soreness, setSoreness] = useState<0 | 1 | 2>(0);
  const [pain, setPain] = useState<"none" | "mild" | "sharp">("none");
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile && !weight) setWeight(String(profile.weightKg));
  }, [profile, weight]);

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      setProfileOpen(true);
      return;
    }
    if (pain === "sharp") {
      setError("出现锐痛时不生成负重计划。请停止相关训练，并根据情况咨询专业人员。");
      return;
    }
    const nextWeight = Number(weight);
    const sleepHours = Number(sleep);
    if (nextWeight < 30 || nextWeight > 300 || sleepHours < 0 || sleepHours > 16) {
      setError("请检查今日体重和睡眠时长。");
      return;
    }
    setError("");
    onGenerate({
      id: `${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      weightKg: nextWeight,
      sleepHours,
      energy,
      soreness,
      pain,
      target,
      durationMinutes: duration,
    });
  }

  const bmi = profile ? calculateBmi(profile) : null;

  return (
    <>
      <header className="page-heading planner-heading"><span>个人训练</span><h1>今天怎么练</h1><p>根据个人档案和今日恢复状态，生成可以直接执行的健身房方案。</p></header>
      <div className="planner-view-switch" aria-label="计划页面视图"><button type="button" className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}>今日方案</button><button type="button" className={view === "library" ? "active" : ""} onClick={() => setView("library")}>动作库</button></div>

      {view === "library" ? <ExerciseLibrary /> : (
        <>
          {profile ? (
            <section className="profile-summary" aria-label="个人训练档案">
              <div className="profile-title"><UserCircle size={30} weight="duotone" /><div><span>{profile.name}的档案</span><strong>{goalLabels[profile.goal]} / 每周 {profile.weeklyDays} 天</strong></div><button type="button" aria-label="编辑个人档案" onClick={() => setProfileOpen(true)}><PencilSimple size={18} /></button></div>
              <div className="profile-metrics"><span><strong>{profile.heightCm}</strong>cm</span><span><strong>{profile.weightKg}</strong>kg</span><span><strong>{bmi?.toFixed(1)}</strong>BMI 记录值</span></div>
            </section>
          ) : (
            <section className="profile-empty"><UserCircle size={37} weight="duotone" /><div><h2>先建立个人档案</h2><p>填写身高、体重、经验和目标后，才能调整训练量。</p></div><button type="button" onClick={() => setProfileOpen(true)}>开始填写</button></section>
          )}

          <form className="daily-checkin" onSubmit={generate}>
            <div className="planner-section-title"><div><span>今日状态</span><h2>选择训练重点</h2></div><Target size={27} weight="duotone" /></div>
            <div className="target-grid" aria-label="今日训练部位">{Object.entries(targetLabels).map(([value, label]) => <button type="button" className={target === value ? "active" : ""} aria-pressed={target === value} onClick={() => setTarget(value as TrainingTarget)} key={value}>{label}</button>)}</div>
            <div className="daily-fields">
              <label><span>今日体重 kg</span><input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} required /></label>
              <label><span><MoonStars size={16} />睡眠小时</span><input type="number" inputMode="decimal" step="0.5" value={sleep} onChange={(event) => setSleep(event.target.value)} required /></label>
            </div>
            <fieldset><legend><Lightning size={16} />精力状态</legend><div className="energy-selector">{([1, 2, 3, 4, 5] as const).map((value) => <button type="button" className={energy === value ? "active" : ""} aria-pressed={energy === value} onClick={() => setEnergy(value)} key={value}><strong>{value}</strong><span>{value === 1 ? "很低" : value === 3 ? "一般" : value === 5 ? "很好" : ""}</span></button>)}</div></fieldset>
            <div className="daily-fields">
              <label><span>肌肉酸痛</span><select value={soreness} onChange={(event) => setSoreness(Number(event.target.value) as 0 | 1 | 2)}><option value="0">没有</option><option value="1">轻微</option><option value="2">明显</option></select></label>
              <label><span>疼痛状态</span><select value={pain} onChange={(event) => setPain(event.target.value as "none" | "mild" | "sharp")}><option value="none">没有疼痛</option><option value="mild">轻微不适</option><option value="sharp">锐痛或麻木</option></select></label>
            </div>
            <fieldset><legend>可用时间</legend><div className="duration-selector">{([30, 45, 60, 75] as const).map((value) => <button type="button" className={duration === value ? "active" : ""} aria-pressed={duration === value} onClick={() => setDuration(value)} key={value}>{value} 分钟</button>)}</div></fieldset>
            {pain === "mild" && <div className="planner-caution"><Warning size={18} />轻微不适时会自动降低训练量。动作中不适加重就停止。</div>}
            {error && <div className="planner-inline-error" role="alert"><Warning size={18} />{error}</div>}
            <button className="primary-button generate-button" type="submit">分析并生成今日方案<ArrowRight size={20} weight="bold" /></button>
          </form>

          {workout && (
            <section className="generated-plan" aria-labelledby="generated-plan-title">
              <div className="generated-header"><div><span>{workout.readiness}</span><h2 id="generated-plan-title">{workout.title}</h2><p>{workout.duration} / {workout.effortGuide}</p></div><CheckCircle size={31} weight="duotone" /></div>
              <div className="analysis-list">{workout.analysis.map((item) => <p key={item}><Info size={16} />{item}</p>)}</div>
              <div className="generated-exercises">{workout.exercises.map((exercise, index) => <article key={exercise.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{exercise.name}</strong><small>{exercise.body}</small></div><em>{exercise.sets} 组<br />{exercise.reps}</em></article>)}</div>
              <button className="primary-button" type="button" onClick={() => onStart(workout)}>开始执行这套方案<ArrowRight size={20} weight="bold" /></button>
            </section>
          )}

          {checkIns.length > 0 && <section className="body-history"><div className="planner-section-title"><div><span>身体记录</span><h2>最近状态</h2></div></div><div>{checkIns.slice(0, 4).map((item) => <article key={item.id}><strong>{item.date.slice(5)}</strong><span>{item.weightKg} kg</span><span>睡眠 {item.sleepHours}h</span><span>精力 {item.energy}/5</span><em>{targetLabels[item.target]}</em></article>)}</div></section>}

          <aside className="planner-safety"><Warning size={22} weight="duotone" /><p>方案用于日常健身参考，不替代医疗评估。存在慢性病、心血管风险、孕期或术后恢复时，先咨询专业人员。</p></aside>
        </>
      )}

      {profileOpen && <ProfileSheet profile={profile} onClose={() => setProfileOpen(false)} onSave={onSaveProfile} />}
    </>
  );
}
