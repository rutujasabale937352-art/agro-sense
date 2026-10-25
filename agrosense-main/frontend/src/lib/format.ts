import { format } from "date-fns";

export function formatDate(value: Date = new Date()): string {
  return format(value, "dd MMMM yyyy");
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function timeAgo(value: string | null): string {
  if (!value) return "No readings yet";
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  return format(new Date(value), "dd MMM, hh:mm a");
}
