"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { useDrawerViewport } from "./useDrawerViewport";

export function Drawer({ historyBack = false, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root> & { historyBack?: boolean }) {
  useBackLayer(historyBack && Boolean(props.open), () => {
    if (props.dismissible === false) return false;
    props.onOpenChange?.(false);
  });
  return <DrawerPrimitive.Root noBodyStyles repositionInputs={false} {...props} />;
}
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerPortal = DrawerPrimitive.Portal;

/** Fixed handle and fading shade that travel with the sheet from its first frame. */
export function DrawerHandleOverlay() {
  return (
    <div aria-hidden="true" data-drawer-keyboard-hide className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-8 transform-gpu will-change-transform items-center justify-center [backface-visibility:hidden]">
      <div
        className="absolute inset-x-0 top-0 h-16"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.46) 15%, rgba(0,0,0,0.24) 35%, rgba(0,0,0,0.08) 60%, rgba(0,0,0,0.015) 80%, rgba(0,0,0,0) 92%, rgba(0,0,0,0) 100%)" }}
      />
      <div className="relative h-1.5 w-12 rounded-full bg-white/70 shadow-sm" />
    </div>
  );
}

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className = "", ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm ${className}`}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & { showHandle?: boolean; sideInset?: boolean; lockDocument?: boolean; overlayProps?: React.ComponentPropsWithoutRef<typeof DrawerOverlay> }
>(({ className = "", children, showHandle = true, sideInset = false, lockDocument = true, overlayProps, ...props }, ref) => {
  const viewportRef = useDrawerViewport(true, "sheet", lockDocument);
  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    viewportRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref, viewportRef]);
  return (
  <DrawerPortal>
    <DrawerOverlay {...overlayProps} />
    <DrawerPrimitive.Content
      ref={setRef}
      data-drawer-viewport
      className={`fixed ${sideInset ? "w-full md:inset-x-0" : "inset-x-0"} bottom-0 z-[100] flex flex-col overflow-hidden rounded-t-2xl border border-white/15 text-foreground shadow-2xl outline-none ${className}`}
      {...props}
    >
      {/* Vaul extends the surface below the drawer with ::after during upward
          overscroll. Clip the content here, leaving that extension visible. */}
      <div data-drawer-body className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ borderRadius: "inherit" }}>
        {showHandle && <div data-drawer-keyboard-hide className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/30" />}
        {children}
      </div>
    </DrawerPrimitive.Content>
  </DrawerPortal>
  );
});
DrawerContent.displayName = DrawerPrimitive.Content.displayName;

export const DrawerHeader = ({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-drawer-keyboard-header className={`px-5 pb-3 pt-4 text-center ${className}`} {...props} />
);

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className = "", ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={`text-base font-semibold ${className}`}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

export const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className = "", ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={`mt-1 text-sm text-muted-foreground ${className}`}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;
