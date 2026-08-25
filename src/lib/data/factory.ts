import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient as createServerClient } from "../supabase/server";
import { LocalDataRepository } from "./local-repository";
import { DataConfigurationError, type DataRepository } from "./repository";
import { DEMO_USER_ID } from "./seed";
import { SupabaseDataRepository } from "./supabase-repository";

export interface DataRepositoryOptions {
  userId?: string;
  forceLocal?: boolean;
  localFilePath?: string;
  supabaseClient?: SupabaseClient<Database>;
}

/**
 * Creates a request-scoped repository. Supabase is selected only when its
 * public environment variables are present; otherwise data persists locally.
 */
export async function getDataRepository(
  options: DataRepositoryOptions = {},
): Promise<DataRepository> {
  if (options.forceLocal || !isSupabaseConfigured()) {
    return new LocalDataRepository({
      userId: options.userId ?? DEMO_USER_ID,
      filePath: options.localFilePath,
    });
  }

  const client = options.supabaseClient ?? (await createServerClient());
  let userId = options.userId;
  if (!userId) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      throw new DataConfigurationError("An authenticated user is required for Supabase data access.");
    }
    userId = data.user.id;
  }
  return new SupabaseDataRepository(client, userId);
}

export const createDataRepository = getDataRepository;
export const getRepository = getDataRepository;

