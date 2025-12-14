export type TrackData = {
  name: string;
  flags: number;
  volume: number;
  pan: number;
  peak: number;
  color: string;
  isMuted: boolean;
  isSoloed: boolean;
  isRecordArmed: boolean;
};

export type Globals = {
  masterOnLeft: boolean;
  isConnected: boolean;
  hiddenTracks: {
    [key: number]: boolean;
  };
  masterChannel: HTMLDivElement;
  currentMenuChannel: number;
  channels: {
    [key: number]: HTMLDivElement;
  };
};
