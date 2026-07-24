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
export type CreateTicketTierPayload = WritableSchema<"CreateTicketTypePayload">;
export type Event = ReadableSchema<"EventResponse">;

let publicEventsCache: { data: Event[]; timestamp: number } | null = null;
let publicEventsPromise: Promise<Event[]> | null = null;
const PUBLIC_CACHE_TTL = 2 * 60 * 1000;

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

  async getOrganizerProfile(): Promise<
    ReadableSchema<"OrganizerProfile"> | undefined
  > {
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
  ): Promise<ReadableSchema<"OrganizerProfile">> {
    try {
      const updatedProfile = await ApiClient.instance.post(
        "/dashboard/organizer/profile",
        {
          body: {
            cui,
            companyName,
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
      return;
    }
    await ApiClient.instance.delete("/events/{id}/favorite", {
      params: { path: { id: eventId } },
    });
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
  /**
   * Preluare evenimente publice pentru Homepage / Discovery (Fără autentificare)
   */
  static async getPublicEvents(filters?: {
    category?: string;
    city?: string;
    vibe?: string;
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
