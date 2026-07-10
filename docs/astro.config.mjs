import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.marrow.so",
  integrations: [
    starlight({
      title: "Marrow",
      description:
        "Self-hosted, open-source knowledge base built around a non-negotiable restore guarantee.",
      logo: {
        src: "./src/assets/marrow-glyph.svg",
        alt: "Marrow",
      },
      customCss: ["./src/styles/marrow.css"],
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..900,0..100,0..1&family=Inter:wght@300..700&family=JetBrains+Mono:wght@400;500&display=swap",
          },
        },
      ],
      editLink: {
        baseUrl: "https://github.com/marrow-software/marrow/edit/main/docs/",
      },
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Overview", link: "/" },
            { label: "Quickstart", link: "/getting-started/quickstart/" },
            { label: "Export & restore demo", link: "/getting-started/export-restore-demo/" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "Docker Compose", link: "/deployment/docker-compose/" },
            { label: "Cloudflare", link: "/deployment/cloudflare/" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Environment variables", link: "/configuration/env-vars/" },
            { label: "OIDC authentication", link: "/configuration/oidc/" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Restore guarantee", link: "/concepts/restore-guarantee/" },
            { label: "Export bundle format", link: "/concepts/export-format/" },
          ],
        },
      ],
    }),
  ],
});
