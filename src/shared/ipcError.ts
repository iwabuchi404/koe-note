/**
 * IPC エラーの受け渡し
 *
 * ELECTRON の制約: ipcRenderer.invoke の reject に届くのは
 * Error の message / stack だけで、独自プロパティ（code 等）は
 * 落とる。したがって AppError の code をメッセージの先頭に
 * `[CODE]` として埋め、renderer 側で復元する。
 *
 * 例:
 *   main    throw new Error('[NOT_FOUND] ファイルが見つかりません: a.mp3')
 *   renderer parseIpcError(e) → { code: 'NOT_FOUND', message: 'ファイルが見つかりません: a.mp3' }
 */

/** エラーコード（main の AppErrorCode と対） */
export type IpcErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN_PATH'
  | 'PERMISSION_DENIED'
  | 'NO_SPACE'
  | 'FILE_BUSY'
  | 'INVALID_ARGUMENT'
  | 'SERVER_UNAVAILABLE'
  | 'UNKNOWN_MODEL'
  | 'DOWNLOAD_FAILED'
  | 'UNKNOWN'

const CODE_PREFIX = /^\[([A-Z_]+)\]\s*/;

/**
 * AppError を IPC で投げる用のメッセージに変換する
 *
 * @param code エラーコード
 * @param message ユーザー向けのメッセージ
 */
export function formatIpcError(code: IpcErrorCode, message: string): string {
  return `[${code}] ${message}`
}

/**
 * 投げられたエラを解析する
 *
 * Electron の remote exception は
 *   "Error invoking remote method 'x:y': [NOT_FOUND] メッセージ"
 * の形になる。メッセージ自体にも ': ' が含まれるため、
 * Laplace terakhir ': ' ではなく「[ で始まる位置」でラッパーを剥がす。
 */
export function parseIpcError(error: unknown): { code: IpcErrorCode; message: string } {
  const raw = error instanceof Error ? error.message : String(error)

  let unwrapped = raw
  if (raw.includes("Error invoking remote method")) {
    const bracketIndex = raw.indexOf('[')
    if (bracketIndex > 0) {
      unwrapped = raw.slice(bracketIndex)
    } else {
      // コードが無い場合: ラッパーの ": " の後ろをbest-effortで取る
      unwrapped = raw.slice(raw.lastIndexOf(': ') + 2)
    }
  }

  const match = unwrapped.match(CODE_PREFIX)
  if (!match) {
    return { code: 'UNKNOWN', message: unwrapped }
  }

  return {
    code: match[1] as IpcErrorCode,
    message: unwrapped.replace(CODE_PREFIX, '')
  }
}

/**
 * ユーザー向けの文言を作る
 *
 * NOT_FOUND などはそのまま日本語の message を優先し、
 * UNKNOWN のときだけ既定文言に落とす。
 */
export function describeIpcError(error: unknown, fallback = '操作に失敗しました'): string {
  const { code, message } = parseIpcError(error)
  if (code === 'UNKNOWN' && !message) {
    return fallback
  }
  return message || fallback
}

