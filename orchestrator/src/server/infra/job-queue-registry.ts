import { sqlite } from "@server/db";
import type { JobQueue } from "./job-queue";
import { InMemoryJobQueue } from "./job-queue-memory";
import { SqliteJobQueue } from "./job-queue-sqlite";

let activeJobQueue: JobQueue = new SqliteJobQueue(sqlite);

export function getJobQueue(): JobQueue {
  return activeJobQueue;
}

export function setJobQueue(queue: JobQueue): void {
  activeJobQueue = queue;
}

export function __resetJobQueueForTests(): void {
  activeJobQueue = new InMemoryJobQueue();
}
