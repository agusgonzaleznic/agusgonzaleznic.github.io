import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { SiLinkedin, SiGithub } from "react-icons/si";

export const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Create mailto link
    const subject = encodeURIComponent(`Coaching Inquiry from ${formData.name}`);
    const body = encodeURIComponent(
      `Name: ${formData.name}\nEmail: ${formData.email}\nRole: ${formData.role || "Not specified"}\n\nMessage:\n${formData.message}`
    );
    const mailtoLink = `mailto:agustingonzaleznicolini@gmail.com?subject=${subject}&body=${body}`;
    
    window.location.href = mailtoLink;
    
    toast.success("Opening your email client...");
  };

  return (
    <section id="contact" className="py-24 md:py-32 bg-gradient-to-b from-background to-secondary/30">
      <div className="container px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
            <h2 className="text-fluid-3xl font-bold mb-6">Ready to Grow as a Leader?</h2>
            <p className="text-fluid-lg text-muted-foreground">
              Let's discuss how coaching can help you achieve your goals
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-12">
            {/* Contact form */}
            <Card className="lg:col-span-3 p-8 animate-fade-in-up delay-100">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Your full name"
                    required
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@yourcompany.com"
                    required
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="role">Current Role</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g., Engineering Manager, VP of Engineering"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="message">What would you like help with? *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Tell me about your current challenges or goals..."
                    required
                    className="mt-2 min-h-32"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent-hover text-accent-foreground shadow-accent"
                >
                  Send Message
                  <Send className="ml-2 h-5 w-5" />
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By submitting, you agree to being contacted about coaching services. Your information is kept confidential.
                </p>
              </form>
            </Card>

            {/* Contact info */}
            <div className="lg:col-span-2 space-y-6 animate-fade-in-up delay-200">
              <Card className="p-6 border-2">
                <h3 className="font-semibold mb-4">Get in Touch</h3>
                <div className="space-y-4">
                  <a
                    href="mailto:agustingonzaleznicolini@gmail.com"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <Mail className="w-5 h-5" />
                    </div>
                    <span className="text-sm break-all">agustingonzaleznicolini@gmail.com</span>
                  </a>

                  <a
                    href="https://www.linkedin.com/in/agusgonzaleznic/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <SiLinkedin className="w-5 h-5" />
                    </div>
                    <span className="text-sm">LinkedIn Profile</span>
                  </a>

                  <a
                    href="https://github.com/agusgonzaleznic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-muted-foreground hover:text-accent transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                      <SiGithub className="w-5 h-5" />
                    </div>
                    <span className="text-sm">GitHub Profile</span>
                  </a>
                </div>
              </Card>

              <Card className="p-6 bg-accent/5 border-accent/20">
                <h3 className="font-semibold mb-3 text-foreground">Response Time</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I typically respond within 24 hours. For urgent inquiries, please mention it in your message.
                </p>
              </Card>

              <Card className="p-6 bg-primary/5 border-primary/20">
                <h3 className="font-semibold mb-3 text-foreground">Free Discovery Call</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Every engagement starts with a complimentary 30-minute discovery call to ensure we're a good fit.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
