'use client';

import { useCallback, useMemo, useState } from 'react';

import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../shadcn/select';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '../shadcn/dropdown-menu';
import { Trans } from './trans';

export function LanguageSelector({
  onChange,
}: {
  onChange?: (locale: string) => unknown;
}) {
  const { i18n } = useTranslation();
  const { language: currentLanguage, options } = i18n;

  const locales = (options.supportedLngs as string[]).filter(
    (locale) => locale.toLowerCase() !== 'cimode',
  );

  const languageNames = useMemo(() => {
    return new Intl.DisplayNames([currentLanguage], {
      type: 'language',
    });
  }, [currentLanguage]);

  const [value, setValue] = useState(i18n.language);

  const languageChanged = useCallback(
    async (locale: string) => {
      setValue(locale);

      if (onChange) {
        onChange(locale);
      }

      await i18n.changeLanguage(locale);

      // refresh cached translations
      window.location.reload();
    },
    [i18n, onChange],
  );

  return (
    <Select value={value} onValueChange={languageChanged}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {locales.map((locale) => {
          const label = capitalize(languageNames.of(locale) ?? locale);

          const option = {
            value: locale,
            label,
          };

          return (
            <SelectItem value={option.value} key={option.value}>
              {option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function SubMenuLanguageSelector() {
  const { i18n } = useTranslation();
  const { language: currentLanguage, options } = i18n;

  const locales = (options.supportedLngs as string[]).filter(
    (locale) => locale.toLowerCase() !== 'cimode',
  );

  const languageNames = useMemo(() => {
    return new Intl.DisplayNames([currentLanguage], {
      type: 'language',
    });
  }, [currentLanguage]);

  const languageChanged = useCallback(
    async (locale: string) => {
      await i18n.changeLanguage(locale);
      window.location.reload();
    },
    [i18n],
  );

  const MenuItems = useMemo(
    () =>
      locales.map((locale) => {
        const isSelected = i18n.language === locale;
        const label = capitalize(languageNames.of(locale) ?? locale);

        return (
          <DropdownMenuItem
            className={cn('flex cursor-pointer items-center space-x-2', {
              'bg-muted': isSelected,
            })}
            key={locale}
            onClick={() => languageChanged(locale)}
          >
            <span>{label}</span>
          </DropdownMenuItem>
        );
      }),
    [i18n.language, languageChanged, languageNames, locales],
  );

  const currentLanguageLabel = capitalize(
    languageNames.of(i18n.language) ?? i18n.language
  );

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={
            'hidden w-full items-center justify-between gap-x-3 lg:flex'
          }
        >
          <span className={'flex space-x-2'}>
            <Languages className="h-4 w-4" />
            <span>
              <Trans i18nKey={'account:language'} />
            </span>
          </span>
        </DropdownMenuSubTrigger>

        <DropdownMenuSubContent>{MenuItems}</DropdownMenuSubContent>
      </DropdownMenuSub>

      <div className={'lg:hidden'}>
        <DropdownMenuLabel>
          <Trans i18nKey={'account:language'} />
        </DropdownMenuLabel>

        {MenuItems}
      </div>
    </>
  );
}

function capitalize(lang: string) {
  return lang.slice(0, 1).toUpperCase() + lang.slice(1);
}
