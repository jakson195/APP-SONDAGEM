"use client";

import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

export type SidebarNavGroupItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  label: string;
  icon: LucideIcon;
  items: SidebarNavGroupItem[];
  pathname: string;
  defaultOpen?: boolean;
  onNavigate?: () => void;
};

function isActivePath(pathname: string, href: string) {
  const pathOnly = href.split("?")[0] ?? href;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

function itemClass(active: boolean) {
  return `group/item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-200 ${
    active
      ? "bg-gray-700/90 text-white shadow-sm ring-1 ring-teal-500/40"
      : "text-gray-300 hover:bg-gray-700/70 hover:text-white"
  }`;
}

export function SidebarNavGroup({
  label,
  icon: GroupIcon,
  items,
  pathname,
  defaultOpen = false,
  onNavigate,
}: Props) {
  const panelId = useId();
  const childActive = items.some((item) => isActivePath(pathname, item.href));
  const [open, setOpen] = useState(defaultOpen || childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors duration-200 ${
          childActive && !open
            ? "bg-gray-800 text-white ring-1 ring-teal-500/30"
            : "text-gray-100 hover:bg-gray-700/80 hover:text-white"
        }`}
      >
        <GroupIcon className="h-4 w-4 shrink-0 text-teal-400" strokeWidth={2} />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ease-out ${
            open ? "rotate-180" : "rotate-0"
          }`}
          strokeWidth={2}
        />
      </button>

      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="ml-3.5 mt-0.5 space-y-0.5 border-l border-gray-700/80 pl-2">
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={itemClass(active)}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        active
                          ? "text-teal-400"
                          : "text-gray-500 group-hover/item:text-gray-300"
                      }`}
                      strokeWidth={2}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
