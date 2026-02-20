import { NavLink, Outlet } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  ClipboardCheck,
  FileText,
  Gauge,
  Inbox,
  PieChart,
  Settings,
  Users,
} from 'lucide-react'

import { CompanySelector } from 'openvera'

const navItems: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}[] = [
  { to: '/', label: 'Översikt', icon: Gauge, end: true },
  {
    to: '/transactions',
    label: 'Transaktioner',
    icon: ArrowLeftRight,
  },
  { to: '/documents', label: 'Dokument', icon: FileText },
  { to: '/inbox', label: 'Inkorg', icon: Inbox },
  { to: '/review', label: 'Granska', icon: ClipboardCheck },
  { to: '/parties', label: 'Parter', icon: Users },
  { to: '/reports', label: 'Rapporter', icon: PieChart },
  { to: '/settings', label: 'Inställningar', icon: Settings },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-base-200/50">
      {/* Navbar */}
      <div className="bg-base-100 border-b border-base-300 px-6 h-16 flex items-center">
        <div className="flex flex-1 gap-2 items-center">
          <span className="text-xl font-bold tracking-tight text-primary">
            OPENVERA
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-base-content/30 hidden sm:inline">
            Bokföring
          </span>
        </div>
        <div className="flex-none">
          <CompanySelector />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-base-100 border-r border-base-300 min-h-[calc(100vh-4rem)] pt-3">
          <ul className="menu w-full px-3 gap-0.5">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'active font-medium' : ''
                  }
                >
                  <item.icon className="w-4 h-4 opacity-60" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
