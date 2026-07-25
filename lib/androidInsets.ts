import { Dimensions, Platform, StatusBar } from 'react-native';

// Подгонка под Android. Экраны у андроидов разные: где-то жесты, где-то три
// кнопки внизу, где-то вырез сверху. С edge-to-edge (включён в app.json)
// приложение рисуется под системными панелями, и всё, что мы кладём к нижнему
// краю, оказывается под кнопками «назад/домой/меню».
//
// Одному useSafeAreaInsets() доверять нельзя: на части прошивок (заметно на
// MIUI и старых сборках) он отдаёт снизу ноль, хотя панель кнопок есть.
// Поэтому здесь мы ещё и меряем разницу между экраном и окном.

/** Версия Android как число (API level). На других платформах 0. */
export const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;

/** Android 15 и новее: edge-to-edge включён системой, отказаться нельзя. */
export const ANDROID_FORCED_EDGE_TO_EDGE = ANDROID_API >= 35;

/**
 * Высота системной панели навигации, измеренная напрямую.
 * screen — весь экран, window — то, что отдано приложению; разница и есть
 * панель. При edge-to-edge разницы нет, и тогда полагаемся на insets.
 */
export function measuredNavBar(): number {
  if (Platform.OS !== 'android') return 0;
  const win = Dimensions.get('window');
  const scr = Dimensions.get('screen');
  const diff = Math.round(scr.height - win.height - (StatusBar.currentHeight ?? 0));
  // Панель кнопок — это 24–56 dp. Больше — значит меряем что-то другое
  // (разделённый экран, плавающее окно), и лучше не трогать.
  return diff >= 20 && diff <= 60 ? diff : 0;
}

/**
 * Сколько отступить снизу, чтобы не попасть под системные кнопки.
 * Берём максимум из того, что сказала система, и того, что намеряли сами.
 *
 * @param inset  insets.bottom из useSafeAreaInsets()
 * @param min    минимум для жестовой навигации, где панели нет вовсе
 */
export function bottomSafe(inset: number, min = 0): number {
  if (Platform.OS !== 'android') return Math.max(inset, min);
  return Math.max(inset, measuredNavBar(), min);
}

/**
 * Свойства для <Modal>, без которых на Android с edge-to-edge окно модалки
 * считает себя меньше экрана: содержимое обрезается справа и снизу.
 * navigationBarTranslucent появился в Expo SDK 53 / RN 0.79.
 */
export const androidModalProps = Platform.OS === 'android'
  ? { statusBarTranslucent: true, navigationBarTranslucent: true }
  : {};
