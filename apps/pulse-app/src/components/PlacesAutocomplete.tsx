"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {Input as UIInput} from '@/components/ui/Field';

export interface PlaceResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

interface PlacesAutocompleteProps {
  onSelect: (place: PlaceResult) => void;
  value: string;
  onChange: (value: string) => void;
  ready: boolean;
  placeholder?: string;
  className?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
  }
}

export function PlacesAutocomplete({
  onSelect,
  value,
  onChange,
  ready,
  placeholder,
  className,
}: PlacesAutocompleteProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common.locationSearchPlaceholder");
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google?.maps?.places) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ["establishment"],
        fields: ["place_id", "name", "geometry"],
      },
    );

    const listener = autocompleteRef.current.addListener(
      "place_changed",
      () => {
        const place = autocompleteRef.current.getPlace();
        if (!place?.place_id || !place?.geometry?.location) return;

        onSelectRef.current({
          placeId: place.place_id,
          name: place.name ?? "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      },
    );

    return () => {
      window.google?.maps?.event?.removeListener(listener);
    };
  }, [ready]);

  return (
    <UIInput
      ref={inputRef}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={resolvedPlaceholder}
      className={className}
      autoComplete="off"
    />
  );
}
