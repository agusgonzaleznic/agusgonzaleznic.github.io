import { storyblokEditable } from "@storyblok/react";
import type { StoryblokComponent } from "@/lib/types/storyblok";

/**
 * `storyblokEditable` for our own blok types.
 *
 * The SDK takes `SbBlokData`, which carries an `[index: string]: …` index
 * signature. Our blok interfaces in `@/lib/types/storyblok` are hand-written and
 * deliberately do NOT: an index signature would make `blok.headng` resolve to a
 * value instead of erroring, and a silently-renamed CMS field is a mistake this
 * site has already made more than once. So the interfaces stay exact and the
 * structural mismatch is absorbed here, once, instead of at twelve call sites.
 *
 * The cast is sound at runtime: the function reads only `_editable`, which every
 * blok type declares. Verified against the shipped bundle — a blok carrying
 * `_editable` yields `{ 'data-blok-c', 'data-blok-uid' }`, and one with just
 * `_uid`/`component` yields `{}` rather than throwing.
 */
export const editableProps = (blok: StoryblokComponent) =>
  storyblokEditable(blok as unknown as Parameters<typeof storyblokEditable>[0]);
