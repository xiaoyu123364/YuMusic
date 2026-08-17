import { useSyncExternalStore } from 'react';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogEntry = {
  id: number;
  time: string;
  tag: string;
  level: LogLevel;
  message: string;
};

const MAX_LOGS = 1200;
let entries: LogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function timestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function push(tag: string, level: LogLevel, message: string) {
  entries = [...entries, { id: ++seq, time: timestamp(), tag, level, message }].slice(-MAX_LOGS);
  notify();

  // 同时写 console，方便真机 logcat 抓取。
  const line = `[${tag}] ${message}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** 记录一条普通日志。 */
export function log(tag: string, message: string): void {
  push(tag, 'info', message);
}

/** 记录一条警告。 */
export function logWarn(tag: string, message: string): void {
  push(tag, 'warn', message);
}

/** 记录一条错误（含异常对象序列化）。 */
export function logError(tag: string, message: string, error?: unknown): void {
  let detail: string;
  if (error instanceof Error) {
    detail = `${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  } else if (error === undefined) {
    detail = '';
  } else if (typeof error === 'string') {
    detail = error;
  } else {
    try {
      detail = JSON.stringify(error);
    } catch {
      detail = String(error);
    }
  }
  push(tag, 'error', detail ? `${message} | ${detail}` : message);
}

export function getLogs(): LogEntry[] {
  return entries;
}

export function clearLogs(): void {
  entries = [];
  seq = 0;
  notify();
}

function subscribeLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅日志列表（供日志页实时展示）。 */
export function useLogs(): LogEntry[] {
  return useSyncExternalStore(subscribeLogs, getLogs, () => []);
}
