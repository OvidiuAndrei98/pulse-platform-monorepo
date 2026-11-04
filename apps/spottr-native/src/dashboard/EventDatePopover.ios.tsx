import React, { useMemo, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { useWindowDimensions } from 'react-native';
import type { EventDatePopoverProps } from './EventDatePopover';
import { withPickerDate, withPickerParts } from './datePickerParts';
import { colors } from '../ui/theme';
import { supportsLiquidGlass } from '../ui/GlassSurface';

// Existing binaries without ExpoUI retain the community UIDatePicker fallback.
export const supportsEventDatePopover = !!requireOptionalNativeModule('ExpoUI');
const ui: typeof import('@expo/ui/swift-ui') | null = supportsEventDatePopover ? require('@expo/ui/swift-ui') : null;
const modifiers: typeof import('@expo/ui/swift-ui/modifiers') | null = supportsEventDatePopover ? require('@expo/ui/swift-ui/modifiers') : null;

export function EventDatePopover(props: EventDatePopoverProps) {
  const { width } = useWindowDimensions();
  const content = useRef<React.ReactElement | null>(null);
  const wasPresented = useRef(false);
  const generation = useRef(0);
  if (!ui || !modifiers) return props.children;
  const { Host, Popover, RNHostView } = ui;
  const present = (open: boolean) => {
    if (!open) wasPresented.current = false;
    props.onIsPresentedChange(open);
  };
  if (props.isPresented) {
    if (!wasPresented.current) generation.current++;
    const session = generation.current;
    const isActive = () => wasPresented.current && generation.current === session;
    content.current = <NativeDateContent key={session} {...props} width={Math.min(380, width - 40)}
      isActive={isActive} onIsPresentedChange={present}
      onValueChange={value => { if (isActive()) props.onValueChange(value); }} />;
  }
  wasPresented.current = props.isPresented;
  return <Host colorScheme="dark" seedColor={colors.accent} style={{ height: props.triggerHeight }}>
    <Popover isPresented={props.isPresented} onIsPresentedChange={present}>
      <Popover.Trigger><RNHostView>{props.children}</RNHostView></Popover.Trigger>
      {/* Keep the body during UIKit's dismissal, avoiding a blank/shrinking panel. */}
      <Popover.Content>{content.current}</Popover.Content>
    </Popover>
  </Host>;
}

function NativeDateContent({ value, onValueChange, onIsPresentedChange, isActive, label, locale, dateOnly, labels, width }:
  EventDatePopoverProps & { width: number; isActive: () => boolean }) {
  const { VStack, HStack, DatePicker, Text, Button, GlassEffectContainer, Menu, Image } = ui!;
  const { frame, font, foregroundStyle, padding, datePickerStyle, labelsHidden, clipped, lineLimit,
    environment, buttonStyle, glassEffect, background, shapes, accessibilityLabel } = modifiers!;
  const [current, setCurrent] = useState(value);
  const currentRef = useRef(value);
  const minimumYear = useRef(new Date().getFullYear()).current;
  const years = useRef(Array.from({ length: Math.max(value.getFullYear(), minimumYear) - minimumYear + 11 }, (_, i) => minimumYear + i)).current;
  const months = useMemo(() => {
    const full = new Intl.DateTimeFormat(locale, { month: 'long' });
    const short = new Intl.DateTimeFormat(locale, { month: 'short' });
    const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    return Array.from({ length: 12 }, (_, month) => {
      const date = new Date(2000, month, 1);
      return { month, label: capitalized(full.format(date)), shortLabel: capitalized(short.format(date)) };
    });
  }, [locale]);
  const change = (date: Date) => {
    if (!isActive() || !Number.isFinite(date.getTime()) || date.getFullYear() < minimumYear) return;
    // Confirm once: scrolling must not rerender/validate the entire event form.
    const next = dateOnly ? withPickerDate(currentRef.current, date) : new Date(date);
    if (Math.floor(next.getTime() / 60_000) === Math.floor(currentRef.current.getTime() / 60_000)) return;
    currentRef.current = next;
    setCurrent(next);
  };
  const confirm = () => {
    if (!isActive()) return;
    const confirmed = new Date(currentRef.current);
    confirmed.setSeconds(0, 0);
    onValueChange(confirmed);
    onIsPresentedChange(false);
  };
  const innerWidth = width - 32;
  const compactHeader = innerWidth < 300;
  const selectedMonth = months[current.getMonth()]!;
  const monthWidth = compactHeader ? 78 : 110;
  const yearWidth = 76;
  const headerControlsWidth = monthWidth + yearWidth + 4;
  const buttonWidth = (innerWidth - 8) / 2;
  const action = (text: string, primary: boolean, onPress: () => void) => <Button onPress={onPress}
    modifiers={[buttonStyle('plain'), ...(supportsLiquidGlass
      ? [glassEffect({ glass: { variant: 'regular', interactive: true, ...(primary ? { tint: colors.accent } : {}) }, shape: 'capsule' })]
      : [background(primary ? colors.accent : '#ffffff12', shapes.capsule())])]}>
    <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(colors.text), frame({ width: buttonWidth, height: 44 })]}>{text}</Text>
  </Button>;
  return <VStack spacing={8} modifiers={[padding({ all: 16 }), frame({ width, height: 340 })]}>
    <HStack spacing={8} modifiers={[frame({ width: innerWidth, height: 32 })]}>
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(colors.text), lineLimit(1),
        frame({ width: dateOnly ? innerWidth : innerWidth - headerControlsWidth - 8, height: 32, alignment: 'leading' })]}>{label}</Text>
      {!dateOnly && <HStack spacing={4} modifiers={[frame({ width: headerControlsWidth, height: 32 })]}>
        <Menu label={<HStack spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(colors.text), lineLimit(1)]}>
            {compactHeader ? selectedMonth.shortLabel : selectedMonth.label}
          </Text>
          <Image systemName="chevron.down" modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(colors.accent)]}/>
        </HStack>} modifiers={[frame({ width: monthWidth, height: 32 }), accessibilityLabel(labels.month)]}>
          {months.map(({ month, label: monthLabel }) => <Button key={month} label={monthLabel}
            systemImage={month === current.getMonth() ? 'checkmark' : undefined}
            onPress={() => change(withPickerParts(currentRef.current, { month }))}/>)}
        </Menu>
        <Menu label={<HStack spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(colors.text)]}>{String(current.getFullYear())}</Text>
          <Image systemName="chevron.down" modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(colors.accent)]}/>
        </HStack>} modifiers={[frame({ width: yearWidth, height: 32 }), accessibilityLabel(labels.year)]}>
          {years.map(year => <Button key={year} label={String(year)} systemImage={year === current.getFullYear() ? 'checkmark' : undefined}
            onPress={() => change(withPickerParts(currentRef.current, { year }))}/>)}
        </Menu>
      </HStack>}
    </HStack>
    {/* UIKit owns wheel reuse, momentum, calendar boundaries and time selection.
        No copied rows, JS recentering, or programmatic spin-to-middle. */}
    <DatePicker title={label} selection={current} displayedComponents={dateOnly ? ['date'] : ['date', 'hourAndMinute']}
      range={{ start: new Date(minimumYear, 0, 1) }} onDateChange={change}
      modifiers={[datePickerStyle('wheel'), labelsHidden(), environment('locale', locale),
        frame({ width: innerWidth, height: 216 }), clipped()]}/>
    <GlassEffectContainer spacing={12}>
      <HStack spacing={8} modifiers={[frame({ width: innerWidth, height: 44 })]}>
        {action(labels.now, false, () => change(new Date()))}
        {action(labels.done, true, confirm)}
      </HStack>
    </GlassEffectContainer>
  </VStack>;
}
