import type { ReactElement } from 'react';

export type EventDatePopoverProps = {
  children: ReactElement;
  label: string;
  locale: string;
  value: Date;
  dateOnly: boolean;
  isPresented: boolean;
  onIsPresentedChange: (open: boolean) => void;
  onValueChange: (value: Date) => void;
  triggerHeight: number;
  labels: { day: string; month: string; year: string; hours: string; minutes: string; now: string; done: string };
};

// iOS alone hosts the Apple popover. Web and Android keep their existing picker.
export const supportsEventDatePopover = false;
export function EventDatePopover({ children }: EventDatePopoverProps) { return children; }
