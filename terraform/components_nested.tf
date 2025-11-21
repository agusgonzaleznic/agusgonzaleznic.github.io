# ==========================================
# Nested Components (used inside other blocks)
# ==========================================

# Stat Item - Used in About Block
resource "storyblok_component" "stat_item" {
  name         = "stat_item"
  display_name = "Stat Item"
  is_root      = false
  is_nestable  = true
  icon         = "block-table-2"
  space_id     = local.space_id

  schema = {
    value = {
      type         = "text"
      position     = 0
      display_name = "Value"
      required     = true
      description  = "Statistic value (e.g., '15+', '100%')"
    }
    label = {
      type         = "text"
      position     = 1
      display_name = "Label"
      required     = true
      description  = "Statistic label (e.g., 'Years Experience')"
    }
    description = {
      type         = "textarea"
      position     = 2
      display_name = "Description"
      description  = "Optional description"
    }
    icon = {
      type         = "text"
      position     = 3
      display_name = "Icon"
      description  = "Icon name from lucide-react"
    }
  }
}

# Service Item - Used in Services Block
resource "storyblok_component" "service_item" {
  name         = "service_item"
  display_name = "Service Item"
  is_root      = false
  is_nestable  = true
  icon         = "block-suitcase"
  space_id     = local.space_id

  schema = {
    icon = {
      type         = "text"
      position     = 0
      display_name = "Icon"
      required     = true
      description  = "Icon name from lucide-react (e.g., 'Briefcase')"
    }
    title = {
      type         = "text"
      position     = 1
      display_name = "Title"
      required     = true
    }
    description = {
      type         = "textarea"
      position     = 2
      display_name = "Description"
      required     = true
    }
    features = {
      type         = "textarea"
      position     = 3
      display_name = "Features"
      description  = "One feature per line"
    }
    cta_text = {
      type          = "text"
      position      = 4
      display_name  = "CTA Text"
      default_value = "Learn More"
    }
    is_highlighted = {
      type          = "boolean"
      position      = 5
      display_name  = "Highlight This Service"
      default_value = "false"
    }
  }
}

# Testimonial Item - Used in Testimonials Block
resource "storyblok_component" "testimonial_item" {
  name         = "testimonial_item"
  display_name = "Testimonial"
  is_root      = false
  is_nestable  = true
  icon         = "block-comment"
  space_id     = local.space_id

  schema = {
    quote = {
      type         = "textarea"
      position     = 0
      display_name = "Quote"
      required     = true
    }
    author_name = {
      type         = "text"
      position     = 1
      display_name = "Author Name"
      required     = true
    }
    author_role = {
      type         = "text"
      position     = 2
      display_name = "Author Role"
      required     = true
    }
    author_company = {
      type         = "text"
      position     = 3
      display_name = "Company"
    }
    author_image = {
      type         = "asset"
      position     = 4
      display_name = "Author Photo"
      filetypes    = ["images"]
    }
    rating = {
      type          = "number"
      position      = 5
      display_name  = "Rating"
      default_value = "5"
      max_value     = "5"
      min_value     = "1"
    }
  }
}

# Principle Item - Used in Philosophy Block
resource "storyblok_component" "principle_item" {
  name         = "principle_item"
  display_name = "Principle"
  is_root      = false
  is_nestable  = true
  icon         = "block-sticker"
  space_id     = local.space_id

  schema = {
    icon = {
      type         = "text"
      position     = 0
      display_name = "Icon"
      description  = "Icon name from lucide-react"
    }
    title = {
      type         = "text"
      position     = 1
      display_name = "Title"
      required     = true
    }
    description = {
      type         = "textarea"
      position     = 2
      display_name = "Description"
      required     = true
    }
  }
}

# Metric Item - Used in Impact Block
resource "storyblok_component" "metric_item" {
  name         = "metric_item"
  display_name = "Metric"
  is_root      = false
  is_nestable  = true
  icon         = "block-table"
  space_id     = local.space_id

  schema = {
    value = {
      type         = "text"
      position     = 0
      display_name = "Value"
      required     = true
      description  = "Metric value (e.g., '15+', '200%')"
    }
    label = {
      type         = "text"
      position     = 1
      display_name = "Label"
      required     = true
      description  = "Metric label (e.g., 'Years Experience')"
    }
    description = {
      type         = "textarea"
      position     = 2
      display_name = "Description"
    }
    icon = {
      type         = "text"
      position     = 3
      display_name = "Icon"
      description  = "Icon name from lucide-react"
    }
  }
}
