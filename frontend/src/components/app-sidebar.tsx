import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Shield,
  LogOut,
  ChevronDown,
  Lock,
  Building2,
  Settings,
  ChevronsUpDown,
  User,
  Stethoscope,
  Pill,
  Layers,
  Ruler,
  HeartPulse,
  FolderTree,
  CreditCard,
  Truck,
  Hospital,
  ShoppingCart,
  PackageSearch,
  ClipboardList,
  UserPlus,
  Users2,
  Monitor,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { usePermission } from '@/hooks/usePermission';
import { getAppName, getAppSubtitle } from '@/lib/page-title';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SubMenuItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

interface MenuItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  submenu?: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  {
    path: '/registration',
    label: 'Front Office',
    icon: ClipboardList,
    submenu: [
      { path: '/queue', label: 'Antrian', icon: Monitor, permission: 'queue.view' },
      { path: '/registration', label: 'Pendaftaran', icon: UserPlus, permission: 'visits.view' },
      { path: '/emr', label: 'Rekam Medis', icon: FileText, permission: 'medical_records.view' },
      { path: '/patients', label: 'Data Pasien', icon: Users2, permission: 'patients.view' },
    ]
  },
  {
    path: '/polyclinics',
    label: 'Master Data',
    icon: Hospital,
    permission: 'polyclinics.view',
    submenu: [
      { path: '/polyclinics', label: 'Poliklinik', icon: Hospital, permission: 'polyclinics.view' },
      { path: '/doctors', label: 'Dokter', icon: Stethoscope, permission: 'doctors.view' },
      { path: '/medicine-categories', label: 'Kategori Obat', icon: FolderTree, permission: 'medicine_categories.view' },
      { path: '/units', label: 'Satuan', icon: Ruler, permission: 'units.view' },
      { path: '/medicines', label: 'Obat', icon: Pill, permission: 'medicines.view' },
      { path: '/service-categories', label: 'Kategori Layanan', icon: Layers, permission: 'service_categories.view' },
      { path: '/medical-services', label: 'Layanan Medis', icon: HeartPulse, permission: 'medical_services.view' },
      { path: '/payment-methods', label: 'Metode Pembayaran', icon: CreditCard, permission: 'payment_methods.view' },
      { path: '/suppliers', label: 'Supplier', icon: Truck, permission: 'suppliers.view' },
    ]
  },
  {
    path: '/purchasing',
    label: 'Pembelian',
    icon: ShoppingCart,
    permission: 'purchase_orders.view',
    submenu: [
      { path: '/purchasing', label: 'Purchase Order', icon: PackageSearch, permission: 'purchase_orders.view' },
    ]
  },
  {
    path: '/users',
    label: 'User Management',
    icon: Users,
    permission: 'users.view',
    submenu: [
      { path: '/users', label: 'Users', icon: Users, permission: 'users.view' },
      { path: '/roles', label: 'Roles', icon: Shield, permission: 'roles.view' },
      { path: '/permissions', label: 'Permissions', icon: Lock, permission: 'permissions.view' },
    ]
  },
];

function isPathActive(currentPath: string, targetPath: string): boolean {
  if (!targetPath) return false;
  if (targetPath === '/') return currentPath === '/';
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function AppSidebar() {
  const { user, logout } = useAuthStore();
  const { state } = useSidebar();
  const { hasPermission } = usePermission();
  const [appName, setAppName] = useState(getAppName());
  const [appSubtitle, setAppSubtitle] = useState(getAppSubtitle());
  const isCollapsed = state === 'collapsed';

  useEffect(() => {
    const handleStorageChange = () => {
      setAppName(getAppName());
      setAppSubtitle(getAppSubtitle());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const visibleMenuItems = menuItems.filter(item => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  }).map(item => {
    if (item.submenu) {
      return {
        ...item,
        submenu: item.submenu.filter(sub => {
          if (!sub.permission) return true;
          return hasPermission(sub.permission);
        })
      };
    }
    return item;
  });

  return (
    <Sidebar collapsible="icon" className="border-r-0" variant="inset">
      {/* Header - Logo & App Name */}
      <SidebarHeader className="px-4 py-4 pb-2">
        <a href="/" className={cn(
          "flex items-center gap-3 transition-all",
          isCollapsed && "justify-center"
        )}>
          <div className="flex items-center justify-center size-8 rounded-lg bg-foreground text-background shrink-0">
            <Building2 className="size-4" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sm">{appName}</span>
              <span className="text-xs text-muted-foreground truncate">{appSubtitle}</span>
            </div>
          )}
        </a>
      </SidebarHeader>

      {/* Menu Content */}
      <SidebarContent className="px-3 pt-2">
        {!isCollapsed && (
          <p className="px-3 mb-2 text-[11px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
            Menu
          </p>
        )}

        <nav className="flex flex-col gap-0.5">
          {isCollapsed ? (
            // Collapsed: icon-only mode
            <div className="flex flex-col items-center gap-1">
              {visibleMenuItems.map((item) => (
                <CollapsedMenuItem key={item.path} item={item} />
              ))}
            </div>
          ) : (
            // Expanded: full menu
            visibleMenuItems.map((item) => (
              <ExpandedMenuItem key={item.path} item={item} />
            ))
          )}
        </nav>
      </SidebarContent>

      {/* Footer - User Profile */}
      <SidebarFooter className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "flex items-center gap-2.5 w-full rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent",
              isCollapsed && "justify-center p-1.5"
            )}>
              <div className="flex items-center justify-center size-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold shrink-0">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{user?.full_name}</span>
                    <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isCollapsed ? "right" : "top"}
            align={isCollapsed ? "start" : "center"}
            className="w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account">
                <User className="mr-2 size-4" />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="mr-2 size-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Collapsed icon-only menu item */
function CollapsedMenuItem({ item }: { item: MenuItem }) {
  const location = useLocation();
  const Icon = item.icon;
  const hasSubmenu = item.submenu && item.submenu.length > 0;
  const isActive = isPathActive(location.pathname, item.path) ||
    (hasSubmenu && item.submenu!.some(sub => isPathActive(location.pathname, sub.path)));

  if (hasSubmenu) {
    return (
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "flex items-center justify-center size-8 rounded-lg transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  <Icon className="size-4" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent side="right" align="start" className="min-w-44">
          {item.submenu!.map((sub) => {
            const SubIcon = sub.icon;
            const isSubActive = isPathActive(location.pathname, sub.path);
            return (
              <DropdownMenuItem key={sub.path} asChild>
                <Link to={sub.path} className={cn(isSubActive && "bg-accent")}>
                  <SubIcon className="mr-2 size-4" />
                  {sub.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={item.path}
            className={cn(
              "flex items-center justify-center size-8 rounded-lg transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Expanded full menu item with dot-bullet submenu */
function ExpandedMenuItem({ item }: { item: MenuItem }) {
  const location = useLocation();
  const Icon = item.icon;
  const hasSubmenu = item.submenu && item.submenu.length > 0;
  const isActive = isPathActive(location.pathname, item.path) ||
    (hasSubmenu && item.submenu!.some(sub => isPathActive(location.pathname, sub.path)));
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive && hasSubmenu) setExpanded(true);
  }, [isActive, hasSubmenu]);

  // Parent with submenu
  if (hasSubmenu) {
    return (
      <div className="relative">
        {/* Vertical tree line: starts from center of parent icon, runs down through all children */}
        {expanded && (
          <div className="absolute left-[21px] top-[32px] bottom-[16px] w-px bg-sidebar-foreground/25" />
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-lg transition-colors",
            isActive
              ? "text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          )}
        >
          <Icon className="size-[18px] shrink-0" />
          <span className="flex-1 text-left truncate">{item.label}</span>
          <ChevronDown className={cn(
            "size-4 text-sidebar-foreground/40 transition-transform duration-200",
            !expanded && "-rotate-90"
          )} />
        </button>

        {/* Submenu with tree branches + dot bullets */}
        {expanded && (
          <div className="relative">
            {item.submenu!.map((sub) => {
              const isSubActive = isPathActive(location.pathname, sub.path);

              return (
                <div key={sub.path} className="relative flex items-center h-[34px]">
                  {/* Horizontal branch from vertical trunk to dot */}
                  <div className="absolute left-[21px] top-[50%] w-[16px] h-px bg-sidebar-foreground/25" />

                  {/* Dot bullet on the branch */}
                  <div className="absolute left-[37px] top-[50%] -translate-y-[50%]">
                    <span className={cn(
                      "block size-[5px] rounded-full",
                      isSubActive
                        ? "bg-sidebar-foreground"
                        : "bg-sidebar-foreground/35"
                    )} />
                  </div>

                  <Link
                    to={sub.path}
                    className={cn(
                      "flex items-center w-full ml-[48px] mr-2 px-3 py-1.5 text-sm rounded-lg transition-colors",
                      isSubActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <span className="truncate">{sub.label}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Simple menu item (no submenu)
  return (
    <Link
      to={item.path}
      className={cn(
        "flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
