export const eventMapStyles = `
  .custom-leaflet-marker { background: transparent !important; border: none !important; }
  .event-map-pin { position: relative; display: grid; place-items: center; }
  .event-map-pin__shape { position: relative; z-index: 1; display: grid; height: 29px; width: 29px; place-items: center; transform: rotate(-45deg); border: 1px solid var(--primary, #a3e635); border-radius: 50% 50% 50% 4px; background: rgba(12, 24, 18, 0.96); box-shadow: 0 8px 18px rgba(0, 0, 0, 0.42); }
  .event-map-pin__icon { height: 13px; width: 13px; transform: rotate(45deg); color: var(--primary, #a3e635); }
  .event-map-pin--selected .event-map-pin__shape { height: 33px; width: 33px; border-color: rgba(206, 255, 142, 0.95); background: var(--primary, #a3e635); box-shadow: 0 0 0 5px rgba(163, 230, 53, 0.16), 0 9px 20px rgba(0, 0, 0, 0.48); }
  .event-map-pin--selected .event-map-pin__icon, .event-map-pin--live:not(.event-map-pin--selected) .event-map-pin__icon { color: #08130d; }
  .event-map-pin--live:not(.event-map-pin--selected) .event-map-pin__shape { border-color: rgba(206, 255, 142, 0.95); background: var(--primary, #a3e635); box-shadow: 0 0 0 4px rgba(163, 230, 53, 0.1), 0 9px 20px rgba(0, 0, 0, 0.48); }
  .event-map-pin__pulse { position: absolute; z-index: 0; height: 29px; width: 29px; border: 1px solid rgba(190, 242, 100, 0.85); border-radius: 999px; background: rgba(163, 230, 53, 0.14); animation: live-pin-pulse 2.4s ease-out infinite; }
  .event-map-cluster { position: relative; display: grid; place-items: center; border: 3px solid rgba(10, 10, 10, 0.96); border-radius: 999px; background: var(--primary, #ff0044); color: var(--primary-foreground, #fff); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 0 7px rgba(255, 0, 68, 0.16), 0 12px 28px rgba(0, 0, 0, 0.55); font-size: 13px; font-weight: 800; line-height: 1; transition: filter 160ms ease, box-shadow 160ms ease; }
  .event-map-cluster::after { position: absolute; inset: -8px; content: ""; border: 1px solid rgba(255, 0, 68, 0.32); border-radius: inherit; }
  .leaflet-marker-icon:hover .event-map-cluster { filter: brightness(1.12); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3), 0 0 0 8px rgba(255, 0, 68, 0.22), 0 14px 30px rgba(0, 0, 0, 0.6); }
  @keyframes live-pin-pulse { 0% { transform: scale(0.9); opacity: 0.55; } 70%, 100% { transform: scale(1.8); opacity: 0; } }
  .leaflet-control-attribution { border-radius: 8px 0 0 0; background: rgba(3, 6, 4, 0.72) !important; color: rgba(255, 255, 255, 0.55); font-size: 9px; backdrop-filter: blur(8px); }
  .leaflet-control-attribution a { color: rgba(206, 255, 142, 0.78); }
  .leaflet-container { background: #030604 !important; }
  .event-preview-popup.leaflet-popup { margin-bottom: 18px; }
  .event-preview-popup .leaflet-popup-content-wrapper { overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; background: oklch(0.16 0.02 150 / 94%); box-shadow: 0 18px 35px rgba(0, 0, 0, 0.4); }
  .event-preview-popup .leaflet-popup-content { width: 280px !important; margin: 0; }
  .event-preview-popup .leaflet-popup-tip { border-right-color: oklch(0.16 0.02 150 / 94%); border-bottom-color: oklch(0.16 0.02 150 / 94%); }
`;
