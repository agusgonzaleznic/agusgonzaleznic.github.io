# ==========================================
# Page Content Type (Root Content Type)
# ==========================================

resource "storyblok_component" "page" {
  name         = "page"
  display_name = "Page"
  is_root      = true
  is_nestable  = false
  icon         = "block-doc"
  space_id     = local.space_id

  # Ensure all blocks are created first
  depends_on = [
    storyblok_component.hero_block,
    storyblok_component.about_block,
    storyblok_component.services_block,
    storyblok_component.testimonials_block,
    storyblok_component.philosophy_block,
    storyblok_component.impact_block
  ]

  schema = {
    body = {
      type                = "bloks"
      position            = 0
      display_name        = "Page Content"
      description         = "Main page content composed of blocks"
      restrict_components = true
      component_whitelist = [
        "hero_block",
        "about_block",
        "services_block",
        "testimonials_block",
        "philosophy_block",
        "impact_block"
      ]
    }
    seo_title = {
      type         = "text"
      position     = 1
      display_name = "SEO Title"
      max_length   = 60
      description  = "Page title for search engines (leave empty to use default)"
    }
    seo_description = {
      type         = "textarea"
      position     = 2
      display_name = "SEO Description"
      max_length   = 160
      description  = "Page description for search engines"
    }
    og_image = {
      type         = "asset"
      position     = 3
      display_name = "Social Media Image"
      description  = "Image for social media sharing (1200x630px recommended)"
      filetypes    = ["images"]
    }
  }
}
