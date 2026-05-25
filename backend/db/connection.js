import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, "..", config.DB_PATH);

export const db = new Database(dbFile);
