import { Pool } from "pg";
import { config } from "./config";

export const db = new Pool(config.db);
