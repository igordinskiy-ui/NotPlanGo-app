import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import "./styles.css";

type Tab = "today" | "week" | "habits" | "settings";
type TaskPriority = "low" | "normal" | "high";
type TaskRepeat = "none" | "daily" | "weekly";
type Task = { id: string; title: string; done: boolean; priority: TaskPriority; repeat: TaskRepeat; createdAt: string; updatedAt: string };
type WeekGoal = { id: string; title: string; done: boolean };
type Habit = { id: string; title: string; completions: Record<string, boolean> };
type DayLog = { sleep: number; energy: number; mood: number; summary: string };
type PlannerSettings = { startMode: "demo" | "empty"; weeklyExportReminder: boolean };
type PlannerBackup = { id: string; createdAt: string; label: string; data: string };

type PlannerState = {
  version: 3;
  activeWeekStart: string;
  weeklyGoals: Record<string, WeekGoal[]>;
  tasks: Record<string, Task[]>;
  habits: Habit[];
  dayLogs: Record<string, DayLog>;
  settings: PlannerSettings;
  backups: PlannerBackup[];
};

type LegacyPlannerState = {
  version: 1 | 2;
  weekStart: string;
  activeWeekStart?: string;
  weeklyGoals: WeekGoal[];
  tasks: Record<string, Task[]>;
  habits: Habit[];
  dayLogs: Record<string, DayLog>;
};
type SavedPlannerState = {
  version?: number;
  weekStart?: string;
  activeWeekStart?: string;
  weeklyGoals?: WeekGoal[] | Record<string, WeekGoal[]>;
  tasks?: Record<string, Partial<Task>[]>;
  habits?: Habit[];
  dayLogs?: Record<string, DayLog>;
  settings?: Partial<PlannerSettings>;
  backups?: PlannerBackup[];
};

declare global {
  var notPlanGoRoot: Root | undefined;
}

const STORAGE_KEY = "notplango-state-v3";
const LEGACY_STORAGE_KEYS = ["notplango-state-v2", "notplango-state-v1"];
const AUTO_BACKUP_KEY = "notplango-auto-backup-v1";
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const fullDayNames = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const moods = ["туманно", "ровно", "собранно", "легко", "сильно"];
const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "легко" },
  { value: "normal", label: "обычно" },
  { value: "high", label: "важно" },
];
const repeatOptions: { value: TaskRepeat; label: string }[] = [
  { value: "none", label: "разово" },
  { value: "daily", label: "каждый день" },
  { value: "weekly", label: "еженедельно" },
];

const uid = () => crypto.randomUUID();
const toISO = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseISO = (iso: string) => new Date(`${iso}T12:00:00`);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nextPriority = (priority: TaskPriority) => priorityOptions[(priorityOptions.findIndex((option) => option.value === priority) + 1) % priorityOptions.length].value;
const nextRepeat = (repeat: TaskRepeat) => repeatOptions[(repeatOptions.findIndex((option) => option.value === repeat) + 1) % repeatOptions.length].value;
const addDays = (iso: string, amount: number) => {
  const date = parseISO(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
};

function getWeekStart(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return toISO(copy);
}

function getWeekDays(weekStart: string) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toISO(date);
  });
}

function defaultLog(): DayLog {
  return { sleep: 7, energy: 3, mood: 3, summary: "" };
}

function defaultSettings(): PlannerSettings {
  return { startMode: "demo", weeklyExportReminder: true };
}

function createTask(title: string, done = false, patch: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: patch.id ?? uid(),
    title,
    done,
    priority: patch.priority ?? "normal",
    repeat: patch.repeat ?? "none",
    createdAt: patch.createdAt ?? now,
    updatedAt: now,
  };
}

function normalizeTask(task: Partial<Task> & { id?: string; title?: string; done?: boolean }): Task {
  return createTask(task.title ?? "", Boolean(task.done), task);
}

function createWeekGoals(): WeekGoal[] {
  return [
    { id: uid(), title: "Привести финансы в порядок", done: true },
    { id: uid(), title: "Запустить спокойный рабочий ритм", done: false },
    { id: uid(), title: "Закрепить одну полезную привычку", done: false },
  ];
}

function createWeekTasks(weekStart: string) {
  const weekDays = getWeekDays(weekStart);
  const taskTemplates = [
    ["Сделать зарядку", "Проверить финансы", "Разобрать почту", "Созвон в 11:00", "20 минут чтения"],
    ["Выставить счет", "25 минут фокуса", "Забронировать стрижку", "Прогулка 20 минут"],
    ["Проверить дедлайны", "Позвонить родителям", "Убрать рабочий стол", "Залить фото в облако"],
    ["Проверить расходы", "Пополнить проездной", "Составить список покупок", "30 приседаний", "Написать 3 поста"],
    ["Закрыть мелкие хвосты", "Согласовать время встречи", "Купить продукты", "Проверить квартиру"],
    ["Генуборка 30-40 мин", "Закупить овощи/фрукты", "Позвонить бабушке", "Прогулка в парке"],
    ["План на неделю 15 мин", "Проверить календарь", "Подготовить одежду", "Ранний отбой"],
  ];

  return Object.fromEntries(
    weekDays.map((day, dayIndex) => [
      day,
        taskTemplates[dayIndex].map((title, taskIndex) =>
          createTask(title, taskIndex < Math.max(1, 4 - (dayIndex % 3)), {
            priority: taskIndex === 0 ? "high" : taskIndex > 2 ? "low" : "normal",
            repeat: taskIndex === 0 && dayIndex < 5 ? "daily" : "none",
          }),
        ),
    ]),
  );
}

function createEmptyWeekTasks(weekStart: string) {
  return Object.fromEntries(getWeekDays(weekStart).map((day) => [day, [] as Task[]]));
}

function createDemoState(weekStart = getWeekStart()): PlannerState {
  const weekDays = getWeekDays(weekStart);
  return {
    version: 3,
    activeWeekStart: weekStart,
    weeklyGoals: { [weekStart]: createWeekGoals() },
    tasks: createWeekTasks(weekStart),
    habits: ["Зарядка 10 мин", "Стакан воды утром", "Контрастный душ", "Прогулка", "Планирование дня"].map(
      (title, habitIndex) => ({
        id: uid(),
        title,
        completions: Object.fromEntries(weekDays.map((day, dayIndex) => [day, (dayIndex + habitIndex) % 3 !== 0])),
      }),
    ),
    dayLogs: Object.fromEntries(
      weekDays.map((day, index) => [
        day,
        {
          sleep: [8, 7, 6, 8, 7, 9, 8][index],
          energy: [4, 3, 4, 5, 3, 4, 5][index],
          mood: [4, 3, 4, 4, 3, 5, 5][index],
          summary: index === 0 ? "Не перегружать день и закрыть главное." : "",
        },
      ]),
    ),
    settings: defaultSettings(),
    backups: [],
  };
}

function createEmptyState(weekStart = getWeekStart()): PlannerState {
  return {
    version: 3,
    activeWeekStart: weekStart,
    weeklyGoals: { [weekStart]: [] },
    tasks: createEmptyWeekTasks(weekStart),
    habits: [],
    dayLogs: Object.fromEntries(getWeekDays(weekStart).map((day) => [day, defaultLog()])),
    settings: { ...defaultSettings(), startMode: "empty" },
    backups: [],
  };
}

function hasMojibake(value: unknown) {
  return typeof value === "string" && /Рџ|РЎ|Рќ|Р”|СЊ|вњ|Г—|�/.test(value);
}

function stateHasMojibake(state: PlannerState) {
  return JSON.stringify(state, (_key, value) => (hasMojibake(value) ? "__BROKEN__" : value)).includes("__BROKEN__");
}

function normalizeState(state: SavedPlannerState): PlannerState {
  const weekStart = state.activeWeekStart ?? state.weekStart ?? getWeekStart();
  const rawGoals = state.weeklyGoals;
  const weeklyGoals = Array.isArray(rawGoals) ? { [weekStart]: rawGoals } : rawGoals ?? { [weekStart]: [] };
  const tasks = Object.fromEntries(
    Object.entries(state.tasks ?? createEmptyWeekTasks(weekStart)).map(([day, tasksForDay]) => [
      day,
      (tasksForDay ?? []).map((task) => normalizeTask(task)),
    ]),
  );
  return {
    version: 3,
    activeWeekStart: weekStart,
    weeklyGoals,
    tasks,
    habits: state.habits ?? [],
    dayLogs: state.dayLogs ?? {},
    settings: { ...defaultSettings(), ...(state.settings ?? {}) },
    backups: state.backups ?? [],
  };
}

function loadState(): PlannerState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = normalizeState(JSON.parse(saved) as SavedPlannerState);
      if (!stateHasMojibake(parsed)) return parsed;
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const migrated = normalizeState(JSON.parse(legacy) as SavedPlannerState);
        if (!stateHasMojibake(migrated)) return migrated;
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return createDemoState();
}

function ensureCurrentWeek(state: PlannerState, weekStart: string): PlannerState {
  if (state.activeWeekStart === weekStart && state.weeklyGoals[weekStart]) return state;
  const previousWeekDays = getWeekDays(state.activeWeekStart);
  const nextWeekDays = getWeekDays(weekStart);
  const repeatedTasks = Object.fromEntries(nextWeekDays.map((day) => [day, [] as Task[]]));
  previousWeekDays.forEach((day, dayIndex) => {
    (state.tasks[day] ?? []).forEach((task) => {
      if (task.repeat === "daily") {
        nextWeekDays.forEach((nextDay) => repeatedTasks[nextDay].push(createTask(task.title, false, { priority: task.priority, repeat: task.repeat })));
      }
      if (task.repeat === "weekly" && nextWeekDays[dayIndex]) {
        repeatedTasks[nextWeekDays[dayIndex]].push(createTask(task.title, false, { priority: task.priority, repeat: task.repeat }));
      }
    });
  });
  return {
    ...state,
    activeWeekStart: weekStart,
    weeklyGoals: {
      ...state.weeklyGoals,
      [weekStart]: state.weeklyGoals[weekStart] ?? [],
    },
    tasks: { ...createEmptyWeekTasks(weekStart), ...repeatedTasks, ...state.tasks },
  };
}

function percent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function compactBackup(state: PlannerState, label = "Автобэкап"): PlannerBackup {
  const snapshot = { ...state, backups: [] };
  return { id: uid(), createdAt: new Date().toISOString(), label, data: JSON.stringify(snapshot) };
}

function saveIndexedSnapshot(state: PlannerState) {
  if (!("indexedDB" in window)) return;
  const request = indexedDB.open("notplango", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "id" });
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put({ id: "latest", createdAt: new Date().toISOString(), state });
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  };
}

function ProgressRing({ value, size = 112 }: { value: number; size?: number }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value, 0, 100) / 100) * circumference;

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ringTrack" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <motion.circle
          className="ringValue"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
        />
      </svg>
      <strong style={{ fontSize: size < 90 ? "0.78rem" : undefined }}>{value}%</strong>
    </div>
  );
}

function App() {
  const [state, setState] = useState<PlannerState>(() => ensureCurrentWeek(loadState(), getWeekStart()));
  const [tab, setTab] = useState<Tab>("today");
  const [toast, setToast] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ title: string; text: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const today = toISO(new Date());
  const weekStart = getWeekStart();
  const weekDays = useMemo(() => getWeekDays(state.activeWeekStart), [state.activeWeekStart]);
  const currentGoals = state.weeklyGoals[state.activeWeekStart] ?? [];

  useEffect(() => setState((current) => ensureCurrentWeek(current, weekStart)), [weekStart]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const backup = compactBackup(state);
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backup));
    saveIndexedSnapshot(state);
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (import.meta.env.DEV && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      return;
    }
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          const showUpdate = () => setToast("Доступна новая версия. Закройте и откройте приложение.");
          if (registration.waiting) showUpdate();
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
            });
          });
        })
        .catch(() => undefined);
    }
  }, []);

  const updateState = (updater: (draft: PlannerState) => PlannerState) => setState((current) => updater(current));
  const todayTasks = state.tasks[today] ?? [];
  const todayLog = state.dayLogs[today] ?? defaultLog();
  const todayProgress = percent(todayTasks.filter((task) => task.done).length, todayTasks.length);
  const weekTaskCount = weekDays.reduce((sum, day) => sum + (state.tasks[day]?.length ?? 0), 0);
  const weekDoneCount = weekDays.reduce((sum, day) => sum + (state.tasks[day]?.filter((task) => task.done).length ?? 0), 0);
  const habitDoneCount = state.habits.reduce((sum, habit) => sum + weekDays.filter((day) => habit.completions[day]).length, 0);
  const weekTaskProgress = percent(weekDoneCount, weekTaskCount);
  const weekHabitProgress = percent(habitDoneCount, state.habits.length * 7);
  const weekProgress = percent(weekDoneCount + habitDoneCount, weekTaskCount + state.habits.length * 7);
  const todayIndex = weekDays.indexOf(today);
  const overdueTasks = todayIndex <= 0 ? [] : weekDays
    .slice(0, todayIndex)
    .flatMap((day) => (state.tasks[day] ?? []).filter((task) => !task.done).map((task) => ({ day, task })));
  const askConfirm = (title: string, text: string, confirmLabel: string, onConfirm: () => void) =>
    setConfirmAction({ title, text, confirmLabel, onConfirm });

  const addTaskForDay = (day: string, title: string, toastText = "Задача добавлена") => {
    const clean = title.trim();
    if (!clean) return;
    updateState((current) => ({
      ...current,
      tasks: { ...current.tasks, [day]: [...(current.tasks[day] ?? []), createTask(clean)] },
    }));
    setToast(toastText);
  };

  const toggleTask = (day: string, id: string) => {
    updateState((current) => ({
      ...current,
      tasks: { ...current.tasks, [day]: (current.tasks[day] ?? []).map((task) => (task.id === id ? { ...task, done: !task.done } : task)) },
    }));
  };

  const deleteTask = (day: string, id: string) => {
    updateState((current) => ({
      ...current,
      tasks: { ...current.tasks, [day]: (current.tasks[day] ?? []).filter((task) => task.id !== id) },
    }));
    setToast("Задача удалена");
  };

  const renameTask = (day: string, id: string, title: string) => {
    updateState((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [day]: (current.tasks[day] ?? []).map((task) => (task.id === id ? { ...task, title, updatedAt: new Date().toISOString() } : task)),
      },
    }));
  };

  const updateTaskMeta = (day: string, id: string, patch: Partial<Pick<Task, "priority" | "repeat">>) => {
    updateState((current) => ({
      ...current,
      tasks: {
        ...current.tasks,
        [day]: (current.tasks[day] ?? []).map((task) => (task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task)),
      },
    }));
  };

  const moveTask = (fromDay: string, id: string, toDay: string) => {
    if (fromDay === toDay) return;
    updateState((current) => {
      const task = (current.tasks[fromDay] ?? []).find((item) => item.id === id);
      if (!task) return current;
      return {
        ...current,
        tasks: {
          ...current.tasks,
          [fromDay]: (current.tasks[fromDay] ?? []).filter((item) => item.id !== id),
          [toDay]: [...(current.tasks[toDay] ?? []), { ...task, updatedAt: new Date().toISOString() }],
        },
      };
    });
    setToast("Задача перенесена");
  };

  const addGoal = (title: string) => {
    const clean = title.trim();
    if (!clean) return;
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [current.activeWeekStart]: [...(current.weeklyGoals[current.activeWeekStart] ?? []), { id: uid(), title: clean, done: false }],
      },
    }));
  };

  const toggleGoal = (id: string) => {
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [current.activeWeekStart]: (current.weeklyGoals[current.activeWeekStart] ?? []).map((goal) =>
          goal.id === id ? { ...goal, done: !goal.done } : goal,
        ),
      },
    }));
  };

  const renameGoal = (id: string, title: string) => {
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [current.activeWeekStart]: (current.weeklyGoals[current.activeWeekStart] ?? []).map((goal) =>
          goal.id === id ? { ...goal, title } : goal,
        ),
      },
    }));
  };

  const deleteGoal = (id: string) => {
    askConfirm("Удалить цель?", "Цель исчезнет из текущей недели, остальные данные останутся.", "Удалить", () =>
      updateState((current) => ({
        ...current,
        weeklyGoals: {
          ...current.weeklyGoals,
          [current.activeWeekStart]: (current.weeklyGoals[current.activeWeekStart] ?? []).filter((goal) => goal.id !== id),
        },
      })),
    );
  };

  const toggleHabit = (habitId: string, day: string) => {
    updateState((current) => ({
      ...current,
      habits: current.habits.map((habit) =>
        habit.id === habitId ? { ...habit, completions: { ...habit.completions, [day]: !habit.completions[day] } } : habit,
      ),
    }));
  };

  const setLog = (patch: Partial<DayLog>) => {
    updateState((current) => ({ ...current, dayLogs: { ...current.dayLogs, [today]: { ...(current.dayLogs[today] ?? defaultLog()), ...patch } } }));
  };

  const addHabit = (title: string) => {
    const clean = title.trim();
    if (!clean) return;
    updateState((current) => ({ ...current, habits: [...current.habits, { id: uid(), title: clean, completions: {} }] }));
  };

  const renameHabit = (id: string, title: string) => {
    updateState((current) => ({ ...current, habits: current.habits.map((habit) => (habit.id === id ? { ...habit, title } : habit)) }));
  };

  const deleteHabit = (id: string) => {
    askConfirm("Удалить привычку?", "Отметки этой привычки за неделю тоже будут удалены.", "Удалить", () =>
      updateState((current) => ({ ...current, habits: current.habits.filter((habit) => habit.id !== id) })),
    );
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notplango-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("JSON экспортирован");
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as SavedPlannerState;
      const nextState = normalizeState(parsed);
      setState(ensureCurrentWeek(nextState, weekStart));
      setToast("Данные импортированы");
    } catch {
      setToast("Не удалось импортировать JSON");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const screenProps: ScreenProps = {
    state,
    today,
    weekDays,
    currentGoals,
    todayTasks,
    todayLog,
    todayProgress,
    weekProgress,
    weekTaskProgress,
    weekHabitProgress,
    overdueTasks,
    addTaskForDay,
    toggleTask,
    deleteTask,
    renameTask,
    updateTaskMeta,
    moveTask,
    addGoal,
    toggleGoal,
    renameGoal,
    deleteGoal,
    toggleHabit,
    setLog,
    addHabit,
    renameHabit,
    deleteHabit,
    resetDemo: () => {
      askConfirm("Вернуть демо?", "Текущие данные будут заменены. Перед этим лучше сделать экспорт JSON.", "Вернуть демо", () => {
        setState(createDemoState(weekStart));
        setToast("Демо-данные восстановлены");
      });
    },
    resetEmpty: () => {
      askConfirm("Начать с пустого планера?", "Все текущие данные будут очищены. Перед этим лучше сделать экспорт JSON.", "Очистить", () => {
        setState(createEmptyState(weekStart));
        setToast("Пустой планер готов");
      });
    },
    setStartMode: (startMode) => updateState((current) => ({ ...current, settings: { ...current.settings, startMode } })),
    exportJson,
    importJson,
    importInputRef,
  };

  return (
    <div className="appShell">
      <main className="phoneFrame">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {tab === "today" && <TodayScreen {...screenProps} />}
            {tab === "week" && <WeekScreen {...screenProps} />}
            {tab === "habits" && <HabitsScreen {...screenProps} />}
            {tab === "settings" && <SettingsScreen {...screenProps} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <motion.button className="floatingAddButton" whileTap={{ scale: 0.94 }} onClick={() => setAddSheetOpen(true)} aria-label="Добавить задачу">
        +
      </motion.button>
      <BottomNav active={tab} onChange={setTab} />
      <AnimatePresence>{toast && <motion.div className="toast">{toast}</motion.div>}</AnimatePresence>
      <AnimatePresence>
        {addSheetOpen && (
          <AddTaskSheet
            today={today}
            onCancel={() => setAddSheetOpen(false)}
            onAdd={(day, title) => {
              const label = day === today ? "Задача добавлена на сегодня" : day === addDays(today, 1) ? "Запланировано на завтра" : "Задача запланирована";
              addTaskForDay(day, title, label);
              setAddSheetOpen(false);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmAction && (
          <ConfirmSheet
            action={confirmAction}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              confirmAction.onConfirm();
              setConfirmAction(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

type ScreenProps = {
  state: PlannerState;
  today: string;
  weekDays: string[];
  currentGoals: WeekGoal[];
  todayTasks: Task[];
  todayLog: DayLog;
  todayProgress: number;
  weekProgress: number;
  weekTaskProgress: number;
  weekHabitProgress: number;
  overdueTasks: { day: string; task: Task }[];
  addTaskForDay: (day: string, title: string, toastText?: string) => void;
  toggleTask: (day: string, id: string) => void;
  deleteTask: (day: string, id: string) => void;
  renameTask: (day: string, id: string, title: string) => void;
  updateTaskMeta: (day: string, id: string, patch: Partial<Pick<Task, "priority" | "repeat">>) => void;
  moveTask: (fromDay: string, id: string, toDay: string) => void;
  addGoal: (title: string) => void;
  toggleGoal: (id: string) => void;
  renameGoal: (id: string, title: string) => void;
  deleteGoal: (id: string) => void;
  toggleHabit: (habitId: string, day: string) => void;
  setLog: (patch: Partial<DayLog>) => void;
  addHabit: (title: string) => void;
  renameHabit: (id: string, title: string) => void;
  deleteHabit: (id: string) => void;
  resetDemo: () => void;
  resetEmpty: () => void;
  setStartMode: (startMode: PlannerSettings["startMode"]) => void;
  exportJson: () => void;
  importJson: (file: File | undefined) => void;
  importInputRef: RefObject<HTMLInputElement | null>;
};

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="screenHeader">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
    </header>
  );
}

function TodayScreen(props: ScreenProps) {
  const date = parseISO(props.today);
  const dayIndex = (date.getDay() + 6) % 7;
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const todayHabits = props.state.habits;
  const openTasks = props.todayTasks.filter((task) => !task.done).length;

  return (
    <section className="screen">
      <Header eyebrow={fullDayNames[dayIndex]} title={formatter.format(date)} />
      <article className="heroCard">
        <div>
          <p className="muted">Фокус дня</p>
          <h2>{props.todayProgress === 100 ? "День закрыт" : "Спокойно закрываем главное"}</h2>
          <p>{openTasks === 0 ? "Все задачи закрыты" : `${openTasks} задач осталось`}</p>
        </div>
        <ProgressRing value={props.todayProgress} />
      </article>
      <article className="card">
        <div className="sectionTitle">
          <h2>Задачи</h2>
          <span>{props.todayTasks.length}</span>
        </div>
        <TaskList
          day={props.today}
          tasks={props.todayTasks}
          weekDays={props.weekDays}
          onToggle={props.toggleTask}
          onDelete={props.deleteTask}
          onRename={props.renameTask}
          onMeta={props.updateTaskMeta}
          onMove={props.moveTask}
        />
      </article>
      {props.overdueTasks.length > 0 && (
        <article className="card overdueCard">
          <div className="sectionTitle">
            <h2>Хвосты прошлых дней</h2>
            <span>{props.overdueTasks.length}</span>
          </div>
          <p className="cardHint">Сюда автоматически попадают незакрытые задачи с предыдущих дней этой недели. Добавлять отдельно не нужно.</p>
          <div className="taskList">
            {props.overdueTasks.map(({ day, task }) => (
              <div className="overdueItem" key={`${day}-${task.id}`}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{dayNames[props.weekDays.indexOf(day)] ?? day}</span>
                </div>
                <div className="overdueActions">
                  <button onClick={() => props.moveTask(day, task.id, props.today)}>Сегодня</button>
                  <button onClick={() => props.toggleTask(day, task.id)}>Готово</button>
                  <button className="plainDanger" onClick={() => props.deleteTask(day, task.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}
      <article className="card">
        <div className="sectionTitle">
          <h2>Привычки дня</h2>
          <span>{todayHabits.filter((habit) => habit.completions[props.today]).length}/{todayHabits.length}</span>
        </div>
        <div className="habitChips">
          {todayHabits.length === 0 ? (
            <EmptyState title="Привычек пока нет" text="Добавьте первую привычку в настройках." />
          ) : (
            todayHabits.map((habit) => (
              <motion.button whileTap={{ scale: 0.96 }} className={`habitChip ${habit.completions[props.today] ? "isDone" : ""}`} key={habit.id} onClick={() => props.toggleHabit(habit.id, props.today)}>
                <span>{habit.completions[props.today] ? "✓" : ""}</span>
                {habit.title}
              </motion.button>
            ))
          )}
        </div>
      </article>
      <article className="card">
        <div className="sectionTitle">
          <h2>Сон, энергия, настроение</h2>
        </div>
        <MetricControl label="Сон" value={props.todayLog.sleep} min={4} max={10} suffix="ч" onChange={(sleep) => props.setLog({ sleep })} />
        <MetricControl label="Энергия" value={props.todayLog.energy} min={1} max={5} suffix="/5" onChange={(energy) => props.setLog({ energy })} />
        <MetricControl label="Настроение" value={props.todayLog.mood} min={1} max={5} suffix="/5" onChange={(mood) => props.setLog({ mood })} />
        <div className="moodLine">{moods[props.todayLog.mood - 1]}</div>
      </article>
      <article className="card">
        <label className="summaryLabel" htmlFor="summary">Итог дня</label>
        <textarea id="summary" value={props.todayLog.summary} onChange={(event) => props.setLog({ summary: event.target.value })} placeholder="Что сегодня получилось? Что забрать в завтра?" />
      </article>
    </section>
  );
}

function WeekScreen(props: ScreenProps) {
  const [goalTitle, setGoalTitle] = useState("");
  const [selectedDay, setSelectedDay] = useState(props.today);
  const doneGoals = props.currentGoals.filter((goal) => goal.done).length;
  const selectedDayTasks = props.state.tasks[selectedDay] ?? [];
  const selectedDayIndex = props.weekDays.indexOf(selectedDay);
  const selectedDayLabel = selectedDayIndex >= 0 ? dayNames[selectedDayIndex] : "День";

  return (
    <section className="screen">
      <Header eyebrow="обзор" title="Неделя" />
      <article className="heroCard weekHero">
        <div>
          <p className="muted">Общий прогресс</p>
          <h2>{props.weekProgress}% недели</h2>
          <p>{doneGoals}/{props.currentGoals.length} целей отмечены</p>
          <div className="splitProgress">
            <span>Задачи {props.weekTaskProgress}%</span>
            <span>Привычки {props.weekHabitProgress}%</span>
          </div>
        </div>
        <ProgressRing value={props.weekProgress} />
      </article>
      <article className="card">
        <div className="sectionTitle">
          <h2>Цели недели</h2>
          <span>{props.currentGoals.length}</span>
        </div>
        <form
          className="addForm"
          onSubmit={(event) => {
            event.preventDefault();
            props.addGoal(goalTitle);
            setGoalTitle("");
          }}
        >
          <input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Добавить цель недели" />
          <button type="submit" aria-label="Добавить цель недели">+</button>
        </form>
        <div className="goals">
          {props.currentGoals.length === 0 ? (
            <EmptyState title="Целей пока нет" text="Добавьте 1-3 главных результата на неделю." />
          ) : (
            props.currentGoals.map((goal, index) => (
              <div className={`goalItem ${goal.done ? "isDone" : ""}`} key={goal.id}>
                <button onClick={() => props.toggleGoal(goal.id)} aria-label={`Отметить цель ${goal.title}`}>{goal.done ? "✓" : index + 1}</button>
                <input value={goal.title} onChange={(event) => props.renameGoal(goal.id, event.target.value)} aria-label="Название цели недели" />
                <button className="deleteButton" onClick={() => props.deleteGoal(goal.id)} aria-label={`Удалить ${goal.title}`}>×</button>
              </div>
            ))
          )}
        </div>
      </article>
      <div className="dayCards">
        {props.weekDays.map((day, index) => {
          const tasks = props.state.tasks[day] ?? [];
          const done = tasks.filter((task) => task.done).length;
          const value = percent(done, tasks.length);
          const isToday = day === props.today;
          const isSelected = day === selectedDay;
          return (
            <motion.button layout className={`dayCard ${isToday ? "isToday" : ""} ${isSelected ? "isSelected" : ""}`} key={day} onClick={() => setSelectedDay(day)}>
              <div className="dayCardTop">
                <div>
                  <span>{dayNames[index]}</span>
                  <strong>{parseISO(day).getDate()}</strong>
                </div>
                <ProgressRing value={value} size={74} />
              </div>
              <p>{done}/{tasks.length} задач</p>
              <div className="miniTasks">
                {tasks.length === 0 ? <span>Пока пусто</span> : tasks.slice(0, 3).map((task) => <span key={task.id} className={task.done ? "done" : ""}>{task.title}</span>)}
              </div>
            </motion.button>
          );
        })}
      </div>
      <article className="card">
        <div className="sectionTitle">
          <h2>План дня: {selectedDayLabel}</h2>
          <span>{selectedDayTasks.length}</span>
        </div>
        <p className="cardHint">Чтобы добавить задачу на выбранный или будущий день, используйте большую кнопку + у нижней навигации.</p>
        <TaskList
          day={selectedDay}
          tasks={selectedDayTasks}
          weekDays={props.weekDays}
          onToggle={props.toggleTask}
          onDelete={props.deleteTask}
          onRename={props.renameTask}
          onMeta={props.updateTaskMeta}
          onMove={props.moveTask}
        />
      </article>
      <article className="card ritualCard">
        <div className="sectionTitle">
          <h2>Ритуал недели</h2>
          <span>JSON</span>
        </div>
        <p>В конце недели сделайте ручной экспорт, чтобы данные не зависели только от браузера.</p>
        <button onClick={props.exportJson}>Экспорт JSON</button>
      </article>
      <article className="card">
        <div className="sectionTitle">
          <h2>История недель</h2>
          <span>{Object.keys(props.state.weeklyGoals).length}</span>
        </div>
        <div className="historyList">
          {Object.keys(props.state.weeklyGoals).sort().reverse().map((week) => (
            <div key={week}>
              <strong>{week}</strong>
              <span>{percent((props.state.weeklyGoals[week] ?? []).filter((goal) => goal.done).length, (props.state.weeklyGoals[week] ?? []).length)}% целей</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function HabitsScreen(props: ScreenProps) {
  return (
    <section className="screen">
      <Header eyebrow="ритм" title="Привычки" />
      <article className="heroCard compactHero">
        <div>
          <p className="muted">Трекер недели</p>
          <h2>{props.state.habits.length ? "Маленькие победы каждый день" : "Добавьте привычку"}</h2>
        </div>
      </article>
      <div className="habitList">
        {props.state.habits.length === 0 ? (
          <article className="card"><EmptyState title="Трекер пуст" text="В настройках можно добавить зарядку, воду, прогулку или любой свой ритуал." /></article>
        ) : (
          props.state.habits.map((habit) => {
            const done = props.weekDays.filter((day) => habit.completions[day]).length;
            return (
              <article className="card habitRow" key={habit.id}>
                <div className="habitRowHead">
                  <div>
                    <h2>{habit.title}</h2>
                    <p>{percent(done, 7)}% выполнения</p>
                  </div>
                  <strong>{done}/7</strong>
                </div>
                <div className="weekDots">
                  {props.weekDays.map((day, index) => (
                    <motion.button whileTap={{ scale: 0.9 }} className={habit.completions[day] ? "active" : ""} key={day} onClick={() => props.toggleHabit(habit.id, day)}>
                      <span>{dayNames[index]}</span>
                    </motion.button>
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function SettingsScreen(props: ScreenProps) {
  const [habitTitle, setHabitTitle] = useState("");
  const [query, setQuery] = useState("");
  const allTasks = props.weekDays.flatMap((day) => (props.state.tasks[day] ?? []).map((task) => ({ day, task })));
  const searchResults = query.trim()
    ? allTasks.filter(({ task }) => task.title.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const logs = props.weekDays.map((day) => props.state.dayLogs[day] ?? defaultLog());
  const avg = (values: number[]) => values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "0";
  const lastBackup = (() => {
    try {
      const saved = localStorage.getItem(AUTO_BACKUP_KEY);
      return saved ? (JSON.parse(saved) as PlannerBackup).createdAt : "";
    } catch {
      return "";
    }
  })();
  return (
    <section className="screen">
      <Header eyebrow="управление" title="Настройки" />
      <article className="card">
        <div className="sectionTitle"><h2>Привычки</h2></div>
        <form
          className="addForm"
          onSubmit={(event) => {
            event.preventDefault();
            props.addHabit(habitTitle);
            setHabitTitle("");
          }}
        >
          <input value={habitTitle} onChange={(event) => setHabitTitle(event.target.value)} placeholder="Новая привычка" />
          <button type="submit" aria-label="Добавить привычку">+</button>
        </form>
        <div className="settingsList">
          {props.state.habits.length === 0 ? (
            <EmptyState title="Список пуст" text="Добавьте привычки, которые хотите отмечать каждый день." />
          ) : (
            props.state.habits.map((habit) => (
              <div className="settingsHabit" key={habit.id}>
                <input value={habit.title} onChange={(event) => props.renameHabit(habit.id, event.target.value)} aria-label="Название привычки" />
                <button onClick={() => props.deleteHabit(habit.id)} aria-label={`Удалить ${habit.title}`}>×</button>
              </div>
            ))
          )}
        </div>
      </article>
      <article className="card">
        <div className="sectionTitle"><h2>Старт</h2></div>
        <div className="segmented">
          <button className={props.state.settings.startMode === "demo" ? "active" : ""} onClick={() => props.setStartMode("demo")}>Демо</button>
          <button className={props.state.settings.startMode === "empty" ? "active" : ""} onClick={() => props.setStartMode("empty")}>Пусто</button>
        </div>
        <button className="secondaryButton" onClick={props.resetEmpty}>Начать с пустого планера</button>
      </article>
      <article className="card">
        <div className="sectionTitle"><h2>Поиск</h2></div>
        <input className="searchInput" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти задачу" />
        <div className="searchResults">
          {query.trim() && searchResults.length === 0 ? (
            <EmptyState title="Ничего не найдено" text="Попробуйте другое слово из задачи." />
          ) : (
            searchResults.slice(0, 8).map(({ day, task }) => (
              <div key={`${day}-${task.id}`}>
                <span>{task.title}</span>
                <strong>{day}</strong>
              </div>
            ))
          )}
        </div>
      </article>
      <article className="card analyticsCard">
        <div className="sectionTitle"><h2>Аналитика недели</h2></div>
        <div className="statGrid">
          <div><span>Сон</span><strong>{avg(logs.map((log) => log.sleep))}ч</strong></div>
          <div><span>Энергия</span><strong>{avg(logs.map((log) => log.energy))}/5</strong></div>
          <div><span>Настроение</span><strong>{avg(logs.map((log) => log.mood))}/5</strong></div>
          <div><span>Привычки</span><strong>{props.weekHabitProgress}%</strong></div>
        </div>
      </article>
      <article className="card actionsCard">
        <div className="sectionTitle"><h2>Данные</h2></div>
        <button onClick={props.exportJson}>Экспорт JSON</button>
        <button className="secondaryButton" onClick={() => props.importInputRef.current?.click()}>Импорт JSON</button>
        <input ref={props.importInputRef} className="hiddenFileInput" type="file" accept="application/json,.json" onChange={(event) => props.importJson(event.target.files?.[0])} />
        <p className="backupNote">{lastBackup ? `Автобэкап: ${new Date(lastBackup).toLocaleString("ru-RU")}` : "Автобэкап появится после первого сохранения."}</p>
        <button className="secondaryButton dangerButton" onClick={props.resetDemo}>Очистить и вернуть демо</button>
      </article>
    </section>
  );
}

function TaskList({
  day,
  tasks,
  weekDays,
  onToggle,
  onDelete,
  onRename,
  onMeta,
  onMove,
}: {
  day: string;
  tasks: Task[];
  weekDays: string[];
  onToggle: (day: string, id: string) => void;
  onDelete: (day: string, id: string) => void;
  onRename: (day: string, id: string, title: string) => void;
  onMeta: (day: string, id: string, patch: Partial<Pick<Task, "priority" | "repeat">>) => void;
  onMove: (fromDay: string, id: string, toDay: string) => void;
}) {
  if (tasks.length === 0) return <EmptyState title="Задач пока нет" text="Добавьте одну понятную задачу." />;
  return (
    <div className="taskList">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} className={`taskItem ${task.done ? "isDone" : ""}`} key={task.id}>
            <motion.button whileTap={{ scale: 0.9 }} className="checkButton" onClick={() => onToggle(day, task.id)}>{task.done ? "✓" : ""}</motion.button>
            <div className="taskBody">
              <input value={task.title} onChange={(event) => onRename(day, task.id, event.target.value)} aria-label="Название задачи" />
              <div className="taskMeta">
                <button
                  type="button"
                  className={`metaChip priority-${task.priority}`}
                  onClick={() => onMeta(day, task.id, { priority: nextPriority(task.priority) })}
                  aria-label="Изменить приоритет"
                >
                  {priorityOptions.find((option) => option.value === task.priority)?.label}
                </button>
                <button
                  type="button"
                  className={`metaChip repeat-${task.repeat}`}
                  onClick={() => onMeta(day, task.id, { repeat: nextRepeat(task.repeat) })}
                  aria-label="Изменить повтор"
                >
                  {repeatOptions.find((option) => option.value === task.repeat)?.label}
                </button>
              </div>
              <div className="dayMoveRail" aria-label="Перенести задачу">
                {weekDays.map((weekDay, index) => (
                  <button
                    type="button"
                    className={weekDay === day ? "active" : ""}
                    onClick={() => onMove(day, task.id, weekDay)}
                    key={weekDay}
                    aria-label={`Перенести на ${dayNames[index]}`}
                  >
                    {dayNames[index]}
                  </button>
                ))}
              </div>
            </div>
            <button className="deleteButton" onClick={() => onDelete(day, task.id)} aria-label={`Удалить ${task.title}`}>×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ConfirmSheet({
  action,
  onCancel,
  onConfirm,
}: {
  action: { title: string; text: string; confirmLabel: string };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div className="confirmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="confirmSheet" initial={{ y: 32 }} animate={{ y: 0 }} exit={{ y: 32 }}>
        <h2>{action.title}</h2>
        <p>{action.text}</p>
        <div>
          <button className="secondaryButton" onClick={onCancel}>Отмена</button>
          <button className="dangerButton" onClick={onConfirm}>{action.confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddTaskSheet({
  today,
  onCancel,
  onAdd,
}: {
  today: string;
  onCancel: () => void;
  onAdd: (day: string, title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"today" | "tomorrow" | "custom">("today");
  const [customDate, setCustomDate] = useState(addDays(today, 2));
  const tomorrow = addDays(today, 1);
  const selectedDate = mode === "today" ? today : mode === "tomorrow" ? tomorrow : customDate;
  const selectedDateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short" }).format(parseISO(selectedDate));
  const canSubmit = title.trim().length > 0;

  return (
    <motion.div className="sheetOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="addTaskSheet"
        initial={{ y: 42 }}
        animate={{ y: 0 }}
        exit={{ y: 42 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onAdd(selectedDate, title);
        }}
      >
        <div className="sheetHandle" />
        <div className="sectionTitle">
          <h2>Новая задача</h2>
          <button type="button" className="sheetClose" onClick={onCancel} aria-label="Закрыть">×</button>
        </div>
        <input className="sheetTaskInput" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Что нужно сделать?" />
        <div className="dateQuickPick">
          <button type="button" className={mode === "today" ? "active" : ""} onClick={() => setMode("today")}>Сегодня</button>
          <button type="button" className={mode === "tomorrow" ? "active" : ""} onClick={() => setMode("tomorrow")}>Завтра</button>
          <button type="button" className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>Календарь</button>
        </div>
        {mode === "custom" && (
          <label className="dateField">
            <span>Дата</span>
            <input type="date" min={today} value={customDate} onChange={(event) => setCustomDate(event.target.value || today)} />
          </label>
        )}
        <div className="selectedDateLine">
          <span>Запланировать на</span>
          <strong>{selectedDateLabel}</strong>
        </div>
        <button type="submit" className="primarySheetButton" disabled={!canSubmit}>Добавить задачу</button>
      </motion.form>
    </motion.div>
  );
}

function MetricControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="metricControl">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: "today", label: "Сегодня", icon: "●" },
    { id: "week", label: "Неделя", icon: "◒" },
    { id: "habits", label: "Привычки", icon: "✓" },
    { id: "settings", label: "Настройки", icon: "⚙" },
  ];
  return (
    <nav className="bottomNav" aria-label="Основная навигация">
      {items.map((item) => (
        <button className={active === item.id ? "active" : ""} key={item.id} onClick={() => onChange(item.id)}>
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

const rootNode = document.getElementById("root")!;
const root = globalThis.notPlanGoRoot ?? createRoot(rootNode);
globalThis.notPlanGoRoot = root;
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
