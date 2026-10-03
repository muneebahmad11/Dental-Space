import './load-env.ts';
import { migrationEnvironment, runtimeEnvironment, supabaseEnvironment } from '../src/lib/config/environment.ts';
try {
  const target = process.argv[2] ?? 'database';
  if (target === 'database') { runtimeEnvironment(process.env); migrationEnvironment(process.env); }
  else if (target === 'supabase') supabaseEnvironment(process.env);
  else throw new Error('Choose database or supabase validation.');
  console.log(`${target} configuration is valid. Values were not printed.`);
} catch (error) { console.error(error instanceof Error ? error.message : 'Configuration invalid.'); process.exitCode = 1; }
