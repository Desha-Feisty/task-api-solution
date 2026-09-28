export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const LIMIT_DEFAULT = 50;
export const LIMIT_MAX = 100;
export const OFFSET_DEFAULT = 0;

export const WRITABLE_FIELDS = ['title', 'description', 'isCompleted'];

export function serializeTask(task) {
  const payload = {
    id: String(task.id),
    title: task.title,
    isCompleted: task.isCompleted,
  };

  if (task.description !== null && task.description !== undefined) {
    payload.description = task.description;
  }

  return payload;
}
