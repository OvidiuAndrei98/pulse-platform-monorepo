import React from 'react';
import { ActionIconFallback, type ActionIconProps } from './ActionIconFallback';

export function ActionIcon(props: ActionIconProps) {
  return <ActionIconFallback {...props} size={Math.max(22, props.size ?? 24)}
    strokeWidth={2} />;
}
