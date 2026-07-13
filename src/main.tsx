import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import "./styles.css";

export type Tab = "today" | "week" | "habits" | "settings";
type TaskPriority = "low" | "normal" | "high";
type TaskRepeat = "none" | "daily" | "weekly";
export type Task = { id: string; title: string; done: boolean; priority: TaskPriority; repeat: TaskRepeat; createdAt: string; updatedAt: string };
type WeekGoal = { id: string; title: string; done: boolean };
type Habit = { id: string; title: string; completions: Record<string, boolean> };
type DayLog = { sleep: number; energy: number; mood: number; summary: string };
type PlannerTheme = "olive" | "sage" | "mint" | "clay" | "terracotta" | "lavender" | "sky" | "graphite";
type ReminderWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PlannerNotificationPermission = NotificationPermission | "unsupported";
export type PlannerSettings = {
  startMode: "demo" | "empty";
  weeklyExportReminder: boolean;
  theme: PlannerTheme;
  lastExportAt: string;
  remindersEnabled: boolean;
  reminderDays: ReminderWeekday[];
  reminderTime: string;
  reminderLastDate: string;
  reviewReminderEnabled: boolean;
  reviewReminderTime: string;
  reviewReminderLastDate: string;
};
type PlannerBackup = { id: string; createdAt: string; label: string; data: string };
type StorageStatus = { usageLabel: string; quotaLabel: string; persisted: boolean | null; backupAt: string; backupAvailable: boolean };
export type PwaRuntimeStatus = {
  secureContext: boolean;
  standalone: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerControlled: boolean;
  online: boolean;
};
type DatedTask = { day: string; task: Task };
type SearchResult = { id: string; kind: "task" | "goal" | "summary" | "habit"; title: string; meta: string };
type ConfirmAction = { title: string; text: string; confirmLabel: string; onConfirm: () => void; secondaryLabel?: string; onSecondary?: () => void };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type PlannerDeepLink = { tab: Tab; focus: "summary" | ""; action: "snooze-reminders" | "" };
type PlannerNotificationAction = { action: string; title: string };
type ServiceWorkerNotificationOptions = NotificationOptions & { actions?: PlannerNotificationAction[] };

export type PlannerState = {
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
export type SavedPlannerState = {
  version?: number;
  weekStart?: string;
  activeWeekStart?: string;
  weeklyGoals?: WeekGoal[] | Record<string, unknown>;
  tasks?: Record<string, unknown>;
  habits?: unknown[];
  dayLogs?: Record<string, unknown>;
  settings?: Partial<PlannerSettings>;
  backups?: PlannerBackup[];
};

declare global {
  var notPlanGoRoot: Root | undefined;
}

const STORAGE_KEY = "notplango-state-v3";
const LEGACY_STORAGE_KEYS = ["notplango-state-v2", "notplango-state-v1"];
const AUTO_BACKUP_KEY = "notplango-auto-backup-v1";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const reminderWeekdays: ReminderWeekday[] = [1, 2, 3, 4, 5, 6, 7];
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
export const themePresets: { id: PlannerTheme; title: string; hint: string; swatches: string[] }[] = [
  { id: "olive", title: "Олива", hint: "теплый базовый", swatches: ["#f4efe6", "#87915f", "#fffdfa"] },
  { id: "sage", title: "Шалфей", hint: "тихий зеленый", swatches: ["#eef2e8", "#6f8a67", "#fbfdf8"] },
  { id: "mint", title: "Мята", hint: "свежий светлый", swatches: ["#edf6f1", "#4f9b83", "#ffffff"] },
  { id: "clay", title: "Глина", hint: "мягкий земляной", swatches: ["#f5ece4", "#b57456", "#fffaf6"] },
  { id: "terracotta", title: "Терракота", hint: "теплый акцент", swatches: ["#f8eee8", "#c3664b", "#fffaf7"] },
  { id: "lavender", title: "Лаванда", hint: "спокойный вечер", swatches: ["#f1edf7", "#7b70a8", "#fdfbff"] },
  { id: "sky", title: "Небо", hint: "чистый воздух", swatches: ["#edf4f8", "#5489a6", "#fbfdff"] },
  { id: "graphite", title: "Графит", hint: "строгий контраст", swatches: ["#ecebe6", "#59615d", "#ffffff"] },
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
export const getThemeColor = (theme: PlannerTheme) => themePresets.find((preset) => preset.id === theme)?.swatches[1] ?? "#87915f";
export const isReminderTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const addDays = (iso: string, amount: number) => {
  const date = parseISO(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
};
export function getIsoWeekday(date: Date): ReminderWeekday {
  return (date.getDay() || 7) as ReminderWeekday;
}
export function normalizeReminderDays(value: unknown): ReminderWeekday[] {
  if (!Array.isArray(value)) return [...reminderWeekdays];
  const days = [...new Set(value.map(Number).filter((day): day is ReminderWeekday => reminderWeekdays.includes(day as ReminderWeekday)))].sort((left, right) => left - right);
  return days.length ? days : [...reminderWeekdays];
}
export function toggleReminderDay(days: ReminderWeekday[], day: ReminderWeekday) {
  const normalized = normalizeReminderDays(days);
  if (normalized.includes(day)) return normalized.length === 1 ? normalized : normalized.filter((item) => item !== day);
  return [...normalized, day].sort((left, right) => left - right);
}
export function shouldSendDailyReminder(now: Date, reminderTime: string, lastDate: string, activeDays: ReminderWeekday[] = reminderWeekdays) {
  if (!isReminderTime(reminderTime)) return false;
  if (!normalizeReminderDays(activeDays).includes(getIsoWeekday(now))) return false;
  const today = toISO(now);
  if (lastDate === today) return false;
  const [hours, minutes] = reminderTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return now >= target;
}

export function getNextReminderDelayMs(now: Date, reminderTime: string, lastDate: string, activeDays: ReminderWeekday[] = reminderWeekdays) {
  if (!isReminderTime(reminderTime)) return 0;
  if (shouldSendDailyReminder(now, reminderTime, lastDate, activeDays)) return 0;
  const normalizedDays = normalizeReminderDays(activeDays);
  const [hours, minutes] = reminderTime.split(":").map(Number);
  for (let offset = 0; offset <= 7; offset += 1) {
    const target = new Date(now);
    target.setDate(now.getDate() + offset);
    target.setHours(hours, minutes, 0, 0);
    if (!normalizedDays.includes(getIsoWeekday(target))) continue;
    if (target <= now || lastDate === toISO(target)) continue;
    return Math.max(0, target.getTime() - now.getTime());
  }
  return 0;
}
export function getReminderLastDateAfterEnable(now: Date, reminderTime: string, activeDays: ReminderWeekday[] = reminderWeekdays) {
  return shouldSendDailyReminder(now, reminderTime, "", activeDays) ? toISO(now) : "";
}
export function getReminderLastDateAfterTimeChange(lastDate: string, reminderTime: string, now = new Date()) {
  if (!isReminderTime(reminderTime) || lastDate !== toISO(now)) return lastDate;
  const [hours, minutes] = reminderTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return target > now ? "" : lastDate;
}
export function formatRuCount(count: number, forms: [string, string, string]) {
  const absCount = Math.abs(count);
  const lastTwo = absCount % 100;
  const lastOne = absCount % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} ${forms[2]}`;
  if (lastOne === 1) return `${count} ${forms[0]}`;
  if (lastOne >= 2 && lastOne <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}
export function buildDailyReminderBody(state: PlannerState, day: string) {
  const openTasks = (state.tasks[day] ?? []).filter((task) => !task.done).length;
  const openHabits = state.habits.filter((habit) => !habit.completions[day]).length;
  if (openTasks === 0 && openHabits === 0) return "Все на сегодня закрыто. Можно оставить короткий итог дня.";
  const parts = [];
  if (openTasks > 0) parts.push(formatRuCount(openTasks, ["задача", "задачи", "задач"]));
  if (openHabits > 0) parts.push(formatRuCount(openHabits, ["привычка", "привычки", "привычек"]));
  return `На сегодня осталось: ${parts.join(" и ")}.`;
}
export function buildReviewReminderBody(state: PlannerState, day: string) {
  const log = state.dayLogs[day] ?? defaultLog();
  const doneTasks = (state.tasks[day] ?? []).filter((task) => task.done).length;
  if (log.summary.trim()) return "Итог дня уже есть. Можно быстро проверить задачи и закрыть вечер.";
  if (doneTasks > 0) return `Закройте день: отметьте настроение и запишите итог после ${formatRuCount(doneTasks, ["закрытой задачи", "закрытых задач", "закрытых задач"])}.`;
  return "Закройте день: сон, энергия, настроение и короткий итог займут меньше минуты.";
}
export function shouldSkipReminderForDay(state: PlannerState, day: string, kind: "plan" | "review") {
  if (kind === "review") return Boolean((state.dayLogs[day] ?? defaultLog()).summary.trim());
  const tasks = state.tasks[day] ?? [];
  const hasPlannedItems = tasks.length > 0 || state.habits.length > 0;
  if (!hasPlannedItems) return false;
  const hasOpenTasks = tasks.some((task) => !task.done);
  const hasOpenHabits = state.habits.some((habit) => !habit.completions[day]);
  return !hasOpenTasks && !hasOpenHabits;
}
export function getNotificationPermissionCopy(permission: PlannerNotificationPermission, enabled: boolean) {
  if (permission === "unsupported") return { label: "недоступны", hint: "Этот браузер не поддерживает уведомления." };
  if (permission === "denied") return { label: "запрещены", hint: "Разрешите уведомления в настройках браузера или телефона." };
  if (permission === "granted") return { label: enabled ? "разрешены" : "разрешены", hint: enabled ? "Напоминания включены и работают локально на этом устройстве." : "Разрешение есть. Включите нужные напоминания ниже." };
  return { label: "нужно разрешение", hint: "При первом включении браузер попросит разрешить уведомления." };
}
export function getNextReminderSummary(settings: PlannerSettings, now = new Date()) {
  const reminders = [
    { title: "План дня", enabled: settings.remindersEnabled, time: settings.reminderTime, lastDate: settings.reminderLastDate },
    { title: "Итог дня", enabled: settings.reviewReminderEnabled, time: settings.reviewReminderTime, lastDate: settings.reviewReminderLastDate },
  ]
    .filter((reminder) => reminder.enabled && isReminderTime(reminder.time))
    .map((reminder) => ({
      ...reminder,
      at: new Date(now.getTime() + getNextReminderDelayMs(now, reminder.time, reminder.lastDate, settings.reminderDays)),
    }))
    .sort((left, right) => left.at.getTime() - right.at.getTime());
  const next = reminders[0];
  if (!next) return "Не запланировано";
  const day = toISO(next.at);
  const today = toISO(now);
  const dayLabel = day === today ? "сегодня" : day === addDays(today, 1) ? "завтра" : next.at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return `${next.title}: ${dayLabel} в ${next.time}`;
}
export function getReminderScheduleCopy(days: ReminderWeekday[]) {
  const normalized = normalizeReminderDays(days);
  if (normalized.length === 7) return "каждый день";
  if (normalized.join(",") === "1,2,3,4,5") return "по будням";
  if (normalized.join(",") === "6,7") return "по выходным";
  return normalized.map((day) => dayNames[day - 1]).join(", ");
}
export function snoozeRemindersForDate(settings: PlannerSettings, day: string) {
  return {
    ...settings,
    reminderLastDate: settings.remindersEnabled ? day : settings.reminderLastDate,
    reviewReminderLastDate: settings.reviewReminderEnabled ? day : settings.reviewReminderLastDate,
  };
}
export function parsePlannerDeepLink(search: string): PlannerDeepLink {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = params.get("tab");
  const focus = params.get("focus");
  const action = params.get("action");
  return {
    tab: tab === "week" || tab === "habits" || tab === "settings" ? tab : "today",
    focus: focus === "summary" ? "summary" : "",
    action: action === "snooze-reminders" ? "snooze-reminders" : "",
  };
}
export function getPwaReadinessItems(status: PwaRuntimeStatus) {
  return [
    {
      label: "Контекст",
      value: status.secureContext ? "готов" : "нужен HTTPS",
      ok: status.secureContext,
      hint: status.secureContext ? "PWA-функции доступны в защищенном контексте." : "Для установки на телефон нужен HTTPS-домен.",
    },
    {
      label: "Установка",
      value: status.standalone ? "открыто как PWA" : "в браузере",
      ok: status.standalone,
      hint: status.standalone ? "Приложение запущено с домашнего экрана." : "После деплоя установите NotPlanGo на экран телефона.",
    },
    {
      label: "Offline",
      value: status.serviceWorkerControlled ? "кэш активен" : status.serviceWorkerSupported ? "после перезапуска" : "недоступен",
      ok: status.serviceWorkerControlled,
      hint: status.serviceWorkerControlled ? "Service worker уже управляет страницей." : status.serviceWorkerSupported ? "Откройте приложение повторно после первого визита." : "Этот браузер не поддерживает service worker.",
    },
    {
      label: "Сеть",
      value: status.online ? "online" : "offline",
      ok: true,
      hint: status.online ? "Можно синхронизировать деплой и загрузить обновления." : "Локальные данные доступны без сети после первого визита.",
    },
  ];
}
export function getPwaInstallActionCopy(status: PwaRuntimeStatus, promptAvailable: boolean) {
  if (status.standalone) return { label: "Уже установлено", hint: "NotPlanGo открыт как приложение с домашнего экрана.", enabled: false };
  if (promptAvailable) return { label: "Установить PWA", hint: "Браузер готов показать системное окно установки.", enabled: true };
  return { label: "Установить через браузер", hint: "Android: меню браузера -> Установить приложение. iPhone: Поделиться -> На экран Домой.", enabled: false };
}
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function getWeekStart(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return toISO(copy);
}

export function getWeekDays(weekStart: string) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toISO(date);
  });
}

export function getSelectedWeekDay(today: string, weekDays: string[]) {
  return weekDays.includes(today) ? today : weekDays[0];
}

function defaultLog(): DayLog {
  return { sleep: 7, energy: 3, mood: 3, summary: "" };
}

function defaultSettings(): PlannerSettings {
  return {
    startMode: "demo",
    weeklyExportReminder: true,
    theme: "olive",
    lastExportAt: "",
    remindersEnabled: false,
    reminderDays: [...reminderWeekdays],
    reminderTime: "09:00",
    reminderLastDate: "",
    reviewReminderEnabled: false,
    reviewReminderTime: "21:30",
    reviewReminderLastDate: "",
  };
}

export function createTask(title: string, done = false, patch: Partial<Task> = {}): Task {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSavedPlannerState(value: unknown): value is SavedPlannerState {
  if (!isRecord(value)) return false;
  const tasks = value.tasks;
  const goals = value.weeklyGoals;
  if (tasks !== undefined && !isRecord(tasks)) return false;
  if (goals !== undefined && !Array.isArray(goals) && !isRecord(goals)) return false;
  if (value.habits !== undefined && !Array.isArray(value.habits)) return false;
  if (value.dayLogs !== undefined && !isRecord(value.dayLogs)) return false;
  return true;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? clamp(numberValue, min, max) : fallback;
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

export function createEmptyWeekTasks(weekStart: string) {
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

export function createEmptyState(weekStart = getWeekStart()): PlannerState {
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

function normalizeSettings(settings: unknown): PlannerSettings {
  const defaults = defaultSettings();
  if (!isRecord(settings)) return defaults;
  const startMode = settings.startMode === "empty" || settings.startMode === "demo" ? settings.startMode : defaults.startMode;
  const theme = themePresets.some((preset) => preset.id === settings.theme) ? settings.theme as PlannerTheme : defaults.theme;
  const lastExportAt = typeof settings.lastExportAt === "string" ? settings.lastExportAt : defaults.lastExportAt;
  const reminderDays = normalizeReminderDays(settings.reminderDays);
  const reminderTime = isReminderTime(settings.reminderTime) ? settings.reminderTime : defaults.reminderTime;
  const reminderLastDate = typeof settings.reminderLastDate === "string" ? settings.reminderLastDate : defaults.reminderLastDate;
  const reviewReminderTime = isReminderTime(settings.reviewReminderTime) ? settings.reviewReminderTime : defaults.reviewReminderTime;
  const reviewReminderLastDate = typeof settings.reviewReminderLastDate === "string" ? settings.reviewReminderLastDate : defaults.reviewReminderLastDate;
  return {
    startMode,
    weeklyExportReminder: Boolean(settings.weeklyExportReminder ?? defaults.weeklyExportReminder),
    theme,
    lastExportAt,
    remindersEnabled: Boolean(settings.remindersEnabled ?? defaults.remindersEnabled),
    reminderDays,
    reminderTime,
    reminderLastDate,
    reviewReminderEnabled: Boolean(settings.reviewReminderEnabled ?? defaults.reviewReminderEnabled),
    reviewReminderTime,
    reviewReminderLastDate,
  };
}

export function normalizeState(state: SavedPlannerState): PlannerState {
  const weekStart = state.activeWeekStart ?? state.weekStart ?? getWeekStart();
  const rawGoals = state.weeklyGoals;
  const weeklyGoals = Array.isArray(rawGoals)
    ? { [weekStart]: rawGoals.filter(isRecord).map((goal) => ({ id: String(goal.id ?? uid()), title: String(goal.title ?? ""), done: Boolean(goal.done) })) }
    : Object.fromEntries(
        Object.entries(isRecord(rawGoals) ? rawGoals : { [weekStart]: [] }).map(([week, goals]) => [
          week,
          Array.isArray(goals)
            ? goals.filter(isRecord).map((goal) => ({ id: String(goal.id ?? uid()), title: String(goal.title ?? ""), done: Boolean(goal.done) }))
            : [],
        ]),
      );
  const tasks = Object.fromEntries(
    Object.entries(isRecord(state.tasks) ? state.tasks : createEmptyWeekTasks(weekStart)).map(([day, tasksForDay]) => [
      day,
      Array.isArray(tasksForDay) ? tasksForDay.filter(isRecord).map((task) => normalizeTask(task)) : [],
    ]),
  );
  return {
    version: 3,
    activeWeekStart: weekStart,
    weeklyGoals,
    tasks,
    habits: Array.isArray(state.habits)
      ? state.habits.filter(isRecord).map((habit) => ({
          id: String(habit.id ?? uid()),
          title: String(habit.title ?? ""),
          completions: isRecord(habit.completions) ? Object.fromEntries(Object.entries(habit.completions).map(([day, done]) => [day, Boolean(done)])) : {},
        }))
      : [],
    dayLogs: Object.fromEntries(
      Object.entries(isRecord(state.dayLogs) ? state.dayLogs : {}).map(([day, log]) => [
        day,
        isRecord(log)
          ? {
              sleep: boundedNumber(log.sleep, 7, 4, 10),
              energy: boundedNumber(log.energy, 3, 1, 5),
              mood: boundedNumber(log.mood, 3, 1, 5),
              summary: String(log.summary ?? ""),
            }
          : defaultLog(),
      ]),
    ),
    settings: normalizeSettings(state.settings),
    backups: Array.isArray(state.backups)
      ? state.backups.filter(isRecord).map((backup) => ({
          id: String(backup.id ?? uid()),
          createdAt: String(backup.createdAt ?? new Date().toISOString()),
          label: String(backup.label ?? "Backup"),
          data: String(backup.data ?? ""),
        }))
      : [],
  };
}

function loadLocalState(): PlannerState | null {
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

  return null;
}

async function loadStoredState(): Promise<PlannerState | null> {
  const indexedState = await plannerStorage.loadLatestSnapshot();
  if (indexedState) return indexedState;
  return loadLocalState();
}

export function ensureCurrentWeek(state: PlannerState, weekStart: string): PlannerState {
  if (state.activeWeekStart === weekStart && state.weeklyGoals[weekStart]) return state;
  const previousWeekDays = getWeekDays(state.activeWeekStart);
  const nextWeekDays = getWeekDays(weekStart);
  const repeatedTasks = Object.fromEntries(nextWeekDays.map((day) => [day, [] as Task[]]));
  const dailyRepeats = new Map<string, Task>();
  const weeklyRepeatKeys = new Set<string>();
  previousWeekDays.forEach((day, dayIndex) => {
    (state.tasks[day] ?? []).forEach((task) => {
      if (task.repeat === "daily") {
        const key = `${task.title.trim().toLocaleLowerCase()}|${task.priority}`;
        if (task.title.trim() && !dailyRepeats.has(key)) dailyRepeats.set(key, task);
      }
      if (task.repeat === "weekly" && nextWeekDays[dayIndex]) {
        const key = `${dayIndex}|${task.title.trim().toLocaleLowerCase()}|${task.priority}`;
        if (task.title.trim() && !weeklyRepeatKeys.has(key)) {
          weeklyRepeatKeys.add(key);
          repeatedTasks[nextWeekDays[dayIndex]].push(createTask(task.title, false, { priority: task.priority, repeat: task.repeat }));
        }
      }
    });
  });
  dailyRepeats.forEach((task) => {
    nextWeekDays.forEach((nextDay) => repeatedTasks[nextDay].push(createTask(task.title, false, { priority: task.priority, repeat: task.repeat })));
  });
  const nextWeekTasks = Object.fromEntries(
    nextWeekDays.map((day) => {
      const existing = state.tasks[day] ?? [];
      const existingKeys = new Set(existing.map((task) => `${task.title.trim().toLocaleLowerCase()}|${task.priority}|${task.repeat}`));
      const repeats = repeatedTasks[day].filter((task) => !existingKeys.has(`${task.title.trim().toLocaleLowerCase()}|${task.priority}|${task.repeat}`));
      return [day, [...existing, ...repeats]];
    }),
  );
  return {
    ...state,
    activeWeekStart: weekStart,
    weeklyGoals: {
      ...state.weeklyGoals,
      [weekStart]: state.weeklyGoals[weekStart] ?? [],
    },
    tasks: { ...state.tasks, ...createEmptyWeekTasks(weekStart), ...nextWeekTasks },
  };
}

function percent(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function getUpcomingTasks(tasks: Record<string, Task[]>, weekDays: string[], limit = 8): DatedTask[] {
  return Object.entries(tasks)
    .filter(([day]) => day > weekDays[6])
    .sort(([first], [second]) => first.localeCompare(second))
    .flatMap(([day, tasksForDay]) => tasksForDay.map((task) => ({ day, task })))
    .slice(0, limit);
}

export function getUnfinishedTasksForDays(tasks: Record<string, Task[]>, days: string[]): DatedTask[] {
  return days.flatMap((day) => (tasks[day] ?? []).filter((task) => !task.done).map((task) => ({ day, task })));
}

export function moveUnfinishedTasksToDay(state: PlannerState, sourceDays: string[], targetDay: string, now = new Date().toISOString()) {
  const sourceSet = new Set(sourceDays.filter((day) => day !== targetDay));
  const moving = getUnfinishedTasksForDays(state.tasks, [...sourceSet]);
  if (moving.length === 0) return { state, moved: 0 };

  const movedTasks = moving.map(({ task }) => ({ ...task, done: false, updatedAt: now }));
  const nextTasks = Object.fromEntries(
    Object.entries(state.tasks).map(([day, tasksForDay]) => [
      day,
      sourceSet.has(day) ? tasksForDay.filter((task) => task.done) : tasksForDay,
    ]),
  );

  return {
    state: {
      ...state,
      tasks: {
        ...nextTasks,
        [targetDay]: [...(nextTasks[targetDay] ?? []), ...movedTasks],
      },
    },
    moved: movedTasks.length,
  };
}

export function searchPlannerState(state: PlannerState, query: string, limit = 12): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const matches = (value: string) => value.toLocaleLowerCase().includes(needle);
  const taskResults = Object.entries(state.tasks)
    .sort(([first], [second]) => first.localeCompare(second))
    .flatMap(([day, tasksForDay]) =>
      tasksForDay
        .filter((task) => matches(task.title))
        .map((task) => ({ id: `task-${day}-${task.id}`, kind: "task" as const, title: task.title, meta: `Задача · ${day}` })),
    );
  const goalResults = Object.entries(state.weeklyGoals)
    .sort(([first], [second]) => first.localeCompare(second))
    .flatMap(([week, goals]) =>
      goals
        .filter((goal) => matches(goal.title))
        .map((goal) => ({ id: `goal-${week}-${goal.id}`, kind: "goal" as const, title: goal.title, meta: `Цель · неделя ${week}` })),
    );
  const summaryResults = Object.entries(state.dayLogs)
    .sort(([first], [second]) => first.localeCompare(second))
    .filter(([, log]) => log.summary.trim() && matches(log.summary))
    .map(([day, log]) => ({ id: `summary-${day}`, kind: "summary" as const, title: log.summary, meta: `Итог дня · ${day}` }));
  const habitResults = state.habits
    .filter((habit) => matches(habit.title))
    .map((habit) => ({ id: `habit-${habit.id}`, kind: "habit" as const, title: habit.title, meta: "Привычка" }));

  return [...taskResults, ...goalResults, ...summaryResults, ...habitResults].slice(0, limit);
}

function markdownCheckbox(done: boolean) {
  return done ? "[x]" : "[ ]";
}

export function buildWeekMarkdown(state: PlannerState, weekStart: string) {
  const days = getWeekDays(weekStart);
  const goals = state.weeklyGoals[weekStart] ?? [];
  const lines = [
    `# NotPlanGo · неделя ${weekStart}`,
    "",
    "## Цели недели",
    ...(goals.length ? goals.map((goal) => `- ${markdownCheckbox(goal.done)} ${goal.title}`) : ["- Целей пока нет"]),
    "",
    "## Задачи",
  ];

  days.forEach((day, index) => {
    const tasks = state.tasks[day] ?? [];
    lines.push("", `### ${dayNames[index]} · ${day}`);
    lines.push(...(tasks.length ? tasks.map((task) => `- ${markdownCheckbox(task.done)} ${task.title}`) : ["- Задач нет"]));
  });

  lines.push("", "## Привычки");
  if (state.habits.length === 0) {
    lines.push("- Привычек пока нет");
  } else {
    state.habits.forEach((habit) => {
      const done = days.filter((day) => habit.completions[day]).length;
      lines.push(`- ${habit.title}: ${done}/7`);
    });
  }

  lines.push("", "## Итоги дня");
  days.forEach((day) => {
    const log = state.dayLogs[day];
    if (log?.summary.trim()) lines.push(`- ${day}: ${log.summary.trim()}`);
  });
  if (lines[lines.length - 1] === "## Итоги дня") lines.push("- Записей пока нет");

  return `${lines.join("\n")}\n`;
}

export function compactBackup(state: PlannerState, label = "Автобэкап"): PlannerBackup {
  const snapshot = { ...state, backups: [] };
  return { id: uid(), createdAt: new Date().toISOString(), label, data: JSON.stringify(snapshot) };
}

function saveIndexedSnapshot(state: PlannerState): Promise<void> {
  if (!("indexedDB" in window)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notplango", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "id" });
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").put({ id: "latest", createdAt: new Date().toISOString(), state });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB write failed"));
      };
    };
  });
}

function loadIndexedSnapshot(): Promise<PlannerState | null> {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open("notplango", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "id" });
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("snapshots", "readonly");
      const read = tx.objectStore("snapshots").get("latest");
      read.onerror = () => {
        db.close();
        resolve(null);
      };
      read.onsuccess = () => {
        db.close();
        const snapshot = isRecord(read.result) ? read.result.state : null;
        if (!isSavedPlannerState(snapshot)) {
          resolve(null);
          return;
        }
        try {
          const restored = normalizeState(snapshot);
          resolve(stateHasMojibake(restored) ? null : restored);
        } catch {
          resolve(null);
        }
      };
    };
  });
}

function loadAutoBackupCreatedAt() {
  try {
    const saved = localStorage.getItem(AUTO_BACKUP_KEY);
    return saved ? (JSON.parse(saved) as PlannerBackup).createdAt : "";
  } catch {
    return "";
  }
}

const plannerStorage = {
  loadState: loadStoredState,
  loadLatestSnapshot: loadIndexedSnapshot,
  latestBackupAt: loadAutoBackupCreatedAt,
  async saveState(state: PlannerState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const backup = compactBackup(state);
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backup));
    await saveIndexedSnapshot(state);
  },
  async getStatus(): Promise<StorageStatus> {
    const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = await navigator.storage?.persisted?.().catch(() => null);
    const backupAt = loadAutoBackupCreatedAt();
    const indexedBackup = await loadIndexedSnapshot();
    return {
      usageLabel: estimate?.usage !== undefined ? formatBytes(estimate.usage) : "неизвестно",
      quotaLabel: estimate?.quota !== undefined ? formatBytes(estimate.quota) : "неизвестно",
      persisted: persisted ?? null,
      backupAt,
      backupAvailable: Boolean(backupAt || indexedBackup),
    };
  },
};

async function getStorageStatus(): Promise<StorageStatus> {
  return plannerStorage.getStatus();
}

function getBrowserNotificationPermission(): PlannerNotificationPermission {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function getPwaRuntimeStatus(): PwaRuntimeStatus {
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return {
    secureContext: window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1",
    standalone: iosStandalone || displayStandalone,
    serviceWorkerSupported: "serviceWorker" in navigator,
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    online: navigator.onLine,
  };
}

async function showPlannerNotification(
  title: string,
  body: string,
  tag = "notplango-daily-reminder",
  url = "/",
  actions: PlannerNotificationAction[] = [],
  requestPermission = false,
) {
  try {
    if (!("Notification" in window)) return "unsupported" as const;
    const permission = Notification.permission === "granted"
      ? "granted"
      : requestPermission
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") return "denied" as const;

    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      if (registration?.showNotification) {
        const options: ServiceWorkerNotificationOptions = {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag,
          data: { url },
          actions,
        };
        await registration.showNotification(title, options);
        return "sent" as const;
      }
    }

    new Notification(title, { body, icon: "/icon-192.png", tag, data: { url } });
    return "sent" as const;
  } catch {
    return "failed" as const;
  }
}

const reminderNotificationActions: PlannerNotificationAction[] = [
  { action: "open", title: "Открыть" },
  { action: "snooze", title: "Не сегодня" },
];

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

function useVisualViewportInsets() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const updateViewportVars = () => {
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - viewportHeight - viewportTop);
      root.style.setProperty("--visual-viewport-height", `${viewportHeight}px`);
      root.style.setProperty("--visual-viewport-offset-top", `${viewportTop}px`);
      root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
    };

    updateViewportVars();
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", updateViewportVars);
    viewport?.addEventListener("resize", updateViewportVars);
    viewport?.addEventListener("scroll", updateViewportVars);

    return () => {
      window.removeEventListener("resize", updateViewportVars);
      window.removeEventListener("orientationchange", updateViewportVars);
      viewport?.removeEventListener("resize", updateViewportVars);
      viewport?.removeEventListener("scroll", updateViewportVars);
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--visual-viewport-offset-top");
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);
}

function App() {
  useVisualViewportInsets();

  const today = toISO(new Date());
  const weekStart = getWeekStart();
  const [state, setState] = useState<PlannerState>(() => createDemoState(weekStart));
  const [appReady, setAppReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [toast, setToast] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ usageLabel: "неизвестно", quotaLabel: "неизвестно", persisted: null, backupAt: "", backupAvailable: false });
  const [notificationPermission, setNotificationPermission] = useState<PlannerNotificationPermission>("unsupported");
  const [pwaStatus, setPwaStatus] = useState<PwaRuntimeStatus>(() => getPwaRuntimeStatus());
  const importInputRef = useRef<HTMLInputElement>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const deepLinkHandledRef = useRef(false);
  const [deepLinkFocus, setDeepLinkFocus] = useState<PlannerDeepLink["focus"]>("");
  const [viewWeekStart, setViewWeekStart] = useState(weekStart);
  const currentWeekDays = useMemo(() => getWeekDays(state.activeWeekStart), [state.activeWeekStart]);
  const weekDays = useMemo(() => getWeekDays(viewWeekStart), [viewWeekStart]);
  const currentGoals = state.weeklyGoals[viewWeekStart] ?? [];

  useEffect(() => {
    let cancelled = false;
    plannerStorage.loadState()
      .then((storedState) => {
        if (cancelled) return;
        if (storedState) {
          setState(ensureCurrentWeek(storedState, weekStart));
        } else {
          setNeedsOnboarding(true);
        }
        setAppReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setState(createDemoState(weekStart));
        setAppReady(true);
        setToast("Не удалось загрузить данные. Открыт демо-планер.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => setState((current) => ensureCurrentWeek(current, weekStart)), [weekStart]);
  useEffect(() => {
    refreshStorageStatus();
  }, []);
  useEffect(() => {
    if (!appReady || needsOnboarding) return;
    plannerStorage
      .saveState(state)
      .then(refreshStorageStatus)
      .catch(() => setToast("Данные не сохранились. Сделайте экспорт JSON."));
  }, [appReady, needsOnboarding, state]);
  useEffect(() => {
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", getThemeColor(state.settings.theme));
  }, [state.settings.theme]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const refreshNotificationPermission = () => setNotificationPermission(getBrowserNotificationPermission());
    refreshNotificationPermission();
    window.addEventListener("focus", refreshNotificationPermission);
    window.addEventListener("pageshow", refreshNotificationPermission);
    return () => {
      window.removeEventListener("focus", refreshNotificationPermission);
      window.removeEventListener("pageshow", refreshNotificationPermission);
    };
  }, []);
  useEffect(() => {
    if (!appReady || needsOnboarding || deepLinkHandledRef.current) return;
    const deepLink = parsePlannerDeepLink(window.location.search);
    deepLinkHandledRef.current = true;
    setTab(deepLink.tab);
    setDeepLinkFocus(deepLink.focus);
    if (deepLink.action === "snooze-reminders") {
      if (state.settings.remindersEnabled || state.settings.reviewReminderEnabled) {
        updateState((current) => ({ ...current, settings: snoozeRemindersForDate(current.settings, today) }));
        setToast("Напоминание отложено до завтра");
      } else {
        setToast("Напоминания уже выключены");
      }
    }
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }, [appReady, needsOnboarding, state.settings.remindersEnabled, state.settings.reviewReminderEnabled, today]);
  useEffect(() => {
    if (tab !== "today" || deepLinkFocus !== "summary") return;
    const id = window.setTimeout(() => {
      document.getElementById("summary")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("summary")?.focus();
      setDeepLinkFocus("");
    }, 260);
    return () => window.clearTimeout(id);
  }, [tab, deepLinkFocus]);
  useEffect(() => {
    const refreshPwaStatus = () => setPwaStatus(getPwaRuntimeStatus());
    refreshPwaStatus();
    window.addEventListener("online", refreshPwaStatus);
    window.addEventListener("offline", refreshPwaStatus);
    navigator.serviceWorker?.addEventListener("controllerchange", refreshPwaStatus);
    return () => {
      window.removeEventListener("online", refreshPwaStatus);
      window.removeEventListener("offline", refreshPwaStatus);
      navigator.serviceWorker?.removeEventListener("controllerchange", refreshPwaStatus);
    };
  }, []);
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setInstallPromptAvailable(true);
    };
    const handleAppInstalled = () => {
      installPromptRef.current = null;
      setInstallPromptAvailable(false);
      setPwaStatus(getPwaRuntimeStatus());
      setToast("NotPlanGo установлен как PWA");
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);
  useEffect(() => {
    if (!appReady || needsOnboarding) return;
    const reminderConfigs = [
      {
        enabled: state.settings.remindersEnabled,
        time: state.settings.reminderTime,
        lastDate: state.settings.reminderLastDate,
        days: state.settings.reminderDays,
        body: () => buildDailyReminderBody(state, toISO(new Date())),
        shouldSkip: () => shouldSkipReminderForDay(state, toISO(new Date()), "plan"),
        tag: "notplango-plan-reminder",
        url: "/?tab=today",
        markSent: () => updateState((current) => ({ ...current, settings: { ...current.settings, reminderLastDate: toISO(new Date()) } })),
      },
      {
        enabled: state.settings.reviewReminderEnabled,
        time: state.settings.reviewReminderTime,
        lastDate: state.settings.reviewReminderLastDate,
        days: state.settings.reminderDays,
        body: () => buildReviewReminderBody(state, toISO(new Date())),
        shouldSkip: () => shouldSkipReminderForDay(state, toISO(new Date()), "review"),
        tag: "notplango-review-reminder",
        url: "/?tab=today&focus=summary",
        markSent: () => updateState((current) => ({ ...current, settings: { ...current.settings, reviewReminderLastDate: toISO(new Date()) } })),
      },
    ].filter((config) => config.enabled);
    if (reminderConfigs.length === 0 || getBrowserNotificationPermission() !== "granted") return;
    let cancelled = false;
    let sending = false;
    let timeoutId = 0;

    const sendReminder = async () => {
      if (sending) return;
      sending = true;
      try {
        for (const config of reminderConfigs) {
          if (cancelled || !shouldSendDailyReminder(new Date(), config.time, config.lastDate, config.days)) continue;
          if (config.shouldSkip()) {
            config.markSent();
            continue;
          }
          const result = await showPlannerNotification("NotPlanGo", config.body(), config.tag, config.url, reminderNotificationActions);
          if (cancelled) return;
          if (result === "sent") {
            config.markSent();
          } else if (result === "denied") {
          updateState((current) => ({
            ...current,
            settings: { ...current.settings, remindersEnabled: false, reviewReminderEnabled: false },
          }));
          setToast("Уведомления запрещены в браузере");
          return;
        } else if (result === "failed") {
          setToast("Не удалось отправить уведомление");
          return;
        } else {
          setToast("Уведомления не поддерживаются");
          return;
        }
        }
      } finally {
        sending = false;
      }
    };

    const schedule = () => {
      window.clearTimeout(timeoutId);
      const nextDelay = Math.min(...reminderConfigs.map((config) => getNextReminderDelayMs(new Date(), config.time, config.lastDate, config.days)));
      timeoutId = window.setTimeout(sendReminder, Math.min(nextDelay, 2_147_483_647));
    };

    const checkVisible = () => {
      if (document.visibilityState === "visible") {
        void sendReminder();
        schedule();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", checkVisible);
    window.addEventListener("focus", checkVisible);
    window.addEventListener("pageshow", checkVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", checkVisible);
      window.removeEventListener("focus", checkVisible);
      window.removeEventListener("pageshow", checkVisible);
    };
  }, [
    appReady,
    needsOnboarding,
    state.tasks,
    state.habits,
    state.dayLogs,
    state.settings.remindersEnabled,
    state.settings.reminderDays,
    state.settings.reminderTime,
    state.settings.reminderLastDate,
    state.settings.reviewReminderEnabled,
    state.settings.reviewReminderTime,
    state.settings.reviewReminderLastDate,
    today,
  ]);
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
  const todayIndex = currentWeekDays.indexOf(today);
  const overdueTasks = todayIndex <= 0 ? [] : currentWeekDays
    .slice(0, todayIndex)
    .flatMap((day) => (state.tasks[day] ?? []).filter((task) => !task.done).map((task) => ({ day, task })));
  const upcomingTasks = getUpcomingTasks(state.tasks, weekDays);
  const viewedWeekUnfinishedTasks = getUnfinishedTasksForDays(state.tasks, weekDays);
  const askConfirm = (title: string, text: string, confirmLabel: string, onConfirm: () => void, secondary?: { label: string; onClick: () => void }) =>
    setConfirmAction({ title, text, confirmLabel, onConfirm, secondaryLabel: secondary?.label, onSecondary: secondary?.onClick });
  const refreshStorageStatus = () => getStorageStatus().then(setStorageStatus).catch(() => undefined);

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

  const moveViewedWeekUnfinishedToToday = () => {
    const count = getUnfinishedTasksForDays(state.tasks, weekDays).length;
    if (count === 0) {
      setToast("Незавершенных задач нет");
      return;
    }
    askConfirm(
      "Перенести хвосты в сегодня?",
      `${count} незавершенных задач из открытой недели будут перемещены в сегодняшний список.`,
      "Перенести",
      () => {
        updateState((current) => moveUnfinishedTasksToDay(current, weekDays, today).state);
        setViewWeekStart(state.activeWeekStart);
        setTab("today");
        setToast(`${count} задач перенесено в сегодня`);
      },
    );
  };

  const addGoal = (title: string, targetWeekStart = viewWeekStart) => {
    const clean = title.trim();
    if (!clean) return;
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [targetWeekStart]: [...(current.weeklyGoals[targetWeekStart] ?? []), { id: uid(), title: clean, done: false }],
      },
    }));
  };

  const toggleGoal = (id: string, targetWeekStart = viewWeekStart) => {
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [targetWeekStart]: (current.weeklyGoals[targetWeekStart] ?? []).map((goal) =>
          goal.id === id ? { ...goal, done: !goal.done } : goal,
        ),
      },
    }));
  };

  const renameGoal = (id: string, title: string, targetWeekStart = viewWeekStart) => {
    updateState((current) => ({
      ...current,
      weeklyGoals: {
        ...current.weeklyGoals,
        [targetWeekStart]: (current.weeklyGoals[targetWeekStart] ?? []).map((goal) =>
          goal.id === id ? { ...goal, title } : goal,
        ),
      },
    }));
  };

  const deleteGoal = (id: string, targetWeekStart = viewWeekStart) => {
    askConfirm("Удалить цель?", "Цель исчезнет из текущей недели, остальные данные останутся.", "Удалить", () =>
      updateState((current) => ({
        ...current,
        weeklyGoals: {
          ...current.weeklyGoals,
          [targetWeekStart]: (current.weeklyGoals[targetWeekStart] ?? []).filter((goal) => goal.id !== id),
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
    const exportedAt = new Date().toISOString();
    updateState((current) => ({ ...current, settings: { ...current.settings, lastExportAt: exportedAt } }));
    setToast("JSON экспортирован");
  };

  const exportWeekMarkdown = () => {
    const blob = new Blob([buildWeekMarkdown(state, viewWeekStart)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notplango-week-${viewWeekStart}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Неделя экспортирована в Markdown");
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        setToast("JSON слишком большой для импорта");
        return;
      }
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isSavedPlannerState(parsed)) {
        setToast("Файл не похож на экспорт NotPlanGo");
        return;
      }
      const nextState = normalizeState(parsed);
      setState(ensureCurrentWeek(nextState, weekStart));
      setToast("Данные импортированы");
    } catch {
      setToast("Не удалось импортировать JSON");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const requestPersistentStorage = async () => {
    if (!navigator.storage?.persist) {
      setToast("Браузер не поддерживает защиту хранилища");
      return;
    }
    const persisted = await navigator.storage.persist().catch(() => false);
    setToast(persisted ? "Хранилище защищено браузером" : "Браузер не дал постоянное хранилище");
    refreshStorageStatus();
  };

  const enableReminder = async (kind: "plan" | "review") => {
    const isReview = kind === "review";
    const result = await showPlannerNotification(
      "NotPlanGo",
      isReview ? "Вечерний ритуал включен. Напомним закрыть день." : "Уведомления включены. Напомним открыть планер.",
      isReview ? "notplango-review-reminder" : "notplango-plan-reminder",
      isReview ? "/?tab=today&focus=summary" : "/?tab=today",
      reminderNotificationActions,
      true,
    );
    setNotificationPermission(getBrowserNotificationPermission());
    if (result === "sent") {
      updateState((current) => ({
        ...current,
        settings: isReview
          ? {
              ...current.settings,
              reviewReminderEnabled: true,
              reviewReminderLastDate: getReminderLastDateAfterEnable(new Date(), current.settings.reviewReminderTime, current.settings.reminderDays),
            }
          : {
              ...current.settings,
              remindersEnabled: true,
              reminderLastDate: getReminderLastDateAfterEnable(new Date(), current.settings.reminderTime, current.settings.reminderDays),
            },
      }));
      setToast(isReview ? "Вечерний ритуал включен" : "Уведомления включены");
    } else if (result === "denied") {
      updateState((current) => ({ ...current, settings: { ...current.settings, remindersEnabled: false, reviewReminderEnabled: false } }));
      setToast("Уведомления запрещены в браузере");
    } else if (result === "failed") {
      setToast("Не удалось отправить уведомление");
    } else {
      setToast("Уведомления не поддерживаются");
    }
  };

  const setReminderEnabled = (enabled: boolean) => {
    if (enabled) {
      void enableReminder("plan");
      return;
    }
    updateState((current) => ({ ...current, settings: { ...current.settings, remindersEnabled: false } }));
    setToast("Уведомления выключены");
  };

  const setReviewReminderEnabled = (enabled: boolean) => {
    if (enabled) {
      void enableReminder("review");
      return;
    }
    updateState((current) => ({ ...current, settings: { ...current.settings, reviewReminderEnabled: false } }));
    setToast("Вечерний ритуал выключен");
  };

  const setReminderTime = (reminderTime: string) => {
    updateState((current) => {
      const nextTime = isReminderTime(reminderTime) ? reminderTime : current.settings.reminderTime;
      return {
        ...current,
        settings: {
          ...current.settings,
          reminderTime: nextTime,
          reminderLastDate: getReminderLastDateAfterTimeChange(current.settings.reminderLastDate, nextTime),
        },
      };
    });
  };

  const setReviewReminderTime = (reviewReminderTime: string) => {
    updateState((current) => {
      const nextTime = isReminderTime(reviewReminderTime) ? reviewReminderTime : current.settings.reviewReminderTime;
      return {
        ...current,
        settings: {
          ...current.settings,
          reviewReminderTime: nextTime,
          reviewReminderLastDate: getReminderLastDateAfterTimeChange(current.settings.reviewReminderLastDate, nextTime),
        },
      };
    });
  };

  const toggleReminderWeekday = (day: ReminderWeekday) => {
    updateState((current) => ({ ...current, settings: { ...current.settings, reminderDays: toggleReminderDay(current.settings.reminderDays, day) } }));
  };

  const applyReminderSnooze = (source: "manual" | "notification") => {
    if (!state.settings.remindersEnabled && !state.settings.reviewReminderEnabled) {
      setToast("Напоминания уже выключены");
      return;
    }
    updateState((current) => ({ ...current, settings: snoozeRemindersForDate(current.settings, today) }));
    setToast(source === "notification" ? "Напоминание отложено до завтра" : "Напоминания отложены до завтра");
  };

  const sendTestReminder = async (kind: "plan" | "review") => {
    const isReview = kind === "review";
    const result = await showPlannerNotification(
      "NotPlanGo",
      isReview ? buildReviewReminderBody(state, today) : buildDailyReminderBody(state, today),
      isReview ? "notplango-test-review-reminder" : "notplango-test-plan-reminder",
      isReview ? "/?tab=today&focus=summary" : "/?tab=today",
      reminderNotificationActions,
      true,
    );
    setNotificationPermission(getBrowserNotificationPermission());
    setToast(result === "sent" ? (isReview ? "Тест итога отправлен" : "Тест плана отправлен") : result === "denied" ? "Уведомления запрещены в браузере" : result === "failed" ? "Не удалось отправить уведомление" : "Уведомления не поддерживаются");
  };

  const snoozeRemindersToday = () => {
    applyReminderSnooze("manual");
  };

  const restoreLatestBackup = async () => {
    const snapshot = await plannerStorage.loadLatestSnapshot();
    if (!snapshot) {
      setToast("Локальный бэкап не найден");
      refreshStorageStatus();
      return;
    }
    askConfirm("Восстановить локальный бэкап?", "Текущее состояние будет заменено последним локальным снимком с этого устройства.", "Восстановить", () => {
      setState(ensureCurrentWeek(snapshot, weekStart));
      setToast("Бэкап восстановлен");
      refreshStorageStatus();
    });
  };

  const installPwa = async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) {
      setToast("Установите через меню браузера или Share на iPhone");
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => ({ outcome: "dismissed" as const, platform: "" }));
    installPromptRef.current = null;
    setInstallPromptAvailable(false);
    setPwaStatus(getPwaRuntimeStatus());
    setToast(choice.outcome === "accepted" ? "Установка PWA запущена" : "Установка отменена");
  };

  const screenProps: ScreenProps = {
    state,
    today,
    viewWeekStart,
    currentWeekStart: state.activeWeekStart,
    weekDays,
    currentGoals,
    todayTasks,
    todayLog,
    todayProgress,
    weekProgress,
    weekTaskProgress,
    weekHabitProgress,
    overdueTasks,
    upcomingTasks,
    viewedWeekUnfinishedTasks,
    addTaskForDay,
    toggleTask,
    deleteTask,
    renameTask,
    updateTaskMeta,
    moveTask,
    moveViewedWeekUnfinishedToToday,
    addGoal,
    toggleGoal,
    renameGoal,
    deleteGoal,
    showPreviousWeek: () => setViewWeekStart((current) => addDays(current, -7)),
    showNextWeek: () => setViewWeekStart((current) => addDays(current, 7)),
    showCurrentWeek: () => setViewWeekStart(state.activeWeekStart),
    toggleHabit,
    setLog,
    addHabit,
    renameHabit,
    deleteHabit,
    storageStatus,
    notificationPermission,
    pwaStatus,
    installPromptAvailable,
    refreshStorageStatus,
    requestPersistentStorage,
    restoreLatestBackup,
    installPwa,
    setReminderEnabled,
    setReminderTime,
    setReviewReminderEnabled,
    setReviewReminderTime,
    toggleReminderWeekday,
    sendTestReminder,
    snoozeRemindersToday,
    resetDemo: () => {
      askConfirm("Вернуть демо?", "Текущие данные будут заменены. Перед этим лучше сделать экспорт JSON.", "Вернуть демо", () => {
        setState(createDemoState(weekStart));
        setToast("Демо-данные восстановлены");
      }, { label: "Экспорт JSON", onClick: exportJson });
    },
    resetEmpty: () => {
      askConfirm("Начать с пустого планера?", "Все текущие данные будут очищены. Перед этим лучше сделать экспорт JSON.", "Очистить", () => {
        setState(createEmptyState(weekStart));
        setToast("Пустой планер готов");
      }, { label: "Экспорт JSON", onClick: exportJson });
    },
    setStartMode: (startMode) => updateState((current) => ({ ...current, settings: { ...current.settings, startMode } })),
    setTheme: (theme) => updateState((current) => ({ ...current, settings: { ...current.settings, theme } })),
    exportJson,
    exportWeekMarkdown,
    importJson,
    importInputRef,
  };

  const startWithDemo = () => {
    setState(createDemoState(weekStart));
    setNeedsOnboarding(false);
    setTab("today");
    setToast("Демо-планер готов");
  };

  const startEmpty = () => {
    setState(createEmptyState(weekStart));
    setNeedsOnboarding(false);
    setTab("today");
    setToast("Пустой планер готов");
  };

  return (
    <div className="appShell" data-theme={state.settings.theme}>
      <main className="phoneFrame">
        {!appReady ? (
          <section className="screen">
            <Header eyebrow="NotPlanGo" title="Загружаем планер" />
            <article className="card">
              <EmptyState title="Проверяем локальное хранилище" text="Сначала ищем основной снимок в IndexedDB, затем запасную копию в браузере." />
            </article>
          </section>
        ) : needsOnboarding ? (
          <OnboardingScreen onDemo={startWithDemo} onEmpty={startEmpty} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {tab === "today" && <TodayScreen {...screenProps} />}
              {tab === "week" && <WeekScreen {...screenProps} />}
              {tab === "habits" && <HabitsScreen {...screenProps} />}
              {tab === "settings" && <SettingsScreen {...screenProps} />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      {appReady && !needsOnboarding && (
        <motion.button className="floatingAddButton" whileTap={{ scale: 0.94 }} onClick={() => setAddSheetOpen(true)} aria-label="Добавить задачу">
          +
        </motion.button>
      )}
      {appReady && !needsOnboarding && <BottomNav active={tab} onChange={setTab} />}
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
            onSecondary={() => {
              confirmAction.onSecondary?.();
            }}
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
  viewWeekStart: string;
  currentWeekStart: string;
  weekDays: string[];
  currentGoals: WeekGoal[];
  todayTasks: Task[];
  todayLog: DayLog;
  todayProgress: number;
  weekProgress: number;
  weekTaskProgress: number;
  weekHabitProgress: number;
  overdueTasks: DatedTask[];
  upcomingTasks: DatedTask[];
  viewedWeekUnfinishedTasks: DatedTask[];
  addTaskForDay: (day: string, title: string, toastText?: string) => void;
  toggleTask: (day: string, id: string) => void;
  deleteTask: (day: string, id: string) => void;
  renameTask: (day: string, id: string, title: string) => void;
  updateTaskMeta: (day: string, id: string, patch: Partial<Pick<Task, "priority" | "repeat">>) => void;
  moveTask: (fromDay: string, id: string, toDay: string) => void;
  moveViewedWeekUnfinishedToToday: () => void;
  addGoal: (title: string, weekStart?: string) => void;
  toggleGoal: (id: string, weekStart?: string) => void;
  renameGoal: (id: string, title: string, weekStart?: string) => void;
  deleteGoal: (id: string, weekStart?: string) => void;
  showPreviousWeek: () => void;
  showNextWeek: () => void;
  showCurrentWeek: () => void;
  toggleHabit: (habitId: string, day: string) => void;
  setLog: (patch: Partial<DayLog>) => void;
  addHabit: (title: string) => void;
  renameHabit: (id: string, title: string) => void;
  deleteHabit: (id: string) => void;
  storageStatus: StorageStatus;
  notificationPermission: PlannerNotificationPermission;
  pwaStatus: PwaRuntimeStatus;
  installPromptAvailable: boolean;
  refreshStorageStatus: () => void;
  requestPersistentStorage: () => void;
  restoreLatestBackup: () => void;
  installPwa: () => void;
  setReminderEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setReviewReminderEnabled: (enabled: boolean) => void;
  setReviewReminderTime: (time: string) => void;
  toggleReminderWeekday: (day: ReminderWeekday) => void;
  sendTestReminder: (kind: "plan" | "review") => void;
  snoozeRemindersToday: () => void;
  resetDemo: () => void;
  resetEmpty: () => void;
  setStartMode: (startMode: PlannerSettings["startMode"]) => void;
  setTheme: (theme: PlannerTheme) => void;
  exportJson: () => void;
  exportWeekMarkdown: () => void;
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

function OnboardingScreen({ onDemo, onEmpty }: { onDemo: () => void; onEmpty: () => void }) {
  return (
    <section className="screen onboardingScreen">
      <Header eyebrow="NotPlanGo" title="С чего начнем?" />
      <article className="heroCard compactHero">
        <div>
          <p className="muted">Локальный планер</p>
          <h2>Выберите старт под свой ритм</h2>
          <p>Можно попробовать готовый пример или открыть чистую неделю и сразу занести свои дела.</p>
        </div>
      </article>
      <div className="onboardingChoices">
        <button type="button" onClick={onEmpty}>
          <span>Пустой планер</span>
          <strong>Начать с нуля</strong>
          <em>Без демо-задач, привычек и целей.</em>
        </button>
        <button type="button" onClick={onDemo}>
          <span>Демо-неделя</span>
          <strong>Посмотреть пример</strong>
          <em>Готовые задачи, цели и привычки для знакомства.</em>
        </button>
      </div>
      <article className="card">
        <div className="sectionTitle">
          <h2>Данные остаются здесь</h2>
          <span>JSON</span>
        </div>
        <p className="cardHint">NotPlanGo хранит планер в браузере на этом устройстве. Для переноса и резервной копии используйте экспорт JSON в настройках.</p>
      </article>
    </section>
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
  const isCurrentWeek = props.viewWeekStart === props.currentWeekStart;
  const isPastWeek = props.viewWeekStart < props.currentWeekStart;
  const weekRange = `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parseISO(props.weekDays[0]))} - ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parseISO(props.weekDays[6]))}`;

  useEffect(() => {
    setSelectedDay(getSelectedWeekDay(props.today, props.weekDays));
  }, [props.today, props.viewWeekStart, props.weekDays]);

  return (
    <section className="screen">
      <Header eyebrow="обзор" title="Неделя" />
      <article className="weekNavigator" aria-label="Навигация по неделям">
        <button type="button" onClick={props.showPreviousWeek} aria-label="Предыдущая неделя">‹</button>
        <div>
          <strong>{weekRange}</strong>
          <span>{isCurrentWeek ? "текущая неделя" : props.viewWeekStart}</span>
        </div>
        <button type="button" onClick={props.showNextWeek} aria-label="Следующая неделя">›</button>
        {!isCurrentWeek && (
          <button type="button" className="weekNavigatorToday" onClick={props.showCurrentWeek}>Сегодня</button>
        )}
      </article>
      {isPastWeek && props.viewedWeekUnfinishedTasks.length > 0 && (
        <article className="card reviewCarryCard">
          <div className="sectionTitle">
            <h2>Незавершенное</h2>
            <span>{props.viewedWeekUnfinishedTasks.length}</span>
          </div>
          <p className="cardHint">Перенесите открытые задачи из этой недели в сегодняшний список, если они все еще актуальны.</p>
          <button type="button" className="secondaryButton" onClick={props.moveViewedWeekUnfinishedToToday}>Перенести в сегодня</button>
        </article>
      )}
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
            props.addGoal(goalTitle, props.viewWeekStart);
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
                <button onClick={() => props.toggleGoal(goal.id, props.viewWeekStart)} aria-label={`Отметить цель ${goal.title}`}>{goal.done ? "✓" : index + 1}</button>
                <input value={goal.title} onChange={(event) => props.renameGoal(goal.id, event.target.value, props.viewWeekStart)} aria-label="Название цели недели" />
                <button className="deleteButton" onClick={() => props.deleteGoal(goal.id, props.viewWeekStart)} aria-label={`Удалить ${goal.title}`}>×</button>
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
      {props.upcomingTasks.length > 0 && (
        <article className="card upcomingCard">
          <div className="sectionTitle">
            <h2>Ближайшие планы</h2>
            <span>{props.upcomingTasks.length}</span>
          </div>
          <p className="cardHint">Задачи на даты после текущей недели остаются здесь, пока не наступит их неделя.</p>
          <div className="taskList">
            {props.upcomingTasks.map(({ day, task }) => (
              <div className="overdueItem" key={`${day}-${task.id}`}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", weekday: "short" }).format(parseISO(day))}</span>
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
      <article className="card ritualCard">
        <div className="sectionTitle">
          <h2>Ритуал недели</h2>
          <span>JSON</span>
        </div>
        <p>В конце недели сделайте ручной экспорт, чтобы данные не зависели только от браузера.</p>
        <p className="backupNote">
          {props.state.settings.lastExportAt ? `Последний ручной экспорт: ${new Date(props.state.settings.lastExportAt).toLocaleString("ru-RU")}` : "Ручной экспорт еще не делали."}
        </p>
        <button onClick={props.exportJson}>Экспорт JSON</button>
        <button className="secondaryButton" onClick={props.exportWeekMarkdown}>Экспорт недели .md</button>
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
  const searchResults = searchPlannerState(props.state, query);
  const logs = props.weekDays.map((day) => props.state.dayLogs[day] ?? defaultLog());
  const avg = (values: number[]) => values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "0";
  const lastBackup = plannerStorage.latestBackupAt();
  const remindersActive = props.state.settings.remindersEnabled || props.state.settings.reviewReminderEnabled;
  const permissionCopy = getNotificationPermissionCopy(props.notificationPermission, remindersActive);
  const nextReminder = getNextReminderSummary(props.state.settings);
  const reminderSchedule = getReminderScheduleCopy(props.state.settings.reminderDays);
  const reminderTestsDisabled = props.notificationPermission === "denied" || props.notificationPermission === "unsupported";
  const pwaReadinessItems = getPwaReadinessItems(props.pwaStatus);
  const installAction = getPwaInstallActionCopy(props.pwaStatus, props.installPromptAvailable);
  return (
    <section className="screen">
      <Header eyebrow="управление" title="Настройки" />
      <article className="card themeCard">
        <div className="sectionTitle">
          <h2>Цветовая гамма</h2>
          <span>{themePresets.find((preset) => preset.id === props.state.settings.theme)?.title ?? "Олива"}</span>
        </div>
        <div className="themeGrid">
          {themePresets.map((preset) => (
            <button
              type="button"
              className={preset.id === props.state.settings.theme ? "active" : ""}
              onClick={() => props.setTheme(preset.id)}
              key={preset.id}
              aria-label={`Выбрать тему ${preset.title}`}
            >
              <span className="themeSwatches" aria-hidden="true">
                {preset.swatches.map((color) => <i style={{ background: color }} key={color} />)}
              </span>
              <strong>{preset.title}</strong>
              <em>{preset.hint}</em>
            </button>
          ))}
        </div>
      </article>
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
      <article className="card reminderCard">
        <div className="sectionTitle">
          <h2>Уведомления</h2>
          <span>{permissionCopy.label}</span>
        </div>
        <div className="reminderStatus">
          <div>
            <span>Разрешение</span>
            <strong>{permissionCopy.label}</strong>
          </div>
          <div>
            <span>Следующее</span>
            <strong>{nextReminder}</strong>
          </div>
          <div>
            <span>Дни</span>
            <strong>{reminderSchedule}</strong>
          </div>
          <p>{permissionCopy.hint}</p>
        </div>
        <div className="reminderControls">
          <div className="reminderRow">
            <div className="reminderRowCopy">
              <strong>План дня</strong>
              <span>Открыть фокус, задачи и привычки</span>
            </div>
            <input className="reminderTimeInput" type="time" aria-label="Время напоминания: План дня" value={props.state.settings.reminderTime} onChange={(event) => props.setReminderTime(event.target.value)} />
            <button
              className={props.state.settings.remindersEnabled ? "reminderSwitch active" : "reminderSwitch"}
              onClick={() => props.setReminderEnabled(!props.state.settings.remindersEnabled)}
              role="switch"
              type="button"
              aria-checked={props.state.settings.remindersEnabled}
            >
              {props.state.settings.remindersEnabled ? "Включено" : "Выключено"}
            </button>
          </div>
          <div className="reminderRow">
            <div className="reminderRowCopy">
              <strong>Итог дня</strong>
              <span>Закрыть сон, энергию, настроение</span>
            </div>
            <input className="reminderTimeInput" type="time" aria-label="Время напоминания: Итог дня" value={props.state.settings.reviewReminderTime} onChange={(event) => props.setReviewReminderTime(event.target.value)} />
            <button
              className={props.state.settings.reviewReminderEnabled ? "reminderSwitch active" : "reminderSwitch"}
              onClick={() => props.setReviewReminderEnabled(!props.state.settings.reviewReminderEnabled)}
              role="switch"
              type="button"
              aria-checked={props.state.settings.reviewReminderEnabled}
            >
              {props.state.settings.reviewReminderEnabled ? "Включено" : "Выключено"}
            </button>
          </div>
          <div className="reminderDaysHeader">
            <strong>Дни отправки</strong>
            <span>Общие для плана и итога</span>
          </div>
          <div className="reminderDays" aria-label="Дни уведомлений">
            {reminderWeekdays.map((day) => (
              <button
                className={props.state.settings.reminderDays.includes(day) ? "active" : ""}
                key={day}
                onClick={() => props.toggleReminderWeekday(day)}
                type="button"
                aria-pressed={props.state.settings.reminderDays.includes(day)}
                aria-label={`${fullDayNames[day - 1]} ${props.state.settings.reminderDays.includes(day) ? "включён" : "выключен"}`}
              >
                {dayNames[day - 1]}
              </button>
            ))}
          </div>
          <div className="reminderCheckHeader">
            <strong>Проверка</strong>
            <span>Отправьте тест после разрешения уведомлений</span>
          </div>
          <div className="reminderTestGrid">
            <button className="secondaryButton reminderTestButton" disabled={reminderTestsDisabled} onClick={() => props.sendTestReminder("plan")}>Тест плана</button>
            <button className="secondaryButton reminderTestButton" disabled={reminderTestsDisabled} onClick={() => props.sendTestReminder("review")}>Тест итога</button>
          </div>
          {remindersActive ? (
            <>
              <button className="secondaryButton reminderTestButton reminderSnoozeButton" onClick={props.snoozeRemindersToday}>Не сегодня</button>
              <p className="reminderSnoozeHint">Откладывает включенные напоминания до завтра, не меняя расписание.</p>
            </>
          ) : null}
        </div>
        <p className="cardHint">Напоминание работает локально через браузерные уведомления. Для надежных фоновых push-уведомлений позже понадобится серверная синхронизация.</p>
      </article>
      <article className="card">
        <div className="sectionTitle"><h2>Поиск</h2></div>
        <input className="searchInput" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти задачу, цель или заметку" />
        <div className="searchResults">
          {query.trim() && searchResults.length === 0 ? (
            <EmptyState title="Ничего не найдено" text="Попробуйте другое слово из задачи, цели или итога дня." />
          ) : (
            searchResults.map((result) => (
              <div key={result.id}>
                <span>{result.title}</span>
                <strong>{result.meta}</strong>
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
      <article className="card pwaCard">
        <div className="sectionTitle">
          <h2>PWA на телефоне</h2>
          <span>{props.pwaStatus.standalone ? "установлено" : "проверка"}</span>
        </div>
        <div className="pwaGrid">
          {pwaReadinessItems.map((item) => (
            <div className={item.ok ? "ok" : ""} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.hint}</em>
            </div>
          ))}
        </div>
        <div className="pwaInstall">
          <button className={installAction.enabled ? "" : "secondaryButton"} disabled={!installAction.enabled} onClick={props.installPwa}>{installAction.label}</button>
          <p>{installAction.hint}</p>
        </div>
      </article>
      <article className="card storageCard">
        <div className="sectionTitle">
          <h2>Хранилище</h2>
          <span>{props.storageStatus.persisted ? "защищено" : "локально"}</span>
        </div>
        <div className="storageGrid">
          <div><span>Занято</span><strong>{props.storageStatus.usageLabel}</strong></div>
          <div><span>Лимит</span><strong>{props.storageStatus.quotaLabel}</strong></div>
          <div><span>Защита</span><strong>{props.storageStatus.persisted === null ? "неизвестно" : props.storageStatus.persisted ? "включена" : "обычная"}</strong></div>
          <div><span>Бэкап</span><strong>{props.storageStatus.backupAvailable ? "есть" : "нет"}</strong></div>
        </div>
        <p className="backupNote">
          {props.storageStatus.backupAt ? `Последний бэкап: ${new Date(props.storageStatus.backupAt).toLocaleString("ru-RU")}` : "Локальный бэкап появится после первого сохранения."}
        </p>
        <div className="storageActions">
          <button className="secondaryButton" onClick={props.refreshStorageStatus}>Обновить статус</button>
          <button className="secondaryButton" onClick={props.requestPersistentStorage}>Защитить хранение</button>
          <button className="secondaryButton" onClick={props.restoreLatestBackup}>Восстановить бэкап</button>
        </div>
      </article>
      <article className="card actionsCard">
        <div className="sectionTitle"><h2>Данные</h2></div>
        <button onClick={props.exportJson}>Экспорт JSON</button>
        <button className="secondaryButton" onClick={props.exportWeekMarkdown}>Экспорт недели .md</button>
        <button className="secondaryButton" onClick={() => props.importInputRef.current?.click()}>Импорт JSON</button>
        <input ref={props.importInputRef} className="hiddenFileInput" type="file" accept="application/json,.json" onChange={(event) => props.importJson(event.target.files?.[0])} />
        <p className="backupNote">
          {props.state.settings.lastExportAt ? `Ручной экспорт: ${new Date(props.state.settings.lastExportAt).toLocaleString("ru-RU")}` : "Ручной экспорт еще не делали."}
        </p>
        <p className="backupNote">{lastBackup ? `Автобэкап JSON: ${new Date(lastBackup).toLocaleString("ru-RU")}` : "Автобэкап JSON появится после первого сохранения."}</p>
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
  onSecondary,
  onConfirm,
}: {
  action: ConfirmAction;
  onCancel: () => void;
  onSecondary: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div className="confirmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="confirmSheet" initial={{ y: 32 }} animate={{ y: 0 }} exit={{ y: 32 }}>
        <h2>{action.title}</h2>
        <p>{action.text}</p>
        <div>
          <button className="secondaryButton" onClick={onCancel}>Отмена</button>
          {action.secondaryLabel && <button className="secondaryButton" onClick={onSecondary}>{action.secondaryLabel}</button>}
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

const rootNode = typeof document === "undefined" ? null : document.getElementById("root");
if (rootNode) {
  const root = globalThis.notPlanGoRoot ?? createRoot(rootNode);
  globalThis.notPlanGoRoot = root;
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
