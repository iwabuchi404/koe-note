/**
 * Tone.js TypeScript型拡張
 */

declare module 'tone' {
  export class UserMedia extends ToneAudioNode {
    constructor();
    open(): Promise<MediaStream>;
    close(): this;
  }

  export class Recorder extends ToneAudioNode {
    constructor();
    start(): this;
    stop(): Promise<Blob>;
    dispose(): this;
  }

  export function start(): Promise<void>;
  export function getContext(): Context;

  export class Context {
    rawContext: AudioContext;
    state: string;
  }

  export class ToneAudioNode {
    connect(destination: ToneAudioNode): this;
    dispose(): this;
  }
}