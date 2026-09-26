import {
  applyDiscovery,
  decodeMessage,
  describeMedia,
  emptyDiscovery,
  parseHls,
  Media,
} from '../src/features/media/media';
import { mediaRequest } from '../src/features/media/castMedia';

jest.mock('react-native-google-cast', () => ({
  MediaStreamType: { BUFFERED: 'buffered', LIVE: 'live' },
}));
const page = 'https://example.com/movie';
const base: Media = {
  url: 'https://cdn.example.com/film/master.m3u8?token=abc',
  frameUrl: page,
  title: 'Film',
  format: 'HLS',
  mime: 'application/vnd.apple.mpegurl',
  source: 'network',
  subtitles: [],
};
const manifest = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Dutch, Nederlands",LANGUAGE="nl",URI="subs/nl.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",SUBTITLES="subs"
720/index.m3u8?token=def
#EXT-X-STREAM-INF:BANDWIDTH=5200000,RESOLUTION=1920x1080,SUBTITLES="subs"
/1080.m3u8`;

describe('media discovery', () => {
  it('rejects malformed bridge messages and non-web URLs', () => {
    expect(decodeMessage('not json')).toBeNull();
    expect(
      decodeMessage(JSON.stringify({ channel: 'other', pageUrl: page })),
    ).toBeNull();
    expect(
      applyDiscovery(
        emptyDiscovery(),
        { type: 'media', url: 'file:///secrets.mp4' },
        page,
      ).media,
    ).toEqual([]);
  });
  it('merges duplicate discoveries without removing signed query parameters or metadata', () => {
    let state = applyDiscovery(
      emptyDiscovery(),
      {
        type: 'media',
        url: 'https://cdn.example.com/movie.mp4?token=1',
        width: 1920,
        height: 1080,
      },
      page,
    );
    state = applyDiscovery(
      state,
      {
        type: 'media',
        url: 'https://cdn.example.com/movie.mp4?token=1#fragment',
      },
      page,
    );
    expect(state.media).toHaveLength(1);
    expect(state.media[0]).toMatchObject({
      width: 1920,
      height: 1080,
      url: 'https://cdn.example.com/movie.mp4?token=1',
    });
  });
  it('keeps subtitles associated with their player instead of other frames', () => {
    let state = applyDiscovery(
      emptyDiscovery(),
      {
        type: 'subtitle',
        url: 'https://cdn.example.com/nl.vtt',
        language: 'nl',
        frameUrl: 'https://player.example.com/one',
      },
      page,
    );
    state = applyDiscovery(
      state,
      {
        type: 'media',
        url: 'https://cdn.example.com/one.mp4',
        frameUrl: 'https://player.example.com/one',
      },
      page,
    );
    state = applyDiscovery(
      state,
      {
        type: 'media',
        url: 'https://cdn.example.com/two.mp4',
        frameUrl: 'https://player.example.com/two',
      },
      page,
    );
    expect(state.media[0].subtitles[0]).toMatchObject({
      language: 'nl',
      format: 'VTT',
    });
    expect(state.media[1].subtitles).toEqual([]);
  });
  it('lists embedded players separately and deduplicates lazy and active iframe URLs', () => {
    const event = { type: 'player', url: 'https://player.example.com/embed/1' };
    let state = applyDiscovery(emptyDiscovery(), event, page);
    state = applyDiscovery(state, { ...event, label: 'Player 1' }, page);
    expect(state.players).toEqual([{ url: event.url, label: 'Player 1' }]);
    expect(state.media).toEqual([]);
  });
  it('extracts HLS qualities, quoted codecs and relative subtitle URLs', () => {
    const result = parseHls(manifest, base);
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0]).toMatchObject({
      width: 1280,
      height: 720,
      codecs: 'avc1.64001f,mp4a.40.2',
      url: 'https://cdn.example.com/film/720/index.m3u8?token=def',
    });
    expect(result.media.subtitles[0]).toMatchObject({
      label: 'Dutch, Nederlands',
      language: 'nl',
      url: 'https://cdn.example.com/film/subs/nl.m3u8',
    });
    expect(result.media.label).toBe('Auto quality');
  });
  it('does not expose transport segments as separate films', () => {
    const result = parseHls(
      '#EXTM3U\n#EXTINF:4.5,\na.ts\n#EXTINF:5.5,\nb.ts\n#EXT-X-ENDLIST',
      base,
    );
    expect(result.media).toMatchObject({ duration: 10, live: false });
    expect(result.variants).toEqual([]);
  });
  it('marks DRM and separate audio instead of offering a broken quality choice', () => {
    const result = parseHls(
      '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://key"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="audio"\nvideo.m3u8',
      base,
    );
    expect(result.media.protected).toBe(true);
    expect(result.variants[0].requiresMaster).toBe(true);
    expect(() => mediaRequest(result.media)).toThrow('DRM');
  });
  it('labels unavailable resolution honestly and sends selected WebVTT as a text track', () => {
    expect(describeMedia(base)).toContain('Resolution unknown');
    const request = mediaRequest(base, {
      url: 'https://cdn.example.com/nl.vtt',
      label: 'Dutch',
      language: 'nl',
      format: 'VTT',
    });
    expect(request.mediaInfo?.mediaTracks?.[0]).toMatchObject({
      id: 1,
      contentType: 'text/vtt',
      language: 'nl',
      type: 'text',
    });
    expect(request.mediaInfo?.contentUrl).toBe(base.url);
  });
});

it('removes video fragments and subtitle playlists from the film list', () => {
  let state = applyDiscovery(
    emptyDiscovery(),
    { type: 'media', url: 'https://cdn.example.com/film/init.mp4' },
    page,
  );
  state = applyDiscovery(
    state,
    {
      type: 'manifest',
      url: base.url,
      body: '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nchunk.mp4\n#EXT-X-ENDLIST',
    },
    page,
  );
  state = applyDiscovery(
    state,
    { type: 'media', url: 'https://cdn.example.com/film/chunk.mp4' },
    page,
  );
  expect(state.media.map(item => item.url)).toEqual([base.url]);
  state = applyDiscovery(
    state,
    { type: 'manifest', url: base.url, body: manifest },
    page,
  );
  state = applyDiscovery(
    state,
    { type: 'media', url: 'https://cdn.example.com/film/subs/nl.m3u8' },
    page,
  );
  expect(state.media.map(item => item.url)).not.toContain(
    'https://cdn.example.com/film/subs/nl.m3u8',
  );
});
