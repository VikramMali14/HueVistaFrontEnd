"use server";

import { updateTag } from "next/cache";
import { adminApi, galleryApi, HttpError } from "./api";
import { PUBLISHED_PROJECTS_TAG } from "./free-projects-server";
import type {
  FreeProjectTemplate,
  PublishFreeProjectBody,
  PublishableProject,
  StartedFreeProject,
  TemplateDeletionResult,
  UpdateFreeProjectBody,
} from "./api";
import { getAccessToken } from "./auth";

/**
 * Server actions for the free-project library.
 *
 * Kept out of auth.ts because none of this is about sessions — it is the admin
 * screen's worth of calls plus the one visitors make, and auth.ts is already long
 * enough to be hard to read.
 *
 * All but the last are ADMIN actions against `/api/admin/free-projects`. The
 * exception is {@link startGalleryRoomAction}, which is how an ordinary signed-in
 * visitor takes a room off the public gallery — a different path, a different gate,
 * and the room named by slug rather than by an internal id.
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

/**
 * Edit a room already on the shelf — where it shows, and the copy printed with it.
 *
 * Metadata only. The photograph and the masks belong to the source project and
 * are replaced by {@link refreshFreeProjectAction}, so "moving a wall" stays on
 * one path with one set of rules about the copies people already hold.
 *
 * The backend leaves out any field this omits, which is what lets the edit form
 * send only what it displays. It also means an empty string is meaningful: it
 * clears the field. The form relies on that to delete a credit line.
 */
export async function updateFreeProjectAction(
  templateId: string,
  input: UpdateFreeProjectBody,
): Promise<{ template?: FreeProjectTemplate; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { error: "Your session expired — please sign in again." };
  if (input.title !== undefined && !input.title.trim()) return { error: "A room needs a title." };
  try {
    const template = await adminApi.updateFreeProject(token, templateId, input);
    // Moving a room between the gallery and the portfolio changes BOTH pages, and
    // one tag covers both — see PUBLISHED_PROJECTS_TAG.
    updateTag(PUBLISHED_PROJECTS_TAG);
    return { template };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 403) return { error: "Admin access is required." };
      if (err.status === 404) return { error: "That room no longer exists." };
      return { error: err.message };
    }
    return { error: "Could not save the changes. Please try again." };
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

/**
 * Take a room off the public gallery and open it as the visitor's own project.
 *
 * The one action here that is not an admin action. It addresses the room by the
 * slug already on the gallery card, because the public listing never hands out an
 * internal template id — see PublicFreeProjectResponse on the backend.
 *
 * A signed-OUT visitor is the expected case, not an error: the gallery is a
 * marketing page and most people reading it have no session. Rather than failing,
 * this reports `signInRequired` and lets the caller bounce through /sign-in with a
 * `next` that comes back here and finishes the job, so the click is not lost.
 */
export async function startGalleryRoomAction(
  slug: string,
): Promise<{ started?: StartedFreeProject; signInRequired?: boolean; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { signInRequired: true };
  try {
    return { started: await galleryApi.startPublishedRoom(token, slug) };
  } catch (err) {
    if (err instanceof HttpError) {
      // The cookie was there but the backend rejected it — an expired session, so
      // signing in again is the fix rather than an error to read.
      if (err.status === 401 || err.status === 403) return { signInRequired: true };
      if (err.status === 404) {
        return { error: "That room is no longer in the gallery." };
      }
      if (err.status === 429) {
        return { error: "You have opened a lot of rooms just now — give it a minute." };
      }
      return { error: err.message };
    }
    return { error: "Could not open this room. Please try again." };
  }
}

/* The room/style shelves themselves live in ./free-project-rooms — a plain module,
   so the client component can import them without a round trip. */
