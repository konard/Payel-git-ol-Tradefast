import { Box, Text } from 'ink';
import React from 'react';

import {
  selectablePlatformIds,
  getPlatformLabel,
  getPlatformDescription,
  type ResearchPlatformId,
} from '../sources.js';
import type { CliTheme } from '../theme.js';

export function PlatformSelector({
  theme,
  cursorIndex,
  enabledGroups,
}: {
  theme: CliTheme;
  cursorIndex: number;
  enabledGroups: ResearchPlatformId[];
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.border}
      paddingX={1}
      marginTop={1}
    >
      <Text bold color={theme.colors.accent}>
        Select research platforms
      </Text>
      <Text color={theme.colors.muted}>
        Space=toggle, Enter=done, Esc=cancel
      </Text>
      {selectablePlatformIds().map((id, index) => {
        const checked = enabledGroups.includes(id);
        const focused = index === cursorIndex;

        return (
          <Text key={id} color={focused ? theme.colors.info : undefined}>
            {focused ? '> ' : '  '}
            <Text bold={focused}>{checked ? '[x]' : '[ ]'}</Text>
            {' '}
            <Text bold={focused && checked}>{getPlatformLabel(id)}</Text>
            {' '}
            <Text color={theme.colors.muted}>{getPlatformDescription(id)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
