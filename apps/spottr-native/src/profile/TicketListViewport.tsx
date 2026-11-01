import React from 'react';
import { View, type FlatListInstance } from 'react-native';
import Animated from 'react-native-reanimated';
import { walletLayout } from './useWalletLists';

const renderRow = ({ item }: { item: React.ReactNode }) => <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 16 }}>{item}</View>;
const key = (item: React.ReactNode, index: number) => React.isValidElement(item) && item.key != null ? String(item.key) : String(index);

/** Retain the first viewport of both categories; switching tabs never rebuilds it. */
export const TicketListViewport = React.memo(function TicketListViewport({ rows, top, bottom, scrollRef, testID }: {
  rows: React.ReactNode[]; top: number; bottom: number; testID: string;
  scrollRef: React.RefObject<FlatListInstance | null>;
}) {
  return <Animated.FlatList ref={scrollRef} testID={testID} style={{ flex: 1 }} contentInsetAdjustmentBehavior="never" itemLayoutAnimation={walletLayout}
    initialNumToRender={6} maxToRenderPerBatch={3} updateCellsBatchingPeriod={50} windowSize={3} removeClippedSubviews={false}
    data={rows} keyExtractor={key} renderItem={renderRow} scrollIndicatorInsets={{ top }}
    contentContainerStyle={{ paddingTop: top + 12, paddingBottom: Math.max(12, bottom) }}/>;
});
