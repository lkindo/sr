'use client';

import { useContext } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { ThemeContext } from '@/components/providers/ThemeProvider';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { isThemePreference } from '@/lib/theme';

const choices = [
  { value: 'light', label: '주간', icon: Sun },
  { value: 'dark', label: '야간', icon: Moon },
  { value: 'system', label: '시스템', icon: Monitor },
] as const;

export function ThemeToggle() {
  const { preference, resolvedTheme, setTheme } = useContext(ThemeContext);
  const selected = choices.find((choice) => choice.value === preference) ?? choices[2];
  const Icon = selected.icon;
  const currentMode =
    preference === 'system'
      ? `시스템 (${resolvedTheme === 'dark' ? '야간' : '주간'})`
      : selected.label;
  const label = `화면 모드: ${currentMode}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-10 shrink-0 px-0 text-foreground sm:w-auto sm:px-3"
          aria-label={label}
          title={label}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{selected.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>화면 모드</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          aria-label="화면 모드"
          value={preference}
          onValueChange={(value) => {
            if (isThemePreference(value)) setTheme(value);
          }}
        >
          {choices.map(({ value, label: choiceLabel, icon: ChoiceIcon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="min-h-10 gap-2">
              <ChoiceIcon className="h-4 w-4" aria-hidden="true" />
              {choiceLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
