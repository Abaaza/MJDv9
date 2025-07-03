/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as activityLogs from "../activityLogs.js";
import type * as activityLogs from "../activityLogs.js";
import type * as applicationSettings from "../applicationSettings.js";
import type * as applicationSettings from "../applicationSettings.js";
import type * as clients from "../clients.js";
import type * as clients from "../clients.js";
import type * as dashboard from "../dashboard.js";
import type * as dashboard from "../dashboard.js";
import type * as importJobs from "../importJobs.js";
import type * as importJobs from "../importJobs.js";
import type * as priceItems from "../priceItems.js";
import type * as priceItems from "../priceItems.js";
import type * as priceMatching from "../priceMatching.js";
import type * as priceMatching from "../priceMatching.js";
import type * as projects from "../projects.js";
import type * as projects from "../projects.js";
import type * as users from "../users.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  activityLogs: typeof activityLogs;
  activityLogs: typeof activityLogs;
  applicationSettings: typeof applicationSettings;
  applicationSettings: typeof applicationSettings;
  clients: typeof clients;
  clients: typeof clients;
  dashboard: typeof dashboard;
  dashboard: typeof dashboard;
  importJobs: typeof importJobs;
  importJobs: typeof importJobs;
  priceItems: typeof priceItems;
  priceItems: typeof priceItems;
  priceMatching: typeof priceMatching;
  priceMatching: typeof priceMatching;
  projects: typeof projects;
  projects: typeof projects;
  users: typeof users;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
