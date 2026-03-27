/**
 * Time-random id used across server actions (projects, scenes, workflows, chat, etc.).
 * Keep format stable — stored in SQLite and referenced by URLs.
 */
export function newPrefixedId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
