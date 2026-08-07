"use server";

import { updateTag } from "next/cache";
import { adminApi, HttpError } from "./api";
import { PUBLISHED_PROJECTS_TAG } from "./free-projects-server";
import type {
  FreeProjectTemplate,
  PublishFreeProjectBody,
  PublishableProject,
  StartedFreeProject,
  TemplateDeletionResult,
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
    updateTag(PUBLISHED_PROJECTS_TAG);
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

/**
 * Push the source project's current photo and masks onto an already-published room.
 *
 * Publishing copies the masks, which is what frees the template from the project
 * behind it and also what made a published room permanently un-editable — a wall
 * that needed widening, or one that had been missed entirely, could only be fixed
 * by deleting the room and publishing again, losing its slug (and every link to
 * it), its shelf position and its usage count. So: fix it in the studio, where the
 * mask editor is, then press this.
 */
export async function refreshFreeProjectAction(
  templateId: string,
): Promise<{ template?: FreeProjectTemplate; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  try {
    const template = await adminApi.refreshFreeProject(token, templateId);
    updateTag(PUBLISHED_PROJECTS_TAG);
    return { template };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      if (err.status === 404) return { error: "That room, or the project behind it, no longer exists." };
      return { error: err.message };
    }
    return { error: "Could not refresh the room. Please try again." };
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
    const template = await adminApi.setFreeProjectPublished(token, templateId, published);
    // Showing or hiding a room IS the publish button for the public gallery, so the
    // cached page has to go with it — otherwise an admin hides a room and keeps
    // finding it on the site.
    updateTag(PUBLISHED_PROJECTS_TAG);
    return { template };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not update the template. Please try again." };
  }
}

/**
 * Take one or more templates off the shelf.
 *
 * {@code purgeFiles} is the whole decision. Left off (the default) the stored
 * photo and masks stay where they are, so every copy anyone already opened keeps
 * working — the template is simply no longer on the shelf. Turned on, those
 * shared files go, and every copy pointing at them loses its picture. The caller
 * has to pass it deliberately; there is no way to purge by accident.
 */
export async function deleteFreeProjectsAction(
  templateIds: string[],
  purgeFiles: boolean,
): Promise<{ result?: TemplateDeletionResult; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  if (templateIds.length === 0) return { error: "Nothing selected." };
  try {
    const result = await adminApi.deleteFreeProjects(token, templateIds, purgeFiles);
    updateTag(PUBLISHED_PROJECTS_TAG);
    return { result };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      return { error: err.message };
    }
    return { error: "Could not remove the rooms. Please try again." };
  }
}

/* The room/style shelves themselves live in ./free-project-rooms — a plain module,
   so the client component can import them without a round trip. */
