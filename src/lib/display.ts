// Patient IDs are stored as "P-" plus a full UUID so they never collide. People only need the first block:
// "P-3ECDC162" is unique within a clinic in practice and is still found by search (which matches any part of the ID).
export function patientRef(displayId: string | null | undefined) {
  if (!displayId) return '';
  const m = /^P-([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(displayId);
  return m ? `P-${m[1].toUpperCase()}` : displayId;
}
