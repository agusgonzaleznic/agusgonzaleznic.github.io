################################################################################
# Storyblok STRUCTURE as code — space 288632938663524 (EU, mapi.storyblok.com)
#
# Managed here: component definitions (schemas) + the rebuild webhook.
# NOT managed here: stories/content (blog folder, drafts) — the labd/storyblok
# provider has no story resource; content stays in the CMS.
#
# Components (labd/storyblok v1.5.1, import via "{space_id}/{component_id}"):
#   - Schemas below were transcribed 1:1 from the live Management API
#     (GET /v1/spaces/:space_id/components) on 2026-07-05. Any schema drift in
#     config will be PUT back to Storyblok on apply — after editing schemas in
#     the Storyblok UI, re-sync this file before applying, or the apply will
#     clobber the UI change. Review every plan diff on these resources.
#   - The provider does not model per-field "id" strings (Storyblok regenerates
#     them; content binds fields by key, not id) nor presets/internal tags
#     (all empty in this space). Everything else in the live schemas maps 1:1.
#   - Known provider bug (labd/terraform-provider-storyblok#105): components
#     whose API response holds numbers in provider-string fields fail to Read.
#     No field in this space uses the affected attributes (allowed_paths etc).
#
# Webhook: plan starter_2025 — no signing secret / custom headers; auth is the
# ?token=... query parameter checked by the Lambda (webhook.tf).
#
# Secrets: var.token and var.storyblok_webhook_url_token have no defaults and
# are passed at plan/apply time via op, e.g.:
#   op run --env-file ~/.env --no-masking -- bash -c \
#     'TF_VAR_token=$STORYBLOK_MANAGEMENT_TOKEN \
#      TF_VAR_storyblok_webhook_url_token=$STORYBLOK_WEBHOOK_URL_TOKEN \
#      terraform plan'
# Values still land in the state file — never in code.
################################################################################

################################################################################
# Rebuild webhook -> Lambda function URL (webhook.tf) -> GitHub Actions deploy
################################################################################

resource "storyblok_webhook" "rebuild" {
  space_id    = var.space_id
  name        = "storyblok-rebuild"
  description = "Rebuild agusgonzaleznic.com on content changes (GitHub Actions deploy.yml)"
  endpoint    = "${aws_lambda_function_url.webhook.function_url}?token=${var.storyblok_webhook_url_token}"

  actions = [
    "story.published",
    "story.unpublished",
    "story.deleted",
    "story.moved",
  ]
}

################################################################################
# Components — generated from live schemas, keep sorted by name
################################################################################

resource "storyblok_component" "about_block" {
  space_id     = var.space_id
  name         = "about_block"
  display_name = "About Block"
  icon         = "block-image"
  is_root      = false
  is_nestable  = true

  schema = {
    heading      = { type = "text", position = 0, display_name = "Heading", required = true }
    subheading   = { type = "text", position = 1, display_name = "Subheading" }
    content      = { type = "markdown", position = 2, display_name = "Content", required = true }
    image        = { type = "asset", position = 3, display_name = "Image", filetypes = ["images"] }
    stats        = { type = "bloks", position = 4, display_name = "Statistics", restrict_components = true, component_whitelist = ["stat_item"] }
    show_section = { type = "boolean", position = 5, display_name = "Show This Section", default_value = "true" }
  }
}

resource "storyblok_component" "blog_post" {
  space_id     = var.space_id
  name         = "blog_post"
  display_name = "Blog Post"
  is_root      = true
  is_nestable  = false

  schema = {
    content_tab        = { type = "tab", position = 0, display_name = "Content", keys = ["title", "excerpt", "body", "cover_image", "published_date", "original_url"] }
    title              = { type = "text", position = 1, display_name = "Title", required = true }
    excerpt            = { type = "textarea", position = 2, display_name = "Excerpt", description = "Short teaser shown on the blog index and used as default meta description", required = true, max_length = 200 }
    body               = { type = "richtext", position = 3, display_name = "Body", required = true }
    cover_image        = { type = "asset", position = 4, display_name = "Cover Image", filetypes = ["images"] }
    published_date     = { type = "datetime", position = 5, display_name = "Published Date", description = "Original publication date", required = true }
    original_url       = { type = "text", position = 6, display_name = "Original URL", description = "If republished (e.g. from Medium), the original URL" }
    seo_tab            = { type = "tab", position = 7, display_name = "SEO", keys = ["seo_title", "seo_description", "canonical_override"] }
    seo_title          = { type = "text", position = 8, display_name = "SEO Title", max_length = 60 }
    seo_description    = { type = "textarea", position = 9, display_name = "SEO Description", max_length = 160 }
    canonical_override = { type = "text", position = 10, display_name = "Canonical Override", description = "Leave empty — self-canonical by default" }
  }
}

resource "storyblok_component" "contact_block" {
  space_id     = var.space_id
  name         = "contact_block"
  display_name = "Contact Block"
  icon         = "block-email"
  is_root      = false
  is_nestable  = true

  schema = {
    heading             = { type = "text", position = 0, display_name = "Heading" }
    subheading          = { type = "textarea", position = 1, display_name = "Subheading" }
    email               = { type = "text", position = 2, display_name = "Contact Email", required = true }
    linkedin_url        = { type = "text", position = 3, display_name = "LinkedIn URL", regex = "^https?://.*" }
    github_url          = { type = "text", position = 4, display_name = "GitHub URL", regex = "^https?://.*" }
    response_time_text  = { type = "textarea", position = 5, display_name = "Response Time Text" }
    discovery_call_text = { type = "textarea", position = 6, display_name = "Discovery Call Text" }
    show_form           = { type = "boolean", position = 7, display_name = "Show Contact Form", default_value = "true" }
    show_section        = { type = "boolean", position = 8, display_name = "Show This Section", default_value = "true" }
  }
}

resource "storyblok_component" "hero_block" {
  space_id     = var.space_id
  name         = "hero_block"
  display_name = "Hero Block"
  icon         = "block-block"
  is_root      = false
  is_nestable  = true

  schema = {
    name               = { type = "text", position = 0, display_name = "Full Name", required = true }
    title              = { type = "text", position = 1, display_name = "Professional Title", required = true }
    tagline            = { type = "text", position = 2, display_name = "Tagline", required = true }
    description        = { type = "markdown", position = 3, display_name = "Hero Description", required = true }
    cta_text           = { type = "text", position = 4, display_name = "Primary CTA Text" }
    cta_url            = { type = "text", position = 5, display_name = "Primary CTA URL", regex = "^https?://.*" }
    secondary_cta_text = { type = "text", position = 6, display_name = "Secondary CTA Text" }
    secondary_cta_url  = { type = "text", position = 7, display_name = "Secondary CTA URL" }
    profile_image      = { type = "asset", position = 8, display_name = "Profile Image", required = true, filetypes = ["images"] }
    background_style   = { type = "option", position = 9, display_name = "Background Style", default_value = "gradient", options = [{ name = "Gradient", value = "gradient" }, { name = "Solid Color", value = "solid" }, { name = "Image Background", value = "image" }] }
  }
}

resource "storyblok_component" "impact_block" {
  space_id     = var.space_id
  name         = "impact_block"
  display_name = "Impact Block"
  icon         = "block-table"
  is_root      = false
  is_nestable  = true

  schema = {
    heading      = { type = "text", position = 0, display_name = "Heading" }
    subheading   = { type = "textarea", position = 1, display_name = "Subheading" }
    metrics      = { type = "bloks", position = 2, display_name = "Metrics", restrict_components = true, component_whitelist = ["metric_item"] }
    show_section = { type = "boolean", position = 3, display_name = "Show This Section", default_value = "true" }
  }
}

resource "storyblok_component" "metric_item" {
  space_id     = var.space_id
  name         = "metric_item"
  display_name = "Metric"
  icon         = "block-table"
  is_root      = false
  is_nestable  = true

  schema = {
    value       = { type = "text", position = 0, display_name = "Value", description = "Metric value (e.g., '15+', '200%')", required = true }
    label       = { type = "text", position = 1, display_name = "Label", description = "Metric label (e.g., 'Years Experience')", required = true }
    description = { type = "textarea", position = 2, display_name = "Description" }
    icon        = { type = "text", position = 3, display_name = "Icon", description = "Icon name from lucide-react" }
  }
}

resource "storyblok_component" "page" {
  space_id     = var.space_id
  name         = "page"
  display_name = "Page"
  icon         = "block-doc"
  is_root      = true
  is_nestable  = false

  schema = {
    body            = { type = "bloks", position = 0, display_name = "Page Content", description = "Main page content composed of blocks", restrict_components = true, component_whitelist = ["hero_block", "about_block", "philosophy_block", "services_block", "impact_block", "testimonials_block", "contact_block"] }
    seo_title       = { type = "text", position = 1, display_name = "SEO Title", description = "Page title for search engines (leave empty to use default)", max_length = 60 }
    seo_description = { type = "textarea", position = 2, display_name = "SEO Description", description = "Page description for search engines", max_length = 160 }
    og_image        = { type = "asset", position = 3, display_name = "Social Media Image", description = "Image for social media sharing (1200x630px recommended)", filetypes = ["images"] }
  }
}

resource "storyblok_component" "philosophy_block" {
  space_id     = var.space_id
  name         = "philosophy_block"
  display_name = "Philosophy Block"
  icon         = "block-sticker"
  is_root      = false
  is_nestable  = true

  schema = {
    heading      = { type = "text", position = 0, display_name = "Heading" }
    subheading   = { type = "textarea", position = 1, display_name = "Subheading" }
    content      = { type = "markdown", position = 2, display_name = "Content", required = true }
    principles   = { type = "bloks", position = 3, display_name = "Principles", restrict_components = true, component_whitelist = ["principle_item"] }
    show_section = { type = "boolean", position = 4, display_name = "Show This Section", default_value = "true" }
  }
}

resource "storyblok_component" "principle_item" {
  space_id     = var.space_id
  name         = "principle_item"
  display_name = "Principle"
  icon         = "block-sticker"
  is_root      = false
  is_nestable  = true

  schema = {
    icon        = { type = "text", position = 0, display_name = "Icon", description = "Icon name from lucide-react" }
    title       = { type = "text", position = 1, display_name = "Title", required = true }
    description = { type = "textarea", position = 2, display_name = "Description", required = true }
  }
}

resource "storyblok_component" "service_item" {
  space_id     = var.space_id
  name         = "service_item"
  display_name = "Service Item"
  icon         = "block-suitcase"
  is_root      = false
  is_nestable  = true

  schema = {
    icon           = { type = "text", position = 0, display_name = "Icon", description = "Icon name from lucide-react (e.g., 'Briefcase')", required = true }
    title          = { type = "text", position = 1, display_name = "Title", required = true }
    subtitle       = { type = "text", position = 2, display_name = "Subtitle", description = "Service level or category" }
    description    = { type = "textarea", position = 3, display_name = "Description", required = true }
    features       = { type = "textarea", position = 4, display_name = "Features", description = "One feature per line" }
    format         = { type = "text", position = 5, display_name = "Session Format", description = "Session frequency and duration" }
    best_for       = { type = "text", position = 6, display_name = "Best For", description = "Target audience for this service" }
    cta_text       = { type = "text", position = 7, display_name = "CTA Text" }
    is_highlighted = { type = "boolean", position = 8, display_name = "Highlight This Service", default_value = "false" }
  }
}

resource "storyblok_component" "services_block" {
  space_id     = var.space_id
  name         = "services_block"
  display_name = "Services Block"
  icon         = "block-suitcase"
  is_root      = false
  is_nestable  = true

  schema = {
    heading      = { type = "text", position = 0, display_name = "Heading" }
    subheading   = { type = "textarea", position = 1, display_name = "Subheading" }
    services     = { type = "bloks", position = 2, display_name = "Services", restrict_components = true, component_whitelist = ["service_item"] }
    show_section = { type = "boolean", position = 3, display_name = "Show This Section", default_value = "true" }
  }
}

resource "storyblok_component" "stat_item" {
  space_id     = var.space_id
  name         = "stat_item"
  display_name = "Stat Item"
  icon         = "block-table-2"
  is_root      = false
  is_nestable  = true

  schema = {
    value       = { type = "text", position = 0, display_name = "Value", description = "Statistic value (e.g., '15+', '100%')", required = true }
    label       = { type = "text", position = 1, display_name = "Label", description = "Statistic label (e.g., 'Years Experience')", required = true }
    description = { type = "textarea", position = 2, display_name = "Description", description = "Optional description" }
    icon        = { type = "text", position = 3, display_name = "Icon", description = "Icon name from lucide-react" }
  }
}

resource "storyblok_component" "testimonial_item" {
  space_id     = var.space_id
  name         = "testimonial_item"
  display_name = "Testimonial"
  icon         = "block-comment"
  is_root      = false
  is_nestable  = true

  schema = {
    quote          = { type = "textarea", position = 0, display_name = "Quote", required = true }
    author_name    = { type = "text", position = 1, display_name = "Author Name", required = true }
    author_role    = { type = "text", position = 2, display_name = "Author Role", required = true }
    author_company = { type = "text", position = 3, display_name = "Company" }
    author_image   = { type = "asset", position = 4, display_name = "Author Photo", filetypes = ["images"] }
    rating         = { type = "number", position = 5, display_name = "Rating", default_value = "5", min_value = 1, max_value = 5 }
  }
}

resource "storyblok_component" "testimonials_block" {
  space_id     = var.space_id
  name         = "testimonials_block"
  display_name = "Testimonials Block"
  icon         = "block-comment"
  is_root      = false
  is_nestable  = true

  schema = {
    heading      = { type = "text", position = 0, display_name = "Heading" }
    subheading   = { type = "textarea", position = 1, display_name = "Subheading" }
    testimonials = { type = "bloks", position = 2, display_name = "Testimonials", restrict_components = true, component_whitelist = ["testimonial_item"] }
    show_section = { type = "boolean", position = 3, display_name = "Show This Section", default_value = "true" }
  }
}

################################################################################
# Import blocks for the pre-existing live components (ids from the live
# Management API GET). ID format: "{space_id}/{component_id}". The webhook has
# no import block — none exists live; first apply creates it.
# Post-import note (provider v1.5.1): component import leaves "name"/"space_id"
# null in state, so the first plan shows an in-place update filling them —
# expected. Verify the plan shows NO schema changes before applying.
# Remove this section after the first successful apply.
################################################################################

import {
  to = storyblok_component.about_block
  id = "288632938663524/114859833011584"
}

import {
  to = storyblok_component.blog_post
  id = "288632938663524/194801325335725"
}

import {
  to = storyblok_component.contact_block
  id = "288632938663524/115709930016359"
}

import {
  to = storyblok_component.hero_block
  id = "288632938663524/114859830549882"
}

import {
  to = storyblok_component.impact_block
  id = "288632938663524/114859832917374"
}

import {
  to = storyblok_component.metric_item
  id = "288632938663524/114859830545785"
}

import {
  to = storyblok_component.page
  id = "288632938663524/114527391321689"
}

import {
  to = storyblok_component.philosophy_block
  id = "288632938663524/114859833032065"
}

import {
  to = storyblok_component.principle_item
  id = "288632938663524/114859830578556"
}

import {
  to = storyblok_component.service_item
  id = "288632938663524/114859830553979"
}

import {
  to = storyblok_component.services_block
  id = "288632938663524/114859832982911"
}

import {
  to = storyblok_component.stat_item
  id = "288632938663524/114859830500728"
}

import {
  to = storyblok_component.testimonial_item
  id = "288632938663524/114859829644663"
}

import {
  to = storyblok_component.testimonials_block
  id = "288632938663524/114859832339837"
}

