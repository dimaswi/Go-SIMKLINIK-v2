import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { useState } from "react";
import { useLocation } from "react-router-dom";

export function AppLayout({ children }: { children: React.ReactNode }) {
  // Get initial state from localStorage, default to true
  const getInitialState = () => {
    const savedState = localStorage.getItem('sidebar_state');
    return savedState === null ? true : savedState === 'true';
  };

  const [open, setOpen] = useState(getInitialState);
  const location = useLocation();
  const isEmrFormPage = /^\/emr\/\d+\/(form|sheets)\//.test(location.pathname);
  const isConstrainedPage = isEmrFormPage || /^\/reports\/?$/.test(location.pathname);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    localStorage.setItem('sidebar_state', String(newOpen));
  };

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <AppSidebar />
      <SidebarInset className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        {isConstrainedPage ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto md:overflow-hidden">
            {children}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {children}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
