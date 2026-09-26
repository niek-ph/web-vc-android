import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CastPanel } from '../src/features/cast/CastPanel';
import { useCastController } from '../src/features/cast/useCastController';
let controller: ReturnType<typeof useCastController>;
function TestPanel() {
  controller = useCastController();
  return <CastPanel controller={controller} />;
}

const mockLoad = jest.fn();
const mockRemove = jest.fn();
let mockStatusListener: (status: unknown) => void;
const mockClient = {
  loadMedia: mockLoad,
  setActiveTrackIds: jest.fn().mockResolvedValue(undefined),
  getMediaStatus: jest.fn().mockResolvedValue(null),
  onMediaStatusUpdated: jest.fn(listener => {
    mockStatusListener = listener;
    return { remove: mockRemove };
  }),
};

jest.mock('react-native-google-cast', () => ({
  useRemoteMediaClient: () => mockClient,
  MediaStreamType: { BUFFERED: 'buffered' },
  MediaPlayerState: {
    IDLE: 'idle',
    LOADING: 'loading',
    PLAYING: 'playing',
    PAUSED: 'paused',
    BUFFERING: 'buffering',
  },
  MediaPlayerIdleReason: { ERROR: 'error', FINISHED: 'finished' },
}));

describe('sample casting', () => {
  let screen: ReactTestRenderer;
  const originalFetch = globalThis.fetch;
  const mockFetch = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'video/mp4' },
    });
    mockLoad.mockResolvedValue(undefined);
    await act(async () => {
      screen = create(<TestPanel />);
    });
  });

  afterEach(async () => {
    await act(async () => screen.unmount());
    globalThis.fetch = originalFetch;
  });

  it('only casts after a press and sends a buffered MP4 request', async () => {
    expect(mockLoad).not.toHaveBeenCalled();
    await act(async () =>
      screen.root.findByProps({ testID: 'cast-sample' }).props.onPress(),
    );
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaInfo: expect.objectContaining({
          contentUrl:
            'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          contentType: 'video/mp4',
          streamType: 'buffered',
        }),
      }),
    );
  });

  it('shows a 403 failure without sending a broken URL to the TV', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    await act(async () =>
      screen.root.findByProps({ testID: 'cast-sample' }).props.onPress(),
    );
    expect(mockLoad).not.toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).toContain('HTTP 403');
  });

  it('loads a selected website video before enabling its selected subtitle', async () => {
    await act(async () => {
      await controller.castMedia(
        {
          url: 'https://example.com/film.mp4',
          frameUrl: 'https://example.com',
          title: 'Chosen film',
          format: 'MP4',
          mime: 'video/mp4',
          source: 'video',
          subtitles: [],
        },
        {
          url: 'https://example.com/nl.vtt',
          format: 'VTT',
          label: 'Dutch',
          language: 'nl',
        },
      );
    });
    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaInfo: expect.objectContaining({
          contentUrl: 'https://example.com/film.mp4',
        }),
      }),
    );
    expect(mockClient.setActiveTrackIds).toHaveBeenCalledWith([1]);
    expect(mockLoad.mock.invocationCallOrder[0]).toBeLessThan(
      mockClient.setActiveTrackIds.mock.invocationCallOrder[0],
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows an asynchronous receiver error after the load was accepted', async () => {
    await act(async () =>
      screen.root.findByProps({ testID: 'cast-sample' }).props.onPress(),
    );
    await act(async () =>
      mockStatusListener({ playerState: 'idle', idleReason: 'error' }),
    );
    expect(JSON.stringify(screen.toJSON())).toContain(
      'Your TV could not fetch or play the video',
    );
  });
});
