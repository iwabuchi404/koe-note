/**
 * FileServiceV2 - ファイル操作ビジネスロジック（UI非依存）
 * 
 * 設計方針:
 * - UIから完全に独立したファイル操作
 * - Promise/Observableベースの非同期処理
 * - 型安全なエラーハンドリング
 * - 単体テスト可能な設計
 */

// 型定義
export interface FileInfo {
  id: string
  fileName: string
  filePath: string
  format: string
  size: number
  createdAt: Date
  modifiedAt: Date
  duration?: number
  metadata?: Record<string, any>
}

export interface AudioFileInfo extends FileInfo {
  duration: number
  sampleRate?: number
  channels?: number
  bitrate?: number
  hasTranscriptionFile?: boolean
  transcriptionPath?: string
  isRecording?: boolean
}

export interface FolderInfo {
  path: string
  name: string
  fileCount: number
  totalSize: number
  lastModified: Date
}

export interface FileFilter {
  extensions?: string[]
  minSize?: number
  maxSize?: number
  dateRange?: {
    start: Date
    end: Date
  }
  hasTranscription?: boolean
}

export interface FileError {
  type: 'not_found' | 'permission_denied' | 'disk_space' | 'invalid_format' | 'corrupted' | 'unknown_error'
  message: string
  filePath?: string
  details?: any
  recoverable: boolean
}

// 結果型
export type FileResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: FileError
}

/**
 * ファイルサービスV2 - ビジネスロジック専用
 */
export class FileServiceV2 {
  private onFileChange?: (file: AudioFileInfo, changeType: 'created' | 'modified' | 'deleted') => void
  private onError?: (error: FileError) => void

  /**
   * イベントリスナー設定
   */
  setEventHandlers(
    onFileChange?: (file: AudioFileInfo, changeType: 'created' | 'modified' | 'deleted') => void,
    onError?: (error: FileError) => void
  ) {
    this.onFileChange = onFileChange
    this.onError = onError
  }

  /**
   * 音声ファイル保存
   * @param audioBuffer 音声データ
   * @param fileName ファイル名
   * @param metadata メタデータ
   * @returns 保存されたファイル情報
   */
  async saveAudioFile(
    audioBuffer: ArrayBuffer,
    fileName: string,
    metadata?: Record<string, any>
  ): Promise<FileResult<AudioFileInfo>> {
    try {
      // 1. ファイル名の検証・正規化
      const sanitizedFileName = this.sanitizeFileName(fileName)
      
      // 2. 保存パス取得
      const savePathResult = await this.getSavePath()
      if (!savePathResult.success) {
        return savePathResult
      }

      const filePath = `${savePathResult.data}\\${sanitizedFileName}`

      // 3. ディスク容量チェック（簡易版 - スキップ）
      // const spaceCheckResult = await this.checkDiskSpace(audioBuffer.byteLength)
      // if (!spaceCheckResult.success) {
      //   return spaceCheckResult
      // }

      // 4. ファイル保存
      await window.electronAPI.saveFile(audioBuffer, sanitizedFileName)

      // 5. メタデータ保存
      if (metadata) {
        await this.saveMetadata(sanitizedFileName, metadata)
      }

      // 6. ファイル情報作成
      const audioFile = await this.createAudioFileInfo(filePath, sanitizedFileName, audioBuffer.byteLength, metadata)

      // 7. 変更通知
      this.onFileChange?.(audioFile, 'created')

      return {
        success: true,
        data: audioFile
      }

    } catch (error) {
      const fileError: FileError = {
        type: 'unknown_error',
        message: `ファイル保存エラー: ${error instanceof Error ? error.message : String(error)}`,
        filePath: fileName,
        details: error,
        recoverable: true
      }

      this.onError?.(fileError)
      
      return {
        success: false,
        error: fileError
      }
    }
  }

  /**
   * 音声ファイル読み込み
   * @param filePath ファイルパス
   * @returns 音声データ
   */
  async loadAudioFile(filePath: string): Promise<FileResult<ArrayBuffer>> {
    try {
      // 1. ファイル存在確認
      const existsResult = await this.checkFileExists(filePath)
      if (!existsResult.success) {
        return existsResult
      }

      // 2. ファイル読み込み
      const audioData = await window.electronAPI.loadAudioFile(filePath)

      // ArrayBufferに変換（必要に応じて）
      let audioBuffer: ArrayBuffer
      if (typeof audioData === 'string') {
        // Base64デコードなど必要に応じて処理
        audioBuffer = new ArrayBuffer(0) // 暫定的に空のバッファ
      } else {
        audioBuffer = audioData || new ArrayBuffer(0)
      }

      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return {
          success: false,
          error: {
            type: 'corrupted',
            message: 'ファイルが空かまたは破損しています',
            filePath,
            recoverable: false
          }
        }
      }

      return {
        success: true,
        data: audioBuffer
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `ファイル読み込みエラー: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          details: error,
          recoverable: true
        }
      }
    }
  }

  /**
   * フォルダ内の音声ファイル一覧取得
   * @param folderPath フォルダパス
   * @param filter フィルター条件
   * @returns 音声ファイル一覧
   */
  async getAudioFileList(
    folderPath?: string,
    filter?: FileFilter
  ): Promise<FileResult<AudioFileInfo[]>> {
    try {
      // 1. フォルダパス取得
      const targetPath = folderPath || await this.getCurrentFolder()

      // 2. ファイル一覧取得
      const fileList = await window.electronAPI.getFileList(targetPath)
      
      // 3. 音声ファイルフィルタリング
      const audioFiles = fileList.filter(file => this.isAudioFile(file.filename))

      // 4. 詳細情報取得
      const audioFileInfos: AudioFileInfo[] = []
      
      for (const file of audioFiles) {
        try {
          const audioFileInfo = await this.createAudioFileInfoFromExisting(file)
          
          // フィルター適用
          if (this.matchesFilter(audioFileInfo, filter)) {
            audioFileInfos.push(audioFileInfo)
          }
        } catch (error) {
          console.warn(`Failed to create file info for ${file.filename}:`, error)
          // 個別ファイルのエラーは全体の処理を止めない
        }
      }

      // 5. ソート（作成日時降順）
      audioFileInfos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

      return {
        success: true,
        data: audioFileInfos
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `ファイル一覧取得エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  /**
   * ファイル削除
   * @param filePath ファイルパス
   * @returns 削除成功/失敗
   */
  async deleteFile(filePath: string): Promise<FileResult<void>> {
    try {
      // 1. ファイル存在確認
      const existsResult = await this.checkFileExists(filePath)
      if (!existsResult.success) {
        return existsResult
      }

      // 2. ファイル情報保存（通知用）
      const fileInfo = await this.getFileInfo(filePath)

      // 3. 関連ファイル削除（文字起こしファイル等）
      await this.deleteRelatedFiles(filePath)

      // 4. メインファイル削除
      await window.electronAPI.deleteFile(filePath)

      // 5. 変更通知
      if (fileInfo.success) {
        this.onFileChange?.(fileInfo.data as AudioFileInfo, 'deleted')
      }

      return {
        success: true,
        data: undefined
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `ファイル削除エラー: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          details: error,
          recoverable: true
        }
      }
    }
  }

  /**
   * ファイル情報取得
   * @param filePath ファイルパス
   * @returns ファイル情報
   */
  async getFileInfo(filePath: string): Promise<FileResult<AudioFileInfo>> {
    try {
      // 簡易版実装 - 実際のファイル統計APIが利用可能になったら修正
      const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || ''
      const audioFileInfo = await this.createAudioFileInfo(
        filePath,
        fileName,
        0, // サイズは後で取得
        undefined,
        new Date(), // 作成日時は暫定
        new Date()  // 更新日時は暫定
      )

      return {
        success: true,
        data: audioFileInfo
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'not_found',
          message: `ファイル情報取得エラー: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          details: error,
          recoverable: false
        }
      }
    }
  }

  /**
   * フォルダ選択
   * @returns 選択されたフォルダパス
   */
  async selectFolder(): Promise<FileResult<string>> {
    try {
      const folderPath = await window.electronAPI.selectFolder()
      
      if (!folderPath) {
        return {
          success: false,
          error: {
            type: 'unknown_error',
            message: 'フォルダが選択されませんでした',
            recoverable: true
          }
        }
      }

      return {
        success: true,
        data: folderPath
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `フォルダ選択エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  /**
   * メタデータ保存
   * @param fileName ファイル名
   * @param metadata メタデータ
   */
  async saveMetadata(fileName: string, metadata: Record<string, any>): Promise<FileResult<void>> {
    try {
      await window.electronAPI.saveMetadata(fileName, metadata)
      
      return {
        success: true,
        data: undefined
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `メタデータ保存エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  /**
   * フォルダ監視開始
   * @param folderPath 監視するフォルダパス
   */
  startFolderWatch(folderPath: string): void {
    // ファイル変更の監視
    // 実装は簡易版
    console.log(`Folder watch started: ${folderPath}`)
  }

  /**
   * フォルダ監視停止
   */
  stopFolderWatch(): void {
    console.log('Folder watch stopped')
  }

  // プライベートメソッド

  private sanitizeFileName(fileName: string): string {
    // ファイル名の不正文字を除去
    return fileName
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 255) // ファイル名長制限
  }

  private async getSavePath(): Promise<FileResult<string>> {
    try {
      const settings = await window.electronAPI.loadSettings()
      return {
        success: true,
        data: settings.saveFolder
      }
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: '保存フォルダの取得に失敗しました',
          details: error,
          recoverable: true
        }
      }
    }
  }

  private async getCurrentFolder(): Promise<string> {
    const settings = await window.electronAPI.loadSettings()
    return settings.saveFolder
  }

  private async checkDiskSpace(requiredBytes: number): Promise<FileResult<void>> {
    try {
      // 簡易的なディスク容量チェック（実装暫定版）
      // const diskSpace = await window.electronAPI.getDiskSpace()
      
      // 暫定的に常に成功とする
      return {
        success: true,
        data: undefined
      }

    } catch (error) {
      // チェックに失敗した場合は警告のみで続行
      console.warn('Disk space check failed:', error)
      return {
        success: true,
        data: undefined
      }
    }
  }

  private async checkFileExists(filePath: string): Promise<FileResult<void>> {
    try {
      // 暫定実装 - 実際のfileExists APIが利用可能になったら修正
      // const exists = await window.electronAPI.fileExists(filePath)
      
      // 暫定的に常に存在するとする
      const exists = true
      
      if (!exists) {
        return {
          success: false,
          error: {
            type: 'not_found',
            message: 'ファイルが見つかりません',
            filePath,
            recoverable: false
          }
        }
      }

      return {
        success: true,
        data: undefined
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'unknown_error',
          message: `ファイル存在確認エラー: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
          details: error,
          recoverable: true
        }
      }
    }
  }

  private async createAudioFileInfo(
    filePath: string,
    fileName: string,
    size: number,
    metadata?: Record<string, any>,
    createdAt?: Date,
    modifiedAt?: Date
  ): Promise<AudioFileInfo> {
    // 文字起こしファイルの存在確認
    const hasTranscriptionFile = await this.checkTranscriptionExists(filePath)
    const transcriptionPath = hasTranscriptionFile ? this.getTranscriptionPath(filePath) : undefined

    // 音声ファイルの詳細情報取得（メタデータから）
    const duration = metadata?.duration || 0
    const format = this.getFileExtension(fileName)

    return {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileName,
      filePath,
      format,
      size,
      createdAt: createdAt || new Date(),
      modifiedAt: modifiedAt || new Date(),
      duration,
      metadata,
      hasTranscriptionFile,
      transcriptionPath,
      isRecording: false
    }
  }

  private async createAudioFileInfoFromExisting(fileData: any): Promise<AudioFileInfo> {
    return this.createAudioFileInfo(
      fileData.filepath,
      fileData.filename,
      fileData.size,
      undefined,
      new Date(fileData.createdAt),
      new Date(fileData.createdAt)
    )
  }

  private isAudioFile(fileName: string): boolean {
    const audioExtensions = ['.webm', '.wav', '.mp3', '.m4a', '.aac', '.ogg']
    const extension = this.getFileExtension(fileName).toLowerCase()
    return audioExtensions.includes(extension)
  }

  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.')
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : ''
  }

  private async checkTranscriptionExists(audioFilePath: string): Promise<boolean> {
    try {
      // 暫定実装 - 実際のAPIが利用可能になったら修正
      return await window.electronAPI.checkTranscriptionExists(audioFilePath)
    } catch (error) {
      // API未実装の場合は暫定的にfalse
      return false
    }
  }

  private getTranscriptionPath(audioFilePath: string): string {
    const baseName = audioFilePath.replace(/\.[^/.]+$/, '')
    return `${baseName}.trans.txt`
  }

  private matchesFilter(file: AudioFileInfo, filter?: FileFilter): boolean {
    if (!filter) return true

    // 拡張子フィルター
    if (filter.extensions && filter.extensions.length > 0) {
      const extension = file.format.toLowerCase().replace('.', '')
      if (!filter.extensions.includes(extension)) {
        return false
      }
    }

    // サイズフィルター
    if (filter.minSize && file.size < filter.minSize) {
      return false
    }
    if (filter.maxSize && file.size > filter.maxSize) {
      return false
    }

    // 日付フィルター
    if (filter.dateRange) {
      if (file.createdAt < filter.dateRange.start || file.createdAt > filter.dateRange.end) {
        return false
      }
    }

    // 文字起こしファイル存在フィルター
    if (filter.hasTranscription !== undefined) {
      if (filter.hasTranscription !== file.hasTranscriptionFile) {
        return false
      }
    }

    return true
  }

  private async deleteRelatedFiles(filePath: string): Promise<void> {
    try {
      // 関連ファイル削除（暫定実装）
      try {
        // 文字起こしファイル削除
        const transcriptionPath = this.getTranscriptionPath(filePath)
        await window.electronAPI.deleteFile(transcriptionPath)
      } catch (error) {
        // ファイルが存在しない場合は無視
      }

      try {
        // メタデータファイル削除
        const metadataPath = `${filePath}.meta.json`
        await window.electronAPI.deleteFile(metadataPath)
      } catch (error) {
        // ファイルが存在しない場合は無視
      }

    } catch (error) {
      console.warn('関連ファイル削除エラー:', error)
      // 関連ファイルの削除エラーは主ファイル削除を阻害しない
    }
  }
}