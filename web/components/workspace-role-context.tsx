"use client";

import { createContext, useContext } from "react";

interface WorkspaceRoleContextValue {
  userRole: string | null;
  canEdit: boolean;
}

const WorkspaceRoleContext = createContext<WorkspaceRoleContextValue>({
  userRole: null,
  canEdit: true,
});

export function WorkspaceRoleProvider({
  userRole,
  children,
}: {
  userRole: string | null;
  children: React.ReactNode;
}) {
  const canEdit =
    userRole === "owner" || userRole === "editor" || userRole === null;

  return (
    <WorkspaceRoleContext value={{ userRole, canEdit }}>
      {children}
    </WorkspaceRoleContext>
  );
}

export function useWorkspaceRole() {
  return useContext(WorkspaceRoleContext);
}
