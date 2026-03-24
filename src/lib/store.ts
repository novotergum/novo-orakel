/**
 * Minimal JSON-file-based prediction store.
 * V1: local filesystem, no external DB.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "predictions.json");

export interface PredictionRecord {
  id: string;
  matchId: number;
  userId: string;
  userName: string;
  source: "human" | "agent";
  winnerPick: "1" | "X" | "2";
  scoreTip: string;
  style?: string;
  createdAt: string;
  points?: number;
}

async function ensureDir() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // already exists
  }
}

export async function readPredictions(): Promise<PredictionRecord[]> {
  try {
    const raw = await readFile(FILE, "utf-8");
    return JSON.parse(raw) as PredictionRecord[];
  } catch {
    return [];
  }
}

export async function writePredictions(
  records: PredictionRecord[],
): Promise<void> {
  await ensureDir();
  await writeFile(FILE, JSON.stringify(records, null, 2), "utf-8");
}

export async function upsertPrediction(
  record: PredictionRecord,
): Promise<PredictionRecord> {
  const records = await readPredictions();
  const idx = records.findIndex(
    (r) => r.matchId === record.matchId && r.userId === record.userId,
  );
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record };
  } else {
    records.push(record);
  }
  await writePredictions(records);
  return record;
}
