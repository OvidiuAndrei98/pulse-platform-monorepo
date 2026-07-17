import { ReadableSchema, ApiClient } from "@packages/api-client/src/Client";
import { useEffect, useState } from "react";

type UserFields = ReadableSchema<"User">;

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
}
