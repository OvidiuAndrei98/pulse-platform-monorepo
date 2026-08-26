import { components, paths } from "./schema";

// --- MARKERI OPENAPI SPREAD ---
export type $Read<T> = T & { readonly __read?: true };
export type $Write<T> = T & { readonly __write?: true };

/**
 * Forțează TypeScript să evalueze și să aplatizeze tipul la un singur nivel brut de obiect.
 */
type Simplify<T> = T extends object ? { [K in keyof T]: T[K] } : T;

/**
 * Extrage tipul de Response (Readable) direct din components['schemas'].
 */
export type ReadableSchema<Name extends keyof components["schemas"]> = Simplify<
  components["schemas"][Name]
>;

/**
 * Extrage tipul de Request (Writable) eliminând câmpurile standard de tip ID sau Timestamps generate de server.
 */
export type WritableSchema<Name extends keyof components["schemas"]> = Simplify<
  Omit<
    components["schemas"][Name],
    "id" | "created_at" | "updated_at" | "deleted_at"
  >
>;

// --- INTERFEȚE METODE CLIENT ---
export type HttpMethods = "get" | "post" | "put" | "patch" | "delete";

export type OperationParameters<
  Path extends keyof paths,
  Method extends HttpMethods,
> = paths[Path][Method] extends { parameters: any }
  ? paths[Path][Method]["parameters"]
  : never;

/**
 * Interceptează direct corpul cererii definit în rută.
 */
export type OperationRequestBody<
  Path extends keyof paths,
  Method extends HttpMethods,
> = paths[Path][Method] extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Simplify<Body>
  : never;

/**
 * Interceptează direct răspunsul de succes definit în rută.
 */
export type OperationResponse<
  Path extends keyof paths,
  Method extends HttpMethods,
> = paths[Path][Method] extends {
  responses: { 200: { content: { "application/json": infer Response } } };
}
  ? Simplify<Response>
  : paths[Path][Method] extends {
        responses: { 201: { content: { "application/json": infer Response } } };
      }
    ? Simplify<Response>
    : void;

// --- EXECUTABILUL API CLIENT ---
export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
  ) {
    super(`[API Error ${status}] ${title}: ${detail ?? ""}`);
  }
}

export interface ClientConfiguration {
  apiRoot: string;
  getAccessToken?: () => string | null | undefined;
}

async function asWebP(
  file: File,
  maxDimension: number,
  quality = 0.86,
): Promise<File> {
  if (file.type === "image/webp") return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Imaginea nu a putut fi procesata.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Conversia WebP a esuat.")),
        "image/webp",
        quality,
      );
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export class ApiClient {
  private static shared: ApiClient | null = null;
  private config: ClientConfiguration;

  private constructor(config: ClientConfiguration) {
    this.config = config;
  }

  public static configure(config: ClientConfiguration): void {
    this.shared = new ApiClient(config);
  }

  public static get instance(): ApiClient {
    if (!this.shared)
      throw new Error("ApiClient generic configurat defectuos.");
    return this.shared;
  }

  private async request<Path extends keyof paths, Method extends HttpMethods>(
    method: Method,
    path: Path,
    options?: { params?: OperationParameters<Path, Method>; body?: any },
  ): Promise<any> {
    let urlPath = path as string;
    const params = options?.params as any;

    if (params?.path) {
      for (const [key, value] of Object.entries(params.path)) {
        urlPath = urlPath.replace(`{${key}}`, String(value));
      }
    }

    const url = new URL(`${this.config.apiRoot}${urlPath}`);
    if (params?.query) {
      for (const [key, value] of Object.entries(params.query)) {
        if (value !== undefined && value !== null)
          url.searchParams.append(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.getAccessToken) {
      const token = this.config.getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { title: response.statusText };
      }
      throw new ApiError(
        response.status,
        errorData.title || "Error",
        errorData.detail,
      );
    }

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
        return;
      }
    }

    if (response.status === 204) return undefined;

    return response.json();
  }

  public get<Path extends keyof paths>(
    path: Path,
    options?: { params?: OperationParameters<Path, "get"> },
  ) {
    return this.request("get", path, options);
  }

  public post<Path extends keyof paths>(
    path: Path,
    options?: {
      params?: OperationParameters<Path, "post">;
      body?: OperationRequestBody<Path, "post">;
    },
  ) {
    return this.request("post", path, options);
  }

  public put<Path extends keyof paths>(
    path: Path,
    options?: {
      params?: OperationParameters<Path, "put">;
      body?: OperationRequestBody<Path, "put">;
    },
  ) {
    return this.request("put", path, options);
  }

  public patch<Path extends keyof paths>(
    path: Path,
    options?: {
      params?: OperationParameters<Path, "patch">;
      body?: OperationRequestBody<Path, "patch">;
    },
  ) {
    return this.request("patch", path, options);
  }

  public delete<Path extends keyof paths>(
    path: Path,
    options?: { params?: OperationParameters<Path, "delete"> },
  ) {
    return this.request("delete", path, options);
  }

  public async uploadEventBanner(file: File): Promise<{ url: string }> {
    file = await asWebP(file, 1920);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": file.type,
    };

    if (this.config.getAccessToken) {
      const token = this.config.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      new URL(`${this.config.apiRoot}/dashboard/uploads/event-banner`).toString(),
      {
        method: "POST",
        headers,
        body: file,
      },
    );

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { title: response.statusText };
      }
      throw new ApiError(
        response.status,
        errorData.error || errorData.title || "Error",
        errorData.detail || errorData.error,
      );
    }

    return response.json();
  }

  public async uploadOrganizerUpdateImage(file: File): Promise<{ url: string }> {
    file = await asWebP(file, 1600);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": file.type,
    };

    if (this.config.getAccessToken) {
      const token = this.config.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      new URL(`${this.config.apiRoot}/dashboard/uploads/organizer-update`).toString(),
      { method: "POST", headers, body: file },
    );

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { title: response.statusText };
      }
      throw new ApiError(
        response.status,
        errorData.error || errorData.title || "Error",
        errorData.detail || errorData.error,
      );
    }

    return response.json();
  }

  public async uploadProfileAvatar(
    file: File,
  ): Promise<ReadableSchema<"User">> {
    file = await asWebP(file, 1024, 0.84);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": file.type,
    };

    if (this.config.getAccessToken) {
      const token = this.config.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
      new URL(`${this.config.apiRoot}/users/me/avatar`).toString(),
      {
        method: "POST",
        headers,
        body: file,
      },
    );

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { title: response.statusText };
      }
      throw new ApiError(
        response.status,
        errorData.title || "Error",
        errorData.detail,
      );
    }

    return response.json();
  }
}
