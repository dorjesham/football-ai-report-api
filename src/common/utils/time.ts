import dayjs from 'dayjs';

export function formatDateTime(d: Date | string): string {
  return dayjs(d).format('YYYY-MM-DD HH:mm');
}
