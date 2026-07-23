const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

// "12m ago" / "3h ago" / "2d ago" style relative timestamp.
export function formatRelativeTime(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);

  if (seconds < 60) return 'just now';

  for (const [unit, secondsInUnit] of UNITS) {
    const amount = Math.floor(seconds / secondsInUnit);
    if (amount >= 1) {
      const abbrev = unit === 'minute' ? 'm' : unit[0];
      return `${amount}${abbrev} ago`;
    }
  }
  return 'just now';
}
