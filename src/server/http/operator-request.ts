import 'server-only';
import { requireIdentity } from '@/server/auth/session';
import { getDatabase } from '@/server/db/client';
import { requireOperator } from '@/server/operator/service';

// Operator routes take no clinic or branch headers: access comes only from platform_operators.
export async function operatorIdentity() {
  const authUserId = await requireIdentity();
  await requireOperator(getDatabase(), authUserId);
  return authUserId;
}
