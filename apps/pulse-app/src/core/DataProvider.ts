"use client";

import {
  ReadableSchema,
  WritableSchema,
  ApiClient,
} from "@packages/api-client/src/Client";
import {
  clearClientQueryCache,
  getClientQuery,
  refreshClientQuery,
  updateClientQueries,
  updateClientQuery,
} from "@/lib/clientQueryCache";
import { useCachedClientQuery } from "@/lib/useCachedClientQuery";
import { loadEventPages } from "@/features/events/loadEventPages";

type UserFields = ReadableSchema<"CurrentUser">;
export type UserData = UserFields;
export type CreateEventPayload = WritableSchema<"CreateEventPayload">;
export type UpdateEventPayload = WritableSchema<"UpdateEventPayload">;
export type TicketTier = ReadableSchema<"TicketTypeResponse">;
export type Artist = ReadableSchema<"Artist">;
export type ArtistInput = WritableSchema<"ArtistInput">;
export type InvitationTicket = ReadableSchema<"InvitationTicketResponse">;
export type PromoCode = ReadableSchema<"PromoCodeResponse">;
export type CreatePromoCode = WritableSchema<"CreatePromoCodePayload">;
export type PromotionPlan = ReadableSchema<"PromotionPlanResponse">;
export type PromotionCampaign = ReadableSchema<"PromotionCampaignResponse">;
export type PromotionAvailability = ReadableSchema<"PromotionAvailabilityResponse">;
export type PromotedEvent = ReadableSchema<"PromotedEventResponse">;
export type SpotifyArtist = ReadableSchema<"SpotifyArtistResponse">;
export type CreateTicketTierPayload = WritableSchema<"CreateTicketTypePayload">;
export type Event = ReadableSchema<"EventResponse">;
export type PublicProfile = ReadableSchema<"PublicProfileResponse">;
export type EventAttendee = ReadableSchema<"EventAttendeeResponse">;
export type OrganizerFinanceEvent = ReadableSchema<"OrganizerFinanceEventResponse">;
export type PlatformCommissionInvoice = ReadableSchema<"PlatformCommissionInvoiceResponse">;
export type InvoicingSettings = ReadableSchema<"InvoicingSettingsResponse">;
export type InvoicingSettingsPayload = WritableSchema<"InvoicingSettingsPayload">;
export type InvoicingProviderOptionsPayload = WritableSchema<"InvoicingProviderOptionsPayload">;
export type InvoicingProviderOptions = ReadableSchema<"InvoicingProviderOptionsResponse">;
export type BillingInvoice = ReadableSchema<"BillingInvoiceResponse">;
export type OrganizerProfile = ReadableSchema<"OrganizerProfile">;
export type OrganizerVerificationRequest = ReadableSchema<"OrganizerVerificationRequest">;
export type EventCancellationRequest = ReadableSchema<"EventCancellationRequestResponse">;
export type RefundAttentionItem = ReadableSchema<"RefundAttentionResponse">;
export type RefundReconciliation = ReadableSchema<"RefundReconciliationResponse">;
export type PromotionInvoiceAttention = ReadableSchema<"PromotionInvoiceAttentionResponse">;
export type ValidationEvent = ReadableSchema<"ValidationEventResponse">;
export type SocialFeedItem = ReadableSchema<"SocialFeedItemResponse">;
export type OrganizerEventUpdate = ReadableSchema<"OrganizerEventUpdateResponse">;
export type AppNotification = ReadableSchema<"NotificationResponse">;
export type NotificationList = ReadableSchema<"NotificationListResponse">;

const PUBLIC_CACHE_TTL = 2 * 60 * 1000;
const EVENT_FRIENDS_CACHE_TTL = 2 * 60 * 1000;
const SOCIAL_CACHE_TTL = 60 * 1000;

const queryKey = {
  events: (viewerId: string) => `events:${viewerId}`,
  organizerEvents: (organizerId: string) => `organizer-events:${organizerId}`,
  friends: (viewerId: string) => `friends:${viewerId}`,
  socialFeed: (viewerId: string) => `social-feed:${viewerId}`,
  notifications: (viewerId: string) => `notifications:${viewerId}`,
  eventUpdates: (eventId: string) => `event-updates:${eventId}`,
  organizerUpdates: (organizerId: string) => `organizer-updates:${organizerId}`,
  eventFriends: (viewerId: string, eventId: string) =>
    `event-friends:${viewerId}:${eventId}`,
  publicProfile: (viewerId: string, profileId: string) =>
    `public-profile:${viewerId}:${profileId}`,
};

const asError = (error: unknown): Error | undefined =>
  error == null
    ? undefined
    : error instanceof Error
      ? error
      : new Error(String(error));

/**
 * Removes display data on logout so an in-flight response or a subsequent
 * account on the same device cannot inherit the previous session's data.
 */
export function clearSessionCaches(userId: string): void {
  void userId;
  clearClientQueryCache();
}

function markNotificationReadInList(
  list: NotificationList,
  notificationId: string,
): NotificationList {
  const notification = list.items.find((item) => item.id === notificationId);
  if (!notification || notification.isRead) return list;

  return {
    ...list,
    unreadCount: Math.max(0, list.unreadCount - 1),
    items: list.items.map((item) =>
      item.id === notificationId ? { ...item, isRead: true } : item,
    ),
  };
}

export class User {
  /**
   * Atributele interne ale utilizatorului.
   */
  private _properties: UserFields;

  /**
   * Instanțiază un nou utilizator.
   */
  constructor(properties: UserFields) {
    this._properties = properties;
  }

  /**
   * Getter public pentru a accesa proprietățile în mod "read-only".
   */
  get properties(): Readonly<UserFields> {
    return this._properties;
  }

  async uploadAvatar(file: File): Promise<UserData> {
    const updatedUser = await ApiClient.instance.uploadProfileAvatar(file);
    this._properties = updatedUser;
    return updatedUser;
  }

  async updateProfile(profile: { username?: string; bio?: string; preferredLanguage?: "en" | "ro"; showAttendancePublicly?: boolean }): Promise<UserData> {
    const updatedUser = await ApiClient.instance.put("/users/me", {
      body: profile,
    });
    this._properties = updatedUser;
    return updatedUser;
  }

  static async requestPasswordReset(email: string): Promise<void> {
    await ApiClient.instance.post("/auth/forgot-password", { body: { email } });
  }

  static async resetPassword(token: string, newPassword: string): Promise<void> {
    await ApiClient.instance.post("/auth/reset-password", {
      body: { token, new_password: newPassword } as never,
    });
  }

  async getOrganizerProfile(): Promise<OrganizerProfile | undefined> {
    try {
      const profile = await ApiClient.instance.get(
        "/dashboard/organizer/profile/{id}",
        {
          params: {
            path: { id: this._properties.id },
          },
        },
      );
      return profile;
    } catch (error) {
      throw error;
    }
  }

  async updateOrganizerProfile(
    cui: string,
    companyName: string,
    organizerAgreementVersion: string,
  ): Promise<OrganizerProfile> {
    try {
      const updatedProfile = await ApiClient.instance.post(
        "/dashboard/organizer/profile",
        {
          body: {
            cui,
            companyName,
            organizerAgreementVersion,
          },
        },
      );
      return updatedProfile;
    } catch (error) {
      console.error(
        "Eroare la actualizarea profilului organizatorului:",
        error,
      );
      throw error;
    }
  }

  async acceptOrganizerAgreement(
    version: string,
  ): Promise<OrganizerProfile> {
    return ApiClient.instance.post("/dashboard/organizer/agreement", {
      body: { version },
    });
  }

  async createStripeAccountLink(): Promise<{ url: string }> {
    return ApiClient.instance.post("/dashboard/stripe/account-link");
  }

  async refreshStripeAccountStatus(): Promise<OrganizerProfile> {
    return ApiClient.instance.get("/dashboard/stripe/status");
  }

  async createStripeDashboardLoginLink(): Promise<{ url: string }> {
    return ApiClient.instance.post("/dashboard/stripe/login-link");
  }

  async disconnectStripeAccount(): Promise<void> {
    await ApiClient.instance.delete("/dashboard/stripe/account");
  }

  async listOrganizerVerifications(): Promise<OrganizerVerificationRequest[]> {
    return ApiClient.instance.get("/admin/organizers");
  }

  async reviewOrganizerVerification(
    organizerId: string,
    status: "approved" | "rejected",
  ): Promise<OrganizerProfile> {
    return ApiClient.instance.patch("/admin/organizers/{id}/verification", {
      params: { path: { id: organizerId } },
      body: { status },
    });
  }

  async getEventCancellationRequest(eventId: string): Promise<EventCancellationRequest | undefined> {
    return ApiClient.instance.get("/dashboard/events/{id}/cancellation-request", {
      params: { path: { id: eventId } },
    });
  }

  async requestEventCancellation(eventId: string, reason: string, evidenceUrl?: string): Promise<EventCancellationRequest> {
    const request = await ApiClient.instance.post("/dashboard/events/{id}/cancellation-request", {
      params: { path: { id: eventId } },
      body: { reason, evidenceUrl: evidenceUrl || undefined },
    });
    await this.refreshOrganizerEvents();
    return request;
  }

  async listEventCancellationRequests(): Promise<EventCancellationRequest[]> {
    return ApiClient.instance.get("/admin/event-cancellations");
  }

  async approveEventCancellation(id: string, feePolicy: "retain" | "refund", adminNote?: string): Promise<void> {
    await ApiClient.instance.post("/admin/event-cancellations/{id}/approve", {
      params: { path: { id } },
      body: { feePolicy, adminNote: adminNote || undefined },
    });
  }

  async rejectEventCancellation(id: string, adminNote?: string): Promise<void> {
    await ApiClient.instance.post("/admin/event-cancellations/{id}/reject", {
      params: { path: { id } },
      body: { adminNote: adminNote || undefined },
    });
  }

  async retryEventCancellation(id: string): Promise<void> {
    await ApiClient.instance.post("/admin/event-cancellations/{id}/retry", {
      params: { path: { id } },
    });
  }

  async getOrganizerFinance(): Promise<OrganizerFinanceEvent[]> {
    return ApiClient.instance.get("/dashboard/finance");
  }

  async listOrganizerRefundsRequiringAttention(): Promise<RefundAttentionItem[]> {
    return ApiClient.instance.get("/dashboard/finance/refunds-attention");
  }

  async reconcileOrganizerRefund(orderId: string): Promise<RefundReconciliation> {
    return ApiClient.instance.post("/dashboard/finance/refunds-attention/{id}/reconcile", {
      params: { path: { id: orderId } },
    });
  }

  async listAdminRefundsRequiringAttention(): Promise<RefundAttentionItem[]> {
    return ApiClient.instance.get("/admin/refunds-attention");
  }

  async reconcileAdminRefund(orderId: string): Promise<RefundReconciliation> {
    return ApiClient.instance.post("/admin/refunds-attention/{id}/reconcile", {
      params: { path: { id: orderId } },
    });
  }

  async listPromotionInvoicesRequiringAttention(): Promise<PromotionInvoiceAttention[]> {
    return ApiClient.instance.get("/admin/promotion-invoices-attention");
  }

  async getPlatformCommissionInvoices(): Promise<PlatformCommissionInvoice[]> {
    return ApiClient.instance.get("/dashboard/finance/invoices");
  }

  async getInvoicingSettings(): Promise<InvoicingSettings> {
    return ApiClient.instance.get("/dashboard/invoicing/settings");
  }

  async saveInvoicingSettings(payload: InvoicingSettingsPayload): Promise<InvoicingSettings> {
    return ApiClient.instance.put("/dashboard/invoicing/settings", { body: payload });
  }

  async getInvoicingProviderOptions(payload: InvoicingProviderOptionsPayload): Promise<InvoicingProviderOptions> {
    return ApiClient.instance.post("/dashboard/invoicing/options", { body: payload });
  }

  async disconnectInvoicing(): Promise<void> {
    await ApiClient.instance.delete("/dashboard/invoicing/settings");
  }

  async listBillingInvoices(): Promise<BillingInvoice[]> {
    return ApiClient.instance.get("/dashboard/invoicing/invoices");
  }

  async retryBillingInvoice(id: string): Promise<void> {
    await ApiClient.instance.post("/dashboard/invoicing/invoices/{id}/retry", {
      params: { path: { id } },
    });
  }

  async getValidationEvents(): Promise<ValidationEvent[]> {
    return ApiClient.instance.get("/dashboard/ticket-validation/events");
  }

  async getFriendRequests(): Promise<PublicProfile[]> {
    return ApiClient.instance.get("/friends/requests");
  }

  async respondToFriendRequest(
    profileId: string,
    status: "accepted" | "declined",
  ): Promise<void> {
    await ApiClient.instance.put("/friends/request/{userId}", {
      params: { path: { userId: profileId } },
      body: { status },
    });
    void refreshClientQuery(
      queryKey.friends(this._properties.id),
      () => ApiClient.instance.get("/friends") as Promise<PublicProfile[]>,
      { force: true },
    );
  }

  async removeFriend(profileId: string): Promise<void> {
    await ApiClient.instance.delete("/friends/{userId}", {
      params: { path: { userId: profileId } },
    });

    updateClientQuery<PublicProfile[]>(
      queryKey.friends(this._properties.id),
      (friends) => friends.filter((friend) => friend.id !== profileId),
    );
    void refreshClientQuery(
      queryKey.socialFeed(this._properties.id),
      () => ApiClient.instance.get("/feed") as Promise<SocialFeedItem[]>,
      { force: true },
    );
  }

  async markAllNotificationsRead(): Promise<void> {
    await ApiClient.instance.post("/notifications/read-all");
    updateClientQuery<NotificationList>(
      queryKey.notifications(this._properties.id),
      (notifications) => ({
        ...notifications,
        unreadCount: 0,
        items: notifications.items.map((notification) => ({
          ...notification,
          isRead: true,
        })),
      }),
    );
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await ApiClient.instance.post("/notifications/{id}/read", {
      params: { path: { id: notificationId } },
    });
    updateClientQuery<NotificationList>(
      queryKey.notifications(this._properties.id),
      (notifications) =>
        markNotificationReadInList(notifications, notificationId),
    );
  }

  private refreshOrganizerEvents(): Promise<void> {
    return refreshClientQuery(
      queryKey.organizerEvents(this._properties.id),
      () => ApiClient.instance.get("/dashboard/events"),
      { force: true },
    );
  }

  static useOrganizerEvents(user?: User): {
    events: readonly Event[];
    eventsLoading: boolean;
    eventsError?: Error;
  } {
    const organizerId = user?.properties.id;
    const query = useCachedClientQuery<Event[]>(
      organizerId ? queryKey.organizerEvents(organizerId) : null,
      () => ApiClient.instance.get("/dashboard/events"),
      [],
      { staleTimeMs: PUBLIC_CACHE_TTL },
    );
    return {
      events: query.data,
      eventsLoading: query.pending,
      eventsError: asError(query.error),
    };
  }

  async handleCreateEvent(
    eventData: WritableSchema<"CreateEventPayload">,
  ): Promise<Event> {
    try {
      const newEvent = await ApiClient.instance.post("/dashboard/events", {
        body: eventData,
      });

      await this.refreshOrganizerEvents();
      return newEvent;
    } catch (error) {
      console.error("Failed to create event:", error);
      throw error;
    }
  }

  async handleUpdateEvent(
    eventId: string,
    eventData: WritableSchema<"UpdateEventPayload">,
  ): Promise<Event> {
    try {
      const updatedEvent = await ApiClient.instance.post(
        `/dashboard/events/{id}`,
        {
          body: eventData,
          params: { path: { id: eventId } },
        },
      );
      await this.refreshOrganizerEvents();
      return updatedEvent;
    } catch (error) {
      console.error("Failed to update event:", error);
      throw error;
    }
  }

  async handleDeleteEvent(eventId: string): Promise<void> {
    try {
      await ApiClient.instance.delete(`/dashboard/events/{id}`, {
        params: { path: { id: eventId } },
      });
      await this.refreshOrganizerEvents();
    } catch (error) {
      console.error("Failed to delete event:", error);
      throw error;
    }
  }

  async handleGetOrganizerEvent(eventId: string): Promise<Event> {
    try {
      const event = await ApiClient.instance.get(`/dashboard/events/{id}`, {
        params: { path: { id: eventId } },
      });
      return event;
    } catch (error) {
      console.error("Failed to fetch organizer event:", error);
      throw error;
    }
  }

  async getSavedEvents(): Promise<Event[]> {
    return ApiClient.instance.get("/users/me/saved-events");
  }

  async setEventFavorite(eventId: string, favorite: boolean): Promise<void> {
    if (favorite) {
      await ApiClient.instance.post("/events/{id}/favorite", {
        params: { path: { id: eventId } },
      });
    } else {
      await ApiClient.instance.delete("/events/{id}/favorite", {
        params: { path: { id: eventId } },
      });
    }

    this.updateCachedEventFavorite(eventId, favorite);
  }

  private updateCachedEventFavorite(eventId: string, favorite: boolean) {
    updateClientQueries<Event[]>(
      (key) =>
        key.startsWith("events:") ||
        key.startsWith("saved-events:") ||
        key.startsWith('["discovery",'),
      (events, key) => {
        if (!favorite && key.startsWith("saved-events:")) {
          return events.filter((event) => event.id !== eventId);
        }
        return events.map((event) =>
          event.id === eventId
            ? { ...event, stats: { ...event.stats, isFavorited: favorite } }
            : event,
        );
      },
    );
  }

  async handleCreateTicketTier(
    eventId: string,
    ticketData: CreateTicketTierPayload,
  ): Promise<TicketTier> {
    try {
      const newTicketTier = await ApiClient.instance.post(
        `/dashboard/events/{id}/ticket-types`,
        {
          body: ticketData,
          params: { path: { id: eventId } },
        },
      );
      return newTicketTier;
    } catch (error) {
      console.error("Failed to create ticket tier:", error);
      throw error;
    }
  }

  static useEvents(
    user?: User,
    authLoading?: boolean,
  ): {
    events: readonly Event[];
    eventsLoading: boolean;
    eventsError?: Error;
    refresh: () => void;
  } {
    const userId = user?.properties?.id;
    const query = useCachedClientQuery<Event[]>(
      authLoading ? null : queryKey.events(userId ?? "guest"),
      () => PublicEventsService.getPublicEvents(),
      [],
      { staleTimeMs: PUBLIC_CACHE_TTL },
    );
    return {
      events: query.data,
      eventsLoading: Boolean(authLoading) || query.pending,
      eventsError: asError(query.error),
      refresh: () => {
        void query.retry();
      },
    };
  }

  async listHiddenCategories(): Promise<string[]> {
    const categories = await ApiClient.instance.get("/users/me/hidden-categories");
    // An empty collection can arrive as JSON null instead of an array.
    return categories ?? [];
  }

  async hideEventCategory(category: string): Promise<void> {
    await ApiClient.instance.post("/users/me/hidden-categories", { body: { category } });
    void refreshClientQuery(
      queryKey.events(this._properties.id),
      () => PublicEventsService.getPublicEvents(),
      { force: true },
    );
  }

  async showEventCategory(category: string): Promise<void> {
    await ApiClient.instance.delete("/users/me/hidden-categories/{category}", { params: { path: { category } } });
    void refreshClientQuery(
      queryKey.events(this._properties.id),
      () => PublicEventsService.getPublicEvents(),
      { force: true },
    );
  }

  async listInvitations(eventId: string): Promise<InvitationTicket[]> {
    return ApiClient.instance.get("/dashboard/events/{id}/invitations", { params: { path: { id: eventId } } });
  }

  async createInvitation(eventId: string, payload: { label: string; ticketTypeId: string; quantity?: number }): Promise<InvitationTicket[]> {
    return ApiClient.instance.post("/dashboard/events/{id}/invitations", { params: { path: { id: eventId } }, body: payload });
  }

  async revokeInvitation(eventId: string, invitationId: string): Promise<void> {
    await ApiClient.instance.delete("/dashboard/events/{id}/invitations/{invitationId}", { params: { path: { id: eventId, invitationId } } });
  }

  async deleteInvitation(eventId: string, invitationId: string): Promise<void> {
    await ApiClient.instance.delete("/dashboard/events/{id}/invitations/{invitationId}/permanent", { params: { path: { id: eventId, invitationId } } });
  }

  async listPromoCodes(eventId: string): Promise<PromoCode[]> {
    return ApiClient.instance.get("/dashboard/events/{id}/promo-codes", { params: { path: { id: eventId } } });
  }

  async createPromoCode(eventId: string, payload: CreatePromoCode): Promise<void> {
    await ApiClient.instance.post("/dashboard/events/{id}/promo-codes", { params: { path: { id: eventId } }, body: payload });
  }

  async deactivatePromoCode(eventId: string, promoId: string): Promise<void> {
    await ApiClient.instance.delete("/dashboard/events/{id}/promo-codes/{promoId}", { params: { path: { id: eventId, promoId } } });
  }

  async listPromotionPlans(): Promise<PromotionPlan[]> {
    const plans: PromotionPlan[] = await ApiClient.instance.get("/dashboard/promotions/plans");
    return plans.map((plan) => ({
      ...plan,
      placement: plan.placement || "home_banner",
    }));
  }

  async listPromotionCampaigns(): Promise<PromotionCampaign[]> {
    const campaigns: PromotionCampaign[] = await ApiClient.instance.get("/dashboard/promotions");
    return campaigns.map((campaign) => ({
      ...campaign,
      placement: campaign.placement || "home_banner",
    }));
  }

  async getPromotionAvailability(plan: PromotionPlan["id"], startDate: string): Promise<PromotionAvailability> {
    return ApiClient.instance.get("/dashboard/promotions/availability", {
      params: { query: { plan, startDate } },
    });
  }

  async createPromotionCheckout(payload: WritableSchema<"CreatePromotionCheckoutPayload">): Promise<ReadableSchema<"PromotionCheckoutResponse">> {
    return ApiClient.instance.post("/dashboard/promotions/checkout", { body: payload });
  }

  async uploadOrganizerUpdateImage(file: File): Promise<{ url: string }> {
    return ApiClient.instance.uploadOrganizerUpdateImage(file);
  }

  async createEventUpdate(
    eventId: string,
    payload: WritableSchema<"CreateOrganizerEventUpdatePayload">,
  ): Promise<OrganizerEventUpdate> {
    const update = await ApiClient.instance.post("/dashboard/events/{id}/updates", {
      params: { path: { id: eventId } },
      body: payload,
    });
    await Promise.all([
      refreshClientQuery(
        queryKey.eventUpdates(eventId),
        () => ApiClient.instance.get("/events/{id}/updates", { params: { path: { id: eventId } } }),
        { force: true },
      ),
      refreshClientQuery(
        queryKey.organizerUpdates(this._properties.id),
        () => ApiClient.instance.get("/organizers/{id}/updates", { params: { path: { id: this._properties.id } } }),
        { force: true },
      ),
      refreshClientQuery(
        queryKey.socialFeed(this._properties.id),
        () => ApiClient.instance.get("/feed"),
        { force: true },
      ),
    ]);
    return update;
  }

  async deleteEventUpdate(eventId: string, updateId: string): Promise<void> {
    await ApiClient.instance.delete("/dashboard/events/{id}/updates/{updateId}", {
      params: { path: { id: eventId, updateId } },
    });
    await Promise.all([
      refreshClientQuery(
        queryKey.eventUpdates(eventId),
        () => ApiClient.instance.get("/events/{id}/updates", { params: { path: { id: eventId } } }),
        { force: true },
      ),
      refreshClientQuery(
        queryKey.organizerUpdates(this._properties.id),
        () => ApiClient.instance.get("/organizers/{id}/updates", { params: { path: { id: this._properties.id } } }),
        { force: true },
      ),
      refreshClientQuery(
        queryKey.socialFeed(this._properties.id),
        () => ApiClient.instance.get("/feed"),
        { force: true },
      ),
    ]);
  }

  static async getNotifications(
    viewerId: string,
    force = false,
  ): Promise<NotificationList> {
    const key = queryKey.notifications(viewerId);
    const load = () => ApiClient.instance.get("/notifications") as Promise<NotificationList>;
    if (force) await refreshClientQuery(key, load, { force: true });
    return getClientQuery(key, load, SOCIAL_CACHE_TTL);
  }

  static useNotifications(user: User | undefined): {
    notifications: readonly AppNotification[];
    unreadCount: number;
    notificationsLoading: boolean;
    notificationsError?: Error;
    refresh: () => Promise<boolean>;
    markRead: (notificationId: string) => void;
  } {
    const viewerId = user?.properties.id;
    const query = useCachedClientQuery<NotificationList | undefined>(
      viewerId ? queryKey.notifications(viewerId) : null,
      () => ApiClient.instance.get("/notifications") as Promise<NotificationList>,
      undefined,
      { staleTimeMs: SOCIAL_CACHE_TTL },
    );

    const markRead = (notificationId: string) => {
      if (!user) return;
      updateClientQuery<NotificationList>(
        queryKey.notifications(user.properties.id),
        (notifications) => markNotificationReadInList(notifications, notificationId),
      );
      void user.markNotificationRead(notificationId).catch(() => {
        void query.retry();
      });
    };

    return {
      notifications: query.data?.items ?? [],
      unreadCount: query.data?.unreadCount ?? 0,
      notificationsLoading: query.pending,
      notificationsError: asError(query.error),
      refresh: query.retryResult,
      markRead,
    };
  }

  static async getFriends(viewerId: string): Promise<PublicProfile[]> {
    return getClientQuery(
      queryKey.friends(viewerId),
      () => ApiClient.instance.get("/friends") as Promise<PublicProfile[]>,
      SOCIAL_CACHE_TTL,
    );
  }

  static useFriends(user: User | undefined): {
    friends: readonly PublicProfile[];
    friendsLoading: boolean;
    friendsError?: Error;
    refresh: () => void;
  } {
    const viewerId = user?.properties.id;
    const query = useCachedClientQuery<PublicProfile[]>(
      viewerId ? queryKey.friends(viewerId) : null,
      () => ApiClient.instance.get("/friends") as Promise<PublicProfile[]>,
      [],
      { staleTimeMs: SOCIAL_CACHE_TTL },
    );
    return {
      friends: query.data,
      friendsLoading: query.pending,
      friendsError: asError(query.error),
      refresh: () => { void query.retry(); },
    };
  }

  static async getSocialFeed(viewerId: string): Promise<SocialFeedItem[]> {
    return getClientQuery(
      queryKey.socialFeed(viewerId),
      () => ApiClient.instance.get("/feed") as Promise<SocialFeedItem[]>,
      SOCIAL_CACHE_TTL,
    );
  }

  static useSocialFeed(user: User | undefined): {
    items: readonly SocialFeedItem[];
    feedLoading: boolean;
    feedError?: Error;
    refresh: () => void;
  } {
    const viewerId = user?.properties.id;
    const query = useCachedClientQuery<SocialFeedItem[]>(
      viewerId ? queryKey.socialFeed(viewerId) : null,
      () => ApiClient.instance.get("/feed") as Promise<SocialFeedItem[]>,
      [],
      { staleTimeMs: SOCIAL_CACHE_TTL },
    );
    return {
      items: query.data,
      feedLoading: query.pending,
      feedError: asError(query.error),
      refresh: () => { void query.retry(); },
    };
  }

  static async getEventUpdates(eventId: string): Promise<OrganizerEventUpdate[]> {
    return getClientQuery(
      queryKey.eventUpdates(eventId),
      () => ApiClient.instance.get("/events/{id}/updates", {
        params: { path: { id: eventId } },
      }) as Promise<OrganizerEventUpdate[]>,
      SOCIAL_CACHE_TTL,
    );
  }

  static async getOrganizerUpdates(organizerId: string): Promise<OrganizerEventUpdate[]> {
    return getClientQuery(
      queryKey.organizerUpdates(organizerId),
      () => ApiClient.instance.get("/organizers/{id}/updates", {
        params: { path: { id: organizerId } },
      }) as Promise<OrganizerEventUpdate[]>,
      SOCIAL_CACHE_TTL,
    );
  }

  static useEventUpdates(eventId: string): {
    updates: readonly OrganizerEventUpdate[];
    updatesLoading: boolean;
  } {
    const query = useCachedClientQuery<OrganizerEventUpdate[]>(
      eventId ? queryKey.eventUpdates(eventId) : null,
      () => ApiClient.instance.get("/events/{id}/updates", {
        params: { path: { id: eventId } },
      }) as Promise<OrganizerEventUpdate[]>,
      [],
      { staleTimeMs: SOCIAL_CACHE_TTL },
    );
    return { updates: query.data, updatesLoading: query.pending };
  }

  static useOrganizerUpdates(organizerId: string): {
    updates: readonly OrganizerEventUpdate[];
    updatesLoading: boolean;
  } {
    const query = useCachedClientQuery<OrganizerEventUpdate[]>(
      organizerId ? queryKey.organizerUpdates(organizerId) : null,
      () => ApiClient.instance.get("/organizers/{id}/updates", {
        params: { path: { id: organizerId } },
      }) as Promise<OrganizerEventUpdate[]>,
      [],
      { staleTimeMs: SOCIAL_CACHE_TTL },
    );
    return { updates: query.data, updatesLoading: query.pending };
  }

  static async getEventFriends(
    eventId: string,
    viewerId: string,
  ): Promise<EventAttendee[]> {
    return getClientQuery(
      queryKey.eventFriends(viewerId, eventId),
      () => ApiClient.instance
        .get("/events/{id}/attendees", { params: { path: { id: eventId } } })
        .then((attendees) => {
        const friends = (attendees as EventAttendee[]).filter(
          (attendee) => attendee.relationship === "friends",
        );
        return friends;
        }),
      EVENT_FRIENDS_CACHE_TTL,
    );
  }

  static useEventFriends(
    user: User | undefined,
    eventId: string,
  ): {
    friends: readonly EventAttendee[];
    friendsLoading: boolean;
    friendsError?: Error;
  } {
    const viewerId = user?.properties.id;
    const query = useCachedClientQuery<EventAttendee[]>(
      viewerId && eventId ? queryKey.eventFriends(viewerId, eventId) : null,
      () => ApiClient.instance
        .get("/events/{id}/attendees", { params: { path: { id: eventId } } })
        .then((attendees) => (attendees as EventAttendee[]).filter(
          (attendee) => attendee.relationship === "friends",
        )),
      [],
      { staleTimeMs: EVENT_FRIENDS_CACHE_TTL },
    );
    return {
      friends: query.data,
      friendsLoading: query.pending,
      friendsError: asError(query.error),
    };
  }

  static async getPublicProfile(
    profileId: string,
    viewerId = "guest",
  ): Promise<PublicProfile> {
    return getClientQuery(
      queryKey.publicProfile(viewerId, profileId),
      () => ApiClient.instance.get("/profiles/{id}", {
        params: { path: { id: profileId } },
      }) as Promise<PublicProfile>,
      PUBLIC_CACHE_TTL,
    );
  }

  static async getPublicEventById(id: string): Promise<Event> {
    try {
      const event = await ApiClient.instance.get("/events/{id}", {
        params: { path: { id } },
        cache: "no-store",
      });
      return event;
    } catch (error) {
      console.error(`Eroare la încărcarea evenimentului ${id}:`, error);
      throw error;
    }
  }
}


export class PublicEventsService {
  static async getPromotedEvents(): Promise<PromotedEvent[]> {
    const promotions: PromotedEvent[] = await ApiClient.instance.get("/promotions/active");
    return promotions.map((promotion) => ({
      ...promotion,
      placement: promotion.placement || "home_banner",
    }));
  }

  static async trackPromotion(campaignId: string, metric: "impression" | "click", viewerKey: string): Promise<void> {
    await ApiClient.instance.post("/promotions/{id}/track", {
      params: { path: { id: campaignId } },
      body: { metric, viewerKey },
    });
  }

  static async uploadArtistImage(file: File): Promise<{ url: string }> {
    return ApiClient.instance.uploadEventBanner(file);
  }

  static async searchSpotifyArtists(query: string): Promise<SpotifyArtist[]> {
    const artists = await ApiClient.instance.get("/spotify/search", {
      params: { query: { q: query } },
    });
    return artists;
  }

  /**
   * Preluare evenimente publice pentru Homepage / Discovery (Fără autentificare)
   */
  static async getPublicEvents(filters?: {
    category?: string;
    city?: string;
    vibe?: string;
    organizerId?: string;
    startsAfter?: string;
    startsBefore?: string;
  }): Promise<Event[]> {
    try {
      return await loadEventPages(
        (page) => ApiClient.instance.get("/events", {
          params: { query: { ...filters, page } },
        }),
        filters?.organizerId ? 100 : 20,
      );
    } catch (error) {
      console.error("Eroare la încărcarea evenimentelor publice:", error);
      throw error;
    }
  }

  /**
   * Detalii despre un singur eveniment public
   */
  static async getPublicEventById(id: string): Promise<Event> {
    try {
      const event = await ApiClient.instance.get("/events/{id}", {
        params: { path: { id } },
        cache: "no-store",
      });
      return event;
    } catch (error) {
      console.error(`Eroare la încărcarea evenimentului ${id}:`, error);
      throw error;
    }
  }
}
