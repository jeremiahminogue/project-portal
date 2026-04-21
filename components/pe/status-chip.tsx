import { Badge } from "@/components/ui/badge";
import type { StatusChip as StatusChipColor } from "@/data/types";

/** Maps common string statuses to the 6-color chip palette. */
export function statusToColor(status: string): StatusChipColor {
  const s = status.toLowerCase();
  if (/(approved|complete|closed|green|done|answered)/.test(s)) return "green";
  if (/(in review|pending|submitted|open|amber)/.test(s)) return "amber";
  if (/(rejected|red|overdue|critical)/.test(s)) return "red";
  if (/(design|planning|pre-?con|blue|draft)/.test(s)) return "blue";
  if (/(revise|resubmit|purple)/.test(s)) return "purple";
  return "gray";
}

export function StatusChip({
  label,
  color,
}: {
  label: string;
  color?: StatusChipColor;
}) {
  const resolved = color ?? statusToColor(label);
  return <Badge variant={resolved}>{label}</Badge>;
}
