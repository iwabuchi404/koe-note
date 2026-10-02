/**
 * IPC 境界のエラー
 *
 * 此前は3つの非互換な規約が混在していた:
 *   1. throw（renderer には "Error invoking remote method '...'" という
 *      ラッパー付きエラーとして届く）
 *   2. 番兵を返す（[] / false / null）— 「データが無い」と「I/Oエラー」が
 *      区別できない
 *   3. エラーメッセージを文字列マッチして分類し直す
 *      （パスに "容量不足" という文字列が含まれて_capacity不足_ 扱いになる）
 *
 * 方針: **投げるだけ**にする。慣習として必ず AppError を投げ、
 * code で呼び出し側が分岐できるようにする。番兵返しは廃止する。
 */

/** エラーコード。renderer 側で分岐したいときはここを見る */
export type AppErrorCode =
  /** 要求されたファイル/フォルダが存在しない */
  | 'NOT_FOUND'
  /** 許可ルート外のパスを要求された */
  | 'FORBIDDEN_PATH'
  /** 容量不足 */
  | 'NO_SPACE'
  /** 権限がない */
  | 'PERMISSION_DENIED'
  /** ファイルが使用中（Windows の EBUSY 等） */
  | 'FILE_BUSY'
  /** 入力値が不正（引数の欠落・型違い） */
  | 'INVALID_ARGUMENT'
  /** Whisperサーバーが利用できない */
  | 'SERVER_UNAVAILABLE'
  /** 未知のモデルID */
  | 'UNKNOWN_MODEL'
  /** ダウンロードに失敗した */
  | 'DOWNLOAD_FAILED'
  /** その他のエラー */
  | 'UNKNOWN'

/** IPC 境界を跨ぐエラー */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  /** Electron の remote exception を slim な形にして renderer へ渡す */
  toWire(): { code: AppErrorCode; message: string; details?: unknown } {
    return { code: this.code, message: this.message, details: this.details }
  }
}

/** Node の fs エラーコードから AppError のコードを決める */
export function fromFsError(error: unknown): AppErrorCode {
  const code = (error as NodeJS.ErrnoException)?.code
  switch (code) {
    case 'ENOENT':
      return 'NOT_FOUND'
    case 'EACCES':
    case 'EPERM':
      return 'PERMISSION_DENIED'
    case 'ENOSPC':
      return 'NO_SPACE'
    case 'EBUSY':
    case 'EAGAIN':
      return 'FILE_BUSY'
    case 'EINVAL':
      return 'INVALID_ARGUMENT'
    default:
      return 'UNKNOWN'
  }
}

/**
 * 任意の例外を AppError に変換する
 *
 * 既に AppError ならそのまま、fs エラーなら code から、それ以外は UNKNOWN として
 * ラップする。
 */
export function toAppError(error: unknown, fallbackMessage?: string): AppError {
  if (error instanceof AppError) {
    return error
  }

  const code = fromFsError(error)
  const message = error instanceof Error ? error.message : String(error)

  if (code !== 'UNKNOWN') {
    return new AppError(code, `${fallbackMessage ?? 'ファイル操作に失敗しました'}: ${message}`, error)
  }

  return new AppError('UNKNOWN', message || (fallbackMessage ?? '不明なエラー'), error)
}

