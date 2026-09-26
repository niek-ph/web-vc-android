import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { WebView } from 'react-native-webview';
import { BrowserScreen } from '../src/features/browser/BrowserScreen';

const mockStopLoading = jest.fn();
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  return {
    WebView: ReactModule.forwardRef((props: object, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({
        stopLoading: mockStopLoading,
      }));
      return ReactModule.createElement('WebViewMock', props);
    }),
  };
});
jest.mock('react-native-google-cast', () => ({ CastButton: () => null }));
jest.mock('../src/features/media/MediaList', () => ({ MediaList: () => null }));
jest.mock('../src/features/cast/useCastController', () => ({
  useCastController: () => ({}),
}));
jest.mock('../src/features/cast/CastPanel', () => ({ CastPanel: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

describe('browser loading', () => {
  let screen: ReactTestRenderer;
  beforeEach(async () => {
    jest.useFakeTimers();
    mockStopLoading.mockClear();
    await act(async () => {
      screen = create(<BrowserScreen />);
    });
    await act(async () =>
      screen.root
        .findByType(TextInput)
        .props.onChangeText('https://example.com'),
    );
    await act(async () =>
      screen.root.findByType(TextInput).props.onSubmitEditing(),
    );
  });
  afterEach(async () => {
    await act(async () => screen.unmount());
    jest.useRealTimers();
  });

  it('ends a stuck load with an actionable error', async () => {
    await act(async () => jest.advanceTimersByTime(30000));
    expect(mockStopLoading).toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).toContain(
      'This page took too long to load',
    );
  });

  it('clears the timeout when progress completes even without a load-end event', async () => {
    await act(async () =>
      screen.root
        .findByType(WebView)
        .props.onLoadProgress({ nativeEvent: { progress: 1 } }),
    );
    await act(async () => jest.advanceTimersByTime(30000));
    expect(mockStopLoading).not.toHaveBeenCalled();
    expect(JSON.stringify(screen.toJSON())).not.toContain(
      'This page took too long',
    );
  });

  it('reports HTTP failures instead of silently leaving a white page', async () => {
    await act(async () =>
      screen.root
        .findByType(WebView)
        .props.onHttpError({ nativeEvent: { statusCode: 403 } }),
    );
    expect(JSON.stringify(screen.toJSON())).toContain('HTTP 403');
    await act(async () => jest.advanceTimersByTime(30000));
    expect(mockStopLoading).not.toHaveBeenCalled();
  });
});
