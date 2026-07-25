"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerPortal = DrawerPrimitive.Portal;

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className = "", ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={`fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm ${className}`} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className = "", children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content ref={ref} className={`fixed inset-x-0 bottom-0 z-[100] flex flex-col rounded-t-2xl border border-white/15 bg-background text-foreground shadow-2xl ${className}`} {...props}>
      <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/30" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = DrawerPrimitive.Content.displayName;

export const DrawerHeader = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`px-5 pb-3 pt-4 text-center ${className}`} {...props} />
);

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className = "", ...props }, ref) => <DrawerPrimitive.Title ref={ref} className={`text-base font-semibold ${className}`} {...props} />);
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

export const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className = "", ...props }, ref) => <DrawerPrimitive.Description ref={ref} className={`mt-1 text-sm text-muted-foreground ${className}`} {...props} />);
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;
