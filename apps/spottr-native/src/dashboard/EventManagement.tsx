import React, { useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Gift,
  ImagePlus,
  Megaphone,
  Percent,
  Share2,
  Trash2,
  X,
  XCircle,
} from "lucide-react-native";
import type { components } from "@packages/api-client/src/schema";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { AppSheet } from "../ui/AppSheet";
import { AppSheetScrollView } from "../ui/AppSheetScrollView";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading, useOpenLink } from "../ui/common";
import { exportTicket } from "../profile/exportTicket";
import {
  Action,
  Card,
  Field,
  Heading,
  Select,
  s,
  useAction,
  useDashboardQuery,
  dColors as colors,
} from "./common";
import {
  eventPath,
  promoPayload,
  validHttps,
  type DashboardEvent,
} from "./data";
import { uploadDashboardImage } from "./media";
import { Grid, SmallButton, SectionTitle, Status, p } from "./managementUi";
import { ManagementPanel } from "./ManagementPanel";
import {
  invitationBatches,
  invitationQuantity,
  invitationTickets,
} from "./managementData";
import { useInvitationExport } from "./useInvitationExport";
type S = components["schemas"];
export function EventManagement({
  event,
  readOnly,
}: {
  event: DashboardEvent;
  readOnly: boolean;
}) {
  const { copy } = usePreferences(),
    [tab, setTab] = useState<"promo" | "invitations" | null>(null);
  const invitations = useDashboardQuery<S["InvitationTicketResponse"][] | null>(
      eventPath(event.id) + "/invitations",
      !event.externalTicketUrl,
    ),
    promo = useDashboardQuery<S["PromoCodeResponse"][] | null>(
      eventPath(event.id) + "/promo-codes",
      !event.externalTicketUrl,
    );
  return (
    <View style={{ gap: 0 }}>
      {!event.externalTicketUrl && (
        <>
          {[
            {
              key: "invitations" as const,
              title: copy("invitations.title"),
              subtitle: copy("invitations.count", {
                count: invitations.data?.length ?? 0,
              }),
              Icon: Gift,
            },
            {
              key: "promo" as const,
              title: copy("promoCodes.title"),
              subtitle: copy("promoCodes.activeCount", {
                count: promo.data?.filter((item) => item.active).length ?? 0,
              }),
              Icon: Megaphone,
            },
          ].map(({ key, title, subtitle, Icon }) => (
            <Pressable
              key={key}
              testID={"management-open-" + key}
              accessibilityRole="button"
              onPress={() => setTab(key)}
              style={[
                p.row,
                {
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#ffffff1a",
                  paddingVertical: 20,
                },
              ]}
            >
              <View style={[p.iconBox, { borderWidth: 0, borderRadius: 20 }]}>
                <Icon size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={p.label}>{title}</Text>
                <Text style={p.tiny}>{subtitle}</Text>
              </View>
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>
          ))}
        </>
      )}
      {!readOnly && <Updates event={event} readOnly={readOnly} />}
      <Cancellation event={event} />
      <ManagementPanel
        open={!!tab}
        onClose={() => setTab(null)}
        title={copy(tab === "promo" ? "promoCodes.title" : "invitations.title")}
        subtitle={copy(
          tab === "promo"
            ? readOnly
              ? "promoCodes.readOnlySubtitle"
              : "promoCodes.subtitle"
            : readOnly
              ? "invitations.readOnlySubtitle"
              : "invitations.subtitle",
        )}
      >
        {tab === "promo" ? (
          <Promo event={event} readOnly={readOnly} />
        ) : tab === "invitations" ? (
          <Invitations event={event} readOnly={readOnly} />
        ) : null}
      </ManagementPanel>
    </View>
  );
}
function Promo({
  event,
  readOnly,
}: {
  event: DashboardEvent;
  readOnly: boolean;
}) {
  const { copy } = usePreferences(),
    path = eventPath(event.id) + "/promo-codes",
    query = useDashboardQuery<S["PromoCodeResponse"][] | null>(path),
    action = useAction();
  const [code, setCode] = useState(""),
    [discount, setDiscount] = useState("10"),
    [limit, setLimit] = useState(""),
    [invalid, setInvalid] = useState(false);
  const create = () => {
    try {
      const body = promoPayload(code, discount, limit);
      setInvalid(false);
      void action.run(
        () => accountApi(path, { method: "POST", body }),
        "promoCodes.created",
        () => {
          setCode("");
          setLimit("");
        },
      );
    } catch {
      setInvalid(true);
    }
  };
  return (
    <>
      {!readOnly && (
        <View style={{ gap: 12 }}>
          <Field
            label="CODPROMO"
            hideLabel
            placeholder="CODPROMO"
            value={code}
            maxLength={40}
            onChange={(value) =>
              setCode(
                value
                  .toUpperCase()
                  .replace(/[^A-Z0-9_-]/g, "")
                  .slice(0, 40),
              )
            }
            disabled={action.busy}
            inputStyle={{ borderRadius: 12, fontWeight: "600" }}
          />
          <Grid columns={2}>
            <View>
              <Field
                label="%"
                hideLabel
                value={discount}
                onChange={(value) => setDiscount(value)}
                numeric
                disabled={action.busy}
                inputStyle={{ borderRadius: 12, paddingRight: 32 }}
              />
              <Percent
                size={16}
                color={colors.muted}
                style={{ position: "absolute", right: 12, top: 14 }}
              />
            </View>
            <Field
              label={copy("promoCodes.limitPlaceholder")}
              placeholder={copy("promoCodes.limitPlaceholder")}
              hideLabel
              value={limit}
              onChange={setLimit}
              numeric
              disabled={action.busy}
              inputStyle={{ borderRadius: 12 }}
            />
          </Grid>
          {invalid && (
            <Text style={{ color: colors.danger }}>
              {copy("eventEditor.fixErrors")}
            </Text>
          )}
          <Action
            title={copy("promoCodes.create")}
            disabled={action.busy || code.length < 3}
            onPress={create}
            style={{ borderRadius: 12 }}
          />
        </View>
      )}
      {action.feedback}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback
          title={copy("feedback.loadFailed")}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <Text style={[p.muted, { textAlign: "center", paddingVertical: 32 }]}>
          {copy("promoCodes.empty")}
        </Text>
      ) : (
        <View>
          {query.data.map((item, index) => (
            <View
              key={item.id}
              style={[
                p.row,
                {
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: "#ffffff1a",
                  paddingVertical: 12,
                  gap: 12,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={p.row}>
                  <Text
                    style={[p.label, { fontWeight: "700", letterSpacing: 0.4 }]}
                  >
                    {item.code}
                  </Text>
                  <Text style={[p.label, { color: colors.accent }]}>
                    -{item.discountPercent}%
                  </Text>
                </View>
                <Text style={p.tiny}>
                  {item.redemptionsCount}
                  {item.maxRedemptions ? ` / ${item.maxRedemptions}` : ""}{" "}
                  {copy("promoCodes.uses")} ·{" "}
                  {copy(
                    item.active ? "promoCodes.active" : "promoCodes.inactive",
                  )}
                </Text>
              </View>
              {item.active && !readOnly && (
                <SmallButton
                  label={copy("promoCodes.deactivate")}
                  icon={XCircle}
                  danger
                  disabled={action.busy}
                  onPress={() =>
                    void action.run(
                      () =>
                        accountApi(`${path}/${item.id}`, { method: "DELETE" }),
                      "promoCodes.deactivated",
                    )
                  }
                  style={{
                    borderWidth: 0,
                    backgroundColor: "transparent",
                    borderRadius: 18,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );
}
function Invitations({
  event,
  readOnly,
}: {
  event: DashboardEvent;
  readOnly: boolean;
}) {
  const { copy } = usePreferences(),
    path = eventPath(event.id) + "/invitations",
    query = useDashboardQuery<S["InvitationTicketResponse"][] | null>(path),
    action = useAction(),
    pdf = useInvitationExport();
  const [label, setLabel] = useState(""),
    [type, setType] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [expanded, setExpanded] = useState<string>(),
    [selected, setSelected] = useState<S["InvitationTicketResponse"]>();
  const count = invitationQuantity(quantity),
    valid =
      label.trim().length > 0 &&
      event.ticketTypes.some((item) => item.id === type),
    batches = invitationBatches(query.data ?? []);
  const changeStatus = (
    items: S["InvitationTicketResponse"][],
    remove: boolean,
  ) =>
    void action.run(async () => {
      try {
        const results = await Promise.allSettled(
          items.map((item) =>
            accountApi(`${path}/${item.id}${remove ? "/permanent" : ""}`, {
              method: "DELETE",
            }),
          ),
        );
        if (results.some((result) => result.status === "rejected"))
          throw new Error("PARTIAL_BATCH_FAILURE");
      } finally {
        await query.refetch();
      }
    });
  return (
    <>
      {!readOnly && (
        <View style={{ gap: 12 }}>
          <Field
            label={copy("invitations.labelPlaceholder")}
            hideLabel
            placeholder={copy("invitations.labelPlaceholder")}
            value={label}
            onChange={setLabel}
            maxLength={120}
            disabled={action.busy}
            inputStyle={{ borderRadius: 12 }}
          />
          <Select
            label={copy("invitations.typePlaceholder")}
            value={type}
            onChange={setType}
            icon={Gift}
            placeholder={copy("invitations.typePlaceholder")}
            options={event.ticketTypes.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            disabled={action.busy}
          />
          {!event.ticketTypes.length && (
            <Text style={p.tiny}>{copy("invitations.noTicketTypes")}</Text>
          )}
          <Field
            label={copy("invitations.quantity")}
            value={quantity}
            onChange={setQuantity}
            numeric
            disabled={action.busy}
            inputStyle={{ borderRadius: 12 }}
          />
          <Text style={p.tiny}>{copy("invitations.quantityHint")}</Text>
          <Action
            title={copy("invitations.generate", { count })}
            disabled={!valid || action.busy}
            onPress={() =>
              void action.run(
                () =>
                  accountApi<S["InvitationTicketResponse"][]>(path, {
                    method: "POST",
                    body: {
                      label: label.trim(),
                      ticketTypeId: type,
                      quantity: count,
                    },
                  }),
                undefined,
                (created) => {
                  setExpanded(created[0]?.batchId);
                  setLabel("");
                  setType("");
                  setQuantity("1");
                },
              )
            }
            style={{ borderRadius: 12 }}
          />
        </View>
      )}
      {action.feedback}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback
          title={copy("feedback.loadFailed")}
          retry={() => void query.refetch()}
        />
      ) : !batches.length ? (
        <Text style={[p.muted, { textAlign: "center", paddingVertical: 32 }]}>
          {copy("invitations.empty")}
        </Text>
      ) : (
        <View style={{ gap: 12 }}>
          {batches.map((batch) => {
            const active = batch.items.filter(
                (item) => item.status === "active",
              ),
              used = batch.items.filter((item) => item.status === "used"),
              revoked = batch.items.filter((item) => item.status === "revoked"),
              isExpanded = expanded === batch.id;
            return (
              <View
                key={batch.id}
                testID="invitation-batch"
                style={[p.panel, { padding: 0, overflow: "hidden" }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => setExpanded(isExpanded ? undefined : batch.id)}
                  style={[p.row, { padding: 16, gap: 12 }]}
                >
                  <View
                    style={[p.iconBox, { borderWidth: 0, borderRadius: 20 }]}
                  >
                    <Gift size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={p.label}>{batch.label}</Text>
                    <Text style={p.tiny}>
                      {batch.ticketType || copy("invitations.general")} ·{" "}
                      {copy("invitations.batchCount", {
                        count: batch.items.length,
                      })}
                    </Text>
                  </View>
                  <ChevronDown
                    size={16}
                    color={colors.muted}
                    style={{
                      transform: [{ rotate: isExpanded ? "180deg" : "0deg" }],
                    }}
                  />
                </Pressable>
                <View
                  style={[
                    p.line,
                    p.row,
                    {
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      flexWrap: "wrap",
                      gap: 12,
                    },
                  ]}
                >
                  <Text style={[p.tiny, { fontSize: 11, color: "#34d399" }]}>
                    {copy("invitations.statusCount.active", {
                      count: active.length,
                    })}
                  </Text>
                  {used.length > 0 && (
                    <Text style={[p.tiny, { fontSize: 11 }]}>
                      {copy("invitations.statusCount.used", {
                        count: used.length,
                      })}
                    </Text>
                  )}
                  {revoked.length > 0 && (
                    <Text style={[p.tiny, { fontSize: 11, color: "#f87171" }]}>
                      {copy("invitations.statusCount.revoked", {
                        count: revoked.length,
                      })}
                    </Text>
                  )}
                </View>
                <View style={[p.line, { padding: 12, gap: 8 }]}>
                  <Grid columns={2} gap={8}>
                    <SmallButton
                      title={copy("invitations.share")}
                      icon={Share2}
                      disabled={action.busy || !active.length}
                      onPress={() =>
                        void action.run(() =>
                          pdf.run(
                            invitationTickets(
                              event,
                              batch.items,
                              copy("invitations.general"),
                            ),
                            true,
                          ),
                        )
                      }
                      style={{
                        borderRadius: 12,
                        minHeight: 40,
                        backgroundColor: "#ffffff0d",
                      }}
                    />
                    <SmallButton
                      title={copy("invitations.downloadPdf")}
                      icon={Download}
                      disabled={action.busy || !active.length}
                      onPress={() =>
                        void action.run(() =>
                          pdf.run(
                            invitationTickets(
                              event,
                              batch.items,
                              copy("invitations.general"),
                            ),
                            false,
                          ),
                        )
                      }
                      style={{
                        borderRadius: 12,
                        minHeight: 40,
                        backgroundColor: "#ffffff0d",
                      }}
                    />
                  </Grid>
                  {!readOnly && active.length > 0 && (
                    <SmallButton
                      title={copy("invitations.revokeBatch", {
                        count: active.length,
                      })}
                      icon={Ban}
                      danger
                      disabled={action.busy}
                      onPress={() => changeStatus(active, false)}
                      style={{
                        borderWidth: 0,
                        borderRadius: 12,
                        minHeight: 40,
                        backgroundColor: "transparent",
                      }}
                    />
                  )}
                  {!readOnly && !active.length && revoked.length > 0 && (
                    <SmallButton
                      title={copy("invitations.removeBatch", {
                        count: revoked.length,
                      })}
                      icon={Trash2}
                      danger
                      disabled={action.busy}
                      onPress={() => changeStatus(revoked, true)}
                      style={{ borderWidth: 0, backgroundColor: "transparent" }}
                    />
                  )}
                </View>
                {isExpanded && (
                  <View style={[p.line, { paddingHorizontal: 16 }]}>
                    {batch.items.map((item, index) => (
                      <View
                        key={item.id}
                        style={[
                          p.row,
                          {
                            paddingVertical: 8,
                            borderTopWidth: index ? 1 : 0,
                            borderTopColor: "#ffffff1a",
                          },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelected(item)}
                        >
                          <Text style={p.tiny}>#{item.batchIndex}</Text>
                        </Pressable>
                        <Text
                          style={[
                            p.tiny,
                            {
                              flex: 1,
                              textAlign: "right",
                              color:
                                item.status === "active"
                                  ? "#34d399"
                                  : item.status === "revoked"
                                    ? "#f87171"
                                    : colors.muted,
                            },
                          ]}
                        >
                          {copy("invitations.status." + item.status)}
                        </Text>
                        {!readOnly && item.status !== "used" && (
                          <SmallButton
                            label={copy(
                              item.status === "active"
                                ? "invitations.revoke"
                                : "invitations.remove",
                            )}
                            icon={item.status === "active" ? Ban : Trash2}
                            danger
                            disabled={action.busy}
                            onPress={() =>
                              changeStatus([item], item.status === "revoked")
                            }
                            style={{
                              width: 32,
                              minHeight: 32,
                              borderWidth: 0,
                              backgroundColor: "transparent",
                              borderRadius: 16,
                            }}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      {pdf.node}
      {selected && (
        <InvitationPreview
          event={event}
          invitation={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
function InvitationPreview({
  event,
  invitation,
  onClose,
}: {
  event: DashboardEvent;
  invitation: S["InvitationTicketResponse"];
  onClose: () => void;
}) {
  const { copy, language } = usePreferences(),
    { controller } = useAuth(),
    action = useAction(),
    qr = useRef<{
      toDataURL: (callback: (data: string) => void) => void;
    } | null>(null);
  const download = () =>
    void action.run(async () => {
      const token = controller.getToken();
      const data = await new Promise<string>((resolve, reject) => {
        if (!qr.current) return reject(new Error("QR not ready"));
        const timeout = setTimeout(() => reject(new Error("QR timeout")), 5000);
        qr.current.toDataURL((value) => {
          clearTimeout(timeout);
          resolve(value);
        });
      });
      await exportTicket(
        {
          id: invitation.id,
          eventTitle: event.title,
          ticketTypeName: invitation.ticketType ?? invitation.label,
          validationHash: invitation.validationHash,
          startTime: event.startTime,
          locationName: event.locationName,
          ticketPriceBani: 0,
          ticketingFeeBani: 0,
          paidTotalBani: 0,
        },
        `data:image/png;base64,${data}`,
        copy,
        language,
        () => controller.getToken() === token,
      );
    });
  return (
    <AppSheet
      open
      onClose={onClose}
      height={0.8}
      label={copy("invitations.title")}
    >
      <AppSheetScrollView
        contentContainerStyle={{ padding: 24, gap: 20, alignItems: "center" }}
      >
        <Heading title={event.title} subtitle={invitation.label} />
        <View
          style={{
            padding: 20,
            backgroundColor: "white",
            borderRadius: 24,
            opacity: invitation.status === "revoked" ? 0.3 : 1,
          }}
        >
          <QRCode
            value={invitation.validationHash}
            size={210}
            getRef={(value) => {
              qr.current = value;
            }}
          />
        </View>
        <Text style={s.muted}>{invitation.id}</Text>
        <Text style={s.badge}>
          {copy("invitations.status." + invitation.status)}
        </Text>
        {action.feedback}
        <Action
          title={copy("invitations.downloadPdf")}
          disabled={action.busy || invitation.status !== "active"}
          onPress={download}
        />
      </AppSheetScrollView>
    </AppSheet>
  );
}
function Updates({
  event,
  readOnly,
}: {
  event: DashboardEvent;
  readOnly: boolean;
}) {
  const { copy, language } = usePreferences(),
    { user } = useAuth(),
    width = useWindowDimensions().width,
    client = useQueryClient();
  const query = useDashboardQuery<S["OrganizerEventUpdateResponse"][] | null>(
      `/events/${event.id}/updates`,
    ),
    all = useDashboardQuery<S["OrganizerEventUpdateResponse"][] | null>(
      `/organizers/${user?.id}/updates`,
    ),
    action = useAction(),
    upload = useAction();
  const [image, setImage] = useState(""),
    [caption, setCaption] = useState("");
  const invalidate = () => {
    void query.refetch();
    void all.refetch();
    for (const key of ["event-updates", "organizer-updates", "social-feed"])
      void client.invalidateQueries({ queryKey: [key] });
  };
  const count = all.data?.length ?? 0,
    available =
      !readOnly &&
      event.status === "published" &&
      Date.parse(event.endTime) > Date.now(),
    canPublish = available && count < 3 && !all.isError && !all.isPending;
  return (
    <View style={{ marginTop: 32, paddingBottom: 20, gap: 16 }}>
      <View
        style={[
          p.row,
          {
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          },
        ]}
      >
        <View style={[p.row, { alignItems: "flex-start", flex: 1 }]}>
          <Megaphone size={16} color={colors.accent} style={{ marginTop: 3 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={p.sectionTitle}>
              {copy("organizerUpdates.manageTitle")}
            </Text>
            <Text style={[p.muted, { maxWidth: 448, lineHeight: 24 }]}>
              {copy("organizerUpdates.manageHint")}
            </Text>
          </View>
        </View>
        <Status
          label={copy("organizerUpdates.activeCount", { count })}
          tone="accent"
        />
      </View>
      {!available && (
        <Text style={p.warning}>{copy("organizerUpdates.unavailable")}</Text>
      )}
      {all.isError && (
        <Feedback
          compact
          title={copy("feedback.loadFailed")}
          retry={() => void all.refetch()}
        />
      )}
      <View style={{ flexDirection: width >= 640 ? "row" : "column", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy("organizerUpdates.selectImage")}
          disabled={!canPublish || upload.busy || action.busy}
          onPress={() =>
            void upload.run(
              () => uploadDashboardImage("organizer-update"),
              undefined,
              (url) => {
                if (url) setImage(url);
              },
            )
          }
          style={{
            flex: 1,
            minHeight: 96,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: "#ffffff26",
            backgroundColor: "#00000033",
            padding: 16,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            overflow: "hidden",
          }}
        >
          {image ? (
            <EventImage
              uri={image}
              style={{ position: "absolute", inset: 0, opacity: 0.6 }}
            />
          ) : null}
          <ImagePlus size={20} color={colors.accent} />
          <Text style={[p.tiny, { textAlign: "center" }]}>
            {copy("organizerUpdates.selectImage")}
          </Text>
        </Pressable>
        <View style={{ width: width >= 640 ? 208 : "100%", gap: 8 }}>
          <Field
            label={copy("organizerUpdates.captionPlaceholder")}
            hideLabel
            placeholder={copy("organizerUpdates.captionPlaceholder")}
            value={caption}
            onChange={(value) => setCaption(value.slice(0, 160))}
            maxLength={160}
            multiline
            disabled={!available || action.busy}
            inputStyle={{ minHeight: 96, borderRadius: 0, fontSize: 12 }}
          />
          <Action
            title={copy("organizerUpdates.publish")}
            disabled={!canPublish || !image || action.busy || upload.busy}
            onPress={() =>
              void action.run(
                () =>
                  accountApi(eventPath(event.id) + "/updates", {
                    method: "POST",
                    body: {
                      imageUrl: image,
                      caption: caption.trim() || undefined,
                    },
                  }),
                "organizerUpdates.published",
                () => {
                  setImage("");
                  setCaption("");
                  invalidate();
                },
              )
            }
            style={{ borderRadius: 0, minHeight: 40 }}
            textStyle={{ fontSize: 12 }}
          />
        </View>
      </View>
      {upload.feedback}
      {action.feedback}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback
          compact
          title={copy("feedback.loadFailed")}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <Text style={p.tiny}>{copy("organizerUpdates.empty")}</Text>
      ) : (
        <Grid columns={2} sm={3} gap={8}>
          {query.data.map((update) => (
            <View
              key={update.id}
              style={{
                height: 112,
                borderWidth: 1,
                borderColor: "#ffffff1a",
                overflow: "hidden",
                backgroundColor: "black",
              }}
            >
              <EventImage
                uri={update.imageUrl}
                style={{ position: "absolute", inset: 0 }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "#000000bf",
                  padding: 8,
                }}
              >
                <Text style={{ color: "#ffffffcc", fontSize: 10 }}>
                  {copy("organizerUpdates.expires", {
                    time: new Intl.DateTimeFormat(language, {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(update.expiresAt)),
                  })}
                </Text>
              </View>
              <SmallButton
                label={copy("organizerUpdates.delete")}
                icon={Trash2}
                danger
                disabled={action.busy}
                onPress={() =>
                  void action.run(
                    () =>
                      accountApi(
                        eventPath(event.id) + `/updates/${update.id}`,
                        { method: "DELETE" },
                      ),
                    "organizerUpdates.deleted",
                    invalidate,
                  )
                }
                style={{
                  position: "absolute",
                  right: 6,
                  top: 6,
                  width: 28,
                  minHeight: 28,
                  paddingVertical: 0,
                  borderWidth: 0,
                  borderRadius: 0,
                  backgroundColor: "#000000bf",
                }}
              />
            </View>
          ))}
        </Grid>
      )}
    </View>
  );
}
function Cancellation({ event }: { event: DashboardEvent }) {
  const { copy } = usePreferences(),
    { user } = useAuth(),
    path = eventPath(event.id) + "/cancellation-request",
    query = useQuery({
      queryKey: ["dashboard", user?.id, path],
      enabled: !!user,
      queryFn: async ({ signal }) =>
        (await accountApi<S["EventCancellationRequestResponse"] | undefined>(
          path,
          { signal },
        )) ?? null,
    }),
    action = useAction(),
    link = useOpenLink(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState("");
  const request = query.data,
    active =
      request && ["pending", "refunding", "failed"].includes(request.status),
    canRequest = !active && ["published", "scheduled"].includes(event.status),
    valid =
      reason.trim().length >= 10 &&
      (!evidence.trim() || validHttps(evidence.trim()));
  if (!canRequest && !request) return null;
  return (
    <View style={[p.divider, { marginTop: 32, gap: 20 }]}>
      <View style={[p.row, { alignItems: "flex-start", gap: 12 }]}>
        <View
          style={[
            p.iconBox,
            { borderWidth: 0, backgroundColor: "#fbbf241a", borderRadius: 12 },
          ]}
        >
          <AlertTriangle size={20} color="#fcd34d" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[p.label, { fontSize: 16 }]}>
            {copy("eventCancellation.title")}
          </Text>
          <Text style={[p.muted, { lineHeight: 24 }]}>
            {copy(
              active
                ? "eventCancellation.status." + request.status
                : "eventCancellation.description",
            )}
          </Text>
          {request?.adminNote && (
            <Text
              style={[
                p.muted,
                {
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "#ffffff0a",
                },
              ]}
            >
              {request.adminNote}
            </Text>
          )}
          {request?.evidenceUrl && (
            <Pressable
              accessibilityRole="link"
              onPress={() => void link.open(request.evidenceUrl!)}
              style={[p.row, { marginTop: 8 }]}
            >
              <Text
                style={[p.tiny, { color: colors.accent, fontWeight: "600" }]}
              >
                {copy("eventCancellation.evidence")}
              </Text>
              <ExternalLink size={14} color={colors.accent} />
            </Pressable>
          )}
        </View>
      </View>
      {query.isError ? (
        <Feedback
          compact
          title={copy("feedback.loadFailed")}
          retry={() => void query.refetch()}
        />
      ) : (
        canRequest && (
          <Action
            danger
            title={copy("eventCancellation.requestButton")}
            disabled={query.isPending}
            onPress={() => setOpen(true)}
            style={{ borderRadius: 999 }}
          />
        )
      )}
      {link.error && (
        <Text style={{ color: colors.danger }}>
          {copy("feedback.loadFailed")}
        </Text>
      )}
      {open && (
        <AppSheet
          open
          onClose={() => !action.busy && setOpen(false)}
          label={copy("eventCancellation.modalTitle")}
        >
          <AppSheetScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
          >
            <View style={[p.row, { alignItems: "flex-start" }]}>
              <Text style={[p.sectionTitle, { flex: 1 }]}>
                {copy("eventCancellation.modalTitle")}
              </Text>
              <SmallButton
                label={copy("common.close")}
                icon={X}
                disabled={action.busy}
                onPress={() => setOpen(false)}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            </View>
            <Text style={[p.muted, { lineHeight: 24 }]}>
              {copy("eventCancellation.modalDescription")}
            </Text>
            <Field
              label={copy("eventCancellation.reason")}
              value={reason}
              onChange={(value) => setReason(value.slice(0, 4000))}
              maxLength={4000}
              multiline
              inputStyle={{ borderRadius: 12, minHeight: 120 }}
              disabled={action.busy}
            />
            <Field
              label={copy("eventCancellation.evidenceUrl")}
              value={evidence}
              onChange={setEvidence}
              placeholder="https://"
              inputStyle={{ borderRadius: 12 }}
              disabled={action.busy}
            />
            {action.feedback}
            <View style={p.row}>
              <Action
                secondary
                title={copy("common.cancel")}
                disabled={action.busy}
                onPress={() => setOpen(false)}
                style={{ flex: 1, borderRadius: 999 }}
              />
              <Action
                danger
                title={copy("eventCancellation.submit")}
                disabled={!valid || action.busy}
                onPress={() =>
                  void action.run(
                    () =>
                      accountApi(path, {
                        method: "POST",
                        body: {
                          reason: reason.trim(),
                          evidenceUrl: evidence.trim() || undefined,
                        },
                      }),
                    "eventCancellation.requested",
                    () => setOpen(false),
                  )
                }
                style={{
                  flex: 1,
                  borderRadius: 999,
                  backgroundColor: "#dc2626",
                }}
                textStyle={{ color: "white" }}
              />
            </View>
          </AppSheetScrollView>
        </AppSheet>
      )}
    </View>
  );
}
