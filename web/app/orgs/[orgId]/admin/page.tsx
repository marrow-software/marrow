"use client";

import { useSearchParams } from "next/navigation";
import { MissionControlSection } from "@/components/admin/mission-control-section";
import { UsersSection } from "@/components/admin/users-section";
import { SpacesSection } from "@/components/admin/spaces-section";
import { StubSection } from "@/components/admin/stub-section";

export default function AdminPage() {
  const section = useSearchParams().get("section") ?? "mission-control";

  switch (section) {
    case "mission-control":
      return <MissionControlSection />;
    case "users":
      return <UsersSection />;
    case "spaces":
      return <SpacesSection />;
    case "analytics":
      return (
        <StubSection
          title="Analytics"
          description="Workspace engagement metrics — page views, top contributors, search activity."
          note="Analytics requires telemetry instrumentation that is not yet built."
        />
      );
    case "audit-log":
      return (
        <StubSection
          title="Audit log"
          description="Track changes to nodes, spaces, members, and permissions."
          note="The audit_events table is listed under 'What's Not Built Yet' in CLAUDE.md. This section will activate once that backend lands."
        />
      );
    case "automation":
      return (
        <StubSection
          title="Automation"
          description="Rules and triggers that react to workspace events."
          note="Deferred — depends on an automation engine that is not yet implemented."
        />
      );
    case "export-permissions":
      return (
        <StubSection
          title="Export permissions data"
          description="Download a snapshot of who has access to what in this organization."
          note="Permissions reporting is not yet implemented. Current roles can be inspected from User management."
        />
      );
    case "access":
      return (
        <StubSection
          title="User access"
          description="See which users can read or edit each space."
          note="Per-space access scoping is not yet implemented — today, org role applies workspace-wide."
        />
      );
    case "announcements":
      return (
        <StubSection
          title="Announcements"
          description="Post org-wide banner messages to all workspace users."
          note="Announcements are not yet implemented."
        />
      );
    case "import":
      return (
        <StubSection
          title="Import from other tools"
          description="Migrate content from Confluence, Notion, or other knowledge bases."
          note="Importers are not yet implemented. For now, content can be added by restoring a Marrow export bundle."
        />
      );
    case "groups":
      return (
        <StubSection
          title="Groups"
          description="Bundle users into groups for easier permission management."
          note="Groups are not yet implemented — assign roles to individual members from User management."
        />
      );
    case "billing":
      return (
        <StubSection
          title="Billing"
          description="Plan, seats, and payment method."
          note="Marrow is self-hosted and open source — no billing is required."
        />
      );
    default:
      return <MissionControlSection />;
  }
}
