import { parseCronField } from "./backup-config.js";
import { runBackupJobConfig } from "./backup.js";
import type { BackupConfig, BackupJobConfig, GatewayConfig } from "./types.js";

interface SchedulerLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

interface CronMatcher {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  dayOfMonthWildcard: boolean;
  dayOfWeekWildcard: boolean;
}

export function startBackupScheduler(
  gatewayConfig: GatewayConfig,
  backupConfig: BackupConfig,
  logger: SchedulerLogger = console
) {
  const jobs = backupConfig.jobs.filter((job) => job.enabled);
  if (!backupConfig.configured || jobs.length === 0) {
    return undefined;
  }

  const scheduledJobs = jobs.map((job) => ({
    job,
    matcher: parseCron(job.schedule),
    running: false
  }));
  let lastMinuteKey = "";
  const timer = setInterval(() => {
    const now = new Date();
    const minuteKey = toMinuteKey(now, backupConfig.defaults.timezone);
    if (minuteKey === lastMinuteKey) {
      return;
    }
    lastMinuteKey = minuteKey;

    for (const scheduledJob of scheduledJobs) {
      if (!matchesCron(scheduledJob.matcher, now, backupConfig.defaults.timezone) || scheduledJob.running) {
        continue;
      }
      scheduledJob.running = true;
      void runBackupJobConfig(gatewayConfig, backupConfig, scheduledJob.job, logger)
        .catch((error) => logger.error(`scheduled backup failed ${scheduledJob.job.id}`, error))
        .finally(() => {
          scheduledJob.running = false;
        });
    }
  }, 30_000);

  logger.info(`backup scheduler started with ${scheduledJobs.length} job(s)`);
  return {
    stop: async () => {
      clearInterval(timer);
    }
  };
}

function parseCron(schedule: string): CronMatcher {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/);
  return {
    minute: parseCronField(minute, 0, 59, "schedule"),
    hour: parseCronField(hour, 0, 23, "schedule"),
    dayOfMonth: parseCronField(dayOfMonth, 1, 31, "schedule"),
    month: parseCronField(month, 1, 12, "schedule"),
    dayOfWeek: parseCronField(dayOfWeek, 0, 7, "schedule"),
    dayOfMonthWildcard: dayOfMonth === "*",
    dayOfWeekWildcard: dayOfWeek === "*"
  };
}

function matchesCron(matcher: CronMatcher, date: Date, timezone: string): boolean {
  const parts = localDateParts(date, timezone);
  const dayMatches = matcher.dayOfMonthWildcard || matcher.dayOfWeekWildcard
    ? matcher.dayOfMonth.has(parts.day) && matcher.dayOfWeek.has(parts.weekday)
    : matcher.dayOfMonth.has(parts.day) || matcher.dayOfWeek.has(parts.weekday);

  return matcher.minute.has(parts.minute)
    && matcher.hour.has(parts.hour)
    && matcher.month.has(parts.month)
    && dayMatches;
}

function toMinuteKey(date: Date, timezone: string): string {
  const parts = localDateParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.minute}`;
}

function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayText);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    weekday: Math.max(0, weekday)
  };
}

export type { BackupJobConfig };
