// ビルドした日時とコミット（vite.config.ts で埋め込む）。push したあと、新しい版が出ているかを確かめるために画面に出す。

declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

/** 例：「更新 10/01 21:34（ff283b2）」。日時は日本時間 */
export function buildLabel(): string {
  try {
    const d = new Date(__BUILD_TIME__);
    const s = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    return `更新 ${s}${__BUILD_COMMIT__ ? `（${__BUILD_COMMIT__}）` : ''}`;
  } catch {
    return '';
  }
}
