import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Linking, StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { usePreferences } from '../usePreferences';
import { Feedback } from '../ui/common';
import { isLive } from '../data/events';
import { validCoordinate, type Coordinate } from './geometry';
import { isMapCredit, isMapDocument, parseMapMessage, type WebMapState } from './webview/bridge';
import type { EventMapProps } from './types';

let documentPromise: Promise<string> | undefined;
function loadDocument() {
  // Bundle the renderer and worker locally so this works through a Metro tunnel.
  return documentPromise ??= (async () => {
    const asset = Asset.fromModule(require('./webview/event-map.html'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Map document unavailable');
    return new File(asset.localUri).text();
  })().catch(error => { documentPromise = undefined; throw error; });
}

export function EventMapExpoGo(props: EventMapProps) {
  const { copy } = usePreferences();
  // WebView's default generic is undefined, which collapses its props to never.
  const web = useRef<WebView<{}>>(null), latest = useRef(props), ready = useRef(false);
  latest.current = props;
  const [html, setHtml] = useState<string>(), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let disposed = false;
    ready.current = false;
    void loadDocument().then(value => { if (!disposed) setHtml(value); }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; ready.current = false; };
  }, [attempt]);
  useEffect(() => {
    let disposed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!disposed) setReducedMotion(value); }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { disposed = true; listener.remove(); };
  }, []);
  const state = useMemo<WebMapState>(() => ({
    events: props.events.filter(event => validCoordinate(event as Coordinate)).map(event => ({
      id: event.id, title: event.title, latitude: event.latitude!, longitude: event.longitude!, live: isLive(event),
    })),
    center: props.center, zoom: props.zoom, selected: props.selected, location: props.location,
    attributionBottom: props.attributionBottom ?? 112, focus: props.focus ?? null, reducedMotion,
    label: copy('eventMap.map'), clusterLabel: copy('eventMap.cluster', { count: '{count}' }),
  }), [props.events, props.center.latitude, props.center.longitude, props.zoom, props.selected, props.location,
    props.attributionBottom, props.focus?.id, props.focus?.revision, reducedMotion, copy]);
  const serialized = JSON.stringify(state), message = useRef(serialized);
  message.current = serialized;
  useEffect(() => { if (ready.current) web.current?.postMessage(serialized); }, [serialized]);
  // A viewport update must not replace the source and reload the document.
  const source = useMemo(() => html ? { html, baseUrl: 'https://spottr-map.invalid/' } : undefined, [html]);
  const retry = () => { ready.current = false; setFailed(false); setAttempt(value => value + 1); };
  return <>
    {source && <WebView<{}> key={attempt} ref={web} testID="event-map" source={source} style={s.map}
      originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} bounces={false}
      setSupportMultipleWindows={false} allowsInlineMediaPlayback={false}
      onShouldStartLoadWithRequest={request => {
        if (isMapDocument(request.url)) return true;
        if (isMapCredit(request.url)) void Linking.openURL(request.url).catch(() => {});
        return false;
      }}
      onMessage={event => {
        const incoming = parseMapMessage(event.nativeEvent.data);
        if (!incoming) return;
        const current = latest.current;
        switch (incoming.type) {
          case 'ready': ready.current = true; web.current?.postMessage(message.current); break;
          case 'error': setFailed(incoming.failed); break;
          case 'select': if (incoming.id === null || current.events.some(item => item.id === incoming.id)) current.onSelect(incoming.id); break;
          case 'viewport': current.onViewport(incoming.center, incoming.zoom); break;
          case 'point': current.onSelectedPoint(incoming.point); break;
        }
      }}
      onError={() => setFailed(true)} onContentProcessDidTerminate={retry} onRenderProcessGone={retry}/>}
    {failed && <View style={s.failure}><Feedback compact title={copy('feedback.loadFailed')} retry={retry}/></View>}
  </>;
}
const s = StyleSheet.create({
  map: { ...StyleSheet.absoluteFill, backgroundColor: '#101012' },
  failure: { position: 'absolute', top: 90, left: 16, right: 70, backgroundColor: '#19191cf5', borderRadius: 8, padding: 8 },
});
