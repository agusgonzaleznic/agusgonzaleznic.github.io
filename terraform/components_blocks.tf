# ==========================================
# Main Block Components (nestable in Page)
# ==========================================

# Hero Block
resource "storyblok_component" "hero_block" {
  name         = "hero_block"
  display_name = "Hero Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-block"
  space_id     = local.space_id

  schema = {
    name = {
      type          = "text"
      position      = 0
      display_name  = "Full Name"
      required      = true
      default_value = "Agustin Gonzalez Nicolini"
    }
    title = {
      type          = "text"
      position      = 1
      display_name  = "Professional Title"
      required      = true
      default_value = "VP of Engineering & Leadership Coach"
    }
    tagline = {
      type          = "text"
      position      = 2
      display_name  = "Tagline"
      required      = true
      default_value = "TRANSFORM YOUR LEADERSHIP"
    }
    description = {
      type         = "markdown"
      position     = 3
      display_name = "Hero Description"
      required     = true
    }
    cta_text = {
      type          = "text"
      position      = 4
      display_name  = "Primary CTA Text"
      default_value = "Book a Call"
    }
    cta_url = {
      type         = "text"
      position     = 5
      display_name = "Primary CTA URL"
      regex        = "^https?://.*"
    }
    secondary_cta_text = {
      type          = "text"
      position      = 6
      display_name  = "Secondary CTA Text"
      default_value = "Learn More"
    }
    secondary_cta_url = {
      type          = "text"
      position      = 7
      display_name  = "Secondary CTA URL"
      default_value = "#services"
    }
    profile_image = {
      type         = "asset"
      position     = 8
      display_name = "Profile Image"
      required     = true
      filetypes    = ["images"]
    }
    background_style = {
      type          = "option"
      position      = 9
      display_name  = "Background Style"
      default_value = "gradient"
      options = [
        {
          value = "gradient"
          name  = "Gradient"
        },
        {
          value = "solid"
          name  = "Solid Color"
        },
        {
          value = "image"
          name  = "Image Background"
        }
      ]
    }
  }
}

# About Block
resource "storyblok_component" "about_block" {
  name         = "about_block"
  display_name = "About Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-image"
  space_id     = local.space_id

  depends_on = [
    storyblok_component.stat_item
  ]

  schema = {
    heading = {
      type          = "text"
      position      = 0
      display_name  = "Heading"
      required      = true
      default_value = "About Me"
    }
    subheading = {
      type         = "text"
      position     = 1
      display_name = "Subheading"
    }
    content = {
      type         = "markdown"
      position     = 2
      display_name = "Content"
      required     = true
    }
    image = {
      type         = "asset"
      position     = 3
      display_name = "Image"
      filetypes    = ["images"]
    }
    stats = {
      type                = "bloks"
      position            = 4
      display_name        = "Statistics"
      restrict_components = true
      component_whitelist = ["stat_item"]
    }
    show_section = {
      type          = "boolean"
      position      = 5
      display_name  = "Show This Section"
      default_value = "true"
    }
  }
}

# Services Block
resource "storyblok_component" "services_block" {
  name         = "services_block"
  display_name = "Services Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-suitcase"
  space_id     = local.space_id

  depends_on = [
    storyblok_component.service_item
  ]

  schema = {
    heading = {
      type          = "text"
      position      = 0
      display_name  = "Heading"
      default_value = "Services"
    }
    subheading = {
      type         = "textarea"
      position     = 1
      display_name = "Subheading"
    }
    services = {
      type                = "bloks"
      position            = 2
      display_name        = "Services"
      restrict_components = true
      component_whitelist = ["service_item"]
    }
    show_section = {
      type          = "boolean"
      position      = 3
      display_name  = "Show This Section"
      default_value = "true"
    }
  }
}

# Testimonials Block
resource "storyblok_component" "testimonials_block" {
  name         = "testimonials_block"
  display_name = "Testimonials Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-comment"
  space_id     = local.space_id

  depends_on = [
    storyblok_component.testimonial_item
  ]

  schema = {
    heading = {
      type          = "text"
      position      = 0
      display_name  = "Heading"
      default_value = "What Clients Say"
    }
    subheading = {
      type         = "textarea"
      position     = 1
      display_name = "Subheading"
    }
    testimonials = {
      type                = "bloks"
      position            = 2
      display_name        = "Testimonials"
      restrict_components = true
      component_whitelist = ["testimonial_item"]
    }
    show_section = {
      type          = "boolean"
      position      = 3
      display_name  = "Show This Section"
      default_value = "true"
    }
  }
}

# Philosophy Block
resource "storyblok_component" "philosophy_block" {
  name         = "philosophy_block"
  display_name = "Philosophy Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-sticker"
  space_id     = local.space_id

  depends_on = [
    storyblok_component.principle_item
  ]

  schema = {
    heading = {
      type          = "text"
      position      = 0
      display_name  = "Heading"
      default_value = "My Philosophy"
    }
    subheading = {
      type         = "textarea"
      position     = 1
      display_name = "Subheading"
    }
    content = {
      type         = "markdown"
      position     = 2
      display_name = "Content"
      required     = true
    }
    principles = {
      type                = "bloks"
      position            = 3
      display_name        = "Principles"
      restrict_components = true
      component_whitelist = ["principle_item"]
    }
    show_section = {
      type          = "boolean"
      position      = 4
      display_name  = "Show This Section"
      default_value = "true"
    }
  }
}

# Impact Block
resource "storyblok_component" "impact_block" {
  name         = "impact_block"
  display_name = "Impact Block"
  is_root      = false
  is_nestable  = true
  icon         = "block-table"
  space_id     = local.space_id

  depends_on = [
    storyblok_component.metric_item
  ]

  schema = {
    heading = {
      type          = "text"
      position      = 0
      display_name  = "Heading"
      default_value = "Impact & Results"
    }
    subheading = {
      type         = "textarea"
      position     = 1
      display_name = "Subheading"
    }
    metrics = {
      type                = "bloks"
      position            = 2
      display_name        = "Metrics"
      restrict_components = true
      component_whitelist = ["metric_item"]
    }
    show_section = {
      type          = "boolean"
      position      = 3
      display_name  = "Show This Section"
      default_value = "true"
    }
  }
}
