import * as fs from 'fs';
import * as path from 'path';
import type { UserData, UsersDatabase, Aria2Config } from '../types/index.js';
import { config } from '../config/env.js';

const DB_FILE = path.join(config.dataDir, 'users.json');

function ensureDataDir(): void {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function readDatabase(): UsersDatabase {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    return { users: {} };
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as UsersDatabase;
  } catch {
    console.error('Failed to read database, creating new one');
    return { users: {} };
  }
}

function writeDatabase(db: UsersDatabase): void {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function getUserConfig(userId: number): UserData | null {
  const db = readDatabase();
  return db.users[userId.toString()] || null;
}

export function getAria2Config(userId: number): Aria2Config | null {
  const user = getUserConfig(userId);
  return user?.aria2Config || null;
}

export function hasAria2Config(userId: number): boolean {
  return getAria2Config(userId) !== null;
}

export function saveUserConfig(
  userId: number,
  aria2Config: Aria2Config,
  username?: string
): void {
  const db = readDatabase();
  const now = new Date().toISOString();
  const existing = db.users[userId.toString()];

  db.users[userId.toString()] = {
    userId,
    username,
    aria2Config,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  writeDatabase(db);
}

export function deleteUserConfig(userId: number): boolean {
  const db = readDatabase();
  const key = userId.toString();
  if (db.users[key]) {
    delete db.users[key];
    writeDatabase(db);
    return true;
  }
  return false;
}
