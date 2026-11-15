/**
 * lamejs TypeScript型定義
 * グローバル変数として使用（<script>タグで読み込み）
 */

declare global {
  const lamejs: {
    Mp3Encoder: {
      new(channels: number, sampleRate: number, bitRate: number): {
        encodeBuffer(pcm: Int16Array): Int8Array;
        flush(): Int8Array;
      };
    };
  };
}

export {};