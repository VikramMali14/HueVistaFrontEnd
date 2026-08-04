"use server";

import { adminApi, HttpError } from "./api";
import type {
  FreeProjectTemplate,
  PublishFreeProjectBody,
  PublishableProject,
  StartedFreeProject,
} from "./api";
import { getAccessToken } from "./auth";

/**
 * Server actions for the free-project library.
 *
 * Kept out of auth.ts because none of this is about sessions — it is one admin
 * screen's worth of calls, and auth.ts is already long enough to be hard to read.
 */

/** The shelf, in gallery order. Null = could not be loaded (never "empty"). */
export async function getFreeProjects(): Promise<FreeProjectTemplate[] | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listFreeProjects(token, true);
  } catch {
    return null;
  }
}

/** The admin's own projects, as candidates to publish. */
export async function getFreeProjectSources(): Promise<PublishableProject[] | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await adminApi.listFreeProjectSources(token);
  } catch {
    return null;
  }
}

/** Freeze a project into the library: its photo and masks are copied once. */
export async function publishFreeProjectAction(
  input: PublishFreeProjectBody,
): Promise<{ template?: FreeProjectTemplate; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  if (!input.projectId) return { error: "Pick the project to publish." };
  if (!input.title?.trim()) return { error: "Give the template a title." };
  if (!input.roomKey?.trim()) return { error: "Choose a room type." };
  try {
    const template = await adminApi.publishFreeProject(token, {
      ...input,
      title: input.title.trim(),
      roomKey: input.roomKey.trim().toUpperCase(),
    });
    return { template };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      if (err.status === 404) return { error: "That project no longer exists." };
      return { error: err.message };
    }
    return { error: "Could not publish the template. Please try again." };
  }
}

/**
 * Open a copy of a template for the signed-in admin. Returns the new project id,
 * which the caller uses to jump to the studio.
 */
export async function startFreeProjectAction(
  templateId: string,
): Promise<{ started?: StartedFreeProject; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { started: await adminApi.startFreeProject(token, templateId) };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      if (err.status === 404) return { error: "That template no longer exists." };
      return { error: err.message };
    }
    return { error: "Could not open a copy. Please try again." };
  }
}

/** Show or hide a template. Files are untouched either way. */
export async function setFreeProjectPublishedAction(
  templateId: string,
  published: boolean,
): Promise<{ template?: FreeProjectTemplate; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    return { template: await adminApi.setFreeProjectPublished(token, templateId, published) };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not update the template. Please try again." };
  }
}

/**
 * Take a template off the shelf. The stored photo and masks are KEPT: copies
 * already in people's accounts point at those exact files and would go blank.
 */
export async function deleteFreeProjectAction(
  templateId: string,
): Promise<{ ok?: true; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    await adminApi.deleteFreeProject(token, templateId, false);
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not delete the template. Please try again." };
  }
}

/* The room/style shelves themselves live in ./free-project-rooms — a plain module,
   so the client component can import them without a round trip. */
