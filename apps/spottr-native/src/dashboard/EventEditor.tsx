import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
﻿import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { ArrowRight, Check, ChevronDown, Copy, MapPin, Music2, Tags, Trash2 } from "lucide-react-native";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { categories } from "../data/events";
import {
  eventCities,
  eventVibes,
} from "../../../pulse-app/src/features/events/constants";
import { Confirm, Field, dashboardApi, dColors, useAction } from "./common";
import {
  draftFromEvent,
  emptyEvent,
  type DashboardEvent,
  type EventDraft,
} from "./data";
import { EventManagement } from "./EventManagement";
import { DateTimeField } from "./DateTimeField";
import { PlacesField } from "./PlacesField";
import {
  EditorChoice,
  EditorGrid,
  EditorHeading,
  EditorSelect,
  e,
} from "./EditorControls";
import { EditorLineup } from "./EditorLineup";
import { EditorTickets } from "./EditorTickets";
import { EditorBanner } from "./EditorBanner";
import {
  editorErrors,
  canAdvanceEditorStep,
  errorsForStep,
  errorDestination,
  type EditorSection,
} from "./editorModel";

export function EventEditor({
  event,
  template,
  onSaved,
  onDeleted,
  onBack,
  onUseAsTemplate,
  onNavigate,
}: {
  event?: DashboardEvent;
  template?: DashboardEvent;
  onSaved: () => void;
  onDeleted: () => void;
  onBack?: () => void;
  onUseAsTemplate?: () => void;
  onNavigate?: () => void;
}) {
  const { copy, language } = usePreferences(),
    action = useAction(),
    { width } = useWindowDimensions(),
    wide = width >= 640;
  const [draft, setDraft] = useState<EventDraft>(() =>
    event
      ? draftFromEvent(event)
      : template
        ? draftFromEvent(template, true)
        : emptyEvent(),
  );
  const [section, setSection] = useState<EditorSection>("details"),
    [step, setStep] = useState(0),
    [lineupOpen, setLineupOpen] = useState(false),
    [validationFailed, setValidationFailed] = useState(false),
    [validated, setValidated] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [artistBusy, setArtistBusy] = useState(false),
    [bannerBusy, setBannerBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [external, setExternal] = useState(
      !!(event ?? template)?.externalTicketUrl,
    );
  const completed =
    !!event &&
    (Date.parse(event.endTime) <= Date.now() || event.status === "completed");
  const locked =
    !!event &&
    ["cancel_pending", "refunding", "cancelled"].includes(event.status);
  const readOnly = completed || locked,
    busy = action.busy || bannerBusy || artistBusy,
    disabled = readOnly || action.busy;
  const allErrors = editorErrors(draft, external);
  const nextBlocked =
    !event && step < 2 && !canAdvanceEditorStep(draft, external, step);
  const errors = Object.fromEntries(
    Object.entries(allErrors).filter(
      ([key]) => validated.includes(key) || validated.includes("*"),
    ),
  );
  const change = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDirty(true);
    setDraft((old) => ({ ...old, [key]: value }));
  };
  const errorText = (key: string) =>
    errors[key] ? copy(errors[key]) : undefined;
  const report = (nextErrors: Record<string, string>, navigate = false) => {
    setValidated((previous) => [
      ...new Set([...previous, ...Object.keys(nextErrors)]),
    ]);
    if (Object.keys(nextErrors).some((key) => key.startsWith("lineup")))
      setLineupOpen(true);
    if (navigate) {
      const destination = errorDestination(nextErrors, !!event);
      if (destination) {
        setStep(destination.step);
        setSection(destination.section);
      }
    }
    setValidationFailed(true);
    onNavigate?.();
  };
  const go = (next: number) => {
    if (busy) return;
    if (next > step) {
      const currentErrors = errorsForStep(allErrors, step);
      if (Object.keys(currentErrors).length) {
        report(currentErrors);
        return;
      }
    }
    setValidationFailed(false);
    setStep(next);
    onNavigate?.();
  };
  const save = () => {
    if (readOnly || busy) return;
    if (Object.keys(allErrors).length) {
      setValidated(["*"]);
      report(allErrors, true);
      return;
    }
    setValidationFailed(false);
    void action.run(
      () => dashboardApi.saveEvent(draft, event?.id),
      event ? "eventForm.eventSaved" : "eventForm.eventCreated",
      onSaved,
    );
  };
  const date = (
    key: "startTime" | "endTime" | "publishAt",
    label: string,
    placeholder: string,
  ) => (
    <DateTimeField
      label={copy(label)}
      placeholder={copy(placeholder)}
      value={draft[key] ?? ""}
      onChange={(value) => change(key, value)}
      disabled={disabled}
      error={errorText(key)}
    />
  );
  const basics = (
    <View style={e.section}>
      <EditorHeading
        title={copy("eventEditor.basicsTitle")}
        hint={copy("eventEditor.basicsHint")}
      />
      <Field
        testID="editor-title"
        label={copy("eventForm.title")}
        placeholder={copy("eventForm.titlePlaceholder")}
        value={draft.title}
        onChange={(value) => change("title", value)}
        disabled={disabled}
        error={errorText("title")}
        inputStyle={e.input}
      />
      <EditorBanner
        value={draft.bannerUrl}
        onChange={(url) => change("bannerUrl", url)}
        disabled={disabled}
        onBusy={setBannerBusy}
        error={errorText("bannerUrl")}
      />
      <EditorGrid>
        <EditorSelect
          testID="editor-category"
          label={copy("eventForm.category")}
          value={draft.category}
          onChange={(v) => change("category", v)}
          options={categories.map((v) => ({ value: v, label: v }))}
          placeholder={copy("eventForm.categoryPlaceholder")}
          icon={Tags}
          disabled={disabled}
          error={errorText("category")}
        />
        <EditorSelect
          testID="editor-vibe"
          label={copy("filters.vibe")}
          value={draft.vibe}
          onChange={(v) => change("vibe", v)}
          options={eventVibes.map((v) => ({ value: v, label: v }))}
          placeholder={copy("eventForm.vibePlaceholder")}
          icon={Music2}
          disabled={disabled}
          error={errorText("vibe")}
        />
      </EditorGrid>
      <Field
        testID="editor-description"
        label={copy("eventForm.description")}
        placeholder={copy("eventForm.descriptionPlaceholder")}
        value={draft.description ?? ""}
        onChange={(value) => change("description", value)}
        multiline
        disabled={disabled}
        error={errorText("description")}
        inputStyle={[e.input, { minHeight: 126 }]}
      />
    </View>
  );
  const schedule = (
    <View style={e.section}>
      <EditorHeading
        title={copy("eventEditor.scheduleTitle")}
        hint={copy("eventEditor.scheduleHint")}
      />
      <EditorGrid>
        {date("startTime", "eventForm.startDate", "eventForm.chooseStart")}
        {date("endTime", "eventForm.endDate", "eventForm.chooseEnd")}
      </EditorGrid>
      <EditorGrid lastWidth={208}>
        <PlacesField
          value={draft.locationName}
          disabled={disabled}
          error={
            errorText("locationName") ||
            errorText("latitude") ||
            errorText("longitude")
          }
          onChange={(locationName) => {
            setDirty(true);
            setDraft((old) => ({
              ...old,
              locationName,
              googlePlaceId: "",
              latitude: NaN,
              longitude: NaN,
            }));
          }}
          onSelect={(place) => {
            setDirty(true);
            setDraft((old) => ({
              ...old,
              locationName: place.name,
              googlePlaceId: place.placeId,
              latitude: place.lat,
              longitude: place.lng,
            }));
          }}
        />
        <EditorSelect
          testID="editor-city"
          label={copy("eventForm.city")}
          value={draft.city}
          options={eventCities.map((v) => ({ value: v, label: v }))}
          placeholder={copy("eventForm.cityPlaceholder")}
          icon={MapPin}
          onChange={(value) => change("city", value)}
          disabled={disabled}
          error={errorText("city")}
        />
      </EditorGrid>
    </View>
  );
  const publication = (
    <View style={[e.divider, { gap: 20 }]}>
      {!event && (
        <View testID="editor-review" style={{ gap: 8, paddingBottom: 12 }}>
          <EditorHeading title={copy("eventEditor.review")} />
          <Text style={[e.text, { fontSize: 16, fontWeight: "500" }]}>
            {draft.title}
          </Text>
          <Text style={[e.text, { color: dColors.muted }]}>
            {[draft.locationName, draft.city].filter(Boolean).join(" · ")}
          </Text>
          {Number.isFinite(Date.parse(draft.startTime)) && (
            <Text style={[e.text, { color: dColors.muted }]}>
              {new Intl.DateTimeFormat(language === "ro" ? "ro-RO" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(draft.startTime))}
            </Text>
          )}
          <Text style={[e.text, { color: dColors.muted }]}>
            {copy("eventEditor.ticketCount", {
              count: draft.ticketTypes?.length ?? 0,
            })}{" "}
            ·{" "}
            {copy("eventEditor.artistCount", {
              count: draft.lineup?.length ?? 0,
            })}
          </Text>
        </View>
      )}
      <EditorHeading
        title={copy("eventEditor.publication")}
        hint={copy("eventEditor.publicationHint")}
      />
      <EditorGrid columns={3} gap={12}>
        {(completed ? ["completed"] : ["draft", "scheduled", "published"]).map(
          (status) => (
            <EditorChoice
              key={status}
              testID={`editor-status-${status}`}
              selected={
                draft.status === status || (completed && status === "completed")
              }
              label={copy(
                status === "completed"
                  ? "organizerEvents.completed"
                  : `eventForm.${status}`,
              )}
              disabled={disabled}
              onPress={() => change("status", status)}
            />
          ),
        )}
      </EditorGrid>
      {draft.status === "scheduled" &&
        date("publishAt", "eventForm.publishAt", "eventForm.choosePublishTime")}
    </View>
  );
  return (
    <View testID="event-editor">
      {onBack && (
        <GlassPressable fallback={Pressable} glassStyle={{ paddingHorizontal: 12 }}
          accessibilityRole="button"
          onPress={onBack}
          disabled={busy}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
          }}
        >
          <ActionIcon name="back" size={14} color={dColors.muted} />
          <Text style={e.small}>{copy("dashboardNav.backToDashboard")}</Text>
        </GlassPressable>
      )}
      <Text
        accessibilityRole="header"
        style={{
          fontSize: width >= 768 ? 30 : 24,
          lineHeight: width >= 768 ? 36 : 32,
          color: dColors.text,
          fontWeight: "600",
          letterSpacing: -0.75,
          marginTop: 16,
        }}
      >
        {copy(event ? "eventForm.editEvent" : "eventForm.createEvent")}
      </Text>
      {!event && (
        <Text style={[e.hint, { marginTop: 8 }]}>
          {copy("eventEditor.createHint")}
        </Text>
      )}
      {readOnly && (
        <View
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            backgroundColor: "#ffffff05",
            gap: 4,
          }}
        >
          <Text style={[e.text, { fontWeight: "500" }]}>
            {copy(
              completed
                ? "organizerEvents.completed"
                : `eventCancellation.eventStatus.${event!.status}`,
            )}
          </Text>
          <Text style={e.hint}>
            {copy(
              completed
                ? "eventForm.completedReadOnly"
                : "eventCancellation.locked",
            )}
          </Text>
        </View>
      )}
      <View
        testID="editor-navigation"
        accessibilityLabel={copy("eventEditor.navigation")}
        style={{
          marginTop: 28,
          borderBottomWidth: 1,
          borderBottomColor: "#ffffff1a",
          flexDirection: "row",
          gap: 8,
        }}
      >
        {event
          ? (["details", "lineup", "tickets", "admin"] as const).map(
              (value) => (
                <Pressable
                  key={value}
                  testID={`editor-section-${value}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: section === value,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => {
                    setSection(value);
                    setValidationFailed(false);
                    onNavigate?.();
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderBottomWidth: 2,
                    borderBottomColor:
                      section === value ? colors.accent : "transparent",
                    paddingHorizontal: 4,
                    paddingBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: wide ? 14 : 12,
                      fontWeight: "500",
                      color: section === value ? dColors.text : dColors.muted,
                    }}
                  >
                    {copy(`eventEditor.${value}`)}
                  </Text>
                </Pressable>
              ),
            )
          : (["about", "whenWhere", "access"] as const).map((label, i) => (
              <Pressable
                key={label}
                testID={`editor-step-${i}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: step === i,
                  disabled: i > step || busy,
                }}
                disabled={i > step || busy}
                onPress={() => go(i)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: wide ? "row" : "column",
                  alignItems: wide ? "center" : "flex-start",
                  gap: wide ? 12 : 8,
                  paddingHorizontal: 4,
                  paddingBottom: 16,
                  borderBottomWidth: 2,
                  borderBottomColor: step === i ? colors.accent : "transparent",
                  opacity: i > step ? 0.5 : 1,
                }}
              >
                <View
                  style={{
                    height: 24,
                    width: 24,
                    borderRadius: 12,
                    backgroundColor: step === i ? colors.accent : "#ffffff0d",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i < step ? (
                    <Check size={14} color={dColors.muted} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        color: i === step ? "white" : dColors.muted,
                      }}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: wide ? 14 : 12,
                    fontWeight: "500",
                    color: i === step ? dColors.text : dColors.muted,
                  }}
                >
                  {copy(`eventEditor.${label}`)}
                </Text>
              </Pressable>
            ))}
      </View>
      {validationFailed && (
        <Text
          testID="editor-validation-error"
          accessibilityRole="alert"
          style={[e.error, { fontSize: 14, marginTop: 20 }]}
        >
          {copy("eventEditor.fixErrors")}
        </Text>
      )}
      <View style={{ paddingTop: 32 }}>
        {(event ? section === "details" : step === 0) && basics}
        {(event ? section === "details" : step === 1) && (
          <View style={event ? e.divider : undefined}>{schedule}</View>
        )}
        {(event ? section === "lineup" : step === 0) && (
          <View
            style={
              !event
                ? {
                    marginTop: 32,
                    borderTopWidth: 1,
                    borderTopColor: "#ffffff1a",
                    paddingTop: 24,
                  }
                : undefined
            }
          >
            {!event && (
              <Pressable
                testID="editor-lineup-toggle"
                accessibilityRole="button"
                accessibilityState={{ expanded: lineupOpen }}
                disabled={busy}
                onPress={() => setLineupOpen(!lineupOpen)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingVertical: 8,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={[e.text, { fontWeight: "600" }]}>
                    {copy("eventEditor.addLineup")}
                  </Text>
                  <Text style={e.small}>{copy("eventEditor.optional")}</Text>
                </View>
                <ChevronDown
                  size={16}
                  color={dColors.text}
                  style={{
                    transform: [{ rotate: lineupOpen ? "180deg" : "0deg" }],
                  }}
                />
              </Pressable>
            )}
            {(event || lineupOpen) && (
              <View style={!event ? { paddingTop: 20 } : undefined}>
                <EditorLineup
                  value={draft.lineup ?? []}
                  onChange={(artists) => change("lineup", artists)}
                  disabled={disabled}
                  showHeading={!!event}
                  errors={errors}
                  onBusy={setArtistBusy}
                />
              </View>
            )}
          </View>
        )}
        {(event ? section === "tickets" : step === 2) && (
          <EditorTickets
            draft={draft}
            change={change}
            external={external}
            onExternal={(value) => {
              setExternal(value);
              setDirty(true);
              setDraft((old) =>
                value
                  ? {
                      ...old,
                      ticketTypes: [],
                      organizerAbsorbsServiceFee: false,
                    }
                  : { ...old, externalTicketUrl: "" },
              );
            }}
            disabled={disabled}
            errors={errors}
          />
        )}
        {(event ? section === "details" : step === 2) && publication}
        {event && section === "admin" && (
          <>
            <EventManagement event={event} readOnly={readOnly} />
            {!readOnly && (
              <View
                style={{
                  marginTop: 32,
                  borderTopWidth: 1,
                  borderTopColor: "#ffffff1a",
                  paddingTop: 24,
                }}
              >
                <Pressable
                  testID="editor-delete"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setConfirm(true)}
                  style={[e.ghost, { alignSelf: "flex-start" }]}
                >
                  <Trash2 size={16} color="#f87171" />
                  <Text
                    style={[e.text, { color: "#f87171", fontWeight: "500" }]}
                  >
                    {copy("eventForm.deleteEvent")}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
      {action.feedback}
      {(!readOnly || onUseAsTemplate) && (!event || section !== "admin") && (
        <View
          style={{
            marginTop: 32,
            borderTopWidth: 1,
            borderTopColor: "#ffffff1a",
            paddingTop: 24,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {!event && step > 0 && (
              <GlassPressable fallback={Pressable}
                testID="editor-back"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => go(step - 1)}
                style={e.ghost}
              >
                <ActionIcon name="back" size={16} color={dColors.muted} />
                <Text
                  style={[e.text, { color: dColors.muted, fontWeight: "500" }]}
                >
                  {copy("common.back")}
                </Text>
              </GlassPressable>
            )}
            {event && !readOnly && wide && (
              <Text style={[e.small, { flex: 1 }]}>
                {copy(dirty ? "eventEditor.unsaved" : "eventEditor.editHint")}
              </Text>
            )}
            <Pressable
              testID={!event && step < 2 ? "editor-next" : "editor-submit"}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || nextBlocked }}
              disabled={busy || nextBlocked}
              onPress={() =>
                readOnly
                  ? onUseAsTemplate?.()
                  : !event && step < 2
                    ? go(step + 1)
                    : save()
              }
              style={{
                marginLeft: "auto",
                flex: wide && !readOnly ? undefined : 1,
                height: 44,
                borderRadius: 99,
                paddingHorizontal: 24,
                backgroundColor: colors.accent,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                opacity: busy || nextBlocked ? 0.6 : 1,
              }}
            >
              {action.busy && <ActivityIndicator size="small" color="white" />}
              {readOnly && <Copy size={16} color="white" />}
              <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>
                {copy(
                  action.busy
                    ? "eventEditor.saving"
                    : readOnly
                      ? "eventForm.useAsTemplate"
                      : !event && step < 2
                        ? "common.next"
                        : event
                          ? "eventForm.saveChanges"
                          : draft.status === "published"
                            ? "eventEditor.publish"
                            : draft.status === "scheduled"
                              ? "eventEditor.schedule"
                              : "eventEditor.saveDraft",
                )}
              </Text>
              {!event && step < 2 && <ArrowRight size={16} color="white" />}
            </Pressable>
          </View>
        </View>
      )}
      {confirm && (
        <Confirm
          title={copy("eventForm.deleteDialogTitle")}
          detail={copy("eventForm.deleteDialogHint")}
          busy={action.busy}
          onClose={() => setConfirm(false)}
          onConfirm={() =>
            void action.run(
              () => dashboardApi.deleteEvent(event!.id),
              "eventForm.eventDeleted",
              onDeleted,
            )
          }
        />
      )}
    </View>
  );
}
