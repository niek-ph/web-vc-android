import { useCallback, useEffect, useRef, useState } from 'react';
import { applyDiscovery, decodeMessage, emptyDiscovery, Media } from './media';

function readManifest(
  url: string,
  frameUrl: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener('abort', abort);
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };
    const abort = () => {
      request.abort();
      fail('Scan cancelled.');
    };
    request.open('GET', url);
    request.timeout = 10000;
    request.setRequestHeader(
      'Accept',
      'application/vnd.apple.mpegurl, application/x-mpegURL, text/plain',
    );
    request.setRequestHeader('Referer', frameUrl);
    request.onprogress = event => {
      if (event.loaded > 200000) {
        fail('This response is too large to be a playlist.');
        request.abort();
      }
    };
    request.onerror = () =>
      fail(
        'Could not read the playlist. Start the video in the page and try again.',
      );
    request.ontimeout = () =>
      fail('The playlist server did not respond in time.');
    request.onload = () => {
      cleanup();
      if (request.status < 200 || request.status >= 300)
        reject(new Error(`Playlist returned HTTP ${request.status}.`));
      else if (
        request.responseText.length > 200000 ||
        !request.responseText.trimStart().startsWith('#EXTM3U')
      )
        reject(new Error('The server did not return an HLS playlist.'));
      else resolve(request.responseText);
    };
    signal.addEventListener('abort', abort);
    if (signal.aborted) abort();
    else request.send();
  });
}

export function useMediaDiscovery() {
  const [discovery, setDiscovery] = useState(emptyDiscovery);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const page = useRef('');
  const exploringPlayers = useRef(false);

  const clear = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setDiscovery(emptyDiscovery());
    setInspecting(null);
    setScanError(null);
  }, []);
  useEffect(() => () => controller.current?.abort(), []);

  function startPage(url: string) {
    clear();
    page.current = url;
    exploringPlayers.current = false;
  }
  function openPlayer() {
    exploringPlayers.current = true;
  }

  function receive(raw: string) {
    const message = decodeMessage(raw);
    if (!message) return;
    if (message.payload.type === 'navigation') {
      if (
        page.current &&
        page.current !== message.pageUrl &&
        !exploringPlayers.current
      )
        clear();
      page.current = message.pageUrl;
      return;
    }
    if (
      page.current &&
      page.current !== message.pageUrl &&
      !exploringPlayers.current
    )
      return;
    setDiscovery(previous =>
      applyDiscovery(previous, message.payload, message.pageUrl),
    );
  }

  async function inspect(item: Media) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setInspecting(item.url);
    setScanError(null);
    try {
      const body = await readManifest(item.url, item.frameUrl, active.signal);
      if (!active.signal.aborted)
        setDiscovery(previous =>
          applyDiscovery(
            previous,
            {
              type: 'manifest',
              url: item.url,
              frameUrl: item.frameUrl,
              title: item.title,
              body,
            },
            page.current || item.frameUrl,
          ),
        );
    } catch (error) {
      if (!active.signal.aborted)
        setScanError(
          error instanceof Error ? error.message : 'Could not inspect stream.',
        );
    } finally {
      if (controller.current === active) {
        setInspecting(null);
        controller.current = null;
      }
    }
  }
  return {
    ...discovery,
    receive,
    startPage,
    openPlayer,
    clear,
    inspect,
    inspecting,
    scanError,
  };
}
