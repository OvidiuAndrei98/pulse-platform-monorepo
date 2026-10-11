import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { ChevronDown, Plus, Trash2 } from "lucide-react-native";
import { useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { Field, dColors, useDashboardQuery } from "./common";
import { DateTimeField } from "./DateTimeField";
import {
  EditorChoice,
  EditorGrid,
  EditorHeading,
  EditorStepper,
  e,
} from "./EditorControls";
import type { EventDraft, OrganizerProfile } from "./data";
import type { EditorErrors } from "./editorModel";

export function EditorTickets({
  draft,
  change,
  external,
  onExternal,
  disabled,
  errors,
}: {
  draft: EventDraft;
  change: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  external: boolean;
  onExternal: (external: boolean) => void;
  disabled: boolean;
  errors: EditorErrors;
}) {
  const { copy } = usePreferences(),
    { user } = useAuth(),
    wide = useWindowDimensions().width >= 640;
  const profile = useDashboardQuery<OrganizerProfile>(
    `/dashboard/organizer/profile/${user?.id}`,
  );
  const canSell = !!(
    profile.data?.stripeChargesEnabled && profile.data?.stripePayoutsEnabled
  );
  const [expanded, setExpanded] = useState<number>();
  const types = draft.ticketTypes ?? [],
    hasPaid = types.some((t) => t.priceRon > 0);
  const update = (i: number, patch: Partial<(typeof types)[number]>) =>
    change(
      "ticketTypes",
      types.map((t, j) => (i === j ? { ...t, ...patch } : t)),
    );
  const error = (i: number, key: string) =>
    errors[`ticketTypes.${i}.${key}`]
      ? copy(errors[`ticketTypes.${i}.${key}`]!)
      : undefined;
  return (
    <View>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: wide ? "flex-start" : "stretch",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <EditorHeading
            title={copy("ticketForm.title")}
            hint={copy(
              external ? "ticketForm.salesMethodHint" : "ticketForm.hint",
            )}
          />
        </View>
        {!disabled && !external && (
          <Pressable
            testID="editor-ticket-add"
            accessibilityRole="button"
            onPress={() => {
              change("ticketTypes", [
                ...types,
                {
                  name: "",
                  priceRon: 0,
                  capacity: 50,
                  description: "",
                  startSales: "",
                  endSales: "",
                },
              ]);
              setExpanded(types.length);
            }}
            style={e.accentSmall}
          >
            <Plus size={16} color={colors.accent} />
            <Text style={[e.text, { color: colors.accent, fontWeight: "500" }]}>
              {copy("ticketForm.addType")}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={{ marginTop: 20, gap: 8 }}>
        <Text style={[e.text, { fontWeight: "500" }]}>
          {copy("ticketForm.salesMethod")}
        </Text>
        <EditorGrid gap={8}>
          {([false, true] as const).map((isExternal) => (
            <EditorChoice
              key={String(isExternal)}
              testID={`editor-sales-${isExternal ? "external" : "spottr"}`}
              label={copy(
                isExternal
                  ? "ticketForm.sellExternally"
                  : "ticketForm.sellOnSpottr",
              )}
              selected={external === isExternal}
              disabled={disabled}
              onPress={() => onExternal(isExternal)}
              style={{
                minHeight: 48,
                backgroundColor:
                  external === isExternal ? "#ff00441a" : "#ffffff05",
                borderColor:
                  external === isExternal ? colors.accent : "#ffffff1a",
              }}
            />
          ))}
        </EditorGrid>
      </View>
      {external ? (
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            gap: 8,
          }}
        >
          <Field
            testID="editor-external-url"
            label={copy("ticketForm.externalUrl")}
            value={draft.externalTicketUrl ?? ""}
            onChange={(value) => change("externalTicketUrl", value)}
            placeholder="https://tickets.example.com/event"
            disabled={disabled}
            error={
              errors.externalTicketUrl
                ? copy(errors.externalTicketUrl)
                : undefined
            }
            inputStyle={e.input}
          />
          <Text style={e.small}>{copy("ticketForm.externalUrlHint")}</Text>
        </View>
      ) : (
        <>
          {!canSell && !disabled && (
            <Text style={[e.small, { color: "#fbbf24", marginTop: 12 }]}>
              {copy("ticketForm.stripeRequired")}
            </Text>
          )}
          <View
            style={{
              marginTop: 20,
              borderWidth: 1,
              borderColor: "#ffffff1a",
              borderRadius: 12,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={[e.text, { fontWeight: "500" }]}>
              {copy("ticketForm.vatLabel")}
            </Text>
            {(
              [
                { value: 21, key: "ticketForm.vatStandard" },
                { value: 11, key: "ticketForm.vatReduced" },
                { value: 0, key: "ticketForm.noVat" },
              ] as const
            ).map((option) => (
              <EditorChoice
                key={option.value}
                testID={`editor-vat-${option.value}`}
                boxed={false}
                label={copy(option.key)}
                selected={draft.vatPercentage === option.value}
                disabled={disabled}
                onPress={() => change("vatPercentage", option.value)}
              />
            ))}
            {errors.vatPercentage && (
              <Text style={e.error}>{copy(errors.vatPercentage)}</Text>
            )}
            <Text style={e.small}>{copy("ticketForm.vatHint")}</Text>
          </View>
          {!!types.length && hasPaid && (
            <EditorChoice
              checkbox
              boxed={false}
              label={copy("ticketForm.absorbFee")}
              hint={copy("ticketForm.absorbFeeHint")}
              selected={!!draft.organizerAbsorbsServiceFee}
              disabled={disabled}
              onPress={() =>
                change(
                  "organizerAbsorbsServiceFee",
                  !draft.organizerAbsorbsServiceFee,
                )
              }
              style={{
                marginTop: 20,
                paddingVertical: 12,
                alignItems: "flex-start",
              }}
            />
          )}
          {!types.length && (
            <Text style={[e.hint, { paddingVertical: 32 }]}>
              {copy("eventEditor.noTickets")}
            </Text>
          )}
          <View style={{ marginTop: 16 }}>
            {types.map((ticket, i) => {
              const invalid = Object.keys(errors).some((key) =>
                key.startsWith(`ticketTypes.${i}.`),
              );
              const open = expanded === i || invalid;
              return (
                <View
                  testID={`editor-ticket-${i}`}
                  key={ticket.id || i}
                  style={{
                    paddingVertical: 8,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: "#ffffff1a",
                  }}
                >
                  <Pressable
                    testID={`editor-ticket-toggle-${i}`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    onPress={() => setExpanded(expanded === i ? undefined : i)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 16,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[e.text, { fontWeight: "600" }]}>
                        {ticket.name || copy("eventEditor.newTicket")}
                      </Text>
                      <Text style={[e.text, { color: dColors.muted }]}>
                        {copy("eventEditor.ticketSummary", {
                          price: ticket.priceRon ?? 0,
                          count: ticket.capacity ?? 0,
                        })}
                      </Text>
                    </View>
                    <ChevronDown
                      size={16}
                      color={dColors.muted}
                      style={{
                        transform: [{ rotate: open ? "180deg" : "0deg" }],
                      }}
                    />
                  </Pressable>
                  {open && (
                    <View style={{ paddingTop: 4, paddingBottom: 20, gap: 12 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Field
                          testID={`editor-ticket-name-${i}`}
                          hideLabel
                          label={copy("ticketForm.ticketName")}
                          placeholder={copy("ticketForm.ticketName")}
                          value={ticket.name}
                          onChange={(name) => update(i, { name })}
                          disabled={disabled}
                          error={error(i, "name")}
                          style={{ flex: 1 }}
                          inputStyle={e.input}
                        />
                        <Pressable
                          testID={`editor-ticket-delete-${i}`}
                          accessibilityRole="button"
                          accessibilityLabel={copy("ticketForm.deleteType")}
                          disabled={disabled}
                          onPress={() => {
                            change(
                              "ticketTypes",
                              types.filter((_, j) => j !== i),
                            );
                            setExpanded(undefined);
                          }}
                          style={{ padding: 8 }}
                        >
                          <Trash2 size={16} color={dColors.muted} />
                        </Pressable>
                      </View>
                      <EditorGrid always gap={12}>
                        <EditorStepper
                          label={copy("ticketForm.price")}
                          value={ticket.priceRon}
                          onChange={(priceRon) => update(i, { priceRon })}
                          disabled={
                            disabled || ticket.priceRon === 0 || !canSell
                          }
                          error={error(i, "priceRon")}
                        />
                        <EditorStepper
                          label={copy("ticketForm.capacity")}
                          value={ticket.capacity}
                          min={1}
                          onChange={(capacity) => update(i, { capacity })}
                          disabled={disabled}
                          error={error(i, "capacity")}
                        />
                      </EditorGrid>
                      <EditorChoice
                        checkbox
                        label={copy("ticketForm.freeTicket")}
                        hint={copy("ticketForm.freeTicketHint")}
                        selected={ticket.priceRon === 0}
                        disabled={
                          disabled || (!canSell && ticket.priceRon === 0)
                        }
                        onPress={() =>
                          update(i, {
                            priceRon: ticket.priceRon === 0 ? 10 : 0,
                          })
                        }
                        style={{
                          borderColor: "#ffffff0f",
                          backgroundColor: "#ffffff05",
                          paddingHorizontal: 12,
                        }}
                      />
                      {!canSell && ticket.priceRon > 0 && (
                        <Text style={[e.small, { color: "#fbbf24" }]}>
                          {copy("ticketForm.configureStripePaid")}
                        </Text>
                      )}
                      <EditorGrid gap={12}>
                        <DateTimeField
                          label={copy("ticketForm.salesStart")}
                          placeholder={copy("ticketForm.chooseStart")}
                          value={ticket.startSales}
                          disabled={disabled}
                          onChange={(startSales) => update(i, { startSales })}
                          error={error(i, "startSales")}
                        />
                        <DateTimeField
                          label={copy("ticketForm.salesEnd")}
                          placeholder={copy("ticketForm.chooseEnd")}
                          value={ticket.endSales}
                          disabled={disabled}
                          onChange={(endSales) => update(i, { endSales })}
                          error={error(i, "endSales")}
                        />
                      </EditorGrid>
                      <Field
                        hideLabel
                        label={copy("ticketForm.description")}
                        placeholder={copy("ticketForm.description")}
                        value={ticket.description ?? ""}
                        onChange={(description) => update(i, { description })}
                        disabled={disabled}
                        error={error(i, "description")}
                        inputStyle={e.input}
                      />
                      {!!ticket.ticketsSold && (
                        <Text
                          style={[
                            e.small,
                            {
                              fontSize: 11,
                              alignSelf: "flex-start",
                              backgroundColor: "#ffffff05",
                              borderRadius: 99,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            },
                          ]}
                        >
                          {copy("ticketForm.soldSoFar", {
                            count: ticket.ticketsSold,
                          })}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
