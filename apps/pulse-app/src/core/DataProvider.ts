"use client";

import {
  ReadableSchema,
  WritableSchema,
  ApiClient,
} from "@packages/api-client/src/Client";
import { useEffect, useState } from "react";

type UserFields = ReadableSchema<"User">;
export type UserData = ReadableSchema<"User">;
export type CreateEventPayload = WritableSchema<"CreateEventPayload">;
export type UpdateEventPayload = WritableSchema<"UpdateEventPayload">;
export type TicketTier = ReadableSchema<"TicketTypeResponse">;
export type Artist = ReadableSchema<"Artist">;
export type ArtistInput = WritableSchema<"ArtistInput">;
export type SpotifyArtist = ReadableSchema<"SpotifyArtistResponse">;
export type CreateTicketTierPayload = WritableSchema<"CreateTicketTypePayload">;
export type Event = ReadableSchema<"EventResponse">;
export type PublicProfile = ReadableSchema<"PublicProfileResponse">;
export type EventAttendee = ReadableSchema<"EventAttendeeResponse">;
export type OrganizerFinanceEvent = ReadableSchema<"OrganizerFinanceEventResponse">;
export type OrganizerProfile = ReadableSchema<"OrganizerProfile">;
export type ValidationEvent = ReadableSchema<"ValidationEventResponse">;
export type SocialFeedItem = ReadableSchema<"SocialFeedItemResponse">;
export type AppNotification = ReadableSchema<"NotificationResponse">;
export type NotificationList = ReadableSchema<"NotificationListResponse">;

let publicEventsCache: { data: Event[]; timestamp: number } | null = null;
let publicEventsPromise: Promise<Event[]> | null = null;
const PUBLIC_CACHE_TTL = 2 * 60 * 1000;
const EVENT_FRIENDS_CACHE_TTL = 2 * 60 * 1000;
const SOCIAL_CACHE_TTL = 60 * 1000;

type CachedValue<T> = { data: T; timestamp: number };

const eventFriendsCache = new Map<string, CachedValue<EventAttendee[]>>();
const eventFriendsPromises = new Map<string, Promise<EventAttendee[]>>();
const publicProfileCache = new Map<string, CachedValue<PublicProfile>>();
const publicProfilePromises = new Map<string, Promise<PublicProfile>>();
const friendsCache = new Map<string, CachedValue<PublicProfile[]>>();
const friendsPromises = new Map<string, Promise<PublicProfile[]>>();
const socialFeedCache = new Map<string, CachedValue<SocialFeedItem[]>>();
const socialFeedPromises = new Map<string, Promise<SocialFeedItem[]>>();
const notificationCache = new Map<string, CachedValue<NotificationList>>();
const notificationPromises = new Map<string, Promise<NotificationList>>();

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

  async updateProfile(profile: { username?: string; bio?: string; preferredLanguage?: "en" | "ro" }): Promise<UserData> {
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
      body: { token, newPassword },
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

  async getOrganizerFinance(): Promise<OrganizerFinanceEvent[]> {
    return ApiClient.instance.get("/dashboard/finance");
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
    friendsCache.delete(this._properties.id);
  }

  async removeFriend(profileId: string): Promise<void> {
    await ApiClient.instance.delete("/friends/{userId}", {
      params: { path: { userId: profileId } },
    });

    const cachedFriends = friendsCache.get(this._properties.id);
    if (cachedFriends) {
      friendsCache.set(this._properties.id, {
        data: cachedFriends.data.filter((friend) => friend.id !== profileId),
        timestamp: Date.now(),
      });
    }
    socialFeedCache.delete(this._properties.id);
  }

  async markAllNotificationsRead(): Promise<void> {
    await ApiClient.instance.post("/notifications/read-all");
    const cached = notificationCache.get(this._properties.id);
    if (cached) {
      notificationCache.set(this._properties.id, {
        data: {
          ...cached.data,
          unreadCount: 0,
          items: cached.data.items.map((notification) => ({
            ...notification,
            isRead: true,
          })),
        },
        timestamp: Date.now(),
      });
    }
  }

  private _organizerEvents?: Event[];
  private _organizerEventsPromise?: Promise<Event[]>;
  private _organizerEventsError?: Error;

  get organizerEventsPromise() {
    return this._organizerEventsPromise;
  }

  get organizerEventsError(): Error | undefined {
    return this._organizerEventsError;
  }

  get organizerEvents(): readonly Event[] {
    if (
      !this._organizerEvents &&
      !this._organizerEventsError &&
      !this._organizerEventsPromise
    ) {
      this._getOrganizerEvents();
    }
    return this._organizerEvents ?? [];
  }

  private async _getOrganizerEvents(): Promise<Event[]> {
    if (this._organizerEventsPromise) {
      return await this._organizerEventsPromise;
    }

    let resolve!: (events: Event[]) => void;
    let reject!: (error: Error) => void;

    this._organizerEventsPromise = new Promise((r1, r2) => {
      resolve = r1;
      reject = r2;
    });

    try {
      const events = await ApiClient.instance.get("/dashboard/events");
      this._organizerEvents = events;
      this._organizerEventsPromise = undefined;
      this._organizerEventsError = undefined;

      resolve(events);
      this._organizerEventsDidChange();
      return events;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(`Unknown error: ${e}`);
      this._organizerEventsPromise = undefined;
      this._organizerEventsError = err;

      reject(err);
      this._organizerEventsDidChange();
      throw err;
    }
  }

  private _organizerEventsObservers: ((
    events: Event[],
    loading: boolean,
    error?: Error,
  ) => void)[] = [];

  private _organizerEventsDidChange() {
    for (const observer of this._organizerEventsObservers) {
      observer(
        this._organizerEvents ?? [],
        !!this._organizerEventsPromise,
        this._organizerEventsError,
      );
    }
  }

  addOrganizerEventsObserver(
    observer: (events: Event[], loading: boolean, error?: Error) => void,
  ) {
    this._organizerEventsObservers.push(observer);
  }

  removeOrganizerEventsObserver(
    observer: (events: Event[], loading: boolean, error?: Error) => void,
  ) {
    const index = this._organizerEventsObservers.indexOf(observer);
    if (index !== -1) {
      this._organizerEventsObservers.splice(index, 1);
    }
  }

  static useOrganizerEvents(user?: User): {
    events: readonly Event[];
    eventsLoading: boolean;
    eventsError?: Error;
  } {
    const [events, setEvents] = useState<readonly Event[]>(
      () => user?.organizerEvents ?? [],
    );
    const [eventsLoading, setEventsLoading] = useState(
      () => !!user?.organizerEventsPromise,
    );
    const [eventsError, setEventsError] = useState(
      () => user?.organizerEventsError,
    );

    const userId = user?.properties?.id;

    useEffect(() => {
      if (!user) return;

      setEvents(user.organizerEvents);
      setEventsLoading(!!user.organizerEventsPromise);
      setEventsError(user.organizerEventsError);

      const observer = (
        updatedEvents: Event[],
        loading: boolean,
        error?: Error,
      ) => {
        setEvents(updatedEvents);
        setEventsLoading(loading);
        setEventsError(error);
      };

      user.addOrganizerEventsObserver(observer);

      return () => {
        user.removeOrganizerEventsObserver(observer);
      };
    }, [userId, user]);

    return { events, eventsLoading, eventsError };
  }

  async handleCreateEvent(
    eventData: WritableSchema<"CreateEventPayload">,
  ): Promise<Event> {
    try {
      const newEvent = await ApiClient.instance.post("/dashboard/events", {
        body: eventData,
      });

      await this._getOrganizerEvents();
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
      await this._getOrganizerEvents();
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
      await this._getOrganizerEvents();
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
    if (!this._events) return;

    this._events = this._events.map((event) =>
      event.id === eventId
        ? { ...event, stats: { ...event.stats, isFavorited: favorite } }
        : event,
    );
    this.eventsObserversDidChange();
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

  private _events?: Event[];
  private _eventsPromise?: Promise<Event[]>;
  private _eventsError?: Error;

  private async _getEvents(): Promise<Event[]> {
    if (this._eventsPromise) {
      return await this._eventsPromise;
    }

    let resolve!: (events: Event[]) => void;
    let reject!: (error: Error) => void;
    this._eventsPromise = new Promise((r1, r2) => {
      resolve = r1;
      reject = r2;
    });

    try {
      const events = await ApiClient.instance.get("/events");
      this._events = events;
      this._eventsPromise = undefined;
      this._eventsError = undefined;
      this.eventsObserversDidChange();
      resolve(events);
      return events;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(`Unknown error: ${e}`);
      this._events = undefined;
      this._eventsPromise = undefined;
      this._eventsError = err;
      this.eventsObserversDidChange();
      reject(err);
      throw err;
    }
  }

  get eventsPromise() {
    return this._eventsPromise;
  }

  get eventsError(): Error | undefined {
    return this._eventsError;
  }

  get events(): readonly Event[] {
    if (!this._events && !this._eventsError && !this._eventsPromise) {
      this._getEvents();
    }
    return this._events ?? [];
  }

  private _eventsObservers: ((
    events: Event[],
    loading: boolean,
    error?: Error,
  ) => void)[] = [];

  private eventsObserversDidChange() {
    for (const observer of this._eventsObservers) {
      observer(this._events ?? [], !!this._eventsPromise, this._eventsError);
    }
  }

  private addEventsObserver(
    observer: (events: Event[], loading: boolean, error?: Error) => void,
  ) {
    this._eventsObservers.push(observer);
  }

  private removeEventsObserver(
    observer: (events: Event[], loading: boolean, error?: Error) => void,
  ) {
    const index = this._eventsObservers.indexOf(observer);
    if (index !== -1) {
      this._eventsObservers.splice(index, 1);
    }
  }

  static useEvents(
    user?: User,
    authLoading?: boolean,
  ): {
    events: readonly Event[];
    eventsLoading: boolean;
    eventsError?: Error;
  } {
    const [events, setEvents] = useState<readonly Event[]>(
      () => user?.events ?? publicEventsCache?.data ?? [],
    );
    const [eventsLoading, setEventsLoading] = useState(() =>
      user ? !!user.eventsPromise : !publicEventsCache,
    );
    const [eventsError, setEventsError] = useState(() => user?.eventsError);

    const userId = user?.properties?.id;

    useEffect(() => {
      if (authLoading) {
        setEventsLoading(true);
        return;
      }

      if (user) {
        setEvents(user.events ?? []);
        setEventsLoading(!!user.eventsPromise);
        setEventsError(user.eventsError);

        const observer = (
          updatedEvents: Event[],
          loading: boolean,
          error?: Error,
        ) => {
          setEvents(updatedEvents);
          setEventsLoading(loading);
          setEventsError(error);
        };

        user.addEventsObserver(observer);
        return () => {
          user.removeEventsObserver(observer);
        };
      }

      let isMounted = true;
      const now = Date.now();

      if (
        publicEventsCache &&
        now - publicEventsCache.timestamp < PUBLIC_CACHE_TTL
      ) {
        setEvents(publicEventsCache.data);
        setEventsLoading(false);
        return;
      }

      setEventsLoading(true);

      if (!publicEventsPromise) {
        publicEventsPromise = PublicEventsService.getPublicEvents()
          .then((data) => {
            publicEventsCache = { data, timestamp: Date.now() };
            publicEventsPromise = null;
            return data;
          })
          .catch((err) => {
            publicEventsPromise = null;
            throw err;
          });
      }

      publicEventsPromise
        .then((fetchedEvents) => {
          if (isMounted) {
            setEvents(fetchedEvents);
            setEventsError(undefined);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setEventsError(err instanceof Error ? err : new Error(String(err)));
          }
        })
        .finally(() => {
          if (isMounted) {
            setEventsLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [userId, user, authLoading]);

    return { events, eventsLoading, eventsError };
  }

  static async getNotifications(
    viewerId: string,
    force = false,
  ): Promise<NotificationList> {
    const cached = notificationCache.get(viewerId);
    if (!force && cached && Date.now() - cached.timestamp < SOCIAL_CACHE_TTL) {
      return cached.data;
    }

    const pending = notificationPromises.get(viewerId);
    if (!force && pending) return pending;

    const request = ApiClient.instance
      .get("/notifications")
      .then((response) => {
        const data = response as NotificationList;
        notificationCache.set(viewerId, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => {
        notificationPromises.delete(viewerId);
      });

    notificationPromises.set(viewerId, request);
    return request;
  }

  static useNotifications(user: User | undefined): {
    notifications: readonly AppNotification[];
    unreadCount: number;
    notificationsLoading: boolean;
    notificationsError?: Error;
    refresh: () => Promise<void>;
  } {
    const viewerId = user?.properties.id;
    const cached = viewerId ? notificationCache.get(viewerId) : undefined;
    const [data, setData] = useState<NotificationList | undefined>(
      () => cached?.data,
    );
    const [notificationsLoading, setNotificationsLoading] = useState(
      () => Boolean(viewerId && !cached),
    );
    const [notificationsError, setNotificationsError] = useState<Error | undefined>();

    const refresh = async () => {
      if (!user) return;
      setNotificationsLoading(true);
      try {
        const updated = await User.getNotifications(user.properties.id, true);
        setData(updated);
        setNotificationsError(undefined);
      } catch (error) {
        setNotificationsError(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        setNotificationsLoading(false);
      }
    };

    useEffect(() => {
      if (!user) {
        setData(undefined);
        setNotificationsLoading(false);
        setNotificationsError(undefined);
        return;
      }

      let isMounted = true;
      const currentCached = notificationCache.get(user.properties.id);
      setData(currentCached?.data);
      if (currentCached && Date.now() - currentCached.timestamp < SOCIAL_CACHE_TTL) {
        setNotificationsLoading(false);
        return;
      }

      setNotificationsLoading(true);
      User.getNotifications(user.properties.id)
        .then((response) => {
          if (isMounted) {
            setData(response);
            setNotificationsError(undefined);
          }
        })
        .catch((error) => {
          if (isMounted) {
            setNotificationsError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        })
        .finally(() => {
          if (isMounted) setNotificationsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }, [user, viewerId]);

    return {
      notifications: data?.items ?? [],
      unreadCount: data?.unreadCount ?? 0,
      notificationsLoading,
      notificationsError,
      refresh,
    };
  }

  static async getFriends(viewerId: string): Promise<PublicProfile[]> {
    const cached = friendsCache.get(viewerId);
    if (cached && Date.now() - cached.timestamp < SOCIAL_CACHE_TTL) {
      return cached.data;
    }

    const pending = friendsPromises.get(viewerId);
    if (pending) return pending;

    const request = ApiClient.instance
      .get("/friends")
      .then((friends) => {
        const data = friends as PublicProfile[];
        friendsCache.set(viewerId, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => {
        friendsPromises.delete(viewerId);
      });

    friendsPromises.set(viewerId, request);
    return request;
  }

  static useFriends(user: User | undefined): {
    friends: readonly PublicProfile[];
    friendsLoading: boolean;
    friendsError?: Error;
  } {
    const viewerId = user?.properties.id;
    const cached = viewerId ? friendsCache.get(viewerId) : undefined;
    const [friends, setFriends] = useState<readonly PublicProfile[]>(
      () => cached?.data ?? [],
    );
    const [friendsLoading, setFriendsLoading] = useState(
      () => Boolean(viewerId && !cached),
    );
    const [friendsError, setFriendsError] = useState<Error | undefined>();

    useEffect(() => {
      if (!user) {
        setFriends([]);
        setFriendsLoading(false);
        setFriendsError(undefined);
        return;
      }

      let isMounted = true;
      const currentCached = friendsCache.get(user.properties.id);
      setFriends(currentCached?.data ?? []);
      if (currentCached && Date.now() - currentCached.timestamp < SOCIAL_CACHE_TTL) {
        setFriendsLoading(false);
        setFriendsError(undefined);
        return;
      }

      setFriendsLoading(true);
      setFriendsError(undefined);
      User.getFriends(user.properties.id)
        .then((data) => {
          if (isMounted) setFriends(data);
        })
        .catch((error) => {
          if (!isMounted) return;
          setFriends([]);
          setFriendsError(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          if (isMounted) setFriendsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }, [user, viewerId]);

    return { friends, friendsLoading, friendsError };
  }

  static async getSocialFeed(viewerId: string): Promise<SocialFeedItem[]> {
    const cached = socialFeedCache.get(viewerId);
    if (cached && Date.now() - cached.timestamp < SOCIAL_CACHE_TTL) {
      return cached.data;
    }

    const pending = socialFeedPromises.get(viewerId);
    if (pending) return pending;

    const request = ApiClient.instance
      .get("/feed")
      .then((items) => {
        const data = items as SocialFeedItem[];
        socialFeedCache.set(viewerId, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => {
        socialFeedPromises.delete(viewerId);
      });

    socialFeedPromises.set(viewerId, request);
    return request;
  }

  static useSocialFeed(user: User | undefined): {
    items: readonly SocialFeedItem[];
    feedLoading: boolean;
    feedError?: Error;
  } {
    const viewerId = user?.properties.id;
    const cached = viewerId ? socialFeedCache.get(viewerId) : undefined;
    const [items, setItems] = useState<readonly SocialFeedItem[]>(
      () => cached?.data ?? [],
    );
    const [feedLoading, setFeedLoading] = useState(
      () => Boolean(viewerId && !cached),
    );
    const [feedError, setFeedError] = useState<Error | undefined>();

    useEffect(() => {
      if (!user) {
        setItems([]);
        setFeedLoading(false);
        setFeedError(undefined);
        return;
      }

      let isMounted = true;
      const currentCached = socialFeedCache.get(user.properties.id);
      setItems(currentCached?.data ?? []);
      if (currentCached && Date.now() - currentCached.timestamp < SOCIAL_CACHE_TTL) {
        setFeedLoading(false);
        setFeedError(undefined);
        return;
      }

      setFeedLoading(true);
      setFeedError(undefined);
      User.getSocialFeed(user.properties.id)
        .then((data) => {
          if (isMounted) setItems(data);
        })
        .catch((error) => {
          if (!isMounted) return;
          setItems([]);
          setFeedError(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          if (isMounted) setFeedLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }, [user, viewerId]);

    return { items, feedLoading, feedError };
  }

  static async getEventFriends(
    eventId: string,
    viewerId: string,
  ): Promise<EventAttendee[]> {
    const cacheKey = `${viewerId}:${eventId}`;
    const cached = eventFriendsCache.get(cacheKey);

    if (
      cached &&
      Date.now() - cached.timestamp < EVENT_FRIENDS_CACHE_TTL
    ) {
      return cached.data;
    }

    const pending = eventFriendsPromises.get(cacheKey);
    if (pending) return pending;

    const request = ApiClient.instance
      .get("/events/{id}/attendees", { params: { path: { id: eventId } } })
      .then((attendees) => {
        const friends = (attendees as EventAttendee[]).filter(
          (attendee) => attendee.relationship === "friends",
        );
        eventFriendsCache.set(cacheKey, { data: friends, timestamp: Date.now() });
        return friends;
      })
      .finally(() => {
        eventFriendsPromises.delete(cacheKey);
      });

    eventFriendsPromises.set(cacheKey, request);
    return request;
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
    const cacheKey = viewerId ? `${viewerId}:${eventId}` : "";
    const cached = cacheKey ? eventFriendsCache.get(cacheKey) : undefined;
    const [friends, setFriends] = useState<readonly EventAttendee[]>(
      () => cached?.data ?? [],
    );
    const [friendsLoading, setFriendsLoading] = useState(
      () => Boolean(viewerId && !cached),
    );
    const [friendsError, setFriendsError] = useState<Error | undefined>();

    useEffect(() => {
      if (!user || !eventId) {
        setFriends([]);
        setFriendsLoading(false);
        setFriendsError(undefined);
        return;
      }

      const currentCacheKey = `${user.properties.id}:${eventId}`;
      const currentCached = eventFriendsCache.get(currentCacheKey);
      let isMounted = true;

      setFriends(currentCached?.data ?? []);

      if (currentCached && Date.now() - currentCached.timestamp < EVENT_FRIENDS_CACHE_TTL) {
        setFriends(currentCached.data);
        setFriendsLoading(false);
        setFriendsError(undefined);
        return;
      }

      setFriendsLoading(true);
      setFriendsError(undefined);
      User.getEventFriends(eventId, user.properties.id)
        .then((data) => {
          if (isMounted) setFriends(data);
        })
        .catch((error) => {
          if (isMounted) {
            setFriends([]);
            setFriendsError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        })
        .finally(() => {
          if (isMounted) setFriendsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }, [eventId, user, viewerId]);

    return { friends, friendsLoading, friendsError };
  }

  static async getPublicProfile(
    profileId: string,
    viewerId = "guest",
  ): Promise<PublicProfile> {
    const cacheKey = `${viewerId}:${profileId}`;
    const cached = publicProfileCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < PUBLIC_CACHE_TTL) {
      return cached.data;
    }

    const pending = publicProfilePromises.get(cacheKey);
    if (pending) return pending;

    const request = ApiClient.instance
      .get("/profiles/{id}", { params: { path: { id: profileId } } })
      .then((profile) => {
        const data = profile as PublicProfile;
        publicProfileCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      })
      .finally(() => {
        publicProfilePromises.delete(cacheKey);
      });

    publicProfilePromises.set(cacheKey, request);
    return request;
  }

  static async getPublicEventById(id: string): Promise<Event> {
    try {
      const event = await ApiClient.instance.get("/events/{id}", {
        params: { path: { id } },
      });
      return event;
    } catch (error) {
      console.error(`Eroare la încărcarea evenimentului ${id}:`, error);
      throw error;
    }
  }
}

// // --- Management Caching & Promise-uri pentru Proiecte ---
// private _projects?: ManagedProject[];
// private _projectsPromise?: Promise<ManagedProject[]>;
// private _projectsError?: Error;

// get projectsPromise() {
//   return this._projectsPromise;
// }

// get projectsError(): Error | undefined {
//   return this._projectsError;
// }

// /**
//  * Returnează proiectele salvate în cache. Dacă nu există și nu este deja
//  * o cerere în curs, declanșează automat încărcarea lor asincronă.
//  */
// get projects(): readonly ManagedProject[] {
//   if (!this._projects && !this._projectsError && !this._projectsPromise) {
//     this._getProjects();
//   }
//   return this._projects ?? [];
// }

// /**
//  * Metoda internă care face fetch-ul efectiv și gestionează stările promise-ului.
//  */
// private async _getProjects(): Promise<ManagedProject[]> {
//   if (this._projectsPromise) {
//     return await this._projectsPromise;
//   }

//   let resolve!: (p: ManagedProject[]) => void;
//   let reject!: (e: Error) => void;

//   this._projectsPromise = new Promise((r1, r2) => {
//     resolve = r1;
//     reject = r2;
//   });

//   // Notificăm observatorii că a început încărcarea (loading = true)
//   this._projectsDidChange();

//   try {
//     // TODO: Aici va veni apelul tău real către API (ex: fetch, axios sau clientul tău)
//     // Momentan simulăm un apel de rețea:
//     const mockProjects: ManagedProject[] = [
//       {
//         id: "p1",
//         title: "Primul Proiect Base",
//         tenant_id: this._properties.tenant_id,
//       },
//     ];

//     // Simulăm un delay de rețea de 500ms
//     await new Promise((res) => setTimeout(res, 500));

//     this._projects = mockProjects;
//     this._projectsPromise = undefined;
//     this._projectsError = undefined;

//     resolve(mockProjects);
//     this._projectsDidChange();
//     return mockProjects;
//   } catch (e) {
//     const err = e instanceof Error ? e : new Error(`Unknown error: ${e}`);
//     this._projectsPromise = undefined;
//     this._projectsError = err;

//     reject(err);
//     this._projectsDidChange();
//     throw err;
//   }
// }

// // --- Sistemul de Observatori (Pattern-ul Observer pentru React) ---
// private _projectsObservers: ((
//   projects: ManagedProject[],
//   loading: boolean,
//   error?: Error,
// ) => void)[] = [];

// private _projectsDidChange() {
//   for (const observer of this._projectsObservers) {
//     observer(
//       this._projects ?? [],
//       !!this._projectsPromise,
//       this._projectsError,
//     );
//   }
// }

// addProjectObserver(
//   observer: (
//     projects: ManagedProject[],
//     loading: boolean,
//     error?: Error,
//   ) => void,
// ) {
//   this._projectsObservers.push(observer);
// }

// removeProjectObserver(
//   observer: (
//     projects: ManagedProject[],
//     loading: boolean,
//     error?: Error,
//   ) => void,
// ) {
//   const index = this._projectsObservers.indexOf(observer);
//   if (index !== -1) {
//     this._projectsObservers.splice(index, 1);
//   }
// }

// // --- Hook-ul Custom static pentru componentele de React ---
// static useProjects(user?: User): {
//   projects: readonly ManagedProject[];
//   projectsLoading: boolean;
//   projectsError?: Error;
// } {
//   const [projects, setProjects] = useState<readonly ManagedProject[]>(
//     user?.projects ?? [],
//   );
//   const [projectsLoading, setProjectsLoading] = useState(
//     !!user?.projectsPromise,
//   );
//   const [projectsError, setProjectsError] = useState(user?.projectsError);

//   useEffect(() => {
//     if (!user) return;

//     // Sincronizăm starea inițială în caz că s-a schimbat user-ul primit ca parametru
//     setProjects(user.projects);
//     setProjectsLoading(!!user.projectsPromise);
//     setProjectsError(user.projectsError);

//     const observer = (
//       updatedProjects: readonly ManagedProject[],
//       loading: boolean,
//       err?: Error,
//     ) => {
//       setProjects(updatedProjects);
//       setProjectsLoading(loading);
//       setProjectsError(err);
//     };

//     user.addProjectObserver(observer);
//     return () => user.removeProjectObserver(observer);
//   }, [user]);

//   return { projects, projectsLoading, projectsError };
// }

export class PublicEventsService {
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
      const events = await ApiClient.instance.get("/events", {
        params: { query: filters },
      });
      return events;
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
      });
      return event;
    } catch (error) {
      console.error(`Eroare la încărcarea evenimentului ${id}:`, error);
      throw error;
    }
  }
}
