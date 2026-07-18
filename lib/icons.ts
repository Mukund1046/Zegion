export function iconPath(name: string): string {
  return `/icons/${name}.svg`;
}

export const sortIcons: Record<string, string> = {
  recent: "clock-01",
  oldest: "calendar-01",
  liked: "heart-add",
};
