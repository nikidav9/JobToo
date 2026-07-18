// Реестр реальных позиций UI-элементов для подсветки в онбординге.
// Элементы регистрируют свою измеренную геометрию (measureInWindow),
// оверлей читает её и рисует точную рамку — без угадывания координат.
export type TargetRect = { x: number; y: number; w: number; h: number };

const targets: Record<string, TargetRect> = {};
const subs = new Set<() => void>();

export function setOnboardingTarget(key: string, rect: TargetRect) {
  const prev = targets[key];
  if (prev && prev.x === rect.x && prev.y === rect.y && prev.w === rect.w && prev.h === rect.h) return;
  targets[key] = rect;
  subs.forEach(fn => fn());
}

export function getOnboardingTarget(key: string): TargetRect | undefined {
  return targets[key];
}

export function subscribeOnboardingTargets(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
