/**
 * LibraryContext - ファイルライブラリの状態管理
 *
 * 此前は App.tsx の AppContext（fileList / selectedFile / isPlaying 等を
 * 混在させた god context）に置かれていた。ライブラリドメインの状態だけを
 * ここに集約する。
 */
import React, { createContext, useContext, useState } from 'react'
import type { AudioFile } from '@shared/types'

interface LibraryContextType {
  /** 作業フォルダ内のファイル一覧 */
  fileList: AudioFile[]
  setFileList: React.Dispatch<React.SetStateAction<AudioFile[]>>
}

const LibraryContext = createContext<LibraryContextType | null>(null)

export const useLibraryContext = (): LibraryContextType => {
  const context = useContext(LibraryContext)
  if (!context) {
    throw new Error('useLibraryContext must be used within LibraryProvider')
  }
  return context
}

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fileList, setFileList] = useState<AudioFile[]>([])

  return (
    <LibraryContext.Provider value={{ fileList, setFileList }}>
      {children}
    </LibraryContext.Provider>
  )
}
