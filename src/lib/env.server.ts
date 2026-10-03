import 'server-only';
import { runtimeEnvironment } from './config/environment';
// Lazy validation keeps the in-memory demo independent of a configured database.
export function getDatabaseEnvironment() { return runtimeEnvironment(process.env); }
